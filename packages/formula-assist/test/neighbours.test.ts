import { beforeAll, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";
import { openFormulaEdit } from "@sheetwrite/core/testing";

import { openNeighbours } from "../src/signals/neighbours.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** B1 and B3 hold `formula` for their row; B2 is the cell typed in. */
function store(formula: (row: number) => string): SheetwriteStore {
  return SheetwriteStore.fromSnapshot({
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Sheet1",
        order: 0,
        rowCount: 3,
        columns: [
          { key: "a", header: "A", width: 100, type: "number" },
          { key: "b", header: "B", width: 100, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 1,
            rowCount: 3,
            colCount: 1,
            cells: [0, 2].map((row) => ({
              rowOffset: row,
              colOffset: 0,
              value: { kind: "formula", src: formula(row + 1) },
            })),
          },
        ],
      },
    ],
  });
}

async function reasons(formula: (row: number) => string): Promise<string[]> {
  const edit = await openFormulaEdit(store(formula), { sheet: "s", row: 1, col: 1 });
  // The neighbours' proposals are read when the edit opens; the typed text does not change them.
  return openNeighbours(edit)
    .proposals("=", analyzeFormula("=", 1, edit.functions()))
    .map((proposal) => proposal.reason);
}

it("tells formulas with their own numbers apart", async () => {
  expect(await reasons((row) => `=A${row}*30`)).toEqual(["aboveAndBelow, with numbers"]);
  expect(await reasons((row) => `=A${row}*A${row}`)).toEqual(["aboveAndBelow"]);
  expect(await reasons((row) => `=SUM(A${row}:A${row})`)).toEqual(["aboveAndBelow"]);
});

it("reads a neighbour holding a long run of digits in linear time", async () => {
  // A digit run followed by a letter made the number check backtrack in quadratic time (#219).
  const digits = "1".repeat(20_000);
  const started = performance.now();
  await reasons((row) => `=A${row}+${digits}E1`);
  expect(performance.now() - started).toBeLessThan(250);
});
