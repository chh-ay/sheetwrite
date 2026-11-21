import { describe, expect, it } from "bun:test";

import { OffsetIndex, ScaledScroll } from "../src/fenwick.js";

const DEFAULT_HEIGHT = 28;

/** Check every answer of `index` against plain per-row `heights`. */
function expectHeights(index: OffsetIndex, heights: readonly number[]): void {
  expect(index.count).toBe(heights.length);
  let top = 0;
  for (let row = 0; row < heights.length; row++) {
    const height = heights[row]!;
    expect(index.heightOf(row)).toBe(height);
    expect(index.offsetOf(row)).toBe(top);
    if (height > 0) {
      // Offset 0 is row 0 even when rows above `row` have no height.
      if (top > 0) expect(index.rowAtOffset(top)).toEqual({ row, top });
      expect(index.rowAtOffset(top + height / 2)).toEqual({ row, top });
      expect(index.rowAtOffset(top + height - 0.25)).toEqual({ row, top });
    }
    top += height;
  }
  expect(index.offsetOf(heights.length)).toBe(top);
  expect(index.totalHeight).toBe(top);
  if (heights.length > 0) {
    const last = heights.length - 1;
    expect(index.rowAtOffset(top + 5)).toEqual({ row: last, top: top - heights[last]! });
  }
}

/** Deterministic pseudo-random integers in [0, bound). */
function sequence(seed: number): (bound: number) => number {
  let state = seed >>> 0;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % bound;
  };
}

describe("OffsetIndex", () => {
  it("keeps an unresized sheet arithmetic without a backing store", () => {
    const index = new OffsetIndex(1_000_000, DEFAULT_HEIGHT);
    expect(index.backingStoreBytes).toBe(0);
    expect(index.offsetOf(500_000)).toBe(500_000 * DEFAULT_HEIGHT);
    expect(index.rowAtOffset(500_000 * DEFAULT_HEIGHT + 3)).toEqual({
      row: 500_000,
      top: 500_000 * DEFAULT_HEIGHT,
    });
    expectHeights(new OffsetIndex(5, DEFAULT_HEIGHT), Array(5).fill(DEFAULT_HEIGHT));
    // Rows outside the sheet, negative or fractional, are ignored.
    index.setHeight(-1, 50);
    index.setHeight(2.5, 50);
    expect(index.backingStoreBytes).toBe(0);
  });

  it("answers an empty sheet without rows", () => {
    const index = new OffsetIndex(0, DEFAULT_HEIGHT);
    index.setHeight(0, 40);
    expect(index.totalHeight).toBe(0);
    expect(index.offsetOf(3)).toBe(0);
    expect(index.rowAtOffset(10)).toEqual({ row: 0, top: 0 });
    expect(index.backingStoreBytes).toBe(0);
  });

  it("keeps the first resize of a million-row sheet to the resized row", () => {
    const rows = 1_000_000;
    const index = new OffsetIndex(rows, DEFAULT_HEIGHT);
    index.setHeight(0, 48);
    expect(index.backingStoreBytes).toBeLessThan(1_024);
    expect(index.offsetOf(1)).toBe(48);
    expect(index.totalHeight).toBe(rows * DEFAULT_HEIGHT + 20);
    expect(index.rowAtOffset(index.totalHeight - 1)).toEqual({
      row: rows - 1,
      top: index.totalHeight - DEFAULT_HEIGHT,
    });
    index.setHeight(0, DEFAULT_HEIGHT);
    expect(index.backingStoreBytes).toBe(0);
    expect(index.totalHeight).toBe(rows * DEFAULT_HEIGHT);
  });

  it("matches per-row heights through random resizes and batches", () => {
    const next = sequence(0x5eed);
    const choices = [DEFAULT_HEIGHT, DEFAULT_HEIGHT, 0, 14, 40, 90, 13.5];
    const heights = Array<number>(300).fill(DEFAULT_HEIGHT);
    const index = new OffsetIndex(heights.length, DEFAULT_HEIGHT);
    for (let round = 0; round < 60; round++) {
      if (round % 3 === 2) {
        const rows = [...new Set(Array.from({ length: 1 + next(40) }, () => next(300)))].sort(
          (a, b) => a - b,
        );
        const batch = rows.map(() => choices[next(choices.length)]!);
        index.setHeights(rows, batch);
        rows.forEach((row, position) => {
          heights[row] = batch[position]!;
        });
      } else {
        for (let step = 0; step < 10; step++) {
          const row = next(300);
          const height = choices[next(choices.length)]!;
          index.setHeight(row, height);
          heights[row] = height;
        }
      }
      expectHeights(index, heights);
    }
  });

  it("loads sorted rows into an empty index, skipping rows at the default", () => {
    const heights = Array<number>(10).fill(DEFAULT_HEIGHT);
    const index = new OffsetIndex(heights.length, DEFAULT_HEIGHT);
    index.load(Int32Array.of(0, 3, 7, 9), Float64Array.of(40, DEFAULT_HEIGHT, 50, 12));
    heights[0] = 40;
    heights[7] = 50;
    heights[9] = 12;
    expectHeights(index, heights);
    index.load(Int32Array.of(1, 7), Float64Array.of(33, DEFAULT_HEIGHT));
    heights[1] = 33;
    heights[7] = DEFAULT_HEIGHT;
    expectHeights(index, heights);
  });

  it("answers heights and the total between single-row resizes without a read", () => {
    const heights = Array<number>(2_000).fill(DEFAULT_HEIGHT);
    const index = new OffsetIndex(heights.length, DEFAULT_HEIGHT);
    let total = heights.length * DEFAULT_HEIGHT;
    for (let row = heights.length - 1; row >= 0; row -= 2) {
      const height = 20 + (row % 9);
      index.setHeight(row, height);
      total += height - heights[row]!;
      heights[row] = height;
      expect(index.heightOf(row)).toBe(height);
      expect(index.totalHeight).toBe(total);
    }
    index.setHeight(1_999, 70);
    index.setHeight(1_999, DEFAULT_HEIGHT);
    index.setHeight(3, DEFAULT_HEIGHT);
    index.setHeight(3, 44);
    heights[1_999] = DEFAULT_HEIGHT;
    heights[3] = 44;
    expectHeights(index, heights);
    for (let row = 0; row < heights.length; row += 3) {
      index.setHeight(row, DEFAULT_HEIGHT);
      heights[row] = DEFAULT_HEIGHT;
    }
    index.setHeight(10, 90);
    heights[10] = 90;
    expectHeights(index, heights);
    for (let row = 0; row < heights.length; row++) index.setHeight(row, DEFAULT_HEIGHT);
    expectHeights(index, Array(heights.length).fill(DEFAULT_HEIGHT));
    expect(index.backingStoreBytes).toBe(0);
  });
});

describe("ScaledScroll", () => {
  it("re-engages scaling when the measured cap drops below the content height", () => {
    // A browser-zoom change shrinks the layout clamp mid-session: 30M px of
    // content fit under a 33M cap (identity) but not under the ~26.8M clamp
    // Chromium applies at 125% zoom. The remap must expose the full range.
    const total = 30_000_000;
    const viewport = 600;
    const s = new ScaledScroll(total, viewport, 33_000_000);
    expect(s.scaled).toBe(false);
    expect(s.sizerHeight).toBe(total);

    const zoomedCap = 26_843_545;
    s.update(total, viewport, zoomedCap);
    expect(s.scaled).toBe(true);
    expect(s.sizerHeight).toBe(zoomedCap);
    // The last row stays reachable at the clamped maximum scroll position.
    expect(s.toContent(zoomedCap - viewport)).toBeCloseTo(total - viewport, 5);
    expect(s.toScroll(s.toContent(600))).toBeCloseTo(600, 5);
  });
});
