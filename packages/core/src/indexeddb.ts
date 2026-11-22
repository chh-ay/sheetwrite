import { validVersionOperationCounts } from "./atomic-batch.js";
import { SheetwriteError } from "./errors.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./json-bytes.js";
import { cloneJsonValue, compareCodeUnits } from "./plain-data.js";
import type { PendingCommitLoadOptions, PendingCommitStorage } from "./sync.js";
import type { PendingCommit } from "./types/transaction.js";

const DATABASE_VERSION = 2;
const RECORD_SCHEMA_VERSION = 1;
const DEFAULT_DATABASE = "sheetwrite-offline";
const DEFAULT_STORE = "pending-commits";

/** Stable category for an IndexedDB pending-storage failure. */
export type IndexedDbPendingCommitStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "aborted"
  | "quota"
  | "unsupported-schema"
  | "transaction"
  | "conflict"
  | "limit"
  | "invalid-limits";

/** Typed IndexedDB failure raised by durable pending-commit storage. */
export class IndexedDbPendingCommitStorageError extends SheetwriteError {
  /** Always `"IndexedDbPendingCommitStorageError"`. */
  override readonly name = "IndexedDbPendingCommitStorageError";
  /** What failed, such as `quota` when the browser refused more storage. */
  declare readonly code: IndexedDbPendingCommitStorageErrorCode;

  /** Creates the error; `options.cause` keeps the browser's original error. */
  constructor(
    code: IndexedDbPendingCommitStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(code, "pending-storage", message, { cause: options?.cause });
  }
}

/** Database and store naming options for durable pending commits. */
export interface IndexedDbPendingCommitStorageOptions {
  /** IndexedDB database name; defaults to `sheetwrite-offline`. */
  databaseName?: string;
  /** Object store name in that database; defaults to `pending-commits`. */
  storeName?: string;
}

interface StoredPendingCommit extends PendingCommit {
  queueSchemaVersion?: number;
  sequence?: number;
}

/** Optional commit fields, stored only when present: batch shape, author and restore provenance. */
function stored_optional_fields(
  commit: PendingCommit,
): Pick<PendingCommit, "versionOperationCounts" | "authorId" | "restore"> {
  return {
    ...(commit.versionOperationCounts
      ? { versionOperationCounts: [...commit.versionOperationCounts] }
      : {}),
    ...(commit.authorId !== undefined ? { authorId: commit.authorId } : {}),
    ...(commit.restore !== undefined ? { restore: { ...commit.restore } } : {}),
  };
}

function assert_version_operation_counts(commit: PendingCommit): void {
  const counts = commit.versionOperationCounts;
  if (counts === undefined || validVersionOperationCounts(counts, commit.operations.length)) return;

  throw new IndexedDbPendingCommitStorageError(
    "transaction",
    "Pending queue record has invalid atomic batch version operation counts",
  );
}

interface QueueMeta {
  documentId: string;
  nextSequence: number;
}

interface DatabaseOpenAttempt {
  readonly promise: Promise<IDBDatabase>;
  readonly resolve: (database: IDBDatabase) => void;
  readonly reject: (error: unknown) => void;
  active: boolean;
  settled: boolean;
  database?: IDBDatabase;
}
/**
 * Browser-only durable pending queue. Import it from `@sheetwrite/core/browser`;
 * the package's root entrypoint never evaluates IndexedDB globals.
 */
export class IndexedDbPendingCommitStorage implements PendingCommitStorage {
  private readonly database_name: string;
  private readonly store_name: string;
  private readonly meta_store_name: string;
  private database_attempt?: DatabaseOpenAttempt;

  /** Creates the storage; the database opens on first use. */
  constructor(options: IndexedDbPendingCommitStorageOptions = {}) {
    this.database_name = options.databaseName ?? DEFAULT_DATABASE;
    this.store_name = options.storeName ?? DEFAULT_STORE;
    this.meta_store_name = `${this.store_name}-meta`;
  }

  /** Reads the document's pending commits in commit order. */
  async load(
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<readonly PendingCommit[]> {
    assert_load_options(options);
    throw_if_aborted(options.signal);
    const database = await this.open(options.signal);
    const legacy = await this.inspect_for_legacy(database, documentId, options);
    if (legacy.records.length > 0) {
      legacy.records.sort(
        (left, right) =>
          left.baseVersion - right.baseVersion ||
          compareCodeUnits(left.clientMutationId, right.clientMutationId),
      );
      await this.ensure_sequence_floor(
        database,
        documentId,
        legacy.maxSequence + 1,
        options.signal,
      );
      for (const record of legacy.records) await this.put(record, options.signal);
    }
    return this.read_ordered(database, documentId, options);
  }

  /** Adds a commit to the end of its document's queue, or replaces it when its ID is already there. */
  async put(commit: PendingCommit, signal?: AbortSignal): Promise<void> {
    throw_if_aborted(signal);
    assert_version_operation_counts(commit);
    const database = await this.open(signal);
    const transaction = database.transaction([this.store_name, this.meta_store_name], "readwrite");
    const store = transaction.objectStore(this.store_name);
    const meta_store = transaction.objectStore(this.meta_store_name);
    const key: [string, string] = [commit.documentId, commit.clientMutationId];

    try {
      const existing = await request_result<StoredPendingCommit | undefined>(
        store.get(key),
        signal,
        transaction,
      );
      let sequence = existing?.sequence;
      if (sequence === undefined) {
        const meta = await request_result<QueueMeta | undefined>(
          meta_store.get(commit.documentId),
          signal,
          transaction,
        );
        sequence = meta?.nextSequence ?? 1;
        meta_store.put({
          documentId: commit.documentId,
          nextSequence: sequence + 1,
        } satisfies QueueMeta);
      }

      store.put({
        queueSchemaVersion: RECORD_SCHEMA_VERSION,
        sequence,
        documentId: commit.documentId,
        baseVersion: commit.baseVersion,
        clientMutationId: commit.clientMutationId,
        operations: cloneJsonValue(commit.operations),
        ...stored_optional_fields(commit),
      } satisfies StoredPendingCommit);

      await transaction_done(transaction, signal);
    } catch (error) {
      throw storage_error(error, "Unable to persist pending Sheetwrite commit");
    }
  }

  /** Deletes one commit, after the server accepted it. */
  async remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void> {
    throw_if_aborted(signal);
    const database = await this.open(signal);
    const transaction = database.transaction(this.store_name, "readwrite");
    transaction.objectStore(this.store_name).delete([documentId, clientMutationId]);
    try {
      await transaction_done(transaction, signal);
    } catch (error) {
      throw storage_error(error, "Unable to remove acknowledged Sheetwrite commit");
    }
  }

  async replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void> {
    throw_if_aborted(signal);
    if (
      commits.some((commit) => commit.documentId !== documentId) ||
      new Set(commits.map((commit) => commit.clientMutationId)).size !== commits.length
    ) {
      throw new IndexedDbPendingCommitStorageError(
        "transaction",
        "Replacement commits must be unique and belong to the target document",
      );
    }

    for (const commit of commits) assert_version_operation_counts(commit);
    const database = await this.open(signal);
    const transaction = database.transaction([this.store_name, this.meta_store_name], "readwrite");
    const store = transaction.objectStore(this.store_name);
    const meta_store = transaction.objectStore(this.meta_store_name);
    const range = IDBKeyRange.bound([documentId, 0], [documentId, Number.MAX_SAFE_INTEGER]);
    const request = store.index("by-document-sequence").openCursor(range);
    const completion = transaction_done(transaction, signal);
    const current_ids: string[] = [];
    const prepared = Promise.withResolvers<void>();
    request.onerror = () =>
      prepared.reject(storage_error(request.error, "Unable to inspect pending queue"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        current_ids.push((cursor.value as StoredPendingCommit).clientMutationId);
        cursor.continue();
        return;
      }

      try {
        if (
          current_ids.length !== expectedClientMutationIds.length ||
          current_ids.some((id, index) => id !== expectedClientMutationIds[index])
        ) {
          throw new IndexedDbPendingCommitStorageError(
            "conflict",
            "Pending queue changed before atomic replacement",
          );
        }

        for (const id of current_ids) store.delete([documentId, id]);
        for (let index = 0; index < commits.length; index++) {
          const commit = commits[index]!;
          store.put({
            queueSchemaVersion: RECORD_SCHEMA_VERSION,
            sequence: index + 1,
            documentId,
            baseVersion: commit.baseVersion,
            clientMutationId: commit.clientMutationId,
            operations: cloneJsonValue(commit.operations),
            ...stored_optional_fields(commit),
          } satisfies StoredPendingCommit);
        }

        meta_store.put({
          documentId,
          nextSequence: commits.length + 1,
        } satisfies QueueMeta);

        prepared.resolve();
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have failed.
        }

        prepared.reject(error);
      }
    };

    try {
      await prepared.promise;
      await completion;
    } catch (error) {
      void completion.catch(() => {});
      throw storage_error(error, "Unable to atomically replace pending Sheetwrite commits");
    }
  }

  /** Closes the database connection; a later call opens it again. */
  close(): void {
    const attempt = this.database_attempt;
    if (!attempt) return;
    this.database_attempt = undefined;
    attempt.active = false;
    if (attempt.database) {
      attempt.database.close();
    } else if (!attempt.settled) {
      attempt.settled = true;
      attempt.reject(
        new IndexedDbPendingCommitStorageError(
          "aborted",
          `IndexedDB open for ${this.database_name} was closed`,
        ),
      );
    }
    void attempt.promise.then(
      () => undefined,
      () => undefined,
    );
  }

  private async inspect_for_legacy(
    database: IDBDatabase,
    document_id: string,
    options: PendingCommitLoadOptions,
  ): Promise<{ records: StoredPendingCommit[]; maxSequence: number }> {
    const transaction = database.transaction(this.store_name, "readonly");
    const request = transaction
      .objectStore(this.store_name)
      .index("by-document")
      .openCursor(IDBKeyRange.only(document_id));
    const completion = transaction_done(transaction, options.signal);
    const stats: LoadStats = { records: 0, operations: 0, bytes: 0 };
    const records: StoredPendingCommit[] = [];
    let max_sequence = 0;
    try {
      await walk_cursor(request, transaction, options.signal, (record) => {
        account_stored_record(record, options, stats);
        if (record.sequence === undefined || (record.queueSchemaVersion ?? 0) === 0) {
          records.push(record);
        } else {
          max_sequence = Math.max(max_sequence, record.sequence);
        }
      });
      await completion;
      return { records, maxSequence: max_sequence };
    } catch (error) {
      void completion.catch(() => {});
      throw error;
    }
  }

  private async ensure_sequence_floor(
    database: IDBDatabase,
    document_id: string,
    minimum: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const transaction = database.transaction(this.meta_store_name, "readwrite");
    const store = transaction.objectStore(this.meta_store_name);
    const current = await request_result<QueueMeta | undefined>(
      store.get(document_id),
      signal,
      transaction,
    );
    if ((current?.nextSequence ?? 1) < minimum) {
      store.put({ documentId: document_id, nextSequence: minimum } satisfies QueueMeta);
    }
    await transaction_done(transaction, signal);
  }

  private async read_ordered(
    database: IDBDatabase,
    document_id: string,
    options: PendingCommitLoadOptions,
  ): Promise<PendingCommit[]> {
    const transaction = database.transaction(this.store_name, "readonly");
    const range = IDBKeyRange.bound([document_id, 0], [document_id, Number.MAX_SAFE_INTEGER]);
    const request = transaction
      .objectStore(this.store_name)
      .index("by-document-sequence")
      .openCursor(range);
    const completion = transaction_done(transaction, options.signal);
    const stats: LoadStats = { records: 0, operations: 0, bytes: 0 };
    const records: PendingCommit[] = [];
    try {
      await walk_cursor(request, transaction, options.signal, (record) => {
        account_stored_record(record, options, stats);
        records.push({
          documentId: record.documentId,
          baseVersion: record.baseVersion,
          clientMutationId: record.clientMutationId,
          operations: record.operations,
          ...stored_optional_fields(record),
        });
      });
      await completion;
      return records;
    } catch (error) {
      void completion.catch(() => {});
      throw error;
    }
  }

  private open(signal?: AbortSignal): Promise<IDBDatabase> {
    throw_if_aborted(signal);
    if (typeof indexedDB === "undefined") {
      throw new IndexedDbPendingCommitStorageError(
        "unavailable",
        "IndexedDB is unavailable; use a host PendingCommitStorage adapter",
      );
    }

    if (this.database_attempt) return this.database_attempt.promise;

    const deferred = Promise.withResolvers<IDBDatabase>();
    const attempt: DatabaseOpenAttempt = {
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
      active: true,
      settled: false,
    };

    this.database_attempt = attempt;
    const request = indexedDB.open(this.database_name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      const store = database.objectStoreNames.contains(this.store_name)
        ? transaction.objectStore(this.store_name)
        : database.createObjectStore(this.store_name, {
            keyPath: ["documentId", "clientMutationId"],
          });

      if (!store.indexNames.contains("by-document")) {
        store.createIndex("by-document", "documentId", { unique: false });
      }

      if (!store.indexNames.contains("by-document-sequence")) {
        store.createIndex("by-document-sequence", ["documentId", "sequence"], {
          unique: false,
        });
      }

      if (!database.objectStoreNames.contains(this.meta_store_name)) {
        database.createObjectStore(this.meta_store_name, { keyPath: "documentId" });
      }
    };

    request.onblocked = () => {
      this.reject_open_attempt(
        attempt,
        new IndexedDbPendingCommitStorageError(
          "blocked",
          `IndexedDB upgrade for ${this.database_name} is blocked by another tab`,
        ),
      );
    };

    request.onerror = () => {
      this.reject_open_attempt(attempt, storage_error(request.error, "Unable to open IndexedDB"));
    };

    request.onsuccess = () => {
      const database = request.result;
      if (!attempt.active || this.database_attempt !== attempt) {
        database.close();
        return;
      }

      attempt.database = database;
      attempt.settled = true;
      database.onversionchange = () => {
        database.close();
        attempt.active = false;
        if (this.database_attempt === attempt) this.database_attempt = undefined;
      };

      attempt.resolve(database);
    };

    return attempt.promise;
  }

  private reject_open_attempt(attempt: DatabaseOpenAttempt, error: unknown): void {
    if (!attempt.active || attempt.settled) return;
    attempt.active = false;
    attempt.settled = true;
    if (this.database_attempt === attempt) this.database_attempt = undefined;
    attempt.reject(error);
  }
}

interface LoadStats {
  records: number;
  operations: number;
  bytes: number;
}

function assert_load_options(options: PendingCommitLoadOptions): void {
  if (
    !options ||
    !Number.isSafeInteger(options.maxRecords) ||
    options.maxRecords < 0 ||
    !Number.isSafeInteger(options.maxOperations) ||
    options.maxOperations < 0 ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes < 0
  ) {
    throw new IndexedDbPendingCommitStorageError(
      "invalid-limits",
      "Pending commit load limits must be nonnegative safe integers",
    );
  }
}

function account_stored_record(
  value: unknown,
  options: PendingCommitLoadOptions,
  stats: LoadStats,
): asserts value is StoredPendingCommit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IndexedDbPendingCommitStorageError("transaction", "Pending queue record is invalid");
  }

  const record = value as StoredPendingCommit;
  const version = record.queueSchemaVersion ?? 0;
  if (version > RECORD_SCHEMA_VERSION) {
    throw new IndexedDbPendingCommitStorageError(
      "unsupported-schema",
      `Pending queue record schema ${version} is newer than ${RECORD_SCHEMA_VERSION}`,
    );
  }

  if (!Array.isArray(record.operations)) {
    throw new IndexedDbPendingCommitStorageError(
      "transaction",
      "Pending queue record operations are invalid",
    );
  }

  assert_version_operation_counts(record);
  if (stats.records + 1 > options.maxRecords) {
    throw new IndexedDbPendingCommitStorageError(
      "limit",
      `Pending queue exceeds the ${options.maxRecords} record limit`,
    );
  }

  if (stats.operations + record.operations.length > options.maxOperations) {
    throw new IndexedDbPendingCommitStorageError(
      "limit",
      `Pending queue exceeds the ${options.maxOperations} operation limit`,
    );
  }

  let bytes: number;
  try {
    bytes = boundedJsonByteLength(record.operations, options.maxBytes - stats.bytes);
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
      throw new IndexedDbPendingCommitStorageError(
        "limit",
        `Pending queue exceeds the ${options.maxBytes} byte limit`,
        { cause: error },
      );
    }

    throw new IndexedDbPendingCommitStorageError(
      "transaction",
      "Pending queue record is not JSON-safe",
      { cause: error },
    );
  }

  stats.records += 1;
  stats.operations += record.operations.length;
  stats.bytes += bytes;
}

async function walk_cursor(
  request: IDBRequest<IDBCursorWithValue | null>,
  transaction: IDBTransaction,
  signal: AbortSignal | undefined,
  visit: (value: unknown) => void,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let settled = false;
  const cleanup = () => signal?.removeEventListener("abort", abort);
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      transaction.abort();
    } catch {
      // A completed transaction does not need cancellation.
    }

    reject(error);
  };

  const abort = () =>
    fail(
      new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
        cause: signal?.reason,
      }),
    );
  if (signal?.aborted) {
    abort();
    return promise;
  }

  signal?.addEventListener("abort", abort, { once: true });
  request.onerror = () => fail(storage_error(request.error, "IndexedDB cursor failed"));
  request.onsuccess = () => {
    if (settled) return;
    const cursor = request.result;
    if (!cursor) {
      settled = true;
      cleanup();
      resolve();
      return;
    }

    try {
      visit(cursor.value);
      cursor.continue();
    } catch (error) {
      fail(error);
    }
  };

  return promise;
}

function request_result<T>(
  request: IDBRequest<T>,
  signal: AbortSignal | undefined,
  transaction: IDBTransaction,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete; the signal still wins.
      }
      reject(
        new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
          cause: signal?.reason,
        }),
      );
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    request.onsuccess = () => {
      signal?.removeEventListener("abort", abort);
      resolve(request.result);
    };
    request.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(storage_error(request.error, "IndexedDB request failed"));
    };
  });
}

function transaction_done(transaction: IDBTransaction, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete; the signal still wins.
      }
      reject(
        new IndexedDbPendingCommitStorageError("aborted", "IndexedDB transaction was aborted", {
          cause: signal?.reason,
        }),
      );
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    transaction.oncomplete = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(storage_error(transaction.error, "IndexedDB transaction failed"));
    };
  });
}

function throw_if_aborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
      cause: signal.reason,
    });
  }
}

function storage_error(error: unknown, message: string): IndexedDbPendingCommitStorageError {
  if (error instanceof IndexedDbPendingCommitStorageError) return error;
  const name = error instanceof DOMException ? error.name : "";
  const code: IndexedDbPendingCommitStorageErrorCode =
    name === "QuotaExceededError" ? "quota" : name === "AbortError" ? "aborted" : "transaction";
  return new IndexedDbPendingCommitStorageError(code, message, { cause: error });
}
