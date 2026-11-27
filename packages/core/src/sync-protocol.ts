import {
  MAX_ATOMIC_BATCH_ENCODED_BYTES,
  MAX_ATOMIC_BATCH_VERSIONS,
  validVersionOperationCounts,
} from "./atomic-batch.js";
import {
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateDocumentOperationShape,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
import { SheetwriteError } from "./errors.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./json-bytes.js";
import type { DocumentOp } from "./types/document.js";
import type {
  PendingCommit,
  PersistenceCommitResponse,
  RestoreProvenance,
  VersionBatchMember,
} from "./types/transaction.js";
import { utf8ByteLength } from "./utf8.js";

/** Aggregate ceilings for local commits retained until durable acknowledgement. */
export interface SyncPendingQueueLimits {
  /** Pending local commits, including synchronous reservations; defaults to 10,000. */
  maxPendingCommits: number;
  /** Aggregate DocumentOp count across pending commits; defaults to 100,000. */
  maxPendingOperations: number;
  /** Aggregate UTF-8 bytes across pending operation arrays; defaults to 128 MiB. */
  maxPendingEncodedBytes: number;
}

/** Resource ceilings applied independently to remote collaboration input and local durability. */
export interface SyncCoordinatorLimits extends SyncPendingQueueLimits {
  /** UTF-8 bytes in a remote or pending mutation ID; defaults to 256. */
  maxMutationIdBytes: number;
  /** Operations accepted in one remote version; defaults to 10,000. */
  maxOperationsPerVersion: number;
  /** Encoded operation bytes accepted in one remote version; defaults to 8 MiB. */
  maxVersionPayloadBytes: number;
  /** Version distance allowed ahead of the contiguous head; defaults to 1,024. */
  maxFutureVersionDistance: number;
  /** Remote future versions retained in the gap buffer; defaults to 256. */
  maxBufferedVersions: number;
  /** Aggregate operations retained in the gap buffer; defaults to 40,000. */
  maxBufferedOperations: number;
  /** Aggregate encoded bytes retained in the gap buffer; defaults to 32 MiB. */
  maxBufferedBytes: number;
  /**
   * Recently acknowledged mutation IDs retained for echo deduplication;
   * defaults to 4,096. Once an ID expires, a stale operation carrying it is a
   * reload-requiring protocol violation and its operations are never reapplied.
   */
  maxRecentAcknowledgements: number;
  /**
   * Versions in one atomic batch, sent or received; defaults to and cannot
   * exceed 16. Each member version stays within the per-version limits.
   */
  maxBatchVersions: number;
  /**
   * Aggregate encoded operation bytes in one atomic batch, sent or received;
   * defaults to and cannot exceed 64 MiB.
   */
  maxBatchBytes: number;
}

/**
 * Security and durability defaults bound hostile remote versions, recovery
 * buffers, acknowledgement memory, and the offline pending queue independently.
 */
export const DEFAULT_SYNC_COORDINATOR_LIMITS: Readonly<SyncCoordinatorLimits> = Object.freeze({
  // IDs cross persistence and transport boundaries.
  maxMutationIdBytes: 256,
  // One remote version uses the same atomic-operation ceilings as a transaction.
  maxOperationsPerVersion: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations,
  maxVersionPayloadBytes: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes,
  // Bound version-gap recovery distance before requiring a snapshot reload.
  maxFutureVersionDistance: 1_024,
  maxBufferedVersions: 256,
  maxBufferedOperations: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations * 4,
  maxBufferedBytes: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes * 4,
  maxRecentAcknowledgements: 4_096,
  maxPendingCommits: 10_000,
  maxPendingOperations: 100_000,
  maxPendingEncodedBytes: 128 * 1024 * 1024,
  // A Grid commits an atomic batch as one transaction, so these are also the
  // largest batch it can apply.
  maxBatchVersions: MAX_ATOMIC_BATCH_VERSIONS,
  maxBatchBytes: MAX_ATOMIC_BATCH_ENCODED_BYTES,
});

/** Stable category identifying which synchronization protocol bound was violated. */
export type SyncProtocolErrorCode =
  | "invalid-limits"
  | "invalid-version"
  | "invalid-id"
  | "invalid-operations"
  | "operation-limit"
  | "payload-limit"
  | "response-id-mismatch"
  | "future-distance-limit"
  | "buffer-count-limit"
  | "buffer-operation-limit"
  | "buffer-byte-limit"
  | "pending-count-limit"
  | "pending-operation-limit"
  | "pending-byte-limit"
  | "late-echo"
  | "remote-operations-rejected"
  | "invalid-batch"
  | "batch-limit";

/** Typed rejection of malformed or resource-exhausting synchronization input. */
export class SyncProtocolError extends SheetwriteError {
  /** Always `"SyncProtocolError"`. */
  override readonly name = "SyncProtocolError";
  /** What was wrong with the server's data. */
  declare readonly code: SyncProtocolErrorCode;

  /** Creates the error; `options.cause` keeps the underlying error. */
  constructor(code: SyncProtocolErrorCode, message: string, options?: ErrorOptions) {
    super(code, "synchronize", message, { cause: options?.cause });
  }
}

export interface InspectedVersionedOperation {
  version: number;
  operations: readonly DocumentOp[];
  clientMutationId?: string;
  batch?: VersionBatchMember;
  authorId?: string;
  committedAt?: number;
  bytes: number;
}

type PlainRecord = Record<string, unknown>;

const LIMIT_KEYS: Record<keyof SyncCoordinatorLimits, true> = {
  maxMutationIdBytes: true,
  maxOperationsPerVersion: true,
  maxVersionPayloadBytes: true,
  maxFutureVersionDistance: true,
  maxBufferedVersions: true,
  maxBufferedOperations: true,
  maxBufferedBytes: true,
  maxRecentAcknowledgements: true,
  maxPendingCommits: true,
  maxPendingOperations: true,
  maxPendingEncodedBytes: true,
  maxBatchVersions: true,
  maxBatchBytes: true,
};

export function assertPendingCommit(
  commit: PendingCommit,
  documentId: string,
  limits: Readonly<SyncCoordinatorLimits>,
): number {
  const record = assert_plain_record(commit, "Durable queue returned an invalid pending commit");
  if (own_data_value(record, "documentId") !== documentId) {
    throw new SyncProtocolError(
      "invalid-id",
      "Durable queue returned a commit for the wrong document",
    );
  }

  assertVersion(own_data_value(record, "baseVersion"), "pending baseVersion");
  assertMutationId(own_data_value(record, "clientMutationId"), limits);
  const author_id = optional_own_data_value(record, "authorId");
  if (author_id !== undefined) assertAuthorId(author_id, limits);
  const restore = optional_own_data_value(record, "restore");
  if (restore !== undefined) assert_restore_provenance(restore, limits);
  const operations = own_data_value(record, "operations");
  const bytes = assert_operation_resources(
    operations,
    limits.maxPendingOperations,
    limits.maxPendingEncodedBytes,
  );
  const counts = optional_own_data_value(record, "versionOperationCounts");
  if (counts === undefined) return bytes;
  const operation_count = (operations as readonly DocumentOp[]).length;
  if (
    !validVersionOperationCounts(counts, operation_count, limits.maxBatchVersions) ||
    bytes > limits.maxBatchBytes
  ) {
    throw new SyncProtocolError(
      "invalid-batch",
      "Durable queue returned invalid atomic batch version operation counts",
    );
  }

  assertCommitOperations(commit, limits);
  return bytes;
}

export function resolveLimits(
  overrides: Partial<SyncCoordinatorLimits> | undefined,
): Readonly<SyncCoordinatorLimits> {
  if (overrides === undefined) return DEFAULT_SYNC_COORDINATOR_LIMITS;
  const record = assert_plain_record(overrides, "Sync limits must be a plain object");
  const resolved: SyncCoordinatorLimits = { ...DEFAULT_SYNC_COORDINATOR_LIMITS };
  for (const key in record) {
    if (!is_limit_key(key)) {
      throw new SyncProtocolError("invalid-limits", `Unknown sync limit ${key}`);
    }
    const value = own_data_value(record, key);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new SyncProtocolError(
        "invalid-limits",
        `Sync limit ${key} must be a positive safe integer`,
      );
    }
    resolved[key] = value;
  }
  if (
    resolved.maxBatchVersions > MAX_ATOMIC_BATCH_VERSIONS ||
    resolved.maxBatchBytes > MAX_ATOMIC_BATCH_ENCODED_BYTES
  ) {
    throw new SyncProtocolError(
      "invalid-limits",
      `Sync batch limits cannot exceed ${MAX_ATOMIC_BATCH_VERSIONS} versions or ${MAX_ATOMIC_BATCH_ENCODED_BYTES} bytes, the largest batch a Grid applies`,
    );
  }
  return Object.freeze(resolved);
}

function is_limit_key(key: string): key is keyof SyncCoordinatorLimits {
  return Object.hasOwn(LIMIT_KEYS, key);
}

export function assertDocumentId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SyncProtocolError("invalid-id", "documentId must be a nonempty string");
  }
}

export function assertVersion(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SyncProtocolError("invalid-version", `${field} must be a nonnegative safe integer`);
  }
}

export function incrementVersion(version: number): number {
  if (version >= Number.MAX_SAFE_INTEGER) {
    throw new SyncProtocolError("invalid-version", "Server version cannot advance safely");
  }
  return version + 1;
}

export function assertMutationId(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLength(value, limits.maxMutationIdBytes) > limits.maxMutationIdBytes
  ) {
    throw new SyncProtocolError(
      "invalid-id",
      `clientMutationId must be nonempty and at most ${limits.maxMutationIdBytes} UTF-8 bytes`,
    );
  }
}

export function assertAuthorId(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLength(value, limits.maxMutationIdBytes) > limits.maxMutationIdBytes
  ) {
    throw new SyncProtocolError(
      "invalid-id",
      `authorId must be nonempty and at most ${limits.maxMutationIdBytes} UTF-8 bytes`,
    );
  }
}

function assert_restore_provenance(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): asserts value is RestoreProvenance {
  const record = assert_plain_record(value, "Restore provenance must be a plain object");
  const scope = own_data_value(record, "scope");
  if (scope !== "workbook" && scope !== "sheet" && scope !== "range") {
    throw new SyncProtocolError("invalid-id", "Restore scope must be workbook, sheet or range");
  }

  assertAuthorId(own_data_value(record, "versionId"), limits);
}

function assert_operations(value: unknown, limits: Readonly<SyncCoordinatorLimits>): number {
  return assert_operation_resources(
    value,
    limits.maxOperationsPerVersion,
    limits.maxVersionPayloadBytes,
  );
}

function assert_operation_resources(
  value: unknown,
  max_operations: number,
  max_encoded_bytes: number,
): number {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new SyncProtocolError("invalid-operations", "operations must be an array");
  }
  if (value.length > max_operations) {
    throw new SyncProtocolError(
      "operation-limit",
      `operations exceeds the ${max_operations} operation limit`,
    );
  }
  const encoded_bytes = json_encoded_byte_length(value, max_encoded_bytes);
  for (let index = 0; index < value.length; index++) {
    const operation = value[index];
    assert_plain_record(operation, "Each document operation must be a plain object");
    const errors = validateDocumentOperationShape(operation, `operations[${index}]`);
    if (errors.length > 0) {
      const error = errors[0]!;
      throw new SyncProtocolError(
        "invalid-operations",
        `Invalid document operation at ${error.path}: ${error.message}`,
      );
    }
  }
  return encoded_bytes;
}

export function inspectVersionedOperation(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): InspectedVersionedOperation {
  const record = assert_plain_record(value, "Versioned operation must be a plain object");
  const version = own_data_value(record, "version");
  assertVersion(version, "version");
  const operations = own_data_value(record, "operations");
  const bytes = assert_operations(operations, limits);
  const mutation_id = optional_own_data_value(record, "clientMutationId");
  if (mutation_id !== undefined) assertMutationId(mutation_id, limits);
  const batch_value = optional_own_data_value(record, "batch");
  const batch = batch_value === undefined ? undefined : assert_batch_member(batch_value, limits);

  const author_id = optional_own_data_value(record, "authorId");
  if (author_id !== undefined) assertAuthorId(author_id, limits);

  const committed_at = optional_own_data_value(record, "committedAt");
  if (committed_at !== undefined) assertVersion(committed_at, "committedAt");

  return {
    version,
    operations: operations as readonly DocumentOp[],
    ...(mutation_id !== undefined ? { clientMutationId: mutation_id } : {}),
    ...(batch !== undefined ? { batch } : {}),
    ...(author_id !== undefined ? { authorId: author_id } : {}),
    ...(committed_at !== undefined ? { committedAt: committed_at } : {}),
    bytes,
  };
}

function assert_batch_member(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): VersionBatchMember {
  const record = assert_plain_record(value, "Versioned operation batch must be a plain object");
  const index = own_data_value(record, "index");
  const count = own_data_value(record, "count");
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    (count as number) < 2 ||
    (index as number) < 0 ||
    (index as number) >= (count as number)
  ) {
    throw new SyncProtocolError(
      "invalid-batch",
      "Versioned operation batch needs an index below a count of at least 2",
    );
  }
  if ((count as number) > limits.maxBatchVersions) {
    throw new SyncProtocolError(
      "batch-limit",
      `Atomic batch exceeds the ${limits.maxBatchVersions} version limit`,
    );
  }
  return { index: index as number, count: count as number };
}

/**
 * Check that the operations of a pending commit fit its server versions: one
 * version, or each member version of its atomic batch.
 */
export function assertCommitOperations(
  commit: PendingCommit,
  limits: Readonly<SyncCoordinatorLimits>,
): void {
  const counts = commit.versionOperationCounts;
  if (counts === undefined) {
    assert_operations(commit.operations, limits);
    return;
  }
  let start = 0;
  for (const count of counts) {
    assert_operations(commit.operations.slice(start, start + count), limits);
    start += count;
  }
}

export function assertPersistenceResponse(
  value: PersistenceCommitResponse,
  limits: Readonly<SyncCoordinatorLimits>,
): void {
  const record = assert_plain_record(value, "Persistence response must be a plain object");
  const status = own_data_value(record, "status");
  if (status === "conflict") {
    assertVersion(own_data_value(record, "currentVersion"), "currentVersion");
    const snapshot = optional_own_data_value(record, "snapshot");
    if (snapshot !== undefined) {
      const validation = validateWorkbookSnapshot(snapshot, {
        storage: "paged",
        resourceLimits: { maxSerializedBytes: limits.maxBufferedBytes },
      });

      if (!validation.ok) {
        throw new SyncProtocolError(
          validation.errors.some((error) => error.code === "resource-limit")
            ? "buffer-byte-limit"
            : "invalid-operations",
          validation.errors[0]?.message ?? "Conflict snapshot is invalid",
        );
      }
    }

    const operations_since_base = optional_own_data_value(record, "operationsSinceBase");
    if (operations_since_base === undefined) return;
    if (
      !Array.isArray(operations_since_base) ||
      Object.getPrototypeOf(operations_since_base) !== Array.prototype
    ) {
      throw new SyncProtocolError("invalid-operations", "operationsSinceBase must be an array");
    }

    if (operations_since_base.length > limits.maxBufferedVersions) {
      throw new SyncProtocolError(
        "buffer-count-limit",
        "Conflict operation tail exceeds the version count limit",
      );
    }

    let operation_count = 0;
    let byte_count = 0;
    for (const operation of operations_since_base) {
      const inspected = inspectVersionedOperation(operation, limits);
      operation_count += inspected.operations.length;
      byte_count += inspected.bytes;
      if (operation_count > limits.maxBufferedOperations) {
        throw new SyncProtocolError(
          "buffer-operation-limit",
          "Conflict operation tail exceeds the operation count limit",
        );
      }

      if (byte_count > limits.maxBufferedBytes) {
        throw new SyncProtocolError(
          "buffer-byte-limit",
          "Conflict operation tail exceeds the byte limit",
        );
      }
    }

    return;
  }

  if (status !== "applied" && status !== "duplicate") {
    throw new SyncProtocolError("invalid-operations", "Persistence response status is invalid");
  }

  assertVersion(own_data_value(record, "version"), "version");
  assertMutationId(own_data_value(record, "clientMutationId"), limits);
  if (Object.getOwnPropertyDescriptor(record, "canonicalOperations") !== undefined) {
    throw new SyncProtocolError(
      "invalid-operations",
      "Persistence responses cannot contain canonical operations",
    );
  }
}

export function assertConflictRecovery(
  response: Extract<PersistenceCommitResponse, { status: "conflict" }>,
  baseVersion: number,
): void {
  if (response.currentVersion < baseVersion) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict currentVersion cannot precede the pending baseVersion",
    );
  }

  if (
    response.snapshot !== undefined &&
    (response.snapshot.version ?? 0) !== response.currentVersion
  ) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict snapshot version must equal currentVersion",
    );
  }

  const tail = response.operationsSinceBase;
  if (tail === undefined) return;
  if (tail.length === 0) {
    if (response.currentVersion !== baseVersion) {
      throw new SyncProtocolError(
        "invalid-version",
        "An empty conflict operation tail cannot advance currentVersion",
      );
    }

    return;
  }

  let expected_version = incrementVersion(baseVersion);
  for (let index = 0; index < tail.length; index++) {
    if (tail[index]!.version !== expected_version) {
      throw new SyncProtocolError(
        "invalid-version",
        "Conflict operationsSinceBase must be contiguous from the pending baseVersion",
      );
    }

    if (index + 1 < tail.length) expected_version = incrementVersion(expected_version);
  }

  // The loop proved the last entry carries `expected_version`.
  if (expected_version !== response.currentVersion) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict operationsSinceBase must end at currentVersion",
    );
  }
}

function assert_plain_record(value: unknown, message: string): PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new SyncProtocolError("invalid-operations", message);
  }
  return value as PlainRecord;
}

function own_data_value(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) {
    throw new SyncProtocolError("invalid-operations", `${key} must be an enumerable data field`);
  }
  return descriptor.value;
}

function optional_own_data_value(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new SyncProtocolError("invalid-operations", `${key} must be an enumerable data field`);
  }
  return descriptor.value;
}

export function validReceivedVersion(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

export function asSyncProtocolError(error: unknown): SyncProtocolError {
  return error instanceof SyncProtocolError
    ? error
    : new SyncProtocolError("invalid-operations", "Synchronization input is invalid", {
        cause: error,
      });
}

function json_encoded_byte_length(value: unknown, limit: number): number {
  try {
    return boundedJsonByteLength(value, limit);
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
      throw new SyncProtocolError(
        "payload-limit",
        `Encoded operation payload exceeds the ${limit} byte limit`,
        { cause: error },
      );
    }
    throw new SyncProtocolError("invalid-operations", "Operations must contain JSON-safe values", {
      cause: error,
    });
  }
}
