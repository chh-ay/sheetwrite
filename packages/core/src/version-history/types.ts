import type { DocumentOp, WorkbookSnapshot } from "../types/document.js";

/** Resource and retention ceilings for an opt-in history archive. */
export interface HistoryLimits {
  maxSnapshotBytes: number;
  maxSegmentBytes: number;
  maxTransactionBytes: number;
  maxStorageBytes: number;
  maxWorkingBytes: number;
  maxNamedVersions: number;
  maxVersions: number;
  maxPageEntries: number;
  maxPageBytes: number;
  maxAgeMs: number;
  automaticIntervalMs: number;
  checkpointIntervalMs: number;
  checkpointTransactions: number;
  checkpointLogBytes: number;
}

/** One authority-confirmed transaction, never an optimistic local change. */
export interface HistoryCommit {
  baseRevision: number;
  revision: number;
  mutationId: string;
  authorId: string;
  time: number;
  operations: readonly DocumentOp[];
}

/** Named or automatically created durable revision marker. */
export interface HistoryVersion {
  id: string;
  revision: number;
  kind: "named" | "automatic";
  name?: string;
  authorId: string;
  time: number;
  checkpoint: string;
  tail: readonly string[];
}

/** Immutable, content-addressed history payload and its dependency edges. */
export interface HistoryStoredRecord {
  schemaVersion: 1;
  id: string;
  kind: "cells" | "metadata" | "sheet" | "checkpoint" | "segment" | "transaction";
  encoding: "deflate-json-v1" | "deflate-bytes-v1";
  decodedBytes: number;
  bytes: Uint8Array;
  references: readonly string[];
}

/** Durable recorder cursor. It does not retain operation payloads. */
export interface HistoryHead {
  revision: number;
  checkpoint: string;
  tail: readonly string[];
  time: number;
  activeMs: number;
  automaticAt: number;
  checkpointAt: number;
  checkpointTransactions: number;
  checkpointLogBytes: number;
}

/** Aggregate retained storage, including index and reference metadata. */
export interface HistoryStorageUsage {
  encodedBytes: number;
  recordCount: number;
  versionCount: number;
  namedVersionCount: number;
}

/** Manifest state returned without fetching a workbook payload. */
export interface HistoryManifest extends HistoryStorageUsage {
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
