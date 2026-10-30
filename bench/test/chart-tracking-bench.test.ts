import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkChartEvents, type ChartTrackingArtifact } from "../src/chart-tracking-bench.js";

// This test captures real commits; invoke the test suite through bench-run --slot 4.
describe("chart tracking evidence", () => {
  it("rejects missing, extra, duplicate and unrelated chart notifications", () => {
    const expected = [{ sheet: "charts0", id: "chart0" }];
    expect(() => checkChartEvents([], expected)).toThrow("Expected 1 chart events");
    expect(() => checkChartEvents([{ epoch: 1, charts: expected }], [])).toThrow(
      "Expected 0 chart events",
    );
    expect(() =>
      checkChartEvents([{ epoch: 1, charts: [...expected, ...expected] }], expected),
    ).toThrow("Incorrect chart identities");
    expect(() =>
      checkChartEvents([{ epoch: 1, charts: [{ sheet: "charts1", id: "chart0" }] }], expected),
    ).toThrow("Incorrect chart identities");
    expect(() =>
      checkChartEvents(
        [
          { epoch: 1, charts: expected },
          { epoch: 2, charts: expected },
        ],
        expected,
      ),
    ).toThrow("Expected 1 chart events");
  });

  it("admits the largest fixtures before stamping checked literal and formula smoke evidence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sheetwrite-chart-bench-"));
    const output = join(directory, "chart-tracking-results.json");
    let artifact: ChartTrackingArtifact;
    try {
      // A fresh process selects the full engine without changing other suites' singleton.
      const child = Bun.spawn(
        [
          process.execPath,
          new URL("../src/chart-tracking-bench.ts", import.meta.url).pathname,
          "--smoke",
          "--output",
          output,
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      const stderr = await new Response(child.stderr).text();
      const exitCode = await child.exited;
      if (exitCode !== 0) throw new Error(`Chart smoke capture failed: ${stderr}`);
      artifact = JSON.parse(readFileSync(output, "utf8")) as ChartTrackingArtifact;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.protocol).toBe("sheetwrite-chart-tracking-v2");
    expect(artifact.mode).toBe("smoke");
    expect(artifact.meta.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(artifact.meta.memoryMax).toBe(process.env.BENCH_MEMORY_MAX ?? "6G");
    expect(Number.isFinite(Date.parse(artifact.meta.timestamp))).toBe(true);
    expect(
      artifact.rows.map(
        ({ source, scenario, expectedEvents, expectedCharts, resolutionsPerCommit }) => ({
          source,
          scenario,
          expectedEvents,
          expectedCharts,
          resolutionsPerCommit,
        }),
      ),
    ).toEqual([
      {
        source: "literal",
        scenario: "outside",
        expectedEvents: 0,
        expectedCharts: 0,
        resolutionsPerCommit: 0,
      },
      {
        source: "literal",
        scenario: "inside",
        expectedEvents: 1,
        expectedCharts: 1,
        resolutionsPerCommit: 1,
      },
      {
        source: "formula",
        scenario: "outside",
        expectedEvents: 1,
        expectedCharts: 200,
        resolutionsPerCommit: 200,
      },
      {
        source: "formula",
        scenario: "literal-dependency-edit",
        expectedEvents: 1,
        expectedCharts: 200,
        resolutionsPerCommit: 200,
      },
    ]);

    for (const row of artifact.rows) {
      expect(row.chartCount).toBe(200);
      expect(row.commitMs.iters).toBe(5);
      expect(row.baselineMs.iters).toBe(5);
      for (const stats of [
        row.commitMs,
        row.baselineMs,
        ...(row.eventMs === null ? [] : [row.eventMs]),
      ]) {
        expect(Number.isFinite(stats.median)).toBe(true);
        expect(stats.median).toBeGreaterThanOrEqual(0);
        expect(stats.p95).toBeGreaterThanOrEqual(stats.median);
      }
      expect(row.eventMs === null).toBe(row.expectedEvents === 0);
    }
  });
});
