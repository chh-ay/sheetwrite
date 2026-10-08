import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

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

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

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

function makeGrid(): {
  grid: Grid;
  store: SheetwriteStore;
  workbook: Workbook;
  scroller: HTMLDivElement;
  host: HTMLDivElement;
  capture: CaptureLog;
} {
  const workbook = makeWorkbook(10);
  const store = new SheetwriteStore(workbook, makeColumnarData(10));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  const scroller = scrollerOf(host);
  const capture = stubCapture(scroller);
  return { grid, store, workbook, host, scroller, capture };
}

describe("pointer input: mouse parity", () => {
  it("drag across cells produces a range selection and takes capture", () => {
    const { grid, scroller, workbook, capture } = makeGrid();

    scroller.dispatchEvent(pointer("pointerdown", { ...cellPoint(0, 0, workbook) }));
    scroller.dispatchEvent(pointer("pointermove", { ...cellPoint(2, 1, workbook) }));
    scroller.dispatchEvent(pointer("pointerup", { ...cellPoint(2, 1, workbook) }));

    const sel = grid.getSelection();
    expect(sel?.kind).toBe("range");
    if (sel?.kind === "range") {
      expect(sel.range).toMatchObject({ start: { row: 0, col: 0 }, end: { row: 2, col: 1 } });
    }
    expect(capture.set).toEqual([1]);
    expect(capture.released).toEqual([1]);
  });

  it("focuses the grid on mouse selection so printable keys start editing", () => {
    const { grid, scroller, workbook, host } = makeGrid();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    scroller.dispatchEvent(pointer("pointerdown", { ...cellPoint(1, 1, workbook) }));
    expect(document.activeElement).toBe(host);

    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Q", bubbles: true }));
    const editor = host.querySelector("textarea.sheetwrite-editor");
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe("Q");
    editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    grid.destroy();
    outside.remove();
  });

  it("drag on a column boundary commits a width patch", () => {
    const { store, scroller, workbook } = makeGrid();
    const boundaryX = DEFAULT_THEME.rowHeaderWidth + (workbook.sheets[0]?.columns[0]?.width ?? 0);

    scroller.dispatchEvent(pointer("pointerdown", { clientX: boundaryX, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointermove", { clientX: boundaryX + 30, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointerup", { clientX: boundaryX + 30, clientY: 10 }));

    expect(store.getWorkbook().sheets[0]?.columns[0]?.width).toBe(190);
  });
});

describe("pointer input: touch policy", () => {
  it("touch drag on the fill handle captures, previews, and commits the fill", () => {
    const { grid, store, scroller, workbook, capture } = makeGrid();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const reasons: string[] = [];
    grid.on("change", (event) => reasons.push(event.commitReason));

    const handle = fillHandlePoint(0, 1, workbook);
    const down = pointer("pointerdown", { ...handle, pointerType: "touch" });
    scroller.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(capture.set).toEqual([1]);

    scroller.dispatchEvent(
      pointer("pointermove", { ...cellPoint(2, 1, workbook), pointerType: "touch" }),
    );
    scroller.dispatchEvent(
      pointer("pointerup", { ...cellPoint(2, 1, workbook), pointerType: "touch" }),
    );

    // Single-source fill repeats the source value down the dragged range.
    const source = store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved;
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(source);
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(source);
    expect(capture.released).toEqual([1]);
    expect(reasons).toEqual(["fill"]);
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

  it("keeps the source selection when fill admission rejects its values", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    grid.setValidationRule({
      id: "deny-fill",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      condition: { kind: "list", values: ["Allowed"] },
      policy: "reject",
    });
    const source = { kind: "cell" as const, addr: { sheet: "s1", row: 0, col: 0 } };
    grid.setSelection(source);
    const before = store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved;
    scroller.dispatchEvent(pointer("pointerdown", fillHandlePoint(0, 0, workbook)));
    scroller.dispatchEvent(pointer("pointermove", cellPoint(2, 0, workbook)));
    scroller.dispatchEvent(pointer("pointerup", cellPoint(2, 0, workbook)));
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(before);
    expect(grid.getSelection()).toEqual(source);
    grid.destroy();
    store.dispose();
  });
});
describe("validation through input mutation paths", () => {
  it("rejects invalid external paste at the shared commit boundary", async () => {
    const { grid, store } = makeGrid();
    grid.setValidationRule({
      id: "small-amount",
      range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
      condition: { kind: "number", max: 5 },
      policy: "reject",
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const before = store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved;
    const rejected: string[] = [];
    grid.on("mutation-rejected", ({ issues }) =>
      rejected.push(...issues.map((issue) => issue.kind)),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: () => Promise.resolve("99") },
    });

    await expect(grid.actions.paste()).resolves.toBe("done");
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(before);
    expect(rejected).toEqual(["validation"]);
    grid.destroy();
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
    expect(grid.getSelection()).toEqual({ kind: "column", sheet: "s1", col: 1 });
    grid.destroy();
  });
});

describe("pointer input: header resize hit-testing", () => {
  it("skips the leading edge of the first visible column and still grabs its trailing edge", () => {
    const { grid, store, scroller, workbook } = makeGrid();
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("expected fixture sheet");

    // Hidden column 0 disappears from the band list, so column 1 opens the view.
    grid.hideColumns([0]);
    grid.refresh();

    scroller.dispatchEvent(
      pointer("pointermove", { clientX: DEFAULT_THEME.rowHeaderWidth + 2, clientY: 10 }),
    );
    expect(scroller.style.cursor).toBe("");

    const boundaryX = DEFAULT_THEME.rowHeaderWidth + (sheet.columns[1]?.width ?? 0);
    scroller.dispatchEvent(pointer("pointermove", { clientX: boundaryX - 1, clientY: 10 }));
    expect(scroller.style.cursor).toBe("col-resize");

    scroller.dispatchEvent(pointer("pointerdown", { clientX: boundaryX - 1, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointermove", { clientX: boundaryX + 29, clientY: 10 }));
    scroller.dispatchEvent(pointer("pointerup", { clientX: boundaryX + 29, clientY: 10 }));
    expect(store.getWorkbook().sheets[0]?.columns[1]?.width).toBe(150);
    grid.destroy();
  });
});
