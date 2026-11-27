import { validVersionOperationCounts } from "./atomic-batch.js";
import {
  type SnapshotResourceLimits,
  SnapshotValidationError,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
import { SheetwriteError } from "./errors.js";
import { GridImpl } from "./grid.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./json-bytes.js";
import { cloneJsonValue } from "./plain-data.js";
import { SheetwriteStore } from "./store.js";
import { DEFAULT_SYNC_COORDINATOR_LIMITS } from "./sync-protocol.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import type { Grid, GridOptions } from "./types/grid.js";
import type {
  CommitJournal,
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
  /** Records each commit as part of it; present only when the host attached history. */
  journal?: CommitJournal;
  /** Time of the last commit; commit times never go back. */
  lastCommitAt: number;
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

/** Typed failure of grid restore from a saved snapshot and of `MemoryPersistenceAdapter`. */
export class PersistenceError extends SheetwriteError {
  /** Always `"PersistenceError"`. */
  override readonly name = "PersistenceError";
  /** Why persistence failed, such as `"not-found"` or `"invalid-snapshot"`. */
  declare readonly code: PersistenceErrorCode;

  /** Creates the error; `options.cause` keeps the underlying failure. */
  constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(code, "persistence", message, { cause: options?.cause });
  }
}

/**
 * Mount a grid over a validated, non-dirty snapshot. The grid owns and disposes
 * the hydrated store just like one created through `createGrid`.
 *
 * @param host - Element the grid renders into. The grid fills it and follows its
 *   size, so give it a height.
 * @param snapshot - A saved `WorkbookSnapshot`, as `Grid.exportSnapshot` or
 *   `fromXlsxWorkbook` returns it. It is validated first; an invalid one throws
 *   a `PersistenceError` with code `invalid-snapshot`.
 * @param options - Grid options other than `workbook` and `data`, and resource
 *   limits for this load that replace the defaults.
 */
export function createGridFromSnapshot(
  host: HTMLElement,
  snapshot: unknown,
  options: SnapshotGridOptions = {},
): Grid {
  const { snapshotResourceLimits: snapshot_resource_limits, ...grid_options } = options;
  let store: SheetwriteStore;
  try {
    store = SheetwriteStore.fromSnapshot(snapshot, {
      storage: grid_options.datasourceStorage?.mode ?? "dense",
      chunkRows: grid_options.datasourceStorage?.chunkRows,
      cacheBytes: grid_options.datasourceStorage?.cacheBytes,
      dirtyCellLimit: grid_options.datasourceStorage?.dirtyCellLimit,
      protectionResolver: grid_options.protectionResolver,
      mutationPolicy: grid_options.mutationPolicy,
      snapshotResourceLimits: snapshot_resource_limits,
      transactionResourceLimits: grid_options.transactionResourceLimits,
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
    return new GridImpl(host, { ...grid_options, workbook: store.getWorkbook() }, store, true);
  } catch (error) {
    store.dispose();
    if (
      (error instanceof SheetwriteError && error.code === "resource-limit") ||
      error instanceof RangeError
    ) {
      throw new PersistenceError("resource-limit", error.message, { cause: error });
    }
    throw error;
  }
}

/** Executable database-neutral reference adapter for tests, demos, and local workflows. */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly documents = new Map<string, MemoryDocument>();
  /** Commits run one at a time, so a journal write cannot interleave with another commit. */
  private commit_tail: Promise<unknown> = Promise.resolve();

  /**
   * Starts with one document per snapshot. Each needs a `documentId`; an
   * invalid one throws a `PersistenceError` with code `invalid-snapshot`.
   */
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
      const initial = cloneJsonValue({ ...checked.value, version });
      this.documents.set(checked.value.documentId, {
        initial,
        store: undefined,
        version,
        initialVersion: version,
        log: [],
        applied: new Map(),
        lastCommitAt: 0,
      });
    }
  }

  /** Returns a copy of the document at its latest version; an unknown ID throws `not-found`. */
  async load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    throw_if_aborted(signal);
    const document = this.documents.get(documentId);
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);
    await Promise.resolve();
    throw_if_aborted(signal);
    return current_snapshot(document);
  }

  /**
   * Record every later commit of `documentId` in `journal`, as part of the
   * commit: if the journal rejects, the commit is not applied, published or
   * acknowledged, and the client keeps it pending. While a journal is
   * attached, a commit without `authorId` is rejected. The journal must
   * already describe the current version, for example a `HistoryArchive`
   * initialized with the loaded snapshot.
   */
  recordHistory(documentId: string, journal: CommitJournal): void {
    const document = this.documents.get(documentId);
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);

    document.journal = journal;
  }

  /** Applies the commit at the next version, or answers `duplicate` or `conflict`. */
  async commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return this.commit_versions(request, [request.operations]);
  }

  /**
   * Validate every member version against the default sync limits, apply the
   * members in order to the document's store, and publish all of them only
   * when every member applied. A failure rebuilds the committed store state.
   */
  async commitBatch(request: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    return this.commit_versions(request, split_batch_versions(request));
  }

  private commit_versions(
    request: PersistenceCommitRequest,
    versions: readonly (readonly DocumentOp[])[],
  ): Promise<PersistenceCommitResponse> {
    const run = this.commit_tail.then(() => this.commit_in_order(request, versions));

    // The caller receives the outcome through `run`; the tail only orders the next commit.
    this.commit_tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private async commit_in_order(
    request: PersistenceCommitRequest,
    versions: readonly (readonly DocumentOp[])[],
  ): Promise<PersistenceCommitResponse> {
    throw_if_aborted(request.signal);
    const document = this.documents.get(request.documentId);
    if (!document) {
      throw new PersistenceError("not-found", `Unknown document: ${request.documentId}`);
    }
    const applied_version = document.applied.get(request.clientMutationId);
    if (applied_version !== undefined) {
      return {
        status: "duplicate",
        version: applied_version,
        clientMutationId: request.clientMutationId,
      };
    }
    if (request.baseVersion !== document.version) {
      const operations_since_base =
        request.baseVersion >= document.initialVersion
          ? document.log.filter((entry) => entry.version > request.baseVersion)
          : undefined;
      return {
        status: "conflict",
        currentVersion: document.version,
        ...(operations_since_base &&
        operations_since_base.length === document.version - request.baseVersion
          ? { operationsSinceBase: cloneJsonValue(operations_since_base) }
          : { snapshot: current_snapshot(document) }),
      };
    }

    const journal = document.journal;
    if (journal && request.authorId === undefined) {
      throw new PersistenceError(
        "commit-rejected",
        "Recorded history needs the author of each commit",
      );
    }

    const committed_at = Math.max(Date.now(), document.lastCommitAt);
    const version = document.version + versions.length;

    // Everything that can fail runs before the store changes or inside the
    // rollback-protected block, so a failed commit changes nothing.
    const entries: VersionedOperation[] = versions.map((operations, index) => ({
      version: document.version + index + 1,
      operations: cloneJsonValue(operations),
      clientMutationId: request.clientMutationId,
      ...(versions.length > 1 ? { batch: { index, count: versions.length } } : {}),
      ...(request.authorId !== undefined ? { authorId: request.authorId } : {}),
      ...(journal ? { committedAt: committed_at } : {}),
    }));
    // Built before the rollback-protected block: a failed build changes nothing.
    document.store ??= SheetwriteStore.fromSnapshot(document.initial);
    const store = document.store;
    try {
      for (const entry of entries) {
        // The store keeps references to some operation payloads, so it gets the
        // adapter's own copy, never the caller's (possibly frozen) objects.
        const outcome = store.applyTransaction(
          { patches: cloneJsonValue(entry.operations.slice()) },
          { source: "remote", commitReason: "api" },
        );
        if (
          outcome.status === "conflict" ||
          outcome.status === "rejected" ||
          (outcome.status === "noop" && entry.operations.length > 0)
        ) {
          throw new PersistenceError("commit-rejected", "Persistence commit was rejected");
        }
      }
      throw_if_aborted(request.signal);

      // Last step that can fail: once the journal holds the commit, it is published.
      if (journal && request.authorId !== undefined) {
        await journal.record(
          {
            baseRevision: document.version,
            revision: version,
            mutationId: request.clientMutationId,
            authorId: request.authorId,
            time: committed_at,
            operations: versions.flat(),
            ...(request.restore !== undefined ? { restore: { ...request.restore } } : {}),
          },
          () => ({ ...store.exportSnapshot(), version }),
        );
      }
    } catch (error) {
      // A rejected transaction leaves the store unchanged, but an earlier
      // member of a batch, an abort, or an unexpected failure may not. Rebuild
      // the last committed state so a failed commit changes nothing.
      restore_committed_store(document);
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(
        "commit-rejected",
        "Persistence commit could not be applied or recorded",
        { cause: error },
      );
    }

    document.applied.set(request.clientMutationId, version);
    document.log.push(...entries);
    document.version = version;
    document.lastCommitAt = committed_at;

    return {
      status: "applied",
      version,
      clientMutationId: request.clientMutationId,
    };
  }
}

function current_snapshot(document: MemoryDocument): WorkbookSnapshot {
  if (!document.store) return cloneJsonValue({ ...document.initial, version: document.version });
  return { ...document.store.exportSnapshot(), version: document.version };
}

/**
 * Replace the live store with the committed state: the initial snapshot plus
 * the log. With nothing committed the document returns to its initial,
 * store-free state, so loads match an adapter that never committed.
 */
function restore_committed_store(document: MemoryDocument): void {
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
function split_batch_versions(request: PersistenceBatchCommitRequest): DocumentOp[][] {
  const limits = DEFAULT_SYNC_COORDINATOR_LIMITS;
  const counts = request.versionOperationCounts;
  const reject = (message: string): never => {
    throw new PersistenceError("commit-rejected", `Atomic batch was rejected: ${message}`);
  };
  if (!validVersionOperationCounts(counts, request.operations.length, limits.maxBatchVersions)) {
    reject(
      `its version counts must split the operations into 2 to ${limits.maxBatchVersions} versions`,
    );
  }

  const versions: DocumentOp[][] = [];
  let start = 0;
  let batch_bytes = 0;
  for (const count of counts) {
    if (count > limits.maxOperationsPerVersion) {
      reject(`a version needs 1 to ${limits.maxOperationsPerVersion} operations`);
    }
    const operations = request.operations.slice(start, start + count);
    start += count;
    try {
      batch_bytes += boundedJsonByteLength(operations, limits.maxVersionPayloadBytes);
    } catch (error) {
      if (!(error instanceof JsonByteLengthError)) throw error;
      reject(
        error.code === "payload-limit"
          ? `a version exceeds ${limits.maxVersionPayloadBytes} bytes`
          : "its operations are not JSON",
      );
    }
    versions.push(operations);
  }
  if (batch_bytes > limits.maxBatchBytes) reject(`it exceeds ${limits.maxBatchBytes} bytes`);
  return versions;
}

function throw_if_aborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PersistenceError("aborted", "Persistence operation aborted", {
      cause: signal.reason,
    });
  }
}
