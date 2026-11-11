import { expect, test } from "bun:test";

import {
  counterbalancedOrder,
  median,
  medianOfSorted,
  nearestRankPercentile,
  quantile,
  summarizeFinite,
  upperMedian,
} from "../src/stats.js";

test("summarizes odd and even sample sizes", () => {
  expect(summarizeFinite([1, 3, 5])).toMatchObject({ median: 3, p95: 4.8, mad: 2, iters: 3 });
  expect(summarizeFinite([1, 2, 3, 4])).toMatchObject({ median: 2.5, mad: 1, iters: 4 });
  expect(summarizeFinite([1, 2, 3, 4]).p95).toBeCloseTo(3.85);
});

// Recorded protocols keep these rules; the order statistics return a value from the sample.
test.each([
  // An unsorted even sample whose middle values differ: picking either one is wrong.
  ["median of two", median([3, 1]), 2],
  ["median of four", median([8, 1, 4, 2]), 3],
  ["median of three", median([5, 1, 3]), 3],
  ["empty median", median([]), Number.NaN],
  ["sorted median", medianOfSorted([1, 2, 4, 8]), 3],
  ["interpolated quantile", quantile([9, 1, 5, 3, 7], 0.1), 1.8],
  ["summary p95 rule", quantile([9, 1, 5, 3, 7], 0.95), summarizeFinite([9, 1, 5, 3, 7]).p95],
  ["upper median", upperMedian([8, 1, 4, 2]), 4],
  ["empty upper median", upperMedian([]), Number.NaN],
  ["nearest-rank p95", nearestRankPercentile([9, 1, 5, 3, 7], 0.95), 9],
  ["nearest-rank p50", nearestRankPercentile([9, 1, 5, 3, 7], 0.5), 5],
  ["nearest-rank even p50", nearestRankPercentile([4, 2], 0.5), 2],
])("%s", (_rule, actual, expected) => {
  if (Number.isNaN(expected)) expect(actual).toBeNaN();
  else expect(actual).toBeCloseTo(expected);
});

test("balances three engines across positions while retaining seed sensitivity", () => {
  const engines = ["sheetwrite", "handsontable", "third-party"] as const;
  const orders = [1, 2].map((seed) => counterbalancedOrder(engines, engines.length * 2, seed));
  for (const seededOrders of orders) {
    expect(seededOrders).toHaveLength(6);
    for (let position = 0; position < engines.length; position++) {
      const counts = engines.map(
        (engine) => seededOrders.filter((order) => order[position] === engine).length,
      );
      expect(counts).toEqual([2, 2, 2]);
    }
  }
  expect(orders[0]?.[0]).not.toEqual(orders[1]?.[0]);
});
