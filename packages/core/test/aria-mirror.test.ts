import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";

const ROW_COUNT = 1_000;
const HOST_WIDTH = 400;
const HOST_HEIGHT = 240;
const SCROLLED_ROWS = 100;
let restoreCanvas: () => void;
let originalFrame: typeof requestAnimationFrame;
let originalCancelFrame: typeof cancelAnimationFrame;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let mounted: { grid: Grid; host: HTMLElement } | null = null;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
  originalFrame = globalThis.requestAnimationFrame;
  originalCancelFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
});
afterEach(() => {
  mounted?.grid.destroy();
  mounted?.host.remove();
  mounted = null;
  frames.clear();
  globalThis.requestAnimationFrame = originalFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  restoreCanvas();
});

function flushFrames(): void {
  while (frames.size > 0) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(performance.now());
  }
}

function mount({ runFrames = true }: { runFrames?: boolean } = {}): {
  grid: Grid;
  host: HTMLElement;
} {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: HOST_WIDTH });
  Object.defineProperty(host, "clientHeight", { value: HOST_HEIGHT });
  document.body.appendChild(host);
  const grid = createGrid(host, {
    workbook: {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "One",
          rowCount: ROW_COUNT,
          columns: [
            { key: "product", header: "Product", type: "text", width: 140 },
            { key: "qty", header: "Qty", type: "number", width: 100 },
          ],
        },
      ],
    },
    data: {
      rowCount: ROW_COUNT,
      columns: {
        product: Array.from({ length: ROW_COUNT }, (_, row) => `Item ${row}`),
        qty: Float64Array.from({ length: ROW_COUNT }, (_, row) => row * 2),
      },
    },
    config: { toolbar: false, find: false, contextMenu: false },
  });
  mounted = { grid, host };
  if (runFrames) flushFrames();
  return mounted;
}

function mirror(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>(".sheetwrite-aria");
  if (!element) throw new Error("The ARIA mirror is missing");
  return element;
}

function gridCell(host: HTMLElement, row: number, col: number): HTMLElement | null {
  return mirror(host).querySelector<HTMLElement>(`[role="gridcell"][id$="-${row}-${col}"]`);
}

function rowIndices(host: HTMLElement): string[] {
  return [...mirror(host).querySelectorAll('[role="row"]')].map(
    (row) => row.getAttribute("aria-rowindex") ?? "",
  );
}

function scrollTo(host: HTMLElement, row: number): void {
  const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
  if (!scroller) throw new Error("The grid scroller is missing");
  scroller.scrollTop = row * DEFAULT_THEME.rowHeight;
  scroller.dispatchEvent(new Event("scroll"));
}

it("mirrors the painted window with its header, rows, values, notes and focus", () => {
  const { grid, host } = mount();
  grid.setNote({ sheet: "s1", row: 1, col: 1 }, "Checked");
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  flushFrames();

  const id = mirror(host).id;
  expect(mirror(host).getAttribute("role")).toBe("rowgroup");
  expect(host.getAttribute("aria-rowcount")).toBe(String(ROW_COUNT + 1));
  expect(host.getAttribute("aria-activedescendant")).toBe(`${id}-0-0`);
  // A spreadsheet shows blank columns after the sheet's own.
  const headers = [...mirror(host).querySelectorAll('[role="columnheader"]')].slice(0, 3);
  expect(headers.map((header) => header.textContent)).toEqual(["A", "B", "C"]);
  expect(headers.map((header) => header.getAttribute("aria-colindex"))).toEqual(["1", "2", "3"]);
  expect(rowIndices(host).slice(0, 3)).toEqual(["1", "2", "3"]);
  const focused = gridCell(host, 0, 0);
  expect(focused?.textContent).toBe("Item 0");
  expect(focused?.getAttribute("aria-selected")).toBe("true");
  expect(focused?.getAttribute("aria-colindex")).toBe("1");
  expect(gridCell(host, 0, 1)?.textContent).toBe("0");
  expect(gridCell(host, 0, 1)?.hasAttribute("aria-selected")).toBe(false);
  expect(gridCell(host, 1, 1)?.getAttribute("aria-description")).toBe("Note: Checked");
  expect(gridCell(host, 1, 0)?.hasAttribute("aria-description")).toBe(false);
});

it("marks a selected column's header and a selected row", () => {
  const { grid, host } = mount();
  grid.setSelection({ kind: "column", sheet: "s1", col: 1 });
  flushFrames();
  const headers = [...mirror(host).querySelectorAll('[role="columnheader"]')].slice(0, 3);
  expect(headers.map((header) => header.getAttribute("aria-selected"))).toEqual([
    null,
    "true",
    null,
  ]);

  grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
  flushFrames();
  const rows = [...mirror(host).querySelectorAll('[role="row"]')];
  expect(rows.map((row) => row.getAttribute("aria-selected")).slice(0, 4)).toEqual([
    null,
    null,
    null,
    "true",
  ]);
  expect(
    [...mirror(host).querySelectorAll('[role="columnheader"]')].some((header) =>
      header.hasAttribute("aria-selected"),
    ),
  ).toBe(false);
});

it("follows a scrolled window in the frame that paints it, after the paint", () => {
  const { grid, host } = mount();
  const before = rowIndices(host);
  const seenByScrollListeners: string[] = [];
  grid.on("scroll", () => seenByScrollListeners.push(rowIndices(host)[1] ?? ""));

  scrollTo(host, SCROLLED_ROWS);
  expect(rowIndices(host)).toEqual(before);
  flushFrames();

  // The paint's own listeners still see the old mirror: it is written last.
  expect(seenByScrollListeners).toEqual([before[1] ?? ""]);
  expect(rowIndices(host)[0]).toBe("1");
  expect(rowIndices(host)).toContain(String(SCROLLED_ROWS + 2));
  expect(rowIndices(host)).not.toContain("2");
  expect(gridCell(host, SCROLLED_ROWS, 0)?.textContent).toBe(`Item ${SCROLLED_ROWS}`);
  expect(gridCell(host, 0, 0)).toBeNull();
});

it("writes the mirror when the grid mounts, before any frame", () => {
  const { host } = mount({ runFrames: false });

  const headers = [...mirror(host).querySelectorAll('[role="columnheader"]')].slice(0, 2);
  expect(headers.map((header) => header.textContent)).toEqual(["A", "B"]);
  expect(gridCell(host, 0, 0)?.textContent).toBe("Item 0");
});

it("writes the mirror and aria-activedescendant of a synchronous paint in the same task", () => {
  const { grid, host } = mount();
  const id = mirror(host).id;

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
  grid.refresh();

  expect(host.getAttribute("aria-activedescendant")).toBe(`${id}-2-1`);
  expect(gridCell(host, 2, 1)?.getAttribute("aria-selected")).toBe("true");
  expect(gridCell(host, 0, 0)?.hasAttribute("aria-selected")).toBe(false);
});

it("leaves the host clean when a listener destroys the grid during a paint", () => {
  const { grid, host } = mount();
  grid.on("scroll", () => grid.destroy());
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });

  scrollTo(host, SCROLLED_ROWS);
  flushFrames();

  expect(host.querySelector(".sheetwrite-aria")).toBeNull();
  for (const name of ["role", "aria-rowcount", "aria-activedescendant"]) {
    expect(host.hasAttribute(name)).toBe(false);
  }
});
