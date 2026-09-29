import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellAddress, ChangeEvent } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

// Renders are forced synchronous so a scheduled repaint is observable without
// racing a real animation-frame timer. (Same harness as grid-interaction.test.ts.)
const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

const A = (row: number, col: number): CellAddress => ({ sheet: "s1", row, col });

describe("config.keyboard: false (headless key policy)", () => {
  // Contract: `keyboard: false` drops EVERY stock binding. A keydown on the host
  // must not navigate, start an edit, clear a cell, or open the find bar.
  it("ignores arrow navigation, type-to-edit, Delete, and Ctrl+F", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { keyboard: false } }, store);

    grid.setSelection({ kind: "cell", addr: A(2, 0) });

    // Arrow navigation is gated: selection stays put (stock ArrowDown -> row 3).
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const sel = grid.getSelection();
    expect(sel?.kind).toBe("cell");
    expect(sel?.kind === "cell" ? sel.addr.row : -1).toBe(2);

    // Type-to-edit is gated: no editor opens (stock printable key seeds one).
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();

    // Destructive clear is gated: Delete leaves the selected cell intact.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(store.getCell(A(2, 0)).resolved).toBe("Customer 2");

    // Find is gated: Ctrl+F does not open the (constructed-but-hidden) find bar.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    const findBar = host.querySelector(".sheetwrite-find");
    expect(findBar).toBeInstanceOf(HTMLElement);
    expect((findBar as HTMLElement).style.display).toBe("none");

    grid.destroy();
  });
});

describe("config.keyboard: (e, grid) => boolean (host interceptor)", () => {
  // Contract: the handler runs before the stock bindings. Returning true consumes
  // the event (the stock binding must NOT also run); returning false falls
  // through to the stock binding. The handler receives the grid instance.
  it("consumes on true, falls through on false, and receives the grid", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();

    let received: unknown = null;
    const grid = new GridImpl(
      host,
      {
        workbook,
        // Consume ArrowDown; let everything else fall through to stock bindings.
        config: {
          keyboard: (e, g) => {
            received = g;
            return e.key === "ArrowDown";
          },
        },
      },
      store,
    );

    grid.setSelection({ kind: "cell", addr: A(2, 0) });

    // Returning true consumes: stock ArrowDown navigation must NOT run.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const afterDown = grid.getSelection();
    expect(afterDown?.kind === "cell" ? afterDown.addr.row : -1).toBe(2);
    expect(received).toBe(grid);

    // Returning false falls through: stock ArrowRight navigation moves the cell.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const afterRight = grid.getSelection();
    expect(afterRight?.kind).toBe("cell");
    if (afterRight?.kind === "cell") {
      expect(afterRight.addr.row).toBe(2);
      expect(afterRight.addr.col).toBe(1);
    }

    grid.destroy();
  });
});

describe("grid.styleRange", () => {
  // Contract: merge `style` over every cell of the rect as ONE undoable
  // transaction; preserve formulas; `null` clears cell styles.
  it("clears cell styles when passed null", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    grid.styleRange(range, { bold: true, color: "#123456" });
    expect(store.getCell(A(0, 0)).style.bold).toBe(true);

    grid.styleRange(range, null);
    for (let r = 0; r <= 1; r++) {
      for (let c = 0; c <= 1; c++) {
        const style = store.getCell(A(r, c)).style;
        expect(style.bold).toBeUndefined();
        expect(style.color).toBeUndefined();
      }
    }

    grid.destroy();
  });
  it("commits a 10,000 x 4 style mutation as one compact distinct-style operation", () => {
    const workbook = makeWorkbook(10_000);
    workbook.sheets[0]!.columns.push({
      key: "extra",
      header: "Extra",
      width: 100,
      type: "text",
    });
    const store = new SheetwriteStore(workbook, makeColumnarData(10_000));
    const literal = { op: "set", addr: A(0, 0), value: { kind: "literal", value: 7 } } as const;
    store.applyTransaction({
      patches: [
        literal,
        {
          op: "set",
          addr: A(1, 1),
          value: { kind: "formula", src: "=A1*6" },
          style: { color: "#123456" },
        },
        {
          op: "set",
          addr: A(9_999, 2),
          value: { kind: "ref", target: A(0, 0) },
          style: { italic: true },
        },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    store.resetRangeMutationAllocationStats();

    grid.styleRange(
      { sheet: "s1", start: { row: 9_999, col: 3 }, end: { row: 0, col: 0 } },
      { bold: true },
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]!.transaction.patches).toEqual([
      {
        op: "setRangeStyle",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 9_999, col: 3 } },
        style: { bold: true },
      },
    ]);
    expect(store.getCell(A(0, 0)).resolved).toBe(7);
    expect(store.getFormula(A(1, 1))).toBe("=A1*6");
    expect(store.getCell(A(1, 1))).toMatchObject({
      resolved: 42,
      style: { color: "#123456", bold: true },
    });
    expect(store.getRefTarget(A(9_999, 2))).toEqual(A(0, 0));
    expect(store.getCell(A(9_999, 2))).toMatchObject({
      resolved: 7,
      style: { italic: true, bold: true },
    });

    const allocation = store.getRangeMutationAllocationStats();
    expect(allocation).toMatchObject({
      documentOperations: 1,
      jsPatchObjects: 1,
      historySnapshots: 1,
      historyMaterializations: 0,
    });
    expect(allocation.distinctStyleIds).toBe(3);
    expect(allocation.maxTransferredArrayLength).toBe(allocation.distinctStyleIds);
    expect(allocation.maxTransferredArrayLength).toBeLessThan(40_000);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: A(0, 0),
          value: { kind: "literal", value: 8 },
          style: store.getCell(A(0, 0)).style,
        },
      ],
    });
    expect(store.getCell(A(1, 1)).resolved).toBe(48);
    expect(store.getCell(A(9_999, 2)).resolved).toBe(8);
    grid.undo();
    expect(store.getCell(A(1, 1)).resolved).toBe(42);
    expect(store.getCell(A(9_999, 2)).resolved).toBe(7);

    grid.undo();
    expect(store.getCell(A(0, 0)).style.bold).toBeUndefined();
    expect(store.getCell(A(1, 1)).style).toEqual({ color: "#123456" });
    expect(store.getCell(A(5_000, 3)).style).toEqual({});
    expect(store.getCell(A(9_999, 2)).style).toEqual({ italic: true });
    expect(store.getFormula(A(1, 1))).toBe("=A1*6");
    expect(store.getRefTarget(A(9_999, 2))).toEqual(A(0, 0));

    grid.redo();
    expect(store.getCell(A(1, 1)).style).toEqual({ color: "#123456", bold: true });
    expect(store.getCell(A(9_999, 2)).style).toEqual({ italic: true, bold: true });
    grid.destroy();
    store.dispose();
  });
});

describe("grid.setColumnWidth (public geometry API)", () => {
  it("setColumnWidth commits an undoable width change", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const before = store.getWorkbook().sheets[0]!.columns[0]!.width;

    grid.setColumnWidth(0, before + 80);
    expect(store.getWorkbook().sheets[0]!.columns[0]!.width).toBe(before + 80);

    // Undoable: one undo restores the prior width.
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.columns[0]!.width).toBe(before);

    grid.destroy();
  });
});

describe("grid.dataEdge (Ctrl+Arrow jump target for headless keymaps)", () => {
  // Contract: data-space edges without a view; VIEW positions in and out under
  // an active sort view. The fixture makes the two answers differ: data rows
  // are B, A, <empty>, C, so the data-space run from row 0 ends at row 1,
  // while the ascending-sorted view (A, B, C, empties last) runs 0..2.
  it("returns the data-run edge in data space and view positions under a view", () => {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 0), value: { kind: "literal", value: "B" } },
        { op: "set", addr: A(1, 0), value: { kind: "literal", value: "A" } },
        { op: "set", addr: A(3, 0), value: { kind: "literal", value: "C" } },
      ],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    // Data space: rows 0-1 are a run, row 2 is empty → edge is row 1.
    expect(grid.dataEdge(0, 0, 1, 0)).toBe(1);

    // Ascending sort: view = A, B, C, then empties → view run 0..2, edge 2.
    grid.sortBy(0, true);
    expect(grid.dataEdge(0, 0, 1, 0)).toBe(2);

    grid.destroy();
  });
});
