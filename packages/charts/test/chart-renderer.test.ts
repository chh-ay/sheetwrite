import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore, subscribeChartChanges } from "@sheetwrite/core";

import { createChartRenderer } from "../src/chart-renderer.js";
import { chartWorkbook, NOTES, SALES, setCell } from "./fixtures.js";

/** Animation frames that run only when the test runs them. */
const pendingFrames = new Map<number, FrameRequestCallback>();
const { requestAnimationFrame, cancelAnimationFrame } = window;
const SIZE = { width: 320, height: 200 };

beforeAll(async () => {
  await initSheetwrite();
  let nextFrame = 1;
  window.requestAnimationFrame = (callback) => {
    pendingFrames.set(nextFrame, callback);
    return nextFrame++;
  };
  window.cancelAnimationFrame = (id) => pendingFrames.delete(id);
});

afterAll(() => {
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
});

// A failed test can leave frames behind; the next test starts with none.
afterEach(() => pendingFrames.clear());

it("redraws once per frame for a burst of changes to its chart", () => {
  const store = new SheetwriteStore(chartWorkbook());
  const renderer = createChartRenderer(store);
  const host = document.createElement("div");
  renderer.mount(host, SALES, SIZE);
  let changes = 0;
  const stopCounting = subscribeChartChanges(store, () => {
    changes += 1;
  });

  setCell(store, 0, 0, 4);
  setCell(store, 1, 0, 5);
  setCell(store, 2, 0, 6);
  stopCounting();

  // Each edit is its own chart change, so one pending frame proves the renderer coalesced them.
  expect([changes, pendingFrames.size]).toEqual([3, 1]);
  renderer.dispose();
  store.dispose();
});

it("redraws at a new size once per frame, ignores other charts' data, and stops when disposed", () => {
  const store = new SheetwriteStore(chartWorkbook());
  const renderer = createChartRenderer(store);
  const host = document.createElement("div");
  const chart = renderer.mount(host, SALES, SIZE);

  setCell(store, 0, 1, 7);
  chart.resize(320, 200);
  expect(pendingFrames.size).toBe(0);
  chart.resize(400, 240);
  chart.resize(480, 260);
  expect(pendingFrames.size).toBe(1);
  for (const callback of pendingFrames.values()) callback(performance.now());
  pendingFrames.clear();
  const svg = host.querySelector("svg");
  expect([svg?.getAttribute("width"), svg?.getAttribute("height")]).toEqual(["480", "260"]);

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
  store.dispose();
});
