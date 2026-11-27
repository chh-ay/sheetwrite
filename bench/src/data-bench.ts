import { mkdirSync, readFileSync } from "node:fs";
/**
 * Headless data-layer benchmark: Sheetwrite vs Handsontable.
 *
 * Measures the cost of pure data operations — load, windowed read, edit, sort,
 * filter, aggregate — with median, interpolated p95, and spread over warmed-up,
 * repeated iterations, plus a memory profile sampled in isolated subprocesses.
 * The dataset is seeded and deterministic (see ./dataset.ts), so every workload
 * runs over byte-identical content on both engines and the numbers reproduce.
 *
 * ── Size matrix ──────────────────────────────────────────────────────────────
 * Sheetwrite is exercised at 1k / 10k / 100k / 500k / 1M rows — its WASM
 * columnar store scales to 1M effortlessly. Handsontable is a DOM grid with no
 * headless layout engine: under happy-dom it cannot virtualize and renders
 * EVERY row (a single 100k construct measured ~26 s, rendering ~131k <tr>s), so
 * it is exercised headlessly only at 1k / 10k — the sizes where it completes in
 * reasonable time. The at-scale (100k–1M) apples-to-apples comparison lives in
 * the browser render benchmark, where Handsontable virtualizes against real
 * layout. The 1k/10k rows are the headless head-to-head; 100k–1M show
 * Sheetwrite's data-engine scaling.
 *
 * ── Honest asymmetries (reported, never hidden) ─────────────────────────────
 *   • Sheetwrite keeps cell data in WASM linear memory (a Rust columnar store);
 *     headless it does no painting.
 *   • Handsontable keeps data in JS arrays coupled to a DOM view. Its edit loop
 *     is wrapped in suspendRender/resumeRender to isolate the data path, and it
 *     has no native column aggregate, so the sum is computed in plain JS over
 *     its source array (the idiomatic approach). Both facts are noted in-table.
 *
 * Memory is sampled in isolated subprocesses (`--mem <engine> <rows>`): the JS
 * heap delta around a single ingest for both engines, plus — for Sheetwrite —
 * the WASM linear-memory delta, since its data lives off the JS heap entirely.
 *
 * Every timed sample of both engines runs after a forced full GC, taken outside
 * the timed region once the previous sample's instance is released, and every
 * engine run ends with one more. `--heap-trace <path>` writes the post-GC heap
 * after each of those GCs as a separate diagnostic file, never as a result.
 * All ingest iterations close and replace their global happy-dom Window outside
 * timing; this releases document-owned selector caches without private symbols.
 */
import { dirname } from "node:path";

import type { CellScalar, Column, ColumnarData, SortKey, Workbook } from "@sheetwrite/core";
import type { CellValue, GridSettings, HotInstance } from "handsontable";

import { columnCompletions } from "../../packages/core/src/autocomplete.js";
import { autoFilterValues } from "../../packages/core/src/autofilter-actions.js";
import { getEngine } from "../../packages/core/src/engine.js";
import { initSheetwrite, SheetwriteStore } from "../../packages/core/src/index.js";
import { storeEngine } from "../../packages/core/src/store/engine-registry.js";
import { optionValue } from "./cli-options.js";
import {
  AGG_COL,
  COL,
  COLUMNS,
  type ColumnarDataset,
  FILTER_COL,
  FILTER_NEEDLE,
  makeColumnar,
  type SheetwriteColumnar,
  SORT_COL,
  toAoA,
  toSheetwriteColumnar,
} from "./dataset.js";
// Side-effecting DOM bootstrap MUST be first so Handsontable boots headlessly.
import { resetBenchmarkDocument } from "./dom-setup.js";
import { validateEngineVersions } from "./engine-versions.js";
import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type GateIdentity,
  MATRIX_IDS,
  DATA_GATE_PROTOCOL_VERSION,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import { createHandsontable } from "./handsontable-runtime.js";
import { writeStringColumn } from "./packed-fixture.js";
import { packageVersion, protocolCaptureMeta } from "./protocol-meta.js";
import {
  collect,
  forceGc,
  type MeasureOptions,
  mib,
  ms,
  now,
  type Stat,
  summarize,
} from "./stats.js";

/** Sheetwrite is measured across the full range; its store scales to 1M. */
export const SHEETWRITE_ROWS = [1_000, 10_000, 100_000, 500_000, 1_000_000] as const;
/** Handsontable headless ceiling — larger sizes render every row (infeasible). */
export const HANDSONTABLE_ROWS = [1_000, 10_000] as const;
/** Sizes where both engines run headlessly → the apples-to-apples head-to-head. */
const HEAD_TO_HEAD_ROWS = [1_000, 10_000] as const;

const SHEET = "bench";
const ALL_COLS: readonly number[] = [0, 1, 2, 3, 4];
const WINDOW_ROWS = 50;
const EDIT_COUNT = 1_000;
const WINDOW_READ_BATCH = 32;
const SMALL_AGGREGATE_BATCH = 128;
/** A sample this slow means the scenario stopped measuring anything useful. */
const ABSOLUTE_SAMPLE_CEILING_MS = 30_000;
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);

export const WORKLOADS = [
  "ingest",
  "windowRead",
  "edit",
  "sort",
  "filter",
  "multiFilter",
  "distinctLow",
  "distinctHigh",
  "aggregate",
] as const;
export type Workload = (typeof WORKLOADS)[number];
export type EngineId = "sheetwrite" | "handsontable";

const WORKLOAD_LABELS: Record<Workload, string> = {
  ingest: "Ingest N rows",
  windowRead: "Read 50×5 window",
  edit: "1000 single-cell edits",
  sort: "Sort by amount (numeric)",
  filter: `Filter city contains "${FILTER_NEEDLE}"`,
  aggregate: "Sum amount (aggregate)",
  multiFilter: "Compose city and customer contains filters",
  distinctLow: "Distinct low-cardinality city values",
  distinctHigh: "Distinct high-cardinality customer values",
};

/**
 * Sheetwrite-only query scenarios: multi-key sorts, value-set filters and an
 * all-numeric ingest. They exercise the Rust query engine and the columnar
 * ingest path, which no other engine in this bench implements, so they are
 * reported on their own rather than in the cross-engine head-to-head.
 */
export const QUERY_SCENARIOS = [
  "sort-multi-key",
  "sort-with-candidates",
  "filter-value-set-10",
  "filter-value-set-1000",
  "filter-value-set-50000",
  "autofilter-dropdown",
  "autofilter-apply-values",
  "autocomplete-first-key",
  "ingest-numeric-only",
] as const;
export type QueryScenario = (typeof QUERY_SCENARIOS)[number];
/** {@link QUERY_SCENARIOS} as plain strings, for membership tests over observed keys. */
const QUERY_SCENARIO_NAMES: readonly string[] = QUERY_SCENARIOS;

const VALUE_SET_SCENARIOS = [
  "filter-value-set-10",
  "filter-value-set-1000",
  "filter-value-set-50000",
] as const;
type ValueSetScenario = (typeof VALUE_SET_SCENARIOS)[number];

/**
 * How many `customer` values each value-set scenario picks. The customer column
 * is unique per row, so a set cannot be larger than the sheet: picks saturate at
 * the row count, which only affects sheets smaller than the pick count.
 */
const VALUE_SET_PICK_COUNTS: Record<ValueSetScenario, number> = {
  "filter-value-set-10": 10,
  "filter-value-set-1000": 1_000,
  "filter-value-set-50000": 50_000,
};

const QUERY_LABELS: Record<QueryScenario, string> = {
  "sort-multi-key": "Sort by 3 keys (text, number, date)",
  "sort-with-candidates": `Sort amount over "${FILTER_NEEDLE}" city candidates`,
  "filter-value-set-10": "Filter customer by 10 picked values",
  "filter-value-set-1000": "Filter customer by 1,000 picked values",
  "filter-value-set-50000": "Filter customer by 50,000 picked values",
  "autofilter-dropdown": "Open the AutoFilter dropdown of city (filtered)",
  "autofilter-apply-values": "Apply an AutoFilter value filter to city",
  "autocomplete-first-key": "AutoComplete's first typed key over the customer column",
  "ingest-numeric-only": "Ingest N rows (5 numeric columns)",
};

/**
 * Fixture each query scenario measures, versioned so a number recorded against
 * a different fixture is never compared with a new one. Only the sort scenario
 * changes the seeded rows; everything else reads the shared seeded dataset.
 */
export const QUERY_FIXTURES: Readonly<Record<QueryScenario, string>> = {
  "sort-multi-key":
    "grouped-customer-v2 (97 repeated customers, 8 amount buckets, dates reversed against row order)",
  "sort-with-candidates": "seeded-dataset-v1",
  "filter-value-set-10": "seeded-dataset-v1",
  "filter-value-set-1000": "seeded-dataset-v1",
  "filter-value-set-50000": "seeded-dataset-v1",
  "autofilter-dropdown": "seeded-dataset-v1",
  "autofilter-apply-values": "seeded-dataset-v1",
  "autocomplete-first-key": "seeded-dataset-v1",
  "ingest-numeric-only": "numeric-five-column-v1",
};

/**
 * Row sizes a query scenario is measured at; a scenario without an entry runs at
 * every size. The 50,000-pick filter covers 100,000 rows only: the value-set
 * filter still compares every row with every picked value, so a 50,000-value
 * list over 500k–1M rows would need minutes per sample. Smoke checks every
 * scenario, all of them at its single small size.
 */
const QUERY_SCENARIO_ROWS: Partial<Record<QueryScenario, readonly number[]>> = {
  "filter-value-set-50000": [100_000],
  // The AutoFilter rows open the dropdown on a 100,000-row column and apply a value filter there.
  "autofilter-dropdown": [100_000],
  "autofilter-apply-values": [100_000],
  // AutoComplete over a 100,000-row column of distinct entries.
  "autocomplete-first-key": [100_000],
};

function measures_query_scenario(
  scenario: QueryScenario,
  rows: number,
  mode: BenchmarkMode,
): boolean {
  if (mode === "smoke") return true;
  const declared = QUERY_SCENARIO_ROWS[scenario];
  return declared === undefined || declared.includes(rows);
}

/** Multi-key sort: customer ascending, amount descending, date ascending. */
const MULTI_KEY_SORT: readonly SortKey[] = [
  { col: COL.customer, ascending: true },
  { col: COL.amount, ascending: false },
  { col: COL.date, ascending: true },
];
/** Column order the view check reads back for {@link MULTI_KEY_SORT}. */
const MULTI_KEY_VIEW_COLS: readonly number[] = [COL.customer, COL.amount, COL.date];
/** Column order the view check reads back for the candidate sort. */
const CANDIDATE_CHECK_COLS: readonly number[] = [COL.amount, COL.city];
/**
 * Leading-key groups of the multi-key sort fixture: enough repeats that the
 * second and third sort keys decide the order inside every group.
 */
const MULTI_KEY_GROUP_COUNT = 97;
/** Amount buckets inside each customer group: ties reach the third key. */
const MULTI_KEY_AMOUNT_BUCKETS = 8;
/** Step between amount buckets; the fixture only needs distinct ordered keys. */
const MULTI_KEY_AMOUNT_STEP = 12.5;
/** Days the fixture date cycles through, like the seeded day pool. */
const MULTI_KEY_DAY_COUNT = 1_000;
const MULTI_KEY_DAY_EPOCH_UTC = Date.UTC(2020, 0, 1);
const MULTI_KEY_DAY_MS = 86_400_000;
/** Digits the grouped customer key pads to, matching the seeded customer text. */
const CUSTOMER_KEY_DIGITS = 6;
/** Rows per window when a check walks a whole view outside timing. */
const VIEW_CHECK_WINDOW_ROWS = 4_096;

/** Column keys of the all-numeric ingest payload; every column holds numbers. */
const NUMERIC_INGEST_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const;
const NUMERIC_MONEY_MODULUS = 100_000;
const NUMERIC_MONEY_SCALE = 100;
const NUMERIC_STRIDE = 7;
const NUMERIC_ROWS_PER_UNIT = 1_000;
const NUMERIC_CYCLE_LENGTH = 97;
const NUMERIC_COLUMN_WIDTH = 120;

/**
 * Per-workload iteration plan; expensive at-scale ops sample fewer times. The
 * plan names its workload so the optional heap trace can label every sample.
 */
interface IterationPlan extends Pick<MeasureOptions, "warmup" | "iters"> {
  readonly workload: Workload | QueryScenario;
}

function plan(workload: Workload | QueryScenario, rows: number): IterationPlan {
  const at_scale = rows >= 500_000;
  switch (workload) {
    case "ingest":
    case "ingest-numeric-only":
      return at_scale ? { workload, warmup: 1, iters: 3 } : { workload, warmup: 1, iters: 7 };
    case "windowRead":
      return { workload, warmup: 50, iters: 300 };
    case "edit":
      return at_scale ? { workload, warmup: 1, iters: 5 } : { workload, warmup: 1, iters: 15 };
    case "sort":
    case "filter":
    case "multiFilter":
    case "distinctLow":
    case "distinctHigh":
    case "sort-multi-key":
    case "sort-with-candidates":
    case "filter-value-set-10":
    case "filter-value-set-1000":
    case "autofilter-dropdown":
    case "autofilter-apply-values":
    case "autocomplete-first-key":
      return at_scale
        ? { workload, warmup: 1, iters: 5 }
        : { workload, warmup: rows >= 100_000 ? 1 : 2, iters: 15 };
    case "filter-value-set-50000":
      // Every row is compared with every picked value, so this scenario keeps a
      // single warm-up and few samples: minutes of run time buy no more signal.
      return { workload, warmup: 1, iters: 3 };
    case "aggregate":
      return { workload, warmup: 20, iters: 200 };
  }
}
export interface DataStat extends Stat {
  readonly samples: readonly number[];
}

/** Workload label of the GC taken after one engine has finished one row size. */
const ENGINE_BOUNDARY = "engine-boundary";

/** One post-GC heap reading of the diagnostic `--heap-trace` output. */
interface HeapTracePoint {
  readonly engine: EngineId;
  readonly rows: number;
  readonly workload: Workload | QueryScenario | typeof ENGINE_BOUNDARY;
  /** Timed samples of this workload already finished when the GC ran. */
  readonly completedSamples: number;
  readonly heapUsedBytes: number;
  readonly rssBytes: number;
  readonly maxRssBytes: number;
}

interface HeapTrace {
  /** Engine and row size the current workloads belong to. */
  scope: { readonly engine: EngineId; readonly rows: number } | undefined;
  readonly points: HeapTracePoint[];
}

/** `resourceUsage().maxRSS` is reported in kibibytes. */
const KIB = 1024;

/** Present only when `--heap-trace` asks for the diagnostic trace. */
let heap_trace: HeapTrace | undefined;

function record_heap(workload: HeapTracePoint["workload"], completed_samples: number): void {
  if (!heap_trace) return;
  const scope = heap_trace.scope;
  if (!scope) throw new Error(`heap trace has no engine scope for ${workload}`);

  const memory = process.memoryUsage();
  heap_trace.points.push({
    ...scope,
    workload,
    completedSamples: completed_samples,
    heapUsedBytes: memory.heapUsed,
    rssBytes: memory.rss,
    maxRssBytes: process.resourceUsage().maxRSS * KIB,
  });
}

/**
 * Every timed sample starts from a fully collected heap, so garbage left by an
 * earlier sample, workload or engine is never collected inside a timed region.
 * The workload's own untimed teardown runs first and releases what the sample
 * built; only then does the GC run. The same GC after the last sample leaves a
 * clean heap for the next workload, and its reading shows what that sample kept.
 */
function measure(
  fn: () => void,
  opts: IterationPlan & Pick<MeasureOptions, "before" | "after">,
): DataStat {
  const collect_and_record = (completed_samples: number): void => {
    forceGc();
    record_heap(opts.workload, completed_samples);
  };

  let setups = 0;
  let teardowns = 0;
  const samples = collect(fn, {
    warmup: opts.warmup,
    iters: opts.iters,
    before: () => {
      opts.before?.();

      // Without a warm-up no teardown precedes the first sample, so its GC runs here.
      if (setups === 0 && opts.warmup === 0) collect_and_record(0);
      setups += 1;
    },
    after: () => {
      opts.after?.();

      // collect() runs warm-up rounds through the same hook first. The last
      // warm-up's GC prepares the first sample; earlier warm-ups need none.
      const completed_samples = teardowns + 1 - opts.warmup;
      teardowns += 1;
      if (completed_samples >= 0) collect_and_record(completed_samples);
    },
  });
  return { ...summarize(samples), samples };
}

/** Only ingests own the entire DOM; read/edit workloads keep their live grid. */
async function measure_ingest(
  fn: () => void,
  opts: IterationPlan & Pick<MeasureOptions, "before" | "after">,
): Promise<DataStat> {
  const samples = new Array<number>(opts.iters);
  let previous_document: WeakRef<Document> | undefined;
  for (let iteration = 0; iteration < opts.warmup + opts.iters; iteration++) {
    if (previous_document?.deref() === document) {
      throw new Error("An ingest reused the previous sample document");
    }
    previous_document = new WeakRef(document);
    opts.before?.();
    if (iteration === 0 && opts.warmup === 0) {
      forceGc();
      record_heap(opts.workload, 0);
    }
    try {
      if (iteration < opts.warmup) {
        fn();
      } else {
        const t0 = now();
        fn();
        samples[iteration - opts.warmup] = now() - t0;
      }
    } finally {
      try {
        opts.after?.();
      } finally {
        // Closing the old global Window drops happy-dom's document-owned selector caches.
        hot_container = undefined;
        await resetBenchmarkDocument();
      }
    }
    const completed_samples = iteration + 1 - opts.warmup;
    if (completed_samples >= 0) {
      forceGc();
      record_heap(opts.workload, completed_samples);
    }
  }
  return { ...summarize(samples), samples };
}

function per_operation(stat: DataStat, batch: number): DataStat {
  return {
    median: stat.median / batch,
    p95: stat.p95 / batch,
    mean: stat.mean / batch,
    stddev: stat.stddev / batch,
    min: stat.min / batch,
    max: stat.max / batch,
    iters: stat.iters,
    samples: stat.samples.map((sample) => sample / batch),
  };
}

function measure_batched(fn: () => void, opts: IterationPlan, batch: number): DataStat {
  return per_operation(
    measure(() => {
      for (let i = 0; i < batch; i++) fn();
    }, opts),
    batch,
  );
}

/** Memory attributable to holding N rows in one engine, sampled in isolation. */
export interface MemoryProfile {
  /** process.memoryUsage().heapUsed delta around a single ingest (bytes). */
  readonly heapDeltaBytes: number;
  /** WASM linear-memory delta (bytes); null for engines without WASM. */
  readonly wasmDeltaBytes: number | null;
}

export interface QueryResourceMetrics {
  readonly composedFilterMatches: number;
  readonly containsCacheConstructions: number;
  readonly lowDistinctCount: number;
  readonly highDistinctCount: number;
  readonly ownedDistinctStrings: number;
}

/** Timed workloads for one engine at one row count. */
export interface TimedEngineResult {
  readonly rows: number;
  readonly stats: Record<Workload, DataStat>;
  readonly notes: Partial<Record<Workload, string>>;
  readonly queryResources: QueryResourceMetrics | null;
  /**
   * Sheetwrite-only query scenarios. Engines without a query engine report an
   * empty record; artifacts recorded before the section existed omit it.
   */
  readonly queries?: Readonly<Partial<Record<QueryScenario, DataStat>>>;
}

/** All measured workloads for one engine at one row count. */
export interface EngineResult extends TimedEngineResult {
  readonly memory: MemoryProfile;
}

export interface DataBenchmarkResult extends GateIdentity<typeof DATA_GATE_PROTOCOL_VERSION> {
  readonly meta: {
    readonly engineVersions: Readonly<Record<EngineId, string>>;
    readonly bun: string;
    readonly platform: string;
    readonly arch: string;
    readonly commit: string;
    readonly dirty: boolean;
    readonly timestamp: string;
    readonly sheetwriteRows: readonly number[];
    readonly handsontableRows: readonly number[];
    /** Fixture, versioned, behind every query scenario in this artifact. */
    readonly queryFixtures?: Readonly<Record<QueryScenario, string>>;
    /** Every timed sample ran after a forced full GC; see {@link measure}. */
    readonly gcBetweenSamples: true;
    /** A closed and replaced global document separates every ingest iteration. */
    readonly freshDocumentBetweenIngestSamples: true;
  };
  readonly sheetwrite: Readonly<Record<string, EngineResult>>;
  readonly handsontable: Readonly<Record<string, EngineResult>>;
}

export function dataMatrixKey(
  engine: EngineId,
  rows: number,
  metric: Workload | QueryScenario | "memory",
): string {
  return `engine=${engine};rows=${rows};metric=${metric}`;
}

export function expectedDataMatrixKeys(mode: BenchmarkMode): string[] {
  const keys: string[] = [];
  const engines: readonly [EngineId, readonly number[]][] =
    mode === "smoke"
      ? [["sheetwrite", [1_000]]]
      : [
          ["sheetwrite", SHEETWRITE_ROWS],
          ["handsontable", HANDSONTABLE_ROWS],
        ];
  for (const [engine, rows_list] of engines) {
    for (const rows of rows_list) {
      for (const workload of WORKLOADS) keys.push(dataMatrixKey(engine, rows, workload));
      keys.push(dataMatrixKey(engine, rows, "memory"));
    }
  }
  return keys;
}

/**
 * Query scenarios run on the Sheetwrite engine only, so they are validated per
 * row instead of through the exact cross-engine matrix: every scenario declared
 * for that row and mode must carry a finite sample, and an engine without a
 * query engine must report none. Rows recorded before the section existed omit
 * it and skip these checks.
 */
function validate_engine_queries(
  engine: EngineId,
  rows: number,
  row: EngineResult,
  mode: BenchmarkMode,
): void {
  const queries = row.queries;
  if (engine !== "sheetwrite") {
    if (queries !== undefined && Object.keys(queries).length > 0) {
      throw new Error(`data ${engine} ${rows} must not report query scenarios`);
    }
    return;
  }
  if (queries === undefined) {
    throw new Error(`data sheetwrite ${rows} is missing its query scenarios`);
  }
  for (const scenario of Object.keys(queries)) {
    if (!QUERY_SCENARIO_NAMES.includes(scenario)) {
      throw new Error(`data sheetwrite ${rows} reported an undeclared query scenario: ${scenario}`);
    }
  }
  for (const scenario of QUERY_SCENARIOS) {
    const key = dataMatrixKey(engine, rows, scenario);
    const stat = queries[scenario];
    if (stat === undefined) {
      if (measures_query_scenario(scenario, rows, mode)) throw new Error(`${key} is missing`);
      continue;
    }
    if (!measures_query_scenario(scenario, rows, mode)) {
      throw new Error(
        `data sheetwrite ${rows} reported query scenario ${scenario} outside its declared rows`,
      );
    }
    if (!Array.isArray(stat.samples)) throw new Error(`${key}.samples are missing`);
    validateRawStat(stat.samples, stat, key);
    if (stat.p95 >= ABSOLUTE_SAMPLE_CEILING_MS) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }
}

export function validateDataBenchmark(
  result: DataBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): void {
  assertGateIdentity("data", expectedMode, result);
  validateEngineVersions(result.meta.engineVersions, ["sheetwrite", "handsontable"]);
  for (const field of ["bun", "platform", "arch"] as const) {
    if (typeof result.meta[field] !== "string" || result.meta[field].length === 0) {
      throw new Error(`data metadata.${field} must be a non-empty string`);
    }
  }
  // Numbers sampled without a GC before each sample come from another method.
  if (result.meta.gcBetweenSamples !== true) {
    throw new Error("data metadata.gcBetweenSamples must be true");
  }
  if (result.meta.freshDocumentBetweenIngestSamples !== true) {
    throw new Error("data metadata.freshDocumentBetweenIngestSamples must be true");
  }
  const expected_sheetwrite_rows = expectedMode === "smoke" ? [1_000] : [...SHEETWRITE_ROWS];
  const expected_handsontable_rows = expectedMode === "smoke" ? [] : [...HANDSONTABLE_ROWS];
  if (
    JSON.stringify(result.meta.sheetwriteRows) !== JSON.stringify(expected_sheetwrite_rows) ||
    JSON.stringify(result.meta.handsontableRows) !== JSON.stringify(expected_handsontable_rows)
  ) {
    throw new Error(`data ${expectedMode} metadata does not match its declared row matrices`);
  }

  const result_families = [
    ["sheetwrite", result.sheetwrite],
    ["handsontable", result.handsontable],
  ] as const;
  const observed_keys: string[] = [];
  for (const [engine, records] of result_families) {
    for (const [rows_text, row] of Object.entries(records)) {
      const rows = Number(rows_text);
      if (!Number.isInteger(rows) || rows <= 0 || row.rows !== rows) {
        throw new Error(`data ${engine} row identity is malformed: ${rows_text}`);
      }
      for (const workload of Object.keys(row.stats)) {
        observed_keys.push(dataMatrixKey(engine, rows, workload as Workload));
      }
      if (row.memory !== undefined) observed_keys.push(dataMatrixKey(engine, rows, "memory"));
    }
  }
  validateExactMatrix("data", expectedDataMatrixKeys(expectedMode), observed_keys);

  for (const [engine, records] of result_families) {
    for (const [rows_text, row] of Object.entries(records)) {
      const rows = Number(rows_text);
      for (const workload of WORKLOADS) {
        const key = dataMatrixKey(engine, rows, workload);
        const stat = row.stats[workload];
        if (!Array.isArray(stat.samples)) throw new Error(`${key}.samples are missing`);
        validateRawStat(stat.samples, stat, key);
        if (stat.p95 >= ABSOLUTE_SAMPLE_CEILING_MS) {
          throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
        }
      }
      if (engine === "sheetwrite") {
        const resources = row.queryResources;
        if (!resources) throw new Error(`${engine} ${rows} query resources are missing`);
        for (const [name, value] of Object.entries(resources)) {
          assertFiniteNonNegative(value, `${engine} ${rows} queryResources.${name}`);
          if (!Number.isInteger(value)) {
            throw new Error(`${engine} ${rows} queryResources.${name} must be an integer`);
          }
        }
        if (
          resources.composedFilterMatches <= 0 ||
          resources.composedFilterMatches > rows ||
          resources.containsCacheConstructions !== 2 ||
          resources.lowDistinctCount !== 7 ||
          resources.highDistinctCount !== rows ||
          resources.ownedDistinctStrings !==
            resources.lowDistinctCount + resources.highDistinctCount
        ) {
          throw new Error(`${engine} ${rows} query resource counters violate structural bounds`);
        }
      } else if (row.queryResources !== null) {
        throw new Error(`${engine} ${rows} queryResources must be null`);
      }
      validate_engine_queries(engine, rows, row, expectedMode);
      const memory_key = dataMatrixKey(engine, rows, "memory");
      assertFiniteNonNegative(row.memory.heapDeltaBytes, `${memory_key}.heapDeltaBytes`);
      if (row.memory.heapDeltaBytes >= 2 * 1024 * 1024 * 1024) {
        throw new Error(`${memory_key} exceeded the 2 GiB heap safety ceiling`);
      }
      if (engine === "sheetwrite") {
        if (row.memory.wasmDeltaBytes === null) {
          throw new Error(`${memory_key}.wasmDeltaBytes is missing`);
        }
        assertFiniteNonNegative(row.memory.wasmDeltaBytes, `${memory_key}.wasmDeltaBytes`);
        if (row.memory.wasmDeltaBytes >= 1024 * 1024 * 1024) {
          throw new Error(`${memory_key} exceeded the 1 GiB WASM safety ceiling`);
        }
      } else if (row.memory.wasmDeltaBytes !== null) {
        throw new Error(`${memory_key}.wasmDeltaBytes must be null for handsontable`);
      }
    }
  }
}

/** Cities the AutoFilter rows keep: three of the seven, as a user ticks them. */
const AUTO_FILTER_CITIES: readonly string[] = ["Tokyo", "Lima", "Oslo"];
/** Most values an AutoFilter dropdown lists, as in core. */
const AUTO_FILTER_LIST_LIMIT = 10_000;

/**
 * The AutoFilter rows of #735: an AutoFilter over the whole sheet (row 0 its
 * header), applying a value filter to city, and opening city's dropdown while
 * that filter is on, which lists the column's values and the kept ones.
 */
function measure_auto_filter(
  query_store: SheetwriteStore,
  ds: ColumnarDataset,
  rows: number,
  queries: Partial<Record<QueryScenario, DataStat>>,
  measures: (scenario: QueryScenario) => boolean,
): void {
  const engine = storeEngine(query_store);
  if (!engine) throw new Error("autofilter: the query store has no engine");
  const range = {
    sheet: SHEET,
    start: { row: 0, col: 0 },
    end: { row: rows - 1, col: COLUMNS.length - 1 },
  };
  const filter = { kind: "values" as const, values: AUTO_FILTER_CITIES };
  const kept_rows = ds.city.slice(1).filter((city) => AUTO_FILTER_CITIES.includes(city)).length;
  const listed_cities = new Set(ds.city.slice(1)).size;
  query_store.applyTransaction({
    patches: [{ op: "setSheetMeta", sheet: SHEET, patch: { autoFilter: { range }, filters: [] } }],
  });

  if (measures("autofilter-apply-values")) {
    queries["autofilter-apply-values"] = measure(
      () => query_store.setColumnFilter(SHEET, COL.city, filter),
      {
        ...plan("autofilter-apply-values", rows),
        after: () => query_store.setColumnFilter(SHEET, COL.city, null),
      },
    );
  }

  query_store.setColumnFilter(SHEET, COL.city, filter);
  // The header row stays; the body keeps the three cities' rows.
  if (query_store.viewRowCount(SHEET) !== 1 + kept_rows) {
    throw new Error(`autofilter ${rows}: ${query_store.viewRowCount(SHEET)} rows shown`);
  }

  if (measures("autofilter-dropdown")) {
    // What a dropdown lists, from the sheet as the grid holds it.
    const sheet = query_store.getWorkbook().sheets.find((candidate) => candidate.id === SHEET);
    if (!sheet) throw new Error(`autofilter ${rows}: no ${SHEET} sheet`);
    let listed: ReturnType<typeof autoFilterValues> | undefined;
    queries["autofilter-dropdown"] = measure(
      () => {
        listed = autoFilterValues(engine, sheet, COL.city, AUTO_FILTER_LIST_LIMIT);
      },
      plan("autofilter-dropdown", rows),
    );
    if (listed?.values.length !== listed_cities || listed.kept?.length !== 3) {
      throw new Error(`autofilter ${rows}: the dropdown listed the wrong values`);
    }
  }

  query_store.applyTransaction({
    patches: [{ op: "setSheetMeta", sheet: SHEET, patch: { autoFilter: null, filters: [] } }],
  });
}

function make_workbook(row_count: number): Workbook {
  const columns: Column[] = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width,
    type: c.type,
  }));
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Bench", rowCount: row_count, columns }],
  };
}

/**
 * One value of the all-numeric ingest payload. Every column is a plain formula
 * of the row index, so the read-back check can recompute the expected value at
 * any row instead of keeping a second copy of the data.
 */
function numeric_ingest_value(column: number, row: number): number {
  switch (column) {
    case 0:
      return row + 1;
    case 1:
      return ((row % NUMERIC_MONEY_MODULUS) + 1) / NUMERIC_MONEY_SCALE;
    case 2:
      return (row * NUMERIC_STRIDE) % NUMERIC_MONEY_MODULUS;
    case 3:
      return row / NUMERIC_ROWS_PER_UNIT;
    default:
      return (row % NUMERIC_CYCLE_LENGTH) / NUMERIC_CYCLE_LENGTH;
  }
}

/** Workbook for the all-numeric ingest: five number columns, no text at all. */
function make_numeric_ingest_workbook(row_count: number): Workbook {
  const columns: Column[] = NUMERIC_INGEST_KEYS.map((key, index) => ({
    key,
    header: `N${index + 1}`,
    width: NUMERIC_COLUMN_WIDTH,
    type: "number",
  }));
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Bench", rowCount: row_count, columns }],
  };
}

/** Five dense number columns built from {@link numeric_ingest_value}. */
function make_numeric_ingest_data(row_count: number): ColumnarData {
  const columns: Record<string, Float64Array> = {};
  for (const [index, key] of NUMERIC_INGEST_KEYS.entries()) {
    const values = new Float64Array(row_count);
    for (let row = 0; row < row_count; row++) values[row] = numeric_ingest_value(index, row);
    columns[key] = values;
  }
  return { rowCount: row_count, columns };
}

/**
 * Columns of the multi-key sort fixture. Every key is derived from the row
 * index, so all of them decide part of the order at every sheet size:
 * customers repeat every 97 rows, the amount cycles through 8 buckets inside a
 * customer group, and the date runs opposite to row order (so a comparator that
 * skips the date key cannot score the same order). The shared seeded dataset is
 * never changed; `id` and `city` stay seeded.
 */
interface GroupedCustomerFixture {
  readonly customer: string[];
  readonly amount: Float64Array;
  readonly date: string[];
}

function make_grouped_customer_fixture(row_count: number): GroupedCustomerFixture {
  const customer = new Array<string>(row_count);
  const amount = new Float64Array(row_count);
  const date = new Array<string>(row_count);
  for (let row = 0; row < row_count; row++) {
    const occurrence = Math.floor(row / MULTI_KEY_GROUP_COUNT);
    const group = (row % MULTI_KEY_GROUP_COUNT) + 1;
    customer[row] = `Customer ${String(group).padStart(CUSTOMER_KEY_DIGITS, "0")}`;
    amount[row] = ((occurrence % MULTI_KEY_AMOUNT_BUCKETS) + 1) * MULTI_KEY_AMOUNT_STEP;
    const day = MULTI_KEY_DAY_COUNT - 1 - (occurrence % MULTI_KEY_DAY_COUNT);
    date[row] = new Date(MULTI_KEY_DAY_EPOCH_UTC + day * MULTI_KEY_DAY_MS)
      .toISOString()
      .slice(0, 10);
  }
  return { customer, amount, date };
}

/** Store over the grouped-customer fixture, with the seeded id and city. */
function make_grouped_customer_store(
  ds: ColumnarDataset,
  fixture: GroupedCustomerFixture,
): SheetwriteStore {
  return new SheetwriteStore(make_workbook(ds.rowCount), {
    rowCount: ds.rowCount,
    columns: {
      id: ds.id,
      date: fixture.date,
      customer: fixture.customer,
      city: ds.city,
      amount: fixture.amount,
    },
  });
}

/**
 * Store over the pristine seeded rows for the query scenarios. The shared store
 * has its amount cells rewritten by the edit workload, so an expectation read
 * from the dataset would no longer describe it.
 */
function make_seeded_query_store(ds: ColumnarDataset): SheetwriteStore {
  return new SheetwriteStore(make_workbook(ds.rowCount), toSheetwriteColumnar(ds));
}

function probe_query_resources(ds: ColumnarDataset): QueryResourceMetrics {
  const store = new (getEngine().CellStore)();

  try {
    const sheet = store.addSheet(2, ds.rowCount);
    for (const [col, values] of [ds.city, ds.customer].entries()) {
      writeStringColumn(store, sheet, col, 0, values, 0);
    }

    store.resetQueryResourceStats();
    const matched = store.filterRowsMulti(
      sheet,
      Uint32Array.of(0, 1),
      Uint8Array.of(1, 1),
      Uint8Array.of(0, 0),
      new Float64Array(2),
      new Uint32Array(2),
      Uint32Array.of(1, 1),
      new Float64Array(),
      ["o", "Customer"],
    );
    const low = store.distinctValues(sheet, 0, 0);
    const high = store.distinctValues(sheet, 1, 0);
    const low_distinct_count = low.takeKinds().length;
    const high_distinct_count = high.takeKinds().length;
    low.free();
    high.free();

    const stats = store.queryResourceStats();

    return {
      composedFilterMatches: matched.length,
      containsCacheConstructions: stats[0] ?? 0,
      lowDistinctCount: low_distinct_count,
      highDistinctCount: high_distinct_count,
      ownedDistinctStrings: stats[1] ?? 0,
    };
  } finally {
    store.free();
  }
}

async function bench_sheetwrite(
  ds: ColumnarDataset,
  columnar: SheetwriteColumnar,
  mode: BenchmarkMode,
): Promise<TimedEngineResult> {
  const rows = ds.rowCount;
  const stats = {} as Record<Workload, DataStat>;

  // (a) ingest — a fresh store per timed iteration loads all columns into WASM.
  let store_sink: SheetwriteStore | undefined;
  stats.ingest = await measure_ingest(
    () => {
      store_sink = new SheetwriteStore(make_workbook(rows), columnar);
    },
    {
      ...plan("ingest", rows),
      after: () => {
        // Free this iteration's store before the GC that follows it: its WASM
        // allocations are reclaimed deterministically instead of accumulating
        // across iterations/rounds. The shared linear memory remains reusable.
        store_sink?.dispose();
        store_sink = undefined;
      },
    },
  );

  // One persistent store backs the remaining read/mutate workloads.
  const store = new SheetwriteStore(make_workbook(rows), columnar);

  // (b) windowRead — rotate the start offset by a coprime stride to defeat any
  // per-window caching and sweep the whole sheet.
  const max_start = Math.max(0, rows - WINDOW_ROWS);
  let off = 0;
  stats.windowRead = measure_batched(
    () => {
      const start = off;
      off = off + 977 > max_start ? 0 : off + 977;
      store.getVisibleWindow(SHEET, { start, end: start + WINDOW_ROWS }, ALL_COLS);
    },
    plan("windowRead", rows),
    WINDOW_READ_BATCH,
  );

  // (c) edit — 1000 single-cell transactions; each recomputes the sheet, the
  // real per-commit cost of an interactive edit.
  stats.edit = measure(
    () => {
      for (let k = 0; k < EDIT_COUNT; k++) {
        const row = (k * 1009) % rows;
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: SHEET, row, col: COL.amount },
              value: { kind: "literal", value: (k % 9000) + 0.5 },
            },
          ],
        });
      }
    },
    plan("edit", rows),
  );

  // (d) sort / (e) filter — WASM ops returning a view order; reset between runs.
  const reset: Pick<MeasureOptions, "after"> = { after: () => store.clearView(SHEET) };
  stats.sort = measure(() => store.setViewSort(SHEET, [{ col: SORT_COL, ascending: true }]), {
    ...plan("sort", rows),
    ...reset,
  });
  stats.filter = measure(() => store.filterBy(SHEET, FILTER_COL, FILTER_NEEDLE), {
    ...plan("filter", rows),
    ...reset,
  });

  store.setColumnFilter(SHEET, COL.city, { kind: "contains", text: "o" });
  stats.multiFilter = measure(
    () => store.setColumnFilter(SHEET, COL.customer, { kind: "contains", text: "Customer" }),
    {
      ...plan("multiFilter", rows),
      after: () => store.setColumnFilter(SHEET, COL.customer, null),
    },
  );
  store.clearView(SHEET);

  let distinct_sink = 0;
  stats.distinctLow = measure(
    () => {
      distinct_sink = store.distinctValues(SHEET, COL.city, 0).length;
    },
    plan("distinctLow", rows),
  );
  stats.distinctHigh = measure(
    () => {
      distinct_sink = store.distinctValues(SHEET, COL.customer, 0).length;
    },
    plan("distinctHigh", rows),
  );

  const query_resources = probe_query_resources(ds);
  store.clearView(SHEET);
  void distinct_sink;
  // (f) aggregate — WASM column sum.
  let agg_sink = 0;
  stats.aggregate = measure_batched(
    () => {
      agg_sink = store.aggregate(SHEET, AGG_COL, "sum");
    },
    plan("aggregate", rows),
    rows <= 10_000 ? SMALL_AGGREGATE_BATCH : 1,
  );
  void agg_sink;

  // (g) Query scenarios. Each one measures a fixture store built from the
  // pristine seeded rows and re-reads its complete result through the public
  // window API, comparing it with an independently computed row-id order, so a
  // fast answer that is not the right answer fails.
  // Scenarios without a declared row list run at every size.
  const queries = {} as Record<QueryScenario, DataStat>;
  const measures = (scenario: QueryScenario): boolean =>
    measures_query_scenario(scenario, rows, mode);
  const query_store = make_seeded_query_store(ds);

  if (measures("sort-multi-key")) {
    // The seeded rows have unique customers, so their order never reaches the
    // second sort key. The grouped fixture repeats the leading key on purpose.
    const fixture = make_grouped_customer_fixture(rows);
    const grouped_store = make_grouped_customer_store(ds, fixture);
    queries["sort-multi-key"] = measure(() => grouped_store.setViewSort(SHEET, MULTI_KEY_SORT), {
      ...plan("sort-multi-key", rows),
      after: () => grouped_store.setViewSort(SHEET, []),
    });
    grouped_store.setViewSort(SHEET, MULTI_KEY_SORT);
    assert_view_matches_rows(
      `sort-multi-key ${rows}`,
      grouped_store,
      MULTI_KEY_VIEW_COLS,
      expected_grouped_sort_order(ds, fixture),
      grouped_row_source(ds, fixture),
    );
    grouped_store.dispose();
  }

  // One key over the candidate rows a city filter leaves behind.
  if (measures("sort-with-candidates")) {
    query_store.setColumnFilter(SHEET, FILTER_COL, { kind: "contains", text: FILTER_NEEDLE });
    queries["sort-with-candidates"] = measure(
      () => query_store.setViewSort(SHEET, [{ col: SORT_COL, ascending: true }]),
      {
        ...plan("sort-with-candidates", rows),
        after: () => query_store.setViewSort(SHEET, []),
      },
    );
    query_store.setViewSort(SHEET, [{ col: SORT_COL, ascending: true }]);
    assert_view_matches_rows(
      `sort-with-candidates ${rows}`,
      query_store,
      CANDIDATE_CHECK_COLS,
      expected_candidate_sort_order(ds),
      seeded_row_source(ds),
    );
    query_store.clearView(SHEET);
  }

  for (const scenario of VALUE_SET_SCENARIOS) {
    if (!measures(scenario)) continue;
    const picked_count = Math.min(VALUE_SET_PICK_COUNTS[scenario], rows);
    // The customer column is unique per row, so each pick matches exactly once.
    const picked = ds.customer.slice(0, picked_count);
    queries[scenario] = measure(
      () => query_store.setColumnFilter(SHEET, COL.customer, { kind: "values", values: picked }),
      {
        ...plan(scenario, rows),
        after: () => query_store.setColumnFilter(SHEET, COL.customer, null),
      },
    );
    query_store.setColumnFilter(SHEET, COL.customer, { kind: "values", values: picked });
    assert_view_matches_rows(
      `filter ${scenario} ${rows}`,
      query_store,
      [COL.customer],
      expected_picked_row_ids(picked_count),
      seeded_row_source(ds),
    );
    query_store.clearView(SHEET);
  }

  if (measures("autofilter-dropdown") || measures("autofilter-apply-values")) {
    measure_auto_filter(query_store, ds, rows, queries, measures);
  }

  if (measures("autocomplete-first-key")) {
    // The editor's first typed key in the column's first cell: find the block
    // below it, read its distinct entries from the engine and scan them for
    // the first letter. Every customer is distinct and begins with "C", the
    // worst case: all 100,000 entries match, so nothing is completed. A later
    // key of the same edit then completes the last row's entry.
    const engine = storeEngine(query_store);
    if (!engine) throw new Error("autocomplete: the query store has no engine");
    const sheet = {
      engine,
      sheet: SHEET,
      sorted: query_store.hasView(SHEET),
      rowCount: rows,
      toDataRow: (view_row: number) => view_row,
      filled: (view_row: number, col: number) =>
        query_store.getCell({ sheet: SHEET, row: view_row, col }).resolved !== null,
      dataEdge: (view_row: number, col: number, d_row: number, d_col: number) =>
        query_store.dataEdge(SHEET, view_row, col, d_row, d_col),
    };
    let completed: string | null = "";
    queries["autocomplete-first-key"] = measure(
      () => {
        completed = columnCompletions(sheet, 0, COL.customer)("c").entry;
      },
      plan("autocomplete-first-key", rows),
    );
    const expected = ds.customer[rows - 1]!;
    const edit = columnCompletions(sheet, 0, COL.customer);
    const first = edit("c").entry;
    const later = edit(expected.slice(0, -1).toLowerCase()).entry;
    if (completed !== null || first !== null || later !== expected) {
      throw new Error(`autocomplete ${rows}: completed ${String(later)}, not ${expected}`);
    }
  }

  if (measures("ingest-numeric-only")) {
    const numeric_data = make_numeric_ingest_data(rows);
    let numeric_sink: SheetwriteStore | undefined;
    queries["ingest-numeric-only"] = await measure_ingest(
      () => {
        numeric_sink = new SheetwriteStore(make_numeric_ingest_workbook(rows), numeric_data);
      },
      {
        ...plan("ingest-numeric-only", rows),
        after: () => {
          // Check each loaded store before it is released for the next GC.
          if (!numeric_sink) throw new Error(`ingest-numeric-only ${rows} built no store`);
          assert_numeric_ingest(`ingest-numeric-only ${rows}`, numeric_sink, rows);
          numeric_sink.dispose();
          numeric_sink = undefined;
        },
      },
    );
  }

  query_store.dispose();
  store.dispose();
  return { rows, stats, notes: {}, queryResources: query_resources, queries };
}

/** Source value of one fixture cell, addressed by workbook column and data row. */
type RowSource = (column: number, dataRow: number) => CellScalar;

function seeded_row_source(ds: ColumnarDataset): RowSource {
  return (column, data_row) => {
    switch (column) {
      case COL.id:
        return data_row + 1;
      case COL.date:
        return ds.date[data_row] ?? null;
      case COL.customer:
        return ds.customer[data_row] ?? null;
      case COL.city:
        return ds.city[data_row] ?? null;
      case COL.amount:
        return ds.amount[data_row] ?? null;
      default:
        throw new Error(`no seeded source value for column ${column}`);
    }
  };
}

/** Seeded rows with the fixture's customer, amount and date columns. */
function grouped_row_source(ds: ColumnarDataset, fixture: GroupedCustomerFixture): RowSource {
  const seeded = seeded_row_source(ds);
  return (column, data_row) => {
    switch (column) {
      case COL.customer:
        return fixture.customer[data_row] ?? null;
      case COL.amount:
        return fixture.amount[data_row] ?? null;
      case COL.date:
        return fixture.date[data_row] ?? null;
      default:
        return seeded(column, data_row);
    }
  };
}

/**
 * Expected multi-key sort order, computed here from the fixture columns and not
 * by the engine under test: customer ascending, amount descending, date
 * ascending, then row id.
 */
function expected_grouped_sort_order(
  ds: ColumnarDataset,
  fixture: GroupedCustomerFixture,
): number[] {
  const rows = Array.from({ length: ds.rowCount }, (_, row) => row);
  rows.sort((left, right) => {
    const left_customer = fixture.customer[left] ?? "";
    const right_customer = fixture.customer[right] ?? "";
    if (left_customer !== right_customer) return left_customer < right_customer ? -1 : 1;
    const left_amount = fixture.amount[left] ?? 0;
    const right_amount = fixture.amount[right] ?? 0;
    if (left_amount !== right_amount) return right_amount < left_amount ? -1 : 1;
    const left_date = fixture.date[left] ?? "";
    const right_date = fixture.date[right] ?? "";
    if (left_date !== right_date) return left_date < right_date ? -1 : 1;
    return left - right;
  });
  return rows.map((row) => row + 1);
}

/**
 * Expected candidate sort order: the city-filter rows by amount ascending, then
 * row id — again computed here, not by the engine under test.
 */
function expected_candidate_sort_order(ds: ColumnarDataset): number[] {
  const rows = Array.from({ length: ds.rowCount }, (_, row) => row).filter(
    (row) => ds.city[row] === FILTER_NEEDLE,
  );
  rows.sort((left, right) => {
    const left_amount = ds.amount[left] ?? 0;
    const right_amount = ds.amount[right] ?? 0;
    if (left_amount !== right_amount) return left_amount < right_amount ? -1 : 1;
    return left - right;
  });
  return rows.map((row) => row + 1);
}

/**
 * The value-set filter picks the first rows' customers, one distinct value per
 * row, so exactly those rows must survive, in ascending row order.
 */
function expected_picked_row_ids(picked_count: number): number[] {
  return Array.from({ length: picked_count }, (_, row) => row + 1);
}

/**
 * Checks the whole current view, outside timing, against an independently
 * computed row-id order: bounded windows of the id plus the scenario's key
 * columns must match both the expected ids and the source row values. A wrong
 * subset, a wrong order, or a wrong value therefore fails. The seeded `id`
 * column doubles as the data-row identity (`id = row + 1`).
 */
function assert_view_matches_rows(
  label: string,
  store: SheetwriteStore,
  check_cols: readonly number[],
  expected_ids: readonly number[],
  source_value: RowSource,
): void {
  const total = store.viewRowCount(SHEET);
  if (total !== expected_ids.length) {
    throw new Error(`${label}: the view holds ${total} rows, expected ${expected_ids.length}`);
  }
  const cols = [COL.id, ...check_cols];
  for (let start = 0; start < total; start += VIEW_CHECK_WINDOW_ROWS) {
    const end = Math.min(start + VIEW_CHECK_WINDOW_ROWS, total);
    const view = store.getVisibleWindow(SHEET, { start, end }, cols);
    for (let position = start; position < end; position++) {
      const base = (position - start) * cols.length;
      const observed_id = Number(view.values[base] ?? Number.NaN);
      const expected_id = expected_ids[position] ?? Number.NaN;
      if (observed_id !== expected_id) {
        throw new Error(
          `${label}: view row ${position} holds id ${observed_id}, expected ${expected_id}`,
        );
      }
      const data_row = observed_id - 1;
      for (const [offset, column] of check_cols.entries()) {
        const observed = view.values[base + offset + 1] ?? null;
        const expected = source_value(column, data_row);
        if (observed !== expected) {
          throw new Error(
            `${label}: view row ${position} column ${column} holds ${String(observed)}, expected ${String(expected)}`,
          );
        }
      }
    }
  }
}

/** Reads the ingested numbers back and compares them with their source formula. */
function assert_numeric_ingest(label: string, store: SheetwriteStore, rows: number): void {
  const last_row = rows - 1;
  const middle_row = Math.floor(last_row / 2);
  const sampled_rows = middle_row > 0 ? [0, middle_row, last_row] : [0, last_row];
  for (const row of sampled_rows) {
    const view = store.getVisibleWindow(SHEET, { start: row, end: row + 1 }, ALL_COLS);
    if (view.values.length !== NUMERIC_INGEST_KEYS.length) {
      throw new Error(`${label}: row ${row} read back ${view.values.length} columns`);
    }
    for (let col = 0; col < NUMERIC_INGEST_KEYS.length; col++) {
      const expected = numeric_ingest_value(col, row);
      const observed = view.values[col];
      if (typeof observed !== "number" || observed !== expected) {
        throw new Error(
          `${label}: row ${row} column ${col} read back ${String(observed)}, expected ${expected}`,
        );
      }
    }
  }
}
function warm_sheetwrite_data_path(): void {
  const rows = 10_000;
  const ds = makeColumnar(rows);
  const columnar = toSheetwriteColumnar(ds);

  // Warm constructor/load and JS↔WASM call paths before recording sub-ms medians.
  for (let i = 0; i < 3; i++) {
    new SheetwriteStore(make_workbook(rows), columnar).dispose();
  }

  const store = new SheetwriteStore(make_workbook(rows), columnar);
  for (let i = 0; i < 100; i++) {
    const start = (i * 97) % (rows - WINDOW_ROWS);
    store.getVisibleWindow(SHEET, { start, end: start + WINDOW_ROWS }, ALL_COLS);
  }

  for (let k = 0; k < EDIT_COUNT; k++) {
    const row = (k * 1009) % rows;
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: SHEET, row, col: COL.amount },
          value: { kind: "literal", value: (k % 9000) + 0.5 },
        },
      ],
    });
  }

  store.setViewSort(SHEET, [{ col: SORT_COL, ascending: true }]);
  store.clearView(SHEET);
  const small_rows = 1_000;
  const small_ds = makeColumnar(small_rows);
  const small_store = new SheetwriteStore(
    make_workbook(small_rows),
    toSheetwriteColumnar(small_ds),
  );
  small_store.setViewSort(SHEET, [{ col: SORT_COL, ascending: true }]);
  small_store.setViewSort(SHEET, MULTI_KEY_SORT);
  small_store.setColumnFilter(SHEET, COL.customer, {
    kind: "values",
    values: small_ds.customer.slice(0, 8),
  });
  small_store.clearView(SHEET);
  small_store.dispose();
  new SheetwriteStore(
    make_numeric_ingest_workbook(small_rows),
    make_numeric_ingest_data(small_rows),
  ).dispose();

  store.filterBy(SHEET, FILTER_COL, FILTER_NEEDLE);
  store.clearView(SHEET);
  store.aggregate(SHEET, AGG_COL, "sum");
  store.dispose();
}

/** Equivalent Handsontable config: same columns, virtualization on, plugins enabled. */
function hot_options(data: CellValue[][]): GridSettings {
  return {
    data,
    columns: COLUMNS.map((c, i) => ({ data: i, type: c.type === "number" ? "numeric" : "text" })),
    colHeaders: COLUMNS.map((c) => c.header),
    rowHeaders: true,
    columnSorting: true,
    filters: true,
    width: 900,
    height: 480,
    renderAllRows: false,
    autoColumnSize: false,
    autoRowSize: false,
    licenseKey: "non-commercial-and-evaluation",
  };
}

let hot_container: HTMLElement | undefined;
function container(): HTMLElement {
  if (!hot_container) {
    hot_container = document.createElement("div");
    hot_container.style.width = "900px";
    hot_container.style.height = "480px";
    document.body.appendChild(hot_container);
  }
  return hot_container;
}

async function bench_handsontable(ds: ColumnarDataset): Promise<Omit<EngineResult, "memory">> {
  const rows = ds.rowCount;
  const stats = {} as Record<Workload, DataStat>;
  const notes: Partial<Record<Workload, string>> = {};

  const guard = (workload: Workload, run: () => DataStat): DataStat => {
    try {
      return run();
    } catch (err) {
      notes[workload] = `headless limitation: ${(err as Error).message}`;
      return { ...summarize([]), samples: [] };
    }
  };

  // (a) ingest — a fresh instance per timed iteration; construction builds the
  // data map + index and renders the viewport (all rows, headless). Destroyed
  // in the untimed teardown.
  let ingest_hot: HotInstance | undefined;
  let ingest_host: HTMLElement | undefined;
  try {
    stats.ingest = await measure_ingest(
      () => {
        if (!ingest_host) throw new Error("Handsontable ingest has no sample host");
        ingest_hot = createHandsontable(ingest_host, hot_options(toAoA(ds)));
      },
      {
        ...plan("ingest", rows),
        before: () => {
          ingest_host = container();
        },
        after: () => {
          try {
            if (ingest_hot && ingest_hot.rootElement.ownerDocument !== document) {
              throw new Error("Handsontable ingest used a stale benchmark document");
            }
          } finally {
            ingest_hot?.destroy();
            ingest_hot = undefined;
            // The host also owns its old document; drop it before reset and GC.
            ingest_host = undefined;
          }
        },
      },
    );
  } catch (err) {
    notes.ingest = `headless limitation: ${(err as Error).message}`;
    stats.ingest = { ...summarize([]), samples: [] };
  } finally {
    ingest_hot?.destroy();
  }

  // Persistent instance for the remaining workloads.
  const host = container();
  const hot = createHandsontable(host, hot_options(toAoA(ds)));

  // (b) windowRead — read the same 50×5 range via getData at rotating offsets.
  const max_start = Math.max(0, rows - WINDOW_ROWS);
  let off = 0;
  stats.windowRead = guard("windowRead", () =>
    measure(
      () => {
        const start = off;
        off = off + 977 > max_start ? 0 : off + 977;
        hot.getData(start, 0, start + WINDOW_ROWS - 1, 4);
      },
      plan("windowRead", rows),
    ),
  );

  // (c) edit — 1000 single-cell edits. suspendRender/resumeRender brackets the
  // loop so the data path is measured rather than 1000 intermediate repaints
  // (Handsontable couples data + view).
  notes.edit = "edits wrapped in suspendRender/resumeRender to isolate the data path";
  stats.edit = guard("edit", () =>
    measure(
      () => {
        hot.suspendRender();
        for (let k = 0; k < EDIT_COUNT; k++) {
          const row = (k * 1009) % rows;
          hot.setDataAtCell(row, COL.amount, (k % 9000) + 0.5);
        }
        hot.resumeRender();
      },
      plan("edit", rows),
    ),
  );

  // (d) sort via the columnSorting plugin; clear between runs.
  const sorting = hot.getPlugin("columnSorting");
  stats.sort = guard("sort", () =>
    measure(() => sorting.sort({ column: SORT_COL, sortOrder: "asc" }), {
      ...plan("sort", rows),
      after: () => sorting.clearSort(),
    }),
  );

  // (e) filter via the filters plugin; clear between runs.
  const filters = hot.getPlugin("filters");
  stats.filter = guard("filter", () =>
    measure(
      () => {
        filters.clearConditions();
        filters.addCondition(FILTER_COL, "contains", [FILTER_NEEDLE]);
        filters.filter();
      },
      {
        ...plan("filter", rows),
        after: () => {
          filters.clearConditions();
          filters.filter();
        },
      },
    ),
  );

  stats.multiFilter = guard("multiFilter", () =>
    measure(
      () => {
        filters.clearConditions();
        filters.addCondition(COL.city, "contains", ["o"]);
        filters.addCondition(COL.customer, "contains", ["Customer"]);
        filters.filter();
      },
      {
        ...plan("multiFilter", rows),
        after: () => {
          filters.clearConditions();
          filters.filter();
        },
      },
    ),
  );
  let distinct_sink = 0;
  stats.distinctLow = guard("distinctLow", () =>
    measure(
      () => {
        distinct_sink = new Set(hot.getSourceDataAtCol(COL.city)).size;
      },
      plan("distinctLow", rows),
    ),
  );
  stats.distinctHigh = guard("distinctHigh", () =>
    measure(
      () => {
        distinct_sink = new Set(hot.getSourceDataAtCol(COL.customer)).size;
      },
      plan("distinctHigh", rows),
    ),
  );
  void distinct_sink;

  // (f) aggregate — no native column aggregate; sum the source column in JS.
  notes.aggregate = "no native aggregate API — summed in plain JS over getSourceDataAtCol";
  let agg_sink = 0;
  stats.aggregate = guard("aggregate", () =>
    measure(
      () => {
        const col = hot.getSourceDataAtCol(AGG_COL);
        let sum = 0;
        for (let i = 0; i < col.length; i++) sum += Number(col[i]);
        agg_sink = sum;
      },
      plan("aggregate", rows),
    ),
  );
  void agg_sink;

  hot.destroy();
  return { rows, stats, notes, queryResources: null, queries: {} };
}

const retain: unknown[] = [];

/**
 * Build a store in a sub-scope so the transient columnar input arrays (the JS
 * dataset, including ~N unique customer strings) become unreachable when this
 * returns — leaving only the store's retained JS state for the caller to weigh.
 * The store copies all cell data into WASM, so it does not retain the inputs.
 */
function build_sheetwrite_store(rows: number): SheetwriteStore {
  const columnar = toSheetwriteColumnar(makeColumnar(rows));
  return new SheetwriteStore(make_workbook(rows), columnar);
}

function probe_sheetwrite_memory(rows: number): MemoryProfile {
  const memory = getEngine().getMemory();
  forceGc();

  // Collect the transient dataset before the second snapshot so only retained
  // store allocations contribute to the heap delta.
  const heap0 = process.memoryUsage().heapUsed;
  const wasm0 = memory.buffer.byteLength;

  const store = build_sheetwrite_store(rows);
  store.aggregate(SHEET, AGG_COL, "sum"); // touch so the load is not elided
  retain.push(store);
  forceGc();

  const heap1 = process.memoryUsage().heapUsed;
  const wasm1 = memory.buffer.byteLength;

  return { heapDeltaBytes: Math.max(0, heap1 - heap0), wasmDeltaBytes: wasm1 - wasm0 };
}

function probe_handsontable_memory(rows: number): MemoryProfile {
  const host = container();
  const data = toAoA(makeColumnar(rows));
  forceGc();
  const heap0 = process.memoryUsage().heapUsed;
  const hot = createHandsontable(host, hot_options(data));
  hot.getData(0, 0, 0, 4); // touch
  retain.push(hot);
  forceGc();
  const heap1 = process.memoryUsage().heapUsed;
  return { heapDeltaBytes: heap1 - heap0, wasmDeltaBytes: null };
}

/** Spawn this file in `--mem` mode and parse the JSON memory profile it prints. */
function probe_memory(engine: EngineId, rows: number): MemoryProfile {
  const proc = Bun.spawnSync(["bun", "run", import.meta.path, "--mem", engine, String(rows)], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = proc.stdout.toString().trim();
  const last = text
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .at(-1);
  if (proc.exitCode !== 0) {
    throw new Error(`${engine} ${rows} memory probe exited ${proc.exitCode}`);
  }
  if (!last) throw new Error(`${engine} ${rows} memory probe returned no JSON`);
  const parsed: unknown = JSON.parse(last);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("heapDeltaBytes" in parsed && typeof parsed.heapDeltaBytes === "number") ||
    !(
      "wasmDeltaBytes" in parsed &&
      (typeof parsed.wasmDeltaBytes === "number" || parsed.wasmDeltaBytes === null)
    )
  ) {
    throw new Error(`${engine} ${rows} memory probe returned a malformed record`);
  }
  return {
    heapDeltaBytes: parsed.heapDeltaBytes,
    wasmDeltaBytes: parsed.wasmDeltaBytes,
  };
}

async function run_mem_mode(): Promise<void> {
  const engine = process.argv[3];
  const rows = Number(process.argv[4]);
  if (engine === "sheetwrite") {
    await initSheetwrite({ source: readFileSync(WASM_PATH) });
    console.log(JSON.stringify(probe_sheetwrite_memory(rows)));
  } else {
    console.log(JSON.stringify(probe_handsontable_memory(rows)));
  }
}

const N = (n: number): string => n.toLocaleString("en-US");

function verdict(sw: Stat, hot: Stat): string {
  if (Number.isNaN(sw.median) || Number.isNaN(hot.median) || sw.median === 0) return "—";
  const ratio = hot.median / sw.median;
  return ratio >= 1 ? `**${ratio.toFixed(1)}× faster**` : `${(1 / ratio).toFixed(1)}× slower`;
}

function head_to_head_table(
  workload: Workload,
  sw: Map<number, EngineResult>,
  hot: Map<number, EngineResult>,
): string {
  const lines: string[] = [];
  lines.push(`#### ${WORKLOAD_LABELS[workload]}`);
  lines.push("");
  lines.push("| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |");
  lines.push("|---:|---:|---:|:--|");
  for (const rows of HEAD_TO_HEAD_ROWS) {
    const s = sw.get(rows)?.stats[workload];
    const h = hot.get(rows)?.stats[workload];
    if (!s || !h) continue;
    lines.push(
      `| ${N(rows)} | ${ms(s.median)} (${ms(s.p95)}) | ${ms(h.median)} (${ms(h.p95)}) | ${verdict(s, h)} |`,
    );
  }
  return lines.join("\n");
}

function scaling_table(sw: Map<number, EngineResult>): string {
  const lines: string[] = [];
  lines.push(`| rows | ${WORKLOADS.map((w) => WORKLOAD_LABELS[w]).join(" | ")} |`);
  lines.push(`|---:${"|---:".repeat(WORKLOADS.length)}|`);
  for (const rows of SHEETWRITE_ROWS) {
    const r = sw.get(rows);
    if (!r) continue;
    const cells = WORKLOADS.map((w) => `${ms(r.stats[w].median)} (${ms(r.stats[w].p95)})`);
    lines.push(`| ${N(rows)} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function query_scaling_table(sw: Map<number, EngineResult>): string {
  const lines: string[] = [];
  lines.push(`| rows | ${QUERY_SCENARIOS.map((scenario) => QUERY_LABELS[scenario]).join(" | ")} |`);
  lines.push(`|---:${"|---:".repeat(QUERY_SCENARIOS.length)}|`);
  for (const rows of SHEETWRITE_ROWS) {
    const queries = sw.get(rows)?.queries;
    if (!queries) continue;
    const cells = QUERY_SCENARIOS.map((scenario) => {
      const stat = queries[scenario];
      return stat ? `${ms(stat.median)} (${ms(stat.p95)})` : "—";
    });
    lines.push(`| ${N(rows)} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function memory_table(sw: Map<number, EngineResult>): string {
  const lines: string[] = [];
  lines.push("| rows | Sheetwrite data (WASM columnar store) | bytes/row |");
  lines.push("|---:|---:|---:|");
  for (const rows of SHEETWRITE_ROWS) {
    const s = sw.get(rows);
    if (!s || s.memory.wasmDeltaBytes === null) continue;
    const per_row = (s.memory.wasmDeltaBytes / rows).toFixed(0);
    lines.push(`| ${N(rows)} | ${mib(s.memory.wasmDeltaBytes)} | ${per_row} B |`);
  }
  return lines.join("\n");
}
export function renderDataBenchmarkMarkdown(result: DataBenchmarkResult): string {
  validateDataBenchmark(result, result.mode);
  const sw = new Map(
    Object.entries(result.sheetwrite).map(([rows, value]) => [Number(rows), value] as const),
  );
  const hot = new Map(
    Object.entries(result.handsontable).map(([rows, value]) => [Number(rows), value] as const),
  );
  const out: string[] = [];
  out.push("## Headless data-layer results");
  out.push("");
  out.push(
    `Bun ${result.meta.bun} · ${result.meta.platform}/${result.meta.arch} · seeded dataset (id/date/customer/city/amount) · ` +
      `median (p95) over warmed-up iterations · lower is better.`,
  );
  out.push(
    `Measured engines: Sheetwrite ${result.meta.engineVersions.sheetwrite}; Handsontable ${result.meta.engineVersions.handsontable}.`,
  );
  out.push("");
  if (hot.size > 0) {
    out.push("### Head-to-head (both engines, headless)");
    out.push("");
    out.push(
      "Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).",
    );
    out.push("");
    for (const workload of WORKLOADS) {
      out.push(head_to_head_table(workload, sw, hot));
      out.push("");
    }
  }
  out.push("### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms");
  out.push("");
  out.push(
    "Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.",
  );
  out.push("");
  out.push(scaling_table(sw));
  out.push("");
  if (SHEETWRITE_ROWS.some((rows) => sw.get(rows)?.queries !== undefined)) {
    out.push("### Sheetwrite query scenarios — median (p95) ms");
    out.push("");
    out.push(
      "Measured on the Sheetwrite engine only: multi-key sorts, value-set filters and an all-numeric ingest exercise its Rust query engine and its columnar ingest, which no other engine here implements. A pick count larger than the sheet saturates at the row count. The 50,000-pick filter is measured at 100,000 rows only: it compares every row with every picked value today, so a larger sheet would need minutes for a single sample.",
    );
    out.push("");
    out.push(query_scaling_table(sw));
    out.push("");
    const fixtures = result.meta.queryFixtures;
    if (fixtures) {
      out.push(
        `Fixtures: ${QUERY_SCENARIOS.map((scenario) => `${scenario} — ${fixtures[scenario]}`).join("; ")}.`,
      );
      out.push("");
    }
  }
  out.push("### Memory");
  out.push("");
  out.push(
    "Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).",
  );
  out.push("");
  out.push(memory_table(sw));
  out.push("");
  out.push("**Notes**");
  const note_set = new Set<string>();
  for (const rows of HANDSONTABLE_ROWS) {
    const row = hot.get(rows);
    if (!row) continue;
    for (const workload of WORKLOADS) {
      const note = row.notes[workload];
      if (note && !note_set.has(note)) {
        note_set.add(note);
        out.push(`- Handsontable ${workload}: ${note}`);
      }
    }
  }
  out.push(
    "- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.",
  );
  out.push(
    "- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.",
  );
  out.push(
    "- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.",
  );
  return `${out.join("\n")}\n`;
}

/** Labels the heap-trace points of the engine run that starts now. */
function begin_engine_run(engine: EngineId, rows: number): void {
  if (heap_trace) heap_trace.scope = { engine, rows };
}

/**
 * Collects everything an engine run left behind once its stores and instances
 * are released, so the next engine or row size starts from a clean heap.
 */
function end_engine_run(): void {
  forceGc();
  record_heap(ENGINE_BOUNDARY, 0);
}

export async function runSheetwriteDataBench(
  rowsList: readonly number[] = SHEETWRITE_ROWS,
  mode: BenchmarkMode = "full",
): Promise<Map<number, TimedEngineResult>> {
  await initSheetwrite({ source: readFileSync(WASM_PATH) });
  warm_sheetwrite_data_path();

  const results = new Map<number, TimedEngineResult>();
  for (const rows of rowsList) {
    process.stderr.write(`\n▶ Sheetwrite ${N(rows)} rows …\n`);
    const ds = makeColumnar(rows);
    begin_engine_run("sheetwrite", rows);
    results.set(rows, await bench_sheetwrite(ds, toSheetwriteColumnar(ds), mode));
    end_engine_run();
  }
  return results;
}

function data_result(
  mode: BenchmarkMode,
  sheetwrite: ReadonlyMap<number, EngineResult>,
  handsontable: ReadonlyMap<number, EngineResult>,
): DataBenchmarkResult {
  return {
    protocolVersion: DATA_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.data[mode],
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      ...protocolCaptureMeta(),
      engineVersions: {
        sheetwrite: packageVersion("packages/core/package.json"),
        handsontable: packageVersion("bench/node_modules/handsontable/package.json"),
      },
      sheetwriteRows: [...sheetwrite.keys()],
      handsontableRows: [...handsontable.keys()],
      queryFixtures: QUERY_FIXTURES,
      gcBetweenSamples: true,
      freshDocumentBetweenIngestSamples: true,
    },
    sheetwrite: Object.fromEntries(sheetwrite),
    handsontable: Object.fromEntries(handsontable),
  };
}

async function run_smoke_bench(output_path: string | undefined): Promise<void> {
  const timed = await runSheetwriteDataBench([1_000], "smoke");
  const sheetwrite = new Map<number, EngineResult>();
  const result = timed.get(1_000);
  if (!result) throw new Error("data smoke omitted the declared 1000-row result");
  sheetwrite.set(1_000, { ...result, memory: probe_memory("sheetwrite", 1_000) });
  const smoke = data_result("smoke", sheetwrite, new Map());
  validateDataBenchmark(smoke, "smoke");
  // verify.ts reads this line from stdout; the file copy is only for --output.
  console.log(JSON.stringify(smoke));
  if (output_path !== undefined) {
    await write_data_artifact(smoke, renderDataBenchmarkMarkdown(smoke), output_path);
  }
}

/**
 * Writes the JSON artifact plus a markdown report beside it. Without `--output`
 * both land in the tracked `bench/results/`; with it, only the given path is
 * touched, which keeps timing runs out of the recorded results.
 */
async function write_data_artifact(
  result: DataBenchmarkResult,
  report: string,
  output_path?: string,
): Promise<void> {
  const json_path =
    output_path ?? new URL("../results/data-results.json", import.meta.url).pathname;
  const markdown_path =
    output_path === undefined
      ? new URL("../results/data-results.md", import.meta.url).pathname
      : json_path.endsWith(".json")
        ? `${json_path.slice(0, -".json".length)}.md`
        : `${json_path}.md`;
  mkdirSync(dirname(json_path), { recursive: true });
  await Bun.write(json_path, `${JSON.stringify(result, null, 2)}\n`);
  await Bun.write(markdown_path, report);
  process.stderr.write(`\n✔ wrote ${json_path} and ${markdown_path}\n`);
}

async function run_full_bench(output_path: string | undefined): Promise<void> {
  const timed_sw = await runSheetwriteDataBench();

  const sw = new Map<number, EngineResult>();
  const hot = new Map<number, EngineResult>();

  for (const [rows, timed] of timed_sw) {
    const memory = probe_memory("sheetwrite", rows);
    sw.set(rows, { ...timed, memory });
  }

  for (const rows of HANDSONTABLE_ROWS) {
    process.stderr.write(`\n▶ Handsontable ${N(rows)} rows …\n`);
    const ds = makeColumnar(rows);
    begin_engine_run("handsontable", rows);
    const timed = await bench_handsontable(ds);
    end_engine_run();
    const memory = probe_memory("handsontable", rows);
    hot.set(rows, { ...timed, memory });
  }

  const result = data_result("full", sw, hot);
  validateDataBenchmark(result, "full");
  const report = renderDataBenchmarkMarkdown(result);
  console.log(report.trimEnd());
  await write_data_artifact(result, report, output_path);
}

/**
 * Writes the `--heap-trace` diagnostic: post-GC heap readings after every
 * timed sample and engine run. It is never a benchmark result and is kept out
 * of the result artifact, so timing reports cannot be mistaken for it.
 */
async function write_heap_trace(
  trace: HeapTrace,
  path: string,
  mode: BenchmarkMode,
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const diagnostic = {
    kind: "data-heap-trace-diagnostic",
    matrixId: MATRIX_IDS.data[mode],
    gcBetweenSamples: true,
    freshDocumentBetweenIngestSamples: true,
    ...protocolCaptureMeta(),
    points: trace.points,
  };
  await Bun.write(path, `${JSON.stringify(diagnostic, null, 2)}\n`);
  process.stderr.write(`\n✔ wrote heap trace ${path}\n`);
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const output_path = optionValue(args, "--output");
  const heap_trace_path = optionValue(args, "--heap-trace");
  if (heap_trace_path !== undefined && heap_trace_path === output_path) {
    throw new Error("--heap-trace must not overwrite the --output result artifact");
  }
  const mode: BenchmarkMode = args.includes("--smoke") ? "smoke" : "full";
  const trace: HeapTrace | undefined =
    heap_trace_path === undefined ? undefined : { scope: undefined, points: [] };
  heap_trace = trace;

  try {
    if (args.includes("--mem")) {
      await run_mem_mode();
    } else if (mode === "smoke") {
      await run_smoke_bench(output_path);
    } else {
      await run_full_bench(output_path);
    }
  } finally {
    // A failed run still leaves the readings taken before it failed.
    if (trace && heap_trace_path !== undefined)
      await write_heap_trace(trace, heap_trace_path, mode);
  }
}
