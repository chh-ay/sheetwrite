import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { setChartRendererFactory } from "../src/chart-backend.js";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  ChartAnchor,
  ChartDefinition,
  ChartRef,
  GridOptions,
  Workbook,
} from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

const ROW_HEIGHT = DEFAULT_THEME.rowHeight;
/** Column widths of `makeWorkbook`: name, amount, city. */
const NAME_WIDTH = 160;
const AMOUNT_WIDTH = 120;

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;
const grids: GridImpl[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  // Scheduled renders run at once, so each placement is observable synchronously.
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  setChartRendererFactory(null);
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
  document.body.replaceChildren();
});

function chart(id: string, anchor: Partial<ChartAnchor> = {}, title?: string): ChartDefinition {
  return {
    id,
    kind: "column",
    ...(title === undefined ? {} : { title }),
    anchor: { row: 2, col: 1, offsetX: 10, offsetY: 5, width: 200, height: 100, ...anchor },
    series: [{ values: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 4, col: 1 } } }],
  };
}

function twoSheetWorkbook(): Workbook {
  const workbook = makeWorkbook(50);
  const first = workbook.sheets[0];
  if (!first) throw new Error("expected the fixture sheet");
  workbook.sheets.push({ ...structuredClone(first), id: "s2", name: "Sheet 2" });
  return workbook;
}

function mountGrid(options: Partial<GridOptions> = {}, workbook = makeWorkbook(50)): GridImpl {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, config: { tabs: false }, ...options });
  grids.push(grid);
  return grid;
}

function hostOf(grid: GridImpl): HTMLElement {
  const host = document.querySelector<HTMLElement>(".sheetwrite");
  if (!host || grids.at(-1) !== grid) throw new Error("expected the grid host");
  return host;
}

function scrollerOf(grid: GridImpl): HTMLElement {
  const scroller = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-scroller");
  if (!scroller) throw new Error("expected the grid scroller");
  return scroller;
}

function frameOf(grid: GridImpl, id: string): HTMLElement {
  const frame = hostOf(grid).querySelector<HTMLElement>(
    `.sheetwrite-object[data-chart-id="${id}"]`,
  );
  if (!frame) throw new Error(`expected a frame for chart ${id}`);
  return frame;
}

function handleOf(frame: HTMLElement, name: string): HTMLElement {
  const handle = frame.querySelector<HTMLElement>(`[data-handle="${name}"]`);
  if (!handle) throw new Error(`expected the ${name} handle`);
  return handle;
}

/** Position, pane and size that the layer wrote for one frame. */
function placement(frame: HTMLElement): {
  pane: string | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(frame.style.transform);
  if (!match) throw new Error(`unexpected transform ${frame.style.transform}`);
  return {
    pane: frame.parentElement?.dataset.pane,
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number.parseFloat(frame.style.width),
    height: Number.parseFloat(frame.style.height),
  };
}

function scrollTo(grid: GridImpl, top: number, left: number): void {
  const scroller = scrollerOf(grid);
  scroller.scrollTop = top;
  scroller.scrollLeft = left;
  grid.refresh();
}

function drag(target: HTMLElement, dx: number, dy: number): void {
  const start = { clientX: 100, clientY: 100, pointerId: 1, bubbles: true };
  target.dispatchEvent(new PointerEvent("pointerdown", { ...start, button: 0 }));
  document.dispatchEvent(
    new PointerEvent("pointermove", { ...start, clientX: 100 + dx, clientY: 100 + dy }),
  );
  document.dispatchEvent(
    new PointerEvent("pointerup", { ...start, clientX: 100 + dx, clientY: 100 + dy }),
  );
}

function press(target: HTMLElement, key: string, shiftKey = false): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
}

function anchorOf(grid: GridImpl, id: string): ChartAnchor | undefined {
  return grid.getCharts().find((candidate) => candidate.id === id)?.anchor;
}

describe("object layer placement", () => {
  it("places a chart from its anchor and follows scroll", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));

    expect(placement(frameOf(grid, "c1"))).toEqual({
      pane: "bottom-right",
      x: NAME_WIDTH + 10,
      y: 2 * ROW_HEIGHT + 5,
      width: 200,
      height: 100,
    });

    scrollTo(grid, 2 * ROW_HEIGHT, 50);
    expect(placement(frameOf(grid, "c1"))).toMatchObject({ x: NAME_WIDTH + 10 - 50, y: 5 });
  });

  it("scales position and size with zoom", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    grid.setZoom(1.5);

    expect(placement(frameOf(grid, "c1"))).toMatchObject({
      x: (NAME_WIDTH + 10) * 1.5,
      y: (2 * ROW_HEIGHT + 5) * 1.5,
      width: 300,
      height: 150,
    });
  });

  it("follows row and column resizes", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    grid.setColumnWidth(0, 200);
    grid.setRowHeight(0, ROW_HEIGHT * 2);

    expect(placement(frameOf(grid, "c1"))).toMatchObject({
      x: 200 + 10,
      y: 3 * ROW_HEIGHT + 5,
    });
  });

  it("puts each chart in the frozen pane of its anchor cell", () => {
    const grid = mountGrid();
    const frozenRows = 3;
    grid.setFrozen(frozenRows, 1);
    grid.setChart("s1", chart("pinned", { row: 1, col: 0, offsetX: 4, offsetY: 4 }));
    grid.setChart("s1", chart("top", { row: 1, col: 2, offsetX: 0, offsetY: 4 }));
    grid.setChart("s1", chart("left", { row: 5, col: 0, offsetX: 4, offsetY: 0 }));
    grid.setChart("s1", chart("body", { row: 5, col: 2, offsetX: 0, offsetY: 0 }));
    const frozenHeight = frozenRows * ROW_HEIGHT;
    const scrollTop = ROW_HEIGHT;
    const scrollLeft = 30;
    scrollTo(grid, scrollTop, scrollLeft);

    expect(placement(frameOf(grid, "pinned"))).toMatchObject({
      pane: "top-left",
      x: 4,
      y: ROW_HEIGHT + 4,
    });
    expect(placement(frameOf(grid, "body"))).toMatchObject({
      pane: "bottom-right",
      x: AMOUNT_WIDTH - scrollLeft,
      y: 5 * ROW_HEIGHT - frozenHeight - scrollTop,
    });
    // Frozen rows scroll only sideways; frozen columns scroll only up and down.
    expect(placement(frameOf(grid, "top"))).toMatchObject({
      pane: "top-right",
      x: AMOUNT_WIDTH - scrollLeft,
      y: ROW_HEIGHT + 4,
    });
    expect(placement(frameOf(grid, "left"))).toMatchObject({
      pane: "bottom-left",
      x: 4,
      y: 5 * ROW_HEIGHT - frozenHeight - scrollTop,
    });
  });

  it("collapses hidden rows and columns like the grid", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("hiddenRow", { row: 2, col: 0, offsetX: 0, offsetY: 5 }));
    grid.setChart("s1", chart("below", { row: 5, col: 0, offsetX: 0, offsetY: 5 }));
    grid.setChart("s1", chart("hiddenCol", { row: 0, col: 1, offsetX: 10, offsetY: 0 }));
    grid.hideRows([2, 3]);
    grid.hideColumns([1]);

    // The hidden anchor row collapses onto the next shown row, data row 4.
    expect(placement(frameOf(grid, "hiddenRow"))).toMatchObject({ y: 2 * ROW_HEIGHT });
    expect(placement(frameOf(grid, "below"))).toMatchObject({ y: 3 * ROW_HEIGHT + 5 });
    expect(placement(frameOf(grid, "hiddenCol"))).toMatchObject({ x: NAME_WIDTH });
  });
});

describe("object layer editing", () => {
  it("moves a chart by drag as one undo step", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    const frame = frameOf(grid, "c1");

    drag(frame, 40, ROW_HEIGHT);
    expect(anchorOf(grid, "c1")).toEqual({
      row: 3,
      col: 1,
      offsetX: 50,
      offsetY: 5,
      width: 200,
      height: 100,
    });
    expect(placement(frameOf(grid, "c1"))).toMatchObject({
      x: NAME_WIDTH + 50,
      y: 3 * ROW_HEIGHT + 5,
    });

    grid.undo();
    expect(anchorOf(grid, "c1")).toEqual(chart("c1").anchor);
  });

  it("shows a live preview while it drags and commits once on release", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    const frame = frameOf(grid, "c1");
    let commits = 0;
    grid.on("change", () => (commits += 1));

    const start = { clientX: 100, clientY: 100, pointerId: 1, bubbles: true };
    frame.dispatchEvent(new PointerEvent("pointerdown", { ...start, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { ...start, clientX: 120 }));
    document.dispatchEvent(new PointerEvent("pointermove", { ...start, clientX: 130 }));
    expect(placement(frame)).toMatchObject({ x: NAME_WIDTH + 10 + 30 });
    expect(commits).toBe(0);

    document.dispatchEvent(new PointerEvent("pointerup", { ...start, clientX: 130 }));
    expect(commits).toBe(1);
    expect(anchorOf(grid, "c1")?.offsetX).toBe(40);
  });

  it("resizes from a corner handle as one undo step", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    const frame = frameOf(grid, "c1");

    drag(handleOf(frame, "se"), 30, 20);
    expect(anchorOf(grid, "c1")).toMatchObject({
      offsetX: 10,
      offsetY: 5,
      width: 230,
      height: 120,
    });

    drag(handleOf(frameOf(grid, "c1"), "nw"), 20, 10);
    expect(anchorOf(grid, "c1")).toMatchObject({
      offsetX: 30,
      offsetY: 15,
      width: 210,
      height: 110,
    });
    expect(placement(frameOf(grid, "c1"))).toMatchObject({ width: 210, height: 110 });

    grid.undo();
    expect(anchorOf(grid, "c1")).toMatchObject({ width: 230, height: 120 });
    grid.undo();
    expect(anchorOf(grid, "c1")).toEqual(chart("c1").anchor);
  });

  it("nudges by one pixel or one cell, one undo step per key", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const selection = grid.getSelection();
    frameOf(grid, "c1").dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, pointerId: 1, bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));

    press(frameOf(grid, "c1"), "ArrowRight");
    expect(anchorOf(grid, "c1")).toMatchObject({ col: 1, offsetX: 11 });
    press(frameOf(grid, "c1"), "ArrowDown", true);
    expect(anchorOf(grid, "c1")).toMatchObject({ row: 3, offsetY: 5 });
    // The keys move the object, not the cell cursor.
    expect(grid.getSelection()).toEqual(selection);

    grid.undo();
    expect(anchorOf(grid, "c1")).toMatchObject({ row: 2, offsetX: 11 });
    grid.undo();
    expect(anchorOf(grid, "c1")).toEqual(chart("c1").anchor);
  });

  it("deletes the selected chart as one undo step", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    grid.selectChart("s1", "c1");

    press(frameOf(grid, "c1"), "Delete");
    expect(grid.getCharts()).toEqual([]);
    expect(hostOf(grid).querySelector(".sheetwrite-object")).toBeNull();

    grid.undo();
    expect(grid.getCharts()).toEqual([chart("c1")]);
    expect(placement(frameOf(grid, "c1"))).toMatchObject({ x: NAME_WIDTH + 10 });
  });

  it("selects on click, deselects on a cell click and reports both", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1", {}, "Sales"));
    const events: Array<ChartRef | null> = [];
    grid.on("chart-select", (event) => events.push(event));
    const frame = frameOf(grid, "c1");

    frame.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, pointerId: 1, bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(events).toEqual([{ sheet: "s1", id: "c1" }]);
    expect(document.activeElement).toBe(frame);
    expect(frame.getAttribute("role")).toBe("img");
    expect(frame.getAttribute("aria-label")).toBe("Sales, column chart");
    expect(frame.getAttribute("aria-current")).toBe("true");
    expect(frame.classList.contains("sheetwrite-object-selected")).toBe(true);
    expect(frame.querySelectorAll(".sheetwrite-object-handle")).toHaveLength(8);

    scrollerOf(grid).dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, clientX: 5, clientY: 5, bubbles: true }),
    );
    expect(events).toEqual([{ sheet: "s1", id: "c1" }, null]);
    expect(frame.getAttribute("aria-current")).toBe("false");
  });

  it("emits chart-activate on Enter and returns focus to the grid on Escape", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    grid.selectChart("s1", "c1");
    const activated: ChartRef[] = [];
    grid.on("chart-activate", (event) => activated.push(event));
    const frame = frameOf(grid, "c1");
    frame.focus();

    press(frame, "Enter");
    expect(activated).toEqual([{ sheet: "s1", id: "c1" }]);

    press(frame, "Escape");
    expect(document.activeElement).toBe(hostOf(grid));
    expect(frame.classList.contains("sheetwrite-object-selected")).toBe(false);
  });
});

describe("object layer read-only", () => {
  it("selects and activates, but does not move, resize, nudge or delete", () => {
    const workbook = makeWorkbook(50);
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("expected the fixture sheet");
    sheet.charts = [chart("c1")];
    const grid = mountGrid({ readOnly: true }, workbook);
    const selected: Array<ChartRef | null> = [];
    const activated: ChartRef[] = [];
    grid.on("chart-select", (event) => selected.push(event));
    grid.on("chart-activate", (event) => activated.push(event));
    const frame = frameOf(grid, "c1");

    drag(frame, 40, 40);
    drag(handleOf(frame, "se"), 40, 40);
    press(frame, "ArrowRight");
    press(frame, "Delete");
    press(frame, "Enter");

    expect(grid.getCharts()).toEqual([chart("c1")]);
    expect(selected).toEqual([{ sheet: "s1", id: "c1" }]);
    expect(activated).toEqual([{ sheet: "s1", id: "c1" }]);
    expect(placement(frame)).toMatchObject({ x: NAME_WIDTH + 10, y: 2 * ROW_HEIGHT + 5 });
    expect(
      hostOf(grid).querySelector(".sheetwrite-object-layer")?.getAttribute("data-readonly"),
    ).toBe("true");
  });
});

describe("object layer mounting", () => {
  it("draws a plain frame with the title when no renderer is registered", () => {
    const grid = mountGrid();
    grid.setChart("s1", chart("titled", {}, "Revenue"));
    grid.setChart("s1", chart("untitled", { row: 10 }));

    expect(frameOf(grid, "titled").querySelector(".sheetwrite-object-fallback")?.textContent).toBe(
      "Revenue",
    );
    expect(
      frameOf(grid, "untitled").querySelector(".sheetwrite-object-fallback")?.textContent,
    ).toBe("Column chart");

    grid.setChart("s1", chart("titled", {}, "Profit"));
    expect(frameOf(grid, "titled").querySelector(".sheetwrite-object-fallback")?.textContent).toBe(
      "Profit",
    );
  });

  it("mounts through the renderer, resizes only on size changes and disposes on removal", () => {
    const calls: string[] = [];
    setChartRendererFactory(() => ({
      mount(host, ref, size) {
        calls.push(`mount ${ref.sheet}/${ref.id} ${size.width}x${size.height}`);
        host.textContent = "drawn";
        return {
          resize: (width, height) => calls.push(`resize ${ref.id} ${width}x${height}`),
          dispose: () => calls.push(`dispose ${ref.id}`),
        };
      },
      dispose: () => calls.push("renderer dispose"),
    }));
    const grid = mountGrid();
    grid.setChart("s1", chart("c1"));
    expect(frameOf(grid, "c1").querySelector(".sheetwrite-object-fallback")).toBeNull();
    expect(calls).toEqual(["mount s1/c1 200x100"]);

    scrollTo(grid, ROW_HEIGHT, 20);
    drag(frameOf(grid, "c1"), 10, 0);
    expect(calls).toEqual(["mount s1/c1 200x100"]);

    grid.setZoom(2);
    expect(calls.at(-1)).toBe("resize c1 400x200");

    grid.removeChart("s1", "c1");
    expect(calls.at(-1)).toBe("dispose c1");
    expect(hostOf(grid).querySelector(".sheetwrite-object")).toBeNull();
  });

  it("unmounts on sheet switch and mounts the charts of the new sheet", () => {
    const disposed: string[] = [];
    setChartRendererFactory(() => ({
      mount: (_host, ref) => ({ resize() {}, dispose: () => disposed.push(ref.id) }),
      dispose() {},
    }));
    const grid = mountGrid({}, twoSheetWorkbook());
    grid.setChart("s1", chart("first"));
    grid.setChart("s2", chart("second"));
    grid.selectChart("s1", "first");
    const selected: Array<ChartRef | null> = [];
    grid.on("chart-select", (event) => selected.push(event));

    grid.setActiveSheet("s2");
    expect(disposed).toEqual(["first"]);
    expect(selected).toEqual([null]);
    expect(hostOf(grid).querySelector('[data-chart-id="first"]')).toBeNull();
    expect(placement(frameOf(grid, "second"))).toMatchObject({ x: NAME_WIDTH + 10 });

    grid.selectChart("s1", "first");
    expect(grid.getActiveSheet()).toBe("s1");
    expect(selected.at(-1)).toEqual({ sheet: "s1", id: "first" });
  });
});

describe("side panel host", () => {
  it("shrinks the viewport while a panel is open and returns focus on close", () => {
    const grid = mountGrid();
    const viewport = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-viewport");
    const panelHost = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-panel-host");
    if (!viewport || !panelHost) throw new Error("expected the viewport and the panel host");
    let cleanups = 0;

    grid.openPanel({
      title: "Chart",
      render(body) {
        const input = document.createElement("input");
        body.appendChild(input);
        return () => (cleanups += 1);
      },
    });
    expect(panelHost.hidden).toBe(false);
    expect(viewport.style.right).toBe(`${panelHost.style.width}`);
    panelHost.querySelector("input")?.focus();

    grid.openPanel(null);
    expect(cleanups).toBe(1);
    expect(panelHost.hidden).toBe(true);
    expect(viewport.style.right).toBe("0px");
    expect(document.activeElement).toBe(hostOf(grid));
  });

  it("keeps the panel host between the toolbar and the tab bar after a config change", () => {
    const grid = mountGrid();
    grid.setConfig({ tabs: true });
    const viewport = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-viewport");
    const panelHost = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-panel-host");
    if (!viewport || !panelHost) throw new Error("expected the viewport and the panel host");

    expect(viewport.style.bottom).not.toBe("0px");
    expect(panelHost.style.bottom).toBe(viewport.style.bottom);
    expect(panelHost.style.top).toBe(viewport.style.top);
  });
});

describe("object layer shortcuts", () => {
  it("keeps cell shortcuts away from the cells, but lets undo through", () => {
    const grid = mountGrid();
    const addr = { sheet: "s1", row: 0, col: 0 };
    grid.setSelection({ kind: "cell", addr });
    grid.setChart("s1", chart("c1"));
    grid.selectChart("s1", "c1");
    const frame = frameOf(grid, "c1");
    frame.focus();

    // Ctrl+Space would select the column behind the chart, as Ctrl+X would cut it.
    const selection = grid.getSelection();
    frame.dispatchEvent(new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true }));
    expect(grid.getSelection()).toEqual(selection);

    press(frame, "ArrowRight");
    frame.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(anchorOf(grid, "c1")).toEqual(chart("c1").anchor);
  });
});
