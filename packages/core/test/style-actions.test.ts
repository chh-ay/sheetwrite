import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import type { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

function makeGrid(rowCount = 10): Grid {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return createGrid(host, {
    workbook: makeWorkbook(rowCount),
    data: makeColumnarData(rowCount),
    config: { toolbar: false, find: false, contextMenu: false },
  });
}

describe("StyleActions underline/strikethrough toggles", () => {
  it("applies underline to the selection and restores every style with one undo", () => {
    const grid = makeGrid();
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 1 },
      },
    });

    grid.actions.toggleUnderline();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).style.underline).toBe(true);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 1 }).style.underline).toBe(true);

    grid.actions.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).style.underline).toBeUndefined();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 1 }).style.underline).toBeUndefined();
    grid.destroy();
  });

  it("styles the selected rows in a descending sorted view", () => {
    const grid = makeGrid();
    const store = grid.store as SheetwriteStore;
    store.sortBy("s1", 1, false);
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
    });

    grid.actions.toggleUnderline();

    for (const row of [7, 8, 9]) {
      expect(store.getCell({ sheet: "s1", row, col: 0 }).style.underline).toBe(true);
    }
    expect(store.getCell({ sheet: "s1", row: 6, col: 0 }).style.underline).toBeUndefined();
    grid.destroy();
  });
});

describe("StyleActions merge policy", () => {
  it("styles distinct merge anchors and adjacent formulas without styling covered cells", () => {
    const grid = makeGrid(4);
    const anchor = { sheet: "s1", row: 0, col: 0 };
    const adjacent = { ...anchor, col: 2 };
    const child = { ...anchor, col: 1 };
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: anchor,
          value: { kind: "formula", src: "=2+3" },
          style: { italic: true },
        },
        { op: "set", addr: adjacent, value: { kind: "formula", src: "=A1*2" } },
        { op: "addMerge", sheet: "s1", merge: { r0: 0, r1: 0, c0: 0, c1: 1 } },
      ],
    });
    const childBefore = grid.store.getCell(child);
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 2 } },
    });

    grid.actions.toggleUnderline();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true, underline: true });
    expect(grid.store.getCell(adjacent).style.underline).toBe(true);
    expect(grid.store.getCell(child)).toEqual(childBefore);
    expect(grid.store.getFormula(anchor)).toBe("=2+3");
    expect(grid.store.getFormula(adjacent)).toBe("=A1*2");
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBe(true);
    expect(grid.store.getCell({ ...anchor, row: 2 }).style.underline).toBeUndefined();

    grid.actions.undo();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true });
    expect(grid.store.getCell(adjacent).style.underline).toBeUndefined();
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBeUndefined();
    grid.actions.redo();
    expect(grid.store.getCell(adjacent).resolved).toBe(10);
    expect(grid.store.getCell(child)).toEqual(childBefore);

    grid.actions.clearFormat();
    expect(grid.store.getCell(anchor).style).toEqual({});
    expect(grid.store.getCell(adjacent).style).toEqual({});
    expect(grid.store.getCell(child)).toEqual(childBefore);
    expect(grid.store.getFormula(adjacent)).toBe("=A1*2");
    grid.actions.undo();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true, underline: true });
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBe(true);
    grid.destroy();
  });

  it("keeps anchor content, clears covered cells, and restores the merge with one undo", () => {
    const grid = makeGrid(4);
    const addresses = [
      { sheet: "s1", row: 1, col: 0 },
      { sheet: "s1", row: 1, col: 1 },
      { sheet: "s1", row: 2, col: 0 },
      { sheet: "s1", row: 2, col: 1 },
    ] as const;
    grid.applyTransaction({
      patches: addresses.map((addr, index) => ({
        op: "set" as const,
        addr,
        value: { kind: "literal" as const, value: `value-${index}` },
      })),
    });
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 2, col: 1 },
      },
    });

    grid.actions.merge();

    expect(grid.store.getWorkbook().sheets[0]!.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(addresses.map((addr) => grid.store.getCell(addr).resolved)).toEqual([
      "value-0",
      null,
      null,
      null,
    ]);

    grid.actions.undo();
    expect(grid.store.getWorkbook().sheets[0]!.merges ?? []).toEqual([]);
    expect(addresses.map((addr) => grid.store.getCell(addr).resolved)).toEqual([
      "value-0",
      "value-1",
      "value-2",
      "value-3",
    ]);
    grid.destroy();
  });
});
