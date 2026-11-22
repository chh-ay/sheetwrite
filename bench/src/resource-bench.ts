import "./dom-setup.js";
import { readFileSync } from "node:fs";

import {
  createGrid,
  createRuntimeResourceSnapshot,
  type DataSourceColumnBand,
  diffRuntimeResourcePhases,
  emptyStoreMemoryStats,
  type Grid,
  IncompleteDataError,
  initSheetwrite,
  type RowData,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
  SheetwriteStore,
  type TransientResourcePeak,
  toCsv,
  type Workbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { optionValue } from "./cli-options.js";
import { COLUMNS, type ColumnarDataset, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import type { BenchmarkMode } from "./gate-protocol.js";
import {
  RESOURCE_BENCHMARK_SCHEMA_VERSION,
  RESOURCE_FULL_SCENARIOS,
  RESOURCE_SMOKE_SCENARIOS,
  type ResourceBenchmarkArtifact,
  type ResourceOptimizationEvidence,
  type ResourceScenarioId,
  type ResourceScenarioResult,
  validateResourceBenchmark,
} from "./resource-protocol.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const PAGED_ROWS = 1_000_000;
const CHUNK_ROWS = 4_096;
const CACHE_BYTES = 8 * 1024 * 1024;
const DIRTY_LIMIT = 1_000_000;
const DENSE_STRING_POOL_CAPACITY_BEFORE = 20_971_520;
const DENSE_INGEST_TIMING_BEFORE_MS = 1_044.660_382;
const DENSE_STRING_POOL_CAPACITY_BUDGET = 16 * 1024 * 1024;

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

interface ResourceGrid extends Grid {
  getAutoFitResourceStats(): {
    readonly windowRequests: number;
  };
}

function workbook(row_count: number, column_count = COLUMNS.length): Workbook {
  return {
    activeSheet: "resource",
    sheets: [
      {
        id: "resource",
        name: "Resource benchmark",
        rowCount: row_count,
        columns: Array.from({ length: column_count }, (_, col) => {
          const source = COLUMNS[col];
          return source
            ? { ...source }
            : { key: `c${col}`, header: `C${col}`, width: 100, type: "number" as const };
        }),
      },
    ],
  };
}

function numeric_rows(start: number, count: number, columns = COLUMNS.length): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row: RowData = {};
    for (let col = 0; col < columns; col++)
      row[COLUMNS[col]?.key ?? `c${col}`] = start + offset + col;
    return row;
  });
}

function runtime_memory(): RuntimeMemoryObservation {
  const memory = process.memoryUsage();
  return {
    usedJSHeapSize: memory.heapUsed,
    arrayBufferBytes: memory.arrayBuffers,
    externalBytes: memory.external,
    browserBackingStoreBytes: null,
  };
}

function store_snapshot(
  store: SheetwriteStore,
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return store.getRuntimeResourceSnapshot(operation, phase, runtime_memory());
}

function grid_snapshot(
  grid: Grid,
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return grid.getRuntimeResourceSnapshot(operation, phase, runtime_memory());
}

function empty_snapshot(
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return createRuntimeResourceSnapshot({
    operation,
    phase,
    wasm: emptyStoreMemoryStats(null),
    runtime: runtime_memory(),
  });
}

function result(
  id: ResourceScenarioId,
  operation: RuntimeResourceOperation,
  started: number,
  phases: Readonly<Partial<Record<RuntimeResourcePhase, RuntimeResourceSnapshot>>>,
  sentinel: string,
  transient_peaks: readonly TransientResourcePeak[] = [],
): ResourceScenarioResult {
  const before = phases.before;
  const peak = phases.peak;
  const settled = phases.settled;
  if (!before || !peak || !settled) throw new Error(`${id} omitted a required phase`);
  return {
    id,
    operation,
    durationMs: performance.now() - started,
    phases,
    deltas: [diffRuntimeResourcePhases(before, peak), diffRuntimeResourcePhases(peak, settled)],
    transientPeaks: transient_peaks,
    sentinel,
  };
}

function dense_ingest(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "ingest" as const;
  const rows = mode === "smoke" ? 10_000 : 1_000_000;
  Bun.gc(true);
  const before = empty_snapshot(operation, "before");
  const started = performance.now();
  let input: ColumnarDataset | undefined = makeColumnar(rows);
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(input));
  const peak = store_snapshot(store, operation, "peak");
  const sentinel = String(store.getCell({ sheet: "resource", row: rows - 1, col: 0 }).resolved);
  input = undefined;
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const measured = result("dense-ingest", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function paged_startup(): ResourceScenarioResult {
  const operation = "startup" as const;
  Bun.gc(true);
  const before = empty_snapshot(operation, "before");
  const started = performance.now();
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  const peak = store_snapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const measured = result(
    "paged-startup",
    operation,
    started,
    { before, peak, settled },
    `${store.getWorkbook().sheets[0]!.rowCount}:rows`,
  );
  store.dispose();
  return measured;
}

function paged_load(id: "first-page" | "deep-jump"): ResourceScenarioResult {
  const operation = id === "first-page" ? ("ingest" as const) : ("scroll" as const);
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  if (id === "deep-jump") load_datasource_page(store, "resource", 0, numeric_rows(0, 120));
  Bun.gc(true);
  const before = store_snapshot(store, operation, "before");
  const started = performance.now();
  const start = id === "first-page" ? 0 : 742_000;
  store.withResourceOperation(operation, () =>
    load_datasource_page(store, "resource", start, numeric_rows(start, 120)),
  );
  const peak = store_snapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const sentinel = String(store.getCell({ sheet: "resource", row: start, col: 0 }).resolved);
  const measured = result(id, operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function dirty_edit_clear(): ResourceScenarioResult {
  const operation = "dirty-clear" as const;
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  const patches = Array.from({ length: 100 }, (_, index) => ({
    op: "set" as const,
    addr: { sheet: "resource", row: index * 9_973, col: index % COLUMNS.length },
    value: { kind: "literal" as const, value: index % 2 === 0 ? index : `dirty-${index}` },
  }));
  Bun.gc(true);
  const before = store_snapshot(store, operation, "before");
  const started = performance.now();
  const outcome = store.withResourceOperation(operation, () => store.applyTransaction({ patches }));
  if (outcome.status !== "applied") throw new Error(`dirty transaction ${outcome.status}`);
  const peak = store_snapshot(store, operation, "peak");
  store.withResourceOperation(operation, () => store.acknowledgeOperations(patches));
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const sentinel = `${peak.wasm.owners.find((owner) => owner.owner === "wasm.paged.dirty-overlay")?.entries ?? 0}:dirty-entries`;
  const measured = result(
    "dirty-edit-clear",
    operation,
    started,
    { before, peak, settled },
    sentinel,
  );
  store.dispose();
  return measured;
}

function formula_recompute(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "formula-recompute" as const;
  const rows = mode === "smoke" ? 500 : 100_000;
  const store = new SheetwriteStore(workbook(rows, 2));
  for (let start = 0; start < rows; start += 10_000) {
    const seed = store.applyTransaction({
      patches: Array.from({ length: Math.min(10_000, rows - start) }, (_, offset) => ({
        op: "set" as const,
        addr: { sheet: "resource", row: start + offset, col: 0 },
        value: { kind: "literal" as const, value: rows - start - offset },
      })),
    });
    if (seed.status !== "applied") throw new Error(`formula seed ${seed.status}`);
  }
  const formula_patch = [
    {
      op: "set" as const,
      addr: { sheet: "resource", row: 0, col: 1 },
      value: { kind: "formula" as const, src: `=SORT(A1:A${rows})` },
    },
  ];
  Bun.gc(true);
  store.resetFormulaMatrixResourcePeak();
  store.resetRuntimeResourceAccounting();
  const before = store_snapshot(store, operation, "before");
  const started = performance.now();
  const outcome = store.withResourceOperation(operation, () =>
    store.applyTransaction({ patches: formula_patch }),
  );
  if (outcome.status !== "applied") throw new Error(`formula transaction ${outcome.status}`);
  const matrix_peak = store.getFormulaMatrixResourcePeak();
  const peak = store_snapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const sentinel = String(store.getCell({ sheet: "resource", row: 0, col: 1 }).resolved);
  const measured = result(
    "formula-recompute",
    operation,
    started,
    { before, peak, settled },
    sentinel,
    [matrix_peak],
  );
  store.dispose();
  return measured;
}

function exact_auto_fit(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "auto-fit" as const;
  const rows = mode === "smoke" ? 10_000 : 100_000;
  let input: ColumnarDataset | undefined = makeColumnar(rows);
  const grid = createGrid(document.createElement("div"), {
    workbook: workbook(rows),
    data: toSheetwriteColumnar(input),
    config: { toolbar: false, tabs: false },
  }) as ResourceGrid;
  input = undefined;
  Bun.gc(true);
  const before = grid_snapshot(grid, operation, "before");
  const started = performance.now();
  grid.autoFitColumns([0]);
  const peak = grid_snapshot(grid, operation, "peak");
  Bun.gc(true);
  const settled = grid_snapshot(grid, operation, "settled");
  const sentinel = `${grid.getAutoFitResourceStats().windowRequests}:windows`;
  const measured = result(
    "exact-auto-fit",
    operation,
    started,
    { before, peak, settled },
    sentinel,
  );
  grid.destroy();
  return measured;
}

function export_scenario(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "export" as const;
  const rows = mode === "smoke" ? 1_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = store_snapshot(store, operation, "before");
  const started = performance.now();
  let exported: string | undefined = store.withResourceOperation(operation, () =>
    toCsv(store.getWorkbook().sheets[0]!, store),
  );
  const peak = store_snapshot(store, operation, "peak");
  const sentinel = `${exported.length}:csv-bytes`;
  exported = undefined;
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const measured = result("export", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function snapshot_scenario(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "snapshot" as const;
  const rows = mode === "smoke" ? 1_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = store_snapshot(store, operation, "before");
  const started = performance.now();
  let snapshot: WorkbookSnapshot | undefined = store.withResourceOperation(operation, () =>
    store.exportSnapshot(),
  );
  const peak = store_snapshot(store, operation, "peak");
  const sentinel = `${snapshot.sheets[0]!.columns.length}:columns`;
  snapshot = undefined;
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const measured = result("snapshot", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function sort_filter_refusal(): ResourceScenarioResult {
  const operation = "scroll" as const;
  const grid = createGrid(document.createElement("div"), {
    workbook: workbook(PAGED_ROWS),
    datasourceStorage: {
      mode: "paged",
      chunkRows: CHUNK_ROWS,
      cacheBytes: CACHE_BYTES,
      dirtyCellLimit: DIRTY_LIMIT,
    },
    config: { toolbar: false, tabs: false },
  });
  Bun.gc(true);
  const before = grid_snapshot(grid, operation, "before");
  const started = performance.now();
  grid.setViewSort([{ col: 0, ascending: true }]);
  grid.setColumnFilter(0, { kind: "contains", text: "blocked" });
  let refusal = "";
  try {
    grid.exportSnapshot();
  } catch (error) {
    if (!(error instanceof IncompleteDataError)) throw error;
    refusal = `${error.name}:sort+filter`;
  }
  if (!refusal) throw new Error("incomplete sorted/filtered export did not fail closed");
  const peak = grid_snapshot(grid, operation, "peak");
  Bun.gc(true);
  const settled = grid_snapshot(grid, operation, "settled");
  const measured = result(
    "sort-filter-refusal",
    operation,
    started,
    { before, peak, settled },
    refusal,
  );
  grid.destroy();
  return measured;
}

function teardown(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "teardown" as const;
  const rows = mode === "smoke" ? 10_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = store_snapshot(store, operation, "before");
  const peak = store_snapshot(store, operation, "peak");
  const started = performance.now();
  store.dispose();
  Bun.gc(true);
  const settled = store_snapshot(store, operation, "settled");
  const after_destroy = store_snapshot(store, operation, "after-destroy");
  return result(
    "teardown",
    operation,
    started,
    { before, peak, settled, "after-destroy": after_destroy },
    `${settled.totals.logicalLiveBytes}:live-bytes`,
  );
}

async function run_scenario(
  id: ResourceScenarioId,
  mode: BenchmarkMode,
): Promise<ResourceScenarioResult> {
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite({ source: bytes });
  const restore_canvas = installCanvasTestStubs();
  const original_request_animation_frame = globalThis.requestAnimationFrame;
  const original_cancel_animation_frame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(performance.now());
    return 0;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  try {
    switch (id) {
      case "dense-ingest":
        return dense_ingest(mode);
      case "paged-startup":
        return paged_startup();
      case "first-page":
      case "deep-jump":
        return paged_load(id);
      case "dirty-edit-clear":
        return dirty_edit_clear();
      case "formula-recompute":
        return formula_recompute(mode);
      case "exact-auto-fit":
        return exact_auto_fit(mode);
      case "export":
        return export_scenario(mode);
      case "snapshot":
        return snapshot_scenario(mode);
      case "sort-filter-refusal":
        return sort_filter_refusal();
      case "teardown":
        return teardown(mode);
    }
  } finally {
    globalThis.requestAnimationFrame = original_request_animation_frame;
    globalThis.cancelAnimationFrame = original_cancel_animation_frame;
    restore_canvas();
  }
}

function parse_scenario(stdout: string, id: ResourceScenarioId): ResourceScenarioResult {
  const line = stdout
    .trim()
    .split("\n")
    .filter((candidate) => candidate.startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`${id} emitted no resource result`);
  const parsed = JSON.parse(line) as ResourceScenarioResult;
  if (parsed.id !== id) throw new Error(`${id} emitted ${parsed.id}`);
  return parsed;
}

function isolated_scenario(id: ResourceScenarioId, mode: BenchmarkMode): ResourceScenarioResult {
  const child = Bun.spawnSync(["bun", "run", import.meta.path, "--scenario", id, "--mode", mode], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) throw new Error(`${id} exited ${child.exitCode}`);
  return parse_scenario(child.stdout.toString(), id);
}

function optimization_evidence(
  scenarios: readonly ResourceScenarioResult[],
): ResourceOptimizationEvidence[] {
  const dense = scenarios.find((scenario) => scenario.id === "dense-ingest");
  const owner = dense?.phases.settled?.wasm.owners.find(
    (candidate) => candidate.owner === "wasm.string-pool.utf8",
  );
  if (!dense || !owner) throw new Error("dense string-pool optimization lacks owner evidence");
  return [
    {
      owner: owner.owner,
      scenario: dense.id,
      admissionRule: "capacity-slack",
      observed:
        (DENSE_STRING_POOL_CAPACITY_BEFORE - owner.allocatedBytes) /
        DENSE_STRING_POOL_CAPACITY_BEFORE,
      threshold: 0.25,
      unit: "ratio",
      before: DENSE_STRING_POOL_CAPACITY_BEFORE,
      after: owner.allocatedBytes,
      timingBeforeMs: DENSE_INGEST_TIMING_BEFORE_MS,
      timingAfterMs: dense.durationMs,
      budgetBefore: DENSE_STRING_POOL_CAPACITY_BEFORE,
      budgetAfter: DENSE_STRING_POOL_CAPACITY_BUDGET,
      profileArtifact: null,
    },
  ];
}

function current_commit(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("could not resolve resource benchmark commit");
  return result.stdout.toString().trim();
}

async function run_artifact(mode: BenchmarkMode): Promise<void> {
  const ids = mode === "full" ? RESOURCE_FULL_SCENARIOS : RESOURCE_SMOKE_SCENARIOS;
  const scenarios = ids.map((id) => isolated_scenario(id, mode));
  const artifact: ResourceBenchmarkArtifact = {
    schemaVersion: RESOURCE_BENCHMARK_SCHEMA_VERSION,
    resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    mode,
    provenance: {
      commit: current_commit(),
      runtime: `Bun ${Bun.version} ${process.platform}/${process.arch}`,
      forcedGcCheckpoints: ["before", "settled", "after-destroy"],
    },
    scenarios,
    optimizations: mode === "full" ? optimization_evidence(scenarios) : [],
  };
  validateResourceBenchmark(artifact, mode);
  if (mode === "full") {
    await Bun.write(
      new URL("../results/resource-results.json", import.meta.url),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(artifact));
}

if (import.meta.main) {
  const mode: BenchmarkMode = optionValue(process.argv, "--mode") === "full" ? "full" : "smoke";
  const id = optionValue(process.argv, "--scenario");
  if (id && RESOURCE_FULL_SCENARIOS.includes(id as ResourceScenarioId)) {
    console.log(JSON.stringify(await run_scenario(id as ResourceScenarioId, mode)));
  } else {
    await run_artifact(process.argv.includes("--smoke") ? "smoke" : "full");
  }
}
