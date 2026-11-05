import { beforeAll, describe, expect, it } from "bun:test";

import {
  HISTORY_DIFF_NONE,
  HistoryArchive,
  HistoryDiffFlag,
  type HistoryDiffPage,
  type HistoryDiffRequest,
  type HistoryLimits,
  type HistoryVersion,
  MemoryHistoryStorage,
} from "../src/history-archive.js";
import {
  type CommittedTransaction,
  type DocumentOp,
  initSheetwrite,
  SheetwriteStore,
  type WorkbookSnapshot,
} from "../src/index.js";

const DOCUMENT = "book";

beforeAll(async () => {
  await initSheetwrite();
});

/** Data has 6 rows and 3 columns; A1:A6 hold 1..6. Notes is empty. */
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
        rowCount: 6,
        columns: ["a", "b", "c"].map((key) => ({ key, header: key, width: 80, type: "number" })),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 6,
            colCount: 1,
            cells: Array.from({ length: 6 }, (_, row) => ({
              rowOffset: row,
              colOffset: 0,
              value: { kind: "literal" as const, value: row + 1 },
            })),
          },
        ],
      },
      {
        id: "notes",
        name: "Notes",
        order: 1,
        rowCount: 2,
        columns: [{ key: "n", header: "N", width: 80, type: "text" }],
        cells: [],
      },
    ],
  };
}

function set(sheet: string, row: number, col: number, value: number | string): DocumentOp {
  return { op: "set", addr: { sheet, row, col }, value: { kind: "literal", value } };
}

/** An authority that applies commits to a store and records them in an archive. */
class Authority {
  private revision = 0;

  private constructor(
    readonly archive: HistoryArchive,
    private readonly store: SheetwriteStore,
  ) {}

  static async open(limits: Partial<HistoryLimits> = {}): Promise<Authority> {
    const archive = await HistoryArchive.open({
      documentId: DOCUMENT,
      storage: new MemoryHistoryStorage(),
      limits,
    });
    await archive.initialize(snapshot(), 0);

    return new Authority(archive, SheetwriteStore.fromSnapshot(snapshot()));
  }

  async commit(authorId: string, operations: DocumentOp[]): Promise<void> {
    const outcome = this.store.applyTransaction({ patches: operations }, { source: "remote" });
    expect(outcome.status).toBe("applied");

    this.revision += 1;
    const commit: CommittedTransaction = {
      baseRevision: this.revision - 1,
      revision: this.revision,
      mutationId: `m${this.revision}`,
      authorId,
      time: this.revision * 1000,
      operations,
    };

    await this.archive.record(commit, () => ({
      ...this.store.exportSnapshot(),
      documentId: DOCUMENT,
      version: this.revision,
    }));
  }

  save(name: string): Promise<HistoryVersion> {
    return this.archive.saveVersion(name, "alice", this.revision * 1000);
  }
}

/** Changes of one page as readable rows. */
function rows(page: HistoryDiffPage) {
  return Array.from(page.cells.flags, (flags, at) => ({
    sheet: page.sheetIds[page.cells.sheet[at] ?? 0],
    row: page.cells.row[at],
    col: page.cells.col[at],
    beforeRow: page.cells.beforeRow[at],
    flags,
    author: page.authors[page.cells.author[at] ?? HISTORY_DIFF_NONE] ?? null,
  }));
}

async function diff(authority: Authority, request: HistoryDiffRequest): Promise<HistoryDiffPage> {
  return authority.archive.diffVersions(request);
}

describe("history diff", () => {
  it("reports changed values, formulas and styles with before, after and the last writer", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");

    await authority.commit("alice", [set("data", 0, 0, 100)]);
    await authority.commit("bob", [
      {
        op: "set",
        addr: { sheet: "data", row: 1, col: 1 },
        value: { kind: "formula", src: "=A1*2" },
      },
      {
        op: "setRangeStyle",
        range: { sheet: "data", start: { row: 2, col: 0 }, end: { row: 2, col: 0 } },
        style: { bold: true },
      },
    ]);
    const end = await authority.save("End");

    const page = await diff(authority, { from: start.id, to: end.id });

    expect(rows(page)).toEqual([
      {
        sheet: "data",
        row: 0,
        col: 0,
        beforeRow: 0,
        flags: HistoryDiffFlag.value,
        author: "alice",
      },
      {
        sheet: "data",
        row: 1,
        col: 1,
        beforeRow: 1,
        flags: HistoryDiffFlag.added | HistoryDiffFlag.formula,
        author: "bob",
      },
      { sheet: "data", row: 2, col: 0, beforeRow: 2, flags: HistoryDiffFlag.style, author: "bob" },
    ]);
    expect(page.details[0]).toMatchObject({ before: { value: 1 }, after: { value: 100 } });
    expect(page.details[1]).toMatchObject({ after: { formula: "=A1*2", value: 200 } });
    expect(page.details[2]?.after.style).toEqual({ bold: true });
    expect(page.logComplete).toBe(true);
    expect(page.cursor).toBeUndefined();
  });

  it("aligns rows and columns through inserts and moves, so shifted cells are not changes", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");

    await authority.commit("alice", [{ op: "addRows", sheet: "data", at: 0, count: 2 }]);
    await authority.commit("alice", [set("data", 0, 0, 7)]);
    await authority.commit("bob", [{ op: "moveRows", sheet: "data", from: 2, count: 1, to: 7 }]);
    await authority.commit("bob", [
      {
        op: "addColumns",
        sheet: "data",
        at: 0,
        columns: [{ key: "z", header: "Z", width: 80, type: "number" }],
      },
    ]);
    await authority.commit("carol", [set("data", 4, 1, 50)]);
    const end = await authority.save("End");

    const page = await diff(authority, { from: start.id, to: end.id });

    expect(rows(page)).toEqual([
      {
        sheet: "data",
        row: 0,
        col: 1,
        beforeRow: HISTORY_DIFF_NONE,
        flags: HistoryDiffFlag.added,
        author: "alice",
      },
      {
        sheet: "data",
        row: 4,
        col: 1,
        beforeRow: 3,
        flags: HistoryDiffFlag.value,
        author: "carol",
      },
    ]);
  });

  it("reports a clear as a removal and keeps every writer of a cell", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");

    await authority.commit("alice", [set("data", 3, 0, 40)]);
    await authority.commit("bob", [set("data", 3, 0, 41)]);
    await authority.commit("carol", [
      {
        op: "clearRange",
        range: { sheet: "data", start: { row: 5, col: 0 }, end: { row: 5, col: 0 } },
        contents: true,
      },
    ]);
    const end = await authority.save("End");

    const page = await diff(authority, { from: start.id, to: end.id });

    expect(rows(page)).toEqual([
      { sheet: "data", row: 3, col: 0, beforeRow: 3, flags: HistoryDiffFlag.value, author: "bob" },
      {
        sheet: "data",
        row: 5,
        col: 0,
        beforeRow: 5,
        flags: HistoryDiffFlag.removed,
        author: "carol",
      },
    ]);
    expect(page.details[0]?.writers.map((index) => page.authors[index])).toEqual(["alice", "bob"]);
  });

  it("lists removed, added and renamed sheets, and the cells of an added sheet", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");

    await authority.commit("alice", [{ op: "removeSheet", sheet: "notes" }]);
    await authority.commit("bob", [
      {
        op: "addSheet",
        sheet: {
          id: "extra",
          name: "Extra",
          order: 1,
          rowCount: 2,
          columns: [{ key: "x", header: "X", width: 80, type: "number" }],
          cells: [],
        },
      },
    ]);
    await authority.commit("bob", [set("extra", 1, 0, 9)]);
    await authority.commit("carol", [{ op: "renameSheet", sheet: "data", name: "Figures" }]);
    const end = await authority.save("End");

    const page = await diff(authority, { from: start.id, to: end.id });

    expect(page.sheets).toEqual([
      { sheet: "data", name: "Figures", change: "changed", fields: ["name"], author: 2 },
      { sheet: "extra", name: "Extra", change: "added", fields: [], author: 1 },
      { sheet: "notes", name: "Notes", change: "removed", fields: [], author: 0 },
    ]);
    expect(page.authors).toEqual(["alice", "bob", "carol"]);
    expect(rows(page)).toEqual([
      {
        sheet: "extra",
        row: 1,
        col: 0,
        beforeRow: HISTORY_DIFF_NONE,
        flags: HistoryDiffFlag.added,
        author: "bob",
      },
    ]);
  });

  it("compares styles by content when the versions come from different checkpoints", async () => {
    const authority = await Authority.open({ checkpointTransactions: 1 });

    await authority.commit("alice", [
      {
        op: "setRangeStyle",
        range: { sheet: "data", start: { row: 4, col: 0 }, end: { row: 4, col: 0 } },
        style: { italic: true },
      },
    ]);
    const start = await authority.save("Start");

    await authority.commit("bob", [
      {
        op: "setRangeStyle",
        range: { sheet: "data", start: { row: 0, col: 2 }, end: { row: 0, col: 2 } },
        style: { bold: true },
      },
    ]);
    await authority.commit("bob", [set("data", 1, 2, 5)]);
    const end = await authority.save("End");

    const page = await diff(authority, { from: start.id, to: end.id });

    expect(rows(page)).toEqual([
      { sheet: "data", row: 0, col: 2, beforeRow: 0, flags: HistoryDiffFlag.style, author: "bob" },
      { sheet: "data", row: 1, col: 2, beforeRow: 1, flags: HistoryDiffFlag.added, author: "bob" },
    ]);
    expect(page.logComplete).toBe(true);
  });

  it("pages with a cursor until every change is returned once", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");
    await authority.commit("alice", [
      ...Array.from({ length: 6 }, (_, row) => set("data", row, 1, row)),
      ...Array.from({ length: 6 }, (_, row) => set("data", row, 2, row)),
    ]);
    const end = await authority.save("End");

    const seen: string[] = [];
    let cursor: HistoryDiffPage["cursor"];
    let pages = 0;
    do {
      const page = await diff(authority, { from: start.id, to: end.id, maxEntries: 5, cursor });
      seen.push(...rows(page).map((change) => `${change.row}:${change.col}`));
      cursor = page.cursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 6 }, (_, row) => [`${row}:1`, `${row}:2`]).flat());
  });

  it("rejects an aborted request with its reason and a page larger than 1,000", async () => {
    const authority = await Authority.open();
    const start = await authority.save("Start");
    const controller = new AbortController();
    const reason = new Error("closed");
    controller.abort(reason);

    await expect(
      diff(authority, { from: start.id, to: start.id, signal: controller.signal }),
    ).rejects.toBe(reason);
    await expect(
      diff(authority, { from: start.id, to: start.id, maxEntries: 1_001 }),
    ).rejects.toMatchObject({ code: "invalid-scope" });
  });
});
