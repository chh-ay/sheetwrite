import { beforeAll, describe, expect, it } from "bun:test";

import {
  DATASOURCE_MAX_ACTIVE_REQUESTS,
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

async function flushRequest(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

type LegacyControllerOptions = Omit<DatasourceControllerOptions, "columns" | "datasource"> & {
  datasource?: LegacyRowLoader;
  columns?: DatasourceControllerOptions["columns"];
};

function newTestController(
  options: LegacyControllerOptions,
  rowCount: number,
): DatasourceController {
  const { datasource, columns, ...rest } = options;
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
    rowCount,
  );
}

function makeProtocolColumns(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `k${index}`,
    header: `K${index}`,
    width: 100,
    type: "text" as const,
  }));
}

function protocolRows(
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

function newProtocolController(options: {
  store: SheetwriteStore;
  datasource: DataSource;
  columns: readonly Column[];
  rowCount: number;
  errors?: unknown[];
  onRowsLoaded?: () => void;
  revision?: () => number;
  isCellNewerThan?: DatasourceControllerOptions["isCellNewerThan"];
  retainRevision?: DatasourceControllerOptions["retainRevision"];
}): DatasourceController {
  return new DatasourceController(
    {
      datasource: options.datasource,
      loadable: options.store,
      activeSheet: () => "s1",
      rowCount: () => options.rowCount,
      columns: () => options.columns,
      revision: options.revision ?? (() => 0),
      isCellNewerThan: options.isCellNewerThan ?? (() => false),
      retainRevision: options.retainRevision ?? (() => () => {}),
      onRowsLoaded: options.onRowsLoaded ?? (() => {}),
      onError: (_request, error) => options.errors?.push(error),
    },
    options.rowCount,
  );
}

describe("DatasourceController revision retention", () => {
  it("protects acknowledged edits made after overlapping requests start and releases all records", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    const pending: Array<PromiseWithResolvers<DataSourcePage>> = [];
    let revision = 0;
    const controller = newTestController(
      {
        datasource: () => {
          const request = Promise.withResolvers<DataSourcePage>();
          pending.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => revision,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: () => {},
      },
      4,
    );

    controller.ensureLoaded(0, 1, [0]);
    controller.ensureLoaded(1, 2, [0]);
    expect(revisions.stats()).toMatchObject({ retainedRequests: 2, retainedRevisions: 1 });

    const local: DocumentOp = {
      op: "set",
      addr: { sheet: "s1", row: 1, col: 0 },
      value: { kind: "literal", value: "local" },
    };
    revision = 1;
    store.applyTransaction({ patches: [local] });
    revisions.record([local], revision);
    store.acknowledgeOperations([local]);

    pending[1]!.resolve({ start: 1, rows: [{ name: "stale server" }] });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("local");
    expect(revisions.stats()).toMatchObject({ points: 1, retainedRequests: 1 });

    pending[0]!.resolve({ start: 0, rows: [{ name: "fresh server" }] });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("fresh server");
    expect(revisions.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });

    controller.destroy();
    store.dispose();
  });

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

    const controller = newTestController(
      {
        datasource: () => {
          const request = Promise.withResolvers<DataSourcePage>();
          requests.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => revision,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: () => {},
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
    await flushRequest();
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
    const controller = newTestController(
      {
        datasource: () => {
          if (mode === "throw") throw new Error("sync");
          if (mode === "reject") return Promise.reject(new Error("async"));
          const request = Promise.withResolvers<DataSourcePage>();
          pending.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => 0,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: (_request, error) => errors.push(error),
      },
      4,
    );

    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(0);
    controller.reset(4);
    await flushRequest();
    expect(errors).toHaveLength(0);

    controller.ensureLoaded(0, 1, [0]);
    await flushRequest();
    expect(errors).toHaveLength(1);

    mode = "reject";
    controller.ensureLoaded(0, 1, [0]);
    await flushRequest();
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(2);

    mode = "pending";
    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    const resetSignal = pending[0]!.promise;
    controller.reset(4);
    expect(revisions.stats().retainedRequests).toBe(0);
    pending[0]!.resolve({ start: 0, rows: [{ name: "late reset" }] });
    await resetSignal;
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();

    controller.ensureLoaded(1, 2, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    mode = "throw";
    controller.ensureLoaded(2, 3, [0]);
    controller.destroy();
    expect(revisions.stats().retainedRequests).toBe(0);
    await flushRequest();
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
    const controller = newTestController(
      {
        datasource: (request) => {
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 100,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
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
    expect(pending).toHaveLength(4);
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
    await flushRequest();
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
    const cacheBytes = 63;
    const workbook = makeWorkbook(20);
    workbook.sheets[0]!.columns = workbook.sheets[0]!.columns.slice(0, 1);
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 1,
      cacheBytes,
    });
    const requested: Array<[number, number]> = [];
    const controller = newTestController(
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
        activeSheet: () => "s1",
        rowCount: () => 20,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      20,
    );

    controller.ensureLoaded(0, 2, [0]);
    await flushRequest();
    controller.ensureLoaded(2, 4, [0]);
    await flushRequest();
    expect(
      store.isRangeFullyLoaded({
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 1, col: 0 },
      }),
    ).toBe(true);

    controller.ensureLoaded(0, 2, [0]);
    await flushRequest();
    expect(requested.at(-1)).toEqual([0, 1]);
    expect(store.getPagedStats("s1").allocatedBytes).toBeLessThanOrEqual(cacheBytes);

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
    const controller = newTestController(
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
        activeSheet: () => "s1",
        rowCount: () => 40,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => {
          retained += 1;
          return () => {
            retained -= 1;
          };
        },
        onRowsLoaded: () => {},
        onError: () => {},
      },
      40,
    );

    for (let row = 0; row < 24; row += 2) {
      controller.ensureLoaded(row, row + 1, [0]);
      await flushRequest();
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
    await flushRequest();
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS + 2);
    expect(pending.at(-1)!.request.start).toBeLessThan(24);
    expect(controller.getTelemetry().activeRequests).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.destroy();
    expect(retained).toBe(0);
    store.dispose();
  });
});

it("rejects malformed protocol, coverage, bands, and row shapes before hydration", async () => {
  const cases: Array<{
    name: string;
    page: (request: DataSourceRequest) => ProtocolPage;
  }> = [
    {
      name: "protocol",
      page: (request) =>
        ({
          protocol: 1,
          start: request.start,
          columns: request.columns,
          rows: protocolRows(request.columns, request.start, request.start + 1),
        }) as unknown as ProtocolPage,
    },
    {
      name: "reordered bands",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [request.columns[1]!, request.columns[0]!],
        rows: [{ k0: "zero", k2: "two" }],
      }),
    },
    {
      name: "mismatched keys",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [{ ...request.columns[0]!, keys: ["k1"] }, request.columns[1]!],
        rows: [{ k1: "wrong", k2: "two" }],
      }),
    },
    {
      name: "missing row key",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: request.columns,
        rows: [{ k0: "zero" }],
      }),
    },
    {
      name: "extra row key",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: request.columns,
        rows: [{ k0: "zero", k2: "two", extra: "no" }],
      }),
    },
    {
      name: "row bounds",
      page: (request) => ({
        protocol: 2,
        start: request.end,
        columns: request.columns,
        rows: protocolRows(request.columns, request.end, request.end + 1),
      }),
    },
    {
      name: "overlapping bands",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [request.columns[0]!, request.columns[0]!],
        rows: [{ k0: "zero" }],
      }),
    },
  ];

  for (const testCase of cases) {
    const columns = makeProtocolColumns(3);
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.columns = columns;
    const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
    const errors: unknown[] = [];
    let loaded = 0;
    const controller = newProtocolController({
      store,
      columns,
      rowCount: 4,
      errors,
      onRowsLoaded: () => {
        loaded += 1;
      },
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: (request) => Promise.resolve(testCase.page(request)),
      },
    });

    controller.ensureLoaded(0, 1, [0, 2]);
    await flushRequest();
    expect(errors, testCase.name).toHaveLength(1);
    expect(loaded, testCase.name).toBe(0);
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 }), testCase.name).toBe("unloaded");
    expect(controller.getTelemetry(), testCase.name).toMatchObject({
      activeRequests: 0,
      ownedBands: 0,
    });
    controller.destroy();
    store.dispose();
  }
});

it("bounds empty-page retries and releases no-progress ownership", async () => {
  const columns = makeProtocolColumns(2);
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
  const errors: unknown[] = [];
  let calls = 0;
  const controller = newProtocolController({
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
  await flushRequest();
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
  const rowCount = 1_000_000;
  const columns = makeProtocolColumns(1_000);
  const workbook = makeWorkbook(rowCount);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    chunkRows: 64,
    cacheBytes: 64 * 1024,
  });
  const controller = newProtocolController({
    store,
    columns,
    rowCount,
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
    const start = next() % (rowCount - 40);
    const requested = new Set<number>();
    while (requested.size < 12) requested.add(next() % columns.length);
    controller.updateViewport(start, start + 40, [...requested]);
    expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS,
    );
    const owners = controller.getResourceOwners();
    const nonSchemaBytes = owners
      .filter((owner) => owner.owner !== "js.datasource.schema-index")
      .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
    expect(nonSchemaBytes).toBeLessThanOrEqual(128 * 1024);
    expect(
      owners.find((owner) => owner.owner === "js.datasource.tile-state")!.entries,
    ).toBeLessThanOrEqual(128);
    if (step > 0 && step % 19 === 0) {
      controller.reset(rowCount);
      expect(controller.getTelemetry()).toMatchObject({ loadedBands: 0, ownedBands: 0 });
    }
  }

  const totalBytes = controller
    .getResourceOwners()
    .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
  expect(totalBytes).toBeLessThanOrEqual(1024 * 1024);
  controller.destroy();
  expect(
    controller
      .getResourceOwners()
      .every((owner) => owner.entries === 0 && owner.allocatedBytes === 0),
  ).toBe(true);
  store.dispose();
});
