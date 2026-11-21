import { expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  type MatchedEngineResult,
  validateMatchedEngineResult,
} from "../src/matched-engine-bench.js";
import { must, type Rejection } from "./gate-fixtures.js";

const RECORDED: MatchedEngineResult = await Bun.file(
  new URL("../results/full-engine-matched-results.json", import.meta.url),
).json();
const recorded = () => structuredClone(RECORDED);
const SOURCE_DIGEST = "a".repeat(64);
const BASELINE_COMMIT = "c".repeat(40);
const CURRENT_WASM_DIGEST = "d".repeat(64);
const WASM = (name: string) => `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`;

/** The capture digest is derived, so the fixture recomputes it the way the runner does. */
function withDigest(capture: MatchedEngineResult): MatchedEngineResult {
  const { meta, sourceFiles: files, baselineContext } = capture;
  const bound = { commit: meta.commit, files, ...(baselineContext ? { baselineContext } : {}) };
  const digest = createHash("sha256").update(JSON.stringify(bound)).digest("hex");
  return { ...capture, sourceDigest: digest };
}

/** The recorded capture, relabelled as an earlier engine measured under this harness. */
function baselineCapture(): MatchedEngineResult {
  const capture = recorded();
  const engineFiles: Record<string, string> = {};
  const currentWasmFiles: Record<string, string> = {};
  for (const name of ["wasm", "formulas"]) {
    for (const file of [
      "loader-node.mjs",
      "loader-state.mjs",
      "pkg/sheetwrite_wasm.js",
      "pkg/sheetwrite_wasm_factory.js",
    ]) {
      engineFiles[`packages/${name}/${file}`] = SOURCE_DIGEST;
    }
    engineFiles[WASM(name)] = must(capture.sourceFiles[WASM(name)], WASM(name));
    currentWasmFiles[WASM(name)] = CURRENT_WASM_DIGEST;
  }
  const baselineContext = {
    label: "0.5.4 engine (WASM) under 0.6 core and harness",
    engineCommit: BASELINE_COMMIT,
    harnessCommit: capture.meta.commit,
    engineFiles,
    currentWasmFiles,
  };
  return withDigest({ ...capture, baselineContext });
}

it("accepts the recorded capture and a baseline engine under a distinct current harness", () => {
  expect(() => validateMatchedEngineResult(recorded())).not.toThrow();
  expect(() => validateMatchedEngineResult(baselineCapture())).not.toThrow();
});

it("rejects baseline evidence that is not bound to the baseline engine", () => {
  const context = (capture: MatchedEngineResult) =>
    must(capture.baselineContext, "baseline context");
  const cases: Rejection<MatchedEngineResult>[] = [
    ...["wasm", "formulas"].map((name): Rejection<MatchedEngineResult> => [
      (capture) =>
        (context(capture).currentWasmFiles[WASM(name)] = must(
          context(capture).engineFiles[WASM(name)],
          WASM(name),
        )),
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
  const result = recorded();
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
  if (fault === "aggregation") row.samples[0] = { ...sample, totalMs: 0 };
  if (fault === "warmup") row.samples[0] = { ...sample, warmupFixtures: 0 };
  if (fault === "rounds") result.rounds = 1;
  expect(() => validateMatchedEngineResult(result)).toThrow();
});
