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
function storageFailure(failure: unknown): unknown {
  if (failure instanceof DOMException && failure.name === "QuotaExceededError") {
    return new HistoryError("capacity", "IndexedDB history storage quota is exhausted", {
      cause: failure,
    });
  }

  return failure;
}

function openDatabase(
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
function documentRange(documentId: string): IDBKeyRange {
  return IDBKeyRange.bound([documentId, ""], [documentId, KEY_END]);
}

function indexMetadata(record: HistoryStoredRecord): HistoryRecordMetadata {
  return {
    id: record.id,
    kind: record.kind,
    encodedBytes: record.bytes.length,
    decodedBytes: record.decodedBytes,
  };
}

function checkIndexMetadata(
  value: unknown,
  kind: HistoryStoredRecord["kind"],
): HistoryRecordMetadata {
  if (!object(value)) {
    throw new HistoryError("integrity", "Invalid history record index");
  }

  const { id, encodedBytes, decodedBytes } = value;
  if (!validId(id) || value.kind !== kind || !integer(encodedBytes) || !integer(decodedBytes)) {
    throw new HistoryError("integrity", "Invalid history record index");
  }

  return { id, kind, encodedBytes, decodedBytes };
}

/**
 * Browser history storage. Import it from `@sheetwrite/core/browser/history`.
 * Each call opens the database, runs one readwrite transaction over every
 * store, and closes the connection, so publication and reference counts are
 * atomic across restarts and tabs.
 */
export class IndexedDbHistoryStorage extends AtomicHistoryStorage {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;

  constructor(options: IndexedDbHistoryStorageOptions = {}) {
    super();

    this.databaseName = options.databaseName ?? DEFAULT_DATABASE;
    this.factory = options.indexedDB;
  }

  protected async transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new HistoryError("unavailable", "IndexedDB history storage is not available");
    }

    const database = await openDatabase(factory, this.databaseName, request.signal);
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
        throw storageFailure(cause);
      }

      await completion.promise;
      checkAbort(request.signal);

      if (failure !== undefined) {
        throw storageFailure(failure);
      }

      return output;
    } finally {
      request.signal?.removeEventListener("abort", abort);
      database.close();
    }
  }

  private operations(transaction: IDBTransaction, documentId: string): HistoryStorageTransaction {
    const manifests = transaction.objectStore(MANIFESTS);
    const records = transaction.objectStore(RECORDS);
    const recordIndex = transaction.objectStore(RECORD_INDEX);
    const versions = transaction.objectStore(VERSIONS);
    const pins = transaction.objectStore(PINS);

    const key = (id: string): [string, string] => [documentId, id];
    const indexKey = (record: HistoryStoredRecord): [string, string, string] => [
      documentId,
      record.kind,
      record.id,
    ];

    return {
      manifest: async () => {
        const stored = await result<HistoryManifest | undefined>(manifests.get(documentId));

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
        await result(manifests.put(manifest, documentId));
      },

      record: async (id) => result<StoredHistoryRecord | undefined>(records.get(key(id))),

      saveRecord: async (stored) => {
        await result(records.put(stored, key(stored.record.id)));
        await result(recordIndex.put(indexMetadata(stored.record), indexKey(stored.record)));
      },

      deleteRecord: async (id) => {
        const stored = await result<StoredHistoryRecord | undefined>(records.get(key(id)));
        if (!stored) {
          return;
        }

        await result(records.delete(key(id)));
        await result(recordIndex.delete(indexKey(stored.record)));
      },

      recordPage: async (kind, afterId, count) => {
        // Lower bound open on `afterId`, so the page starts after the cursor record.
        const range = IDBKeyRange.bound(
          [documentId, kind, afterId],
          [documentId, kind, KEY_END],
          true,
        );
        const values = await result<unknown[]>(recordIndex.getAll(range, count));

        return values.map((value) => checkIndexMetadata(value, kind));
      },

      versions: async () => result<HistoryVersion[]>(versions.getAll(documentRange(documentId))),

      saveVersion: async (version) => {
        await result(versions.put(version, key(version.id)));
      },

      deleteVersion: async (id) => {
        await result(versions.delete(key(id)));
      },

      pins: async () => result<HistoryReaderPin[]>(pins.getAll(documentRange(documentId))),

      savePin: async (pin) => {
        await result(pins.put(pin, key(pin.token)));
      },

      deletePin: async (token) => {
        await result(pins.delete(key(token)));
      },
    };
  }
}
