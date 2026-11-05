import { MAX_ATOMIC_BATCH_VERSIONS } from "./atomic-batch.js";
import { validateDocumentOperationShape } from "./document-protocol.js";
import { SheetwriteStore } from "./store.js";
import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import { readCheckpoint, writeCheckpoint } from "./version-history/checkpoint.js";
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

const MAX_OPERATIONS = 10_000 * MAX_ATOMIC_BATCH_VERSIONS;
const REPLAY_WINDOW_BYTES = 4 * 1024 * 1024;

function isOperation(value: unknown): value is DocumentOp {
  return validateDocumentOperationShape(value).length === 0;
}

function checkCommit(
  commit: HistoryCommit,
  head: HistoryHead,
  limits: Readonly<HistoryLimits>,
): number {
  if (
    commit.baseRevision !== head.revision ||
    !integer(commit.revision) ||
    commit.revision <= commit.baseRevision ||
    commit.revision - commit.baseRevision > MAX_ATOMIC_BATCH_VERSIONS ||
    !integer(commit.time) ||
    commit.time < head.time ||
    typeof commit.mutationId !== "string" ||
    commit.mutationId.length === 0 ||
    commit.mutationId.length > 256 ||
    typeof commit.authorId !== "string" ||
    commit.authorId.length === 0 ||
    commit.authorId.length > 256 ||
    !Array.isArray(commit.operations) ||
    commit.operations.length === 0 ||
    commit.operations.length > MAX_OPERATIONS ||
    !commit.operations.every(isOperation)
  ) {
    throw new HistoryError(
      "invalid-history",
      "History requires a contiguous, authored committed transaction",
    );
  }
  const bytes = historyJsonSize(commit.operations, limits.maxTransactionBytes);
  if (bytes * 3 > limits.maxWorkingBytes)
    throw new HistoryError("capacity", "History transaction exceeds its working-set reservation");
  return bytes;
}

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

async function readCommit(
  id: string,
  read: (id: string) => Promise<HistoryStoredRecord>,
  limits: Readonly<HistoryLimits>,
): Promise<HistoryCommit> {
  const record = await read(id);
  const decoded = await decodeRecord(record, limits);
  if (
    record.kind !== "transaction" ||
    !object(decoded) ||
    !integer(decoded.baseRevision) ||
    !integer(decoded.revision) ||
    typeof decoded.mutationId !== "string" ||
    typeof decoded.authorId !== "string" ||
    !integer(decoded.time) ||
    !integer(decoded.operationBytes) ||
    decoded.operationBytes > limits.maxTransactionBytes ||
    !strings(decoded.segments) ||
    decoded.segments.length > Math.ceil(limits.maxTransactionBytes / limits.maxSegmentBytes)
  ) {
    throw new HistoryError("integrity", "Invalid archived transaction envelope");
  }
  if (decoded.operationBytes * 4 + REPLAY_WINDOW_BYTES > limits.maxWorkingBytes)
    throw new HistoryError("capacity", "Archived transaction exceeds its replay reservation");
  const payload = new Uint8Array(decoded.operationBytes);
  let offset = 0;
  for (const segmentId of decoded.segments) {
    if (!record.references.includes(segmentId))
      throw new HistoryError("integrity", "Transaction references an unowned log segment");
    const segment = await read(segmentId);
    if (segment.kind !== "segment")
      throw new HistoryError("integrity", "Expected an archived operation segment");
    const bytes = await decodeBytes(segment, limits);
    if (offset + bytes.length > payload.length)
      throw new HistoryError("integrity", "Archived transaction exceeds its declared size");
    payload.set(bytes, offset);
    offset += bytes.length;
  }
  if (offset !== payload.length)
    throw new HistoryError("integrity", "Archived transaction is incomplete");
  let operations: unknown;
  try {
    operations = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch (cause) {
    throw new HistoryError("integrity", "Invalid archived operation JSON", { cause });
  }
  if (!Array.isArray(operations) || !operations.every(isOperation))
    throw new HistoryError("integrity", "Invalid archived document operations");
  return {
    baseRevision: decoded.baseRevision,
    revision: decoded.revision,
    mutationId: decoded.mutationId,
    authorId: decoded.authorId,
    time: decoded.time,
    operations,
  };
}

function manifestResponse(
  value: HistoryManifest | HistoryVersion | HistoryStoredRecord,
): HistoryManifest {
  if (!("generation" in value))
    throw new HistoryError("integrity", "History adapter returned an invalid manifest");
  return value;
}

/** Opt-in, bounded history writer and replay module. The default grid never constructs it. */
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

  /** Open only the durable metadata cursor; this does not hydrate a workbook. */
  static async open(options: HistoryArchiveOptions, signal?: AbortSignal): Promise<HistoryArchive> {
    if (
      typeof options.documentId !== "string" ||
      options.documentId.length === 0 ||
      options.documentId.length > 256
    ) {
      throw new HistoryError("invalid-history", "History requires a bounded document ID");
    }
    const limits = resolveHistoryLimits(options.limits);
    const manifest = manifestResponse(
      await options.storage.get({
        kind: "manifest",
        documentId: options.documentId,
        limits,
        signal,
      }),
    );
    return new HistoryArchive(options, limits, manifest);
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

  /** Persist the initial content-addressed checkpoint of a fully loaded committed document. */
  async initialize(snapshot: WorkbookSnapshot, time: number, signal?: AbortSignal): Promise<void> {
    return this.serialized(async () => {
      checkAbort(signal);
      if (this.manifest.head || !integer(time))
        throw new HistoryError(
          "invalid-history",
          "History baseline already exists or has an invalid time",
        );
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
      this.manifest = await this.storage.put({
        ...this.request(signal),
        kind: "publish",
        expectedGeneration: this.manifest.generation,
        records: checkpoint.records,
        head,
      });
    });
  }

  /** Archive one authority-confirmed transaction and checkpoint only when cadence requires it. */
  async record(
    commit: HistoryCommit,
    capture?: HistorySnapshotProvider,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.serialized(async () => {
      checkAbort(signal);
      const current = this.manifest.head;
      if (!current)
        throw new HistoryError("invalid-history", "History baseline is required before recording");
      const encodedBytes = checkCommit(commit, current, this.limits);
      const records = await writeCommit(commit, this.limits);
      const envelope = records[records.length - 1];
      if (!envelope)
        throw new HistoryError("integrity", "Archived transaction envelope is missing");
      const activeMs =
        current.activeMs + Math.min(commit.time - current.time, this.limits.automaticIntervalMs);
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
        if (!capture)
          throw new HistoryError(
            "invalid-history",
            "A committed snapshot provider is required when a checkpoint is due",
          );
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
      this.manifest = await this.storage.put({
        ...this.request(signal),
        kind: "publish",
        expectedGeneration: this.manifest.generation,
        records: publication,
        head,
        version,
      });
    });
  }

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

  /** Name the durable head. Optimistic local operations must be flushed by the host first. */
  async saveVersion(
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ): Promise<HistoryVersion> {
    return this.serialized(async () => {
      checkAbort(signal);
      const head = this.manifest.head;
      if (!head)
        throw new HistoryError(
          "invalid-history",
          "History baseline is required before naming a version",
        );
      const version = await this.version(head, "named", authorId, time, name.trim());
      this.manifest = await this.storage.put({
        ...this.request(signal),
        kind: "publish",
        expectedGeneration: this.manifest.generation,
        records: [],
        version,
      });
      return version;
    });
  }

  /** Read a bounded newest-first metadata page without constructing a historical store. */
  async listVersions(
    options: { maxEntries?: number; maxBytes?: number; cursor?: string; signal?: AbortSignal } = {},
  ): Promise<HistoryListPage> {
    return this.storage.list({
      ...this.request(options.signal),
      maxEntries: options.maxEntries ?? this.limits.maxPageEntries,
      maxBytes: options.maxBytes ?? this.limits.maxPageBytes,
      cursor: options.cursor,
    });
  }

  /** Reconstruct one committed version in isolation and dispose the replay store on every exit. */
  async readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    checkAbort(signal);
    const response = await this.storage.get({ ...this.request(signal), kind: "version", id });
    if (
      !("checkpoint" in response) ||
      !("kind" in response) ||
      !["named", "automatic"].includes(response.kind)
    )
      throw new HistoryError("integrity", "History adapter returned an invalid version");
    const token = crypto.randomUUID();
    await this.storage.put({ ...this.request(signal), kind: "pin", token, versionId: id });
    try {
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
        if (!("bytes" in stored))
          throw new HistoryError("integrity", "History adapter returned an invalid record");
        readBytes += stored.decodedBytes;
        if (readBytes > this.limits.maxSnapshotBytes + this.limits.maxTransactionBytes)
          throw new HistoryError("capacity", "History replay exceeds its input reservation");
        return stored;
      };
      const snapshot = await readCheckpoint(response.checkpoint, read, this.limits);
      if (snapshot.documentId !== this.documentId)
        throw new HistoryError("integrity", "History checkpoint belongs to another document");
      if (response.tail.length === 0) {
        if (snapshot.version !== response.revision)
          throw new HistoryError(
            "integrity",
            "History checkpoint revision does not match its marker",
          );
        return snapshot;
      }
      const store = SheetwriteStore.fromSnapshot(snapshot, {
        storage: "paged",
        cacheBytes: REPLAY_WINDOW_BYTES,
        transactionResourceLimits: {
          maxOperations: MAX_OPERATIONS,
          maxEncodedBytes: this.limits.maxTransactionBytes,
        },
      });
      let revision = snapshot.version ?? 0;
      try {
        for (const transactionId of response.tail) {
          const commit = await readCommit(transactionId, read, this.limits);
          const prior: HistoryHead = {
            revision,
            checkpoint: response.checkpoint,
            tail: [],
            time: 0,
            activeMs: 0,
            automaticAt: 0,
            checkpointAt: 0,
            checkpointTransactions: 0,
            checkpointLogBytes: 0,
          };
          checkCommit(commit, prior, this.limits);
          const outcome = store.applyTransaction(
            { patches: [...commit.operations] },
            { source: "remote" },
          );
          if (
            outcome.status !== "applied" ||
            outcome.transaction.patches.length !== commit.operations.length ||
            outcome.rejections?.length
          )
            throw new HistoryError(
              "integrity",
              "Archived transaction could not be replayed completely",
            );
          revision = commit.revision;
          checkAbort(signal);
        }
        if (revision !== response.revision)
          throw new HistoryError("integrity", "History log does not reach its version marker");
        return { ...store.exportSnapshot(), version: revision };
      } finally {
        store.dispose();
      }
    } finally {
      await this.storage.put({ ...this.request(), kind: "release", token, versionId: id });
    }
  }

  /** Read aggregate retained storage without fetching payload bytes. */
  async storageUsage(signal?: AbortSignal): Promise<HistoryStorageUsage> {
    const manifest = manifestResponse(
      await this.storage.get({ ...this.request(signal), kind: "manifest" }),
    );
    return {
      encodedBytes: manifest.encodedBytes,
      recordCount: manifest.recordCount,
      versionCount: manifest.versionCount,
      namedVersionCount: manifest.namedVersionCount,
    };
  }

  /** Expire automatic markers while keeping named versions and every referenced chunk. */
  async prune(
    options: { beforeTime?: number; targetBytes?: number; signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.serialized(async () => {
      this.manifest = await this.storage.prune({
        ...this.request(options.signal),
        expectedGeneration: this.manifest.generation,
        beforeTime: options.beforeTime ?? (this.manifest.head?.time ?? 0) - this.limits.maxAgeMs,
        targetBytes: options.targetBytes,
      });
    });
  }

  /** Explicitly delete a marker; shared checkpoint pages remain while another owner needs them. */
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
