import { expect, test } from "bun:test";

import { lookupGate } from "../src/view-index-bench.js";

// One CI smoke run, five runs per engine. The Map run medians stayed at
// 32.6–32.9 ns, but the p95s of the same Map lookup ranged from 47 to 89 ns:
// on a shared runner, a p95 measures the runner's neighbours, not the lookup.
const MAP = [
  { lookupMedianNs: 32.8, lookupP95Ns: 49.09 },
  { lookupMedianNs: 32.86, lookupP95Ns: 46.76 },
  { lookupMedianNs: 32.62, lookupP95Ns: 47.75 },
  { lookupMedianNs: 32.78, lookupP95Ns: 89.19 },
  { lookupMedianNs: 32.79, lookupP95Ns: 83.23 },
];
const PACKED = [
  { lookupMedianNs: 22.68, lookupP95Ns: 77.39 },
  { lookupMedianNs: 22.57, lookupP95Ns: 73.43 },
  { lookupMedianNs: 31.24, lookupP95Ns: 47.6 },
  { lookupMedianNs: 22.16, lookupP95Ns: 75.66 },
  { lookupMedianNs: 24.76, lookupP95Ns: 53.0 },
];

test("the smoke gates best medians, so a shared runner's p95 cannot fail it; a full run keeps p95", () => {
  expect(lookupGate("smoke", MAP, PACKED)).toEqual({
    name: "lookupBestMedian",
    regression: 22.16 / 32.62 - 1,
    passed: true,
  });
  expect(lookupGate("full", MAP, PACKED)).toEqual({
    name: "lookupP95",
    regression: 73.43 / 49.09 - 1,
    passed: false,
  });
  // The smoke still fails a packed lookup that does twice its work.
  const slowed = PACKED.map((run) => ({
    lookupMedianNs: run.lookupMedianNs * 2,
    lookupP95Ns: run.lookupP95Ns * 2,
  }));
  expect(lookupGate("smoke", MAP, slowed).passed).toBe(false);
});
