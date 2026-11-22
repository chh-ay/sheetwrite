import { beforeAll, describe, expect, it } from "bun:test";

import {
  DATASOURCE_MAX_ACTIVE_REQUESTS,
  DATASOURCE_PREFETCH_MAX_BYTES,
  DATASOURCE_PREFETCH_MAX_ROWS,
  DatasourceController,
  type DatasourceControllerOptions,
} from "../src/datasource-controller.js";
import { initSheetwrite } from "../src/grid.js";
import {
  type LegacyRowLoader,
  type LegacyRowPage,
  legacyFullWidthDataSource,
} from "../src/legacy-full-width-datasource.js";
import { MutationRevisionIndex } from "../src/mutation-revision-index.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  Column,
  DataSource,
  DataSourceColumnBand,
  DataSourceRequest,
  DocumentOp,
  DataSourcePage as ProtocolPage,
  RowData,
} from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

type DataSourcePage = LegacyRowPage;

beforeAll(async () => {
  await initSheetwrite();
});

async function flush_request(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

type LegacyControllerOptions = Partial<Omit<DatasourceControllerOptions, "datasource">> & {
  loadable: SheetwriteStore;
  datasource?: LegacyRowLoader;
  /** Protects cells this index records as newer than a request's revision. */
  revisions?: MutationRevisionIndex;
};

function new_test_controller(
  options: LegacyControllerOptions,
  row_count: number,
): DatasourceController {
  const { datasource, columns, revisions, ...given } = options;
  const rest: Omit<DatasourceControllerOptions, "columns" | "datasource"> = {
    activeSheet: () => "s1",
    rowCount: () => row_count,
    revision: () => 0,
    isCellNewerThan: (address, request_revision) =>
      revisions?.isNewerThan(address, request_revision) ?? false,
    retainRevision: (request_revision) => revisions?.retainRevision(request_revision) ?? (() => {}),
    onRowsLoaded: () => {},
    onError: () => {},
    ...given,
  };
  const schema =
    columns ??
    ((sheet: string) => {
      const workbook = rest.loadable?.getWorkbook();
      const stored = workbook?.sheets.find((candidate) => candidate.id === sheet)?.columns;
      if (Array.isArray(stored)) return stored;
      const length = (stored as { length?: number } | undefined)?.length ?? 1;
      return Array.from({ length }, (_, index) => ({ key: index === 0 ? "name" : `c${index}` }));
    });
  const adapted = datasource ? legacyFullWidthDataSource(datasource) : undefined;
  const windowed = adapted
    ? {
        capabilities: { protocol: 2 as const, columns: "windowed" as const },
        getRows(request: Parameters<typeof adapted.getRows>[0]) {
          const current = schema(request.sheet);
          const keys = current.map((column) => column.key);
          const columns = keys.length === 0 ? [] : [{ start: 0, end: keys.length, keys }];
          return adapted.getRows({ ...request, columns }).then((page) => ({
            ...page,
            columns: request.columns,
            rows: page.rows.map((row) => {
              const normalized: typeof row = Object.create(null) as typeof row;
              for (const band of request.columns) {
                for (const key of band.keys) normalized[key] = row[key]!;
              }
              return normalized;
            }),
          }));
        },
      }
    : undefined;
  return new DatasourceController(
    {
      ...rest,
      columns: schema,
      datasource: windowed,
    },
    row_count,
  );
}

function make_protocol_columns(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `k${index}`,
    header: `K${index}`,
    width: 100,
    type: "text" as const,
  }));
}

function protocol_rows(
  columns: readonly DataSourceColumnBand[],
  start: number,
  end: number,
): RowData[] {
  const keys = columns.flatMap((band) => [...band.keys]);
  return Array.from({ length: end - start }, (_, offset) => {
    const row: RowData = Object.create(null) as RowData;
    for (const key of keys) row[key] = `${key}:${start + offset}`;
    return row;
  });
}

function new_protocol_controller(options: {
  store: SheetwriteStore;
  datasource: DataSource;
  columns: readonly Column[];
  rowCount: number;
  errors?: unknown[];
  onRowsLoaded?: () => void;
}): DatasourceController {
  return new DatasourceController(
    {
      datasource: options.datasource,
      loadable: options.store,
      activeSheet: () => "s1",
      rowCount: () => options.rowCount,
      columns: () => options.columns,
      revision: () => 0,
      isCellNewerThan: () => false,
      retainRevision: () => () => {},
      onRowsLoaded: options.onRowsLoaded ?? (() => {}),
      onError: (_request, error) => options.errors?.push(error),
    },
    options.rowCount,
  );
}

describe("DatasourceController revision retention", () => {
  it("treats edits before a request as part of its revision and still protects later dense clears", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    const requests: Array<PromiseWithResolvers<DataSourcePage>> = [];
    let revision = 1;
    const before: DocumentOp = {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 0 },
      value: { kind: "literal", value: "before request" },
    };
    store.applyTransaction({ patches: [before] });
    revisions.record([before], revision);

    const controller = new_test_controller(
      {
        datasource: () => {
          const request = Promise.withResolvers<DataSourcePage>();
          requests.push(request);
          return request.promise;
        },
        loadable: store,
        revision: () => revision,
        revisions,
      },
      4,
    );

    controller.ensureLoaded(0, 1, [0]);
    const clear: DocumentOp = {
      op: "clearRange",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
      contents: true,
      style: false,
    };
    revision = 2;
    store.applyTransaction({ patches: [clear] });
    revisions.record([clear], revision);
    expect(revisions.stats()).toMatchObject({ points: 0, rectangles: 1 });

    requests[0]!.resolve({ start: 0, rows: [{ name: "stale", amount: 4, city: "old" }] });
    await flush_request();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBeNull();
    expect(revisions.stats().rectangles).toBe(0);

    controller.destroy();
    store.dispose();
  });

  it("releases retained revisions on rejection, synchronous failure, reset, destroy, and abort", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    let mode: "reject" | "throw" | "pending" = "throw";
    const pending: Array<PromiseWithResolvers<DataSourcePage>> = [];
    const errors: unknown[] = [];
    const controller = new_test_controller(
      {
        datasource: () => {
          if (mode === "throw") throw new Error("sync");
          if (mode === "reject") return Promise.reject(new Error("async"));
          const request = Promise.withResolvers<DataSourcePage>();
          pending.push(request);
          return request.promise;
        },
        loadable: store,
        revisions,
        onError: (_request, error) => errors.push(error),
      },
      4,
    );

    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(0);
    controller.reset(4);
    await flush_request();
    expect(errors).toHaveLength(0);

    controller.ensureLoaded(0, 1, [0]);
    await flush_request();
    expect(errors).toHaveLength(1);

    mode = "reject";
    controller.ensureLoaded(0, 1, [0]);
    await flush_request();
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(2);

    mode = "pending";
    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    const reset_signal = pending[0]!.promise;
    controller.reset(4);
    expect(revisions.stats().retainedRequests).toBe(0);
    pending[0]!.resolve({ start: 0, rows: [{ name: "late reset" }] });
    await reset_signal;
    await flush_request();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();

    controller.ensureLoaded(1, 2, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    mode = "throw";
    controller.ensureLoaded(2, 3, [0]);
    controller.destroy();
    expect(revisions.stats().retainedRequests).toBe(0);
    await flush_request();
    expect(errors).toHaveLength(2);
    store.dispose();
  });

  it("starts visible demand before bounded aligned speculation and promotes overlap", async () => {
    const store = new SheetwriteStore(makeWorkbook(100));
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    let now = 0;
    const controller = new_test_controller(
      {
        datasource: (request) => {
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        now: () => now,
      },
      100,
    );

    controller.updateViewport(0, 10, [0]);
    expect(pending.map(({ request }) => [request.start, request.end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
    ]);
    expect(controller.getTelemetry()).toMatchObject({
      visibleRequests: 1,
      speculativeRequests: 2,
      visibleRequestedRows: 10,
      speculativeRequestedRows: 20,
    });

    now = 16.7;
    controller.updateViewport(5, 15, [0]);
    expect(pending).toHaveLength(5);
    expect(controller.getTelemetry().promotions).toBe(1);
    for (let left = 0; left < pending.length; left++) {
      for (let right = left + 1; right < pending.length; right++) {
        const a = pending[left]!.request;
        const b = pending[right]!.request;
        expect(Math.max(a.start, b.start)).toBeGreaterThanOrEqual(Math.min(a.end, b.end));
      }
    }

    for (const entry of pending) {
      entry.result.resolve({
        start: entry.request.start,
        rows: Array.from({ length: entry.request.end - entry.request.start }, (_, offset) => ({
          name: `row-${entry.request.start + offset}`,
        })),
      });
    }
    await flush_request();
    expect(controller.getTelemetry()).toMatchObject({
      measuredFrames: 2,
      residentFrames: 0,
      visibleWaitSamples: 15,
      p95VisibleWaitMs: 16.7,
    });

    controller.destroy();
    store.dispose();
  });

  it("preserves resident rows while refreshing a paged overlap and stays within cache budget", async () => {
    const cache_bytes = 63;
    const workbook = makeWorkbook(20);
    workbook.sheets[0]!.columns = workbook.sheets[0]!.columns.slice(0, 1);
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 1,
      cacheBytes: cache_bytes,
    });
    const requested: Array<[number, number]> = [];
    const controller = new_test_controller(
      {
        datasource: async (request) => {
          requested.push([request.start, request.end]);
          return {
            start: request.start,
            rows: Array.from({ length: request.end - request.start }, (_, offset) => ({
              name: `row-${request.start + offset}`,
            })),
          };
        },
        loadable: store,
      },
      20,
    );

    controller.ensureLoaded(0, 2, [0]);
    await flush_request();
    controller.ensureLoaded(2, 4, [0]);
    await flush_request();
    expect(
      store.isRangeFullyLoaded({
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 1, col: 0 },
      }),
    ).toBe(true);

    controller.ensureLoaded(0, 2, [0]);
    await flush_request();
    expect(requested.at(-1)).toEqual([0, 1]);
    expect(store.getPagedStats("s1").allocatedBytes).toBeLessThanOrEqual(cache_bytes);

    controller.destroy();
    store.dispose();
  });

  it("bounds combined ahead and behind ownership for wide large viewports and sheet edges", () => {
    const workbook = makeWorkbook(2_000);
    workbook.sheets[0]!.columns = Array.from({ length: 200 }, (_, column) => ({
      key: `c${column}`,
      header: `C${column}`,
      width: 100,
      type: "text" as const,
    }));
    const store = new SheetwriteStore(workbook);
    let now = 0;
    const controller = new_test_controller(
      {
        datasource: () => Promise.withResolvers<DataSourcePage>().promise,
        loadable: store,
        now: () => now,
      },
      2_000,
    );
    const all_columns = Array.from({ length: 200 }, (_, column) => column);
    const assert_bounded = () => {
      const telemetry = controller.getTelemetry();
      expect(telemetry.activeSpeculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
      expect(telemetry.activeSpeculativeRows * 200 * 16).toBeLessThanOrEqual(
        DATASOURCE_PREFETCH_MAX_BYTES,
      );
    };

    controller.updateViewport(0, 600, all_columns);
    assert_bounded();
    now = 16.7;
    controller.updateViewport(600, 1_200, all_columns);
    assert_bounded();
    now = 33.4;
    controller.updateViewport(1_900, 2_000, all_columns);
    assert_bounded();
    now = 50.1;
    controller.updateViewport(1_200, 1_800, all_columns);
    assert_bounded();

    controller.destroy();
    store.dispose();
  });

  it("serves the body viewport immediately while saturated durable gaps keep progressing", async () => {
    const store = new SheetwriteStore(makeWorkbook(40));
    let fragmented = false;
    let retained = 0;
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    const controller = new_test_controller(
      {
        datasource: (request) => {
          if (!fragmented) {
            return Promise.resolve({
              start: request.start,
              rows: [{ name: `row-${request.start}` }],
            });
          }
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        retainRevision: () => {
          retained += 1;
          return () => {
            retained -= 1;
          };
        },
      },
      40,
    );

    for (let row = 0; row < 24; row += 2) {
      controller.ensureLoaded(row, row + 1, [0]);
      await flush_request();
    }
    fragmented = true;
    controller.ensureLoaded(0, 24, [0]);
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.updateViewport(30, 31, [0]);
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS + 1);
    expect(
      pending
        .slice(0, DATASOURCE_MAX_ACTIVE_REQUESTS)
        .some(({ request }) => request.signal.aborted),
    ).toBe(true);
    const body = pending.at(-1)!;
    expect(body.request).toMatchObject({ start: 30, end: 31 });
    expect(body.request.signal.aborted).toBe(false);
    expect(controller.getTelemetry().activeRequests).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    body.result.resolve({ start: 30, rows: [{ name: "body" }] });
    await flush_request();
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS + 2);
    expect(pending.at(-1)!.request.start).toBeLessThan(24);
    expect(controller.getTelemetry().activeRequests).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.destroy();
    expect(retained).toBe(0);
    store.dispose();
  });
});

describe("DatasourceController scroll-speed lookahead", () => {
  const FRAME_MS = 16.7;
  const VIEW_ROWS = 30;
  const ROW_COUNT = 200_000;
  /** The paged store's default clean-chunk cache budget. */
  const DEFAULT_CACHE_BYTES = 32 * 1024 * 1024;

  interface PendingFetch {
    readonly request: DataSourceRequest;
    readonly result: PromiseWithResolvers<ProtocolPage>;
  }

  /** A controller over a windowed datasource whose fetches stay pending until answered. */
  class ScrollHarness {
    readonly fetches: PendingFetch[] = [];
    readonly store: SheetwriteStore;
    readonly controller: DatasourceController;
    now = 0;

    constructor(options: { columns?: number; cacheBytes?: number } = {}) {
      const columns = make_protocol_columns(options.columns ?? 4);
      this.store = new SheetwriteStore(
        { activeSheet: "s1", sheets: [{ id: "s1", name: "S1", rowCount: ROW_COUNT, columns }] },
        undefined,
        {
          storage: "paged",
          chunkRows: 64,
          cacheBytes: options.cacheBytes ?? DEFAULT_CACHE_BYTES,
        },
      );
      this.controller = new DatasourceController(
        {
          datasource: {
            capabilities: { protocol: 2, columns: "windowed" },
            getRows: (request) => {
              const result = Promise.withResolvers<ProtocolPage>();
              this.fetches.push({ request, result });
              return result.promise;
            },
          },
          loadable: this.store,
          activeSheet: () => "s1",
          rowCount: () => ROW_COUNT,
          columns: () => columns,
          revision: () => 0,
          isCellNewerThan: () => false,
          retainRevision: () => () => {},
          onRowsLoaded: () => {},
          onError: () => {},
          now: () => this.now,
        },
        ROW_COUNT,
      );
    }

    /** One rendered frame with the view at row `top` and its first column at `left`. */
    frame(top: number, left = 0, columnCount = 4): void {
      this.now += FRAME_MS;
      this.view(top, left, columnCount);
    }

    view(top: number, left = 0, columnCount = 4): void {
      this.controller.updateViewport(
        top,
        top + VIEW_ROWS,
        Array.from({ length: columnCount }, (_, offset) => left + offset),
      );
    }

    /** Answers every pending fetch in full. */
    async resolveAll(): Promise<void> {
      for (const { request, result } of this.fetches) {
        if (request.signal.aborted) continue;
        result.resolve({
          protocol: 2,
          start: request.start,
          columns: request.columns,
          rows: protocol_rows(request.columns, request.start, request.end),
        });
      }
      this.fetches.length = 0;
      await flush_request();
    }

    all(): DataSourceRequest[] {
      return this.fetches.map(({ request }) => request);
    }

    live(): DataSourceRequest[] {
      return this.all().filter((request) => !request.signal.aborted);
    }

    farthestLiveEnd(): number {
      return Math.max(...this.live().map((request) => request.end));
    }

    dispose(): void {
      this.controller.destroy();
      this.store.dispose();
    }
  }

  it("looks ahead by speed times the measured p90 fetch time", async () => {
    const reach: number[] = [];
    for (const fetch_ms of [20, 300]) {
      const harness = new ScrollHarness();
      // The first view's fetches answer after `fetch_ms`, which teaches the fetch time.
      harness.view(10_000);
      harness.now += fetch_ms;
      await harness.resolveAll();
      expect(harness.controller.getTelemetry().fetchTimeP90Ms).toBe(fetch_ms);

      // Two rows a frame (0.12 rows/ms) is below fling speed for both fetch times.
      for (let frame = 1; frame <= 8; frame++) harness.frame(10_000 + frame * 2);
      const view_end = 10_000 + 16 + VIEW_ROWS;
      expect(harness.controller.getTelemetry().velocityRowsPerMs).toBeCloseTo(2 / FRAME_MS, 5);
      reach.push(harness.farthestLiveEnd() - view_end);
      harness.dispose();
    }
    const [fast = 0, slow = 0] = reach;
    // 0.12 rows/ms × 20 ms ≈ 2 rows and × 300 ms ≈ 36 rows, each plus a 30-row view of margin.
    expect(fast).toBeLessThanOrEqual(2 * VIEW_ROWS);
    expect(slow).toBeGreaterThanOrEqual(36 + VIEW_ROWS);
  });

  it("keeps slow wheel scrolling to one view ahead on a slow datasource", async () => {
    const harness = new ScrollHarness();
    harness.view(10_000);
    harness.now += 300;
    await harness.resolveAll();
    // A row and a half a frame (0.09 rows/ms) is wheel speed: 300 ms of travel would add
    // 27 rows, but the lookahead stays at one view past the view, as before.
    let top = 10_000;
    for (let frame = 1; frame <= 120; frame++) {
      top += frame % 2 === 0 ? 2 : 1;
      harness.frame(top);
    }
    const view_end = top + VIEW_ROWS;
    expect(harness.controller.getTelemetry().velocityRowsPerMs).toBeLessThan(0.1);
    expect(harness.live().some((request) => request.end > view_end)).toBe(true);
    // One view past the view's end, rounded up to a whole band.
    expect(harness.farthestLiveEnd()).toBeLessThanOrEqual(view_end + 2 * VIEW_ROWS);
    harness.dispose();
  });

  it("turns the lookahead around on a direction change and cancels the old one", () => {
    const harness = new ScrollHarness();
    harness.view(10_000);
    for (let frame = 1; frame <= 8; frame++) harness.frame(10_000 + frame * 6);
    const turn_top = 10_000 + 8 * 6;
    const below = harness.live().filter((request) => request.start >= turn_top + VIEW_ROWS);
    expect(below.length).toBeGreaterThan(0);

    harness.frame(turn_top - 6);
    const telemetry = harness.controller.getTelemetry();
    expect(telemetry.direction).toBe(-1);
    expect(telemetry.reversalAborts).toBeGreaterThan(0);
    expect(below.every((request) => request.signal.aborted)).toBe(true);
    expect(harness.live().some((request) => request.end <= turn_top - 6)).toBe(true);
    harness.dispose();
  });

  it("treats a lone jump as parked", () => {
    const harness = new ScrollHarness();
    harness.view(10_000);
    for (let frame = 1; frame <= 4; frame++) harness.frame(10_000 + frame * 6);
    harness.frame(150_000);
    harness.frame(150_000);
    expect(harness.controller.getTelemetry().jumpAborts).toBeGreaterThan(0);
    expect(harness.controller.getTelemetry().velocityRowsPerMs).toBe(0);
    // Parked after the jump: one view of margin, nothing far past the landing.
    expect(harness.farthestLiveEnd()).toBeLessThanOrEqual(150_000 + 3 * VIEW_ROWS);
    harness.dispose();
  });

  it("fetches only where a scrollbar drag comes to rest, once it slows down", () => {
    // A scrollbar drag moves about 285 rows a frame: the view shows a sliver of what it
    // crosses, so nothing along the way is prefetched.
    const harness = new ScrollHarness();
    harness.view(10_000);
    let top = 10_000;
    for (let frame = 1; frame <= 6; frame++) {
      top += 285;
      harness.frame(top);
    }
    expect(harness.controller.getTelemetry().velocityRowsPerMs).toBeGreaterThan(0);
    expect(harness.live().every((request) => request.start < top + VIEW_ROWS)).toBe(true);

    // Slowing for a whole velocity window predicts the resting point well ahead of the view.
    let step = 285;
    for (let frame = 1; frame <= 10; frame++) {
      step = Math.round(step * 0.85);
      top += step;
      harness.frame(top);
    }
    expect(harness.live().some((request) => request.start >= top + 2 * VIEW_ROWS)).toBe(true);
    harness.dispose();
  });

  it("fetches ahead of a fling's landing point and cancels bands the view passed", () => {
    const harness = new ScrollHarness();
    harness.view(10_000);
    let top = 10_000;
    for (let frame = 1; frame <= 30; frame++) {
      top += 25;
      harness.frame(top);
    }
    // 25 rows a frame travels about 150 rows during the default 100 ms fetch, so the
    // lookahead skips the stretch next to the view that it passes before a fetch returns.
    expect(harness.live().some((request) => request.start >= top + 3 * VIEW_ROWS)).toBe(true);
    const passed = harness.all().filter((request) => request.end <= top);
    expect(passed.length).toBeGreaterThan(0);
    expect(passed.every((request) => request.signal.aborted)).toBe(true);
    harness.dispose();
  });

  it("shrinks the lookahead as a fling slows down", () => {
    const harness = new ScrollHarness();
    harness.view(10_000);
    let top = 10_000;
    let speed = 25;
    for (let frame = 1; frame <= 10; frame++) {
      top += speed;
      harness.frame(top);
    }
    const peak_reach = harness.farthestLiveEnd() - (top + VIEW_ROWS);
    const aborts_at_peak = harness.controller.getTelemetry().aborts;
    for (let frame = 1; frame <= 20; frame++) {
      speed *= 0.85;
      top += Math.round(speed);
      harness.frame(top);
    }
    const slow_reach = harness.farthestLiveEnd() - (top + VIEW_ROWS);
    expect(slow_reach).toBeLessThan(peak_reach);
    expect(harness.controller.getTelemetry().aborts).toBeGreaterThan(aborts_at_peak);
    harness.dispose();
  });

  it("caps speculation by the paged cache budget", () => {
    const columns = 8;
    const cache_bytes = 8 * 1024;
    // 8 KiB at 16 bytes a cell, less the 30 × 8 view, over 8 columns.
    const budget_rows = Math.floor((cache_bytes / 16 - VIEW_ROWS * columns) / columns);
    const peaks: number[] = [];
    for (const budget of [cache_bytes, DEFAULT_CACHE_BYTES]) {
      const harness = new ScrollHarness({ columns, cacheBytes: budget });
      harness.view(10_000, 0, columns);
      let peak = 0;
      for (let frame = 1; frame <= 12; frame++) {
        harness.frame(10_000 + frame * 3, 0, columns);
        peak = Math.max(peak, harness.controller.getTelemetry().activeSpeculativeRows);
      }
      peaks.push(peak);
      harness.dispose();
    }
    const [capped = 0, uncapped = 0] = peaks;
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThanOrEqual(budget_rows);
    expect(uncapped).toBeGreaterThan(budget_rows);
  });

  it("looks ahead sideways while the view scrolls across columns", async () => {
    const harness = new ScrollHarness({ columns: 60 });
    harness.view(10_000, 0, 8);
    // Pages answer between frames, so each frame's speculation can start.
    for (let left = 1; left <= 5; left++) {
      harness.frame(10_000, left, 8);
      await harness.resolveAll();
    }
    harness.frame(10_000, 6, 8);
    expect(harness.controller.getTelemetry().velocityColumnsPerMs).toBeGreaterThan(0);
    const ahead = harness
      .live()
      .filter((request) => request.columns.some((band) => band.start >= 6 + 8));
    expect(ahead.length).toBeGreaterThan(0);
    expect(
      ahead.every((request) => request.start >= 10_000 && request.end <= 10_000 + VIEW_ROWS),
    ).toBe(true);

    // Turning back left drops the columns to the right that are still in flight.
    for (let left = 5; left >= 2; left--) harness.frame(10_000, left, 8);
    expect(ahead.every((request) => request.signal.aborted)).toBe(true);
    harness.dispose();
  });
});

it("rejects malformed protocol, coverage, bands, and row shapes before hydration", async () => {
  // Each case changes one field of a well-formed page for the request.
  const page = (request: DataSourceRequest, fields: Partial<ProtocolPage>): ProtocolPage => ({
    protocol: 2,
    start: request.start,
    columns: request.columns,
    rows: [{ k0: "zero", k2: "two" }],
    ...fields,
  });
  const cases: Array<{
    name: string;
    page: (request: DataSourceRequest) => ProtocolPage;
  }> = [
    {
      name: "protocol",
      page: (request) => page(request, { protocol: 1 } as unknown as ProtocolPage),
    },
    {
      name: "reordered bands",
      page: (request) => page(request, { columns: [request.columns[1]!, request.columns[0]!] }),
    },
    {
      name: "mismatched keys",
      page: (request) =>
        page(request, {
          columns: [{ ...request.columns[0]!, keys: ["k1"] }, request.columns[1]!],
          rows: [{ k1: "wrong", k2: "two" }],
        }),
    },
    { name: "missing row key", page: (request) => page(request, { rows: [{ k0: "zero" }] }) },
    {
      name: "extra row key",
      page: (request) => page(request, { rows: [{ k0: "zero", k2: "two", extra: "no" }] }),
    },
    { name: "row bounds", page: (request) => page(request, { start: request.end }) },
    {
      name: "overlapping bands",
      page: (request) =>
        page(request, {
          columns: [request.columns[0]!, request.columns[0]!],
          rows: [{ k0: "zero" }],
        }),
    },
  ];

  for (const test_case of cases) {
    const columns = make_protocol_columns(3);
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.columns = columns;
    const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
    const errors: unknown[] = [];
    let loaded = 0;
    const controller = new_protocol_controller({
      store,
      columns,
      rowCount: 4,
      errors,
      onRowsLoaded: () => {
        loaded += 1;
      },
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: (request) => Promise.resolve(test_case.page(request)),
      },
    });

    controller.ensureLoaded(0, 1, [0, 2]);
    await flush_request();
    expect(errors, test_case.name).toHaveLength(1);
    expect(loaded, test_case.name).toBe(0);
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 }), test_case.name).toBe(
      "unloaded",
    );
    expect(controller.getTelemetry(), test_case.name).toMatchObject({
      activeRequests: 0,
      ownedBands: 0,
    });
    controller.destroy();
    store.dispose();
  }
});

it("bounds empty-page retries and releases no-progress ownership", async () => {
  const columns = make_protocol_columns(2);
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
  const errors: unknown[] = [];
  let calls = 0;
  const controller = new_protocol_controller({
    store,
    columns,
    rowCount: 4,
    errors,
    datasource: {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows(request) {
        calls += 1;
        return Promise.resolve({
          protocol: 2,
          start: request.start,
          columns: [],
          rows: [Object.create(null) as RowData],
        });
      },
    },
  });

  controller.ensureLoaded(0, 2, [0, 1]);
  await flush_request();
  expect(calls).toBe(2);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({
    code: "datasource-request-failed",
    operation: "datasource-request",
  });
  expect(controller.getTelemetry()).toMatchObject({ activeRequests: 0, ownedBands: 0 });
  expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("unloaded");

  controller.destroy();
  store.dispose();
});

it("bounds metadata across deterministic million-row by thousand-column scroll/reset traces", () => {
  const row_count = 1_000_000;
  const columns = make_protocol_columns(1_000);
  const workbook = makeWorkbook(row_count);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    chunkRows: 64,
    cacheBytes: 64 * 1024,
  });
  const controller = new_protocol_controller({
    store,
    columns,
    rowCount: row_count,
    datasource: {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows: () => new Promise<ProtocolPage>(() => {}),
    },
  });
  let random = 0x7f4a_7c15;
  const next = () => {
    random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
    return random;
  };

  for (let step = 0; step < 240; step += 1) {
    const start = next() % (row_count - 40);
    const requested = new Set<number>();
    while (requested.size < 12) requested.add(next() % columns.length);
    controller.updateViewport(start, start + 40, [...requested]);
    expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS,
    );
    const owners = controller.getResourceOwners();
    const non_schema_bytes = owners
      .filter((owner) => owner.owner !== "js.datasource.schema-index")
      .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
    expect(non_schema_bytes).toBeLessThanOrEqual(128 * 1024);
    expect(
      owners.find((owner) => owner.owner === "js.datasource.tile-state")!.entries,
    ).toBeLessThanOrEqual(128);
    if (step > 0 && step % 19 === 0) {
      controller.reset(row_count);
      expect(controller.getTelemetry()).toMatchObject({ loadedBands: 0, ownedBands: 0 });
    }
  }

  const total_bytes = controller
    .getResourceOwners()
    .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
  expect(total_bytes).toBeLessThanOrEqual(1024 * 1024);
  expect(
    controller
      .getResourceOwners()
      .find((owner) => owner.owner === "js.datasource.pending-requests")!.entries,
  ).toBeGreaterThan(0);
  controller.destroy();
  expect(
    controller
      .getResourceOwners()
      .every((owner) => owner.entries === 0 && owner.allocatedBytes === 0),
  ).toBe(true);
  store.dispose();
});
