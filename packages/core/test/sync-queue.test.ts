import { describe, expect, it } from "bun:test";

import { PendingRecordQueue } from "../src/sync-queue.js";
import type { SyncMutationRecord } from "../src/types/transaction.js";

function record(id: number): SyncMutationRecord {
  return {
    documentId: "queue",
    baseVersion: id,
    clientMutationId: `m-${id}`,
    operations: [],
    status: "pending",
  };
}

/** The queue's head, pending count and version total against a plain array of records. */
function expect_queue(queue: PendingRecordQueue, expected: readonly SyncMutationRecord[]): void {
  expect(queue.head()).toBe(expected[0]);
  expect(queue.count("pending")).toBe(expected.length);
  expect(queue.versionCount).toBe(expected.length);
  expect(queue.toArray()).toEqual([...expected]);
}

describe("PendingRecordQueue", () => {
  it("matches a plain array under interleaved adds, removals and clears", () => {
    const queue = new PendingRecordQueue();
    let live: SyncMutationRecord[] = [];
    let next = 0;
    let seed = 7;
    const random = (bound: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % bound;
    };
    for (let step = 0; step < 5_000; step += 1) {
      const choice = random(100);
      if (choice < 50 || live.length === 0) {
        const item = record(next++);
        queue.add(item);
        live.push(item);
      } else if (choice < 85) {
        const head = live.shift() as SyncMutationRecord;
        queue.remove(head.clientMutationId);
      } else if (choice < 99) {
        const [item] = live.splice(random(live.length), 1);
        queue.remove((item as SyncMutationRecord).clientMutationId);
      } else {
        queue.clear();
        live = [];
      }
      expect(queue.head()).toBe(live[0]);
    }
    expect_queue(queue, live);
  });
});
