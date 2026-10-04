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
  type WorkbookSnapshot,
} from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

class ControlledAdapter implements PersistenceAdapter {
  readonly requests: PersistenceCommitRequest[] = [];
  readonly responses: Array<Deferred<PersistenceCommitResponse>> = [];

  constructor(private readonly snapshot: WorkbookSnapshot) {}

  async load(): Promise<WorkbookSnapshot> {
    return structuredClone(this.snapshot);
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    this.requests.push(request);
    const response = deferred<PersistenceCommitResponse>();
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

function localSet(value: number) {
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
  return { grid, adapter, coordinator, events };
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
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    const first = createGrid(firstHost, { workbook: structuredClone(workbook), data: columnar });
    const second = createGrid(secondHost, { workbook: structuredClone(workbook), data: columnar });
    const server = new SheetwriteStore(structuredClone(workbook), columnar);
    let serverVersion = 0;
    const committed: VersionedOperation[] = [];
    const adapter: PersistenceAdapter = {
      async load() {
        return { ...server.exportSnapshot(), documentId: "large-undo", version: serverVersion };
      },
      async commit(request) {
        if (request.baseVersion !== serverVersion) {
          return { status: "conflict", currentVersion: serverVersion };
        }
        // Cross the JSON transport boundary, then apply to a real server store.
        const operations: DocumentOp[] = JSON.parse(JSON.stringify(request.operations));
        const outcome = server.applyTransaction({ patches: operations }, { source: "remote" });
        if (outcome.status !== "applied") throw new Error(`Server rejected ${outcome.status}`);
        serverVersion += 1;
        committed.push({
          version: serverVersion,
          operations,
          clientMutationId: request.clientMutationId,
        });
        return {
          status: "applied",
          version: serverVersion,
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
      const clearVersion = committed.at(-1);
      if (!clearVersion) throw new Error("Clear did not reach the server");
      await receiver.applyVersionedOperation(clearVersion);
      expect(second.store.getCell({ sheet: "s1", row: 999, col: 999 }).resolved).toBeNull();

      first.undo();
      expect(sender.pendingCount).toBe(1);
      await sender.sendNext();
      expect(committed).toHaveLength(2);
      const undoVersion = committed.at(-1);
      if (!undoVersion) throw new Error("Undo did not reach the server");
      expect(
        new TextEncoder().encode(JSON.stringify(undoVersion.operations)).byteLength,
      ).toBeLessThanOrEqual(8 * 1024 * 1024);
      await receiver.applyVersionedOperation(undoVersion);
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
    const senderHost = document.createElement("div");
    const peerHost = document.createElement("div");
    document.body.append(senderHost, peerHost);
    const senderGrid = createGridFromSnapshot(senderHost, snapshot());
    const peerGrid = createGridFromSnapshot(peerHost, snapshot());
    const options = {
      documentId: "sync-doc",
      serverVersion: 7,
      limits: { maxOperationsPerVersion: 1 },
    };
    const sender = new SyncCoordinator(senderGrid, adapter, options);
    const peer = new SyncCoordinator(peerGrid, adapter, options);
    const changes: ChangeEvent[] = [];
    peerGrid.on("change", (event) => changes.push(event));
    try {
      const outcome = senderGrid.applyTransaction({
        patches: [
          localSet(12),
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
      const firstVersion = versions[0];
      const lastVersion = versions[1];
      if (!firstVersion || !lastVersion) throw new Error("The batch needs two versions");
      await peer.applyVersionedOperation(firstVersion);
      expect(peerGrid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
      expect(peer.serverVersion).toBe(7);
      expect(changes).toHaveLength(0);
      await peer.applyVersionedOperation(lastVersion);
      expect(peerGrid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(12);
      expect(peerGrid.store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(34);
      expect(peer.serverVersion).toBe(9);
      expect(changes).toHaveLength(1);
      expect((await adapter.load("sync-doc")).version).toBe(9);
    } finally {
      sender.destroy();
      peer.destroy();
      senderGrid.destroy();
      peerGrid.destroy();
    }
  });

  it("leaves a peer unchanged when one batch member is rejected by the grid", async () => {
    const { grid, coordinator, events } = harness();
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    try {
      await coordinator.applyVersionedOperation({
        version: 8,
        operations: [localSet(12)],
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
      expect(
        events.some(
          (event) =>
            event.type === "error" &&
            event.error instanceof SyncProtocolError &&
            event.error.code === "remote-operations-rejected",
        ),
      ).toBe(true);
    } finally {
      coordinator.destroy();
      grid.destroy();
    }
  });

  it("keeps the per-version byte limit for remote batch members", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: { maxVersionPayloadBytes: 256 },
    });
    const changes: ChangeEvent[] = [];
    grid.on("change", (event) => changes.push(event));
    try {
      await coordinator.applyVersionedOperation({
        version: 8,
        operations: [localSet(12)],
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
      expect(
        events.some(
          (event) =>
            event.type === "error" &&
            event.error instanceof SyncProtocolError &&
            event.error.code === "payload-limit",
        ),
      ).toBe(true);
    } finally {
      coordinator.destroy();
      grid.destroy();
    }
  });

  it("syncs a split undo as one local history step and one peer change", async () => {
    const rowCount = 80;
    const versionBytes = 2048;
    let randomState = 17;
    const values = Array.from({ length: rowCount }, () =>
      Array.from({ length: 80 }, () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(33 + ((randomState >>> 16) % 90));
      }).join(""),
    );
    const initial = snapshot();
    const sheet = initial.sheets[0];
    if (!sheet) throw new Error("The test snapshot needs a sheet");
    sheet.rowCount = rowCount;
    sheet.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount,
        colCount: 1,
        cells: values.map((value, rowOffset) => ({
          rowOffset,
          colOffset: 0,
          value: { kind: "literal", value },
        })),
      },
    ];
    const firstHost = document.createElement("div");
    const peerHost = document.createElement("div");
    document.body.append(firstHost, peerHost);
    const gridOptions = { transactionResourceLimits: { maxEncodedBytes: versionBytes } };
    const first = createGridFromSnapshot(firstHost, initial, gridOptions);
    const second = createGridFromSnapshot(peerHost, initial, gridOptions);
    const adapter = new MemoryPersistenceAdapter(initial);
    const syncOptions = {
      documentId: "sync-doc",
      serverVersion: 7,
      limits: { maxVersionPayloadBytes: versionBytes },
    };
    const sender = new SyncCoordinator(first, adapter, syncOptions);
    const peer = new SyncCoordinator(second, adapter, syncOptions);
    const localChanges: ChangeEvent[] = [];
    const peerChanges: ChangeEvent[] = [];
    first.on("change", (event) => localChanges.push(event));
    second.on("change", (event) => peerChanges.push(event));
    try {
      expect(
        first.applyTransaction({
          patches: [
            {
              op: "clearRange",
              range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: rowCount - 1, col: 0 } },
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
        ).toBeLessThanOrEqual(versionBytes);
        await peer.applyVersionedOperation(version);
      }
      for (let row = 0; row < rowCount; row++) {
        const expected = values[row];
        if (expected === undefined) throw new Error("The source value is missing");
        expect(first.store.getCell({ sheet: "s1", row, col: 0 }).resolved).toBe(expected);
        expect(second.store.getCell({ sheet: "s1", row, col: 0 }).resolved).toBe(expected);
      }
      expect(localChanges.map((event) => event.commitReason)).toEqual(["api", "undo"]);
      expect(peerChanges).toHaveLength(2);
      first.redo();
      expect(first.store.getCell({ sheet: "s1", row: rowCount - 1, col: 0 }).resolved).toBeNull();
      expect(localChanges.map((event) => event.commitReason)).toEqual(["api", "undo", "redo"]);
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
    const patch = localSet(2);

    grid.applyTransaction({ patches: [patch] });
    patch.value.value = 99;

    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(coordinator.pendingCommits()).toEqual([
      {
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "m1",
        operations: [localSet(2)],
        status: "pending",
      },
    ]);

    const sending = coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0]).toMatchObject({
      documentId: "sync-doc",
      baseVersion: 7,
      clientMutationId: "m1",
      operations: [localSet(2)],
    });
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await sending;

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(events.some((event) => event.type === "acknowledged")).toBe(true);
    coordinator.destroy();
    grid.applyTransaction({ patches: [localSet(3)] });
    expect(coordinator.pendingCount).toBe(0);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);
    grid.destroy();
  });

  it("refuses non-head sends and advances the durable queue serially", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });
    grid.applyTransaction({ patches: [localSet(3)] });

    const first = coordinator.send("m1");
    expect(await coordinator.send("m2")).toBeNull();
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "m1", status: "sending" },
      { clientMutationId: "m2", status: "pending" },
    ]);
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await first;

    const second = coordinator.send("m2");
    expect(adapter.requests.at(-1)).toMatchObject({ clientMutationId: "m2", baseVersion: 8 });
    adapter.responses[1]!.resolve({
      status: "applied",
      version: 9,
      clientMutationId: "m2",
    });
    await second;
    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(9);
    expect(events.filter((event) => event.type === "error")).toEqual([]);
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects a response mutation ID mismatch before queue or version mutation", async () => {
    const { grid, adapter, coordinator } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });
    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "wrong-id",
    });

    await expect(sending).rejects.toMatchObject({ code: "response-id-mismatch" });
    expect(coordinator.serverVersion).toBe(7);
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "m1", status: "pending" },
    ]);
    coordinator.destroy();
    grid.destroy();
  });

  it("retries with the same mutation ID only when the host asks", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    const first = coordinator.sendNext();
    adapter.responses[0]!.reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(coordinator.pendingCommits()[0]?.status).toBe("pending");
    expect(events.some((event) => event.type === "error")).toBe(true);

    const retry = coordinator.retry("m1");
    expect(adapter.requests[1]?.clientMutationId).toBe("m1");
    expect(adapter.requests[1]?.baseVersion).toBe(7);
    adapter.responses[1]!.resolve({
      status: "duplicate",
      version: 8,
      clientMutationId: "m1",
    });
    await retry;
    expect(coordinator.pendingCount).toBe(0);
    coordinator.destroy();
    grid.destroy();
  });

  it("retains conflicted work and exposes deterministic reload/reapply state", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

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
    coordinator.destroy();
    grid.destroy();
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
          operationsSinceBase: [{ version: 9, operations: [localSet(9)] }],
        },
        code: "invalid-version",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 9,
          operationsSinceBase: [
            { version: 8, operations: [localSet(8)] },
            { version: 9, operations: [localSet(9)] },
          ],
        },
        limits: { maxBufferedVersions: 1 },
        code: "buffer-count-limit",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [{ version: 8, operations: [localSet(8)] }],
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

    for (const testCase of cases) {
      const { grid, coordinator, events } = harness(["m1"], {
        ...(testCase.limits ? { limits: testCase.limits } : {}),
      });
      grid.applyTransaction({ patches: [localSet(2)] });
      await expect(coordinator.handleResponse(testCase.response, "m1")).rejects.toMatchObject({
        code: testCase.code,
      });
      expect(coordinator.serverVersion).toBe(7);
      expect(coordinator.pendingCommits()[0]?.status).toBe("pending");
      expect(events.some((event) => event.type === "conflict")).toBe(false);
      coordinator.destroy();
      grid.destroy();
    }
  });

  it("applies host-rebased conflicted work without duplicating the outgoing mutation", async () => {
    const { grid, coordinator } = harness();
    const remoteEvents: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remoteEvents.push(event);
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
    expect(rebased).toEqual({
      status: "rebased",
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 3, col: 0 },
          value: { kind: "literal", value: 7 },
        },
      ],
    });
    if (rebased.status !== "rebased") throw new Error("Expected successful host rebase");

    await coordinator.applyVersionedOperation({ version: 9, operations: remote });
    grid.applyRemoteOperations(rebased.operations);

    expect(
      remoteEvents.some((event) =>
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
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects canonical response operations and applies later remote operations", async () => {
    const { grid, coordinator, events } = harness();
    const remoteEvents: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remoteEvents.push(event);
    });
    grid.applyTransaction({ patches: [localSet(2)] });
    await expect(
      coordinator.handleResponse({
        status: "applied",
        version: 8,
        clientMutationId: "m1",
        canonicalOperations: [localSet(10)],
      } as PersistenceCommitResponse),
    ).rejects.toMatchObject({ code: "invalid-operations" });
    expect(coordinator.pendingCount).toBe(1);
    expect(coordinator.serverVersion).toBe(7);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    await coordinator.handleResponse({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    expect(coordinator.pendingCount).toBe(0);
    await coordinator.applyVersionedOperation({ version: 9, operations: [localSet(11)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);
    await coordinator.applyVersionedOperation({ version: 9, operations: [localSet(99)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);

    await coordinator.applyVersionedOperation({ version: 11, operations: [localSet(12)] });
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 10,
      receivedVersion: 11,
    });
    expect(remoteEvents).toHaveLength(1);
    coordinator.destroy();
    grid.destroy();
  });

  it("recovers missing versions in order and drains the buffered operation", async () => {
    const recovery = deferred<readonly VersionedOperation[]>();
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
    const drained = deferred<void>();
    const disposeDrain = coordinator.on((event) => {
      if (event.type === "remote-applied" && event.operation.version === 10) {
        drained.resolve(undefined);
      }
    });

    await coordinator.applyVersionedOperation({ version: 10, operations: [localSet(10)] });
    recovery.resolve([
      { version: 9, operations: [localSet(9)] },
      { version: 8, operations: [localSet(8)] },
    ]);
    await drained.promise;
    disposeDrain();

    expect(requests).toEqual([{ expectedVersion: 8, receivedVersion: 10 }]);
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(10);
    expect(
      events
        .filter((event) => event.type === "remote-applied")
        .map((event) => event.operation.version),
    ).toEqual([8, 9, 10]);
    coordinator.destroy();
    grid.destroy();
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
      operations: [localSet(10)],
    });

    expect(failed.coordinator.serverVersion).toBe(7);
    expect(failed.events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 8,
      receivedVersion: 8,
    });
    expect(failed.events.some((event) => event.type === "remote-applied")).toBe(false);
    failed.coordinator.destroy();
    failed.grid.destroy();

    const tick = harness();
    await tick.coordinator.applyVersionedOperation({ version: 8, operations: [] });
    expect(tick.coordinator.serverVersion).toBe(8);
    expect(tick.events).toContainEqual({
      type: "remote-applied",
      operation: { version: 8, operations: [] },
    });
    tick.coordinator.destroy();
    tick.grid.destroy();
  });

  it("validates complete operation shapes before retaining future versions", async () => {
    const { grid, coordinator, events } = harness();
    const malformed = {
      op: "set",
      value: { kind: "literal", value: 2 },
    } as unknown as DocumentOp;

    await coordinator.applyVersionedOperation({ version: 9, operations: [malformed] });
    await coordinator.applyVersionedOperation({ version: 8, operations: [] });
    await coordinator.applyVersionedOperation({ version: 9, operations: [localSet(9)] });

    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.error instanceof SyncProtocolError &&
          event.error.code === "invalid-operations",
      ),
    ).toBe(true);
    expect(coordinator.serverVersion).toBe(9);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
    coordinator.destroy();
    grid.destroy();
  });

  it("bounds retained acknowledgements and treats expired late echoes as reload violations", async () => {
    const { grid, coordinator, events } = harness(["m1", "m2", "m3"], {
      limits: { maxRecentAcknowledgements: 2 },
    });
    grid.applyTransaction({ patches: [localSet(2)] });
    grid.applyTransaction({ patches: [localSet(3)] });
    grid.applyTransaction({ patches: [localSet(4)] });
    await coordinator.handleResponse({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await coordinator.handleResponse({
      status: "applied",
      version: 9,
      clientMutationId: "m2",
    });
    await coordinator.handleResponse({
      status: "applied",
      version: 10,
      clientMutationId: "m3",
    });

    const reloadsBefore = events.filter((event) => event.type === "reload-required").length;
    await coordinator.applyVersionedOperation({
      version: 9,
      clientMutationId: "m2",
      operations: [localSet(98)],
    });
    expect(events.filter((event) => event.type === "reload-required")).toHaveLength(reloadsBefore);

    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [localSet(99)],
    });
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 11,
      receivedVersion: 8,
    });
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.error instanceof SyncProtocolError &&
          event.error.code === "late-echo",
      ),
    ).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("bounds callback intake when a source ignores listener backpressure", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: { maxBufferedVersions: 1 },
    });
    let listener: ((operation: VersionedOperation) => void | Promise<void>) | undefined;
    coordinator.subscribe({
      subscribe(remoteListener) {
        listener = remoteListener;
      },
    });

    const first = listener?.({ version: 8, operations: [localSet(2)] });
    const overflow = listener?.({ version: 9, operations: [localSet(3)] });
    await Promise.all([first, overflow]);

    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.error instanceof SyncProtocolError &&
          event.error.code === "buffer-count-limit",
      ),
    ).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("deduplicates remote echoes by mutation ID", async () => {
    const { grid, coordinator } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [localSet(99)],
    });

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects count limit plus one before API or UI mutation and preserves history", async () => {
    const { grid, adapter, coordinator, events } = harness(["m1", "m2"], {
      limits: { maxPendingCommits: 1 },
    });
    const changes: ChangeEvent[] = [];
    let rejectionEvents = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejectionEvents += 1;
    });

    expect(grid.applyTransaction({ patches: [localSet(2)] }).status).toBe("applied");
    const rejected = grid.applyTransaction({ patches: [localSet(3)] });
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
    expect(rejectionEvents).toBe(3);
    expect(coordinator.pendingCount).toBe(1);
    expect(coordinator.pendingCommits()).toHaveLength(1);
    expect(adapter.requests).toHaveLength(0);
    expect(coordinator.state).toMatchObject({
      pendingCount: 1,
      pendingOperations: 1,
      pendingCapacity: "full",
    });
    const capacityErrors = events.filter(
      (event) => event.type === "error" && event.error instanceof SyncPendingCapacityError,
    );
    expect(capacityErrors).toHaveLength(3);

    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await sending;
    expect(coordinator.state.pendingCapacity).toBe("available");

    grid.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(coordinator.pendingCommits()[0]?.clientMutationId).toBe("m2");
    coordinator.destroy();
    grid.destroy();
  });

  it("reserves capacity across reentrant commits and lets remote operations bypass it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const adapter = new ControlledAdapter(snapshot());
    let nested = false;
    let nestedOutcome: ApplyTransactionResult | undefined;
    grid.on("change", (event) => {
      if (event.source !== "local" || nested) return;
      nested = true;
      nestedOutcome = grid.applyTransaction({ patches: [localSet(3)] });
    });
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "sync-doc",
      serverVersion: 7,
      createMutationId: () => "reentrant-m1",
      limits: { maxPendingCommits: 1 },
    });

    expect(grid.applyTransaction({ patches: [localSet(2)] }).status).toBe("applied");
    expect(nestedOutcome).toMatchObject({
      status: "rejected",
      issues: [{ resource: "pending-commits" }],
    });
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "reentrant-m1", operations: [localSet(2)] },
    ]);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    expect(grid.applyRemoteOperations([localSet(9)]).status).toBe("applied");
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
    expect(coordinator.pendingCount).toBe(1);
    coordinator.destroy();
    expect(coordinator.state).toMatchObject({
      pendingCount: 0,
      pendingOperations: 0,
      pendingEncodedBytes: 0,
      pendingCapacity: "destroyed",
    });
    expect(grid.applyTransaction({ patches: [localSet(10)] }).status).toBe("applied");
    expect(coordinator.pendingCount).toBe(0);
    grid.destroy();
  });
});
