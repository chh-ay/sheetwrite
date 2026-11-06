import { expect, it } from "bun:test";

import {
  renderReleaseComparisonSection,
  validateReleaseComparisonArtifact,
} from "./release-performance-docs.js";

const CANDIDATE = "c".repeat(40);

interface Releases {
  readonly base: string;
  readonly candidate: string;
  /** One comparison label per suite; the first suite is the render baseline. */
  readonly labels: readonly string[];
}

const RELEASES_0_6: Releases = {
  base: "0.5.4",
  candidate: "0.6.0",
  labels: ["0.5.4"],
};

function comparison(
  candidateTimestamp: string | null,
  metrics: readonly Record<string, unknown>[] = [],
  releases: Releases = RELEASES_0_6,
): Record<string, unknown> {
  const suite = (artifact: string, comparisonLabel: string, suiteMetrics = metrics) => ({
    artifact,
    status: "compared",
    comparisonLabel,
    base: { commit: "b".repeat(40), timestamp: "2026-10-28T10:00:00.000Z" },
    candidate: { commit: CANDIDATE, dirty: null, timestamp: candidateTimestamp },
    baselineCapture: { timestamp: "2026-10-28T09:59:00.000Z" },
    candidateCapture: { timestamp: "2026-10-29T04:00:00.000Z" },
    threshold: { kind: "noise", source: "bench/src/check.ts", description: "Noise test." },
    metrics: suiteMetrics,
  });
  const [first = releases.base, ...rest] = releases.labels;

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
    captureMetadata: {
      protocol: `sheetwrite-${releases.candidate}-capture-metadata-v1`,
      captureCommit: CANDIDATE,
      publicationNotes: [],
    },
    base: { ref: `release/version-${releases.base}`, commit: "b".repeat(40) },
    candidate: { commit: CANDIDATE, dirty: false },
    suites: [
      suite("render-baseline.json", first),
      ...rest.map((label) => suite("formula-results.json", label, [])),
    ],
  };
}

function render(
  candidateTimestamp: string | null,
  metrics: readonly Record<string, unknown>[] = [],
  releases: Releases = RELEASES_0_6,
) {
  const evidence = validateReleaseComparisonArtifact(
    comparison(candidateTimestamp, metrics, releases),
  );
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

it("names the release pair the comparison artifact records", () => {
  const page = render(
    "2026-10-29T05:30:00.000Z",
    [
      metric("workloads[id=sum;size=1000].stat", "ms", "regression", 1, 2),
      metric("engines[engine=full].initialization.stat", "ms", "new-only", 0, 3),
    ],
    {
      base: "0.6.2",
      candidate: "0.7.0",
      labels: ["0.6.2", "0.6.2 engine (WASM) under 0.7 core and harness"],
    },
  );

  // The release pair and the engine label come from the artifact; no other release appears.
  expect(page).toContain("| Measurement | 0.6.2 median / p95 | 0.7.0 median / p95 |");
  expect(page).toContain("0.6.2 engine (WASM) under the 0.7 core and harness");
  expect(page).toContain("| New in 0.7 |");
  expect(page).toContain("--base-ref release/version-0.6.2");
  expect(page).not.toMatch(/0\.5\.4|0\.6\.0|\b0\.6 /u);
});

it.each([
  ["suites disagree on the baseline", { labels: ["0.6.2", "0.6.1"] }],
  [
    "an engine label names another harness line",
    { labels: ["0.6.2", "0.6.2 engine (WASM) under 0.6 core and harness"] },
  ],
  ["the capture metadata names no release", { candidate: "next" }],
])("rejects an artifact when %s", (_reason, override) => {
  const releases = { base: "0.6.2", candidate: "0.7.0", labels: ["0.6.2"], ...override };
  expect(validateReleaseComparisonArtifact(comparison(null, [], releases))).toBe(
    "release comparison does not name one release pair",
  );
});
