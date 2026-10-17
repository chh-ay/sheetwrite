import {
  type DocumentOp,
  MemoryPersistenceAdapter,
  type PersistenceAdapter,
  type PersistenceBatchCommitRequest,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  PersistenceError,
  SheetwriteStore,
  type VersionedOperation,
  validateWorkbookSnapshot,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

/** Live IndexedDB gauges surfaced by the database showcase. */
export interface ShowcaseDatabaseStats {
  /** IndexedDB read requests issued (gets and range scans). */
  reads: number;
  /** IndexedDB write requests issued (puts and deletes). */
  writes: number;
  /** Stored bytes: compacted snapshot JSON plus every tail record. */
  storedBytes: number;
  /** Head version: stored snapshot version plus the operation tail. */
  currentVersion: number;
  /** Version of the compacted snapshot record. */
  snapshotVersion: number;
  /** Operation-log records not yet folded into the snapshot. */
  tailLength: number;
}

export interface ShowcaseDatabaseOptions {
  databaseName: string;
  /** Fold the operation tail into the snapshot once either bound is crossed. */
  compaction?: { maxTailRecords?: number; maxTailBytes?: number };
  /** Conflicts replay at most this many tail versions before snapshot fallback. */
  maxConflictTailVersions?: number;
}

interface DocumentRecord {
  documentId: string;
  /** Compacted snapshot; its `version` is the snapshot version. */
  snapshot: WorkbookSnapshot;
}

interface TailRecord {
  documentId: string;
  version: number;
  clientMutationId: string;
  operations: readonly DocumentOp[];
  bytes: number;
  batch?: VersionedOperation["batch"];
}

interface MutationRecord {
  documentId: string;
  clientMutationId: string;
  version: number;
}

const DOCUMENTS = "documents";
const TAIL = "tail";
const MUTATIONS = "mutations";
const DEFAULT_MAX_TAIL_RECORDS = 24;
const DEFAULT_MAX_TAIL_BYTES = 256 * 1024;
const DEFAULT_MAX_CONFLICT_TAIL_VERSIONS = 32;

const encoder = new TextEncoder();

/**
 * Demo-only versioned workbook database over real IndexedDB.
 *
 * The layout is the classic snapshot-plus-log shape a production host owns on
 * its server: one compacted snapshot record, one operation-log record per
 * committed transaction, and one idempotency record per client mutation id.
 * Commits compare base versions, deduplicate retries, answer conflicts with a
 * bounded operation tail (falling back to a full snapshot), and fold the tail
 * into the snapshot once count or byte compaction bounds are crossed.
 *
 * It is intentionally single-writer per adapter instance — a live product
 * replaces this whole class with its own `PersistenceAdapter` over its own
 * database and transport. Call `initSheetwrite()` before committing.
 */
export class ShowcaseIndexedDbAdapter implements PersistenceAdapter {
  private readonly database: IDBDatabase;
  private readonly maxTailRecords: number;
  private readonly maxTailBytes: number;
  private readonly maxConflictTailVersions: number;
  private readonly statsListeners = new Set<(stats: ShowcaseDatabaseStats) => void>();
  private gauges: ShowcaseDatabaseStats;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    database: IDBDatabase,
    options: ShowcaseDatabaseOptions,
    gauges: ShowcaseDatabaseStats,
  ) {
    this.database = database;
    this.maxTailRecords = options.compaction?.maxTailRecords ?? DEFAULT_MAX_TAIL_RECORDS;
    this.maxTailBytes = options.compaction?.maxTailBytes ?? DEFAULT_MAX_TAIL_BYTES;
    this.maxConflictTailVersions =
      options.maxConflictTailVersions ?? DEFAULT_MAX_CONFLICT_TAIL_VERSIONS;
    this.gauges = gauges;
  }

  /**
   * Opens (or creates) the database and seeds the document snapshot only when
   * the document does not already exist, so committed state survives reloads.
   */
  static async open(
    seed: WorkbookSnapshot,
    options: ShowcaseDatabaseOptions,
  ): Promise<ShowcaseIndexedDbAdapter> {
    const checked = validateWorkbookSnapshot(seed);
    if (!checked.ok) {
      throw new PersistenceError(
        "invalid-snapshot",
        checked.errors[0]?.message ?? "Seed snapshot is invalid",
      );
    }
    if (!checked.value.documentId) {
      throw new PersistenceError("invalid-snapshot", "Seed snapshots require documentId");
    }
    const documentId = checked.value.documentId;
    const database = await openDatabase(options.databaseName);
    let reads = 0;
    let writes = 0;

    const readTx = database.transaction([DOCUMENTS, TAIL], "readonly");
    const existing = await request<DocumentRecord | undefined>(
      readTx.objectStore(DOCUMENTS).get(documentId),
    );
    reads += 1;
    let document = existing;
    if (!document) {
      const version = checked.value.version ?? 0;
      document = { documentId, snapshot: cloneJson({ ...checked.value, version }) };
      const seedTx = database.transaction(DOCUMENTS, "readwrite");
      await request(seedTx.objectStore(DOCUMENTS).put(document));
      writes += 1;
    }
    const tailTx = database.transaction(TAIL, "readonly");
    const tail = await request<TailRecord[]>(
      tailTx.objectStore(TAIL).getAll(documentBounds(documentId)),
    );
    reads += 1;

    const snapshotVersion = document.snapshot.version ?? 0;
    const gauges: ShowcaseDatabaseStats = {
      reads,
      writes,
      storedBytes:
        encoder.encode(JSON.stringify(document.snapshot)).length +
        tail.reduce((total, record) => total + record.bytes, 0),
      currentVersion: tail.at(-1)?.version ?? snapshotVersion,
      snapshotVersion,
      tailLength: tail.length,
    };
    return new ShowcaseIndexedDbAdapter(database, options, gauges);
  }

  stats(): ShowcaseDatabaseStats {
    return { ...this.gauges };
  }

  subscribeStats(listener: (stats: ShowcaseDatabaseStats) => void): () => void {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  close(): void {
    this.database.close();
  }

  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return this.enqueue(async () => {
      throwIfAborted(signal);
      const { document, tail } = await this.readDocument(documentId);
      throwIfAborted(signal);
      const snapshot = this.materialize(document.snapshot, tail);
      this.publishStats();
      return snapshot;
    });
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return this.enqueue(async () => {
      throwIfAborted(request.signal);
      const applied = await this.readMutation(request.documentId, request.clientMutationId);
      if (applied) {
        this.publishStats();
        return {
          status: "duplicate" as const,
          version: applied.version,
          clientMutationId: request.clientMutationId,
        };
      }
      const { document, tail } = await this.readDocument(request.documentId);
      const snapshotVersion = document.snapshot.version ?? 0;
      const currentVersion = tail.at(-1)?.version ?? snapshotVersion;
      throwIfAborted(request.signal);

      if (request.baseVersion !== currentVersion) {
        const response = this.conflictResponse(request.baseVersion, document, tail);
        this.publishStats();
        return response;
      }

      const next = this.materialize(document.snapshot, tail, request.operations);
      throwIfAborted(request.signal);
      await this.persistCommit(request, next, document, tail);
      this.publishStats();
      return {
        status: "applied" as const,
        version: next.version ?? currentVersion + 1,
        clientMutationId: request.clientMutationId,
      };
    });
  }
  commitBatch(commit: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    return this.enqueue(async () => {
      throwIfAborted(commit.signal);
      const applied = await this.readMutation(commit.documentId, commit.clientMutationId);
      if (applied) {
        return {
          status: "duplicate",
          version: applied.version,
          clientMutationId: commit.clientMutationId,
        };
      }
      const { document, tail } = await this.readDocument(commit.documentId);
      const currentVersion = tail.at(-1)?.version ?? document.snapshot.version ?? 0;
      if (commit.baseVersion !== currentVersion) {
        return this.conflictResponse(commit.baseVersion, document, tail);
      }
      // The reference adapter validates every version and applies to a scratch
      // document before any IndexedDB write can become visible.
      const scratch = new MemoryPersistenceAdapter(this.materialize(document.snapshot, tail));
      const response = await scratch.commitBatch(commit);
      if (response.status !== "applied") return response;
      const next = await scratch.load(commit.documentId, commit.signal);
      let offset = 0;
      const records: TailRecord[] = commit.versionOperationCounts.map((count, index) => {
        const operations = cloneJson(commit.operations.slice(offset, offset + count));
        offset += count;
        return {
          documentId: commit.documentId,
          version: currentVersion + index + 1,
          clientMutationId: commit.clientMutationId,
          operations,
          bytes: encoder.encode(JSON.stringify(operations)).length,
          batch: { index, count: commit.versionOperationCounts.length },
        };
      });
      throwIfAborted(commit.signal);
      const tx = this.database.transaction([TAIL, MUTATIONS], "readwrite");
      const complete = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Atomic IndexedDB commit aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("Atomic IndexedDB commit failed"));
      });
      for (const record of records) tx.objectStore(TAIL).put(record);
      tx.objectStore(MUTATIONS).put({
        documentId: commit.documentId,
        clientMutationId: commit.clientMutationId,
        version: response.version,
      } satisfies MutationRecord);
      await complete;
      this.gauges.writes += records.length + 1;
      const tailBytes = [...tail, ...records].reduce((bytes, record) => bytes + record.bytes, 0);
      this.gauges.currentVersion = response.version;
      this.gauges.tailLength = tail.length + records.length;
      this.gauges.storedBytes =
        encoder.encode(JSON.stringify(document.snapshot)).length + tailBytes;
      if (this.gauges.tailLength > this.maxTailRecords || tailBytes > this.maxTailBytes) {
        await this.compact(commit.documentId, next);
      }
      this.publishStats();
      return response;
    });
  }

  /** Serializes adapter work so read-compute-write commits cannot interleave. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async readDocument(
    documentId: string,
  ): Promise<{ document: DocumentRecord; tail: TailRecord[] }> {
    const tx = this.database.transaction([DOCUMENTS, TAIL], "readonly");
    const documentRequest = tx.objectStore(DOCUMENTS).get(documentId);
    const tailRequest = tx.objectStore(TAIL).getAll(documentBounds(documentId));
    const document = await request<DocumentRecord | undefined>(documentRequest);
    const tail = await request<TailRecord[]>(tailRequest);
    this.gauges.reads += 2;
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);
    return { document, tail };
  }

  private async readMutation(
    documentId: string,
    clientMutationId: string,
  ): Promise<MutationRecord | undefined> {
    const tx = this.database.transaction(MUTATIONS, "readonly");
    const record = await request<MutationRecord | undefined>(
      tx.objectStore(MUTATIONS).get([documentId, clientMutationId]),
    );
    this.gauges.reads += 1;
    return record;
  }

  private conflictResponse(
    baseVersion: number,
    document: DocumentRecord,
    tail: readonly TailRecord[],
  ): PersistenceCommitResponse {
    const snapshotVersion = document.snapshot.version ?? 0;
    const currentVersion = tail.at(-1)?.version ?? snapshotVersion;
    const withinTail = baseVersion >= snapshotVersion;
    const bounded = currentVersion - baseVersion <= this.maxConflictTailVersions;
    if (withinTail && bounded && baseVersion <= currentVersion) {
      const operationsSinceBase: VersionedOperation[] = tail
        .filter((record) => record.version > baseVersion)
        .map((record) => ({
          version: record.version,
          clientMutationId: record.clientMutationId,
          operations: cloneJson(record.operations),
          ...(record.batch ? { batch: { ...record.batch } } : {}),
        }));
      if (operationsSinceBase.length === currentVersion - baseVersion) {
        return { status: "conflict", currentVersion, operationsSinceBase };
      }
    }
    return {
      status: "conflict",
      currentVersion,
      snapshot: this.materialize(document.snapshot, tail),
    };
  }

  /**
   * Replays the tail and an optional new commit in one temporary store. Rebuilding
   * and exporting the workbook after each version makes a tiny ledger edit pay
   * for the unrelated 100,000-cell usage sheet once per missed version.
   */
  private materialize(
    snapshot: WorkbookSnapshot,
    tail: readonly TailRecord[],
    nextOperations?: readonly DocumentOp[],
  ): WorkbookSnapshot {
    if (tail.length === 0 && nextOperations === undefined) return cloneJson(snapshot);
    const store = SheetwriteStore.fromSnapshot(snapshot);
    let version = snapshot.version ?? 0;
    try {
      for (const record of tail) {
        this.apply(store, record.operations);
        version = record.version;
      }
      if (nextOperations !== undefined) {
        this.apply(store, nextOperations);
        version += 1;
      }
      return { ...store.exportSnapshot(), version };
    } finally {
      store.dispose();
    }
  }

  private apply(store: SheetwriteStore, operations: readonly DocumentOp[]): void {
    const outcome = store.applyTransaction(
      { patches: operations.slice() },
      { source: "remote", commitReason: "api" },
    );
    if (outcome.status === "conflict" || (outcome.status === "noop" && operations.length > 0)) {
      throw new PersistenceError("commit-rejected", "Database commit was rejected");
    }
  }

  private async persistCommit(
    commit: PersistenceCommitRequest,
    next: WorkbookSnapshot,
    document: DocumentRecord,
    tail: readonly TailRecord[],
  ): Promise<void> {
    const version = next.version ?? 0;
    const operations = cloneJson(commit.operations);
    const record: TailRecord = {
      documentId: commit.documentId,
      version,
      clientMutationId: commit.clientMutationId,
      operations,
      bytes: encoder.encode(JSON.stringify(operations)).length,
    };
    const tx = this.database.transaction([TAIL, MUTATIONS], "readwrite");
    const tailPut = tx.objectStore(TAIL).put(record);
    const mutationPut = tx.objectStore(MUTATIONS).put({
      documentId: commit.documentId,
      clientMutationId: commit.clientMutationId,
      version,
    } satisfies MutationRecord);
    await request(tailPut);
    await request(mutationPut);
    this.gauges.writes += 2;

    const tailLength = tail.length + 1;
    const tailBytes = tail.reduce((total, entry) => total + entry.bytes, record.bytes);
    this.gauges.currentVersion = version;
    this.gauges.tailLength = tailLength;
    this.gauges.storedBytes = encoder.encode(JSON.stringify(document.snapshot)).length + tailBytes;

    if (tailLength > this.maxTailRecords || tailBytes > this.maxTailBytes) {
      await this.compact(commit.documentId, next);
    }
  }

  /** Folds the tail into one snapshot record and deletes the folded log rows. */
  private async compact(documentId: string, snapshot: WorkbookSnapshot): Promise<void> {
    const compacted: DocumentRecord = { documentId, snapshot: cloneJson(snapshot) };
    const tx = this.database.transaction([DOCUMENTS, TAIL], "readwrite");
    const documentPut = tx.objectStore(DOCUMENTS).put(compacted);
    const tailDelete = tx
      .objectStore(TAIL)
      .delete(documentBounds(documentId, snapshot.version ?? 0));
    await request(documentPut);
    await request(tailDelete);
    this.gauges.writes += 2;
    this.gauges.snapshotVersion = snapshot.version ?? 0;
    this.gauges.tailLength = 0;
    this.gauges.storedBytes = encoder.encode(JSON.stringify(compacted.snapshot)).length;
  }

  private publishStats(): void {
    const stats = this.stats();
    for (const listener of this.statsListeners) listener(stats);
  }
}

/** Removes a showcase database so a demo can restart from its seed. */
export async function deleteShowcaseDatabase(databaseName: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const deletion = indexedDB.deleteDatabase(databaseName);
  deletion.onsuccess = () => resolve();
  deletion.onerror = () => reject(deletion.error ?? new Error("IndexedDB deletion failed"));
  deletion.onblocked = () => reject(new Error("IndexedDB deletion was blocked by an open tab"));
  await promise;
}

function openDatabase(name: string): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => {
    const database = open.result;
    if (!database.objectStoreNames.contains(DOCUMENTS)) {
      database.createObjectStore(DOCUMENTS, { keyPath: "documentId" });
    }
    if (!database.objectStoreNames.contains(TAIL)) {
      database.createObjectStore(TAIL, { keyPath: ["documentId", "version"] });
    }
    if (!database.objectStoreNames.contains(MUTATIONS)) {
      database.createObjectStore(MUTATIONS, { keyPath: ["documentId", "clientMutationId"] });
    }
  };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
  return promise;
}

function request<T>(idbRequest: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  idbRequest.onsuccess = () => resolve(idbRequest.result);
  idbRequest.onerror = () => reject(idbRequest.error ?? new Error("IndexedDB request failed"));
  return promise;
}

/** All keys for one document across `[documentId, number]` key ranges. */
function documentBounds(documentId: string, upToVersion?: number): IDBKeyRange {
  return IDBKeyRange.bound([documentId, 0], [documentId, upToVersion ?? Number.MAX_SAFE_INTEGER]);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PersistenceError("aborted", "Persistence operation aborted", {
      cause: signal.reason,
    });
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
