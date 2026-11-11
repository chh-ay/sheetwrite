import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";
import * as defaultEngine from "@sheetwrite/wasm";

const ENGINE_PACKAGE = process.env.SHEETWRITE_BENCH_ENGINE === "full" ? "formulas" : "wasm";
/**
 * The paired formula gate runs this harness once per side and points this at
 * the side's checkout. Only the engine package comes from there, so an older
 * base needs built engine artifacts, not this benchmark code. The checkout is
 * chosen at run time, so its loader can only be imported dynamically.
 */
const ENGINE_ROOT = process.env.SHEETWRITE_BENCH_ENGINE_ROOT;
const engine: typeof defaultEngine =
  ENGINE_ROOT === undefined
    ? ENGINE_PACKAGE === "formulas"
      ? formulas
      : defaultEngine
    : await import(
        pathToFileURL(resolve(ENGINE_ROOT, `packages/${ENGINE_PACKAGE}/loader-node.mjs`)).href
      );
const { CellStore, initSync } = engine;
// Fixtures run on either provider, so they use the store type both share.
type CellStore = InstanceType<defaultEngine.EngineInstance["CellStore"]>;
/** The version-history diff kernel, from the same checkout as the engine. */
const historyKernel: typeof import("@sheetwrite/wasm/history") = await import(
  pathToFileURL(
    resolve(
      ENGINE_ROOT ?? fileURLToPath(new URL("../..", import.meta.url)),
      "packages/wasm/history-node.mjs",
    ),
  ).href
);
await historyKernel.loadHistoryKernel();

import { optionValue } from "./cli-options.js";
import {
  dependencyClosureFormulas,
  diamondFormulas,
  distinctRangeFormulas,
  type FormulaCell,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "./formula-dataset.js";
import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type EngineBaselineContext,
  captureEngineBaselineContext,
  validateEngineBaselineContext,
  type GateIdentity,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import { protocolCaptureMeta } from "./protocol-meta.js";
import { forceGc, mib, ms, now, type Stat, summarize } from "./stats.js";

// Check every entry path before it can load or measure the selected baseline.
if (ENGINE_ROOT !== undefined) {
  captureEngineBaselineContext(protocolCaptureMeta().commit, [ENGINE_PACKAGE]);
}

const ENGINE_PKG_URL =
  ENGINE_ROOT === undefined
    ? new URL(`../../packages/${ENGINE_PACKAGE}/pkg/`, import.meta.url)
    : pathToFileURL(`${resolve(ENGINE_ROOT, `packages/${ENGINE_PACKAGE}/pkg`)}/`);
const WASM_PATH = new URL("sheetwrite_wasm_bg.wasm", ENGINE_PKG_URL);
const ENGINE_GLUE_PATH = new URL("sheetwrite_wasm.js", ENGINE_PKG_URL);
const HARNESS_SOURCE_URLS = {
  "bench/package.json": new URL("../package.json", import.meta.url),
  "bench/src/formula-bench.ts": new URL("./formula-bench.ts", import.meta.url),
  "bench/src/formula-dataset.ts": new URL("./formula-dataset.ts", import.meta.url),
  "bench/src/gate-protocol.ts": new URL("./gate-protocol.ts", import.meta.url),
  "bench/src/protocol-meta.ts": new URL("./protocol-meta.ts", import.meta.url),
  "bench/src/stats.ts": new URL("./stats.ts", import.meta.url),
  "bun.lock": new URL("../../bun.lock", import.meta.url),
} as const;
const ENGINE_SOURCE_FILENAMES = ["sheetwrite_wasm.js", "sheetwrite_wasm_bg.wasm"] as const;
type FormulaEnginePackage = "wasm" | "formulas";

/** The provenance keys of a capture that measured the engine in `packages/<enginePackage>`. */
function formulaSourceFiles(enginePackage: FormulaEnginePackage): string[] {
  return [
    ...Object.keys(HARNESS_SOURCE_URLS),
    ...ENGINE_SOURCE_FILENAMES.map((filename) => `packages/${enginePackage}/pkg/${filename}`),
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
  const enginePackage =
    "packages/formulas/pkg/sheetwrite_wasm_bg.wasm" in files ? "formulas" : "wasm";
  exactObjectKeys(files, formulaSourceFiles(enginePackage), "formula source provenance.files");
  return enginePackage;
}

export const FORMULA_BENCHMARK_SCHEMA_VERSION = 2 as const;
export const FORMULA_SIZES = [1_000, 10_000, 100_000] as const;
/** The provenance keys this process records, for the engine it loads. */
export const FORMULA_SOURCE_FILES = formulaSourceFiles(ENGINE_PACKAGE);
export const FORMULA_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_SAMPLES = 5;
const SMOKE_SAMPLES = 2;
export const FORMULA_PROTOCOL = "formula-benchmark-v2";
const TIMING_REGRESSION_RATIO = 1.25;
const TIMING_REGRESSION_FLOOR_MS = 0.1;
const STORE_MEMORY_SCHEMA = 3;
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

export function formulaWorkloadKey(workload: Pick<FormulaWorkloadResult, "id" | "size">): string {
  return `workload=${workload.id};size=${workload.size}`;
}

/**
 * The workload matrix of a capture. The full engine adds the rows for
 * functions that only it has.
 */
export function expectedFormulaWorkloadKeys(
  mode: BenchmarkMode,
  enginePackage: FormulaEnginePackage = ENGINE_PACKAGE,
): string[] {
  const smoke = mode === "smoke";
  const keys: string[] = [];
  for (const size of smoke ? [1_000] : FORMULA_SIZES) {
    keys.push(
      formulaWorkloadKey({ id: "independent-parse-load", size }),
      formulaWorkloadKey({ id: "independent-first-recompute", size }),
    );
  }
  for (const size of smoke ? [8, 32] : [8, 16, 32, 64]) {
    keys.push(formulaWorkloadKey({ id: "linear-chain", size }));
  }
  const large = smoke ? 1_000 : 100_000;
  const range = smoke ? 10_000 : 100_000;
  const lookupFormulas = smoke ? 500 : 1_000;
  keys.push(
    formulaWorkloadKey({ id: "wide-fan-out-edit", size: 1_000 }),
    ...(smoke ? [] : [formulaWorkloadKey({ id: "wide-fan-out-edit", size: large })]),
    formulaWorkloadKey({ id: "diamond-edit", size: 32 }),
    formulaWorkloadKey({ id: "shared-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "distinct-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "cross-sheet-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-0", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-1", size: 1 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-1000", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-100000", size: large }),
    formulaWorkloadKey({ id: "formula-constant-edit", size: large }),
    formulaWorkloadKey({ id: "topology-remove-add", size: smoke ? 1_000 : 10_000 }),
    formulaWorkloadKey({ id: "cycles", size: 1_000 }),
    formulaWorkloadKey({ id: "removed-sheet-ref", size: 1_000 }),
    formulaWorkloadKey({ id: "error-propagation", size: 1_000 }),
    formulaWorkloadKey({ id: "criteria-range-edit", size: range }),
    formulaWorkloadKey({ id: "lookup-range-edit", size: range }),
    ...LOOKUP_VARIANTS.flatMap((variant) => [
      formulaWorkloadKey({ id: variant.id, size: lookupFormulas }),
      formulaWorkloadKey({ id: `${variant.id}${LOOKUP_EDIT_SUFFIX}`, size: lookupFormulas }),
    ]),
    ...(smoke ? [MIXED_LOOKUP_SMOKE_ROWS] : MIXED_LOOKUP_SIZES).map((size) =>
      formulaWorkloadKey({ id: "xlookup-mixed-exact", size }),
    ),
    formulaWorkloadKey({ id: "spill-filter-resize", size: range }),
    formulaWorkloadKey({ id: "sumproduct-vector-edit", size: range }),
    formulaWorkloadKey({ id: "sumproduct-matrix-edit", size: range }),
    formulaWorkloadKey({ id: "criteria-multi-range-edit", size: range }),
    formulaWorkloadKey({ id: "sum-multi-range", size: range }),
    formulaWorkloadKey({ id: "sumifs-3-criteria", size: range }),
    formulaWorkloadKey({ id: "countif-100k", size: range }),
    formulaWorkloadKey({ id: "unicode-text-date-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "percentile-covariance", size: range }),
    formulaWorkloadKey({ id: "let-reuse-edit", size: range }),
    formulaWorkloadKey({ id: "let-repeat", size: range }),
    ...(smoke ? [1_000] : LET_MANY_SIZES).map((size) =>
      formulaWorkloadKey({ id: "let-many", size }),
    ),
    ...SHAPE_ROW_IDS.flatMap((id) =>
      (smoke ? [1_000] : SHAPE_ROW_SIZES).map((size) => formulaWorkloadKey({ id, size })),
    ),
    ...BINDING_ROW_IDS.flatMap((id) =>
      (smoke ? [1_000] : BINDING_ROW_SIZES).map((size) => formulaWorkloadKey({ id, size })),
    ),
    formulaWorkloadKey({ id: "iterative-finance", size: 1_000 }),
    formulaWorkloadKey({ id: "incremental-dependency-closure-edit", size: range }),
    formulaWorkloadKey({ id: "paged-cell-reads", size: range }),
    formulaWorkloadKey({ id: "paged-insert-row", size: smoke ? PAGED_SMOKE_ROWS : PAGED_ROWS }),
    formulaWorkloadKey({ id: "paged-range-loaded", size: smoke ? PAGED_SMOKE_ROWS : PAGED_ROWS }),
    formulaWorkloadKey({
      id: "paged-eviction",
      size: smoke ? PAGED_EVICTION_SMOKE_PAGES : PAGED_EVICTION_PAGES,
    }),
    formulaWorkloadKey({ id: "index-match-many", size: smoke ? 50 : INDEX_MATCH_FORMULAS }),
    formulaWorkloadKey({ id: "rank-many", size: smoke ? 1_000 : RANK_MANY_SIZE }),
    formulaWorkloadKey({ id: "sort-unique-filter", size: range }),
    formulaWorkloadKey({ id: "subtotal-filtered", size: range }),
    formulaWorkloadKey({ id: "sparse-page-write", size: range }),
  );
  keys.push(formulaWorkloadKey({ id: "spill-sequence-admission", size: smoke ? 1_000 : 100_000 }));
  keys.push(formulaWorkloadKey({ id: "history-diff", size: HISTORY_CELLS }));
  if (enginePackage === "formulas") keys.push(...fullEngineRowKeys(smoke));
  return keys;
}

const EXPANDED_FORMULA_WORKLOAD_IDS = new Set([
  "xlookup-mixed-exact",
  "formula-constant-edit",
  "vlookup-many",
  "vlookup-many-edit",
  "vlookup-many-sorted",
  "vlookup-many-sorted-edit",
  "xlookup-many",
  "xlookup-many-edit",
  "xlookup-many-sorted",
  "xlookup-many-sorted-edit",
  "text-lookup-many",
  "text-lookup-many-edit",
  "text-lookup-many-sorted",
  "text-lookup-many-sorted-edit",
  "sum-multi-range",
  "sumifs-3-criteria",
  "countif-100k",
  "let-repeat",
  "let-many",
  "round-many",
  "concat-many",
  "offset-many",
  "indirect-many",
  "let-calls",
  "name-define",
  "row-insert-names",
  "table-append-row",
  "sort-formula-column",
  "parse-load-qualified",
  "parse-load-table",
  "memory-import",
  "history-diff",
  "groupby-sum",
  "pivotby-percentof",
  "pivot-rebuild",
  "getpivotdata-many",
  "analysis-calls",
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
  "paged-cell-reads",
  "paged-insert-row",
  "paged-range-loaded",
  "paged-eviction",
  "index-match-many",
  "rank-many",
  "sort-unique-filter",
  "subtotal-filtered",
  "sparse-page-write",
]);

function legacyFormulaBaselineWorkloadKeys(): string[] {
  return expectedFormulaWorkloadKeys("full", "wasm").filter((key) => {
    const id = key.slice("workload=".length, key.indexOf(";size="));
    return !EXPANDED_FORMULA_WORKLOAD_IDS.has(id);
  });
}

export function expectedFormulaBlockedWorkloadKeys(): string[] {
  return [];
}

export function expectedFormulaMemoryKeys(mode: BenchmarkMode): string[] {
  const sizes = mode === "smoke" ? [1_000] : FORMULA_SIZES;
  return sizes.map((formulas) => `memory=formulas=${formulas}`);
}

function diamondOutput(levels: number): number {
  let expected = 2;
  for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
  return expected;
}

export function expectedFormulaOutput(id: string, size: number): FormulaOutput {
  const lookup = lookupVariantOutput(id);
  if (lookup !== undefined) return lookup;
  switch (id) {
    case "independent-parse-load":
    case "independent-first-recompute":
    case "linear-chain":
      return size;
    case "wide-fan-out-edit":
    case "scalar-edit-affects-1":
    case "scalar-edit-affects-1000":
    case "scalar-edit-affects-100000":
      return size + 10;
    case "scalar-edit-affects-0":
      return size + 1;
    case "formula-constant-edit":
      return `${CONSTANT_EDIT_FILL + CONSTANT_EDIT_EDITED_BASE}:${size + CONSTANT_EDIT_FILL}`;
    case "diamond-edit":
      return diamondOutput(size);
    case "shared-range-edit":
      return 101;
    case "distinct-range-edit":
      return "11:10";
    case "cross-sheet-range-edit":
      return size + 100;
    case "topology-remove-add":
      return `2:${size}`;
    case "cycles":
      return "#CYCLE!";
    case "removed-sheet-ref":
      return "#REF!";
    case "error-propagation":
      return "#DIV/0!";
    case "criteria-range-edit":
      return size - Math.floor(size / 2) + 1;
    case "xlookup-mixed-exact":
      return mixedLookupOutput(size);
    case "lookup-range-edit":
      return (size - 1) * 2;
    case "spill-filter-resize":
      return `${size - 1}:0`;
    case "sumproduct-vector-edit":
      return size * 11 + 4;
    case "sumproduct-matrix-edit":
      return size * 2 + 4;
    case "criteria-multi-range-edit":
      return size * 0.75 - 1;
    case "sum-multi-range":
      // Compared as text: the relative tolerance would hide a small error in a 5-billion total.
      return `${(size * (size - 1)) / 2 + size * SUM_MULTI_RANGE_FILL}`;
    case "sumifs-3-criteria":
      return sumifsCriteriaTotal(size);
    case "countif-100k":
      return size - Math.floor(size / COUNTIF_MATCH_SHARE);
    case "unicode-text-date-edit":
      return 173_864;
    case "percentile-covariance":
      return (size * size - 1) / 6 + size * 0.9 + 0.1;
    case "let-reuse-edit":
      return 3 * (size + 1);
    case "let-repeat":
      return `${LET_REPEAT_FACTOR * LOOKUP_RESULT_FACTOR * (size - 1)}:${size - 1}`;
    case "let-many": {
      const x = size * LET_MANY_EDITED_SCALE;
      return x + (x + 1) + (x + 1) * x;
    }
    case "round-many":
      return Number(((size + ROUND_MANY_FRACTION) * SHAPE_EDITED_SCALE).toFixed(2));
    case "concat-many":
      return `item${(size - 1) % CONCAT_MANY_LABELS} ${CONCAT_MANY_EDITED_SUFFIX}`;
    case "offset-many":
    case "indirect-many":
      return size + SHAPE_EDITED_SCALE;
    case "let-calls": {
      const x = size * SHAPE_EDITED_SCALE + 1;
      const y = Math.round((x / 3) * 100) / 100;
      return x + y + y * x;
    }
    case "name-define":
    case "row-insert-names":
      return (size - NAMED_FORMULA_STRIDE + 1) * NAME_SCALE;
    case "table-append-row":
      return ((size + 1) * (size + 2)) / 2;
    case "sort-formula-column":
      return 2 * (sortedSourceRow(size, size - 1) + 1);
    case "parse-load-qualified":
      return size;
    case "parse-load-table":
    case "memory-import":
      return size * 2;
    case "groupby-sum":
      return groupingEditedTotal(size);
    case "pivotby-percentof":
      return groupingFirstQuarterShare(size);
    case "pivot-rebuild":
      return pivotRebuildOutput(size);
    case "getpivotdata-many":
      return pivotDataValue(size - 1);
    case "analysis-calls":
      return analysisCallsOutput(size);
    case "history-diff":
      return historyDiffOutput();
    case "iterative-finance":
      return 0.08663094803653158 + 0.08144165646436567;
    case "incremental-dependency-closure-edit":
      return `12:${size + 1}`;
    case "spill-sequence-admission":
      return `1:${size}:0`;
    case "paged-cell-reads":
      return pagedCellReadsOutput(size);
    case "paged-insert-row":
      return pagedInsertRowOutput(size);
    case "paged-range-loaded":
      return 1;
    case "paged-eviction":
      return pagedEvictionOutput(size);
    case "index-match-many":
      return INDEX_MATCH_VALUE_SCALE * (SHAPE_EDITED_SCALE + size - 1);
    case "rank-many":
      return `${size}:${RANK_MANY_EDITED_FIRST}`;
    case "sort-unique-filter":
      return sortUniqueOutput(SORT_UNIQUE_EDITED_ROWS);
    case "subtotal-filtered":
      return subtotalOutput(size, SUBTOTAL_EDITED_FIRST);
    case "sparse-page-write":
      return sparsePageOutput(size);
    default:
      throw new Error(`formula benchmark has no expected output for workload=${id};size=${size}`);
  }
}

interface TimedFixture {
  store: CellStore;
  run(): void;
  check(): FormulaOutput;
  dispose(): void;
  /**
   * Return the store to its state before `run`, recalculated, so the same
   * edit can be timed again on this fixture. Only edit workloads define it:
   * load and first-recalculation runs consume state that no edit can restore.
   */
  restore?(): void;
}

type FixtureFactory = () => TimedFixture;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`formula benchmark correctness failure: ${message}`);
}

function setFormulas(store: CellStore, sheet: number, formulas: readonly FormulaCell[]): void {
  for (const formula of formulas) {
    store.setFormula(sheet, formula.row, formula.col, formula.src, 0);
  }
}

function numberAt(store: CellStore, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}

function textAt(store: CellStore, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}

function numericColumn(count: number, value: (row: number) => number): Float64Array {
  return Float64Array.from({ length: count }, (_, row) => value(row));
}

function outputsEqual(actual: FormulaOutput, expected: FormulaOutput): boolean {
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "string" || typeof expected === "string") return actual === expected;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= tolerance;
}

function exactInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
}

function allocationAt(store: CellStore): FormulaAllocationSample {
  const memory = Array.from(store.memoryStats());
  const ownerCount = memory[1];
  assert(
    memory[0] === STORE_MEMORY_SCHEMA &&
      Number.isInteger(ownerCount) &&
      ownerCount! > 0 &&
      memory.length === 5 + ownerCount! * 3,
    "store memory stats schema",
  );
  const retainedBytes = memory.at(-1)!;
  const transient = Array.from(store.formulaMatrixResourceStats());
  assert(transient.length === 3, "formula matrix resource stats schema");
  const sample = {
    retainedBytes,
    peakTransientBytes: transient[1]!,
    transientAllocations: transient[2]!,
  };
  exactInteger(sample.retainedBytes, "allocation.retainedBytes");
  exactInteger(sample.peakTransientBytes, "allocation.peakTransientBytes");
  exactInteger(sample.transientAllocations, "allocation.transientAllocations");
  return sample;
}

function summarizeAllocations(samples: readonly FormulaAllocationSample[]): FormulaAllocationStat {
  return {
    retainedBytes: summarize(samples.map((sample) => sample.retainedBytes)),
    peakTransientBytes: summarize(samples.map((sample) => sample.peakTransientBytes)),
    transientAllocations: summarize(samples.map((sample) => sample.transientAllocations)),
  };
}

/** Untimed fixture runs allowed inside one aggregated sample before it is abandoned. */
export const AGGREGATED_SAMPLE_MAX_ITERATIONS = 1_000_000;
/** Default aggregation floor (ms) of the single-sample runner used by the matched engine protocol. */
export const SAMPLE_AGGREGATE_MS = 50;
/** Default untimed warm-up fixture runs of the single-sample runner. */
export const SAMPLE_WARMUP_FIXTURES = 3;

/** Knobs for one aggregated timing sample: a wall-clock total over repeated fixture runs. */
export interface AggregatedSampleOptions {
  /** Untimed fixture runs before the timed loop; each one also checks correctness. */
  readonly warmupFixtures: number;
  /**
   * Keep warming up, unchecked, until the warm-up runs add up to this many
   * milliseconds. For rows whose engine code is still being optimised by the
   * JavaScript engine after `warmupFixtures` runs; zero or absent adds none.
   */
  readonly minimumWarmupMs?: number;
  /** Timed fixture runs repeat until their total wall time reaches this floor. */
  readonly minimumSampleDurationMs: number;
}

/**
 * One aggregated sample. `samplesMs` holds the per-iteration mean so a sample
 * stays comparable across workloads, while `totalMs` and `iterations` keep the
 * raw duration and the repetition count auditable.
 */
export interface AggregatedWorkloadSample extends CompleteFormulaWorkloadResult {
  readonly iterations: number;
  readonly totalMs: number;
  readonly warmupFixtures: number;
}

/**
 * Run and check the untimed warm-up fixtures, then keep running unchecked
 * warm-ups until they add up to `minimumWarmupMs`. A restorable fixture is
 * returned restored, ready for the timed loop.
 */
function warmUpFixtures(
  id: string,
  factory: FixtureFactory,
  warmupFixtures: number,
  minimumWarmupMs: number,
  expected: FormulaOutput,
): TimedFixture | undefined {
  if (!Number.isInteger(warmupFixtures) || warmupFixtures < 1) {
    throw new RangeError("warmupFixtures must be a positive integer");
  }
  if (!Number.isFinite(minimumWarmupMs) || minimumWarmupMs < 0) {
    throw new RangeError("minimumWarmupMs must be a non-negative number");
  }
  let fixture: TimedFixture | undefined;
  const started = now();
  for (let index = 0; index < warmupFixtures || now() - started < minimumWarmupMs; index += 1) {
    if (index >= AGGREGATED_SAMPLE_MAX_ITERATIONS) {
      throw new RangeError(`${id} did not finish its ${minimumWarmupMs} ms warm-up`);
    }
    fixture ??= factory();
    fixture.store.resetFormulaMatrixResourceStats();
    fixture.run();
    if (index < warmupFixtures) {
      assert(outputsEqual(fixture.check(), expected), `${id} warmup output`);
      allocationAt(fixture.store);
    }
    if (fixture.restore === undefined) {
      fixture.dispose();
      fixture = undefined;
    } else {
      fixture.restore();
    }
  }
  return fixture;
}

/**
 * Collect one aggregated timing sample: untimed warm-up fixtures first, then
 * repeated timed runs until their summed time reaches `minimumSampleDurationMs`.
 * A single run of a cheap workload sits close to timer and scheduler noise; the
 * aggregate averages that noise away while keeping one auditable sample.
 *
 * A fixture that can restore itself is built once and restored, untimed,
 * between runs; others get a fresh fixture per run. Every run repeats the same
 * work, so only the first and last runs are checked. The store-wide checks cost
 * far more than a microsecond edit and would otherwise dominate the sample's
 * wall time. Allocation comes from the first run, so the exact byte rule does
 * not depend on how many edit/restore cycles fit into the time floor.
 */
export function collectAggregatedSample(
  id: string,
  size: number,
  factory: FixtureFactory,
  options: AggregatedSampleOptions,
  expectedOutput?: FormulaOutput,
): AggregatedWorkloadSample {
  if (!Number.isFinite(options.minimumSampleDurationMs) || options.minimumSampleDurationMs <= 0) {
    throw new RangeError("minimumSampleDurationMs must be a positive number");
  }
  const expected = expectedOutput ?? expectedFormulaOutput(id, size);
  let fixture =
    warmUpFixtures(id, factory, options.warmupFixtures, options.minimumWarmupMs ?? 0, expected) ??
    factory();

  // One forced GC brackets the whole sample: a per-iteration GC would dominate
  // the cheap workloads the aggregate exists to measure.
  forceGc();
  let totalMs = 0;
  let iterations = 0;
  let allocation: FormulaAllocationSample | undefined;
  for (;;) {
    fixture.store.resetFormulaMatrixResourceStats();
    const started = now();
    fixture.run();
    totalMs += now() - started;
    iterations += 1;
    if (allocation === undefined) {
      allocation = allocationAt(fixture.store);
      assert(outputsEqual(fixture.check(), expected), `${id} first measured output`);
    }
    if (totalMs >= options.minimumSampleDurationMs) break;
    if (iterations >= AGGREGATED_SAMPLE_MAX_ITERATIONS) {
      throw new RangeError(
        `${id} did not reach ${options.minimumSampleDurationMs} ms within ${AGGREGATED_SAMPLE_MAX_ITERATIONS} fixture runs`,
      );
    }

    if (fixture.restore === undefined) {
      fixture.dispose();
      fixture = factory();
    } else {
      fixture.restore();
    }
  }

  assert(allocation !== undefined, `${id} first measured allocation`);
  assert(outputsEqual(fixture.check(), expected), `${id} last measured output`);
  fixture.dispose();
  assert(Number.isFinite(totalMs), `${id} measured duration`);

  const perIterationMs = totalMs / iterations;
  return {
    id,
    size,
    samplesMs: [perIterationMs],
    stat: summarize([perIterationMs]),
    allocationSamples: [allocation],
    allocationStat: summarizeAllocations([allocation]),
    output: expected,
    iterations,
    totalMs,
    warmupFixtures: options.warmupFixtures,
  };
}

export function collectFixture(
  id: string,
  size: number,
  factory: FixtureFactory,
  samples = DEFAULT_SAMPLES,
  expectedOutput?: FormulaOutput,
): CompleteFormulaWorkloadResult {
  const expected = expectedOutput ?? expectedFormulaOutput(id, size);
  const warm = factory();
  warm.store.resetFormulaMatrixResourceStats();
  warm.run();
  assert(outputsEqual(warm.check(), expected), `${id} warmup output`);
  allocationAt(warm.store);
  warm.dispose();

  const raw = new Array<number>(samples);
  const allocationSamples = new Array<FormulaAllocationSample>(samples);
  let output = expected;
  for (let index = 0; index < samples; index++) {
    const fixture = factory();
    forceGc();
    fixture.store.resetFormulaMatrixResourceStats();
    const started = now();
    fixture.run();
    raw[index] = now() - started;
    allocationSamples[index] = allocationAt(fixture.store);
    output = fixture.check();
    assert(outputsEqual(output, expected), `${id} measured output`);
    fixture.dispose();
  }
  return {
    id,
    size,
    samplesMs: raw,
    stat: summarize(raw),
    allocationSamples,
    allocationStat: summarizeAllocations(allocationSamples),
    output,
  };
}

function independentLoadFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  const formulas = independentFormulas(count);
  return {
    store,
    run: () => setFormulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count - 1, 1);
    },
    dispose: () => store.free(),
  };
}

function independentRecomputeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function chainFixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, linearChain(depth));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, depth - 1, 0),
    dispose: () => store.free(),
  };
}

/** A1 starts at the source value; the timed edit writes the edited value to A1, or to unrelated C1. */
const FAN_OUT_SOURCE_VALUE = 1;
const FAN_OUT_EDITED_VALUE = 10;

function fanOutEditFixture(count: number, unrelated = false): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, Math.max(1, count));
  const editedColumn = unrelated ? 2 : 0;
  store.setNumber(sheet, 0, 0, FAN_OUT_SOURCE_VALUE, 0);
  setFormulas(store, sheet, fanOutFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, editedColumn, FAN_OUT_EDITED_VALUE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      if (unrelated) store.clearCell(sheet, 0, editedColumn, 0);
      else store.setNumber(sheet, 0, editedColumn, FAN_OUT_SOURCE_VALUE, 0);
      store.recompute(sheet);
    },
  };
}

/** Column B holds a fill value; the timed edit rewrites the literal of one formula only. */
const CONSTANT_EDIT_FILL = 10;
const CONSTANT_EDIT_BASE = 1;
const CONSTANT_EDIT_EDITED_BASE = 2;

export function constantEditFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => CONSTANT_EDIT_FILL),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 2, `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_EDITED_BASE}`, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_BASE}`, 0);
      store.recompute(sheet);
    },
  };
}

/** Measure the single-cell transaction used by Grid, not the scalar WASM adapter. */
export function gridConstantEditSample(count: number) {
  const store = new SheetwriteStore(
    {
      activeSheet: "constant-edit",
      sheets: [
        {
          id: "constant-edit",
          name: "Constant edit",
          rowCount: count,
          columns: ["a", "b", "c"].map((id) => ({
            id,
            key: id,
            header: id,
            width: 100,
            type: "number" as const,
          })),
        },
      ],
    },
    {
      rowCount: count,
      columns: {
        a: Array.from({ length: count }, (_, row) => row),
        b: Array.from({ length: count }, () => CONSTANT_EDIT_FILL),
        c: Array.from({ length: count }, (_, row) => ({
          kind: "formula" as const,
          src: `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`,
        })),
      },
    },
  );
  try {
    const samplesMs: number[] = [];
    // Alternate constants so every sample is a real source replacement.
    for (let sample = 0; sample < 12; sample++) {
      const constant = sample % 2 === 0 ? CONSTANT_EDIT_EDITED_BASE : CONSTANT_EDIT_BASE;
      const started = now();
      const result = store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "constant-edit", row: 0, col: 2 },
            value: { kind: "formula", src: `=A1+B1+${constant}` },
          },
        ],
      });
      const elapsedMs = now() - started;
      assert(result.status === "applied", "Grid constant edit must apply");
      assert(
        store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved ===
          CONSTANT_EDIT_FILL + constant,
        "Grid constant edit output",
      );
      if (sample >= 2) samplesMs.push(elapsedMs);
    }
    const output = `${store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved}:${store.getCell({ sheet: "constant-edit", row: count - 1, col: 2 }).resolved}`;
    return {
      id: "grid-formula-constant-edit",
      size: count,
      samplesMs,
      stat: summarize(samplesMs),
      output,
    };
  } finally {
    store.dispose();
  }
}

/** Undo a timed one-cell number edit, untimed, so the next timed edit repeats the same work. */
function restoreNumber(
  store: CellStore,
  sheet: number,
  cell: { row: number; col: number; value: number },
): () => void {
  return () => {
    store.setNumber(sheet, cell.row, cell.col, cell.value, 0);
    store.recompute(sheet);
  };
}

function diamondFixture(levels: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, levels);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, diamondFormulas(levels));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, levels - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sharedRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, Math.max(count, 100));
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  setFormulas(store, sheet, sharedRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function distinctRangeFixture(count: number): TimedFixture {
  const rows = count * 10;
  const store = new CellStore();
  const sheet = store.addSheet(2, rows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(rows, () => 1),
    0,
  );
  setFormulas(store, sheet, distinctRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function crossSheetFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 100);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setColumnNumbers(
    source,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(summary, row, 0, `=SUM(Source!A1:A100)+${row}`, 0);
  }
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.setNumber(source, 0, 0, 2, 0);
      store.recompute(source);
    },
    check: () => numberAt(store, summary, count - 1, 0),
    dispose: () => store.free(),
    restore: restoreNumber(store, source, { row: 0, col: 0, value: 1 }),
  };
}

function topologyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      for (let row = 0; row < count; row += 2) store.clearCell(sheet, row, 1, 0);
      store.recompute(sheet);
      for (let row = 0; row < count; row += 2) {
        store.setFormula(sheet, row, 1, `=A${row + 1}+2`, 0);
      }
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
  };
}

function cycleFixture(pairs: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, pairs);
  for (let row = 0; row < pairs; row++) {
    store.setFormula(sheet, row, 0, `=B${row + 1}`, 0);
    store.setFormula(sheet, row, 1, `=A${row + 1}`, 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, pairs - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function refRemovalFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 1);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setNumber(source, 0, 0, 1, 0);
  for (let row = 0; row < count; row++) store.setFormula(summary, row, 0, "=Source!A1", 0);
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.removeSheet(source);
    },
    check: () => textAt(store, summary, count - 1, 0) ?? "",
    dispose: () => store.free(),
  };
}

function errorPropagationFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, count - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function criteriaRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const threshold = Math.floor(count / 2);
  store.setFormula(sheet, 0, 2, `=SUMIF(A1:A${count},">=${threshold}",B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

function lookupRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row * 2),
    0,
  );
  store.setNumber(sheet, 0, 2, 0, 0);
  store.setFormula(sheet, 0, 3, `=XLOOKUP(C1,A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: 0 }),
  };
}

/** Every lookup scenario pairs ten ascending table rows with each lookup formula. */
const LOOKUP_TABLE_ROWS_PER_FORMULA = 10;
const LOOKUP_RESULT_FACTOR = 2;
const NUMERIC_LOOKUP_INITIAL_KEY = 5;
const NUMERIC_LOOKUP_EDITED_KEY = 7;
const NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY = 5.5;
const NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY = 7.5;
const TEXT_LOOKUP_KEY_PREFIX = "ITEM";
const TEXT_LOOKUP_QUERY_PREFIX = "ItEm";
const TEXT_LOOKUP_KEY_PADDING = 6;
const TEXT_LOOKUP_INITIAL_ROW = 12;
const TEXT_LOOKUP_EDITED_ROW = 37;
const TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW = 11;
const TEXT_LOOKUP_APPROXIMATE_ROW = 36;

/** Ascending numeric key column plus a result column that scales with the key. */
function lookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** Zero-padded text keys stay ascending under the case-insensitive lookup comparison. */
function textLookupKeyAt(row: number): string {
  return `${TEXT_LOOKUP_KEY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** The query key differs from the stored key only by letter case. */
function textLookupQueryKey(row: number): string {
  return `${TEXT_LOOKUP_QUERY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** Sorts between the stored keys of `row` and `row + 1`, so only approximate matching can land. */
function textLookupBetweenQueryKey(row: number): string {
  return `${textLookupQueryKey(row)}5`;
}

/** Ascending text key column plus the same result column as the numeric table. */
function textLookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    store.setString(sheet, row, 0, textLookupKeyAt(row), 0);
  }
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** The shared key cell takes a number for numeric tables and text for text tables. */
function writeLookupKey(store: CellStore, sheet: number, key: number | string): void {
  if (typeof key === "number") store.setNumber(sheet, 0, 2, key, 0);
  else store.setString(sheet, 0, 2, key, 0);
}

interface LookupVariant {
  readonly id: string;
  readonly table: (tableRows: number) => { store: CellStore; sheet: number };
  readonly formula: (tableRows: number) => string;
  readonly initialKey: number | string;
  readonly editedKey: number | string;
  readonly initialValue: number;
  readonly editedValue: number;
}

/** Each lookup function runs once as a first-recalculation workload and once as a key-edit one. */
const LOOKUP_EDIT_SUFFIX = "-edit";

const LOOKUP_VARIANTS: readonly LookupVariant[] = [
  {
    id: "vlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,FALSE)`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "vlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows},,-1,2)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many",
    table: textLookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: textLookupQueryKey(TEXT_LOOKUP_INITIAL_ROW),
    editedKey: textLookupQueryKey(TEXT_LOOKUP_EDITED_ROW),
    initialValue: (TEXT_LOOKUP_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_EDITED_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many-sorted",
    table: textLookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW),
    editedKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_ROW),
    initialValue: (TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_APPROXIMATE_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
];

/** Every lookup workload reports the shared result plus the key its formulas were last queried with. */
function lookupVariantOutput(id: string): FormulaOutput | undefined {
  const editsKey = id.endsWith(LOOKUP_EDIT_SUFFIX);
  const baseId = editsKey ? id.slice(0, -LOOKUP_EDIT_SUFFIX.length) : id;
  const variant = LOOKUP_VARIANTS.find((candidate) => candidate.id === baseId);
  if (variant === undefined) return undefined;
  return editsKey
    ? `${variant.editedValue}:${variant.editedKey}`
    : `${variant.initialValue}:${variant.initialKey}`;
}

/** The two timed units of a lookup workload; each one has its own workload id. */
type LookupPhase = "first-recompute" | "key-edit";

/**
 * One shared key cell in C1 drives every lookup formula. The timed unit is either the first
 * recalculation of all formulas or one key edit with its recalculation; afterwards every formula
 * is read outside the timed interval and compared with the value computed here.
 */
function lookupFixture(count: number, phase: LookupPhase, variant: LookupVariant): TimedFixture {
  const tableRows = count * LOOKUP_TABLE_ROWS_PER_FORMULA;
  const { store, sheet } = variant.table(tableRows);
  writeLookupKey(store, sheet, variant.initialKey);
  const source = variant.formula(tableRows);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 3, source, 0);
  const editsKey = phase === "key-edit";
  const expectedValue = editsKey ? variant.editedValue : variant.initialValue;
  const expectedKey = editsKey ? variant.editedKey : variant.initialKey;
  // The edit phase starts from computed values, so its timed unit is the key edit alone.
  if (editsKey) store.recompute(sheet);
  return {
    store,
    run: () => {
      if (editsKey) writeLookupKey(store, sheet, variant.editedKey);
      store.recompute(sheet);
    },
    check: () => {
      for (let row = 0; row < count; row++) {
        const value = numberAt(store, sheet, row, 3);
        assert(
          value === expectedValue,
          `${variant.id} row ${row} expected ${expectedValue}, observed ${value}`,
        );
      }
      return `${expectedValue}:${expectedKey}`;
    },
    dispose: () => store.free(),
    ...(editsKey && {
      restore: () => {
        writeLookupKey(store, sheet, variant.initialKey);
        store.recompute(sheet);
      },
    }),
  };
}

/** Key-table sizes of the mixed-type exact lookup rows. */
const MIXED_LOOKUP_SIZES = [10_000, 100_000] as const;
const MIXED_LOOKUP_SMOKE_ROWS = 1_000;

/** Table rows per lookup formula of the mixed-type rows. */
const MIXED_LOOKUP_ROWS_PER_FORMULA = 10;

/** Even rows hold numbers and odd rows text, so one key column mixes types. */
function mixedLookupKeyAt(row: number): number | string {
  return row % 2 === 0 ? row : `Key${row}`;
}

/** Formula `formula` looks up table row `formula * 10 + formula % 2`, so the
 * keys alternate between numbers and text. Text keys differ from the table
 * only in case. */
function mixedLookupRowOf(formula: number): number {
  return formula * MIXED_LOOKUP_ROWS_PER_FORMULA + (formula % 2);
}

function mixedLookupOutput(tableRows: number): string {
  const last = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA - 1;
  return `${mixedLookupRowOf(last) + 1}`;
}

/**
 * Exact `XLOOKUP`s on one key column that mixes numbers and text. The timed
 * unit is the first recalculation of all formulas; every result is checked
 * outside the timed interval.
 */
function mixedLookupFixture(tableRows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    const key = mixedLookupKeyAt(row);
    if (typeof key === "number") store.setNumber(sheet, row, 0, key, 0);
    else store.setString(sheet, row, 0, key, 0);
  }
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );

  const formulas = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA;
  for (let formula = 0; formula < formulas; formula++) {
    const key = mixedLookupKeyAt(mixedLookupRowOf(formula));
    if (typeof key === "number") store.setNumber(sheet, formula, 2, key, 0);
    else store.setString(sheet, formula, 2, key.toLowerCase(), 0);
    store.setFormula(
      sheet,
      formula,
      3,
      `=XLOOKUP(C${formula + 1},A1:A${tableRows},B1:B${tableRows})`,
      0,
    );
  }

  return {
    store,
    run: () => store.recompute(sheet),
    check: () => {
      for (let formula = 0; formula < formulas; formula++) {
        const value = numberAt(store, sheet, formula, 3);
        const expected = mixedLookupRowOf(formula) + 1;
        assert(
          value === expected,
          `xlookup-mixed-exact row ${formula} expected ${expected}, observed ${value}`,
        );
      }
      return mixedLookupOutput(tableRows);
    },
    dispose: () => store.free(),
  };
}

function spillFilterResizeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  for (let row = 0; row < count; row++) store.setBool(sheet, row, 1, row + 1 < count, 0);
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setBool(sheet, count - 1, 1, true, 0);
      store.recompute(sheet);
    },
    check: () =>
      `${numberAt(store, sheet, count - 1, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setBool(sheet, count - 1, 1, false, 0);
      store.recompute(sheet);
    },
  };
}

function spillSequenceAdmissionFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  store.setFormula(sheet, 0, 0, `=SEQUENCE(${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () =>
      `${numberAt(store, sheet, 0, 0)}:${numberAt(store, sheet, count - 1, 0)}:${store.spillAnchorRow(sheet, count - 1, 0)}`,
    dispose: () => store.free(),
  };
}

function sumProductVectorFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => (row % 10) + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 2),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUMPRODUCT(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sumProductMatrixFixture(elements: number): TimedFixture {
  const columns = 10;
  const rows = elements / columns;
  assert(Number.isInteger(rows), "SUMPRODUCT matrix shape");
  const store = new CellStore();
  const sheet = store.addSheet(columns * 2 + 1, rows);
  for (let col = 0; col < columns; col++) {
    store.setColumnNumbers(
      sheet,
      col,
      0,
      numericColumn(rows, () => 1),
      0,
    );
    store.setColumnNumbers(
      sheet,
      columns + col,
      0,
      numericColumn(rows, () => 2),
      0,
    );
  }
  store.setFormula(sheet, 0, columns * 2, `=SUMPRODUCT(A1:J${rows},K1:T${rows})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, columns * 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function criteriaMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  store.setColumnNumbers(
    sheet,
    2,
    0,
    numericColumn(count, () => 2),
    0,
  );
  const threshold = count / 2;
  store.setFormula(
    sheet,
    0,
    3,
    `=SUMIFS(C1:C${count},A1:A${count},">=${threshold}",B1:B${count},1)+COUNTIFS(A1:A${count},"<${threshold}",B1:B${count},0)`,
    0,
  );
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Column B repeats one fill value, so the two-range total is closed-form. */
const SUM_MULTI_RANGE_FILL = 2;
const COUNTIF_MATCH_SHARE = 2;

function sumMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => SUM_MULTI_RANGE_FILL),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUM(A1:A${count},B1:B${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => `${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
  };
}

/** Criteria rows repeat every six rows: odd, divisible by three, and past the halfway threshold. */
const SUMIFS_CRITERIA_PERIOD = 6;
const SUMIFS_CRITERIA_OFFSET = 3;
const SUMIFS_TEXT_MATCH = "keep";
const SUMIFS_TEXT_OTHER = "skip";

function sumifsCriteriaTotal(count: number): number {
  const threshold = Math.floor(count / COUNTIF_MATCH_SHARE);
  let total = 0;
  for (let row = SUMIFS_CRITERIA_OFFSET; row < count; row += SUMIFS_CRITERIA_PERIOD) {
    if (row >= threshold) total += row + 1;
  }
  return total;
}

function sumifsCriteriaFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(5, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setString(
      sheet,
      row,
      2,
      row % (SUMIFS_CRITERIA_PERIOD / 2) === 0 ? SUMIFS_TEXT_MATCH : SUMIFS_TEXT_OTHER,
      0,
    );
  }
  store.setColumnNumbers(
    sheet,
    3,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setFormula(
    sheet,
    0,
    4,
    `=SUMIFS(D1:D${count},A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}",B1:B${count},1,C1:C${count},"${SUMIFS_TEXT_MATCH}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 4),
    dispose: () => store.free(),
  };
}

function countifFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setFormula(
    sheet,
    0,
    1,
    `=COUNTIF(A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
  };
}

function unicodeTextDateFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=UNICODE(MID($A$1,5,1))+DATEVALUE(RIGHT($A$1,10))", 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setString(sheet, 0, 0, "naïv😀-2024-03-01", 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
      store.recompute(sheet);
    },
  };
}

function percentileCovarianceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => 2 * (row + 1) + 3),
    0,
  );
  store.setFormula(
    sheet,
    0,
    2,
    `=PERCENTILE.INC(A1:A${count},0.9)+COVARIANCE.P(A1:A${count},B1:B${count})`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function letReuseFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, () => 1),
    0,
  );
  store.setFormula(sheet, 0, 1, `=LET(total,SUM(A1:A${count}),total+total+total)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/** The `let-many` sizes: a normal sheet and a large one. */
const LET_MANY_SIZES = [10_000, 100_000] as const;
/** Every `let-many` formula reads this scale from `$C$1`, so one edit dirties all of them. */
const LET_MANY_SCALE = 2;
const LET_MANY_EDITED_SCALE = 3;

/**
 * Rows for formula shapes the other rows do not exercise: ROUND, text
 * concatenation, OFFSET, INDIRECT and LETs that bind function calls, one
 * formula per row. Each formula reads `$C$1`, so the timed edit recalculates
 * all of them.
 */
const SHAPE_ROW_IDS = [
  "round-many",
  "concat-many",
  "offset-many",
  "indirect-many",
  "let-calls",
] as const;
const SHAPE_ROW_SIZES = [10_000, 100_000] as const;
const SHAPE_SCALE = 2;
const SHAPE_EDITED_SCALE = 3;
/** Column A's fractional part: a multiple of it never ends in a rounding tie at two places. */
const ROUND_MANY_FRACTION = 0.1234;
/** Column A cycles through this many text labels. */
const CONCAT_MANY_LABELS = 97;
const CONCAT_MANY_SUFFIX = "a";
const CONCAT_MANY_EDITED_SUFFIX = "b";

/** A sheet with one formula per row in column B; `$C$1` holds what the timed edit changes. */
function shapeRowsFixture(
  count: number,
  fill: (store: CellStore, sheet: number, rows: number) => void,
  formula: (row: number) => string,
  source: string | number,
  edited: string | number,
  check: (store: CellStore, sheet: number) => number | string,
): TimedFixture {
  const store = new CellStore();
  // OFFSET and INDIRECT read up to `SHAPE_EDITED_SCALE` rows below the last formula.
  const rows = count + SHAPE_EDITED_SCALE;
  const sheet = store.addSheet(3, rows);
  fill(store, sheet, rows);
  const setSource = (value: string | number) =>
    typeof value === "string"
      ? store.setString(sheet, 0, 2, value, 0)
      : store.setNumber(sheet, 0, 2, value, 0);
  setSource(source);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, formula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      setSource(edited);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: () => {
      setSource(source);
      store.recompute(sheet);
    },
  };
}

function numbersInA(fraction = 0): (store: CellStore, sheet: number, rows: number) => void {
  return (store, sheet, rows) =>
    store.setColumnNumbers(
      sheet,
      0,
      0,
      numericColumn(rows, (row) => row + 1 + fraction),
      0,
    );
}

function shapeRowFixture(id: (typeof SHAPE_ROW_IDS)[number], count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => numberAt(store, sheet, count - 1, 1);
  switch (id) {
    case "round-many":
      return shapeRowsFixture(
        count,
        numbersInA(ROUND_MANY_FRACTION),
        (row) => `=ROUND(A${row + 1}*$C$1,2)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "concat-many":
      return shapeRowsFixture(
        count,
        (store, sheet, rows) => {
          for (let row = 0; row < rows; row++) {
            store.setString(sheet, row, 0, `item${row % CONCAT_MANY_LABELS}`, 0);
          }
        },
        (row) => `=A${row + 1}&" "&$C$1`,
        CONCAT_MANY_SUFFIX,
        CONCAT_MANY_EDITED_SUFFIX,
        (store, sheet) => textAt(store, sheet, count - 1, 1) ?? "",
      );
    case "offset-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        (row) => `=OFFSET(A${row + 1},$C$1,0)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "indirect-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        () => `=INDIRECT("A"&(ROW()+$C$1))`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "let-calls":
      return shapeRowsFixture(
        count,
        numbersInA(),
        letCallsFormula,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
  }
}

/** `let-many` with function-call bindings: even rows one, odd rows three. */
function letCallsFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0
    ? `=LET(x,ROUND(${source},2),x+x+x)`
    : `=LET(x,SUM(${source},1),y,ROUND(x/3,2),z,y*x,x+y+z)`;
}

/**
 * Rows for binding formulas to sheets, names and tables: defining names, a
 * row insert in a workbook with names, a table that grows by a row, a sort
 * that moves formulas, loading formulas that name another sheet or a table
 * column, and restoring a released engine from its memory state.
 */
const BINDING_ROW_IDS = [
  "name-define",
  "row-insert-names",
  "table-append-row",
  "sort-formula-column",
  "parse-load-qualified",
  "parse-load-table",
  "memory-import",
] as const;
const BINDING_ROW_SIZES = [10_000, 100_000] as const;
/** Defined names `Scale_0`…`Scale_9`; each points at one cell holding `NAME_SCALE`. */
const BINDING_NAMES = 10;
/** One formula in this many uses a name; the others are plain. */
const NAMED_FORMULA_STRIDE = 10;
const NAME_SCALE = 2;
/** Sorting moves row `i` to row `(i * SORT_STRIDE) % rows`; prime, so it permutes every size. */
const SORT_STRIDE = 7_919;

function bindingName(index: number): string {
  return `Scale_${index}`;
}

/** Every `NAMED_FORMULA_STRIDE`th formula multiplies by a defined name, the others by 2. */
function namedRowFormula(row: number, cell: string): string {
  const scale =
    row % NAMED_FORMULA_STRIDE === 0
      ? bindingName((row / NAMED_FORMULA_STRIDE) % BINDING_NAMES)
      : String(NAME_SCALE);
  return `=${cell}*${scale}`;
}

/** Points the names at `C1`…`C10` of `sheet`, one name at a time. */
function defineBindingNames(store: CellStore, sheet: number): void {
  for (let index = 0; index < BINDING_NAMES; index++) {
    assert(
      store.setNamedRange(bindingName(index), -1, sheet, index, 2, index, 2),
      "binding name defined",
    );
  }
}

/** Column A holds 1…count, column B a formula per row, and C1:C10 the values the names point at. */
function namedFormulasSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, namedRowFormula(row, `A${row + 1}`), 0);
  }
  return sheet;
}

/** The value of the last formula that uses a name, `offset` rows below where it was written. */
function lastNamedFormula(store: CellStore, sheet: number, count: number, offset = 0): number {
  return numberAt(store, sheet, count - NAMED_FORMULA_STRIDE + offset, 1);
}

/**
 * The formulas exist before the names, as when a workbook defines its names
 * after its formulas. The timed run defines the ten names one at a time.
 */
function nameDefineFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      defineBindingNames(store, sheet);
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count),
    dispose: () => store.free(),
    restore: () => {
      for (let index = 0; index < BINDING_NAMES; index++) {
        store.removeNamedRange(bindingName(index), -1);
      }
      store.recompute(sheet);
    },
  };
}

/** The timed run inserts one row above everything, so every formula and name moves. */
function rowInsertNamesFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  defineBindingNames(store, sheet);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      assert(store.addRows(sheet, 0, 1), "row inserted");
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.removeRows(sheet, 0, 1), "row removed");
      store.recompute(sheet);
    },
  };
}

/** Table `Sales` over A:B with a header row: `Amount` holds numbers, `Double` is `=[@Amount]*2`. */
function setSalesTable(store: CellStore, sheet: number, bodyRows: number): void {
  assert(
    store.setTable(
      "sales",
      "Sales",
      sheet,
      0,
      0,
      bodyRows,
      1,
      true,
      false,
      ["amount", "double"],
      ["Amount", "Double"],
    ),
    "table set",
  );
}

/** A sheet whose rows 1…count are the body of `Sales`, with `Amount` 1…count and room for one more row. */
function salesSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(4, count + 2);
  store.setString(sheet, 0, 0, "Amount", 0);
  store.setString(sheet, 0, 1, "Double", 0);
  store.setColumnNumbers(
    sheet,
    0,
    1,
    numericColumn(count, (row) => row + 1),
    0,
  );
  setSalesTable(store, sheet, count);
  return sheet;
}

const TABLE_ROW_FORMULA = "=[@Amount]*2";

/**
 * Every body row has `=[@Amount]*2`, and D1 sums the column. The timed run
 * appends a row the way a user does: a value, the table grown by one row,
 * and the column's formula in the new row.
 */
function tableAppendRowFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  for (let row = 1; row <= count; row++) {
    store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
  }
  store.setFormula(sheet, 0, 3, "=SUM(Sales[Amount])", 0);
  store.recompute(sheet);
  const added = count + 1;
  return {
    store,
    run: () => {
      store.setNumber(sheet, added, 0, added, 0);
      setSalesTable(store, sheet, added);
      store.setFormula(sheet, added, 1, TABLE_ROW_FORMULA, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: () => {
      setSalesTable(store, sheet, count);
      store.clearCell(sheet, added, 1, 0);
      store.clearCell(sheet, added, 0, 0);
      store.recompute(sheet);
    },
  };
}

/** The source row that sorting moves to target row `row`. */
function sortedSourceRow(rows: number, row: number): number {
  return (row * SORT_STRIDE) % rows;
}

/** Column A holds 1…count and column B `=A{r}*2`. The timed run sorts A:B by a fixed shuffle. */
function sortFormulaColumnFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, `=A${row + 1}*2`, 0);
  }
  store.recompute(sheet);
  const order = Uint32Array.from({ length: count }, (_, row) => sortedSourceRow(count, row));
  const inverse = new Uint32Array(count);
  for (const [target, source] of order.entries()) inverse[source] = target;
  return {
    store,
    run: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, order) === 0, "rows sorted");
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, inverse) === 0, "rows unsorted");
      store.recompute(sheet);
    },
  };
}

/** Loads `=Data!A{r}+Data!B{r}` into a second sheet; A holds the row and B holds 1. */
function parseLoadQualifiedFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(2, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  store.setColumnNumbers(
    data,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    data,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const formulas = Array.from({ length: count }, (_, row) => `=Data!A${row + 1}+Data!B${row + 1}`);
  return {
    store,
    run: () => {
      for (const [row, formula] of formulas.entries()) store.setFormula(calc, row, 0, formula, 0);
    },
    check: () => {
      store.recompute(calc);
      return numberAt(store, calc, count - 1, 0);
    },
    dispose: () => store.free(),
  };
}

/** Loads `=[@Amount]*2` into every body row of `Sales`. */
function parseLoadTableFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  return {
    store,
    run: () => {
      for (let row = 1; row <= count; row++) {
        store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
      }
    },
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count, 1);
    },
    dispose: () => store.free(),
  };
}

/**
 * A released engine's state restored: formulas on `Calc` read `Data`, and
 * every tenth one also uses a defined name. The timed run imports the state
 * exported at setup.
 */
function memoryImportFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(3, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  store.setColumnNumbers(
    data,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    data,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  defineBindingNames(store, data);
  for (let row = 0; row < count; row++) {
    store.setFormula(calc, row, 0, namedRowFormula(row, `Data!A${row + 1}`), 0);
  }
  store.recompute(calc);
  const state = store.exportMemoryState();
  let imported: CellStore | undefined;
  return {
    store,
    run: () => {
      imported = CellStore.importMemoryState(state);
    },
    check: () => {
      assert(imported, "memory state imported");
      imported.recompute(calc);
      return numberAt(imported, calc, count - 1, 0);
    },
    dispose: () => {
      imported?.free();
      store.free();
    },
    restore: () => {
      imported?.free();
      imported = undefined;
    },
  };
}

function bindingRowFixture(id: (typeof BINDING_ROW_IDS)[number], count: number): TimedFixture {
  switch (id) {
    case "name-define":
      return nameDefineFixture(count);
    case "row-insert-names":
      return rowInsertNamesFixture(count);
    case "table-append-row":
      return tableAppendRowFixture(count);
    case "sort-formula-column":
      return sortFormulaColumnFixture(count);
    case "parse-load-qualified":
      return parseLoadQualifiedFixture(count);
    case "parse-load-table":
      return parseLoadTableFixture(count);
    case "memory-import":
      return memoryImportFixture(count);
  }
}

/**
 * Rows for the full engine's grouping, pivot and analysis functions, which
 * the default engine does not have: GROUPBY with SUM and PIVOTBY with
 * PERCENTOF over two text key levels, a pivot table built again, many
 * GETPIVOTDATA cells, and one formula per row that calls four analysis
 * functions.
 */
const FULL_ENGINE_ROWS = [
  { id: "groupby-sum", size: 100_000, smokeSize: 1_000 },
  // Here PIVOTBY charges between 29 and 40 units of its 2,000,000-unit work
  // budget per source row: 70,000 rows already give #NUM!.
  { id: "pivotby-percentof", size: 50_000, smokeSize: 1_000 },
  { id: "pivot-rebuild", size: 100_000, smokeSize: 1_000 },
  { id: "getpivotdata-many", size: 1_000, smokeSize: 100 },
  // 100,000 formulas took 0.19 s per edit natively on the Mac; 10,000 make 40,000 calls.
  { id: "analysis-calls", size: 10_000, smokeSize: 1_000 },
] as const;
type FullEngineRowId = (typeof FULL_ENGINE_ROWS)[number]["id"];

function fullEngineRowKeys(smoke: boolean): string[] {
  return FULL_ENGINE_ROWS.map(({ id, size, smokeSize }) =>
    formulaWorkloadKey({ id, size: smoke ? smokeSize : size }),
  );
}

/** Keys of the grouping rows: ten regions, each with ten of the hundred products. */
const GROUPING_REGIONS = 10;
const GROUPING_PRODUCTS = 100;
const GROUPING_QUARTERS = 4;
/** Each run of this many source rows shares a quarter, so quarters mix with products. */
const GROUPING_QUARTER_RUN = 7;
const GROUPING_AMOUNT = 1;
const GROUPING_EDITED_AMOUNT = 2;
const GROUPING_AMOUNT_COL = 2;
const GROUPING_QUARTER_COL = 3;
/** Source in A:D; the formula spills from F1. */
const GROUPING_FORMULA_COL = 5;
const GROUPING_KEY_FIELDS = 2;
/** One row per product, one subtotal per region and the grand total. */
const GROUPING_OUTPUT_ROWS = GROUPING_PRODUCTS + GROUPING_REGIONS + 1;
/** The two key columns, a column per quarter and the total. */
const GROUPING_OUTPUT_COLS = GROUPING_KEY_FIELDS + GROUPING_QUARTERS + 1;

function groupingQuarter(row: number): number {
  return Math.floor(row / GROUPING_QUARTER_RUN) % GROUPING_QUARTERS;
}

/** The sum of the amounts after the timed edit, which raises the first one. */
function groupingEditedTotal(rows: number): number {
  return rows * GROUPING_AMOUNT + GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
}

/** The first quarter's share of the edited total; the edited first row is in it. */
function groupingFirstQuarterShare(rows: number): number {
  let firstQuarter = GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
  for (let row = 0; row < rows; row++) {
    if (groupingQuarter(row) === 0) firstQuarter += GROUPING_AMOUNT;
  }
  return firstQuarter / groupingEditedTotal(rows);
}

/**
 * Source rows in A:D: region text `R0`…`R9`, product text `P00`…`P99` (each
 * product in one region), the amount, and quarter text `Q0`…`Q3`. `formula`
 * goes in F1; the timed run edits the first amount.
 */
function groupingFixture(
  rows: number,
  formula: string,
  check: (store: CellStore, sheet: number) => number,
): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(GROUPING_FORMULA_COL + GROUPING_OUTPUT_COLS, rows);
  const textColumn = (col: number, text: (row: number) => string) =>
    store.setColumnStrings(
      sheet,
      col,
      0,
      Array.from({ length: rows }, (_, row) => text(row)),
      0,
    );
  textColumn(0, (row) => `R${row % GROUPING_REGIONS}`);
  textColumn(1, (row) => `P${String(row % GROUPING_PRODUCTS).padStart(2, "0")}`);
  store.setColumnNumbers(
    sheet,
    GROUPING_AMOUNT_COL,
    0,
    numericColumn(rows, () => GROUPING_AMOUNT),
    0,
  );
  textColumn(GROUPING_QUARTER_COL, (row) => `Q${groupingQuarter(row)}`);
  store.setFormula(sheet, 0, GROUPING_FORMULA_COL, formula, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, GROUPING_AMOUNT_COL, GROUPING_EDITED_AMOUNT, 0);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, {
      row: 0,
      col: GROUPING_AMOUNT_COL,
      value: GROUPING_AMOUNT,
    }),
  };
}

/** `GROUPBY` with SUM by region and product, with subtotals; checks the grand total. */
function groupBySumFixture(rows: number): TimedFixture {
  const last = GROUPING_OUTPUT_ROWS - 1;
  return groupingFixture(rows, `=GROUPBY(A1:B${rows},C1:C${rows},SUM,0,2)`, (store, sheet) =>
    numberAt(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
  );
}

/**
 * `PIVOTBY` with PERCENTOF of the grand total, by region and product with
 * subtotals and by quarter with a total; checks the first quarter's share in
 * the grand-total row.
 */
function pivotByPercentOfFixture(rows: number): TimedFixture {
  // One header row holds the quarters.
  const last = GROUPING_OUTPUT_ROWS;
  return groupingFixture(
    rows,
    `=PIVOTBY(A1:B${rows},D1:D${rows},C1:C${rows},PERCENTOF,0,2,,1,,,2)`,
    (store, sheet) => numberAt(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
  );
}

/**
 * Pivot sources: a header row `Field0`…`Field5`, then fields 0–3 hold the
 * row's decimal digits from the last (`row % 10`, `row / 10 % 10`, …) and
 * fields 4 and 5 hold `row + 4` and `row + 5`, as in the pivot benchmark.
 */
const PIVOT_FIELDS = 6;
const PIVOT_DIGIT_FIELDS = 4;
const PIVOT_DIGITS = 10;
const PIVOT_SUM_FIELD = 4;
const PIVOT_SUM = 0;
const PIVOT_AVERAGE = 2;
const PIVOT_AVERAGE_FIELD = 5;
/** Totals, subtotals and headers. */
const PIVOT_ALL_TOTALS = 7;
const PIVOT_NO_NAME = -1;
const PIVOT_RANGE_SOURCE = 0;
const PIVOT_OUTPUT_ROWS = 2_000;
const PIVOT_OUTPUT_COLS = 32;

function pivotSourceSheet(store: CellStore, rows: number): number {
  const sheet = store.addSheet(PIVOT_FIELDS, rows + 1);
  for (let field = 0; field < PIVOT_FIELDS; field++) {
    store.setString(sheet, 0, field, `Field${field}`, 0);
    const values = numericColumn(rows, (row) =>
      field < PIVOT_DIGIT_FIELDS
        ? Math.floor(row / PIVOT_DIGITS ** field) % PIVOT_DIGITS
        : row + field,
    );
    store.setColumnNumbers(sheet, field, 1, values, 0);
  }
  return sheet;
}

/** The packed definition `setPivots` takes, anchored at A1, with every total. */
function pivotDefinition(
  source: number,
  rows: number,
  axes: { rowFields: number[]; colFields: number[]; values: [number, number][] },
): Float64Array {
  return new Float64Array([
    0,
    PIVOT_RANGE_SOURCE,
    source,
    0,
    0,
    rows,
    PIVOT_FIELDS - 1,
    0,
    0,
    axes.rowFields.length,
    ...axes.rowFields,
    axes.colFields.length,
    ...axes.colFields,
    axes.values.length,
    ...axes.values.flatMap(([field, aggregation]) => [field, aggregation, PIVOT_NO_NAME]),
    0,
    0,
    PIVOT_ALL_TOTALS,
  ]);
}

const PIVOT_ID = "pivot";

/** A store whose engine has pivot tables: the full engine. */
type PivotStore = CellStore &
  Pick<InstanceType<typeof formulas.CellStore>, "setPivots" | "pivotStatus">;

function hasPivots(store: CellStore): store is PivotStore {
  return "setPivots" in store && "pivotStatus" in store;
}

/**
 * The pivot benchmark's pivot: three row fields, one column field, SUM and
 * AVERAGE. The timed run installs it and recalculates; restoring removes it.
 */
function pivotRebuildFixture(rows: number): TimedFixture {
  const store = new CellStore();
  assert(hasPivots(store), "the full engine has pivot tables");
  const source = pivotSourceSheet(store, rows);
  const output = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  store.commitSources();
  const definition = pivotDefinition(source, rows, {
    rowFields: [0, 1, 2],
    colFields: [3],
    values: [
      [PIVOT_SUM_FIELD, PIVOT_SUM],
      [PIVOT_AVERAGE_FIELD, PIVOT_AVERAGE],
    ],
  });
  // The first leaf group's SUM: below the column and value headers.
  const leafRow = PIVOT_DIGIT_FIELDS;
  return {
    store,
    run: () => {
      assert(store.setPivots(output, definition, [PIVOT_ID]), "pivot installed");
      store.recompute(output);
    },
    check: () => {
      assert(store.pivotStatus(output)[0] === 0, "pivot built");
      return numberAt(store, output, leafRow, 1);
    },
    dispose: () => store.free(),
    restore: () => {
      assert(store.setPivots(output, new Float64Array(), []), "pivot removed");
      store.recompute(output);
    },
  };
}

/** The first leaf group holds every row whose four digit fields are 0. */
function pivotRebuildOutput(rows: number): number {
  const stride = PIVOT_DIGITS ** PIVOT_DIGIT_FIELDS;
  let sum = 0;
  for (let row = 0; row < rows; row += stride) sum += row + PIVOT_SUM_FIELD;
  return sum;
}

/** Source rows of the pivot that `getpivotdata-many` reads: 100 groups of 100. */
const PIVOT_DATA_SOURCE_ROWS = 10_000;
const PIVOT_DATA_EDIT = 1;
const PIVOT_DATA_EDITED = 2;

/** The item pair that GETPIVOTDATA cell `index` names. */
function pivotDataItems(index: number): [number, number] {
  return [index % PIVOT_DIGITS, Math.floor(index / PIVOT_DIGITS) % PIVOT_DIGITS];
}

/** Sum of field 4 over the source rows whose last two digits are `first` and `second`. */
function pivotDataValue(index: number): number {
  const [first, second] = pivotDataItems(index);
  let sum = 0;
  for (let row = first + second * PIVOT_DIGITS; row < PIVOT_DATA_SOURCE_ROWS; row += 100) {
    sum += row + PIVOT_SUM_FIELD;
  }
  return sum;
}

/**
 * A pivot on sheet `Pivot` sums field 4 by fields 0 and 1; `count` cells on
 * another sheet read it with `GETPIVOTDATA`. GETPIVOTDATA is volatile, so the
 * timed edit of an unrelated cell recalculates all of them.
 */
function getPivotDataManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  assert(hasPivots(store), "the full engine has pivot tables");
  const source = pivotSourceSheet(store, PIVOT_DATA_SOURCE_ROWS);
  const pivot = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  const calc = store.addSheet(2, count);
  store.setSheetName(pivot, "pivot", "Pivot");
  store.commitSources();
  assert(
    store.setPivots(
      pivot,
      pivotDefinition(source, PIVOT_DATA_SOURCE_ROWS, {
        rowFields: [0, 1],
        colFields: [],
        values: [[PIVOT_SUM_FIELD, PIVOT_SUM]],
      }),
      [PIVOT_ID],
    ),
    "pivot installed",
  );
  store.recompute(pivot);
  store.setNumber(calc, 0, 0, PIVOT_DATA_EDIT, 0);
  for (let index = 0; index < count; index++) {
    const [first, second] = pivotDataItems(index);
    store.setFormula(
      calc,
      index,
      1,
      `=GETPIVOTDATA("Sum of Field4",Pivot!$A$1,"Field0",${first},"Field1",${second})`,
      0,
    );
  }
  store.recompute(calc);
  return {
    store,
    run: () => {
      store.setNumber(calc, 0, 0, PIVOT_DATA_EDITED, 0);
      store.recompute(calc);
    },
    check: () => numberAt(store, calc, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, calc, { row: 0, col: 0, value: PIVOT_DATA_EDIT }),
  };
}

const ANALYSIS_PREFIX = "ab";

/**
 * One formula per row with four analysis functions: SUMSQ, AGGREGATE (SUM,
 * ignoring errors), FORECAST.LINEAR and TEXTBEFORE. Each reads `$C$1`, so the
 * timed edit recalculates all of them. FORECAST.LINEAR fits `$A$2:$A$3` (2, 3)
 * over `$A$1:$A$2` (1, 2), the line y = x + 1.
 */
function analysisCallsFixture(count: number): TimedFixture {
  return shapeRowsFixture(
    count,
    numbersInA(),
    (row) =>
      `=SUMSQ(A${row + 1},$C$1)+AGGREGATE(9,6,A${row + 1},$C$1)` +
      `+FORECAST.LINEAR(A${row + 1},$A$2:$A$3,$A$1:$A$2)` +
      `+LEN(TEXTBEFORE("${ANALYSIS_PREFIX}-"&A${row + 1}&$C$1,"-"))`,
    SHAPE_SCALE,
    SHAPE_EDITED_SCALE,
    (store, sheet) => numberAt(store, sheet, count - 1, 1),
  );
}

/** The last formula, after the edit: its row holds `count` and `$C$1` holds the edited scale. */
function analysisCallsOutput(count: number): number {
  const scale = SHAPE_EDITED_SCALE;
  const sumOfSquares = count * count + scale * scale;
  const sum = count + scale;
  const forecast = count + 1;
  return sumOfSquares + sum + forecast + ANALYSIS_PREFIX.length;
}

function fullEngineRowFixture(id: FullEngineRowId, size: number): TimedFixture {
  switch (id) {
    case "groupby-sum":
      return groupBySumFixture(size);
    case "pivotby-percentof":
      return pivotByPercentOfFixture(size);
    case "pivot-rebuild":
      return pivotRebuildFixture(size);
    case "getpivotdata-many":
      return getPivotDataManyFixture(size);
    case "analysis-calls":
      return analysisCallsFixture(size);
  }
}

/**
 * The version-history diff kernel on the version-history benchmark's sheet:
 * 5,000 rows by 20 columns, with 12,000 logged writes. The timed run diffs one
 * page of 1,000 changes, as a diff request does: it creates the kernel, logs
 * the writes, and compares the windows of both versions until the page is
 * full. The engine's window bytes are captured at setup, so the row times the
 * kernel only.
 */
const HISTORY_ROWS = 5_000;
const HISTORY_COLS = 20;
const HISTORY_CELLS = HISTORY_ROWS * HISTORY_COLS;
const HISTORY_WRITES = 12_000;
const HISTORY_AUTHORS = 8;
/** One diff page; it is also the number of changed cells, so the page ends at the last one. */
const HISTORY_PAGE = 1_000;
/** Changed cell `k` is in row `HISTORY_CHANGE_STRIDE * k + HISTORY_CHANGE_ROW`. */
const HISTORY_CHANGE_STRIDE = 5;
const HISTORY_CHANGE_ROW = 2;
const HISTORY_CHANGE_COL_STRIDE = 7;
const HISTORY_CHANGE = 0.5;
/** Earlier writes land on row `(i * HISTORY_WRITE_STRIDE) % HISTORY_ROWS`; prime, so they spread. */
const HISTORY_WRITE_STRIDE = 7_919;
/** The version-history diff reads windows of about this many cells. */
const HISTORY_WINDOW_CELLS = 65_536;

interface HistoryWrite {
  row: number;
  col: number;
  author: number;
}

function historyChange(index: number): HistoryWrite {
  return {
    row: HISTORY_CHANGE_STRIDE * index + HISTORY_CHANGE_ROW,
    col: (index * HISTORY_CHANGE_COL_STRIDE) % HISTORY_COLS,
    author: index % HISTORY_AUTHORS,
  };
}

/** Scattered writes first, then the write of each changed cell, so its author is the last one. */
function historyWrites(): HistoryWrite[] {
  const scattered = HISTORY_WRITES - HISTORY_PAGE;
  return [
    ...Array.from({ length: scattered }, (_, index) => ({
      row: (index * HISTORY_WRITE_STRIDE) % HISTORY_ROWS,
      col: index % HISTORY_COLS,
      author: index % HISTORY_AUTHORS,
    })),
    ...Array.from({ length: HISTORY_PAGE }, (_, index) => historyChange(index)),
  ];
}

/** Each change counts its cell's position plus its author times the cell count. */
function historyChangeChecksum(row: number, col: number, author: number): number {
  return row * HISTORY_COLS + col + author * HISTORY_CELLS;
}

function historyDiffOutput(): number {
  let checksum = 0;
  for (let index = 0; index < HISTORY_PAGE; index++) {
    const change = historyChange(index);
    checksum += historyChangeChecksum(change.row, change.col, change.author);
  }
  return checksum;
}

/** A sheet of 5,000 × 20 numbers, column by column. */
function historyVersion(changes: readonly HistoryWrite[]): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(HISTORY_COLS, HISTORY_ROWS);
  for (let col = 0; col < HISTORY_COLS; col++) {
    store.setColumnNumbers(
      sheet,
      col,
      0,
      numericColumn(HISTORY_ROWS, (row) => row * HISTORY_COLS + col),
      0,
    );
  }
  for (const change of changes) {
    store.setNumber(
      sheet,
      change.row,
      change.col,
      change.row * HISTORY_COLS + change.col + HISTORY_CHANGE,
      0,
    );
  }
  return { store, sheet };
}

interface HistoryWindow {
  row0: number;
  rows: number;
  before: Uint8Array;
  after: Uint8Array;
}

function historyWindowBytes(
  version: { store: CellStore; sheet: number },
  row0: number,
  rows: number,
): Uint8Array {
  const range = version.store.captureRange(version.sheet, row0, 0, rows, HISTORY_COLS);
  assert(range !== undefined, "history window captured");
  try {
    return range.exportMemoryState(version.sheet);
  } finally {
    range.free();
  }
}

function historyDiffFixture(): TimedFixture {
  const before = historyVersion([]);
  const after = historyVersion(Array.from({ length: HISTORY_PAGE }, (_, k) => historyChange(k)));
  const windowRows = Math.floor(HISTORY_WINDOW_CELLS / HISTORY_COLS);
  const windows: HistoryWindow[] = [];
  for (let row0 = 0; row0 < HISTORY_ROWS; row0 += windowRows) {
    const rows = Math.min(windowRows, HISTORY_ROWS - row0);
    windows.push({
      row0,
      rows,
      before: historyWindowBytes(before, row0, rows),
      after: historyWindowBytes(after, row0, rows),
    });
  }
  before.store.free();
  const writes = historyWrites();
  const noStyles = new Uint32Array();
  let checksum = Number.NaN;
  return {
    store: after.store,
    run: () => {
      const kernel = new historyKernel.DiffKernel(HISTORY_PAGE);
      try {
        const slot = kernel.addSheet(HISTORY_ROWS, HISTORY_COLS, true);
        for (const write of writes) {
          kernel.touch(slot, write.row, write.col, write.row, write.col, write.author);
        }
        kernel.setStyles(noStyles, noStyles);
        for (const window of windows) {
          assert(kernel.loadAfter(window.after), "later window loaded");
          assert(kernel.loadBefore(window.before), "earlier window loaded");
          const cells = window.rows * HISTORY_COLS;
          const next = kernel.compare(
            slot,
            true,
            0,
            0,
            window.rows,
            HISTORY_COLS,
            window.row0,
            0,
            window.row0,
            0,
            0,
          );
          if (next < cells) break;
        }
        const rows = kernel.pageRows();
        const cols = kernel.pageCols();
        const authors = kernel.pageAuthors();
        assert(
          kernel.pageSheets().length === rows.length &&
            kernel.pageBeforeRows().length === rows.length &&
            kernel.pageBeforeCols().length === rows.length &&
            kernel.pageFlags().length === rows.length,
          "page columns have one entry per change",
        );
        checksum = 0;
        for (const [index, row] of rows.entries()) {
          checksum += historyChangeChecksum(row, cols[index] ?? 0, authors[index] ?? 0);
        }
      } finally {
        kernel.free();
      }
    },
    check: () => checksum,
    dispose: () => after.store.free(),
    // Each run builds and frees its own kernel; the versions stay unchanged.
    restore: () => undefined,
  };
}

/** Even rows bind one name, odd rows bind three that build on each other. */
function letManyFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0 ? `=LET(x,${source},x+x+x)` : `=LET(x,${source},y,x+1,z,y*x,x+y+z)`;
}

/**
 * Rows for how functions read ranges: INDEX/MATCH, RANK and LARGE filled
 * down, SORT(UNIQUE(FILTER())), SUBTOTAL over a filtered column, and one
 * sparse block written during a page load.
 */
const INDEX_MATCH_VALUE_SCALE = 10;
/** Lookups in `index-match-many`. Each reads a 100,000-row table, so a few hundred is enough. */
const INDEX_MATCH_FORMULAS = 200;
/**
 * Rows of `rank-many`. Every formula reads the whole column, so the work grows with the square.
 */
const RANK_MANY_SIZE = 4_000;
/** The `rank-many` edit moves A1 below every other value. */
const RANK_MANY_EDITED_FIRST = -1;
/** `sort-unique-filter` keys cycle through this many labels (a prime, so a row step visits all). */
const SORT_UNIQUE_KEYS = 997;
const SORT_UNIQUE_STEP = 7_919;
/** The timed edit keeps only the rows before this one. */
const SORT_UNIQUE_EDITED_ROWS = 500;
/** `subtotal-filtered` hides every other block of this many rows. */
const SUBTOTAL_BLOCK_ROWS = 10;
const SUBTOTAL_EDITED_FIRST = 2;
const SPARSE_PAGE_COLUMNS = 10;
/** One cell in this many is blank, so the block is sparse. */
const SPARSE_PAGE_BLANK_EVERY = 10;
const SPARSE_PAGE_LABELS = 97;
const KIND_NUMBER = 1;
const KIND_STRING = 2;

function sortUniqueKey(row: number): string {
  return `k${(row * SORT_UNIQUE_STEP) % SORT_UNIQUE_KEYS}`;
}

/** First and last of the sorted distinct keys of the rows before `rows`, and their count. */
function sortUniqueOutput(rows: number): string {
  const keys = [...new Set(Array.from({ length: rows }, (_, row) => sortUniqueKey(row)))].sort();
  return `${keys[0]}:${keys.at(-1)}:${keys.length}`;
}

function subtotalVisible(row: number): boolean {
  return Math.floor(row / SUBTOTAL_BLOCK_ROWS) % 2 === 0;
}

/** Sum of `row + 1` over the visible rows, with A1 holding `first`. */
function subtotalOutput(count: number, first: number): number {
  let total = first;
  for (let row = 1; row < count; row++) if (subtotalVisible(row)) total += row + 1;
  return total;
}

/** The value a `sparse-page-write` block holds at one offset: blank, a number or a label. */
function sparsePageValue(offset: number): number | string | null {
  if (offset % SPARSE_PAGE_BLANK_EVERY === 0) return null;
  return offset % 2 === 0 ? offset : `label${offset % SPARSE_PAGE_LABELS}`;
}

function sparsePageOutput(rows: number): string {
  const last = (rows - 1) * SPARSE_PAGE_COLUMNS;
  return `${String(sparsePageValue(last + SPARSE_PAGE_COLUMNS - 2))}:${String(sparsePageValue(last + SPARSE_PAGE_COLUMNS - 1))}`;
}

/**
 * `formulas` INDEX/MATCH lookups over a `rows`-row table: keys in A, values in
 * B. Each key is `$C$1` plus the formula's row, so the timed edit recomputes
 * every lookup, and each match lands near the top of the table.
 */
function indexMatchFixture(formulas: number, rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, rows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(rows, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(rows, (row) => (row + 1) * INDEX_MATCH_VALUE_SCALE),
    0,
  );
  store.setNumber(sheet, 0, 2, SHAPE_SCALE, 0);
  for (let row = 0; row < formulas; row++) {
    store.setFormula(
      sheet,
      row,
      3,
      `=INDEX($B$1:$B$${rows},MATCH($C$1+${row},$A$1:$A$${rows},0))`,
      0,
    );
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, SHAPE_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, formulas - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: SHAPE_SCALE }),
  };
}

/**
 * RANK.EQ in even rows and LARGE in odd rows, each over the whole column, so
 * one edit of A1 recomputes all of them: the fill-down shape that reads the
 * column once per formula.
 */
function rankManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(
      sheet,
      row,
      1,
      row % 2 === 0 ? `=RANK.EQ(A${row + 1},$A$1:$A$${count})` : `=LARGE($A$1:$A$${count},ROW())`,
      0,
    );
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, RANK_MANY_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/**
 * One `SORT(UNIQUE(FILTER()))` over text keys in A, kept while B is below
 * `$D$1`. The timed edit narrows the filter to the first rows.
 */
function sortUniqueFilterFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  for (let row = 0; row < count; row++) store.setString(sheet, row, 0, sortUniqueKey(row), 0);
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setNumber(sheet, 0, 3, count, 0);
  store.setFormula(sheet, 0, 2, `=SORT(UNIQUE(FILTER(A1:A${count},B1:B${count}<$D$1)))`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 3, SORT_UNIQUE_EDITED_ROWS, 0);
      store.recompute(sheet);
    },
    check: () => {
      const last = SORT_UNIQUE_EDITED_ROWS - 1;
      const spilled = store.spillAnchorRow(sheet, last, 2) === 0 ? SORT_UNIQUE_EDITED_ROWS : 0;
      return `${textAt(store, sheet, 0, 2) ?? ""}:${textAt(store, sheet, last, 2) ?? ""}:${spilled}`;
    },
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 3, value: count }),
  };
}

/** `SUBTOTAL(109)` over a column whose filter hides every other block of rows. */
function subtotalFilteredFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  const hidden: number[] = [];
  for (let start = SUBTOTAL_BLOCK_ROWS; start < count; start += 2 * SUBTOTAL_BLOCK_ROWS) {
    hidden.push(start, Math.min(start + SUBTOTAL_BLOCK_ROWS, count) - 1);
  }
  assert(
    store.setHiddenRows(sheet, new Uint32Array(), Uint32Array.from(hidden)),
    "subtotal-filtered: hidden rows rejected",
  );
  store.setFormula(sheet, 0, 1, `=SUBTOTAL(109,A1:A${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, SUBTOTAL_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/**
 * One sparse block of `rows` × 10 cells written inside a page load, as
 * snapshot hydration and datasource pages write: numbers and labels, with
 * every tenth cell blank. The inputs are built before the timed write.
 */
function sparsePageWriteFixture(rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(SPARSE_PAGE_COLUMNS, rows);
  const offsets: number[] = [];
  const kinds: number[] = [];
  const numbers: number[] = [];
  const texts: string[] = [];
  for (let offset = 0; offset < rows * SPARSE_PAGE_COLUMNS; offset++) {
    const value = sparsePageValue(offset);
    if (value === null) continue;
    offsets.push(offset);
    kinds.push(typeof value === "number" ? KIND_NUMBER : KIND_STRING);
    numbers.push(typeof value === "number" ? value : 0);
    if (typeof value === "string") texts.push(value);
  }
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(texts.join(""));
  const textOffsets = new Uint32Array(texts.length + 1);
  for (let index = 0; index < texts.length; index++) {
    textOffsets[index + 1] = (textOffsets[index] ?? 0) + encoder.encode(texts[index]).length;
  }
  const entryOffsets = Uint32Array.from(offsets);
  const entryKinds = Uint8Array.from(kinds);
  const entryNumbers = Float64Array.from(numbers);
  const styles = new Uint32Array(offsets.length);
  const none = new Uint32Array();
  return {
    store,
    run: () => {
      store.beginPageLoad();
      const status = store.setSparseBlock(
        sheet,
        0,
        0,
        rows,
        SPARSE_PAGE_COLUMNS,
        entryOffsets,
        entryKinds,
        entryNumbers,
        textBytes,
        textOffsets,
        styles,
        none,
        [],
        none,
        none,
      );
      store.commitSources();
      assert(status === 0, `sparse-page-write: block rejected with ${status}`);
    },
    check: () => {
      const last = rows - 1;
      const number = numberAt(store, sheet, last, SPARSE_PAGE_COLUMNS - 2);
      return `${number}:${textAt(store, sheet, last, SPARSE_PAGE_COLUMNS - 1) ?? ""}`;
    },
    dispose: () => store.free(),
  };
}

/**
 * A LET in every row, as modern workbooks write them. The timed edit changes
 * the shared scale, so every LET recalculates.
 */
function letManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setNumber(sheet, 0, 2, LET_MANY_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, letManyFormula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, LET_MANY_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: LET_MANY_SCALE }),
  };
}

/** The LET binding is used three times (`x+x+x`), so a re-evaluated binding costs that multiple. */
const LET_REPEAT_FACTOR = 3;

function letRepeatFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  store.setNumber(sheet, 0, 2, count, 0);
  store.setFormula(sheet, 0, 3, `=LET(x,XLOOKUP($C$1,A1:A${count},B1:B${count}),x+x+x)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 3)}:${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: count }),
  };
}

function iterativeFinanceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  const cashflows = [-70_000, 12_000, 15_000, 18_000, 21_000, 26_000];
  for (const [row, value] of cashflows.entries()) store.setNumber(sheet, row, 0, value, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=IRR($A$1:$A$6)+RATE(10,-150,1000)", 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function incrementalDependencyClosureFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, dependencyClosureFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/**
 * Rows for paged storage: single-cell reads through formulas, a row insert
 * near the top, the loaded-range check, and page loads through a full cache.
 * Every paged sheet loads its values as clean pages, the way datasource pages
 * arrive, and keeps some local edits on top.
 */
const PAGED_ROWS = 1_000_000;
const PAGED_SMOKE_ROWS = 10_000;
const PAGED_CHUNK_ROWS = 4_096;
/** Local edits spread over column B of the insert and range-check sheets. */
const PAGED_DIRTY_CELLS = 1_000;
const PAGED_DIRTY_OFFSET = 0.5;
const PAGED_INSERT_AT = 10;
const PAGED_READ_SCALE = 2;
const PAGED_READ_EDITED_SCALE = 3;
/** The eviction row loads 4-row pages through a cache that holds 512 of them. */
const PAGED_EVICTION_CHUNK_ROWS = 4;
const PAGED_EVICTION_PAGES = 8_192;
const PAGED_EVICTION_SMOKE_PAGES = 1_024;
const PAGED_EVICTION_RESIDENT = 512;
/** Pages a viewport band pins at the top of the eviction sheet. */
const PAGED_EVICTION_PINNED = 16;
/** Bytes of one resident page: kind, payload and style per row, plus the loaded bits. */
const PAGED_EVICTION_PAGE_BYTES =
  PAGED_EVICTION_CHUNK_ROWS *
    (Uint8Array.BYTES_PER_ELEMENT +
      Float64Array.BYTES_PER_ELEMENT +
      Uint32Array.BYTES_PER_ELEMENT) +
  BigUint64Array.BYTES_PER_ELEMENT;

/** Column A holds `row`, column B `row + 1`, and `$C$1` the scale. */
function pagedCellReadsOutput(count: number): number {
  const last = count - 1;
  return last + (last + 1) * PAGED_READ_EDITED_SCALE;
}

/** Old row 10 of column A one row lower, and every loaded and edited cell kept. */
function pagedInsertRowOutput(rows: number): string {
  return `${PAGED_INSERT_AT}:${rows * 2}:${PAGED_DIRTY_CELLS}`;
}

function pagedEvictionOutput(pages: number): string {
  return `${PAGED_EVICTION_RESIDENT}:${pages * PAGED_EVICTION_CHUNK_ROWS - 1}:0`;
}

/**
 * A paged sheet whose first `loaded` columns hold `row + col` in clean,
 * loaded pages. A budget of 0 keeps every page resident.
 */
function loadedPagedSheet(
  cols: number,
  rows: number,
  loaded: number,
  chunkRows: number,
  byteBudget: number,
): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addPagedSheet(cols, rows, chunkRows, byteBudget, 0);
  store.beginPageLoad();
  for (let col = 0; col < loaded; col++) {
    store.setColumnNumbers(
      sheet,
      col,
      0,
      numericColumn(rows, (row) => row + col),
      0,
    );
  }
  store.commitSources();
  return { store, sheet };
}

/** `PAGED_DIRTY_CELLS` local edits spread evenly down column B. */
function addPagedEdits(store: CellStore, sheet: number, rows: number): void {
  for (let index = 0; index < PAGED_DIRTY_CELLS; index++) {
    const row = Math.floor((index * rows) / PAGED_DIRTY_CELLS);
    store.setNumber(sheet, row, 1, row + 1 + PAGED_DIRTY_OFFSET, 0);
  }
}

/**
 * `=A{r}+B{r}*$C$1` in every row of a paged sheet: each formula reads two
 * loaded cells and one edited cell, one at a time. The timed edit changes the
 * scale, so every formula recalculates.
 */
function pagedCellReadsFixture(count: number): TimedFixture {
  const { store, sheet } = loadedPagedSheet(4, count, 2, PAGED_CHUNK_ROWS, 0);
  store.setNumber(sheet, 0, 2, PAGED_READ_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 3, `=A${row + 1}+B${row + 1}*$C$1`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, PAGED_READ_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: PAGED_READ_SCALE }),
  };
}

/** Two loaded columns of `rows` rows, with local edits in column B. */
function editedPagedSheet(rows: number): { store: CellStore; sheet: number } {
  const paged = loadedPagedSheet(2, rows, 2, PAGED_CHUNK_ROWS, 0);
  addPagedEdits(paged.store, paged.sheet, rows);
  return paged;
}

function pagedInsertRowCheck(store: CellStore, sheet: number): string {
  const stats = store.pagedStats(sheet);
  return `${numberAt(store, sheet, PAGED_INSERT_AT + 1, 0)}:${stats[1]}:${stats[2]}`;
}

/** One row inserted near the top of a paged sheet; removing it again restores the sheet. */
function pagedInsertRowFixture(rows: number): TimedFixture {
  const { store, sheet } = editedPagedSheet(rows);
  return {
    store,
    run: () => assert(store.addRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: insert"),
    check: () => pagedInsertRowCheck(store, sheet),
    dispose: () => store.free(),
    restore: () => assert(store.removeRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: restore"),
  };
}

/** Whether every cell of both columns is loaded. The check changes nothing to restore. */
function pagedRangeLoadedFixture(rows: number): TimedFixture {
  const { store, sheet } = editedPagedSheet(rows);
  let loaded = false;
  return {
    store,
    run: () => {
      loaded = store.rangeFullyLoaded(sheet, 0, 0, rows - 1, 1);
    },
    check: () => (loaded ? 1 : 0),
    dispose: () => store.free(),
    restore: () => {},
  };
}

/**
 * One page load of `pages` 4-row pages through a cache that holds 512, with
 * the top 16 pages pinned by a viewport band, so every unpinned page the load
 * writes evicts the oldest one. The fixture starts in the state a run leaves:
 * the pinned pages and the newest pages resident. So a run needs no restore.
 */
function pagedEvictionFixture(pages: number): TimedFixture {
  const rows = pages * PAGED_EVICTION_CHUNK_ROWS;
  const store = new CellStore();
  const sheet = store.addPagedSheet(
    1,
    rows,
    PAGED_EVICTION_CHUNK_ROWS,
    PAGED_EVICTION_RESIDENT * PAGED_EVICTION_PAGE_BYTES,
    0,
  );
  const pinnedRows = PAGED_EVICTION_PINNED * PAGED_EVICTION_CHUNK_ROWS;
  store.pinViewportBands(sheet, Uint32Array.of(0, pinnedRows, 0, 1));
  const values = numericColumn(rows, (row) => row);
  const load = (start: number, end: number) => {
    store.beginPageLoad();
    store.setColumnNumbers(sheet, 0, start, values.subarray(start, end), 0);
    store.commitSources();
  };
  load(0, pinnedRows);
  load(rows - (PAGED_EVICTION_RESIDENT - PAGED_EVICTION_PINNED) * PAGED_EVICTION_CHUNK_ROWS, rows);
  return {
    store,
    run: () => load(0, rows),
    check: () =>
      `${store.pagedStats(sheet)[0]}:${numberAt(store, sheet, rows - 1, 0)}:${numberAt(store, sheet, 0, 0)}`,
    dispose: () => store.free(),
    restore: () => {},
  };
}

/** One matrix row: its identity and a factory for a fresh, untimed fixture. */
interface FormulaWorkload {
  readonly id: string;
  readonly size: number;
  readonly factory: FixtureFactory;
}

function formulaWorkloads(smoke: boolean): FormulaWorkload[] {
  const workloads: FormulaWorkload[] = [];
  const add = (id: string, size: number, factory: FixtureFactory) =>
    workloads.push({ id, size, factory });
  for (const size of smoke ? ([1_000] as const) : FORMULA_SIZES) {
    add("independent-parse-load", size, () => independentLoadFixture(size));
    add("independent-first-recompute", size, () => independentRecomputeFixture(size));
  }
  for (const depth of smoke ? [8, 32] : [8, 16, 32, 64]) {
    add("linear-chain", depth, () => chainFixture(depth));
  }

  const large = smoke ? 1_000 : 100_000;
  const range = smoke ? 10_000 : 100_000;
  const lookupFormulas = smoke ? 500 : 1_000;
  const topology = smoke ? 1_000 : 10_000;
  add("wide-fan-out-edit", 1_000, () => fanOutEditFixture(1_000));
  if (!smoke) add("wide-fan-out-edit", large, () => fanOutEditFixture(large));
  add("diamond-edit", 32, () => diamondFixture(32));
  add("shared-range-edit", 1_000, () => sharedRangeFixture(1_000));
  add("distinct-range-edit", 1_000, () => distinctRangeFixture(1_000));
  add("cross-sheet-range-edit", 1_000, () => crossSheetFixture(1_000));
  add("scalar-edit-affects-0", 1_000, () => fanOutEditFixture(1_000, true));
  add("scalar-edit-affects-1", 1, () => fanOutEditFixture(1));
  add("scalar-edit-affects-1000", 1_000, () => fanOutEditFixture(1_000));
  add("scalar-edit-affects-100000", large, () => fanOutEditFixture(large));
  add("formula-constant-edit", large, () => constantEditFixture(large));
  add("topology-remove-add", topology, () => topologyFixture(topology));
  add("cycles", 1_000, () => cycleFixture(1_000));
  add("removed-sheet-ref", 1_000, () => refRemovalFixture(1_000));
  add("error-propagation", 1_000, () => errorPropagationFixture(1_000));
  add("criteria-range-edit", range, () => criteriaRangeFixture(range));
  add("lookup-range-edit", range, () => lookupRangeFixture(range));
  for (const size of smoke ? [MIXED_LOOKUP_SMOKE_ROWS] : MIXED_LOOKUP_SIZES) {
    add("xlookup-mixed-exact", size, () => mixedLookupFixture(size));
  }
  for (const variant of LOOKUP_VARIANTS) {
    add(variant.id, lookupFormulas, () =>
      lookupFixture(lookupFormulas, "first-recompute", variant),
    );
    add(`${variant.id}${LOOKUP_EDIT_SUFFIX}`, lookupFormulas, () =>
      lookupFixture(lookupFormulas, "key-edit", variant),
    );
  }
  add("spill-filter-resize", range, () => spillFilterResizeFixture(range));
  add("sumproduct-vector-edit", range, () => sumProductVectorFixture(range));
  add("sumproduct-matrix-edit", range, () => sumProductMatrixFixture(range));
  add("criteria-multi-range-edit", range, () => criteriaMultiRangeFixture(range));
  add("sum-multi-range", range, () => sumMultiRangeFixture(range));
  add("sumifs-3-criteria", range, () => sumifsCriteriaFixture(range));
  add("countif-100k", range, () => countifFixture(range));
  add("unicode-text-date-edit", 1_000, () => unicodeTextDateFixture(1_000));
  add("percentile-covariance", range, () => percentileCovarianceFixture(range));
  add("let-reuse-edit", range, () => letReuseFixture(range));
  add("let-repeat", range, () => letRepeatFixture(range));
  for (const size of smoke ? [1_000] : LET_MANY_SIZES) {
    add("let-many", size, () => letManyFixture(size));
  }
  for (const id of SHAPE_ROW_IDS) {
    for (const size of smoke ? [1_000] : SHAPE_ROW_SIZES) {
      add(id, size, () => shapeRowFixture(id, size));
    }
  }
  for (const id of BINDING_ROW_IDS) {
    for (const size of smoke ? [1_000] : BINDING_ROW_SIZES) {
      add(id, size, () => bindingRowFixture(id, size));
    }
  }
  add("iterative-finance", 1_000, () => iterativeFinanceFixture(1_000));
  add("incremental-dependency-closure-edit", range, () =>
    incrementalDependencyClosureFixture(range),
  );
  add("paged-cell-reads", range, () => pagedCellReadsFixture(range));
  const pagedRows = smoke ? PAGED_SMOKE_ROWS : PAGED_ROWS;
  add("paged-insert-row", pagedRows, () => pagedInsertRowFixture(pagedRows));
  add("paged-range-loaded", pagedRows, () => pagedRangeLoadedFixture(pagedRows));
  const evictionPages = smoke ? PAGED_EVICTION_SMOKE_PAGES : PAGED_EVICTION_PAGES;
  add("paged-eviction", evictionPages, () => pagedEvictionFixture(evictionPages));
  const indexMatchFormulas = smoke ? 50 : INDEX_MATCH_FORMULAS;
  add("index-match-many", indexMatchFormulas, () => indexMatchFixture(indexMatchFormulas, range));
  const rankManySize = smoke ? 1_000 : RANK_MANY_SIZE;
  add("rank-many", rankManySize, () => rankManyFixture(rankManySize));
  add("sort-unique-filter", range, () => sortUniqueFilterFixture(range));
  add("subtotal-filtered", range, () => subtotalFilteredFixture(range));
  add("sparse-page-write", range, () => sparsePageWriteFixture(range));
  add("spill-sequence-admission", large, () => spillSequenceAdmissionFixture(large));
  add("history-diff", HISTORY_CELLS, historyDiffFixture);
  if (ENGINE_PACKAGE === "formulas") {
    for (const row of FULL_ENGINE_ROWS) {
      const size = smoke ? row.smokeSize : row.size;
      add(row.id, size, () => fullEngineRowFixture(row.id, size));
    }
  }
  return workloads;
}

function runWorkloads(smoke: boolean): CompleteFormulaWorkloadResult[] {
  const samples = smoke ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
  return formulaWorkloads(smoke).map(({ id, size, factory }) =>
    collectFixture(id, size, factory, samples),
  );
}

/** One side of a paired formula gate comparison: aggregated timings and exact counters. */
export interface FormulaGateCapture {
  /** SHA-256 of the engine glue and WASM binary this side loaded. */
  engineDigest: string;
  /** Per-iteration mean of one aggregated sample per workload. */
  timings: Record<string, number>;
  bytes: Record<string, number>;
  /** Workloads this engine cannot run, with the missing API. */
  skipped: Record<string, string>;
}

/**
 * A fixture written for a newer engine may call a CellStore export an older
 * base lacks. Only a TypeError naming a method that is absent from this
 * engine's CellStore counts as that; anything else is a real failure.
 */
const MISSING_METHOD = /\.(\w+) is not a function/u;

function missingCellStoreMethod(error: unknown): string | undefined {
  if (!(error instanceof TypeError)) return undefined;
  const method = MISSING_METHOD.exec(error.message)?.[1];
  return method !== undefined && !(method in CellStore.prototype) ? method : undefined;
}

/**
 * Rows whose engine code JavaScriptCore is still optimising after the standard
 * warm-up, with the untimed warm-up (ms) that reaches steady state first. In a
 * fresh Bun process on Linux, `unicode-text-date-edit` takes 4.5–4.8 ms per run
 * for the first 50 ms and 1.6 ms after one second, so a 50 ms sample measured
 * tier-up timing instead of the engine (#325).
 *
 * `independent-first-recompute` at 10,000 formulas runs right after the
 * 10,000-formula parse/load row, whose code is still being compiled in the
 * background on the pinned core. Its runs take 7–10 ms until that finishes and
 * 1.7–1.9 ms after, with no wasm memory growth; with synchronous compilation
 * or an idle pause before the row they start at steady speed (#463).
 *
 * `diamond-edit` runs in about 30 µs, so its 50 ms sample falls inside the
 * tier-up of the recompute path. A change to that path's code moved the
 * sample's result by 10–15% under the gate (30 µs to 34 µs) while both
 * engines ran at 29.2–29.5 µs per edit after warm-up; with 500 ms of warm-up
 * the gate measured the same 1.007.
 */
const GATE_TIER_UP_WARMUP_MS: Readonly<Record<string, number>> = {
  "workload=unicode-text-date-edit;size=1000": 1_000,
  "workload=independent-first-recompute;size=10000": 500,
  "workload=diamond-edit;size=32": 500,
};

/**
 * Capture one gate side in this process. Every workload is one aggregated
 * sample of at least `SAMPLE_AGGREGATE_MS`, so 1-3 ms rows average dozens of
 * runs instead of resting on a single cold run.
 */
function captureGateSide(): FormulaGateCapture {
  const capture: FormulaGateCapture = {
    engineDigest: sha256(Buffer.concat([readFileSync(ENGINE_GLUE_PATH), readFileSync(WASM_PATH)])),
    timings: {},
    bytes: {},
    skipped: {},
  };
  for (const { id, size, factory } of formulaWorkloads(false)) {
    const key = formulaWorkloadKey({ id, size });
    let sample: AggregatedWorkloadSample;
    try {
      sample = collectAggregatedSample(id, size, factory, {
        warmupFixtures: SAMPLE_WARMUP_FIXTURES,
        minimumWarmupMs: GATE_TIER_UP_WARMUP_MS[key] ?? 0,
        minimumSampleDurationMs: SAMPLE_AGGREGATE_MS,
      });
    } catch (error) {
      const method = missingCellStoreMethod(error);
      if (method === undefined) throw error;
      capture.skipped[key] = `CellStore.${method} is missing from this engine`;
      continue;
    }

    const [timing] = sample.samplesMs;
    const [allocation] = sample.allocationSamples;
    if (timing === undefined || allocation === undefined) {
      throw new Error(`${key} gate sample is empty`);
    }
    capture.timings[key] = timing;
    for (const [field, value] of Object.entries(allocation)) {
      capture.bytes[`${key}.allocation.${field}`] = value;
    }
  }
  for (const { formulas: count, wasmDeltaBytes } of FORMULA_SIZES.map(probeMemory)) {
    capture.bytes[`memory=formulas=${count}.wasmDeltaBytes`] = wasmDeltaBytes;
  }
  return capture;
}

function probeMemory(formulas: number): FormulaMemoryResult {
  const process = Bun.spawnSync(["bun", "run", import.meta.path, "--memory", String(formulas)], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  if (process.exitCode !== 0) throw new Error(`formula memory probe exited ${process.exitCode}`);
  const line = process.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((candidate) => candidate.startsWith("{"))
    .at(-1);
  if (!line) throw new Error("formula memory probe returned no JSON");
  const value: unknown = JSON.parse(line);
  if (
    !value ||
    typeof value !== "object" ||
    !("formulas" in value) ||
    value.formulas !== formulas ||
    !("wasmDeltaBytes" in value) ||
    typeof value.wasmDeltaBytes !== "number"
  ) {
    throw new Error("invalid formula memory probe result");
  }
  return { formulas, wasmDeltaBytes: value.wasmDeltaBytes };
}

function runMemoryMode(formulas: number): FormulaMemoryResult {
  const wasm = initSync({ module: readFileSync(WASM_PATH) });
  forceGc();
  const before = wasm.memory.buffer.byteLength;
  const store = new CellStore();
  const sheet = store.addSheet(2, formulas);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(formulas, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(formulas));
  store.recompute(sheet);
  assert(numberAt(store, sheet, formulas - 1, 1) === formulas, "memory fixture");
  forceGc();
  return { formulas, wasmDeltaBytes: wasm.memory.buffer.byteLength - before };
}

function sha256(value: string | Uint8Array): string {
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

function currentFormulaSourceProvenance(commit: string): FormulaSourceProvenance {
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
  const baselineContext = captureEngineBaselineContext(commit, [ENGINE_PACKAGE]);
  return {
    protocol: FORMULA_PROTOCOL,
    commit,
    files,
    ...(baselineContext === undefined ? {} : { baselineContext }),
    digest: formulaSourceDigest(commit, files, baselineContext),
  };
}

function runnerCommand(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  outputPath?: string,
): string[] {
  return [
    "bun",
    "run",
    "src/formula-bench.ts",
    ...(mode === "smoke" ? ["--smoke"] : []),
    ...(capture === "preliminary" ? ["--preliminary"] : []),
    ...(capture === "output" && outputPath !== undefined ? ["--output", outputPath] : []),
  ];
}

/** An output capture records the path it was written to, so validation checks its shape. */
function runnerCommandMatches(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  command: readonly string[],
): boolean {
  if (capture !== "output") {
    return JSON.stringify(command) === JSON.stringify(runnerCommand(mode, capture));
  }
  const outputPath = command.at(-1) ?? "";
  return (
    outputPath.length > 0 &&
    JSON.stringify(command) === JSON.stringify(runnerCommand(mode, capture, outputPath))
  );
}

function currentRunnerProvenance(
  mode: BenchmarkMode,
  capture: FormulaCaptureKind,
  outputPath?: string,
): FormulaRunnerProvenance {
  return {
    command: runnerCommand(mode, capture, outputPath),
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

/** A blocked capture declares why it carries no baseline comparison. */
function formulaCaptureKind(regression: Record<string, unknown>): FormulaCaptureKind {
  if (regression.status === "passed") return "gated";
  if (regression.status !== "blocked") {
    throw new Error("formula regression gate has no declared status");
  }
  if (regression.blocker === PRELIMINARY_BLOCKER) return "preliminary";
  if (regression.blocker === OUTPUT_CAPTURE_BLOCKER) return "output";
  throw new Error("formula blocked result does not declare a known blocker");
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObjectKeys(value: unknown, expected: readonly string[], path: string): void {
  const record = objectRecord(value, path);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${path} must contain exactly ${wanted.join(", ")}`);
  }
}

function exactString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function validateStatShape(stat: Stat, path: string): void {
  exactObjectKeys(stat, ["median", "p95", "mean", "stddev", "min", "max", "iters"], path);
}

function validateArtifactBound(result: FormulaBenchmarkResult): void {
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

function validateProvenance(
  result: CompleteFormulaBenchmarkResult,
  capture: FormulaCaptureKind,
): void {
  exactObjectKeys(
    result.meta,
    ["bun", "platform", "arch", "commit", "dirty", "timestamp"],
    "formula metadata",
  );
  for (const field of ["bun", "platform", "arch"] as const) {
    exactString(result.meta[field], `formula metadata.${field}`);
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

  exactObjectKeys(
    result.runner,
    ["command", "bun", "node", "platform", "kernel", "arch", "cpu", "concurrency", "gc"],
    "formula runner provenance",
  );
  if (
    !Array.isArray(result.runner.command) ||
    result.runner.command.some((part) => typeof part !== "string") ||
    !runnerCommandMatches(result.mode, capture, result.runner.command)
  ) {
    throw new Error("formula runner provenance.command does not match the declared capture mode");
  }
  for (const field of ["bun", "node", "platform", "kernel", "arch", "cpu"] as const) {
    exactString(result.runner[field], `formula runner provenance.${field}`);
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

  exactObjectKeys(
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
  const recordedPackage = formulaSourceEnginePackage(result.source.files);
  for (const path of formulaSourceFiles(recordedPackage)) {
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
    const packageName = packages[0];
    if (recordedPackage !== "wasm" && recordedPackage !== packageName) {
      throw new Error("Formula baseline engine file binding mismatch");
    }
    for (const filename of ENGINE_SOURCE_FILENAMES) {
      if (
        result.source.files[`packages/${recordedPackage}/pkg/${filename}`] !==
        result.source.baselineContext.engineFiles[`packages/${packageName}/pkg/${filename}`]
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

function validateAllocation(
  workload: CompleteFormulaWorkloadResult,
  expectedSamples: number,
  key: string,
): void {
  if (
    !Array.isArray(workload.allocationSamples) ||
    workload.allocationSamples.length !== expectedSamples
  ) {
    throw new Error(`${key}.allocationSamples must contain ${expectedSamples} raw samples`);
  }
  for (const [index, sample] of workload.allocationSamples.entries()) {
    exactObjectKeys(
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
  exactObjectKeys(
    workload.allocationStat,
    ["retainedBytes", "peakTransientBytes", "transientAllocations"],
    `${key}.allocationStat`,
  );
  for (const field of ["retainedBytes", "peakTransientBytes", "transientAllocations"] as const) {
    validateStatShape(workload.allocationStat[field], `${key}.allocationStat.${field}`);
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

function assertCompleteFormulaResult(
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

function validateFormulaEvidence(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode,
  requirePassedGate: boolean,
  expectedWorkloadKeys = expectedFormulaWorkloadKeys(expectedMode),
): asserts result is CompleteFormulaBenchmarkResult {
  validateArtifactBound(result);
  assertGateIdentity("formula", expectedMode, result);
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
    expectedWorkloadKeys,
    result.workloads.map(formulaWorkloadKey),
  );

  exactObjectKeys(
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
    exactObjectKeys(
      workload,
      ["id", "size", "samplesMs", "stat", "allocationSamples", "allocationStat", "output"],
      "formula workload",
    );
  }
  assertCompleteFormulaResult(result);
  if (result.schemaVersion !== FORMULA_BENCHMARK_SCHEMA_VERSION) {
    throw new Error(
      `formula schema mismatch: expected ${FORMULA_BENCHMARK_SCHEMA_VERSION}, observed ${String(result.schemaVersion)}`,
    );
  }
  const regression = objectRecord(result.gates.regression, "formula gates.regression");
  const capture = formulaCaptureKind(regression);
  validateProvenance(result, capture);

  const expectedSamples = expectedMode === "smoke" ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
  exactObjectKeys(
    result.methodology,
    ["warmupSamples", "measuredSamples", "timing", "allocation", "correctness"],
    "formula methodology",
  );
  if (
    result.methodology.warmupSamples !== 1 ||
    result.methodology.measuredSamples !== expectedSamples ||
    result.methodology.timing !== TIMING_METHOD ||
    result.methodology.allocation !== ALLOCATION_METHOD ||
    result.methodology.correctness !== CORRECTNESS_METHOD
  ) {
    throw new Error("formula methodology does not match the declared warmup/sample protocol");
  }
  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    if (!Array.isArray(workload.samplesMs) || workload.samplesMs.length !== expectedSamples) {
      throw new Error(`${key}.samplesMs must contain ${expectedSamples} post-warmup raw samples`);
    }
    validateStatShape(workload.stat, `${key}.stat`);
    validateRawStat(workload.samplesMs, workload.stat, key);
    validateAllocation(workload, expectedSamples, key);
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
    expectedFormulaBlockedWorkloadKeys(),
    result.blockedWorkloads.map(formulaWorkloadKey),
  );

  if (!Array.isArray(result.memory)) throw new Error("formula memory must be an array");
  for (const memory of result.memory) {
    exactObjectKeys(memory, ["formulas", "wasmDeltaBytes"], "formula memory");
    if (!Number.isInteger(memory.formulas) || memory.formulas <= 0) {
      throw new Error("formula memory contains a malformed identity");
    }
  }
  validateExactMatrix(
    "formula memory",
    expectedFormulaMemoryKeys(expectedMode),
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

  exactObjectKeys(result.gates, ["passed", "tolerance", "regression"], "formula gates");
  if (result.gates.tolerance !== FORMULA_GATE_TOLERANCE) {
    throw new Error("formula gates.tolerance does not match the enforced regression policy");
  }
  if (requirePassedGate) {
    if (result.gates.passed !== true || regression.status !== "passed") {
      throw new Error("formula result does not contain a successful regression gate record");
    }
    exactObjectKeys(
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
    exactObjectKeys(regression, ["status", "blocker"], "formula gates.regression");
  }

  if (expectedMode === "full") {
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
      ...SHAPE_ROW_IDS,
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
    const memory100k = result.memory.find((memory) => memory.formulas === 100_000)!;
    if (memory100k.wasmDeltaBytes >= 256 * 1024 * 1024) {
      throw new Error("memory=formulas=100000 exceeded the 256 MiB safety ceiling");
    }
  }
}

export function validateFormulaBenchmark(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): asserts result is CompleteFormulaBenchmarkResult {
  validateFormulaEvidence(result, expectedMode, true);
}

function timingRegressionLimit(baseline: number, floorMs: number): number {
  return Math.max(baseline * TIMING_REGRESSION_RATIO, baseline + floorMs);
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

function isSubMillisecond(baseline: FormulaWorkloadResult): boolean {
  return baseline.stat.median < SUB_MILLISECOND_BASELINE_MS;
}

function validateLegacyFormulaBaseline(result: FormulaBenchmarkResult): void {
  validateArtifactBound(result);
  assertGateIdentity("formula", "full", result);
  exactObjectKeys(
    result,
    ["protocolVersion", "mode", "matrixId", "meta", "workloads", "memory", "gates"],
    "legacy formula artifact",
  );
  exactObjectKeys(
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
    legacyFormulaBaselineWorkloadKeys(),
    result.workloads.map(formulaWorkloadKey),
  );
  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    exactObjectKeys(workload, ["id", "size", "samplesMs", "stat"], key);
    if (!Array.isArray(workload.samplesMs) || workload.samplesMs.length !== DEFAULT_SAMPLES) {
      throw new Error(`${key}.samplesMs must contain ${DEFAULT_SAMPLES} post-warmup raw samples`);
    }
    validateStatShape(workload.stat, `${key}.stat`);
    validateRawStat(workload.samplesMs, workload.stat, key);
    if (workload.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }
  validateExactMatrix(
    "legacy formula memory",
    expectedFormulaMemoryKeys("full"),
    result.memory.map((memory) => `memory=formulas=${memory.formulas}`),
  );
  for (const memory of result.memory) {
    exactObjectKeys(memory, ["formulas", "wasmDeltaBytes"], "legacy formula memory");
    assertFiniteNonNegative(
      memory.wasmDeltaBytes,
      `memory=formulas=${memory.formulas}.wasmDeltaBytes`,
    );
  }
  exactObjectKeys(result.gates, ["passed", "tolerance"], "legacy formula gates");
  if (result.gates.passed !== true || typeof result.gates.tolerance !== "string") {
    throw new Error("legacy formula baseline does not contain a successful gate");
  }
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

/**
 * An older baseline may leave out expanded workloads. Every core workload must still be listed,
 * and no key outside the current full matrix is allowed.
 */
function regressionBaselineWorkloadKeys(baseline: FormulaBenchmarkResult): string[] {
  const observed = baseline.workloads.map(formulaWorkloadKey);
  const candidates = [
    expectedFormulaWorkloadKeys("full", "wasm"),
    expectedFormulaWorkloadKeys("full", "formulas"),
    legacyFormulaBaselineWorkloadKeys(),
  ];
  for (const expected of candidates) {
    if (expected.length === observed.length && expected.every((key) => observed.includes(key))) {
      return expected;
    }
  }
  const observedSet = new Set(observed);
  const recognised = new Set(expectedFormulaWorkloadKeys("full", "formulas"));
  const core = legacyFormulaBaselineWorkloadKeys();
  if (
    observed.length > 0 &&
    core.length > 0 &&
    core.every((key) => observedSet.has(key)) &&
    observed.every((key) => recognised.has(key))
  ) {
    return observed;
  }
  throw new Error("formula regression baseline does not match the current or legacy full matrix");
}

function validateFormulaBaselineBinding(
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): asserts candidate is CompleteFormulaBenchmarkResult {
  if (baseline.schemaVersion === FORMULA_BENCHMARK_SCHEMA_VERSION) {
    validateFormulaEvidence(baseline, "full", true, regressionBaselineWorkloadKeys(baseline));
  } else {
    validateLegacyFormulaBaseline(baseline);
  }
  validateFormulaBenchmark(candidate, candidate.mode);
  const baselineIdentity = formulaRegressionBaselineIdentity(baseline);
  const regression = candidate.gates.regression as PassedRegressionGate;
  if (
    regression.baselineCommit !== baselineIdentity.commit ||
    regression.baselineSourceDigest !== baselineIdentity.sourceDigest
  ) {
    throw new Error("formula regression gate is not bound to the supplied baseline provenance");
  }
}

/** Read and validate the committed baseline, `results/formula-results.json`. */
function readCommittedFormulaBaseline(): FormulaBenchmarkResult {
  const rawBaseline = readFileSync(
    new URL("../results/formula-results.json", import.meta.url),
    "utf8",
  );
  const baselineBytes = Buffer.byteLength(rawBaseline);
  if (baselineBytes > FORMULA_ARTIFACT_MAX_BYTES) {
    throw new Error(
      `formula baseline artifact exceeded the ${FORMULA_ARTIFACT_MAX_BYTES} byte safety ceiling: ${baselineBytes}`,
    );
  }
  const baseline = JSON.parse(rawBaseline) as FormulaBenchmarkResult;
  if (baseline.schemaVersion === FORMULA_BENCHMARK_SCHEMA_VERSION) {
    validateFormulaEvidence(baseline, "full", true, regressionBaselineWorkloadKeys(baseline));
  } else {
    validateLegacyFormulaBaseline(baseline);
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

function assertWithinGate(gate: GateRow): void {
  if (gate.candidate > gate.ruleLimit) {
    throw new Error(
      `${gate.row} regression: baseline ${gate.baseline}, candidate ${gate.candidate}, limit ${gate.ruleLimit}`,
    );
  }
}

export function validateFormulaRegression(
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): void {
  validateFormulaBaselineBinding(candidate, baseline);
  const baselineWorkloads = new Map(
    baseline.workloads.map((workload) => [formulaWorkloadKey(workload), workload]),
  );

  let comparedWorkloads = 0;
  for (const workload of candidate.workloads) {
    const key = formulaWorkloadKey(workload);
    const previous = baselineWorkloads.get(key);
    if (previous === undefined) continue;
    comparedWorkloads += 1;
    const subMillisecond = isSubMillisecond(previous);
    for (const field of ["median", "p95"] as const) {
      if (field === "p95" && subMillisecond) continue;
      const before = previous.stat[field];
      assertWithinGate({
        row: `${key}.${field}`,
        baseline: before,
        candidate: workload.stat[field],
        ruleLimit: timingRegressionLimit(
          before,
          subMillisecond ? SUB_MILLISECOND_MEDIAN_FLOOR_MS : TIMING_REGRESSION_FLOOR_MS,
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
          assertWithinGate({
            row: `${key}.allocation.${allocation}.${field}`,
            baseline: before,
            candidate: workload.allocationStat[allocation][field],
            ruleLimit: before,
          });
        }
      }
    }
  }
  if (comparedWorkloads === 0) {
    throw new Error("formula regression baseline has no workloads compatible with the candidate");
  }

  const baselineMemory = new Map(
    baseline.memory.map((entry) => [entry.formulas, entry.wasmDeltaBytes]),
  );
  for (const memory of candidate.memory) {
    const before = baselineMemory.get(memory.formulas);
    if (before === undefined) continue;
    assertWithinGate({
      row: `memory=formulas=${memory.formulas}.wasmDeltaBytes`,
      baseline: before,
      candidate: memory.wasmDeltaBytes,
      ruleLimit: before,
    });
  }
}

export function validateFormulaCapture(
  candidate: FormulaBenchmarkResult,
  baseline?: FormulaBenchmarkResult,
): void {
  if (baseline === undefined) {
    validateFormulaEvidence(candidate, candidate.mode, false);
  } else if (candidate.mode === "smoke") {
    validateFormulaBaselineBinding(candidate, baseline);
  } else {
    validateFormulaRegression(candidate, baseline);
  }
}

/**
 * A recorded full capture, such as the shared capture inside full-engine
 * evidence. It may predate workloads added to the matrix since, under the
 * same rule as a regression baseline: every core workload is listed and no
 * key is outside the current full matrix.
 */
export function validateRecordedFormulaCapture(capture: FormulaBenchmarkResult): void {
  validateFormulaEvidence(capture, capture.mode, false, regressionBaselineWorkloadKeys(capture));
}

function validateCurrentCaptureProvenance(
  result: CompleteFormulaBenchmarkResult,
  capture: FormulaCaptureKind,
  outputPath?: string,
): void {
  const currentSource = currentFormulaSourceProvenance(result.meta.commit);
  if (JSON.stringify(result.source) !== JSON.stringify(currentSource)) {
    throw new Error("formula capture source provenance does not match current source bytes");
  }
  const currentRunner = currentRunnerProvenance(result.mode, capture, outputPath);
  if (JSON.stringify(result.runner) !== JSON.stringify(currentRunner)) {
    throw new Error("formula capture runner provenance does not match the current runner");
  }
}

function markdown(result: CompleteFormulaBenchmarkResult): string {
  const lines = [
    "# Formula engine benchmark",
    "",
    `Bun ${result.meta.bun} · ${result.meta.platform}/${result.meta.arch} · median (p95) ms · raw post-warmup timing/allocation samples in JSON.`,
    "",
    "| workload | size | median (p95) ms | retained p95 | transient peak p95 | samples |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const workload of result.workloads) {
    lines.push(
      `| ${workload.id} | ${workload.size.toLocaleString("en-US")} | ${ms(workload.stat.median)} (${ms(workload.stat.p95)}) | ${mib(workload.allocationStat.retainedBytes.p95)} | ${mib(workload.allocationStat.peakTransientBytes.p95)} | ${workload.samplesMs.length} |`,
    );
  }
  lines.push("", "## Blocked capability workloads", "");
  for (const blocked of result.blockedWorkloads) {
    lines.push(`- ${blocked.id} (${blocked.size.toLocaleString("en-US")}): ${blocked.reason}`);
  }
  lines.push("", "## Isolated formula memory", "", "| formulas | WASM delta |", "|---:|---:|");
  for (const memory of result.memory) {
    lines.push(`| ${memory.formulas.toLocaleString("en-US")} | ${mib(memory.wasmDeltaBytes)} |`);
  }
  lines.push(
    "",
    result.gates.passed
      ? `Regression gate passed against ${
          (result.gates.regression as PassedRegressionGate).baselineCommit
        }.`
      : `Evidence without a baseline comparison; gate blocked: ${
          (result.gates.regression as BlockedRegressionGate).blocker
        }.`,
    "",
  );
  return lines.join("\n");
}

async function runBenchmark(
  smoke: boolean,
  captureKind: FormulaCaptureKind,
  outputPath?: string,
): Promise<void> {
  if (captureKind === "output" && outputPath === undefined) {
    throw new Error("an output capture requires a path");
  }
  const mode: BenchmarkMode = smoke ? "smoke" : "full";
  let baseline: FormulaBenchmarkResult | undefined;
  if (captureKind === "gated") {
    baseline = readCommittedFormulaBaseline();
  }

  await initSheetwrite({ engine: engine });

  // Raw CellStore workloads use the published singleton, not core's instance.
  await engine.load();

  const capture = protocolCaptureMeta();
  const workloads = runWorkloads(smoke);
  const memory = smoke ? [probeMemory(1_000)] : FORMULA_SIZES.map(probeMemory);
  const baselineIdentity = baseline ? formulaRegressionBaselineIdentity(baseline) : undefined;
  const regression: PassedRegressionGate | BlockedRegressionGate = baselineIdentity
    ? {
        status: "passed",
        baselineCommit: baselineIdentity.commit,
        baselineSourceDigest: baselineIdentity.sourceDigest,
      }
    : {
        status: "blocked",
        blocker: captureKind === "output" ? OUTPUT_CAPTURE_BLOCKER : PRELIMINARY_BLOCKER,
      };
  const result: CompleteFormulaBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    schemaVersion: FORMULA_BENCHMARK_SCHEMA_VERSION,
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      ...capture,
    },
    runner: currentRunnerProvenance(mode, captureKind, outputPath),
    source: currentFormulaSourceProvenance(capture.commit),
    methodology: {
      warmupSamples: 1,
      measuredSamples: smoke ? SMOKE_SAMPLES : DEFAULT_SAMPLES,
      timing: TIMING_METHOD,
      allocation: ALLOCATION_METHOD,
      correctness: CORRECTNESS_METHOD,
    },
    workloads,
    blockedWorkloads: [],
    memory,
    gates: {
      passed: Boolean(baseline),
      tolerance: FORMULA_GATE_TOLERANCE,
      regression,
    },
  };
  validateCurrentCaptureProvenance(result, captureKind, outputPath);
  validateFormulaCapture(result, baseline);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath === "-") {
    // Standard output carries the capture alone, so a caller can parse or save it as JSON.
    process.stdout.write(serialized);
    process.stderr.write(`${markdown(result)}\n`);
    return;
  }
  if (outputPath !== undefined) {
    await Bun.write(outputPath, serialized);
  } else if (!smoke) {
    await Bun.write(new URL("../results/formula-results.json", import.meta.url), serialized);
  }
  console.log(markdown(result));
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const sampleIndex = process.argv.indexOf("--sample");
  if (process.argv.includes("--grid-constant-edit")) {
    await initSheetwrite({ engine: engine });
    process.stdout.write(`${JSON.stringify(gridConstantEditSample(100_000))}\n`);
    process.exit(0);
  }
  if (process.argv.includes("--gate-capture")) {
    await engine.load();
    process.stdout.write(`${JSON.stringify(captureGateSide())}\n`);
    process.exit(0);
  }
  if (sampleIndex >= 0) {
    const id = process.argv[sampleIndex + 1];
    const size = Number(process.argv[sampleIndex + 2]);
    assert(Number.isInteger(size) && size > 0, "invalid sample size");
    const factories: Record<string, FixtureFactory> = {
      "independent-parse-load": () => independentLoadFixture(size),
      "independent-first-recompute": () => independentRecomputeFixture(size),
      "linear-chain": () => chainFixture(size),
      "wide-fan-out-edit": () => fanOutEditFixture(size),
      "scalar-edit-affects-0": () => fanOutEditFixture(size, true),
      "formula-constant-edit": () => constantEditFixture(size),
      "vlookup-many": () => {
        const variant = LOOKUP_VARIANTS.find((candidate) => candidate.id === "vlookup-many");
        assert(variant, "missing VLOOKUP variant");
        return lookupFixture(size, "first-recompute", variant);
      },
    };
    const factory = id === undefined ? undefined : factories[id];
    assert(id !== undefined && factory, "unknown single-sample workload");
    const aggregateText = optionValue(process.argv, "--aggregate-ms");
    const aggregateMs = aggregateText === undefined ? SAMPLE_AGGREGATE_MS : Number(aggregateText);
    assert(Number.isFinite(aggregateMs) && aggregateMs > 0, "invalid sample aggregation floor");
    const warmupText = optionValue(process.argv, "--warmup-fixtures");
    const warmupFixtures = warmupText === undefined ? SAMPLE_WARMUP_FIXTURES : Number(warmupText);
    assert(
      Number.isInteger(warmupFixtures) && warmupFixtures > 0,
      "invalid sample warm-up fixture count",
    );

    await engine.load();

    process.stdout.write(
      `${JSON.stringify(
        collectAggregatedSample(id, size, factory, {
          warmupFixtures,
          minimumSampleDurationMs: aggregateMs,
        }),
      )}\n`,
    );
  } else {
    const memoryText = optionValue(process.argv, "--memory");
    if (memoryText !== undefined) {
      const formulas = Number(memoryText);
      assert(Number.isInteger(formulas) && formulas > 0, "invalid memory formula count");
      console.log(JSON.stringify(runMemoryMode(formulas)));
    } else {
      const args = process.argv.slice(2).filter((argument) => argument !== "--");
      const outputPath = optionValue(args, "--output");
      // A capture written outside the tracked results file is recorded as an output capture; it
      // skips the baseline comparison too, so the gate stays blocked.
      let captureKind: FormulaCaptureKind = "gated";
      if (outputPath !== undefined) captureKind = "output";
      else if (args.includes("--preliminary")) captureKind = "preliminary";
      await runBenchmark(args.includes("--smoke"), captureKind, outputPath);
    }
  }
}
