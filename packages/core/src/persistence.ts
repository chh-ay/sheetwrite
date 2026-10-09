import {
  SnapshotResourceError,
  type SnapshotResourceLimits,
  SnapshotValidationError,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
import { boundedJsonByteLength, JsonByteLengthError, SheetwriteError } from "./errors.js";
import { GridImpl } from "./grid.js";
import { SheetwriteStore } from "./store.js";
import { DEFAULT_SYNC_COORDINATOR_LIMITS } from "./sync.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import type { Grid, GridOptions } from "./types/grid.js";
import type {
  PersistenceAdapter,
  PersistenceBatchCommitRequest,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  VersionedOperation,
} from "./types/transaction.js";

/**
 * One sequenced document. Commits apply to a live store, so a one-cell commit
 * costs one transaction instead of rebuilding and re-exporting the workbook.
 * The store is built on the first commit, so constructing the adapter and
 * loading an uncommitted document do not need the engine to be initialized.
 * Snapshots are exported on demand; every export is a fresh, caller-owned copy.
 */
interface MemoryDocument {
  readonly initial: WorkbookSnapshot;
  store: SheetwriteStore | undefined;
  version: number;
  initialVersion: number;
  log: VersionedOperation[];
  applied: Map<string, number>;
}

/** Grid creation options accepted when hydrating a validated snapshot. */
export type SnapshotGridOptions = Omit<GridOptions, "workbook" | "data"> & {
  /** Overrides canonical validation/allocation ceilings for this snapshot load. */
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
};

/** Stable category for a persistence failure. */
export type PersistenceErrorCode =
  | "aborted"
  | "invalid-snapshot"
  | "resource-limit"
  | "not-found"
  | "commit-rejected";

/** Typed failure raised by persistence and synchronization flows. */
export class PersistenceError extends SheetwriteError {
  override readonly name = "PersistenceError";

  constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(code, "persistence", message, { cause: options?.cause });
  }
}

/**
 * Mount a grid over a validated, non-dirty snapshot. The grid owns and disposes
 * the hydrated store just like one created through `createGrid`.
 */
export function createGridFromSnapshot(
  host: HTMLElement,
  snapshot: unknown,
  options: SnapshotGridOptions = {},
): Grid {
  const { snapshotResourceLimits, ...gridOptions } = options;
  let store: SheetwriteStore;
  try {
    store = SheetwriteStore.fromSnapshot(snapshot, {
      storage: gridOptions.datasourceStorage?.mode ?? "dense",
      chunkRows: gridOptions.datasourceStorage?.chunkRows,
      cacheBytes: gridOptions.datasourceStorage?.cacheBytes,
      dirtyCellLimit: gridOptions.datasourceStorage?.dirtyCellLimit,
      protectionResolver: gridOptions.protectionResolver,
      mutationPolicy: gridOptions.mutationPolicy,
      snapshotResourceLimits,
      transactionResourceLimits: gridOptions.transactionResourceLimits,
    });
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      const code = error.errors.some((issue) => issue.code === "resource-limit")
        ? "resource-limit"
        : "invalid-snapshot";
      throw new PersistenceError(code, error.message, { cause: error });
    }
    throw error;
  }

  try {
    return new GridImpl(host, { ...gridOptions, workbook: store.getWorkbook() }, store, true);
  } catch (error) {
    store.dispose();
    if (error instanceof SnapshotResourceError || error instanceof RangeError) {
      throw new PersistenceError("resource-limit", error.message, { cause: error });
    }
    throw error;
  }
}

/** Executable database-neutral reference adapter for tests, demos, and local workflows. */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly documents = new Map<string, MemoryDocument>();

  constructor(...snapshots: readonly WorkbookSnapshot[]) {
    for (const snapshot of snapshots) {
      const checked = validateWorkbookSnapshot(snapshot);
      if (!checked.ok) {
        const cause = new SnapshotValidationError(checked.errors);
        throw new PersistenceError("invalid-snapshot", cause.message, { cause });
      }
      if (!checked.value.documentId) {
        throw new PersistenceError("invalid-snapshot", "Memory snapshots require documentId");
      }
      const version = checked.value.version ?? 0;
      const initial = cloneSnapshot({ ...checked.value, version });
      this.documents.set(checked.value.documentId, {
        initial,
        store: undefined,
        version,
        initialVersion: version,
        log: [],
        applied: new Map(),
      });
    }
  }

  async load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    throwIfAborted(signal);
    const document = this.documents.get(documentId);
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);
    await Promise.resolve();
    throwIfAborted(signal);
    return currentSnapshot(document);
  }

  async commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return this.commitVersions(request, [request.operations]);
  }

  /**
   * Validate every member version against the default sync limits, apply the
   * members in order to one scratch store, and publish all of them only when
   * every member applied.
   */
  async commitBatch(request: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    return this.commitVersions(request, splitBatchVersions(request));
  }

  private async commitVersions(
    request: PersistenceCommitRequest,
    versions: readonly (readonly DocumentOp[])[],
  ): Promise<PersistenceCommitResponse> {
    throwIfAborted(request.signal);
    const document = this.documents.get(request.documentId);
    if (!document) {
      throw new PersistenceError("not-found", `Unknown document: ${request.documentId}`);
    }
    const appliedVersion = document.applied.get(request.clientMutationId);
    if (appliedVersion !== undefined) {
      return {
        status: "duplicate",
        version: appliedVersion,
        clientMutationId: request.clientMutationId,
      };
    }
    if (request.baseVersion !== document.version) {
      const operationsSinceBase =
        request.baseVersion >= document.initialVersion
          ? document.log.filter((entry) => entry.version > request.baseVersion)
          : undefined;
      return {
        status: "conflict",
        currentVersion: document.version,
        ...(operationsSinceBase &&
        operationsSinceBase.length === document.version - request.baseVersion
          ? { operationsSinceBase: cloneJsonValue(operationsSinceBase) }
          : { snapshot: currentSnapshot(document) }),
      };
    }

    // Everything that can fail runs before the store changes or inside the
    // rollback-protected block, so a failed commit changes nothing.
    const entries: VersionedOperation[] = versions.map((operations, index) => ({
      version: document.version + index + 1,
      operations: cloneJsonValue(operations),
      clientMutationId: request.clientMutationId,
      ...(versions.length > 1 ? { batch: { index, count: versions.length } } : {}),
    }));
    // Built before the rollback-protected block: a failed build changes nothing.
    document.store ??= SheetwriteStore.fromSnapshot(document.initial);
    const store = document.store;
    try {
      for (const operations of versions) {
        const outcome = store.applyTransaction(
          { patches: operations.slice() },
          { source: "remote", commitReason: "api" },
        );
        if (
          outcome.status === "conflict" ||
          outcome.status === "rejected" ||
          (outcome.status === "noop" && operations.length > 0)
        ) {
          throw new PersistenceError("commit-rejected", "Persistence commit was rejected");
        }
      }
      throwIfAborted(request.signal);
    } catch (error) {
      // A rejected transaction leaves the store unchanged, but an earlier
      // member of a batch, an abort, or an unexpected failure may not. Rebuild
      // the last committed state so a failed commit changes nothing.
      restoreCommittedStore(document);
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("commit-rejected", "Persistence commit could not be applied", {
        cause: error,
      });
    }
    const version = document.version + versions.length;
    document.applied.set(request.clientMutationId, version);
    document.log.push(...entries);
    document.version = version;
    return {
      status: "applied",
      version,
      clientMutationId: request.clientMutationId,
    };
  }
}

function currentSnapshot(document: MemoryDocument): WorkbookSnapshot {
  if (!document.store) return cloneSnapshot({ ...document.initial, version: document.version });
  return { ...document.store.exportSnapshot(), version: document.version };
}

/**
 * Replace the live store with the committed state: the initial snapshot plus
 * the log. With nothing committed the document returns to its initial,
 * store-free state, so loads match an adapter that never committed.
 */
function restoreCommittedStore(document: MemoryDocument): void {
  if (document.log.length === 0) {
    document.store?.dispose();
    document.store = undefined;
    return;
  }
  const store = SheetwriteStore.fromSnapshot(document.initial);
  for (const entry of document.log) {
    store.applyTransaction(
      { patches: entry.operations.slice() },
      { source: "remote", commitReason: "api" },
    );
  }
  document.store?.dispose();
  document.store = store;
}

/**
 * Split a batch request into its member versions. Each member must fit the
 * default per-version limits, and the batch must fit the default batch limits.
 */
function splitBatchVersions(request: PersistenceBatchCommitRequest): DocumentOp[][] {
  const limits = DEFAULT_SYNC_COORDINATOR_LIMITS;
  const counts = request.versionOperationCounts;
  const reject = (message: string): never => {
    throw new PersistenceError("commit-rejected", `Atomic batch was rejected: ${message}`);
  };
  if (!Array.isArray(counts) || counts.length < 2 || counts.length > limits.maxBatchVersions) {
    reject(`it needs 2 to ${limits.maxBatchVersions} versions`);
  }
  const versions: DocumentOp[][] = [];
  let start = 0;
  let batchBytes = 0;
  for (const count of counts) {
    if (!Number.isSafeInteger(count) || count <= 0 || count > limits.maxOperationsPerVersion) {
      reject(`a version needs 1 to ${limits.maxOperationsPerVersion} operations`);
    }
    const operations = request.operations.slice(start, start + count);
    start += count;
    try {
      batchBytes += boundedJsonByteLength(operations, limits.maxVersionPayloadBytes);
    } catch (error) {
      if (!(error instanceof JsonByteLengthError)) throw error;
      reject(
        error.code === "limit"
          ? `a version exceeds ${limits.maxVersionPayloadBytes} bytes`
          : "its operations are not JSON",
      );
    }
    versions.push(operations);
  }
  if (start !== request.operations.length) reject("the version counts do not cover the operations");
  if (batchBytes > limits.maxBatchBytes) reject(`it exceeds ${limits.maxBatchBytes} bytes`);
  return versions;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PersistenceError("aborted", "Persistence operation aborted", {
      cause: signal.reason,
    });
  }
}

function cloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkbookSnapshot;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
