import ts from "typescript";

import typeScriptManifest from "../../node_modules/typescript/package.json" with { type: "json" };
import { DatasourceController } from "../../packages/core/src/datasource-controller.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import {
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  STORE_MEMORY_PROTOCOL_VERSION,
} from "../../packages/core/src/resource-accounting.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type {
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
  DataSourceRequest,
  DocumentOp,
  ResourceOwnerBytes,
  RowData,
  Workbook,
} from "../../packages/core/src/types.js";
import { nearestRankPercentile, upperMedian } from "./stats.js";

export const BILLION_CELL_BENCHMARK_SCHEMA_VERSION = 2 as const;
export const BILLION_CELL_SAMPLE_RUNS = 5;
// The first measured run in a cold process absorbs one-time runtime
// initialization (module evaluation, JIT, allocator growth) that is not
// workbook metadata, so startup-metadata fields come from the first warmed run.
export const BILLION_CELL_STARTUP_WARMUP_RUNS = 1;
export const RUNTIME_METADATA_POLICY =
  "positive JS-heap delta after schema construction, sampled from the first warmed run" as const;
export const VISIBLE_TILE_ROWS = 120;
export const VISIBLE_TILE_COLUMNS = 20;
export const PAGED_CACHE_BYTES = 32 * 1024 * 1024;
export const PAGED_CHUNK_ROWS = 4_096;
export const HORIZONTAL_TILE_AMPLIFICATION_LIMIT = 1;
export const STARTUP_MEDIAN_LIMIT_MS = 15;
export const SCENARIO_P95_LIMIT_MS = 50;
export const STARTUP_METADATA_LIMIT_BYTES = 128 * 1024;
export const CLEAN_ALLOCATION_LIMIT_BYTES = 36 * 1024 * 1024;
export const LOADED_CLEAN_CELL_LIMIT = 100_000;
export const DIRTY_EDIT_COUNT = 100;
export const CONTROLLER_TILE_METADATA_LIMIT_BYTES = 1024 * 1024;
export const FIXED_WINDOW_SLOPE_LIMIT = 1.25;
export const FFI_CROSSINGS_PER_REQUEST_LIMIT = 8;

export const BILLION_CELL_SCALE_CONFIGS = [
  { id: "10m", rows: 500_000, columns: 20, logicalCells: 10_000_000 },
  { id: "100m", rows: 1_000_000, columns: 100, logicalCells: 100_000_000 },
  { id: "1b", rows: 1_000_000, columns: 1_000, logicalCells: 1_000_000_000 },
] as const;

export const BILLION_CELL_SCENARIOS = [
  "construction",
  "first-visible-tile",
  "deep-two-axis-jump",
  "horizontal-sweep",
  "vertical-sweep",
  "diagonal-churn-100",
  "distant-edits-100",
  "dirty-revisit-after-eviction",
  "clear",
  "destroy",
] as const;

export type BillionCellScaleId = (typeof BILLION_CELL_SCALE_CONFIGS)[number]["id"];
export type BillionCellScenarioId = (typeof BILLION_CELL_SCENARIOS)[number];
export type BillionCellGateStatus = "passed" | "failed";

type ScaleConfig = (typeof BILLION_CELL_SCALE_CONFIGS)[number];
type Comparator = "<=" | "=";
type BandMode = "empty" | "contiguous" | "disjoint-frozen";

export interface TimingSummary {
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface TrafficCounters {
  readonly requests: number;
  readonly pages: number;
  readonly requestedRows: number;
  readonly returnedRows: number;
  readonly requestedCells: number;
  readonly returnedCells: number;
  readonly transferredCells: number;
  readonly requestedBytes: number;
  readonly returnedBytes: number;
  readonly transferredBytes: number;
  readonly explicitNullCells: number;
}

export interface CrossingCounters {
  readonly datasourceRequests: number;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
  readonly totalCrossings: number;
  readonly ffiCallsPerRequest: number;
}

export interface ResourceEvidence {
  readonly logicalCells: number;
  readonly loadedCleanCells: number;
  readonly dirtyCells: number;
  readonly residentCells: number;
  readonly residentChunks: number;
  readonly cleanAllocatedBytes: number;
  readonly dirtyAllocatedBytes: number;
  readonly controllerTileMetadataBytes: number;
  readonly controllerTileMetadataEntries: number;
  readonly nonSchemaAllocatedBytes: number;
  readonly unmeasuredOwnerEntries: number;
  readonly owners: readonly ResourceOwnerBytes[];
  readonly ownerSums: {
    readonly logicalBytes: number;
    readonly allocatedBytes: number;
    readonly entries: number;
  };
  readonly runtime: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly wasm: {
    readonly liveBytes: number;
    readonly allocatedBytes: number;
    readonly committedBytes: number | null;
    readonly unaccountedBytes: number;
  };
  readonly controller: {
    readonly loadedBands: number;
    readonly ownedBands: number;
    readonly visibleWaitingRows: number;
    readonly visibleWaitingBands: number;
  } | null;
}

export interface ProtocolExchange {
  readonly scenario: BillionCellScenarioId;
  readonly request: {
    readonly protocol: 2;
    readonly sheet: string;
    readonly start: number;
    readonly end: number;
    readonly columns: readonly DataSourceColumnBand[];
    readonly revision: number;
    readonly keys: readonly string[];
    readonly bytes: number;
    readonly cells: number;
  };
  readonly page: {
    readonly protocol: 2;
    readonly start: number;
    readonly columns: readonly DataSourceColumnBand[];
    readonly revision: number;
    readonly keys: readonly string[];
    readonly rows: number;
    readonly cells: number;
    readonly bytes: number;
    readonly explicitNullCells: number;
    readonly everyRowHasEveryDeclaredKey: true;
  };
}

export interface ScenarioEvidence {
  readonly id: BillionCellScenarioId;
  readonly status: "completed";
  readonly runs: number;
  readonly operationCountPerRun: number;
  readonly timing: TimingSummary;
  readonly trafficPerRun: TrafficCounters;
  readonly crossingsPerRun: CrossingCounters;
  readonly resources: ResourceEvidence;
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
}

export interface ScaleEvidence {
  readonly id: BillionCellScaleId;
  readonly rows: number;
  readonly columns: number;
  readonly logicalCells: number;
  readonly startupRuntimeBaseline: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly startupRuntimeMetadataBytes: number;
  readonly protocol: {
    readonly contract: "protocol-2-windowed";
    readonly capabilities: { readonly protocol: 2; readonly columns: "windowed" };
    readonly requestKeys: readonly string[];
    readonly pageKeys: readonly string[];
    readonly observedBandModes: readonly BandMode[];
    readonly emptyDemandRequests: 0;
    readonly exchanges: readonly ProtocolExchange[];
  };
  readonly scenarios: readonly ScenarioEvidence[];
}

export interface GateCheck {
  readonly id: string;
  readonly scope: string;
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
  readonly comparator: Comparator;
  readonly passed: boolean;
  readonly reason: string;
}

export interface BillionCellBenchmarkArtifact {
  readonly schemaVersion: typeof BILLION_CELL_BENCHMARK_SCHEMA_VERSION;
  readonly status: BillionCellGateStatus;
  readonly toolchain: {
    readonly runtime: "bun";
    readonly bunVersion: string;
    readonly typescriptVersion: string;
    readonly platform: string;
    readonly architecture: string;
    readonly resourceSchemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
    readonly storeMemoryProtocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
  };
  readonly configuration: {
    readonly sampleRuns: number;
    readonly visibleTileRows: number;
    readonly visibleTileColumns: number;
    readonly cacheBytes: number;
    readonly chunkRows: number;
    readonly deepJumpTargetRow: number;
    readonly deepJumpRowFraction: number;
    readonly horizontalSweepTiles: number;
    readonly verticalSweepTiles: number;
    readonly diagonalChurnTiles: number;
    readonly dirtyEdits: number;
    readonly ownershipSumPolicy: "exclusive-owner-sum; runtime observations and subset counters excluded";
    readonly runtimeMetadataPolicy: typeof RUNTIME_METADATA_POLICY;
    readonly ceilings: {
      readonly directCellAmplification: number;
      readonly startupMedianMs: number;
      readonly scenarioP95Ms: number;
      readonly startupMetadataBytes: number;
      readonly cleanAllocationBytes: number;
      readonly loadedCleanCellsAfterChurn: number;
      readonly dirtyCellsAfterEdits: number;
      readonly controllerTileMetadataBytes: number;
      readonly fixedWindowSlopeRatio: number;
      readonly ffiCrossingsPerRequest: number;
    };
  };
  readonly scales: readonly ScaleEvidence[];
  readonly gate: {
    readonly status: BillionCellGateStatus;
    readonly checks: readonly GateCheck[];
    readonly failures: readonly GateCheck[];
  };
}

interface MutableTrafficCounters {
  requests: number;
  pages: number;
  requestedRows: number;
  returnedRows: number;
  requestedCells: number;
  returnedCells: number;
  transferredCells: number;
  requestedBytes: number;
  returnedBytes: number;
  transferredBytes: number;
  explicitNullCells: number;
}

interface SingleScenarioResult {
  readonly id: BillionCellScenarioId;
  readonly samplesMs: readonly number[];
  readonly operationCount: number;
  readonly traffic: TrafficCounters;
  readonly crossings: CrossingCounters;
  readonly resources: ResourceEvidence;
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
}

interface SingleScaleRun {
  readonly startupBaseline: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly startupRuntimeMetadataBytes: number;
  readonly emptyDemandRequests: 0;
  readonly exchanges: readonly ProtocolExchange[];
  readonly scenarios: readonly SingleScenarioResult[];
}

const SHEET = "billion";
const DEEP_JUMP_TARGET_ROW = 742_000;
const DEEP_JUMP_ROW_FRACTION = 0.742;
const HORIZONTAL_SWEEP_TILES = 12;
const VERTICAL_SWEEP_TILES = 12;
const DIAGONAL_CHURN_TILES = 100;
const REQUEST_KEYS = [
  "columns",
  "end",
  "protocol",
  "revision",
  "sheet",
  "signal",
  "start",
] as const;
const PAGE_KEYS = ["columns", "protocol", "revision", "rows", "start"] as const;
const EXPECTED_OPERATION_COUNTS: Record<BillionCellScenarioId, number> = {
  construction: 1,
  "first-visible-tile": 1,
  "deep-two-axis-jump": 1,
  "horizontal-sweep": HORIZONTAL_SWEEP_TILES,
  "vertical-sweep": VERTICAL_SWEEP_TILES,
  "diagonal-churn-100": DIAGONAL_CHURN_TILES,
  "distant-edits-100": 1,
  "dirty-revisit-after-eviction": DIAGONAL_CHURN_TILES + 1,
  clear: 1,
  destroy: 1,
};
const FIXED_SCHEMA_OWNERS = new Set(["wasm.sheet-indexes-metadata", "js.datasource.schema-index"]);

function runtime_memory(): RuntimeMemoryObservation & { readonly rssBytes: number | null } {
  const usage = process.memoryUsage();
  return {
    usedJSHeapSize: Number.isFinite(usage.heapUsed) ? usage.heapUsed : null,
    arrayBufferBytes: Number.isFinite(usage.arrayBuffers) ? usage.arrayBuffers : null,
    externalBytes: Number.isFinite(usage.external) ? usage.external : null,
    browserBackingStoreBytes: null,
    rssBytes: Number.isFinite(usage.rss) ? usage.rss : null,
  };
}

function workbook(config: ScaleConfig): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [
      {
        id: SHEET,
        name: `${config.logicalCells}-cell fixed window`,
        rowCount: config.rows,
        columns: Array.from({ length: config.columns }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 96,
          type: "number" as const,
        })),
      },
    ],
  };
}

function copy_bands(bands: readonly DataSourceColumnBand[]): DataSourceColumnBand[] {
  return bands.map((band) => ({ start: band.start, end: band.end, keys: [...band.keys] }));
}

function count_band_columns(bands: readonly DataSourceColumnBand[]): number {
  return bands.reduce((sum, band) => sum + band.end - band.start, 0);
}

function json_bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function empty_traffic(): MutableTrafficCounters {
  return {
    requests: 0,
    pages: 0,
    requestedRows: 0,
    returnedRows: 0,
    requestedCells: 0,
    returnedCells: 0,
    transferredCells: 0,
    requestedBytes: 0,
    returnedBytes: 0,
    transferredBytes: 0,
    explicitNullCells: 0,
  };
}

function add_traffic(target: MutableTrafficCounters, exchange: ProtocolExchange): void {
  target.requests += 1;
  target.pages += 1;
  target.requestedRows += exchange.request.end - exchange.request.start;
  target.returnedRows += exchange.page.rows;
  target.requestedCells += exchange.request.cells;
  target.returnedCells += exchange.page.cells;
  target.transferredCells += exchange.page.cells;
  target.requestedBytes += exchange.request.bytes;
  target.returnedBytes += exchange.page.bytes;
  target.transferredBytes += exchange.page.bytes;
  target.explicitNullCells += exchange.page.explicitNullCells;
}

class DeterministicDatasource implements DataSource {
  readonly capabilities = { protocol: 2, columns: "windowed" } as const;
  readonly exchanges: ProtocolExchange[] = [];
  private scenario: BillionCellScenarioId = "first-visible-tile";

  constructor(private readonly config: ScaleConfig) {}

  setScenario(scenario: BillionCellScenarioId): void {
    this.scenario = scenario;
  }

  trafficSince(mark: number): TrafficCounters {
    const counters = empty_traffic();
    for (let index = mark; index < this.exchanges.length; index += 1) {
      add_traffic(counters, this.exchanges[index]!);
    }
    return counters;
  }

  async getRows(request: DataSourceRequest): Promise<DataSourcePage> {
    if (request.protocol !== 2 || request.sheet !== SHEET) {
      throw new Error("billion-cell datasource received an invalid protocol or sheet");
    }
    if (request.signal.aborted) throw request.signal.reason;
    let previous_end = -1;
    const declared: Array<{ key: string; column: number }> = [];
    for (const band of request.columns) {
      if (
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start < previous_end ||
        band.end <= band.start ||
        band.end > this.config.columns ||
        band.keys.length !== band.end - band.start
      ) {
        throw new Error("billion-cell datasource received non-canonical column bands");
      }
      for (let offset = 0; offset < band.keys.length; offset += 1) {
        const column = band.start + offset;
        const key = band.keys[offset]!;
        if (key !== `c${column}`) throw new Error("billion-cell datasource received a stale key");
        declared.push({ key, column });
      }
      previous_end = band.end;
    }

    const rows: RowData[] = [];
    let explicit_null_cells = 0;
    for (let row = request.start; row < request.end; row += 1) {
      const result: RowData = {};
      for (const { key, column } of declared) {
        const blank = (row * 17 + column * 13) % 29 === 0;
        result[key] = blank ? null : (row * 1_003 + column) % 1_000_003;
        if (blank) explicit_null_cells += 1;
      }
      if (Object.keys(result).length !== declared.length) {
        throw new Error("billion-cell datasource omitted a declared cell key");
      }
      rows.push(result);
    }

    const columns = copy_bands(request.columns);
    const page: DataSourcePage = {
      protocol: 2,
      start: request.start,
      columns,
      rows,
      revision: request.revision,
    };
    const requested_cells = (request.end - request.start) * declared.length;
    const request_envelope = {
      protocol: request.protocol,
      sheet: request.sheet,
      start: request.start,
      end: request.end,
      columns,
      revision: request.revision,
    };
    const exchange: ProtocolExchange = {
      scenario: this.scenario,
      request: {
        ...request_envelope,
        keys: Object.keys(request).sort(),
        bytes: json_bytes(request_envelope),
        cells: requested_cells,
      },
      page: {
        protocol: 2,
        start: page.start,
        columns,
        revision: request.revision,
        keys: Object.keys(page).sort(),
        rows: rows.length,
        cells: rows.length * declared.length,
        bytes: json_bytes(page),
        explicitNullCells: explicit_null_cells,
        everyRowHasEveryDeclaredKey: true,
      },
    };
    this.exchanges.push(exchange);
    return page;
  }
}

function indices(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

function visible_columns(): number[] {
  return indices(0, VISIBLE_TILE_COLUMNS);
}

function frozen_window_columns(column_count: number, moving_start: number): number[] {
  const width = VISIBLE_TILE_COLUMNS - 2;
  const bounded_start = Math.max(2, Math.min(column_count - width, moving_start));
  return [0, 1, ...indices(bounded_start, width)];
}

function uniform_start(index: number, count: number, maximum: number): number {
  if (count <= 1 || maximum <= 0) return 0;
  return Math.floor((index * maximum) / (count - 1));
}

function horizontal_columns(config: ScaleConfig, index: number, count: number): number[] {
  const maximum_moving_start = config.columns - (VISIBLE_TILE_COLUMNS - 2);
  const start = 2 + uniform_start(index, count, maximum_moving_start - 2);
  return frozen_window_columns(config.columns, start);
}

function diagonal_position(
  config: ScaleConfig,
  index: number,
  multiplier: number,
): { rowStart: number; columns: number[] } {
  const maximum_row_start = config.rows - VISIBLE_TILE_ROWS;
  const row_ordinal = (index * multiplier) % DIAGONAL_CHURN_TILES;
  const column_ordinal = (index * 37 + multiplier) % DIAGONAL_CHURN_TILES;
  return {
    rowStart: uniform_start(row_ordinal, DIAGONAL_CHURN_TILES, maximum_row_start),
    columns: horizontal_columns(config, column_ordinal, DIAGONAL_CHURN_TILES),
  };
}

// Schema version 2 fixes the upper median and the nearest-rank p95, and the
// validator recomputes both from the stored samples. A new schema version
// moves to `median` and `quantile` from stats.ts.
function summarize(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) throw new Error("timing summary requires at least one sample");
  const normalized = samples.map((sample) => Number(sample.toFixed(6)));
  const sorted = [...normalized].sort((left, right) => left - right);
  const median = upperMedian(sorted);
  const p95 = nearestRankPercentile(sorted, 0.95);
  return {
    samplesMs: normalized,
    medianMs: median,
    p95Ms: p95,
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  };
}

async function settle_controller(
  controller: DatasourceController,
  errors: unknown[],
): Promise<void> {
  for (let turn = 0; turn < 10_000; turn += 1) {
    await Promise.resolve();
    if (errors.length > 0) throw errors[0];
    if (controller.getTelemetry().activeRequests !== 0) continue;
    await Promise.resolve();
    if (controller.getTelemetry().activeRequests === 0) return;
  }
  throw new Error("billion-cell datasource did not settle");
}

function sum_owners(owners: readonly ResourceOwnerBytes[]): ResourceEvidence["ownerSums"] {
  return owners.reduce(
    (sum, owner) => ({
      logicalBytes: sum.logicalBytes + owner.logicalBytes,
      allocatedBytes: sum.allocatedBytes + owner.allocatedBytes,
      entries: sum.entries + owner.entries,
    }),
    { logicalBytes: 0, allocatedBytes: 0, entries: 0 },
  );
}

function collect_resources(
  config: ScaleConfig,
  store: SheetwriteStore,
  controller: DatasourceController,
  operation: RuntimeResourceOperation,
  disposed = false,
): ResourceEvidence {
  Bun.gc(true);
  const memory = runtime_memory();
  const snapshot = store.getRuntimeResourceSnapshot(
    operation,
    disposed ? "after-destroy" : "settled",
    memory,
  );
  const controller_owners = controller.getResourceOwners();
  const owners = [...snapshot.wasm.owners, ...snapshot.jsOwners, ...controller_owners].map(
    (owner) => ({
      ...owner,
    }),
  );
  const names = new Set<string>();
  for (const owner of owners) {
    if (names.has(owner.owner)) throw new Error(`resource owner ${owner.owner} was counted twice`);
    names.add(owner.owner);
  }
  const owner_sums = sum_owners(owners);
  const controller_tile_owners = controller_owners.filter(
    (owner) =>
      owner.owner.startsWith("js.datasource.") && owner.owner !== "js.datasource.schema-index",
  );
  const controller_tile_metadata_bytes = controller_tile_owners.reduce(
    (sum, owner) => sum + owner.allocatedBytes,
    0,
  );
  const controller_tile_metadata_entries = controller_tile_owners.reduce(
    (sum, owner) => sum + owner.entries,
    0,
  );
  const non_schema_allocated_bytes = owners.reduce(
    (sum, owner) => sum + (FIXED_SCHEMA_OWNERS.has(owner.owner) ? 0 : owner.allocatedBytes),
    0,
  );
  const unmeasured_owner_entries = owners.reduce(
    (sum, owner) => sum + (owner.measurement === "entry-count-only" ? owner.entries : 0),
    0,
  );
  const paged = disposed
    ? { loadedCells: 0, dirtyCells: 0, chunks: 0, allocatedBytes: 0, dirtyAllocatedBytes: 0 }
    : store.getPagedStats(SHEET);
  const telemetry = disposed ? null : controller.getTelemetry();
  return {
    logicalCells: config.logicalCells,
    loadedCleanCells: paged.loadedCells,
    dirtyCells: paged.dirtyCells,
    residentCells: paged.loadedCells + paged.dirtyCells,
    residentChunks: paged.chunks,
    cleanAllocatedBytes: paged.allocatedBytes,
    dirtyAllocatedBytes: paged.dirtyAllocatedBytes,
    controllerTileMetadataBytes: controller_tile_metadata_bytes,
    controllerTileMetadataEntries: controller_tile_metadata_entries,
    nonSchemaAllocatedBytes: non_schema_allocated_bytes,
    unmeasuredOwnerEntries: unmeasured_owner_entries,
    owners,
    ownerSums: owner_sums,
    runtime: memory,
    wasm: {
      liveBytes: snapshot.wasm.logicalLiveBytes,
      allocatedBytes: snapshot.wasm.allocatedCapacityBytes,
      committedBytes: snapshot.wasm.wasmCommittedBytes,
      unaccountedBytes: snapshot.wasm.unaccountedBytes,
    },
    controller: telemetry
      ? {
          loadedBands: telemetry.loadedBands,
          ownedBands: telemetry.ownedBands,
          visibleWaitingRows: telemetry.visibleWaitingRows,
          visibleWaitingBands: telemetry.visibleWaitingBands,
        }
      : null,
  };
}

function collect_crossings(
  store: SheetwriteStore,
  operation: RuntimeResourceOperation,
  requests: number,
): CrossingCounters {
  const snapshot = store.getRuntimeResourceSnapshot(operation, "settled", runtime_memory());
  let ffi_calls = 0;
  let js_to_wasm_bytes = 0;
  let wasm_to_js_bytes = 0;
  let bulk_calls = 0;
  let scalar_calls = 0;
  for (const boundary of snapshot.boundary) {
    ffi_calls += boundary.ffiCalls;
    js_to_wasm_bytes += boundary.jsToWasmBytes;
    wasm_to_js_bytes += boundary.wasmToJsBytes;
    bulk_calls += boundary.bulkCalls;
    scalar_calls += boundary.scalarCalls;
  }
  return {
    datasourceRequests: requests,
    ffiCalls: ffi_calls,
    jsToWasmBytes: js_to_wasm_bytes,
    wasmToJsBytes: wasm_to_js_bytes,
    bulkCalls: bulk_calls,
    scalarCalls: scalar_calls,
    totalCrossings: requests + ffi_calls,
    ffiCallsPerRequest: requests === 0 ? 0 : ffi_calls / requests,
  };
}

async function run_scale_once(config: ScaleConfig): Promise<SingleScaleRun> {
  const wb = workbook(config);
  Bun.gc(true);
  const startup_baseline = runtime_memory();
  const startup_started = performance.now();
  const store = new SheetwriteStore(wb, undefined, {
    storage: "paged",
    chunkRows: PAGED_CHUNK_ROWS,
    cacheBytes: PAGED_CACHE_BYTES,
    dirtyCellLimit: DIRTY_EDIT_COUNT,
  });
  const datasource = new DeterministicDatasource(config);
  const errors: unknown[] = [];
  let logical_clock = 0;
  const controller = new DatasourceController(
    {
      datasource,
      loadable: store,
      activeSheet: () => SHEET,
      rowCount: () => config.rows,
      columns: () => wb.sheets[0]!.columns,
      revision: () => 0,
      isCellNewerThan: (address) => store.getCellLoadState(address) === "local-edit",
      retainRevision: () => () => {},
      onRowsLoaded: () => {},
      onError: (_request, error) => errors.push(error),
      now: () => logical_clock,
    },
    config.rows,
  );
  const startup_elapsed = performance.now() - startup_started;
  const startup_resources = collect_resources(config, store, controller, "startup");
  const startup_heap = startup_resources.runtime.usedJSHeapSize;
  const baseline_heap = startup_baseline.usedJSHeapSize;
  const startup_runtime_metadata_bytes =
    startup_heap === null || baseline_heap === null ? 0 : Math.max(0, startup_heap - baseline_heap);
  const scenarios: SingleScenarioResult[] = [];
  const startup_crossings = collect_crossings(store, "startup", 0);
  scenarios.push({
    id: "construction",
    samplesMs: [startup_elapsed],
    operationCount: 1,
    traffic: empty_traffic(),
    crossings: startup_crossings,
    resources: startup_resources,
    parameters: { rows: config.rows, columns: config.columns },
  });

  const scenario = async (
    id: BillionCellScenarioId,
    operation: RuntimeResourceOperation,
    parameters: Readonly<Record<string, number | string | readonly number[]>>,
    run: (measure: (action: () => void | Promise<void>) => Promise<void>) => Promise<number>,
  ): Promise<void> => {
    datasource.setScenario(id);
    controller.resetTelemetry();
    store.resetRuntimeResourceAccounting();
    const exchange_mark = datasource.exchanges.length;
    const samples: number[] = [];
    const measure = async (action: () => void | Promise<void>): Promise<void> => {
      const started = performance.now();
      await action();
      await settle_controller(controller, errors);
      samples.push(performance.now() - started);
    };
    const operation_count = await run(measure);
    const traffic = datasource.trafficSince(exchange_mark);
    if (traffic.requests !== controller.getTelemetry().requests) {
      throw new Error(`${id} controller/datasource request count diverged`);
    }
    const crossings = collect_crossings(store, operation, traffic.requests);
    const resources = collect_resources(config, store, controller, operation);
    scenarios.push({
      id,
      samplesMs: samples,
      operationCount: operation_count,
      traffic,
      crossings,
      resources,
      parameters,
    });
  };

  const empty_mark = datasource.exchanges.length;
  controller.ensureLoaded(0, VISIBLE_TILE_ROWS, []);
  await settle_controller(controller, errors);
  const empty_demand_requests = datasource.exchanges.length - empty_mark;
  if (empty_demand_requests !== 0)
    throw new Error("empty column demand emitted a datasource request");

  await scenario(
    "first-visible-tile",
    "scroll",
    { rowStart: 0, rows: VISIBLE_TILE_ROWS, columns: visible_columns() },
    async (measure) => {
      logical_clock += 16.7;
      await measure(() => controller.updateViewport(0, VISIBLE_TILE_ROWS, visible_columns()));
      return 1;
    },
  );

  const deep_row = Math.floor(config.rows * DEEP_JUMP_ROW_FRACTION);
  const far_column_start = config.columns - VISIBLE_TILE_COLUMNS;
  const far_columns = indices(far_column_start, VISIBLE_TILE_COLUMNS);
  await scenario(
    "deep-two-axis-jump",
    "scroll",
    {
      rowStart: deep_row,
      targetRow: deep_row,
      rowFraction: DEEP_JUMP_ROW_FRACTION,
      columnStart: far_column_start,
      rows: VISIBLE_TILE_ROWS,
      columns: far_columns,
    },
    async (measure) => {
      logical_clock += 16.7;
      await measure(() =>
        controller.updateViewport(deep_row, deep_row + VISIBLE_TILE_ROWS, far_columns),
      );
      return 1;
    },
  );

  await scenario(
    "horizontal-sweep",
    "scroll",
    { tiles: HORIZONTAL_SWEEP_TILES, frozenColumns: 2, movingColumns: VISIBLE_TILE_COLUMNS - 2 },
    async (measure) => {
      for (let tile = 0; tile < HORIZONTAL_SWEEP_TILES; tile += 1) {
        const columns = horizontal_columns(config, tile, HORIZONTAL_SWEEP_TILES);
        logical_clock += 16.7;
        await measure(() =>
          controller.updateViewport(deep_row, deep_row + VISIBLE_TILE_ROWS, columns),
        );
      }
      return HORIZONTAL_SWEEP_TILES;
    },
  );

  await scenario(
    "vertical-sweep",
    "scroll",
    { tiles: VERTICAL_SWEEP_TILES, columns: far_columns },
    async (measure) => {
      for (let tile = 0; tile < VERTICAL_SWEEP_TILES; tile += 1) {
        const row_start = uniform_start(
          tile,
          VERTICAL_SWEEP_TILES,
          config.rows - VISIBLE_TILE_ROWS,
        );
        logical_clock += 16.7;
        await measure(() =>
          controller.updateViewport(row_start, row_start + VISIBLE_TILE_ROWS, far_columns),
        );
      }
      return VERTICAL_SWEEP_TILES;
    },
  );

  await scenario(
    "diagonal-churn-100",
    "scroll",
    {
      tiles: DIAGONAL_CHURN_TILES,
      rowsPerTile: VISIBLE_TILE_ROWS,
      columnsPerTile: VISIBLE_TILE_COLUMNS,
    },
    async (measure) => {
      for (let tile = 0; tile < DIAGONAL_CHURN_TILES; tile += 1) {
        const position = diagonal_position(config, tile, 17);
        await measure(() =>
          controller.ensureLoaded(
            position.rowStart,
            position.rowStart + VISIBLE_TILE_ROWS,
            position.columns,
          ),
        );
      }
      return DIAGONAL_CHURN_TILES;
    },
  );

  const edit_addresses = Array.from({ length: DIRTY_EDIT_COUNT }, (_, index) => ({
    sheet: SHEET,
    row: uniform_start(index, DIRTY_EDIT_COUNT, config.rows - 1),
    col: uniform_start(index, DIRTY_EDIT_COUNT, config.columns - 1),
  }));
  const edit_patches: DocumentOp[] = edit_addresses.map((addr, index) => ({
    op: "set",
    addr,
    value: { kind: "literal", value: 10_000_000 + index },
  }));
  await scenario(
    "distant-edits-100",
    "edit",
    { edits: DIRTY_EDIT_COUNT, distribution: "uniform-across-both-axes" },
    async (measure) => {
      await measure(() => {
        const outcome = store.withResourceOperation("edit", () =>
          store.applyTransaction({ patches: edit_patches }),
        );
        if (outcome.status !== "applied") {
          throw new Error(`100 distant edits were ${outcome.status}`);
        }
      });
      if (store.getPagedStats(SHEET).dirtyCells !== DIRTY_EDIT_COUNT) {
        throw new Error("100 distant edits did not remain dirty");
      }
      return 1;
    },
  );

  await scenario(
    "dirty-revisit-after-eviction",
    "scroll",
    { evictionTiles: DIAGONAL_CHURN_TILES, revisitedDirtyCells: DIRTY_EDIT_COUNT },
    async (measure) => {
      for (let tile = 0; tile < DIAGONAL_CHURN_TILES; tile += 1) {
        const position = diagonal_position(config, tile, 73);
        await measure(() =>
          controller.ensureLoaded(
            position.rowStart,
            position.rowStart + VISIBLE_TILE_ROWS,
            position.columns,
          ),
        );
      }
      await measure(() => {
        store.withResourceOperation("scroll", () => {
          for (let index = 0; index < edit_addresses.length; index += 1) {
            const address = edit_addresses[index]!;
            const resolved = store.getCell(address).resolved;
            if (
              resolved !== 10_000_000 + index ||
              store.getCellLoadState(address) !== "local-edit"
            ) {
              throw new Error(`dirty edit ${index} did not survive clean eviction and revisit`);
            }
          }
        });
      });
      if (store.getPagedStats(SHEET).dirtyCells !== DIRTY_EDIT_COUNT) {
        throw new Error("dirty cells were lost during clean eviction");
      }
      return DIAGONAL_CHURN_TILES + 1;
    },
  );

  await scenario(
    "clear",
    "dirty-clear",
    { acknowledgedDirtyCells: DIRTY_EDIT_COUNT },
    async (measure) => {
      await measure(() => {
        store.withResourceOperation("dirty-clear", () => store.acknowledgeOperations(edit_patches));
        controller.reset(config.rows);
      });
      if (store.getPagedStats(SHEET).dirtyCells !== 0) {
        throw new Error("clear did not release all dirty cells");
      }
      return 1;
    },
  );

  datasource.setScenario("destroy");
  controller.resetTelemetry();
  store.resetRuntimeResourceAccounting();
  const destroy_started = performance.now();
  controller.destroy();
  store.dispose();
  const destroy_elapsed = performance.now() - destroy_started;
  const destroy_resources = collect_resources(config, store, controller, "teardown", true);
  const destroy_crossings = collect_crossings(store, "teardown", 0);
  scenarios.push({
    id: "destroy",
    samplesMs: [destroy_elapsed],
    operationCount: 1,
    traffic: empty_traffic(),
    crossings: destroy_crossings,
    resources: destroy_resources,
    parameters: { controllerDestroyed: 1, storeDisposed: 1 },
  });

  return {
    startupBaseline: startup_baseline,
    startupRuntimeMetadataBytes: startup_runtime_metadata_bytes,
    emptyDemandRequests: 0,
    exchanges: datasource.exchanges,
    scenarios,
  };
}

function same_deterministic_counters(
  expected: SingleScenarioResult,
  actual: SingleScenarioResult,
): void {
  if (expected.id !== actual.id || expected.operationCount !== actual.operationCount) {
    throw new Error("fixed workload operation counts changed between sample runs");
  }
  if (JSON.stringify(expected.traffic) !== JSON.stringify(actual.traffic)) {
    throw new Error(`${expected.id} traffic changed between sample runs`);
  }
  if (JSON.stringify(expected.crossings) !== JSON.stringify(actual.crossings)) {
    throw new Error(`${expected.id} crossing counts changed between sample runs`);
  }
  const deterministic_resource_fields = [
    "logicalCells",
    "loadedCleanCells",
    "dirtyCells",
    "residentCells",
    "residentChunks",
    "controllerTileMetadataEntries",
    "unmeasuredOwnerEntries",
    "controller",
  ] as const;
  for (const field of deterministic_resource_fields) {
    const expected_value = JSON.stringify(expected.resources[field]);
    const actual_value = JSON.stringify(actual.resources[field]);
    if (expected_value !== actual_value) {
      throw new Error(
        `${expected.id} retained ${field} changed between sample runs: ${expected_value} != ${actual_value}`,
      );
    }
  }
}

async function run_scale(config: ScaleConfig): Promise<ScaleEvidence> {
  const runs: SingleScaleRun[] = [];
  for (let run = 0; run < BILLION_CELL_SAMPLE_RUNS; run += 1)
    runs.push(await run_scale_once(config));
  const representative = runs[0]!;
  const startup_run = runs[BILLION_CELL_STARTUP_WARMUP_RUNS] ?? representative;
  const scenarios = representative.scenarios.map((base, scenario_index): ScenarioEvidence => {
    const samples: number[] = [];
    for (const run of runs) {
      const candidate = run.scenarios[scenario_index]!;
      same_deterministic_counters(base, candidate);
      samples.push(...candidate.samplesMs);
    }
    return {
      id: base.id,
      status: "completed",
      runs: BILLION_CELL_SAMPLE_RUNS,
      operationCountPerRun: base.operationCount,
      timing: summarize(samples),
      trafficPerRun: base.traffic,
      crossingsPerRun: base.crossings,
      resources: base.resources,
      parameters: base.parameters,
    };
  });
  const observed_band_modes: BandMode[] = ["empty"];
  if (representative.exchanges.some((exchange) => exchange.request.columns.length === 1)) {
    observed_band_modes.push("contiguous");
  }
  if (representative.exchanges.some((exchange) => exchange.request.columns.length > 1)) {
    observed_band_modes.push("disjoint-frozen");
  }
  return {
    id: config.id,
    rows: config.rows,
    columns: config.columns,
    logicalCells: config.logicalCells,
    startupRuntimeBaseline: startup_run.startupBaseline,
    startupRuntimeMetadataBytes: startup_run.startupRuntimeMetadataBytes,
    protocol: {
      contract: "protocol-2-windowed",
      capabilities: { protocol: 2, columns: "windowed" },
      requestKeys: [...REQUEST_KEYS],
      pageKeys: [...PAGE_KEYS],
      observedBandModes: observed_band_modes,
      emptyDemandRequests: 0,
      exchanges: representative.exchanges,
    },
    scenarios,
  };
}

function check(
  id: string,
  scope: string,
  metric: string,
  actual: number,
  limit: number,
  comparator: Comparator = "<=",
): GateCheck {
  const passed = comparator === "<=" ? actual <= limit : actual === limit;
  return {
    id,
    scope,
    metric,
    actual,
    limit,
    comparator,
    passed,
    reason: `${scope} ${metric} must be ${comparator} ${limit}; actual ${actual}`,
  };
}

function scenario_of(scale: ScaleEvidence, id: BillionCellScenarioId): ScenarioEvidence {
  const scenario = scale.scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`scale ${scale.id} is missing ${id}`);
  return scenario;
}

function finite_ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 1 : Number.MAX_SAFE_INTEGER;
  return numerator / denominator;
}

export function deriveBillionCellGateChecks(scales: readonly ScaleEvidence[]): GateCheck[] {
  const checks: GateCheck[] = [];
  for (const scale of scales) {
    const construction = scenario_of(scale, "construction");
    const deep_jump = scenario_of(scale, "deep-two-axis-jump");
    const deep_row = deep_jump.parameters.rowStart;
    const deep_column = deep_jump.parameters.columnStart;
    if (typeof deep_row !== "number" || typeof deep_column !== "number") {
      throw new Error(`scale ${scale.id} deep-jump targets are missing`);
    }
    const churn = scenario_of(scale, "diagonal-churn-100");
    const edits = scenario_of(scale, "distant-edits-100");
    const revisit = scenario_of(scale, "dirty-revisit-after-eviction");
    const clear = scenario_of(scale, "clear");
    const destroy = scenario_of(scale, "destroy");
    checks.push(
      check(
        `${scale.id}:deep-row-target`,
        scale.id,
        "scale-relative deep-jump row",
        deep_row,
        Math.floor(scale.rows * DEEP_JUMP_ROW_FRACTION),
        "=",
      ),
      check(
        `${scale.id}:deep-column-target`,
        scale.id,
        "far 20-column window start",
        deep_column,
        scale.columns - VISIBLE_TILE_COLUMNS,
        "=",
      ),
      check(
        `${scale.id}:startup-median`,
        scale.id,
        "startup median ms",
        construction.timing.medianMs,
        STARTUP_MEDIAN_LIMIT_MS,
      ),
      check(
        `${scale.id}:startup-metadata`,
        scale.id,
        "startup runtime metadata bytes beyond prebuilt O(columns) schema",
        scale.startupRuntimeMetadataBytes,
        STARTUP_METADATA_LIMIT_BYTES,
      ),
      check(
        `${scale.id}:loaded-clean-after-churn`,
        scale.id,
        "loaded clean cells after 100-tile churn",
        churn.resources.loadedCleanCells,
        LOADED_CLEAN_CELL_LIMIT,
      ),
      check(
        `${scale.id}:dirty-edits`,
        scale.id,
        "dirty cells after 100 edits",
        edits.resources.dirtyCells,
        DIRTY_EDIT_COUNT,
        "=",
      ),
      check(
        `${scale.id}:dirty-revisit`,
        scale.id,
        "dirty cells after clean eviction and revisit",
        revisit.resources.dirtyCells,
        DIRTY_EDIT_COUNT,
        "=",
      ),
      check(
        `${scale.id}:clear`,
        scale.id,
        "dirty cells after clear",
        clear.resources.dirtyCells,
        0,
        "=",
      ),
      check(
        `${scale.id}:destroy-live`,
        scale.id,
        "owned live bytes after destroy",
        destroy.resources.ownerSums.logicalBytes,
        0,
        "=",
      ),
      check(
        `${scale.id}:destroy-allocated`,
        scale.id,
        "owned allocated bytes after destroy",
        destroy.resources.ownerSums.allocatedBytes,
        0,
        "=",
      ),
      check(
        `${scale.id}:empty-demand`,
        scale.id,
        "requests emitted for empty columns",
        scale.protocol.emptyDemandRequests,
        0,
        "=",
      ),
    );

    const max_clean_allocation = Math.max(
      ...scale.scenarios.map((scenario) => scenario.resources.cleanAllocatedBytes),
    );
    const max_controller_metadata = Math.max(
      ...scale.scenarios.map((scenario) => scenario.resources.controllerTileMetadataBytes),
    );
    checks.push(
      check(
        `${scale.id}:clean-allocation`,
        scale.id,
        "clean paged allocated bytes",
        max_clean_allocation,
        CLEAN_ALLOCATION_LIMIT_BYTES,
      ),
      check(
        `${scale.id}:controller-metadata`,
        scale.id,
        "controller tile metadata bytes",
        max_controller_metadata,
        CONTROLLER_TILE_METADATA_LIMIT_BYTES,
      ),
    );

    for (const scenario of scale.scenarios) {
      checks.push(
        check(
          `${scale.id}:${scenario.id}:p95`,
          `${scale.id}/${scenario.id}`,
          "operation p95 ms",
          scenario.timing.p95Ms,
          SCENARIO_P95_LIMIT_MS,
        ),
      );
      const traffic = scenario.trafficPerRun;
      if (traffic.requests > 0) {
        checks.push(
          check(
            `${scale.id}:${scenario.id}:returned-amplification`,
            `${scale.id}/${scenario.id}`,
            "returned/requested cell amplification",
            finite_ratio(traffic.returnedCells, traffic.requestedCells),
            HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
          ),
          check(
            `${scale.id}:${scenario.id}:transferred-amplification`,
            `${scale.id}/${scenario.id}`,
            "transferred/requested cell amplification",
            finite_ratio(traffic.transferredCells, traffic.requestedCells),
            HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
          ),
          check(
            `${scale.id}:${scenario.id}:ffi-crossings`,
            `${scale.id}/${scenario.id}`,
            "hydration/recompute FFI crossings per datasource request",
            scenario.crossingsPerRun.ffiCallsPerRequest,
            FFI_CROSSINGS_PER_REQUEST_LIMIT,
          ),
        );
      }
    }
  }

  for (let index = 1; index < scales.length; index += 1) {
    const previous = scenario_of(scales[index - 1]!, "diagonal-churn-100").resources;
    const current = scenario_of(scales[index]!, "diagonal-churn-100").resources;
    const scope = `${scales[index - 1]!.id}->${scales[index]!.id}`;
    checks.push(
      check(
        `${scope}:retained-byte-slope`,
        scope,
        "fixed-window non-schema retained-byte ratio",
        finite_ratio(current.nonSchemaAllocatedBytes, previous.nonSchemaAllocatedBytes),
        FIXED_WINDOW_SLOPE_LIMIT,
      ),
      check(
        `${scope}:retained-cardinality-slope`,
        scope,
        "fixed-window resident-cardinality ratio",
        finite_ratio(
          current.residentCells + current.residentChunks + current.controllerTileMetadataEntries,
          previous.residentCells + previous.residentChunks + previous.controllerTileMetadataEntries,
        ),
        FIXED_WINDOW_SLOPE_LIMIT,
      ),
    );
  }
  return checks;
}

export async function runBillionCellBenchmark(): Promise<BillionCellBenchmarkArtifact> {
  await initSheetwrite();
  // The first measured scale otherwise absorbs one-time runtime growth (JIT,
  // interned strings, engine caches) into its startup-metadata delta. Warm the
  // process once, discard the result, and start every scale from a warm heap.
  await run_scale_once(BILLION_CELL_SCALE_CONFIGS[0]!);
  Bun.gc(true);
  const scales: ScaleEvidence[] = [];
  for (const config of BILLION_CELL_SCALE_CONFIGS) scales.push(await run_scale(config));
  const checks = deriveBillionCellGateChecks(scales);
  const failures = checks.filter((candidate) => !candidate.passed);
  const status: BillionCellGateStatus = failures.length === 0 ? "passed" : "failed";
  const artifact: BillionCellBenchmarkArtifact = {
    schemaVersion: BILLION_CELL_BENCHMARK_SCHEMA_VERSION,
    status,
    toolchain: {
      runtime: "bun",
      bunVersion: Bun.version,
      typescriptVersion: ts.version,
      platform: process.platform,
      architecture: process.arch,
      resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
      storeMemoryProtocolVersion: STORE_MEMORY_PROTOCOL_VERSION,
    },
    configuration: {
      sampleRuns: BILLION_CELL_SAMPLE_RUNS,
      visibleTileRows: VISIBLE_TILE_ROWS,
      visibleTileColumns: VISIBLE_TILE_COLUMNS,
      cacheBytes: PAGED_CACHE_BYTES,
      chunkRows: PAGED_CHUNK_ROWS,
      deepJumpTargetRow: DEEP_JUMP_TARGET_ROW,
      deepJumpRowFraction: DEEP_JUMP_ROW_FRACTION,
      horizontalSweepTiles: HORIZONTAL_SWEEP_TILES,
      verticalSweepTiles: VERTICAL_SWEEP_TILES,
      diagonalChurnTiles: DIAGONAL_CHURN_TILES,
      dirtyEdits: DIRTY_EDIT_COUNT,
      ownershipSumPolicy: "exclusive-owner-sum; runtime observations and subset counters excluded",
      runtimeMetadataPolicy: RUNTIME_METADATA_POLICY,
      ceilings: {
        directCellAmplification: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
        startupMedianMs: STARTUP_MEDIAN_LIMIT_MS,
        scenarioP95Ms: SCENARIO_P95_LIMIT_MS,
        startupMetadataBytes: STARTUP_METADATA_LIMIT_BYTES,
        cleanAllocationBytes: CLEAN_ALLOCATION_LIMIT_BYTES,
        loadedCleanCellsAfterChurn: LOADED_CLEAN_CELL_LIMIT,
        dirtyCellsAfterEdits: DIRTY_EDIT_COUNT,
        controllerTileMetadataBytes: CONTROLLER_TILE_METADATA_LIMIT_BYTES,
        fixedWindowSlopeRatio: FIXED_WINDOW_SLOPE_LIMIT,
        ffiCrossingsPerRequest: FFI_CROSSINGS_PER_REQUEST_LIMIT,
      },
    },
    scales,
    gate: { status, checks, failures },
  };
  assertCapturedOnRunningMachine(artifact.toolchain);
  validateBillionCellBenchmark(artifact);
  return artifact;
}

function invalid(message: string): never {
  throw new Error(`Invalid billion-cell benchmark artifact: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid(`${label} missing`);
  return value as Record<string, unknown>;
}

function finite_numbers(value: unknown, path = "artifact"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      finite_numbers(child, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) finite_numbers(child, `${path}.${key}`);
  }
}

function non_negative_integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) invalid(`${label} must equal ${String(expected)}`);
}

function non_empty_string(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0)
    invalid(`${label} must be a non-empty string`);
}

/**
 * Asserts that a new capture records the machine and toolchain it ran on.
 *
 * This check runs only at capture time. Committed evidence may come from another machine, so
 * `validateBillionCellBenchmark` checks it against its own recorded toolchain instead.
 */
export function assertCapturedOnRunningMachine(
  toolchain: BillionCellBenchmarkArtifact["toolchain"],
): void {
  exact(toolchain.bunVersion, Bun.version, "toolchain.bunVersion");
  exact(toolchain.typescriptVersion, typeScriptManifest.version, "toolchain.typescriptVersion");
  exact(toolchain.platform, process.platform, "toolchain.platform");
  exact(toolchain.architecture, process.arch, "toolchain.architecture");
}

function validate_runtime_memory(value: unknown, label: string): void {
  const runtime = record(value, label);
  for (const field of [
    "usedJSHeapSize",
    "arrayBufferBytes",
    "externalBytes",
    "browserBackingStoreBytes",
    "rssBytes",
  ]) {
    if (runtime[field] !== null) non_negative_integer(runtime[field], `${label}.${field}`);
  }
}
function is_scenario_id(value: unknown): value is BillionCellScenarioId {
  return typeof value === "string" && BILLION_CELL_SCENARIOS.some((scenario) => scenario === value);
}

function validate_bands(
  value: unknown,
  column_count: number,
  label: string,
): readonly DataSourceColumnBand[] {
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must contain column bands`);
  let previous_end = -1;
  for (let index = 0; index < value.length; index += 1) {
    const band = record(value[index], `${label}[${index}]`);
    const start = non_negative_integer(band.start, `${label}[${index}].start`);
    const end = non_negative_integer(band.end, `${label}[${index}].end`);
    if (start < previous_end || end <= start || end > column_count)
      invalid(`${label} is not sorted/disjoint`);
    if (!Array.isArray(band.keys) || band.keys.length !== end - start)
      invalid(`${label} key count mismatch`);
    for (let offset = 0; offset < band.keys.length; offset += 1) {
      exact(band.keys[offset], `c${start + offset}`, `${label}[${index}].keys[${offset}]`);
    }
    previous_end = end;
  }
  return value as DataSourceColumnBand[];
}

function validate_resources(value: unknown, logical_cells: number, label: string): void {
  const resources = record(value, label);
  exact(resources.logicalCells, logical_cells, `${label}.logicalCells`);
  const loaded_clean_cells = non_negative_integer(
    resources.loadedCleanCells,
    `${label}.loadedCleanCells`,
  );
  const dirty_cells = non_negative_integer(resources.dirtyCells, `${label}.dirtyCells`);
  const resident_cells = non_negative_integer(resources.residentCells, `${label}.residentCells`);
  for (const field of [
    "residentChunks",
    "cleanAllocatedBytes",
    "dirtyAllocatedBytes",
    "controllerTileMetadataBytes",
    "controllerTileMetadataEntries",
    "nonSchemaAllocatedBytes",
    "unmeasuredOwnerEntries",
  ]) {
    non_negative_integer(resources[field], `${label}.${field}`);
  }
  exact(resident_cells, loaded_clean_cells + dirty_cells, `${label}.residentCells`);
  if (resident_cells >= logical_cells)
    invalid(`${label} conflates residency with logical addressability`);
  if (!Array.isArray(resources.owners)) invalid(`${label}.owners missing`);
  const names = new Set<string>();
  const sums = { logicalBytes: 0, allocatedBytes: 0, entries: 0 };
  for (const [index, candidate] of resources.owners.entries()) {
    const owner = record(candidate, `${label}.owners[${index}]`);
    if (typeof owner.owner !== "string" || names.has(owner.owner))
      invalid(`${label} owner names must be unique`);
    names.add(owner.owner);
    sums.logicalBytes += non_negative_integer(
      owner.logicalBytes,
      `${label}.owners[${index}].logicalBytes`,
    );
    sums.allocatedBytes += non_negative_integer(
      owner.allocatedBytes,
      `${label}.owners[${index}].allocatedBytes`,
    );
    sums.entries += non_negative_integer(owner.entries, `${label}.owners[${index}].entries`);
    const valid_measurements = [
      "exact-capacity",
      "hash-capacity-v1",
      "typed-array-byte-length",
      "utf16-upper-bound",
      "entry-count-only",
    ];
    if (typeof owner.measurement !== "string" || !valid_measurements.includes(owner.measurement)) {
      invalid(`${label}.owners[${index}].measurement is invalid`);
    }
  }
  const owner_sums = record(resources.ownerSums, `${label}.ownerSums`);
  exact(owner_sums.logicalBytes, sums.logicalBytes, `${label}.ownerSums.logicalBytes`);
  exact(owner_sums.allocatedBytes, sums.allocatedBytes, `${label}.ownerSums.allocatedBytes`);
  exact(owner_sums.entries, sums.entries, `${label}.ownerSums.entries`);
  const wasm = record(resources.wasm, `${label}.wasm`);
  for (const field of ["liveBytes", "allocatedBytes", "unaccountedBytes"]) {
    non_negative_integer(wasm[field], `${label}.wasm.${field}`);
  }
  if (wasm.committedBytes !== null)
    non_negative_integer(wasm.committedBytes, `${label}.wasm.committedBytes`);
  validate_runtime_memory(resources.runtime, `${label}.runtime`);
}

function validate_traffic(value: unknown, label: string): TrafficCounters {
  const traffic = record(value, label);
  const counters = {
    requests: non_negative_integer(traffic.requests, `${label}.requests`),
    pages: non_negative_integer(traffic.pages, `${label}.pages`),
    requestedRows: non_negative_integer(traffic.requestedRows, `${label}.requestedRows`),
    returnedRows: non_negative_integer(traffic.returnedRows, `${label}.returnedRows`),
    requestedCells: non_negative_integer(traffic.requestedCells, `${label}.requestedCells`),
    returnedCells: non_negative_integer(traffic.returnedCells, `${label}.returnedCells`),
    transferredCells: non_negative_integer(traffic.transferredCells, `${label}.transferredCells`),
    requestedBytes: non_negative_integer(traffic.requestedBytes, `${label}.requestedBytes`),
    returnedBytes: non_negative_integer(traffic.returnedBytes, `${label}.returnedBytes`),
    transferredBytes: non_negative_integer(traffic.transferredBytes, `${label}.transferredBytes`),
    explicitNullCells: non_negative_integer(
      traffic.explicitNullCells,
      `${label}.explicitNullCells`,
    ),
  };
  exact(counters.pages, counters.requests, `${label}.pages`);
  exact(counters.returnedCells, counters.requestedCells, `${label}.returnedCells`);
  exact(counters.transferredCells, counters.returnedCells, `${label}.transferredCells`);
  exact(counters.transferredBytes, counters.returnedBytes, `${label}.transferredBytes`);
  return counters;
}

export function validateBillionCellBenchmark(
  value: unknown,
): asserts value is BillionCellBenchmarkArtifact {
  finite_numbers(value);
  const artifact = record(value, "artifact");
  exact(artifact.schemaVersion, BILLION_CELL_BENCHMARK_SCHEMA_VERSION, "schemaVersion");
  const toolchain = record(artifact.toolchain, "toolchain");
  exact(toolchain.runtime, "bun", "toolchain.runtime");
  non_empty_string(toolchain.bunVersion, "toolchain.bunVersion");
  non_empty_string(toolchain.typescriptVersion, "toolchain.typescriptVersion");
  non_empty_string(toolchain.platform, "toolchain.platform");
  non_empty_string(toolchain.architecture, "toolchain.architecture");
  exact(
    toolchain.resourceSchemaVersion,
    RUNTIME_RESOURCE_SCHEMA_VERSION,
    "toolchain.resourceSchemaVersion",
  );
  exact(
    toolchain.storeMemoryProtocolVersion,
    STORE_MEMORY_PROTOCOL_VERSION,
    "toolchain.storeMemoryProtocolVersion",
  );
  const configuration = record(artifact.configuration, "configuration");
  exact(configuration.sampleRuns, BILLION_CELL_SAMPLE_RUNS, "configuration.sampleRuns");
  exact(configuration.cacheBytes, PAGED_CACHE_BYTES, "configuration.cacheBytes");
  exact(configuration.chunkRows, PAGED_CHUNK_ROWS, "configuration.chunkRows");
  exact(configuration.visibleTileRows, VISIBLE_TILE_ROWS, "configuration.visibleTileRows");
  exact(configuration.visibleTileColumns, VISIBLE_TILE_COLUMNS, "configuration.visibleTileColumns");
  exact(configuration.deepJumpTargetRow, DEEP_JUMP_TARGET_ROW, "configuration.deepJumpTargetRow");
  exact(
    configuration.deepJumpRowFraction,
    DEEP_JUMP_ROW_FRACTION,
    "configuration.deepJumpRowFraction",
  );
  exact(
    configuration.horizontalSweepTiles,
    HORIZONTAL_SWEEP_TILES,
    "configuration.horizontalSweepTiles",
  );
  exact(configuration.verticalSweepTiles, VERTICAL_SWEEP_TILES, "configuration.verticalSweepTiles");
  exact(configuration.diagonalChurnTiles, DIAGONAL_CHURN_TILES, "configuration.diagonalChurnTiles");
  exact(configuration.dirtyEdits, DIRTY_EDIT_COUNT, "configuration.dirtyEdits");
  exact(
    configuration.ownershipSumPolicy,
    "exclusive-owner-sum; runtime observations and subset counters excluded",
    "configuration.ownershipSumPolicy",
  );
  exact(
    configuration.runtimeMetadataPolicy,
    RUNTIME_METADATA_POLICY,
    "configuration.runtimeMetadataPolicy",
  );
  const ceilings = record(configuration.ceilings, "configuration.ceilings");
  const expected_ceilings = {
    directCellAmplification: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
    startupMedianMs: STARTUP_MEDIAN_LIMIT_MS,
    scenarioP95Ms: SCENARIO_P95_LIMIT_MS,
    startupMetadataBytes: STARTUP_METADATA_LIMIT_BYTES,
    cleanAllocationBytes: CLEAN_ALLOCATION_LIMIT_BYTES,
    loadedCleanCellsAfterChurn: LOADED_CLEAN_CELL_LIMIT,
    dirtyCellsAfterEdits: DIRTY_EDIT_COUNT,
    controllerTileMetadataBytes: CONTROLLER_TILE_METADATA_LIMIT_BYTES,
    fixedWindowSlopeRatio: FIXED_WINDOW_SLOPE_LIMIT,
    ffiCrossingsPerRequest: FFI_CROSSINGS_PER_REQUEST_LIMIT,
  };
  for (const [key, expected] of Object.entries(expected_ceilings))
    exact(ceilings[key], expected, `ceilings.${key}`);

  if (
    !Array.isArray(artifact.scales) ||
    artifact.scales.length !== BILLION_CELL_SCALE_CONFIGS.length
  ) {
    invalid(`scales must contain exactly ${BILLION_CELL_SCALE_CONFIGS.length} entries`);
  }
  for (let scale_index = 0; scale_index < BILLION_CELL_SCALE_CONFIGS.length; scale_index += 1) {
    const expected_scale = BILLION_CELL_SCALE_CONFIGS[scale_index]!;
    const scale = record(artifact.scales[scale_index], `scales[${scale_index}]`);
    exact(scale.id, expected_scale.id, `scales[${scale_index}].id`);
    exact(scale.rows, expected_scale.rows, `scales[${scale_index}].rows`);
    exact(scale.columns, expected_scale.columns, `scales[${scale_index}].columns`);
    exact(scale.logicalCells, expected_scale.logicalCells, `scales[${scale_index}].logicalCells`);
    exact(
      expected_scale.rows * expected_scale.columns,
      expected_scale.logicalCells,
      `scales[${scale_index}] row/column product`,
    );
    non_negative_integer(
      scale.startupRuntimeMetadataBytes,
      `scales[${scale_index}].startupRuntimeMetadataBytes`,
    );
    validate_runtime_memory(
      scale.startupRuntimeBaseline,
      `scales[${scale_index}].startupRuntimeBaseline`,
    );
    const protocol = record(scale.protocol, `scales[${scale_index}].protocol`);
    exact(protocol.contract, "protocol-2-windowed", `scales[${scale_index}].protocol.contract`);
    const capabilities = record(
      protocol.capabilities,
      `scales[${scale_index}].protocol.capabilities`,
    );
    exact(capabilities.protocol, 2, `scales[${scale_index}].protocol.capabilities.protocol`);
    exact(capabilities.columns, "windowed", `scales[${scale_index}].protocol.capabilities.columns`);
    exact(protocol.emptyDemandRequests, 0, `scales[${scale_index}].protocol.emptyDemandRequests`);
    if (JSON.stringify(protocol.requestKeys) !== JSON.stringify(REQUEST_KEYS))
      invalid("request keys changed");
    if (JSON.stringify(protocol.pageKeys) !== JSON.stringify(PAGE_KEYS))
      invalid("page keys changed");
    const expected_band_modes: BandMode[] = ["empty", "contiguous", "disjoint-frozen"];
    if (JSON.stringify(protocol.observedBandModes) !== JSON.stringify(expected_band_modes)) {
      invalid(
        `protocol band modes ${JSON.stringify(protocol.observedBandModes)}; expected ${JSON.stringify(expected_band_modes)} for ${expected_scale.id}`,
      );
    }
    if (!Array.isArray(protocol.exchanges) || protocol.exchanges.length === 0)
      invalid("protocol exchanges missing");
    const trace_traffic = new Map<BillionCellScenarioId, MutableTrafficCounters>();
    for (const [exchange_index, candidate] of protocol.exchanges.entries()) {
      const exchange = record(candidate, `protocol.exchanges[${exchange_index}]`);
      if (!is_scenario_id(exchange.scenario)) invalid("exchange scenario is invalid");
      const scenario = exchange.scenario;
      const request = record(exchange.request, `protocol.exchanges[${exchange_index}].request`);
      const page = record(exchange.page, `protocol.exchanges[${exchange_index}].page`);
      exact(request.protocol, 2, "request.protocol");
      exact(page.protocol, 2, "page.protocol");
      exact(page.start, request.start, "page.start");
      const bands = validate_bands(request.columns, expected_scale.columns, "request.columns");
      validate_bands(page.columns, expected_scale.columns, "page.columns");
      if (JSON.stringify(request.columns) !== JSON.stringify(page.columns))
        invalid("page columns differ from request");
      const request_start = non_negative_integer(request.start, "request.start");
      const request_end = non_negative_integer(request.end, "request.end");
      if (request_end <= request_start) invalid("request row interval is empty");
      const requested_rows = request_end - request_start;
      const declared_columns = count_band_columns(bands);
      const request_cells = non_negative_integer(request.cells, "request.cells");
      const page_rows = non_negative_integer(page.rows, "page.rows");
      const page_cells = non_negative_integer(page.cells, "page.cells");
      const request_bytes = non_negative_integer(request.bytes, "request.bytes");
      const page_bytes = non_negative_integer(page.bytes, "page.bytes");
      const explicit_null_cells = non_negative_integer(
        page.explicitNullCells,
        "page.explicitNullCells",
      );
      exact(request_cells, requested_rows * declared_columns, "request.cells");
      exact(page_rows, requested_rows, "page.rows");
      exact(page_cells, request_cells, "page.cells");
      exact(page.everyRowHasEveryDeclaredKey, true, "page.everyRowHasEveryDeclaredKey");
      if (JSON.stringify(request.keys) !== JSON.stringify(REQUEST_KEYS))
        invalid("request trace keys changed");
      if (JSON.stringify(page.keys) !== JSON.stringify(PAGE_KEYS))
        invalid("page trace keys changed");
      let counters = trace_traffic.get(scenario);
      if (!counters) {
        counters = empty_traffic();
        trace_traffic.set(scenario, counters);
      }
      counters.requests += 1;
      counters.pages += 1;
      counters.requestedRows += requested_rows;
      counters.returnedRows += page_rows;
      counters.requestedCells += request_cells;
      counters.returnedCells += page_cells;
      counters.transferredCells += page_cells;
      counters.requestedBytes += request_bytes;
      counters.returnedBytes += page_bytes;
      counters.transferredBytes += page_bytes;
      counters.explicitNullCells += explicit_null_cells;
    }

    if (
      !Array.isArray(scale.scenarios) ||
      scale.scenarios.length !== BILLION_CELL_SCENARIOS.length
    ) {
      invalid(`scale ${expected_scale.id} scenarios missing`);
    }
    for (
      let scenario_index = 0;
      scenario_index < BILLION_CELL_SCENARIOS.length;
      scenario_index += 1
    ) {
      const expected_id = BILLION_CELL_SCENARIOS[scenario_index]!;
      const scenario = record(
        scale.scenarios[scenario_index],
        `scale ${expected_scale.id} scenario ${expected_id}`,
      );
      exact(scenario.id, expected_id, `scenario ${expected_id}.id`);
      exact(scenario.status, "completed", `scenario ${expected_id}.status`);
      exact(scenario.runs, BILLION_CELL_SAMPLE_RUNS, `scenario ${expected_id}.runs`);
      const operation_count = non_negative_integer(
        scenario.operationCountPerRun,
        `scenario ${expected_id}.operationCountPerRun`,
      );
      exact(
        operation_count,
        EXPECTED_OPERATION_COUNTS[expected_id],
        `scenario ${expected_id}.operationCountPerRun`,
      );
      const timing = record(scenario.timing, `scenario ${expected_id}.timing`);
      if (
        !Array.isArray(timing.samplesMs) ||
        timing.samplesMs.length !== operation_count * BILLION_CELL_SAMPLE_RUNS
      ) {
        invalid(`scenario ${expected_id} timing sample count is inconsistent`);
      }
      const expected_timing = summarize(timing.samplesMs);
      for (const field of ["medianMs", "p95Ms", "minMs", "maxMs"] as const) {
        exact(timing[field], expected_timing[field], `scenario ${expected_id}.timing.${field}`);
      }
      const traffic = validate_traffic(
        scenario.trafficPerRun,
        `scenario ${expected_id}.trafficPerRun`,
      );
      const traced = trace_traffic.get(expected_id) ?? empty_traffic();
      if (JSON.stringify(traffic) !== JSON.stringify(traced))
        invalid(`scenario ${expected_id} traffic does not match trace`);
      const crossings = record(scenario.crossingsPerRun, `scenario ${expected_id}.crossingsPerRun`);
      for (const field of [
        "datasourceRequests",
        "ffiCalls",
        "jsToWasmBytes",
        "wasmToJsBytes",
        "bulkCalls",
        "scalarCalls",
        "totalCrossings",
      ]) {
        non_negative_integer(crossings[field], `scenario ${expected_id}.crossingsPerRun.${field}`);
      }
      const datasource_requests = non_negative_integer(
        crossings.datasourceRequests,
        `scenario ${expected_id}.datasourceRequests`,
      );
      const ffi_calls = non_negative_integer(
        crossings.ffiCalls,
        `scenario ${expected_id}.ffiCalls`,
      );
      exact(datasource_requests, traffic.requests, `scenario ${expected_id}.datasourceRequests`);
      exact(
        crossings.totalCrossings,
        datasource_requests + ffi_calls,
        `scenario ${expected_id}.totalCrossings`,
      );
      exact(
        crossings.ffiCallsPerRequest,
        traffic.requests === 0 ? 0 : ffi_calls / traffic.requests,
        `scenario ${expected_id}.ffiCallsPerRequest`,
      );
      validate_resources(
        scenario.resources,
        expected_scale.logicalCells,
        `scenario ${expected_id}.resources`,
      );
    }
    if (
      [...trace_traffic.values()].reduce((sum, traffic) => sum + traffic.explicitNullCells, 0) === 0
    ) {
      invalid(`scale ${expected_scale.id} did not transfer explicit null blanks`);
    }
  }

  const scales = artifact.scales as ScaleEvidence[];
  const expected_checks = deriveBillionCellGateChecks(scales);
  const gate = record(artifact.gate, "gate");
  if (JSON.stringify(gate.checks) !== JSON.stringify(expected_checks))
    invalid("gate checks do not match measured evidence");
  const expected_failures = expected_checks.filter((candidate) => !candidate.passed);
  if (JSON.stringify(gate.failures) !== JSON.stringify(expected_failures))
    invalid("gate failures are incomplete");
  const expected_status = expected_failures.length === 0 ? "passed" : "failed";
  exact(artifact.status, expected_status, "status");
  exact(gate.status, expected_status, "gate.status");
}

if (import.meta.main) {
  const artifact = await runBillionCellBenchmark();
  const output = new URL("../results/billion-cell-results.json", import.meta.url);
  await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  const summary = {
    status: artifact.status,
    scales: artifact.scales.map((scale) => ({
      id: scale.id,
      logicalCells: scale.logicalCells,
      startupMedianMs: scenario_of(scale, "construction").timing.medianMs,
      churnLoadedCells: scenario_of(scale, "diagonal-churn-100").resources.loadedCleanCells,
      dirtyCells: scenario_of(scale, "dirty-revisit-after-eviction").resources.dirtyCells,
    })),
    failures: artifact.gate.failures,
    output: output.pathname,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (artifact.status !== "passed") process.exitCode = 1;
}
