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
function expectQueue(queue: PendingRecordQueue, expected: readonly SyncMutationRecord[]): void {
  expect(queue.head()).toBe(expected[0]);
  expect(queue.count("pending")).toBe(expected.length);
  expect(queue.versionCount).toBe(expected.length);
  expect(queue.toArray()).toEqual([...expected]);
}

describe("PendingRecordQueue", () => {
  it("keeps the head through an in-order drain longer than its compaction threshold", () => {
    const queue = new PendingRecordQueue();
    const records = Array.from({ length: 1_000 }, (_, id) => record(id));
    for (const item of records) queue.add(item);
    for (let index = 0; index < records.length; index += 1) {
      expect(queue.head()).toBe(records[index]);
      queue.remove(`m-${index}`);
    }
    expectQueue(queue, []);
    queue.add(records[0] as SyncMutationRecord);
    expectQueue(queue, [records[0] as SyncMutationRecord]);
  });

  it("removes records near the head and near the tail out of order", () => {
    const queue = new PendingRecordQueue();
    const live = Array.from({ length: 200 }, (_, id) => record(id));
    for (const item of live) queue.add(item);
    for (const id of [1, 0, 3, 198, 2, 150, 4, 199]) {
      queue.remove(`m-${id}`);
      live.splice(
        live.findIndex((item) => item.clientMutationId === `m-${id}`),
        1,
      );
      expectQueue(queue, live);
    }
    queue.remove("m-1");
    expectQueue(queue, live);
  });

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
    expectQueue(queue, live);
  });
});
