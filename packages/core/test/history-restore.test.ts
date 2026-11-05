import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { HistoryArchive, MemoryHistoryStorage } from "../src/history-archive.js";
import type { HistoryStorageAdapter, HistoryVersion } from "../src/history-archive.js";
import {
  type CommittedTransaction,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

const DOCUMENT = "book";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => restoreStubs());

/** Data!A1:A8 hold 1..8; Summary!A1 refers to Data!A8. */
function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: DOCUMENT,
    version: 0,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 8,
        columns: [
          { key: "a", header: "A", width: 100, type: "number" },
          { key: "b", header: "B", width: 100, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 8,
            colCount: 1,
            cells: Array.from({ length: 8 }, (_, row) => ({
              rowOffset: row,
              colOffset: 0,
              value: { kind: "literal" as const, value: row + 1 },
            })),
          },
        ],
      },
      {
        id: "summary",
        name: "Summary",
        order: 1,
        rowCount: 4,
        columns: [{ key: "total", header: "Total", width: 100, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "formula", src: "=Data!A8" } }],
          },
        ],
      },
    ],
  };
}

function set(sheet: string, row: number, col: number, value: number | string): DocumentOp {
  return { op: "set", addr: { sheet, row, col }, value: { kind: "literal", value } };
}

function value(grid: Grid, sheet: string, row: number, col: number) {
  return grid.store.getCell({ sheet, row, col }).resolved;
}

/** Journal that keeps the archive and lists what the authority committed. */
class Journal {
  readonly commits: CommittedTransaction[] = [];

  constructor(private readonly archive: HistoryArchive) {}

  async record(commit: CommittedTransaction, capture: () => WorkbookSnapshot): Promise<void> {
    await this.archive.record(commit, capture);
    this.commits.push(commit);
  }
}

interface Session {
  adapter: MemoryPersistenceAdapter;
  archive: HistoryArchive;
  journal: Journal;
}

async function session(
  storage: HistoryStorageAdapter = new MemoryHistoryStorage(),
): Promise<Session> {
  const adapter = new MemoryPersistenceAdapter(snapshot());
  const archive = await HistoryArchive.open({ documentId: DOCUMENT, storage });
  await archive.initialize(snapshot(), 0);

  const journal = new Journal(archive);
  adapter.recordHistory(DOCUMENT, journal);

  return { adapter, archive, journal };
}

interface Client {
  grid: Grid;
  sync: SyncCoordinator;
}

/** A client that loads the authority's current document, as a host does on open. */
async function client(adapter: MemoryPersistenceAdapter, authorId: string): Promise<Client> {
  const loaded = await adapter.load(DOCUMENT);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, loaded);
  const sync = new SyncCoordinator(grid, adapter, {
    documentId: DOCUMENT,
    serverVersion: loaded.version ?? 0,
    authorId,
  });

  return { grid, sync };
}

async function edit(target: Client, patches: DocumentOp[]): Promise<void> {
  const outcome = target.grid.applyTransaction({ patches });
  expect(outcome.status).toBe("applied");
  await target.sync.flush();
}

async function baseline(archive: HistoryArchive): Promise<HistoryVersion> {
  return archive.saveVersion("Baseline", "alice", 0);
}

describe("restore a range", () => {
  it("restores values, formulas and styles as one undoable change", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);

    await edit(alice, [set("data", 0, 0, 100), set("data", 1, 1, 7)]);
    await edit(alice, [
      {
        op: "setRangeStyle",
        range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        style: { bold: true },
      },
    ]);

    let changes = 0;
    alice.grid.on("change", () => changes++);

    const outcome = await archive.restoreVersion(
      alice.grid,
      version.id,
      {
        kind: "range",
        range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      },
      { sync: alice.sync },
    );

    expect(outcome.status).toBe("applied");
    expect(changes).toBe(1);
    expect(value(alice.grid, "data", 0, 0)).toBe(1);
    expect(value(alice.grid, "data", 1, 1)).toBeNull();
    expect(alice.grid.store.getCell({ sheet: "data", row: 0, col: 0 }).style.bold).toBeUndefined();

    alice.grid.undo();
    expect(value(alice.grid, "data", 0, 0)).toBe(100);
    expect(value(alice.grid, "data", 1, 1)).toBe(7);
  });

  it("rejects a range that cuts a merge without changing the document", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);

    await edit(alice, [{ op: "addMerge", sheet: "data", merge: { r0: 2, c0: 0, r1: 3, c1: 1 } }]);

    const restore = archive.restoreVersion(
      alice.grid,
      version.id,
      {
        kind: "range",
        range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
      },
      { sync: alice.sync },
    );

    await expect(restore).rejects.toMatchObject({ code: "invalid-scope" });
    expect(alice.grid.store.getWorkbook().sheets[0]?.merges).toHaveLength(1);
  });
});

describe("restore a sheet", () => {
  it("restores dimensions in place; a reference into a removed tail becomes #REF! and returns on undo", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");

    await edit(alice, [{ op: "removeRows", sheet: "data", at: 4, count: 4 }]);
    const small = await archive.saveVersion("Four rows", "alice", 0);

    await edit(alice, [
      { op: "addRows", sheet: "data", at: 4, count: 4 },
      set("data", 7, 0, 80),
      {
        op: "set",
        addr: { sheet: "summary", row: 0, col: 0 },
        value: { kind: "formula", src: "=Data!A8" },
      },
      { op: "renameSheet", sheet: "data", name: "Numbers" },
      { op: "setNote", addr: { sheet: "data", row: 0, col: 0 }, text: "Later" },
    ]);
    expect(value(alice.grid, "summary", 0, 0)).toBe(80);

    const outcome = await archive.restoreVersion(
      alice.grid,
      small.id,
      { kind: "sheet", sheet: "data" },
      { sync: alice.sync },
    );
    expect(outcome.status).toBe("applied");

    const data = alice.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "data");
    expect(data?.rowCount).toBe(4);
    expect(data?.name).toBe("Data");
    expect(data?.notes ?? []).toEqual([]);
    expect(alice.grid.store.getFormula({ sheet: "summary", row: 0, col: 0 })).toContain("#REF!");

    alice.grid.undo();
    expect(
      alice.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "data")?.rowCount,
    ).toBe(8);
    expect(alice.grid.store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=Numbers!A8");
    expect(value(alice.grid, "summary", 0, 0)).toBe(80);
  });
});

describe("restore the workbook", () => {
  it("re-creates a removed sheet with its ID, removes later sheets and restores names", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");
    await edit(alice, [
      {
        op: "setNamedRange",
        namedRange: {
          name: "Top",
          range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        },
      },
    ]);
    const version = await archive.saveVersion("Named", "alice", 0);

    await edit(alice, [{ op: "removeSheet", sheet: "summary" }]);
    await edit(alice, [
      {
        op: "addSheet",
        sheet: {
          id: "extra",
          name: "Extra",
          order: 1,
          rowCount: 2,
          columns: [{ key: "x", header: "X", width: 80, type: "text" }],
          cells: [],
        },
      },
      { op: "removeNamedRange", name: "Top" },
      set("data", 2, 0, 33),
    ]);

    const outcome = await archive.restoreVersion(
      alice.grid,
      version.id,
      { kind: "workbook" },
      { sync: alice.sync },
    );
    expect(outcome.status).toBe("applied");

    const workbook = alice.grid.store.getWorkbook();
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["data", "summary"]);
    expect(workbook.namedRanges?.map((range) => range.name)).toEqual(["Top"]);
    expect(value(alice.grid, "data", 2, 0)).toBe(3);
    expect(value(alice.grid, "summary", 0, 0)).toBe(8);

    alice.grid.undo();
    expect(alice.grid.store.getWorkbook().sheets.map((sheet) => sheet.id)).toEqual([
      "data",
      "extra",
    ]);
    expect(value(alice.grid, "data", 2, 0)).toBe(33);
  });
});

describe("restore through sync", () => {
  it("sends a restore larger than one server version as one atomic batch", async () => {
    const { adapter, archive, journal } = await session();
    const alice = await client(adapter, "alice");
    const rows = 20_000;
    const text = (row: number) => `${row}:${"x".repeat(230)}`;
    const column = (col: number): DocumentOp => ({
      op: "setBlock",
      range: { sheet: "data", start: { row: 0, col }, end: { row: rows - 1, col } },
      block: {
        rowCount: rows,
        colCount: 1,
        values: Array.from({ length: rows }, (_, row) => text(row)),
      },
    });

    await edit(alice, [{ op: "addRows", sheet: "data", at: 8, count: rows - 8 }]);
    await edit(alice, [column(0)]);
    await edit(alice, [column(1)]);
    const version = await archive.saveVersion("Large", "alice", 0);
    await edit(alice, [
      {
        op: "clearRange",
        range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: rows - 1, col: 1 } },
      },
    ]);

    const bob = await client(adapter, "bob");
    let changes = 0;
    bob.grid.on("change", () => changes++);

    const scope = { kind: "sheet", sheet: "data" } as const;
    const outcome = await archive.restoreVersion(bob.grid, version.id, scope, { sync: bob.sync });
    expect(outcome.status).toBe("applied");
    expect(changes).toBe(1);
    expect(bob.sync.pendingCommits()[0]?.versionOperationCounts?.length).toBeGreaterThan(1);

    await bob.sync.flush();
    const last = journal.commits.at(-1);
    expect((last?.revision ?? 0) - (last?.baseRevision ?? 0)).toBeGreaterThan(1);
    expect(value(bob.grid, "data", rows - 1, 1)).toBe(text(rows - 1));
  }, 60_000);

  it("records the restorer and the version it restores", async () => {
    const { adapter, archive, journal } = await session();
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);
    await edit(alice, [set("data", 0, 0, 9)]);

    const bob = await client(adapter, "bob");
    await archive.restoreVersion(
      bob.grid,
      version.id,
      { kind: "sheet", sheet: "data" },
      { sync: bob.sync },
    );
    await bob.sync.flush();

    const last = journal.commits.at(-1);
    expect(last?.authorId).toBe("bob");
    expect(last?.restore).toEqual({ versionId: version.id, scope: "sheet" });
    expect((await adapter.load(DOCUMENT)).version).toBe(2);
  });

  it("lets only one of two concurrent restores commit; the other must reload", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);
    await edit(alice, [set("data", 0, 0, 9)]);
    const later = await archive.saveVersion("Later", "alice", 0);
    await edit(alice, [set("data", 0, 0, 10)]);

    const bob = await client(adapter, "bob");
    const carol = await client(adapter, "carol");

    await archive.restoreVersion(bob.grid, version.id, { kind: "workbook" }, { sync: bob.sync });
    await archive.restoreVersion(carol.grid, later.id, { kind: "workbook" }, { sync: carol.sync });

    await bob.sync.flush();
    await carol.sync.flush();

    expect((await adapter.load(DOCUMENT)).version).toBe(3);
    expect(carol.sync.state.activity).toBe("conflict");
    expect(await carol.sync.recoverConflict()).toMatchObject({
      status: "reload-required",
      reason: "restore",
    });
  });

  it("refuses to restore while local edits are pending", async () => {
    const { adapter, archive } = await session();
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);
    alice.sync.setOnline(false);
    alice.grid.applyTransaction({ patches: [set("data", 0, 0, 5)] });

    const restore = archive.restoreVersion(
      alice.grid,
      version.id,
      { kind: "workbook" },
      { sync: alice.sync },
    );
    await expect(restore).rejects.toMatchObject({ code: "conflict" });
    expect(value(alice.grid, "data", 0, 0)).toBe(5);
  });

  it("drops a plan when the document changes while the version is being read", async () => {
    const durable = new MemoryHistoryStorage();
    let pause: PromiseWithResolvers<void> | undefined;
    const storage: HistoryStorageAdapter = {
      put: (request) => durable.put(request),
      list: (request) => durable.list(request),
      prune: (request) => durable.prune(request),
      get: async (request) => {
        if (pause && request.kind === "record") await pause.promise;
        return durable.get(request);
      },
    };

    const { adapter, archive } = await session(storage);
    const alice = await client(adapter, "alice");
    const version = await baseline(archive);

    pause = Promise.withResolvers<void>();
    const restore = archive.restoreVersion(
      alice.grid,
      version.id,
      { kind: "workbook" },
      { sync: alice.sync },
    );
    alice.grid.applyRemoteOperations([set("data", 3, 0, 44)]);
    pause.resolve();

    await expect(restore).rejects.toMatchObject({ code: "conflict" });
    expect(value(alice.grid, "data", 3, 0)).toBe(44);
  });
});
