import { expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { expectedFormulaOutput } from "../src/formula-bench.js";
import type { EngineBaselineContext } from "../src/gate-protocol.js";
import {
  MATCHED_ENGINE_WORKLOADS,
  MATCHED_MINIMUM_SAMPLE_MS,
  MATCHED_WARMUP_FIXTURES,
  type MatchedEngineResult,
  type MatchedEngineRow,
  matchedMethod,
  validateMatchedEngineResult,
} from "../src/matched-engine-bench.js";
import { summarize } from "../src/stats.js";

const TEST_ROUNDS = 2;
const TEST_PER_ITERATION_MS = 0.75;
const TEST_ITERATIONS = 80;
const TEST_SOURCE_DIGEST = "a".repeat(64);
const TEST_COMMIT = "b".repeat(40);
const TEST_BASELINE_COMMIT = "c".repeat(40);
const TEST_CURRENT_WASM_DIGEST = "d".repeat(64);

/**
 * One conforming sample pair: both engines take the same time in a round, so
 * every paired ratio is exactly 1 and no statistics are recomputed by hand.
 */
function sampleFor(
  workload: (typeof MATCHED_ENGINE_WORKLOADS)[number],
  engine: "default" | "full",
  round: number,
): MatchedEngineRow["samples"][number] {
  const allocation = { retainedBytes: 1_024, peakTransientBytes: 0, transientAllocations: 0 };
  const totalMs = TEST_PER_ITERATION_MS * TEST_ITERATIONS;
  return {
    id: workload.id,
    size: workload.size,
    samplesMs: [TEST_PER_ITERATION_MS],
    stat: summarize([TEST_PER_ITERATION_MS]),
    allocationSamples: [allocation],
    allocationStat: {
      retainedBytes: summarize([allocation.retainedBytes]),
      peakTransientBytes: summarize([allocation.peakTransientBytes]),
      transientAllocations: summarize([allocation.transientAllocations]),
    },
    output: expectedFormulaOutput(workload.id, workload.size),
    iterations: TEST_ITERATIONS,
    totalMs,
    warmupFixtures: MATCHED_WARMUP_FIXTURES,
    engine,
    round,
  };
}

function conformingCapture(): MatchedEngineResult {
  return {
    schemaVersion: 2,
    meta: { commit: TEST_COMMIT, dirty: false, timestamp: "2026-01-01T00:00:00.000Z" },
    runner: {
      cpu: "test cpu",
      kernel: "test kernel",
      bun: "1.0.0",
      arch: "x64",
      concurrency: 1,
    },
    method: matchedMethod(TEST_ROUNDS),
    rounds: TEST_ROUNDS,
    minimumSampleDurationMs: MATCHED_MINIMUM_SAMPLE_MS,
    warmupFixtures: MATCHED_WARMUP_FIXTURES,
    sourceFiles: {
      "bench/src/matched-engine-bench.ts": TEST_SOURCE_DIGEST,
      "bench/src/formula-bench.ts": TEST_SOURCE_DIGEST,
      "bench/src/formula-dataset.ts": TEST_SOURCE_DIGEST,
      "bench/src/gate-protocol.ts": TEST_SOURCE_DIGEST,
      "bench/src/stats.ts": TEST_SOURCE_DIGEST,
      "packages/wasm/pkg/sheetwrite_wasm_bg.wasm": TEST_SOURCE_DIGEST,
      "packages/formulas/pkg/sheetwrite_wasm_bg.wasm": TEST_SOURCE_DIGEST,
    },
    sourceDigest: "",
    rows: MATCHED_ENGINE_WORKLOADS.map((workload) => {
      const samples = Array.from({ length: TEST_ROUNDS }, (_, round) =>
        (["default", "full"] as const).map((engine) => sampleFor(workload, engine, round)),
      ).flat();
      const durationsFor = (engine: "default" | "full"): number[] =>
        samples
          .filter((sample) => sample.engine === engine)
          .map((sample) => sample.samplesMs[0] ?? 0);
      const ratios = Array.from({ length: TEST_ROUNDS }, () => 1);
      return {
        id: workload.id,
        size: workload.size,
        samples,
        defaultStat: summarize(durationsFor("default")),
        fullStat: summarize(durationsFor("full")),
        ratioStat: summarize(ratios),
        ratioP10: 1,
        ratioP90: 1,
      };
    }),
  };
}

/** The capture digest is derived, so the fixture recomputes it the way the runner does. */
function captureWithDigest(capture = conformingCapture()): MatchedEngineResult {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        commit: capture.meta.commit,
        files: capture.sourceFiles,
        ...(capture.baselineContext === undefined
          ? {}
          : { baselineContext: capture.baselineContext }),
      }),
    )
    .digest("hex");
  return { ...capture, sourceDigest: digest };
}

function firstSample(result: MatchedEngineResult) {
  const sample = result.rows[0]?.samples[0];
  if (!sample) throw new Error("Missing fixture sample");
  return sample;
}

it("accepts a complete conforming matched engine capture", () => {
  expect(() => validateMatchedEngineResult(captureWithDigest())).not.toThrow();
});

function baselineCapture(): MatchedEngineResult {
  const capture = conformingCapture();
  const engineFiles: Record<string, string> = {};
  const currentWasmFiles: Record<string, string> = {};
  for (const name of ["wasm", "formulas"]) {
    for (const file of [
      "loader-node.mjs",
      "loader-state.mjs",
      "pkg/sheetwrite_wasm.js",
      "pkg/sheetwrite_wasm_factory.js",
      "pkg/sheetwrite_wasm_bg.wasm",
    ]) {
      engineFiles[`packages/${name}/${file}`] = TEST_SOURCE_DIGEST;
    }
    currentWasmFiles[`packages/${name}/pkg/sheetwrite_wasm_bg.wasm`] = TEST_CURRENT_WASM_DIGEST;
  }
  const baselineContext: EngineBaselineContext = {
    label: "0.5.4 engine (WASM) under 0.6 core and harness",
    engineCommit: TEST_BASELINE_COMMIT,
    harnessCommit: TEST_COMMIT,
    engineFiles,
    currentWasmFiles,
  };
  return captureWithDigest({ ...capture, baselineContext });
}

it("accepts a baseline engine under a distinct current harness", () => {
  expect(() => validateMatchedEngineResult(baselineCapture())).not.toThrow();
});

it.each(["wasm", "formulas"])("rejects a baseline that records current %s WASM", (name) => {
  const capture = baselineCapture();
  const context = capture.baselineContext;
  if (!context) throw new Error("Missing fixture baseline context");
  const path = `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`;
  context.currentWasmFiles[path] = TEST_SOURCE_DIGEST;
  expect(() => validateMatchedEngineResult(captureWithDigest(capture))).toThrow(
    `Baseline loaded the current WASM: ${path}`,
  );
});

it.each(["harness", "files", "unknown-field", "unbound-digest"])(
  "rejects unbound baseline %s evidence",
  (fault) => {
    const capture = baselineCapture();
    const context = capture.baselineContext;
    if (!context) throw new Error("Missing fixture baseline context");
    if (fault === "harness") context.harnessCommit = TEST_BASELINE_COMMIT;
    if (fault === "files") {
      context.engineFiles["packages/wasm/pkg/sheetwrite_wasm_bg.wasm"] = "e".repeat(64);
    }
    if (fault === "unknown-field") Object.assign(context, { root: "/not-portable" });
    if (fault === "unbound-digest") {
      context.engineCommit = "f".repeat(40);
      expect(() => validateMatchedEngineResult(capture)).toThrow("Matched source digest mismatch");
    } else {
      expect(() => validateMatchedEngineResult(captureWithDigest(capture))).toThrow(
        fault === "harness"
          ? "Invalid baseline engine provenance"
          : fault === "files"
            ? "Matched baseline WASM source binding mismatch"
            : "baseline context fields",
      );
    }
  },
);

it.each([
  "missing",
  "order",
  "checksum",
  "summary",
  "allocation",
  "ratio",
  "spread",
  "source",
  "iterations",
  "aggregation",
  "warmup",
  "rounds",
])("rejects invalid matched %s evidence", (fault) => {
  const result = captureWithDigest();
  const row = result.rows[0];
  const sample = firstSample(result);
  if (!row) throw new Error("Missing fixture row");
  if (fault === "missing") row.samples.pop();
  if (fault === "order") sample.engine = "full";
  if (fault === "checksum") sample.output = "wrong";
  if (fault === "summary") row.defaultStat = { ...row.defaultStat, mean: row.defaultStat.mean + 1 };
  if (fault === "allocation") sample.allocationSamples.pop();
  if (fault === "ratio") row.ratioStat = { ...row.ratioStat, median: row.ratioStat.median + 1 };
  if (fault === "spread") row.ratioP10 += 1;
  if (fault === "source") result.sourceDigest = "0".repeat(64);
  if (fault === "iterations") row.samples[0] = { ...sample, iterations: 0 };
  if (fault === "aggregation")
    row.samples[0] = { ...sample, totalMs: MATCHED_MINIMUM_SAMPLE_MS / 2 };
  if (fault === "warmup") row.samples[0] = { ...sample, warmupFixtures: 0 };
  if (fault === "rounds") result.rounds = 1;
  expect(() => validateMatchedEngineResult(result)).toThrow();
});

it.each(["default", "full"])("runs one checked fresh %s sample", (engine) => {
  const root = new URL("../../", import.meta.url).pathname;
  const child = Bun.spawnSync(
    [
      "bun",
      "run",
      "src/formula-bench.ts",
      "--sample",
      "independent-first-recompute",
      "3",
      "--aggregate-ms",
      "10",
      "--warmup-fixtures",
      "1",
    ],
    {
      cwd: `${root}/bench`,
      env: { ...process.env, SHEETWRITE_BENCH_ENGINE: engine },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(child.exitCode).toBe(0);
  const sample = JSON.parse(child.stdout.toString()) as {
    samplesMs: number[];
    output: number;
    iterations: number;
    totalMs: number;
    warmupFixtures: number;
  };
  expect(sample.samplesMs).toHaveLength(1);
  expect(sample.output).toBe(3);
  expect(sample.iterations).toBeGreaterThan(0);
  expect(sample.warmupFixtures).toBe(1);
  expect(sample.totalMs).toBeGreaterThanOrEqual(10);
  expect(sample.samplesMs[0]).toBeCloseTo(sample.totalMs / sample.iterations, 9);
});
