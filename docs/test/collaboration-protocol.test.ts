import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite, type VersionedOperation } from "@sheetwrite/core";

import {
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  ShowcaseNetworkLink,
} from "../src/showcases/collaboration-protocol.ts";
import {
  COLLABORATION_DOCUMENT_ID,
  makeCollaborationSnapshot,
} from "../src/showcases/collaboration-seed.js";

// Two-client convergence, presence, version gaps, conflicts and the peer's
// atomic batch apply are owned by test/browser/database-collaboration.spec.ts.

beforeAll(async () => {
  await initSheetwrite();
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function pointsEdit(row: number, value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "plan", row, col: 2 },
    value: { kind: "literal" as const, value },
  };
}

function commitRequest(clientMutationId: string, rows: readonly number[]) {
  return {
    documentId: COLLABORATION_DOCUMENT_ID,
    baseVersion: 0,
    clientMutationId,
    operations: rows.map((row) => pointsEdit(row, 12)),
  };
}

describe("showcase collaboration server", () => {
  it("sequences single commits and reports applied, duplicate, and conflict acknowledgements", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const records: ShowcaseCommitRecord[] = [];
    cleanups.push(server.observeCommits((record) => records.push(record)));

    expect(await server.commit(commitRequest("unit-m1", [0]))).toMatchObject({
      status: "applied",
      version: 1,
    });
    expect((await server.commit(commitRequest("unit-m1", [0]))).status).toBe("duplicate");
    expect((await server.commit(commitRequest("unit-m2", [1]))).status).toBe("conflict");
    expect(records.map(({ status, version }) => [status, version])).toEqual([
      ["applied", 1],
      ["duplicate", 1],
      ["conflict", 1],
    ]);
  });

  it("sequences an atomic batch with each member's position, once, and applies a stale one nowhere", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const broadcasts: VersionedOperation[] = [];
    const statuses: string[] = [];
    cleanups.push(server.subscribe((operation) => broadcasts.push(operation)));
    cleanups.push(server.observeCommits((record) => statuses.push(record.status)));
    const request = { ...commitRequest("batch-m1", [0, 1]), versionOperationCounts: [1, 1] };

    expect(await link.commitBatch(request)).toMatchObject({ status: "applied", version: 2 });
    expect(await link.commitBatch(request)).toMatchObject({ status: "duplicate", version: 2 });
    const conflict = await link.commitBatch({ ...request, clientMutationId: "batch-m2" });
    expect(conflict).toMatchObject({ status: "conflict", currentVersion: 2 });
    expect(statuses).toEqual(["applied", "duplicate", "conflict"]);
    expect(server.headVersion(COLLABORATION_DOCUMENT_ID)).toBe(2);
    expect(broadcasts.map((operation) => [operation.version, operation.batch])).toEqual([
      [1, { index: 0, count: 2 }],
      [2, { index: 1, count: 2 }],
    ]);
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
    const request = commitRequest("flaky-m1", [0]);
    await expect(link.commit(request)).rejects.toBeInstanceOf(ShowcaseLinkError);
    // The server stored the commit, but neither the ack nor the echo arrived.
    expect(delivered).toEqual([]);

    expect(await link.commit(request)).toMatchObject({ status: "duplicate", version: 1 });
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
