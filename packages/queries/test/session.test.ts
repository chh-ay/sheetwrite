import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  type CellValue,
  type Column,
  createGrid,
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type SavedQuery,
  SyncCoordinator,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import {
  queriesAddon,
  type QueryFetchRequest,
  type QueryFetchResult,
  querySessionOf,
} from "../src/node.js";

beforeAll(async () => {
  await initSheetwrite();
});

// Add-ons install once per process, and another copy of this package may have
// installed "queries" first. These checks call this copy's grid hook directly,
// as `createGrid` does for an installed add-on.
const addon = queriesAddon();
const grids: Grid[] = [];
const cleanups: Array<() => void> = [];
let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const grid of grids.splice(0)) grid.destroy();
  restoreStubs();
});

const encoder = new TextEncoder();
const columns: Column[] = Array.from({ length: 6 }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 80,
  type: "text" as const,
}));
const SALES_CSV = "Region,Total,Day\nNorth,5,2024-01-02\n";
const SALES_URL = "https://example.test/sales.csv";
const A1 = { sheet: "data", row: 0, col: 0 };

const unfiltered: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales-feed",
    locator: SALES_URL,
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
      { id: "day", name: "Day", type: "date" },
    ],
  },
  steps: [],
  output: { table: "sales-table", tableName: "Sales", anchor: A1 },
};

/** Fixture bodies or fetchers by source ID; `open` serves them through `fetchSource`. */
type Sources = Record<string, string | (() => Promise<QueryFetchResult>)>;

/** Applies the queries add-on to `grid`, as grid creation does; returns its cleanup. */
function applyQueries(grid: Grid, sources?: Sources, requests: QueryFetchRequest[] = []) {
  const fetchSource = async (request: QueryFetchRequest): Promise<QueryFetchResult> => {
    requests.push(request);
    const source = sources?.[request.sourceId];
    if (typeof source === "function") return source();
    if (source === undefined) throw new Error(`No fixture for ${request.sourceId}`);
    return { kind: "bytes", bytes: encoder.encode(source) };
  };
  const settings = sources ? { fetchSource } : undefined;
  const cleanup =
    addon.grid?.({ grid, settings, queryCommands: () => () => {}, historyCommand: () => {} }) ??
    (() => {});
  cleanups.push(cleanup);
  return cleanup;
}

/** A grid with one 8-row sheet `data` whose query session serves `sources`. */
async function open(sources: Sources) {
  const host = document.body.appendChild(document.createElement("div"));
  const grid = createGrid(host, {
    workbook: { activeSheet: "data", sheets: [{ id: "data", name: "Data", rowCount: 8, columns }] },
  });
  grids.push(grid);
  const requests: QueryFetchRequest[] = [];
  const cleanup = applyQueries(grid, sources, requests);
  return { grid, requests, cleanup, session: await querySessionOf(grid) };
}

function setCell(grid: Grid, row: number, col: number, value: CellValue): void {
  grid.applyTransaction({ patches: [{ op: "set", addr: { sheet: "data", row, col }, value }] });
}

const cell = (grid: Grid, row: number, col: number) =>
  grid.store.getCell({ sheet: "data", row, col }).resolved;
const cells = (grid: Grid, ...addresses: Array<[number, number]>) =>
  addresses.map(([row, col]) => cell(grid, row, col));
const tableRange = (grid: Grid) =>
  grid.store.getWorkbook().sheets[0]?.tables?.find((table) => table.id === "sales-table")?.range;
const bytes = (text: string): Promise<QueryFetchResult> =>
  Promise.resolve({ kind: "bytes", bytes: encoder.encode(text) });

describe("saved query refresh", () => {
  it("writes typed values and cell errors into one table that formulas read, as one undoable change", async () => {
    const feed = "Region,Total,Day\nNorth,5,2024-01-02\nSouth,bad,2024-01-03\nEast,7,1900-01-01\n";
    const { grid, session, requests } = await open({ "sales-feed": feed });
    setCell(grid, 0, 5, { kind: "formula", src: "=SUM(B2,B4)" });

    expect(session.define(unfiltered).status).toBe("applied");
    expect((await session.refresh("sales")).status).toBe("applied");

    expect(cells(grid, [0, 0], [0, 1], [0, 2])).toEqual(["Region", "Total", "Day"]);
    expect(cells(grid, [1, 0], [1, 1], [1, 2])).toEqual(["North", 5, 45293]);
    expect(grid.store.getFormula({ sheet: "data", row: 2, col: 1 })).toBe("=#VALUE!");
    expect(cells(grid, [3, 2], [0, 5])).toEqual([1, 12]);
    expect(tableRange(grid)).toEqual({
      sheet: "data",
      start: { row: 0, col: 0 },
      end: { row: 3, col: 2 },
    });

    // Undo keeps the saved query; redo restores the values without another fetch.
    grid.undo();
    expect(cells(grid, [1, 0], [0, 5])).toEqual([null, 0]);
    expect(tableRange(grid)).toBeUndefined();
    expect(grid.store.getWorkbook().queries?.map((query) => query.id)).toEqual(["sales"]);
    grid.redo();
    expect(cell(grid, 1, 0)).toBe("North");
    expect(requests).toHaveLength(1);
  });

  it("grows into empty rows, shrinks by clearing its old cells and keeps an empty table", async () => {
    let rows = Array.from({ length: 10 }, (_, row) => `R${row},${row},2024-01-01\n`).join("");
    const { grid, session } = await open({
      "sales-feed": () => bytes(`Region,Total,Day\n${rows}`),
    });
    session.define(unfiltered);

    expect((await session.refresh("sales")).status).toBe("applied");
    expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(11);
    expect(cell(grid, 10, 0)).toBe("R9");

    rows = "Only,1,2024-01-01\n";
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(cells(grid, [1, 0], [2, 0])).toEqual(["Only", null]);
    expect(tableRange(grid)?.end.row).toBe(1);

    rows = "";
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(cells(grid, [0, 0], [1, 0])).toEqual(["Region", null]);
    expect(tableRange(grid)?.end.row).toBe(1);
  });

  it("writes logical, date-time and mixed values with their worksheet types", async () => {
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
      output: { table: "events-table", tableName: "Events", anchor: A1 },
    };
    const { grid, session } = await open({
      "events-feed": '[{"At":"2024-01-02T12:00:00","Open":true,"Count":"bad"}]',
    });

    expect(session.define(events).status).toBe("applied");
    expect((await session.refresh("events")).status).toBe("applied");

    expect(cells(grid, [1, 0], [1, 1], [1, 2], [2, 1])).toEqual([45293.5, "Open", true, "Count"]);
    expect(grid.store.getFormula({ sheet: "data", row: 2, col: 2 })).toBe("=#VALUE!");
    expect(grid.store.getCell({ sheet: "data", row: 1, col: 0 }).style.numberFormat).toBe(
      "yyyy-mm-dd hh:mm:ss",
    );
  });

  it("does not overwrite unrelated cells when an output grows", async () => {
    const feed = "Region,Total,Day\nA,1,2024-01-01\nB,2,2024-01-01\nC,3,2024-01-01\n";
    const { grid, session } = await open({ "sales-feed": feed });
    setCell(grid, 3, 1, { kind: "literal", value: "keep" });
    session.define(unfiltered);

    expect(await session.refresh("sales")).toEqual({
      status: "blocked",
      queryId: "sales",
      reason: "occupied",
    });
    expect(cells(grid, [0, 0], [3, 1])).toEqual([null, "keep"]);
  });
});

describe("refresh atomicity", () => {
  it("commits every output together in one undoable transaction, or none when one query fails", async () => {
    const costs: SavedQuery = {
      id: "costs",
      name: "Costs",
      source: {
        kind: "json",
        sourceId: "costs-feed",
        columns: [{ id: "cost", name: "Cost", type: "number" }],
      },
      steps: [
        { kind: "filter", predicate: { kind: "compare", column: "cost", op: "gt", value: 0 } },
      ],
      output: { table: "costs-table", tableName: "Costs", anchor: { ...A1, col: 4 } },
    };
    let costFeed = '[{"Cost":"bad"}]';
    const { grid, session } = await open({
      "sales-feed": SALES_CSV,
      "costs-feed": () => bytes(costFeed),
    });
    session.define(unfiltered);
    session.define(costs);

    expect(await session.refreshAll()).toMatchObject({
      status: "failed",
      queryId: "costs",
      diagnostic: { code: "predicate-error" },
    });
    expect(cell(grid, 0, 0)).toBeNull();

    costFeed = '[{"Cost":3}]';
    expect((await session.refreshAll()).status).toBe("applied");
    expect(cells(grid, [1, 0], [1, 4])).toEqual(["North", 3]);
    grid.undo();
    expect(cells(grid, [1, 0], [1, 4])).toEqual([null, null]);
  });

  it.each([
    ["discards a staged result when its definition changes during the fetch", "stale"],
    ["stops without writing when the host aborts the refresh", "aborted"],
  ] as const)("%s", async (_, status) => {
    const gate = Promise.withResolvers<QueryFetchResult>();
    const { grid, session } = await open({ "sales-feed": () => gate.promise });
    session.define(unfiltered);
    const controller = new AbortController();

    const pending = session.refresh("sales", { signal: controller.signal });
    if (status === "stale") session.define({ ...unfiltered, name: "Renamed sales" });
    else controller.abort();
    gate.resolve(await bytes(SALES_CSV));

    expect(await pending).toEqual({ status });
    expect(cell(grid, 0, 0)).toBeNull();
  });
});

describe("query sources and definitions", () => {
  it("loads joined queries through the host callback only, without credentials", async () => {
    const code = { id: "code", name: "Code", type: "text" as const };
    const regionCodes = {
      ...code,
      bytes: encoder.encode("South"),
      offsets: Uint32Array.of(0, 5),
      validity: Uint8Array.of(1),
      errorRows: new Uint32Array(),
      errorCodes: new Uint32Array(),
      errorPool: [],
    };
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
      const { grid, session, requests } = await open({
        "sales-feed": `${SALES_CSV}South,6,2024-01-03\n`,
        "region-table": async () => ({
          kind: "batch",
          batch: { rowCount: 1, columns: [regionCodes] },
        }),
      });
      const source = { kind: "host" as const, sourceId: "region-table", columns: [code] };
      const join = { kind: "join" as const, input: "regions", join: "leftSemi" as const };
      const joined = { ...unfiltered, steps: [{ ...join, keys: [["region", "code"]] as const }] };
      expect(session.define({ id: "regions", name: "Regions", source, steps: [] }).status).toBe(
        "applied",
      );
      expect(session.define(joined).status).toBe("applied");
      expect((await session.refresh("sales")).status).toBe("applied");

      expect(requests).toEqual([
        { queryId: "regions", sourceId: "region-table", kind: "host" },
        { queryId: "sales", sourceId: "sales-feed", kind: "csv", locator: SALES_URL },
      ]);
      expect(cells(grid, [1, 0], [2, 0])).toEqual(["South", null]);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(globalFetches).toBe(0);
  });

  it("rejects a plan the engine cannot run before saving it, and ends with the add-on's cleanup", async () => {
    const { grid, session, cleanup } = await open({});
    const missing = { ...unfiltered, steps: [{ kind: "select" as const, columns: ["missing"] }] };

    expect(session.define(missing)).toMatchObject({
      status: "invalid",
      diagnostic: { code: "column", column: "missing", step: 0 },
    });
    expect(grid.store.getWorkbook().queries).toBeUndefined();

    cleanup();
    await expect(querySessionOf(grid)).rejects.toMatchObject({
      code: "optional-backend-unavailable",
    });
  });

  it("gives a synced peer the exact refreshed values without fetching", async () => {
    const base = {
      schemaVersion: 1 as const,
      documentId: "query-sync",
      version: 0,
      workbook: { activeSheet: "data" },
      sheets: [{ id: "data", name: "Data", order: 0, rowCount: 8, columns, cells: [] }],
    };
    const adapter = new MemoryPersistenceAdapter(base);
    const [sender, peer] = [0, 1].map(() => {
      const host = document.body.appendChild(document.createElement("div"));
      const grid = createGridFromSnapshot(host, structuredClone(base));
      grids.push(grid);
      return grid;
    }) as [Grid, Grid];
    applyQueries(sender, { "sales-feed": SALES_CSV });
    // The peer gets the add-on without a fetchSource, so it has no session and never fetches.
    applyQueries(peer);
    const options = { documentId: "query-sync", serverVersion: 0 };
    const senderSync = new SyncCoordinator(sender, adapter, options);
    const peerSync = new SyncCoordinator(peer, adapter, options);
    try {
      const session = await querySessionOf(sender);
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

      expect(peer.store.getCell({ ...A1, row: 1 }).resolved).toBe("North");
      expect(peer.store.getWorkbook().queries?.map((query) => query.id)).toEqual(["sales"]);
      await expect(querySessionOf(peer)).rejects.toMatchObject({
        code: "optional-backend-unavailable",
      });
    } finally {
      senderSync.destroy();
      peerSync.destroy();
    }
  });
});
