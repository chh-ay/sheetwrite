import { MAX_ATOMIC_BATCH_VERSIONS } from "./atomic-batch.js";
import {
  type CheckedSnapshot,
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateDocumentOperationShape,
} from "./document-protocol.js";
import { buildOnEngineInstance, prepareEngineInstance } from "./engine.js";
import { commitRestore } from "./restore-commit.js";
import { SheetwriteStore } from "./store.js";
import { forgetLiveStoreEngine } from "./store/engine-registry.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type {
  ApplyTransactionResult,
  CommittedTransaction,
  RestoreProvenance,
} from "./types/transaction.js";
import {
  type CheckpointLog,
  type HistoryRecordReader,
  readCheckpoint,
  readCheckpointLog,
  writeCheckpoint,
} from "./version-history/checkpoint.js";
import {
  checkAbort,
  decodeBytes,
  decodeRecord,
  encodeBytes,
  encodeRecord,
  HistoryError,
  historyJsonSize,
  integer,
  jsonBytes,
  object,
  resolveHistoryLimits,
  strings,
} from "./version-history/codec.js";
import {
  diffPageSize,
  diffStores,
  type HistoryDiffPage,
  type HistoryDiffRequest,
} from "./version-history/diff.js";
import {
  type RebuiltVersion,
  RebuiltVersionCache,
  rebuiltKey,
} from "./version-history/rebuilt-cache.js";
import {
  assertIdle,
  type HistoryRestoreOptions,
  type HistoryRestoreScope,
  planRestore,
} from "./version-history/restore.js";
import type {
  HistoryArchiveOptions,
  HistoryHead,
  HistoryLimits,
  HistoryListPage,
  HistoryManifest,
  HistorySnapshotProvider,
  HistoryStorageAdapter,
  HistoryStorageUsage,
  HistoryStoredRecord,
  HistoryVersion,
} from "./version-history/types.js";

export { DEFAULT_HISTORY_LIMITS, HistoryError } from "./version-history/codec.js";
export type { HistoryErrorCode } from "./version-history/codec.js";
export {
  HISTORY_DIFF_NONE,
  HistoryDiffFlag,
  MAX_HISTORY_DIFF_ENTRIES,
} from "./version-history/diff.js";
export type {
  HistoryDiffCell,
  HistoryDiffCells,
  HistoryDiffCursor,
  HistoryDiffDetail,
  HistoryDiffPage,
  HistoryDiffRequest,
  HistoryDiffSheet,
} from "./version-history/diff.js";
export type { HistoryRestoreOptions, HistoryRestoreScope } from "./version-history/restore.js";
export { historyAddon } from "./version-history/history-ui.js";
export type { HistoryAddonOptions, HistoryPanelArchive } from "./version-history/panel-contract.js";
export { MemoryHistoryStorage } from "./version-history/storage.js";
export type { AtomicHistoryStorage, HistoryStorageTransaction } from "./version-history/storage.js";
export type {
  HistoryArchiveOptions,
  HistoryGetRequest,
  HistoryHead,
  HistoryLimits,
  HistoryListPage,
  HistoryListRequest,
  HistoryManifest,
  HistoryPinRequest,
  HistoryPruneRequest,
  HistoryPublishRequest,
  HistoryPutRequest,
  HistoryRecordMetadata,
  HistorySnapshotProvider,
  HistoryStorageAdapter,
  HistoryStorageRequest,
  HistoryStorageUsage,
  HistoryStoredRecord,
  HistoryVersion,
} from "./version-history/types.js";

/** Operations in one archived transaction: the largest atomic batch the document accepts. */
const MAX_OPERATIONS =
  DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations * MAX_ATOMIC_BATCH_VERSIONS;

/** Clean page cache of the paged replay store. */
const REPLAY_WINDOW_BYTES = 4 * 1024 * 1024;

/**
 * Encoded operation bytes applied as one replay transaction: the default
 * per-transaction ceiling, so a batch costs no more working memory than one
 * ordinary edit. A larger archived transaction is applied alone.
 */
const REPLAY_BATCH_BYTES = DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes;

/** Working-set bytes per encoded operation byte: the JSON bytes, the string and the parsed operations. */
const TRANSACTION_RESERVATION_MULTIPLIER = 4;

/** UTF-8 code units in a document ID, mutation ID or author ID. */
const MAX_ID_LENGTH = 256;

interface ListVersionsOptions {
  maxEntries?: number;
  maxBytes?: number;
  cursor?: string;
  signal?: AbortSignal;
}

interface PruneOptions {
  beforeTime?: number;
  targetBytes?: number;
  signal?: AbortSignal;
}

function isOperation(value: unknown): value is DocumentOp {
  return validateDocumentOperationShape(value).length === 0;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function restoreValue(value: unknown): RestoreProvenance | undefined {
  if (!object(value)) {
    return undefined;
  }

  const { versionId, scope } = value;
  const validScope = scope === "workbook" || scope === "sheet" || scope === "range";

  return validId(versionId) && validScope ? { versionId, scope } : undefined;
}

/**
 * Validate one committed transaction that follows `baseRevision`, and return
 * its encoded operation bytes. A transaction spans at most one atomic batch.
 */
function checkCommit(
  commit: CommittedTransaction,
  baseRevision: number,
  notBefore: number,
  limits: Readonly<HistoryLimits>,
): number {
  const validRevision =
    commit.baseRevision === baseRevision &&
    integer(commit.revision) &&
    commit.revision > commit.baseRevision &&
    commit.revision - commit.baseRevision <= MAX_ATOMIC_BATCH_VERSIONS;

  const valid =
    validRevision &&
    integer(commit.time) &&
    commit.time >= notBefore &&
    validId(commit.mutationId) &&
    validId(commit.authorId) &&
    Array.isArray(commit.operations) &&
    commit.operations.length > 0 &&
    commit.operations.length <= MAX_OPERATIONS &&
    commit.operations.every(isOperation) &&
    (commit.restore === undefined || restoreValue(commit.restore) !== undefined);

  if (!valid) {
    throw new HistoryError(
      "invalid-history",
      "History requires a contiguous, authored committed transaction",
    );
  }

  const bytes = historyJsonSize(commit.operations, limits.maxTransactionBytes);
  if (bytes * TRANSACTION_RESERVATION_MULTIPLIER > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "History transaction exceeds its working-set reservation");
  }

  return bytes;
}

/**
 * Encode one transaction as segments of at most `maxSegmentBytes` plus one
 * envelope with its author and revision. The envelope is the last record.
 */
async function writeCommit(
  commit: CommittedTransaction,
  limits: Readonly<HistoryLimits>,
): Promise<HistoryStoredRecord[]> {
  const payload = jsonBytes(commit.operations, limits.maxTransactionBytes);

  const records: HistoryStoredRecord[] = [];
  const segments: string[] = [];
  for (let at = 0; at < payload.length; at += limits.maxSegmentBytes) {
    const segment = await encodeBytes("segment", payload.subarray(at, at + limits.maxSegmentBytes));

    records.push(segment);
    segments.push(segment.id);
  }

  const envelope = await encodeRecord(
    "transaction",
    {
      baseRevision: commit.baseRevision,
      revision: commit.revision,
      mutationId: commit.mutationId,
      authorId: commit.authorId,
      time: commit.time,
      operationBytes: payload.length,
      segments,
      ...(commit.restore !== undefined ? { restore: commit.restore } : {}),
    },
    [...new Set(segments)],
  );
  records.push(envelope);

  return records;
}

/** Join and parse the segments of one transaction; replay sees only a complete transaction. */
async function readCommit(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<CommittedTransaction> {
  const record = await read(id);
  const envelope = await decodeRecord(record, limits);
  if (record.kind !== "transaction" || !object(envelope)) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }

  const { baseRevision, revision, mutationId, authorId, time, operationBytes, segments } = envelope;
  const restore = restoreValue(envelope.restore);
  const maxSegments = Math.ceil(limits.maxTransactionBytes / limits.maxSegmentBytes);
  const valid =
    integer(baseRevision) &&
    integer(revision) &&
    typeof mutationId === "string" &&
    typeof authorId === "string" &&
    integer(time) &&
    integer(operationBytes) &&
    operationBytes <= limits.maxTransactionBytes &&
    strings(segments) &&
    segments.length <= maxSegments &&
    (envelope.restore === undefined || restore !== undefined);

  if (!valid) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }

  const reservation = operationBytes * TRANSACTION_RESERVATION_MULTIPLIER + REPLAY_WINDOW_BYTES;
  if (reservation > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "Archived transaction exceeds its replay reservation");
  }

  const payload = new Uint8Array(operationBytes);
  let offset = 0;
  for (const segmentId of segments) {
    if (!record.references.includes(segmentId)) {
      throw new HistoryError("integrity", "Transaction references an unowned log segment");
    }

    const segment = await read(segmentId);
    if (segment.kind !== "segment") {
      throw new HistoryError("integrity", "Expected an archived operation segment");
    }

    const bytes = await decodeBytes(segment, limits);
    if (offset + bytes.length > payload.length) {
      throw new HistoryError("integrity", "Archived transaction exceeds its declared size");
    }

    payload.set(bytes, offset);
    offset += bytes.length;
  }

  if (offset !== payload.length) {
    throw new HistoryError("integrity", "Archived transaction is incomplete");
  }

  let operations: unknown;
  try {
    operations = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch (cause) {
    throw new HistoryError("integrity", "Invalid archived operation JSON", { cause });
  }

  if (!Array.isArray(operations) || !operations.every(isOperation)) {
    throw new HistoryError("integrity", "Invalid archived document operations");
  }

  return {
    baseRevision,
    revision,
    mutationId,
    authorId,
    time,
    operations,
    ...(restore !== undefined ? { restore } : {}),
  };
}

function manifestResponse(
  value: HistoryManifest | HistoryVersion | HistoryStoredRecord,
): HistoryManifest {
  if (!("generation" in value)) {
    throw new HistoryError("integrity", "History adapter returned an invalid manifest");
  }

  return value;
}

function versionResponse(
  value: HistoryManifest | HistoryVersion | HistoryStoredRecord,
): HistoryVersion {
  if (
    !("checkpoint" in value) ||
    !("kind" in value) ||
    !["named", "automatic"].includes(value.kind)
  ) {
    throw new HistoryError("integrity", "History adapter returned an invalid version");
  }

  return value;
}

/**
 * Dense storage when the historical workbook fits the dense-cell ceiling that
 * documents use: in the eight-hour history bench a dense store replays the log
 * more than ten times faster than a paged one. Larger sparse sheets use paged
 * storage.
 */
function replayStorage(snapshot: WorkbookSnapshot): "dense" | "paged" {
  let logicalCells = 0;
  for (const sheet of snapshot.sheets) {
    logicalCells += sheet.rowCount * sheet.columns.length;
  }

  return logicalCells <= DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells ? "dense" : "paged";
}

function applyBatch(store: SheetwriteStore, operations: DocumentOp[]): void {
  if (operations.length === 0) {
    return;
  }

  const outcome = store.applyTransaction({ patches: operations }, { source: "remote" });
  const complete =
    outcome.status === "applied" &&
    outcome.transaction.patches.length === operations.length &&
    !outcome.rejections?.length;

  if (!complete) {
    throw new HistoryError("integrity", "Archived transaction could not be replayed completely");
  }
}

/**
 * Build a replay store in its own engine instance and apply `tail`. The
 * private instance holds all replay memory, so the document engine keeps its
 * size; `free` on the result releases both, and a failure releases them before
 * it rejects.
 *
 * Consecutive transactions are applied as one store transaction of at most
 * `REPLAY_BATCH_BYTES`: operations apply in order inside a transaction, so the
 * result is the same, and the store recalculates once per batch instead of
 * once per archived transaction.
 */
async function rebuildVersion(
  checkpoint: CheckedSnapshot,
  tail: readonly string[],
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
  signal: AbortSignal | undefined,
): Promise<RebuiltVersion> {
  const instance = await prepareEngineInstance();

  let store: SheetwriteStore;
  try {
    store = buildOnEngineInstance(instance, () =>
      SheetwriteStore.fromSnapshot(checkpoint, {
        storage: replayStorage(checkpoint.snapshot),
        cacheBytes: REPLAY_WINDOW_BYTES,
        transactionResourceLimits: {
          maxOperations: MAX_OPERATIONS,
          maxEncodedBytes: limits.maxTransactionBytes,
        },
      }),
    );
  } catch (error) {
    instance.retire();
    throw error;
  }

  // Engine memory release moves live stores into a new document instance; the
  // replay store stays in its private instance.
  forgetLiveStoreEngine(store);
  const free = () => {
    store.dispose();
    instance.retire();
  };

  let replayed = false;
  try {
    let revision = checkpoint.snapshot.version ?? 0;
    let batch: DocumentOp[] = [];
    let batchBytes = 0;

    for (const transactionId of tail) {
      const commit = await readCommit(transactionId, read, limits);
      const bytes = checkCommit(commit, revision, 0, limits);

      const full =
        batch.length + commit.operations.length > MAX_OPERATIONS ||
        batchBytes + bytes > REPLAY_BATCH_BYTES;

      if (full) {
        applyBatch(store, batch);
        batch = [];
        batchBytes = 0;
      }

      for (const operation of commit.operations) {
        batch.push(operation);
      }

      batchBytes += bytes;
      revision = commit.revision;
      checkAbort(signal);
    }

    applyBatch(store, batch);
    replayed = true;

    return { store, revision, free };
  } finally {
    if (!replayed) {
      free();
    }
  }
}

/**
 * Transactions from the checkpoint at or before `revision` up to `later`, by
 * following `later`'s checkpoint back through each checkpoint's `previous`
 * link. `complete` is `false` when a checkpoint on the way was pruned.
 */
async function intervalLog(
  later: HistoryVersion,
  revision: number,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<{ transactions: string[]; complete: boolean }> {
  const parts: Array<readonly string[]> = [later.tail];
  let checkpoint: string | undefined = later.checkpoint;

  while (checkpoint !== undefined) {
    let log: CheckpointLog;
    try {
      log = await readCheckpointLog(checkpoint, read, limits);
    } catch (error) {
      if (error instanceof HistoryError && error.code === "not-found") {
        return { transactions: parts.reverse().flat(), complete: false };
      }

      throw error;
    }

    if (log.revision <= revision) {
      return { transactions: parts.reverse().flat(), complete: true };
    }

    parts.push(log.transactions);
    checkpoint = log.previous;
  }

  return { transactions: parts.reverse().flat(), complete: false };
}

/** Read `transactions` one at a time and yield those after `revision`. */
async function* commitsAfter(
  transactions: readonly string[],
  revision: number,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): AsyncGenerator<CommittedTransaction> {
  for (const id of transactions) {
    const commit = await readCommit(id, read, limits);
    if (commit.revision > revision) {
      yield commit;
    }
  }
}

/**
 * Opt-in archive of named and automatic versions for one document. It stores
 * content-addressed checkpoints plus the committed transactions since each
 * one, through a host `HistoryStorageAdapter`. A grid that never imports this
 * module has no history state.
 *
 * Calls that change the archive run one at a time. Each publishes atomically,
 * so a failure or abort leaves the last durable version readable.
 */
export class HistoryArchive {
  private readonly storage: HistoryStorageAdapter;
  private readonly documentId: string;
  private readonly limits: Readonly<HistoryLimits>;
  private manifest: HistoryManifest;
  private lock = Promise.resolve();
  private readonly rebuilt = new RebuiltVersionCache();

  /** Private: use `HistoryArchive.open`. */
  private constructor(
    options: HistoryArchiveOptions,
    limits: Readonly<HistoryLimits>,
    manifest: HistoryManifest,
  ) {
    this.storage = options.storage;
    this.documentId = options.documentId;
    this.limits = limits;
    this.manifest = manifest;
  }

  /** Open an archive by reading its manifest only; no workbook is loaded. */
  static async open(options: HistoryArchiveOptions, signal?: AbortSignal): Promise<HistoryArchive> {
    if (!validId(options.documentId)) {
      throw new HistoryError("invalid-history", "History requires a bounded document ID");
    }

    const limits = resolveHistoryLimits(options.limits);
    const response = await options.storage.get({
      kind: "manifest",
      documentId: options.documentId,
      limits,
      signal,
    });

    return new HistoryArchive(options, limits, manifestResponse(response));
  }

  private request(signal?: AbortSignal) {
    return { documentId: this.documentId, limits: this.limits, signal };
  }

  private async serialized<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    const gate = Promise.withResolvers<void>();
    this.lock = gate.promise;
    await previous;

    try {
      return await action();
    } finally {
      gate.resolve();
    }
  }

  private async publish(
    records: readonly HistoryStoredRecord[],
    head: HistoryHead | undefined,
    version: HistoryVersion | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    this.manifest = await this.storage.put({
      ...this.request(signal),
      kind: "publish",
      expectedGeneration: this.manifest.generation,
      records,
      head,
      version,
    });

    if (head) {
      this.rebuilt.releaseHead();
    }
  }

  /** Store the first checkpoint: a complete, committed snapshot of the document at `time`. */
  async initialize(snapshot: WorkbookSnapshot, time: number, signal?: AbortSignal): Promise<void> {
    return this.serialized(async () => {
      checkAbort(signal);

      if (this.manifest.head || !integer(time)) {
        throw new HistoryError(
          "invalid-history",
          "History baseline already exists or has an invalid time",
        );
      }

      const revision = snapshot.version ?? 0;
      const checkpoint = await writeCheckpoint(snapshot, this.documentId, revision, this.limits);
      const head: HistoryHead = {
        revision,
        checkpoint: checkpoint.checkpoint,
        tail: [],
        checkpoints: [],
        time,
        activeMs: 0,
        automaticAt: 0,
        checkpointAt: 0,
        checkpointTransactions: 0,
        checkpointLogBytes: 0,
      };

      await this.publish(checkpoint.records, head, undefined, signal);
    });
  }

  /**
   * Append one committed transaction. `capture` runs only when a checkpoint is
   * due and must return the committed document at `commit.revision`. An
   * automatic version is made after `automaticIntervalMs` of active time.
   */
  async record(
    commit: CommittedTransaction,
    capture?: HistorySnapshotProvider,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.serialized(async () => {
      checkAbort(signal);

      const current = this.manifest.head;
      if (!current) {
        throw new HistoryError("invalid-history", "History baseline is required before recording");
      }

      const encodedBytes = checkCommit(commit, current.revision, current.time, this.limits);
      const records = await writeCommit(commit, this.limits);
      const envelope = records[records.length - 1];
      if (!envelope) {
        throw new HistoryError("integrity", "Archived transaction envelope is missing");
      }

      // Idle time counts as at most one automatic interval, so a pause makes one version.
      const idle = Math.min(commit.time - current.time, this.limits.automaticIntervalMs);
      const activeMs = current.activeMs + idle;

      let head: HistoryHead = {
        ...current,
        revision: commit.revision,
        time: commit.time,
        tail: [...current.tail, envelope.id],
        activeMs,
        checkpointTransactions: current.checkpointTransactions + 1,
        checkpointLogBytes: current.checkpointLogBytes + encodedBytes,
      };

      const checkpointDue =
        activeMs - current.checkpointAt >= this.limits.checkpointIntervalMs ||
        head.checkpointTransactions >= this.limits.checkpointTransactions ||
        head.checkpointLogBytes >= this.limits.checkpointLogBytes;

      let publication = records;
      if (checkpointDue) {
        if (!capture) {
          throw new HistoryError(
            "invalid-history",
            "A committed snapshot provider is required when a checkpoint is due",
          );
        }

        const snapshot = await capture();
        checkAbort(signal);

        const checkpoint = await writeCheckpoint(
          snapshot,
          this.documentId,
          commit.revision,
          this.limits,
          head.tail,
          current.checkpoint,
        );

        publication = [...records, ...checkpoint.records];
        head = {
          ...head,
          checkpoint: checkpoint.checkpoint,
          tail: [],
          checkpoints: [...head.checkpoints, checkpoint.checkpoint],
          checkpointAt: activeMs,
          checkpointTransactions: 0,
          checkpointLogBytes: 0,
        };
      }

      let version: HistoryVersion | undefined;
      if (activeMs - current.automaticAt >= this.limits.automaticIntervalMs) {
        version = await this.version(head, "automatic", commit.authorId, commit.time);
        head = { ...head, automaticAt: activeMs, checkpoints: [] };
      }

      await this.publish(publication, head, version, signal);
    });
  }

  /** A marker whose ID is the content ID of its fields, so a retry publishes the same marker. */
  private async version(
    head: HistoryHead,
    kind: HistoryVersion["kind"],
    authorId: string,
    time: number,
    name?: string,
  ): Promise<HistoryVersion> {
    const content = {
      revision: head.revision,
      kind,
      authorId,
      time,
      checkpoint: head.checkpoint,
      tail: [...head.tail],
      checkpoints: [...head.checkpoints],
      ...(name === undefined ? {} : { name }),
    };

    const encoded = await encodeRecord("metadata", content);

    return { ...content, id: encoded.id };
  }

  /** Name the archived head. The host flushes pending edits first, so the name covers them. */
  async saveVersion(
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ): Promise<HistoryVersion> {
    return this.serialized(async () => {
      checkAbort(signal);

      const head = this.manifest.head;
      if (!head) {
        throw new HistoryError(
          "invalid-history",
          "History baseline is required before naming a version",
        );
      }

      const version = await this.version(head, "named", authorId, time, name.trim());

      // The marker takes over the checkpoints since the previous one.
      const next = head.checkpoints.length > 0 ? { ...head, checkpoints: [] } : undefined;
      await this.publish([], next, version, signal);

      return version;
    });
  }

  /** One bounded page of version metadata, newest first. */
  async listVersions(options: ListVersionsOptions = {}): Promise<HistoryListPage> {
    return this.storage.list({
      ...this.request(options.signal),
      maxEntries: options.maxEntries ?? this.limits.maxPageEntries,
      maxBytes: options.maxBytes ?? this.limits.maxPageBytes,
      cursor: options.cursor,
    });
  }

  /**
   * Rebuild the document of one version. A reader lease keeps its records
   * alive while a concurrent prune runs; the lease is released on every exit.
   * The archive keeps the rebuilt version for the calls that follow, until
   * `releaseMemory`.
   */
  async readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return this.withPinnedVersion(id, signal, async (version, read) => {
      const rebuilt =
        version.tail.length === 0
          ? (await this.checkpointOf(version, read)).snapshot
          : await this.withRebuiltVersion(version, read, signal, true, ({ store, revision }) => ({
              ...store.exportSnapshot(),
              version: revision,
            }));

      if (rebuilt.version !== version.revision) {
        throw new HistoryError("integrity", "History log does not reach its version marker");
      }

      return rebuilt;
    });
  }

  /**
   * Restore one version, or one sheet or range of it, on `grid` as one undoable
   * transaction. The version is rebuilt in a private engine instance, or taken
   * from the last `readVersion` or restore, and compared with the grid's
   * current document; the difference is committed as one atomic restore, which
   * `SyncCoordinator` sends as one transaction that is never rebased.
   *
   * With `options.sync`, the coordinator must be online with no pending or
   * conflicted commits. A change to the grid while the version is read, or a
   * scope that cuts a merged cell or hyperlink, rejects before anything changes.
   * See the restore section of the persistence guide for what each scope covers.
   */
  async restoreVersion(
    grid: Grid,
    id: string,
    scope: HistoryRestoreScope,
    options: HistoryRestoreOptions = {},
  ): Promise<ApplyTransactionResult> {
    assertIdle(options.sync);

    let changed = false;
    const stop = grid.on("change", () => {
      changed = true;
    });

    try {
      return await this.withPinnedVersion(id, options.signal, (version, read) =>
        this.withRebuiltVersion(version, read, options.signal, true, ({ store, revision }) => {
          if (revision !== version.revision) {
            throw new HistoryError("integrity", "History log does not reach its version marker");
          }

          if (changed) {
            throw new HistoryError("conflict", "The document changed while the version was read");
          }

          assertIdle(options.sync);

          const plan = planRestore(grid.store, store, scope);

          const outcome = commitRestore(grid, plan.operations, plan.guards, {
            versionId: id,
            scope: scope.kind,
          });

          if (!outcome) {
            throw new HistoryError(
              "capacity",
              "A restored cell block does not fit one server version",
            );
          }

          return outcome;
        }),
      );
    } finally {
      stop();
    }
  }

  /**
   * One page of the difference between two retained versions: the cells that
   * changed, with before and after and who wrote them; sheets added, removed
   * or changed outside their cells; and workbook fields that changed.
   *
   * Both versions are rebuilt in private engine instances, or taken from the
   * last `readVersion` or restore, and compared in bounded windows by the
   * history diff kernel, a separate WASM module that loads on the first diff.
   * Rows and columns are aligned through the structural operations of the log,
   * so an inserted row does not make the rows below it changed. A diff keeps
   * nothing between pages: pass `cursor` to continue, and each page rebuilds
   * the versions that the archive does not keep.
   */
  async diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage> {
    diffPageSize(request);
    const { signal } = request;

    return this.withPinnedVersion(request.from, signal, (earlier, readEarlier) =>
      this.withPinnedVersion(request.to, signal, async (later, read) => {
        if (later.revision < earlier.revision) {
          throw new HistoryError("invalid-scope", "The later version precedes the earlier one");
        }

        const log = await intervalLog(later, earlier.revision, read, this.limits);
        const commits = commitsAfter(log.transactions, earlier.revision, read, this.limits);

        return this.withRebuiltVersion(earlier, readEarlier, signal, false, (before) =>
          this.withRebuiltVersion(later, read, signal, false, (after) =>
            diffStores({
              before: before.store,
              after: after.store,
              commits,
              logComplete: log.complete,
              request,
            }),
          ),
        );
      }),
    );
  }

  /**
   * Free the version that the archive keeps rebuilt between calls. The
   * version history panel calls it when it closes and when its grid trims
   * memory. A call that still uses the version frees it when it returns.
   */
  releaseMemory(): void {
    this.rebuilt.release();
  }

  /**
   * Run `action` on the rebuilt document of a leased version: the kept one
   * when it matches, else a new rebuild. With `keep`, a new rebuild replaces
   * the kept version.
   */
  private withRebuiltVersion<T>(
    version: HistoryVersion,
    read: HistoryRecordReader,
    signal: AbortSignal | undefined,
    keep: boolean,
    action: (rebuilt: RebuiltVersion) => T | Promise<T>,
  ): Promise<T> {
    return this.rebuilt.use(
      rebuiltKey(version.id, version.revision, version.checkpoint),
      keep,
      async () =>
        rebuildVersion(
          await this.checkpointOf(version, read),
          version.tail,
          read,
          this.limits,
          signal,
        ),
      action,
    );
  }

  /** Read a leased version's checkpoint and check that it belongs to this document. */
  private async checkpointOf(
    version: HistoryVersion,
    read: HistoryRecordReader,
  ): Promise<CheckedSnapshot> {
    const checkpoint = await readCheckpoint(version.checkpoint, read, this.limits);
    if (checkpoint.snapshot.documentId !== this.documentId) {
      throw new HistoryError("integrity", "History checkpoint belongs to another document");
    }

    return checkpoint;
  }

  /** Lease one version and pass it and a leased record reader to `use`. */
  private async withPinnedVersion<T>(
    id: string,
    signal: AbortSignal | undefined,
    use: (version: HistoryVersion, read: HistoryRecordReader) => Promise<T>,
  ): Promise<T> {
    checkAbort(signal);

    const token = crypto.randomUUID();
    const leased = await this.storage.put({
      ...this.request(signal),
      kind: "pin",
      token,
      versionId: id,
    });

    try {
      // The current document is leased by the same storage transaction that reads its head.
      const head = id === "head" ? manifestResponse(leased).head : undefined;
      const version: HistoryVersion = head
        ? { ...head, id, kind: "automatic", authorId: "" }
        : versionResponse(await this.storage.get({ ...this.request(signal), kind: "version", id }));

      const maxReadBytes = this.limits.maxSnapshotBytes + this.limits.maxTransactionBytes;
      let readBytes = 0;

      const read = async (recordId: string): Promise<HistoryStoredRecord> => {
        checkAbort(signal);

        const stored = await this.storage.get({
          ...this.request(signal),
          kind: "record",
          id: recordId,
          maxBytes: this.limits.maxSnapshotBytes,
          pin: token,
        });

        if (!("bytes" in stored)) {
          throw new HistoryError("integrity", "History adapter returned an invalid record");
        }

        readBytes += stored.decodedBytes;
        if (readBytes > maxReadBytes) {
          throw new HistoryError("capacity", "History replay exceeds its input reservation");
        }

        return stored;
      };

      return await use(version, read);
    } finally {
      await this.storage.put({ ...this.request(), kind: "release", token, versionId: id });
    }
  }

  /** Retained bytes and counts, read from the manifest without fetching any payload. */
  async storageUsage(signal?: AbortSignal): Promise<HistoryStorageUsage> {
    const response = await this.storage.get({ ...this.request(signal), kind: "manifest" });
    const manifest = manifestResponse(response);

    return {
      encodedBytes: manifest.encodedBytes,
      recordCount: manifest.recordCount,
      versionCount: manifest.versionCount,
      namedVersionCount: manifest.namedVersionCount,
    };
  }

  /**
   * Remove automatic versions made at or before `beforeTime` (default: the age
   * ceiling) and, oldest first, while the archive is above `targetBytes`.
   * Named versions and every record they need stay.
   */
  async prune(options: PruneOptions = {}): Promise<void> {
    return this.serialized(async () => {
      const ageCeiling = (this.manifest.head?.time ?? 0) - this.limits.maxAgeMs;

      this.manifest = await this.storage.prune({
        ...this.request(options.signal),
        expectedGeneration: this.manifest.generation,
        beforeTime: options.beforeTime ?? ageCeiling,
        targetBytes: options.targetBytes,
      });
      // A removed version can no longer be leased, so its rebuild would never be used.
      this.rebuilt.release();
    });
  }

  /** Delete one version. Records it shares with other versions stay. */
  async deleteVersion(id: string, signal?: AbortSignal): Promise<void> {
    return this.serialized(async () => {
      this.manifest = await this.storage.prune({
        ...this.request(signal),
        expectedGeneration: this.manifest.generation,
        beforeTime: -1,
        deleteVersionId: id,
      });
      this.rebuilt.release();
    });
  }
}
