import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";

import { ENGINE_PACKAGE, ENGINE_GLUE_PATH, WASM_PATH } from "./formula-engine.js";
import { expectedFormulaOutput } from "./formula-fixtures.js";
import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type EngineBaselineContext,
  captureEngineBaselineContext,
  validateEngineBaselineContext,
  type GateIdentity,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import type { Stat } from "./stats.js";

export const FORMULA_SUPPORT_SOURCE_FILES = [
  "bench/src/formula-artifact.ts",
  "bench/src/formula-engine.ts",
  "bench/src/formula-fixtures.ts",
] as const;

const HARNESS_SOURCE_URLS = {
  "bench/package.json": new URL("../package.json", import.meta.url),
  "bench/src/formula-bench.ts": new URL("./formula-bench.ts", import.meta.url),
  "bench/src/formula-artifact.ts": new URL("./formula-artifact.ts", import.meta.url),
  "bench/src/formula-engine.ts": new URL("./formula-engine.ts", import.meta.url),
  "bench/src/formula-fixtures.ts": new URL("./formula-fixtures.ts", import.meta.url),
  "bench/src/formula-dataset.ts": new URL("./formula-dataset.ts", import.meta.url),
  "bench/src/gate-protocol.ts": new URL("./gate-protocol.ts", import.meta.url),
  "bench/src/protocol-meta.ts": new URL("./protocol-meta.ts", import.meta.url),
  "bench/src/stats.ts": new URL("./stats.ts", import.meta.url),
  "bun.lock": new URL("../../bun.lock", import.meta.url),
} as const;
const ENGINE_SOURCE_FILENAMES = ["sheetwrite_wasm.js", "sheetwrite_wasm_bg.wasm"] as const;
export type FormulaEnginePackage = "wasm" | "formulas";

/** The provenance keys of a capture that measured the engine in `packages/<engine_package>`. */
function formula_source_files(engine_package: FormulaEnginePackage): string[] {
  return [
    ...Object.keys(HARNESS_SOURCE_URLS),
    ...ENGINE_SOURCE_FILENAMES.map((filename) => `packages/${engine_package}/pkg/${filename}`),
  ].sort();
}

/**
 * The engine package named by a capture's provenance keys, after checking the
 * keys are exactly that package's set. Older captures, such as the committed
 * full-engine results, file the full engine's hashes under `packages/wasm/`
 * keys too, so a `wasm` key set names where the hashes are, and the hashes
 * name the binary.
 */
export function formulaSourceEnginePackage(
  files: Readonly<Record<string, string>>,
): FormulaEnginePackage {
  const engine_package =
    "packages/formulas/pkg/sheetwrite_wasm_bg.wasm" in files ? "formulas" : "wasm";
  const expected = formula_source_files(engine_package);
  // Recorded captures before this extraction hash the original monolithic harness.
  const extracted_paths: readonly string[] = FORMULA_SUPPORT_SOURCE_FILES;
  const recorded_keys = extracted_paths.some((path) => path in files)
    ? expected
    : expected.filter((path) => !extracted_paths.includes(path));
  exact_object_keys(files, recorded_keys, "formula source provenance.files");
  return engine_package;
}

export const FORMULA_BENCHMARK_SCHEMA_VERSION = 2 as const;
/** The provenance keys this process records, for the engine it loads. */
export function formulaWorkloadKey(workload: Pick<FormulaWorkloadResult, "id" | "size">): string {
  return `workload=${workload.id};size=${workload.size}`;
}

export const FORMULA_SOURCE_FILES = formula_source_files(ENGINE_PACKAGE);
export const FORMULA_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_SAMPLES = 5;
export const SMOKE_SAMPLES = 2;
export const FORMULA_PROTOCOL = "formula-benchmark-v2";
const TIMING_REGRESSION_RATIO = 1.25;
const TIMING_REGRESSION_FLOOR_MS = 0.1;
export const PRELIMINARY_BLOCKER =
  "preliminary capture has no schema-v2 baseline with attributed per-workload allocation samples";
export const OUTPUT_CAPTURE_BLOCKER =
  "capture written outside the tracked results file has no baseline comparison";
/** A gated capture reads the tracked baseline; the other kinds record a blocked gate instead. */
export type FormulaCaptureKind = "gated" | "preliminary" | "output";
export const FORMULA_GATE_TOLERANCE =
  "exact matrix/output/provenance; raw summaries derived; timing median/p95 <= max(baseline*1.25, baseline+0.1ms); no attributed allocation or aggregate WASM regression";
export const TIMING_METHOD =
  "one complete untimed warmup fixture, then monotonic wall time for each fresh fixture after forced GC";
export const ALLOCATION_METHOD =
  "post-run store-owned allocated bytes plus evaluator peak transient matrix bytes and matrix allocation count for each timed fixture";
export const CORRECTNESS_METHOD =
  "every warmup and measured fixture is checked against the workload's exact expected output before its sample is accepted";

export type FormulaOutput = number | string;

export interface FormulaAllocationSample {
  retainedBytes: number;
  peakTransientBytes: number;
  transientAllocations: number;
}

export interface FormulaAllocationStat {
  retainedBytes: Stat;
  peakTransientBytes: Stat;
  transientAllocations: Stat;
}

export interface FormulaWorkloadResult {
  id: string;
  size: number;
  samplesMs: number[];
  stat: Stat;
  allocationSamples?: FormulaAllocationSample[];
  allocationStat?: FormulaAllocationStat;
  output?: FormulaOutput;
}

export interface FormulaBlockedWorkload {
  id: string;
  size: number;
  status: "blocked";
  owner: "FormulaArraysWT";
  reason: string;
}

export interface FormulaMemoryResult {
  formulas: number;
  wasmDeltaBytes: number;
}

export interface FormulaRunnerProvenance {
  command: string[];
  bun: string;
  node: string;
  platform: string;
  kernel: string;
  arch: string;
  cpu: string;
  concurrency: 1;
  gc: "Bun.gc(true) before every measured sample";
}

export interface FormulaSourceProvenance {
  protocol: typeof FORMULA_PROTOCOL;
  commit: string;
  files: Record<string, string>;
  digest: string;
  baselineContext?: EngineBaselineContext;
}

export interface PassedRegressionGate {
  status: "passed";
  baselineCommit: string;
  baselineSourceDigest: string;
}

export interface BlockedRegressionGate {
  status: "blocked";
  blocker: string;
}

export interface FormulaBenchmarkResult extends GateIdentity {
  schemaVersion?: typeof FORMULA_BENCHMARK_SCHEMA_VERSION;
  meta: {
    bun: string;
    platform: string;
    arch: string;
    commit: string;
    dirty: boolean;
    timestamp: string;
  };
  runner?: FormulaRunnerProvenance;
  source?: FormulaSourceProvenance;
  methodology?: {
    warmupSamples: 1;
    measuredSamples: number;
    timing: string;
    allocation: string;
    correctness: string;
  };
  workloads: FormulaWorkloadResult[];
  blockedWorkloads?: FormulaBlockedWorkload[];
  memory: FormulaMemoryResult[];
  gates: {
    passed: boolean;
    tolerance: string;
    regression?: PassedRegressionGate | BlockedRegressionGate;
  };
}

export type CompleteFormulaWorkloadResult = Omit<
  FormulaWorkloadResult,
  "allocationSamples" | "allocationStat" | "output"
> & {
  allocationSamples: FormulaAllocationSample[];
  allocationStat: FormulaAllocationStat;
  output: FormulaOutput;
};

export type CompleteFormulaBenchmarkResult = Omit<
  FormulaBenchmarkResult,
  "schemaVersion" | "runner" | "source" | "methodology" | "workloads" | "blockedWorkloads" | "gates"
> & {
  schemaVersion: typeof FORMULA_BENCHMARK_SCHEMA_VERSION;
  runner: FormulaRunnerProvenance;
  source: FormulaSourceProvenance;
  methodology: NonNullable<FormulaBenchmarkResult["methodology"]>;
  workloads: CompleteFormulaWorkloadResult[];
  blockedWorkloads: FormulaBlockedWorkload[];
  gates: Omit<FormulaBenchmarkResult["gates"], "regression"> & {
    regression: PassedRegressionGate | BlockedRegressionGate;
  };
};

export function outputsEqual(actual: FormulaOutput, expected: FormulaOutput): boolean {
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "string" || typeof expected === "string") return actual === expected;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= tolerance;
}

export function exactInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function formulaSourceDigest(
  commit: string,
  files: Readonly<Record<string, string>>,
  baselineContext?: EngineBaselineContext,
): string {
  return sha256(
    JSON.stringify({
      protocol: FORMULA_PROTOCOL,
      commit,
      files,
      ...(baselineContext === undefined ? {} : { baselineContext }),
    }),
  );
}

export function currentFormulaSourceProvenance(commit: string): FormulaSourceProvenance {
  const urls: Readonly<Record<string, URL>> = {
    ...HARNESS_SOURCE_URLS,
    [`packages/${ENGINE_PACKAGE}/pkg/sheetwrite_wasm.js`]: ENGINE_GLUE_PATH,
    [`packages/${ENGINE_PACKAGE}/pkg/sheetwrite_wasm_bg.wasm`]: WASM_PATH,
  };
  const files: Record<string, string> = {};
  for (const path of FORMULA_SOURCE_FILES) {
    const url = urls[path];
    if (url === undefined) throw new Error(`formula source ${path} has no file`);
    files[path] = sha256(readFileSync(url));
  }
  const baseline_context = captureEngineBaselineContext(commit, [ENGINE_PACKAGE]);
  return {
    protocol: FORMULA_PROTOCOL,
    commit,
    files,
    ...(baseline_context === undefined ? {} : { baselineContext: baseline_context }),
    digest: formulaSourceDigest(commit, files, baseline_context),
  };
}

function runner_command(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  output_path?: string,
): string[] {
  return [
    "bun",
    "run",
    "src/formula-bench.ts",
    ...(mode === "smoke" ? ["--smoke"] : []),
    ...(capture === "preliminary" ? ["--preliminary"] : []),
    ...(capture === "output" && output_path !== undefined ? ["--output", output_path] : []),
  ];
}

/** An output capture records the path it was written to, so validation checks its shape. */
function runner_command_matches(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  command: readonly string[],
): boolean {
  if (capture !== "output") {
    return JSON.stringify(command) === JSON.stringify(runner_command(mode, capture));
  }
  const output_path = command.at(-1) ?? "";
  return (
    output_path.length > 0 &&
    JSON.stringify(command) === JSON.stringify(runner_command(mode, capture, output_path))
  );
}

export function currentRunnerProvenance(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  outputPath?: string,
): FormulaRunnerProvenance {
  return {
    command: runner_command(mode, capture, outputPath),
    bun: Bun.version,
    node: process.versions.node,
    platform: process.platform,
    kernel: release(),
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    concurrency: 1,
    gc: "Bun.gc(true) before every measured sample",
  };
}

export function formulaRegressionBaselineIdentity(baseline: FormulaBenchmarkResult): {
  commit: string;
  sourceDigest: string;
} {
  return {
    commit: baseline.meta.commit,
    sourceDigest:
      baseline.source?.digest ??
      createHash("sha256").update(JSON.stringify(baseline)).digest("hex"),
  };
}

/** The ordered gate rows a capture must contain; the runner owns them. */
export interface FormulaArtifactMatrix {
  workloadKeys(mode: BenchmarkMode, enginePackage?: FormulaEnginePackage): string[];
  legacyWorkloadKeys(): string[];
  memoryKeys(mode: BenchmarkMode): string[];
  readonly shapeRowIds: readonly string[];
}

/** A blocked capture declares why it carries no baseline comparison. */
function formula_capture_kind(regression: Record<string, unknown>): FormulaCaptureKind {
  if (regression.status === "passed") return "gated";
  if (regression.status !== "blocked") {
    throw new Error("formula regression gate has no declared status");
  }
  if (regression.blocker === PRELIMINARY_BLOCKER) return "preliminary";
  if (regression.blocker === OUTPUT_CAPTURE_BLOCKER) return "output";
  throw new Error("formula blocked result does not declare a known blocker");
}

function object_record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact_object_keys(value: unknown, expected: readonly string[], path: string): void {
  const record = object_record(value, path);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${path} must contain exactly ${wanted.join(", ")}`);
  }
}

function exact_string(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function validate_stat_shape(stat: Stat, path: string): void {
  exact_object_keys(stat, ["median", "p95", "mean", "stddev", "min", "max", "iters"], path);
}

function validate_artifact_bound(result: FormulaBenchmarkResult): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(result);
  } catch (error) {
    throw new Error(`formula artifact is not serializable: ${String(error)}`);
  }
  const bytes = Buffer.byteLength(serialized);
  if (bytes > FORMULA_ARTIFACT_MAX_BYTES) {
    throw new Error(
      `formula artifact exceeded the ${FORMULA_ARTIFACT_MAX_BYTES} byte safety ceiling: ${bytes}`,
    );
  }
}

function validate_provenance(
  result: CompleteFormulaBenchmarkResult,
  capture: FormulaCaptureKind,
): void {
  exact_object_keys(
    result.meta,
    ["bun", "platform", "arch", "commit", "dirty", "timestamp"],
    "formula metadata",
  );
  for (const field of ["bun", "platform", "arch"] as const) {
    exact_string(result.meta[field], `formula metadata.${field}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(result.meta.commit)) {
    throw new Error("formula metadata.commit must be a 40-character lowercase Git SHA");
  }
  if (typeof result.meta.dirty !== "boolean") {
    throw new Error("formula metadata.dirty must be boolean");
  }
  if (
    typeof result.meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(result.meta.timestamp)) ||
    new Date(result.meta.timestamp).toISOString() !== result.meta.timestamp
  ) {
    throw new Error("formula metadata.timestamp must be a canonical ISO timestamp");
  }

  exact_object_keys(
    result.runner,
    ["command", "bun", "node", "platform", "kernel", "arch", "cpu", "concurrency", "gc"],
    "formula runner provenance",
  );
  if (
    !Array.isArray(result.runner.command) ||
    result.runner.command.some((part) => typeof part !== "string") ||
    !runner_command_matches(result.mode, capture, result.runner.command)
  ) {
    throw new Error("formula runner provenance.command does not match the declared capture mode");
  }
  for (const field of ["bun", "node", "platform", "kernel", "arch", "cpu"] as const) {
    exact_string(result.runner[field], `formula runner provenance.${field}`);
  }
  if (
    result.runner.concurrency !== 1 ||
    result.runner.gc !== "Bun.gc(true) before every measured sample"
  ) {
    throw new Error(
      "formula runner provenance does not declare the controlled single-runner GC policy",
    );
  }
  if (
    result.runner.bun !== result.meta.bun ||
    result.runner.platform !== result.meta.platform ||
    result.runner.arch !== result.meta.arch
  ) {
    throw new Error("formula runner provenance disagrees with formula metadata");
  }

  exact_object_keys(
    result.source,
    [
      "protocol",
      "commit",
      "files",
      "digest",
      ...(result.source.baselineContext === undefined ? [] : ["baselineContext"]),
    ],
    "formula source provenance",
  );
  if (result.source.protocol !== FORMULA_PROTOCOL || result.source.commit !== result.meta.commit) {
    throw new Error("formula source provenance protocol/commit does not match metadata");
  }
  const recorded_package = formulaSourceEnginePackage(result.source.files);
  for (const path of Object.keys(result.source.files)) {
    if (!/^[0-9a-f]{64}$/u.test(result.source.files[path] ?? "")) {
      throw new Error(`formula source provenance.files.${path} must be a SHA-256 digest`);
    }
  }
  if (result.source.baselineContext !== undefined) {
    const packages = Object.keys(result.source.baselineContext.currentWasmFiles).map((path) => {
      if (path === "packages/wasm/pkg/sheetwrite_wasm_bg.wasm") return "wasm" as const;
      if (path === "packages/formulas/pkg/sheetwrite_wasm_bg.wasm") return "formulas" as const;
      throw new Error("Unexpected baseline formula engine");
    });
    if (packages.length !== 1) throw new Error("Formula baseline must identify one engine");
    validateEngineBaselineContext(result.source.baselineContext, result.source.commit, packages);
    const package_name = packages[0];
    if (recorded_package !== "wasm" && recorded_package !== package_name) {
      throw new Error("Formula baseline engine file binding mismatch");
    }
    for (const filename of ENGINE_SOURCE_FILENAMES) {
      if (
        result.source.files[`packages/${recorded_package}/pkg/${filename}`] !==
        result.source.baselineContext.engineFiles[`packages/${package_name}/pkg/${filename}`]
      ) {
        throw new Error("Formula baseline engine file binding mismatch");
      }
    }
  }
  const digest = formulaSourceDigest(
    result.source.commit,
    result.source.files,
    result.source.baselineContext,
  );
  if (result.source.digest !== digest) {
    throw new Error("formula source provenance.digest does not match its file hashes");
  }
}

function validate_allocation(
  workload: CompleteFormulaWorkloadResult,
  expected_samples: number,
  key: string,
): void {
  if (
    !Array.isArray(workload.allocationSamples) ||
    workload.allocationSamples.length !== expected_samples
  ) {
    throw new Error(`${key}.allocationSamples must contain ${expected_samples} raw samples`);
  }
  for (const [index, sample] of workload.allocationSamples.entries()) {
    exact_object_keys(
      sample,
      ["retainedBytes", "peakTransientBytes", "transientAllocations"],
      `${key}.allocationSamples[${index}]`,
    );
    exactInteger(sample.retainedBytes, `${key}.allocationSamples[${index}].retainedBytes`);
    exactInteger(
      sample.peakTransientBytes,
      `${key}.allocationSamples[${index}].peakTransientBytes`,
    );
    exactInteger(
      sample.transientAllocations,
      `${key}.allocationSamples[${index}].transientAllocations`,
    );
  }
  exact_object_keys(
    workload.allocationStat,
    ["retainedBytes", "peakTransientBytes", "transientAllocations"],
    `${key}.allocationStat`,
  );
  for (const field of ["retainedBytes", "peakTransientBytes", "transientAllocations"] as const) {
    validate_stat_shape(workload.allocationStat[field], `${key}.allocationStat.${field}`);
    validateRawStat(
      workload.allocationSamples.map((sample) => sample[field]),
      workload.allocationStat[field],
      `${key}.allocation.${field}`,
    );
  }
  if (workload.allocationStat.retainedBytes.p95 >= 512 * 1024 * 1024) {
    throw new Error(`${key} exceeded the 512 MiB attributed retained-allocation ceiling`);
  }
  if (workload.allocationStat.peakTransientBytes.p95 >= 256 * 1024 * 1024) {
    throw new Error(`${key} exceeded the 256 MiB transient-allocation ceiling`);
  }
  if (workload.allocationStat.transientAllocations.p95 >= 1_000_000) {
    throw new Error(`${key} exceeded the transient-allocation-count ceiling`);
  }
}

function assert_complete_formula_result(
  result: FormulaBenchmarkResult,
): asserts result is CompleteFormulaBenchmarkResult {
  if (
    result.schemaVersion === undefined ||
    result.runner === undefined ||
    result.source === undefined ||
    result.methodology === undefined ||
    result.blockedWorkloads === undefined ||
    result.gates.regression === undefined ||
    result.workloads.some(
      (workload) =>
        workload.allocationSamples === undefined ||
        workload.allocationStat === undefined ||
        workload.output === undefined,
    )
  ) {
    throw new Error("formula artifact is missing schema-v2 evidence fields");
  }
}

function validate_formula_evidence(
  matrix: FormulaArtifactMatrix,
  result: FormulaBenchmarkResult,
  expected_mode: BenchmarkMode,
  require_passed_gate: boolean,
  expected_workload_keys = matrix.workloadKeys(expected_mode),
): asserts result is CompleteFormulaBenchmarkResult {
  validate_artifact_bound(result);
  assertGateIdentity("formula", expected_mode, result);
  if (!Array.isArray(result.workloads)) throw new Error("formula workloads must be an array");
  for (const workload of result.workloads) {
    if (
      typeof workload.id !== "string" ||
      workload.id.length === 0 ||
      !Number.isInteger(workload.size) ||
      workload.size <= 0
    ) {
      throw new Error("formula workload contains a malformed identity");
    }
  }
  validateExactMatrix(
    "formula workload",
    expected_workload_keys,
    result.workloads.map(formulaWorkloadKey),
  );

  exact_object_keys(
    result,
    [
      "protocolVersion",
      "mode",
      "matrixId",
      "schemaVersion",
      "meta",
      "runner",
      "source",
      "methodology",
      "workloads",
      "blockedWorkloads",
      "memory",
      "gates",
    ],
    "formula artifact",
  );
  for (const workload of result.workloads) {
    exact_object_keys(
      workload,
      ["id", "size", "samplesMs", "stat", "allocationSamples", "allocationStat", "output"],
      "formula workload",
    );
  }
  assert_complete_formula_result(result);
  if (result.schemaVersion !== FORMULA_BENCHMARK_SCHEMA_VERSION) {
    throw new Error(
      `formula schema mismatch: expected ${FORMULA_BENCHMARK_SCHEMA_VERSION}, observed ${String(result.schemaVersion)}`,
    );
  }
  const regression = object_record(result.gates.regression, "formula gates.regression");
  const capture = formula_capture_kind(regression);
  validate_provenance(result, capture);

  const expected_samples = expected_mode === "smoke" ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
  exact_object_keys(
    result.methodology,
    ["warmupSamples", "measuredSamples", "timing", "allocation", "correctness"],
    "formula methodology",
  );
  if (
    result.methodology.warmupSamples !== 1 ||
    result.methodology.measuredSamples !== expected_samples ||
    result.methodology.timing !== TIMING_METHOD ||
    result.methodology.allocation !== ALLOCATION_METHOD ||
    result.methodology.correctness !== CORRECTNESS_METHOD
  ) {
    throw new Error("formula methodology does not match the declared warmup/sample protocol");
  }
  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    if (!Array.isArray(workload.samplesMs) || workload.samplesMs.length !== expected_samples) {
      throw new Error(`${key}.samplesMs must contain ${expected_samples} post-warmup raw samples`);
    }
    validate_stat_shape(workload.stat, `${key}.stat`);
    validateRawStat(workload.samplesMs, workload.stat, key);
    validate_allocation(workload, expected_samples, key);
    const expected = expectedFormulaOutput(workload.id, workload.size);
    if (!outputsEqual(workload.output, expected)) {
      throw new Error(
        `${key}.output expected ${String(expected)}, observed ${String(workload.output)}`,
      );
    }
    if (workload.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }

  if (!Array.isArray(result.blockedWorkloads)) {
    throw new Error("formula blockedWorkloads must be an array");
  }
  validateExactMatrix(
    "formula blocked workload",
    [],
    result.blockedWorkloads.map(formulaWorkloadKey),
  );

  if (!Array.isArray(result.memory)) throw new Error("formula memory must be an array");
  for (const memory of result.memory) {
    exact_object_keys(memory, ["formulas", "wasmDeltaBytes"], "formula memory");
    if (!Number.isInteger(memory.formulas) || memory.formulas <= 0) {
      throw new Error("formula memory contains a malformed identity");
    }
  }
  validateExactMatrix(
    "formula memory",
    matrix.memoryKeys(expected_mode),
    result.memory.map((memory) => `memory=formulas=${memory.formulas}`),
  );
  for (const memory of result.memory) {
    const key = `memory=formulas=${memory.formulas}`;
    assertFiniteNonNegative(memory.wasmDeltaBytes, `${key}.wasmDeltaBytes`);
    exactInteger(memory.wasmDeltaBytes, `${key}.wasmDeltaBytes`);
    if (memory.wasmDeltaBytes >= 512 * 1024 * 1024) {
      throw new Error(`${key} exceeded the 512 MiB absolute safety ceiling`);
    }
  }

  exact_object_keys(result.gates, ["passed", "tolerance", "regression"], "formula gates");
  if (result.gates.tolerance !== FORMULA_GATE_TOLERANCE) {
    throw new Error("formula gates.tolerance does not match the enforced regression policy");
  }
  if (require_passed_gate) {
    if (result.gates.passed !== true || regression.status !== "passed") {
      throw new Error("formula result does not contain a successful regression gate record");
    }
    exact_object_keys(
      regression,
      ["status", "baselineCommit", "baselineSourceDigest"],
      "formula gates.regression",
    );
    if (
      typeof regression.baselineCommit !== "string" ||
      !/^[0-9a-f]{40}$/u.test(regression.baselineCommit) ||
      typeof regression.baselineSourceDigest !== "string" ||
      !/^[0-9a-f]{64}$/u.test(regression.baselineSourceDigest)
    ) {
      throw new Error("formula regression gate has malformed baseline provenance");
    }
  } else {
    if (result.gates.passed !== false || capture === "gated") {
      throw new Error("formula blocked result must fail closed with its declared baseline blocker");
    }
    exact_object_keys(regression, ["status", "blocker"], "formula gates.regression");
  }

  if (expected_mode === "full") {
    for (const id of [
      "independent-parse-load",
      "independent-first-recompute",
      "criteria-range-edit",
      "lookup-range-edit",
      "formula-constant-edit",
      "sum-multi-range",
      "sumifs-3-criteria",
      "countif-100k",
      "sumproduct-vector-edit",
      "sumproduct-matrix-edit",
      "criteria-multi-range-edit",
      "percentile-covariance",
      "let-reuse-edit",
      "let-repeat",
      "let-many",
      ...matrix.shapeRowIds,
      "incremental-dependency-closure-edit",
      "spill-sequence-admission",
    ]) {
      const key = formulaWorkloadKey({ id, size: 100_000 });
      const workload = result.workloads.find((candidate) => formulaWorkloadKey(candidate) === key);
      if (workload === undefined) continue;
      if (workload.stat.p95 >= 5_000) {
        throw new Error(`${key} exceeded the 5 second 100K safety ceiling`);
      }
    }
    const memory100k = result.memory.find((memory) => memory.formulas === 100_000);
    if (memory100k === undefined) throw new Error("memory=formulas=100000 is missing");
    if (memory100k.wasmDeltaBytes >= 256 * 1024 * 1024) {
      throw new Error("memory=formulas=100000 exceeded the 256 MiB safety ceiling");
    }
  }
}

export function validateFormulaBenchmark(
  matrix: FormulaArtifactMatrix,
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): asserts result is CompleteFormulaBenchmarkResult {
  validate_formula_evidence(matrix, result, expectedMode, true);
}

function timing_regression_limit(baseline: number, floor_ms: number): number {
  return Math.max(baseline * TIMING_REGRESSION_RATIO, baseline + floor_ms);
}

/**
 * A workload whose baseline median is under 1 ms runs at the GC and timer
 * floor. With five samples, p95 is the slowest single sample, and the 0.5.0
 * timing-rounds A/A study measured a 33–466% spread on those rows, so they
 * gate their median only. Their median also moves with code they do not run:
 * two points of that study with the same Rust engine (#103, and #106, which
 * changed only TypeScript) differed by up to 0.29 ms, so the median floor is
 * 0.3 ms instead of 0.1 ms.
 */
const SUB_MILLISECOND_BASELINE_MS = 1;
const SUB_MILLISECOND_MEDIAN_FLOOR_MS = 0.3;

function is_sub_millisecond(baseline: FormulaWorkloadResult): boolean {
  return baseline.stat.median < SUB_MILLISECOND_BASELINE_MS;
}

function validate_legacy_formula_baseline(
  matrix: FormulaArtifactMatrix,
  result: FormulaBenchmarkResult,
): void {
  validate_artifact_bound(result);
  assertGateIdentity("formula", "full", result);
  exact_object_keys(
    result,
    ["protocolVersion", "mode", "matrixId", "meta", "workloads", "memory", "gates"],
    "legacy formula artifact",
  );
  exact_object_keys(
    result.meta,
    ["bun", "platform", "arch", "commit", "dirty", "timestamp"],
    "legacy formula metadata",
  );
  if (!/^[0-9a-f]{40}$/u.test(result.meta.commit) || typeof result.meta.dirty !== "boolean") {
    throw new Error("legacy formula metadata is malformed");
  }
  if (!Number.isFinite(Date.parse(result.meta.timestamp))) {
    throw new Error("legacy formula metadata timestamp is malformed");
  }
  validateExactMatrix(
    "legacy formula workload",
    matrix.legacyWorkloadKeys(),
    result.workloads.map(formulaWorkloadKey),
  );
  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    exact_object_keys(workload, ["id", "size", "samplesMs", "stat"], key);
    if (!Array.isArray(workload.samplesMs) || workload.samplesMs.length !== DEFAULT_SAMPLES) {
      throw new Error(`${key}.samplesMs must contain ${DEFAULT_SAMPLES} post-warmup raw samples`);
    }
    validate_stat_shape(workload.stat, `${key}.stat`);
    validateRawStat(workload.samplesMs, workload.stat, key);
    if (workload.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }
  validateExactMatrix(
    "legacy formula memory",
    matrix.memoryKeys("full"),
    result.memory.map((memory) => `memory=formulas=${memory.formulas}`),
  );
  for (const memory of result.memory) {
    exact_object_keys(memory, ["formulas", "wasmDeltaBytes"], "legacy formula memory");
    assertFiniteNonNegative(
      memory.wasmDeltaBytes,
      `memory=formulas=${memory.formulas}.wasmDeltaBytes`,
    );
  }
  exact_object_keys(result.gates, ["passed", "tolerance"], "legacy formula gates");
  if (result.gates.passed !== true || typeof result.gates.tolerance !== "string") {
    throw new Error("legacy formula baseline does not contain a successful gate");
  }
}

/**
 * An older baseline may leave out expanded workloads. Every core workload must still be listed,
 * and no key outside the current full matrix is allowed.
 */
function regression_baseline_workload_keys(
  matrix: FormulaArtifactMatrix,
  baseline: FormulaBenchmarkResult,
): string[] {
  const observed = baseline.workloads.map(formulaWorkloadKey);
  const candidates = [
    matrix.workloadKeys("full", "wasm"),
    matrix.workloadKeys("full", "formulas"),
    matrix.legacyWorkloadKeys(),
  ];
  for (const expected of candidates) {
    if (expected.length === observed.length && expected.every((key) => observed.includes(key))) {
      return expected;
    }
  }
  const observed_set = new Set(observed);
  const recognised = new Set(matrix.workloadKeys("full", "formulas"));
  const core = matrix.legacyWorkloadKeys();
  if (
    observed.length > 0 &&
    core.length > 0 &&
    core.every((key) => observed_set.has(key)) &&
    observed.every((key) => recognised.has(key))
  ) {
    return observed;
  }
  throw new Error("formula regression baseline does not match the current or legacy full matrix");
}

function validate_formula_baseline_binding(
  matrix: FormulaArtifactMatrix,
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): asserts candidate is CompleteFormulaBenchmarkResult {
  if (baseline.schemaVersion === FORMULA_BENCHMARK_SCHEMA_VERSION) {
    validate_formula_evidence(
      matrix,
      baseline,
      "full",
      true,
      regression_baseline_workload_keys(matrix, baseline),
    );
  } else {
    validate_legacy_formula_baseline(matrix, baseline);
  }
  validateFormulaBenchmark(matrix, candidate, candidate.mode);
  const baseline_identity = formulaRegressionBaselineIdentity(baseline);
  const regression = candidate.gates.regression as PassedRegressionGate;
  if (
    regression.baselineCommit !== baseline_identity.commit ||
    regression.baselineSourceDigest !== baseline_identity.sourceDigest
  ) {
    throw new Error("formula regression gate is not bound to the supplied baseline provenance");
  }
}

/** Read and validate the committed baseline, `results/formula-results.json`. */
export function readCommittedFormulaBaseline(
  matrix: FormulaArtifactMatrix,
): FormulaBenchmarkResult {
  const raw_baseline = readFileSync(
    new URL("../results/formula-results.json", import.meta.url),
    "utf8",
  );
  const baseline_bytes = Buffer.byteLength(raw_baseline);
  if (baseline_bytes > FORMULA_ARTIFACT_MAX_BYTES) {
    throw new Error(
      `formula baseline artifact exceeded the ${FORMULA_ARTIFACT_MAX_BYTES} byte safety ceiling: ${baseline_bytes}`,
    );
  }
  const baseline = JSON.parse(raw_baseline) as FormulaBenchmarkResult;
  if (baseline.schemaVersion === FORMULA_BENCHMARK_SCHEMA_VERSION) {
    validate_formula_evidence(
      matrix,
      baseline,
      "full",
      true,
      regression_baseline_workload_keys(matrix, baseline),
    );
  } else {
    validate_legacy_formula_baseline(matrix, baseline);
  }
  return baseline;
}

/** One compared gate value and the limit the baseline rule allows it. */
interface GateRow {
  row: string;
  baseline: number;
  candidate: number;
  ruleLimit: number;
}

function assert_within_gate(gate: GateRow): void {
  if (gate.candidate > gate.ruleLimit) {
    throw new Error(
      `${gate.row} regression: baseline ${gate.baseline}, candidate ${gate.candidate}, limit ${gate.ruleLimit}`,
    );
  }
}

export function validateFormulaRegression(
  matrix: FormulaArtifactMatrix,
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): void {
  validate_formula_baseline_binding(matrix, candidate, baseline);
  const baseline_workloads = new Map(
    baseline.workloads.map((workload) => [formulaWorkloadKey(workload), workload]),
  );

  let compared_workloads = 0;
  for (const workload of candidate.workloads) {
    const key = formulaWorkloadKey(workload);
    const previous = baseline_workloads.get(key);
    if (previous === undefined) continue;
    compared_workloads += 1;
    const sub_millisecond = is_sub_millisecond(previous);
    for (const field of ["median", "p95"] as const) {
      if (field === "p95" && sub_millisecond) continue;
      const before = previous.stat[field];
      assert_within_gate({
        row: `${key}.${field}`,
        baseline: before,
        candidate: workload.stat[field],
        ruleLimit: timing_regression_limit(
          before,
          sub_millisecond ? SUB_MILLISECOND_MEDIAN_FLOOR_MS : TIMING_REGRESSION_FLOOR_MS,
        ),
      });
    }
    if (previous.allocationStat !== undefined) {
      for (const allocation of [
        "retainedBytes",
        "peakTransientBytes",
        "transientAllocations",
      ] as const) {
        for (const field of ["median", "p95"] as const) {
          const before = previous.allocationStat[allocation][field];
          assert_within_gate({
            row: `${key}.allocation.${allocation}.${field}`,
            baseline: before,
            candidate: workload.allocationStat[allocation][field],
            ruleLimit: before,
          });
        }
      }
    }
  }
  if (compared_workloads === 0) {
    throw new Error("formula regression baseline has no workloads compatible with the candidate");
  }

  const baseline_memory = new Map(
    baseline.memory.map((entry) => [entry.formulas, entry.wasmDeltaBytes]),
  );
  for (const memory of candidate.memory) {
    const before = baseline_memory.get(memory.formulas);
    if (before === undefined) continue;
    assert_within_gate({
      row: `memory=formulas=${memory.formulas}.wasmDeltaBytes`,
      baseline: before,
      candidate: memory.wasmDeltaBytes,
      ruleLimit: before,
    });
  }
}

export function validateFormulaCapture(
  matrix: FormulaArtifactMatrix,
  candidate: FormulaBenchmarkResult,
  baseline?: FormulaBenchmarkResult,
): void {
  if (baseline === undefined) {
    // A release baseline's engine may predate expanded rows; see runWorkloads in formula-bench.ts.
    const older_engine =
      candidate.mode === "full" && candidate.source?.baselineContext !== undefined;
    validate_formula_evidence(
      matrix,
      candidate,
      candidate.mode,
      false,
      older_engine ? regression_baseline_workload_keys(matrix, candidate) : undefined,
    );
  } else if (candidate.mode === "smoke") {
    validate_formula_baseline_binding(matrix, candidate, baseline);
  } else {
    validateFormulaRegression(matrix, candidate, baseline);
  }
}

/**
 * A recorded full capture, such as the shared capture inside full-engine
 * evidence. It may predate workloads added to the matrix since, under the
 * same rule as a regression baseline: every core workload is listed and no
 * key is outside the current full matrix.
 */
export function validateRecordedFormulaCapture(
  matrix: FormulaArtifactMatrix,
  capture: FormulaBenchmarkResult,
): void {
  validate_formula_evidence(
    matrix,
    capture,
    capture.mode,
    false,
    regression_baseline_workload_keys(matrix, capture),
  );
}

export function validateCurrentCaptureProvenance(
  result: CompleteFormulaBenchmarkResult,
  capture: FormulaCaptureKind,
  outputPath?: string,
): void {
  const current_source = currentFormulaSourceProvenance(result.meta.commit);
  if (JSON.stringify(result.source) !== JSON.stringify(current_source)) {
    throw new Error("formula capture source provenance does not match current source bytes");
  }
  const current_runner = currentRunnerProvenance(result.mode, capture, outputPath);
  if (JSON.stringify(result.runner) !== JSON.stringify(current_runner)) {
    throw new Error("formula capture runner provenance does not match the current runner");
  }
}
