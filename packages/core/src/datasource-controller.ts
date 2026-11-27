import {
  SparseColumnIntervals,
  SparseColumnOwners,
  SparseColumnVisibleWaits,
  SparseIntervals,
  type RowBand,
  type VisibleWaitSample,
} from "./datasource-intervals.js";
import { ScrollAxisMotion } from "./datasource-motion.js";
import { datasourceFailure } from "./errors.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type {
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
  DataSourceRequest,
} from "./types/data.js";
import type { ResourceOwnerBytes } from "./types/store.js";

/** Stable internal policy bounds. Prefetch never exceeds either horizon. */
export const DATASOURCE_PREFETCH_MAX_ROWS = 512;
export const DATASOURCE_PREFETCH_MAX_BYTES = 512 * 1024;
const DATASOURCE_PREFETCH_MAX_BANDS = 2;
export const DATASOURCE_MAX_ACTIVE_REQUESTS = 6;
const DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT = 4_096;
const DATASOURCE_NO_PROGRESS_RETRIES = 1;
const ESTIMATED_CELL_BYTES = 16;
/** Fetch time assumed until a request completes. */
const DATASOURCE_DEFAULT_FETCH_MS = 100;
/** Completed request durations kept for the fetch-time percentile. */
const FETCH_TIME_SAMPLE_LIMIT = 32;
/** Lookahead covers this percentile of measured fetch times. */
const FETCH_TIME_PERCENTILE = 0.9;
/** Share of lookahead rows that may sit behind a slow or resting view. */
const BEHIND_SHARE = 0.2;
/** Columns ahead of a view scrolling sideways: this share of its width, past the travel. */
const COLUMN_MARGIN_SHARE = 0.25;
/** Past a fling's predicted landing point, this share of the margin is fetched. */
const LANDING_FAR_MARGIN_SHARE = 0.5;
/**
 * In-flight speculation survives an update while at least this share of its
 * columns is still wanted: a diagonal scroll moves columns out of every
 * request, and only one mostly out of view is cancelled.
 */
const KEEP_COLUMN_SHARE = 2 / 3;
/** One display frame at 60 Hz: the interval between viewport updates while scrolling. */
const LOGICAL_FRAME_MS = 16.7;
/** Below this speed (wheel scrolling) the lookahead keeps to its margin past the view. */
const SLOW_SCROLL_ROWS_PER_MS = 0.1;
const EMPTY_FORMULA_BANDS = new Uint32Array(0);

let datasource_clock_for_test: (() => number) | undefined;

/**
 * Installs a deterministic monotonic clock through the public testing entrypoint.
 *
 * @param now - Returns the current time in milliseconds; it must never go back.
 * @returns A function that puts the previous clock back.
 */
export function installDatasourceClockForTest(now: () => number): () => void {
  const previous = datasource_clock_for_test;
  datasource_clock_for_test = now;
  return () => {
    datasource_clock_for_test = previous;
  };
}

type RequestPriority = "visible" | "speculative";
type AbortReason = "obsolete" | "reversal" | "jump" | "reset" | "destroy";

type ColumnSchema = readonly { readonly key: string }[];

export interface DatasourceControllerOptions {
  datasource?: DataSource;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  rowCount: (sheet: SheetId) => number;
  /** Returns the current physical column schema in stable workbook order. */
  columns: (sheet: SheetId) => ColumnSchema;
  revision: () => number;
  isCellNewerThan: (address: CellAddress, revision: number) => boolean;
  retainRevision: (revision: number) => () => void;
  onRowsLoaded: () => void;
  onError: (request: Omit<DataSourceRequest, "signal">, error: unknown) => void;
  /** Monotonic clock injection for deterministic residency traces. */
  now?: () => number;
}

interface SchemaSnapshot {
  readonly sheet: SheetId;
  readonly keys: readonly string[];
  readonly singletonIndices: Map<number, readonly number[]>;
  allIndices?: readonly number[];
  allBands?: readonly DataSourceColumnBand[];
}

interface PendingDemand extends RowBand {
  readonly columns: readonly number[];
  readonly priority: RequestPriority;
  readonly direction: -1 | 0 | 1;
  readonly viewportOrigin: boolean;
  readonly durableOrigin: boolean;
  /** Off-viewport cells that formulas in the viewport read. */
  readonly formulaReadOrigin: boolean;
  readonly attempt: number;
}

interface ActiveRequest extends RowBand {
  readonly id: number;
  readonly sheet: SheetId;
  readonly columns: readonly number[];
  readonly bands: readonly DataSourceColumnBand[];
  readonly schema: SchemaSnapshot;
  readonly revision: number;
  readonly controller: AbortController;
  readonly releaseRevision: () => void;
  readonly speculativeOrigin: boolean;
  readonly viewportOrigin: boolean;
  readonly formulaReadOrigin: boolean;
  durableDemand: boolean;
  priority: RequestPriority;
  direction: -1 | 0 | 1;
  readonly attempt: number;
  /** Controller clock time the request was sent. */
  readonly startedAt: number;
  released: boolean;
}

export interface DatasourcePrefetchTelemetry {
  readonly direction: -1 | 0 | 1;
  readonly velocityRowsPerMs: number;
  readonly velocityColumnsPerMs: number;
  /** The percentile of recent fetch times that lookahead covers. */
  readonly fetchTimeP90Ms: number;
  readonly measuredFrames: number;
  readonly residentFrames: number;
  readonly residencyRatio: number;
  readonly visibleWaitSamples: number;
  readonly p95VisibleWaitMs: number;
  readonly maxVisibleWaitMs: number;
  readonly requests: number;
  readonly visibleRequests: number;
  readonly speculativeRequests: number;
  readonly requestedRows: number;
  readonly visibleRequestedRows: number;
  readonly speculativeRequestedRows: number;
  readonly estimatedRequestedBytes: number;
  readonly promotions: number;
  readonly aborts: number;
  readonly reversalAborts: number;
  readonly jumpAborts: number;
  readonly resetAborts: number;
  readonly destroyAborts: number;
  readonly activeRequests: number;
  readonly activeSpeculativeRequests: number;
  readonly activeSpeculativeRows: number;
  /** Per-column interval count, independent of logical sheet area. */
  readonly loadedBands: number;
  /** Per-column request-ownership interval count. */
  readonly ownedBands: number;
  /** Union of waiting row spans across requested physical columns. */
  readonly visibleWaitingRows: number;
  readonly visibleWaitingBands: number;
  readonly cacheChunks: number;
  readonly cacheAllocatedBytes: number;
}

interface MutableTelemetry {
  measuredFrames: number;
  residentFrames: number;
  requests: number;
  visibleRequests: number;
  speculativeRequests: number;
  requestedRows: number;
  visibleRequestedRows: number;
  speculativeRequestedRows: number;
  estimatedRequestedBytes: number;
  promotions: number;
  aborts: number;
  reversalAborts: number;
  jumpAborts: number;
  resetAborts: number;
  destroyAborts: number;
}

function empty_telemetry(): MutableTelemetry {
  return {
    measuredFrames: 0,
    residentFrames: 0,
    requests: 0,
    visibleRequests: 0,
    speculativeRequests: 0,
    requestedRows: 0,
    visibleRequestedRows: 0,
    speculativeRequestedRows: 0,
    estimatedRequestedBytes: 0,
    promotions: 0,
    aborts: 0,
    reversalAborts: 0,
    jumpAborts: 0,
    resetAborts: 0,
    destroyAborts: 0,
  };
}

function normalize_row_count(row_count: number): number {
  if (!Number.isFinite(row_count) || !Number.isSafeInteger(row_count)) {
    throw datasourceFailure("Datasource row count must be a finite safe integer");
  }
  return Math.max(0, row_count);
}

function normalize_bounds(start: number, end: number, row_count: number): RowBand {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Math.abs(start) > Number.MAX_SAFE_INTEGER ||
    Math.abs(end) > Number.MAX_SAFE_INTEGER
  ) {
    throw datasourceFailure("Datasource row bounds must be finite and safely representable");
  }
  const normalized_start = Math.min(row_count, Math.max(0, Math.floor(start)));
  const normalized_end = Math.min(row_count, Math.max(normalized_start, Math.ceil(end)));
  return { start: normalized_start, end: normalized_end };
}

function rows_intersect(a: RowBand, b: RowBand): boolean {
  return a.start < b.end && b.start < a.end;
}

function columns_intersect(a: readonly number[], b: readonly number[]): boolean {
  let left = 0;
  let right = 0;
  while (left < a.length && right < b.length) {
    const left_column = a[left]!;
    const right_column = b[right]!;
    if (left_column === right_column) return true;
    if (left_column < right_column) left += 1;
    else right += 1;
  }
  return false;
}

/** How many of the ascending `columns` the ascending `wanted` also holds. */
function shared_columns(columns: readonly number[], wanted: readonly number[]): number {
  let shared = 0;
  let left = 0;
  let right = 0;
  while (left < columns.length && right < wanted.length) {
    const left_column = columns[left] ?? 0;
    const right_column = wanted[right] ?? 0;
    if (left_column === right_column) {
      shared += 1;
      left += 1;
      right += 1;
    } else if (left_column < right_column) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return shared;
}

function columns_subset(columns: readonly number[], superset: readonly number[]): boolean {
  let candidate = 0;
  let available = 0;
  while (candidate < columns.length && available < superset.length) {
    if (columns[candidate] === superset[available]) {
      candidate += 1;
      available += 1;
    } else if (columns[candidate]! > superset[available]!) {
      available += 1;
    } else {
      return false;
    }
  }
  return candidate === columns.length;
}

function request_without_signal(request: ActiveRequest): Omit<DataSourceRequest, "signal"> {
  return {
    protocol: 2,
    sheet: request.sheet,
    start: request.start,
    end: request.end,
    columns: request.bands,
    revision: request.revision,
  };
}

interface ColumnRectangle extends RowBand {
  readonly columns: readonly number[];
}

interface SpeculativePlan {
  /** Rectangles to prefetch, nearest first. */
  readonly fetch: ColumnRectangle[];
  /** In-flight speculation inside one of these is still wanted. */
  readonly keep: ColumnRectangle[];
  /** Rows move faster than a fetch can follow: the view passes its own rows before they arrive. */
  landing: boolean;
}

/**
 * The span to prefetch ahead of `view` on one axis, moving `direction`, when
 * the view travels `travel` units during one fetch.
 *
 * At low speed the span runs from the view's leading edge to `travel` plus
 * `margin` past it. Above fling speed the view passes the stretch next to its
 * edge before a fetch could return, so the span starts `margin` before the
 * predicted landing point (`landing`) and ends half a margin past it. Ends are
 * aligned to `align` so successive updates request whole bands; the span stays
 * inside `[0, limit)`.
 */
function lookahead_span(
  view: RowBand,
  direction: -1 | 1,
  travel: number,
  margin: number,
  align: number,
  limit: number,
): RowBand & { landing: boolean } {
  const landing_margin = Math.ceil(margin * LANDING_FAR_MARGIN_SHARE);
  if (direction > 0) {
    const edge = Math.floor(view.end / align) * align;
    const landing_start = Math.floor((view.start + travel - margin) / align) * align;
    const landing = landing_start > edge;
    const start = Math.min(limit, Math.max(edge, landing_start));
    const far = view.end + travel + (landing ? landing_margin : margin);
    const end = Math.min(limit, Math.ceil(far / align) * align);
    return { start, end: Math.max(start, end), landing };
  }
  const edge = Math.min(limit, Math.ceil(view.start / align) * align);
  const landing_end = Math.ceil((view.end - travel + margin) / align) * align;
  const landing = landing_end < edge;
  const end = Math.max(0, Math.min(edge, landing_end));
  const far = view.start - travel - (landing ? landing_margin : margin);
  const start = Math.max(0, Math.floor(far / align) * align);
  return { start: Math.min(start, end), end, landing };
}

/**
 * The run of consecutive physical columns that ends at the view's last
 * column: the part that scrolls sideways, after any frozen columns.
 */
function trailing_column_run(columns: readonly number[]): RowBand {
  const last = columns.at(-1) ?? 0;
  let first = columns.length - 1;
  while (first > 0 && columns[first - 1] === last - (columns.length - first)) first -= 1;
  return { start: last - (columns.length - 1 - first), end: last + 1 };
}

function column_range(start: number, end: number): readonly number[] {
  return Object.freeze(Array.from({ length: end - start }, (_, offset) => start + offset));
}

/** Owns sparse two-dimensional datasource demand, request priority, and cancellation. */
export class DatasourceController {
  private readonly loaded = new SparseColumnIntervals();
  private readonly owners = new SparseColumnOwners();
  private readonly visible_wait_started = new SparseColumnVisibleWaits();
  private readonly active_ids = new Map<number, ActiveRequest>();
  private readonly requests = new Set<ActiveRequest>();
  private readonly durable_demand = new SparseColumnIntervals();
  private viewport_demand: PendingDemand | null = null;
  private formula_read_demand: PendingDemand[] = [];
  private speculative_demand: PendingDemand[] = [];
  private retry_demand: PendingDemand[] = [];
  private draining_demand = false;
  private row_count: number;
  private next_request_id = 1;
  private generation = 0;
  private destroyed = false;
  private readonly row_motion = new ScrollAxisMotion();
  private readonly column_motion = new ScrollAxisMotion();
  private readonly fetch_times: number[] = [];
  private fetch_time_cursor = 0;
  private fetch_time_p90_ms = DATASOURCE_DEFAULT_FETCH_MS;
  private rows_landing = false;
  private telemetry = empty_telemetry();

  private last_viewport: {
    start: number;
    end: number;
    columns: readonly number[];
  } | null = null;

  private readonly visible_wait_durations: VisibleWaitSample[] = [];
  private visible_wait_sample_cursor = 0;
  private schema_cache: SchemaSnapshot | null = null;
  private last_canonical_columns: readonly number[] | null = null;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.row_count = normalize_row_count(rowCount);
  }

  /** Requests demand-critical rows for exact canonical physical column indices. */
  ensureLoaded(start: number, end: number, indices: readonly number[]): void {
    if (!this.options.datasource || !this.options.loadable || this.destroyed) return;

    const bounds = normalize_bounds(start, end, this.row_count);
    if (bounds.start === bounds.end || indices.length === 0) return;

    const columns = this.request_columns(indices);
    if (columns.length === 0) return;

    this.durable_demand.add(columns, bounds.start, bounds.end);
    this.drain_demand();
  }

  /**
   * Records the viewport, starts visible work and the off-viewport cells its
   * formulas read, then bounded row-direction speculation.
   */
  updateViewport(
    start: number,
    end: number,
    indices: readonly number[],
    formulaBands: Uint32Array = EMPTY_FORMULA_BANDS,
  ): void {
    if (this.destroyed) return;

    const bounds = normalize_bounds(start, end, this.row_count);
    if (bounds.start === bounds.end || indices.length === 0) {
      this.viewport_demand = null;
      this.formula_read_demand =
        this.options.datasource && this.options.loadable
          ? this.formula_read_demands(formulaBands)
          : [];
      this.speculative_demand.length = 0;
      this.visible_wait_started.clear();
      this.drain_demand();
      return;
    }

    const columns = this.request_columns(indices);
    if (columns.length === 0) return;

    const now = this.now();
    const visible_rows = bounds.end - bounds.start;
    const row_move = this.row_motion.record(now, bounds.start, visible_rows);
    const column_run = trailing_column_run(columns);
    this.column_motion.record(now, column_run.start, column_run.end - column_run.start);
    const effective_direction: -1 | 1 =
      this.row_motion.direction === 0 ? 1 : this.row_motion.direction;

    this.last_viewport = { ...bounds, columns };
    const plan = this.speculative_plan(bounds, columns, column_run, effective_direction);
    this.rows_landing = plan.landing;
    const formula_reads = this.formula_read_demands(formulaBands);

    this.cancel_obsolete_speculation(
      { ...bounds, columns },
      plan.keep,
      formula_reads,
      row_move.jump ? "jump" : row_move.reversal ? "reversal" : "obsolete",
      row_move.reversal || row_move.jump,
    );

    this.refresh_paged_residency(this.options.loadable, bounds.start, bounds.end, columns);
    this.visible_wait_started.retain(columns, bounds.start, bounds.end, this.owners);

    for (const column of columns) {
      const resident = this.loaded.rows(column);

      if (!resident) {
        this.visible_wait_started.addMissing(column, bounds.start, bounds.end, now);
      } else {
        resident.forEachGap(bounds.start, bounds.end, (gap_start, gap_end) => {
          this.visible_wait_started.addMissing(column, gap_start, gap_end, now);
        });
      }
    }

    const fully_resident = this.loaded.covers(bounds.start, bounds.end, columns);
    this.telemetry.measuredFrames += 1;
    if (fully_resident) this.telemetry.residentFrames += 1;

    if (this.options.datasource && this.options.loadable) {
      this.viewport_demand = {
        ...bounds,
        columns,
        priority: "visible",
        direction: 0,
        viewportOrigin: true,
        durableOrigin: false,
        formulaReadOrigin: false,
        attempt: 0,
      };
      this.formula_read_demand = formula_reads;
      this.set_speculative_demand(plan.fetch, visible_rows, effective_direction);
      this.drain_demand();
    } else {
      this.viewport_demand = null;
      this.formula_read_demand.length = 0;
      this.speculative_demand.length = 0;
    }
  }

  getTelemetry(): DatasourcePrefetchTelemetry {
    const waits = [...this.visible_wait_durations].sort((a, b) => a.duration - b.duration);
    let visible_wait_samples = 0;
    for (const wait of waits) visible_wait_samples += wait.rows;

    const p95_rank = Math.max(1, Math.ceil(visible_wait_samples * 0.95));
    let p95_visible_wait_ms = 0;
    let ranked_rows = 0;

    for (const wait of waits) {
      ranked_rows += wait.rows;
      if (ranked_rows < p95_rank) continue;

      p95_visible_wait_ms = wait.duration;
      break;
    }

    const speculative_rows = new SparseIntervals();
    let active_speculative_requests = 0;

    for (const request of this.requests) {
      if (!request.speculativeOrigin) continue;

      active_speculative_requests += 1;
      speculative_rows.add(request.start, request.end);
    }

    const loadable = this.options.loadable;
    const sheet = this.options.activeSheet();
    const cache = loadable?.isPaged(sheet) ? loadable.getPagedStats(sheet) : null;
    const visible_waiting = this.visible_wait_started.rowUnion();

    return {
      direction: this.row_motion.direction,
      velocityRowsPerMs: this.row_motion.velocity,
      velocityColumnsPerMs: this.column_motion.velocity,
      fetchTimeP90Ms: this.fetch_time_p90_ms,
      measuredFrames: this.telemetry.measuredFrames,
      residentFrames: this.telemetry.residentFrames,
      residencyRatio:
        this.telemetry.measuredFrames === 0
          ? 1
          : this.telemetry.residentFrames / this.telemetry.measuredFrames,
      visibleWaitSamples: visible_wait_samples,
      p95VisibleWaitMs: p95_visible_wait_ms,
      maxVisibleWaitMs: waits.at(-1)?.duration ?? 0,
      requests: this.telemetry.requests,
      visibleRequests: this.telemetry.visibleRequests,
      speculativeRequests: this.telemetry.speculativeRequests,
      requestedRows: this.telemetry.requestedRows,
      visibleRequestedRows: this.telemetry.visibleRequestedRows,
      speculativeRequestedRows: this.telemetry.speculativeRequestedRows,
      estimatedRequestedBytes: this.telemetry.estimatedRequestedBytes,
      promotions: this.telemetry.promotions,
      aborts: this.telemetry.aborts,
      reversalAborts: this.telemetry.reversalAborts,
      jumpAborts: this.telemetry.jumpAborts,
      resetAborts: this.telemetry.resetAborts,
      destroyAborts: this.telemetry.destroyAborts,
      activeRequests: this.requests.size,
      activeSpeculativeRequests: active_speculative_requests,
      activeSpeculativeRows: speculative_rows.length,
      loadedBands: this.loaded.bandCount,
      ownedBands: this.owners.bandCount,
      visibleWaitingRows: visible_waiting.length,
      visibleWaitingBands: visible_waiting.bandCount,
      cacheChunks: cache?.chunks ?? 0,
      cacheAllocatedBytes: cache?.allocatedBytes ?? 0,
    };
  }

  getResourceOwners(): ResourceOwnerBytes[] {
    const queued_demand_entries =
      this.durable_demand.bandCount +
      (this.viewport_demand?.columns.length ?? 0) +
      this.formula_read_demand.reduce((sum, demand) => sum + demand.columns.length, 0) +
      this.speculative_demand.reduce((sum, demand) => sum + demand.columns.length, 0) +
      this.retry_demand.reduce((sum, demand) => sum + demand.columns.length, 0);
    const tile_entries =
      this.loaded.bandCount + this.owners.bandCount + this.visible_wait_started.bandCount;
    const tile_columns =
      this.loaded.columnCount + this.owners.columnCount + this.visible_wait_started.columnCount;
    const tile_bytes = tile_entries * 32 + tile_columns * 48;

    let pending_request_bytes = 0;

    for (const request of this.requests) {
      pending_request_bytes +=
        192 +
        request.columns.length * 8 +
        request.bands.reduce((bytes, band) => bytes + 32 + band.keys.length * 8, 0);
    }

    const request_index_bytes = this.active_ids.size * 48;
    const queued_demand_bytes = queued_demand_entries * 40;
    const wait_sample_bytes = this.visible_wait_durations.length * 16;
    const schema_bytes =
      this.schema_cache?.keys.reduce((bytes, key) => bytes + 16 + key.length * 2, 0) ?? 0;
    const schema_index_bytes =
      schema_bytes +
      (this.schema_cache?.keys.length ?? 0) * 8 +
      (this.schema_cache?.allIndices?.length ?? 0) * 8 +
      (this.schema_cache?.singletonIndices.size ?? 0) * 16;

    return [
      {
        owner: "js.datasource.tile-state",
        logicalBytes: tile_bytes,
        allocatedBytes: tile_bytes,
        entries: tile_entries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.pending-requests",
        logicalBytes: pending_request_bytes,
        allocatedBytes: pending_request_bytes,
        entries: this.requests.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.request-index",
        logicalBytes: request_index_bytes,
        allocatedBytes: request_index_bytes,
        entries: this.active_ids.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.queued-demand",
        logicalBytes: queued_demand_bytes,
        allocatedBytes: queued_demand_bytes,
        entries: queued_demand_entries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.wait-samples",
        logicalBytes: wait_sample_bytes,
        allocatedBytes: wait_sample_bytes,
        entries: this.visible_wait_durations.length,
        measurement: "exact-capacity",
      },
      {
        owner: "js.datasource.schema-index",
        logicalBytes: schema_index_bytes,
        allocatedBytes: schema_index_bytes,
        entries: this.schema_cache?.keys.length ?? 0,
        measurement: "utf16-upper-bound",
      },
    ];
  }

  resetTelemetry(): void {
    this.telemetry = empty_telemetry();
    this.visible_wait_durations.length = 0;
    this.visible_wait_sample_cursor = 0;
    this.visible_wait_started.clear();
  }

  resize(rowCount: number): void {
    const normalized = normalize_row_count(rowCount);
    if (this.row_count !== normalized) this.reset(normalized);
  }

  reset(rowCount: number): void {
    const normalized = normalize_row_count(rowCount);
    this.generation += 1;
    this.durable_demand.clear();
    this.viewport_demand = null;
    this.formula_read_demand.length = 0;
    this.speculative_demand.length = 0;
    this.retry_demand.length = 0;
    for (const request of [...this.requests]) this.abort_request(request, "reset");
    this.row_count = normalized;
    this.loaded.clear();
    this.owners.clear();
    this.visible_wait_started.clear();
    this.last_viewport = null;
    this.schema_cache = null;
    this.last_canonical_columns = null;
    this.row_motion.reset();
    this.column_motion.reset();
    this.rows_landing = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.durable_demand.clear();
    this.viewport_demand = null;
    this.formula_read_demand.length = 0;
    this.speculative_demand.length = 0;
    this.retry_demand.length = 0;
    for (const request of [...this.requests]) this.abort_request(request, "destroy");
    this.loaded.clear();
    this.owners.clear();
    this.visible_wait_started.clear();
    this.visible_wait_durations.length = 0;
    this.last_viewport = null;
    this.schema_cache = null;
    this.last_canonical_columns = null;
  }

  private schema(): SchemaSnapshot {
    const sheet = this.options.activeSheet();
    const source = this.options.columns(sheet);
    const cached = this.schema_cache;
    if (cached?.sheet === sheet && cached.keys.length === source.length) {
      let equal = true;
      for (let index = 0; index < source.length; index += 1) {
        if (source[index]?.key !== cached.keys[index]) {
          equal = false;
          break;
        }
      }
      if (equal) return cached;
    }

    const keys: string[] = [];
    const unique = new Set<string>();
    for (const column of source) {
      const key = column?.key;
      if (typeof key !== "string" || key.length === 0 || unique.has(key)) {
        throw datasourceFailure("Datasource schema keys must be non-empty and unique");
      }
      unique.add(key);
      keys.push(key);
    }
    const snapshot: SchemaSnapshot = {
      sheet,
      keys: Object.freeze(keys),
      singletonIndices: new Map(),
    };
    this.schema_cache = snapshot;
    this.last_canonical_columns = null;
    return snapshot;
  }

  private request_columns(indices: readonly number[]): readonly number[] {
    const schema = this.schema();
    const normalized = [...indices].sort((a, b) => a - b);
    let write = 0;
    for (const column of normalized) {
      if (!Number.isSafeInteger(column) || column < 0 || column >= schema.keys.length) {
        throw datasourceFailure("Datasource column indices must reference the current schema");
      }
      if (write === 0 || normalized[write - 1] !== column) normalized[write++] = column;
    }
    normalized.length = write;
    if (normalized.length === 0) return normalized;

    const datasource = this.options.datasource;
    if (datasource) {
      if (datasource.capabilities?.protocol !== 2) {
        throw datasourceFailure("Datasource must declare protocol 2 capabilities");
      }
      if (datasource.capabilities.columns === "full-width") return this.all_columns(schema);
      if (datasource.capabilities.columns !== "windowed") {
        throw datasourceFailure("Datasource column capability must be windowed or full-width");
      }
    }

    const previous = this.last_canonical_columns;
    if (
      previous?.length === normalized.length &&
      previous.every((column, index) => column === normalized[index])
    ) {
      return previous;
    }
    const stable = Object.freeze(normalized);
    this.last_canonical_columns = stable;
    return stable;
  }

  /**
   * Every column index of the schema. A full-width datasource always loads
   * all of them, so its cost grows with the sheet's width.
   */
  private all_columns(schema: SchemaSnapshot): readonly number[] {
    if (!schema.allIndices) {
      schema.allIndices = Object.freeze(
        Array.from({ length: schema.keys.length }, (_, index) => index),
      );
    }
    return schema.allIndices;
  }

  /**
   * Off-viewport formula inputs and spill destinations required for calculation.
   * Spill admission needs known-empty source cells as well as loaded inputs;
   * neither prerequisite is necessarily covered by the viewport request.
   */
  private formula_read_demands(bands: Uint32Array): PendingDemand[] {
    if (bands.length === 0) return [];
    const datasource = this.options.datasource;
    const schema = this.schema();
    const demands: PendingDemand[] = [];
    for (let index = 0; index < bands.length; index += 4) {
      const row_start = bands[index];
      const row_end = bands[index + 1];
      const column_start = bands[index + 2];
      const column_end = bands[index + 3];
      if (
        row_start === undefined ||
        row_end === undefined ||
        column_start === undefined ||
        column_end === undefined
      ) {
        throw new Error("Sheetwrite: formula read bands are not a quad sequence");
      }

      const rows = normalize_bounds(row_start, row_end, this.row_count);
      const schema_column_end = Math.min(column_end, schema.keys.length);
      if (rows.start === rows.end || column_start >= schema_column_end) continue;
      demands.push({
        ...rows,
        columns:
          datasource?.capabilities.columns === "full-width"
            ? this.all_columns(schema)
            : Object.freeze(
                Array.from(
                  { length: schema_column_end - column_start },
                  (_, offset) => column_start + offset,
                ),
              ),
        priority: "visible",
        direction: 0,
        viewportOrigin: false,
        durableOrigin: false,
        formulaReadOrigin: true,
        attempt: 0,
      });
    }

    return demands;
  }

  private canonical_bands(
    columns: readonly number[],
    schema: SchemaSnapshot,
  ): readonly DataSourceColumnBand[] {
    if (
      columns.length === schema.keys.length &&
      columns.every((column, index) => column === index)
    ) {
      if (!schema.allBands) schema.allBands = this.build_bands(columns, schema);
      return schema.allBands;
    }
    return this.build_bands(columns, schema);
  }

  private build_bands(
    columns: readonly number[],
    schema: SchemaSnapshot,
  ): readonly DataSourceColumnBand[] {
    const bands: DataSourceColumnBand[] = [];
    let cursor = 0;
    while (cursor < columns.length) {
      const start = columns[cursor]!;
      let end = start + 1;
      cursor += 1;
      while (cursor < columns.length && columns[cursor] === end) {
        end += 1;
        cursor += 1;
      }
      bands.push(
        Object.freeze({
          start,
          end,
          keys: Object.freeze(schema.keys.slice(start, end)),
        }),
      );
    }
    return Object.freeze(bands);
  }

  private set_speculative_demand(
    rectangles: readonly ColumnRectangle[],
    band_rows: number,
    direction: -1 | 1,
  ): void {
    this.speculative_demand.length = 0;

    for (const { start, end, columns } of rectangles) {
      for (let offset = 0; offset < end - start; offset += band_rows) {
        this.speculative_demand.push({
          start: direction > 0 ? start + offset : Math.max(start, end - offset - band_rows),
          end: direction > 0 ? Math.min(end, start + offset + band_rows) : end - offset,
          columns,
          priority: "speculative",
          direction,
          viewportOrigin: false,
          durableOrigin: false,
          formulaReadOrigin: false,
          attempt: 0,
        });
      }
    }
  }

  private drain_demand(): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed || this.draining_demand) return;
    this.draining_demand = true;
    try {
      for (;;) {
        if (this.viewport_demand) {
          if (!this.dispatch_range(datasource, loadable, this.viewport_demand)) return;
          this.viewport_demand = null;
          continue;
        }

        const retry = this.retry_demand[0];
        if (retry) {
          if (!this.dispatch_range(datasource, loadable, retry)) return;
          this.retry_demand.shift();
          continue;
        }

        const durable = this.durable_demand.firstRectangle();
        if (durable) {
          const demand: PendingDemand = {
            ...durable,
            priority: "visible",
            direction: 0,
            viewportOrigin: false,
            durableOrigin: true,
            formulaReadOrigin: false,
            attempt: 0,
          };
          if (!this.dispatch_range(datasource, loadable, demand)) return;
          this.durable_demand.remove(durable.columns, durable.start, durable.end);
          continue;
        }

        const formula_read = this.formula_read_demand[0];
        if (formula_read) {
          if (!this.dispatch_range(datasource, loadable, formula_read)) return;
          this.formula_read_demand.shift();
          continue;
        }

        const speculative = this.speculative_demand[0];
        if (!speculative) return;
        const available_rows = this.remaining_speculative_rows(speculative.columns.length);
        if (available_rows === 0) return;
        const dispatch_end = Math.min(speculative.end, speculative.start + available_rows);
        const portion = { ...speculative, end: dispatch_end };
        if (!this.dispatch_range(datasource, loadable, portion)) return;
        if (dispatch_end === speculative.end) this.speculative_demand.shift();
        else speculative.start = dispatch_end;
      }
    } finally {
      this.draining_demand = false;
    }
  }

  private dispatch_range(
    datasource: DataSource,
    loadable: SheetwriteStore,
    demand: PendingDemand,
  ): boolean {
    this.refresh_paged_residency(loadable, demand.start, demand.end, demand.columns);
    for (const column of demand.columns) {
      let row = demand.start;
      while (row < demand.end) {
        const loaded_band = this.loaded.rows(column)?.atOrAfter(row);
        if (loaded_band && loaded_band.start <= row) {
          row = Math.min(demand.end, loaded_band.end);
          continue;
        }

        const owner_band = this.owners.rows(column)?.atOrAfter(row);
        if (owner_band && owner_band.start <= row) {
          const request = this.active_ids.get(owner_band.owner);
          if (request) {
            if (demand.durableOrigin) request.durableDemand = true;
            if (demand.priority === "visible" && request.priority === "speculative") {
              request.priority = "visible";
              request.direction = 0;
              this.telemetry.promotions += 1;
            }
          }
          row = Math.min(demand.end, owner_band.end);
          continue;
        }

        if (this.requests.size >= DATASOURCE_MAX_ACTIVE_REQUESTS) {
          // While flinging, the view's own rows pass before a fetch returns: they do not
          // displace the speculation at the landing point.
          const preempted =
            this.rows_landing && demand.viewportOrigin
              ? undefined
              : this.preemption_candidate(demand);
          if (preempted && demand.priority === "visible") {
            this.abort_request(preempted, "obsolete");
            continue;
          }
          return false;
        }

        const request_end = Math.min(
          demand.end,
          loaded_band?.start ?? demand.end,
          owner_band?.start ?? demand.end,
        );
        const request_columns = demand.columns.filter((candidate) =>
          this.tile_uncovered(candidate, row, request_end),
        );
        this.request_band(datasource, loadable, demand, row, request_end, request_columns);
        row = request_end;
      }
    }
    return true;
  }

  private tile_uncovered(column: number, start: number, end: number): boolean {
    return (
      !this.loaded.rows(column)?.intersects(start, end) &&
      !this.owners.rows(column)?.intersects(start, end)
    );
  }

  private preemption_candidate(demand: PendingDemand): ActiveRequest | undefined {
    let candidate = [...this.requests].find(
      (request) => request.priority === "speculative" && !request.durableDemand,
    );
    if (candidate || !demand.viewportOrigin) return candidate;
    candidate = [...this.requests].find(
      (request) =>
        request.durableDemand &&
        (!rows_intersect(request, demand) || !columns_intersect(request.columns, demand.columns)),
    );
    if (candidate) this.durable_demand.add(candidate.columns, candidate.start, candidate.end);
    return candidate;
  }

  private request_band(
    datasource: DataSource,
    loadable: SheetwriteStore,
    demand: PendingDemand,
    start: number,
    end: number,
    columns: readonly number[],
  ): void {
    if (columns.length === 0 || start >= end) return;
    const {
      priority,
      direction,
      viewportOrigin: viewport_origin,
      durableOrigin: durable_origin,
      formulaReadOrigin: formula_read_origin,
      attempt,
    } = demand;
    const schema = this.schema();
    const bands = this.canonical_bands(columns, schema);
    const id = this.allocate_request_id();
    this.owners.add(columns, start, end, id);

    const revision = this.options.revision();
    const controller = new AbortController();
    const active_request: ActiveRequest = {
      id,
      sheet: schema.sheet,
      start,
      end,
      columns,
      bands,
      schema,
      revision,
      controller,
      releaseRevision: this.options.retainRevision(revision),
      speculativeOrigin: priority === "speculative",
      viewportOrigin: viewport_origin,
      formulaReadOrigin: formula_read_origin,
      durableDemand: durable_origin,
      priority,
      direction,
      attempt,
      startedAt: this.now(),
      released: false,
    };

    this.active_ids.set(id, active_request);
    this.requests.add(active_request);
    storeEngine(loadable)?.beginPageRequest();

    const requested_rows = end - start;
    this.telemetry.requests += 1;
    this.telemetry.requestedRows += requested_rows;
    this.telemetry.estimatedRequestedBytes +=
      requested_rows * columns.length * ESTIMATED_CELL_BYTES;
    if (priority === "visible") {
      this.telemetry.visibleRequests += 1;
      this.telemetry.visibleRequestedRows += requested_rows;
    } else {
      this.telemetry.speculativeRequests += 1;
      this.telemetry.speculativeRequestedRows += requested_rows;
    }

    const request: DataSourceRequest = {
      protocol: 2,
      sheet: schema.sheet,
      start,
      end,
      columns: bands,
      signal: controller.signal,
      revision,
    };

    const generation = this.generation;
    let pending: Promise<DataSourcePage>;
    try {
      pending = datasource.getRows(request);
    } catch (error) {
      this.clear_owned(active_request);
      this.visible_wait_started.discard(
        active_request.columns,
        active_request.start,
        active_request.end,
      );
      this.finish_request(active_request);
      queueMicrotask(() => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.options.onError(request_without_signal(active_request), error);
      });

      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        if (!this.can_hydrate(active_request, generation)) return;
        const response_columns = this.validate_page(page, active_request);
        if (!this.can_hydrate(active_request, generation)) return;
        const loaded_end = page.start + page.rows.length;
        const progressed = page.rows.length > 0 && response_columns.length > 0;
        if (progressed) {
          loadable.loadPage(active_request.sheet, page.start, page.columns, page.rows, (address) =>
            this.options.isCellNewerThan(address, revision),
          );
          if (!this.can_hydrate(active_request, generation)) return;
          this.loaded.add(response_columns, page.start, loaded_end);
          this.record_completed_waits(response_columns, page.start, loaded_end);
          this.record_fetch_time(this.now() - active_request.startedAt);
          this.options.onRowsLoaded();
        }

        if (!this.loaded.covers(active_request.start, active_request.end, active_request.columns)) {
          if (!progressed && active_request.attempt >= DATASOURCE_NO_PROGRESS_RETRIES) {
            throw datasourceFailure("Datasource page made no coverage progress");
          }

          this.requeue_partial(active_request, progressed ? 0 : active_request.attempt + 1);
        }

        this.clear_owned(active_request);
      })
      .catch((error: unknown) => {
        if (!this.can_hydrate(active_request, generation)) return;
        this.clear_owned(active_request);
        this.visible_wait_started.discard(
          active_request.columns,
          active_request.start,
          active_request.end,
        );
        this.options.onError(request_without_signal(active_request), error);
      })
      .finally(() => {
        this.finish_request(active_request);
        if (!this.destroyed && generation === this.generation) this.drain_demand();
      });
  }

  private validate_page(page: DataSourcePage, request: ActiveRequest): readonly number[] {
    if (page?.protocol !== 2 || !Array.isArray(page.rows) || !Array.isArray(page.columns)) {
      throw datasourceFailure("Datasource page must use protocol 2 arrays");
    }

    if (!Number.isSafeInteger(page.start)) {
      throw datasourceFailure("Datasource page start must be a safe integer");
    }

    const loaded_end = page.start + page.rows.length;
    const current_row_count = normalize_row_count(this.options.rowCount(request.sheet));
    if (
      !Number.isSafeInteger(loaded_end) ||
      page.start < request.start ||
      loaded_end > request.end ||
      loaded_end > current_row_count
    ) {
      throw datasourceFailure("Datasource page rows exceed requested coverage");
    }

    if (this.options.activeSheet() !== request.sheet || this.schema() !== request.schema) {
      throw datasourceFailure("Datasource schema changed while a page was pending");
    }

    const response_columns: number[] = [];
    const declared_keys: string[] = [];
    let request_cursor = 0;
    let previous_end = -1;
    for (const band of page.columns) {
      if (
        !band ||
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start >= band.end ||
        band.end > request.schema.keys.length ||
        !Array.isArray(band.keys) ||
        band.keys.length !== band.end - band.start ||
        band.start < previous_end
      ) {
        throw datasourceFailure("Datasource page contains malformed column bands");
      }

      while (
        request_cursor < request.bands.length &&
        request.bands[request_cursor]!.end <= band.start
      ) {
        request_cursor += 1;
      }

      const requested_band = request.bands[request_cursor];
      if (!requested_band || band.start < requested_band.start || band.end > requested_band.end) {
        throw datasourceFailure("Datasource page column coverage exceeds the request");
      }

      for (let offset = 0; offset < band.keys.length; offset += 1) {
        const expected = request.schema.keys[band.start + offset]!;
        if (band.keys[offset] !== expected) {
          throw datasourceFailure("Datasource page column keys do not match the current schema");
        }

        declared_keys.push(expected);
        response_columns.push(band.start + offset);
      }

      previous_end = band.end;
    }

    const declared = new Set(declared_keys);
    for (const row of page.rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw datasourceFailure("Datasource page rows must be keyed objects");
      }

      const own_keys = Reflect.ownKeys(row);
      if (own_keys.length !== declared_keys.length) {
        throw datasourceFailure("Datasource page row keys do not match declared coverage");
      }

      for (const key of own_keys) {
        if (typeof key !== "string" || !declared.has(key)) {
          throw datasourceFailure("Datasource page row contains an undeclared key");
        }
      }

      for (const key of declared_keys) {
        if (!Object.hasOwn(row, key)) {
          throw datasourceFailure("Datasource page row is missing a declared key");
        }
      }
    }

    return response_columns;
  }

  private can_hydrate(request: ActiveRequest, generation: number): boolean {
    return (
      !this.destroyed &&
      !request.released &&
      generation === this.generation &&
      !request.controller.signal.aborted
    );
  }

  private requeue_partial(request: ActiveRequest, attempt: number): void {
    this.retry_demand.push({
      start: request.start,
      end: request.end,
      columns: request.columns,
      priority: request.priority,
      direction: request.direction,
      viewportOrigin: request.viewportOrigin,
      durableOrigin: request.durableDemand,
      formulaReadOrigin: request.formulaReadOrigin,
      attempt,
    });
  }

  private record_completed_waits(columns: readonly number[], start: number, end: number): void {
    for (const sample of this.visible_wait_started.complete(columns, start, end, this.now())) {
      if (this.visible_wait_durations.length < DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT) {
        this.visible_wait_durations.push(sample);
      } else {
        this.visible_wait_durations[this.visible_wait_sample_cursor] = sample;
        this.visible_wait_sample_cursor =
          (this.visible_wait_sample_cursor + 1) % DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT;
      }
    }
  }

  private record_fetch_time(duration_ms: number): void {
    if (this.fetch_times.length < FETCH_TIME_SAMPLE_LIMIT) {
      this.fetch_times.push(duration_ms);
    } else {
      this.fetch_times[this.fetch_time_cursor] = duration_ms;
      this.fetch_time_cursor = (this.fetch_time_cursor + 1) % FETCH_TIME_SAMPLE_LIMIT;
    }
    const sorted = [...this.fetch_times].sort((a, b) => a - b);
    const rank = Math.max(0, Math.ceil(sorted.length * FETCH_TIME_PERCENTILE) - 1);
    this.fetch_time_p90_ms = sorted[rank] ?? DATASOURCE_DEFAULT_FETCH_MS;
  }

  /**
   * What to prefetch around the view, and which in-flight speculation is still
   * wanted.
   *
   * Rows look ahead by the distance the view travels during one fetch (the p90
   * of measured fetch times, bounded by where a slowing scroll comes to rest)
   * plus one view of margin, behind a short trailing band. Columns do the same
   * while the view moves mostly sideways. Both share the cell budget of
   * {@link speculative_cell_budget}. In-flight speculation along the path from
   * the trailing band to the end of the lookahead survives; a request the view
   * has passed, or one beyond a lookahead that shrank as the scroll slowed, is
   * cancelled.
   */
  private speculative_plan(
    view: RowBand,
    columns: readonly number[],
    column_run: RowBand,
    direction: -1 | 1,
  ): SpeculativePlan {
    const plan: SpeculativePlan = { fetch: [], keep: [], landing: false };
    const cell_budget = this.speculative_cell_budget();
    const rows = this.plan_rows(plan, view, columns, column_run, direction, cell_budget);
    this.plan_columns(plan, view, rows.path, column_run, cell_budget - rows.cells);
    return plan;
  }

  /** Adds the rows ahead of and behind the view to `plan`; returns the cells they take. */
  private plan_rows(
    plan: SpeculativePlan,
    view: RowBand,
    columns: readonly number[],
    column_run: RowBand,
    direction: -1 | 1,
    cell_budget: number,
  ): { cells: number; path: RowBand } {
    const band_rows = view.end - view.start;
    const horizon_rows = Math.min(
      DATASOURCE_PREFETCH_MAX_ROWS,
      Math.floor(cell_budget / Math.max(1, columns.length)),
    );
    if (horizon_rows <= 0) return { cells: 0, path: view };

    // A view that moves more than its height per frame (a scrollbar drag) shows only a
    // sliver of the rows it crosses, so rows along the way are not worth a fetch: only the
    // predicted resting point is, once the scroll is slowing down.
    const row_speed = Math.abs(this.row_motion.velocity);
    const skipping = row_speed * LOGICAL_FRAME_MS > band_rows;
    const travel = skipping
      ? this.row_motion.restDistance()
      : this.row_motion.travel(this.fetch_time_p90_ms);
    // Before any motion, the first view looks two views ahead.
    const margin = this.row_motion.direction === 0 ? 2 * band_rows : band_rows;
    const ahead = lookahead_span(
      view,
      direction,
      Number.isFinite(travel) ? travel : 0,
      margin,
      band_rows,
      this.row_count,
    );
    if (skipping && !Number.isFinite(travel)) ahead.end = ahead.start;
    // Slow, steady scrolling (a mouse wheel) reaches no further than the margin past the
    // view: rows beyond it would mostly go unseen.
    if (!skipping && row_speed < SLOW_SCROLL_ROWS_PER_MS) {
      if (direction > 0) {
        ahead.end = Math.min(ahead.end, Math.ceil((view.end + margin) / band_rows) * band_rows);
      } else {
        ahead.start = Math.max(
          ahead.start,
          Math.floor((view.start - margin) / band_rows) * band_rows,
        );
      }
    }
    plan.landing = skipping || ahead.landing;

    const behind_rows = plan.landing
      ? 0
      : Math.min(Math.floor(horizon_rows * BEHIND_SHARE), Math.max(1, Math.ceil(band_rows / 2)));
    let behind: RowBand;
    if (direction > 0) {
      const behind_end = Math.floor(view.start / band_rows) * band_rows;
      behind = { start: Math.max(0, behind_end - behind_rows), end: behind_end };
      ahead.end = Math.min(ahead.end, ahead.start + horizon_rows - (behind.end - behind.start));
    } else {
      const behind_start = Math.min(this.row_count, Math.ceil(view.end / band_rows) * band_rows);
      behind = { start: behind_start, end: Math.min(this.row_count, behind_start + behind_rows) };
      ahead.start = Math.max(ahead.start, ahead.end - horizon_rows + (behind.end - behind.start));
    }

    // On a diagonal scroll, each band of rows ahead is fetched for the columns the view will
    // show when that band comes into view.
    for (let offset = 0; offset < ahead.end - ahead.start; offset += band_rows) {
      const start =
        direction > 0
          ? ahead.start + offset
          : Math.max(ahead.start, ahead.end - offset - band_rows);
      const end = direction > 0 ? Math.min(ahead.end, start + band_rows) : ahead.end - offset;
      const distance = direction > 0 ? start - view.end : view.start - end;
      const arrives_in_ms = row_speed > 0 ? (Math.max(0, distance) + band_rows / 2) / row_speed : 0;
      const band_columns = this.columns_after(columns, column_run, arrives_in_ms);
      plan.fetch.push({ start, end, columns: band_columns });
      if (band_columns !== columns) plan.keep.push({ start, end, columns: band_columns });
    }
    if (behind.start < behind.end) plan.fetch.push({ ...behind, columns });
    const path = {
      start: Math.min(view.start, behind.start, ahead.start),
      end: Math.max(view.end, behind.end, ahead.end),
    };
    plan.keep.push({ ...path, columns });
    const cells =
      (Math.max(0, ahead.end - ahead.start) + behind.end - behind.start) * columns.length;
    return { cells, path };
  }

  /**
   * Adds the columns ahead of a view that scrolls mostly sideways to `plan`,
   * for the visible rows, within `cell_budget`. During a diagonal fling the
   * visible rows leave before those columns arrive, so none are fetched. They
   * stay wanted while their rows are on the rows' `path`.
   */
  private plan_columns(
    plan: SpeculativePlan,
    view: RowBand,
    path: RowBand,
    column_run: RowBand,
    cell_budget: number,
  ): void {
    const velocity = this.column_motion.velocity;
    const band_rows = view.end - view.start;
    const column_extent = column_run.end - column_run.start;
    const column_cap = Math.floor(cell_budget / Math.max(1, band_rows));
    const sideways =
      Math.abs(velocity) / Math.max(1, column_extent) >
      Math.abs(this.row_motion.velocity) / Math.max(1, band_rows);
    if (
      this.options.datasource?.capabilities.columns !== "windowed" ||
      velocity === 0 ||
      !sideways ||
      column_cap <= 0
    ) {
      return;
    }
    const direction: -1 | 1 = velocity > 0 ? 1 : -1;
    const ahead = lookahead_span(
      column_run,
      direction,
      this.column_motion.travel(this.fetch_time_p90_ms),
      Math.ceil(column_extent * COLUMN_MARGIN_SHARE),
      1,
      this.schema().keys.length,
    );
    if (direction > 0) ahead.end = Math.min(ahead.end, ahead.start + column_cap);
    else ahead.start = Math.max(ahead.start, ahead.end - column_cap);
    if (ahead.start >= ahead.end) return;
    plan.fetch.push({ ...view, columns: column_range(ahead.start, ahead.end) });
    plan.keep.push({
      ...path,
      columns: column_range(
        Math.min(column_run.start, ahead.start),
        Math.max(column_run.end, ahead.end),
      ),
    });
  }

  /**
   * The view's columns `duration_ms` from now: the scrolling run moved by its
   * sideways travel, frozen columns in place. The same array while the view
   * does not move sideways.
   */
  private columns_after(
    columns: readonly number[],
    run: RowBand,
    duration_ms: number,
  ): readonly number[] {
    const velocity = this.column_motion.velocity;
    if (velocity === 0 || this.options.datasource?.capabilities.columns !== "windowed") {
      return columns;
    }
    const extent = run.end - run.start;
    const shift = Math.round(Math.sign(velocity) * this.column_motion.travel(duration_ms));
    const width = this.schema().keys.length;
    const start = Math.min(Math.max(0, run.start + shift), Math.max(0, width - extent));
    if (start === run.start) return columns;
    const shifted = new Set(columns.slice(0, columns.length - extent));
    for (let column = start; column < start + extent; column++) shifted.add(column);
    return Object.freeze([...shifted].sort((a, b) => a - b));
  }

  /**
   * Cells speculation may hold: the prefetch byte bound, and on a paged sheet
   * no more than the clean-chunk cache budget leaves beside the view.
   */
  private speculative_cell_budget(): number {
    const byte_bound = Math.floor(DATASOURCE_PREFETCH_MAX_BYTES / ESTIMATED_CELL_BYTES);
    const loadable = this.options.loadable;
    if (!loadable?.isPaged(this.options.activeSheet())) return byte_bound;
    const cache_bytes = storeEngine(loadable)?.pagedCacheBytes();
    if (cache_bytes === undefined) return byte_bound;
    const view = this.last_viewport;
    const view_cells = view ? (view.end - view.start) * view.columns.length : 0;
    const budget_cells = Math.floor(cache_bytes / ESTIMATED_CELL_BYTES) - view_cells;
    return Math.max(0, Math.min(byte_bound, budget_cells));
  }

  private remaining_speculative_rows(column_count: number): number {
    const active = new SparseIntervals();
    for (const request of this.requests) {
      if (request.speculativeOrigin) active.add(request.start, request.end);
    }
    const horizon_rows = Math.min(
      DATASOURCE_PREFETCH_MAX_ROWS,
      Math.floor(this.speculative_cell_budget() / Math.max(1, column_count)),
    );
    return Math.max(0, horizon_rows - active.length);
  }

  /**
   * Align the known loaded bands with what the paged store actually holds.
   *
   * A row band the store holds in full is added outright. Otherwise one span
   * call per column returns the loaded runs, and every band row outside a run is
   * dropped. That costs one call per column, not one call per row band. A store
   * that exposes no engine (a stand-in implementing the public surface only)
   * is probed one row band at a time.
   */
  private refresh_paged_residency(
    loadable: SheetwriteStore | null,
    start: number,
    end: number,
    columns: readonly number[],
  ): void {
    if (!loadable || columns.length === 0) return;
    const sheet = this.options.activeSheet();
    if (!loadable.isPaged(sheet)) return;
    if (loadable.areColumnsFullyLoaded(sheet, start, end, columns)) {
      this.loaded.add(columns, start, end);
      return;
    }
    const engine = storeEngine(loadable);
    for (const column of columns) {
      const resident = this.loaded.rows(column);
      if (!resident) continue;
      const spans = engine?.loadedSpans(sheet, start, end, column);
      for (const band of resident.intersections(start, end)) {
        if (spans === undefined)
          this.probe_loaded_residency(loadable, sheet, column, band.start, band.end);
        else this.retain_loaded_runs(column, band.start, band.end, spans);
      }
    }
  }

  /**
   * Drop the rows of `[start, end)` the store does not hold, by asking it about
   * one row band at a time. Used when no engine is registered.
   */
  private probe_loaded_residency(
    loadable: SheetwriteStore,
    sheet: SheetId,
    column: number,
    start: number,
    end: number,
  ): void {
    if (loadable.areColumnsFullyLoaded(sheet, start, end, this.singleton_columns(column))) return;
    if (end - start === 1) {
      this.loaded.removeColumn(column, start, end);
      return;
    }
    const middle = start + Math.floor((end - start) / 2);
    this.probe_loaded_residency(loadable, sheet, column, start, middle);
    this.probe_loaded_residency(loadable, sheet, column, middle, end);
  }

  private singleton_columns(column: number): readonly number[] {
    const schema = this.schema();
    let singleton = schema.singletonIndices.get(column);
    if (!singleton) {
      singleton = Object.freeze([column]);
      schema.singletonIndices.set(column, singleton);
    }
    return singleton;
  }

  /** Drop every row of `[start, end)` that the ascending `spans` pairs miss. */
  private retain_loaded_runs(column: number, start: number, end: number, spans: Uint32Array): void {
    let cursor = start;
    for (let index = 0; index < spans.length; index += 2) {
      const span_start = spans[index];
      const span_end = spans[index + 1];
      if (span_start === undefined || span_end === undefined) {
        throw new Error("Sheetwrite: loaded row spans are not a pair sequence");
      }
      if (span_end <= cursor) continue;
      if (span_start >= end) break;
      if (span_start > cursor) this.loaded.removeColumn(column, cursor, Math.min(span_start, end));
      cursor = Math.min(span_end, end);
      if (cursor >= end) return;
    }
    if (cursor < end) this.loaded.removeColumn(column, cursor, end);
  }

  private cancel_obsolete_speculation(
    viewport: RowBand & { columns: readonly number[] },
    keep: readonly ColumnRectangle[],
    formula_reads: readonly PendingDemand[],
    reason: "obsolete" | "reversal" | "jump",
    cancel_generation: boolean,
  ): void {
    this.retry_demand = this.retry_demand.filter(
      (demand) =>
        demand.durableOrigin ||
        (demand.formulaReadOrigin &&
          formula_reads.some(
            (read) =>
              rows_intersect(demand, read) && columns_intersect(demand.columns, read.columns),
          )) ||
        (rows_intersect(demand, viewport) && columns_subset(demand.columns, viewport.columns)),
    );
    for (const request of [...this.requests]) {
      if (request.durableDemand) continue;
      if (request.formulaReadOrigin) {
        const still_read = formula_reads.some(
          (read) =>
            rows_intersect(request, read) && columns_intersect(request.columns, read.columns),
        );
        if (!still_read) this.abort_request(request, reason);
        continue;
      }

      const intersects_viewport =
        rows_intersect(request, viewport) && columns_subset(request.columns, viewport.columns);
      if (request.speculativeOrigin) {
        if (intersects_viewport) continue;
        const still_wanted = keep.some(
          (rectangle) =>
            request.start >= rectangle.start &&
            request.end <= rectangle.end &&
            shared_columns(request.columns, rectangle.columns) >=
              KEEP_COLUMN_SHARE * request.columns.length,
        );
        if (!cancel_generation && still_wanted) {
          request.priority = "speculative";
          continue;
        }

        this.abort_request(request, reason);
        continue;
      }

      if (request.viewportOrigin) {
        const request_rows = request.end - request.start;
        const current_rows = viewport.end - viewport.start;
        const oversized =
          request_rows >
          Math.max(DATASOURCE_PREFETCH_MAX_ROWS, current_rows * DATASOURCE_PREFETCH_MAX_BANDS);
        if (!intersects_viewport || oversized) this.abort_request(request, reason);
      }
    }
  }

  private abort_request(request: ActiveRequest, reason: AbortReason): void {
    if (request.released) return;
    request.controller.abort();
    this.clear_owned(request);
    this.visible_wait_started.discard(request.columns, request.start, request.end);
    this.finish_request(request);
    this.telemetry.aborts += 1;
    if (reason === "reversal") this.telemetry.reversalAborts += 1;
    else if (reason === "jump") this.telemetry.jumpAborts += 1;
    else if (reason === "reset") this.telemetry.resetAborts += 1;
    else if (reason === "destroy") this.telemetry.destroyAborts += 1;
  }

  private clear_owned(request: ActiveRequest): void {
    this.owners.remove(request.id, request.columns);
  }

  private finish_request(request: ActiveRequest): void {
    if (request.released) return;
    request.released = true;
    this.requests.delete(request);
    this.active_ids.delete(request.id);
    if (this.options.loadable) storeEngine(this.options.loadable)?.endPageRequest();
    request.releaseRevision();
  }

  private allocate_request_id(): number {
    for (;;) {
      const id = this.next_request_id;
      this.next_request_id = id === 0xffff_ffff ? 1 : id + 1;
      if (!this.active_ids.has(id)) return id;
    }
  }

  private now(): number {
    return (
      this.options.now?.() ??
      datasource_clock_for_test?.() ??
      globalThis.performance?.now() ??
      Date.now()
    );
  }
}
