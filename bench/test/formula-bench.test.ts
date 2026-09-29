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

const COMMIT = "0".repeat(40);
const SOURCE_HASH = "a".repeat(64);

function formulaFixture(mode: "full" | "smoke" = "smoke"): CompleteFormulaBenchmarkResult {
  const sampleCount = mode === "smoke" ? 2 : 5;
  const samples = Array.from({ length: sampleCount }, () => 1);
  const allocationSamples = Array.from({ length: sampleCount }, () => ({
    retainedBytes: 1024,
    peakTransientBytes: 0,
    transientAllocations: 0,
  }));
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
    source: {
      protocol: FORMULA_PROTOCOL,
      commit: COMMIT,
      files,
      digest: sourceDigest,
    },
    methodology: {
      warmupSamples: 1,
      measuredSamples: sampleCount,
      timing: TIMING_METHOD,
      allocation: ALLOCATION_METHOD,
      correctness: CORRECTNESS_METHOD,
    },
    workloads: expectedFormulaWorkloadKeys(mode).map((key) => {
      const match = /^workload=(.*);size=(\d+)$/u.exec(key);
      if (!match) throw new Error(`invalid fixture key ${key}`);
      const id = match[1]!;
      const size = Number(match[2]);
      return {
        id,
        size,
        samplesMs: [...samples],
        stat: summarize(samples),
        allocationSamples: structuredClone(allocationSamples),
        allocationStat: {
          retainedBytes: summarize(allocationSamples.map((sample) => sample.retainedBytes)),
          peakTransientBytes: summarize(
            allocationSamples.map((sample) => sample.peakTransientBytes),
          ),
          transientAllocations: summarize(
            allocationSamples.map((sample) => sample.transientAllocations),
          ),
        },
        output: expectedFormulaOutput(id, size),
      };
    }),
    blockedWorkloads: [],
    memory: expectedFormulaMemoryKeys(mode).map((key) => ({
      formulas: Number(key.slice("memory=formulas=".length)),
      wasmDeltaBytes: 1024,
    })),
    gates: {
      passed: true,
      tolerance: FORMULA_GATE_TOLERANCE,
      regression: {
        status: "passed",
        baselineCommit: COMMIT,
        baselineSourceDigest: sourceDigest,
      },
    },
  };
}
describe("formula benchmark schema", () => {
  it("rejects missing, duplicate, unexpected, and malformed workload identities", () => {
    const named = { id: "independent-parse-load", size: 1_000 } as const;
    const key = `workload=${named.id};size=${named.size}`;
    const matchesNamed = (entry: CompleteFormulaBenchmarkResult["workloads"][number]) =>
      entry.id === named.id && entry.size === named.size;

    const missing = formulaFixture();
    missing.workloads = missing.workloads.filter((entry) => !matchesNamed(entry));
    expect(() => validateFormulaBenchmark(missing, "smoke")).toThrow(`missing ${key}`);

    const duplicate = formulaFixture();
    duplicate.workloads.push(structuredClone(duplicate.workloads.find(matchesNamed)!));
    expect(() => validateFormulaBenchmark(duplicate, "smoke")).toThrow(`duplicate ${key}`);

    const unexpected = formulaFixture();
    const extra = structuredClone(unexpected.workloads[0]!);
    extra.id = "not-declared";
    extra.size = 7;
    unexpected.workloads.push(extra);
    expect(() => validateFormulaBenchmark(unexpected, "smoke")).toThrow(
      "unexpected workload=not-declared;size=7",
    );

    const malformed = formulaFixture();
    Object.defineProperty(malformed.workloads.find(matchesNamed)!, "size", { value: "1000" });
    expect(() => validateFormulaBenchmark(malformed, "smoke")).toThrow(
      "formula workload contains a malformed identity",
    );
  });

  it("fails closed for missing raw samples and forged summaries", () => {
    const missingTiming = formulaFixture();
    missingTiming.workloads[0]!.samplesMs = [];
    expect(() => validateFormulaBenchmark(missingTiming)).toThrow(
      "must contain 2 post-warmup raw samples",
    );

    const missingAllocation = formulaFixture();
    missingAllocation.workloads[0]!.allocationSamples = [];
    expect(() => validateFormulaBenchmark(missingAllocation)).toThrow(
      "allocationSamples must contain 2 raw samples",
    );

    const forgedTiming = formulaFixture();
    forgedTiming.workloads[0]!.stat = { ...forgedTiming.workloads[0]!.stat, stddev: 0.1 };
    expect(() => validateFormulaBenchmark(forgedTiming)).toThrow("does not match raw samples");

    const forgedAllocation = formulaFixture();
    forgedAllocation.workloads[0]!.allocationStat.retainedBytes = {
      ...forgedAllocation.workloads[0]!.allocationStat.retainedBytes,
      stddev: 0.1,
    };
    expect(() => validateFormulaBenchmark(forgedAllocation)).toThrow("does not match raw samples");
  });

  it("rejects malformed or internally inconsistent runner/source provenance", () => {
    const commit = formulaFixture();
    commit.meta.commit = "A".repeat(40);
    expect(() => validateFormulaBenchmark(commit)).toThrow("lowercase Git SHA");

    const command = formulaFixture();
    command.runner.command.push("--invented");
    expect(() => validateFormulaBenchmark(command)).toThrow("command does not match");

    const fileHash = formulaFixture();
    fileHash.source.files[FORMULA_SOURCE_FILES[0]!] = "short";
    expect(() => validateFormulaBenchmark(fileHash)).toThrow("must be a SHA-256 digest");

    const digest = formulaFixture();
    digest.source.digest = "b".repeat(64);
    expect(() => validateFormulaBenchmark(digest)).toThrow("digest does not match");

    const extraFile = formulaFixture();
    extraFile.source.files.unbounded = SOURCE_HASH;
    expect(() => validateFormulaBenchmark(extraFile)).toThrow("must contain exactly");
  });
});

describe("formula regression gate", () => {
  it("gates every workload's median and p95 from raw samples", () => {
    const baseline = formulaFixture("full");

    const median = formulaFixture("full");
    median.workloads[0]!.samplesMs = [1.3, 1.3, 1.3, 1.3, 1.3];
    median.workloads[0]!.stat = summarize(median.workloads[0]!.samplesMs);
    expect(() => validateFormulaRegression(median, baseline)).toThrow(".median regression");

    const p95 = formulaFixture("full");
    p95.workloads[0]!.samplesMs = [1, 1, 1, 1, 1.4];
    p95.workloads[0]!.stat = summarize(p95.workloads[0]!.samplesMs);
    expect(() => validateFormulaRegression(p95, baseline)).toThrow(".p95 regression");
  });

  it("gates attributed per-workload allocation and aggregate WASM allocation", () => {
    const baseline = formulaFixture("full");

    const attributed = formulaFixture();
    for (const sample of attributed.workloads[0]!.allocationSamples) sample.retainedBytes++;
    attributed.workloads[0]!.allocationStat.retainedBytes = summarize(
      attributed.workloads[0]!.allocationSamples.map((sample) => sample.retainedBytes),
    );
    expect(() => validateFormulaRegression(attributed, baseline)).toThrow(
      ".allocation.retainedBytes.median regression",
    );

    const aggregate = formulaFixture();
    aggregate.memory[0]!.wasmDeltaBytes++;
    expect(() => validateFormulaRegression(aggregate, baseline)).toThrow(
      "wasmDeltaBytes regression",
    );
  });

  it("binds a candidate to the exact baseline source provenance", () => {
    const baseline = formulaFixture("full");
    const candidate = formulaFixture();
    (candidate.gates.regression as { baselineSourceDigest: string }).baselineSourceDigest =
      "b".repeat(64);
    expect(() => validateFormulaRegression(candidate, baseline)).toThrow(
      "not bound to the supplied baseline provenance",
    );
    expect(() => validateFormulaCapture(candidate, baseline)).toThrow(
      "not bound to the supplied baseline provenance",
    );
  });

  it("compares a smoke candidate with the compatible workloads in the legacy full baseline", () => {
    const expanded = new Set([
      "spill-filter-resize",
      "sumproduct-vector-edit",
      "sumproduct-matrix-edit",
      "criteria-multi-range-edit",
      "unicode-text-date-edit",
      "percentile-covariance",
      "let-reuse-edit",
      "iterative-finance",
      "incremental-dependency-closure-edit",
      "spill-sequence-admission",
    ]);
    const baseline = formulaFixture("full");
    baseline.workloads = baseline.workloads.filter((workload) => !expanded.has(workload.id));
    const candidate = formulaFixture("smoke");

    expect(() => validateFormulaRegression(candidate, baseline)).not.toThrow();
  });
});
