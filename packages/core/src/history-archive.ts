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
import type { SyncCoordinator } from "./sync.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type {
  ApplyTransactionResult,
  CommittedTransaction,
  RestoreProvenance,
} from "./types/transaction.js";
import {
  type CheckpointLog,
  type CheckpointManifest,
  type HistoryRecordReader,
  readCheckpoint,
  readCheckpointCells,
  readCheckpointLog,
  readCheckpointManifest,
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
  cellIn,
  diffPageSize,
  diffStores,
  diffTracked,
  type HistoryDiffPage,
  type HistoryDiffRequest,
  trackLog,
  type Tracking,
} from "./version-history/diff.js";
import {
  addTailWrites,
  calculatedDetails,
  manifestShapes,
  selectedPages,
  selectPages,
  selectRestorePages,
  type TailWrites,
} from "./version-history/page-compare.js";
import {
  type RebuiltVersion,
  RebuiltVersionCache,
  rebuiltKey,
} from "./version-history/rebuilt-cache.js";
import {
  assertIdle,
  type HistoryRestoreOptions,
  type HistoryRestoreScope,
  planPageRestore,
  planRestore,
  type RestoreCommit,
} from "./version-history/restore.js";
import { loadRowComparer } from "./version-history/row-compare.js";
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

function is_operation(value: unknown): value is DocumentOp {
  return validateDocumentOperationShape(value).length === 0;
}

function valid_id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function restore_value(value: unknown): RestoreProvenance | undefined {
  if (!object(value)) {
    return undefined;
  }

  const { versionId: version_id, scope } = value;
  const valid_scope = scope === "workbook" || scope === "sheet" || scope === "range";

  return valid_id(version_id) && valid_scope ? { versionId: version_id, scope } : undefined;
}

/**
 * Validate one committed transaction that follows `base_revision`, and return
 * its encoded operation bytes. A transaction spans at most one atomic batch.
 */
function check_commit(
  commit: CommittedTransaction,
  base_revision: number,
  not_before: number,
  limits: Readonly<HistoryLimits>,
): number {
  const valid_revision =
    commit.baseRevision === base_revision &&
    integer(commit.revision) &&
    commit.revision > commit.baseRevision &&
    commit.revision - commit.baseRevision <= MAX_ATOMIC_BATCH_VERSIONS;

  const valid =
    valid_revision &&
    integer(commit.time) &&
    commit.time >= not_before &&
    valid_id(commit.mutationId) &&
    valid_id(commit.authorId) &&
    Array.isArray(commit.operations) &&
    commit.operations.length > 0 &&
    commit.operations.length <= MAX_OPERATIONS &&
    commit.operations.every(is_operation) &&
    (commit.restore === undefined || restore_value(commit.restore) !== undefined);

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
async function write_commit(
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
async function read_commit(
  id: string,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): Promise<CommittedTransaction> {
  const record = await read(id);
  const envelope = await decodeRecord(record, limits);
  if (record.kind !== "transaction" || !object(envelope)) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }

  const {
    baseRevision: base_revision,
    revision,
    mutationId: mutation_id,
    authorId: author_id,
    time,
    operationBytes: operation_bytes,
    segments,
  } = envelope;
  const restore = restore_value(envelope.restore);
  const max_segments = Math.ceil(limits.maxTransactionBytes / limits.maxSegmentBytes);
  const valid =
    integer(base_revision) &&
    integer(revision) &&
    typeof mutation_id === "string" &&
    typeof author_id === "string" &&
    integer(time) &&
    integer(operation_bytes) &&
    operation_bytes <= limits.maxTransactionBytes &&
    strings(segments) &&
    segments.length <= max_segments &&
    (envelope.restore === undefined || restore !== undefined);

  if (!valid) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }

  const reservation = operation_bytes * TRANSACTION_RESERVATION_MULTIPLIER + REPLAY_WINDOW_BYTES;
  if (reservation > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "Archived transaction exceeds its replay reservation");
  }

  const payload = new Uint8Array(operation_bytes);
  let offset = 0;
  for (const segment_id of segments) {
    if (!record.references.includes(segment_id)) {
      throw new HistoryError("integrity", "Transaction references an unowned log segment");
    }

    const segment = await read(segment_id);
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

  if (!Array.isArray(operations) || !operations.every(is_operation)) {
    throw new HistoryError("integrity", "Invalid archived document operations");
  }

  return {
    baseRevision: base_revision,
    revision,
    mutationId: mutation_id,
    authorId: author_id,
    time,
    operations,
    ...(restore !== undefined ? { restore } : {}),
  };
}

function manifest_response(
  value: HistoryManifest | HistoryVersion | HistoryStoredRecord,
): HistoryManifest {
  if (!("generation" in value)) {
    throw new HistoryError("integrity", "History adapter returned an invalid manifest");
  }

  return value;
}

function version_response(
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
function replay_storage(snapshot: WorkbookSnapshot): "dense" | "paged" {
  let logical_cells = 0;
  for (const sheet of snapshot.sheets) {
    logical_cells += sheet.rowCount * sheet.columns.length;
  }

  return logical_cells <= DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells ? "dense" : "paged";
}

function apply_batch(store: SheetwriteStore, operations: DocumentOp[]): void {
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
async function rebuild_version(
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
        storage: replay_storage(checkpoint.snapshot),
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
    let batch_bytes = 0;

    for (const transaction_id of tail) {
      const commit = await read_commit(transaction_id, read, limits);
      const bytes = check_commit(commit, revision, 0, limits);

      const full =
        batch.length + commit.operations.length > MAX_OPERATIONS ||
        batch_bytes + bytes > REPLAY_BATCH_BYTES;

      if (full) {
        apply_batch(store, batch);
        batch = [];
        batch_bytes = 0;
      }

      for (const operation of commit.operations) {
        batch.push(operation);
      }

      batch_bytes += bytes;
      revision = commit.revision;
      checkAbort(signal);
    }

    apply_batch(store, batch);
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
async function interval_log(
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
async function* commits_after(
  transactions: readonly string[],
  revision: number,
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
): AsyncGenerator<CommittedTransaction> {
  for (const id of transactions) {
    const commit = await read_commit(id, read, limits);
    if (commit.revision > revision) {
      yield commit;
    }
  }
}

/** A leased version and the record reader of its lease. */
interface LeasedVersion {
  version: HistoryVersion;
  read: HistoryRecordReader;
}

/** What a compare by page reads before any cell page: checkpoint manifests and tail writes. */
interface PageInputs {
  earlier: CheckpointManifest;
  later: CheckpointManifest;
  earlierWrites: TailWrites;
  laterWrites: TailWrites;
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
  private readonly document_id: string;
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
    this.document_id = options.documentId;
    this.limits = limits;
    this.manifest = manifest;
  }

  /** Open an archive by reading its manifest only; no workbook is loaded. */
  static async open(options: HistoryArchiveOptions, signal?: AbortSignal): Promise<HistoryArchive> {
    if (!valid_id(options.documentId)) {
      throw new HistoryError("invalid-history", "History requires a bounded document ID");
    }

    const limits = resolveHistoryLimits(options.limits);
    const response = await options.storage.get({
      kind: "manifest",
      documentId: options.documentId,
      limits,
      signal,
    });

    return new HistoryArchive(options, limits, manifest_response(response));
  }

  private request(signal?: AbortSignal) {
    return { documentId: this.document_id, limits: this.limits, signal };
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
      const checkpoint = await writeCheckpoint(snapshot, this.document_id, revision, this.limits);
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

      const encoded_bytes = check_commit(commit, current.revision, current.time, this.limits);
      const records = await write_commit(commit, this.limits);
      const envelope = records[records.length - 1];
      if (!envelope) {
        throw new HistoryError("integrity", "Archived transaction envelope is missing");
      }

      // Idle time counts as at most one automatic interval, so a pause makes one version.
      const idle = Math.min(commit.time - current.time, this.limits.automaticIntervalMs);
      const active_ms = current.activeMs + idle;

      let head: HistoryHead = {
        ...current,
        revision: commit.revision,
        time: commit.time,
        tail: [...current.tail, envelope.id],
        activeMs: active_ms,
        checkpointTransactions: current.checkpointTransactions + 1,
        checkpointLogBytes: current.checkpointLogBytes + encoded_bytes,
      };

      const checkpoint_due =
        active_ms - current.checkpointAt >= this.limits.checkpointIntervalMs ||
        head.checkpointTransactions >= this.limits.checkpointTransactions ||
        head.checkpointLogBytes >= this.limits.checkpointLogBytes;

      let publication = records;
      if (checkpoint_due) {
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
          this.document_id,
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
          checkpointAt: active_ms,
          checkpointTransactions: 0,
          checkpointLogBytes: 0,
        };
      }

      let version: HistoryVersion | undefined;
      if (active_ms - current.automaticAt >= this.limits.automaticIntervalMs) {
        version = await this.version(head, "automatic", commit.authorId, commit.time);
        head = { ...head, automaticAt: active_ms, checkpoints: [] };
      }

      await this.publish(publication, head, version, signal);
    });
  }

  /** A marker whose ID is the content ID of its fields, so a retry publishes the same marker. */
  private async version(
    head: HistoryHead,
    kind: HistoryVersion["kind"],
    author_id: string,
    time: number,
    name?: string,
  ): Promise<HistoryVersion> {
    const content = {
      revision: head.revision,
      kind,
      authorId: author_id,
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
    return this.with_pinned_version(id, signal, async (version, read) => {
      const rebuilt =
        version.tail.length === 0
          ? (await this.checkpoint_of(version, read)).snapshot
          : await this.with_rebuilt_version(version, read, signal, true, ({ store, revision }) => ({
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
   * conflicted commits. When its server version is the archive head, the grid
   * holds the head, so only the checkpoint pages where the version and the head
   * differ are read and written again (see `selectRestorePages`).
   *
   * A change to the grid while the version is read, or a scope that cuts a
   * merged cell or hyperlink, rejects before anything changes. See the restore
   * section of the persistence guide for what each scope covers.
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

    /** Commit a plan built from `revision`, if the grid is still as it was read. */
    const commit = (
      plan: RestoreCommit,
      version: HistoryVersion,
      revision: number,
    ): ApplyTransactionResult => {
      if (revision !== version.revision) {
        throw new HistoryError("integrity", "History log does not reach its version marker");
      }

      if (changed) {
        throw new HistoryError("conflict", "The document changed while the version was read");
      }

      assertIdle(options.sync);

      const outcome = commitRestore(grid, plan.operations, plan.guards, {
        versionId: id,
        scope: scope.kind,
      });

      if (!outcome) {
        throw new HistoryError("capacity", "A restored cell block does not fit one server version");
      }

      return outcome;
    };

    try {
      const compare_rows = await loadRowComparer(options.kernel);
      return await this.with_pinned_version(id, options.signal, async (version, read) => {
        const kept = this.rebuilt.holds(
          rebuiltKey(version.id, version.revision, version.checkpoint),
        );
        const sync = options.sync;
        if (sync && !kept) {
          const at_head = await this.restore_at_head(
            grid,
            { version, read },
            scope,
            sync,
            options.signal,
            (plan, revision) => commit(plan, version, revision),
          );
          if (at_head) {
            return at_head;
          }
        }

        return this.with_rebuilt_version(
          version,
          read,
          options.signal,
          true,
          ({ store, revision }) =>
            commit(planRestore(grid.store, store, scope, compare_rows), version, revision),
        );
      });
    } finally {
      stop();
    }
  }

  /**
   * Restore from the pages where the version and the archive head differ, when
   * the synchronized grid holds the head: its coordinator's server version is
   * the head's revision. `undefined` when the restore needs the whole version:
   * the grid is not at the head, a log tail or the scope needs more cells, or
   * too many pages differ.
   */
  private async restore_at_head(
    grid: Grid,
    leased: LeasedVersion,
    scope: HistoryRestoreScope,
    sync: SyncCoordinator,
    signal: AbortSignal | undefined,
    commit: (plan: RestoreCommit, revision: number) => ApplyTransactionResult,
  ): Promise<ApplyTransactionResult | undefined> {
    return this.with_pinned_version("head", signal, async (head, read_head) => {
      if (head.revision !== sync.state.serverVersion) {
        return undefined;
      }

      const inputs = await this.page_inputs(leased.version, leased.read, head, read_head);
      const pages =
        inputs &&
        selectRestorePages(inputs.earlier, inputs.later, inputs.earlierWrites, inputs.laterWrites);
      if (!inputs || !pages) {
        return undefined;
      }

      const sparse = await this.sparse_version(inputs.earlier, pages.read, leased, signal);
      try {
        // A server version that moved while the pages were read leaves the grid off the head.
        if (head.revision !== sync.state.serverVersion) {
          return undefined;
        }

        const plan = planPageRestore(grid.store, sparse.store, scope, pages.changed);
        return plan && commit(plan, sparse.revision);
      } finally {
        sparse.free();
      }
    });
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
   * so an inserted row does not make the rows below it changed. Only the
   * checkpoint pages that can differ are read and rebuilt (see
   * `selectPages`); the result is the same as rebuilding both versions whole.
   * A diff keeps nothing between pages: pass `cursor` to continue, and each
   * page rebuilds what it needs again.
   */
  async diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage> {
    diffPageSize(request);
    const { signal } = request;

    return this.with_pinned_version(request.from, signal, (earlier, read_earlier) =>
      this.with_pinned_version(request.to, signal, async (later, read) => {
        if (later.revision < earlier.revision) {
          throw new HistoryError("invalid-scope", "The later version precedes the earlier one");
        }

        const log = await interval_log(later, earlier.revision, read, this.limits);
        const commits = commits_after(log.transactions, earlier.revision, read, this.limits);
        const tracked = { logComplete: log.complete, request };

        const by_page = await this.page_inputs(earlier, read_earlier, later, read);
        if (!by_page) {
          return this.with_rebuilt_version(earlier, read_earlier, signal, false, (before) =>
            this.with_rebuilt_version(later, read, signal, false, (after) =>
              diffStores({ ...tracked, before: before.store, after: after.store, commits }),
            ),
          );
        }

        const state = await trackLog(
          manifestShapes(by_page.earlier),
          manifestShapes(by_page.later),
          commits,
          request,
        );
        try {
          return await this.diff_by_page(
            state,
            by_page,
            { version: earlier, read: read_earlier },
            { version: later, read },
            tracked,
          );
        } finally {
          state.kernel.free();
        }
      }),
    );
  }

  /**
   * Compare two versions under a tracked log by rebuilding only the cell pages
   * that can differ; see `selectPages`. When too many pages differ, the whole
   * versions are compared under the same log.
   */
  private async diff_by_page(
    state: Tracking,
    inputs: PageInputs,
    earlier: LeasedVersion,
    later: LeasedVersion,
    tracked: { logComplete: boolean; request: HistoryDiffRequest },
  ): Promise<HistoryDiffPage> {
    const { signal } = tracked.request;
    const selection = selectPages(
      state,
      inputs.earlier,
      inputs.later,
      inputs.earlierWrites,
      inputs.laterWrites,
    );

    if (!selection) {
      return this.with_rebuilt_version(earlier.version, earlier.read, signal, false, (before) =>
        this.with_rebuilt_version(later.version, later.read, signal, false, (after) =>
          diffTracked(state, { ...tracked, before: before.store, after: after.store }),
        ),
      );
    }

    const before = await this.sparse_version(inputs.earlier, selection.earlier, earlier, signal);
    try {
      const after = await this.sparse_version(inputs.later, selection.later, later, signal);
      try {
        const page = diffTracked(state, { ...tracked, before: before.store, after: after.store });
        await this.calculate(page, "before", before.store, earlier, signal);
        await this.calculate(page, "after", after.store, later, signal);
        return page;
      } finally {
        after.free();
      }
    } finally {
      before.free();
    }
  }

  /**
   * What a compare by page needs from two leased versions: their checkpoint
   * manifests and the cells their log tails write. `undefined` when a tail
   * holds an operation that a compare by page cannot follow; the versions are
   * then compared whole.
   */
  private async page_inputs(
    earlier: HistoryVersion,
    read_earlier: HistoryRecordReader,
    later: HistoryVersion,
    read: HistoryRecordReader,
  ): Promise<PageInputs | undefined> {
    const earlier_writes = await this.tail_writes(earlier.tail, read_earlier);
    const later_writes = earlier_writes && (await this.tail_writes(later.tail, read));
    if (!earlier_writes || !later_writes) {
      return undefined;
    }

    return {
      earlier: await this.manifest_of(earlier, read_earlier),
      later: await this.manifest_of(later, read),
      earlierWrites: earlier_writes,
      laterWrites: later_writes,
    };
  }

  /** The cells a log tail writes, or `undefined` when it holds an operation a compare by page cannot follow. */
  private async tail_writes(
    tail: readonly string[],
    read: HistoryRecordReader,
  ): Promise<TailWrites | undefined> {
    const writes: TailWrites = new Map();
    for (const id of tail) {
      const commit = await read_commit(id, read, this.limits);
      if (!addTailWrites(writes, commit.operations)) {
        return undefined;
      }
    }

    return writes;
  }

  /** Read a leased version's checkpoint manifest and check that it belongs to this document. */
  private async manifest_of(
    version: HistoryVersion,
    read: HistoryRecordReader,
  ): Promise<CheckpointManifest> {
    const manifest = await readCheckpointManifest(version.checkpoint, read, this.limits);
    if (manifest.documentId !== this.document_id) {
      throw new HistoryError("integrity", "History checkpoint belongs to another document");
    }

    return manifest;
  }

  /** Rebuild a version from only the cell pages in `pages`; other cells are empty. */
  private async sparse_version(
    manifest: CheckpointManifest,
    pages: ReadonlyArray<ReadonlySet<string>>,
    { version, read }: LeasedVersion,
    signal: AbortSignal | undefined,
  ): Promise<RebuiltVersion> {
    const checkpoint = await readCheckpointCells(manifest, read, this.limits, selectedPages(pages));

    return rebuild_version(checkpoint, version.tail, read, this.limits, signal);
  }

  /**
   * A sparse version holds the right sources and styles, but a formula or a
   * reference needs the whole version for its calculated value. Take those
   * values of the page's `side` from the whole version, kept or rebuilt.
   */
  private async calculate(
    page: HistoryDiffPage,
    side: "before" | "after",
    sparse: SheetwriteStore,
    { version, read }: LeasedVersion,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const cells = calculatedDetails(page, side, sparse);
    if (cells.length === 0) {
      return;
    }

    await this.with_rebuilt_version(version, read, signal, false, ({ store }) => {
      for (const { detail, sheet, row, col } of cells) {
        detail[side] = cellIn(store, sheet, row, col);
      }
    });
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
  private with_rebuilt_version<T>(
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
        rebuild_version(
          await this.checkpoint_of(version, read),
          version.tail,
          read,
          this.limits,
          signal,
        ),
      action,
    );
  }

  /** Read a leased version's checkpoint and check that it belongs to this document. */
  private async checkpoint_of(
    version: HistoryVersion,
    read: HistoryRecordReader,
  ): Promise<CheckedSnapshot> {
    const checkpoint = await readCheckpoint(version.checkpoint, read, this.limits);
    if (checkpoint.snapshot.documentId !== this.document_id) {
      throw new HistoryError("integrity", "History checkpoint belongs to another document");
    }

    return checkpoint;
  }

  /** Lease one version and pass it and a leased record reader to `use`. */
  private async with_pinned_version<T>(
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
      const head = id === "head" ? manifest_response(leased).head : undefined;
      const version: HistoryVersion = head
        ? { ...head, id, kind: "automatic", authorId: "" }
        : version_response(
            await this.storage.get({ ...this.request(signal), kind: "version", id }),
          );

      const max_read_bytes = this.limits.maxSnapshotBytes + this.limits.maxTransactionBytes;
      let read_bytes = 0;

      const read = async (record_id: string): Promise<HistoryStoredRecord> => {
        checkAbort(signal);

        const stored = await this.storage.get({
          ...this.request(signal),
          kind: "record",
          id: record_id,
          maxBytes: this.limits.maxSnapshotBytes,
          pin: token,
        });

        if (!("bytes" in stored)) {
          throw new HistoryError("integrity", "History adapter returned an invalid record");
        }

        read_bytes += stored.decodedBytes;
        if (read_bytes > max_read_bytes) {
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
    const manifest = manifest_response(response);

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
      const age_ceiling = (this.manifest.head?.time ?? 0) - this.limits.maxAgeMs;

      this.manifest = await this.storage.prune({
        ...this.request(options.signal),
        expectedGeneration: this.manifest.generation,
        beforeTime: options.beforeTime ?? age_ceiling,
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
