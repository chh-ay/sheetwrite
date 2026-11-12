import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import type { OffsetIndex } from "../src/fenwick.js";
import type { GeometryLayoutController } from "../src/geometry-layout-controller.js";
import { DEFAULT_THEME, type GridImpl, initSheetwrite } from "../src/grid.js";
import type { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp } from "../src/types.js";
import { mountGridWithData, scrollerOf } from "./fixtures.js";

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function geometryOf(grid: GridImpl): GeometryLayoutController {
  return Reflect.get(grid, "geometry") as GeometryLayoutController;
}

function rowIndexOf(grid: GridImpl): OffsetIndex {
  return Reflect.get(geometryOf(grid), "rowIndex") as OffsetIndex;
}

/** Every view row's height, top and hit test against the store's committed heights. */
function expectCommittedGeometry(grid: GridImpl, store: SheetwriteStore): void {
  const geometry = geometryOf(grid);
  const zoom = grid.getZoom();
  const rowHeights = store.getWorkbook().sheets[0]!.rowHeights;
  const rows = store.viewRowCount("s1");
  expect(geometry.rowCount).toBe(rows);
  let top = 0;
  for (let row = 0; row < rows; row++) {
    const height = (rowHeights?.get(store.dataRowAt("s1", row)) ?? DEFAULT_THEME.rowHeight) * zoom;
    expect(geometry.rowHeight(row)).toBe(height);
    expect(geometry.rowOffset(row)).toBe(top);
    expect(geometry.rowAtOffset(top + height / 2)).toBe(row);
    top += height;
  }
  expect(geometry.rowOffset(rows)).toBe(top);
}

function setRowMeta(row: number, height?: number): DocumentOp {
  return { op: "setRowMeta", sheet: "s1", row, meta: height === undefined ? {} : { height } };
}

describe("row geometry", () => {
  it("applies committed heights to the row index in place, at both ends and through undo", () => {
    const { store, grid } = mountGridWithData(100);
    const index = rowIndexOf(grid);
    grid.setRowHeight(0, 50);
    grid.setRowHeight(99, 61);
    grid.setRowHeight(50, 3);
    expectCommittedGeometry(grid, store);
    grid.undo();
    grid.undo();
    expectCommittedGeometry(grid, store);
    grid.redo();
    expectCommittedGeometry(grid, store);
    expect(rowIndexOf(grid)).toBe(index);
    grid.destroy();
  });

  it("applies a batch of heights, including heights set back to the default", () => {
    const { store, grid } = mountGridWithData(100);
    grid.setRowHeight(10, 40);
    grid.setRowHeight(20, 45);
    const index = rowIndexOf(grid);
    const outcome = grid.applyTransaction({
      patches: [
        setRowMeta(10, DEFAULT_THEME.rowHeight),
        setRowMeta(20),
        setRowMeta(3, 33),
        setRowMeta(80, 90),
        setRowMeta(3, 34),
        setRowMeta(99, 12),
      ],
    });
    expect(outcome.status).toBe("applied");
    expect(geometryOf(grid).rowHeight(3)).toBe(34);
    expect(geometryOf(grid).rowHeight(20)).toBe(DEFAULT_THEME.rowHeight);
    expectCommittedGeometry(grid, store);
    expect(rowIndexOf(grid)).toBe(index);
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
    expect(geometryOf(grid).rowHeight(8)).toBe(50);
    expect(geometryOf(grid).rowHeight(102)).toBe(70);
    expectCommittedGeometry(grid, store);
    const remove = grid.applyTransaction({
      patches: [{ op: "removeRows", sheet: "s1", at: 0, count: 4 }],
    });
    expect(remove.status).toBe("applied");
    expect(geometryOf(grid).rowHeight(4)).toBe(50);
    expectCommittedGeometry(grid, store);
    grid.applyTransaction({ patches: [{ op: "removeRows", sheet: "s1", at: 4, count: 1 }] });
    expect(geometryOf(grid).rowHeight(4)).toBe(DEFAULT_THEME.rowHeight);
    expectCommittedGeometry(grid, store);
    grid.undo();
    grid.undo();
    grid.undo();
    expectCommittedGeometry(grid, store);
    grid.destroy();
  });

  it("restores the previewed row when a resize drag is cancelled, and commits it on release", () => {
    const { store, host, grid } = mountGridWithData(30);
    grid.setRowHeight(3, 44);
    const index = rowIndexOf(grid);
    const scroller = scrollerOf(host);
    const borderY = DEFAULT_THEME.headerHeight + DEFAULT_THEME.rowHeight;
    const pointer = (type: string, y: number): void => {
      scroller.dispatchEvent(
        new PointerEvent(type, { clientX: 10, clientY: y, pointerId: 1, button: 0, bubbles: true }),
      );
    };
    pointer("pointerdown", borderY);
    pointer("pointermove", borderY + 30);
    expect(geometryOf(grid).rowHeight(0)).toBe(DEFAULT_THEME.rowHeight + 30);
    expect(geometryOf(grid).rowOffset(1)).toBe(DEFAULT_THEME.rowHeight + 30);
    pointer("pointercancel", borderY + 30);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.has(0)).toBe(false);
    expectCommittedGeometry(grid, store);

    geometryOf(grid).previewRowHeight(3, 90);
    expect(geometryOf(grid).rowHeight(3)).toBe(90);
    geometryOf(grid).clearResizePreview();
    expect(geometryOf(grid).rowHeight(3)).toBe(44);
    expectCommittedGeometry(grid, store);

    pointer("pointerdown", borderY);
    pointer("pointermove", borderY + 20);
    pointer("pointerup", borderY + 20);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.get(0)).toBe(DEFAULT_THEME.rowHeight + 20);
    expectCommittedGeometry(grid, store);
    expect(rowIndexOf(grid)).toBe(index);
    grid.destroy();
  });

  it("puts heights of data rows on the rows a sorted view shows them at", () => {
    const { store, grid } = mountGridWithData(20);
    grid.applyTransaction({
      patches: [
        { op: "setSheetMeta", sheet: "s1", patch: { sortKeys: [{ col: 1, ascending: false }] } },
      ],
    });
    const index = rowIndexOf(grid);
    grid.setRowHeight(0, 45);
    expect(store.getWorkbook().sheets[0]!.rowHeights?.get(19)).toBe(45);
    grid.applyTransaction({ patches: [setRowMeta(0, 50)] });
    expect(geometryOf(grid).rowHeight(19)).toBe(50);
    expectCommittedGeometry(grid, store);
    grid.applyTransaction({ patches: [setRowMeta(1, 41), setRowMeta(2, 42), setRowMeta(1, 43)] });
    expect(geometryOf(grid).rowHeight(18)).toBe(43);
    expectCommittedGeometry(grid, store);
    expect(rowIndexOf(grid)).toBe(index);
    const sort = (ascending: boolean): void => {
      grid.applyTransaction({
        patches: [
          { op: "setSheetMeta", sheet: "s1", patch: { sortKeys: [{ col: 1, ascending }] } },
        ],
      });
    };
    sort(true);
    expectCommittedGeometry(grid, store);
    sort(false);
    expectCommittedGeometry(grid, store);
    grid.destroy();
  });

  it("leaves rows a filter hides out of the view geometry", () => {
    const { store, grid } = mountGridWithData(30);
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    expect(store.viewRowCount("s1")).toBe(10);
    grid.applyTransaction({ patches: [setRowMeta(0, 99), setRowMeta(1, 41), setRowMeta(28, 17)] });
    expect(geometryOf(grid).rowHeight(0)).toBe(41);
    expect(geometryOf(grid).rowHeight(9)).toBe(17);
    expectCommittedGeometry(grid, store);
    grid.destroy();
  });

  it("scales committed heights with zoom", () => {
    const { store, grid } = mountGridWithData(40);
    grid.setRowHeight(4, 30);
    grid.setZoom(2);
    expect(geometryOf(grid).rowHeight(4)).toBe(60);
    grid.setRowHeight(39, 25);
    expect(geometryOf(grid).rowHeight(39)).toBe(50);
    expectCommittedGeometry(grid, store);
    grid.setZoom(1);
    expectCommittedGeometry(grid, store);
    grid.destroy();
  });
});
