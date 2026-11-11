import { expect, it } from "bun:test";

import { checkChartEvents } from "../src/chart-tracking-bench.js";

it("rejects missing, extra, duplicate and unrelated chart notifications", () => {
  const expected = [{ sheet: "charts0", id: "chart0" }];
  const once = [{ epoch: 1, charts: expected }];
  for (const [events, charts, error] of [
    [[], expected, "Expected 1 chart events"],
    [once, [], "Expected 0 chart events"],
    [[{ epoch: 1, charts: [...expected, ...expected] }], expected, "Incorrect chart identities"],
    [
      [{ epoch: 1, charts: [{ sheet: "charts1", id: "chart0" }] }],
      expected,
      "Incorrect chart identities",
    ],
    [[...once, { epoch: 2, charts: expected }], expected, "Expected 1 chart events"],
  ] as const) {
    expect(() => checkChartEvents(events, charts)).toThrow(error);
  }
});
