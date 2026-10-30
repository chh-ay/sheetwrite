import { expect, it } from "bun:test";

import {
  renderReleaseComparisonSection,
  validateReleaseComparisonArtifact,
} from "./release-performance-docs.js";

const CANDIDATE = "c".repeat(40);

function comparison(candidateTimestamp: string | null): Record<string, unknown> {
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
        metrics: [],
      },
    ],
  };
}

function render(candidateTimestamp: string | null): string {
  const evidence = validateReleaseComparisonArtifact(comparison(candidateTimestamp));
  if (typeof evidence === "string") throw new Error(evidence);
  return renderReleaseComparisonSection(evidence, "bench/results/release-comparison.json").join(
    "\n",
  );
}

// The promoted render baseline stamps a commit but no time of its own.
it("labels a capture without its own timestamp by its receipt's scope start", () => {
  expect(render(null)).toContain("2026-10-29 04:00 UTC · scope start.");
  const stamped = render("2026-10-29T05:30:00.000Z");
  expect(stamped).toContain("2026-10-29 05:30 UTC.");
  expect(stamped).not.toContain("scope start");
});
