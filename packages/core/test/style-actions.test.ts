import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellChange, DocumentOp, Grid } from "../src/types.js";
import {
  answerDialog,
  elementAdded,
  makeColumnarData,
  makeWorkbook,
  mountHost,
} from "./fixtures.js";

let restore_canvas_stubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_canvas_stubs = installCanvasTestStubs();
});

afterEach(() => {
  restore_canvas_stubs();
  document.body.innerHTML = "";
});

function make_grid(row_count = 10, host = mountHost()): Grid {
  return createGrid(host, {
    workbook: makeWorkbook(row_count),
    data: makeColumnarData(row_count),
    config: { toolbar: false, find: false, contextMenu: false },
  });
}

describe("StyleActions merge policy", () => {
  it("restores formula and reference sources and styles when undoing a merge", () => {
    const grid = make_grid(4);
    const anchor = { sheet: "s1", row: 1, col: 0 };
    const covered = { ...anchor, row: 2, col: 1 };
    const target = { ...anchor, row: 0, col: 1 };
    grid.applyTransaction({
      patches: [
        { op: "set", addr: target, value: { kind: "literal", value: 7 } },
        {
          op: "set",
          addr: anchor,
          value: { kind: "formula", src: "=B1*2" },
          style: { bold: true },
        },
        { op: "set", addr: covered, value: { kind: "ref", target }, style: { italic: true } },
      ],
    });
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
    });

    grid.actions.merge();
    expect(grid.store.getCell(covered).resolved).toBeNull();
    grid.actions.undo();
    expect(grid.store.getFormula(anchor)).toBe("=B1*2");
    expect(grid.store.getRefTarget(covered)).toEqual(target);
    expect(grid.store.getCell(anchor)).toMatchObject({ resolved: 14, style: { bold: true } });
    expect(grid.store.getCell(covered)).toMatchObject({ resolved: 7, style: { italic: true } });
    grid.actions.redo();
    expect(grid.store.getCell(covered).resolved).toBeNull();
    grid.destroy();
  });

  it("styles distinct merge anchors and adjacent formulas without styling covered cells", () => {
    const grid = make_grid(4);
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
    const child_before = grid.store.getCell(child);
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 2 } },
    });
    const effects: CellChange[][] = [];
    grid.on("change", ({ changes }) => effects.push(changes));

    grid.actions.toggleUnderline();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true, underline: true });
    expect(grid.store.getCell(adjacent).style.underline).toBe(true);
    expect(grid.store.getCell(child)).toEqual(child_before);
    expect(grid.store.getFormula(anchor)).toBe("=2+3");
    expect(grid.store.getFormula(adjacent)).toBe("=A1*2");
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBe(true);
    expect(grid.store.getCell({ ...anchor, row: 2 }).style.underline).toBeUndefined();
    const addresses = [
      anchor,
      adjacent,
      { ...anchor, row: 1, col: 1 },
      { ...anchor, row: 1, col: 2 },
      { ...anchor, row: 2, col: 1 },
      { ...anchor, row: 2, col: 2 },
    ];
    expect(effects[0]?.map(({ addr }) => addr)).toEqual(addresses);
    expect(effects[0]?.[0]).toMatchObject({
      newValue: { kind: "formula", src: "=2+3" },
      oldStyle: { italic: true },
      newStyle: { italic: true, underline: true },
    });

    grid.actions.undo();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true });
    expect(grid.store.getCell(adjacent).style.underline).toBeUndefined();
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBeUndefined();
    expect(effects[1]?.map(({ addr }) => addr)).toEqual(addresses);
    grid.actions.redo();
    expect(grid.store.getCell(adjacent).resolved).toBe(10);
    expect(grid.store.getCell(child)).toEqual(child_before);

    grid.actions.clearFormat();
    expect(grid.store.getCell(anchor).style).toEqual({});
    expect(grid.store.getCell(adjacent).style).toEqual({});
    expect(grid.store.getCell(child)).toEqual(child_before);
    expect(grid.store.getFormula(adjacent)).toBe("=A1*2");
    grid.actions.undo();
    expect(grid.store.getCell(anchor).style).toEqual({ italic: true, underline: true });
    expect(grid.store.getCell({ ...anchor, row: 2, col: 1 }).style.underline).toBe(true);
    grid.destroy();
  });

  describe("warning before values are dropped, as in Excel", () => {
    const a6 = { sheet: "s1", row: 5, col: 0 };
    const b6 = { sheet: "s1", row: 5, col: 1 };

    /** A grid with `m1` in A6 and `m2` in B6, and A6:B6 selected. */
    function two_values(): { host: HTMLDivElement; grid: Grid } {
      const host = mountHost();
      const grid = make_grid(10, host);
      grid.applyTransaction({
        patches: [
          { op: "set", addr: a6, value: { kind: "literal", value: "m1" } },
          { op: "set", addr: b6, value: { kind: "literal", value: "m2" } },
        ],
      });
      grid.setSelection({ kind: "range", range: { sheet: "s1", start: a6, end: b6 } });
      return { host, grid };
    }

    const merges = (grid: Grid) => grid.store.getWorkbook().sheets[0]!.merges ?? [];

    it("asks first with `ask`, in a labelled alert dialog, and merges after OK", async () => {
      const { host, grid } = two_values();
      grid.actions.mergeAndCenter({ ask: true });
      const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);

      expect(merges(grid)).toEqual([]);
      expect(grid.store.getCell(b6).resolved).toBe("m2");
      expect(dialog.getAttribute("role")).toBe("alertdialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
      expect(title?.textContent).toBe("Merge Cells");
      const message = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
      expect(message?.textContent).toBe(
        "Merging cells only keeps the upper-left value and discards other values. This value will be discarded: B6: 'm2'.",
      );
      expect(document.activeElement?.textContent).toBe("OK");

      await answerDialog(host, "OK");
      expect(host.querySelector(".sheetwrite-dialog")).toBeNull();
      expectSame(document.activeElement, host);
      expect(merges(grid)).toEqual([{ r0: 5, c0: 0, r1: 5, c1: 1 }]);
      expect(grid.store.getCell(a6)).toMatchObject({ resolved: "m1", style: { align: "center" } });
      expect(grid.store.getCell(b6).resolved).toBeNull();
      grid.actions.undo();
      expect(merges(grid)).toEqual([]);
      expect(grid.store.getCell(b6).resolved).toBe("m2");
      grid.destroy();
    });

    it("names the values it would discard and their cells: the first five, then a count", async () => {
      const host = mountHost();
      const grid = make_grid(10, host);
      const long_name = "A very long customer name indeed";
      const patches: DocumentOp[] = [];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          const value = row === 0 ? ["North", 0.5, long_name][col]! : row * 3 + col;
          patches.push({
            op: "set",
            addr: { sheet: "s1", row, col },
            value: { kind: "literal", value },
          });
        }
      }
      const b1 = { sheet: "s1", row: 0, col: 1 };
      patches.push({
        op: "setRangeStyle",
        range: { sheet: "s1", start: b1, end: b1 },
        style: { numberFormat: "0%" },
      });
      grid.applyTransaction({ patches });
      grid.setSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 4, col: 2 } },
      });

      grid.actions.merge({ ask: true });
      const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
      const message = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
      expect(message?.textContent).toBe(
        "Merging cells only keeps the upper-left value and discards other values. These values will be discarded: B1: 50%, C1: 'A very long customer na…', A2: 3, B2: 4, C2: 5 and 9 more.",
      );
      await answerDialog(host, "Cancel");
      grid.destroy();
    });

    it("keeps every value on Cancel, and keeps grid keys out", async () => {
      const { host, grid } = two_values();
      grid.actions.merge({ ask: true });
      const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
      // Delete would clear the selection if it reached the grid.
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
      await answerDialog(host, "Cancel");
      expect(merges(grid)).toEqual([]);
      expect(grid.store.getCell(a6).resolved).toBe("m1");
      expect(grid.store.getCell(b6).resolved).toBe("m2");
      expectSame(document.activeElement, host);
      expect(dialog.isConnected).toBe(false);
      grid.destroy();
    });
  });
});
