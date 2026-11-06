import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  type Column,
  createGrid,
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type SavedQuery,
  SyncCoordinator,
  type Workbook,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import {
  type QueriesAddonOptions,
  queriesAddon,
  type QueryFetchRequest,
  type QueryFetchResult,
  type QuerySession,
  querySession,
} from "../src/node.js";

beforeAll(async () => {
  // Grids get their `fetchSource` from their own settings, so a grid without one has no session.
  await initSheetwrite({ addons: [queriesAddon()] });
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

const encoder = new TextEncoder();
const columns = (count: number): Column[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "text" as const,
  }));

const workbook = (): Workbook => ({
  activeSheet: "data",
  sheets: [{ id: "data", name: "Data", rowCount: 8, columns: columns(6) }],
});

const unfiltered: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales-feed",
    locator: "https://example.test/sales.csv",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
      { id: "day", name: "Day", type: "date" },
    ],
  },
  steps: [],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: "data", row: 0, col: 0 } },
};

const grids: Grid[] = [];
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

type Sources = Record<string, string | (() => Promise<QueryFetchResult>)>;

/** The fixture sources and the recorded requests of one grid; `connect` fills them in. */
interface SourceFixture {
  sources: Sources;
  requests: QueryFetchRequest[];
}

const fixtures = new WeakMap<Grid, SourceFixture>();

/** Grid settings whose `fetchSource` serves `fixture`. */
function sourceSettings(fixture: SourceFixture): QueriesAddonOptions {
  return {
    fetchSource: async (request) => {
      fixture.requests.push(request);
      const source = fixture.sources[request.sourceId];
      if (typeof source === "function") return source();
      if (source === undefined) throw new Error(`No fixture for ${request.sourceId}`);

      return { kind: "bytes", bytes: encoder.encode(source) };
    },
  };
}

function mount(initial: Workbook = workbook()): Grid {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const fixture: SourceFixture = { sources: {}, requests: [] };
  const grid = createGrid(host, {
    workbook: initial,
    addons: { queries: sourceSettings(fixture) },
  });
  fixtures.set(grid, fixture);
  grids.push(grid);
  return grid;
}

async function connect(
  grid: Grid,
  sources: Sources,
  requests: QueryFetchRequest[] = [],
): Promise<QuerySession> {
  const fixture = fixtures.get(grid);
  if (fixture === undefined) throw new Error("the grid was not mounted with query settings");
  fixture.sources = sources;
  fixture.requests = requests;
  return querySession(grid);
}

const cell = (grid: Grid, row: number, col: number) =>
  grid.store.getCell({ sheet: "data", row, col }).resolved;
const tableRange = (grid: Grid) =>
  grid.store.getWorkbook().sheets[0]?.tables?.find((table) => table.id === "sales-table")?.range;

describe("saved query refresh", () => {
  it("writes typed values and cell errors into one table that formulas read", async () => {
    const grid = mount();
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "data", row: 0, col: 5 },
          value: { kind: "formula", src: "=SUM(B2,B4)" },
        },
      ],
    });
    const session = await connect(grid, {
      "sales-feed":
        "Region,Total,Day\nNorth,5,2024-01-02\nSouth,bad,2024-01-03\nEast,7,1900-01-01\n",
    });

    expect(session.define(unfiltered).status).toBe("applied");
    expect((await session.refresh("sales")).status).toBe("applied");

    expect([cell(grid, 0, 0), cell(grid, 0, 1), cell(grid, 0, 2)]).toEqual([
      "Region",
      "Total",
      "Day",
    ]);
    expect([cell(grid, 1, 0), cell(grid, 1, 1), cell(grid, 1, 2)]).toEqual(["North", 5, 45293]);
    expect(grid.store.getFormula({ sheet: "data", row: 2, col: 1 })).toBe("=#VALUE!");
    expect(cell(grid, 3, 2)).toBe(1);
    expect(cell(grid, 0, 5)).toBe(12);
    expect(tableRange(grid)).toEqual({
      sheet: "data",
      start: { row: 0, col: 0 },
      end: { row: 3, col: 2 },
    });
  });

  it("grows into empty rows, shrinks by clearing its old cells and keeps an empty table", async () => {
    const grid = mount();
    const feed = { rows: "North,1,2024-01-01\n" };
    const session = await connect(grid, {
      "sales-feed": () =>
        Promise.resolve({
          kind: "bytes",
          bytes: encoder.encode(`Region,Total,Day\n${feed.rows}`),
        }),
    });
    session.define(unfiltered);

    feed.rows = Array.from({ length: 10 }, (_, row) => `R${row},${row},2024-01-01\n`).join("");
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(11);
    expect(cell(grid, 10, 0)).toBe("R9");

    feed.rows = "Only,1,2024-01-01\n";
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(cell(grid, 1, 0)).toBe("Only");
    expect(cell(grid, 2, 0)).toBeNull();
    expect(tableRange(grid)?.end.row).toBe(1);

    feed.rows = "";
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(cell(grid, 0, 0)).toBe("Region");
    expect(cell(grid, 1, 0)).toBeNull();
    expect(tableRange(grid)?.end.row).toBe(1);
  });

  it("writes logical, date-time and mixed values with their worksheet types", async () => {
    const grid = mount();
    const events: SavedQuery = {
      id: "events",
      name: "Events",
      source: {
        kind: "json",
        sourceId: "events-feed",
        columns: [
          { id: "at", name: "At", type: "dateTime" },
          { id: "open", name: "Open", type: "logical" },
          { id: "count", name: "Count", type: "number" },
        ],
      },
      steps: [
        {
          kind: "unpivot",
          columns: ["open", "count"],
          attribute: { id: "field", name: "Field" },
          value: { id: "value", name: "Value" },
        },
      ],
      output: {
        table: "events-table",
        tableName: "Events",
        anchor: { sheet: "data", row: 0, col: 0 },
      },
    };
    const session = await connect(grid, {
      "events-feed": '[{"At":"2024-01-02T12:00:00","Open":true,"Count":"bad"}]',
    });

    expect(session.define(events).status).toBe("applied");
    expect((await session.refresh("events")).status).toBe("applied");

    expect([cell(grid, 1, 0), cell(grid, 1, 1), cell(grid, 1, 2)]).toEqual([45293.5, "Open", true]);
    expect(cell(grid, 2, 1)).toBe("Count");
    expect(grid.store.getFormula({ sheet: "data", row: 2, col: 2 })).toBe("=#VALUE!");
    expect(grid.store.getCell({ sheet: "data", row: 1, col: 0 }).style.numberFormat).toBe(
      "yyyy-mm-dd hh:mm:ss",
    );
  });

  it("is one undoable change that redo restores without another fetch", async () => {
    const grid = mount();
    const requests: QueryFetchRequest[] = [];
    const session = await connect(
      grid,
      { "sales-feed": "Region,Total,Day\nNorth,5,2024-01-02\n" },
      requests,
    );
    session.define(unfiltered);
    await session.refresh("sales");

    grid.undo();
    expect(cell(grid, 1, 0)).toBeNull();
    expect(tableRange(grid)).toBeUndefined();
    expect(grid.store.getWorkbook().queries?.map((query) => query.id)).toEqual(["sales"]);

    grid.redo();
    expect(cell(grid, 1, 0)).toBe("North");
    expect(requests).toHaveLength(1);
  });

  it("does not overwrite unrelated cells when an output grows", async () => {
    const grid = mount();
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "data", row: 3, col: 1 },
          value: { kind: "literal", value: "keep" },
        },
      ],
    });
    const session = await connect(grid, {
      "sales-feed": "Region,Total,Day\nA,1,2024-01-01\nB,2,2024-01-01\nC,3,2024-01-01\n",
    });
    session.define(unfiltered);

    expect(await session.refresh("sales")).toEqual({
      status: "blocked",
      queryId: "sales",
      reason: "occupied",
    });
    expect(cell(grid, 0, 0)).toBeNull();
    expect(cell(grid, 3, 1)).toBe("keep");
  });
});

describe("refresh atomicity", () => {
  const costs: SavedQuery = {
    id: "costs",
    name: "Costs",
    source: {
      kind: "json",
      sourceId: "costs-feed",
      columns: [{ id: "cost", name: "Cost", type: "number" }],
    },
    steps: [{ kind: "filter", predicate: { kind: "compare", column: "cost", op: "gt", value: 0 } }],
    output: { table: "costs-table", tableName: "Costs", anchor: { sheet: "data", row: 0, col: 4 } },
  };

  it("commits every output together or none when one query fails", async () => {
    const grid = mount();
    const session = await connect(grid, {
      "sales-feed": "Region,Total,Day\nNorth,5,2024-01-02\n",
      "costs-feed": '[{"Cost":"bad"}]',
    });
    session.define(unfiltered);
    session.define(costs);

    const failed = await session.refreshAll();
    expect(failed).toMatchObject({
      status: "failed",
      queryId: "costs",
      diagnostic: { code: "predicate-error" },
    });
    expect(cell(grid, 0, 0)).toBeNull();
  });

  it("refreshes every output in one transaction", async () => {
    const grid = mount();
    const session = await connect(grid, {
      "sales-feed": "Region,Total,Day\nNorth,5,2024-01-02\n",
      "costs-feed": '[{"Cost":3}]',
    });
    session.define(unfiltered);
    session.define(costs);

    expect((await session.refreshAll()).status).toBe("applied");
    expect([cell(grid, 1, 0), cell(grid, 1, 4)]).toEqual(["North", 3]);

    grid.undo();
    expect([cell(grid, 1, 0), cell(grid, 1, 4)]).toEqual([null, null]);
  });

  it("discards a staged result when its definition changes during the fetch", async () => {
    const grid = mount();
    const gate = Promise.withResolvers<QueryFetchResult>();
    const session = await connect(grid, { "sales-feed": () => gate.promise });
    session.define(unfiltered);

    const pending = session.refresh("sales");
    session.define({ ...unfiltered, name: "Renamed sales" });
    gate.resolve({
      kind: "bytes",
      bytes: encoder.encode("Region,Total,Day\nNorth,5,2024-01-02\n"),
    });

    expect(await pending).toEqual({ status: "stale" });
    expect(cell(grid, 0, 0)).toBeNull();
  });

  it("stops without writing when the host aborts the refresh", async () => {
    const grid = mount();
    const gate = Promise.withResolvers<QueryFetchResult>();
    const session = await connect(grid, { "sales-feed": () => gate.promise });
    session.define(unfiltered);
    const controller = new AbortController();

    const pending = session.refresh("sales", { signal: controller.signal });
    controller.abort();
    gate.resolve({
      kind: "bytes",
      bytes: encoder.encode("Region,Total,Day\nNorth,5,2024-01-02\n"),
    });

    expect(await pending).toEqual({ status: "aborted" });
    expect(cell(grid, 0, 0)).toBeNull();
  });
});

describe("query sources and definitions", () => {
  it("loads joined queries through the host callback only, without credentials", async () => {
    const grid = mount();
    const regions: SavedQuery = {
      id: "regions",
      name: "Regions",
      source: {
        kind: "host",
        sourceId: "region-table",
        columns: [{ id: "code", name: "Code", type: "text" }],
      },
      steps: [],
    };
    const joined: SavedQuery = {
      ...unfiltered,
      steps: [{ kind: "join", input: "regions", keys: [["region", "code"]], join: "leftSemi" }],
    };
    const requests: QueryFetchRequest[] = [];
    const originalFetch = globalThis.fetch;
    let globalFetches = 0;
    globalThis.fetch = Object.assign(
      () => {
        globalFetches += 1;
        return Promise.reject(new Error("global fetch is not a query source"));
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      const session = await connect(
        grid,
        {
          "sales-feed": "Region,Total,Day\nNorth,5,2024-01-02\nSouth,6,2024-01-03\n",
          "region-table": () =>
            Promise.resolve({
              kind: "batch",
              batch: {
                rowCount: 1,
                columns: [
                  {
                    id: "code",
                    name: "Code",
                    type: "text",
                    bytes: encoder.encode("South"),
                    offsets: Uint32Array.of(0, 5),
                    validity: Uint8Array.of(1),
                    errorRows: new Uint32Array(),
                    errorCodes: new Uint32Array(),
                    errorPool: [],
                  },
                ],
              },
            }),
        },
        requests,
      );
      expect(session.define(regions).status).toBe("applied");
      expect(session.define(joined).status).toBe("applied");

      expect((await session.refresh("sales")).status).toBe("applied");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(globalFetches).toBe(0);
    expect(requests).toEqual([
      { queryId: "regions", sourceId: "region-table", kind: "host" },
      {
        queryId: "sales",
        sourceId: "sales-feed",
        kind: "csv",
        locator: "https://example.test/sales.csv",
      },
    ]);
    expect([cell(grid, 1, 0), cell(grid, 2, 0)]).toEqual(["South", null]);
  });

  it("ends a grid's session when the grid is destroyed", async () => {
    const grid = mount();
    const session = await connect(grid, {});
    expect(session.define(unfiltered).status).toBe("applied");

    grid.destroy();

    await expect(querySession(grid)).rejects.toMatchObject({
      code: "optional-backend-unavailable",
    });
  });

  it("rejects a plan the engine cannot run before saving it", async () => {
    const grid = mount();
    const session = await connect(grid, {});
    const result = session.define({
      ...unfiltered,
      steps: [{ kind: "select", columns: ["missing"] }],
    });

    expect(result).toMatchObject({
      status: "invalid",
      diagnostic: { code: "column", column: "missing", step: 0 },
    });
    expect(grid.store.getWorkbook().queries).toBeUndefined();
  });

  it("gives a synced peer the exact refreshed values without fetching", async () => {
    const base = {
      schemaVersion: 1 as const,
      documentId: "query-sync",
      version: 0,
      workbook: { activeSheet: "data" },
      sheets: [{ id: "data", name: "Data", order: 0, rowCount: 8, columns: columns(6), cells: [] }],
    };
    const adapter = new MemoryPersistenceAdapter(base);
    const senderHost = document.createElement("div");
    const peerHost = document.createElement("div");
    document.body.append(senderHost, peerHost);
    const senderFixture: SourceFixture = { sources: {}, requests: [] };
    const sender = createGridFromSnapshot(senderHost, structuredClone(base), {
      addons: { queries: sourceSettings(senderFixture) },
    });
    fixtures.set(sender, senderFixture);
    const peer = createGridFromSnapshot(peerHost, structuredClone(base));
    grids.push(sender, peer);
    const options = { documentId: "query-sync", serverVersion: 0 };
    const senderSync = new SyncCoordinator(sender, adapter, options);
    const peerSync = new SyncCoordinator(peer, adapter, options);
    try {
      const session = await connect(sender, {
        "sales-feed": "Region,Total,Day\nNorth,5,2024-01-02\n",
      });
      session.define(unfiltered);
      await session.refresh("sales");
      expect(await senderSync.sendNext()).toMatchObject({ status: "applied" });
      expect(await senderSync.sendNext()).toMatchObject({ status: "applied" });

      const tail = await adapter.commit({
        documentId: "query-sync",
        baseVersion: 0,
        clientMutationId: "read-tail",
        operations: [],
      });
      if (tail.status !== "conflict" || !tail.operationsSinceBase) {
        throw new Error("the adapter must return the committed versions");
      }
      for (const version of tail.operationsSinceBase) {
        await peerSync.applyVersionedOperation(version);
      }

      expect(peer.store.getCell({ sheet: "data", row: 1, col: 0 }).resolved).toBe("North");
      expect(peer.store.getWorkbook().queries?.map((query) => query.id)).toEqual(["sales"]);
      // The peer has no fetchSource, so it has no session and never fetches.
      await expect(querySession(peer)).rejects.toMatchObject({
        code: "optional-backend-unavailable",
      });
    } finally {
      senderSync.destroy();
      peerSync.destroy();
    }
  });
});
