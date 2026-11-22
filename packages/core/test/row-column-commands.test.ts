import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

// Excel's Insert, Delete and Hide act on every selected row or column.
// https://support.microsoft.com/en-us/excel/get-started/insert-or-delete-rows-and-columns-in-excel

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;
beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
afterEach(() => {
  restore_stubs();
});

it("inserts, deletes and hides as many rows and columns as are selected", () => {
  const workbook = makeWorkbook(10);
  const store = new SheetwriteStore(workbook, makeColumnarData(10));
  const grid = new GridImpl(mountHost(), { workbook }, store);
  const sheet = () => store.getWorkbook().sheets[0];
  grid.setSelection({
    kind: "range",
    range: { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 3, col: 1 } },
  });

  grid.actions.insertRowAbove();
  expect(sheet()?.rowCount).toBe(12);
  expect(store.getCell({ sheet: "s1", row: 4, col: 0 }).resolved).toBe("Customer 2");
  grid.actions.deleteRow();
  expect(sheet()?.rowCount).toBe(10);
  expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Customer 2");
  grid.actions.insertColumnLeft();
  expect(sheet()?.columns.length).toBe(5);
  grid.actions.deleteColumn();
  expect(sheet()?.columns.length).toBe(3);
  grid.actions.hideRows();
  expect(grid.hiddenRows()).toEqual([2, 3]);
  grid.setSelection({
    kind: "range",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
  });
  grid.actions.hideColumns();
  expect(grid.hiddenColumns()).toEqual([0, 1]);

  grid.destroy();
  store.dispose();
});
