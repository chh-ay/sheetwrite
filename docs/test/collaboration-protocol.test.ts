import { afterEach, beforeAll, expect, it } from "bun:test";

import { initSheetwrite } from "@sheetwrite/core";

import {
  ShowcaseCollaborationServer,
  ShowcaseNetworkLink,
} from "../src/showcases/collaboration-protocol.ts";
import {
  COLLABORATION_DOCUMENT_ID,
  makeCollaborationSnapshot,
} from "../src/showcases/collaboration-seed.js";

// Acknowledgements, retries, conflicts and the peer's atomic batch apply are
// owned by test/browser/database-collaboration.spec.ts.

beforeAll(async () => {
  await initSheetwrite();
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

it("hands every broadcast a remount missed to the next subscriber, in order", async () => {
  const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
  const link = new ShowcaseNetworkLink(server);
  cleanups.push(() => link.destroy());
  const edit = (row: number) =>
    server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [
      { op: "set", addr: { sheet: "plan", row, col: 2 }, value: { kind: "literal", value: 12 } },
    ]);
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
