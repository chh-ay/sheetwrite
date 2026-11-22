import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import {
  type ApplyTransactionResult,
  type ChangeEvent,
  createGrid,
  createGridFromSnapshot,
  type DocumentOp,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type SyncCoordinatorOptions,
  SyncPendingCapacityError,
  SyncProtocolError,
  type VersionedOperation,
  type PendingCommit,
  type PendingCommitStorage,
  type WorkbookSnapshot,
} from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import type * as SyncModule from "../src/sync.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;
beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
const teardown: Array<() => void> = [];
afterEach(() => {
  for (const dispose of teardown.splice(0)) dispose();
  restore_stubs();
});

class ControlledAdapter implements PersistenceAdapter {
  readonly requests: PersistenceCommitRequest[] = [];
  readonly responses: Array<PromiseWithResolvers<PersistenceCommitResponse>> = [];

  constructor(private readonly snapshot: WorkbookSnapshot) {}

  async load(): Promise<WorkbookSnapshot> {
    return structuredClone(this.snapshot);
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    this.requests.push(request);
    const response = Promise.withResolvers<PersistenceCommitResponse>();
    this.responses.push(response);
    return response.promise;
  }
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "sync-doc",
    version: 7,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount: 3,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "literal", value: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}

function local_set(value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal" as const, value },
  };
}

function harness(ids = ["m1", "m2", "m3"], options: Partial<SyncCoordinatorOptions> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot());
  const adapter = new ControlledAdapter(snapshot());
  let index = 0;
  const coordinator = new SyncCoordinator(grid, adapter, {
    documentId: "sync-doc",
    serverVersion: 7,
    createMutationId: () => ids[index++]!,
    ...options,
  });
  const events: SyncCoordinatorEvent[] = [];
  coordinator.on((event) => events.push(event));
  teardown.push(() => {
    coordinator.destroy();
    grid.destroy();
  });
  return { grid, adapter, coordinator, events };
}

function applied(version: number, client_mutation_id: string): PersistenceCommitResponse {
  return { status: "applied", version, clientMutationId: client_mutation_id };
}

function expect_sync_error(events: readonly SyncCoordinatorEvent[], code: string): void {
  expect(
    events.some(
      (event) =>
        event.type === "error" &&
        event.error instanceof SyncProtocolError &&
        event.error.code === code,
    ),
  ).toBe(true);
}

describe("sync coordinator", () => {
  it("restores a million-number clear in one version at the server and a synced peer", async () => {
    const rows = 1_000;
    const cols = 1_000;
    const columns = Array.from({ length: cols }, (_, col) => ({
      key: `number${col}`,
      header: `Number ${col}`,
      width: 80,
      type: "number" as const,
    }));
    const workbook = {
      activeSheet: "s1",
      sheets: [{ id: "s1", name: "Numbers", rowCount: rows, columns }],
    };
    const columnar = {
      rowCount: rows,
      columns: Object.fromEntries(
        columns.map((column, col) => [
          column.key,
          Float64Array.from({ length: rows }, (_, row) => row * cols + col),
        ]),
      ),
    };
    const first_host = document.createElement("div");
    const second_host = document.createElement("div");
    document.body.append(first_host, second_host);
    const first = createGrid(first_host, { workbook: structuredClone(workbook), data: columnar });
    const second = createGrid(second_host, { workbook: structuredClone(workbook), data: columnar });
    const server = new SheetwriteStore(structuredClone(workbook), columnar);
    let server_version = 0;
    const committed: VersionedOperation[] = [];
    const adapter: PersistenceAdapter = {
      async load() {
        return { ...server.exportSnapshot(), documentId: "large-undo", version: server_version };
      },
      async commit(request) {
        if (request.baseVersion !== server_version) {
          return { status: "conflict", currentVersion: server_version };
        }
        // Cross the JSON transport boundary, then apply to a real server store.
        const operations: DocumentOp[] = JSON.parse(JSON.stringify(request.operations));
        const outcome = server.applyTransaction({ patches: operations }, { source: "remote" });
        if (outcome.status !== "applied") throw new Error(`Server rejected ${outcome.status}`);
        server_version += 1;
        committed.push({
          version: server_version,
          operations,
          clientMutationId: request.clientMutationId,
        });
        return {
          status: "applied",
          version: server_version,
          clientMutationId: request.clientMutationId,
        };
      },
    };
    const sender = new SyncCoordinator(first, adapter, {
      documentId: "large-undo",
      serverVersion: 0,
    });
    const receiver = new SyncCoordinator(second, adapter, {
      documentId: "large-undo",
      serverVersion: 0,
    });
    const changes: ChangeEvent[] = [];
    first.on("change", (event) => changes.push(event));
    try {
      expect(
        first.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: {
                sheet: "s1",
                start: { row: 0, col: 0 },
                end: { row: rows - 1, col: cols - 1 },
              },
              contents: true,
              style: false,
            },
          ],
        }).status,
      ).toBe("applied");
      await sender.sendNext();
      const clear_version = committed.at(-1);
      if (!clear_version) throw new Error("Clear did not reach the server");
      await receiver.applyVersionedOperation(clear_version);
      expect(second.store.getCell({ sheet: "s1", row: 999, col: 999 }).resolved).toBeNull();

      first.undo();
      expect(sender.pendingCount).toBe(1);
      await sender.sendNext();
      expect(committed).toHaveLength(2);
      const undo_version = committed.at(-1);
      if (!undo_version) throw new Error("Undo did not reach the server");
      expect(
        new TextEncoder().encode(JSON.stringify(undo_version.operations)).byteLength,
      ).toBeLessThanOrEqual(8 * 1024 * 1024);
      await receiver.applyVersionedOperation(undo_version);
      for (const store of [first.store, server, second.store]) {
        const restored = store.getVisibleWindow(
          "s1",
          { start: 0, end: rows },
          columns.map((_, col) => col),
        ).values;
        let mismatches = 0;
        for (let offset = 0; offset < rows * cols; offset += 1) {
          if (restored[offset] !== offset) mismatches += 1;
        }
        expect(mismatches).toBe(0);
      }
      expect(changes.map((event) => event.commitReason)).toEqual(["api", "undo"]);
      expect(sender.pendingCount).toBe(0);
      expect(receiver.serverVersion).toBe(2);
    } finally {
      sender.destroy();
      receiver.destroy();
      first.destroy();
      second.destroy();
      server.dispose();
    }
  }, 60_000);
  it("commits a split local step atomically and publishes one peer change", async () => {
    const adapter = new MemoryPersistenceAdapter(snapshot());
    const sender_host = document.createElement("div");
    const peer_host = document.createElement("div");
    document.body.append(sender_host, peer_host);
    const sender_grid = createGridFromSnapshot(sender_host, snapshot());
    const peer_grid = createGridFromSnapshot(peer_host, snapshot());
    const options = {
      documentId: "sync-doc",
      serverVersion: 7,
      limits: { maxOperationsPerVersion: 1 },
    };
    const sender = new SyncCoordinator(sender_grid, adapter, options);
    const peer = new SyncCoordinator(peer_grid, adapter, options);
    const changes: ChangeEvent[] = [];
    peer_grid.on("change", (event) => changes.push(event));
    try {
      const outcome = sender_grid.applyTransaction({
        patches: [
          local_set(12),
          {
            op: "set",
            addr: { sheet: "s1", row: 1, col: 0 },
            value: { kind: "literal", value: 34 },
          },
        ],
      });
      expect(outcome.status).toBe("applied");
      const response = await sender.sendNext();
      expect(response).toMatchObject({ status: "applied", version: 9 });
      const conflict = await adapter.commit({
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "read-tail",
        operations: [],
      });
      if (conflict.status !== "conflict" || !conflict.operationsSinceBase)
        throw new Error("The adapter must return the committed batch");
      const versions = conflict.operationsSinceBase;
      expect(versions).toHaveLength(2);
      const first_version = versions[0];
      const last_version = versions[1];
      if (!first_version || !last_version) throw new Error("The batch needs two versions");
      await peer.applyVersionedOperation(first_version);
      expect(peer_grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
      expect(peer.serverVersion).toBe(7);
      expect(changes).toHaveLength(0);
      await peer.applyVersionedOperation(last_version);
      expect(peer_grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(12);
      expect(peer_grid.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(34);
      expect(peer.serverVersion).toBe(9);
      expect(changes).toHaveLength(1);
      expect((await adapter.load("sync-doc")).version).toBe(9);
    } finally {
      sender.destroy();
      peer.destroy();
      sender_grid.destroy();
      peer_grid.destroy();
    }
  });

  it("leaves a peer unchanged when one batch member is rejected by the grid", async () => {
    const { grid, coordinator, events } = harness();
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    await coordinator.applyVersionedOperation({
      version: 8,
      operations: [local_set(12)],
      batch: { index: 0, count: 2 },
    });
    await coordinator.applyVersionedOperation({
      version: 9,
      operations: [
        {
          op: "set",
          addr: { sheet: "missing", row: 0, col: 0 },
          value: { kind: "literal", value: 34 },
        },
      ],
      batch: { index: 1, count: 2 },
    });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(coordinator.serverVersion).toBe(7);
    expect(changes).toHaveLength(0);
    expect_sync_error(events, "remote-operations-rejected");
  });

  it("keeps the per-version byte limit for remote batch members", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: { maxVersionPayloadBytes: 256 },
    });
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    await coordinator.applyVersionedOperation({
      version: 8,
      operations: [local_set(12)],
      batch: { index: 0, count: 2 },
    });
    await coordinator.applyVersionedOperation({
      version: 9,
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: "x".repeat(256) },
        },
      ],
      batch: { index: 1, count: 2 },
    });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(grid.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBeNull();
    expect(coordinator.serverVersion).toBe(7);
    expect(changes).toHaveLength(0);
    expect_sync_error(events, "payload-limit");
  });

  it("syncs a split undo as one local history step and one peer change", async () => {
    const row_count = 80;
    const version_bytes = 2048;
    let random_state = 17;
    const values = Array.from({ length: row_count }, () =>
      Array.from({ length: 80 }, () => {
        random_state = (Math.imul(random_state, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(33 + ((random_state >>> 16) % 90));
      }).join(""),
    );
    const initial = snapshot();
    const sheet = initial.sheets[0];
    if (!sheet) throw new Error("The test snapshot needs a sheet");
    sheet.rowCount = row_count;
    sheet.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount: row_count,
        colCount: 1,
        cells: values.map((value, row_offset) => ({
          rowOffset: row_offset,
          colOffset: 0,
          value: { kind: "literal", value },
        })),
      },
    ];
    const first_host = document.createElement("div");
    const peer_host = document.createElement("div");
    document.body.append(first_host, peer_host);
    const grid_options = { transactionResourceLimits: { maxEncodedBytes: version_bytes } };
    const first = createGridFromSnapshot(first_host, initial, grid_options);
    const second = createGridFromSnapshot(peer_host, initial, grid_options);
    const adapter = new MemoryPersistenceAdapter(initial);
    const sync_options = {
      documentId: "sync-doc",
      serverVersion: 7,
      limits: { maxVersionPayloadBytes: version_bytes },
    };
    const sender = new SyncCoordinator(first, adapter, sync_options);
    const peer = new SyncCoordinator(second, adapter, sync_options);
    const local_changes: ChangeEvent[] = [];
    const peer_changes: ChangeEvent[] = [];
    first.on("change", (event) => local_changes.push(event));
    second.on("change", (event) => peer_changes.push(event));
    try {
      expect(
        first.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: {
                sheet: "s1",
                start: { row: 0, col: 0 },
                end: { row: row_count - 1, col: 0 },
              },
              contents: true,
              style: false,
            },
          ],
        }).status,
      ).toBe("applied");
      await sender.sendNext();
      first.undo();
      const undo = sender.pendingCommits()[0];
      if (!undo) throw new Error("Undo must enqueue a commit");
      expect(undo.versionOperationCounts?.length).toBeGreaterThan(1);
      expect((await sender.sendNext())?.status).toBe("applied");
      const tail = await adapter.commit({
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "read-undo",
        operations: [],
      });
      if (tail.status !== "conflict" || !tail.operationsSinceBase)
        throw new Error("The server must publish the clear and undo");
      for (const version of tail.operationsSinceBase) {
        expect(
          new TextEncoder().encode(JSON.stringify(version.operations)).length,
        ).toBeLessThanOrEqual(version_bytes);
        await peer.applyVersionedOperation(version);
      }
      for (let row = 0; row < row_count; row++) {
        const expected = values[row];
        if (expected === undefined) throw new Error("The source value is missing");
        expect(first.store.getCell({ sheet: "s1", row, col: 0 }).resolved).toBe(expected);
        expect(second.store.getCell({ sheet: "s1", row, col: 0 }).resolved).toBe(expected);
      }
      expect(local_changes.map((event) => event.commitReason)).toEqual(["api", "undo"]);
      expect(peer_changes).toHaveLength(2);
      first.redo();
      expect(first.store.getCell({ sheet: "s1", row: row_count - 1, col: 0 }).resolved).toBeNull();
      expect(local_changes.map((event) => event.commitReason)).toEqual(["api", "undo", "redo"]);
    } finally {
      sender.destroy();
      peer.destroy();
      first.destroy();
      second.destroy();
    }
  });

  it("rejects invalid resource-limit overrides at construction", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const adapter = new ControlledAdapter(snapshot());

    expect(
      () =>
        new SyncCoordinator(grid, adapter, {
          documentId: "sync-doc",
          serverVersion: 7,
          limits: { maxBufferedBytes: 0 },
        }),
    ).toThrow(SyncProtocolError);
    grid.destroy();
  });

  it("queues immutable local mutations and acknowledges only the matching ID", async () => {
    const { grid, adapter, coordinator, events } = harness();
    const patch = local_set(2);

    grid.applyTransaction({ patches: [patch] });
    patch.value.value = 99;

    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(coordinator.pendingCommits()).toEqual([
      {
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "m1",
        operations: [local_set(2)],
        status: "pending",
      },
    ]);

    const sending = coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0]).toMatchObject({
      documentId: "sync-doc",
      baseVersion: 7,
      clientMutationId: "m1",
      operations: [local_set(2)],
    });
    adapter.responses[0]!.resolve(applied(8, "m1"));
    await sending;

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(events.some((event) => event.type === "acknowledged")).toBe(true);
    coordinator.destroy();
    grid.applyTransaction({ patches: [local_set(3)] });
    expect(coordinator.pendingCount).toBe(0);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);
    grid.destroy();
  });

  it("refuses non-head sends and advances the durable queue serially", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [local_set(2)] });
    grid.applyTransaction({ patches: [local_set(3)] });

    const first = coordinator.send("m1");
    expect(await coordinator.send("m2")).toBeNull();
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "m1", status: "sending" },
      { clientMutationId: "m2", status: "pending" },
    ]);
    adapter.responses[0]!.resolve(applied(8, "m1"));
    await first;

    const second = coordinator.send("m2");
    expect(adapter.requests.at(-1)).toMatchObject({ clientMutationId: "m2", baseVersion: 8 });
    adapter.responses[1]!.resolve(applied(9, "m2"));
    await second;
    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(9);
    expect(events.filter((event) => event.type === "error")).toEqual([]);
  });

  it("rejects a response mutation ID mismatch before queue or version mutation", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [local_set(2)] });
    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve(applied(8, "wrong-id"));

    await expect(sending).rejects.toMatchObject({ code: "response-id-mismatch" });
    expect(coordinator.serverVersion).toBe(7);
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "m1", status: "pending" },
    ]);
    expect(events.some((event) => event.type === "error")).toBe(true);
  });

  it("retains conflicted work and exposes deterministic reload/reapply state", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [local_set(2)] });

    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "conflict",
      currentVersion: 8,
      snapshot: { ...snapshot(), version: 8 },
    });
    await sending;

    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "m1",
      status: "conflicted",
    });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(events.at(-1)?.type).toBe("conflict");
    expect(await coordinator.sendNext()).toBeNull();

    await coordinator.resumeAfterReload({ ...snapshot(), version: 8 });
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "m1",
      baseVersion: 8,
      status: "pending",
    });
  });

  it("recovers a cell-level conflict in place and resends the queue on the server head", async () => {
    const { grid, adapter, coordinator, events } = harness(["m1", "m2"]);
    const cell = (row: number) => grid.store.getCell({ sheet: "s1", row, col: 0 }).resolved;
    const set = (row: number, value: number) => ({
      op: "set" as const,
      addr: { sheet: "s1", row, col: 0 },
      value: { kind: "literal" as const, value },
    });
    const remote_changes: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remote_changes.push(event);
    });
    grid.applyTransaction({ patches: [set(0, 2)] });
    const sending = coordinator.sendNext();
    // A peer's atomic batch landed first, on rows this client did not edit.
    adapter.responses[0]!.resolve({
      status: "conflict",
      currentVersion: 9,
      operationsSinceBase: [
        {
          version: 8,
          operations: [set(1, 81)],
          clientMutationId: "peer",
          batch: { index: 0, count: 2 },
        },
        {
          version: 9,
          operations: [set(2, 92)],
          clientMutationId: "peer",
          batch: { index: 1, count: 2 },
        },
      ],
    });
    await sending;
    // Work queued before recovery runs is carried along.
    grid.applyTransaction({ patches: [set(0, 3)] });

    expect(await coordinator.recoverConflict()).toEqual({ status: "recovered", serverVersion: 9 });
    // Same Grid, no reload: the missed batch applied as one transaction.
    expect([cell(0), cell(1), cell(2)]).toEqual([3, 81, 92]);
    expect(remote_changes).toHaveLength(1);
    expect(
      coordinator
        .pendingCommits()
        .map(({ clientMutationId: client_mutation_id, baseVersion: base_version, status }) => ({
          clientMutationId: client_mutation_id,
          baseVersion: base_version,
          status,
        })),
    ).toEqual([
      { clientMutationId: "m1", baseVersion: 9, status: "pending" },
      { clientMutationId: "m2", baseVersion: 10, status: "pending" },
    ]);
    expect(events.some((event) => event.type === "recovered")).toBe(true);
    const resend = coordinator.sendNext();
    expect(adapter.requests[1]).toMatchObject({ clientMutationId: "m1", baseVersion: 9 });
    adapter.responses[1]!.resolve({ status: "applied", version: 10, clientMutationId: "m1" });
    await resend;
    expect(await coordinator.recoverConflict()).toEqual({ status: "no-conflict" });
  });

  it("keeps durable queue bases when a missed version is rejected during recovery", async () => {
    const replacements: string[][] = [];
    const records = new Map<string, PendingCommit>();
    const pending_storage: PendingCommitStorage = {
      load: async () => [],
      put: async (commit) => {
        records.set(commit.clientMutationId, structuredClone(commit));
      },
      remove: async (_document_id, client_mutation_id) => {
        records.delete(client_mutation_id);
      },
      replace: async (_document_id, expected, commits) => {
        replacements.push([...expected]);
        for (const commit of commits) records.set(commit.clientMutationId, structuredClone(commit));
      },
    };
    const { grid, coordinator } = harness(["m1"], { pendingStorage: pending_storage });
    await coordinator.ready();
    grid.applyTransaction({ patches: [local_set(2)] });
    await coordinator.ready();
    await coordinator.handleResponse(
      {
        status: "conflict",
        currentVersion: 8,
        operationsSinceBase: [
          {
            version: 8,
            operations: [
              {
                op: "set",
                addr: { sheet: "missing", row: 1, col: 0 },
                value: { kind: "literal", value: 8 },
              },
            ],
          },
        ],
      },
      "m1",
    );

    expect(await coordinator.recoverConflict()).toMatchObject({
      status: "reload-required",
      reason: "rejected",
    });
    expect(replacements).toEqual([]);
    expect(records.get("m1")?.baseVersion).toBe(7);
  });

  it("keeps the host offline flag when a remote subscription starts", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const coordinator = new SyncCoordinator(grid, new MemoryPersistenceAdapter(snapshot()), {
      documentId: "sync-doc",
      serverVersion: 7,
    });
    coordinator.setOnline(false);
    grid.applyTransaction({ patches: [local_set(2)] });

    const dispose = coordinator.subscribe({ subscribe: () => () => {} });
    // `flush` shares a running flush, so it shows whether `subscribe` started one.
    expect(await coordinator.flush()).toEqual([]);
    expect(coordinator.pendingCount).toBe(1);

    coordinator.setOnline(true);
    expect(await coordinator.flush()).toHaveLength(1);
    expect(coordinator.pendingCount).toBe(0);
    dispose();
    coordinator.destroy();
    grid.destroy();
  });

  it("creates distinct default mutation IDs on separate page loads in the same millisecond", async () => {
    const now = spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const ids: string[] = [];
    try {
      for (const page of ["first-page", "second-page"]) {
        // A fresh module instance stands in for a new page load: the module
        // state starts again, as it does in a reloaded browser tab.
        const page_module: typeof SyncModule = await import(`../src/sync.js?${page}`);
        const host = document.createElement("div");
        document.body.appendChild(host);
        const grid = createGridFromSnapshot(host, snapshot());
        const adapter = new ControlledAdapter(snapshot());
        const coordinator = new page_module.SyncCoordinator(grid, adapter, {
          documentId: "sync-doc",
          serverVersion: 7,
          initialConnection: "offline",
        });
        grid.applyTransaction({ patches: [local_set(2)] });
        const id = coordinator.pendingCommits()[0]?.clientMutationId;
        if (id === undefined) throw new Error("default mutation ID missing");
        ids.push(id);
        coordinator.destroy();
        grid.destroy();
      }
    } finally {
      now.mockRestore();
    }

    expect(new Set(ids).size).toBe(2);
  });

  it("leaves the conflict for a reload when in-place recovery is not safe", async () => {
    const set = (row: number, value: number) => ({
      op: "set" as const,
      addr: { sheet: "s1", row, col: 0 },
      value: { kind: "literal" as const, value },
    });
    const cases: Array<{
      name: string;
      response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
      afterConflict?: ReturnType<typeof set>;
      reason: string;
    }> = [
      {
        name: "a missed version edits the pending cell",
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [{ version: 8, operations: [set(0, 80)] }],
        },
        reason: "overlapping-work",
      },
      {
        name: "work queued after the conflict edits a missed cell",
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [{ version: 8, operations: [set(1, 80)] }],
        },
        afterConflict: set(1, 5),
        reason: "overlapping-work",
      },
      {
        name: "a missed version inserts rows",
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [
            { version: 8, operations: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }] },
          ],
        },
        reason: "structural-change",
      },
      {
        name: "the response has only a snapshot",
        response: {
          status: "conflict",
          currentVersion: 8,
          snapshot: { ...snapshot(), version: 8 },
        },
        reason: "missing-operations",
      },
    ];
    for (const test_case of cases) {
      const { grid, coordinator } = harness(["m1", "m2"]);
      const column = () =>
        [0, 1, 2].map((row) => grid.store.getCell({ sheet: "s1", row, col: 0 }).resolved);
      grid.applyTransaction({ patches: [set(0, 2)] });
      await coordinator.handleResponse(test_case.response, "m1");
      if (test_case.afterConflict) grid.applyTransaction({ patches: [test_case.afterConflict] });
      const before = column();
      const result = await coordinator.recoverConflict();
      expect({ name: test_case.name, result }).toMatchObject({
        name: test_case.name,
        result: { status: "reload-required", reason: test_case.reason },
      });
      // Nothing changed: the host reloads exactly as before.
      expect(column()).toEqual(before);
      expect(coordinator.pendingCommits()[0]).toMatchObject({
        baseVersion: 7,
        status: "conflicted",
      });
    }
  });

  it("rejects malformed and oversized conflict recovery before publishing conflict", async () => {
    const cases: Array<{
      response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
      limits?: SyncCoordinatorOptions["limits"];
      code: string;
    }> = [
      {
        response: {
          status: "conflict",
          currentVersion: 9,
          operationsSinceBase: [{ version: 9, operations: [local_set(9)] }],
        },
        code: "invalid-version",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 9,
          operationsSinceBase: [
            { version: 8, operations: [local_set(8)] },
            { version: 9, operations: [local_set(9)] },
          ],
        },
        limits: { maxBufferedVersions: 1 },
        code: "buffer-count-limit",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [{ version: 8, operations: [local_set(8)] }],
        },
        limits: { maxBufferedBytes: 64 },
        code: "buffer-byte-limit",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 8,
          snapshot: { ...snapshot(), version: 9 },
        },
        code: "invalid-version",
      },
    ];

    for (const test_case of cases) {
      const { grid, coordinator, events } = harness(["m1"], {
        ...(test_case.limits ? { limits: test_case.limits } : {}),
      });
      grid.applyTransaction({ patches: [local_set(2)] });
      await expect(coordinator.handleResponse(test_case.response, "m1")).rejects.toMatchObject({
        code: test_case.code,
      });
      expect(coordinator.serverVersion).toBe(7);
      expect(coordinator.pendingCommits()[0]?.status).toBe("pending");
      expect(events.some((event) => event.type === "conflict")).toBe(false);
    }
  });

  it("applies host-rebased conflicted work without duplicating the outgoing mutation", async () => {
    const { grid, coordinator } = harness();
    const remote_events: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remote_events.push(event);
    });
    const local = {
      op: "set" as const,
      addr: { sheet: "s1", row: 2, col: 0 },
      value: { kind: "literal" as const, value: 7 },
    };
    const remote = [{ op: "addRows" as const, sheet: "s1", at: 0, count: 1 }];
    grid.applyTransaction({ patches: [local] });
    await coordinator.handleResponse(
      { status: "conflict", currentVersion: 8, snapshot: { ...snapshot(), version: 8 } },
      "m1",
    );

    const rebased = rebaseDocumentOperations(coordinator.pendingCommits()[0]!.operations, remote);
    if (rebased.status !== "rebased") throw new Error("Expected successful host rebase");

    await coordinator.applyVersionedOperation({ version: 9, operations: remote });
    grid.applyRemoteOperations(rebased.operations);

    expect(
      remote_events.some((event) =>
        event.transaction.patches.some((patch) => patch.op === "addRows"),
      ),
    ).toBe(true);
    expect(grid.store.getCell({ sheet: "s1", row: 3, col: 0 }).resolved).toBe(7);
    expect(coordinator.pendingCommits()).toEqual([
      {
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "m1",
        operations: [local],
        status: "conflicted",
      },
    ]);
  });

  it("rejects canonical response operations and applies later remote operations", async () => {
    const { grid, coordinator, events } = harness();
    const remote_events: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remote_events.push(event);
    });
    grid.applyTransaction({ patches: [local_set(2)] });
    await expect(
      coordinator.handleResponse({
        status: "applied",
        version: 8,
        clientMutationId: "m1",
        canonicalOperations: [local_set(10)],
      } as PersistenceCommitResponse),
    ).rejects.toMatchObject({ code: "invalid-operations" });
    expect(coordinator.pendingCount).toBe(1);
    expect(coordinator.serverVersion).toBe(7);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    await coordinator.handleResponse(applied(8, "m1"));
    expect(coordinator.pendingCount).toBe(0);
    await coordinator.applyVersionedOperation({ version: 9, operations: [local_set(11)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);
    await coordinator.applyVersionedOperation({ version: 9, operations: [local_set(99)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);

    await coordinator.applyVersionedOperation({ version: 11, operations: [local_set(12)] });
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 10,
      receivedVersion: 11,
    });
    expect(remote_events).toHaveLength(1);
  });

  it("recovers missing versions in order and drains the buffered operation", async () => {
    const recovery = Promise.withResolvers<readonly VersionedOperation[]>();
    const requests: Array<{ expectedVersion: number; receivedVersion: number }> = [];
    const { grid, coordinator, events } = harness(["m1"], {
      recoverVersionGap: (request) => {
        requests.push({
          expectedVersion: request.expectedVersion,
          receivedVersion: request.receivedVersion,
        });
        return recovery.promise;
      },
    });
    const drained = Promise.withResolvers<void>();
    const dispose_drain = coordinator.on((event) => {
      if (event.type === "remote-applied" && event.operation.version === 10) {
        drained.resolve(undefined);
      }
    });

    await coordinator.applyVersionedOperation({ version: 10, operations: [local_set(10)] });
    recovery.resolve([
      { version: 9, operations: [local_set(9)] },
      { version: 8, operations: [local_set(8)] },
    ]);
    await drained.promise;
    dispose_drain();

    expect(requests).toEqual([{ expectedVersion: 8, receivedVersion: 10 }]);
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(10);
    expect(
      events
        .filter((event) => event.type === "remote-applied")
        .map((event) => event.operation.version),
    ).toEqual([8, 9, 10]);
  });

  it("fails closed when a nonempty inbound version noops and accepts empty version ticks", async () => {
    const failed = harness();
    spyOn(failed.grid, "applyRemoteOperations").mockReturnValue({
      status: "noop",
      epoch: 0,
      reason: "out-of-bounds",
    });

    await failed.coordinator.applyVersionedOperation({
      version: 8,
      operations: [local_set(10)],
    });

    expect(failed.coordinator.serverVersion).toBe(7);
    expect(failed.events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 8,
      receivedVersion: 8,
    });
    expect(failed.events.some((event) => event.type === "remote-applied")).toBe(false);

    const tick = harness();
    await tick.coordinator.applyVersionedOperation({ version: 8, operations: [] });
    expect(tick.coordinator.serverVersion).toBe(8);
    expect(tick.events).toContainEqual({
      type: "remote-applied",
      operation: { version: 8, operations: [] },
    });
  });

  it("validates complete operation shapes before retaining future versions", async () => {
    const { grid, coordinator, events } = harness();
    const malformed = {
      op: "set",
      value: { kind: "literal", value: 2 },
    } as unknown as DocumentOp;

    await coordinator.applyVersionedOperation({ version: 9, operations: [malformed] });
    await coordinator.applyVersionedOperation({ version: 8, operations: [] });
    await coordinator.applyVersionedOperation({ version: 9, operations: [local_set(9)] });

    expect_sync_error(events, "invalid-operations");
    expect(coordinator.serverVersion).toBe(9);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
  });

  it("wraps a duplicate local mutation ID as sync-failed with the action", () => {
    const { grid, events } = harness(["m1", "m1"]);
    grid.applyTransaction({ patches: [local_set(2)] });
    try {
      grid.applyTransaction({ patches: [local_set(3)] });
    } catch (error) {
      // The reservation failure may also reach the caller; the event is the contract.
      expect(error).toMatchObject({ code: "sync-failed" });
    }

    const failure = events.find((event) => event.type === "error");
    expect(failure?.type === "error" && failure.error).toMatchObject({
      code: "sync-failed",
      operation: "synchronize",
      context: { action: "reserve-local" },
      cause: expect.any(Error),
    });
  });

  it("keeps the JSON failure as the cause of a rejected remote payload", async () => {
    const { coordinator, events } = harness();
    const not_json = {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 0 },
      value: { kind: "literal", value: Number.NaN },
    } as DocumentOp;

    await coordinator.applyVersionedOperation({ version: 8, operations: [not_json] });

    const failure = events.find((event) => event.type === "error");
    expect(failure?.type === "error" && failure.error).toMatchObject({
      code: "invalid-operations",
      operation: "synchronize",
    });
    expect(failure?.type === "error" && failure.error.cause).toMatchObject({
      code: "invalid-operations",
      operation: "transaction",
    });
  });

  it("bounds retained acknowledgements and treats expired late echoes as reload violations", async () => {
    const { grid, coordinator, events } = harness(["m1", "m2", "m3"], {
      limits: { maxRecentAcknowledgements: 2 },
    });
    grid.applyTransaction({ patches: [local_set(2)] });
    grid.applyTransaction({ patches: [local_set(3)] });
    grid.applyTransaction({ patches: [local_set(4)] });
    await coordinator.handleResponse(applied(8, "m1"));
    await coordinator.handleResponse(applied(9, "m2"));
    await coordinator.handleResponse(applied(10, "m3"));

    const reloads_before = events.filter((event) => event.type === "reload-required").length;
    await coordinator.applyVersionedOperation({
      version: 9,
      clientMutationId: "m2",
      operations: [local_set(98)],
    });
    expect(events.filter((event) => event.type === "reload-required")).toHaveLength(reloads_before);

    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [local_set(99)],
    });
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 11,
      receivedVersion: 8,
    });
    expect_sync_error(events, "late-echo");
  });

  it("bounds callback intake when a source ignores listener backpressure", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: { maxBufferedVersions: 1 },
    });
    let listener: ((operation: VersionedOperation) => void | Promise<void>) | undefined;
    coordinator.subscribe({
      subscribe(remote_listener) {
        listener = remote_listener;
      },
    });

    const first = listener?.({ version: 8, operations: [local_set(2)] });
    const overflow = listener?.({ version: 9, operations: [local_set(3)] });
    await Promise.all([first, overflow]);

    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect_sync_error(events, "buffer-count-limit");
  });

  it("deduplicates remote echoes by mutation ID", async () => {
    const { grid, coordinator } = harness();
    grid.applyTransaction({ patches: [local_set(2)] });

    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [local_set(99)],
    });

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
  });

  it("rejects count limit plus one before API or UI mutation and preserves history", async () => {
    const { grid, adapter, coordinator, events } = harness(["m1", "m2"], {
      limits: { maxPendingCommits: 1 },
    });
    const changes: ChangeEvent[] = [];
    let rejection_events = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejection_events += 1;
    });

    expect(grid.applyTransaction({ patches: [local_set(2)] }).status).toBe("applied");
    const rejected = grid.applyTransaction({ patches: [local_set(3)] });
    expect(rejected).toMatchObject({
      status: "rejected",
      issues: [{ kind: "resource-limit", resource: "pending-commits", actual: 2, max: 1 }],
    });
    grid.setSelection({
      kind: "cell",
      addr: { sheet: "s1", row: 0, col: 0 },
    });
    grid.actions.clearContents();
    grid.undo();

    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(changes).toHaveLength(1);
    expect(rejection_events).toBe(3);
    expect(coordinator.state).toMatchObject({ pendingCount: 1, pendingCapacity: "full" });
    expect(
      events.filter(
        (event) => event.type === "error" && event.error instanceof SyncPendingCapacityError,
      ),
    ).toHaveLength(3);

    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve(applied(8, "m1"));
    await sending;
    expect(coordinator.state.pendingCapacity).toBe("available");

    grid.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(coordinator.pendingCommits()[0]?.clientMutationId).toBe("m2");
  });

  it("reserves capacity across reentrant commits and lets remote operations bypass it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const adapter = new ControlledAdapter(snapshot());
    let nested = false;
    let nested_outcome: ApplyTransactionResult | undefined;
    grid.on("change", (event) => {
      if (event.source !== "local" || nested) return;
      nested = true;
      nested_outcome = grid.applyTransaction({ patches: [local_set(3)] });
    });
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "sync-doc",
      serverVersion: 7,
      createMutationId: () => "reentrant-m1",
      limits: { maxPendingCommits: 1 },
    });

    expect(grid.applyTransaction({ patches: [local_set(2)] }).status).toBe("applied");
    expect(nested_outcome).toMatchObject({
      status: "rejected",
      issues: [{ resource: "pending-commits" }],
    });
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "reentrant-m1", operations: [local_set(2)] },
    ]);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    expect(grid.applyRemoteOperations([local_set(9)]).status).toBe("applied");
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
    expect(coordinator.pendingCount).toBe(1);
    coordinator.destroy();
    expect(coordinator.state).toMatchObject({
      pendingCount: 0,
      pendingOperations: 0,
      pendingEncodedBytes: 0,
      pendingCapacity: "destroyed",
    });
    expect(grid.applyTransaction({ patches: [local_set(10)] }).status).toBe("applied");
    expect(coordinator.pendingCount).toBe(0);
    grid.destroy();
  });
});
