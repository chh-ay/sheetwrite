import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { HistoryArchive, MemoryHistoryStorage } from "../src/history-archive.js";
import type {
  HistoryGetRequest,
  HistoryLimits,
  HistoryStorageAdapter,
  HistoryVersion,
} from "../src/history-archive.js";
import {
  type CommittedTransaction,
  createGridFromSnapshot,
  type DocumentOp,
  type ExternalLink,
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

/** Data!A1:A8 hold 1..8; Summary!A1 refers to Data!A8. `dataName` names the Data sheet. */
function snapshot(dataName = "Data"): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: DOCUMENT,
    version: 0,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: dataName,
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
  /** A client of the author "alice", open on the first version. */
  alice: Client;
}

async function session(
  storage: HistoryStorageAdapter = new MemoryHistoryStorage(),
  dataName = "Data",
  limits: Partial<HistoryLimits> = {},
): Promise<Session> {
  const adapter = new MemoryPersistenceAdapter(snapshot(dataName));
  const archive = await HistoryArchive.open({ documentId: DOCUMENT, storage, limits });
  await archive.initialize(snapshot(dataName), 0);

  const journal = new Journal(archive);
  adapter.recordHistory(DOCUMENT, journal);

  return { adapter, archive, journal, alice: await client(adapter, "alice") };
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

function restore(
  archive: HistoryArchive,
  target: Client,
  versionId: string,
  scope: Parameters<HistoryArchive["restoreVersion"]>[2],
) {
  return archive.restoreVersion(target.grid, versionId, scope, { sync: target.sync });
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
    const { archive, alice } = await session();
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

    const outcome = await restore(archive, alice, version.id, {
      kind: "range",
      range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    });

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
    const { archive, alice } = await session();
    const version = await baseline(archive);

    await edit(alice, [{ op: "addMerge", sheet: "data", merge: { r0: 2, c0: 0, r1: 3, c1: 1 } }]);

    const pending = restore(archive, alice, version.id, {
      kind: "range",
      range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
    });

    await expect(pending).rejects.toMatchObject({ code: "invalid-scope" });
    expect(alice.grid.store.getWorkbook().sheets[0]?.merges).toHaveLength(1);
  });
});

describe("restore a sheet", () => {
  it("restores dimensions in place; a reference into a removed tail becomes #REF! and returns on undo", async () => {
    const { archive, alice } = await session();

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

    const outcome = await restore(archive, alice, small.id, { kind: "sheet", sheet: "data" });
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

describe("restore a sheet named History", () => {
  it("gives the sheet back the name History, which only a user's rename refuses", async () => {
    const { archive, alice } = await session(new MemoryHistoryStorage(), "History");
    const named = await archive.saveVersion("Named History", "alice", 0);
    await edit(alice, [{ op: "renameSheet", sheet: "data", name: "Numbers" }]);

    const outcome = await restore(archive, alice, named.id, { kind: "sheet", sheet: "data" });
    expect(outcome.status).toBe("applied");
    const data = alice.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "data");
    expect(data?.name).toBe("History");
  });
});

describe("restore the workbook", () => {
  it("re-creates a removed sheet with its ID, removes later sheets and restores names", async () => {
    const { archive, alice } = await session();
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

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });
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

  /** A 128-row Data sheet whose row 64 holds 640 in column B, saved as a version. */
  async function longVersion() {
    const opened = await session();
    await edit(opened.alice, [
      { op: "addRows", sheet: "data", at: 8, count: 120 },
      set("data", 64, 1, 640),
    ]);
    const version = await opened.archive.saveVersion("Long", "alice", 0);

    return { ...opened, version };
  }

  /** Whether an operation of an applied restore writes `row` of sheet Data. */
  function writesRow(outcome: Awaited<ReturnType<typeof restore>>, row: number): boolean {
    const patches = outcome.status === "applied" ? outcome.transaction.patches : [];
    return patches.some(
      (patch) =>
        "range" in patch &&
        patch.range?.sheet === "data" &&
        Math.min(patch.range.start.row, patch.range.end.row) <= row &&
        Math.max(patch.range.start.row, patch.range.end.row) >= row,
    );
  }

  it("rewrites only the rows whose cells differ from the version", async () => {
    const { archive, alice, version } = await longVersion();
    await edit(alice, [set("data", 2, 0, 33), set("data", 110, 1, 1100)]);

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });
    expect(outcome.status).toBe("applied");

    // Row 64 holds the version's cells already, so no operation of the restore writes it.
    expect(writesRow(outcome, 64)).toBe(false);
    expect([value(alice.grid, "data", 2, 0), value(alice.grid, "data", 110, 1)]).toEqual([3, null]);
    expect(value(alice.grid, "data", 64, 1)).toBe(640);
  });

  const reshaped: Array<[string, DocumentOp]> = [
    ["rows were removed", { op: "removeRows", sheet: "data", at: 120, count: 3 }],
    ["a column changed", { op: "setColumn", sheet: "data", col: 1, patch: { width: 140 } }],
  ];

  it.each(reshaped)("rewrites the whole sheet when %s since the version", async (_, change) => {
    const { archive, alice, version } = await longVersion();
    await edit(alice, [change, set("data", 2, 0, 33)]);

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });
    expect(outcome.status).toBe("applied");

    // Row 64 did not change, but the whole sheet is written again.
    expect(writesRow(outcome, 64)).toBe(true);
    expect([value(alice.grid, "data", 2, 0), value(alice.grid, "data", 64, 1)]).toEqual([3, 640]);
  });

  it("restores the version exactly in every scope when only some rows differ, and undo returns the live cells", async () => {
    /** Cells and notes of each sheet, cell by cell, inside `rect` when given. */
    const contents = (book: WorkbookSnapshot, rect?: { r0: number; r1: number }) =>
      book.sheets.map((sheet) => {
        const inside = (row: number) => !rect || (row >= rect.r0 && row <= rect.r1);
        const cells = sheet.cells
          .flatMap((block) =>
            block.cells.map((cell) => ({
              row: block.startRow + cell.rowOffset,
              col: block.startCol + cell.colOffset,
              value: cell.value,
              style: cell.style ?? {},
            })),
          )
          .filter((cell) => inside(cell.row))
          .sort((a, b) => a.row - b.row || a.col - b.col);
        const notes = (sheet.notes ?? [])
          .filter((note) => inside(note.addr.row))
          .sort((a, b) => a.addr.row - b.addr.row || a.addr.col - b.addr.col);
        return { id: sheet.id, cells, notes };
      });

    /** Random edits on Data!A1:B200: values, formulas, clears, styles and notes. */
    const edits = (random: () => number, count: number): DocumentOp[] =>
      Array.from({ length: count }, (): DocumentOp => {
        const row = Math.floor(random() * 200);
        const col = Math.floor(random() * 2);
        const addr = { sheet: "data", row, col };
        const range = { sheet: "data", start: { row, col }, end: { row, col } };
        switch (Math.floor(random() * 6)) {
          case 0:
            return set("data", row, col, Math.floor(random() * 5));
          case 1:
            return set("data", row, col, String(Math.floor(random() * 5)));
          case 2:
            return { op: "set", addr, value: { kind: "formula", src: `=A${1 + (row % 8)}+1` } };
          case 3:
            return { op: "clearRange", range, contents: true, style: random() < 0.5 };
          case 4:
            return { op: "setRangeStyle", range, style: { bold: random() < 0.5 } };
          default:
            return { op: "setNote", addr, text: random() < 0.3 ? null : `n${row % 3}` };
        }
      });

    const scopes: Parameters<HistoryArchive["restoreVersion"]>[2][] = [
      { kind: "workbook" },
      { kind: "sheet", sheet: "data" },
      {
        kind: "range",
        range: { sheet: "data", start: { row: 30, col: 0 }, end: { row: 170, col: 1 } },
      },
    ];

    // Default limits keep every edit in the log tail, so the restore rebuilds the
    // version whole; a checkpoint every one or two commits lets a restore at the
    // synchronized head read only the pages that differ.
    const cadences: Array<Partial<HistoryLimits>> = [
      {},
      { checkpointTransactions: 1 },
      { checkpointTransactions: 2 },
    ];
    for (const [index, [scope, limits]] of scopes
      .flatMap((scope) => cadences.map((limits) => [scope, limits] as const))
      .entries()) {
      let seed = 7 + index;
      const random = () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed / 2_147_483_648;
      };

      const { archive, alice } = await session(new MemoryHistoryStorage(), "Data", limits);
      await edit(alice, [
        { op: "addRows", sheet: "data", at: 8, count: 192 },
        ...edits(random, 120),
      ]);
      const version = await archive.saveVersion("Random", "alice", 0);
      for (let round = 0; round < 6; round++) {
        await edit(alice, edits(random, 1 + Math.floor(random() * 12)));
      }

      const live = contents(alice.grid.exportSnapshot());
      const rect = scope.kind === "range" ? { r0: 30, r1: 170 } : undefined;
      const outcome = await restore(archive, alice, version.id, scope);
      expect(outcome.status).toBe("applied");

      const historical = await archive.readVersion(version.id);
      const restored = contents(alice.grid.exportSnapshot(), rect);
      expect(restored.find((sheet) => sheet.id === "data")).toEqual(
        contents(historical, rect).find((sheet) => sheet.id === "data"),
      );

      alice.grid.undo();
      expect(contents(alice.grid.exportSnapshot())).toEqual(live);
    }
  });
});

describe("restore external links", () => {
  it("brings back the earlier link values, and undo puts back the current ones", async () => {
    const link = (value: number): ExternalLink => ({
      book: "Budget.xlsx",
      target: "Budget.xlsx",
      sheets: [{ name: "Annual", cells: [{ row: 0, col: 0, value }] }],
    });
    const { archive, alice } = await session();
    await edit(alice, [
      { op: "setExternalLinks", links: [link(7)] },
      {
        op: "set",
        addr: { sheet: "data", row: 2, col: 0 },
        value: { kind: "formula", src: "=[Budget.xlsx]Annual!A1" },
      },
    ]);
    const version = await archive.saveVersion("Linked", "alice", 0);
    await edit(alice, [{ op: "setExternalLinks", links: [link(9)] }]);
    expect(value(alice.grid, "data", 2, 0)).toBe(9);

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });
    expect(outcome.status).toBe("applied");
    expect(alice.grid.store.getWorkbook().externalLinks).toEqual([link(7)]);
    expect(value(alice.grid, "data", 2, 0)).toBe(7);

    alice.grid.undo();
    expect(alice.grid.store.getWorkbook().externalLinks).toEqual([link(9)]);
    expect(value(alice.grid, "data", 2, 0)).toBe(9);
  });
});

/** Memory storage that counts the cell pages it hands out. */
class PageCountingStorage extends MemoryHistoryStorage {
  cellPageReads = 0;

  override async get(request: HistoryGetRequest) {
    const response = await super.get(request);
    if ("bytes" in response && response.kind === "cells") {
      this.cellPageReads += 1;
    }

    return response;
  }
}

describe("restore through sync", () => {
  /**
   * A 208-row Data sheet with a checkpoint after every commit, saved as a
   * version, then two edits; and the cell pages that rebuilding that version
   * whole reads.
   */
  async function atHeadSession() {
    const storage = new PageCountingStorage();
    const opened = await session(storage, "Data", { checkpointTransactions: 1 });
    await edit(opened.alice, [
      { op: "addRows", sheet: "data", at: 8, count: 200 },
      ...Array.from({ length: 200 }, (_, row) => set("data", 8 + row, 1, row)),
    ]);
    const version = await opened.archive.saveVersion("Long", "alice", 0);
    await edit(opened.alice, [set("data", 2, 0, 33), set("data", 150, 1, -1)]);

    const before = storage.cellPageReads;
    await (await HistoryArchive.open({ documentId: DOCUMENT, storage })).readVersion(version.id);
    const wholeReads = storage.cellPageReads - before;

    const reads = async (action: () => Promise<unknown>) => {
      const start = storage.cellPageReads;
      await action();
      return storage.cellPageReads - start;
    };

    return { ...opened, version, wholeReads, reads };
  }

  it("restores a document at the archive head from the pages that differ", async () => {
    const { archive, alice, version, wholeReads, reads } = await atHeadSession();

    let outcome: Awaited<ReturnType<typeof restore>> | undefined;
    const read = await reads(async () => {
      outcome = await restore(archive, alice, version.id, { kind: "workbook" });
    });

    expect(outcome?.status).toBe("applied");
    expect(read).toBeLessThan(wholeReads);
    expect([value(alice.grid, "data", 2, 0), value(alice.grid, "data", 150, 1)]).toEqual([3, 142]);
    alice.grid.undo();
    expect([value(alice.grid, "data", 2, 0), value(alice.grid, "data", 150, 1)]).toEqual([33, -1]);
  });

  it("rebuilds the version whole when another client moved the archive head", async () => {
    const { adapter, archive, alice, version, wholeReads, reads } = await atHeadSession();
    const bob = await client(adapter, "bob");
    // Bob has not received this edit: his server version is behind the archive head.
    await edit(alice, [set("data", 100, 1, -2)]);

    let outcome: Awaited<ReturnType<typeof restore>> | undefined;
    const read = await reads(async () => {
      outcome = await restore(archive, bob, version.id, { kind: "workbook" });
    });

    expect(outcome?.status).toBe("applied");
    expect(read).toBe(wholeReads);
    const cells = () => [value(bob.grid, "data", 2, 0), value(bob.grid, "data", 150, 1)];
    expect(cells()).toEqual([3, 142]);
    bob.grid.undo();
    expect(cells()).toEqual([33, -1]);
  });

  it.each([
    ["local edits are not sent yet", false],
    ["a request is in flight", true],
  ])("refuses to restore before reading any page when %s", async (_, flushing) => {
    const { archive, alice, version, reads } = await atHeadSession();
    alice.grid.applyTransaction({ patches: [set("data", 7, 0, 70)] });
    const sending = flushing ? alice.sync.flush() : undefined;

    const read = await reads(async () => {
      await expect(restore(archive, alice, version.id, { kind: "workbook" })).rejects.toMatchObject(
        {
          code: "conflict",
        },
      );
    });
    await sending;

    expect(read).toBe(0);
    expect([value(alice.grid, "data", 2, 0), value(alice.grid, "data", 7, 0)]).toEqual([33, 70]);
  });

  it("restores a cell that the version's log tail wrote and a later edit put back", async () => {
    const { archive, alice } = await session(new MemoryHistoryStorage(), "Data", {
      checkpointTransactions: 2,
    });
    await edit(alice, [set("data", 5, 0, -1)]);
    const version = await archive.saveVersion("Tail", "alice", 0);
    // The next checkpoint holds A6 as it was before the version, like the version's checkpoint.
    await edit(alice, [set("data", 5, 0, 6)]);

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });
    expect(outcome.status).toBe("applied");
    expect(value(alice.grid, "data", 5, 0)).toBe(-1);
  });

  it("sends a restore larger than one server version as one atomic batch", async () => {
    const { adapter, archive, journal, alice } = await session();
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
    const outcome = await restore(archive, bob, version.id, scope);
    expect(outcome.status).toBe("applied");
    expect(changes).toBe(1);
    expect(bob.sync.pendingCommits()[0]?.versionOperationCounts?.length).toBeGreaterThan(1);

    await bob.sync.flush();
    const last = journal.commits.at(-1);
    expect((last?.revision ?? 0) - (last?.baseRevision ?? 0)).toBeGreaterThan(1);
    expect(value(bob.grid, "data", rows - 1, 1)).toBe(text(rows - 1));
  }, 60_000);

  it("records the restorer and the version it restores", async () => {
    const { adapter, archive, journal, alice } = await session();
    const version = await baseline(archive);
    await edit(alice, [set("data", 0, 0, 9)]);

    const bob = await client(adapter, "bob");
    await restore(archive, bob, version.id, { kind: "sheet", sheet: "data" });
    await bob.sync.flush();

    const last = journal.commits.at(-1);
    expect(last?.authorId).toBe("bob");
    expect(last?.restore).toEqual({ versionId: version.id, scope: "sheet" });
    expect((await adapter.load(DOCUMENT)).version).toBe(2);
  });

  it("lets only one of two concurrent restores commit; the other must reload", async () => {
    const { adapter, archive, alice } = await session();
    const version = await baseline(archive);
    await edit(alice, [set("data", 0, 0, 9)]);
    const later = await archive.saveVersion("Later", "alice", 0);
    await edit(alice, [set("data", 0, 0, 10)]);

    const bob = await client(adapter, "bob");
    const carol = await client(adapter, "carol");

    await restore(archive, bob, version.id, { kind: "workbook" });
    await restore(archive, carol, later.id, { kind: "workbook" });

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
    const { archive, alice } = await session();
    const version = await baseline(archive);
    alice.sync.setOnline(false);
    alice.grid.applyTransaction({ patches: [set("data", 0, 0, 5)] });

    const pending = restore(archive, alice, version.id, { kind: "workbook" });
    await expect(pending).rejects.toMatchObject({ code: "conflict" });
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

    const { archive, alice } = await session(storage);
    const version = await baseline(archive);

    pause = Promise.withResolvers<void>();
    const pending = restore(archive, alice, version.id, { kind: "workbook" });
    alice.grid.applyRemoteOperations([set("data", 3, 0, 44)]);
    pause.resolve();

    await expect(pending).rejects.toMatchObject({ code: "conflict" });
    expect(value(alice.grid, "data", 3, 0)).toBe(44);
  });
});

describe("restore a dashboard", () => {
  it("restores the items of a dashboard in place, without cell operations on it", async () => {
    const { archive, alice } = await session();
    const slicer = {
      id: "region",
      box: { x: 0, y: 0, w: 4, h: 4 },
      kind: "slicer" as const,
      field: { table: "orders", column: "region" },
      selected: ["East"],
    };
    await edit(alice, [
      {
        op: "addSheet",
        sheet: {
          id: "dash",
          name: "Dash",
          order: 2,
          kind: "dashboard",
          dashboard: { items: [slicer] },
          rowCount: 0,
          columns: [],
          cells: [],
        },
      },
    ]);
    const version = await archive.saveVersion("Dashboard", "alice", 0);

    await edit(alice, [
      { op: "setDashboardItem", sheet: "dash", item: { ...slicer, selected: ["West"] } },
      {
        op: "setDashboardItem",
        sheet: "dash",
        item: { ...slicer, id: "later", box: { x: 4, y: 0, w: 4, h: 4 } },
      },
    ]);

    const outcome = await restore(archive, alice, version.id, { kind: "workbook" });

    expect(outcome.status).toBe("applied");
    expect(alice.grid.store.getWorkbook().sheets[2]?.dashboard).toEqual({ items: [slicer] });
  });
});
