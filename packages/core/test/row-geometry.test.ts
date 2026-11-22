import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import type { GeometryLayoutController } from "../src/geometry-layout-controller.js";
import { DEFAULT_THEME, type GridImpl, initSheetwrite } from "../src/grid.js";
import type { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp } from "../src/types.js";
import { mountGridWithData, scrollerOf } from "./fixtures.js";

let restore_stubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});

afterEach(() => {
  restore_stubs();
});

function geometry_of(grid: GridImpl): GeometryLayoutController {
  return Reflect.get(grid, "geometry") as GeometryLayoutController;
}

/** Every view row's height, top and hit test against the store's committed heights. */
function expect_committed_geometry(grid: GridImpl, store: SheetwriteStore): void {
  const geometry = geometry_of(grid);
  const zoom = grid.getZoom();
  const row_heights = store.getWorkbook().sheets[0]!.rowHeights;
  const rows = store.viewRowCount("s1");
  expect(geometry.rowCount).toBe(rows);
  let top = 0;
  for (let row = 0; row < rows; row++) {
    const height = (row_heights?.get(store.dataRowAt("s1", row)) ?? DEFAULT_THEME.rowHeight) * zoom;
    expect(geometry.rowHeight(row)).toBe(height);
    expect(geometry.rowOffset(row)).toBe(top);
    expect(geometry.rowAtOffset(top + height / 2)).toBe(row);
    top += height;
  }
  expect(geometry.rowOffset(rows)).toBe(top);
}

function set_row_meta(row: number, height?: number): DocumentOp {
  return { op: "setRowMeta", sheet: "s1", row, meta: height === undefined ? {} : { height } };
}

describe("row geometry", () => {
  it("applies committed heights at both ends and through undo", () => {
    const { store, grid } = mountGridWithData(100);
    grid.setRowHeight(0, 50);
    grid.setRowHeight(99, 61);
    grid.setRowHeight(50, 3);
    expect_committed_geometry(grid, store);
    grid.undo();
    grid.undo();
    expect_committed_geometry(grid, store);
    grid.redo();
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("applies a batch of heights, including heights set back to the default", () => {
    const { store, grid } = mountGridWithData(100);
    grid.setRowHeight(10, 40);
    grid.setRowHeight(20, 45);
    const outcome = grid.applyTransaction({
      patches: [
        set_row_meta(10, DEFAULT_THEME.rowHeight),
        set_row_meta(20),
        set_row_meta(3, 33),
        set_row_meta(80, 90),
        set_row_meta(3, 34),
        set_row_meta(99, 12),
      ],
    });
    expect(outcome.status).toBe("applied");
    expect(geometry_of(grid).rowHeight(3)).toBe(34);
    expect(geometry_of(grid).rowHeight(20)).toBe(DEFAULT_THEME.rowHeight);
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("moves resized rows with their data when rows are inserted and deleted", () => {
    const { store, grid } = mountGridWithData(100);
    grid.setRowHeight(5, 50);
    grid.setRowHeight(99, 70);
    const insert = grid.applyTransaction({
      patches: [{ op: "addRows", sheet: "s1", at: 0, count: 3 }],
    });
    expect(insert.status).toBe("applied");
    expect(geometry_of(grid).rowHeight(8)).toBe(50);
    expect(geometry_of(grid).rowHeight(102)).toBe(70);
    expect_committed_geometry(grid, store);
    const remove = grid.applyTransaction({
      patches: [{ op: "removeRows", sheet: "s1", at: 0, count: 4 }],
    });
    expect(remove.status).toBe("applied");
    expect(geometry_of(grid).rowHeight(4)).toBe(50);
    expect_committed_geometry(grid, store);
    grid.applyTransaction({ patches: [{ op: "removeRows", sheet: "s1", at: 4, count: 1 }] });
    expect(geometry_of(grid).rowHeight(4)).toBe(DEFAULT_THEME.rowHeight);
    expect_committed_geometry(grid, store);
    grid.undo();
    grid.undo();
    grid.undo();
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("restores the previewed row when a resize drag is cancelled, and commits it on release", () => {
    const { store, host, grid } = mountGridWithData(30);
    grid.setRowHeight(3, 44);
    const scroller = scrollerOf(host);
    const border_y = DEFAULT_THEME.headerHeight + DEFAULT_THEME.rowHeight;
    const pointer = (type: string, y: number): void => {
      scroller.dispatchEvent(
        new PointerEvent(type, { clientX: 10, clientY: y, pointerId: 1, button: 0, bubbles: true }),
      );
    };
    pointer("pointerdown", border_y);
    pointer("pointermove", border_y + 30);
    expect(geometry_of(grid).rowHeight(0)).toBe(DEFAULT_THEME.rowHeight + 30);
    expect(geometry_of(grid).rowOffset(1)).toBe(DEFAULT_THEME.rowHeight + 30);
    pointer("pointercancel", border_y + 30);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.has(0)).toBe(false);
    expect_committed_geometry(grid, store);

    // A cancelled preview of a resized row restores its committed height.
    const row3_border = DEFAULT_THEME.headerHeight + 3 * DEFAULT_THEME.rowHeight + 44;
    pointer("pointerdown", row3_border);
    pointer("pointermove", row3_border + 46);
    expect(geometry_of(grid).rowHeight(3)).toBe(90);
    pointer("pointercancel", row3_border + 46);
    expect(geometry_of(grid).rowHeight(3)).toBe(44);

    pointer("pointerdown", border_y);
    pointer("pointermove", border_y + 20);
    pointer("pointerup", border_y + 20);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.get(0)).toBe(DEFAULT_THEME.rowHeight + 20);
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("puts heights of data rows on the rows a sorted view shows them at", () => {
    const { store, grid } = mountGridWithData(20);
    grid.applyTransaction({
      patches: [
        { op: "setSheetMeta", sheet: "s1", patch: { sortKeys: [{ col: 1, ascending: false }] } },
      ],
    });
    grid.setRowHeight(0, 45);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.get(19)).toBe(45);
    grid.applyTransaction({ patches: [set_row_meta(0, 50)] });
    expect(geometry_of(grid).rowHeight(19)).toBe(50);
    expect_committed_geometry(grid, store);
    grid.applyTransaction({
      patches: [set_row_meta(1, 41), set_row_meta(2, 42), set_row_meta(1, 43)],
    });
    expect(geometry_of(grid).rowHeight(18)).toBe(43);
    expect_committed_geometry(grid, store);
    const sort = (ascending: boolean): void => {
      grid.applyTransaction({
        patches: [
          { op: "setSheetMeta", sheet: "s1", patch: { sortKeys: [{ col: 1, ascending }] } },
        ],
      });
    };
    sort(true);
    expect_committed_geometry(grid, store);
    sort(false);
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("leaves rows a filter hides out of the view geometry", () => {
    const { store, grid } = mountGridWithData(30);
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    expect(store.viewRowCount("s1")).toBe(10);
    grid.applyTransaction({
      patches: [set_row_meta(0, 99), set_row_meta(1, 41), set_row_meta(28, 17)],
    });
    expect(geometry_of(grid).rowHeight(0)).toBe(41);
    expect(geometry_of(grid).rowHeight(9)).toBe(17);
    expect_committed_geometry(grid, store);
    grid.destroy();
  });

  it("scales committed heights with zoom", () => {
    const { store, grid } = mountGridWithData(40);
    grid.setRowHeight(4, 30);
    grid.setZoom(2);
    expect(geometry_of(grid).rowHeight(4)).toBe(60);
    grid.setRowHeight(39, 25);
    expect(geometry_of(grid).rowHeight(39)).toBe(50);
    expect_committed_geometry(grid, store);
    grid.setZoom(1);
    expect_committed_geometry(grid, store);
    grid.destroy();
  });
});
