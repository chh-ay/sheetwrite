import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import { HistoryArchive, MemoryHistoryStorage } from "../src/history-archive.js";
import {
  type CommitJournal,
  type CommittedTransaction,
  createGridFromSnapshot,
  initSheetwrite,
  MemoryPersistenceAdapter,
  PersistenceError,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type VersionedOperation,
  type WorkbookSnapshot,
} from "../src/index.js";
import { IndexedDbPendingCommitStorage } from "../src/indexeddb.js";
import { installCanvasTestStubs } from "../src/testing.js";

const DOCUMENT = "shared";

const globals = {
  indexedDB: Object.getOwnPropertyDescriptor(globalThis, "indexedDB"),
  IDBKeyRange: Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange"),
};

beforeAll(async () => {
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
  await initSheetwrite();
});

afterAll(() => {
  for (const [name, descriptor] of Object.entries(globals)) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
});

afterEach(() => restoreStubs());

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: DOCUMENT,
    version: 0,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount: 10,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        cells: [],
      },
    ],
  };
}

function set(row: number, value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "s1", row, col: 0 },
    value: { kind: "literal" as const, value },
  };
}

/** A journal that keeps the archive and also lists what the authority recorded. */
class ListingJournal implements CommitJournal {
  readonly commits: CommittedTransaction[] = [];
  failNext = false;

  constructor(private readonly archive: HistoryArchive) {}

  async record(commit: CommittedTransaction, capture: () => WorkbookSnapshot): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("history storage is offline");
    }

    await this.archive.record(commit, capture);
    this.commits.push(commit);
  }
}

async function authority() {
  const adapter = new MemoryPersistenceAdapter(snapshot());
  const archive = await HistoryArchive.open({
    documentId: DOCUMENT,
    storage: new MemoryHistoryStorage(),
    limits: { automaticIntervalMs: 1 },
  });
  await archive.initialize(snapshot(), 0);

  const journal = new ListingJournal(archive);
  adapter.recordHistory(DOCUMENT, journal);

  return { adapter, archive, journal };
}

function client(adapter: MemoryPersistenceAdapter, authorId: string, serverVersion = 0) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot());
  const sync = new SyncCoordinator(grid, adapter, {
    documentId: DOCUMENT,
    serverVersion,
    authorId,
  });
  const events: SyncCoordinatorEvent[] = [];
  sync.on((event) => events.push(event));

  return { grid, sync, events };
}

describe("authored history through sync", () => {
  it("records who made each committed change, in server order", async () => {
    const { adapter, archive, journal } = await authority();
    const alice = client(adapter, "alice");
    const bob = client(adapter, "bob", 1);

    alice.grid.applyTransaction({ patches: [set(0, 1)] });
    await alice.sync.flush();
    bob.grid.applyTransaction({ patches: [set(1, 2)] });
    await bob.sync.flush();

    expect(journal.commits.map((commit) => [commit.revision, commit.authorId])).toEqual([
      [1, "alice"],
      [2, "bob"],
    ]);

    const versions = await archive.listVersions();
    expect(versions.versions.map((version) => version.authorId)).toEqual(["bob", "alice"]);

    const latest = versions.versions[0];
    if (!latest) {
      throw new Error("Missing automatic version");
    }
    const rebuilt = await archive.readVersion(latest.id);
    expect(
      rebuilt.sheets[0]?.cells.flatMap((block) => block.cells).map((cell) => cell.value),
    ).toEqual([
      { kind: "literal", value: 1 },
      { kind: "literal", value: 2 },
    ]);
  });

  it("keeps the durable author of a pending edit across a restart", async () => {
    const { adapter, journal } = await authority();
    const pendingStorage = new IndexedDbPendingCommitStorage({ databaseName: "history-restart" });

    const host = document.createElement("div");
    const offlineGrid = createGridFromSnapshot(host, snapshot());
    const offline = new SyncCoordinator(offlineGrid, adapter, {
      documentId: DOCUMENT,
      serverVersion: 0,
      authorId: "alice",
      pendingStorage,
      initialConnection: "offline",
    });
    await offline.ready();

    offlineGrid.applyTransaction({ patches: [set(0, 5)] });
    await offline.ready();
    offline.destroy();
    offlineGrid.destroy();

    const restarted = new SyncCoordinator(createGridFromSnapshot(host, snapshot()), adapter, {
      documentId: DOCUMENT,
      serverVersion: 0,
      authorId: "bob",
      pendingStorage,
    });
    await restarted.ready();
    await restarted.flush();

    expect(journal.commits.map((commit) => commit.authorId)).toEqual(["alice"]);
  });

  it("publishes nothing and keeps the edit pending when the history journal fails", async () => {
    const { adapter, archive, journal } = await authority();
    const alice = client(adapter, "alice");

    journal.failNext = true;
    alice.grid.applyTransaction({ patches: [set(0, 9)] });
    await expect(alice.sync.flush()).rejects.toBeInstanceOf(PersistenceError);

    expect((await adapter.load(DOCUMENT)).version).toBe(0);
    expect(alice.sync.pendingCount).toBe(1);
    expect((await archive.listVersions()).versions).toHaveLength(0);

    await alice.sync.flush();

    expect((await adapter.load(DOCUMENT)).version).toBe(1);
    expect(journal.commits.map((commit) => commit.revision)).toEqual([1]);
  });

  it("records one archived entry when a commit is sent again", async () => {
    const { adapter, journal } = await authority();
    const request = {
      documentId: DOCUMENT,
      baseVersion: 0,
      clientMutationId: "again",
      authorId: "alice",
      operations: [set(0, 3)],
    };

    expect((await adapter.commit(request)).status).toBe("applied");
    expect((await adapter.commit(request)).status).toBe("duplicate");
    expect(journal.commits).toHaveLength(1);
  });

  it("rejects a commit without an author while history is recorded", async () => {
    const { adapter, journal } = await authority();

    const anonymous = adapter.commit({
      documentId: DOCUMENT,
      baseVersion: 0,
      clientMutationId: "anonymous",
      operations: [set(0, 3)],
    });

    await expect(anonymous).rejects.toMatchObject({ code: "commit-rejected" });
    expect(journal.commits).toHaveLength(0);
    expect((await adapter.load(DOCUMENT)).version).toBe(0);
  });

  it("gives a conflicting client the authors of the versions it missed", async () => {
    const { adapter } = await authority();
    const alice = client(adapter, "alice");
    const bob = client(adapter, "bob");

    alice.grid.applyTransaction({ patches: [set(0, 1)] });
    await alice.sync.flush();
    bob.grid.applyTransaction({ patches: [set(1, 2)] });
    await bob.sync.flush();

    const conflict = bob.events.find((event) => event.type === "conflict");
    if (conflict?.type !== "conflict") {
      throw new Error("Expected a conflict");
    }

    expect(conflict.response.operationsSinceBase?.map((entry) => entry.authorId)).toEqual([
      "alice",
    ]);
  });
});

describe("authored remote versions", () => {
  async function receiver() {
    const { adapter } = await authority();
    return client(adapter, "bob");
  }

  async function* versions(...entries: VersionedOperation[]) {
    for (const entry of entries) {
      yield entry;
    }
  }

  it("keeps the author and commit time of a remote version", async () => {
    const bob = await receiver();

    bob.sync.subscribe(
      versions({ version: 1, operations: [set(0, 1)], authorId: "alice", committedAt: 1000 }),
    );
    await bob.sync.flush();

    const applied = bob.events.find((event) => event.type === "remote-applied");
    expect(applied?.type === "remote-applied" ? applied.operation : undefined).toMatchObject({
      authorId: "alice",
      committedAt: 1000,
    });
  });

  it("rejects an atomic batch whose members name different authors", async () => {
    const bob = await receiver();

    bob.sync.subscribe(
      versions(
        {
          version: 1,
          operations: [set(0, 1)],
          clientMutationId: "b",
          authorId: "alice",
          batch: { index: 0, count: 2 },
        },
        {
          version: 2,
          operations: [set(1, 2)],
          clientMutationId: "b",
          authorId: "mallory",
          batch: { index: 1, count: 2 },
        },
      ),
    );
    await bob.sync.flush();

    expect(bob.events.some((event) => event.type === "remote-applied")).toBe(false);
    expect(bob.sync.serverVersion).toBe(0);
  });

  it("rejects an author ID above the mutation ID byte limit", async () => {
    const bob = await receiver();

    bob.sync.subscribe(
      versions({ version: 1, operations: [set(0, 1)], authorId: "a".repeat(257) }),
    );
    await bob.sync.flush();

    expect(bob.sync.serverVersion).toBe(0);
    expect(bob.events.some((event) => event.type === "error")).toBe(true);
  });
});
