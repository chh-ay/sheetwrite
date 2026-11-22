import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost, range } from "./fixtures.js";

// The grid's data commands apply before the call returns, so a host reads
// their result right after the call. Without `ask`, they apply as Excel's
// macros do with DisplayAlerts = False: no dialog opens.

let restore_stubs: () => void;
let grid: Grid;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
  // Rows 0-9 hold "Customer <row>", <row> * 10 + 0.5 and a city, in columns A to C.
  grid = createGrid(mountHost(), {
    workbook: makeWorkbook(10),
    data: makeColumnarData(10),
    config: { toolbar: false, find: false, contextMenu: false },
  });
});

afterEach(() => {
  grid.destroy();
  restore_stubs();
  document.body.innerHTML = "";
});

function select(r0: number, c0: number, r1: number, c1: number): void {
  grid.setSelection({ kind: "range", range: range("s1", r0, c0, r1, c1) });
}

const value = (row: number, col: number) => grid.store.getCell({ sheet: "s1", row, col }).resolved;
const sheet = () => grid.store.getWorkbook().sheets[0]!;
const dialog = () => document.querySelector(".sheetwrite-dialog");

describe("insertCells and deleteCells", () => {
  it("take a range's entire rows by default when it is wide, as Excel's dialog starts", () => {
    select(1, 1, 1, 2);
    grid.actions.insertCells();

    expect(sheet().rowCount).toBe(11);
    expect(value(2, 0)).toBe("Customer 1");
    expect(dialog()).toBeNull();
  });

  it("take the entire columns that `entire` chooses", () => {
    select(1, 1, 2, 1);
    grid.actions.insertCells({ entire: "column" });
    expect(sheet().columns).toHaveLength(4);
    expect(value(0, 2)).toBe(0.5);

    grid.actions.deleteCells({ entire: "column" });
    expect(sheet().columns).toHaveLength(3);
    expect(value(0, 1)).toBe(0.5);
    expect(dialog()).toBeNull();
  });
});

describe("formatCells", () => {
  it("applies a format to the selection as one undo step before the call returns", () => {
    select(0, 0, 1, 1);
    grid.actions.formatCells({ style: { bold: true }, border: "all" });

    const style = grid.store.getCell({ sheet: "s1", row: 1, col: 1 }).style;
    expect(style.bold).toBe(true);
    expect(style.border).toBeDefined();
    expect(dialog()).toBeNull();

    grid.undo();
    const undone = grid.store.getCell({ sheet: "s1", row: 1, col: 1 }).style;
    expect(undone.bold).toBeUndefined();
    expect(undone.border).toBeUndefined();
  });
});

describe("AutoFilter commands", () => {
  it("clear every filter before the call returns", () => {
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 2 } });
    grid.actions.filterBySelection();
    grid.actions.clearFilters();

    expect(grid.getColumnFilters().size).toBe(0);
    expect(grid.getAutoFilter()).not.toBeNull();
  });
});
