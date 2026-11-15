import { beforeAll, describe, expect, it } from "bun:test";

import { analyzeFormula } from "../src/formula-analysis.js";
import type { FormulaFunctionMetadata } from "../src/functions/types.js";
import { initSheetwrite } from "../src/index.js";

const value = { name: "value", types: ["scalar"] } as const;

const FUNCTIONS: readonly FormulaFunctionMetadata[] = [
  {
    name: "SUM",
    description: "Adds numbers.",
    arguments: [{ name: "number", types: ["scalar"], repeating: true }],
    returnKind: "scalar",
  },
  {
    name: "SUMIF",
    description: "Adds numbers that meet a test.",
    arguments: [
      { name: "range", types: ["range"] },
      { name: "criteria", types: ["scalar"] },
      { name: "sumRange", types: ["range"], optional: true },
    ],
    returnKind: "scalar",
  },
  {
    name: "IF",
    description: "Picks a value.",
    arguments: [
      { name: "logicalTest", types: ["scalar"] },
      { name: "valueIfTrue", types: ["scalar"], optional: true },
      { name: "valueIfFalse", types: ["scalar"], optional: true },
    ],
    returnKind: "scalar",
  },
  {
    name: "LET",
    description: "Names values.",
    arguments: [
      { name: "nameAndValue", types: ["name"], repeating: true },
      { name: "calculation", types: ["scalar"] },
    ],
    returnKind: "scalar",
  },
  {
    name: "LAMBDA",
    description: "Makes a function.",
    arguments: [{ name: "parameterOrCalculation", types: ["name"], repeating: true }],
    returnKind: "scalar",
  },
  { name: "ROUND", description: "Rounds.", arguments: [value, value], returnKind: "scalar" },
];

beforeAll(async () => {
  await initSheetwrite();
});

/** The analysis with the cursor at the `|` in `marked`. */
function at(marked: string) {
  const cursor = marked.indexOf("|");
  if (cursor < 0) throw new Error("mark the cursor with |");

  return analyzeFormula(marked.replace("|", ""), cursor, FUNCTIONS);
}

function messages(text: string): string[] {
  return analyzeFormula(text, text.length, FUNCTIONS).diagnostics.map((entry) => entry.message);
}

describe("analyzeFormula: completion", () => {
  it("offers nothing inside strings, after a sheet qualifier or for unmatched names", () => {
    expect(at('="su|"').completion).toBeNull();
    expect(at("=Sheet1!SU|").completion).toBeNull();
    expect(at("=A1:SU|").completion).toBeNull();
    expect(at("=ZZ|").completion).toBeNull();
  });
});

describe("analyzeFormula: references", () => {
  it("finds cells, ranges, whole columns and rows with sheet names", () => {
    const { references } = analyzeFormula("=A1+$B$2:C3+'It''s'!D:E+Data!2:4", 0, FUNCTIONS);
    expect(references.map(({ sheet, start, end }) => ({ sheet, start, end }))).toEqual([
      { sheet: null, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      { sheet: null, start: { row: 1, col: 1 }, end: { row: 2, col: 2 } },
      { sheet: "It's", start: { row: 0, col: 3 }, end: { row: 1_048_575, col: 4 } },
      { sheet: "Data", start: { row: 1, col: 0 }, end: { row: 3, col: 16_383 } },
    ]);
  });
});

describe("analyzeFormula: diagnostics", () => {
  it("reports what the active engine's parser rejects", () => {
    // Only the full engine calls a LAMBDA result at once; the default engine is active here.
    expect(messages("=LAMBDA(x, x + 1)(2)")).toEqual(["This is not expected here."]);
  });

  it("reports unknown functions and wrong argument counts", () => {
    expect(messages("=NOPE(1)")).toEqual(["NOPE is not a known function. The cell shows #NAME?."]);
    expect(messages("=ROUND(1)")).toEqual(["ROUND needs at least 2 arguments."]);
    expect(messages("=ROUND(1, 2, 3)")).toEqual(["ROUND takes at most 2 arguments."]);
    expect(messages("=ROUND()")).toEqual(["ROUND needs at least 2 arguments."]);
    expect(messages("=_xlfn.FUTURE(1)")).toEqual([]);
  });
});
