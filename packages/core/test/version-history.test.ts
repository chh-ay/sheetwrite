import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";

import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import {
  DEFAULT_HISTORY_LIMITS,
  HistoryArchive,
  HistoryError,
  MemoryHistoryStorage,
  type HistoryCommit,
  type HistoryLimits,
  type HistoryStorageAdapter,
} from "../src/history-archive.js";
import { IndexedDbHistoryStorage } from "../src/history-indexeddb.js";
import type { CellValue } from "../src/types/cell.js";
import type { SnapshotCell, WorkbookSnapshot } from "../src/types/document.js";

const MINUTE_MS = 60_000;

const keyRangeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");

beforeAll(async () => {
  // Bun has no IndexedDB; the adapter reads the browser's global key range class.
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
  await initSheetwrite();
});

afterAll(() => {
  if (keyRangeDescriptor) {
    Object.defineProperty(globalThis, "IDBKeyRange", keyRangeDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "IDBKeyRange");
  }
});

/** One 100-row sheet whose A1 holds `value`, with one note. */
function snapshot(value = 10): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "budget",
    version: 0,
    workbook: { activeSheet: "sales" },
    sheets: [
      {
        id: "sales",
        name: "Sales",
        order: 0,
        rowCount: 100,
        columns: [{ key: "amount", header: "Amount", type: "number", width: 100 }],
        notes: [{ addr: { sheet: "sales", row: 0, col: 0 }, text: "Baseline" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 100,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value } }],
          },
        ],
      },
    ],
  };
}

/** Replace the cells of the fixture sheet with one column of `rows` cells. */
function withColumn(
  base: WorkbookSnapshot,
  rows: number,
  value: (row: number) => CellValue,
): WorkbookSnapshot {
  const sheet = base.sheets[0];
  if (!sheet) {
    throw new Error("Missing fixture sheet");
  }

  const cells: SnapshotCell[] = Array.from({ length: rows }, (_, rowOffset) => ({
    rowOffset,
    colOffset: 0,
    value: value(rowOffset),
  }));

  sheet.rowCount = Math.max(sheet.rowCount, rows);
  sheet.cells = [{ startRow: 0, startCol: 0, rowCount: sheet.rowCount, colCount: 1, cells }];

  return base;
}

/** Commit `revision` that sets A1 to `value`, one minute per revision. */
function change(revision: number, value: string | number = revision): HistoryCommit {
  const cell: CellValue = { kind: "literal", value };

  return {
    revision,
    baseRevision: revision - 1,
    mutationId: `edit-${revision}`,
    authorId: revision % 2 ? "alice" : "bob",
    time: revision * MINUTE_MS,
    operations: [{ op: "set", addr: { sheet: "sales", row: 0, col: 0 }, value: cell }],
  };
}

function firstCell(document: WorkbookSnapshot): CellValue | undefined {
  return document.sheets[0]?.cells[0]?.cells[0]?.value;
}

function open(storage: HistoryStorageAdapter, limits?: Partial<HistoryLimits>) {
  return HistoryArchive.open({ documentId: "budget", storage, limits });
}

for (const backend of ["memory", "indexeddb"] as const) {
  describe(`${backend} version history`, () => {
    function storage(): HistoryStorageAdapter {
      if (backend === "memory") {
        return new MemoryHistoryStorage();
      }

      return new IndexedDbHistoryStorage({
        databaseName: `history-${crypto.randomUUID()}`,
        indexedDB: new IDBFactory(),
      });
    }

    it("reconstructs named and automatic revisions after reopening without changing the baseline", async () => {
      const adapter = storage();
      const archive = await open(adapter);
      const baseline = snapshot();

      await archive.initialize(baseline, 0);
      await archive.saveVersion("Before", "alice", 0);
      for (let revision = 1; revision <= 6; revision++) {
        await archive.record(change(revision));
      }
      const named = await archive.saveVersion("After", "bob", 6 * MINUTE_MS);

      const reopened = await open(adapter);
      const page = await reopened.listVersions();
      expect(page.versions.map((version) => version.name ?? version.kind)).toEqual([
        "After",
        "automatic",
        "Before",
      ]);

      const restored = await reopened.readVersion(named.id);
      expect(restored.version).toBe(6);
      expect(firstCell(restored)).toEqual({ kind: "literal", value: 6 });
      expect(restored.sheets[0]?.notes).toEqual(baseline.sheets[0]?.notes);
      expect(firstCell(baseline)).toEqual({ kind: "literal", value: 10 });
    });

    it("rejects stale writers and invalid revisions without publishing a partial version", async () => {
      const adapter = storage();
      const first = await open(adapter);
      await first.initialize(snapshot(), 0);
      const stale = await open(adapter);

      await first.record(change(1));

      await expect(stale.record(change(1))).rejects.toMatchObject({ code: "conflict" });
      await expect(first.record(change(3))).rejects.toMatchObject({ code: "invalid-history" });
      expect((await first.listVersions()).versions).toHaveLength(0);

      const version = await first.saveVersion("Valid", "alice", MINUTE_MS);
      expect((await first.readVersion(version.id)).version).toBe(1);
    });

    it("pages version metadata and keeps pinned named versions while pruning old automatic chains", async () => {
      const archive = await open(storage());
      await archive.initialize(snapshot(), 0);
      const named = await archive.saveVersion("Keep", "alice", 0);
      for (let revision = 1; revision <= 20; revision++) {
        await archive.record(change(revision));
      }

      const first = await archive.listVersions({ maxEntries: 2 });
      expect(first.versions).toHaveLength(2);
      expect(first.cursor).toBeDefined();

      const second = await archive.listVersions({ maxEntries: 2, cursor: first.cursor });
      expect(second.versions[0]?.id).not.toBe(first.versions[0]?.id);

      await archive.prune({ beforeTime: 20 * MINUTE_MS });

      const remaining = await archive.listVersions();
      expect(remaining.versions.map((version) => version.id)).toEqual([named.id]);
      expect((await archive.readVersion(named.id)).version).toBe(0);

      const latest = await archive.saveVersion("Latest", "bob", 20 * MINUTE_MS);
      expect((await archive.readVersion(latest.id)).version).toBe(20);
    });

    it("rejects an aborted save and a pinned-capacity overflow without losing durable content", async () => {
      const archive = await open(storage(), { maxNamedVersions: 1 });
      await archive.initialize(snapshot(), 0);
      const named = await archive.saveVersion("Keep", "alice", 0);

      const controller = new AbortController();
      controller.abort(new Error("stop"));
      const aborted = archive.saveVersion("Aborted", "alice", 0, controller.signal);
      await expect(aborted).rejects.toThrow("stop");

      const overflow = archive.saveVersion("Too many", "alice", 0);
      await expect(overflow).rejects.toMatchObject({ code: "capacity" });

      const remaining = await archive.listVersions();
      expect(remaining.versions.map((version) => version.id)).toEqual([named.id]);
      expect((await archive.readVersion(named.id)).version).toBe(0);
    });

    it("replays transactions across bounded log segments and lists metadata without cell payloads", async () => {
      const adapter = storage();
      const limits = { ...DEFAULT_HISTORY_LIMITS, maxSegmentBytes: 64 };
      const archive = await open(adapter, limits);
      await archive.initialize(snapshot(), 0);

      const text = "Forecast ".repeat(100);
      await archive.record(change(1, text));
      const version = await archive.saveVersion("Segmented", "alice", MINUTE_MS);

      const listing = { documentId: "budget", limits, kind: "segment" as const, maxEntries: 2 };
      const first = await adapter.list({ ...listing, maxBytes: 1024 });
      expect(first.records).toHaveLength(2);
      expect(first.records?.every((record) => record.decodedBytes <= 64)).toBe(true);
      expect(first.cursor).toBeDefined();

      const next = await adapter.list({ ...listing, maxBytes: 1024, cursor: first.cursor });
      expect(next.records?.[0]?.id).not.toBe(first.records?.[0]?.id);

      const replayed = await archive.readVersion(version.id);
      expect(firstCell(replayed)).toEqual({ kind: "literal", value: text });
    });

    it("keeps a reader's immutable chunks alive during concurrent marker deletion", async () => {
      const adapter = storage();
      const limits = { ...DEFAULT_HISTORY_LIMITS, checkpointTransactions: 1 };
      const archive = await open(adapter, limits);
      await archive.initialize(snapshot(), 0);
      const version = await archive.saveVersion("Reading", "alice", 0);

      const lease = { documentId: "budget", limits, token: "reader", versionId: version.id };
      await adapter.put({ ...lease, kind: "pin" });

      const next = snapshot(1);
      next.version = 1;
      await archive.record(change(1), () => next);
      await archive.deleteVersion(version.id);

      const request = {
        documentId: "budget",
        limits,
        kind: "record" as const,
        id: version.checkpoint,
        maxBytes: 1024 * 1024,
        pin: "reader",
      };
      const record = await adapter.get(request);
      expect("bytes" in record).toBe(true);

      await adapter.put({ ...lease, kind: "release" });

      const afterRelease = adapter.get({ ...request, pin: undefined });
      await expect(afterRelease).rejects.toMatchObject({ code: "not-found" });
    });

    it("rolls back a byte-capacity failure and preserves the previously named revision", async () => {
      const adapter = storage();
      const archive = await open(adapter);
      await archive.initialize(snapshot(), 0);
      const version = await archive.saveVersion("Safe", "alice", 0);
      const usage = await archive.storageUsage();

      const bounded = await open(adapter, { maxStorageBytes: usage.encodedBytes + 10 });
      await expect(bounded.record(change(1))).rejects.toMatchObject({ code: "capacity" });

      expect((await archive.readVersion(version.id)).version).toBe(0);
      expect((await archive.storageUsage()).encodedBytes).toBe(usage.encodedBytes);
    });
  });
}

describe("history replay memory", () => {
  it("replays a structural edit and the edits after it in commit order", async () => {
    const archive = await open(new MemoryHistoryStorage());
    await archive.initialize(snapshot(), 0);

    await archive.record({
      ...change(1),
      operations: [{ op: "addRows", sheet: "sales", at: 0, count: 1 }],
    });
    await archive.record(change(2, "inserted"));
    await archive.record({
      ...change(3),
      operations: [
        {
          op: "set",
          addr: { sheet: "sales", row: 1, col: 0 },
          value: { kind: "formula", src: '=A1&"!"' },
        },
      ],
    });
    const version = await archive.saveVersion("Rows", "alice", 3 * MINUTE_MS);

    const replayed = await archive.readVersion(version.id);
    const sheet = replayed.sheets[0];
    const cells = sheet?.cells[0]?.cells ?? [];

    expect(sheet?.rowCount).toBe(101);
    expect(cells.map((cell) => [cell.rowOffset, cell.value])).toEqual([
      [0, { kind: "literal", value: "inserted" }],
      [1, { kind: "formula", src: '=A1&"!"' }],
    ]);
    expect(sheet?.notes).toEqual([{ addr: { sheet: "sales", row: 1, col: 0 }, text: "Baseline" }]);
  });

  it("replays a large version without growing the document engine's memory", async () => {
    const rows = 40_000;
    const text = (row: number) => `${row}:${"history".repeat(28)}`;
    const large = withColumn(snapshot(), rows, (row) => ({ kind: "literal", value: text(row) }));

    const archive = await open(new MemoryHistoryStorage());
    await archive.initialize(large, 0);
    await archive.record(change(1));
    const version = await archive.saveVersion("Large", "alice", MINUTE_MS);

    const documentBytes = getEngine().getMemory().buffer.byteLength;
    const replayed = await archive.readVersion(version.id);

    const cells = replayed.sheets[0]?.cells[0]?.cells;
    expect(cells?.[rows - 1]?.value).toEqual({ kind: "literal", value: text(rows - 1) });
    expect(cells?.[0]?.value).toEqual({ kind: "literal", value: 1 });
    expect(getEngine().getMemory().buffer.byteLength).toBe(documentBytes);
  });
});

describe("history trust and cancellation", () => {
  it("maps exhausted IndexedDB quota to a capacity failure and keeps the last durable version", async () => {
    const storage = new IndexedDbHistoryStorage({
      databaseName: "history-quota",
      indexedDB: new IDBFactory(),
    });
    const archive = await open(storage);
    await archive.initialize(snapshot(), 0);
    const version = await archive.saveVersion("Safe", "alice", 0);
    const before = await archive.storageUsage();

    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function quotaPut(this: IDBObjectStore, ...args) {
      if (this.name === "records") {
        throw new DOMException("Quota", "QuotaExceededError");
      }

      return put.apply(this, args);
    };

    try {
      await expect(archive.record(change(1))).rejects.toMatchObject({ code: "capacity" });
    } finally {
      IDBObjectStore.prototype.put = put;
    }

    expect(await archive.storageUsage()).toEqual(before);
    expect((await archive.readVersion(version.id)).version).toBe(0);
  });

  it("rejects corrupted adapter bytes and releases the reader lease on failure", async () => {
    const durable = new MemoryHistoryStorage();
    let corrupt = false;

    const storage: HistoryStorageAdapter = {
      put: (request) => durable.put(request),
      list: (request) => durable.list(request),
      prune: (request) => durable.prune(request),
      get: async (request) => {
        const response = await durable.get(request);
        if (corrupt && "bytes" in response) {
          response.bytes[0] = (response.bytes[0] ?? 0) ^ 1;
        }

        return response;
      },
    };

    const archive = await open(storage);
    await archive.initialize(snapshot(), 0);
    const version = await archive.saveVersion("Safe", "alice", 0);
    const before = await archive.storageUsage();

    corrupt = true;
    await expect(archive.readVersion(version.id)).rejects.toMatchObject({ code: "integrity" });
    expect(await archive.storageUsage()).toEqual(before);

    corrupt = false;
    expect((await archive.readVersion(version.id)).version).toBe(0);
  });

  it("bounds metadata pages and invalidates cursors after a new publication", async () => {
    const archive = await open(new MemoryHistoryStorage());
    await archive.initialize(snapshot(), 0);
    await archive.saveVersion("One", "alice", 0);
    await archive.saveVersion("Two", "bob", 1);

    const first = await archive.listVersions({ maxEntries: 1 });
    await archive.saveVersion("Three", "alice", 2);

    const stale = archive.listVersions({ maxEntries: 1, cursor: first.cursor });
    await expect(stale).rejects.toMatchObject({ code: "conflict" });

    const tooSmall = archive.listVersions({ maxBytes: 1 });
    await expect(tooSmall).rejects.toMatchObject({ code: "capacity" });

    const tooLarge = archive.listVersions({ maxEntries: 101 });
    await expect(tooLarge).rejects.toMatchObject({ code: "capacity" });
  });
});

describe("checkpoint content addressing", () => {
  it("shares unchanged cell pages and metadata through checkpoints and frees only unreachable chunks", async () => {
    const archive = await open(new MemoryHistoryStorage(), { checkpointTransactions: 1 });
    const initial = withColumn(snapshot(), 100, (row) => ({ kind: "literal", value: row }));

    await archive.initialize(initial, 0);
    const first = await archive.saveVersion("First", "alice", 0);
    const before = await archive.storageUsage();

    const updated = structuredClone(initial);
    const cell = updated.sheets[0]?.cells[0]?.cells[0];
    if (!cell) {
      throw new Error("Missing fixture cell");
    }
    cell.value = { kind: "literal", value: 1000 };
    updated.version = 1;

    await archive.record(change(1, 1000), () => updated);
    const second = await archive.saveVersion("Second", "bob", MINUTE_MS);
    const after = await archive.storageUsage();

    // One changed page, its sheet, workbook-level records and the transaction; not 7 pages.
    expect(after.recordCount - before.recordCount).toBeLessThan(8);
    expect(firstCell(await archive.readVersion(first.id))).toEqual({ kind: "literal", value: 0 });
    expect(firstCell(await archive.readVersion(second.id))).toEqual({
      kind: "literal",
      value: 1000,
    });

    await archive.deleteVersion(first.id);

    expect((await archive.storageUsage()).encodedBytes).toBeLessThan(after.encodedBytes);
    expect((await archive.readVersion(second.id)).version).toBe(1);
  });

  it("requires a complete, correctly versioned checkpoint before advancing its durable head", async () => {
    const archive = await open(new MemoryHistoryStorage(), { checkpointTransactions: 1 });
    await archive.initialize(snapshot(), 0);

    await expect(archive.record(change(1))).rejects.toBeInstanceOf(HistoryError);

    const wrongRevision = archive.record(change(1), () => snapshot());
    await expect(wrongRevision).rejects.toMatchObject({ code: "invalid-history" });

    const version = await archive.saveVersion("Unchanged", "alice", 0);
    expect((await archive.readVersion(version.id)).version).toBe(0);
  });
});
