import type { WorkbookSnapshot } from "../types/document.js";

/** Resource and retention ceilings for an opt-in history archive. */
export interface HistoryLimits {
  /** Encoded bytes of one checkpoint snapshot or one record; defaults to 64 MiB. */
  maxSnapshotBytes: number;
  /** Decoded bytes of one log segment; defaults to 1 MiB. */
  maxSegmentBytes: number;
  /** Encoded operation bytes of one archived transaction; defaults to and cannot exceed 64 MiB. */
  maxTransactionBytes: number;
  /** Retained bytes per document, including headers and index entries; defaults to 512 MiB. */
  maxStorageBytes: number;
  /** Working-set reservation for one capture, decode or replay; defaults to 256 MiB. */
  maxWorkingBytes: number;
  /** Named versions per document; defaults to 100. */
  maxNamedVersions: number;
  /** Named and automatic versions per document; defaults to 10,000. */
  maxVersions: number;
  /** Entries in one metadata page; defaults to 100. */
  maxPageEntries: number;
  /** JSON bytes of one metadata page; defaults to 256 KiB. */
  maxPageBytes: number;
  /** Age after which automatic versions expire; defaults to 30 days. */
  maxAgeMs: number;
  /** Active time between automatic versions; defaults to 5 minutes. */
  automaticIntervalMs: number;
  /** Active time between checkpoints; defaults to 30 minutes. */
  checkpointIntervalMs: number;
  /** Transactions between checkpoints; defaults to 1,000. */
  checkpointTransactions: number;
  /** Encoded log bytes between checkpoints; defaults to 2 MiB. */
  checkpointLogBytes: number;
}

/** A durable marker at one archived revision. */
export interface HistoryVersion {
  /** Content ID of the marker fields. */
  id: string;
  revision: number;
  kind: "named" | "automatic";
  /** Present on named versions. */
  name?: string;
  /** Who saved a named version, or who made the last change of an automatic one. */
  authorId: string;
  time: number;
  /** Record ID of the checkpoint the version rebuilds from. */
  checkpoint: string;
  /** Transaction envelope IDs applied after the checkpoint, in order. */
  tail: readonly string[];
}

/** Immutable, content-addressed history payload and the records it refers to. */
export interface HistoryStoredRecord {
  schemaVersion: 1;
  /** SHA-256 over the header and compressed bytes, as 64 lowercase hex digits. */
  id: string;
  kind: "cells" | "metadata" | "sheet" | "checkpoint" | "segment" | "transaction";
  encoding: "deflate-json-v1" | "deflate-bytes-v1";
  /** Exact size after inflate. */
  decodedBytes: number;
  /** Deflate-compressed payload. */
  bytes: Uint8Array;
  /** Records this record needs; they stay while this record exists. */
  references: readonly string[];
}

/** Durable recorder cursor: the newest checkpoint, the log tail since it, and cadence counters. */
export interface HistoryHead {
  revision: number;
  checkpoint: string;
  tail: readonly string[];
  /** Time of the last archived commit. */
  time: number;
  /** Active editing time since the baseline; idle gaps count as at most one automatic interval. */
  activeMs: number;
  /** `activeMs` at the last automatic version. */
  automaticAt: number;
  /** `activeMs` at the last checkpoint. */
  checkpointAt: number;
  /** Transactions since the last checkpoint. */
  checkpointTransactions: number;
  /** Encoded operation bytes since the last checkpoint. */
  checkpointLogBytes: number;
}

/** Retained storage of one document, including headers and index entries. */
export interface HistoryStorageUsage {
  encodedBytes: number;
  recordCount: number;
  versionCount: number;
  namedVersionCount: number;
}

/** Archive state, read without fetching any payload. */
export interface HistoryManifest extends HistoryStorageUsage {
  /** Increases on each publication or prune; writers compare it to detect a concurrent writer. */
  generation: number;
  head?: HistoryHead;
}

/** Common document identity, ceilings, and cancellation for adapter calls. */
export interface HistoryStorageRequest {
  documentId: string;
  limits: Readonly<HistoryLimits>;
  signal?: AbortSignal;
}

/** Atomically publish immutable records and a new head or version marker. */
export interface HistoryPublishRequest extends HistoryStorageRequest {
  kind: "publish";
  expectedGeneration: number;
  records: readonly HistoryStoredRecord[];
  head?: HistoryHead;
  version?: HistoryVersion;
}

/** Acquire or release a five-minute renewable reader lease through the storage seam. */
export interface HistoryPinRequest extends HistoryStorageRequest {
  kind: "pin" | "release";
  token: string;
  versionId: string;
}

/** A storage write either publishes one complete revision or manages a reader lease. */
export type HistoryPutRequest = HistoryPublishRequest | HistoryPinRequest;

/** Fetch metadata or a bounded immutable payload; leased reads renew their lease. */
export type HistoryGetRequest = HistoryStorageRequest &
  (
    | { kind: "manifest" }
    | { kind: "version"; id: string }
    | { kind: "record"; id: string; maxBytes: number; pin?: string }
  );

/** Metadata for one immutable record; listings never return payload bytes. */
export interface HistoryRecordMetadata {
  id: string;
  kind: HistoryStoredRecord["kind"];
  encodedBytes: number;
  decodedBytes: number;
}

/** Bounded metadata-only page. Cursors are scoped to a manifest generation. */
export interface HistoryListRequest extends HistoryStorageRequest {
  kind?: "versions" | HistoryStoredRecord["kind"];
  fromRevision?: number;
  toRevision?: number;
  maxEntries: number;
  maxBytes: number;
  cursor?: string;
}

/** Metadata-only response in newest-first order. */
export interface HistoryListPage {
  versions: readonly HistoryVersion[];
  records?: readonly HistoryRecordMetadata[];
  cursor?: string;
  generation: number;
}

/** Retention removes automatic markers, or one explicitly selected named marker. */
export interface HistoryPruneRequest extends HistoryStorageRequest {
  expectedGeneration: number;
  beforeTime: number;
  deleteVersionId?: string;
  targetBytes?: number;
}

/** Atomic storage seam for local databases and host-owned history backends. */
export interface HistoryStorageAdapter {
  put(request: HistoryPutRequest): Promise<HistoryManifest>;
  get(request: HistoryGetRequest): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord>;
  list(request: HistoryListRequest): Promise<HistoryListPage>;
  prune(request: HistoryPruneRequest): Promise<HistoryManifest>;
}

/** Host-controlled archive configuration. No history is created until explicitly opened. */
export interface HistoryArchiveOptions {
  documentId: string;
  storage: HistoryStorageAdapter;
  limits?: Partial<HistoryLimits>;
}

/** Snapshot provider invoked only when a checkpoint is due. Must describe the committed head. */
export type HistorySnapshotProvider = () => WorkbookSnapshot | Promise<WorkbookSnapshot>;
