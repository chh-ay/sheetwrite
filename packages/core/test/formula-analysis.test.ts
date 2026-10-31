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

describe("analyzeFormula: the call at the cursor", () => {
  it("counts top-level commas of the innermost call", () => {
    expect(at("=SUMIF(A1:A3, |").call).toMatchObject({
      name: "SUMIF",
      argumentIndex: 1,
      argument: { name: "criteria" },
    });
    expect(at("=SUMIF(A1:A3, 2, |)").call?.argument?.name).toBe("sumRange");
  });

  it("uses the inner call inside a nested call and the outer one after it", () => {
    expect(at("=IF(ROUND(A1, |), 1)").call).toMatchObject({ name: "ROUND", argumentIndex: 1 });
    expect(at("=IF(ROUND(A1, 2), |)").call).toMatchObject({ name: "IF", argumentIndex: 1 });
  });

  it("ignores commas and parentheses inside strings", () => {
    expect(at('=IF("a, (b", |').call).toMatchObject({ name: "IF", argumentIndex: 1 });
    expect(at('=IF(A1, "x,|y")').call).toMatchObject({ name: "IF", argumentIndex: 1 });
  });

  it("ignores commas of a union group and an array constant", () => {
    expect(at("=SUM((A1, B1), {1, 2; 3, 4}, |").call?.argumentIndex).toBe(2);
    expect(at("=SUM((A1, |").call).toMatchObject({ name: "SUM", argumentIndex: 0 });
  });

  it("reads sheet-qualified references as one argument", () => {
    const call = at("='My, Sheet'!A1:B2 + SUMIF(Data!A:A, 'Q1, 2'!B3, |").call;
    expect(call).toMatchObject({ name: "SUMIF", argumentIndex: 2 });
  });

  it("maps every later index to a repeating argument", () => {
    expect(at("=SUM(1, 2, 3, |").call?.argument?.name).toBe("number");
    expect(at("=ROUND(1, 2, |").call?.argument).toBeUndefined();
  });

  it("is null outside every call and for text that is not a formula", () => {
    expect(at("=SUM(A1)|").call).toBeNull();
    expect(at("SUM(|").call).toBeNull();
  });
});

describe("analyzeFormula: completion", () => {
  it("offers functions that start with the name at the cursor, shortest first", () => {
    const completion = at("=su|").completion;
    expect(completion?.matches.map((fn) => fn.name)).toEqual(["SUM", "SUMIF"]);
    expect(completion).toMatchObject({ from: 1, to: 3 });
  });

  it("replaces the whole name when the cursor is inside it", () => {
    expect(at("=S|UMX").completion).toMatchObject({ from: 1, to: 5 });
  });

  it("offers nothing inside strings, after a sheet qualifier or for unmatched names", () => {
    expect(at('="su|"').completion).toBeNull();
    expect(at("=Sheet1!SU|").completion).toBeNull();
    expect(at("=A1:SU|").completion).toBeNull();
    expect(at("=ZZ|").completion).toBeNull();
  });

  it("completes dotted names, and not a number that starts with a decimal point", () => {
    const mode = { name: "MODE.SNGL", description: "Most common.", arguments: [value] } as const;
    const functions = [...FUNCTIONS, { ...mode, returnKind: "scalar" as const }];

    const completion = analyzeFormula("=MODE.", 6, functions).completion;
    expect(completion?.matches.map((fn) => fn.name)).toEqual(["MODE.SNGL"]);
    expect(analyzeFormula("=.5", 3, functions).completion).toBeNull();
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

  it("gives equal references one colour index", () => {
    const { references } = analyzeFormula("=A1+B1+$A$1+a1", 0, FUNCTIONS);
    expect(references.map((reference) => reference.colorIndex)).toEqual([0, 1, 0, 0]);
  });

  it("does not read function names or text as references", () => {
    const { references, tokens } = analyzeFormula('=LOG10(2)&"A1"', 0, FUNCTIONS);
    expect(references).toEqual([]);
    expect(tokens.map((token) => token.kind)).toEqual([
      "function",
      "paren",
      "number",
      "paren",
      "operator",
      "string",
    ]);
  });
});

describe("analyzeFormula: diagnostics", () => {
  it("accepts complete formulas", () => {
    for (const text of [
      "=SUM(A1:A3, 2) * -3%",
      "=IF(A1,,2)",
      "=LET(x, 2, f, LAMBDA(y, x + y), f(3))",
      "=Sheet1!A1 Sheet1!A1:B2",
      "={1, 2; 3, 4}",
      "=A1#",
      "=Table1[Amount]",
      "=1<=2",
      "=1E3+XYZ1",
      "=SUM(A:A, 1:1)",
    ]) {
      expect(messages(text), text).toEqual([]);
    }
  });

  it("reports what the active engine's parser rejects", () => {
    // Only the full engine calls a LAMBDA result at once; the default engine is active here.
    expect(messages("=LAMBDA(x, x + 1)(2)")).toEqual(["This is not expected here."]);
  });

  it("marks the end of an incomplete formula as incomplete", () => {
    const [missing] = analyzeFormula("=SUM(A1", 7, FUNCTIONS).diagnostics;
    expect(missing).toMatchObject({
      from: 7,
      to: 7,
      message: "Add ) to close the (.",
      incomplete: true,
    });
    expect(analyzeFormula("=1+", 3, FUNCTIONS).diagnostics[0]?.incomplete).toBe(true);
    expect(analyzeFormula('="abc', 5, FUNCTIONS).diagnostics[0]).toMatchObject({
      from: 1,
      to: 5,
      message: 'Add " to close the text.',
      incomplete: true,
    });
  });

  it("reports syntax errors in the middle of the formula", () => {
    expect(messages("=1 2")).toEqual(["This is not expected here."]);
    expect(messages("=SUM(1))")).toEqual(["This ) has no matching (."]);
    expect(messages("=1+*2")).toEqual(["Enter a value before this."]);
    expect(messages("=1+@")).toEqual(["@ is not allowed in a formula."]);
    expect(messages("=()")).toEqual(["Enter a value before this."]);
  });

  it("counts UTF-16 offsets past text outside the Basic Multilingual Plane", () => {
    const text = '="😀"&SUM(1))';
    expect(analyzeFormula(text, text.length, FUNCTIONS).diagnostics[0]).toMatchObject({
      from: 12,
      to: 13,
    });
  });

  it("reports unknown functions and wrong argument counts", () => {
    expect(messages("=NOPE(1)")).toEqual(["NOPE is not a known function. The cell shows #NAME?."]);
    expect(messages("=ROUND(1)")).toEqual(["ROUND needs at least 2 arguments."]);
    expect(messages("=ROUND(1, 2, 3)")).toEqual(["ROUND takes at most 2 arguments."]);
    expect(messages("=ROUND()")).toEqual(["ROUND needs at least 2 arguments."]);
    expect(messages("=_xlfn.FUTURE(1)")).toEqual([]);
  });

  it("does not count the arguments of a call before its )", () => {
    expect(messages("=ROUND(1")).toEqual(["Add ) to close the (."]);
  });

  it("skips call checks without a function list", () => {
    expect(analyzeFormula("=NOPE(1)", 0, []).diagnostics).toEqual([]);
  });
});
