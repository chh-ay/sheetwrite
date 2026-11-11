import { describe, expect, it } from "bun:test";

import { SelectionModel } from "../src/selection.js";
import type { Selection } from "../src/types.js";

describe("SelectionModel", () => {
  it("accepts every public selection shape through set()", () => {
    const cases: Array<{ input: Selection | null; expected: Selection | null }> = [
      { input: null, expected: null },
      {
        input: { kind: "row", sheet: "s", row: 4 },
        expected: { kind: "row", sheet: "s", row: 4 },
      },
      {
        input: { kind: "column", sheet: "s", col: 1 },
        expected: { kind: "column", sheet: "s", col: 1 },
      },
      {
        input: {
          kind: "range",
          range: { sheet: "s", start: { row: 5, col: 2 }, end: { row: 2, col: 0 } },
        },
        expected: {
          kind: "range",
          range: { sheet: "s", start: { row: 2, col: 0 }, end: { row: 5, col: 2 } },
        },
      },
      {
        input: {
          kind: "multi",
          ranges: [
            { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
            { sheet: "s", start: { row: 7, col: 2 }, end: { row: 7, col: 2 } },
          ],
        },
        expected: {
          kind: "multi",
          ranges: [
            { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
            { sheet: "s", start: { row: 7, col: 2 }, end: { row: 7, col: 2 } },
          ],
        },
      },
    ];

    for (const { input, expected } of cases) {
      const selection = new SelectionModel(100, 0, 2);
      selection.set(input);
      expect(selection.toSelection("s")).toEqual(expected);
    }
  });
});
