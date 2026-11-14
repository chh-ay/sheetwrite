import { readFileSync } from "node:fs";

import { initSheetwrite } from "@sheetwrite/core";

import { optionValue } from "./cli-options.js";
import {
  ALLOCATION_METHOD,
  CORRECTNESS_METHOD,
  type CompleteFormulaBenchmarkResult,
  type CompleteFormulaWorkloadResult,
  currentFormulaSourceProvenance,
  currentRunnerProvenance,
  DEFAULT_SAMPLES,
  exactInteger,
  type FormulaAllocationSample,
  type FormulaAllocationStat,
  type FormulaBenchmarkResult,
  type FormulaCaptureKind,
  type FormulaMemoryResult,
  type FormulaOutput,
  FORMULA_BENCHMARK_SCHEMA_VERSION,
  FORMULA_GATE_TOLERANCE,
  formulaRegressionBaselineIdentity,
  type PassedRegressionGate,
  type BlockedRegressionGate,
  OUTPUT_CAPTURE_BLOCKER,
  outputsEqual,
  PRELIMINARY_BLOCKER,
  sha256,
  SMOKE_SAMPLES,
  TIMING_METHOD,
  validateCurrentCaptureProvenance,
  type FormulaArtifactMatrix,
  readCommittedFormulaBaseline as readBaseline,
  validateFormulaBenchmark as checkFormulaBenchmark,
  validateFormulaCapture as checkFormulaCapture,
  validateFormulaRegression as checkFormulaRegression,
  validateRecordedFormulaCapture as checkRecordedFormulaCapture,
  type FormulaEnginePackage,
  formulaWorkloadKey,
} from "./formula-artifact.js";
import {
  engine,
  ENGINE_PACKAGE,
  ENGINE_ROOT,
  CellStore,
  initSync,
  ENGINE_GLUE_PATH,
  WASM_PATH,
} from "./formula-engine.js";
import {
  assert,
  createFormulaFixture,
  expectedFormulaOutput,
  gridConstantEditSample,
  type FixtureFactory,
  type TimedFixture,
} from "./formula-fixtures.js";
import {
  type BenchmarkMode,
  captureEngineBaselineContext,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
} from "./gate-protocol.js";
import { protocolCaptureMeta } from "./protocol-meta.js";
import { forceGc, mib, ms, now, summarize } from "./stats.js";

const STORE_MEMORY_SCHEMA = 3;

export const FORMULA_SIZES = [1_000, 10_000, 100_000] as const;
/** Each lookup function runs once as a first-recalculation workload and once as a key-edit one. */
const LOOKUP_EDIT_SUFFIX = "-edit";
/** Key-table sizes of the mixed-type exact lookup rows. */
const MIXED_LOOKUP_SIZES = [10_000, 100_000] as const;
const MIXED_LOOKUP_SMOKE_ROWS = 1_000;
/** The `let-many` sizes: a normal sheet and a large one. */
const LET_MANY_SIZES = [10_000, 100_000] as const;
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
const LOOKUP_ROW_IDS = [
  "vlookup-many",
  "vlookup-many-sorted",
  "xlookup-many",
  "xlookup-many-sorted",
  "text-lookup-many",
  "text-lookup-many-sorted",
] as const;

const CLOSURE_ROW_IDS = [
  "map-lambda",
  "reduce-lambda",
  "byrow-lambda",
  "lambda-call",
  "named-lambda",
  "measure-pivot",
] as const;
const CLOSURE_ROW_SIZES = [10_000, 100_000] as const;

const FULL_ENGINE_ROWS = [
  { id: "groupby-sum", size: 100_000, smokeSize: 1_000 },
  // Here PIVOTBY charges between 29 and 40 units of its 2,000,000-unit work
  // budget per source row: 70,000 rows already give #NUM!.
  { id: "pivotby-percentof", size: 50_000, smokeSize: 1_000 },
  { id: "pivot-rebuild", size: 100_000, smokeSize: 1_000 },
  { id: "getpivotdata-many", size: 1_000, smokeSize: 100 },
  { id: "getpivotdata-source-edit", size: 1_000, smokeSize: 100 },
  // 100,000 formulas took 0.19 s per edit natively on the Mac; 10,000 make 40,000 calls.
  { id: "analysis-calls", size: 10_000, smokeSize: 1_000 },
] as const;

const PAGED_ROWS = 1_000_000;
const PAGED_SMOKE_ROWS = 10_000;
const PAGED_EVICTION_PAGES = 8_192;
const PAGED_EVICTION_SMOKE_PAGES = 1_024;
const INDEX_MATCH_FORMULAS = 200;
const RANK_MANY_SIZE = 4_000;
const HISTORY_CELLS = 100_000;

/** Ordered gate rows. Captures and artifact checks share this table. */
interface FormulaWorkload {
  readonly id: string;
  readonly size: number;
  readonly rangeSize?: number;
}

function formulaWorkloads(
  smoke: boolean,
  enginePackage: FormulaEnginePackage = ENGINE_PACKAGE,
): FormulaWorkload[] {
  const workloads: FormulaWorkload[] = [];
  const add = (id: string, size: number, rangeSize?: number) =>
    workloads.push({ id, size, ...(rangeSize === undefined ? {} : { rangeSize }) });
  for (const size of smoke ? ([1_000] as const) : FORMULA_SIZES) {
    add("independent-parse-load", size);
    add("independent-first-recompute", size);
  }
  for (const depth of smoke ? [8, 32] : [8, 16, 32, 64]) {
    add("linear-chain", depth);
  }

  const large = smoke ? 1_000 : 100_000;
  const range = smoke ? 10_000 : 100_000;
  const lookupFormulas = smoke ? 500 : 1_000;
  const topology = smoke ? 1_000 : 10_000;
  add("wide-fan-out-edit", 1_000);
  if (!smoke) add("wide-fan-out-edit", large);
  add("diamond-edit", 32);
  add("shared-range-edit", 1_000);
  add("distinct-range-edit", 1_000);
  add("cross-sheet-range-edit", 1_000);
  add("scalar-edit-affects-0", 1_000);
  add("scalar-edit-affects-1", 1);
  add("scalar-edit-affects-1000", 1_000);
  add("scalar-edit-affects-100000", large);
  add("formula-constant-edit", large);
  add("topology-remove-add", topology);
  add("cycles", 1_000);
  add("removed-sheet-ref", 1_000);
  add("error-propagation", 1_000);
  add("criteria-range-edit", range);
  add("lookup-range-edit", range);
  for (const size of smoke ? [MIXED_LOOKUP_SMOKE_ROWS] : MIXED_LOOKUP_SIZES) {
    add("xlookup-mixed-exact", size);
  }
  for (const id of LOOKUP_ROW_IDS) {
    add(id, lookupFormulas);
    add(`${id}${LOOKUP_EDIT_SUFFIX}`, lookupFormulas);
  }
  add("spill-filter-resize", range);
  add("sumproduct-vector-edit", range);
  add("sumproduct-matrix-edit", range);
  add("criteria-multi-range-edit", range);
  add("sum-multi-range", range);
  add("sumifs-3-criteria", range);
  add("countif-100k", range);
  add("unicode-text-date-edit", 1_000);
  add("percentile-covariance", range);
  add("let-reuse-edit", range);
  add("let-repeat", range);
  for (const size of smoke ? [1_000] : LET_MANY_SIZES) {
    add("let-many", size);
  }
  for (const id of SHAPE_ROW_IDS) {
    for (const size of smoke ? [1_000] : SHAPE_ROW_SIZES) {
      add(id, size);
    }
  }
  for (const id of BINDING_ROW_IDS) {
    for (const size of smoke ? [1_000] : BINDING_ROW_SIZES) {
      add(id, size);
    }
  }
  add("iterative-finance", 1_000);
  add("incremental-dependency-closure-edit", range);
  add("paged-cell-reads", range);
  const pagedRows = smoke ? PAGED_SMOKE_ROWS : PAGED_ROWS;
  add("paged-insert-row", pagedRows);
  add("paged-range-loaded", pagedRows);
  const evictionPages = smoke ? PAGED_EVICTION_SMOKE_PAGES : PAGED_EVICTION_PAGES;
  add("paged-eviction", evictionPages);
  const indexMatchFormulas = smoke ? 50 : INDEX_MATCH_FORMULAS;
  add("index-match-many", indexMatchFormulas, range);
  const rankManySize = smoke ? 1_000 : RANK_MANY_SIZE;
  add("rank-many", rankManySize);
  add("sort-unique-filter", range);
  add("subtotal-filtered", range);
  add("sparse-page-write", range);
  add("spill-sequence-admission", large);
  add("history-diff", HISTORY_CELLS);
  if (enginePackage === "formulas") {
    for (const row of FULL_ENGINE_ROWS) {
      const size = smoke ? row.smokeSize : row.size;
      add(row.id, size);
    }
    for (const id of CLOSURE_ROW_IDS) {
      for (const size of smoke ? [1_000] : CLOSURE_ROW_SIZES) {
        add(id, size);
      }
    }
  }
  return workloads;
}

export function expectedFormulaWorkloadKeys(
  mode: BenchmarkMode,
  enginePackage: FormulaEnginePackage = ENGINE_PACKAGE,
): string[] {
  return formulaWorkloads(mode === "smoke", enginePackage).map(formulaWorkloadKey);
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
  "getpivotdata-source-edit",
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
  "map-lambda",
  "reduce-lambda",
  "byrow-lambda",
  "lambda-call",
  "named-lambda",
  "measure-pivot",
]);

function legacyFormulaBaselineWorkloadKeys(): string[] {
  return expectedFormulaWorkloadKeys("full", "wasm").filter((key) => {
    const id = key.slice("workload=".length, key.indexOf(";size="));
    return !EXPANDED_FORMULA_WORKLOAD_IDS.has(id);
  });
}

export function expectedFormulaMemoryKeys(mode: BenchmarkMode): string[] {
  const sizes = mode === "smoke" ? [1_000] : FORMULA_SIZES;
  return sizes.map((formulas) => `memory=formulas=${formulas}`);
}

/** The rows above, as the artifact checks read them. */
const FORMULA_MATRIX: FormulaArtifactMatrix = {
  workloadKeys: expectedFormulaWorkloadKeys,
  legacyWorkloadKeys: legacyFormulaBaselineWorkloadKeys,
  memoryKeys: expectedFormulaMemoryKeys,
  shapeRowIds: SHAPE_ROW_IDS,
};

export function validateFormulaBenchmark(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): asserts result is CompleteFormulaBenchmarkResult {
  checkFormulaBenchmark(FORMULA_MATRIX, result, expectedMode);
}

export function validateFormulaRegression(
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): void {
  checkFormulaRegression(FORMULA_MATRIX, candidate, baseline);
}

export function validateFormulaCapture(
  candidate: FormulaBenchmarkResult,
  baseline?: FormulaBenchmarkResult,
): void {
  checkFormulaCapture(FORMULA_MATRIX, candidate, baseline);
}

export function validateRecordedFormulaCapture(capture: FormulaBenchmarkResult): void {
  checkRecordedFormulaCapture(FORMULA_MATRIX, capture);
}

// Check every entry path before it can load or measure the selected baseline.
if (ENGINE_ROOT !== undefined) {
  captureEngineBaselineContext(protocolCaptureMeta().commit, [ENGINE_PACKAGE]);
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

function runWorkloads(smoke: boolean): CompleteFormulaWorkloadResult[] {
  const samples = smoke ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
  return formulaWorkloads(smoke).map(({ id, size, rangeSize }) =>
    collectFixture(id, size, () => createFormulaFixture(id, size, rangeSize), samples),
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
  for (const { id, size, rangeSize } of formulaWorkloads(false)) {
    const key = formulaWorkloadKey({ id, size });
    let sample: AggregatedWorkloadSample;
    try {
      sample = collectAggregatedSample(id, size, () => createFormulaFixture(id, size, rangeSize), {
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
  const fixture = createFormulaFixture("independent-first-recompute", formulas);
  fixture.run();
  assert(fixture.check() === formulas, "memory fixture");
  forceGc();
  return { formulas, wasmDeltaBytes: wasm.memory.buffer.byteLength - before };
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
    baseline = readBaseline(FORMULA_MATRIX);
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
    const sampleIds = [
      "independent-parse-load",
      "independent-first-recompute",
      "linear-chain",
      "wide-fan-out-edit",
      "scalar-edit-affects-0",
      "formula-constant-edit",
      "vlookup-many",
    ];
    const factories = Object.fromEntries(
      sampleIds.map((sampleId) => [sampleId, () => createFormulaFixture(sampleId, size)]),
    );
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
