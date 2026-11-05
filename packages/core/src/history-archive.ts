import { MAX_ATOMIC_BATCH_VERSIONS } from "./atomic-batch.js";
import {
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateDocumentOperationShape,
} from "./document-protocol.js";
import { buildOnEngineInstance, prepareEngineInstance } from "./engine.js";
import { SheetwriteStore } from "./store.js";
import { forgetLiveStoreEngine } from "./store/engine-registry.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import {
  type HistoryRecordReader,
  readCheckpoint,
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
import type {
  HistoryArchiveOptions,
  HistoryCommit,
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
export { MemoryHistoryStorage } from "./version-history/storage.js";
export type {
  HistoryArchiveOptions,
  HistoryCommit,
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

/**
 * Validate one committed transaction that follows `baseRevision`, and return
 * its encoded operation bytes. A transaction spans at most one atomic batch.
 */
function checkCommit(
  commit: HistoryCommit,
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
    commit.operations.every(isOperation);

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
  commit: HistoryCommit,
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
): Promise<HistoryCommit> {
  const record = await read(id);
  const envelope = await decodeRecord(record, limits);
  if (record.kind !== "transaction" || !object(envelope)) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }

  const { baseRevision, revision, mutationId, authorId, time, operationBytes, segments } = envelope;
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
    segments.length <= maxSegments;

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

  return { baseRevision, revision, mutationId, authorId, time, operations };
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
 * Build a paged replay store in its own engine instance, apply `tail`, and
 * export the result. The private instance holds all replay memory, so the
 * document engine keeps its size; the store and the instance are freed on
 * every exit.
 */
async function replay(
  snapshot: WorkbookSnapshot,
  tail: readonly string[],
  read: HistoryRecordReader,
  limits: Readonly<HistoryLimits>,
  signal?: AbortSignal,
): Promise<WorkbookSnapshot> {
  const instance = await prepareEngineInstance();

  let store: SheetwriteStore;
  try {
    store = buildOnEngineInstance(instance, () =>
      SheetwriteStore.fromSnapshot(snapshot, {
        storage: "paged",
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

  try {
    let revision = snapshot.version ?? 0;

    for (const transactionId of tail) {
      const commit = await readCommit(transactionId, read, limits);
      checkCommit(commit, revision, 0, limits);

      const outcome = store.applyTransaction(
        { patches: [...commit.operations] },
        { source: "remote" },
      );

      const complete =
        outcome.status === "applied" &&
        outcome.transaction.patches.length === commit.operations.length &&
        !outcome.rejections?.length;

      if (!complete) {
        throw new HistoryError(
          "integrity",
          "Archived transaction could not be replayed completely",
        );
      }

      revision = commit.revision;
      checkAbort(signal);
    }

    return { ...store.exportSnapshot(), version: revision };
  } finally {
    store.dispose();
    instance.retire();
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
    commit: HistoryCommit,
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
        );

        publication = [...records, ...checkpoint.records];
        head = {
          ...head,
          checkpoint: checkpoint.checkpoint,
          tail: [],
          checkpointAt: activeMs,
          checkpointTransactions: 0,
          checkpointLogBytes: 0,
        };
      }

      let version: HistoryVersion | undefined;
      if (activeMs - current.automaticAt >= this.limits.automaticIntervalMs) {
        version = await this.version(head, "automatic", commit.authorId, commit.time);
        head = { ...head, automaticAt: activeMs };
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
      await this.publish([], undefined, version, signal);

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
   */
  async readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    checkAbort(signal);

    const version = versionResponse(
      await this.storage.get({ ...this.request(signal), kind: "version", id }),
    );

    const token = crypto.randomUUID();
    await this.storage.put({ ...this.request(signal), kind: "pin", token, versionId: id });

    try {
      return await this.readPinned(version, token, signal);
    } finally {
      await this.storage.put({ ...this.request(), kind: "release", token, versionId: id });
    }
  }

  private async readPinned(
    version: HistoryVersion,
    token: string,
    signal?: AbortSignal,
  ): Promise<WorkbookSnapshot> {
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

    const snapshot = await readCheckpoint(version.checkpoint, read, this.limits);
    if (snapshot.documentId !== this.documentId) {
      throw new HistoryError("integrity", "History checkpoint belongs to another document");
    }

    const rebuilt =
      version.tail.length === 0
        ? snapshot
        : await replay(snapshot, version.tail, read, this.limits, signal);

    if (rebuilt.version !== version.revision) {
      throw new HistoryError("integrity", "History log does not reach its version marker");
    }

    return rebuilt;
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
    });
  }
}
