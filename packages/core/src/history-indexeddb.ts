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

const STORE_NAMES = ["manifest", "records", "record-index", "versions", "pins"];

/** Database selection for a host-owned browser history archive. */
export interface IndexedDbHistoryStorageOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(request.error ?? new HistoryError("transaction", "IndexedDB history request failed"));
  return promise;
}

function openDatabase(
  factory: IDBFactory,
  name: string,
  signal?: AbortSignal,
): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  checkAbort(signal);
  const request = factory.open(name, 1);
  let settled = false;
  const abort = () => {
    settled = true;
    reject(signal?.reason);
  };
  signal?.addEventListener("abort", abort, { once: true });
  const fail = (failure: unknown) => {
    settled = true;
    signal?.removeEventListener("abort", abort);
    reject(failure);
  };
  request.onupgradeneeded = () => {
    if (settled || signal?.aborted) {
      request.transaction?.abort();
      return;
    }
    for (const store of STORE_NAMES) {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    }
  };
  request.onblocked = () => fail(new HistoryError("blocked", "IndexedDB history open is blocked"));
  request.onerror = () =>
    fail(
      new HistoryError("transaction", "Unable to open IndexedDB history", { cause: request.error }),
    );
  request.onsuccess = () => {
    signal?.removeEventListener("abort", abort);
    if (settled || signal?.aborted) {
      request.result.close();
      return;
    }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  return promise;
}

function scan<T>(store: IDBObjectStore, documentId: string): Promise<T[]> {
  const { promise, resolve, reject } = Promise.withResolvers<T[]>();
  const values: T[] = [];
  const request: IDBRequest<IDBCursorWithValue | null> = store.openCursor();
  request.onerror = () =>
    reject(request.error ?? new HistoryError("transaction", "Unable to read history metadata"));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      resolve(values);
      return;
    }
    const key = cursor.key;
    if (Array.isArray(key) && key[0] === documentId) values.push(cursor.value);
    cursor.continue();
  };
  return promise;
}

function recordPage(
  store: IDBObjectStore,
  documentId: string,
  kind: HistoryStoredRecord["kind"],
  afterId: string,
  count: number,
): Promise<HistoryRecordMetadata[]> {
  const { promise, resolve, reject } = Promise.withResolvers<HistoryRecordMetadata[]>();
  const page: HistoryRecordMetadata[] = [];
  const request = store.openCursor();
  request.onerror = () =>
    reject(request.error ?? new HistoryError("transaction", "Unable to list history records"));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor || page.length === count) {
      resolve(page);
      return;
    }
    const key = cursor.key;
    if (
      Array.isArray(key) &&
      key[0] === documentId &&
      typeof key[1] === "string" &&
      key[1] > afterId
    ) {
      const metadata: unknown = cursor.value;
      if (
        !object(metadata) ||
        !validId(metadata.id) ||
        typeof metadata.kind !== "string" ||
        !integer(metadata.encodedBytes) ||
        !integer(metadata.decodedBytes)
      ) {
        reject(new HistoryError("integrity", "Invalid history record index"));
        return;
      }
      if (metadata.kind === kind)
        page.push({
          id: metadata.id,
          kind,
          encodedBytes: metadata.encodedBytes,
          decodedBytes: metadata.decodedBytes,
        });
    }
    cursor.continue();
  };
  return promise;
}

/** Browser-only history storage with atomic publication and restart-safe reference counts. */
export class IndexedDbHistoryStorage extends AtomicHistoryStorage {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;

  constructor(options: IndexedDbHistoryStorageOptions = {}) {
    super();
    this.databaseName = options.databaseName ?? "sheetwrite-history";
    this.factory = options.indexedDB;
  }

  protected async transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory)
      throw new HistoryError("unavailable", "IndexedDB history storage is not available");
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
    const key = (id: string): [string, string] => [request.documentId, id];
    const manifests = transaction.objectStore("manifest");
    const records = transaction.objectStore("records");
    const recordIndex = transaction.objectStore("record-index");
    const versions = transaction.objectStore("versions");
    const pins = transaction.objectStore("pins");
    const operations: HistoryStorageTransaction = {
      manifest: async () => {
        const stored = await result<HistoryManifest | undefined>(manifests.get(request.documentId));
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
        await result(manifests.put(manifest, request.documentId));
      },
      record: async (id) => result<StoredHistoryRecord | undefined>(records.get(key(id))),
      saveRecord: async (stored) => {
        await result(records.put(stored, key(stored.record.id)));
        await result(
          recordIndex.put(
            {
              id: stored.record.id,
              kind: stored.record.kind,
              encodedBytes: stored.record.bytes.length,
              decodedBytes: stored.record.decodedBytes,
            } satisfies HistoryRecordMetadata,
            key(stored.record.id),
          ),
        );
      },
      deleteRecord: async (id) => {
        await result(records.delete(key(id)));
        await result(recordIndex.delete(key(id)));
      },
      recordPage: async (kind, afterId, count) =>
        recordPage(recordIndex, request.documentId, kind, afterId, count),
      versions: async () => scan<HistoryVersion>(versions, request.documentId),
      saveVersion: async (version) => {
        await result(versions.put(version, key(version.id)));
      },
      deleteVersion: async (id) => {
        await result(versions.delete(key(id)));
      },
      pins: async () => scan<HistoryReaderPin>(pins, request.documentId),
      savePin: async (pin) => {
        await result(pins.put(pin, key(pin.token)));
      },
      deletePin: async (token) => {
        await result(pins.delete(key(token)));
      },
    };
    try {
      checkAbort(request.signal);
      let output: T;
      try {
        output = await action(operations);
      } catch (cause) {
        failure = cause;
        transaction.abort();
        await completion.promise;
        throw cause;
      }
      await completion.promise;
      checkAbort(request.signal);
      if (failure !== undefined) {
        if (failure instanceof DOMException && failure.name === "QuotaExceededError") {
          throw new HistoryError("capacity", "IndexedDB history storage quota is exhausted", {
            cause: failure,
          });
        }
        throw failure;
      }
      return output;
    } finally {
      request.signal?.removeEventListener("abort", abort);
      database.close();
    }
  }
}
