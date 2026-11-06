import {
  colToA1,
  type CellScalar,
  type DocumentOp,
  type Grid,
  type PivotDefinition,
  type Workbook,
} from "@sheetwrite/core";

import type { LiveScenario } from "../use-live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The functions showcase: one sheet per function family that 0.7.0 adds to
// the full engine. Each sheet holds inputs in column B and, beside them, the
// function, its live result and its formula (read back with FORMULATEXT). A
// reader edits an input and every formula that reads it recalculates.

interface FamilyInput {
  readonly label: string;
  readonly value: CellScalar;
}

interface FamilyFormula {
  readonly name: string;
  /** Formula source; inputs are B2, B3, … in input order. */
  readonly src: string;
}

export interface FunctionFamily {
  readonly id: string;
  readonly label: string;
  /** One line on what the family is for. */
  readonly summary: string;
  readonly inputs: readonly FamilyInput[];
  readonly formulas: readonly FamilyFormula[];
}

export const FAMILIES = [
  {
    id: "engineering",
    label: "Engineering",
    summary: "Base conversion, bits, complex numbers, Bessel functions and units.",
    inputs: [
      { label: "Number", value: 2026 },
      { label: "Distance (km)", value: 42.195 },
      { label: "Complex", value: "3+4i" },
    ],
    formulas: [
      { name: "DEC2HEX", src: "=DEC2HEX(B2)" },
      { name: "DEC2BIN", src: "=DEC2BIN(MOD(B2,512))" },
      { name: "BITAND", src: "=BITAND(B2,255)" },
      { name: "CONVERT", src: '=CONVERT(B3,"km","mi")' },
      { name: "IMABS", src: "=IMABS(B4)" },
      { name: "IMPRODUCT", src: '=IMPRODUCT(B4,"1-2i")' },
      { name: "BESSELJ", src: "=BESSELJ(1.5,1)" },
      { name: "ERF", src: "=ERF(0.5)" },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    summary: "Bond prices, yields and durations, Treasury bills and depreciation.",
    inputs: [
      { label: "Coupon rate", value: 0.045 },
      { label: "Yield", value: 0.05 },
      { label: "Asset cost", value: 12000 },
    ],
    formulas: [
      { name: "PRICE", src: "=PRICE(DATE(2026,11,6),DATE(2031,11,6),B2,B3,100,2)" },
      { name: "YIELD", src: "=YIELD(DATE(2026,11,6),DATE(2031,11,6),B2,98,100,2)" },
      { name: "DURATION", src: "=DURATION(DATE(2026,11,6),DATE(2031,11,6),B2,B3,2)" },
      { name: "COUPNUM", src: "=COUPNUM(DATE(2026,11,6),DATE(2031,11,6),2)" },
      { name: "TBILLPRICE", src: "=TBILLPRICE(DATE(2026,11,6),DATE(2027,5,6),B3)" },
      { name: "VDB", src: "=VDB(B4,1000,5,0,1)" },
      { name: "DOLLARDE", src: "=DOLLARDE(1.02,16)" },
    ],
  },
  {
    id: "statistics",
    label: "Statistics",
    summary: "The Excel 2007 names older workbooks use, and new distributions.",
    inputs: [
      { label: "Sample 1", value: 12 },
      { label: "Sample 2", value: 15 },
      { label: "Sample 3", value: 9 },
      { label: "Sample 4", value: 21 },
      { label: "Sample 5", value: 17 },
      { label: "Sample 6", value: 14 },
    ],
    formulas: [
      { name: "STDEV", src: "=STDEV(B2:B7)" },
      { name: "NORMDIST", src: "=NORMDIST(B5,AVERAGE(B2:B7),STDEV(B2:B7),TRUE)" },
      { name: "TTEST", src: "=TTEST(B2:B4,B5:B7,2,2)" },
      { name: "AVERAGEA", src: "=AVERAGEA(B2:B7)" },
      { name: "BINOM.DIST.RANGE", src: "=BINOM.DIST.RANGE(60,0.75,48)" },
      { name: "HYPGEOM.DIST", src: "=HYPGEOM.DIST(1,4,8,20,TRUE)" },
    ],
  },
  {
    id: "information",
    label: "Information",
    summary: "Ask about values, errors, references and the workbook.",
    inputs: [
      { label: "Value", value: 7 },
      { label: "Text", value: "Q4" },
    ],
    formulas: [
      { name: "ISEVEN", src: "=ISEVEN(B2)" },
      { name: "ISODD", src: "=ISODD(B2)" },
      { name: "ISNONTEXT", src: "=ISNONTEXT(B3)" },
      { name: "ISREF", src: "=ISREF(B2)" },
      { name: "ERROR.TYPE", src: "=ERROR.TYPE(B2/0)" },
      { name: "SHEET", src: "=SHEET()" },
      { name: "SHEETS", src: "=SHEETS()" },
    ],
  },
  {
    id: "math-text",
    label: "Math & text",
    summary: "Trigonometry, number bases, Roman numerals, bytes and Thai baht text.",
    inputs: [
      { label: "Number", value: 2026 },
      { label: "Angle (degrees)", value: 30 },
      { label: "Text", value: "Sheetwrite" },
    ],
    formulas: [
      { name: "ROMAN", src: "=ROMAN(B2)" },
      { name: "ARABIC", src: "=ARABIC(ROMAN(B2))" },
      { name: "BASE", src: "=BASE(B2,36)" },
      { name: "COT", src: "=COT(RADIANS(B3))" },
      { name: "CEILING.PRECISE", src: "=CEILING.PRECISE(B2,25)" },
      { name: "LENB", src: "=LENB(B4)" },
      { name: "BAHTTEXT", src: "=BAHTTEXT(B2)" },
    ],
  },
  {
    id: "lookup",
    label: "Lookup",
    summary: "LOOKUP over a sorted list, TRIMRANGE without trailing blanks, and GETPIVOTDATA.",
    inputs: [
      { label: "Find score", value: 74 },
      { label: "Score 1", value: 0 },
      { label: "Score 2", value: 60 },
      { label: "Score 3", value: 70 },
      { label: "Score 4", value: 80 },
      { label: "Score 5", value: 90 },
    ],
    formulas: [
      { name: "LOOKUP", src: '=LOOKUP(B2,B3:B7,{"E";"D";"C";"B";"A"})' },
      { name: "TRIMRANGE", src: "=ROWS(TRIMRANGE(B2:B20))" },
      { name: "GETPIVOTDATA", src: '=GETPIVOTDATA("Revenue",$K$1,"Region","EMEA")' },
    ],
  },
  {
    id: "regex",
    label: "Regex",
    summary: "Test, extract and replace with regular expressions.",
    inputs: [{ label: "Order", value: "ORD-2026-0417 shipped" }],
    formulas: [
      { name: "REGEXTEST", src: '=REGEXTEST(B2,"^ORD-\\d{4}-\\d+")' },
      { name: "REGEXEXTRACT", src: '=REGEXEXTRACT(B2,"\\d{4}-\\d+")' },
      { name: "REGEXREPLACE", src: '=REGEXREPLACE(B2,"\\d","#")' },
    ],
  },
  {
    id: "links",
    label: "Links",
    summary:
      "References to other workbooks keep their text; they show #REF! until the link has values.",
    inputs: [{ label: "Region", value: "EMEA" }],
    formulas: [
      { name: "Cell", src: "=[Budget.xlsx]Annual!C10" },
      { name: "Range", src: "=SUM([Budget.xlsx]Annual!C10:C25)" },
      { name: "Quoted", src: "='[Budget 2024.xlsx]Annual Plan'!C10" },
    ],
  },
] as const satisfies readonly FunctionFamily[];

export type FamilyId = (typeof FAMILIES)[number]["id"];

/** Every function the sheets show, for the page facts. */
export const FUNCTION_NAMES: readonly string[] = FAMILIES.flatMap((family) =>
  family.formulas.map((formula) => formula.name),
).filter((name) => /^[A-Z][A-Z0-9.]+$/.test(name));

/** Rows the fullest family sheet fills: the header, then its inputs or formulas. */
export const FAMILY_ROWS_USED =
  1 + Math.max(...FAMILIES.map((family) => Math.max(family.inputs.length, family.formulas.length)));

const INPUT_COL = 1;
const NAME_COL = 3;
const RESULT_COL = 4;
const FORMULA_TEXT_COL = 5;
/** The Lookup sheet's small region table and the pivot GETPIVOTDATA reads. */
const PIVOT_SOURCE_COL = 7;
const PIVOT_ANCHOR_COL = 10;
const PIVOT_REGIONS = [
  ["Americas", 41200],
  ["EMEA", 35600],
  ["APAC", 28900],
  ["EMEA", 12300],
] as const;

const literal = (sheet: string, row: number, col: number, value: CellScalar): DocumentOp => ({
  op: "set",
  addr: { sheet, row, col },
  value: { kind: "literal", value },
});
const formula = (sheet: string, row: number, col: number, src: string): DocumentOp => ({
  op: "set",
  addr: { sheet, row, col },
  value: { kind: "formula", src },
});

function familyOperations(family: FunctionFamily): DocumentOp[] {
  const sheet = family.id;
  const operations: DocumentOp[] = [
    ...["Input", "Value", "", "Function", "Result", "Formula"].map((header, col) =>
      literal(sheet, 0, col, header),
    ),
  ];
  family.inputs.forEach((input, index) => {
    operations.push(
      literal(sheet, index + 1, 0, input.label),
      literal(sheet, index + 1, INPUT_COL, input.value),
    );
  });
  family.formulas.forEach((entry, index) => {
    const row = index + 1;
    const resultCell = `${colToA1(RESULT_COL)}${row + 1}`;
    operations.push(
      literal(sheet, row, NAME_COL, entry.name),
      formula(sheet, row, FORMULA_TEXT_COL, `=FORMULATEXT(${resultCell})`),
      formula(sheet, row, RESULT_COL, entry.src),
    );
  });
  if (family.id === "lookup") {
    operations.push(
      literal(sheet, 0, PIVOT_SOURCE_COL, "Region"),
      literal(sheet, 0, PIVOT_SOURCE_COL + 1, "Revenue"),
      ...PIVOT_REGIONS.flatMap(([region, revenue], index) => [
        literal(sheet, index + 1, PIVOT_SOURCE_COL, region),
        literal(sheet, index + 1, PIVOT_SOURCE_COL + 1, revenue),
      ]),
    );
  }
  return operations;
}

function lookupPivot(): PivotDefinition {
  return {
    id: "revenue-by-region",
    name: "Revenue by region",
    source: {
      range: {
        sheet: "lookup",
        start: { row: 0, col: PIVOT_SOURCE_COL },
        end: { row: PIVOT_REGIONS.length, col: PIVOT_SOURCE_COL + 1 },
      },
    },
    anchor: { row: 0, col: PIVOT_ANCHOR_COL },
    rows: [0],
    columns: [],
    values: [{ field: 1, aggregation: "SUM", name: "Revenue" }],
  };
}

function functionsWorkbook(): Workbook {
  const widths = [128, 152, 24, 136, 152, 296, 24, 96, 96, 24, 112, 112];
  return {
    activeSheet: FAMILIES[0].id,
    sheets: FAMILIES.map((family) => ({
      id: family.id,
      name: family.label,
      rowCount: 24,
      columns: widths.map((width, index) => ({
        key: `c${index}`,
        header: "",
        width,
        type: "text" as const,
      })),
    })),
  };
}

export interface FunctionResult {
  readonly name: string;
  readonly formula: string;
  readonly value: string;
}

export interface FunctionsSnapshot {
  readonly family: FamilyId;
  readonly results: readonly FunctionResult[];
}

export interface FunctionsScenario extends LiveScenario<FunctionsSnapshot> {
  showFamily(id: FamilyId): void;
  /** Set the first input of the shown family, as typing into B2 would. */
  setFirstInput(value: CellScalar): void;
}

const display = (value: CellScalar): string =>
  typeof value === "number"
    ? Number.isInteger(value)
      ? value.toLocaleString("en")
      : value.toLocaleString("en", { maximumSignificantDigits: 10 })
    : String(value ?? "");

/** Mount one sheet per function family on the full engine. */
export function createFunctionsScenario(host: HTMLElement): FunctionsScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let dispose = () => {};

  const ready = (async () => {
    const shell = await mountShowcaseShell(
      host,
      { workbook: functionsWorkbook() },
      controller.signal,
    );
    if (!shell) return;
    grid = shell.grid;
    requireApplied(
      grid.applyRemoteOperations(FAMILIES.flatMap(familyOperations)),
      "The function sheets",
    );
    requireApplied(grid.setPivot(lookupPivot(), "lookup"), "The lookup pivot");
    const stopChanges = grid.on("change", () => listeners.notify());
    // Following the active sheet, so a sheet tab picks the family too.
    const stopSheets = grid.on("active-sheet", () => listeners.notify());
    dispose = () => {
      stopChanges();
      stopSheets();
      shell.dispose();
    };
  })();

  const requireGrid = (): Grid => {
    if (!grid) throw new Error("The function sheets are still loading");
    return grid;
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot() {
      const current = grid;
      const active = current?.getActiveSheet();
      const family = FAMILIES.find((candidate) => candidate.id === active) ?? FAMILIES[0];
      return {
        family: family.id,
        results: family.formulas.map((entry, index) => ({
          name: entry.name,
          formula: entry.src,
          value: current
            ? display(
                current.store.getCell({ sheet: family.id, row: index + 1, col: RESULT_COL })
                  .resolved,
              )
            : "",
        })),
      };
    },
    showFamily(id) {
      requireGrid().setActiveSheet(id);
      listeners.notify();
    },
    setFirstInput(value) {
      const current = requireGrid();
      requireApplied(
        current.applyTransaction({
          patches: [literal(current.getActiveSheet(), 1, INPUT_COL, value)],
        }),
        "The input",
      );
    },
    dispose() {
      controller.abort();
      dispose();
      grid = null;
    },
  };
}
