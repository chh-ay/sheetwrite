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
const EMPTY_FORMULA_BANDS = new Uint32Array(0);

let datasourceClockForTest: (() => number) | undefined;

/** Installs a deterministic monotonic clock through the public testing entrypoint. */
export function installDatasourceClockForTest(now: () => number): () => void {
  const previous = datasourceClockForTest;
  datasourceClockForTest = now;
  return () => {
    datasourceClockForTest = previous;
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

function emptyTelemetry(): MutableTelemetry {
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

function normalizeRowCount(rowCount: number): number {
  if (!Number.isFinite(rowCount) || !Number.isSafeInteger(rowCount)) {
    throw datasourceFailure("Datasource row count must be a finite safe integer");
  }
  return Math.max(0, rowCount);
}

function normalizeBounds(start: number, end: number, rowCount: number): RowBand {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Math.abs(start) > Number.MAX_SAFE_INTEGER ||
    Math.abs(end) > Number.MAX_SAFE_INTEGER
  ) {
    throw datasourceFailure("Datasource row bounds must be finite and safely representable");
  }
  const normalizedStart = Math.min(rowCount, Math.max(0, Math.floor(start)));
  const normalizedEnd = Math.min(rowCount, Math.max(normalizedStart, Math.ceil(end)));
  return { start: normalizedStart, end: normalizedEnd };
}

function rowsIntersect(a: RowBand, b: RowBand): boolean {
  return a.start < b.end && b.start < a.end;
}

function columnsIntersect(a: readonly number[], b: readonly number[]): boolean {
  let left = 0;
  let right = 0;
  while (left < a.length && right < b.length) {
    const leftColumn = a[left]!;
    const rightColumn = b[right]!;
    if (leftColumn === rightColumn) return true;
    if (leftColumn < rightColumn) left += 1;
    else right += 1;
  }
  return false;
}

/** How many of the ascending `columns` the ascending `wanted` also holds. */
function sharedColumns(columns: readonly number[], wanted: readonly number[]): number {
  let shared = 0;
  let left = 0;
  let right = 0;
  while (left < columns.length && right < wanted.length) {
    const leftColumn = columns[left] ?? 0;
    const rightColumn = wanted[right] ?? 0;
    if (leftColumn === rightColumn) {
      shared += 1;
      left += 1;
      right += 1;
    } else if (leftColumn < rightColumn) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return shared;
}

function columnsSubset(columns: readonly number[], superset: readonly number[]): boolean {
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

function requestWithoutSignal(request: ActiveRequest): Omit<DataSourceRequest, "signal"> {
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
function lookaheadSpan(
  view: RowBand,
  direction: -1 | 1,
  travel: number,
  margin: number,
  align: number,
  limit: number,
): RowBand & { landing: boolean } {
  const landingMargin = Math.ceil(margin * LANDING_FAR_MARGIN_SHARE);
  if (direction > 0) {
    const edge = Math.floor(view.end / align) * align;
    const landingStart = Math.floor((view.start + travel - margin) / align) * align;
    const landing = landingStart > edge;
    const start = Math.min(limit, Math.max(edge, landingStart));
    const far = view.end + travel + (landing ? landingMargin : margin);
    const end = Math.min(limit, Math.ceil(far / align) * align);
    return { start, end: Math.max(start, end), landing };
  }
  const edge = Math.min(limit, Math.ceil(view.start / align) * align);
  const landingEnd = Math.ceil((view.end - travel + margin) / align) * align;
  const landing = landingEnd < edge;
  const end = Math.max(0, Math.min(edge, landingEnd));
  const far = view.start - travel - (landing ? landingMargin : margin);
  const start = Math.max(0, Math.floor(far / align) * align);
  return { start: Math.min(start, end), end, landing };
}

/**
 * The run of consecutive physical columns that ends at the view's last
 * column: the part that scrolls sideways, after any frozen columns.
 */
function trailingColumnRun(columns: readonly number[]): RowBand {
  const last = columns.at(-1) ?? 0;
  let first = columns.length - 1;
  while (first > 0 && columns[first - 1] === last - (columns.length - first)) first -= 1;
  return { start: last - (columns.length - 1 - first), end: last + 1 };
}

function columnRange(start: number, end: number): readonly number[] {
  return Object.freeze(Array.from({ length: end - start }, (_, offset) => start + offset));
}

/** Owns sparse two-dimensional datasource demand, request priority, and cancellation. */
export class DatasourceController {
  private readonly loaded = new SparseColumnIntervals();
  private readonly owners = new SparseColumnOwners();
  private readonly visibleWaitStarted = new SparseColumnVisibleWaits();
  private readonly activeIds = new Map<number, ActiveRequest>();
  private readonly requests = new Set<ActiveRequest>();
  private readonly durableDemand = new SparseColumnIntervals();
  private viewportDemand: PendingDemand | null = null;
  private formulaReadDemand: PendingDemand[] = [];
  private speculativeDemand: PendingDemand[] = [];
  private retryDemand: PendingDemand[] = [];
  private drainingDemand = false;
  private rowCount: number;
  private nextRequestId = 1;
  private generation = 0;
  private destroyed = false;
  private readonly rowMotion = new ScrollAxisMotion();
  private readonly columnMotion = new ScrollAxisMotion();
  private readonly fetchTimes: number[] = [];
  private fetchTimeCursor = 0;
  private fetchTimeP90Ms = DATASOURCE_DEFAULT_FETCH_MS;
  private rowsLanding = false;
  private telemetry = emptyTelemetry();

  private lastViewport: {
    start: number;
    end: number;
    columns: readonly number[];
  } | null = null;

  private readonly visibleWaitDurations: VisibleWaitSample[] = [];
  private visibleWaitSampleCursor = 0;
  private schemaCache: SchemaSnapshot | null = null;
  private lastCanonicalColumns: readonly number[] | null = null;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.rowCount = normalizeRowCount(rowCount);
  }

  /** Requests demand-critical rows for exact canonical physical column indices. */
  ensureLoaded(start: number, end: number, indices: readonly number[]): void {
    if (!this.options.datasource || !this.options.loadable || this.destroyed) return;

    const bounds = normalizeBounds(start, end, this.rowCount);
    if (bounds.start === bounds.end || indices.length === 0) return;

    const columns = this.requestColumns(indices);
    if (columns.length === 0) return;

    this.durableDemand.add(columns, bounds.start, bounds.end);
    this.drainDemand();
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

    const bounds = normalizeBounds(start, end, this.rowCount);
    if (bounds.start === bounds.end || indices.length === 0) {
      this.viewportDemand = null;
      this.formulaReadDemand =
        this.options.datasource && this.options.loadable
          ? this.formulaReadDemands(formulaBands)
          : [];
      this.speculativeDemand.length = 0;
      this.visibleWaitStarted.clear();
      this.drainDemand();
      return;
    }

    const columns = this.requestColumns(indices);
    if (columns.length === 0) return;

    const now = this.now();
    const visibleRows = bounds.end - bounds.start;
    const rowMove = this.rowMotion.record(now, bounds.start, visibleRows);
    const columnRun = trailingColumnRun(columns);
    this.columnMotion.record(now, columnRun.start, columnRun.end - columnRun.start);
    const effectiveDirection: -1 | 1 =
      this.rowMotion.direction === 0 ? 1 : this.rowMotion.direction;

    this.lastViewport = { ...bounds, columns };
    const plan = this.speculativePlan(bounds, columns, columnRun, effectiveDirection);
    this.rowsLanding = plan.landing;
    const formulaReads = this.formulaReadDemands(formulaBands);

    this.cancelObsoleteSpeculation(
      { ...bounds, columns },
      plan.keep,
      formulaReads,
      rowMove.jump ? "jump" : rowMove.reversal ? "reversal" : "obsolete",
      rowMove.reversal || rowMove.jump,
    );

    this.refreshPagedResidency(this.options.loadable, bounds.start, bounds.end, columns);
    this.visibleWaitStarted.retain(columns, bounds.start, bounds.end, this.owners);

    for (const column of columns) {
      const resident = this.loaded.rows(column);

      if (!resident) {
        this.visibleWaitStarted.addMissing(column, bounds.start, bounds.end, now);
      } else {
        resident.forEachGap(bounds.start, bounds.end, (gapStart, gapEnd) => {
          this.visibleWaitStarted.addMissing(column, gapStart, gapEnd, now);
        });
      }
    }

    const fullyResident = this.loaded.covers(bounds.start, bounds.end, columns);
    this.telemetry.measuredFrames += 1;
    if (fullyResident) this.telemetry.residentFrames += 1;

    if (this.options.datasource && this.options.loadable) {
      this.viewportDemand = {
        ...bounds,
        columns,
        priority: "visible",
        direction: 0,
        viewportOrigin: true,
        durableOrigin: false,
        formulaReadOrigin: false,
        attempt: 0,
      };
      this.formulaReadDemand = formulaReads;
      this.setSpeculativeDemand(plan.fetch, visibleRows, effectiveDirection);
      this.drainDemand();
    } else {
      this.viewportDemand = null;
      this.formulaReadDemand.length = 0;
      this.speculativeDemand.length = 0;
    }
  }

  getTelemetry(): DatasourcePrefetchTelemetry {
    const waits = [...this.visibleWaitDurations].sort((a, b) => a.duration - b.duration);
    let visibleWaitSamples = 0;
    for (const wait of waits) visibleWaitSamples += wait.rows;

    const p95Rank = Math.max(1, Math.ceil(visibleWaitSamples * 0.95));
    let p95VisibleWaitMs = 0;
    let rankedRows = 0;

    for (const wait of waits) {
      rankedRows += wait.rows;
      if (rankedRows < p95Rank) continue;

      p95VisibleWaitMs = wait.duration;
      break;
    }

    const speculativeRows = new SparseIntervals();
    let activeSpeculativeRequests = 0;

    for (const request of this.requests) {
      if (!request.speculativeOrigin) continue;

      activeSpeculativeRequests += 1;
      speculativeRows.add(request.start, request.end);
    }

    const loadable = this.options.loadable;
    const sheet = this.options.activeSheet();
    const cache = loadable?.isPaged(sheet) ? loadable.getPagedStats(sheet) : null;
    const visibleWaiting = this.visibleWaitStarted.rowUnion();

    return {
      direction: this.rowMotion.direction,
      velocityRowsPerMs: this.rowMotion.velocity,
      velocityColumnsPerMs: this.columnMotion.velocity,
      fetchTimeP90Ms: this.fetchTimeP90Ms,
      measuredFrames: this.telemetry.measuredFrames,
      residentFrames: this.telemetry.residentFrames,
      residencyRatio:
        this.telemetry.measuredFrames === 0
          ? 1
          : this.telemetry.residentFrames / this.telemetry.measuredFrames,
      visibleWaitSamples,
      p95VisibleWaitMs,
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
      activeSpeculativeRequests,
      activeSpeculativeRows: speculativeRows.length,
      loadedBands: this.loaded.bandCount,
      ownedBands: this.owners.bandCount,
      visibleWaitingRows: visibleWaiting.length,
      visibleWaitingBands: visibleWaiting.bandCount,
      cacheChunks: cache?.chunks ?? 0,
      cacheAllocatedBytes: cache?.allocatedBytes ?? 0,
    };
  }

  getResourceOwners(): ResourceOwnerBytes[] {
    const queuedDemandEntries =
      this.durableDemand.bandCount +
      (this.viewportDemand?.columns.length ?? 0) +
      this.formulaReadDemand.reduce((sum, demand) => sum + demand.columns.length, 0) +
      this.speculativeDemand.reduce((sum, demand) => sum + demand.columns.length, 0) +
      this.retryDemand.reduce((sum, demand) => sum + demand.columns.length, 0);
    const tileEntries =
      this.loaded.bandCount + this.owners.bandCount + this.visibleWaitStarted.bandCount;
    const tileColumns =
      this.loaded.columnCount + this.owners.columnCount + this.visibleWaitStarted.columnCount;
    const tileBytes = tileEntries * 32 + tileColumns * 48;

    let pendingRequestBytes = 0;

    for (const request of this.requests) {
      pendingRequestBytes +=
        192 +
        request.columns.length * 8 +
        request.bands.reduce((bytes, band) => bytes + 32 + band.keys.length * 8, 0);
    }

    const requestIndexBytes = this.activeIds.size * 48;
    const queuedDemandBytes = queuedDemandEntries * 40;
    const waitSampleBytes = this.visibleWaitDurations.length * 16;
    const schemaBytes =
      this.schemaCache?.keys.reduce((bytes, key) => bytes + 16 + key.length * 2, 0) ?? 0;
    const schemaIndexBytes =
      schemaBytes +
      (this.schemaCache?.keys.length ?? 0) * 8 +
      (this.schemaCache?.allIndices?.length ?? 0) * 8 +
      (this.schemaCache?.singletonIndices.size ?? 0) * 16;

    return [
      {
        owner: "js.datasource.tile-state",
        logicalBytes: tileBytes,
        allocatedBytes: tileBytes,
        entries: tileEntries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.pending-requests",
        logicalBytes: pendingRequestBytes,
        allocatedBytes: pendingRequestBytes,
        entries: this.requests.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.request-index",
        logicalBytes: requestIndexBytes,
        allocatedBytes: requestIndexBytes,
        entries: this.activeIds.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.queued-demand",
        logicalBytes: queuedDemandBytes,
        allocatedBytes: queuedDemandBytes,
        entries: queuedDemandEntries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.wait-samples",
        logicalBytes: waitSampleBytes,
        allocatedBytes: waitSampleBytes,
        entries: this.visibleWaitDurations.length,
        measurement: "exact-capacity",
      },
      {
        owner: "js.datasource.schema-index",
        logicalBytes: schemaIndexBytes,
        allocatedBytes: schemaIndexBytes,
        entries: this.schemaCache?.keys.length ?? 0,
        measurement: "utf16-upper-bound",
      },
    ];
  }

  resetTelemetry(): void {
    this.telemetry = emptyTelemetry();
    this.visibleWaitDurations.length = 0;
    this.visibleWaitSampleCursor = 0;
    this.visibleWaitStarted.clear();
  }

  resize(rowCount: number): void {
    const normalized = normalizeRowCount(rowCount);
    if (this.rowCount !== normalized) this.reset(normalized);
  }

  reset(rowCount: number): void {
    const normalized = normalizeRowCount(rowCount);
    this.generation += 1;
    this.durableDemand.clear();
    this.viewportDemand = null;
    this.formulaReadDemand.length = 0;
    this.speculativeDemand.length = 0;
    this.retryDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "reset");
    this.rowCount = normalized;
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.lastViewport = null;
    this.schemaCache = null;
    this.lastCanonicalColumns = null;
    this.rowMotion.reset();
    this.columnMotion.reset();
    this.rowsLanding = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.durableDemand.clear();
    this.viewportDemand = null;
    this.formulaReadDemand.length = 0;
    this.speculativeDemand.length = 0;
    this.retryDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "destroy");
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.visibleWaitDurations.length = 0;
    this.lastViewport = null;
    this.schemaCache = null;
    this.lastCanonicalColumns = null;
  }

  private schema(): SchemaSnapshot {
    const sheet = this.options.activeSheet();
    const source = this.options.columns(sheet);
    const cached = this.schemaCache;
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
    this.schemaCache = snapshot;
    this.lastCanonicalColumns = null;
    return snapshot;
  }

  private requestColumns(indices: readonly number[]): readonly number[] {
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
      if (datasource.capabilities.columns === "full-width") return this.allColumns(schema);
      if (datasource.capabilities.columns !== "windowed") {
        throw datasourceFailure("Datasource column capability must be windowed or full-width");
      }
    }

    const previous = this.lastCanonicalColumns;
    if (
      previous?.length === normalized.length &&
      previous.every((column, index) => column === normalized[index])
    ) {
      return previous;
    }
    const stable = Object.freeze(normalized);
    this.lastCanonicalColumns = stable;
    return stable;
  }

  /** Full-width compatibility shares this engine but is horizontally non-scalable. */
  private allColumns(schema: SchemaSnapshot): readonly number[] {
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
  private formulaReadDemands(bands: Uint32Array): PendingDemand[] {
    if (bands.length === 0) return [];
    const datasource = this.options.datasource;
    const schema = this.schema();
    const demands: PendingDemand[] = [];
    for (let index = 0; index < bands.length; index += 4) {
      const rowStart = bands[index];
      const rowEnd = bands[index + 1];
      const columnStart = bands[index + 2];
      const columnEnd = bands[index + 3];
      if (
        rowStart === undefined ||
        rowEnd === undefined ||
        columnStart === undefined ||
        columnEnd === undefined
      ) {
        throw new Error("Sheetwrite: formula read bands are not a quad sequence");
      }

      const rows = normalizeBounds(rowStart, rowEnd, this.rowCount);
      const schemaColumnEnd = Math.min(columnEnd, schema.keys.length);
      if (rows.start === rows.end || columnStart >= schemaColumnEnd) continue;
      demands.push({
        ...rows,
        columns:
          datasource?.capabilities.columns === "full-width"
            ? this.allColumns(schema)
            : Object.freeze(
                Array.from(
                  { length: schemaColumnEnd - columnStart },
                  (_, offset) => columnStart + offset,
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

  private canonicalBands(
    columns: readonly number[],
    schema: SchemaSnapshot,
  ): readonly DataSourceColumnBand[] {
    if (
      columns.length === schema.keys.length &&
      columns.every((column, index) => column === index)
    ) {
      if (!schema.allBands) schema.allBands = this.buildBands(columns, schema);
      return schema.allBands;
    }
    return this.buildBands(columns, schema);
  }

  private buildBands(
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

  private setSpeculativeDemand(
    rectangles: readonly ColumnRectangle[],
    bandRows: number,
    direction: -1 | 1,
  ): void {
    this.speculativeDemand.length = 0;

    for (const { start, end, columns } of rectangles) {
      for (let offset = 0; offset < end - start; offset += bandRows) {
        this.speculativeDemand.push({
          start: direction > 0 ? start + offset : Math.max(start, end - offset - bandRows),
          end: direction > 0 ? Math.min(end, start + offset + bandRows) : end - offset,
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

  private drainDemand(): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed || this.drainingDemand) return;
    this.drainingDemand = true;
    try {
      for (;;) {
        if (this.viewportDemand) {
          if (!this.dispatchRange(datasource, loadable, this.viewportDemand)) return;
          this.viewportDemand = null;
          continue;
        }

        const retry = this.retryDemand[0];
        if (retry) {
          if (!this.dispatchRange(datasource, loadable, retry)) return;
          this.retryDemand.shift();
          continue;
        }

        const durable = this.durableDemand.firstRectangle();
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
          if (!this.dispatchRange(datasource, loadable, demand)) return;
          this.durableDemand.remove(durable.columns, durable.start, durable.end);
          continue;
        }

        const formulaRead = this.formulaReadDemand[0];
        if (formulaRead) {
          if (!this.dispatchRange(datasource, loadable, formulaRead)) return;
          this.formulaReadDemand.shift();
          continue;
        }

        const speculative = this.speculativeDemand[0];
        if (!speculative) return;
        const availableRows = this.remainingSpeculativeRows(speculative.columns.length);
        if (availableRows === 0) return;
        const dispatchEnd = Math.min(speculative.end, speculative.start + availableRows);
        const portion = { ...speculative, end: dispatchEnd };
        if (!this.dispatchRange(datasource, loadable, portion)) return;
        if (dispatchEnd === speculative.end) this.speculativeDemand.shift();
        else speculative.start = dispatchEnd;
      }
    } finally {
      this.drainingDemand = false;
    }
  }

  private dispatchRange(
    datasource: DataSource,
    loadable: SheetwriteStore,
    demand: PendingDemand,
  ): boolean {
    this.refreshPagedResidency(loadable, demand.start, demand.end, demand.columns);
    for (const column of demand.columns) {
      let row = demand.start;
      while (row < demand.end) {
        const loadedBand = this.loaded.rows(column)?.atOrAfter(row);
        if (loadedBand && loadedBand.start <= row) {
          row = Math.min(demand.end, loadedBand.end);
          continue;
        }

        const ownerBand = this.owners.rows(column)?.atOrAfter(row);
        if (ownerBand && ownerBand.start <= row) {
          const request = this.activeIds.get(ownerBand.owner);
          if (request) {
            if (demand.durableOrigin) request.durableDemand = true;
            if (demand.priority === "visible" && request.priority === "speculative") {
              request.priority = "visible";
              request.direction = 0;
              this.telemetry.promotions += 1;
            }
          }
          row = Math.min(demand.end, ownerBand.end);
          continue;
        }

        if (this.requests.size >= DATASOURCE_MAX_ACTIVE_REQUESTS) {
          // While flinging, the view's own rows pass before a fetch returns: they do not
          // displace the speculation at the landing point.
          const preempted =
            this.rowsLanding && demand.viewportOrigin
              ? undefined
              : this.preemptionCandidate(demand);
          if (preempted && demand.priority === "visible") {
            this.abortRequest(preempted, "obsolete");
            continue;
          }
          return false;
        }

        const requestEnd = Math.min(
          demand.end,
          loadedBand?.start ?? demand.end,
          ownerBand?.start ?? demand.end,
        );
        const requestColumns = demand.columns.filter((candidate) =>
          this.tileUncovered(candidate, row, requestEnd),
        );
        this.requestBand(datasource, loadable, demand, row, requestEnd, requestColumns);
        row = requestEnd;
      }
    }
    return true;
  }

  private tileUncovered(column: number, start: number, end: number): boolean {
    return (
      !this.loaded.rows(column)?.intersects(start, end) &&
      !this.owners.rows(column)?.intersects(start, end)
    );
  }

  private preemptionCandidate(demand: PendingDemand): ActiveRequest | undefined {
    let candidate = [...this.requests].find(
      (request) => request.priority === "speculative" && !request.durableDemand,
    );
    if (candidate || !demand.viewportOrigin) return candidate;
    candidate = [...this.requests].find(
      (request) =>
        request.durableDemand &&
        (!rowsIntersect(request, demand) || !columnsIntersect(request.columns, demand.columns)),
    );
    if (candidate) this.durableDemand.add(candidate.columns, candidate.start, candidate.end);
    return candidate;
  }

  private requestBand(
    datasource: DataSource,
    loadable: SheetwriteStore,
    demand: PendingDemand,
    start: number,
    end: number,
    columns: readonly number[],
  ): void {
    if (columns.length === 0 || start >= end) return;
    const { priority, direction, viewportOrigin, durableOrigin, formulaReadOrigin, attempt } =
      demand;
    const schema = this.schema();
    const bands = this.canonicalBands(columns, schema);
    const id = this.allocateRequestId();
    this.owners.add(columns, start, end, id);

    const revision = this.options.revision();
    const controller = new AbortController();
    const activeRequest: ActiveRequest = {
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
      viewportOrigin,
      formulaReadOrigin,
      durableDemand: durableOrigin,
      priority,
      direction,
      attempt,
      startedAt: this.now(),
      released: false,
    };

    this.activeIds.set(id, activeRequest);
    this.requests.add(activeRequest);
    storeEngine(loadable)?.beginPageRequest();

    const requestedRows = end - start;
    this.telemetry.requests += 1;
    this.telemetry.requestedRows += requestedRows;
    this.telemetry.estimatedRequestedBytes += requestedRows * columns.length * ESTIMATED_CELL_BYTES;
    if (priority === "visible") {
      this.telemetry.visibleRequests += 1;
      this.telemetry.visibleRequestedRows += requestedRows;
    } else {
      this.telemetry.speculativeRequests += 1;
      this.telemetry.speculativeRequestedRows += requestedRows;
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
      this.clearOwned(activeRequest);
      this.visibleWaitStarted.discard(
        activeRequest.columns,
        activeRequest.start,
        activeRequest.end,
      );
      this.finishRequest(activeRequest);
      queueMicrotask(() => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.options.onError(requestWithoutSignal(activeRequest), error);
      });

      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        if (!this.canHydrate(activeRequest, generation)) return;
        const responseColumns = this.validatePage(page, activeRequest);
        if (!this.canHydrate(activeRequest, generation)) return;
        const loadedEnd = page.start + page.rows.length;
        const progressed = page.rows.length > 0 && responseColumns.length > 0;
        if (progressed) {
          loadable.loadPage(activeRequest.sheet, page.start, page.columns, page.rows, (address) =>
            this.options.isCellNewerThan(address, revision),
          );
          if (!this.canHydrate(activeRequest, generation)) return;
          this.loaded.add(responseColumns, page.start, loadedEnd);
          this.recordCompletedWaits(responseColumns, page.start, loadedEnd);
          this.recordFetchTime(this.now() - activeRequest.startedAt);
          this.options.onRowsLoaded();
        }

        if (!this.loaded.covers(activeRequest.start, activeRequest.end, activeRequest.columns)) {
          if (!progressed && activeRequest.attempt >= DATASOURCE_NO_PROGRESS_RETRIES) {
            throw datasourceFailure("Datasource page made no coverage progress");
          }

          this.requeuePartial(activeRequest, progressed ? 0 : activeRequest.attempt + 1);
        }

        this.clearOwned(activeRequest);
      })
      .catch((error: unknown) => {
        if (!this.canHydrate(activeRequest, generation)) return;
        this.clearOwned(activeRequest);
        this.visibleWaitStarted.discard(
          activeRequest.columns,
          activeRequest.start,
          activeRequest.end,
        );
        this.options.onError(requestWithoutSignal(activeRequest), error);
      })
      .finally(() => {
        this.finishRequest(activeRequest);
        if (!this.destroyed && generation === this.generation) this.drainDemand();
      });
  }

  private validatePage(page: DataSourcePage, request: ActiveRequest): readonly number[] {
    if (page?.protocol !== 2 || !Array.isArray(page.rows) || !Array.isArray(page.columns)) {
      throw datasourceFailure("Datasource page must use protocol 2 arrays");
    }

    if (!Number.isSafeInteger(page.start)) {
      throw datasourceFailure("Datasource page start must be a safe integer");
    }

    const loadedEnd = page.start + page.rows.length;
    const currentRowCount = normalizeRowCount(this.options.rowCount(request.sheet));
    if (
      !Number.isSafeInteger(loadedEnd) ||
      page.start < request.start ||
      loadedEnd > request.end ||
      loadedEnd > currentRowCount
    ) {
      throw datasourceFailure("Datasource page rows exceed requested coverage");
    }

    if (this.options.activeSheet() !== request.sheet || this.schema() !== request.schema) {
      throw datasourceFailure("Datasource schema changed while a page was pending");
    }

    const responseColumns: number[] = [];
    const declaredKeys: string[] = [];
    let requestCursor = 0;
    let previousEnd = -1;
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
        band.start < previousEnd
      ) {
        throw datasourceFailure("Datasource page contains malformed column bands");
      }

      while (
        requestCursor < request.bands.length &&
        request.bands[requestCursor]!.end <= band.start
      ) {
        requestCursor += 1;
      }

      const requestedBand = request.bands[requestCursor];
      if (!requestedBand || band.start < requestedBand.start || band.end > requestedBand.end) {
        throw datasourceFailure("Datasource page column coverage exceeds the request");
      }

      for (let offset = 0; offset < band.keys.length; offset += 1) {
        const expected = request.schema.keys[band.start + offset]!;
        if (band.keys[offset] !== expected) {
          throw datasourceFailure("Datasource page column keys do not match the current schema");
        }

        declaredKeys.push(expected);
        responseColumns.push(band.start + offset);
      }

      previousEnd = band.end;
    }

    const declared = new Set(declaredKeys);
    for (const row of page.rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw datasourceFailure("Datasource page rows must be keyed objects");
      }

      const ownKeys = Reflect.ownKeys(row);
      if (ownKeys.length !== declaredKeys.length) {
        throw datasourceFailure("Datasource page row keys do not match declared coverage");
      }

      for (const key of ownKeys) {
        if (typeof key !== "string" || !declared.has(key)) {
          throw datasourceFailure("Datasource page row contains an undeclared key");
        }
      }

      for (const key of declaredKeys) {
        if (!Object.hasOwn(row, key)) {
          throw datasourceFailure("Datasource page row is missing a declared key");
        }
      }
    }

    return responseColumns;
  }

  private canHydrate(request: ActiveRequest, generation: number): boolean {
    return (
      !this.destroyed &&
      !request.released &&
      generation === this.generation &&
      !request.controller.signal.aborted
    );
  }

  private requeuePartial(request: ActiveRequest, attempt: number): void {
    this.retryDemand.push({
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

  private recordCompletedWaits(columns: readonly number[], start: number, end: number): void {
    for (const sample of this.visibleWaitStarted.complete(columns, start, end, this.now())) {
      if (this.visibleWaitDurations.length < DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT) {
        this.visibleWaitDurations.push(sample);
      } else {
        this.visibleWaitDurations[this.visibleWaitSampleCursor] = sample;
        this.visibleWaitSampleCursor =
          (this.visibleWaitSampleCursor + 1) % DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT;
      }
    }
  }

  private recordFetchTime(durationMs: number): void {
    if (this.fetchTimes.length < FETCH_TIME_SAMPLE_LIMIT) {
      this.fetchTimes.push(durationMs);
    } else {
      this.fetchTimes[this.fetchTimeCursor] = durationMs;
      this.fetchTimeCursor = (this.fetchTimeCursor + 1) % FETCH_TIME_SAMPLE_LIMIT;
    }
    const sorted = [...this.fetchTimes].sort((a, b) => a - b);
    const rank = Math.max(0, Math.ceil(sorted.length * FETCH_TIME_PERCENTILE) - 1);
    this.fetchTimeP90Ms = sorted[rank] ?? DATASOURCE_DEFAULT_FETCH_MS;
  }

  /**
   * What to prefetch around the view, and which in-flight speculation is still
   * wanted.
   *
   * Rows look ahead by the distance the view travels during one fetch (the p90
   * of measured fetch times, bounded by where a slowing scroll comes to rest)
   * plus one view of margin, behind a short trailing band. Columns do the same
   * while the view moves mostly sideways. Both share the cell budget of
   * {@link speculativeCellBudget}. In-flight speculation along the path from
   * the trailing band to the end of the lookahead survives; a request the view
   * has passed, or one beyond a lookahead that shrank as the scroll slowed, is
   * cancelled.
   */
  private speculativePlan(
    view: RowBand,
    columns: readonly number[],
    columnRun: RowBand,
    direction: -1 | 1,
  ): SpeculativePlan {
    const plan: SpeculativePlan = { fetch: [], keep: [], landing: false };
    const cellBudget = this.speculativeCellBudget();
    const rows = this.planRows(plan, view, columns, columnRun, direction, cellBudget);
    this.planColumns(plan, view, rows.path, columnRun, cellBudget - rows.cells);
    return plan;
  }

  /** Adds the rows ahead of and behind the view to `plan`; returns the cells they take. */
  private planRows(
    plan: SpeculativePlan,
    view: RowBand,
    columns: readonly number[],
    columnRun: RowBand,
    direction: -1 | 1,
    cellBudget: number,
  ): { cells: number; path: RowBand } {
    const bandRows = view.end - view.start;
    const horizonRows = Math.min(
      DATASOURCE_PREFETCH_MAX_ROWS,
      Math.floor(cellBudget / Math.max(1, columns.length)),
    );
    if (horizonRows <= 0) return { cells: 0, path: view };

    // A view that moves more than its height per frame (a scrollbar drag) shows only a
    // sliver of the rows it crosses, so rows along the way are not worth a fetch: only the
    // predicted resting point is, once the scroll is slowing down.
    const rowSpeed = Math.abs(this.rowMotion.velocity);
    const skipping = rowSpeed * LOGICAL_FRAME_MS > bandRows;
    const travel = skipping
      ? this.rowMotion.restDistance()
      : this.rowMotion.travel(this.fetchTimeP90Ms);
    // Before any motion, the first view looks two views ahead.
    const margin = this.rowMotion.direction === 0 ? 2 * bandRows : bandRows;
    const ahead = lookaheadSpan(
      view,
      direction,
      Number.isFinite(travel) ? travel : 0,
      margin,
      bandRows,
      this.rowCount,
    );
    if (skipping && !Number.isFinite(travel)) ahead.end = ahead.start;
    plan.landing = skipping || ahead.landing;

    const behindRows = plan.landing
      ? 0
      : Math.min(Math.floor(horizonRows * BEHIND_SHARE), Math.max(1, Math.ceil(bandRows / 2)));
    let behind: RowBand;
    if (direction > 0) {
      const behindEnd = Math.floor(view.start / bandRows) * bandRows;
      behind = { start: Math.max(0, behindEnd - behindRows), end: behindEnd };
      ahead.end = Math.min(ahead.end, ahead.start + horizonRows - (behind.end - behind.start));
    } else {
      const behindStart = Math.min(this.rowCount, Math.ceil(view.end / bandRows) * bandRows);
      behind = { start: behindStart, end: Math.min(this.rowCount, behindStart + behindRows) };
      ahead.start = Math.max(ahead.start, ahead.end - horizonRows + (behind.end - behind.start));
    }

    // On a diagonal scroll, each band of rows ahead is fetched for the columns the view will
    // show when that band comes into view.
    for (let offset = 0; offset < ahead.end - ahead.start; offset += bandRows) {
      const start =
        direction > 0 ? ahead.start + offset : Math.max(ahead.start, ahead.end - offset - bandRows);
      const end = direction > 0 ? Math.min(ahead.end, start + bandRows) : ahead.end - offset;
      const distance = direction > 0 ? start - view.end : view.start - end;
      const arrivesInMs = rowSpeed > 0 ? (Math.max(0, distance) + bandRows / 2) / rowSpeed : 0;
      const bandColumns = this.columnsAfter(columns, columnRun, arrivesInMs);
      plan.fetch.push({ start, end, columns: bandColumns });
      if (bandColumns !== columns) plan.keep.push({ start, end, columns: bandColumns });
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
   * for the visible rows, within `cellBudget`. During a diagonal fling the
   * visible rows leave before those columns arrive, so none are fetched. They
   * stay wanted while their rows are on the rows' `path`.
   */
  private planColumns(
    plan: SpeculativePlan,
    view: RowBand,
    path: RowBand,
    columnRun: RowBand,
    cellBudget: number,
  ): void {
    const velocity = this.columnMotion.velocity;
    const bandRows = view.end - view.start;
    const columnExtent = columnRun.end - columnRun.start;
    const columnCap = Math.floor(cellBudget / Math.max(1, bandRows));
    const sideways =
      Math.abs(velocity) / Math.max(1, columnExtent) >
      Math.abs(this.rowMotion.velocity) / Math.max(1, bandRows);
    if (
      this.options.datasource?.capabilities.columns !== "windowed" ||
      velocity === 0 ||
      !sideways ||
      columnCap <= 0
    ) {
      return;
    }
    const direction: -1 | 1 = velocity > 0 ? 1 : -1;
    const ahead = lookaheadSpan(
      columnRun,
      direction,
      this.columnMotion.travel(this.fetchTimeP90Ms),
      Math.ceil(columnExtent * COLUMN_MARGIN_SHARE),
      1,
      this.schema().keys.length,
    );
    if (direction > 0) ahead.end = Math.min(ahead.end, ahead.start + columnCap);
    else ahead.start = Math.max(ahead.start, ahead.end - columnCap);
    if (ahead.start >= ahead.end) return;
    plan.fetch.push({ ...view, columns: columnRange(ahead.start, ahead.end) });
    plan.keep.push({
      ...path,
      columns: columnRange(
        Math.min(columnRun.start, ahead.start),
        Math.max(columnRun.end, ahead.end),
      ),
    });
  }

  /**
   * The view's columns `durationMs` from now: the scrolling run moved by its
   * sideways travel, frozen columns in place. The same array while the view
   * does not move sideways.
   */
  private columnsAfter(
    columns: readonly number[],
    run: RowBand,
    durationMs: number,
  ): readonly number[] {
    const velocity = this.columnMotion.velocity;
    if (velocity === 0 || this.options.datasource?.capabilities.columns !== "windowed") {
      return columns;
    }
    const extent = run.end - run.start;
    const shift = Math.round(Math.sign(velocity) * this.columnMotion.travel(durationMs));
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
  private speculativeCellBudget(): number {
    const byteBound = Math.floor(DATASOURCE_PREFETCH_MAX_BYTES / ESTIMATED_CELL_BYTES);
    const loadable = this.options.loadable;
    if (!loadable?.isPaged(this.options.activeSheet())) return byteBound;
    const cacheBytes = storeEngine(loadable)?.pagedCacheBytes();
    if (cacheBytes === undefined) return byteBound;
    const view = this.lastViewport;
    const viewCells = view ? (view.end - view.start) * view.columns.length : 0;
    const budgetCells = Math.floor(cacheBytes / ESTIMATED_CELL_BYTES) - viewCells;
    return Math.max(0, Math.min(byteBound, budgetCells));
  }

  private remainingSpeculativeRows(columnCount: number): number {
    const active = new SparseIntervals();
    for (const request of this.requests) {
      if (request.speculativeOrigin) active.add(request.start, request.end);
    }
    const horizonRows = Math.min(
      DATASOURCE_PREFETCH_MAX_ROWS,
      Math.floor(this.speculativeCellBudget() / Math.max(1, columnCount)),
    );
    return Math.max(0, horizonRows - active.length);
  }

  /**
   * Align the known loaded bands with what the paged store actually holds.
   *
   * A row band the store holds in full is added outright. Otherwise one span
   * call per column returns the loaded runs, and every band row outside a run is
   * dropped — one call per column instead of a call per probed row band. A store
   * that exposes no engine (a stand-in implementing the public surface only)
   * keeps the row-band probe.
   */
  private refreshPagedResidency(
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
          this.probeLoadedResidency(loadable, sheet, column, band.start, band.end);
        else this.retainLoadedRuns(column, band.start, band.end, spans);
      }
    }
  }

  /**
   * Drop the rows of `[start, end)` the store does not hold, by asking it about
   * one row band at a time. Used when no engine is registered.
   */
  private probeLoadedResidency(
    loadable: SheetwriteStore,
    sheet: SheetId,
    column: number,
    start: number,
    end: number,
  ): void {
    if (loadable.areColumnsFullyLoaded(sheet, start, end, this.singletonColumns(column))) return;
    if (end - start === 1) {
      this.loaded.removeColumn(column, start, end);
      return;
    }
    const middle = start + Math.floor((end - start) / 2);
    this.probeLoadedResidency(loadable, sheet, column, start, middle);
    this.probeLoadedResidency(loadable, sheet, column, middle, end);
  }

  private singletonColumns(column: number): readonly number[] {
    const schema = this.schema();
    let singleton = schema.singletonIndices.get(column);
    if (!singleton) {
      singleton = Object.freeze([column]);
      schema.singletonIndices.set(column, singleton);
    }
    return singleton;
  }

  /** Drop every row of `[start, end)` that the ascending `spans` pairs miss. */
  private retainLoadedRuns(column: number, start: number, end: number, spans: Uint32Array): void {
    let cursor = start;
    for (let index = 0; index < spans.length; index += 2) {
      const spanStart = spans[index];
      const spanEnd = spans[index + 1];
      if (spanStart === undefined || spanEnd === undefined) {
        throw new Error("Sheetwrite: loaded row spans are not a pair sequence");
      }
      if (spanEnd <= cursor) continue;
      if (spanStart >= end) break;
      if (spanStart > cursor) this.loaded.removeColumn(column, cursor, Math.min(spanStart, end));
      cursor = Math.min(spanEnd, end);
      if (cursor >= end) return;
    }
    if (cursor < end) this.loaded.removeColumn(column, cursor, end);
  }

  private cancelObsoleteSpeculation(
    viewport: RowBand & { columns: readonly number[] },
    keep: readonly ColumnRectangle[],
    formulaReads: readonly PendingDemand[],
    reason: "obsolete" | "reversal" | "jump",
    cancelGeneration: boolean,
  ): void {
    this.retryDemand = this.retryDemand.filter(
      (demand) =>
        demand.durableOrigin ||
        (demand.formulaReadOrigin &&
          formulaReads.some(
            (read) => rowsIntersect(demand, read) && columnsIntersect(demand.columns, read.columns),
          )) ||
        (rowsIntersect(demand, viewport) && columnsSubset(demand.columns, viewport.columns)),
    );
    for (const request of [...this.requests]) {
      if (request.durableDemand) continue;
      if (request.formulaReadOrigin) {
        const stillRead = formulaReads.some(
          (read) => rowsIntersect(request, read) && columnsIntersect(request.columns, read.columns),
        );
        if (!stillRead) this.abortRequest(request, reason);
        continue;
      }

      const intersectsViewport =
        rowsIntersect(request, viewport) && columnsSubset(request.columns, viewport.columns);
      if (request.speculativeOrigin) {
        if (intersectsViewport) continue;
        const stillWanted = keep.some(
          (rectangle) =>
            request.start >= rectangle.start &&
            request.end <= rectangle.end &&
            sharedColumns(request.columns, rectangle.columns) >=
              KEEP_COLUMN_SHARE * request.columns.length,
        );
        if (!cancelGeneration && stillWanted) {
          request.priority = "speculative";
          continue;
        }

        this.abortRequest(request, reason);
        continue;
      }

      if (request.viewportOrigin) {
        const requestRows = request.end - request.start;
        const currentRows = viewport.end - viewport.start;
        const oversized =
          requestRows >
          Math.max(DATASOURCE_PREFETCH_MAX_ROWS, currentRows * DATASOURCE_PREFETCH_MAX_BANDS);
        if (!intersectsViewport || oversized) this.abortRequest(request, reason);
      }
    }
  }

  private abortRequest(request: ActiveRequest, reason: AbortReason): void {
    if (request.released) return;
    request.controller.abort();
    this.clearOwned(request);
    this.visibleWaitStarted.discard(request.columns, request.start, request.end);
    this.finishRequest(request);
    this.telemetry.aborts += 1;
    if (reason === "reversal") this.telemetry.reversalAborts += 1;
    else if (reason === "jump") this.telemetry.jumpAborts += 1;
    else if (reason === "reset") this.telemetry.resetAborts += 1;
    else if (reason === "destroy") this.telemetry.destroyAborts += 1;
  }

  private clearOwned(request: ActiveRequest): void {
    this.owners.remove(request.id, request.columns);
  }

  private finishRequest(request: ActiveRequest): void {
    if (request.released) return;
    request.released = true;
    this.requests.delete(request);
    this.activeIds.delete(request.id);
    if (this.options.loadable) storeEngine(this.options.loadable)?.endPageRequest();
    request.releaseRevision();
  }

  private allocateRequestId(): number {
    for (;;) {
      const id = this.nextRequestId;
      this.nextRequestId = id === 0xffff_ffff ? 1 : id + 1;
      if (!this.activeIds.has(id)) return id;
    }
  }

  private now(): number {
    return (
      this.options.now?.() ??
      datasourceClockForTest?.() ??
      globalThis.performance?.now() ??
      Date.now()
    );
  }
}
