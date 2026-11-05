import { beforeAll, describe, expect, it } from "bun:test";

import { IDBFactory } from "fake-indexeddb";

import { initSheetwrite } from "../src/grid.js";
import {
  DEFAULT_HISTORY_LIMITS,
  HistoryArchive,
  HistoryError,
  MemoryHistoryStorage,
  type HistoryStorageAdapter,
} from "../src/history-archive.js";
import { IndexedDbHistoryStorage } from "../src/history-indexeddb.js";
import type { WorkbookSnapshot } from "../src/types/document.js";

beforeAll(async () => {
  await initSheetwrite();
});

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

function change(revision: number, time = revision * 60_000) {
  return {
    revision,
    baseRevision: revision - 1,
    mutationId: `edit-${revision}`,
    authorId: revision % 2 ? "alice" : "bob",
    time,
    operations: [
      {
        op: "set" as const,
        addr: { sheet: "sales", row: 0, col: 0 },
        value: { kind: "literal" as const, value: revision },
      },
    ],
  };
}

function open(storage: HistoryStorageAdapter) {
  return HistoryArchive.open({ documentId: "budget", storage });
}

for (const backend of ["memory", "indexeddb"] as const) {
  describe(`${backend} version history`, () => {
    function storage(): HistoryStorageAdapter {
      if (backend === "memory") return new MemoryHistoryStorage();
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
      for (let revision = 1; revision <= 6; revision++) await archive.record(change(revision));
      const named = await archive.saveVersion("After", "bob", 360_000);
      const reopened = await open(adapter);
      const page = await reopened.listVersions();
      expect(page.versions.map((version) => version.name ?? version.kind)).toEqual([
        "After",
        "automatic",
        "Before",
      ]);
      const restored = await reopened.readVersion(named.id);
      expect(restored.version).toBe(6);
      expect(restored.sheets[0]?.cells[0]?.cells[0]?.value).toEqual({ kind: "literal", value: 6 });
      expect(restored.sheets[0]?.notes).toEqual(baseline.sheets[0]?.notes);
      expect(baseline.sheets[0]?.cells[0]?.cells[0]?.value).toEqual({ kind: "literal", value: 10 });
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
      const version = await first.saveVersion("Valid", "alice", 60_000);
      expect((await first.readVersion(version.id)).version).toBe(1);
    });

    it("pages version metadata and keeps pinned named versions while pruning old automatic chains", async () => {
      const archive = await open(storage());
      await archive.initialize(snapshot(), 0);
      const named = await archive.saveVersion("Keep", "alice", 0);
      for (let revision = 1; revision <= 20; revision++) await archive.record(change(revision));
      const first = await archive.listVersions({ maxEntries: 2 });
      expect(first.versions).toHaveLength(2);
      expect(first.cursor).toBeDefined();
      const second = await archive.listVersions({ maxEntries: 2, cursor: first.cursor });
      expect(second.versions[0]?.id).not.toBe(first.versions[0]?.id);
      await archive.prune({ beforeTime: 20 * 60_000 });
      expect((await archive.listVersions()).versions.map((version) => version.id)).toEqual([
        named.id,
      ]);
      expect((await archive.readVersion(named.id)).version).toBe(0);
      const latest = await archive.saveVersion("Latest", "bob", 20 * 60_000);
      expect((await archive.readVersion(latest.id)).version).toBe(20);
    });

    it("rejects an aborted save and a pinned-capacity overflow without losing durable content", async () => {
      const adapter = storage();
      const archive = await HistoryArchive.open({
        documentId: "budget",
        storage: adapter,
        limits: { maxNamedVersions: 1 },
      });
      await archive.initialize(snapshot(), 0);
      const named = await archive.saveVersion("Keep", "alice", 0);
      const controller = new AbortController();
      controller.abort(new Error("stop"));
      await expect(archive.saveVersion("Aborted", "alice", 0, controller.signal)).rejects.toThrow(
        "stop",
      );
      await expect(archive.saveVersion("Too many", "alice", 0)).rejects.toMatchObject({
        code: "capacity",
      });
      expect((await archive.listVersions()).versions.map((version) => version.id)).toEqual([
        named.id,
      ]);
      expect((await archive.readVersion(named.id)).version).toBe(0);
    });

    it("replays transactions across bounded log segments and lists metadata without cell payloads", async () => {
      const adapter = storage();
      const limits = { ...DEFAULT_HISTORY_LIMITS, maxSegmentBytes: 64 };
      const archive = await HistoryArchive.open({ documentId: "budget", storage: adapter, limits });
      await archive.initialize(snapshot(), 0);
      const text = "Forecast ".repeat(100);
      await archive.record({
        ...change(1),
        operations: [
          {
            op: "set",
            addr: { sheet: "sales", row: 0, col: 0 },
            value: { kind: "literal", value: text },
          },
        ],
      });
      const version = await archive.saveVersion("Segmented", "alice", 60_000);
      const first = await adapter.list({
        documentId: "budget",
        limits,
        kind: "segment",
        maxEntries: 2,
        maxBytes: 1024,
      });
      expect(first.records).toHaveLength(2);
      expect(first.records?.every((record) => record.decodedBytes <= 64)).toBe(true);
      expect(first.cursor).toBeDefined();
      const next = await adapter.list({
        documentId: "budget",
        limits,
        kind: "segment",
        maxEntries: 2,
        maxBytes: 1024,
        cursor: first.cursor,
      });
      expect(next.records?.[0]?.id).not.toBe(first.records?.[0]?.id);
      expect((await archive.readVersion(version.id)).sheets[0]?.cells[0]?.cells[0]?.value).toEqual({
        kind: "literal",
        value: text,
      });
    });

    it("keeps a reader's immutable chunks alive during concurrent marker deletion", async () => {
      const adapter = storage();
      const limits = { ...DEFAULT_HISTORY_LIMITS, checkpointTransactions: 1 };
      const archive = await HistoryArchive.open({ documentId: "budget", storage: adapter, limits });
      await archive.initialize(snapshot(), 0);
      const version = await archive.saveVersion("Reading", "alice", 0);
      await adapter.put({
        documentId: "budget",
        limits,
        kind: "pin",
        token: "reader",
        versionId: version.id,
      });
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
      await adapter.put({
        documentId: "budget",
        limits,
        kind: "release",
        token: "reader",
        versionId: version.id,
      });
      await expect(adapter.get({ ...request, pin: undefined })).rejects.toMatchObject({
        code: "not-found",
      });
    });

    it("rolls back a byte-capacity failure and preserves the previously named revision", async () => {
      const adapter = storage();
      const archive = await open(adapter);
      await archive.initialize(snapshot(), 0);
      const version = await archive.saveVersion("Safe", "alice", 0);
      const usage = await archive.storageUsage();
      const bounded = await HistoryArchive.open({
        documentId: "budget",
        storage: adapter,
        limits: { maxStorageBytes: usage.encodedBytes + 10 },
      });
      await expect(bounded.record(change(1))).rejects.toMatchObject({ code: "capacity" });
      expect((await archive.readVersion(version.id)).version).toBe(0);
      expect((await archive.storageUsage()).encodedBytes).toBe(usage.encodedBytes);
    });
  });
}

describe("history trust and cancellation", () => {
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
    await expect(
      archive.listVersions({ maxEntries: 1, cursor: first.cursor }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(archive.listVersions({ maxBytes: 1 })).rejects.toMatchObject({ code: "capacity" });
    await expect(archive.listVersions({ maxEntries: 101 })).rejects.toMatchObject({
      code: "capacity",
    });
  });
});

describe("checkpoint content addressing", () => {
  it("shares unchanged cell pages and metadata through checkpoints and frees only unreachable chunks", async () => {
    const storage = new MemoryHistoryStorage();
    const archive = await HistoryArchive.open({
      documentId: "budget",
      storage,
      limits: { checkpointTransactions: 1 },
    });
    const initial = snapshot();
    const sheet = initial.sheets[0];
    if (!sheet) throw new Error("Missing fixture sheet");
    sheet.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount: 100,
        colCount: 1,
        cells: Array.from({ length: 100 }, (_, rowOffset) => ({
          rowOffset,
          colOffset: 0,
          value: { kind: "literal", value: rowOffset },
        })),
      },
    ];
    await archive.initialize(initial, 0);
    const first = await archive.saveVersion("First", "alice", 0);
    const before = await archive.storageUsage();
    const updated = structuredClone(initial);
    const cell = updated.sheets[0]?.cells[0]?.cells[0];
    if (!cell) throw new Error("Missing fixture cell");
    cell.value = { kind: "literal", value: 1000 };
    updated.version = 1;
    await archive.record(
      {
        ...change(1),
        operations: [
          {
            op: "set",
            addr: { sheet: "sales", row: 0, col: 0 },
            value: cell.value,
          },
        ],
      },
      () => updated,
    );
    const second = await archive.saveVersion("Second", "bob", 60_000);
    const after = await archive.storageUsage();
    expect(after.recordCount - before.recordCount).toBeLessThan(8);
    expect((await archive.readVersion(first.id)).sheets[0]?.cells[0]?.cells[0]?.value).toEqual({
      kind: "literal",
      value: 0,
    });
    expect((await archive.readVersion(second.id)).sheets[0]?.cells[0]?.cells[0]?.value).toEqual({
      kind: "literal",
      value: 1000,
    });
    await archive.deleteVersion(first.id);
    expect((await archive.storageUsage()).encodedBytes).toBeLessThan(after.encodedBytes);
    expect((await archive.readVersion(second.id)).version).toBe(1);
  });

  it("requires a complete, correctly versioned checkpoint before advancing its durable head", async () => {
    const archive = await HistoryArchive.open({
      documentId: "budget",
      storage: new MemoryHistoryStorage(),
      limits: { checkpointTransactions: 1 },
    });
    await archive.initialize(snapshot(), 0);
    await expect(archive.record(change(1))).rejects.toBeInstanceOf(HistoryError);
    await expect(archive.record(change(1), () => snapshot())).rejects.toMatchObject({
      code: "invalid-history",
    });
    const version = await archive.saveVersion("Unchanged", "alice", 0);
    expect((await archive.readVersion(version.id)).version).toBe(0);
  });
});
