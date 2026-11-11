import { describe, expect, it } from "bun:test";

import {
  ALLOCATION_METHOD,
  CORRECTNESS_METHOD,
  type CompleteFormulaBenchmarkResult,
  expectedFormulaMemoryKeys,
  expectedFormulaOutput,
  expectedFormulaWorkloadKeys,
  FORMULA_BENCHMARK_SCHEMA_VERSION,
  FORMULA_GATE_TOLERANCE,
  FORMULA_PROTOCOL,
  FORMULA_SOURCE_FILES,
  formulaSourceDigest,
  TIMING_METHOD,
  validateFormulaBenchmark,
  validateFormulaCapture,
  validateFormulaRegression,
} from "../src/formula-bench.js";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { summarize } from "../src/stats.js";
import { expectRejections, must } from "./gate-fixtures.js";

const COMMIT = "0".repeat(40);
const SOURCE_HASH = "a".repeat(64);
const RETAINED_BYTES = 1024;

type Fixture = CompleteFormulaBenchmarkResult;

function formulaFixture(mode: "full" | "smoke" = "smoke"): Fixture {
  const sampleCount = mode === "smoke" ? 2 : 5;
  const samples = Array.from({ length: sampleCount }, () => 1);
  const allocation = {
    retainedBytes: RETAINED_BYTES,
    peakTransientBytes: 0,
    transientAllocations: 0,
  };
  const files = Object.fromEntries(FORMULA_SOURCE_FILES.map((path) => [path, SOURCE_HASH]));
  const sourceDigest = formulaSourceDigest(COMMIT, files);
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    schemaVersion: FORMULA_BENCHMARK_SCHEMA_VERSION,
    meta: {
      bun: "1.3.14",
      platform: "linux",
      arch: "x64",
      commit: COMMIT,
      dirty: false,
      timestamp: "2026-07-13T00:00:00.000Z",
    },
    runner: {
      command: ["bun", "run", "src/formula-bench.ts", ...(mode === "smoke" ? ["--smoke"] : [])],
      bun: "1.3.14",
      node: "24.3.0",
      platform: "linux",
      kernel: "test-kernel",
      arch: "x64",
      cpu: "test-cpu",
      concurrency: 1,
      gc: "Bun.gc(true) before every measured sample",
    },
    source: { protocol: FORMULA_PROTOCOL, commit: COMMIT, files, digest: sourceDigest },
    methodology: {
      warmupSamples: 1,
      measuredSamples: sampleCount,
      timing: TIMING_METHOD,
      allocation: ALLOCATION_METHOD,
      correctness: CORRECTNESS_METHOD,
    },
    workloads: expectedFormulaWorkloadKeys(mode).map((key) => {
      const [, id = "", size = ""] = must(/^workload=(.*);size=(\d+)$/u.exec(key), key);
      return {
        id,
        size: Number(size),
        samplesMs: [...samples],
        stat: summarize(samples),
        allocationSamples: samples.map(() => ({ ...allocation })),
        allocationStat: {
          retainedBytes: summarize(samples.map(() => allocation.retainedBytes)),
          peakTransientBytes: summarize(samples.map(() => allocation.peakTransientBytes)),
          transientAllocations: summarize(samples.map(() => allocation.transientAllocations)),
        },
        output: expectedFormulaOutput(id, Number(size)),
      };
    }),
    blockedWorkloads: [],
    memory: expectedFormulaMemoryKeys(mode).map((key) => ({
      formulas: Number(key.slice("memory=formulas=".length)),
      wasmDeltaBytes: RETAINED_BYTES,
    })),
    gates: {
      passed: true,
      tolerance: FORMULA_GATE_TOLERANCE,
      regression: { status: "passed", baselineCommit: COMMIT, baselineSourceDigest: sourceDigest },
    },
  };
}

const firstWorkload = (result: Fixture) => must(result.workloads[0], "workload");

describe("formula benchmark schema", () => {
  it("rejects drifted workload identities, raw samples, summaries and provenance", () => {
    const named = (result: Fixture) =>
      must(
        result.workloads.find(
          (entry) => entry.id === "independent-parse-load" && entry.size === 1_000,
        ),
        "named workload",
      );
    const key = "workload=independent-parse-load;size=1000";
    expectRejections(formulaFixture, (result) => validateFormulaBenchmark(result, "smoke"), [
      [
        (result) => result.workloads.splice(result.workloads.indexOf(named(result)), 1),
        `missing ${key}`,
      ],
      [(result) => result.workloads.push(structuredClone(named(result))), `duplicate ${key}`],
      [
        (result) =>
          result.workloads.push({
            ...structuredClone(firstWorkload(result)),
            id: "not-declared",
            size: 7,
          }),
        "unexpected workload=not-declared;size=7",
      ],
      [
        (result) => Object.defineProperty(named(result), "size", { value: "1000" }),
        "formula workload contains a malformed identity",
      ],
      [(result) => (firstWorkload(result).samplesMs = []), "contain 2 post-warmup raw samples"],
      [(result) => (firstWorkload(result).allocationSamples = []), "must contain 2 raw samples"],
      [
        (result) => (firstWorkload(result).stat = { ...firstWorkload(result).stat, stddev: 0.1 }),
        "does not match raw samples",
      ],
      [
        (result) => {
          const stat = firstWorkload(result).allocationStat;
          stat.retainedBytes = { ...stat.retainedBytes, stddev: 0.1 };
        },
        "does not match raw samples",
      ],
      [(result) => (result.meta.commit = "A".repeat(40)), "lowercase Git SHA"],
      [(result) => result.runner.command.push("--invented"), "command does not match"],
      [
        (result) => (result.source.files[must(FORMULA_SOURCE_FILES[0], "source file")] = "short"),
        "must be a SHA-256 digest",
      ],
      [(result) => (result.source.digest = "b".repeat(64)), "digest does not match"],
      [(result) => (result.source.files.unbounded = SOURCE_HASH), "must contain exactly"],
    ]);
  });
});

describe("formula regression gate", () => {
  it("gates attributed per-workload allocation and aggregate WASM allocation", () => {
    const baseline = formulaFixture("full");
    expectRejections(formulaFixture, (result) => validateFormulaRegression(result, baseline), [
      [
        (result) => {
          const workload = firstWorkload(result);
          for (const sample of workload.allocationSamples) sample.retainedBytes++;
          workload.allocationStat.retainedBytes = summarize(
            workload.allocationSamples.map((sample) => sample.retainedBytes),
          );
        },
        ".allocation.retainedBytes.median regression",
      ],
      [(result) => must(result.memory[0], "memory").wasmDeltaBytes++, "wasmDeltaBytes regression"],
    ]);
  });

  it("binds a candidate to the exact baseline source provenance", () => {
    const baseline = formulaFixture("full");
    const candidate = formulaFixture();
    Reflect.set(candidate.gates.regression, "baselineSourceDigest", "b".repeat(64));
    const unbound = "not bound to the supplied baseline provenance";
    expect(() => validateFormulaRegression(candidate, baseline)).toThrow(unbound);
    expect(() => validateFormulaCapture(candidate, baseline)).toThrow(unbound);
  });
});
