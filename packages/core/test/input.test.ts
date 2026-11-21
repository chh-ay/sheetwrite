import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, Grid, TransactionResourceLimits, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost, scrollerOf } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

/** Pointer-capture recorder: happy-dom lacks the capture API entirely. */
interface CaptureLog {
  set: number[];
  released: number[];
}

function stubCapture(scroller: HTMLDivElement): CaptureLog {
  const log: CaptureLog = { set: [], released: [] };
  const captured = new Set<number>();
  Object.assign(scroller, {
    setPointerCapture: (id: number) => {
      log.set.push(id);
      captured.add(id);
    },
    releasePointerCapture: (id: number) => {
      log.released.push(id);
      captured.delete(id);
    },
    hasPointerCapture: (id: number) => captured.has(id),
  });
  return log;
}

function cellPoint(
  row: number,
  col: number,
  workbook: Workbook,
): { clientX: number; clientY: number } {
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");

  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c < col; c++) x += sheet.columns[c]?.width ?? 0;
  x += (sheet.columns[col]?.width ?? DEFAULT_THEME.rowHeight) / 2;

  const y =
    DEFAULT_THEME.headerHeight + row * DEFAULT_THEME.rowHeight + DEFAULT_THEME.rowHeight / 2;

  return { clientX: x, clientY: y };
}

/** Bottom-right corner of a cell — where the fill handle renders. */
function fillHandlePoint(
  row: number,
  col: number,
  workbook: Workbook,
): { clientX: number; clientY: number } {
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");

  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c <= col; c++) x += sheet.columns[c]?.width ?? 0;
  const y = DEFAULT_THEME.headerHeight + (row + 1) * DEFAULT_THEME.rowHeight;
  return { clientX: x, clientY: y };
}

type PointerInit = {
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerId?: number;
  pointerType?: string;
};

function pointer(type: string, init: PointerInit): PointerEvent {
  return new PointerEvent(type, {
    button: 0,
    pointerId: 1,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function makeGrid(
  rowCount = 10,
  transactionResourceLimits?: Partial<TransactionResourceLimits>,
): {
  grid: Grid;
  store: SheetwriteStore;
  workbook: Workbook;
  scroller: HTMLDivElement;
  host: HTMLDivElement;
  capture: CaptureLog;
} {
  const workbook = makeWorkbook(rowCount);
  const store = new SheetwriteStore(workbook, makeColumnarData(rowCount), {
    transactionResourceLimits,
  });
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  const scroller = scrollerOf(host);
  const capture = stubCapture(scroller);
  return { grid, store, workbook, host, scroller, capture };
}

describe("pointer input: mouse parity", () => {
  it("keeps a date column's serial when its editor commits unchanged", () => {
    const workbook = makeWorkbook(10);
    const column = workbook.sheets[0]!.columns[1]!;
    column.type = "date";
    column.numberFormat = "yyyy-mm-dd";
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const cell = { sheet: "s1", row: 0, col: 1 };
    store.applyTransaction({
      patches: [{ op: "set", addr: cell, value: { kind: "literal", value: 45_351 } }],
    });

    grid.beginEdit(0, 1);
    const editor = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
    if (!editor) throw new Error("cell editor missing");
    expect(editor.value).toBe("2024-02-29");
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(store.getCell(cell).resolved).toBe(45_351);

    grid.beginEdit(0, 1, "45352.5");
    host
      .querySelector("textarea.sheetwrite-editor")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(store.getCell(cell).resolved).toBe(45_352.5);

    grid.beginEdit(0, 1);
    const timed = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
    expect(timed?.value).toBe("2024-03-01 12:00");
    timed?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(store.getCell(cell).resolved).toBe(45_352.5);

    grid.destroy();
    store.dispose();
  });

  it("keeps what is typed into a Text-formatted cell as text, as Excel does", () => {
    const workbook = makeWorkbook(10);
    workbook.sheets[0]!.columns[1]!.type = "number";
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const text = { sheet: "s1", row: 0, col: 1 };
    const number = { sheet: "s1", row: 1, col: 1 };
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: text,
          value: { kind: "literal", value: null },
          style: { numberFormat: "@" },
        },
      ],
    });
    const type = (row: number, input: string): void => {
      grid.beginEdit(row, 1, input);
      host
        .querySelector("textarea.sheetwrite-editor")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    };

    type(0, "0123");
    expect(store.getCell(text).resolved).toBe("0123");
    // The entry keeps the cell's format, as in Excel, so the next one is text too.
    expect(store.getCell(text).style).toEqual({ numberFormat: "@" });
    type(0, "=1+2");
    expect(store.getCell(text).resolved).toBe("=1+2");
    type(1, "0123");
    expect(store.getCell(number).resolved).toBe(123);

    grid.destroy();
    store.dispose();
  });
});

describe("pointer input: touch policy", () => {
  it("fills through a spill child without dropping the fill or persisting projections in history", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    const anchor = { sheet: "s1", row: 1, col: 0 };
    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
        },
        { op: "set", addr: anchor, value: { kind: "formula", src: "=SEQUENCE(3)" } },
        { op: "set", addr: { ...anchor, row: 0 }, value: { kind: "literal", value: "filled" } },
      ],
    });
    grid.setSelection({ kind: "cell", addr: { ...anchor, row: 0 } });
    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 0, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 0, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 0, workbook)));

    expect(store.getCell(anchor).resolved).toBe("filled");
    expect(store.getCell({ ...anchor, row: 2 }).resolved).toBe("filled");
    expect(store.getCell({ ...anchor, row: 3 }).resolved).toBeNull();
    grid.undo();
    expect(store.getFormula(anchor)).toBe("=SEQUENCE(3)");
    expect(store.getCell({ ...anchor, row: 2 }).resolved).toBe(2);
    grid.redo();
    expect(store.getCell({ ...anchor, row: 2 }).resolved).toBe("filled");
    grid.destroy();
    store.dispose();
  });

  it("continues a number series to the right and copies the source format, as Excel does", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    const at = (col: number) => ({ sheet: "s1", row: 1, col });
    store.applyTransaction({
      patches: [
        { op: "set", addr: at(0), value: { kind: "literal", value: 1 } },
        { op: "set", addr: at(1), value: { kind: "literal", value: 2 }, style: { bold: true } },
      ],
    });
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 1 } },
    });

    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(1, 2, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(1, 2, workbook)));

    expect(store.getCell(at(2)).resolved).toBe(3);
    expect(store.getCell(at(2)).style.bold).toBeUndefined();
    grid.setSelection({ kind: "cell", addr: at(1) });
    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(3, 1, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(3, 1, workbook)));
    expect(store.getCell({ sheet: "s1", row: 3, col: 1 }).style.bold).toBe(true);
    grid.destroy();
    store.dispose();
  });

  describe("fill handle feedback", () => {
    const originalRaf = globalThis.requestAnimationFrame;
    beforeEach(() => {
      // Paint the overlay at once, so the tip and the button are observable.
      globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
        callback(0);
        return 0;
      }) as typeof globalThis.requestAnimationFrame;
    });
    afterEach(() => {
      globalThis.requestAnimationFrame = originalRaf;
    });

    const at = (row: number) => ({ sheet: "s1", row, col: 1 });

    it("fills only the rows a filter shows, from the fill handle, as Excel does", () => {
      const { grid, store, scroller, workbook } = makeGrid();
      // Tokyo is in sheet rows 1, 4 and 7, which the view shows as rows 0 to 2.
      grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });

      scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 1, workbook)));
      scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 1, workbook)));
      scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 1, workbook)));

      // One number copies, as in Excel; the hidden rows between keep their values.
      expect([1, 2, 3, 4, 5, 6, 7].map((row) => store.getCell(at(row)).resolved)).toEqual([
        10.5, 20.5, 30.5, 10.5, 50.5, 60.5, 10.5,
      ]);
      grid.destroy();
      store.dispose();
    });

    it("shows the value the last cell will get beside the dragged fill handle, as Excel does", () => {
      const { grid, store, scroller, workbook, host } = makeGrid();
      store.applyTransaction({
        patches: [
          { op: "set", addr: at(1), value: { kind: "literal", value: 10 } },
          { op: "set", addr: at(2), value: { kind: "literal", value: 20 } },
        ],
      });
      grid.setSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
      });

      scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(2, 1, workbook)));
      scroller.dispatchEvent(pointer("pointermove", cellPoint(7, 1, workbook)));
      const tip = host.querySelector<HTMLElement>("[role=tooltip].sheetwrite-fill-tip");
      expect(tip?.hidden).toBe(false);
      expect(tip?.textContent).toBe("70");

      scroller.dispatchEvent(pointer("pointerup", cellPoint(7, 1, workbook)));
      expect(tip?.hidden).toBe(true);
      expect(store.getCell(at(7)).resolved).toBe(70);
      grid.destroy();
      store.dispose();
    });

    it("shows the value every new cell will get, in place, while the fill handle drags", () => {
      const { grid, store, scroller, workbook, host } = makeGrid();
      store.applyTransaction({
        patches: [
          { op: "set", addr: at(1), value: { kind: "literal", value: 10 } },
          { op: "set", addr: at(2), value: { kind: "literal", value: 20 } },
        ],
      });
      grid.setSelection({
        kind: "range",
        range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
      });

      scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(2, 1, workbook)));
      scroller.dispatchEvent(pointer("pointermove", cellPoint(7, 1, workbook)));
      const canvas = host.querySelector<HTMLCanvasElement>("canvas.sheetwrite-fill-values");
      const context = canvas?.getContext("2d") as unknown as { calls: Record<string, number> };
      expect(canvas?.hidden).toBe(false);
      // Rows 4 to 8 each show their value: 30, 40, 50, 60, 70.
      expect(context.calls.fillText).toBe(5);

      // Esc ends the drag without filling, as in Excel.
      host.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      expect(canvas?.hidden).toBe(true);
      scroller.dispatchEvent(pointer("pointerup", cellPoint(7, 1, workbook)));
      expect(store.getCell(at(7)).resolved).toBe(70.5);
      grid.destroy();
      store.dispose();
    });

    describe("data validation, as Excel's fill copies it", () => {
      const list = (id: string, row: number, col: number, values: string[]): DocumentOp => ({
        op: "setValidationRule",
        sheet: "s1",
        rule: {
          id,
          range: { sheet: "s1", start: { row, col }, end: { row, col } },
          condition: { kind: "list", values },
          policy: "reject",
        },
      });
      /** The conditions of the rules over a cell. */
      const rulesAt = (store: SheetwriteStore, row: number, col = 1): unknown[] =>
        (store.getWorkbook().sheets[0]?.validationRules ?? [])
          .filter(
            ({ range }) =>
              range.start.row <= row &&
              row <= range.end.row &&
              range.start.col <= col &&
              col <= range.end.col,
          )
          .map((rule) => rule.condition);
      const fruit = { kind: "list", values: ["Apple", "Pear"] };
      const other = { kind: "list", values: ["X", "Y"] };
      const key = (host: HTMLElement, key: string): void => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
        );
      };

      it("gives the filled cells the source's rule in place of their own, with the fill handle, Ctrl+D and Ctrl+R", () => {
        const { grid, store, scroller, workbook, host } = makeGrid();
        store.applyTransaction({
          patches: [
            { op: "set", addr: at(1), value: { kind: "literal", value: "Apple" } },
            list("fruit", 1, 1, ["Apple", "Pear"]),
            list("other", 2, 1, ["X", "Y"]),
          ],
        });
        grid.setSelection({ kind: "cell", addr: at(1) });

        scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
        scroller.dispatchEvent(pointer("pointermove", cellPoint(3, 1, workbook)));
        scroller.dispatchEvent(pointer("pointerup", cellPoint(3, 1, workbook)));
        // The filled value lands although B3's old rule refused it, as in Excel.
        expect([2, 3].map((row) => store.getCell(at(row)).resolved)).toEqual(["Apple", "Apple"]);
        expect([1, 2, 3].map((row) => rulesAt(store, row))).toEqual([[fruit], [fruit], [fruit]]);

        grid.setSelection({
          kind: "range",
          range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 5, col: 1 } },
        });
        key(host, "d");
        expect([4, 5].map((row) => rulesAt(store, row))).toEqual([[fruit], [fruit]]);

        grid.setSelection({
          kind: "range",
          range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 1, col: 2 } },
        });
        key(host, "r");
        expect(rulesAt(store, 1, 2)).toEqual([fruit]);

        grid.actions.undo();
        expect(rulesAt(store, 1, 2)).toEqual([]);
        grid.destroy();
        store.dispose();
      });

      it("keeps the target's rules for Fill Without Formatting only", () => {
        const { grid, store, scroller, workbook, host } = makeGrid();
        store.applyTransaction({
          patches: [
            { op: "set", addr: at(1), value: { kind: "literal", value: "Apple" } },
            list("fruit", 1, 1, ["Apple", "Pear"]),
            list("other", 2, 1, ["X", "Y"]),
          ],
        });
        grid.setSelection({ kind: "cell", addr: at(1) });
        const before = store.getCell(at(2)).resolved;
        const choose = (label: string): void => {
          host.querySelector<HTMLElement>(".sheetwrite-auto-fill-options")?.click();
          const rows = host.querySelectorAll<HTMLElement>(".sheetwrite-context-menu-item");
          [...rows].find((row) => row.textContent === label)?.click();
        };

        scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
        scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 1, workbook)));
        scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 1, workbook)));
        choose("Fill Without Formatting");
        expect([store.getCell(at(2)).resolved, rulesAt(store, 2)]).toEqual(["Apple", [other]]);
        // Excel counts a cell's validation with its formats.
        choose("Fill Formatting Only");
        expect([store.getCell(at(2)).resolved, rulesAt(store, 2)]).toEqual([before, [fruit]]);
        grid.destroy();
        store.dispose();
      });
    });

    it("redoes a fill from the Auto Fill Options button as one undo step", () => {
      const { grid, store, scroller, workbook, host } = makeGrid();
      store.applyTransaction({
        patches: [
          { op: "set", addr: at(1), value: { kind: "literal", value: 10 }, style: { bold: true } },
        ],
      });
      grid.setSelection({ kind: "cell", addr: at(1) });
      const before = [2, 3, 4].map((row) => store.getCell(at(row)).resolved);
      const choose = (label: string): void => {
        host.querySelector<HTMLElement>(".sheetwrite-auto-fill-options")?.click();
        const rows = host.querySelectorAll<HTMLElement>(".sheetwrite-context-menu-item");
        [...rows].find((row) => row.textContent === label)?.click();
      };

      scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
      scroller.dispatchEvent(pointer("pointermove", cellPoint(4, 1, workbook)));
      scroller.dispatchEvent(pointer("pointerup", cellPoint(4, 1, workbook)));
      // One number is copied; Fill Series counts it up instead.
      expect(store.getCell(at(4)).resolved).toBe(10);
      const button = host.querySelector<HTMLButtonElement>(".sheetwrite-auto-fill-options");
      expect(button?.hidden).toBe(false);
      expect(button?.getAttribute("aria-label")).toBe("Auto Fill Options");

      choose("Fill Series");
      expect([2, 3, 4].map((row) => store.getCell(at(row)).resolved)).toEqual([11, 12, 13]);
      expect(store.getCell(at(4)).style.bold).toBe(true);

      choose("Fill Formatting Only");
      expect([2, 3, 4].map((row) => store.getCell(at(row)).resolved)).toEqual(before);
      expect(store.getCell(at(4)).style.bold).toBe(true);

      choose("Fill Without Formatting");
      expect(store.getCell(at(4)).resolved).toBe(10);
      expect(store.getCell(at(4)).style.bold).toBeUndefined();

      grid.actions.undo();
      expect([2, 3, 4].map((row) => store.getCell(at(row)).resolved)).toEqual(before);
      expect(store.getCell(at(4)).style.bold).toBeUndefined();
      // Another edit ends the offer.
      expect(button?.hidden).toBe(true);
      grid.destroy();
      store.dispose();
    });
  });

  it("fills down as far as the next column's data on a fill-handle double-click", () => {
    const { grid, store, scroller, workbook, host } = makeGrid();
    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 1, col: 2 }, end: { row: 9, col: 2 } },
        },
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 7, col: 1 }, end: { row: 9, col: 1 } },
        },
      ],
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 2 } });

    const handle = fillHandlePoint(0, 2, workbook);
    scroller.dispatchEvent(new MouseEvent("dblclick", { ...handle, bubbles: true }));

    expect(store.getCell({ sheet: "s1", row: 6, col: 2 }).resolved).toBe("Phnom Penh");
    expect(store.getCell({ sheet: "s1", row: 7, col: 2 }).resolved).toBeNull();
    expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();
    grid.destroy();
    store.dispose();
  });

  it("copies the top row and its format into the selection with Ctrl+D", () => {
    const { grid, store, host } = makeGrid();
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "formula", src: "=A1" },
          style: { bold: true },
        },
      ],
    });
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
    });
    host.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A3");
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).style.bold).toBe(true);
    grid.destroy();
    store.dispose();
  });

  it.each([
    { row: 3, col: 1, formula: "=A4" },
    { row: 0, col: 1, formula: "=A1" },
    { row: 1, col: 2, formula: "=B2" },
  ])("shifts a copied formula when filling toward $row,$col", ({ row, col, formula }) => {
    const { grid, store, scroller, workbook } = makeGrid();
    const source = { sheet: "s1", row: 1, col: 1 };
    const target = { sheet: "s1", row, col };
    const before = store.getCell(target);
    store.applyTransaction({
      patches: [{ op: "set", addr: source, value: { kind: "formula", src: "=A2" } }],
    });
    grid.setSelection({ kind: "cell", addr: source });

    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(1, 1, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(row, col, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(row, col, workbook)));

    expect(store.getFormula(target)).toBe(formula);
    expect(store.getFormula(source)).toBe("=A2");
    grid.actions.undo();
    expect(store.getCell(target)).toEqual(before);
    grid.actions.redo();
    expect(store.getFormula(target)).toBe(formula);
    grid.destroy();
    store.dispose();
  });

  it("fills 20,000 cells under default limits and restores them with one undo", () => {
    const targetRow = 20_000;
    const { grid, store, scroller, workbook } = makeGrid(targetRow + 1);
    // The city column holds plain text, which a fill copies; names end in a number and count.
    const target = { sheet: "s1", row: targetRow, col: 2 };
    const before = store.getCell(target).resolved;
    const source = store.getCell({ ...target, row: 0 }).resolved;
    const firstBefore = store.getCell({ ...target, row: 1 }).resolved;
    grid.setSelection({ kind: "cell", addr: { ...target, row: 0 } });

    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 2, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(targetRow, 2, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(targetRow, 2, workbook)));
    expect(store.getCell(target).resolved).toBe(source);

    grid.actions.undo();
    expect(store.getCell(target).resolved).toBe(before);
    expect(store.getCell({ ...target, row: 1 }).resolved).toBe(firstBefore);
    grid.actions.redo();
    expect(store.getCell(target).resolved).toBe(source);
    grid.destroy();
    store.dispose();
  });

  it("rejects an over-byte-budget bulk fill without changing cells or selection", () => {
    const { grid, store, scroller, workbook } = makeGrid(20, { maxEncodedBytes: 128 });
    const selection = { kind: "cell" as const, addr: { sheet: "s1", row: 0, col: 0 } };
    const target = { sheet: "s1", row: 19, col: 0 };
    const before = store.getCell(target).resolved;
    const rejected: string[] = [];
    grid.on("mutation-rejected", ({ issues }) => {
      for (const issue of issues) {
        if (issue.kind === "resource-limit") rejected.push(issue.resource);
      }
    });
    grid.setSelection(selection);

    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 0, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(19, 0, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(19, 0, workbook)));

    expect(rejected).toEqual(["encoded-bytes"]);
    expect(store.getCell(target).resolved).toBe(before);
    expect(grid.getSelection()).toEqual(selection);
    grid.destroy();
    store.dispose();
  });
});
describe("pointer input: drag lifecycle", () => {
  it("pointercancel mid fill-drag clears the preview and commits nothing", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const before = store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved;

    scroller.dispatchEvent(pointer("pointerdown", { ...fillHandlePoint(0, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(2, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointercancel", { ...cellPoint(2, 1, workbook) }));

    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(before);

    // The drag is fully torn down: a later pointerup must not commit either.
    scroller.dispatchEvent(pointer("pointerup", { ...cellPoint(3, 1, workbook) }));
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(before);
  });
  for (const axis of ["column", "row"] as const) {
    it(`${axis} resize previews without mutations and commits one undoable change`, () => {
      const { grid, store, scroller } = makeGrid();
      const original = axis === "column" ? 160 : DEFAULT_THEME.rowHeight;
      const start =
        axis === "column"
          ? { clientX: DEFAULT_THEME.rowHeaderWidth + original, clientY: 10 }
          : { clientX: 10, clientY: DEFAULT_THEME.headerHeight + original };
      const end =
        axis === "column"
          ? { ...start, clientX: start.clientX + 40 }
          : { ...start, clientY: start.clientY + 40 };
      const dimension = () =>
        axis === "column"
          ? store.getWorkbook().sheets[0]?.columns[0]?.width
          : (store.getWorkbook().sheets[0]?.rowHeights?.get(0) ?? DEFAULT_THEME.rowHeight);
      const changes: string[] = [];
      grid.on("change", (event) => changes.push(event.commitReason));
      scroller.dispatchEvent(pointer("pointerdown", start));
      scroller.dispatchEvent(pointer("pointermove", end));
      scroller.dispatchEvent(pointer("pointermove", end));
      expect(dimension()).toBe(original);
      expect(changes).toEqual([]);
      scroller.dispatchEvent(pointer("pointerup", end));
      expect(dimension()).toBe(original + 40);
      expect(changes).toEqual(["structure"]);
      grid.undo();
      expect(dimension()).toBe(original);
      grid.destroy();
      store.dispose();
    });

    for (const termination of ["pointercancel", "lostpointercapture", "read-only"] as const) {
      it(`${axis} resize restores geometry on ${termination}`, () => {
        const { grid, store, scroller, capture } = makeGrid();
        const original = axis === "column" ? 160 : DEFAULT_THEME.rowHeight;
        const start =
          axis === "column"
            ? { clientX: DEFAULT_THEME.rowHeaderWidth + original, clientY: 10 }
            : { clientX: 10, clientY: DEFAULT_THEME.headerHeight + original };
        const end =
          axis === "column"
            ? { ...start, clientX: start.clientX + 40 }
            : { ...start, clientY: start.clientY + 40 };
        const changes: string[] = [];
        grid.on("change", (event) => changes.push(event.commitReason));
        scroller.dispatchEvent(pointer("pointerdown", start));
        scroller.dispatchEvent(pointer("pointermove", end));
        if (termination === "read-only") grid.setReadOnly(true);
        else scroller.dispatchEvent(pointer(termination, end));
        scroller.dispatchEvent(pointer("pointerup", end));
        expect(changes).toEqual([]);
        expect(capture.released).toEqual([1]);
        const address = grid.getCellAtPoint(
          axis === "column" ? start.clientX + 10 : DEFAULT_THEME.rowHeaderWidth + 20,
          axis === "row" ? start.clientY + 10 : DEFAULT_THEME.headerHeight + 10,
        );
        expect(axis === "column" ? address?.col : address?.row).toBe(1);
        grid.destroy();
        store.dispose();
      });
    }
  }

  it("ignores another pointerdown before it can replace selection or capture", () => {
    const { grid, store, scroller, workbook, capture } = makeGrid();
    scroller.dispatchEvent(pointer("pointerdown", cellPoint(0, 0, workbook)));
    scroller.dispatchEvent(pointer("pointerdown", { ...cellPoint(4, 2, workbook), pointerId: 2 }));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 1, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 1, workbook)));
    expect(grid.getSelection()).toMatchObject({
      kind: "range",
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
    });
    expect(capture.set).toEqual([1]);
    expect(capture.released).toEqual([1]);
    grid.destroy();
    store.dispose();
  });

  it("ends a cancelled formula reference span before the next pick", () => {
    const { grid, store, host, scroller, workbook } = makeGrid();
    grid.beginEdit(0, 0, "=");
    const editor = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
    if (!editor) throw new Error("formula editor missing");
    scroller.dispatchEvent(pointer("pointerdown", cellPoint(1, 1, workbook)));
    scroller.dispatchEvent(pointer("pointercancel", cellPoint(1, 1, workbook)));
    editor.value += "+";
    editor.setSelectionRange(editor.value.length, editor.value.length);
    scroller.dispatchEvent(pointer("pointerdown", cellPoint(2, 2, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 2, workbook)));
    expect(editor.value).toBe("=B2+C3");
    grid.destroy();
    store.dispose();
  });

  it("abandons a fill when structure changes before release", () => {
    const { grid, store, scroller, workbook, capture } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const before = store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved;
    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 1, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 1, workbook)));
    grid.setColumnWidth(0, 200);
    scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 1, workbook)));
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(before);
    expect(capture.released).toEqual([1]);
    grid.destroy();
    store.dispose();
  });

  for (const axis of ["column", "row"] as const) {
    it(`restores ${axis} preview geometry when structural admission rejects release`, () => {
      const { grid, store, scroller } = makeGrid();
      grid.setProtectedRange({
        id: "deny-resize",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 9, col: 2 } },
      });
      grid.setProtectionResolver(() => "deny");
      const original = axis === "column" ? 160 : DEFAULT_THEME.rowHeight;
      const start =
        axis === "column"
          ? { clientX: DEFAULT_THEME.rowHeaderWidth + original, clientY: 10 }
          : { clientX: 10, clientY: DEFAULT_THEME.headerHeight + original };
      const end =
        axis === "column"
          ? { ...start, clientX: start.clientX + 40 }
          : { ...start, clientY: start.clientY + 40 };
      const rejections: string[] = [];
      grid.on("mutation-rejected", ({ issues }) =>
        rejections.push(...issues.map((issue) => issue.kind)),
      );
      scroller.dispatchEvent(pointer("pointerdown", start));
      scroller.dispatchEvent(pointer("pointermove", end));
      scroller.dispatchEvent(pointer("pointerup", end));
      expect(rejections).toEqual(["protection"]);
      const sheet = store.getWorkbook().sheets[0];
      expect(
        axis === "column"
          ? sheet?.columns[0]?.width
          : (sheet?.rowHeights?.get(0) ?? DEFAULT_THEME.rowHeight),
      ).toBe(original);
      const address = grid.getCellAtPoint(
        axis === "column" ? start.clientX + 10 : DEFAULT_THEME.rowHeaderWidth + 20,
        axis === "row" ? start.clientY + 10 : DEFAULT_THEME.headerHeight + 10,
      );
      expect(axis === "column" ? address?.col : address?.row).toBe(1);
      grid.destroy();
      store.dispose();
    });
  }
});
describe("pointer input: headers", () => {
  it("selects rows by clicking and dragging the row numbers, as in Excel", () => {
    const { grid, scroller, store } = makeGrid();
    const rowPoint = (row: number) => ({
      clientX: DEFAULT_THEME.rowHeaderWidth / 2,
      clientY: DEFAULT_THEME.headerHeight + (row + 0.5) * DEFAULT_THEME.rowHeight,
    });

    scroller.dispatchEvent(pointer("pointerdown", rowPoint(2)));
    expect(grid.getSelection()).toEqual({ kind: "row", sheet: "s1", row: 2 });
    scroller.dispatchEvent(pointer("pointermove", rowPoint(4)));
    scroller.dispatchEvent(pointer("pointerup", rowPoint(4)));
    expect(grid.getSelection()).toEqual({
      kind: "range",
      // Whole rows run to the grid's last column, which includes empty display columns.
      range: { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 4, col: expect.any(Number) } },
    });
    grid.destroy();
    store.dispose();
  });
});

describe("keyboard whole-axis selection", () => {
  it("selects the focused column with Ctrl+Space", () => {
    const { grid, host } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 1 } });

    const event = new KeyboardEvent("keydown", {
      key: " ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    // As in Excel, the active cell stays where it was.
    expect(grid.getSelection()).toEqual({
      kind: "column",
      sheet: "s1",
      col: 1,
      active: { sheet: "s1", row: 3, col: 1 },
    });
    grid.destroy();
  });
});
