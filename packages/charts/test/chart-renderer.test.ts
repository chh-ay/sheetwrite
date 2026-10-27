import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore, type Workbook } from "@sheetwrite/core";

import { createChartRenderer } from "../src/chart-renderer.js";
import { chartWorkbook, SALES, setCell } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** Animation frames that run only when a test calls `runFrames`. */
let pendingFrames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let restoreFrames = (): void => {};

beforeEach(() => {
  const requestFrame = window.requestAnimationFrame;
  const cancelFrame = window.cancelAnimationFrame;
  pendingFrames = new Map();
  window.requestAnimationFrame = (callback) => {
    const id = nextFrame;
    nextFrame += 1;
    pendingFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    pendingFrames.delete(id);
  };
  restoreFrames = () => {
    window.requestAnimationFrame = requestFrame;
    window.cancelAnimationFrame = cancelFrame;
  };
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  restoreFrames();
  for (const store of stores.splice(0)) store.dispose();
});

function runFrames(): void {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  for (const callback of callbacks) callback(performance.now());
}

/** `chartWorkbook` plus a second chart, `NOTES`, that reads only column B. */
const NOTES = { sheet: "s", id: "notes" };

function twoChartWorkbook(): Workbook {
  const workbook = chartWorkbook();
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("chartWorkbook has no sheet");
  sheet.charts = [
    ...(sheet.charts ?? []),
    {
      id: NOTES.id,
      kind: "line",
      anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 320, height: 200 },
      series: [
        {
          name: "Note",
          values: { sheet: "s", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
        },
      ],
    },
  ];
  return workbook;
}

function openStore(): SheetwriteStore {
  const store = new SheetwriteStore(twoChartWorkbook());
  stores.push(store);
  return store;
}

function bars(host: HTMLElement): number {
  return host.querySelectorAll(".sheetwrite-chart-bar").length;
}

describe("createChartRenderer", () => {
  it("draws the chart when it mounts", () => {
    const store = openStore();
    setCell(store, 0, 0, 4);
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");

    renderer.mount(host, SALES, { width: 320, height: 200 });

    expect(host.querySelector("svg")?.getAttribute("width")).toBe("320");
    expect(bars(host)).toBe(1);
    renderer.dispose();
  });

  it("redraws once per frame for a burst of changes to its chart", () => {
    const store = openStore();
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");
    renderer.mount(host, SALES, { width: 320, height: 200 });
    const first = host.querySelector("svg");

    setCell(store, 0, 0, 4);
    setCell(store, 1, 0, 5);
    setCell(store, 2, 0, 6);

    expect(pendingFrames.size).toBe(1);
    expect(host.querySelector("svg")).toBe(first);
    runFrames();
    expect(host.querySelector("svg")).not.toBe(first);
    expect(bars(host)).toBe(3);
    renderer.dispose();
  });

  it("does not redraw when another chart changes", () => {
    const store = openStore();
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");
    renderer.mount(host, SALES, { width: 320, height: 200 });

    setCell(store, 0, 1, 7);

    expect(pendingFrames.size).toBe(0);
    renderer.dispose();
  });

  it("redraws at the new size after a resize", () => {
    const store = openStore();
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");
    const chart = renderer.mount(host, SALES, { width: 320, height: 200 });

    chart.resize(320, 200);
    expect(pendingFrames.size).toBe(0);
    chart.resize(400, 240);
    chart.resize(480, 260);
    expect(pendingFrames.size).toBe(1);
    runFrames();

    expect(host.querySelector("svg")?.getAttribute("width")).toBe("480");
    expect(host.querySelector("svg")?.getAttribute("height")).toBe("260");
    renderer.dispose();
  });

  it("stops listening and drops a pending frame when a chart is disposed", () => {
    const store = openStore();
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");
    const other = document.createElement("div");
    const chart = renderer.mount(host, SALES, { width: 320, height: 200 });
    renderer.mount(other, NOTES, { width: 320, height: 200 });

    setCell(store, 0, 0, 4);
    chart.dispose();

    expect(pendingFrames.size).toBe(0);
    expect(host.childElementCount).toBe(0);
    setCell(store, 1, 0, 5);
    expect(pendingFrames.size).toBe(0);

    // The other chart keeps its own subscription.
    setCell(store, 0, 1, 3);
    expect(pendingFrames.size).toBe(1);
    renderer.dispose();
  });

  it("disposes every mounted chart with the renderer", () => {
    const store = openStore();
    const renderer = createChartRenderer(store);
    const host = document.createElement("div");
    renderer.mount(host, SALES, { width: 320, height: 200 });

    renderer.dispose();
    setCell(store, 0, 0, 4);

    expect(host.childElementCount).toBe(0);
    expect(pendingFrames.size).toBe(0);
  });
});
