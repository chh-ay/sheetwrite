import { expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { expectedFormulaOutput } from "../src/formula-fixtures.js";
import {
  MATCHED_ENGINE_WORKLOADS,
  MATCHED_MINIMUM_SAMPLE_MS,
  MATCHED_WARMUP_FIXTURES,
  type MatchedEngineResult,
  matchedMethod,
  validateMatchedEngineResult,
} from "../src/matched-engine-bench.js";
import { summarize } from "../src/stats.js";
import { must, type Rejection } from "./gate-fixtures.js";

const ROUNDS = 2;
const PER_ITERATION_MS = 0.75;
const ITERATIONS = 80;
const SOURCE_DIGEST = "a".repeat(64);
const COMMIT = "b".repeat(40);
const BASELINE_COMMIT = "c".repeat(40);
const CURRENT_WASM_DIGEST = "d".repeat(64);
const ENGINES = ["default", "full"] as const;
const WASM = (name: string) => `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`;

/** Both engines take the same time in every round, so each paired ratio is exactly 1. */
function conformingCapture(): MatchedEngineResult {
  const allocation = { retainedBytes: 1_024, peakTransientBytes: 0, transientAllocations: 0 };
  const sourceFiles = Object.fromEntries(
    [
      ...["matched-engine-bench", "formula-bench", "formula-dataset", "gate-protocol", "stats"].map(
        (name) => `bench/src/${name}.ts`,
      ),
      WASM("wasm"),
      WASM("formulas"),
    ].map((path) => [path, SOURCE_DIGEST]),
  );
  return {
    schemaVersion: 2,
    meta: { commit: COMMIT, dirty: false, timestamp: "2026-01-01T00:00:00.000Z" },
    runner: { cpu: "test cpu", kernel: "test kernel", bun: "1.0.0", arch: "x64", concurrency: 1 },
    method: matchedMethod(ROUNDS),
    rounds: ROUNDS,
    minimumSampleDurationMs: MATCHED_MINIMUM_SAMPLE_MS,
    warmupFixtures: MATCHED_WARMUP_FIXTURES,
    sourceFiles,
    sourceDigest: "",
    rows: MATCHED_ENGINE_WORKLOADS.map((workload) => {
      const samples = Array.from({ length: ROUNDS }, (_, round) =>
        ENGINES.map((engine) => ({
          id: workload.id,
          size: workload.size,
          samplesMs: [PER_ITERATION_MS],
          stat: summarize([PER_ITERATION_MS]),
          allocationSamples: [allocation],
          allocationStat: {
            retainedBytes: summarize([allocation.retainedBytes]),
            peakTransientBytes: summarize([allocation.peakTransientBytes]),
            transientAllocations: summarize([allocation.transientAllocations]),
          },
          output: expectedFormulaOutput(workload.id, workload.size),
          iterations: ITERATIONS,
          totalMs: PER_ITERATION_MS * ITERATIONS,
          warmupFixtures: MATCHED_WARMUP_FIXTURES,
          engine,
          round,
        })),
      ).flat();
      const engineStat = summarize(Array.from({ length: ROUNDS }, () => PER_ITERATION_MS));
      return {
        id: workload.id,
        size: workload.size,
        samples,
        defaultStat: engineStat,
        fullStat: engineStat,
        ratioStat: summarize(Array.from({ length: ROUNDS }, () => 1)),
        ratioP10: 1,
        ratioP90: 1,
      };
    }),
  };
}

/** The capture digest is derived, so the fixture recomputes it the way the runner does. */
function withDigest(capture: MatchedEngineResult): MatchedEngineResult {
  const { meta, sourceFiles: files, baselineContext } = capture;
  const bound = { commit: meta.commit, files, ...(baselineContext ? { baselineContext } : {}) };
  const digest = createHash("sha256").update(JSON.stringify(bound)).digest("hex");
  return { ...capture, sourceDigest: digest };
}

function baselineCapture(): MatchedEngineResult {
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
      engineFiles[`packages/${name}/${file}`] = SOURCE_DIGEST;
    }
    currentWasmFiles[WASM(name)] = CURRENT_WASM_DIGEST;
  }
  const baselineContext = {
    label: "0.5.4 engine (WASM) under 0.6 core and harness",
    engineCommit: BASELINE_COMMIT,
    harnessCommit: COMMIT,
    engineFiles,
    currentWasmFiles,
  };
  return withDigest({ ...conformingCapture(), baselineContext });
}

it("accepts a conforming capture and a baseline engine under a distinct current harness", () => {
  expect(() => validateMatchedEngineResult(withDigest(conformingCapture()))).not.toThrow();
  expect(() => validateMatchedEngineResult(baselineCapture())).not.toThrow();
});

it("rejects baseline evidence that is not bound to the baseline engine", () => {
  const context = (capture: MatchedEngineResult) =>
    must(capture.baselineContext, "baseline context");
  const cases: Rejection<MatchedEngineResult>[] = [
    ...["wasm", "formulas"].map((name): Rejection<MatchedEngineResult> => [
      (capture) => (context(capture).currentWasmFiles[WASM(name)] = SOURCE_DIGEST),
      `Baseline loaded the current WASM: ${WASM(name)}`,
    ]),
    [(capture) => (context(capture).harnessCommit = BASELINE_COMMIT), "engine provenance"],
    [
      (capture) => (context(capture).engineFiles[WASM("wasm")] = "e".repeat(64)),
      "Matched baseline WASM source binding mismatch",
    ],
    [(capture) => Object.assign(context(capture), { root: "/not-portable" }), "context fields"],
  ];
  for (const [edit, error] of cases) {
    const capture = baselineCapture();
    edit(capture);
    expect(() => validateMatchedEngineResult(withDigest(capture)), String(error)).toThrow(error);
  }
  const unbound = baselineCapture();
  context(unbound).engineCommit = "f".repeat(40);
  expect(() => validateMatchedEngineResult(unbound)).toThrow("Matched source digest mismatch");
});

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
  const result = withDigest(conformingCapture());
  const row = must(result.rows[0], "row");
  const sample = must(row.samples[0], "sample");
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
