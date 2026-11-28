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
  /** Document revision the version restores to. */
  revision: number;
  /** `named` when a user saved it; `automatic` when the archive made it on its schedule. */
  kind: "named" | "automatic";
  /** Present on named versions. */
  name?: string;
  /** Who saved a named version, or who made the last change of an automatic one. */
  authorId: string;
  /** When the version was made, in milliseconds since the Unix epoch. */
  time: number;
  /** Record ID of the checkpoint the version rebuilds from. */
  checkpoint: string;
  /** Transaction envelope IDs applied after the checkpoint, in order. */
  tail: readonly string[];
  /**
   * Checkpoints made since the previous marker. The marker keeps them, so the
   * log between two retained versions stays readable for a diff.
   */
  checkpoints: readonly string[];
}

/** Immutable, content-addressed history payload and the records it refers to. */
export interface HistoryStoredRecord {
  /** Format version of the record; always `1` today. */
  schemaVersion: 1;
  /** SHA-256 over the header and compressed bytes, as 64 lowercase hex digits. */
  id: string;
  /** What the payload holds, such as a checkpoint snapshot or one transaction. */
  kind: "cells" | "metadata" | "sheet" | "checkpoint" | "segment" | "transaction";
  /** How `bytes` decode: deflated JSON or deflated raw bytes. */
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
  /** Revision of the last archived commit. */
  revision: number;
  /** Record ID of the newest checkpoint. */
  checkpoint: string;
  /** Transaction record IDs archived after that checkpoint, in order. */
  tail: readonly string[];
  /** Checkpoints made since the newest version marker; the next marker takes them over. */
  checkpoints: readonly string[];
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
  /** Bytes the document's history takes in storage. */
  encodedBytes: number;
  /** Stored records. A record that several versions share counts once. */
  recordCount: number;
  /** Number of versions, named and automatic. */
  versionCount: number;
  /** Named versions. Retention removes one only when `HistoryPruneRequest.deleteVersionId` names it. */
  namedVersionCount: number;
}

/** Archive state, read without fetching any payload. */
export interface HistoryManifest extends HistoryStorageUsage {
  /** Increases on each publication or prune; writers compare it to detect a concurrent writer. */
  generation: number;
  /** The recorder's position; absent before the first commit is archived. */
  head?: HistoryHead;
}

/** Common document identity, ceilings, and cancellation for adapter calls. */
export interface HistoryStorageRequest {
  /** ID of the document whose history the call is about. */
  documentId: string;
  /** The archive's limits; the adapter must refuse work that goes over them. */
  limits: Readonly<HistoryLimits>;
  /** Aborts when the archive stops waiting for the call. */
  signal?: AbortSignal;
}

/** Atomically publish immutable records and a new head or version marker. */
export interface HistoryPublishRequest extends HistoryStorageRequest {
  /** Always `"publish"`. */
  kind: "publish";
  /** Generation the writer read; refuse the call when storage is at another one. */
  expectedGeneration: number;
  /** New records to store, all or none. */
  records: readonly HistoryStoredRecord[];
  /** The new head, when the call moves it. */
  head?: HistoryHead;
  /** A new version marker, when the call adds one. */
  version?: HistoryVersion;
}

/** Acquire or release a five-minute renewable reader lease through the storage seam. */
export interface HistoryPinRequest extends HistoryStorageRequest {
  /** `pin` takes or renews the lease; `release` gives it up. */
  kind: "pin" | "release";
  /** The reader's lease ID; the same token renews or releases it. */
  token: string;
  /** Marker ID, or `"head"` to lease the committed head returned in the manifest. */
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
  /** Content ID of the record. */
  id: string;
  /** What the record holds. */
  kind: HistoryStoredRecord["kind"];
  /** Stored, compressed size in bytes. */
  encodedBytes: number;
  /** Size in bytes once inflated. */
  decodedBytes: number;
}

/** Bounded metadata-only page. Cursors are scoped to a manifest generation. */
export interface HistoryListRequest extends HistoryStorageRequest {
  /** List version markers (the default), or records of one kind. */
  kind?: "versions" | HistoryStoredRecord["kind"];
  /** Lowest revision to include. */
  fromRevision?: number;
  /** Highest revision to include. */
  toRevision?: number;
  /** Entries the page may hold, from 1 to `limits.maxPageEntries`. */
  maxEntries: number;
  /** Largest size of the page as JSON, in bytes, from 1 to `limits.maxPageBytes`. */
  maxBytes: number;
  /** Where to continue, from the previous page's `cursor`. */
  cursor?: string;
}

/** Metadata-only response in newest-first order. */
export interface HistoryListPage {
  /** Version markers on this page, newest first. */
  versions: readonly HistoryVersion[];
  /** Record metadata on this page, when records of one kind were asked for. */
  records?: readonly HistoryRecordMetadata[];
  /** Pass it back to get the next page; absent on the last page. */
  cursor?: string;
  /** Storage generation the page was read at; a cursor is valid only for it. */
  generation: number;
}

/** Retention removes automatic markers, or one explicitly selected named marker. */
export interface HistoryPruneRequest extends HistoryStorageRequest {
  /** Generation the writer read; refuse the call when storage is at another one. */
  expectedGeneration: number;
  /** Remove automatic versions made before this time, in milliseconds since the Unix epoch. */
  beforeTime: number;
  /** ID of one named version to remove as well. */
  deleteVersionId?: string;
  /** Keep removing the oldest automatic versions until storage is at or under this size in bytes. */
  targetBytes?: number;
}

/** Atomic storage seam for local databases and host-owned history backends. */
export interface HistoryStorageAdapter {
  /** Publishes records atomically, or takes or releases a reader lease; returns the new manifest. */
  put(request: HistoryPutRequest): Promise<HistoryManifest>;
  /** Returns the manifest, one version marker, or one record, as `request.kind` asks. */
  get(request: HistoryGetRequest): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord>;
  /** Returns one page of version or record metadata, newest first. */
  list(request: HistoryListRequest): Promise<HistoryListPage>;
  /** Removes expired versions and the records only they used; returns the new manifest. */
  prune(request: HistoryPruneRequest): Promise<HistoryManifest>;
}

/** Host-controlled archive configuration. No history is created until explicitly opened. */
export interface HistoryArchiveOptions {
  /** ID of the document whose history the archive keeps. */
  documentId: string;
  /** Where the archive stores its records, such as IndexedDB storage from `@sheetwrite/core/browser-history`. */
  storage: HistoryStorageAdapter;
  /**
   * Overrides for `DEFAULT_HISTORY_LIMITS`. Each must be a positive safe
   * integer, and `maxTransactionBytes` cannot go above its default.
   */
  limits?: Partial<HistoryLimits>;
}

/** Snapshot provider invoked only when a checkpoint is due. Must describe the committed head. */
export type HistorySnapshotProvider = () => WorkbookSnapshot | Promise<WorkbookSnapshot>;
