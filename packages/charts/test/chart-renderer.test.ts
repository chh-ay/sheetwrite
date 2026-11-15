import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";

import { createChartRenderer } from "../src/chart-renderer.js";
import { chartWorkbook, NOTES, SALES, setCell } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** Animation frames that run only when a test runs them. */
const pendingFrames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const { requestAnimationFrame, cancelAnimationFrame } = window;
const stores: SheetwriteStore[] = [];
const SIZE = { width: 320, height: 200 };

beforeEach(() => {
  pendingFrames.clear();
  window.requestAnimationFrame = (callback) => {
    pendingFrames.set(nextFrame, callback);
    return nextFrame++;
  };
  window.cancelAnimationFrame = (id) => pendingFrames.delete(id);
});

afterEach(() => {
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  for (const store of stores.splice(0)) store.dispose();
});

/** A renderer over `chartWorkbook` with `SALES` mounted in `host`. */
function mountSales() {
  const store = new SheetwriteStore(chartWorkbook());
  stores.push(store);
  const renderer = createChartRenderer(store);
  const host = document.createElement("div");
  return { store, renderer, host, chart: renderer.mount(host, SALES, SIZE) };
}

describe("createChartRenderer", () => {
  it("does not redraw when another chart changes, and redraws at a new size once per frame", () => {
    const { store, renderer, host, chart } = mountSales();

    setCell(store, 0, 1, 7);
    chart.resize(320, 200);
    expect(pendingFrames.size).toBe(0);
    chart.resize(400, 240);
    chart.resize(480, 260);
    expect(pendingFrames.size).toBe(1);
    for (const callback of pendingFrames.values()) callback(performance.now());

    const svg = host.querySelector("svg");
    expect([svg?.getAttribute("width"), svg?.getAttribute("height")]).toEqual(["480", "260"]);
    renderer.dispose();
  });

  it("stops listening and drops a pending frame when a chart is disposed", () => {
    const { store, renderer, host, chart } = mountSales();
    renderer.mount(document.createElement("div"), NOTES, SIZE);

    setCell(store, 0, 0, 4);
    chart.dispose();

    expect([pendingFrames.size, host.childElementCount]).toEqual([0, 0]);
    setCell(store, 1, 0, 5);
    expect(pendingFrames.size).toBe(0);

    // The other chart keeps its own subscription.
    setCell(store, 0, 1, 3);
    expect(pendingFrames.size).toBe(1);
    renderer.dispose();
  });
});
