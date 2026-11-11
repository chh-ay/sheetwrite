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

describe("object layer editing", () => {
  it("moves a chart by drag as one undo step", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");
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

  it("resizes from a corner handle as one undo step", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");
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
    grid.setChart(chart("c1"), "s1");
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
    grid.setChart(chart("c1"), "s1");
    grid.selectChart("c1", "s1");

    press(frameOf(grid, "c1"), "Delete");
    expect(grid.getCharts()).toEqual([]);
    expect(hostOf(grid).querySelector(".sheetwrite-object")).toBeNull();

    grid.undo();
    expect(grid.getCharts()).toEqual([chart("c1")]);
    expect(placement(frameOf(grid, "c1"))).toMatchObject({ x: NAME_WIDTH + 10 });
  });

  it("keeps the chart selected when an undo restores its old position", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");
    grid.selectChart("c1", "s1");
    press(frameOf(grid, "c1"), "ArrowRight");

    grid.undo();

    expect(anchorOf(grid, "c1")).toEqual(chart("c1").anchor);
    expect(frameOf(grid, "c1").getAttribute("aria-current")).toBe("true");
  });

  /** The ids of the open top-level context menu's rows, in order. */
  const menuRows = (grid: GridImpl): string[] => {
    const menu = hostOf(grid).querySelector<HTMLElement>(".sheetwrite-context-menu");
    if (menu?.style.display !== "block") return [];

    return [...menu.querySelectorAll<HTMLElement>("[data-context-menu-item]")].map(
      (row) => row.dataset.contextMenuItem ?? "",
    );
  };

  const rightClick = (target: HTMLElement): MouseEvent => {
    const event = new MouseEvent("contextmenu", {
      clientX: 120,
      clientY: 90,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };

  it("deletes a chart from its context menu as one undo step", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");

    rightClick(frameOf(grid, "c1"));
    hostOf(grid).querySelector<HTMLElement>('[data-context-menu-item="deleteChart"]')?.click();
    expect(grid.getCharts()).toEqual([]);

    grid.undo();
    expect(grid.getCharts()).toEqual([chart("c1")]);
  });

  it("opens the chart menu from the keyboard and gives focus back to the chart on Escape", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");
    grid.selectChart("c1", "s1");
    const frame = frameOf(grid, "c1");
    frame.focus();

    press(frame, "F10", true);
    expect(menuRows(grid)).toEqual(["editChart", "deleteChart"]);
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) throw new Error("expected a focused menu row");
    focused.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(frame);

    press(frame, "ContextMenu");
    expect(menuRows(grid)).toEqual(["editChart", "deleteChart"]);
  });

  it("emits chart-activate on Enter and returns focus to the grid on Escape", () => {
    const grid = mountGrid();
    grid.setChart(chart("c1"), "s1");
    grid.selectChart("c1", "s1");
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

describe("object layer mounting", () => {
  it("uses the active sheet for chart edits and finds the owner for removal, returning transaction outcomes", () => {
    const grid = mountGrid({}, twoSheetWorkbook());
    grid.setActiveSheet("s2");
    expect(grid.setChart(chart("default-owner")).status).toBe("applied");
    expect(grid.getCharts("s1")).toEqual([]);
    expect(grid.getCharts("s2").map((definition) => definition.id)).toEqual(["default-owner"]);
    grid.selectChart("default-owner");
    expect(frameOf(grid, "default-owner").getAttribute("aria-current")).toBe("true");

    grid.setActiveSheet("s1");
    expect(grid.removeChart("default-owner").status).toBe("applied");
    expect(grid.getCharts("s2")).toEqual([]);
    grid.setReadOnly(true);
    expect(grid.setChart(chart("blocked"))).toMatchObject({ status: "noop", reason: "read-only" });
  });
});

describe("object layer shortcuts", () => {
  it("keeps cell shortcuts away from the cells, but lets undo through", () => {
    const grid = mountGrid();
    const addr = { sheet: "s1", row: 0, col: 0 };
    grid.setSelection({ kind: "cell", addr });
    grid.setChart(chart("c1"), "s1");
    grid.selectChart("c1", "s1");
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
