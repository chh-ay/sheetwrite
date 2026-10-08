import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createGridFromSnapshot, type DocumentOp, initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import {
  DATABASE_DOCUMENT_ID,
  DATABASE_REVENUE_ROWS,
  DATABASE_TOTAL_CELL,
  makeDatabaseSeedSnapshot,
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

const restoreCanvasStubs = installCanvasTestStubs();
afterEach(() => {
  restoreCanvasStubs();
});

/** Ledger seats (column 1) and monthly rate (column 2) by row, from the seed itself. */
function seedLedgerColumns(): { seats: number[]; rates: number[] } {
  const sheet = makeDatabaseSeedSnapshot().sheets.find((candidate) => candidate.id === "ledger");
  if (!sheet) throw new Error("The database seed has no ledger sheet");
  const seats: number[] = [];
  const rates: number[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.value.kind !== "literal" || typeof cell.value.value !== "number") continue;
      const row = block.startRow + cell.rowOffset;
      if (cell.colOffset === 1) seats[row] = cell.value.value;
      if (cell.colOffset === 2) rates[row] = cell.value.value;
    }
  }
  return { seats, rates };
}

/** One ledger seat edit per batch member, each moving the row's seats by one. */
function seatEdits(rows: readonly number[]): { patches: DocumentOp[]; counts: number[] } {
  const { seats } = seedLedgerColumns();
  return {
    patches: rows.map((row) => ({
      op: "set" as const,
      addr: { sheet: "ledger", row, col: 1 },
      value: { kind: "literal" as const, value: (seats[row] ?? 0) + 1 },
    })),
    counts: rows.map(() => 1),
  };
}

describe("database showcase seed", () => {
  it("sums every account-month row into the total cell, growing by month", async () => {
    const { seats, rates } = seedLedgerColumns();
    const revenueByMonth = [0, 0, 0];
    for (let row = 0; row < DATABASE_REVENUE_ROWS; row++) {
      const month = Math.floor(row / (DATABASE_REVENUE_ROWS / 3));
      revenueByMonth[month] = (revenueByMonth[month] ?? 0) + (seats[row] ?? 0) * (rates[row] ?? 0);
    }
    const total = revenueByMonth.reduce((sum, month) => sum + month, 0);

    const host = document.createElement("div");
    document.body.append(host);
    const grid = createGridFromSnapshot(host, makeDatabaseSeedSnapshot());
    try {
      expect(grid.store.getCell(DATABASE_TOTAL_CELL).resolved).toBe(total);
      expect(seats.filter((count) => count !== undefined).length).toBe(DATABASE_REVENUE_ROWS);
      expect(revenueByMonth[0]).toBeLessThan(revenueByMonth[1] ?? 0);
      expect(revenueByMonth[1]).toBeLessThan(revenueByMonth[2] ?? 0);
      // The margin column is a per-row formula, not a copied literal.
      const margin = grid.store.getCell({ sheet: "ledger", row: 0, col: 5 }).resolved;
      expect(margin).toBe((seats[0] ?? 0) * (rates[0] ?? 0) - (seats[0] ?? 0) * 9);
    } finally {
      grid.destroy();
      host.remove();
    }
  });
});

describe("showcase IndexedDB atomic batches", () => {
  it("applies every member version at once and answers duplicates with the last version", async () => {
    const adapter = await ShowcaseIndexedDbAdapter.open(makeDatabaseSeedSnapshot(), {
      databaseName: "showcase-batch",
    });
    const { patches, counts } = seatEdits([0, 1]);
    const request = {
      documentId: DATABASE_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "batch-m1",
      operations: patches,
      versionOperationCounts: counts,
    };

    const applied = await adapter.commitBatch(request);
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") expect(applied.version).toBe(2);
    const stats = adapter.stats();
    expect(stats.currentVersion).toBe(2);
    expect(stats.tailLength).toBe(2);

    const stored = await adapter.load(DATABASE_DOCUMENT_ID);
    expect(stored.version).toBe(2);
    expect(
      stored.sheets.find((sheet) => sheet.id === "ledger")?.cells.flatMap((block) => block.cells)
        .length,
    ).toBeGreaterThan(0);

    const duplicate = await adapter.commitBatch(request);
    expect(duplicate.status).toBe("duplicate");
    if (duplicate.status === "duplicate") expect(duplicate.version).toBe(2);
    expect(adapter.stats().currentVersion).toBe(2);
    adapter.close();
  });

  it("applies no member when the base version is stale and reports batch positions", async () => {
    const adapter = await ShowcaseIndexedDbAdapter.open(makeDatabaseSeedSnapshot(), {
      databaseName: "showcase-batch-conflict",
    });
    await adapter.commit({
      documentId: DATABASE_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "single-m1",
      operations: [
        {
          op: "set",
          addr: { sheet: "ledger", row: 0, col: 1 },
          value: { kind: "literal", value: 1 },
        },
      ],
    });

    const { patches, counts } = seatEdits([1, 2]);
    const conflict = await adapter.commitBatch({
      documentId: DATABASE_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "batch-m2",
      operations: patches,
      versionOperationCounts: counts,
    });
    expect(conflict.status).toBe("conflict");
    if (conflict.status === "conflict") {
      expect(conflict.currentVersion).toBe(1);
      // The recoverable tail is the single commit that reached the head.
      expect(conflict.operationsSinceBase?.map((entry) => entry.clientMutationId)).toEqual([
        "single-m1",
      ]);
    }
    // The stale batch stored nothing: the head and tail are unchanged.
    expect(adapter.stats().currentVersion).toBe(1);
    expect(adapter.stats().tailLength).toBe(1);
    adapter.close();
  });
});
