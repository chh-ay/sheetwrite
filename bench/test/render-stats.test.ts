import { describe, expect, test } from "bun:test";

import {
  counterbalancedOrder,
  median,
  medianOfSorted,
  nearestRankPercentile,
  quantile,
  summarizeFinite,
  upperMedian,
} from "../src/stats.js";

describe("auditable render statistics", () => {
  test("summarizes odd and even sample sizes", () => {
    const odd = summarizeFinite([1, 3, 5]);
    expect(odd.median).toBe(3);
    expect(odd.p95).toBeCloseTo(4.8);
    expect(odd.mad).toBe(2);
    expect(odd.iters).toBe(3);

    const even = summarizeFinite([1, 2, 3, 4]);
    expect(even.median).toBe(2.5);
    expect(even.p95).toBeCloseTo(3.85);
    expect(even.mad).toBe(1);
    expect(even.iters).toBe(4);
  });

  test("takes the mean of the two middle values of an even sample", () => {
    // An unsorted sample whose two middle values differ: picking either one is wrong.
    expect(median([3, 1])).toBe(2);
    expect(median([8, 1, 4, 2])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNaN();
  });

  test("interpolates quantiles with the rule of the summary p95", () => {
    const sample = [9, 1, 5, 3, 7];
    expect(quantile(sample, 0.95)).toBe(summarizeFinite(sample).p95);
    expect(quantile(sample, 0.1)).toBeCloseTo(1.8);
    expect(medianOfSorted([1, 2, 4, 8])).toBe(median([8, 1, 4, 2]));
  });

  // Recorded protocols keep these rules; each returns a value from the sample.
  test("keeps the order-statistic rules distinct from the median and quantile", () => {
    expect(upperMedian([8, 1, 4, 2])).toBe(4);
    expect(upperMedian([])).toBeNaN();
    expect(nearestRankPercentile([9, 1, 5, 3, 7], 0.95)).toBe(9);
    expect(nearestRankPercentile([9, 1, 5, 3, 7], 0.5)).toBe(5);
    expect(nearestRankPercentile([4, 2], 0.5)).toBe(2);
  });

  test("balances three engines across positions while retaining seed sensitivity", () => {
    const engines = ["sheetwrite", "handsontable", "third-party"] as const;
    const orders = [1, 2].map((seed) => counterbalancedOrder(engines, engines.length * 2, seed));

    for (const seededOrders of orders) {
      expect(seededOrders).toHaveLength(6);
      for (let position = 0; position < engines.length; position++) {
        const counts = new Map(engines.map((engine) => [engine, 0]));
        for (const order of seededOrders) {
          const engine = order[position]!;
          counts.set(engine, counts.get(engine)! + 1);
        }
        expect([...counts.values()]).toEqual([2, 2, 2]);
      }
    }
    expect(orders[0]![0]).not.toEqual(orders[1]![0]);
  });
});
