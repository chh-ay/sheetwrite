import { checkAbort, HistoryError, integer, object, validId } from "./version-history/codec.js";
import {
  AtomicHistoryStorage,
  type HistoryReaderPin,
  type HistoryStorageTransaction,
  type StoredHistoryRecord,
} from "./version-history/storage.js";
import type {
  HistoryManifest,
  HistoryRecordMetadata,
  HistoryStorageRequest,
  HistoryStoredRecord,
  HistoryVersion,
} from "./version-history/types.js";

const DATABASE_VERSION = 1;
const DEFAULT_DATABASE = "sheetwrite-history";

/**
 * Object stores. Rows are keyed `[documentId, id]`, so one key range reads one
 * document. `record-index` holds record metadata keyed `[documentId, kind, id]`,
 * so a listing of one kind reads only that kind, in ID order, without payloads.
 */
const MANIFESTS = "manifest";
const RECORDS = "records";
const RECORD_INDEX = "record-index";
const VERSIONS = "versions";
const PINS = "pins";
const STORE_NAMES = [MANIFESTS, RECORDS, RECORD_INDEX, VERSIONS, PINS];

/** Upper bound for the string part of a key range; IDs and tokens are lower code points. */
const KEY_END = "\uffff";

/** Database selection for a host-owned browser history archive. */
export interface IndexedDbHistoryStorageOptions {
  /** Database name; defaults to `sheetwrite-history`. */
  databaseName?: string;
  /** IndexedDB factory; defaults to `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();

  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(request.error ?? new HistoryError("transaction", "IndexedDB history request failed"));

  return promise;
}

/** A browser can report exhausted quota from a request or from the transaction abort. */
function storage_failure(failure: unknown): unknown {
  if (failure instanceof DOMException && failure.name === "QuotaExceededError") {
    return new HistoryError("capacity", "IndexedDB history storage quota is exhausted", {
      cause: failure,
    });
  }

  return failure;
}

function open_database(
  factory: IDBFactory,
  name: string,
  signal?: AbortSignal,
): Promise<IDBDatabase> {
  checkAbort(signal);

  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = factory.open(name, DATABASE_VERSION);
  let settled = false;

  const abort = () => {
    settled = true;
    reject(signal?.reason);
  };

  const fail = (failure: unknown) => {
    settled = true;
    signal?.removeEventListener("abort", abort);
    reject(failure);
  };

  signal?.addEventListener("abort", abort, { once: true });

  request.onupgradeneeded = () => {
    if (settled || signal?.aborted) {
      request.transaction?.abort();
      return;
    }

    for (const store of STORE_NAMES) {
      if (!request.result.objectStoreNames.contains(store)) {
        request.result.createObjectStore(store);
      }
    }
  };

  request.onblocked = () => fail(new HistoryError("blocked", "IndexedDB history open is blocked"));

  request.onerror = () =>
    fail(
      new HistoryError("transaction", "Unable to open IndexedDB history", { cause: request.error }),
    );

  request.onsuccess = () => {
    signal?.removeEventListener("abort", abort);

    // A late success after an abort or a failure must not leak the connection.
    if (settled || signal?.aborted) {
      request.result.close();
      return;
    }

    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };

  return promise;
}

/** Every key `[documentId, *]` of one document. */
function document_range(document_id: string): IDBKeyRange {
  return IDBKeyRange.bound([document_id, ""], [document_id, KEY_END]);
}

function index_metadata(record: HistoryStoredRecord): HistoryRecordMetadata {
  return {
    id: record.id,
    kind: record.kind,
    encodedBytes: record.bytes.length,
    decodedBytes: record.decodedBytes,
  };
}

function check_index_metadata(
  value: unknown,
  kind: HistoryStoredRecord["kind"],
): HistoryRecordMetadata {
  if (!object(value)) {
    throw new HistoryError("integrity", "Invalid history record index");
  }

  const { id, encodedBytes: encoded_bytes, decodedBytes: decoded_bytes } = value;
  if (!validId(id) || value.kind !== kind || !integer(encoded_bytes) || !integer(decoded_bytes)) {
    throw new HistoryError("integrity", "Invalid history record index");
  }

  return { id, kind, encodedBytes: encoded_bytes, decodedBytes: decoded_bytes };
}

/**
 * Browser history storage. Import it from `@sheetwrite/core/browser/history`.
 * Each call opens the database, runs one readwrite transaction over every
 * store, and closes the connection, so publication and reference counts are
 * atomic across restarts and tabs.
 */
export class IndexedDbHistoryStorage extends AtomicHistoryStorage {
  private readonly database_name: string;
  private readonly factory: IDBFactory | undefined;

  /** Creates the storage; each call opens the database, so nothing opens yet. */
  constructor(options: IndexedDbHistoryStorageOptions = {}) {
    super();

    this.database_name = options.databaseName ?? DEFAULT_DATABASE;
    this.factory = options.indexedDB;
  }

  /** Runs `action` in one atomic transaction over the stored archive; a failure leaves it unchanged. */
  protected async transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new HistoryError("unavailable", "IndexedDB history storage is not available");
    }

    const database = await open_database(factory, this.database_name, request.signal);
    const transaction = database.transaction(STORE_NAMES, "readwrite");

    const completion = Promise.withResolvers<void>();
    let failure: unknown;

    transaction.oncomplete = () => completion.resolve();

    transaction.onabort = () => {
      failure ??=
        transaction.error ??
        new HistoryError("transaction", "IndexedDB history transaction aborted");
      completion.resolve();
    };

    transaction.onerror = () => {
      failure ??=
        transaction.error ??
        new HistoryError("transaction", "IndexedDB history transaction failed");
    };

    const abort = () => {
      failure = request.signal?.reason;
      transaction.abort();
    };

    request.signal?.addEventListener("abort", abort, { once: true });

    try {
      checkAbort(request.signal);

      let output: T;
      try {
        output = await action(this.operations(transaction, request.documentId));
      } catch (cause) {
        failure = cause;
        transaction.abort();
        await completion.promise;
        throw storage_failure(cause);
      }

      await completion.promise;
      checkAbort(request.signal);

      if (failure !== undefined) {
        throw storage_failure(failure);
      }

      return output;
    } finally {
      request.signal?.removeEventListener("abort", abort);
      database.close();
    }
  }

  private operations(transaction: IDBTransaction, document_id: string): HistoryStorageTransaction {
    const manifests = transaction.objectStore(MANIFESTS);
    const records = transaction.objectStore(RECORDS);
    const record_index = transaction.objectStore(RECORD_INDEX);
    const versions = transaction.objectStore(VERSIONS);
    const pins = transaction.objectStore(PINS);

    const key = (id: string): [string, string] => [document_id, id];
    const index_key = (record: HistoryStoredRecord): [string, string, string] => [
      document_id,
      record.kind,
      record.id,
    ];

    return {
      manifest: async () => {
        const stored = await result<HistoryManifest | undefined>(manifests.get(document_id));

        return (
          stored ?? {
            generation: 0,
            encodedBytes: 0,
            recordCount: 0,
            versionCount: 0,
            namedVersionCount: 0,
          }
        );
      },

      saveManifest: async (manifest) => {
        await result(manifests.put(manifest, document_id));
      },

      record: async (id) => result<StoredHistoryRecord | undefined>(records.get(key(id))),

      saveRecord: async (stored) => {
        await result(records.put(stored, key(stored.record.id)));
        await result(record_index.put(index_metadata(stored.record), index_key(stored.record)));
      },

      deleteRecord: async (id) => {
        const stored = await result<StoredHistoryRecord | undefined>(records.get(key(id)));
        if (!stored) {
          return;
        }

        await result(records.delete(key(id)));
        await result(record_index.delete(index_key(stored.record)));
      },

      recordPage: async (kind, after_id, count) => {
        // Lower bound open on `after_id`, so the page starts after the cursor record.
        const range = IDBKeyRange.bound(
          [document_id, kind, after_id],
          [document_id, kind, KEY_END],
          true,
        );
        const values = await result<unknown[]>(record_index.getAll(range, count));

        return values.map((value) => check_index_metadata(value, kind));
      },

      versions: async () => result<HistoryVersion[]>(versions.getAll(document_range(document_id))),

      saveVersion: async (version) => {
        await result(versions.put(version, key(version.id)));
      },

      deleteVersion: async (id) => {
        await result(versions.delete(key(id)));
      },

      pins: async () => result<HistoryReaderPin[]>(pins.getAll(document_range(document_id))),

      savePin: async (pin) => {
        await result(pins.put(pin, key(pin.token)));
      },

      deletePin: async (token) => {
        await result(pins.delete(key(token)));
      },
    };
  }
}
