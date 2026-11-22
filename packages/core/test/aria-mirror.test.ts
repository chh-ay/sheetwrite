import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Column, Grid, GridOptions } from "../src/types.js";
import { scrollerOf } from "./fixtures.js";

const ROW_COUNT = 1_000;
const HOST_WIDTH = 400;
const HOST_HEIGHT = 240;
const SCROLLED_ROWS = 100;
/** Alternating wide and narrow columns: a sideways scroll changes how many fit the host. */
const WIDE_SHEET_WIDTHS = Array.from({ length: 40 }, (_, col) => (col % 3 === 0 ? 150 : 60));
/** Scrolled part of the first, 150 px column: one more column comes into the window. */
const SCROLLED_LEFT_PX = 60;
let restore_canvas: () => void;
let original_frame: typeof requestAnimationFrame;
let original_cancel_frame: typeof cancelAnimationFrame;
const frames = new Map<number, FrameRequestCallback>();
let next_frame = 0;
let mounted: { grid: Grid; host: HTMLElement } | null = null;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restore_canvas = installCanvasTestStubs();
  original_frame = globalThis.requestAnimationFrame;
  original_cancel_frame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    next_frame += 1;
    frames.set(next_frame, callback);
    return next_frame;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
});
afterEach(() => {
  mounted?.grid.destroy();
  mounted?.host.remove();
  mounted = null;
  frames.clear();
  globalThis.requestAnimationFrame = original_frame;
  globalThis.cancelAnimationFrame = original_cancel_frame;
  restore_canvas();
});

function flush_frames(): void {
  while (frames.size > 0) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(performance.now());
  }
}

interface SheetSpec {
  rowCount: number;
  columns: Column[];
  data?: GridOptions["data"];
}

const PRODUCTS: SheetSpec = {
  rowCount: ROW_COUNT,
  columns: [
    { key: "product", header: "Product", type: "text", width: 140 },
    { key: "qty", header: "Qty", type: "number", width: 100 },
  ],
  data: {
    rowCount: ROW_COUNT,
    columns: {
      product: Array.from({ length: ROW_COUNT }, (_, row) => `Item ${row}`),
      qty: Float64Array.from({ length: ROW_COUNT }, (_, row) => row * 2),
    },
  },
};

function mount(
  { rowCount: row_count, columns, data }: SheetSpec = PRODUCTS,
  { runFrames: run_frames = true }: { runFrames?: boolean } = {},
): { grid: Grid; host: HTMLElement } {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: HOST_WIDTH });
  Object.defineProperty(host, "clientHeight", { value: HOST_HEIGHT });
  document.body.appendChild(host);
  const grid = createGrid(host, {
    workbook: {
      activeSheet: "s1",
      sheets: [{ id: "s1", name: "One", rowCount: row_count, columns }],
    },
    data,
    config: { toolbar: false, find: false, contextMenu: false },
  });
  mounted = { grid, host };
  if (run_frames) flush_frames();
  return mounted;
}

function mirror(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>(".sheetwrite-aria");
  if (!element) throw new Error("The ARIA mirror is missing");
  return element;
}

function grid_cell(host: HTMLElement, row: number, col: number): HTMLElement | null {
  return mirror(host).querySelector<HTMLElement>(`[role="gridcell"][id$="-${row}-${col}"]`);
}

function scroll_to(host: HTMLElement, row: number, left = 0): void {
  const scroller = scrollerOf(host);
  scroller.scrollTop = row * DEFAULT_THEME.rowHeight;
  scroller.scrollLeft = left;
  scroller.dispatchEvent(new Event("scroll"));
}

function rows(host: HTMLElement): Element[] {
  return [...mirror(host).querySelectorAll('[role="row"]')];
}

function headers(host: HTMLElement): Element[] {
  return [...mirror(host).querySelectorAll('[role="columnheader"]')];
}

function attrs(nodes: Element[], name: string): (string | null)[] {
  return nodes.map((node) => node.getAttribute(name));
}

it("mirrors the painted window with its header, rows, values, notes and focus", () => {
  const { grid, host } = mount();
  grid.setNote({ sheet: "s1", row: 1, col: 1 }, "Checked");
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  flush_frames();

  const id = mirror(host).id;
  expect(mirror(host).getAttribute("role")).toBe("grid");
  expect(host.getAttribute("role")).toBe("group");
  // The grid role owns only rows, not the host's chrome.
  expectSame(host.querySelector('[role="grid"]'), mirror(host));
  const owned = [...mirror(host).children].map((child) => child.getAttribute("role"));
  expect(new Set(owned)).toEqual(new Set(["row"]));
  expect(mirror(host).getAttribute("aria-rowcount")).toBe(String(ROW_COUNT + 1));
  expect(host.getAttribute("aria-activedescendant")).toBe(`${id}-0-0`);
  // A spreadsheet shows blank columns after the sheet's own.
  const shown = headers(host).slice(0, 3);
  expect(shown.map((header) => header.textContent)).toEqual(["A", "B", "C"]);
  expect(attrs(shown, "aria-colindex")).toEqual(["1", "2", "3"]);
  expect(attrs(rows(host), "aria-rowindex").slice(0, 3)).toEqual(["1", "2", "3"]);
  const focused = grid_cell(host, 0, 0);
  expect(focused?.textContent).toBe("Item 0");
  expect(focused?.getAttribute("aria-selected")).toBe("true");
  expect(focused?.getAttribute("aria-colindex")).toBe("1");
  expect(grid_cell(host, 0, 1)?.textContent).toBe("0");
  expect(grid_cell(host, 0, 1)?.hasAttribute("aria-selected")).toBe(false);
  expect(grid_cell(host, 1, 1)?.getAttribute("aria-description")).toBe("Note: Checked");
  expect(grid_cell(host, 1, 0)?.hasAttribute("aria-description")).toBe(false);
});

it("shows a validation rule's input message beside its selected cell and in its description", () => {
  const { grid, host } = mount();
  grid.setValidationRule({
    id: "qty",
    range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 9, col: 1 } },
    condition: { kind: "number", min: 0 },
    policy: "reject",
    inputTitle: "Quantity",
    inputMessage: "Units ordered.",
  });
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
  flush_frames();
  expect(host.querySelector(".sheetwrite-input-message")?.textContent).toBe(
    "QuantityUnits ordered.",
  );
  expect(grid_cell(host, 0, 1)?.getAttribute("aria-description")).toBe("Quantity: Units ordered.");

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  flush_frames();
  expect(host.querySelector(".sheetwrite-input-message")).toBeNull();
});

it("marks a selected column's header and a selected row", () => {
  const { grid, host } = mount();
  grid.setSelection({ kind: "column", sheet: "s1", col: 1 });
  flush_frames();
  expect(attrs(headers(host), "aria-selected").slice(0, 3)).toEqual([null, "true", null]);

  grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
  flush_frames();
  expect(attrs(rows(host), "aria-selected").slice(0, 4)).toEqual([null, null, null, "true"]);
  expect(headers(host).some((header) => header.hasAttribute("aria-selected"))).toBe(false);
});

it("follows a scrolled window, naming no active cell outside it", () => {
  const { grid, host } = mount();
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  flush_frames();

  scroll_to(host, SCROLLED_ROWS);
  flush_frames();

  const indices = attrs(rows(host), "aria-rowindex");
  expect(indices[0]).toBe("1");
  expect(indices).toContain(String(SCROLLED_ROWS + 2));
  expect(indices).not.toContain("2");
  expect(grid_cell(host, SCROLLED_ROWS, 0)?.textContent).toBe(`Item ${SCROLLED_ROWS}`);
  expect(grid_cell(host, 0, 0)).toBeNull();
  expect(host.hasAttribute("aria-activedescendant")).toBe(false);
  scroll_to(host, 0);
  flush_frames();
  expect(host.getAttribute("aria-activedescendant")).toBe(`${mirror(host).id}-0-0`);
});

it("keeps its cells when a sideways scroll changes how many columns show", () => {
  const { host } = mount({
    rowCount: ROW_COUNT,
    columns: WIDE_SHEET_WIDTHS.map((width, col) => ({
      key: `c${col}`,
      header: `C${col}`,
      type: "text",
      width,
    })),
  });
  const columns_before = headers(host).length;
  const first_row = rows(host)[1];
  const first_cell = first_row?.querySelector('[role="gridcell"]');

  scroll_to(host, 0, SCROLLED_LEFT_PX);
  flush_frames();

  const shown = headers(host);
  expect(shown.length).toBe(columns_before + 1);
  // The nodes stay; the new column's cells are added to them.
  expectSame(rows(host)[1], first_row);
  expectSame(first_row?.querySelector('[role="gridcell"]'), first_cell);
  const last_column = Number(shown.at(-1)?.getAttribute("aria-colindex")) - 1;
  const last_cell = first_row?.querySelectorAll('[role="gridcell"]')[shown.length - 1];
  expect(last_cell?.id).toBe(`${mirror(host).id}-0-${last_column}`);
  expect(last_cell?.getAttribute("aria-colindex")).toBe(String(last_column + 1));
  for (const row of rows(host).slice(1)) {
    expect(row.querySelectorAll('[role="gridcell"]').length).toBe(shown.length);
  }
});

it("writes the mirror on mount and on a synchronous paint, before any frame", () => {
  const { grid, host } = mount(PRODUCTS, { runFrames: false });
  expect(
    headers(host)
      .slice(0, 2)
      .map((header) => header.textContent),
  ).toEqual(["A", "B"]);
  expect(grid_cell(host, 0, 0)?.textContent).toBe("Item 0");

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
  grid.refresh();
  expect(host.getAttribute("aria-activedescendant")).toBe(`${mirror(host).id}-2-1`);
  expect(grid_cell(host, 2, 1)?.getAttribute("aria-selected")).toBe("true");
  expect(grid_cell(host, 0, 0)?.hasAttribute("aria-selected")).toBe(false);
});

it("reads each cell as the canvas shows it, in the cell's number format", () => {
  const { host } = mount({
    rowCount: 1,
    columns: [
      { key: "due", header: "Due", type: "number", width: 100, numberFormat: "yyyy-mm-dd" },
      {
        key: "rate",
        header: "Rate",
        type: "number",
        width: 80,
        cellStyle: { numberFormat: "0.0%" },
      },
      { key: "share", header: "Share", type: "general", width: 120 },
    ],
    data: { rowCount: 1, columns: { due: [45351], rate: [0.125], share: [1 / 3] } },
  });

  expect([0, 1, 2].map((col) => grid_cell(host, 0, col)?.textContent)).toEqual([
    "2024-02-29",
    "12.5%",
    "0.333333333",
  ]);
});

it("leaves the host clean when a listener destroys the grid during a paint", () => {
  const { grid, host } = mount();
  grid.on("scroll", () => grid.destroy());
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });

  scroll_to(host, SCROLLED_ROWS);
  flush_frames();

  expect(host.querySelector(".sheetwrite-aria")).toBeNull();
  for (const name of ["role", "aria-rowcount", "aria-activedescendant"]) {
    expect(host.hasAttribute(name)).toBe(false);
  }
});
