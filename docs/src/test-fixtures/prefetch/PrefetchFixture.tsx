import type {
  RendererPrefetchRepetition,
  RendererPrefetchReport,
} from "@docs/lib/prefetch-report.js";
import type {
  DataSourceColumnBand,
  DataSourcePage,
  Grid,
  RowData,
  Workbook,
} from "@sheetwrite/core";
import { createGrid, initSheetwrite, type SheetwriteStore } from "@sheetwrite/core";
import { installDatasourceClockForTest } from "@sheetwrite/core/testing";

import "@sheetwrite/core/styles.css";
import { createSignal, onCleanup, onMount } from "solid-js";

const FRAME_MS = 16.7;
const SOURCE_LATENCY_MS = 90;
const VIEWPORT_ROWS = 20;
const ROW_HEIGHT = 20;
const REPETITIONS = 5;
const CACHE_BYTES = 12 * 1024;
const COLUMN_COUNT = 6;
const TRACE_BANDS: readonly DataSourceColumnBand[] = [
  {
    start: 0,
    end: COLUMN_COUNT,
    keys: Array.from({ length: COLUMN_COUNT }, (_, column) => `c${column}`),
  },
];
const REQUEST_MULTIPLIER_LIMIT = 3;
const ACTIVE_REQUEST_LIMIT = 6;

declare global {
  interface Window {
    __sheetwriteRunPrefetchTrace?: () => Promise<RendererPrefetchReport>;
  }
}

interface ScheduledTask {
  at: number;
  sequence: number;
  run: () => void;
  cancelled: boolean;
}

class LogicalClock {
  now = 0;
  private sequence = 0;
  private readonly tasks: ScheduledTask[] = [];

  schedule(run: () => void): () => void {
    const task: ScheduledTask = {
      at: this.now + SOURCE_LATENCY_MS,
      sequence: this.sequence++,
      run,
      cancelled: false,
    };
    this.tasks.push(task);
    this.tasks.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
    return () => {
      task.cancelled = true;
    };
  }

  async advance(milliseconds: number): Promise<void> {
    const target = this.now + milliseconds;
    for (;;) {
      const task = this.tasks.find((candidate) => !candidate.cancelled && candidate.at <= target);
      if (!task) break;
      task.cancelled = true;
      this.now = task.at;
      task.run();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.now = target;
    await Promise.resolve();
    await Promise.resolve();
  }
}

function trace_workbook(): Workbook {
  return {
    activeSheet: "trace",
    sheets: [
      {
        id: "trace",
        name: "Trace",
        rowCount: 5_000,
        columns: Array.from({ length: COLUMN_COUNT }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 92,
          type: column === 0 ? ("number" as const) : ("text" as const),
        })),
      },
    ],
  };
}

function trace_value(key: string, row: number): RowData[string] {
  switch (key) {
    case "c0":
      return row;
    case "c1":
      return `sensor-${row % 97}`;
    case "c2":
      return `region-${row % 5}`;
    case "c3":
      return `status-${row % 3}`;
    case "c4":
      return `payload-${row}`;
    case "c5":
      return `checksum-${Math.imul(row + 1, 2654435761) >>> 0}`;
    default:
      return null;
  }
}

function rows(start: number, end: number, columns: readonly DataSourceColumnBand[]): RowData[] {
  const keys = columns.flatMap((band) => band.keys);
  return Array.from({ length: end - start }, (_, offset) => {
    const row = start + offset;
    const page_row: RowData = {};
    for (const key of keys) page_row[key] = trace_value(key, row);
    return page_row;
  });
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function install_controlled_animation_frames(): () => void {
  const original_request = globalThis.requestAnimationFrame;
  const original_cancel = globalThis.cancelAnimationFrame;
  let next_frame = 1;
  // The trace explicitly refreshes each frame; compositor callbacks must not race its logical clock.
  globalThis.requestAnimationFrame = () => next_frame++;
  globalThis.cancelAnimationFrame = () => undefined;
  return () => {
    globalThis.requestAnimationFrame = original_request;
    globalThis.cancelAnimationFrame = original_cancel;
  };
}

async function run_repetition(repetition: number): Promise<RendererPrefetchRepetition> {
  const clock = new LogicalClock();
  const restore_datasource_clock = installDatasourceClockForTest(() => clock.now);
  const restore_animation_frames = install_controlled_animation_frames();
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:640px;height:427px;contain:strict;";
  document.body.append(host);
  let grid: Grid | null = null;
  let requests = 0;
  let requested_rows = 0;
  let rows_served = 0;
  let bytes_served = 0;
  let aborts = 0;
  const active_requests = new Set<AbortSignal>();
  let peak_active_requests = 0;

  try {
    const mounted = createGrid(host, {
      workbook: trace_workbook(),
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows({ start, end, columns, signal }) {
          requests += 1;
          requested_rows += end - start;
          active_requests.add(signal);
          const result = Promise.withResolvers<DataSourcePage>();
          const cancel = clock.schedule(() => {
            const page_rows = rows(start, end, columns);
            rows_served += page_rows.length;
            bytes_served += new TextEncoder().encode(JSON.stringify(page_rows)).byteLength;
            active_requests.delete(signal);
            result.resolve({ protocol: 2, start, columns, rows: page_rows });
          });
          signal.addEventListener(
            "abort",
            () => {
              cancel();
              active_requests.delete(signal);
              aborts += 1;
              result.reject(new DOMException("Logical datasource request aborted", "AbortError"));
            },
            { once: true },
          );
          return result.promise;
        },
      },
      datasourceStorage: { mode: "paged", chunkRows: VIEWPORT_ROWS, cacheBytes: CACHE_BYTES },
      overscan: 0,
      config: { toolbar: false, tabs: false },
      theme: { rowHeight: ROW_HEIGHT, headerHeight: 28, rowHeaderWidth: 48 },
    });
    grid = mounted;
    const store = mounted.store as SheetwriteStore;
    const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!scroller) throw new Error("Prefetch fixture did not mount its scroller");
    let visible = { start: 0, end: VIEWPORT_ROWS };
    const unsubscribe = grid.on("scroll", ({ firstRow: first_row, lastRow: last_row }) => {
      visible = { start: first_row, end: last_row + 1 };
    });
    const render_at = (row: number): boolean => {
      scroller.scrollTop = row * ROW_HEIGHT;
      mounted.refresh();
      peak_active_requests = Math.max(peak_active_requests, active_requests.size);
      return store.isRangeFullyLoaded({
        sheet: "trace",
        start: { row: visible.start, col: 0 },
        end: { row: visible.end - 1, col: COLUMN_COUNT - 1 },
      });
    };

    render_at(0);
    await clock.advance(SOURCE_LATENCY_MS);
    render_at(0);
    let visible_start = VIEWPORT_ROWS / 2;
    render_at(visible_start);
    await clock.advance(SOURCE_LATENCY_MS);
    render_at(visible_start);

    // Excluded warm-up: the fixed viewport and its two real aligned look-ahead bands are resident.
    const warm = {
      requests,
      requestedRows: requested_rows,
      rowsServed: rows_served,
      bytesServed: bytes_served,
      aborts,
    };
    const waits: number[] = [];
    const demanded_rows = new Set<number>();
    let wait_started: number | null = null;
    let measured_frames = 0;
    let resident_frames = 0;
    const measure = (is_resident: boolean) => {
      measured_frames += 1;
      for (let row = visible.start; row < visible.end; row++) demanded_rows.add(row);
      if (is_resident) {
        resident_frames += 1;
        if (wait_started !== null) {
          waits.push(clock.now - wait_started);
          wait_started = null;
        }
      } else if (wait_started === null) {
        wait_started = clock.now;
      }
    };

    for (let frame = 0; frame < 40; frame++) {
      await clock.advance(FRAME_MS);
      visible_start += VIEWPORT_ROWS / 4;
      measure(render_at(visible_start));
    }
    await clock.advance(FRAME_MS);
    measure(render_at(visible_start));
    for (let frame = 0; frame < 8; frame++) {
      await clock.advance(FRAME_MS);
      visible_start -= VIEWPORT_ROWS / 4;
      measure(render_at(visible_start));
    }
    const steady = {
      requests,
      requestedRows: requested_rows,
      rowsServed: rows_served,
      bytesServed: bytes_served,
      aborts,
    };
    const demanded_start = Math.min(...demanded_rows);
    const demanded_end = Math.max(...demanded_rows) + 1;
    const demanded_bytes = new TextEncoder().encode(
      JSON.stringify(rows(demanded_start, demanded_end, TRACE_BANDS)),
    ).byteLength;

    visible_start = 3_000;
    const jump_visible_resident_before_response = render_at(visible_start);
    const aborts_after_jump = aborts;
    await clock.advance(SOURCE_LATENCY_MS);
    const jump_visible_resident_after_response = render_at(visible_start);
    const cache = store.getPagedStats("trace");
    unsubscribe();

    const measured_requested_rows = steady.requestedRows - warm.requestedRows;
    const measured_rows_served = steady.rowsServed - warm.rowsServed;
    const measured_bytes_served = steady.bytesServed - warm.bytesServed;
    return {
      repetition,
      residencyRatio: resident_frames / measured_frames,
      p95VisibleWaitMs: percentile(waits, 0.95),
      measuredFrames: measured_frames,
      residentFrames: resident_frames,
      requests: steady.requests - warm.requests,
      requestedRows: measured_requested_rows,
      rowsServed: measured_rows_served,
      bytesServed: measured_bytes_served,
      requestedRowMultiplier: measured_requested_rows / demanded_rows.size,
      servedByteMultiplier: demanded_bytes === 0 ? 0 : measured_bytes_served / demanded_bytes,
      reversalAborts: steady.aborts - warm.aborts,
      jumpAborts: aborts_after_jump - steady.aborts,
      cacheAllocatedBytes: cache.allocatedBytes,
      cacheChunks: cache.chunks,
      peakActiveRequests: peak_active_requests,
      jumpVisibleResidentBeforeResponse: jump_visible_resident_before_response,
      jumpVisibleResidentAfterResponse: jump_visible_resident_after_response,
    };
  } finally {
    grid?.destroy();
    host.remove();
    restore_animation_frames();
    restore_datasource_clock();
  }
}

async function run_renderer_prefetch_trace(): Promise<RendererPrefetchReport> {
  await initSheetwrite();
  const repetitions: RendererPrefetchRepetition[] = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
    repetitions.push(await run_repetition(repetition));
  }
  return {
    policy: {
      sourceLatencyMs: SOURCE_LATENCY_MS,
      frameMs: FRAME_MS,
      viewportRows: VIEWPORT_ROWS,
      velocityWindowsPerFrame: 0.25,
      requestMultiplierLimit: REQUEST_MULTIPLIER_LIMIT,
      activeRequestLimit: ACTIVE_REQUEST_LIMIT,
      cacheBytes: CACHE_BYTES,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
    repetitions,
    medianResidencyRatio: percentile(
      repetitions.map((result) => result.residencyRatio),
      0.5,
    ),
    medianP95VisibleWaitMs: percentile(
      repetitions.map((result) => result.p95VisibleWaitMs),
      0.5,
    ),
  };
}

/** Exposes the renderer trace only after the island has mounted in the browser. */
export function PrefetchFixture() {
  const [is_ready, set_is_ready] = createSignal(false);
  onMount(() => {
    window.__sheetwriteRunPrefetchTrace = run_renderer_prefetch_trace;
    set_is_ready(true);
    onCleanup(() => {
      delete window.__sheetwriteRunPrefetchTrace;
    });
  });
  return <main data-testid="prefetch-fixture" data-ready={is_ready() || undefined} />;
}
