import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type PersistenceBatchCommitRequest,
  PresenceCoordinator,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type VersionedOperation,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import {
  COLLABORATION_ACTORS,
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  ShowcaseNetworkLink,
  ShowcasePresenceBus,
} from "../src/showcases/collaboration-protocol.ts";
import {
  COLLABORATION_DOCUMENT_ID,
  COLLABORATION_TOTAL_CELL,
  makeCollaborationSnapshot,
} from "../src/showcases/collaboration-seed.js";

/** Forecast column amounts by row straight from the generated seed, independent of the engine. */
function seedForecastAmounts(): readonly number[] {
  const sheet = makeCollaborationSnapshot().sheets.find((candidate) => candidate.id === "plan");
  if (!sheet) throw new Error("The collaboration seed has no plan sheet");
  const amounts: number[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.colOffset !== 2 || cell.value.kind !== "literal") continue;
      if (typeof cell.value.value === "number") {
        amounts[block.startRow + cell.rowOffset] = cell.value.value;
      }
    }
  }
  return amounts;
}

/** Forecast total straight from the generated seed, independent of the engine. */
function seedForecastTotal(): number {
  return seedForecastAmounts().reduce((total, amount) => total + amount, 0);
}

/** One seed forecast row amount by index. */
function seedAmount(row: number): number {
  const amount = seedForecastAmounts()[row];
  if (amount === undefined) throw new Error(`The collaboration seed has no forecast row ${row}`);
  return amount;
}

beforeAll(async () => {
  await initSheetwrite();
});

const restoreCanvasStubs = installCanvasTestStubs();

afterAll(() => {
  restoreCanvasStubs();
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function mountGrid(): { grid: Grid; host: HTMLDivElement } {
  const host = document.createElement("div");
  host.style.width = "520px";
  host.style.height = "260px";
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, makeCollaborationSnapshot());
  cleanups.push(() => {
    grid.destroy();
    host.remove();
  });
  return { grid, host };
}

function pointsEdit(row: number, value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "plan", row, col: 2 },
    value: { kind: "literal" as const, value },
  };
}

/** Resolves on the first coordinator event matching the predicate. Attach before triggering. */
function onceSyncEvent(
  sync: SyncCoordinator,
  predicate: (event: SyncCoordinatorEvent) => boolean,
): Promise<SyncCoordinatorEvent> {
  const { promise, resolve } = Promise.withResolvers<SyncCoordinatorEvent>();
  const dispose = sync.on((event) => {
    if (!predicate(event)) return;
    dispose();
    resolve(event);
  });
  cleanups.push(dispose);
  return promise;
}

describe("showcase collaboration server", () => {
  it("sequences commits and reports applied, duplicate, and conflict acknowledgements", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const records: ShowcaseCommitRecord[] = [];
    cleanups.push(server.observeCommits((record) => records.push(record)));

    const applied = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m1",
      operations: [pointsEdit(0, seedAmount(0) + 1)],
    });
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") expect(applied.version).toBe(1);

    const duplicate = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m1",
      operations: [pointsEdit(0, seedAmount(0) + 1)],
    });
    expect(duplicate.status).toBe("duplicate");

    const conflict = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m2",
      operations: [pointsEdit(1, seedAmount(1) + 1)],
    });
    expect(conflict.status).toBe("conflict");

    expect(records.map((record) => record.status)).toEqual(["applied", "duplicate", "conflict"]);
    expect(records.map((record) => record.version)).toEqual([1, 1, 1]);
  });
});

describe("showcase network link", () => {
  it("loses one acknowledgement and its echo, then answers the retry with duplicate", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const delivered: number[] = [];
    link.subscribe((operation) => delivered.push(operation.version));

    link.dropNextAcknowledgement();
    const request = {
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "flaky-m1",
      operations: [pointsEdit(0, 12)],
    };
    await expect(link.commit(request)).rejects.toBeInstanceOf(ShowcaseLinkError);
    // The server stored the commit, but neither the ack nor the echo arrived.
    expect(delivered).toEqual([]);

    const retry = await link.commit(request);
    expect(retry.status).toBe("duplicate");
    if (retry.status === "duplicate") expect(retry.version).toBe(1);
  });

  it("hands every broadcast a remount missed to the next subscriber, in order", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const edit = (row: number) =>
      server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(row, 12)]);
    const unsubscribe = link.subscribe(() => {});
    await edit(0); // v1, delivered to the old subscriber
    link.setConnected(false);
    await edit(1); // v2, queued while offline
    link.holdNextBroadcast();
    link.setConnected(true); // delivers v2 to the old subscriber
    await edit(2); // v3, held
    unsubscribe(); // the client starts remounting
    link.releaseHeldBroadcasts(); // v3 released with nobody subscribed
    link.setConnected(false);
    await edit(3); // v4, queued while offline
    link.setConnected(true); // v4 drained with nobody subscribed
    await edit(4); // v5, arrives with nobody subscribed
    link.startFrom(3); // the remounted snapshot already holds v1-v3
    const delivered: number[] = [];
    link.subscribe((operation) => delivered.push(operation.version));
    await edit(5); // v6, live
    expect(delivered).toEqual([4, 5, 6]);
  });
});

describe("atomic batch commits", () => {
  it("applies every version or none, and the peer applies the whole batch once", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const a = mountGrid();
    const b = mountGrid();
    const linkA = new ShowcaseNetworkLink(server);
    const linkB = new ShowcaseNetworkLink(server);
    cleanups.push(
      () => linkA.destroy(),
      () => linkB.destroy(),
    );

    let nextMutation = 1;
    const syncB = new SyncCoordinator(b.grid, linkB, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `bram-${nextMutation++}`,
    });
    cleanups.push(() => syncB.destroy());
    syncB.subscribe(linkB);

    const seedTotal = seedForecastTotal();
    const broadcasts: VersionedOperation[] = [];
    cleanups.push(server.subscribe((operation) => broadcasts.push(operation)));
    let peerTransactions = 0;
    cleanups.push(
      b.grid.on("change", (event) => {
        if (event.source === "remote") peerTransactions += 1;
      }),
    );

    const valueAt = (row: number) =>
      Number(a.grid.store.getCell({ sheet: "plan", row, col: 2 }).resolved);
    const request: PersistenceBatchCommitRequest = {
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "batch-m1",
      operations: [pointsEdit(0, valueAt(0) + 1), pointsEdit(1, valueAt(1) + 1)],
      versionOperationCounts: [1, 1],
    };

    const peerApplied = onceSyncEvent(
      syncB,
      (event) => event.type === "remote-applied" && event.operation.version === 2,
    );
    const response = await linkA.commitBatch(request);
    expect(response.status).toBe("applied");
    if (response.status === "applied") expect(response.version).toBe(2);
    await peerApplied;
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(seedTotal + 2);
    // One remote transaction for the whole batch, and every member carries its position.
    expect(peerTransactions).toBe(1);
    expect(broadcasts.map((operation) => operation.batch)).toEqual([
      { index: 0, count: 2 },
      { index: 1, count: 2 },
    ]);

    // A replayed batch is a duplicate at the last version and applies nothing twice.
    const duplicate = await linkA.commitBatch(request);
    expect(duplicate.status).toBe("duplicate");
    if (duplicate.status === "duplicate") expect(duplicate.version).toBe(2);
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(seedTotal + 2);

    // A stale base version applies no member at all.
    const conflict = await linkA.commitBatch({
      ...request,
      clientMutationId: "batch-m2",
      operations: [pointsEdit(2, valueAt(2) + 1), pointsEdit(3, valueAt(3) + 1)],
    });
    expect(conflict.status).toBe("conflict");
    if (conflict.status === "conflict") {
      expect(conflict.currentVersion).toBe(2);
      expect(conflict.operationsSinceBase?.map((operation) => operation.batch)).toEqual([
        { index: 0, count: 2 },
        { index: 1, count: 2 },
      ]);
    }
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(seedTotal + 2);
  });
});

describe("two-client protocol integration", () => {
  it("converges ordered commits, drains an offline durable queue, and buffers version gaps", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const bus = new ShowcasePresenceBus();
    const seedTotal = seedForecastTotal();
    const a = mountGrid();
    const b = mountGrid();
    const linkA = new ShowcaseNetworkLink(server);
    const linkB = new ShowcaseNetworkLink(server);
    cleanups.push(
      () => linkA.destroy(),
      () => linkB.destroy(),
    );

    let nextMutation = 1;
    const syncA = new SyncCoordinator(a.grid, linkA, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `ana-${nextMutation++}`,
    });
    const syncB = new SyncCoordinator(b.grid, linkB, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `bram-${nextMutation++}`,
    });
    cleanups.push(
      () => syncA.destroy(),
      () => syncB.destroy(),
    );
    syncA.subscribe(linkA);
    syncB.subscribe(linkB);

    const presenceA = new PresenceCoordinator(a.grid, bus.endpoint(), {
      actor: COLLABORATION_ACTORS[0],
      heartbeatMs: 0,
    });
    const presenceB = new PresenceCoordinator(b.grid, bus.endpoint(), {
      actor: COLLABORATION_ACTORS[1],
      heartbeatMs: 0,
    });
    cleanups.push(
      () => presenceA.destroy(),
      () => presenceB.destroy(),
    );

    // Ordered convergence: Ana raises one forecast row by one unit.
    const bAppliedV1 = onceSyncEvent(
      syncB,
      (event) => event.type === "remote-applied" && event.operation.version === 1,
    );
    a.grid.applyTransaction({ patches: [pointsEdit(0, seedAmount(0) + 1)] });
    await syncA.flush();
    await bAppliedV1;
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(seedTotal + 1);
    expect(syncB.serverVersion).toBe(1);

    // Presence: Ana's selection is painted inside Bram's grid.
    a.grid.setSelection({ kind: "cell", addr: { sheet: "plan", row: 0, col: 2 } });
    await presenceA.publishNow();
    b.grid.refresh();
    expect(
      b.host.querySelectorAll(`[data-sheetwrite-presence="${COLLABORATION_ACTORS[0].id}"]`).length,
    ).toBeGreaterThan(0);
    expect(presenceB.remotePresence().map((message) => message.actor.id)).toContain(
      COLLABORATION_ACTORS[0].id,
    );

    // Offline: Bram queues two local commits, then reconnects and drains in order.
    syncB.setOnline(false);
    linkB.setConnected(false);
    b.grid.applyTransaction({ patches: [pointsEdit(3, seedAmount(3) + 1)] });
    b.grid.applyTransaction({ patches: [pointsEdit(4, seedAmount(4) + 1)] });
    expect(syncB.pendingCount).toBe(2);
    const aAppliedV3 = onceSyncEvent(
      syncA,
      (event) => event.type === "remote-applied" && event.operation.version === 3,
    );
    const bDrained = onceSyncEvent(
      syncB,
      (event) => event.type === "state" && event.state.pendingCount === 0,
    );
    linkB.setConnected(true);
    syncB.setOnline(true);
    await bDrained;
    expect(syncB.serverVersion).toBe(3);
    await aAppliedV3;
    expect(a.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(seedTotal + 3);

    // Version gap: hold v4 on Bram's link, deliver v5 first, then close the gap.
    const bSawGap = onceSyncEvent(syncB, (event) => event.type === "reload-required");
    const bAppliedV5 = onceSyncEvent(
      syncB,
      (event) => event.type === "remote-applied" && event.operation.version === 5,
    );
    linkB.holdNextBroadcast();
    a.grid.applyTransaction({ patches: [pointsEdit(0, seedAmount(0) + 2)] });
    await syncA.flush();
    a.grid.applyTransaction({ patches: [pointsEdit(1, seedAmount(1) + 1)] });
    await syncA.flush();
    await bSawGap;
    expect(syncB.serverVersion).toBe(3);
    linkB.releaseHeldBroadcasts();
    await bAppliedV5;
    expect(syncB.serverVersion).toBe(5);
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(
      a.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved,
    );

    // Conflict: Ana misses the server broadcast, commits on a stale base, and the
    // coordinator retains the conflicted mutation for explicit host recovery.
    linkA.holdNextBroadcast();
    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [
      pointsEdit(2, seedAmount(2) + 1),
    ]);
    const aConflicted = onceSyncEvent(syncA, (event) => event.type === "conflict");
    a.grid.applyTransaction({ patches: [pointsEdit(0, seedAmount(0) + 3)] });
    await syncA.flush();
    const conflictEvent = (await aConflicted) as Extract<
      SyncCoordinatorEvent,
      { type: "conflict" }
    >;
    expect(conflictEvent.response.currentVersion).toBe(6);
    expect(conflictEvent.response.operationsSinceBase?.length).toBe(1);
    expect(syncA.pendingCommits()[0]?.status).toBe("conflicted");
  });
});
