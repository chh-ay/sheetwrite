import { readFileSync } from "node:fs";

import { getEngine } from "../../packages/core/src/engine.js";
import {
  type DataSourceColumnBand,
  type DocumentOp,
  initSheetwrite,
  type RowData,
  SheetwriteStore,
  type Workbook,
} from "../../packages/core/src/index.js";
import { optionValue } from "./cli-options.js";
import { validateEngineVersions } from "./engine-versions.js";
import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type GateIdentity,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import { packageVersion, type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { type Stat, summarize } from "./stats.js";

const PAGED_FULL_ROWS = 1_000_000;
export const PAGED_SMOKE_ROWS = 10_000;
const COLUMNS = 5;
const FULL_RUNS = 12;
const SMOKE_RUNS = 2;
const PAGE_ROWS = 120;
const CHUNK_ROWS = 4096;
const CACHE_BYTES = 32 * 1024 * 1024;
function chunk_bytes(chunk_rows: number): number {
  return (
    chunk_rows * (1 + Float64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT) +
    Math.ceil(chunk_rows / 64) * BigUint64Array.BYTES_PER_ELEMENT
  );
}
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const WIDE_PAGE_COLUMNS = 256;
const CACHE_CHURN_CHUNK_ROWS = 4;
const CACHE_CHURN_PAGES = 2048;
const CACHE_CHURN_RETAINED_CHUNKS = 512;
const CACHE_CHURN_CHUNK_BYTES = chunk_bytes(CACHE_CHURN_CHUNK_ROWS);
const CACHE_CHURN_BUDGET_BYTES = CACHE_CHURN_RETAINED_CHUNKS * CACHE_CHURN_CHUNK_BYTES;
const DIRTY_100_BASELINE_BYTES = 5_427_200;
const DIRTY_COUNTS = [100, 10_000] as const;

const datasource_page_bands = new WeakMap<
  SheetwriteStore,
  Map<string, readonly DataSourceColumnBand[]>
>();

function load_datasource_page(
  store: SheetwriteStore,
  sheet: string,
  start: number,
  page_rows: readonly RowData[],
): void {
  let by_sheet = datasource_page_bands.get(store);
  if (!by_sheet) {
    by_sheet = new Map();
    datasource_page_bands.set(store, by_sheet);
  }
  let bands = by_sheet.get(sheet);
  if (!bands) {
    const columns = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.columns;
    if (!columns || columns.length === 0) throw new Error(`Missing benchmark sheet ${sheet}`);
    bands = [{ start: 0, end: columns.length, keys: columns.map((column) => column.key) }];
    by_sheet.set(sheet, bands);
  }
  store.loadPage(sheet, start, bands, page_rows);
}
export const PAGED_SCENARIOS = [
  "empty",
  "padding",
  "viewport",
  "scroll-1",
  "scroll-10",
  "scroll-100",
  "dirty-100",
  "dirty-10000",
] as const;
export const PAGED_SMOKE_SCENARIOS = ["empty", "viewport", "dirty-100"] as const;
export const PAGED_WORKLOADS = [
  "startup",
  "first-page",
  "distant-page",
  "wide-page",
  "cache-churn",
] as const;
export type PagedScenario = (typeof PAGED_SCENARIOS)[number];
export type PagedWorkload = (typeof PAGED_WORKLOADS)[number];

export interface ProbeResult {
  readonly scenario: PagedScenario;
  readonly wasmDeltaBytes: number;
  readonly chunks: number;
  readonly loadedCells: number;
  readonly dirtyCells: number;
  readonly allocatedBytes: number;
  readonly dirtyAllocatedBytes: number;
  readonly retainedBytes: number;
  readonly fullyLoaded: boolean;
}

function dirty_count(scenario: PagedScenario): number | undefined {
  if (!scenario.startsWith("dirty-")) return undefined;
  const count = Number(scenario.slice("dirty-".length));
  return DIRTY_COUNTS.includes(count as (typeof DIRTY_COUNTS)[number]) ? count : undefined;
}

export interface PagedTimingResult {
  readonly samplesMs: readonly number[];
  readonly stat: Stat;
}

export interface PagedBenchmarkResult extends GateIdentity {
  readonly meta: ProtocolCaptureMeta & {
    readonly engineVersions: Readonly<Record<"sheetwrite", string>>;
  };
  readonly rows: number;
  readonly columns: number;
  readonly runs: number;
  readonly pageRows: number;
  readonly cacheBudgetBytes: number;
  readonly chunkRows: number;
  readonly denseLogicalBytes: number;
  readonly widePageColumns: number;
  readonly cacheChurnPages: number;
  readonly cacheChurnBudgetBytes: number;
  readonly cacheChurnRetainedChunks: number;
  readonly timings: Readonly<Record<PagedWorkload, PagedTimingResult>>;
  readonly peakAllocatedBytes: number;
  readonly peakChunks: number;
  readonly probes: readonly ProbeResult[];
}

export function pagedMatrixKey(
  rows: number,
  kind: "workload" | "probe",
  id: PagedWorkload | PagedScenario,
): string {
  return `rows=${rows};${kind}=${id}`;
}

export function expectedPagedMatrixKeys(mode: BenchmarkMode): string[] {
  const rows = mode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const scenarios = mode === "smoke" ? PAGED_SMOKE_SCENARIOS : PAGED_SCENARIOS;
  return [
    ...PAGED_WORKLOADS.map((workload) => pagedMatrixKey(rows, "workload", workload)),
    ...scenarios.map((scenario) => pagedMatrixKey(rows, "probe", scenario)),
  ];
}

export function validatePagedBenchmark(
  result: PagedBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): void {
  assertGateIdentity("paged", expectedMode, result);
  validateEngineVersions(result.meta.engineVersions, ["sheetwrite"]);
  const expected_rows = expectedMode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const expected_runs = expectedMode === "smoke" ? SMOKE_RUNS : FULL_RUNS;
  if (
    result.rows !== expected_rows ||
    result.columns !== COLUMNS ||
    result.runs !== expected_runs ||
    result.pageRows !== PAGE_ROWS ||
    result.cacheBudgetBytes !== CACHE_BYTES ||
    result.chunkRows !== CHUNK_ROWS ||
    result.denseLogicalBytes !== expected_rows * COLUMNS * (1 + 8 + 4) ||
    result.widePageColumns !== WIDE_PAGE_COLUMNS ||
    result.cacheChurnPages !== CACHE_CHURN_PAGES ||
    result.cacheChurnBudgetBytes !== CACHE_CHURN_BUDGET_BYTES ||
    result.cacheChurnRetainedChunks !== CACHE_CHURN_RETAINED_CHUNKS
  ) {
    throw new Error(`paged ${expectedMode} configuration does not match its declared protocol`);
  }
  if (
    result.meta.commit.length === 0 ||
    typeof result.meta.dirty !== "boolean" ||
    !Number.isFinite(Date.parse(result.meta.timestamp))
  ) {
    throw new Error(
      "paged capture provenance is incomplete: commit, dirty, and timestamp required",
    );
  }

  const observed = [
    ...Object.keys(result.timings).map((workload) =>
      pagedMatrixKey(result.rows, "workload", workload as PagedWorkload),
    ),
    ...result.probes.map((probe) => pagedMatrixKey(result.rows, "probe", probe.scenario)),
  ];
  validateExactMatrix("paged", expectedPagedMatrixKeys(expectedMode), observed);

  for (const workload of PAGED_WORKLOADS) {
    const key = pagedMatrixKey(result.rows, "workload", workload);
    const timing = result.timings[workload];
    validateRawStat(timing.samplesMs, timing.stat, key);
    if (timing.samplesMs.length !== expected_runs) {
      throw new Error(`${key} must contain ${expected_runs} raw samples`);
    }
    if (timing.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }

  assertFiniteNonNegative(result.peakAllocatedBytes, "paged.peakAllocatedBytes");
  assertFiniteNonNegative(result.peakChunks, "paged.peakChunks");
  if (
    !Number.isInteger(result.peakAllocatedBytes) ||
    !Number.isInteger(result.peakChunks) ||
    result.peakAllocatedBytes > result.cacheBudgetBytes
  ) {
    throw new Error("paged peak resource counters violate the declared cache budget");
  }
  if (result.peakAllocatedBytes !== result.peakChunks * chunk_bytes(result.chunkRows)) {
    throw new Error("paged peak allocation does not match its retained chunk count");
  }
  const logical_cells = result.rows * result.columns;
  for (const probe of result.probes) {
    const key = pagedMatrixKey(result.rows, "probe", probe.scenario);
    for (const field of [
      "wasmDeltaBytes",
      "chunks",
      "loadedCells",
      "dirtyCells",
      "allocatedBytes",
      "dirtyAllocatedBytes",
      "retainedBytes",
    ] as const) {
      assertFiniteNonNegative(probe[field], `${key}.${field}`);
    }
    if (
      !Number.isInteger(probe.wasmDeltaBytes) ||
      !Number.isInteger(probe.chunks) ||
      !Number.isInteger(probe.loadedCells) ||
      !Number.isInteger(probe.dirtyCells) ||
      !Number.isInteger(probe.allocatedBytes) ||
      !Number.isInteger(probe.dirtyAllocatedBytes) ||
      !Number.isInteger(probe.retainedBytes)
    ) {
      throw new Error(`${key} resource counters must be integers`);
    }
    if (
      probe.loadedCells > logical_cells ||
      probe.dirtyCells > probe.loadedCells ||
      probe.allocatedBytes > result.cacheBudgetBytes
    ) {
      throw new Error(`${key} resource counters violate the declared logical/cache bounds`);
    }
    if (probe.retainedBytes !== probe.allocatedBytes + probe.dirtyAllocatedBytes) {
      throw new Error(`${key}.retainedBytes does not match clean plus dirty allocation`);
    }
    if (probe.allocatedBytes !== probe.chunks * chunk_bytes(result.chunkRows)) {
      throw new Error(`${key}.allocatedBytes does not match its retained chunk count`);
    }
    if (probe.wasmDeltaBytes >= 1024 * 1024 * 1024) {
      throw new Error(`${key} exceeded the 1 GiB WASM safety ceiling`);
    }
    if (
      (probe.scenario === "empty" || probe.scenario === "padding") &&
      (probe.loadedCells !== 0 || probe.dirtyCells !== 0)
    ) {
      throw new Error(`${key} violated the empty-store allocation invariant`);
    }
    if (probe.scenario === "viewport" && probe.loadedCells !== 30 * COLUMNS) {
      throw new Error(`${key} did not load exactly the declared viewport`);
    }
    if (
      probe.scenario === "scroll-1" &&
      probe.loadedCells !== Math.floor(result.rows * 0.01) * COLUMNS
    ) {
      throw new Error(`${key} did not load exactly the declared one-percent traversal`);
    }
    if (
      probe.scenario === "scroll-10" &&
      probe.loadedCells !== Math.floor(result.rows * 0.1) * COLUMNS
    ) {
      throw new Error(`${key} did not load exactly the declared ten-percent traversal`);
    }
    if (probe.scenario === "scroll-100") {
      const total_chunks = Math.ceil(result.rows / result.chunkRows) * COLUMNS;
      const retained_chunks = Math.min(
        total_chunks,
        Math.floor(CACHE_BYTES / chunk_bytes(result.chunkRows)),
      );
      const final_chunk_rows = result.rows % result.chunkRows;
      const retained_partial_chunks =
        final_chunk_rows === 0 ? 0 : Math.min(COLUMNS, retained_chunks);
      const expected_loaded_cells =
        retained_chunks * result.chunkRows -
        retained_partial_chunks * (result.chunkRows - final_chunk_rows);
      if (probe.chunks !== retained_chunks || probe.loadedCells !== expected_loaded_cells) {
        throw new Error(`${key} does not match the cache-bounded full traversal`);
      }
    }
    const expected_dirty = dirty_count(probe.scenario);
    if (expected_dirty !== undefined && probe.dirtyCells !== expected_dirty) {
      throw new Error(`${key} did not preserve exactly ${expected_dirty} dirty cells`);
    }
    if (probe.fullyLoaded !== (probe.loadedCells === logical_cells)) {
      throw new Error(`${key}.fullyLoaded does not match the retained cell evidence`);
    }
  }

  const dirty100 = result.probes.find((probe) => probe.scenario === "dirty-100");
  if (
    dirty100 &&
    (dirty100.allocatedBytes !== 0 ||
      dirty100.dirtyAllocatedBytes === 0 ||
      dirty100.retainedBytes > 1024 * 1024 ||
      dirty100.retainedBytes > DIRTY_100_BASELINE_BYTES * 0.2)
  ) {
    throw new Error("paged dirty-100 did not meet the sparse-overlay 1 MiB / 80% reduction gate");
  }
  const dirty10000 = result.probes.find((probe) => probe.scenario === "dirty-10000");
  if (dirty100 && dirty10000) {
    const small_bytes_per_cell = dirty100.dirtyAllocatedBytes / 100;
    const large_bytes_per_cell = dirty10000.dirtyAllocatedBytes / 10_000;
    if (
      dirty10000.allocatedBytes !== 0 ||
      large_bytes_per_cell < small_bytes_per_cell * 0.5 ||
      large_bytes_per_cell > small_bytes_per_cell * 1.5
    ) {
      throw new Error("paged dirty-10000 did not retain near-linear dirty bytes per cell");
    }
  }
}

function workbook(row_count: number, column_count = COLUMNS): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: `${row_count.toLocaleString("en-US")} rows`,
        rowCount: row_count,
        columns: Array.from({ length: column_count }, (_, col) => ({
          key: `c${col}`,
          header: `Column ${col + 1}`,
          width: 120,
          type: "number",
        })),
      },
    ],
  };
}

function rows(start: number, count = PAGE_ROWS): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row = start + offset;
    return { c0: row, c1: row + 1, c2: row + 2, c3: row + 3, c4: row + 4 };
  });
}

function wide_rows(start: number, count: number): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row: RowData = {};
    for (let col = 0; col < WIDE_PAGE_COLUMNS; col++) row[`c${col}`] = start + offset + col;
    return row;
  });
}

function load_fraction(
  store: SheetwriteStore,
  fraction: number,
  row_count: number,
  chunk_rows: number,
): void {
  const limit = Math.floor(row_count * fraction);
  for (let start = 0; start < limit; start += chunk_rows) {
    load_datasource_page(store, "s1", start, rows(start, Math.min(chunk_rows, limit - start)));
  }
}

function is_scenario(value: string | undefined): value is PagedScenario {
  return PAGED_SCENARIOS.some((scenario) => scenario === value);
}

function dirty_patches(count: number, row_count: number): DocumentOp[] {
  return Array.from({ length: count }, (_, index): DocumentOp => {
    const addr = {
      sheet: "s1",
      row: Math.floor((index * row_count) / count),
      col: index % COLUMNS,
    };
    const style =
      index % 3 === 0
        ? { bold: true }
        : index % 3 === 1
          ? { italic: true, color: "#2457c5" }
          : { underline: true, backgroundColor: "#edf2ff" };
    switch (index % 5) {
      case 0:
        return { op: "set", addr, value: { kind: "literal", value: index }, style };
      case 1:
        return { op: "set", addr, value: { kind: "literal", value: `dirty-${index}` }, style };
      case 2:
        return { op: "set", addr, value: { kind: "formula", src: `=${index}+1` }, style };
      case 3:
        return {
          op: "set",
          addr,
          value: { kind: "ref", target: { sheet: "s1", row: 0, col: 0 } },
          style,
        };
      default:
        return {
          op: "set",
          addr,
          value: { kind: "literal", value: index % 2 === 0 },
          style,
        };
    }
  });
}

function verify_dirty_semantics(
  store: SheetwriteStore,
  row_count: number,
  patches: readonly DocumentOp[],
): void {
  const string_patch = patches[1];
  const formula_patch = patches[2];
  const ref_patch = patches[3];
  if (
    string_patch?.op !== "set" ||
    formula_patch?.op !== "set" ||
    ref_patch?.op !== "set" ||
    store.getCell(string_patch.addr).resolved !== "dirty-1" ||
    store.getFormula(formula_patch.addr) !== "=2+1" ||
    store.getCell(formula_patch.addr).resolved !== 3 ||
    store.getRefTarget(ref_patch.addr)?.row !== 0 ||
    store.getCell(string_patch.addr).style.italic !== true
  ) {
    throw new Error("dirty rich-cell read/formula/ref/style semantics changed");
  }

  load_datasource_page(store, "s1", string_patch.addr.row, [
    { c0: -1, c1: "server-overwrite", c2: -1, c3: -1, c4: -1 },
  ]);
  if (
    store.getCell(string_patch.addr).resolved !== "dirty-1" ||
    store.getCellLoadState(string_patch.addr) !== "local-edit"
  ) {
    throw new Error("dirty local value lost a hydration collision");
  }

  const revision_addr = { sheet: "s1", row: row_count - 1, col: COLUMNS - 1 };
  const first: DocumentOp = {
    op: "set",
    addr: revision_addr,
    value: { kind: "literal", value: "revision-one" },
  };
  const second: DocumentOp = {
    op: "set",
    addr: revision_addr,
    value: { kind: "literal", value: "revision-two" },
  };
  store.applyTransaction({ patches: [first] });
  store.applyTransaction({ patches: [second] });
  store.acknowledgeOperations([first]);
  if (
    store.getCell(revision_addr).resolved !== "revision-two" ||
    store.getCellLoadState(revision_addr) !== "local-edit"
  ) {
    throw new Error("stale acknowledgement cleaned a newer dirty revision");
  }
  store.acknowledgeOperations([second]);
  if (store.getCellLoadState(revision_addr) === "local-edit") {
    throw new Error("matching acknowledgement did not clean its dirty revision");
  }

  const history_range = {
    sheet: "s1",
    start: { row: revision_addr.row, col: revision_addr.col },
    end: { row: revision_addr.row, col: revision_addr.col },
  };
  const history = store.captureRangeHistory(history_range);
  if (!history) throw new Error("dirty undo snapshot was not captured");
  store.applyTransaction({
    patches: [
      {
        op: "set",
        addr: revision_addr,
        value: { kind: "literal", value: "after-history" },
      },
    ],
  });
  store.applyTransaction({ patches: [history.toDocumentOp(history_range)] });
  history.dispose();
  if (store.getCell(revision_addr).resolved !== "revision-two") {
    throw new Error("dirty undo snapshot did not restore its rich cell");
  }

  const persisted = new SheetwriteStore(workbook(2), undefined, {
    storage: "paged",
    chunkRows: 4,
    cacheBytes: CACHE_BYTES,
  });
  load_datasource_page(persisted, "s1", 0, rows(0, 2));
  persisted.applyTransaction({
    patches: patches.slice(0, 4).map((patch, index) =>
      patch.op === "set"
        ? {
            ...patch,
            addr: { ...patch.addr, row: 0, col: index },
            ...(patch.value.kind === "ref"
              ? { value: { ...patch.value, target: { sheet: "s1", row: 1, col: 0 } } }
              : {}),
          }
        : patch,
    ),
  });
  const snapshot = persisted.exportSnapshot();
  const restored = SheetwriteStore.fromSnapshot(snapshot, {
    storage: "paged",
    chunkRows: 4,
    cacheBytes: CACHE_BYTES,
  });
  if (
    restored.getCell({ sheet: "s1", row: 0, col: 1 }).resolved !== "dirty-1" ||
    restored.getFormula({ sheet: "s1", row: 0, col: 2 }) !== "=2+1" ||
    restored.getRefTarget({ sheet: "s1", row: 0, col: 3 })?.row !== 1
  ) {
    throw new Error("dirty values/formulas/refs did not survive snapshot persistence");
  }
  restored.dispose();
  persisted.dispose();
}

async function run_probe(
  scenario: PagedScenario,
  row_count: number,
  chunk_rows: number,
  admission_only: boolean,
): Promise<ProbeResult> {
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite({ source: bytes });
  const memory = getEngine().getMemory();

  Bun.gc(true);
  const wasm_before = memory.buffer.byteLength;

  const store = new SheetwriteStore(workbook(row_count), undefined, {
    storage: "paged",
    chunkRows: chunk_rows,
    cacheBytes: CACHE_BYTES,
  });
  let patches: DocumentOp[] = [];

  if (scenario === "viewport") {
    load_datasource_page(store, "s1", 0, rows(0, 30));
  } else if (scenario === "scroll-1") {
    load_fraction(store, 0.01, row_count, chunk_rows);
  } else if (scenario === "scroll-10") {
    load_fraction(store, 0.1, row_count, chunk_rows);
  } else if (scenario === "scroll-100") {
    load_fraction(store, 1, row_count, chunk_rows);
  } else {
    const count = dirty_count(scenario);
    if (count !== undefined) {
      patches = dirty_patches(count, row_count);
      const outcome = store.applyTransaction({ patches });
      if (outcome.status !== "applied") {
        throw new Error(`${scenario} dirty transaction was ${outcome.status}`);
      }
    }
  }

  Bun.gc(true);
  const stats = store.getPagedStats("s1");
  const dirty_allocated_bytes =
    "dirtyAllocatedBytes" in stats && typeof stats.dirtyAllocatedBytes === "number"
      ? stats.dirtyAllocatedBytes
      : 0;
  const result = {
    scenario,
    wasmDeltaBytes: memory.buffer.byteLength - wasm_before,
    ...stats,
    dirtyAllocatedBytes: dirty_allocated_bytes,
    retainedBytes: stats.allocatedBytes + dirty_allocated_bytes,
  };

  if (store.getWorkbook().sheets.length !== 1) {
    throw new Error("benchmark store was optimized away");
  }
  if (!admission_only && patches.length > 0) verify_dirty_semantics(store, row_count, patches);

  store.dispose();

  return result;
}

function parse_probe(stdout: string, scenario: PagedScenario): ProbeResult {
  const line = stdout
    .trim()
    .split("\n")
    .filter((candidate) => candidate.trim().startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`missing ${scenario} probe output`);
  const value: unknown = JSON.parse(line);
  if (
    !value ||
    typeof value !== "object" ||
    !("scenario" in value) ||
    value.scenario !== scenario ||
    !("wasmDeltaBytes" in value) ||
    typeof value.wasmDeltaBytes !== "number" ||
    !("chunks" in value) ||
    typeof value.chunks !== "number" ||
    !("loadedCells" in value) ||
    typeof value.loadedCells !== "number" ||
    !("dirtyCells" in value) ||
    typeof value.dirtyCells !== "number" ||
    !("allocatedBytes" in value) ||
    typeof value.allocatedBytes !== "number" ||
    !("dirtyAllocatedBytes" in value) ||
    typeof value.dirtyAllocatedBytes !== "number" ||
    !("retainedBytes" in value) ||
    typeof value.retainedBytes !== "number" ||
    !("fullyLoaded" in value) ||
    typeof value.fullyLoaded !== "boolean"
  ) {
    throw new Error(`invalid ${scenario} probe output`);
  }
  return {
    scenario,
    wasmDeltaBytes: value.wasmDeltaBytes,
    chunks: value.chunks,
    loadedCells: value.loadedCells,
    dirtyCells: value.dirtyCells,
    allocatedBytes: value.allocatedBytes,
    dirtyAllocatedBytes: value.dirtyAllocatedBytes,
    retainedBytes: value.retainedBytes,
    fullyLoaded: value.fullyLoaded,
  };
}

function isolated_probe(
  scenario: PagedScenario,
  row_count: number,
  chunk_rows: number,
  admission_only: boolean,
): ProbeResult {
  const process = Bun.spawnSync(
    [
      "bun",
      "run",
      import.meta.path,
      "--probe",
      scenario,
      "--rows",
      String(row_count),
      "--chunk-rows",
      String(chunk_rows),
      ...(admission_only ? ["--admission"] : []),
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  if (process.exitCode !== 0) throw new Error(`${scenario} probe exited ${process.exitCode}`);
  return parse_probe(process.stdout.toString(), scenario);
}

async function run_benchmark(
  mode: BenchmarkMode,
  chunk_rows: number,
  prototype: boolean,
  output_path?: string,
): Promise<void> {
  await initSheetwrite();
  const row_count = mode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const runs = mode === "smoke" ? SMOKE_RUNS : FULL_RUNS;
  const scenarios = mode === "smoke" ? PAGED_SMOKE_SCENARIOS : PAGED_SCENARIOS;
  const startup: number[] = [];
  const first_page: number[] = [];
  const distant_page: number[] = [];
  const wide_page: readonly RowData[] = wide_rows(0, PAGE_ROWS);
  const churn_pages: ReadonlyArray<readonly RowData[]> = Array.from(
    { length: CACHE_CHURN_PAGES },
    (_, page) => rows(page * CACHE_CHURN_CHUNK_ROWS, CACHE_CHURN_CHUNK_ROWS),
  );
  const wide_page_ms: number[] = [];
  const cache_churn_ms: number[] = [];
  let cache_churn_retained_chunks = 0;
  let peak_allocated_bytes = 0;
  let peak_chunks = 0;
  for (let run = 0; run < runs; run++) {
    let started = performance.now();
    const store = new SheetwriteStore(workbook(row_count), undefined, {
      storage: "paged",
      chunkRows: chunk_rows,
      cacheBytes: CACHE_BYTES,
    });
    startup.push(performance.now() - started);

    started = performance.now();
    load_datasource_page(store, "s1", 0, rows(0));
    first_page.push(performance.now() - started);

    const distant_start = Math.floor(row_count / 2);
    started = performance.now();
    load_datasource_page(store, "s1", distant_start, rows(distant_start));
    distant_page.push(performance.now() - started);

    const stats = store.getPagedStats("s1");
    peak_allocated_bytes = Math.max(peak_allocated_bytes, stats.allocatedBytes);
    peak_chunks = Math.max(peak_chunks, stats.chunks);
    store.dispose();

    const wide_store = new SheetwriteStore(workbook(row_count, WIDE_PAGE_COLUMNS), undefined, {
      storage: "paged",
      chunkRows: chunk_rows,
      cacheBytes: CACHE_BYTES,
    });
    started = performance.now();
    load_datasource_page(wide_store, "s1", 0, wide_page);
    wide_page_ms.push(performance.now() - started);
    wide_store.dispose();

    const churn_store = new SheetwriteStore(workbook(row_count), undefined, {
      storage: "paged",
      chunkRows: CACHE_CHURN_CHUNK_ROWS,
      cacheBytes: CACHE_CHURN_BUDGET_BYTES,
    });
    started = performance.now();
    for (let page = 0; page < churn_pages.length; page++) {
      load_datasource_page(churn_store, "s1", page * CACHE_CHURN_CHUNK_ROWS, churn_pages[page]!);
    }
    cache_churn_ms.push(performance.now() - started);
    cache_churn_retained_chunks = Math.max(
      cache_churn_retained_chunks,
      churn_store.getPagedStats("s1").chunks,
    );
    churn_store.dispose();
  }

  const probes = scenarios.map((scenario) =>
    isolated_probe(scenario, row_count, chunk_rows, prototype),
  );
  const result: PagedBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.paged[mode],
    meta: {
      ...protocolCaptureMeta(),
      engineVersions: { sheetwrite: packageVersion("packages/core/package.json") },
    },
    rows: row_count,
    columns: COLUMNS,
    runs,
    pageRows: PAGE_ROWS,
    cacheBudgetBytes: CACHE_BYTES,
    chunkRows: chunk_rows,
    denseLogicalBytes: row_count * COLUMNS * (1 + 8 + 4),
    widePageColumns: WIDE_PAGE_COLUMNS,
    cacheChurnPages: CACHE_CHURN_PAGES,
    cacheChurnBudgetBytes: CACHE_CHURN_BUDGET_BYTES,
    cacheChurnRetainedChunks: cache_churn_retained_chunks,
    timings: {
      startup: { samplesMs: startup, stat: summarize(startup) },
      "first-page": { samplesMs: first_page, stat: summarize(first_page) },
      "distant-page": { samplesMs: distant_page, stat: summarize(distant_page) },
      "wide-page": { samplesMs: wide_page_ms, stat: summarize(wide_page_ms) },
      "cache-churn": { samplesMs: cache_churn_ms, stat: summarize(cache_churn_ms) },
    },
    peakAllocatedBytes: peak_allocated_bytes,
    peakChunks: peak_chunks,
    probes,
  };
  if (!prototype) validatePagedBenchmark(result, mode);

  console.log("| workload | median ms | p95 ms |");
  console.log("|---|---:|---:|");
  for (const [name, timing] of [
    [`${row_count.toLocaleString("en-US")}-row paged startup`, result.timings.startup],
    ["first 120-row page", result.timings["first-page"]],
    ["distant 120-row page", result.timings["distant-page"]],
    [`wide ${WIDE_PAGE_COLUMNS}-column page`, result.timings["wide-page"]],
    [`${CACHE_CHURN_PAGES}-page cache churn`, result.timings["cache-churn"]],
  ] as const) {
    console.log(`| ${name} | ${timing.stat.median.toFixed(3)} | ${timing.stat.p95.toFixed(3)} |`);
  }
  console.log(
    "\n| isolated scenario | WASM delta MiB | clean MiB | dirty MiB | total MiB | chunks | loaded | dirty |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const probe of probes) {
    console.log(
      `| ${probe.scenario} | ${(probe.wasmDeltaBytes / 1024 / 1024).toFixed(2)} | ${(probe.allocatedBytes / 1024 / 1024).toFixed(2)} | ${(probe.dirtyAllocatedBytes / 1024 / 1024).toFixed(2)} | ${(probe.retainedBytes / 1024 / 1024).toFixed(2)} | ${probe.chunks} | ${probe.loadedCells} | ${probe.dirtyCells} |`,
    );
  }
  if (output_path !== undefined || (mode === "full" && !prototype)) {
    await Bun.write(
      output_path ?? new URL("../results/paged-results.json", import.meta.url),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const output_path = optionValue(process.argv, "--output");
  const scenario = optionValue(process.argv, "--probe");
  const rows_text = optionValue(process.argv, "--rows");
  const row_count = rows_text === undefined ? Number.NaN : Number(rows_text);
  const chunk_rows_text = optionValue(process.argv, "--chunk-rows");
  const chunk_rows = chunk_rows_text === undefined ? CHUNK_ROWS : Number(chunk_rows_text);
  if (!Number.isInteger(chunk_rows) || chunk_rows <= 0) {
    throw new Error("paged benchmark requires positive integer --chunk-rows");
  }
  if (is_scenario(scenario)) {
    if (!Number.isInteger(row_count) || row_count <= 0) {
      throw new Error("paged probe requires a positive integer --rows value");
    }
    console.log(
      JSON.stringify(
        await run_probe(scenario, row_count, chunk_rows, process.argv.includes("--admission")),
      ),
    );
  } else {
    await run_benchmark(
      process.argv.includes("--smoke") ? "smoke" : "full",
      chunk_rows,
      process.argv.includes("--prototype"),
      output_path,
    );
  }
}
