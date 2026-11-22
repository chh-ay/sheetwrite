import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { getNumberFormatResourceStatsForTest } from "../src/number-format.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Workbook } from "../src/types.js";
import { makeColumnarData, scrollerOf } from "./fixtures.js";

const ROWS = 4_000;
const original_raf = globalThis.requestAnimationFrame;
const original_get_context = HTMLCanvasElement.prototype.getContext;
let restore_stubs: () => void;
let drawn_text: string[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
  drawn_text = [];

  // Record the text that the canvas draws, so a test can compare the visible
  // output before and after a trim.
  const stubbed_get_context = HTMLCanvasElement.prototype.getContext;
  const recording_get_context = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const context: unknown = Reflect.apply(stubbed_get_context, this, args);
    if (typeof context !== "object" || context === null) return context;

    return new Proxy(context, {
      get(target, property) {
        if (property === "fillText") return (text: string) => drawn_text.push(text);
        return Reflect.get(target, property);
      },
      set(target, property, value) {
        return Reflect.set(target, property, value);
      },
    });
  };
  HTMLCanvasElement.prototype.getContext =
    recording_get_context as typeof HTMLCanvasElement.prototype.getContext;

  // Scheduled frames run at once, so the frame after a trim is observable.
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original_get_context;
  restore_stubs();
  globalThis.requestAnimationFrame = original_raf;
});

function formatted_workbook(): Workbook {
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

function mount_host(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

function scroll_to(host: HTMLElement, top: number): void {
  const scroller = scrollerOf(host);
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
}

function string_cache_entries(grid: GridImpl): number {
  const snapshot = grid.getRuntimeResourceSnapshot("scroll", "settled");
  const owner = snapshot.jsOwners.find((entry) => entry.owner === "js.window.string-cache");
  if (!owner) throw new Error("the window string cache reports no owner entry");

  return owner.entries;
}

function overlay_divs(host: HTMLElement): HTMLElement[] {
  const overlay = host.querySelector(".sheetwrite-overlay");
  if (!(overlay instanceof HTMLElement)) throw new Error("expected selection overlay");

  return [...overlay.children].filter((node) => node instanceof HTMLElement);
}

describe("Grid.trimMemory", () => {
  it("drops rebuildable caches and keeps document data and the drawn text", () => {
    const workbook = formatted_workbook();
    const store = new SheetwriteStore(workbook, makeColumnarData(ROWS));
    const host = mount_host();
    const grid = new GridImpl(host, { workbook }, store);

    // Scroll through the sheet, so the caches hold many windows of strings.
    for (let row = 0; row < ROWS; row += 50) scroll_to(host, row * 28);
    drawn_text = [];
    scroll_to(host, 1_000 * 28);
    const drawn_before = [...drawn_text];
    const snapshot_before = JSON.stringify(store.exportSnapshot());
    const cached_strings_before = string_cache_entries(grid);
    const number_text_before = getNumberFormatResourceStatsForTest().numberTextEntries;

    drawn_text = [];
    grid.trimMemory();

    expect(drawn_text).toEqual(drawn_before);
    expect(drawn_before).toContain("Customer 1000");
    expect(drawn_before).toContain("10,000.50");
    expect(JSON.stringify(store.exportSnapshot())).toBe(snapshot_before);
    // Only the strings of the window painted after the trim are cached again.
    expect(cached_strings_before).toBeGreaterThan(1_000);
    expect(string_cache_entries(grid)).toBeLessThan(cached_strings_before / 10);
    expect(number_text_before).toBeGreaterThan(100);
    expect(getNumberFormatResourceStatsForTest().numberTextEntries).toBeLessThan(
      number_text_before / 2,
    );

    grid.destroy();
  });

  it("removes hidden overlay nodes and keeps the shown ones", () => {
    const workbook = formatted_workbook();
    const host = mount_host();
    const grid = new GridImpl(host, { workbook, data: makeColumnarData(ROWS) });
    // Three columns of the first ten rows are on screen.
    const ranges = Array.from({ length: 30 }, (_, index) => ({
      sheet: "s1",
      start: { row: Math.floor(index / 3), col: index % 3 },
      end: { row: Math.floor(index / 3), col: index % 3 },
    }));
    grid.highlightCells(ranges, "#ff000033");
    grid.highlightCells(ranges.slice(0, 2), "#ff000033");
    const shown_before = overlay_divs(host).filter((node) => node.style.display !== "none");
    expect(overlay_divs(host).length).toBeGreaterThanOrEqual(shown_before.length + 28);

    grid.trimMemory();

    expect(overlay_divs(host)).toEqual(shown_before);
    grid.destroy();
  });
});
