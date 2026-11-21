import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { initSheetwrite } from "@sheetwrite/core";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import {
  makePersistenceConformanceSnapshot,
  runPersistenceConformance,
} from "../../test/persistence-conformance.js";
import {
  type ShowcaseDatabaseStats,
  ShowcaseIndexedDbAdapter,
} from "../src/showcases/showcase-database.ts";

const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
const keyRangeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
});

afterEach(() => {
  if (indexedDbDescriptor) Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
  else Reflect.deleteProperty(globalThis, "indexedDB");
  if (keyRangeDescriptor) Object.defineProperty(globalThis, "IDBKeyRange", keyRangeDescriptor);
  else Reflect.deleteProperty(globalThis, "IDBKeyRange");
});

describe("IndexedDB showcase adapter", () => {
  it("passes persistence conformance with bounded tails and reopen", async () => {
    const options = {
      databaseName: "sheetwrite-conformance",
      compaction: { maxTailRecords: 4 },
      maxConflictTailVersions: 4,
    };
    let adapter = await ShowcaseIndexedDbAdapter.open(
      makePersistenceConformanceSnapshot(),
      options,
    );
    let writerStats: ShowcaseDatabaseStats | undefined;
    const report = await runPersistenceConformance({
      adapter,
      boundedConflictTail: { overflowCommits: 8 },
      reopen: async () => {
        writerStats = adapter.stats();
        adapter.close();
        adapter = await ShowcaseIndexedDbAdapter.open(
          makePersistenceConformanceSnapshot(),
          options,
        );
        return adapter;
      },
    });
    // The eight shared checks, then the bounded-tail and reopen checks.
    expect(report.checks).toHaveLength(12);
    // Eight fill commits over a four-record ceiling compacted; the writer's
    // gauges belong to the instance that made the commits.
    const stats = adapter.stats();
    expect(report.headVersion).toBe(10);
    expect(stats.currentVersion).toBe(10);
    expect(stats.snapshotVersion).toBeGreaterThan(0);
    expect(stats.tailLength).toBeLessThanOrEqual(4);
    expect(stats.reads).toBeGreaterThan(0);
    expect(stats.storedBytes).toBeGreaterThan(0);
    expect(writerStats?.writes ?? 0).toBeGreaterThan(0);
    adapter.close();
  });

  it("compacts on byte pressure alone", async () => {
    const adapter = await ShowcaseIndexedDbAdapter.open(makePersistenceConformanceSnapshot(), {
      databaseName: "sheetwrite-byte-compaction",
      compaction: { maxTailRecords: 1_000, maxTailBytes: 1 },
    });
    const applied = await adapter.commit({
      documentId: "persistence-conformance",
      baseVersion: 0,
      clientMutationId: "byte-compaction-m1",
      operations: [
        { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 5 } },
      ],
    });
    expect(applied.status).toBe("applied");
    const stats = adapter.stats();
    expect(stats.snapshotVersion).toBe(1);
    expect(stats.currentVersion).toBe(1);
    expect(stats.tailLength).toBe(0);
    adapter.close();
  });

  it("applies an atomic batch whole or not at all, and answers its replay with the last version", async () => {
    const adapter = await ShowcaseIndexedDbAdapter.open(makePersistenceConformanceSnapshot(), {
      databaseName: "showcase-batch",
    });
    const request = {
      documentId: "persistence-conformance",
      baseVersion: 0,
      clientMutationId: "batch-m1",
      operations: [0, 1].map((row) => ({
        op: "set" as const,
        addr: { sheet: "s1", row, col: 1 },
        value: { kind: "literal" as const, value: row },
      })),
      versionOperationCounts: [1, 1],
    };

    expect(await adapter.commitBatch(request)).toMatchObject({ status: "applied", version: 2 });
    expect(await adapter.commitBatch(request)).toMatchObject({ status: "duplicate", version: 2 });
    const conflict = await adapter.commitBatch({ ...request, clientMutationId: "batch-m2" });
    expect(conflict).toMatchObject({ status: "conflict", currentVersion: 2 });
    if (conflict.status === "conflict") {
      const since = conflict.operationsSinceBase?.map((entry) => entry.clientMutationId);
      expect(since).toEqual(["batch-m1", "batch-m1"]);
    }
    // The stale batch stored nothing.
    expect(adapter.stats()).toMatchObject({ currentVersion: 2, tailLength: 2 });
    expect((await adapter.load("persistence-conformance")).version).toBe(2);
    adapter.close();
  });
});
