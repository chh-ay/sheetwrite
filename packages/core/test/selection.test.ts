import { describe, expect, it } from "bun:test";

import { SelectionModel } from "../src/selection.js";
import type { Selection } from "../src/types.js";

describe("SelectionModel", () => {
  it("accepts every public selection shape through set()", () => {
    const multi: Selection = {
      kind: "multi",
      ranges: [
        { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        { sheet: "s", start: { row: 7, col: 2 }, end: { row: 7, col: 2 } },
      ],
    };
    const cases: Array<{ input: Selection | null; expected?: Selection }> = [
      { input: null },
      { input: { kind: "row", sheet: "s", row: 4 } },
      { input: { kind: "column", sheet: "s", col: 1 } },
      { input: multi },
      {
        input: {
          kind: "range",
          range: { sheet: "s", start: { row: 5, col: 2 }, end: { row: 2, col: 0 } },
        },
        expected: {
          kind: "range",
          range: { sheet: "s", start: { row: 2, col: 0 }, end: { row: 5, col: 2 } },
          // The range started at its bottom-right cell, which stays active.
          active: { sheet: "s", row: 5, col: 2 },
        },
      },
    ];

    for (const { input, expected } of cases) {
      const selection = new SelectionModel(100, 0, 2);
      selection.set(input);
      expect(selection.toSelection("s")).toEqual(expected ?? input);
    }
  });
});
