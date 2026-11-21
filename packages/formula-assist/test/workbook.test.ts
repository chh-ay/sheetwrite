import { beforeAll, expect, it } from "bun:test";

import {
  type CellValue,
  initSheetwrite,
  type SheetSnapshot,
  type SheetVisibility,
  SheetwriteStore,
} from "@sheetwrite/core";

import { shapeOf, WorkbookPatterns } from "../src/workbook-patterns.js";

/** The shape of `=B1+1` and its copies down a column; the engine computes it. */
let DOWN = "";

beforeAll(async () => {
  await initSheetwrite();
  DOWN = shapeOf("=B1+1", 0, 0);
});

const formula = (src: string): CellValue => ({ kind: "formula", src });
const empty: CellValue = { kind: "literal", value: null };

/** A sheet of one column holding `formulas` from its first row. */
function sheet(
  id: string,
  visibility: SheetVisibility,
  formulas: readonly string[],
): SheetSnapshot {
  return {
    id,
    name: id,
    order: 0,
    visibility,
    rowCount: formulas.length,
    columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: formulas.length,
        colCount: 1,
        cells: formulas.map((src, row) => ({ rowOffset: row, colOffset: 0, value: formula(src) })),
      },
    ],
  };
}

function workbook(...sheets: SheetSnapshot[]): SheetwriteStore {
  return SheetwriteStore.fromSnapshot({
    schemaVersion: 1,
    workbook: { activeSheet: sheets[0]?.id ?? "" },
    sheets: sheets.map((entry, order) => ({ ...entry, order })),
  });
}

function set(store: SheetwriteStore, sheetId: string, row: number, value: CellValue): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: sheetId, row, col: 0 }, value }],
  });
}

/** `=B1+1` down a column: one shape. */
const down = (rows: number): string[] => Array.from({ length: rows }, (_, row) => `=B${row + 1}+1`);

it("stops counting a formula once its cell is cleared, so an edit never sees its own formula", () => {
  const store = workbook(sheet("s", "visible", down(4)));
  const patterns = new WorkbookPatterns(store, "now");
  expect(patterns.count(DOWN)).toBe(4);

  set(store, "s", 2, empty);
  expect(patterns.count(DOWN)).toBe(3);
  set(store, "s", 2, formula("=B3*2"));
  expect(patterns.count(DOWN)).toBe(3);
  expect(patterns.count(shapeOf("=B3*2", 2, 0))).toBe(1);
  patterns.dispose();
});

it("counts visible sheets only, and forgets a sheet once it is hidden", () => {
  const store = workbook(
    sheet("open", "visible", down(2)),
    sheet("ledger", "visible", down(3)),
    sheet("payroll", "hidden", down(5)),
    sheet("vault", "veryHidden", down(7)),
  );
  const patterns = new WorkbookPatterns(store, "now");
  expect(patterns.count(DOWN)).toBe(5);

  store.applyTransaction({
    patches: [{ op: "setSheetVisibility", sheet: "ledger", visibility: "hidden" }],
  });
  expect(patterns.count(DOWN)).toBe(2);
  patterns.dispose();
});

it("counts a cell changed during an idle count once, whether the count has read it yet or not", () => {
  // More rows than one slice reads, so the count stops part way.
  const store = workbook(sheet("s", "visible", down(600)));
  const patterns = new WorkbookPatterns(store, "idle");
  expect(patterns.step(0)).toBe(true);

  set(store, "s", 1, empty);
  set(store, "s", 599, empty);
  while (patterns.step(Number.POSITIVE_INFINITY));
  expect(patterns.count(DOWN)).toBe(598);
  patterns.dispose();
});
