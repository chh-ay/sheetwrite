import { beforeAll, describe, expect, it } from "bun:test";

import { main } from "./conformance-excel-office-script.js";

// The Office Scripts host provides these enums as globals. The values are
// opaque to the runner, which compares only enum members.
const CALCULATION_TYPE = { recalculate: "Recalculate", full: "Full", fullRebuild: "FullRebuild" };
const RANGE_VALUE_TYPE = {
  unknown: "Unknown",
  empty: "Empty",
  string: "String",
  integer: "Integer",
  double: "Double",
  boolean: "Boolean",
  error: "Error",
  richValue: "RichValue",
};

type ValueTypeName = keyof typeof RANGE_VALUE_TYPE;
type Scalar = string | number | boolean;

interface FakeCell {
  value: Scalar;
  valueType: ValueTypeName;
  text: string;
}

/** What the fake calculation writes for one formula: the anchor, and the spill block if any. */
interface FakeResult {
  anchor: FakeCell;
  spill?: FakeCell[][];
}

interface CaptureOutput {
  observations: Array<{ caseId: string; result: Record<string, unknown> }>;
}

interface FakeOptions {
  /**
   * Also give the worksheet list the `getItems()` and `add()` of the Office
   * Add-ins collection, which Office Scripts does not have. A runner that calls
   * them then gets past setup, so a value test fails on the values it records.
   */
  readonly collectionMethods?: boolean;
}

/** What the runner asked the host to do, as the fake recorded it. */
interface HostCalls {
  /** The argument of each `setNumberFormat` call, keyed by `<sheet>!<address>`. */
  numberFormats: Map<string, unknown>;
  /** The argument of each `calculate` call. */
  calculations: unknown[];
}

const EMPTY_CELL: FakeCell = { value: "", valueType: "empty", text: "" };

beforeAll(() => {
  Object.assign(globalThis, {
    ExcelScript: { CalculationType: CALCULATION_TYPE, RangeValueType: RANGE_VALUE_TYPE },
  });
});

function value_type_of(cell: FakeCell): ExcelScript.RangeValueType {
  return RANGE_VALUE_TYPE[cell.valueType] as unknown as ExcelScript.RangeValueType;
}

function cell_range(cells: FakeCell[][], formula = ""): ExcelScript.Range {
  const first_row = cells[0];
  const first = first_row?.[0];
  if (!first_row || !first) throw new Error("A fake range needs at least one cell");

  return {
    setValue: () => undefined,
    setFormula: () => undefined,
    setNumberFormat: () => undefined,
    getValue: () => first.value,
    getValues: () => cells.map((line) => line.map((cell) => cell.value)),
    getValueType: () => value_type_of(first),
    getValueTypes: () => cells.map((line) => line.map(value_type_of)),
    getText: () => first.text,
    getFormula: () => formula,
    getRowCount: () => cells.length,
    getColumnCount: () => first_row.length,
    getSpillingToRange: () => undefined,
  };
}

/**
 * A workbook that offers only the documented Office Scripts methods. Each
 * formula's result comes from `results` once the script asks for a full rebuild.
 */
function fake_workbook(
  results: Record<string, FakeResult>,
  options: FakeOptions,
): { workbook: ExcelScript.Workbook } & HostCalls {
  const sheets: ExcelScript.Worksheet[] = [];
  const formulas = new Map<string, string>();
  const number_formats = new Map<string, unknown>();
  const calculations: unknown[] = [];
  const iteration = { enabled: false, maxIteration: 100, maxChange: 0.001 };
  let calculated = false;

  const range_at = (key: string): ExcelScript.Range => {
    const formula = formulas.get(key);
    const result = formula === undefined ? undefined : results[formula];
    if (!calculated || formula === undefined || !result) {
      return {
        ...cell_range([[EMPTY_CELL]]),
        setFormula: (source: string) => {
          formulas.set(key, source);
        },
        setNumberFormat: (format: unknown) => {
          number_formats.set(key, format);
        },
      };
    }
    const spill = result.spill;
    return {
      ...cell_range([[result.anchor]], formula),
      getSpillingToRange: () => (spill ? cell_range(spill) : undefined),
    };
  };

  const add_worksheet = (name = `Sheet${sheets.length + 1}`): ExcelScript.Worksheet => {
    const sheet: ExcelScript.Worksheet = {
      getName: () => name,
      delete: () => {
        sheets.splice(sheets.indexOf(sheet), 1);
      },
      getRange: (address = "A1") => range_at(`${name}!${address}`),
    };
    sheets.push(sheet);
    return sheet;
  };
  const workbook: ExcelScript.Workbook = {
    getWorksheets: () =>
      options.collectionMethods
        ? Object.assign([...sheets], { getItems: () => [...sheets], add: add_worksheet })
        : [...sheets],
    addWorksheet: add_worksheet,
    getApplication: () => ({
      calculate: (type) => {
        calculations.push(type);
        calculated = true;
      },
      getIterativeCalculation: () => ({
        getEnabled: () => iteration.enabled,
        getMaxChange: () => iteration.maxChange,
        getMaxIteration: () => iteration.maxIteration,
        setEnabled: (enabled) => {
          iteration.enabled = enabled;
        },
        setMaxChange: (max_change) => {
          iteration.maxChange = max_change;
        },
        setMaxIteration: (max_iteration) => {
          iteration.maxIteration = max_iteration;
        },
      }),
    }),
  };
  return { workbook, numberFormats: number_formats, calculations };
}

function capture(
  results: Record<string, FakeResult>,
  options: FakeOptions = { collectionMethods: true },
): CaptureOutput & HostCalls {
  const { workbook, ...calls } = fake_workbook(results, options);
  const payload = {
    protocol: 1,
    producerVersion: "16.0",
    cases: Object.keys(results).map((formula, index) => ({
      id: `case-${index}`,
      kind: "formula",
      formula,
      target: "A1",
    })),
  };

  const output = main(workbook, JSON.stringify(payload), "runner-sha");

  expect(workbook.getWorksheets()).toEqual([]);
  return { ...(JSON.parse(output) as CaptureOutput), ...calls };
}

const ONE: FakeCell = { value: 1, valueType: "double", text: "1" };

describe("Excel Office Script runner", () => {
  it("uses only the Office Scripts workbook methods", () => {
    const { observations, calculations } = capture({ "=1": { anchor: ONE } }, {});

    expect(calculations).toEqual([CALCULATION_TYPE.fullRebuild]);
    expect(observations.map(({ result }) => result.value)).toEqual([1]);
  });

  it("tells text that looks like an error or a blank from real errors and blanks", () => {
    const { observations } = capture({
      '="#literal"': { anchor: { value: "#literal", valueType: "string", text: "#literal" } },
      '=""': { anchor: { value: "", valueType: "string", text: "" } },
      "=1/0": { anchor: { value: "#DIV/0!", valueType: "error", text: "#DIV/0!" } },
      "=A2": { anchor: EMPTY_CELL },
    });

    expect(observations.map(({ result }) => [result.type, result.value ?? result.error])).toEqual([
      ["string", "#literal"],
      ["string", ""],
      ["error", "#DIV/0!"],
      ["blank", undefined],
    ]);
  });

  it("records a spilled result as the whole array with its shape", () => {
    const two: FakeCell = { value: 2, valueType: "double", text: "2" };

    const { observations } = capture({ "=SEQUENCE(2,1)": { anchor: ONE, spill: [[ONE], [two]] } });

    expect(observations[0]?.result).toEqual({
      type: "array",
      value: [[1], [2]],
      rows: 2,
      columns: 1,
      formula: "=SEQUENCE(2,1)",
    });
  });
});
