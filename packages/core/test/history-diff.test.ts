import { beforeAll, describe, expect, it } from "bun:test";

import {
  DEFAULT_HISTORY_LIMITS,
  HISTORY_DIFF_NONE,
  HistoryArchive,
  HistoryDiffFlag,
  type HistoryDiffPage,
  type HistoryDiffRequest,
  type HistoryGetRequest,
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
import { diffStores } from "../src/version-history/diff.js";

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

/**
 * A `rows` × `cols` sheet "data" whose cells hold `value(row, col)`, distinct
 * numbers by default; `undefined` leaves a cell empty. Sheet "notes" is empty.
 */
function grid(
  rows: number,
  cols: number,
  value: (row: number, col: number) => number | undefined = (row, col) => row * cols + col,
): WorkbookSnapshot {
  const base = snapshot();
  const [data] = base.sheets;
  if (!data) {
    throw new Error("Missing fixture sheet");
  }

  data.rowCount = rows;
  data.columns = Array.from({ length: cols }, (_, col) => ({
    key: `c${col}`,
    header: `C${col}`,
    width: 80,
    type: "number",
  }));
  data.cells = [
    {
      startRow: 0,
      startCol: 0,
      rowCount: rows,
      colCount: cols,
      cells: Array.from({ length: rows * cols }, (_, at) => {
        const rowOffset = Math.floor(at / cols);
        const colOffset = at % cols;
        const literal = value(rowOffset, colOffset);
        return literal === undefined
          ? []
          : [{ rowOffset, colOffset, value: { kind: "literal" as const, value: literal } }];
      }).flat(),
    },
  ];

  return base;
}

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

/** An authority that applies commits to a store and records them in an archive. */
class Authority {
  private revision = 0;
  readonly commits: CommittedTransaction[] = [];
  /** Versions saved so far, oldest first. */
  readonly versions: HistoryVersion[] = [];
  /** The document at each checkpoint the archive took, by revision. */
  private readonly checkpoints = new Map<number, WorkbookSnapshot>();

  private constructor(
    readonly archive: HistoryArchive,
    readonly storage: PageCountingStorage,
    readonly store: SheetwriteStore,
  ) {}

  static async open(
    limits: Partial<HistoryLimits> = {},
    initial: () => WorkbookSnapshot = snapshot,
  ): Promise<Authority> {
    const storage = new PageCountingStorage();
    const archive = await HistoryArchive.open({ documentId: DOCUMENT, storage, limits });
    await archive.initialize(initial(), 0);

    const authority = new Authority(archive, storage, SheetwriteStore.fromSnapshot(initial()));
    authority.checkpoints.set(0, initial());

    return authority;
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
    this.commits.push(commit);

    await this.archive.record(commit, () => {
      const captured = {
        ...this.store.exportSnapshot(),
        documentId: DOCUMENT,
        version: this.revision,
      };
      this.checkpoints.set(this.revision, captured);
      return captured;
    });
  }

  /**
   * Rebuild `version` as the archive did before pages: its checkpoint's
   * document, then its log tail as one replayed transaction.
   */
  async replayed(version: HistoryVersion): Promise<SheetwriteStore> {
    const marker = await this.storage.get({
      kind: "version",
      documentId: DOCUMENT,
      id: version.id,
      limits: DEFAULT_HISTORY_LIMITS,
    });
    if (!("tail" in marker)) {
      throw new Error("Missing version marker");
    }

    const base = marker.revision - marker.tail.length;
    const checkpoint = this.checkpoints.get(base);
    if (!checkpoint) {
      throw new Error(`No checkpoint at revision ${base}`);
    }

    const store = SheetwriteStore.fromSnapshot(checkpoint);
    const tail = this.commits
      .filter((commit) => commit.revision > base && commit.revision <= marker.revision)
      .flatMap((commit) => commit.operations);
    if (tail.length > 0) {
      store.applyTransaction({ patches: tail }, { source: "remote" });
    }

    return store;
  }

  async save(name: string): Promise<HistoryVersion> {
    const version = await this.archive.saveVersion(name, "alice", this.revision * 1000);
    this.versions.push(version);

    return version;
  }

  /** Cell pages that rebuilding `version` whole reads, through an archive that keeps nothing yet. */
  async wholeReads(version: HistoryVersion): Promise<number> {
    const fresh = await HistoryArchive.open({ documentId: DOCUMENT, storage: this.storage });
    const before = this.storage.cellPageReads;
    await fresh.readVersion(version.id);

    return this.storage.cellPageReads - before;
  }

  /** Cell pages that `action` reads. */
  async reads(action: () => Promise<unknown>): Promise<number> {
    const before = this.storage.cellPageReads;
    await action();

    return this.storage.cellPageReads - before;
  }
}

async function* each<T>(items: readonly T[]): AsyncGenerator<T> {
  yield* items;
}

/**
 * The whole-version compare the archive did before pages: both versions
 * rebuilt in full, then one scan over the log between them.
 */
async function wholeDiff(
  authority: Authority,
  from: HistoryVersion,
  to: HistoryVersion,
  request: Omit<HistoryDiffRequest, "from" | "to">,
): Promise<HistoryDiffPage> {
  const before = await authority.replayed(from);
  const after = await authority.replayed(to);
  const commits = authority.commits.filter(
    (commit) => commit.revision > from.revision && commit.revision <= to.revision,
  );

  try {
    return await diffStores({
      before,
      after,
      commits: each(commits),
      logComplete: true,
      request: { ...request, from: from.id, to: to.id },
    });
  } finally {
    before.dispose();
    after.dispose();
  }
}

/** Changes of one page as [sheet, row, col, beforeRow, flags, author] rows. */
function rows(page: HistoryDiffPage) {
  return Array.from(page.cells.flags, (flags, at) => [
    page.sheetIds[page.cells.sheet[at] ?? 0],
    page.cells.row[at],
    page.cells.col[at],
    page.cells.beforeRow[at],
    flags,
    page.authors[page.cells.author[at] ?? HISTORY_DIFF_NONE] ?? null,
  ]);
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
      ["data", 0, 0, 0, HistoryDiffFlag.value, "alice"],
      ["data", 1, 1, 1, HistoryDiffFlag.added | HistoryDiffFlag.formula, "bob"],
      ["data", 2, 0, 2, HistoryDiffFlag.style, "bob"],
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
      ["data", 0, 1, HISTORY_DIFF_NONE, HistoryDiffFlag.added, "alice"],
      ["data", 4, 1, 3, HistoryDiffFlag.value, "carol"],
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
      ["data", 3, 0, 3, HistoryDiffFlag.value, "bob"],
      ["data", 5, 0, 5, HistoryDiffFlag.removed, "carol"],
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
    expect(rows(page)).toEqual([["extra", 1, 0, HISTORY_DIFF_NONE, HistoryDiffFlag.added, "bob"]]);
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
      ["data", 0, 2, 0, HistoryDiffFlag.style, "bob"],
      ["data", 1, 2, 1, HistoryDiffFlag.added, "bob"],
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
      seen.push(...rows(page).map(([, row, col]) => `${row}:${col}`));
      cursor = page.cursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 6 }, (_, row) => [`${row}:1`, `${row}:2`]).flat());
  });

  it("scans a large sheet in bounded windows and continues across a window boundary", async () => {
    const authority = await Authority.open();
    await authority.commit("alice", [{ op: "addRows", sheet: "data", at: 6, count: 39_994 }]);
    const start = await authority.save("Start");

    await authority.commit("bob", [set("data", 10, 2, 1), set("data", 39_000, 1, 2)]);
    const end = await authority.save("End");

    const first = await diff(authority, { from: start.id, to: end.id, maxEntries: 1 });
    expect(rows(first).map(([, row, col]) => [row, col])).toEqual([[10, 2]]);

    const second = await diff(authority, {
      from: start.id,
      to: end.id,
      maxEntries: 1,
      cursor: first.cursor,
    });
    expect(rows(second).map(([, row, col]) => [row, col])).toEqual([[39_000, 1]]);
    expect(second.cursor?.row).toBeGreaterThan(0);
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

/** Deterministic numbers in [0, 1) for one seed (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Rows a random insert adds: page-sized counts keep the pages below aligned, others shift them. */
const INSERT_COUNTS = [1, 5, 16, 32];

/** One random commit on sheet "data": edits, formulas, clears, styles, and row and column inserts and deletes. */
function randomOperations(
  random: () => number,
  store: SheetwriteStore,
  step: number,
): DocumentOp[] {
  const sheet = store.getWorkbook().sheets.find((candidate) => candidate.id === "data");
  if (!sheet) {
    throw new Error("Missing fixture sheet");
  }

  const rows = sheet.rowCount;
  const cols = sheet.columns.length;
  const below = (limit: number) => Math.floor(random() * limit);
  const rect = () => {
    const row = below(rows - 3);
    const col = below(cols - 2);
    return {
      sheet: "data",
      start: { row, col },
      end: { row: row + below(3), col: col + below(2) },
    };
  };

  const choice = random();
  if (choice < 0.2) {
    return [set("data", below(rows), below(cols), step * 100 + below(100))];
  }
  if (choice < 0.32) {
    // Two cells flipping between two values, so later edits often undo earlier ones.
    return [set("data", below(2), 0, below(2))];
  }
  if (choice < 0.35) {
    // A whole band of pages emptied.
    const row = Math.floor(below(rows - 16) / 16) * 16;
    const range = { sheet: "data", start: { row, col: 0 }, end: { row: row + 15, col: cols - 1 } };
    return [{ op: "clearRange", range, contents: true, style: true }];
  }
  if (choice < 0.45) {
    // A reference to a far row, whose value a sparse rebuild does not hold.
    const src = `=A${below(rows) + 1}*2`;
    return [
      {
        op: "set",
        addr: { sheet: "data", row: below(rows), col: below(cols) },
        value: { kind: "formula", src },
      },
    ];
  }
  if (choice < 0.55) {
    return [{ op: "clearRange", range: rect(), contents: true }];
  }
  if (choice < 0.65) {
    return [{ op: "setRangeStyle", range: rect(), style: { bold: true } }];
  }
  if (choice < 0.8) {
    const count = INSERT_COUNTS[below(INSERT_COUNTS.length)] ?? 1;
    return [{ op: "addRows", sheet: "data", at: below(rows), count }];
  }
  if (choice < 0.9 && rows > 60) {
    return [{ op: "removeRows", sheet: "data", at: below(rows - 10), count: 1 + below(8) }];
  }
  if (choice < 0.95) {
    const column = { key: `k${step}`, header: `K${step}`, width: 80, type: "number" as const };
    return [{ op: "addColumns", sheet: "data", at: below(cols), columns: [column] }];
  }
  if (cols > 4) {
    return [{ op: "removeColumns", sheet: "data", at: below(cols), count: 1 }];
  }

  return [set("data", below(rows), below(cols), -step)];
}

/** Every page of a compare, following the cursor. */
async function allPages(
  compare: (cursor: HistoryDiffPage["cursor"]) => Promise<HistoryDiffPage>,
): Promise<HistoryDiffPage[]> {
  const pages: HistoryDiffPage[] = [];
  let cursor: HistoryDiffPage["cursor"];
  do {
    const page = await compare(cursor);
    pages.push(page);
    cursor = page.cursor;
  } while (cursor);

  return pages;
}

/** Every page of a compare by page and of the whole-version compare, from `from` to `to`. */
async function bothCompares(authority: Authority, from: HistoryVersion, to: HistoryVersion) {
  const request = { maxEntries: 25 };
  const byPage = await allPages((cursor) =>
    authority.archive.diffVersions({ ...request, from: from.id, to: to.id, cursor }),
  );
  const whole = await allPages((cursor) => wholeDiff(authority, from, to, { ...request, cursor }));

  return { byPage, whole };
}

/**
 * 402 rows that hold their column numbers, except row 356, which holds 9
 * everywhere. Deleting two rows at 352 shifts every page below by two rows,
 * and the last page of the shorter sheet is still 16 rows of the same content.
 */
const ODD_ROWS = 402;
const ONE_ODD_ROW = (row: number, col: number) => (row === 356 ? 9 : col);

/** Row `row` of sheet "data" set to `value(col)` across 8 columns. */
function setRow(row: number, value: (col: number) => number): DocumentOp[] {
  return Array.from({ length: 8 }, (_, col) => set("data", row, col, value(col)));
}

const histories: Array<[string, Partial<HistoryLimits>, (authority: Authority) => Promise<void>]> =
  [
    [
      "a cell that the earlier version's log tail wrote is put back before the next checkpoint",
      { checkpointTransactions: 2 },
      async (authority) => {
        await authority.commit("alice", [set("data", 5, 1, -1)]);
        await authority.save("tail writes");
        await authority.commit("bob", [set("data", 5, 1, 1)]);
      },
    ],
    [
      "deleted rows shift pages by two rows, and an edit makes a shifted page equal its old self",
      { checkpointTransactions: 1 },
      async (authority) => {
        await authority.save("before delete");
        await authority.commit("alice", [{ op: "removeRows", sheet: "data", at: 352, count: 2 }]);
        // Row 356 moved up to 354; put the odd row back at 356, so page 352..367 has the same content ID.
        await authority.commit("bob", [...setRow(354, (col) => col), ...setRow(356, () => 9)]);
      },
    ],
  ];

describe("history diff by page", () => {
  it.each(histories)(
    "returns the pages of a whole-version compare when %s",
    async (_, limits, edit) => {
      const authority = await Authority.open(limits, () => grid(ODD_ROWS, 8, ONE_ODD_ROW));
      await edit(authority);
      const end = await authority.save("end");
      const [first] = authority.versions;
      if (!first) throw new Error("No earlier version");

      const { byPage, whole } = await bothCompares(authority, first, end);
      expect(byPage).toEqual(whole);
    },
  );

  it("returns the pages of a whole-version compare over random edits, inserts, deletes and checkpoints", async () => {
    for (const seed of [1, 2, 3, 4]) {
      const random = seeded(seed);
      const authority = await Authority.open(
        { checkpointTransactions: 1 + Math.floor(random() * 4) },
        // Every third band of 16 rows is empty, so some pages are absent.
        () =>
          grid(240, 7, (row, col) => (Math.floor(row / 16) % 3 === 1 ? undefined : row * 7 + col)),
      );
      const versions = [await authority.save("v0")];
      for (let step = 1; step <= 12; step++) {
        await authority.commit(
          step % 2 ? "alice" : "bob",
          randomOperations(random, authority.store, step),
        );
        if (random() < 0.5) {
          versions.push(await authority.save(`v${step}`));
        }
      }
      versions.push(await authority.save("last"));

      const pairs = versions.slice(1).flatMap((to, at) => {
        const previous = versions[at];
        const first = versions[0];
        return previous && first
          ? [
              [previous, to],
              [first, to],
            ]
          : [];
      });

      for (const [from, to] of pairs) {
        if (!from || !to) continue;
        const { byPage, whole } = await bothCompares(authority, from, to);

        expect({ seed, from: from.name, to: to.name, pages: byPage }).toEqual({
          seed,
          from: from.name,
          to: to.name,
          pages: whole,
        });
      }
    }
  }, 60_000);

  it("reads only the cell pages that can differ when a few cells changed", async () => {
    const authority = await Authority.open({}, () => grid(160, 8));
    const start = await authority.save("Start");
    await authority.commit("alice", [set("data", 70, 5, -1)]);
    const end = await authority.save("End");

    const reads = await authority.reads(() =>
      authority.archive.diffVersions({ from: start.id, to: end.id }),
    );

    expect(reads).toBeLessThan(await authority.wholeReads(end));
  });

  const fallbacks: Array<[string, Partial<HistoryLimits>, DocumentOp[]]> = [
    [
      "a version's log tail inserts rows",
      {},
      [{ op: "addRows", sheet: "data", at: 150, count: 1 }, set("data", 3, 3, -1)],
    ],
    [
      "more than a quarter of the pages differ",
      {},
      Array.from({ length: 10 }, (_, page) => set("data", page * 16, page % 8, -1 - page)),
    ],
    [
      "the sheet's columns changed",
      { checkpointTransactions: 1 },
      [{ op: "setColumn", sheet: "data", col: 2, patch: { width: 120 } }, set("data", 3, 3, -1)],
    ],
  ];

  it.each(fallbacks)("compares whole versions when %s", async (_, limits, operations) => {
    const authority = await Authority.open(limits, () => grid(160, 8));
    const start = await authority.save("Start");
    await authority.commit("alice", operations);
    const end = await authority.save("End");

    let page: HistoryDiffPage | undefined;
    const reads = await authority.reads(async () => {
      page = await authority.archive.diffVersions({ from: start.id, to: end.id });
    });

    expect(page).toEqual(await wholeDiff(authority, start, end, {}));
    expect(reads).toBe((await authority.wholeReads(start)) + (await authority.wholeReads(end)));
  });
});
