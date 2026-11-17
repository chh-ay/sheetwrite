import { beforeAll, expect, it } from "bun:test";

import {
  type FormulaSuggester,
  initSheetwrite,
  type SheetwriteAddonGridContext,
  SheetwriteStore,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";
import { openFormulaEdit } from "@sheetwrite/core/testing";

import { formulaAssistAddon } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** Numbers in A1:A5, and B2 and B4 doubling the cell to their left; B3 is the cell typed in. */
function doubledColumn(): SheetwriteStore {
  const number = (value: number) => ({ kind: "literal", value }) as const;
  const formula = (src: string) => ({ kind: "formula", src }) as const;
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Sheet1",
        order: 0,
        rowCount: 5,
        columns: [
          { key: "a", header: "A", width: 100, type: "number" },
          { key: "b", header: "B", width: 100, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 5,
            colCount: 2,
            cells: [
              ...[1, 2, 3, 4, 5].map((value, row) => ({
                rowOffset: row,
                colOffset: 0,
                value: number(value),
              })),
              { rowOffset: 1, colOffset: 1, value: formula("=A2*2") },
              { rowOffset: 3, colOffset: 1, value: formula("=A4*2") },
            ],
          },
        ],
      },
    ],
  };
  return SheetwriteStore.fromSnapshot(snapshot);
}

it("registers a suggester whose first edit waits for the predictor chunk, then suggests", async () => {
  let suggester: FormulaSuggester | undefined;
  const addon = formulaAssistAddon();
  const context = {
    formulaSuggestions: (registered: FormulaSuggester) => {
      suggester = registered;
      return () => undefined;
    },
  } as Partial<SheetwriteAddonGridContext<unknown>> as SheetwriteAddonGridContext<unknown>;
  addon.grid?.(context);
  if (suggester === undefined) throw new Error("The add-on registered no suggester");

  const edit = await openFormulaEdit(doubledColumn(), { sheet: "s", row: 2, col: 1 });
  const analysis = analyzeFormula("=", 1, edit.functions());
  const first = suggester.open(edit);
  // The predictor chunk is still loading: nothing shows, and Excel's keys apply.
  expect(first.suggest("=", analysis)).toBeNull();

  // Once the chunk has loaded, the waiting session and every later one suggest.
  await import("../src/predictor.js");
  for (let tries = 0; tries < 10 && first.suggest("=", analysis) === null; tries++) {
    await Promise.resolve();
  }
  expect(first.suggest("=", analysis)?.text).toBe("A3*2");
  first.close();
  const next = suggester.open(edit);
  expect(next.suggest("=", analysis)?.text).toBe("A3*2");
  next.close();
});
