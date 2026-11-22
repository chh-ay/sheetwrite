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

import { deleteDatabase } from "../lib/delete-database.js";

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
  private readonly max_tail_records: number;
  private readonly max_tail_bytes: number;
  private readonly max_conflict_tail_versions: number;
  private readonly stats_listeners = new Set<(stats: ShowcaseDatabaseStats) => void>();
  private gauges: ShowcaseDatabaseStats;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    database: IDBDatabase,
    options: ShowcaseDatabaseOptions,
    gauges: ShowcaseDatabaseStats,
  ) {
    this.database = database;
    this.max_tail_records = options.compaction?.maxTailRecords ?? DEFAULT_MAX_TAIL_RECORDS;
    this.max_tail_bytes = options.compaction?.maxTailBytes ?? DEFAULT_MAX_TAIL_BYTES;
    this.max_conflict_tail_versions =
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
    const document_id = checked.value.documentId;
    const database = await open_database(options.databaseName);
    let reads = 0;
    let writes = 0;

    const read_tx = database.transaction([DOCUMENTS, TAIL], "readonly");
    const existing = await request<DocumentRecord | undefined>(
      read_tx.objectStore(DOCUMENTS).get(document_id),
    );
    reads += 1;
    let document = existing;
    if (!document) {
      const version = checked.value.version ?? 0;
      document = { documentId: document_id, snapshot: clone_json({ ...checked.value, version }) };
      const seed_tx = database.transaction(DOCUMENTS, "readwrite");
      await request(seed_tx.objectStore(DOCUMENTS).put(document));
      writes += 1;
    }
    const tail_tx = database.transaction(TAIL, "readonly");
    const tail = await request<TailRecord[]>(
      tail_tx.objectStore(TAIL).getAll(document_bounds(document_id)),
    );
    reads += 1;

    const snapshot_version = document.snapshot.version ?? 0;
    const gauges: ShowcaseDatabaseStats = {
      reads,
      writes,
      storedBytes:
        encoder.encode(JSON.stringify(document.snapshot)).length +
        tail.reduce((total, record) => total + record.bytes, 0),
      currentVersion: tail.at(-1)?.version ?? snapshot_version,
      snapshotVersion: snapshot_version,
      tailLength: tail.length,
    };
    return new ShowcaseIndexedDbAdapter(database, options, gauges);
  }

  stats(): ShowcaseDatabaseStats {
    return { ...this.gauges };
  }

  subscribeStats(listener: (stats: ShowcaseDatabaseStats) => void): () => void {
    this.stats_listeners.add(listener);
    return () => this.stats_listeners.delete(listener);
  }

  close(): void {
    this.database.close();
  }

  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return this.enqueue(async () => {
      throw_if_aborted(signal);
      const { document, tail } = await this.read_document(documentId);
      throw_if_aborted(signal);
      const snapshot = this.materialize(document.snapshot, tail);
      this.publish_stats();
      return snapshot;
    });
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return this.enqueue(async () => {
      throw_if_aborted(request.signal);
      const applied = await this.read_mutation(request.documentId, request.clientMutationId);
      if (applied) {
        this.publish_stats();
        return {
          status: "duplicate" as const,
          version: applied.version,
          clientMutationId: request.clientMutationId,
        };
      }
      const { document, tail } = await this.read_document(request.documentId);
      const snapshot_version = document.snapshot.version ?? 0;
      const current_version = tail.at(-1)?.version ?? snapshot_version;
      throw_if_aborted(request.signal);

      if (request.baseVersion !== current_version) {
        const response = this.conflict_response(request.baseVersion, document, tail);
        this.publish_stats();
        return response;
      }

      const next = this.materialize(document.snapshot, tail, request.operations);
      throw_if_aborted(request.signal);
      await this.persist_commit(request, next, document, tail);
      this.publish_stats();
      return {
        status: "applied" as const,
        version: next.version ?? current_version + 1,
        clientMutationId: request.clientMutationId,
      };
    });
  }
  commitBatch(commit: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    return this.enqueue(async () => {
      throw_if_aborted(commit.signal);
      const applied = await this.read_mutation(commit.documentId, commit.clientMutationId);
      if (applied) {
        return {
          status: "duplicate",
          version: applied.version,
          clientMutationId: commit.clientMutationId,
        };
      }
      const { document, tail } = await this.read_document(commit.documentId);
      const current_version = tail.at(-1)?.version ?? document.snapshot.version ?? 0;
      if (commit.baseVersion !== current_version) {
        return this.conflict_response(commit.baseVersion, document, tail);
      }
      // The reference adapter validates every version and applies to a scratch
      // document before any IndexedDB write can become visible.
      const scratch = new MemoryPersistenceAdapter(this.materialize(document.snapshot, tail));
      const response = await scratch.commitBatch(commit);
      if (response.status !== "applied") return response;
      const next = await scratch.load(commit.documentId, commit.signal);
      let offset = 0;
      const records: TailRecord[] = commit.versionOperationCounts.map((count, index) => {
        const operations = clone_json(commit.operations.slice(offset, offset + count));
        offset += count;
        return {
          documentId: commit.documentId,
          version: current_version + index + 1,
          clientMutationId: commit.clientMutationId,
          operations,
          bytes: encoder.encode(JSON.stringify(operations)).length,
          batch: { index, count: commit.versionOperationCounts.length },
        };
      });
      throw_if_aborted(commit.signal);
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
      const tail_bytes = [...tail, ...records].reduce((bytes, record) => bytes + record.bytes, 0);
      this.gauges.currentVersion = response.version;
      this.gauges.tailLength = tail.length + records.length;
      this.gauges.storedBytes =
        encoder.encode(JSON.stringify(document.snapshot)).length + tail_bytes;
      if (this.gauges.tailLength > this.max_tail_records || tail_bytes > this.max_tail_bytes) {
        await this.compact(commit.documentId, next);
      }
      this.publish_stats();
      return response;
    });
  }

  /** Serializes adapter work so read-compute-write commits cannot interleave. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read_document(
    document_id: string,
  ): Promise<{ document: DocumentRecord; tail: TailRecord[] }> {
    const tx = this.database.transaction([DOCUMENTS, TAIL], "readonly");
    const document_request = tx.objectStore(DOCUMENTS).get(document_id);
    const tail_request = tx.objectStore(TAIL).getAll(document_bounds(document_id));
    const document = await request<DocumentRecord | undefined>(document_request);
    const tail = await request<TailRecord[]>(tail_request);
    this.gauges.reads += 2;
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${document_id}`);
    return { document, tail };
  }

  private async read_mutation(
    document_id: string,
    client_mutation_id: string,
  ): Promise<MutationRecord | undefined> {
    const tx = this.database.transaction(MUTATIONS, "readonly");
    const record = await request<MutationRecord | undefined>(
      tx.objectStore(MUTATIONS).get([document_id, client_mutation_id]),
    );
    this.gauges.reads += 1;
    return record;
  }

  private conflict_response(
    base_version: number,
    document: DocumentRecord,
    tail: readonly TailRecord[],
  ): PersistenceCommitResponse {
    const snapshot_version = document.snapshot.version ?? 0;
    const current_version = tail.at(-1)?.version ?? snapshot_version;
    const within_tail = base_version >= snapshot_version;
    const bounded = current_version - base_version <= this.max_conflict_tail_versions;
    if (within_tail && bounded && base_version <= current_version) {
      const operations_since_base: VersionedOperation[] = tail
        .filter((record) => record.version > base_version)
        .map((record) => ({
          version: record.version,
          clientMutationId: record.clientMutationId,
          operations: clone_json(record.operations),
          ...(record.batch ? { batch: { ...record.batch } } : {}),
        }));
      if (operations_since_base.length === current_version - base_version) {
        return {
          status: "conflict",
          currentVersion: current_version,
          operationsSinceBase: operations_since_base,
        };
      }
    }
    return {
      status: "conflict",
      currentVersion: current_version,
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
    next_operations?: readonly DocumentOp[],
  ): WorkbookSnapshot {
    if (tail.length === 0 && next_operations === undefined) return clone_json(snapshot);
    const store = SheetwriteStore.fromSnapshot(snapshot);
    let version = snapshot.version ?? 0;
    try {
      for (const record of tail) {
        this.apply(store, record.operations);
        version = record.version;
      }
      if (next_operations !== undefined) {
        this.apply(store, next_operations);
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

  private async persist_commit(
    commit: PersistenceCommitRequest,
    next: WorkbookSnapshot,
    document: DocumentRecord,
    tail: readonly TailRecord[],
  ): Promise<void> {
    const version = next.version ?? 0;
    const operations = clone_json(commit.operations);
    const record: TailRecord = {
      documentId: commit.documentId,
      version,
      clientMutationId: commit.clientMutationId,
      operations,
      bytes: encoder.encode(JSON.stringify(operations)).length,
    };
    const tx = this.database.transaction([TAIL, MUTATIONS], "readwrite");
    const tail_put = tx.objectStore(TAIL).put(record);
    const mutation_put = tx.objectStore(MUTATIONS).put({
      documentId: commit.documentId,
      clientMutationId: commit.clientMutationId,
      version,
    } satisfies MutationRecord);
    await request(tail_put);
    await request(mutation_put);
    this.gauges.writes += 2;

    const tail_length = tail.length + 1;
    const tail_bytes = tail.reduce((total, entry) => total + entry.bytes, record.bytes);
    this.gauges.currentVersion = version;
    this.gauges.tailLength = tail_length;
    this.gauges.storedBytes = encoder.encode(JSON.stringify(document.snapshot)).length + tail_bytes;

    if (tail_length > this.max_tail_records || tail_bytes > this.max_tail_bytes) {
      await this.compact(commit.documentId, next);
    }
  }

  /** Folds the tail into one snapshot record and deletes the folded log rows. */
  private async compact(document_id: string, snapshot: WorkbookSnapshot): Promise<void> {
    const compacted: DocumentRecord = { documentId: document_id, snapshot: clone_json(snapshot) };
    const tx = this.database.transaction([DOCUMENTS, TAIL], "readwrite");
    const document_put = tx.objectStore(DOCUMENTS).put(compacted);
    const tail_delete = tx
      .objectStore(TAIL)
      .delete(document_bounds(document_id, snapshot.version ?? 0));
    await request(document_put);
    await request(tail_delete);
    this.gauges.writes += 2;
    this.gauges.snapshotVersion = snapshot.version ?? 0;
    this.gauges.tailLength = 0;
    this.gauges.storedBytes = encoder.encode(JSON.stringify(compacted.snapshot)).length;
  }

  private publish_stats(): void {
    const stats = this.stats();
    for (const listener of this.stats_listeners) listener(stats);
  }
}

/** Removes a showcase database so a demo can restart from its seed. */
export async function deleteShowcaseDatabase(databaseName: string): Promise<void> {
  await deleteDatabase(databaseName, { error: "reject", blocked: "reject" });
}

function open_database(name: string): Promise<IDBDatabase> {
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

function request<T>(idb_request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  idb_request.onsuccess = () => resolve(idb_request.result);
  idb_request.onerror = () => reject(idb_request.error ?? new Error("IndexedDB request failed"));
  return promise;
}

/** All keys for one document across `[documentId, number]` key ranges. */
function document_bounds(document_id: string, up_to_version?: number): IDBKeyRange {
  return IDBKeyRange.bound(
    [document_id, 0],
    [document_id, up_to_version ?? Number.MAX_SAFE_INTEGER],
  );
}

function throw_if_aborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PersistenceError("aborted", "Persistence operation aborted", {
      cause: signal.reason,
    });
  }
}

function clone_json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
