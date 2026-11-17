import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost, range } from "./fixtures.js";

// The grid's data commands apply before the call returns, so a host reads
// their result right after the call. Without `ask`, they apply as Excel's
// macros do with DisplayAlerts = False: no dialog opens.

let restoreStubs: () => void;
let grid: Grid;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  // Rows 0-9 hold "Customer <row>", <row> * 10 + 0.5 and a city, in columns A to C.
  grid = createGrid(mountHost(), {
    workbook: makeWorkbook(10),
    data: makeColumnarData(10),
    config: { toolbar: false, find: false, contextMenu: false },
  });
});

afterEach(() => {
  grid.destroy();
  restoreStubs();
  document.body.innerHTML = "";
});

function select(r0: number, c0: number, r1: number, c1: number): void {
  grid.setSelection({ kind: "range", range: range("s1", r0, c0, r1, c1) });
}

const value = (row: number, col: number) => grid.store.getCell({ sheet: "s1", row, col }).resolved;
const sheet = () => grid.store.getWorkbook().sheets[0]!;
const dialog = () => document.querySelector(".sheetwrite-dialog");

describe("merge", () => {
  it("merges a range that holds several values before the call returns, without asking", () => {
    select(1, 0, 2, 1);
    grid.actions.merge();

    expect(sheet().merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect([value(1, 0), value(1, 1), value(2, 0), value(2, 1)]).toEqual([
      "Customer 1",
      null,
      null,
      null,
    ]);
    expect(dialog()).toBeNull();
  });

  it("merges and centers before the call returns", () => {
    select(1, 0, 1, 1);
    grid.actions.mergeAndCenter();

    expect(sheet().merges).toEqual([{ r0: 1, c0: 0, r1: 1, c1: 1 }]);
    expect(grid.store.getCell({ sheet: "s1", row: 1, col: 0 }).style.align).toBe("center");
    expect(dialog()).toBeNull();
  });
});

describe("insertCells and deleteCells", () => {
  it("insert and delete selected whole rows before the call returns", () => {
    select(2, 0, 2, 2);
    grid.actions.insertCells();
    expect(sheet().rowCount).toBe(11);
    expect(value(2, 0)).toBeNull();
    expect(value(3, 0)).toBe("Customer 2");

    grid.actions.deleteCells();
    expect(sheet().rowCount).toBe(10);
    expect(value(2, 0)).toBe("Customer 2");
  });

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
  it("turn the AutoFilter on and off before the call returns", () => {
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    grid.actions.toggleAutoFilter();
    expect(grid.getAutoFilter()?.range).toEqual(range("s1", 0, 0, 9, 2));

    grid.actions.toggleAutoFilter();
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("filter by the selected cell's value before the call returns", () => {
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 2 } });
    grid.actions.filterBySelection();

    expect(grid.getAutoFilter()).not.toBeNull();
    expect(grid.getColumnFilters().get(2)).toEqual({ kind: "values", values: ["Phnom Penh"] });
  });

  it("clear every filter before the call returns", () => {
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 2 } });
    grid.actions.filterBySelection();
    grid.actions.clearFilters();

    expect(grid.getColumnFilters().size).toBe(0);
    expect(grid.getAutoFilter()).not.toBeNull();
  });
});

describe("copySheet", () => {
  it("returns the copy's result, with its ID, before the call returns", () => {
    const result = grid.copySheet("s1");

    expect(result.status).toBe("applied");
    const copy = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === result.sheet);
    expect(copy?.name).toBe("Sheet 1 (2)");
    expect(grid.store.getCell({ sheet: result.sheet, row: 0, col: 0 }).resolved).toBe("Customer 0");
  });
});
