import { beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite, shiftA1Refs } from "@sheetwrite/core";

import { translateSharedFormula } from "../src/shared-formula.js";

/**
 * The reader expands shared formulas without the engine, so `fromXlsxWorkbook`
 * works before `initSheetwrite()`. Its rule must give the engine's copy result
 * (`translateFormula`, which paste and fill use) for every formula.
 */
interface CorpusCase {
  readonly formula?: string;
}

const corpus = (await Bun.file(
  new URL("../../../test/conformance/corpus.json", import.meta.url),
).json()) as { readonly cases: readonly CorpusCase[] };

/** Reference shapes that the conformance corpus does not cover on its own. */
const REFERENCE_SHAPES = [
  "A1+$B$2+C$3+$D4",
  "SUM(A:A)+SUM($B:C)+SUM(1:1)+SUM($2:3)",
  "Sheet2!A1+'My Sheet'!B2+'It''s'!C3:D4",
  "Sheet1:Sheet3!A1",
  "A1#+SUM(B2#)",
  "XFD1+A1048576+XFE1+XYZ1+LOG10(A1)+A1B",
  "Table1[Amount]+Table1[[#This Row],[Amount]]",
  '"A1"&A1&"B""2"',
  "_xlfn.XLOOKUP(A1,B1:B9,C1:C9)",
  "IF(A1>0,A1,-A1)%",
  "$A$1:A2",
];

const DELTAS: readonly (readonly [rows: number, cols: number])[] = [
  [1, 0],
  [0, 1],
  [3, 2],
  [-1, -1],
  [1048575, 0],
  [0, 16383],
];

beforeAll(async () => {
  await initSheetwrite();
});

describe("shared formula expansion", () => {
  it("matches the engine's copy rule over the conformance corpus", () => {
    const formulas = corpus.cases
      .flatMap((entry) => (entry.formula?.startsWith("=") ? [entry.formula.slice(1)] : []))
      .concat(REFERENCE_SHAPES);
    expect(formulas.length).toBeGreaterThan(REFERENCE_SHAPES.length);

    const disagreements: string[] = [];
    for (const formula of formulas) {
      for (const [rows, cols] of DELTAS) {
        const reader = translateSharedFormula(formula, rows, cols);
        const engine = shiftA1Refs(`=${formula}`, rows, cols).slice(1);
        if (reader !== engine) {
          disagreements.push(
            `${formula} by (${rows}, ${cols}): reader ${reader}, engine ${engine}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
