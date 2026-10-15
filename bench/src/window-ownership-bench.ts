import "./dom-setup.js";
import {
  createGrid,
  DEFAULT_THEME,
  initSheetwrite,
  SheetwriteStore,
  type Workbook,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { runDatasourcePrefetchBenchmark } from "./datasource-prefetch-bench.js";

const ROW_COUNT = 1_000_000;
const COLUMN_COUNT = 20;
const SCROLL_ITERATIONS = 400;
const READ_ITERATIONS = 2_000;
const PREFETCH_ITERATIONS = 8;
const WARMUPS = 3;
const SAMPLES = 9;
const CHUNK_ROWS = 64;
const CACHE_BYTES = 16 * 1024 * 1024;
const PAINT_ROWS = 20;
const SETTLE_TURNS = 20;
const READ_COLUMNS = 8;
const READ_LOADED_ROWS = 256;
const READ_CYCLE_ROWS = 128;
const OFFSCREEN_MERGE_COUNT = 10_000;
const OFFSCREEN_MERGE_FIRST_ROW = 10_000;
const columns = Array.from({ length: COLUMN_COUNT }, (_, column) => ({
  key: `c${column}`,
  header: `C${column}`,
  type: "number" as const,
  width: 100,
}));
const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Windows",
      rowCount: ROW_COUNT,
      columns,
      merges: Array.from({ length: OFFSCREEN_MERGE_COUNT }, (_, index) => ({
        r0: OFFSCREEN_MERGE_FIRST_ROW + index * 2,
        r1: OFFSCREEN_MERGE_FIRST_ROW + index * 2,
        c0: 0,
        c1: 1,
      })),
    },
  ],
};

await initSheetwrite();
const restoreCanvas = installCanvasTestStubs();
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = (callback) => {
  callback(0);
  return 0;
};
globalThis.cancelAnimationFrame = () => {};
const samples = {
  "paged-scroll": [] as number[],
  "bulk-read": [] as number[],
  prefetch: [] as number[],
};
const residency: Array<{ allocatedBytes: number; chunks: number; loadedCells: number }> = [];
const prefetchEvidence: Array<{ residencyRatio: number; p95VisibleWaitMs: number }> = [];
try {
  for (let sample = -WARMUPS; sample < SAMPLES; sample++) {
    Bun.gc(true);
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
    document.body.appendChild(host);
    const grid = createGrid(host, {
      workbook,
      overscan: 2,
      config: { toolbar: false, tabs: false, find: false, contextMenu: false },
      datasourceStorage: { mode: "paged", chunkRows: CHUNK_ROWS, cacheBytes: CACHE_BYTES },
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: async (request) => ({
          protocol: 2,
          start: request.start,
          revision: request.revision,
          columns: request.columns,
          rows: Array.from({ length: request.end - request.start }, (_, offset) => {
            const row: Record<string, number> = {};
            for (const band of request.columns)
              for (const key of band.keys) row[key] = request.start + offset;
            return row;
          }),
        }),
      },
    });
    try {
      const scroller = host.querySelector(".sheetwrite-scroller");
      if (!(scroller instanceof HTMLElement)) throw new Error("Window benchmark scroller missing");
      for (let turn = 0; turn < SETTLE_TURNS; turn++) await Promise.resolve();
      const started = performance.now();
      for (let iteration = 0; iteration < SCROLL_ITERATIONS; iteration++) {
        scroller.scrollTop = (iteration + 1) * DEFAULT_THEME.rowHeight;
        scroller.dispatchEvent(new Event("scroll"));
        for (let turn = 0; turn < SETTLE_TURNS; turn++) await Promise.resolve();
      }
      const elapsed = (performance.now() - started) / SCROLL_ITERATIONS;
      if (
        grid.store.getCell({ sheet: "s1", row: SCROLL_ITERATIONS, col: 0 }).resolved !==
        SCROLL_ITERATIONS
      ) {
        throw new Error("Window benchmark failed to hydrate its viewport");
      }
      if (!(grid.store instanceof SheetwriteStore))
        throw new Error("Window benchmark store missing");
      if (sample >= 0) {
        samples["paged-scroll"].push(elapsed);
        const stats = grid.store.getPagedStats("s1");
        residency.push({
          allocatedBytes: stats.allocatedBytes,
          chunks: stats.chunks,
          loadedCells: stats.loadedCells,
        });
      }
    } finally {
      grid.destroy();
      host.remove();
    }

    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: CHUNK_ROWS,
      cacheBytes: CACHE_BYTES,
    });
    try {
      const readColumns = Array.from({ length: READ_COLUMNS }, (_, column) => column);
      store.loadPage(
        "s1",
        0,
        [
          {
            start: 0,
            end: READ_COLUMNS,
            keys: columns.slice(0, READ_COLUMNS).map((column) => column.key),
          },
        ],
        Array.from({ length: READ_LOADED_ROWS }, (_, row) =>
          Object.fromEntries(readColumns.map((column) => [`c${column}`, row])),
        ),
      );
      const started = performance.now();
      let checksum = 0;
      for (let iteration = 0; iteration < READ_ITERATIONS; iteration++) {
        const start = iteration % READ_CYCLE_ROWS;
        const view = store.getVisibleWindow("s1", { start, end: start + PAINT_ROWS }, readColumns);
        const value = view.values[0];
        if (typeof value !== "number") throw new Error("Window benchmark bulk read was not loaded");
        checksum += value;
      }
      const elapsed = (performance.now() - started) / READ_ITERATIONS;
      if (checksum <= 0) throw new Error("Window benchmark bulk checksum is empty");
      if (sample >= 0) samples["bulk-read"].push(elapsed);
    } finally {
      store.dispose();
    }

    const started = performance.now();
    for (let iteration = 0; iteration < PREFETCH_ITERATIONS; iteration++) {
      const report = await runDatasourcePrefetchBenchmark();
      if (sample >= 0 && iteration === 0) {
        prefetchEvidence.push({
          residencyRatio: report.medianResidencyRatio,
          p95VisibleWaitMs: report.p95VisibleWaitMs,
        });
      }
    }
    if (sample >= 0) samples.prefetch.push((performance.now() - started) / PREFETCH_ITERATIONS);
  }
  process.stdout.write(
    `${JSON.stringify({
      unit: "ms/operation",
      warmups: WARMUPS,
      rows: ROW_COUNT,
      columns: COLUMN_COUNT,
      offscreenMerges: OFFSCREEN_MERGE_COUNT,
      samples,
      residency,
      prefetchEvidence,
      iterations: {
        scroll: SCROLL_ITERATIONS,
        reads: READ_ITERATIONS,
        prefetch: PREFETCH_ITERATIONS,
      },
    })}\n`,
  );
} finally {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancelRaf;
  restoreCanvas();
}
