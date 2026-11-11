import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { initSheetwrite } from "@sheetwrite/core";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import { DATABASE_DOCUMENT_ID, makeDatabaseSeedSnapshot } from "../src/showcases/database-seed.js";
import { ShowcaseIndexedDbAdapter } from "../src/showcases/showcase-database.ts";

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

function seatEdit(row: number, value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "ledger", row, col: 1 },
    value: { kind: "literal" as const, value },
  };
}

it("applies an atomic batch whole or not at all, and answers its replay with the last version", async () => {
  const adapter = await ShowcaseIndexedDbAdapter.open(makeDatabaseSeedSnapshot(), {
    databaseName: "showcase-batch",
  });
  const request = {
    documentId: DATABASE_DOCUMENT_ID,
    baseVersion: 0,
    clientMutationId: "batch-m1",
    operations: [seatEdit(0, 12), seatEdit(1, 13)],
    versionOperationCounts: [1, 1],
  };

  expect(await adapter.commitBatch(request)).toMatchObject({ status: "applied", version: 2 });
  expect(adapter.stats()).toMatchObject({ currentVersion: 2, tailLength: 2 });
  const stored = await adapter.load(DATABASE_DOCUMENT_ID);
  expect(stored.version).toBe(2);
  expect(await adapter.commitBatch(request)).toMatchObject({ status: "duplicate", version: 2 });

  const conflict = await adapter.commitBatch({ ...request, clientMutationId: "batch-m2" });
  expect(conflict).toMatchObject({ status: "conflict", currentVersion: 2 });
  if (conflict.status === "conflict") {
    expect(conflict.operationsSinceBase?.map((entry) => entry.clientMutationId)).toEqual([
      "batch-m1",
      "batch-m1",
    ]);
  }
  // The stale batch stored nothing.
  expect(adapter.stats()).toMatchObject({ currentVersion: 2, tailLength: 2 });
  adapter.close();
});
