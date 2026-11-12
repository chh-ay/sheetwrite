import { SheetwriteStore } from "@sheetwrite/core";

import {
  dependencyClosureFormulas,
  diamondFormulas,
  distinctRangeFormulas,
  type FormulaCell,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "./formula-dataset.js";
import { CellStore } from "./formula-engine.js";
import type { FormulaOutput } from "./formula-artifact.js";
import { now, summarize } from "./stats.js";

const LOOKUP_EDIT_SUFFIX = "-edit";

function diamondOutput(levels: number): number {
  let expected = 2;
  for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
  return expected;
}

export function expectedFormulaOutput(id: string, size: number): FormulaOutput {
  const lookup = lookupVariantOutput(id);
  if (lookup !== undefined) return lookup;
  switch (id) {
    case "round-many":
    case "concat-many":
    case "offset-many":
    case "indirect-many":
    case "let-calls":
      return shapeRowFixture(id, size);
    case "independent-parse-load":
    case "independent-first-recompute":
    case "linear-chain":
      return size;
    case "wide-fan-out-edit":
    case "scalar-edit-affects-1":
    case "scalar-edit-affects-1000":
    case "scalar-edit-affects-100000":
      return size + 10;
    case "scalar-edit-affects-0":
      return size + 1;
    case "formula-constant-edit":
      return `${CONSTANT_EDIT_FILL + CONSTANT_EDIT_EDITED_BASE}:${size + CONSTANT_EDIT_FILL}`;
    case "diamond-edit":
      return diamondOutput(size);
    case "shared-range-edit":
      return 101;
    case "distinct-range-edit":
      return "11:10";
    case "cross-sheet-range-edit":
      return size + 100;
    case "topology-remove-add":
      return `2:${size}`;
    case "cycles":
      return "#CYCLE!";
    case "removed-sheet-ref":
      return "#REF!";
    case "error-propagation":
      return "#DIV/0!";
    case "criteria-range-edit":
      return size - Math.floor(size / 2) + 1;
    case "xlookup-mixed-exact":
      return mixedLookupOutput(size);
    case "lookup-range-edit":
      return (size - 1) * 2;
    case "spill-filter-resize":
      return `${size - 1}:0`;
    case "sumproduct-vector-edit":
      return size * 11 + 4;
    case "sumproduct-matrix-edit":
      return size * 2 + 4;
    case "criteria-multi-range-edit":
      return size * 0.75 - 1;
    case "sum-multi-range":
      // Compared as text: the relative tolerance would hide a small error in a 5-billion total.
      return `${(size * (size - 1)) / 2 + size * SUM_MULTI_RANGE_FILL}`;
    case "sumifs-3-criteria":
      return sumifsCriteriaTotal(size);
    case "countif-100k":
      return size - Math.floor(size / COUNTIF_MATCH_SHARE);
    case "unicode-text-date-edit":
      return 173_864;
    case "percentile-covariance":
      return (size * size - 1) / 6 + size * 0.9 + 0.1;
    case "let-reuse-edit":
      return 3 * (size + 1);
    case "let-repeat":
      return `${LET_REPEAT_FACTOR * LOOKUP_RESULT_FACTOR * (size - 1)}:${size - 1}`;
    case "let-many": {
      const x = size * LET_MANY_EDITED_SCALE;
      return x + (x + 1) + (x + 1) * x;
    }
    case "round-many":
      return Number(((size + ROUND_MANY_FRACTION) * SHAPE_EDITED_SCALE).toFixed(2));
    case "concat-many":
      return `item${(size - 1) % CONCAT_MANY_LABELS} ${CONCAT_MANY_EDITED_SUFFIX}`;
    case "offset-many":
    case "indirect-many":
      return size + SHAPE_EDITED_SCALE;
    case "let-calls": {
      const x = size * SHAPE_EDITED_SCALE + 1;
      const y = Math.round((x / 3) * 100) / 100;
      return x + y + y * x;
    }
    case "name-define":
    case "row-insert-names":
      return (size - NAMED_FORMULA_STRIDE + 1) * NAME_SCALE;
    case "table-append-row":
      return ((size + 1) * (size + 2)) / 2;
    case "sort-formula-column":
      return 2 * (sortedSourceRow(size, size - 1) + 1);
    case "parse-load-qualified":
      return size;
    case "parse-load-table":
    case "memory-import":
      return size * 2;
    case "iterative-finance":
      return 0.08663094803653158 + 0.08144165646436567;
    case "incremental-dependency-closure-edit":
      return `12:${size + 1}`;
    case "spill-sequence-admission":
      return `1:${size}:0`;
    default:
      throw new Error(`formula benchmark has no expected output for workload=${id};size=${size}`);
  }
}

export interface TimedFixture {
  store: CellStore;
  run(): void;
  check(): FormulaOutput;
  dispose(): void;
  /**
   * Return the store to its state before `run`, recalculated, so the same
   * edit can be timed again on this fixture. Only edit workloads define it:
   * load and first-recalculation runs consume state that no edit can restore.
   */
  restore?(): void;
}

export type FixtureFactory = () => TimedFixture;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`formula benchmark correctness failure: ${message}`);
}

function setFormulas(store: CellStore, sheet: number, formulas: readonly FormulaCell[]): void {
  for (const formula of formulas) {
    store.setFormula(sheet, formula.row, formula.col, formula.src, 0);
  }
}

function numberAt(store: CellStore, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}

function textAt(store: CellStore, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}

function numericColumn(count: number, value: (row: number) => number): Float64Array {
  return Float64Array.from({ length: count }, (_, row) => value(row));
}

function independentLoadFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  const formulas = independentFormulas(count);
  return {
    store,
    run: () => setFormulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count - 1, 1);
    },
    dispose: () => store.free(),
  };
}

function independentRecomputeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function chainFixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, linearChain(depth));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, depth - 1, 0),
    dispose: () => store.free(),
  };
}

/** A1 starts at the source value; the timed edit writes the edited value to A1, or to unrelated C1. */
const FAN_OUT_SOURCE_VALUE = 1;
const FAN_OUT_EDITED_VALUE = 10;

function fanOutEditFixture(count: number, unrelated = false): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, Math.max(1, count));
  const editedColumn = unrelated ? 2 : 0;
  store.setNumber(sheet, 0, 0, FAN_OUT_SOURCE_VALUE, 0);
  setFormulas(store, sheet, fanOutFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, editedColumn, FAN_OUT_EDITED_VALUE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      if (unrelated) store.clearCell(sheet, 0, editedColumn, 0);
      else store.setNumber(sheet, 0, editedColumn, FAN_OUT_SOURCE_VALUE, 0);
      store.recompute(sheet);
    },
  };
}

/** Column B holds a fill value; the timed edit rewrites the literal of one formula only. */
const CONSTANT_EDIT_FILL = 10;
const CONSTANT_EDIT_BASE = 1;
const CONSTANT_EDIT_EDITED_BASE = 2;

function constantEditFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => CONSTANT_EDIT_FILL),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 2, `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_EDITED_BASE}`, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_BASE}`, 0);
      store.recompute(sheet);
    },
  };
}

/** Measure the single-cell transaction used by Grid, not the scalar WASM adapter. */
export function gridConstantEditSample(count: number) {
  const store = new SheetwriteStore(
    {
      activeSheet: "constant-edit",
      sheets: [
        {
          id: "constant-edit",
          name: "Constant edit",
          rowCount: count,
          columns: ["a", "b", "c"].map((id) => ({
            id,
            key: id,
            header: id,
            width: 100,
            type: "number" as const,
          })),
        },
      ],
    },
    {
      rowCount: count,
      columns: {
        a: Array.from({ length: count }, (_, row) => row),
        b: Array.from({ length: count }, () => CONSTANT_EDIT_FILL),
        c: Array.from({ length: count }, (_, row) => ({
          kind: "formula" as const,
          src: `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`,
        })),
      },
    },
  );
  try {
    const samplesMs: number[] = [];
    // Alternate constants so every sample is a real source replacement.
    for (let sample = 0; sample < 12; sample++) {
      const constant = sample % 2 === 0 ? CONSTANT_EDIT_EDITED_BASE : CONSTANT_EDIT_BASE;
      const started = now();
      const result = store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "constant-edit", row: 0, col: 2 },
            value: { kind: "formula", src: `=A1+B1+${constant}` },
          },
        ],
      });
      const elapsedMs = now() - started;
      assert(result.status === "applied", "Grid constant edit must apply");
      assert(
        store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved ===
          CONSTANT_EDIT_FILL + constant,
        "Grid constant edit output",
      );
      if (sample >= 2) samplesMs.push(elapsedMs);
    }
    const output = `${store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved}:${store.getCell({ sheet: "constant-edit", row: count - 1, col: 2 }).resolved}`;
    return {
      id: "grid-formula-constant-edit",
      size: count,
      samplesMs,
      stat: summarize(samplesMs),
      output,
    };
  } finally {
    store.dispose();
  }
}

/** Undo a timed one-cell number edit, untimed, so the next timed edit repeats the same work. */
function restoreNumber(
  store: CellStore,
  sheet: number,
  cell: { row: number; col: number; value: number },
): () => void {
  return () => {
    store.setNumber(sheet, cell.row, cell.col, cell.value, 0);
    store.recompute(sheet);
  };
}

function diamondFixture(levels: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, levels);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, diamondFormulas(levels));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, levels - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sharedRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, Math.max(count, 100));
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  setFormulas(store, sheet, sharedRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function distinctRangeFixture(count: number): TimedFixture {
  const rows = count * 10;
  const store = new CellStore();
  const sheet = store.addSheet(2, rows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(rows, () => 1),
    0,
  );
  setFormulas(store, sheet, distinctRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function crossSheetFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 100);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setColumnNumbers(
    source,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(summary, row, 0, `=SUM(Source!A1:A100)+${row}`, 0);
  }
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.setNumber(source, 0, 0, 2, 0);
      store.recompute(source);
    },
    check: () => numberAt(store, summary, count - 1, 0),
    dispose: () => store.free(),
    restore: restoreNumber(store, source, { row: 0, col: 0, value: 1 }),
  };
}

function topologyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      for (let row = 0; row < count; row += 2) store.clearCell(sheet, row, 1, 0);
      store.recompute(sheet);
      for (let row = 0; row < count; row += 2) {
        store.setFormula(sheet, row, 1, `=A${row + 1}+2`, 0);
      }
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
  };
}

function cycleFixture(pairs: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, pairs);
  for (let row = 0; row < pairs; row++) {
    store.setFormula(sheet, row, 0, `=B${row + 1}`, 0);
    store.setFormula(sheet, row, 1, `=A${row + 1}`, 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, pairs - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function refRemovalFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 1);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setNumber(source, 0, 0, 1, 0);
  for (let row = 0; row < count; row++) store.setFormula(summary, row, 0, "=Source!A1", 0);
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.removeSheet(source);
    },
    check: () => textAt(store, summary, count - 1, 0) ?? "",
    dispose: () => store.free(),
  };
}

function errorPropagationFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, count - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function criteriaRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const threshold = Math.floor(count / 2);
  store.setFormula(sheet, 0, 2, `=SUMIF(A1:A${count},">=${threshold}",B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

function lookupRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row * 2),
    0,
  );
  store.setNumber(sheet, 0, 2, 0, 0);
  store.setFormula(sheet, 0, 3, `=XLOOKUP(C1,A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: 0 }),
  };
}

/** Every lookup scenario pairs ten ascending table rows with each lookup formula. */
const LOOKUP_TABLE_ROWS_PER_FORMULA = 10;
const LOOKUP_RESULT_FACTOR = 2;
const NUMERIC_LOOKUP_INITIAL_KEY = 5;
const NUMERIC_LOOKUP_EDITED_KEY = 7;
const NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY = 5.5;
const NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY = 7.5;
const TEXT_LOOKUP_KEY_PREFIX = "ITEM";
const TEXT_LOOKUP_QUERY_PREFIX = "ItEm";
const TEXT_LOOKUP_KEY_PADDING = 6;
const TEXT_LOOKUP_INITIAL_ROW = 12;
const TEXT_LOOKUP_EDITED_ROW = 37;
const TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW = 11;
const TEXT_LOOKUP_APPROXIMATE_ROW = 36;

/** Ascending numeric key column plus a result column that scales with the key. */
function lookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** Zero-padded text keys stay ascending under the case-insensitive lookup comparison. */
function textLookupKeyAt(row: number): string {
  return `${TEXT_LOOKUP_KEY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** The query key differs from the stored key only by letter case. */
function textLookupQueryKey(row: number): string {
  return `${TEXT_LOOKUP_QUERY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** Sorts between the stored keys of `row` and `row + 1`, so only approximate matching can land. */
function textLookupBetweenQueryKey(row: number): string {
  return `${textLookupQueryKey(row)}5`;
}

/** Ascending text key column plus the same result column as the numeric table. */
function textLookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    store.setString(sheet, row, 0, textLookupKeyAt(row), 0);
  }
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** The shared key cell takes a number for numeric tables and text for text tables. */
function writeLookupKey(store: CellStore, sheet: number, key: number | string): void {
  if (typeof key === "number") store.setNumber(sheet, 0, 2, key, 0);
  else store.setString(sheet, 0, 2, key, 0);
}

interface LookupVariant {
  readonly id: string;
  readonly table: (tableRows: number) => { store: CellStore; sheet: number };
  readonly formula: (tableRows: number) => string;
  readonly initialKey: number | string;
  readonly editedKey: number | string;
  readonly initialValue: number;
  readonly editedValue: number;
}


const LOOKUP_VARIANTS: readonly LookupVariant[] = [
  {
    id: "vlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,FALSE)`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "vlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows},,-1,2)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many",
    table: textLookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: textLookupQueryKey(TEXT_LOOKUP_INITIAL_ROW),
    editedKey: textLookupQueryKey(TEXT_LOOKUP_EDITED_ROW),
    initialValue: (TEXT_LOOKUP_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_EDITED_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many-sorted",
    table: textLookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW),
    editedKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_ROW),
    initialValue: (TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_APPROXIMATE_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
];

/** Every lookup workload reports the shared result plus the key its formulas were last queried with. */
function lookupVariantOutput(id: string): FormulaOutput | undefined {
  const editsKey = id.endsWith(LOOKUP_EDIT_SUFFIX);
  const baseId = editsKey ? id.slice(0, -LOOKUP_EDIT_SUFFIX.length) : id;
  const variant = LOOKUP_VARIANTS.find((candidate) => candidate.id === baseId);
  if (variant === undefined) return undefined;
  return editsKey
    ? `${variant.editedValue}:${variant.editedKey}`
    : `${variant.initialValue}:${variant.initialKey}`;
}

/** The two timed units of a lookup workload; each one has its own workload id. */
type LookupPhase = "first-recompute" | "key-edit";

/**
 * One shared key cell in C1 drives every lookup formula. The timed unit is either the first
 * recalculation of all formulas or one key edit with its recalculation; afterwards every formula
 * is read outside the timed interval and compared with the value computed here.
 */
function lookupFixture(count: number, phase: LookupPhase, variant: LookupVariant): TimedFixture {
  const tableRows = count * LOOKUP_TABLE_ROWS_PER_FORMULA;
  const { store, sheet } = variant.table(tableRows);
  writeLookupKey(store, sheet, variant.initialKey);
  const source = variant.formula(tableRows);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 3, source, 0);
  const editsKey = phase === "key-edit";
  const expectedValue = editsKey ? variant.editedValue : variant.initialValue;
  const expectedKey = editsKey ? variant.editedKey : variant.initialKey;
  // The edit phase starts from computed values, so its timed unit is the key edit alone.
  if (editsKey) store.recompute(sheet);
  return {
    store,
    run: () => {
      if (editsKey) writeLookupKey(store, sheet, variant.editedKey);
      store.recompute(sheet);
    },
    check: () => {
      for (let row = 0; row < count; row++) {
        const value = numberAt(store, sheet, row, 3);
        assert(
          value === expectedValue,
          `${variant.id} row ${row} expected ${expectedValue}, observed ${value}`,
        );
      }
      return `${expectedValue}:${expectedKey}`;
    },
    dispose: () => store.free(),
    ...(editsKey && {
      restore: () => {
        writeLookupKey(store, sheet, variant.initialKey);
        store.recompute(sheet);
      },
    }),
  };
}


/** Table rows per lookup formula of the mixed-type rows. */
const MIXED_LOOKUP_ROWS_PER_FORMULA = 10;

/** Even rows hold numbers and odd rows text, so one key column mixes types. */
function mixedLookupKeyAt(row: number): number | string {
  return row % 2 === 0 ? row : `Key${row}`;
}

/** Formula `formula` looks up table row `formula * 10 + formula % 2`, so the
 * keys alternate between numbers and text. Text keys differ from the table
 * only in case. */
function mixedLookupRowOf(formula: number): number {
  return formula * MIXED_LOOKUP_ROWS_PER_FORMULA + (formula % 2);
}

function mixedLookupOutput(tableRows: number): string {
  const last = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA - 1;
  return `${mixedLookupRowOf(last) + 1}`;
}

/**
 * Exact `XLOOKUP`s on one key column that mixes numbers and text. The timed
 * unit is the first recalculation of all formulas; every result is checked
 * outside the timed interval.
 */
function mixedLookupFixture(tableRows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    const key = mixedLookupKeyAt(row);
    if (typeof key === "number") store.setNumber(sheet, row, 0, key, 0);
    else store.setString(sheet, row, 0, key, 0);
  }
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );

  const formulas = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA;
  for (let formula = 0; formula < formulas; formula++) {
    const key = mixedLookupKeyAt(mixedLookupRowOf(formula));
    if (typeof key === "number") store.setNumber(sheet, formula, 2, key, 0);
    else store.setString(sheet, formula, 2, key.toLowerCase(), 0);
    store.setFormula(
      sheet,
      formula,
      3,
      `=XLOOKUP(C${formula + 1},A1:A${tableRows},B1:B${tableRows})`,
      0,
    );
  }

  return {
    store,
    run: () => store.recompute(sheet),
    check: () => {
      for (let formula = 0; formula < formulas; formula++) {
        const value = numberAt(store, sheet, formula, 3);
        const expected = mixedLookupRowOf(formula) + 1;
        assert(
          value === expected,
          `xlookup-mixed-exact row ${formula} expected ${expected}, observed ${value}`,
        );
      }
      return mixedLookupOutput(tableRows);
    },
    dispose: () => store.free(),
  };
}

function spillFilterResizeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  for (let row = 0; row < count; row++) store.setBool(sheet, row, 1, row + 1 < count, 0);
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setBool(sheet, count - 1, 1, true, 0);
      store.recompute(sheet);
    },
    check: () =>
      `${numberAt(store, sheet, count - 1, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setBool(sheet, count - 1, 1, false, 0);
      store.recompute(sheet);
    },
  };
}

function spillSequenceAdmissionFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  store.setFormula(sheet, 0, 0, `=SEQUENCE(${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () =>
      `${numberAt(store, sheet, 0, 0)}:${numberAt(store, sheet, count - 1, 0)}:${store.spillAnchorRow(sheet, count - 1, 0)}`,
    dispose: () => store.free(),
  };
}

function sumProductVectorFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => (row % 10) + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 2),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUMPRODUCT(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sumProductMatrixFixture(elements: number): TimedFixture {
  const columns = 10;
  const rows = elements / columns;
  assert(Number.isInteger(rows), "SUMPRODUCT matrix shape");
  const store = new CellStore();
  const sheet = store.addSheet(columns * 2 + 1, rows);
  for (let col = 0; col < columns; col++) {
    store.setColumnNumbers(
      sheet,
      col,
      0,
      numericColumn(rows, () => 1),
      0,
    );
    store.setColumnNumbers(
      sheet,
      columns + col,
      0,
      numericColumn(rows, () => 2),
      0,
    );
  }
  store.setFormula(sheet, 0, columns * 2, `=SUMPRODUCT(A1:J${rows},K1:T${rows})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, columns * 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function criteriaMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  store.setColumnNumbers(
    sheet,
    2,
    0,
    numericColumn(count, () => 2),
    0,
  );
  const threshold = count / 2;
  store.setFormula(
    sheet,
    0,
    3,
    `=SUMIFS(C1:C${count},A1:A${count},">=${threshold}",B1:B${count},1)+COUNTIFS(A1:A${count},"<${threshold}",B1:B${count},0)`,
    0,
  );
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Column B repeats one fill value, so the two-range total is closed-form. */
const SUM_MULTI_RANGE_FILL = 2;
const COUNTIF_MATCH_SHARE = 2;

function sumMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => SUM_MULTI_RANGE_FILL),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUM(A1:A${count},B1:B${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => `${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
  };
}

/** Criteria rows repeat every six rows: odd, divisible by three, and past the halfway threshold. */
const SUMIFS_CRITERIA_PERIOD = 6;
const SUMIFS_CRITERIA_OFFSET = 3;
const SUMIFS_TEXT_MATCH = "keep";
const SUMIFS_TEXT_OTHER = "skip";

function sumifsCriteriaTotal(count: number): number {
  const threshold = Math.floor(count / COUNTIF_MATCH_SHARE);
  let total = 0;
  for (let row = SUMIFS_CRITERIA_OFFSET; row < count; row += SUMIFS_CRITERIA_PERIOD) {
    if (row >= threshold) total += row + 1;
  }
  return total;
}

function sumifsCriteriaFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(5, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setString(
      sheet,
      row,
      2,
      row % (SUMIFS_CRITERIA_PERIOD / 2) === 0 ? SUMIFS_TEXT_MATCH : SUMIFS_TEXT_OTHER,
      0,
    );
  }
  store.setColumnNumbers(
    sheet,
    3,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setFormula(
    sheet,
    0,
    4,
    `=SUMIFS(D1:D${count},A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}",B1:B${count},1,C1:C${count},"${SUMIFS_TEXT_MATCH}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 4),
    dispose: () => store.free(),
  };
}

function countifFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setFormula(
    sheet,
    0,
    1,
    `=COUNTIF(A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
  };
}

function unicodeTextDateFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=UNICODE(MID($A$1,5,1))+DATEVALUE(RIGHT($A$1,10))", 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setString(sheet, 0, 0, "naïv😀-2024-03-01", 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
      store.recompute(sheet);
    },
  };
}

function percentileCovarianceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => 2 * (row + 1) + 3),
    0,
  );
  store.setFormula(
    sheet,
    0,
    2,
    `=PERCENTILE.INC(A1:A${count},0.9)+COVARIANCE.P(A1:A${count},B1:B${count})`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function letReuseFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, () => 1),
    0,
  );
  store.setFormula(sheet, 0, 1, `=LET(total,SUM(A1:A${count}),total+total+total)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/** Every `let-many` formula reads this scale from `$C$1`, so one edit dirties all of them. */
const LET_MANY_SCALE = 2;
const LET_MANY_EDITED_SCALE = 3;

const SHAPE_SCALE = 2;
const SHAPE_EDITED_SCALE = 3;
/** Column A's fractional part: a multiple of it never ends in a rounding tie at two places. */
const ROUND_MANY_FRACTION = 0.1234;
/** Column A cycles through this many text labels. */
const CONCAT_MANY_LABELS = 97;
const CONCAT_MANY_SUFFIX = "a";
const CONCAT_MANY_EDITED_SUFFIX = "b";

/** A sheet with one formula per row in column B; `$C$1` holds what the timed edit changes. */
function shapeRowsFixture(
  count: number,
  fill: (store: CellStore, sheet: number, rows: number) => void,
  formula: (row: number) => string,
  source: string | number,
  edited: string | number,
  check: (store: CellStore, sheet: number) => number | string,
): TimedFixture {
  const store = new CellStore();
  // OFFSET and INDIRECT read up to `SHAPE_EDITED_SCALE` rows below the last formula.
  const rows = count + SHAPE_EDITED_SCALE;
  const sheet = store.addSheet(3, rows);
  fill(store, sheet, rows);
  const setSource = (value: string | number) =>
    typeof value === "string"
      ? store.setString(sheet, 0, 2, value, 0)
      : store.setNumber(sheet, 0, 2, value, 0);
  setSource(source);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, formula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      setSource(edited);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: () => {
      setSource(source);
      store.recompute(sheet);
    },
  };
}

function numbersInA(fraction = 0): (store: CellStore, sheet: number, rows: number) => void {
  return (store, sheet, rows) =>
    store.setColumnNumbers(
      sheet,
      0,
      0,
      numericColumn(rows, (row) => row + 1 + fraction),
      0,
    );
}

function shapeRowFixture(id: string, count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => numberAt(store, sheet, count - 1, 1);
  switch (id) {
    case "round-many":
      return shapeRowsFixture(
        count,
        numbersInA(ROUND_MANY_FRACTION),
        (row) => `=ROUND(A${row + 1}*$C$1,2)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "concat-many":
      return shapeRowsFixture(
        count,
        (store, sheet, rows) => {
          for (let row = 0; row < rows; row++) {
            store.setString(sheet, row, 0, `item${row % CONCAT_MANY_LABELS}`, 0);
          }
        },
        (row) => `=A${row + 1}&" "&$C$1`,
        CONCAT_MANY_SUFFIX,
        CONCAT_MANY_EDITED_SUFFIX,
        (store, sheet) => textAt(store, sheet, count - 1, 1) ?? "",
      );
    case "offset-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        (row) => `=OFFSET(A${row + 1},$C$1,0)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "indirect-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        () => `=INDIRECT("A"&(ROW()+$C$1))`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "let-calls":
      return shapeRowsFixture(
        count,
        numbersInA(),
        letCallsFormula,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    default: throw new Error(`unknown shape fixture: ${id}`);
  }
}

/** `let-many` with function-call bindings: even rows one, odd rows three. */
function letCallsFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0
    ? `=LET(x,ROUND(${source},2),x+x+x)`
    : `=LET(x,SUM(${source},1),y,ROUND(x/3,2),z,y*x,x+y+z)`;
}

/** Defined names `Scale_0`…`Scale_9`; each points at one cell holding `NAME_SCALE`. */
const BINDING_NAMES = 10;
/** One formula in this many uses a name; the others are plain. */
const NAMED_FORMULA_STRIDE = 10;
const NAME_SCALE = 2;
/** Sorting moves row `i` to row `(i * SORT_STRIDE) % rows`; prime, so it permutes every size. */
const SORT_STRIDE = 7_919;

function bindingName(index: number): string {
  return `Scale_${index}`;
}

/** Every `NAMED_FORMULA_STRIDE`th formula multiplies by a defined name, the others by 2. */
function namedRowFormula(row: number, cell: string): string {
  const scale =
    row % NAMED_FORMULA_STRIDE === 0
      ? bindingName((row / NAMED_FORMULA_STRIDE) % BINDING_NAMES)
      : String(NAME_SCALE);
  return `=${cell}*${scale}`;
}

/** Points the names at `C1`…`C10` of `sheet`, one name at a time. */
function defineBindingNames(store: CellStore, sheet: number): void {
  for (let index = 0; index < BINDING_NAMES; index++) {
    assert(
      store.setNamedRange(bindingName(index), -1, sheet, index, 2, index, 2),
      "binding name defined",
    );
  }
}

/** Column A holds 1…count, column B a formula per row, and C1:C10 the values the names point at. */
function namedFormulasSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, namedRowFormula(row, `A${row + 1}`), 0);
  }
  return sheet;
}

/** The value of the last formula that uses a name, `offset` rows below where it was written. */
function lastNamedFormula(store: CellStore, sheet: number, count: number, offset = 0): number {
  return numberAt(store, sheet, count - NAMED_FORMULA_STRIDE + offset, 1);
}

/**
 * The formulas exist before the names, as when a workbook defines its names
 * after its formulas. The timed run defines the ten names one at a time.
 */
function nameDefineFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      defineBindingNames(store, sheet);
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count),
    dispose: () => store.free(),
    restore: () => {
      for (let index = 0; index < BINDING_NAMES; index++) {
        store.removeNamedRange(bindingName(index), -1);
      }
      store.recompute(sheet);
    },
  };
}

/** The timed run inserts one row above everything, so every formula and name moves. */
function rowInsertNamesFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  defineBindingNames(store, sheet);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      assert(store.addRows(sheet, 0, 1), "row inserted");
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.removeRows(sheet, 0, 1), "row removed");
      store.recompute(sheet);
    },
  };
}

/** Table `Sales` over A:B with a header row: `Amount` holds numbers, `Double` is `=[@Amount]*2`. */
function setSalesTable(store: CellStore, sheet: number, bodyRows: number): void {
  assert(
    store.setTable(
      "sales",
      "Sales",
      sheet,
      0,
      0,
      bodyRows,
      1,
      true,
      false,
      ["amount", "double"],
      ["Amount", "Double"],
    ),
    "table set",
  );
}

/** A sheet whose rows 1…count are the body of `Sales`, with `Amount` 1…count and room for one more row. */
function salesSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(4, count + 2);
  store.setString(sheet, 0, 0, "Amount", 0);
  store.setString(sheet, 0, 1, "Double", 0);
  store.setColumnNumbers(
    sheet,
    0,
    1,
    numericColumn(count, (row) => row + 1),
    0,
  );
  setSalesTable(store, sheet, count);
  return sheet;
}

const TABLE_ROW_FORMULA = "=[@Amount]*2";

/**
 * Every body row has `=[@Amount]*2`, and D1 sums the column. The timed run
 * appends a row the way a user does: a value, the table grown by one row,
 * and the column's formula in the new row.
 */
function tableAppendRowFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  for (let row = 1; row <= count; row++) {
    store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
  }
  store.setFormula(sheet, 0, 3, "=SUM(Sales[Amount])", 0);
  store.recompute(sheet);
  const added = count + 1;
  return {
    store,
    run: () => {
      store.setNumber(sheet, added, 0, added, 0);
      setSalesTable(store, sheet, added);
      store.setFormula(sheet, added, 1, TABLE_ROW_FORMULA, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: () => {
      setSalesTable(store, sheet, count);
      store.clearCell(sheet, added, 1, 0);
      store.clearCell(sheet, added, 0, 0);
      store.recompute(sheet);
    },
  };
}

/** The source row that sorting moves to target row `row`. */
function sortedSourceRow(rows: number, row: number): number {
  return (row * SORT_STRIDE) % rows;
}

/** Column A holds 1…count and column B `=A{r}*2`. The timed run sorts A:B by a fixed shuffle. */
function sortFormulaColumnFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, `=A${row + 1}*2`, 0);
  }
  store.recompute(sheet);
  const order = Uint32Array.from({ length: count }, (_, row) => sortedSourceRow(count, row));
  const inverse = new Uint32Array(count);
  for (const [target, source] of order.entries()) inverse[source] = target;
  return {
    store,
    run: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, order) === 0, "rows sorted");
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, inverse) === 0, "rows unsorted");
      store.recompute(sheet);
    },
  };
}

/** Loads `=Data!A{r}+Data!B{r}` into a second sheet; A holds the row and B holds 1. */
function parseLoadQualifiedFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(2, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  store.setColumnNumbers(
    data,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    data,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const formulas = Array.from({ length: count }, (_, row) => `=Data!A${row + 1}+Data!B${row + 1}`);
  return {
    store,
    run: () => {
      for (const [row, formula] of formulas.entries()) store.setFormula(calc, row, 0, formula, 0);
    },
    check: () => {
      store.recompute(calc);
      return numberAt(store, calc, count - 1, 0);
    },
    dispose: () => store.free(),
  };
}

/** Loads `=[@Amount]*2` into every body row of `Sales`. */
function parseLoadTableFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  return {
    store,
    run: () => {
      for (let row = 1; row <= count; row++) {
        store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
      }
    },
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count, 1);
    },
    dispose: () => store.free(),
  };
}

/**
 * A released engine's state restored: formulas on `Calc` read `Data`, and
 * every tenth one also uses a defined name. The timed run imports the state
 * exported at setup.
 */
function memoryImportFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(3, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  store.setColumnNumbers(
    data,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    data,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  defineBindingNames(store, data);
  for (let row = 0; row < count; row++) {
    store.setFormula(calc, row, 0, namedRowFormula(row, `Data!A${row + 1}`), 0);
  }
  store.recompute(calc);
  const state = store.exportMemoryState();
  let imported: CellStore | undefined;
  return {
    store,
    run: () => {
      imported = CellStore.importMemoryState(state);
    },
    check: () => {
      assert(imported, "memory state imported");
      imported.recompute(calc);
      return numberAt(imported, calc, count - 1, 0);
    },
    dispose: () => {
      imported?.free();
      store.free();
    },
    restore: () => {
      imported?.free();
      imported = undefined;
    },
  };
}

function bindingRowFixture(id: string, count: number): TimedFixture {
  switch (id) {
    case "name-define":
      return nameDefineFixture(count);
    case "row-insert-names":
      return rowInsertNamesFixture(count);
    case "table-append-row":
      return tableAppendRowFixture(count);
    case "sort-formula-column":
      return sortFormulaColumnFixture(count);
    case "parse-load-qualified":
      return parseLoadQualifiedFixture(count);
    case "parse-load-table":
      return parseLoadTableFixture(count);
    case "memory-import":
      return memoryImportFixture(count);
    default: throw new Error(`unknown binding fixture: ${id}`);
  }
}

/** Even rows bind one name, odd rows bind three that build on each other. */
function letManyFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0 ? `=LET(x,${source},x+x+x)` : `=LET(x,${source},y,x+1,z,y*x,x+y+z)`;
}

/**
 * A LET in every row, as modern workbooks write them. The timed edit changes
 * the shared scale, so every LET recalculates.
 */
function letManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setNumber(sheet, 0, 2, LET_MANY_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, letManyFormula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, LET_MANY_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: LET_MANY_SCALE }),
  };
}

/** The LET binding is used three times (`x+x+x`), so a re-evaluated binding costs that multiple. */
const LET_REPEAT_FACTOR = 3;

function letRepeatFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  store.setNumber(sheet, 0, 2, count, 0);
  store.setFormula(sheet, 0, 3, `=LET(x,XLOOKUP($C$1,A1:A${count},B1:B${count}),x+x+x)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 3)}:${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: count }),
  };
}

function iterativeFinanceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  const cashflows = [-70_000, 12_000, 15_000, 18_000, 21_000, 26_000];
  for (const [row, value] of cashflows.entries()) store.setNumber(sheet, row, 0, value, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=IRR($A$1:$A$6)+RATE(10,-150,1000)", 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function incrementalDependencyClosureFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, dependencyClosureFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Build a fresh fixture. Construction and checks are outside the timed run. */
export function createFormulaFixture(id: string, size: number): TimedFixture {
  const lookup = LOOKUP_VARIANTS.find((variant) => id === variant.id || id === `${variant.id}${LOOKUP_EDIT_SUFFIX}`);
  if (lookup !== undefined) return lookupFixture(size, id.endsWith(LOOKUP_EDIT_SUFFIX) ? "key-edit" : "first-recompute", lookup);
  switch (id) {
    case "name-define":
    case "row-insert-names":
    case "table-append-row":
    case "sort-formula-column":
    case "parse-load-qualified":
    case "parse-load-table":
    case "memory-import":
      return bindingRowFixture(id, size);
    case "independent-parse-load": return independentLoadFixture(size);
    case "independent-first-recompute": return independentRecomputeFixture(size);
    case "linear-chain": return chainFixture(size);
    case "wide-fan-out-edit": return fanOutEditFixture(size);
    case "scalar-edit-affects-1": return fanOutEditFixture(size);
    case "scalar-edit-affects-1000": return fanOutEditFixture(size);
    case "scalar-edit-affects-100000": return fanOutEditFixture(size);
    case "formula-constant-edit": return constantEditFixture(size);
    case "diamond-edit": return diamondFixture(size);
    case "shared-range-edit": return sharedRangeFixture(size);
    case "distinct-range-edit": return distinctRangeFixture(size);
    case "cross-sheet-range-edit": return crossSheetFixture(size);
    case "topology-remove-add": return topologyFixture(size);
    case "cycles": return cycleFixture(size);
    case "removed-sheet-ref": return refRemovalFixture(size);
    case "error-propagation": return errorPropagationFixture(size);
    case "criteria-range-edit": return criteriaRangeFixture(size);
    case "lookup-range-edit": return lookupRangeFixture(size);
    case "xlookup-mixed-exact": return mixedLookupFixture(size);
    case "spill-filter-resize": return spillFilterResizeFixture(size);
    case "sumproduct-vector-edit": return sumProductVectorFixture(size);
    case "sumproduct-matrix-edit": return sumProductMatrixFixture(size);
    case "criteria-multi-range-edit": return criteriaMultiRangeFixture(size);
    case "sum-multi-range": return sumMultiRangeFixture(size);
    case "sumifs-3-criteria": return sumifsCriteriaFixture(size);
    case "countif-100k": return countifFixture(size);
    case "unicode-text-date-edit": return unicodeTextDateFixture(size);
    case "percentile-covariance": return percentileCovarianceFixture(size);
    case "let-reuse-edit": return letReuseFixture(size);
    case "let-repeat": return letRepeatFixture(size);
    case "let-many": return letManyFixture(size);
    case "iterative-finance": return iterativeFinanceFixture(size);
    case "incremental-dependency-closure-edit": return incrementalDependencyClosureFixture(size);
    case "spill-sequence-admission": return spillSequenceAdmissionFixture(size);
    case "scalar-edit-affects-0": return fanOutEditFixture(size, true);
    default: throw new Error(`unknown formula fixture: ${id}`);
  }
}
