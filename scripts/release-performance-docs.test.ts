import { expect, it } from "bun:test";

import {
  renderReleaseComparisonSection,
  validateReleaseComparisonArtifact,
} from "./release-performance-docs.js";

const CANDIDATE = "c".repeat(40);

function comparison(
  candidateTimestamp: string | null,
  metrics: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    protocol: "sheetwrite-release-comparison-v1",
    meta: {
      commit: CANDIDATE,
      dirty: false,
      timestamp: "2026-10-30T09:00:00.000Z",
      memoryMax: "8G",
      effectiveCpuAffinityBySuite: { "regression-baseline": "4" },
    },
    captureMetadata: { captureCommit: CANDIDATE, publicationNotes: [] },
    base: { ref: "release/version-0.5.4", commit: "b".repeat(40) },
    candidate: { commit: CANDIDATE, dirty: false },
    suites: [
      {
        artifact: "render-baseline.json",
        status: "compared",
        comparisonLabel: "0.5.4",
        base: { commit: "b".repeat(40), timestamp: "2026-10-28T10:00:00.000Z" },
        candidate: { commit: CANDIDATE, dirty: null, timestamp: candidateTimestamp },
        baselineCapture: { timestamp: "2026-10-28T09:59:00.000Z" },
        candidateCapture: { timestamp: "2026-10-29T04:00:00.000Z" },
        threshold: { kind: "noise", source: "bench/src/check.ts", description: "Noise test." },
        metrics,
      },
    ],
  };
}

function render(
  candidateTimestamp: string | null,
  metrics: readonly Record<string, unknown>[] = [],
) {
  const evidence = validateReleaseComparisonArtifact(comparison(candidateTimestamp, metrics));
  if (typeof evidence === "string") throw new Error(evidence);
  return renderReleaseComparisonSection(evidence, "bench/results/release-comparison.json").join(
    "\n",
  );
}

function metric(key: string, unit: string, verdict: string, base: number, candidate: number) {
  const stat = (value: number) => ({ median: value, p95: value });
  return {
    key,
    unit,
    rounds: { base: 5, candidate: 5 },
    base: verdict === "new-only" ? null : stat(base),
    candidate: stat(candidate),
    medianRatio: verdict === "new-only" ? null : candidate / base,
    p95Ratio: verdict === "new-only" ? null : candidate / base,
    verdict,
  };
}

it("counts only Sheetwrite's own rows, by the verdict the shown values support", () => {
  const page = render("2026-10-29T05:30:00.000Z", [
    metric("cells[key=engine=handsontable;rows=100000].timing", "ms", "regression", 10, 20),
    metric("engines[engine=full].shared.workloads[id=sum;size=1000].stat", "ms", "faster", 2, 1),
    metric("engines[engine=full].initialization.stat", "ms", "new-only", 0, 3),
    // Retained bytes 0.1% lower: both sides read 5.0 MiB and 1.00×.
    metric("workloads[id=sum;size=1000].retainedBytes", "bytes", "faster", 5_242_880, 5_237_637),
    metric("workloads[id=sum;size=1000].stat", "ms", "faster", 2, 1),
  ]);

  // Measurements, lower, higher, unchanged, new, flagged, control or repeat.
  expect(page).toContain("| Render baseline | 5 | 1 | 0 | 1 | 1 | 0 | 2 |");
  expect(page).toContain("Render baseline · Handsontable control");
  expect(page).toContain("Handsontable · 100,000 rows");
  expect(page).not.toContain("Smaller");
});

// The promoted render baseline stamps a commit but no time of its own.
it("labels a capture without its own timestamp by its receipt's scope start", () => {
  expect(render(null)).toContain("2026-10-29 04:00 UTC · scope start.");
  const stamped = render("2026-10-29T05:30:00.000Z");
  expect(stamped).toContain("2026-10-29 05:30 UTC.");
  expect(stamped).not.toContain("scope start");
});
