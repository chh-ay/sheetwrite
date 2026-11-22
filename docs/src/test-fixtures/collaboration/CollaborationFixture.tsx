import {
  ShowcaseCollaborationServer,
  ShowcasePresenceBus,
} from "@docs/showcases/collaboration-protocol.js";
import { deleteShowcaseDatabase } from "@docs/showcases/showcase-database.js";
import {
  createGridFromSnapshot,
  initSheetwrite,
  type PendingCommit,
  PresenceCoordinator,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import { createSignal, onCleanup, onMount } from "solid-js";

const GRID_HOST_STYLE = { width: "520px", height: "260px" };
const PENDING_LOAD_BOUNDS = { maxRecords: 16, maxOperations: 256, maxBytes: 1024 * 1024 };
const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  documentId: "browser-collaboration",
  version: 0,
  workbook: { activeSheet: "s1" },
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      order: 0,
      rowCount: 4,
      columns: [
        { key: "a", header: "A", width: 120, type: "number" },
        { key: "b", header: "B", width: 120, type: "number" },
      ],
      cells: [],
    },
  ],
};

async function exercise_collaboration(host_a: HTMLDivElement, host_b: HTMLDivElement) {
  await initSheetwrite();
  const server = new ShowcaseCollaborationServer(snapshot);
  const grid_a = createGridFromSnapshot(host_a, snapshot);
  const grid_b = createGridFromSnapshot(host_b, snapshot);
  let next_mutation = 1;
  const sync_a = new SyncCoordinator(grid_a, server, {
    documentId: "browser-collaboration",
    serverVersion: 0,
    createMutationId: () => `browser-a-${next_mutation++}`,
  });
  const sync_b = new SyncCoordinator(grid_b, server, {
    documentId: "browser-collaboration",
    serverVersion: 0,
  });
  const presence_bus = new ShowcasePresenceBus();
  const presence_a = new PresenceCoordinator(grid_a, presence_bus.endpoint(), {
    actor: { id: "actor-a", displayName: "Actor A", color: "#dc2626" },
    heartbeatMs: 0,
  });
  const presence_b = new PresenceCoordinator(grid_b, presence_bus.endpoint(), {
    actor: { id: "actor-b", displayName: "Actor B", color: "#2563eb" },
    heartbeatMs: 0,
  });

  try {
    sync_a.subscribe(server);
    sync_b.subscribe(server);
    grid_a.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: 21 },
        },
      ],
    });
    await sync_a.sendNext();
    grid_a.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "formula", src: "=A1*2" },
        },
      ],
    });
    await sync_a.sendNext();
    grid_a.renameSheet("s1", "Shared");
    await sync_a.sendNext();

    const literal = grid_b.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved;
    const formula = grid_b.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved;
    const sheet_name = grid_b.store.getWorkbook().sheets[0]?.name;
    if (literal !== 21 || formula !== 42 || sheet_name !== "Shared") {
      throw new Error("Two-grid server sequencing did not converge cell/formula/metadata state");
    }

    grid_a.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    await presence_a.publishNow();
    grid_b.refresh();
    const presence_rects = host_b.querySelectorAll('[data-sheetwrite-presence="actor-a"]');
    if (presence_rects.length === 0) throw new Error("Remote presence overlay was not painted");

    const database_name = "sheetwrite-browser-collaboration-test";
    await deleteShowcaseDatabase(database_name);
    const durable = new IndexedDbPendingCommitStorage({ databaseName: database_name });
    const pending: PendingCommit = {
      documentId: "browser-collaboration",
      baseVersion: 3,
      clientMutationId: "durable-browser-m1",
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 0 },
          value: { kind: "literal", value: 84 },
        },
      ],
    };
    await durable.put(pending);
    durable.close();
    await Promise.resolve();
    const reopened = new IndexedDbPendingCommitStorage({ databaseName: database_name });
    try {
      const restored = await reopened.load("browser-collaboration", PENDING_LOAD_BOUNDS);
      if (restored.length !== 1 || restored[0]?.clientMutationId !== "durable-browser-m1") {
        throw new Error("IndexedDB pending commit did not survive reopen");
      }
      await reopened.remove("browser-collaboration", "durable-browser-m1");
      if ((await reopened.load("browser-collaboration", PENDING_LOAD_BOUNDS)).length !== 0) {
        throw new Error("Acknowledged IndexedDB commit was not removed");
      }
      return {
        literal,
        formula,
        sheetName: sheet_name,
        presenceRects: presence_rects.length,
        restoredMutation: restored[0]?.clientMutationId,
        version: sync_b.serverVersion,
      };
    } finally {
      reopened.close();
    }
  } finally {
    presence_a.destroy();
    presence_b.destroy();
    sync_a.destroy();
    sync_b.destroy();
    grid_a.destroy();
    grid_b.destroy();
  }
}

export function CollaborationFixture() {
  let host_a: HTMLDivElement | undefined;
  let host_b: HTMLDivElement | undefined;
  const [result, set_result] = createSignal<{
    status: "running" | "ready" | "error";
    text: string;
  }>({
    status: "running",
    text: "running",
  });

  onMount(() => {
    if (host_a === undefined || host_b === undefined) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    void exercise_collaboration(host_a, host_b).then(
      (payload) => {
        if (!cancelled) set_result({ status: "ready", text: JSON.stringify(payload) });
      },
      (error: unknown) => {
        if (!cancelled) {
          set_result({
            status: "error",
            text: error instanceof Error ? (error.stack ?? error.message) : String(error),
          });
        }
      },
    );
  });

  return (
    <>
      <pre id="result" data-status={result().status}>
        {result().text}
      </pre>
      <div
        ref={(element) => {
          host_a = element;
        }}
        style={GRID_HOST_STYLE}
      />
      <div
        ref={(element) => {
          host_b = element;
        }}
        style={GRID_HOST_STYLE}
      />
    </>
  );
}
