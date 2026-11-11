import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { getNumberFormatResourceStatsForTest } from "../src/number-format.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Workbook } from "../src/types.js";
import { makeColumnarData, scrollerOf } from "./fixtures.js";

const ROWS = 4_000;
const originalRaf = globalThis.requestAnimationFrame;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let restoreStubs: () => void;
let drawnText: string[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  drawnText = [];

  // Record the text that the canvas draws, so a test can compare the visible
  // output before and after a trim.
  const stubbedGetContext = HTMLCanvasElement.prototype.getContext;
  const recordingGetContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const context: unknown = Reflect.apply(stubbedGetContext, this, args);
    if (typeof context !== "object" || context === null) return context;

    return new Proxy(context, {
      get(target, property) {
        if (property === "fillText") return (text: string) => drawnText.push(text);
        return Reflect.get(target, property);
      },
      set(target, property, value) {
        return Reflect.set(target, property, value);
      },
    });
  };
  HTMLCanvasElement.prototype.getContext =
    recordingGetContext as typeof HTMLCanvasElement.prototype.getContext;

  // Scheduled frames run at once, so the frame after a trim is observable.
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
});

function formattedWorkbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount: ROWS,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          {
            key: "amount",
            header: "Amount",
            width: 120,
            type: "number",
            numberFormat: "#,##0.00",
          },
          { key: "city", header: "City", width: 140, type: "text" },
        ],
      },
    ],
  };
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

function scrollTo(host: HTMLElement, top: number): void {
  const scroller = scrollerOf(host);
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
}

function stringCacheEntries(grid: GridImpl): number {
  const snapshot = grid.getRuntimeResourceSnapshot("scroll", "settled");
  const owner = snapshot.jsOwners.find((entry) => entry.owner === "js.window.string-cache");
  if (!owner) throw new Error("the window string cache reports no owner entry");

  return owner.entries;
}

function overlayDivs(host: HTMLElement): HTMLElement[] {
  const overlay = host.querySelector(".sheetwrite-overlay");
  if (!(overlay instanceof HTMLElement)) throw new Error("expected selection overlay");

  return [...overlay.children].filter((node) => node instanceof HTMLElement);
}

describe("Grid.trimMemory", () => {
  it("drops rebuildable caches and keeps document data and the drawn text", () => {
    const workbook = formattedWorkbook();
    const store = new SheetwriteStore(workbook, makeColumnarData(ROWS));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    // Scroll through the sheet, so the caches hold many windows of strings.
    for (let row = 0; row < ROWS; row += 50) scrollTo(host, row * 28);
    drawnText = [];
    scrollTo(host, 1_000 * 28);
    const drawnBefore = [...drawnText];
    const snapshotBefore = JSON.stringify(store.exportSnapshot());
    const cachedStringsBefore = stringCacheEntries(grid);
    const numberTextBefore = getNumberFormatResourceStatsForTest().numberTextEntries;

    drawnText = [];
    grid.trimMemory();

    expect(drawnText).toEqual(drawnBefore);
    expect(drawnBefore).toContain("Customer 1000");
    expect(drawnBefore).toContain("10,000.50");
    expect(JSON.stringify(store.exportSnapshot())).toBe(snapshotBefore);
    // Only the strings of the window painted after the trim are cached again.
    expect(cachedStringsBefore).toBeGreaterThan(1_000);
    expect(stringCacheEntries(grid)).toBeLessThan(cachedStringsBefore / 10);
    expect(numberTextBefore).toBeGreaterThan(100);
    expect(getNumberFormatResourceStatsForTest().numberTextEntries).toBeLessThan(
      numberTextBefore / 2,
    );

    grid.destroy();
  });

  it("removes hidden overlay nodes and keeps the shown ones", () => {
    const workbook = formattedWorkbook();
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, data: makeColumnarData(ROWS) });
    // Three columns of the first ten rows are on screen.
    const ranges = Array.from({ length: 30 }, (_, index) => ({
      sheet: "s1",
      start: { row: Math.floor(index / 3), col: index % 3 },
      end: { row: Math.floor(index / 3), col: index % 3 },
    }));
    grid.highlightCells(ranges, "#ff000033");
    grid.highlightCells(ranges.slice(0, 2), "#ff000033");
    const shownBefore = overlayDivs(host).filter((node) => node.style.display !== "none");
    expect(overlayDivs(host).length).toBeGreaterThanOrEqual(shownBefore.length + 28);

    grid.trimMemory();

    expect(overlayDivs(host)).toEqual(shownBefore);
    grid.destroy();
  });
});
