import { expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkChartEvents, type ChartTrackingArtifact } from "../src/chart-tracking-bench.js";

const CHART_COUNT = 200;
const SMOKE_ITERATIONS = 5;

it("rejects missing, extra, duplicate and unrelated chart notifications", () => {
  const expected = [{ sheet: "charts0", id: "chart0" }];
  for (const [events, charts, error] of [
    [[], expected, "Expected 1 chart events"],
    [[{ epoch: 1, charts: expected }], [], "Expected 0 chart events"],
    [[{ epoch: 1, charts: [...expected, ...expected] }], expected, "Incorrect chart identities"],
    [
      [{ epoch: 1, charts: [{ sheet: "charts1", id: "chart0" }] }],
      expected,
      "Incorrect chart identities",
    ],
    [
      [
        { epoch: 1, charts: expected },
        { epoch: 2, charts: expected },
      ],
      expected,
      "Expected 1 chart events",
    ],
  ] as const) {
    expect(() => checkChartEvents(events, charts)).toThrow(error);
  }
});

// This test captures real commits; invoke the test suite through bench-run --slot 4.
it("admits the largest fixtures before stamping checked literal and formula smoke evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sheetwrite-chart-bench-"));
  const output = join(directory, "chart-tracking-results.json");
  let artifact: ChartTrackingArtifact;
  try {
    // A fresh process selects the full engine without changing other suites' singleton.
    const script = new URL("../src/chart-tracking-bench.ts", import.meta.url).pathname;
    const child = Bun.spawn([process.execPath, script, "--smoke", "--output", output], {
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();
    if ((await child.exited) !== 0) throw new Error(`Chart smoke capture failed: ${stderr}`);
    artifact = JSON.parse(readFileSync(output, "utf8")) as ChartTrackingArtifact;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  expect(artifact).toMatchObject({
    schemaVersion: 1,
    protocol: "sheetwrite-chart-tracking-v2",
    mode: "smoke",
    meta: { memoryMax: process.env.BENCH_MEMORY_MAX ?? "6G" },
  });
  expect(artifact.meta.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(Number.isFinite(Date.parse(artifact.meta.timestamp))).toBe(true);
  // [source, scenario, expected events, expected charts and resolutions per commit]
  expect(
    artifact.rows.map((row) => [
      row.source,
      row.scenario,
      row.expectedEvents,
      row.expectedCharts,
      row.resolutionsPerCommit,
    ]),
  ).toEqual([
    ["literal", "outside", 0, 0, 0],
    ["literal", "inside", 1, 1, 1],
    ["formula", "outside", 1, CHART_COUNT, CHART_COUNT],
    ["formula", "literal-dependency-edit", 1, CHART_COUNT, CHART_COUNT],
  ]);
  for (const row of artifact.rows) {
    expect(row.chartCount).toBe(CHART_COUNT);
    expect(row.eventMs === null).toBe(row.expectedEvents === 0);
    expect([row.commitMs.iters, row.baselineMs.iters]).toEqual([
      SMOKE_ITERATIONS,
      SMOKE_ITERATIONS,
    ]);
    for (const stats of [row.commitMs, row.baselineMs, ...(row.eventMs ? [row.eventMs] : [])]) {
      expect(Number.isFinite(stats.median)).toBe(true);
      expect(stats.median).toBeGreaterThanOrEqual(0);
      expect(stats.p95).toBeGreaterThanOrEqual(stats.median);
    }
  }
});
