import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import { MAX_ATOMIC_BATCH_VERSIONS } from "../src/atomic-batch.js";
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PendingCommit,
  type PendingCommitLoadOptions,
  type PendingCommitStorage,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SheetwriteStore,
  SheetwriteError,
  SyncCoordinator,
  type SyncCoordinatorOptions,
  SyncProtocolError,
  type VersionedOperation,
  type WorkbookSnapshot,
} from "../src/index.js";
import { IndexedDbPendingCommitStorage } from "../src/indexeddb.js";
import { encodeRestoreBlock } from "../src/restore-block.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;
beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
const teardown: Array<{ destroy(): void }> = [];
afterEach(() => {
  for (const owner of teardown.splice(0)) owner.destroy();
  restore_stubs();
});

class FakePendingStorage implements PendingCommitStorage {
  readonly records = new Map<string, PendingCommit>();
  readonly removals: string[] = [];
  failNextPut: unknown;
  failNextRemove: unknown;
  failNextReplace: unknown;
  removeGate?: PromiseWithResolvers<void>;

  /** Stores a record as an earlier session left it. */
  seed(
    clientMutationId: string,
    baseVersion: number,
    operations: PendingCommit["operations"],
    extra: Partial<PendingCommit> = {},
  ): void {
    this.records.set(clientMutationId, {
      documentId: "offline-doc",
      baseVersion,
      clientMutationId,
      operations,
      ...extra,
    });
  }

  async load(
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<readonly PendingCommit[]> {
    if (options.signal?.aborted) throw options.signal.reason;
    // The coordinator must enforce its bounds even if host storage does not.
    return [...this.records.values()]
      .filter((record) => record.documentId === documentId)
      .map((record) => structuredClone(record));
  }

  async put(commit: PendingCommit, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (this.failNextPut !== undefined) {
      const error = this.failNextPut;
      this.failNextPut = undefined;
      throw error;
    }
    this.records.set(commit.clientMutationId, structuredClone(commit));
  }

  async remove(_documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.removals.push(clientMutationId);
    if (this.removeGate) await this.removeGate.promise;
    if (this.failNextRemove !== undefined) {
      const error = this.failNextRemove;
      this.failNextRemove = undefined;
      throw error;
    }
    this.records.delete(clientMutationId);
  }

  async replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (this.failNextReplace !== undefined) {
      const error = this.failNextReplace;
      this.failNextReplace = undefined;
      throw error;
    }
    const current = [...this.records.values()]
      .filter((record) => record.documentId === documentId)
      .map((record) => record.clientMutationId);
    if (
      current.length !== expectedClientMutationIds.length ||
      current.some((id, index) => id !== expectedClientMutationIds[index])
    ) {
      throw new Error("Fake durable queue changed before replacement");
    }
    for (const id of current) this.records.delete(id);
    for (const commit of commits) {
      this.records.set(commit.clientMutationId, structuredClone(commit));
    }
  }
}

class ControlledAdapter implements PersistenceAdapter {
  readonly requests: PersistenceCommitRequest[] = [];
  responders: Array<(request: PersistenceCommitRequest) => Promise<PersistenceCommitResponse>> = [];

  constructor(private readonly base: WorkbookSnapshot) {}

  async load(): Promise<WorkbookSnapshot> {
    return structuredClone(this.base);
  }

  /** Answers the next commit with `status` at `version`, echoing its mutation ID. */
  answer(status: "applied" | "duplicate", version: number): void {
    this.responders.push(async (request) => ({
      status,
      version,
      clientMutationId: request.clientMutationId,
    }));
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    this.requests.push(request);
    const responder = this.responders.shift();
    if (!responder) throw new Error("No controlled response configured");
    return responder(request);
  }
}

function snapshot(version = 4, row_count = 2): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "offline-doc",
    version,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount: row_count,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        cells: [],
      },
    ],
  };
}

function set_value(value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal" as const, value },
  };
}

function mount_grid(version = 4, row_count = 2, paged = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot(version, row_count), {
    ...(paged
      ? { datasourceStorage: { mode: "paged" as const, chunkRows: 4, cacheBytes: 104 } }
      : {}),
  });
  teardown.push(grid);
  return grid;
}

/** Empty durable storage, a controlled server and a grid at version 4. */
function offline() {
  return {
    storage: new FakePendingStorage(),
    adapter: new ControlledAdapter(snapshot()),
    grid: mount_grid(),
  };
}

/** A coordinator for the offline document, destroyed after the test. */
function sync(
  grid: Grid,
  adapter: PersistenceAdapter,
  options: Partial<SyncCoordinatorOptions>,
): SyncCoordinator {
  const coordinator = new SyncCoordinator(grid, adapter, {
    documentId: "offline-doc",
    serverVersion: 4,
    ...options,
  });
  teardown.unshift(coordinator);
  return coordinator;
}

describe("durable offline sync", () => {
  it("keeps the restore error and rolls back older records after a rollback throws", async () => {
    const storage = new FakePendingStorage();
    for (const [index, value] of [9, 8, 7].entries()) {
      await storage.put({
        documentId: "offline-doc",
        baseVersion: 4 + index,
        clientMutationId: `restore-${index}`,
        operations: [{ ...set_value(value), addr: { sheet: "s1", row: index, col: 0 } }],
      });
    }

    const grid = mount_grid(4, 3);
    const store = grid.store;
    const apply_transaction = store.applyTransaction.bind(store);
    const restore_error = new SheetwriteError("transaction", "store", "restore failed");
    const rollback_error = new Error("second rollback failed");
    store.applyTransaction = (transaction, options) => {
      const [operation] = transaction.patches;
      if (operation?.op === "set" && operation.value.kind === "literal") {
        if (operation.addr.row === 2 && operation.value.value === 7) throw restore_error;
        if (operation.addr.row === 1 && operation.value.value === null) throw rollback_error;
      }

      return apply_transaction(transaction, options);
    };

    const coordinator = new SyncCoordinator(grid, new ControlledAdapter(snapshot(4, 3)), {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
    });
    try {
      const failure = await coordinator.ready().then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBe(restore_error);
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();
      expect(coordinator.pendingCommits()).toEqual([]);
      expect(restore_error.cause).toBeInstanceOf(AggregateError);
      if (!(restore_error.cause instanceof AggregateError)) {
        throw new Error("Expected the rollback failure as the restore error cause");
      }

      expect(restore_error.cause.errors).toEqual([rollback_error]);
    } finally {
      coordinator.destroy();
      grid.destroy();
    }
  });

  it("does not write to the grid when it is destroyed during pending restore", async () => {
    const storage = new FakePendingStorage();
    storage.seed("restore-first", 4, [set_value(9)]);
    const grid = mount_grid();
    const apply_transaction = grid.store.applyTransaction.bind(grid.store);
    let destroyed = false;
    let writes_after_destroy = 0;
    grid.store.applyTransaction = (transaction, options) => {
      if (destroyed) {
        writes_after_destroy += 1;
        throw new Error("Store used after grid destruction");
      }

      return apply_transaction(transaction, options);
    };

    const coordinator = sync(grid, new ControlledAdapter(snapshot()), {
      pendingStorage: storage,
      initialConnection: "offline",
    });
    grid.on("change", () => {
      coordinator.destroy();
      grid.destroy();
      destroyed = true;
    });

    await coordinator.ready();
    expect(coordinator.state.connection).toBe("destroyed");
    expect(coordinator.pendingCount).toBe(0);
    expect(writes_after_destroy).toBe(0);
  });

  for (const paged of [false, true]) {
    it(`rolls back earlier stored records when a later restore fails (${paged ? "paged" : "dense"})`, async () => {
      const storage = new FakePendingStorage();
      const grid = mount_grid(4, 2, paged);
      grid.applyTransaction({ patches: [set_value(7)] });
      grid.applyTransaction({ patches: [set_value(42)] });
      const before = grid.exportSnapshot();
      storage.seed("restore-first", 4, [{ op: "removeRows", sheet: "s1", at: 0, count: 1 }]);
      // This address is valid before the first record removes a row.
      storage.seed("restore-second", 5, [
        { ...set_value(9), addr: { sheet: "s1", row: 1, col: 0 } },
      ]);
      const adapter = new ControlledAdapter(snapshot());
      const coordinator = sync(grid, adapter, {
        pendingStorage: storage,
        initialConnection: "offline",
      });

      await expect(coordinator.ready()).rejects.toThrow();
      expect(grid.exportSnapshot()).toEqual(before);
      expect(coordinator.pendingCommits()).toEqual([]);
      expect(coordinator.state).toMatchObject({
        pendingCount: 0,
        pendingOperations: 0,
        pendingEncodedBytes: 0,
      });
      expect(adapter.requests).toEqual([]);
      expect([...storage.records.keys()]).toEqual(["restore-first", "restore-second"]);

      coordinator.destroy();
      grid.undo();
      expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(7);
    });
  }

  it("rejects a stored batch whose version counts have holes", async () => {
    const storage = new FakePendingStorage();
    const sparse_counts = new Array<number>(3);
    sparse_counts[0] = 1;
    sparse_counts[2] = 1;
    storage.seed("sparse-batch", 4, [set_value(9), set_value(8)], {
      versionOperationCounts: sparse_counts,
    });
    const grid = mount_grid();
    const coordinator = sync(grid, new ControlledAdapter(snapshot()), {
      pendingStorage: storage,
      initialConnection: "offline",
    });
    await expect(coordinator.ready()).rejects.toMatchObject({ code: "invalid-batch" });
  });

  it("does not turn storage cancellation during destroy into a hydration failure", async () => {
    const loading = Promise.withResolvers<readonly PendingCommit[]>();
    const started = Promise.withResolvers<AbortSignal | undefined>();
    const storage = new FakePendingStorage();
    storage.load = (_document_id, options) => {
      started.resolve(options.signal);
      return loading.promise;
    };
    const grid = mount_grid();
    const coordinator = new SyncCoordinator(grid, new ControlledAdapter(snapshot()), {
      documentId: "doc-1",
      serverVersion: 4,
      pendingStorage: storage,
    });
    const signal = await started.promise;
    coordinator.destroy();
    expect(signal?.aborted).toBe(true);
    loading.reject(signal?.reason);
    await coordinator.ready();
    expect(coordinator.state.connection).toBe("destroyed");
    expect(coordinator.pendingCount).toBe(0);
    grid.destroy();
  });

  it("reopens and rebases a compact atomic batch through IndexedDB before acknowledging every version", async () => {
    const indexed_db_descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    const key_range_descriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
    Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
    const database_name = "compact-offline-batch";
    const storage = new IndexedDbPendingCommitStorage({ databaseName: database_name });
    const reopened_storage = new IndexedDbPendingCommitStorage({ databaseName: database_name });
    const grid = mount_grid(5, 3);
    const adapter = new MemoryPersistenceAdapter(snapshot(5, 3));
    const load_options = { maxRecords: 10, maxOperations: 10, maxBytes: 4096 };
    try {
      const restore = encodeRestoreBlock(
        { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
        { rowCount: 1, colCount: 1, values: [17] },
      );
      const pending: PendingCommit = {
        documentId: "offline-doc",
        baseVersion: 4,
        clientMutationId: "compact-batch",
        operations: [set_value(9), restore],
        versionOperationCounts: [1, 1],
      };
      await storage.put(pending);
      storage.close();
      const loaded = await reopened_storage.load("offline-doc", load_options);
      expect(loaded).toEqual([pending]);
      const rebased = rebaseDocumentOperations(pending.operations, [
        { op: "addRows", sheet: "s1", at: 0, count: 1 },
      ]);
      if (rebased.status !== "rebased") throw new Error("Expected non-overlapping batch rebase");
      await reopened_storage.replace(
        "offline-doc",
        ["compact-batch"],
        [{ ...pending, baseVersion: 5, operations: rebased.operations }],
      );
      reopened_storage.close();
      const coordinator = sync(grid, adapter, {
        serverVersion: 5,
        pendingStorage: reopened_storage,
        initialConnection: "offline",
      });
      await coordinator.ready();
      expect(grid.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(9);
      expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe(17);
      coordinator.setOnline(true);
      await coordinator.flush();
      expect(coordinator.serverVersion).toBe(7);
      expect(coordinator.pendingCount).toBe(0);
      expect(await reopened_storage.load("offline-doc", load_options)).toEqual([]);
      await expect(
        reopened_storage.put({ ...pending, versionOperationCounts: [1, 2] }),
      ).rejects.toMatchObject({ code: "transaction" });
      const sparse_counts = new Array<number>(3);
      sparse_counts[0] = 1;
      sparse_counts[2] = 1;
      await expect(
        reopened_storage.put({ ...pending, versionOperationCounts: sparse_counts }),
      ).rejects.toMatchObject({ code: "transaction" });
      const too_many_versions = MAX_ATOMIC_BATCH_VERSIONS + 1;
      await expect(
        reopened_storage.put({
          ...pending,
          operations: Array.from({ length: too_many_versions }, () => set_value(9)),
          versionOperationCounts: Array.from({ length: too_many_versions }, () => 1),
        }),
      ).rejects.toMatchObject({ code: "transaction" });
      expect(await reopened_storage.load("offline-doc", load_options)).toEqual([]);
    } finally {
      storage.close();
      reopened_storage.close();
      if (indexed_db_descriptor)
        Object.defineProperty(globalThis, "indexedDB", indexed_db_descriptor);
      else Reflect.deleteProperty(globalThis, "indexedDB");
      if (key_range_descriptor)
        Object.defineProperty(globalThis, "IDBKeyRange", key_range_descriptor);
      else Reflect.deleteProperty(globalThis, "IDBKeyRange");
    }
  });

  it("chains new commits past every queued server version across restore and acknowledgement", async () => {
    const storage = new FakePendingStorage();
    storage.seed(
      "restored-batch",
      4,
      [set_value(9), { ...set_value(8), addr: { sheet: "s1", row: 1, col: 0 } }],
      { versionOperationCounts: [1, 1] },
    );
    const grid = mount_grid();
    const ids = ["local-m1", "local-m2"];
    const coordinator = sync(grid, new ControlledAdapter(snapshot()), {
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids.shift() ?? "unexpected",
    });
    await coordinator.ready();

    grid.applyTransaction({ patches: [set_value(3)] });
    expect(coordinator.state.activity).toBe("persisting");
    await coordinator.ready();
    expect(coordinator.state.activity).toBe("pending");
    await coordinator.handleResponse({
      status: "applied",
      version: 6,
      clientMutationId: "restored-batch",
    });
    grid.applyTransaction({ patches: [set_value(4)] });
    await coordinator.ready();

    expect(
      coordinator
        .pendingCommits()
        .map(({ clientMutationId: client_mutation_id, baseVersion: base_version }) => ({
          clientMutationId: client_mutation_id,
          baseVersion: base_version,
        })),
    ).toEqual([
      { clientMutationId: "local-m1", baseVersion: 6 },
      { clientMutationId: "local-m2", baseVersion: 7 },
    ]);
  });

  it("aborts a disconnected send and reconnects with the same ID", async () => {
    const { storage, adapter, grid } = offline();
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      createMutationId: () => "disconnect-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(3)] });
    await coordinator.ready();

    adapter.responders.push(
      (request) =>
        new Promise<PersistenceCommitResponse>((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new Error("disconnected")), {
            once: true,
          });
        }),
    );
    const error_events: unknown[] = [];
    coordinator.on((event) => {
      if (event.type === "error") error_events.push(event.error);
    });
    const sending = coordinator.sendNext().catch((error: unknown) => error);
    const signal = adapter.requests[0]?.signal;
    expect(signal?.aborted).toBe(false);
    coordinator.setOnline(false);
    expect(await sending).toBe(signal?.reason);
    expect(signal?.reason).toMatchObject({ name: "AbortError" });
    expect(error_events).toHaveLength(0);
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "disconnect-m1",
      status: "pending",
    });

    adapter.answer("duplicate", 5);
    coordinator.setOnline(true);
    await coordinator.flush();
    expect(adapter.requests.at(-1)?.clientMutationId).toBe("disconnect-m1");
    expect(coordinator.serverVersion).toBe(5);
    expect(coordinator.pendingCount).toBe(0);
  });

  it("retains a durable conflict on reconnect", async () => {
    const { storage, adapter, grid } = offline();
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => "conflict-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(5)] });
    await coordinator.ready();
    adapter.responders.push(async () => ({ status: "conflict", currentVersion: 6 }));

    coordinator.setOnline(true);
    await coordinator.flush();
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "conflict-m1",
      status: "conflicted",
    });
    expect(storage.records.has("conflict-m1")).toBe(true);
    expect(coordinator.state).toMatchObject({ pendingCount: 1, pendingOperations: 1 });
    expect(coordinator.state.pendingEncodedBytes).toBeGreaterThan(0);
  });

  it("keeps local behavior immediate and blocks send until a storage failure is retried", async () => {
    const { storage, adapter, grid } = offline();
    storage.failNextPut = new Error("quota exceeded");
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      createMutationId: () => "quota-m1",
    });
    await coordinator.ready();

    grid.applyTransaction({ patches: [set_value(7)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(7);
    await expect(coordinator.ready()).rejects.toThrow("quota exceeded");
    expect(coordinator.pendingCommits()[0]?.status).toBe("storage-error");
    expect(coordinator.state).toMatchObject({ pendingCount: 1, pendingOperations: 1 });
    expect(coordinator.state.pendingEncodedBytes).toBeGreaterThan(0);
    expect(adapter.requests).toHaveLength(0);

    expect(await coordinator.retryPersistence("quota-m1")).toBe(true);
    adapter.answer("applied", 5);
    await coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    expect(coordinator.state).toMatchObject({
      pendingCount: 0,
      pendingOperations: 0,
      pendingEncodedBytes: 0,
    });
  });

  it("keeps acknowledgements pending until durable removal succeeds", async () => {
    const { storage, adapter, grid } = offline();
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      createMutationId: () => "remove-m1",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(8)] });
    await coordinator.ready();
    storage.failNextRemove = new Error("remove failed");
    adapter.answer("applied", 5);

    await expect(coordinator.sendNext()).rejects.toThrow("remove failed");
    expect(coordinator.pendingCount).toBe(1);
    expect(storage.records.has("remove-m1")).toBe(true);
    expect(events).not.toContain("acknowledged");

    adapter.answer("duplicate", 5);
    await coordinator.retry("remove-m1");
    expect(coordinator.pendingCount).toBe(0);
    expect(storage.records.has("remove-m1")).toBe(false);
    expect(events.filter((event) => event === "acknowledged")).toHaveLength(1);
  });

  it("finishes an acknowledged durable removal after destroy without publishing", async () => {
    const { storage, adapter, grid } = offline();
    storage.removeGate = Promise.withResolvers<void>();
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      createMutationId: () => "destroy-remove-m1",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(6)] });
    await coordinator.ready();
    adapter.answer("applied", 5);

    const sending = coordinator.sendNext();
    while (storage.removals.length === 0) await Promise.resolve();
    coordinator.destroy();
    storage.removeGate.resolve(undefined);
    await sending;

    expect(storage.records.has("destroy-remove-m1")).toBe(false);
    expect(coordinator.pendingCount).toBe(0);
    expect(events).not.toContain("acknowledged");
  });

  it("fails closed for an ambiguous durable mutation on a newer offline snapshot", async () => {
    const storage = new FakePendingStorage();
    storage.seed("ambiguous-m1", 4, [{ op: "addRows", sheet: "s1", at: 0, count: 1 }]);
    const adapter = new ControlledAdapter(snapshot(5, 3));
    const grid = mount_grid(5, 3);
    const coordinator = sync(grid, adapter, {
      serverVersion: 5,
      pendingStorage: storage,
      initialConnection: "offline",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();

    expect(grid.exportSnapshot().sheets[0]?.rowCount).toBe(3);
    expect(coordinator.pendingCommits()[0]?.clientMutationId).toBe("ambiguous-m1");
    expect(events).toContain("reload-required");
    expect(storage.records.has("ambiguous-m1")).toBe(true);
  });

  it("reconciles an ambiguous durable mutation before applying it locally", async () => {
    const storage = new FakePendingStorage();
    storage.seed("ambiguous-online-m1", 4, [{ op: "addRows", sheet: "s1", at: 0, count: 1 }]);
    const adapter = new ControlledAdapter(snapshot(5));
    adapter.answer("applied", 6);
    const grid = mount_grid(5);
    const coordinator = sync(grid, adapter, { serverVersion: 5, pendingStorage: storage });
    await coordinator.ready();
    await coordinator.flush();

    expect(adapter.requests[0]?.clientMutationId).toBe("ambiguous-online-m1");
    expect(grid.exportSnapshot().sheets[0]?.rowCount).toBe(3);
    expect(coordinator.pendingCount).toBe(0);
    expect(storage.records.has("ambiguous-online-m1")).toBe(false);
  });

  it("atomically rewrites durable base versions during reload recovery", async () => {
    const { storage, adapter, grid } = offline();
    const ids = ["replace-m1", "replace-m2"];
    let index = 0;
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids[index++]!,
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(1)] });
    grid.applyTransaction({ patches: [set_value(2)] });
    await coordinator.ready();
    const resources_before_replacement = {
      pendingCount: coordinator.state.pendingCount,
      pendingOperations: coordinator.state.pendingOperations,
      pendingEncodedBytes: coordinator.state.pendingEncodedBytes,
    };

    storage.failNextReplace = new Error("replacement crashed");
    await expect(coordinator.resumeAfterReload(snapshot(10))).rejects.toThrow(
      "replacement crashed",
    );
    expect([...storage.records.values()].map((record) => record.baseVersion)).toEqual([4, 5]);
    expect(coordinator.serverVersion).toBe(4);
    expect(coordinator.state).toMatchObject(resources_before_replacement);

    await coordinator.resumeAfterReload(snapshot(10));
    expect([...storage.records.values()].map((record) => record.baseVersion)).toEqual([10, 11]);
    expect(coordinator.pendingCommits().map((record) => record.baseVersion)).toEqual([10, 11]);
    expect(coordinator.state).toMatchObject(resources_before_replacement);
  });

  it("applies asynchronous intake in order behind durable echo removal", async () => {
    const storage = new FakePendingStorage();
    storage.removeGate = Promise.withResolvers<void>();
    const adapter = new ControlledAdapter(snapshot());
    const send_gate = Promise.withResolvers<PersistenceCommitResponse>();
    adapter.responders.push(() => send_gate.promise);
    const grid = mount_grid();
    const coordinator = sync(grid, adapter, {
      pendingStorage: storage,
      createMutationId: () => "echo-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [set_value(3)] });
    await coordinator.ready();

    const operations: VersionedOperation[] = [
      { version: 5, clientMutationId: "echo-m1", operations: [set_value(99)] },
      { version: 6, operations: [set_value(4)] },
    ];
    coordinator.subscribe({
      [Symbol.asyncIterator]() {
        let operation = 0;
        return {
          async next() {
            const value = operations[operation++];
            return value
              ? { done: false as const, value }
              : { done: true as const, value: undefined };
          },
        };
      },
    });
    while (storage.removals.length === 0) await Promise.resolve();

    expect(coordinator.serverVersion).toBe(4);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);

    const applied = Promise.withResolvers<void>();
    const dispose_applied = coordinator.on((event) => {
      if (event.type === "remote-applied" && event.operation.version === 6) {
        applied.resolve(undefined);
      }
    });
    storage.removeGate.resolve(undefined);
    await applied.promise;
    dispose_applied();
    expect(coordinator.serverVersion).toBe(6);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);

    send_gate.resolve({
      status: "duplicate",
      version: 5,
      clientMutationId: "echo-m1",
    });
  });

  it("reopens 300 durable commits in original order without loss", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const ids = Array.from(
      { length: 300 },
      (_, index) => `restore-${String(index).padStart(3, "0")}`,
    );
    let index = 0;
    const first_grid = mount_grid();
    const first = sync(first_grid, adapter, {
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids[index++]!,
    });
    await first.ready();
    for (let value = 0; value < ids.length; value++) {
      expect(first_grid.applyTransaction({ patches: [set_value(value)] }).status).toBe("applied");
    }
    await first.ready();
    expect([...storage.records.keys()]).toEqual(ids);
    first.destroy();
    first_grid.destroy();

    const reopened_grid = mount_grid();
    const reopened = sync(reopened_grid, adapter, {
      pendingStorage: storage,
      initialConnection: "offline",
    });
    await reopened.ready();

    expect(reopened.pendingCommits().map((record) => record.clientMutationId)).toEqual(ids);
    expect(reopened.pendingCommits().map((record) => record.baseVersion)).toEqual(
      ids.map((_, record_index) => 4 + record_index),
    );
    expect(reopened.state).toMatchObject({
      pendingCount: 300,
      pendingOperations: 300,
      pendingCapacity: "available",
    });
    expect(reopened_grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(299);
    expect(storage.records.size).toBe(300);
  });

  it("restores durable paged edits as dirty until their exact mutation is acknowledged", async () => {
    const storage = new FakePendingStorage();
    storage.seed("paged-m1", 4, [set_value(9)]);
    storage.seed("paged-m2", 5, [set_value(8)]);
    const adapter = new ControlledAdapter(snapshot(4, 100));
    adapter.answer("applied", 5);
    adapter.answer("applied", 6);
    const grid = mount_grid(4, 100, true);
    const coordinator = sync(grid, adapter, { pendingStorage: storage });

    await coordinator.ready();
    const store = grid.store;
    if (!(store instanceof SheetwriteStore)) throw new Error("Expected a sheet store");
    expect(coordinator.pendingCount).toBe(2);
    expect(store.getPagedStats("s1")).toMatchObject({
      chunks: 0,
      loadedCells: 1,
      dirtyCells: 1,
      allocatedBytes: 0,
    });
    await coordinator.sendNext();
    expect(coordinator.pendingCount).toBe(1);
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(8);
    expect(store.getPagedStats("s1")).toMatchObject({ dirtyCells: 1 });

    await coordinator.sendNext();
    expect(coordinator.pendingCount).toBe(0);
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(8);
    expect(store.getPagedStats("s1")).toMatchObject({
      chunks: 1,
      dirtyCells: 0,
    });
  });

  it("rejects oversized durable queues before partially restoring even when storage ignores bounds", async () => {
    const cases = [
      {
        code: "pending-count-limit",
        limits: { maxPendingCommits: 1 },
      },
      {
        code: "pending-operation-limit",
        limits: { maxPendingCommits: 2, maxPendingOperations: 1 },
      },
      {
        code: "pending-byte-limit",
        limits: { maxPendingCommits: 2, maxPendingEncodedBytes: 150 },
      },
    ] as const;

    for (const test_case of cases) {
      const storage = new FakePendingStorage();
      storage.seed("restore-m1", 4, [set_value(1)]);
      storage.seed("restore-m2", 5, [set_value(2)]);
      const adapter = new ControlledAdapter(snapshot());
      const grid = mount_grid();
      const coordinator = sync(grid, adapter, {
        pendingStorage: storage,
        initialConnection: "offline",
        limits: test_case.limits,
      });

      const error = await coordinator.ready().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(SyncProtocolError);
      expect(error).toMatchObject({ code: test_case.code });
      expect(coordinator.pendingCount).toBe(0);
      expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();
      expect([...storage.records.keys()]).toEqual(["restore-m1", "restore-m2"]);
    }
  });
});
