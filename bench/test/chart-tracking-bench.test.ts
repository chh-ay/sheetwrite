import { expect, it } from "bun:test";

import { checkChartEvents } from "../src/chart-tracking-bench.js";

it("rejects missing, extra, duplicate and unrelated chart notifications", () => {
  const expected = [{ sheet: "charts0", id: "chart0" }];
  const once = [{ epoch: 1, charts: expected }];
  for (const [events, charts, error] of [
    [[], expected, "Expected one chart event"],
    [once, [], "Incorrect chart identities"],
    [[{ epoch: 1, charts: [...expected, ...expected] }], expected, "Incorrect chart identities"],
    [
      [{ epoch: 1, charts: [{ sheet: "charts1", id: "chart0" }] }],
      expected,
      "Incorrect chart identities",
    ],
    [[...once, { epoch: 2, charts: expected }], expected, "Expected at most one chart event"],
  ] as const) {
    expect(() => checkChartEvents(events, charts)).toThrow(error);
  }
});

it("accepts a conservative superset only when the row permits it", () => {
  const required = [{ sheet: "charts0", id: "chart0" }];
  const allowed = [...required, { sheet: "charts0", id: "chart1" }];
  const events = [{ epoch: 1, charts: allowed }];
  expect(checkChartEvents(events, required, allowed)).toBe(2);
  expect(() => checkChartEvents(events, required)).toThrow("Incorrect chart identities");
  expect(checkChartEvents([], [], allowed)).toBe(0);
});
