/**
 * Scroll-trace prefetch benchmark (#703).
 *
 * Replays four scroll traces against the real `DatasourceController` and a
 * paged `SheetwriteStore`. A simulated datasource answers each request after a
 * fixed fetch time (20, 100 or 300 ms, with deterministic jitter). Time is
 * logical, so the loading and never-shown counts are exact and identical on
 * every machine; only the controller CPU time per viewport update is measured
 * on the wall clock.
 *
 * The traces are scroll positions sampled once per animation frame, generated
 * from fixed input models so every run sees the same input:
 * - wheel: bursts of 100 px notches with the browser's smooth-scroll easing;
 * - fling: trackpad flings (finger ramp, then exponential momentum), including
 *   one diagonal and one horizontal fling;
 * - drag: a scrollbar thumb dragged in whole pixels (about 285 rows per pixel);
 * - page: Page Down presses, a held Page Down key repeat, then Page Up presses.
 * Each trace replays at five speeds, 0.8× to 1.25× (see `TRACE_SPEEDS`), and the
 * rows add up all five.
 *
 * Per trace and fetch time it reports how long visible cells show loading
 * (per cell and visibility episode, p50, p95 and mean, and the cell-seconds of
 * loading in all), how many fetched rows are never shown (fetched cells never
 * on screen over the eight-column view width), and the controller's CPU time
 * per viewport update.
 */
import { DatasourceController } from "../../packages/core/src/datasource-controller.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type {
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
  RowData,
  Workbook,
} from "../../packages/core/src/types.js";
import { quantile } from "./stats.js";

const FRAME_MS = 16.7;
const ROW_HEIGHT_PX = 24;
const COLUMN_WIDTH_PX = 120;
const VIEW_HEIGHT_PX = 720;
const VIEW_WIDTH_PX = 960;
const ROW_COUNT = 200_000;
const COLUMN_COUNT = 60;
const CHUNK_ROWS = 256;
const CACHE_BYTES = 8 * 1024 * 1024;
const MAX_SCROLL_TOP_PX = ROW_COUNT * ROW_HEIGHT_PX - VIEW_HEIGHT_PX;
const MAX_SCROLL_LEFT_PX = COLUMN_COUNT * COLUMN_WIDTH_PX - VIEW_WIDTH_PX;
/** Columns a frame shows at scrollLeft 0: eight whole columns. */
const VISIBLE_COLUMNS = Math.ceil(VIEW_WIDTH_PX / COLUMN_WIDTH_PX);
/** Logical time after the last input frame, so slow fetches can finish. */
const SETTLE_MS = 1_500;
export const FETCH_TIMES_MS = [20, 100, 300] as const;
export const TRACE_IDS = ["wheel", "fling", "drag", "page"] as const;
export type TraceId = (typeof TRACE_IDS)[number];

/** Fetch time jitter: uniform 0.7–1.3 of the nominal time, and one request in ten 1.8×. */
const JITTER_LOW = 0.7;
const JITTER_SPAN = 0.6;
const SLOW_REQUEST_EVERY = 10;
const SLOW_REQUEST_FACTOR = 1.8;

interface ScrollPosition {
  readonly top: number;
  readonly left: number;
}

function clampTop(top: number): number {
  return Math.min(MAX_SCROLL_TOP_PX, Math.max(0, top));
}

/** A starting point away from the sheet edges, so every trace can move both ways. */
const START_TOP_PX = 40_000 * ROW_HEIGHT_PX;

// --- Traces ------------------------------------------------------------------

/** Wheel notch size and Chrome-like smooth-scroll easing time constant. */
const WHEEL_NOTCH_PX = 100;
const WHEEL_EASING_MS = 40;
/** [notches (negative scrolls up), interval between notches, pause after the burst] */
const WHEEL_BURSTS: readonly (readonly [number, number, number])[] = [
  [8, 45, 350],
  [12, 35, 500],
  [-5, 60, 400],
  [15, 30, 300],
  [6, 50, 600],
];

function wheelTrace(speed: number): ScrollPosition[] {
  const notchTimes: { at: number; delta: number }[] = [];
  let at = 0;
  for (const [notches, interval, pause] of WHEEL_BURSTS) {
    const delta = Math.sign(notches) * WHEEL_NOTCH_PX;
    for (let notch = 0; notch < Math.abs(notches); notch++) {
      notchTimes.push({ at, delta });
      at += interval / speed;
    }
    at += pause;
  }
  const frames: ScrollPosition[] = [];
  let target = START_TOP_PX;
  let top = START_TOP_PX;
  let next = 0;
  for (let time = 0; time <= at; time += FRAME_MS) {
    for (let notch = notchTimes[next]; notch && notch.at <= time; notch = notchTimes[++next]) {
      target = clampTop(target + notch.delta);
    }
    top += (target - top) * (1 - Math.exp(-FRAME_MS / WHEEL_EASING_MS));
    frames.push({ top: Math.round(top), left: 0 });
  }
  return frames;
}

/** Finger phase length, momentum time constant and stop speed of a trackpad fling. */
const FLING_RAMP_MS = 120;
const FLING_MOMENTUM_MS = 325;
const FLING_STOP_PX_PER_MS = 0.02;
/** [peak vertical speed px/ms (negative is up), horizontal speed px/ms, pause after] */
const FLINGS: readonly (readonly [number, number, number])[] = [
  [6, 0, 500],
  [14, 0, 400],
  [-10, 0, 400],
  [24, 8, 400],
  [0, 8, 400],
  [18, 0, 600],
];

function flingTrace(speed: number): ScrollPosition[] {
  const frames: ScrollPosition[] = [];
  let top = START_TOP_PX;
  let left = 0;
  for (const [vertical, horizontal, pause] of FLINGS) {
    const peak = Math.max(Math.abs(vertical), Math.abs(horizontal));
    for (let time = 0; ; time += FRAME_MS) {
      const scale =
        time < FLING_RAMP_MS
          ? time / FLING_RAMP_MS
          : Math.exp(-(time - FLING_RAMP_MS) / FLING_MOMENTUM_MS);
      if (time >= FLING_RAMP_MS && peak * scale < FLING_STOP_PX_PER_MS) break;
      top = clampTop(top + vertical * speed * scale * FRAME_MS);
      left = Math.min(
        MAX_SCROLL_LEFT_PX,
        Math.max(0, left + horizontal * speed * scale * FRAME_MS),
      );
      frames.push({ top: Math.round(top), left: Math.round(left) });
    }
    for (let time = 0; time < pause; time += FRAME_MS) {
      frames.push({ top: Math.round(top), left: Math.round(left) });
    }
  }
  return frames;
}

/** Scrollbar geometry: a 700 px track. */
const SCROLLBAR_TRACK_PX = 700;
const DRAG_START_THUMB_PX = 140;
/** [thumb travel px (negative is up), drag time ms, hold time ms] */
const DRAGS: readonly (readonly [number, number, number])[] = [
  [180, 900, 600],
  [20, 700, 500],
  [-80, 600, 600],
];

function dragTrace(speed: number): ScrollPosition[] {
  const frames: ScrollPosition[] = [];
  const contentPerThumbPx = MAX_SCROLL_TOP_PX / SCROLLBAR_TRACK_PX;
  let from = DRAG_START_THUMB_PX;
  for (const [travel, dragMs, holdMs] of DRAGS) {
    let thumb = from;
    for (let time = 0; time <= dragMs; time += FRAME_MS) {
      const progress = Math.min(1, time / dragMs);
      const eased = progress * progress * (3 - 2 * progress);
      thumb = Math.round(from + travel * speed * eased);
      frames.push({ top: clampTop(thumb * contentPerThumbPx), left: 0 });
    }
    from = thumb;
    const resting = frames.at(-1) ?? { top: 0, left: 0 };
    for (let time = 0; time < holdMs; time += FRAME_MS) frames.push(resting);
  }
  return frames;
}

/** Page Down moves one view minus one row. */
const PAGE_PX = VIEW_HEIGHT_PX - ROW_HEIGHT_PX;
const PAGE_PRESS_INTERVAL_MS = 300;
const KEY_REPEAT_DELAY_MS = 500;
const KEY_REPEAT_INTERVAL_MS = 33;
/** [pages per press (negative is Page Up), presses, interval ms, pause after ms] */
const PAGE_PHASES: readonly (readonly [number, number, number, number])[] = [
  [1, 8, PAGE_PRESS_INTERVAL_MS, 700],
  [1, 1, KEY_REPEAT_DELAY_MS, 0],
  [1, 20, KEY_REPEAT_INTERVAL_MS, 600],
  [-1, 4, PAGE_PRESS_INTERVAL_MS, 600],
];

function pageTrace(speed: number): ScrollPosition[] {
  const presses: { at: number; delta: number }[] = [];
  let at = 0;
  for (const [pages, count, interval, pause] of PAGE_PHASES) {
    for (let press = 0; press < count; press++) {
      presses.push({ at, delta: pages * PAGE_PX });
      at += interval / speed;
    }
    at += pause;
  }
  const frames: ScrollPosition[] = [];
  let top = START_TOP_PX;
  let next = 0;
  for (let time = 0; time <= at; time += FRAME_MS) {
    for (let press = presses[next]; press && press.at <= time; press = presses[++next]) {
      top = clampTop(top + press.delta);
    }
    frames.push({ top, left: 0 });
  }
  return frames;
}

/**
 * Each trace replays at these multiples of its recorded speed (wheel notch and
 * key rates, fling speeds, drag distances), so one lucky or unlucky stop does
 * not decide a row.
 */
const TRACE_SPEEDS = [0.8, 0.9, 1, 1.1, 1.25] as const;

const TRACE_BUILDERS: Record<TraceId, (speed: number) => ScrollPosition[]> = {
  wheel: wheelTrace,
  fling: flingTrace,
  drag: dragTrace,
  page: pageTrace,
};

// --- Simulation ----------------------------------------------------------------

interface ScheduledFetch {
  readonly id: number;
  readonly at: number;
  readonly run: () => void;
  cancelled: boolean;
}

class LogicalClock {
  now = 0;
  private nextId = 1;
  private readonly fetches: ScheduledFetch[] = [];

  schedule(delayMs: number, run: () => void): () => void {
    const fetch: ScheduledFetch = {
      id: this.nextId++,
      at: this.now + delayMs,
      run,
      cancelled: false,
    };
    this.fetches.push(fetch);
    this.fetches.sort((a, b) => a.at - b.at || a.id - b.id);
    return () => {
      fetch.cancelled = true;
    };
  }

  async advance(milliseconds: number): Promise<void> {
    const target = this.now + milliseconds;
    for (;;) {
      const index = this.fetches.findIndex((fetch) => !fetch.cancelled && fetch.at <= target);
      if (index < 0) break;
      const [fetch] = this.fetches.splice(index, 1);
      if (!fetch) break;
      fetch.cancelled = true;
      this.now = fetch.at;
      fetch.run();
      await settleMicrotasks();
    }
    for (let index = this.fetches.length - 1; index >= 0; index--) {
      if (this.fetches[index]?.cancelled) this.fetches.splice(index, 1);
    }
    this.now = target;
    await settleMicrotasks();
  }
}

const MICROTASK_TURNS = 8;

async function settleMicrotasks(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_TURNS; turn++) await Promise.resolve();
}

const COLUMN_KEYS = Array.from({ length: COLUMN_COUNT }, (_, column) => `c${column}`);
const COLUMNS = COLUMN_KEYS.map((key, column) => ({
  key,
  header: `C${column}`,
  width: COLUMN_WIDTH_PX,
  type: "text" as const,
}));

function workbook(): Workbook {
  return {
    activeSheet: "trace",
    sheets: [
      {
        id: "trace",
        name: "Trace",
        rowCount: ROW_COUNT,
        columns: COLUMNS.map((column) => ({ ...column })),
      },
    ],
  };
}

function pageRows(start: number, end: number, bands: readonly DataSourceColumnBand[]): RowData[] {
  const rows: RowData[] = [];
  for (let row = start; row < end; row++) {
    const values: RowData = {};
    for (const band of bands) for (const key of band.keys) values[key] = `${key}:${row}`;
    rows.push(values);
  }
  return rows;
}

/** Deterministic fetch-time jitter from the request sequence number. */
function fetchDelayMs(nominalMs: number, sequence: number): number {
  const hash = Math.imul(sequence + 1, 2_654_435_761) >>> 0;
  const unit = hash / 0x1_0000_0000;
  const factor = sequence % SLOW_REQUEST_EVERY === SLOW_REQUEST_EVERY - 1 ? SLOW_REQUEST_FACTOR : 1;
  return nominalMs * (JITTER_LOW + JITTER_SPAN * unit) * factor;
}

interface ViewWindow {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
}

function viewWindow(position: ScrollPosition): ViewWindow {
  const rowStart = Math.floor(position.top / ROW_HEIGHT_PX);
  const columnStart = Math.floor(position.left / COLUMN_WIDTH_PX);
  return {
    rowStart,
    rowEnd: Math.min(ROW_COUNT, Math.ceil((position.top + VIEW_HEIGHT_PX) / ROW_HEIGHT_PX)),
    columnStart,
    columnEnd: Math.min(COLUMN_COUNT, Math.ceil((position.left + VIEW_WIDTH_PX) / COLUMN_WIDTH_PX)),
  };
}

function cellKey(row: number, column: number): number {
  return row * COLUMN_COUNT + column;
}

export interface TraceResult {
  readonly trace: TraceId;
  readonly fetchMs: number;
  readonly frames: number;
  /** Visibility episodes of single cells: one per cell per stretch of frames it stays on screen. */
  readonly cellEpisodes: number;
  readonly loadingEpisodes: number;
  readonly loadingP50Ms: number;
  readonly loadingP95Ms: number;
  readonly loadingMeanMs: number;
  /** Cell-milliseconds of loading shown, over the whole trace. */
  readonly loadingCellMs: number;
  readonly fetchedCells: number;
  readonly neverShownCells: number;
  /** Never-shown fetched cells over the eight-column view width. */
  readonly neverShownRows: number;
  readonly fetchedRows: number;
  readonly requests: number;
  readonly abortedRequests: number;
  readonly updates: number;
  readonly updateP50Us: number;
  readonly updateP95Us: number;
}

async function runTrace(trace: TraceId, fetchMs: number): Promise<TraceResult> {
  const episodes: number[] = [];
  const updateUs: number[] = [];
  let loadingCellMs = 0;
  let frameCount = 0;
  let fetchedCells = 0;
  let neverShownCells = 0;
  let requestCount = 0;
  let abortCount = 0;
  for (const speed of TRACE_SPEEDS) {
    const frames = TRACE_BUILDERS[trace](speed);
    const clock = new LogicalClock();
    const store = new SheetwriteStore(workbook(), undefined, {
      storage: "paged",
      chunkRows: CHUNK_ROWS,
      cacheBytes: CACHE_BYTES,
    });
    const servedCells = new Set<number>();
    const shownCells = new Set<number>();
    const pendingSignals = new Set<AbortSignal>();
    let requests = 0;
    let abortedRequests = 0;
    const datasource: DataSource = {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows({ start, end, columns, signal }) {
        const sequence = requests++;
        pendingSignals.add(signal);
        const result = Promise.withResolvers<DataSourcePage>();
        const cancel = clock.schedule(fetchDelayMs(fetchMs, sequence), () => {
          pendingSignals.delete(signal);
          for (const band of columns) {
            for (let column = band.start; column < band.end; column++) {
              for (let row = start; row < end; row++) servedCells.add(cellKey(row, column));
            }
          }
          result.resolve({ protocol: 2, start, columns, rows: pageRows(start, end, columns) });
        });
        signal.addEventListener(
          "abort",
          () => {
            cancel();
            pendingSignals.delete(signal);
            abortedRequests++;
            result.reject(new DOMException("Simulated fetch aborted", "AbortError"));
          },
          { once: true },
        );
        return result.promise;
      },
    };
    let rowsLoaded = false;
    const controller = new DatasourceController(
      {
        datasource,
        loadable: store,
        activeSheet: () => "trace",
        rowCount: () => ROW_COUNT,
        columns: () => COLUMNS,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {
          rowsLoaded = true;
        },
        onError: (_request, error) => {
          throw error;
        },
        now: () => clock.now,
      },
      ROW_COUNT,
    );

    const episodeLoadingMs = new Map<number, number>();
    let previous: ViewWindow | null = null;
    let columnIndices: number[] = [];
    const settleFrames = Math.ceil(SETTLE_MS / FRAME_MS);
    const lastFrame = frames.at(-1) ?? { top: START_TOP_PX, left: 0 };
    frameCount += frames.length + settleFrames;

    for (let frame = 0; frame < frames.length + settleFrames; frame++) {
      if (frame > 0) await clock.advance(FRAME_MS);
      const view = viewWindow(frames[frame] ?? lastFrame);
      const moved =
        previous === null ||
        view.rowStart !== previous.rowStart ||
        view.rowEnd !== previous.rowEnd ||
        view.columnStart !== previous.columnStart ||
        view.columnEnd !== previous.columnEnd;
      if (moved) {
        columnIndices = [];
        for (let column = view.columnStart; column < view.columnEnd; column++) {
          columnIndices.push(column);
        }
      }
      // The grid renders, and so updates the viewport, after a scroll or a page load.
      if (moved || rowsLoaded) {
        rowsLoaded = false;
        const started = performance.now();
        controller.updateViewport(view.rowStart, view.rowEnd, columnIndices);
        updateUs.push((performance.now() - started) * 1_000);
        await settleMicrotasks();
      }

      const visible = new Set<number>();
      for (let row = view.rowStart; row < view.rowEnd; row++) {
        const rowLoaded = store.areColumnsFullyLoaded("trace", row, row + 1, columnIndices);
        for (const column of columnIndices) {
          const key = cellKey(row, column);
          visible.add(key);
          shownCells.add(key);
          const loading =
            !rowLoaded && !store.areColumnsFullyLoaded("trace", row, row + 1, [column]);
          const accumulated = episodeLoadingMs.get(key) ?? 0;
          episodeLoadingMs.set(key, loading ? accumulated + FRAME_MS : accumulated);
          if (loading) loadingCellMs += FRAME_MS;
        }
      }
      for (const [key, loadingMs] of episodeLoadingMs) {
        if (visible.has(key)) continue;
        episodes.push(loadingMs);
        episodeLoadingMs.delete(key);
      }
      previous = view;
    }
    for (const loadingMs of episodeLoadingMs.values()) episodes.push(loadingMs);

    controller.destroy();
    store.dispose();
    if (pendingSignals.size !== 0)
      throw new Error(`${trace}: leaked ${pendingSignals.size} fetches`);

    for (const key of servedCells) if (!shownCells.has(key)) neverShownCells++;
    fetchedCells += servedCells.size;
    requestCount += requests;
    abortCount += abortedRequests;
  }
  const loadingEpisodes = episodes.filter((loadingMs) => loadingMs > 0).length;
  const totalLoadingMs = episodes.reduce((sum, loadingMs) => sum + loadingMs, 0);
  return {
    trace,
    fetchMs,
    frames: frameCount,
    cellEpisodes: episodes.length,
    loadingEpisodes,
    loadingP50Ms: quantile(episodes, 0.5),
    loadingP95Ms: quantile(episodes, 0.95),
    loadingMeanMs: episodes.length === 0 ? 0 : totalLoadingMs / episodes.length,
    loadingCellMs,
    fetchedCells,
    neverShownCells,
    neverShownRows: neverShownCells / VISIBLE_COLUMNS,
    fetchedRows: fetchedCells / VISIBLE_COLUMNS,
    requests: requestCount,
    abortedRequests: abortCount,
    updates: updateUs.length,
    updateP50Us: quantile(updateUs, 0.5),
    updateP95Us: quantile(updateUs, 0.95),
  };
}

export interface ScrollTraceReport {
  readonly benchmark: "scroll-trace-prefetch";
  readonly frameMs: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly viewRows: number;
  readonly viewColumns: number;
  readonly cacheBytes: number;
  readonly results: readonly TraceResult[];
}

export async function runScrollTraceBenchmark(
  traces: readonly TraceId[] = TRACE_IDS,
  fetchTimes: readonly number[] = FETCH_TIMES_MS,
): Promise<ScrollTraceReport> {
  await initSheetwrite();
  const results: TraceResult[] = [];
  for (const trace of traces) {
    for (const fetchMs of fetchTimes) results.push(await runTrace(trace, fetchMs));
  }
  return {
    benchmark: "scroll-trace-prefetch",
    frameMs: FRAME_MS,
    rowCount: ROW_COUNT,
    columnCount: COLUMN_COUNT,
    viewRows: VIEW_HEIGHT_PX / ROW_HEIGHT_PX,
    viewColumns: VISIBLE_COLUMNS,
    cacheBytes: CACHE_BYTES,
    results,
  };
}

export function scrollTraceMarkdown(report: ScrollTraceReport): string {
  const lines = [
    "| trace | fetch ms | loading p50 ms | loading p95 ms | loading mean ms | cells ever loading | loading cell-s | never-shown rows | fetched rows | requests | aborted | update p50 µs | update p95 µs |",
    "|:--|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
  ];
  for (const result of report.results) {
    lines.push(
      `| ${result.trace} | ${result.fetchMs} | ${result.loadingP50Ms.toFixed(1)} | ${result.loadingP95Ms.toFixed(1)} | ${result.loadingMeanMs.toFixed(2)} | ${((100 * result.loadingEpisodes) / Math.max(1, result.cellEpisodes)).toFixed(1)}% | ${(result.loadingCellMs / 1_000).toFixed(1)} | ${result.neverShownRows.toFixed(0)} | ${result.fetchedRows.toFixed(0)} | ${result.requests} | ${result.abortedRequests} | ${result.updateP50Us.toFixed(1)} | ${result.updateP95Us.toFixed(1)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function listOption<T extends string | number>(
  args: readonly string[],
  name: string,
  allowed: readonly T[],
): readonly T[] {
  const value = optionValue(args, name);
  if (value === undefined) return allowed;
  return value.split(",").map((entry) => {
    const match = allowed.find((candidate) => String(candidate) === entry);
    if (match === undefined)
      throw new TypeError(`${name}: ${entry} is not one of ${allowed.join(", ")}`);
    return match;
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const report = await runScrollTraceBenchmark(
    listOption(args, "--traces", TRACE_IDS),
    listOption(args, "--fetch-ms", FETCH_TIMES_MS),
  );
  const output = optionValue(args, "--output");
  if (output !== undefined) await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(scrollTraceMarkdown(report));
}
