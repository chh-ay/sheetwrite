import {
  markAtomicBatch,
  measureOperationBytes,
  operationArrayBytes,
  partitionVersionOperations,
} from "./atomic-batch.js";
import {
  normalizeSheetwriteError,
  SheetwriteError,
  type SheetwriteErrorContext,
} from "./errors.js";
import { JsonByteLengthError } from "./json-bytes.js";
import { cloneJsonValue } from "./plain-data.js";
import { changesStructure, type RebaseConflict, rebaseDocumentOperations } from "./rebase.js";
import { restoreProvenanceOf } from "./restore-commit.js";
import {
  assertAuthorId,
  assertCommitOperations,
  assertConflictRecovery,
  assertDocumentId,
  assertMutationId,
  assertPendingCommit,
  assertPersistenceResponse,
  assertVersion,
  asSyncProtocolError,
  incrementVersion,
  type InspectedVersionedOperation,
  inspectVersionedOperation,
  resolveLimits,
  type SyncCoordinatorLimits,
  SyncProtocolError,
  validReceivedVersion,
} from "./sync-protocol.js";
import { PendingRecordQueue, serverVersionsOf } from "./sync-queue.js";
import {
  type GridTransactionAdmissionDecision,
  registerGridTransactionAdmission,
  requestTransactionReplayRollback,
  transactionStorageRevision,
  takeTransactionReplayRollback,
  type TransactionReplayRollback,
} from "./transaction-admission.js";
import type { DocumentOp, MutationIssue, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type {
  PendingCommit,
  PersistenceAdapter,
  PersistenceCommitResponse,
  RemoteOperationSource,
  RestoreProvenance,
  SyncMutationRecord,
  VersionedOperation,
} from "./types/transaction.js";
import { utf8ByteLength } from "./utf8.js";

/** Mandatory bounds for one durable pending-commit restore. */
export interface PendingCommitLoadOptions {
  /** Aborts when the coordinator is destroyed before the queue has loaded. */
  signal?: AbortSignal;
  /** Maximum records returned for one document queue. */
  maxRecords: number;
  /** Maximum aggregate operation count returned for one document queue. */
  maxOperations: number;
  /** Maximum aggregate UTF-8 bytes of the JSON-encoded operation arrays. */
  maxBytes: number;
}

/** Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint. */
export interface PendingCommitStorage {
  /** Returns the document's saved pending commits, oldest first, within the given bounds. */
  load(documentId: string, options: PendingCommitLoadOptions): Promise<readonly PendingCommit[]>;
  /** Saves one pending commit durably; it must survive a page reload. */
  put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
  /** Deletes one pending commit once the server has acknowledged it. */
  remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
  /**
   * Atomically replaces one document queue only if its ordered IDs still match
   * the caller's expected view.
   */
  replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void>;
}

/** Host-controlled online state reported by synchronization. */
export type SyncConnectionState = "offline" | "connecting" | "online" | "error" | "destroyed";
/** Current persistence activity reported by a sync coordinator. */
export type SyncActivityState =
  | "hydrating"
  | "idle"
  | "persisting"
  | "pending"
  | "sending"
  | "conflict"
  | "error"
  | "destroyed";
/** Whether the durable local queue can currently admit another transaction. */
export type SyncPendingCapacityState =
  | "hydrating"
  | "available"
  | "full"
  | "restore-error"
  | "destroyed";

/** Immutable observable synchronization state. */
export interface SyncStateSnapshot {
  /** Whether the coordinator is online, connecting, offline, failed or destroyed. */
  connection: SyncConnectionState;
  /** What the coordinator is doing now, such as `"sending"` or `"idle"`. */
  activity: SyncActivityState;
  /** Pending local commits, including synchronous pre-commit reservations. */
  pendingCount: number;
  /** Aggregate DocumentOp count, including synchronous pre-commit reservations. */
  pendingOperations: number;
  /** Aggregate UTF-8 bytes of pending JSON-encoded operation arrays. */
  pendingEncodedBytes: number;
  /** Current local transaction admission state. */
  pendingCapacity: SyncPendingCapacityState;
  /** Last accepted contiguous remote server version. */
  serverVersion: number;
}

/** Contiguous-version recovery request produced when remote input skips ahead. */
export interface SyncVersionGapRequest {
  /** ID of the document with the gap. */
  documentId: string;
  /** The next version the coordinator needs. */
  expectedVersion: number;
  /** The later version that arrived first. */
  receivedVersion: number;
  /** Aborts when the coordinator stops waiting for your recovery. */
  signal: AbortSignal;
}

/** Typed local transaction rejection produced when the durable queue cannot reserve capacity. */
export class SyncPendingCapacityError extends SheetwriteError {
  /** Always `"SyncPendingCapacityError"`. */
  override readonly name = "SyncPendingCapacityError";
  /** Always `"pending-capacity"`. */
  declare readonly code: "pending-capacity";

  /** Creates the error from the queue limit that refused the transaction. */
  constructor(
    /** The limit the queue hit, with its maximum and the size asked for. */
    readonly issue: Extract<MutationIssue, { kind: "resource-limit" }>,
  ) {
    super("pending-capacity", "synchronize", issue.message, {
      context: { resource: issue.resource, limit: issue.max, actual: issue.actual },
    });
  }
}

/** Document, version, durability, and online options for synchronization. */
export interface SyncCoordinatorOptions {
  /** ID of the document to sync; every pending commit carries it. */
  documentId: string;
  /** Server version of the snapshot the grid was created from. */
  serverVersion: number;
  /** Makes the ID of each new local change; defaults to `sheetwrite-` and random hex. */
  createMutationId?: () => string;
  /** Durable queue for unsent changes, so they survive a reload; without it they live in memory. */
  pendingStorage?: PendingCommitStorage;
  /** Connection state at start; defaults to `"online"`. */
  initialConnection?: "offline" | "online";
  /**
   * Authenticated ID of the person editing through this grid. Each new pending
   * commit carries it to the authority, which records it in history. Restored
   * commits keep the author they were made with. At most `maxMutationIdBytes`
   * UTF-8 bytes.
   */
  authorId?: string;
  /**
   * Optional host recovery hook. Return the missing ordered operations, or a
   * snapshot for the host to remount before calling `resumeAfterReload`.
   */
  recoverVersionGap?: (
    request: SyncVersionGapRequest,
  ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
  /** Positive safe-integer overrides merged over `DEFAULT_SYNC_COORDINATOR_LIMITS`. */
  limits?: Partial<SyncCoordinatorLimits>;
}

/** Queue, version, connection, or error transition emitted by synchronization. */
export type SyncCoordinatorEvent =
  | { type: "state"; state: SyncStateSnapshot }
  | { type: "restored"; pending: readonly SyncMutationRecord[] }
  | { type: "persisting"; mutation: SyncMutationRecord }
  | { type: "pending"; mutation: SyncMutationRecord }
  | { type: "sending"; mutation: SyncMutationRecord }
  | {
      type: "acknowledged";
      clientMutationId: string;
      version: number;
      duplicate: boolean;
    }
  | {
      type: "conflict";
      mutation: SyncMutationRecord;
      response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
    }
  | { type: "remote-applied"; operation: VersionedOperation }
  | {
      type: "reload-required";
      expectedVersion: number;
      receivedVersion: number;
      snapshot?: WorkbookSnapshot;
    }
  | { type: "reloaded"; serverVersion: number; pending: readonly SyncMutationRecord[] }
  | { type: "recovered"; serverVersion: number; pending: readonly SyncMutationRecord[] }
  | { type: "storage-error"; error: SheetwriteError; clientMutationId?: string }
  | { type: "error"; error: SheetwriteError; clientMutationId?: string };

/** Why a conflict cannot be recovered in place; the host reloads the document instead. */
export type SyncConflictReloadReason =
  /** The conflict response carried no `operationsSinceBase` tail. */
  | "missing-operations"
  /** Pending work or a missed server version inserts, deletes, or moves rows or columns. */
  | "structural-change"
  /** Pending work and a server version it did not see touch the same cells or sheets. */
  | "overlapping-work"
  /** The server version moved past the conflict before recovery ran. */
  | "version-advanced"
  /** A pending mutation of this client is already in the server history. */
  | "own-mutation"
  /** The grid did not apply a missed server version. */
  | "rejected"
  /** A pending commit restores a history version; a restore is never rebased. */
  | "restore";

/** Outcome of `SyncCoordinator.recoverConflict`. */
export type SyncConflictRecovery =
  | { status: "recovered"; serverVersion: number }
  | { status: "reload-required"; reason: SyncConflictReloadReason; conflict?: RebaseConflict }
  | { status: "no-conflict" };

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

type SyncListener = (event: SyncCoordinatorEvent) => void;
function sync_failure(error: unknown, context?: SheetwriteErrorContext): SheetwriteError {
  return normalizeSheetwriteError(error, "sync-failed", "synchronize", context);
}

function sync_storage_failure(error: unknown, context?: SheetwriteErrorContext): SheetwriteError {
  return normalizeSheetwriteError(error, "sync-storage-failed", "synchronize", context);
}

const MUTATION_ID_RANDOM_BYTES = 16;
const BYTE_VALUES = 256;

/** Two lowercase hex digits per byte value, made at the first default mutation ID. */
let hex_byte_digits: readonly string[] | undefined;

/**
 * Random default mutation ID. Servers deduplicate by this ID, so two clients
 * must never produce the same one; a clock and a per-page counter can collide.
 * `getRandomValues` also works on pages without a secure context. Every commit
 * makes one, so the digits come from a table instead of formatting each byte.
 */
function create_default_mutation_id(): string {
  const bytes = new Uint8Array(MUTATION_ID_RANDOM_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  hex_byte_digits ??= Array.from({ length: BYTE_VALUES }, (_, byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  let id = "sheetwrite-";
  for (const byte of bytes) id += hex_byte_digits[byte] ?? "";
  return id;
}

/**
 * Deterministic, transport-neutral optimistic sync. Local rendering is never
 * blocked: changes queue immediately, while hosts explicitly call `sendNext`
 * or `retry` to perform network work.
 *
 * @example
 * ```ts
 * import { SyncCoordinator, type Grid, type PersistenceAdapter } from "@sheetwrite/core";
 *
 * async function connect(grid: Grid, adapter: PersistenceAdapter, documentId: string, serverVersion: number) {
 *   const sync = new SyncCoordinator(grid, adapter, { documentId, serverVersion });
 *   await sync.ready();
 *   await sync.flush();
 *   return sync; // Call sync.destroy() before removing the Grid.
 * }
 * ```
 * @see PersistenceAdapter
 * @see SyncCoordinator.recoverConflict
 */
export class SyncCoordinator {
  private readonly queue = new PendingRecordQueue();
  private readonly record_storage_revisions = new Map<string, bigint>();
  private readonly record_bytes = new Map<string, number>();
  private readonly local_reservations: LocalPendingReservation[] = [];
  private readonly acknowledged = new Set<string>();
  private readonly acknowledgement_order: string[] = [];
  private readonly listeners = new Set<SyncListener>();
  private readonly abort_controller = new AbortController();
  private readonly active_sends = new Map<string, AbortController>();
  private readonly persistence = new Map<string, Promise<void>>();
  private readonly storage_errors = new Map<string, unknown>();
  private readonly ambiguous_restores = new Set<string>();
  private readonly gap_buffer = new Map<number, BufferedVersionedOperation>();
  /** Received members of the atomic batch that starts at `serverVersion + 1`. */
  private batch_assembly?: BatchAssembly;
  /**
   * The latest unrecovered base-version conflict, and the server version the
   * Grid had applied when the first one arrived: a conflict moves `version` to
   * the server head without applying the versions in between.
   */
  private outstanding_conflict?: { response: ConflictResponse; appliedVersion: number };
  private readonly limits: Readonly<SyncCoordinatorLimits>;
  private readonly dispose_grid: () => void;
  private readonly ready_promise: Promise<void>;
  private dispose_remote?: () => void;
  private destroyed = false;
  private hydrating: boolean;
  private hydration_error: unknown;
  private recovery_promise?: Promise<void>;
  private inbound_tail: Promise<void> = Promise.resolve();
  private persistence_tail: Promise<void> = Promise.resolve();
  private flush_promise?: Promise<readonly PersistenceCommitResponse[]>;
  private connection: SyncConnectionState;
  /** The host's last `setOnline` choice; remote subscriptions do not change it. */
  private host_online: boolean;
  private version: number;
  private buffered_versions = 0;
  private buffered_operations = 0;
  private buffered_bytes = 0;
  private pending_commit_total = 0;
  private pending_operation_total = 0;
  private pending_encoded_byte_total = 0;

  /**
   * Starts syncing `grid` through `adapter`: from now on, each local change is
   * queued and sent in order. With `pendingStorage`, saved changes load first.
   */
  constructor(
    private readonly grid: Grid,
    private readonly adapter: PersistenceAdapter,
    private readonly options: SyncCoordinatorOptions,
  ) {
    this.limits = resolveLimits(options.limits);
    assertDocumentId(options.documentId);
    assertVersion(options.serverVersion, "serverVersion");
    if (options.authorId !== undefined) assertAuthorId(options.authorId, this.limits);

    this.version = options.serverVersion;
    this.connection = options.initialConnection ?? "online";
    this.host_online = this.connection === "online";
    this.hydrating = options.pendingStorage !== undefined;

    this.dispose_grid = registerGridTransactionAdmission(grid, {
      reserve: (operations) => this.reserve_local_transaction(operations),
      preservesOperations: true,
    });
    this.ready_promise = this.hydrating
      ? Promise.resolve()
          .then(() => this.restore_pending())
          .catch((error: unknown) => {
            if (this.destroyed) return;
            const failure = sync_storage_failure(error, { action: "hydrate" });
            this.hydration_error = failure;
            this.hydrating = false;
            this.emit_state();
            this.emit({ type: "storage-error", error: failure });
          })
      : Promise.resolve();
    if (this.hydrating) {
      void this.ready_promise.then(() => {
        if (!this.destroyed && this.connection === "online" && this.ambiguous_restores.size > 0) {
          void this.flush().catch(() => {});
        }
      });
    }
  }

  /** The last server version applied, from acknowledgements and remote operations. */
  get serverVersion(): number {
    return this.version;
  }

  /** Number of local changes not yet acknowledged by the server. */
  get pendingCount(): number {
    return this.pending_commit_total;
  }

  /** The current state, as a new object on each read. */
  get state(): SyncStateSnapshot {
    return {
      connection: this.destroyed ? "destroyed" : this.connection,
      activity: this.activity(),
      pendingCount: this.pending_commit_total,
      pendingOperations: this.pending_operation_total,
      pendingEncodedBytes: this.pending_encoded_byte_total,
      pendingCapacity: this.pending_capacity(),
      serverVersion: this.version,
    };
  }

  /** Copies of the unacknowledged local changes, oldest first, with their status. */
  pendingCommits(): readonly SyncMutationRecord[] {
    return this.queue.toArray().map(clone_record);
  }

  /** Calls `listener` for every sync event; returns a function that removes it. */
  on(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves after durable work is restored and every startup commit is visible locally. */
  async ready(): Promise<void> {
    await this.ready_promise;
    await Promise.all(this.persistence.values());
    if (this.hydration_error !== undefined) throw this.hydration_error;
    const storage_error = this.storage_errors.values().next();
    if (!storage_error.done) throw storage_error.value;
  }

  /**
   * Update connectivity. Reconnection drains durable work in order; going
   * offline aborts in-flight requests so retries retain their mutation IDs.
   */
  setOnline(online: boolean): void {
    if (this.destroyed) return;
    this.host_online = online;
    const next: SyncConnectionState = online ? "online" : "offline";
    if (this.connection === next) return;
    this.connection = next;
    if (!online) {
      for (const controller of this.active_sends.values()) {
        controller.abort();
      }
    }
    this.emit_state();
    if (online) void this.flush().catch(() => {});
  }

  /**
   * Applies remote versions from `source` as they arrive, replacing any earlier
   * source; returns a function that stops it.
   */
  subscribe(source: RemoteOperationSource | AsyncIterable<VersionedOperation>): () => void {
    this.dispose_remote?.();
    const controller = new AbortController();
    let dispose_source: (() => void) | undefined;
    let disposed = false;
    this.connection = "connecting";
    this.emit_state();

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      dispose_source?.();
      if (this.dispose_remote === cleanup) {
        this.dispose_remote = undefined;
        if (!this.destroyed) {
          this.connection = "offline";
          this.emit_state();
        }
      }
    };

    try {
      if (is_async_iterable(source)) {
        void this.consume_remote(source, controller.signal);
      } else {
        const dispose = source.subscribe((operation) => {
          const intake = this.applyVersionedOperation(operation);
          void intake.catch((error: unknown) =>
            this.handle_remote_intake_error(error, controller.signal),
          );
          return intake;
        }, controller.signal);
        dispose_source = typeof dispose === "function" ? dispose : undefined;
      }
      this.dispose_remote = cleanup;
      // A subscription delivers remote versions; it does not override the host's
      // offline flag, so queued work waits until the host calls `setOnline(true)`.
      this.connection = this.host_online ? "online" : "offline";
      this.emit_state();
      if (this.host_online) void this.flush().catch(() => {});
      return cleanup;
    } catch (error) {
      cleanup();
      this.connection = "error";
      this.emit_state();
      const failure = sync_failure(error, { action: "subscribe" });
      this.emit({ type: "error", error: failure });
      throw failure;
    }
  }

  /**
   * Sends queued changes one by one while online, stopping at a conflict;
   * resolves to the responses received.
   */
  async flush(): Promise<readonly PersistenceCommitResponse[]> {
    if (this.flush_promise) return this.flush_promise;
    const run = async (): Promise<readonly PersistenceCommitResponse[]> => {
      await this.ready();
      const responses: PersistenceCommitResponse[] = [];
      while (!this.destroyed && this.connection === "online") {
        const response = await this.sendNext();
        if (!response) break;
        responses.push(response);
        if (response.status === "conflict") break;
      }
      return responses;
    };
    const promise = run().finally(() => {
      if (this.flush_promise === promise) this.flush_promise = undefined;
    });
    this.flush_promise = promise;
    return promise;
  }

  /** Sends the oldest queued change; resolves to `null` when there is nothing to send. */
  async sendNext(): Promise<PersistenceCommitResponse | null> {
    if (this.hydrating) await this.ready_promise;
    if (this.hydration_error !== undefined) throw this.hydration_error;
    const record = this.queue.head();
    if (!record) return null;
    if (record.status === "persisting") {
      await this.persistence.get(record.clientMutationId);
      return this.sendNext();
    }
    const storage_error = this.storage_errors.get(record.clientMutationId);
    if (storage_error !== undefined) throw storage_error;
    return record.status === "pending" ? this.send(record.clientMutationId) : null;
  }

  /** Explicit retry; the original mutation ID and durable record are retained. */
  retry(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    return this.send(clientMutationId);
  }

  /**
   * Saves a change again after `pendingStorage` failed to save it; resolves to
   * `true` once it is saved.
   */
  async retryPersistence(clientMutationId: string): Promise<boolean> {
    await this.ready_promise;
    const record = this.queue.get(clientMutationId);
    if (!record || !this.options.pendingStorage || record.status !== "storage-error") return false;
    await this.schedule_persistence(record);
    return !this.storage_errors.has(clientMutationId);
  }

  /**
   * Sends one queued change, only when it is the oldest; resolves to `null`
   * when offline or when it cannot be sent now.
   */
  async send(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    if (this.destroyed || this.connection !== "online") return null;
    if (this.hydrating) await this.ready_promise;
    if (this.queue.head()?.clientMutationId !== clientMutationId) return null;
    let record = this.queue.get(clientMutationId);
    if (record?.status === "persisting") {
      await this.persistence.get(clientMutationId);
      record = this.queue.get(clientMutationId);
    }

    const storage_error = this.storage_errors.get(clientMutationId);
    if (storage_error !== undefined) throw storage_error;
    if (!record || record.status === "conflicted" || record.status === "sending") return null;
    this.queue.setStatus(record, "sending");
    this.emit_state();
    this.emit_mutation("sending", record);
    const controller = new AbortController();
    this.active_sends.set(clientMutationId, controller);

    try {
      const request = {
        documentId: record.documentId,
        baseVersion: record.baseVersion,
        clientMutationId: record.clientMutationId,
        operations: record.operations,
        ...(record.authorId !== undefined ? { authorId: record.authorId } : {}),
        ...(record.restore !== undefined ? { restore: { ...record.restore } } : {}),
        signal: controller.signal,
      };

      const version_operation_counts = record.versionOperationCounts;
      let response: PersistenceCommitResponse;
      if (version_operation_counts === undefined) {
        response = await this.adapter.commit(request);
      } else if (this.adapter.commitBatch) {
        response = await this.adapter.commitBatch({
          ...request,
          versionOperationCounts: version_operation_counts,
        });
      } else {
        throw new SyncProtocolError(
          "invalid-batch",
          `Mutation ${clientMutationId} spans several server versions, and the persistence adapter cannot commit an atomic batch`,
        );
      }

      await this.handleResponse(response, clientMutationId);
      return response;
    } catch (error) {
      const current = this.queue.get(clientMutationId);
      if (current?.status === "sending") this.queue.setStatus(current, "pending");
      // An abort (disconnect or destroy) is not a failure: the record stays
      // pending under its mutation ID, and the caller gets the abort reason.
      if (controller.signal.aborted) {
        if (!this.destroyed) this.emit_state();
        throw controller.signal.reason;
      }
      const failure = sync_failure(error, { action: "send", clientMutationId });
      if (!this.destroyed) {
        this.emit_state();
        this.emit({ type: "error", error: failure, clientMutationId });
      }

      throw failure;
    } finally {
      if (this.active_sends.get(clientMutationId) === controller) {
        this.active_sends.delete(clientMutationId);
      }
    }
  }

  /** Public for transports that deliver responses independently of send promises. */
  handleResponse(response: PersistenceCommitResponse, requestedMutationId?: string): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.enqueue_inbound(async () => {
      const previous_version = this.version;
      await this.process_response(response, requestedMutationId);
      if (response.status !== "conflict" && this.version > previous_version) {
        await this.drain_gap_buffer();
      }
    });
  }

  private async process_response(
    response: PersistenceCommitResponse,
    requested_mutation_id?: string,
  ): Promise<void> {
    if (this.destroyed) return;
    assertPersistenceResponse(response, this.limits);
    if (requested_mutation_id !== undefined) {
      assertMutationId(requested_mutation_id, this.limits);
    }

    if (response.status === "conflict") {
      const id = requested_mutation_id;
      const record = id ? this.queue.get(id) : undefined;
      if (!record) {
        this.emit({
          type: "error",
          error: sync_failure(
            new Error("Sheetwrite sync conflict did not identify a pending mutation"),
            { action: "process-response", ...(id ? { clientMutationId: id } : {}) },
          ),
          ...(id ? { clientMutationId: id } : {}),
        });

        return;
      }

      assertConflictRecovery(response, record.baseVersion);
      this.queue.setStatus(record, "conflicted");
      this.outstanding_conflict = {
        response,
        appliedVersion: this.outstanding_conflict?.appliedVersion ?? this.version,
      };

      this.version = Math.max(this.version, response.currentVersion);
      this.drop_stale_batch_assembly();
      this.emit_state();
      this.emit({ type: "conflict", mutation: clone_record(record), response });
      return;
    }

    if (
      requested_mutation_id !== undefined &&
      response.clientMutationId !== requested_mutation_id
    ) {
      throw new SyncProtocolError(
        "response-id-mismatch",
        `Persistence response for ${response.clientMutationId} does not match requested mutation ${requested_mutation_id}`,
      );
    }

    const id = response.clientMutationId;
    const record = this.queue.get(id);
    if (!record) {
      if (!this.acknowledged.has(id)) {
        this.emit({
          type: "error",
          error: sync_failure(
            new Error(`Sheetwrite sync response references unknown mutation ${id}`),
            { action: "process-response", clientMutationId: id },
          ),
          clientMutationId: id,
        });
      }

      return;
    }

    const operations =
      response.status === "applied" && this.ambiguous_restores.has(id)
        ? record.operations
        : undefined;
    if (operations && operations.length > 0) {
      assertCommitOperations(record, this.limits);
      const outcome = this.grid.applyRemoteOperations(
        record.versionOperationCounts ? markAtomicBatch(operations.slice()) : operations,
      );
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        const error = new SyncProtocolError(
          "remote-operations-rejected",
          `Sheetwrite sync canonical operations for ${id} were not applied`,
        );
        this.reject_inbound(error, response.version);
        throw error;
      }
    }

    this.grid.store.acknowledgeOperations?.(
      record.operations,
      this.record_storage_revisions.get(record.clientMutationId),
    );

    const storage = this.options.pendingStorage;
    if (storage) {
      try {
        await storage.remove(record.documentId, id);
      } catch (error) {
        const failure = sync_storage_failure(error, {
          action: "remove-pending",
          clientMutationId: id,
        });

        if (!this.destroyed) {
          this.emit_state();
          this.emit({ type: "storage-error", error: failure, clientMutationId: id });
        }

        throw failure;
      }
    }

    if (this.queue.get(id) !== record) return;

    if (!this.destroyed) this.version = Math.max(this.version, response.version);
    this.drop_stale_batch_assembly();
    const encoded_bytes = this.record_bytes.get(id);
    if (encoded_bytes === undefined) {
      throw new Error(`Pending mutation ${id} is missing resource accounting`);
    }

    this.pending_commit_total -= 1;
    this.pending_operation_total -= record.operations.length;
    this.pending_encoded_byte_total -= encoded_bytes;
    this.record_bytes.delete(id);
    this.record_storage_revisions.delete(id);
    this.queue.remove(id);
    this.ambiguous_restores.delete(id);
    this.storage_errors.delete(id);
    this.persistence.delete(id);
    if (this.destroyed) return;
    this.retain_acknowledgement(id);
    this.emit_state();
    this.emit({
      type: "acknowledged",
      clientMutationId: id,
      version: response.version,
      duplicate: response.status === "duplicate",
    });
  }

  /**
   * Applies one remote version to the grid. Versions must arrive in order; a
   * gap starts recovery through `recoverVersionGap`, or asks for a reload.
   */
  applyVersionedOperation(operation: VersionedOperation): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    let inspected: InspectedVersionedOperation;
    try {
      inspected = inspectVersionedOperation(operation, this.limits);
    } catch (error) {
      this.reject_inbound(
        asSyncProtocolError(error),
        validReceivedVersion((operation as { version?: unknown } | null)?.version),
      );
      return Promise.resolve();
    }

    if (
      inspected.version > this.version &&
      inspected.version - this.version > this.limits.maxFutureVersionDistance
    ) {
      this.clear_gap_buffer();
      this.reject_inbound(
        new SyncProtocolError(
          "future-distance-limit",
          `Remote version ${inspected.version} exceeds the future-version distance limit`,
        ),
        inspected.version,
      );
      return Promise.resolve();
    }

    const preflight_error = this.inbound_limit_error(inspected.operations.length, inspected.bytes);
    if (preflight_error) {
      this.clear_gap_buffer();
      this.reject_inbound(preflight_error, inspected.version);
      return Promise.resolve();
    }

    let validated: BufferedVersionedOperation;
    try {
      validated = {
        operation: {
          version: inspected.version,
          operations: cloneJsonValue(inspected.operations),
          ...(inspected.clientMutationId !== undefined
            ? { clientMutationId: inspected.clientMutationId }
            : {}),
          ...(inspected.batch !== undefined ? { batch: { ...inspected.batch } } : {}),
          ...(inspected.authorId !== undefined ? { authorId: inspected.authorId } : {}),
          ...(inspected.committedAt !== undefined ? { committedAt: inspected.committedAt } : {}),
        },
        bytes: inspected.bytes,
      };
    } catch (error) {
      this.reject_inbound(asSyncProtocolError(error), inspected.version);
      return Promise.resolve();
    }

    const reservation_error = this.reserve_inbound(validated);
    if (reservation_error) {
      this.clear_gap_buffer();
      this.reject_inbound(reservation_error, inspected.version);
      return Promise.resolve();
    }

    return this.enqueue_inbound(() => this.process_versioned_operation(validated)).finally(() => {
      if (!validated.retained) this.release_buffered(validated);
    });
  }

  /**
   * Resume only after the host remounted/reloaded document state and reapplied
   * retained local operations. No lossy structural merge is attempted here.
   */
  async resumeAfterReload(snapshot: WorkbookSnapshot): Promise<void> {
    if (this.destroyed) return;
    const version = snapshot.version ?? 0;
    assertVersion(version, "snapshot.version");
    const queue = await this.persist_queue_onto(version);
    if (this.destroyed) return;
    this.version = version;
    this.outstanding_conflict = undefined;
    this.clear_gap_buffer();
    this.adopt_queue_base(queue);
    this.emit_state();
    this.emit({
      type: "reloaded",
      serverVersion: this.version,
      pending: this.pendingCommits(),
    });
  }

  /**
   * Recover from the outstanding base-version conflict without reloading the
   * document. This succeeds when the pending work and every server version it
   * did not see change different cells, and neither inserts, deletes, or moves
   * rows or columns: the local Grid then already shows the server result plus
   * the pending work, so recovery applies the missed server versions and moves
   * the pending queue onto the new server version. Call `flush` afterwards to
   * send it. In every other case the pending queue and its durable storage do
   * not change and the result names the reason; the host then reloads and calls
   * `resumeAfterReload`. When a missed server version is rejected, the Grid can
   * already show earlier missed versions; the reload replaces them.
   *
   * @example
   * ```ts
   * import type { SyncCoordinator } from "@sheetwrite/core";
   *
   * async function recover(sync: SyncCoordinator) {
   *   const result = await sync.recoverConflict();
   *   if (result.status === "recovered") await sync.flush();
   *   // A reload-required result leaves the pending queue unchanged for host recovery.
   *   return result;
   * }
   * ```
   * @see SyncCoordinator.resumeAfterReload
   */
  async recoverConflict(): Promise<SyncConflictRecovery> {
    await this.ready();
    let result: SyncConflictRecovery = { status: "no-conflict" };
    await this.enqueue_inbound(async () => {
      result = await this.recover_conflict_in_place();
    });
    return result;
  }

  private async recover_conflict_in_place(): Promise<SyncConflictRecovery> {
    const conflict = this.outstanding_conflict;
    if (!conflict) return { status: "no-conflict" };
    const { response, appliedVersion: applied_version } = conflict;

    // A restore was planned against the version it conflicted with; the user
    // previews and restores again on the reloaded document.
    if (this.queue.toArray().some((record) => record.restore !== undefined)) {
      return { status: "reload-required", reason: "restore" };
    }
    const reload = (
      reason: SyncConflictReloadReason,
      rebase_conflict?: RebaseConflict,
    ): SyncConflictRecovery => ({
      status: "reload-required",
      reason,
      ...(rebase_conflict ? { conflict: rebase_conflict } : {}),
    });

    const tail = response.operationsSinceBase;
    if (!tail) return reload("missing-operations");
    if (this.version !== response.currentVersion || this.batch_assembly) {
      return reload("version-advanced");
    }

    const records = this.queue.toArray();
    if (tail.some((entry) => entry.clientMutationId && this.queue.has(entry.clientMutationId))) {
      return reload("own-mutation");
    }

    // Acknowledged versions of this client are already in the Grid, in server order.
    const missed = tail.filter(
      (entry) => !(entry.clientMutationId && this.acknowledged.has(entry.clientMutationId)),
    );
    if (
      tail.some((entry) => entry.operations.some(changesStructure)) ||
      records.some((record) => record.operations.some(changesStructure))
    ) {
      return reload("structural-change");
    }

    // Without structural changes no coordinate moves: each pending commit only
    // needs to touch other cells and sheets than the server versions it did not
    // see. Work queued after the conflict has the head as its base but saw only
    // what the Grid applied.
    for (const record of records) {
      const seen = Math.min(record.baseVersion, applied_version);
      const unseen = missed
        .filter((entry) => entry.version > seen)
        .flatMap((entry) => entry.operations);
      if (unseen.length === 0) continue;
      for (const result of [
        rebaseDocumentOperations(record.operations, unseen),
        rebaseDocumentOperations(unseen, record.operations),
      ]) {
        if (result.status === "conflict") return reload("overlapping-work", result.conflict);
      }
    }

    for (const group of group_atomic_batches(
      missed.filter((entry) => entry.version > applied_version),
    )) {
      const operations = group.flatMap((entry) => entry.operations as DocumentOp[]);
      if (operations.length === 0) continue;
      const outcome = this.grid.applyRemoteOperations(
        group.length > 1 ? markAtomicBatch(operations) : operations,
      );
      if (outcome.status !== "applied") return reload("rejected");
      for (const entry of group) {
        this.emit({ type: "remote-applied", operation: clone_versioned_operation(entry) });
      }
    }

    // Storage moves only after every missed version applied, so a rejection
    // leaves the durable queue on its old base for the reload.
    const queue = await this.persist_queue_onto(response.currentVersion);
    if (this.destroyed) return reload("rejected");
    this.outstanding_conflict = undefined;
    this.adopt_queue_base(queue);
    for (const [version, input] of this.gap_buffer) {
      if (version > this.version) continue;
      this.gap_buffer.delete(version);
      this.release_buffered(input);
    }

    this.emit_state();
    this.emit({ type: "recovered", serverVersion: this.version, pending: this.pendingCommits() });
    await this.drain_gap_buffer();
    return { status: "recovered", serverVersion: this.version };
  }

  /** Durably moves every pending commit onto `version`, in queue order. */
  private async persist_queue_onto(version: number): Promise<QueueBase> {
    const records = this.queue.toArray();
    let base_version = version;
    const replacements = records.map((record) => {
      const replacement: PendingCommit = {
        documentId: record.documentId,
        baseVersion: base_version,
        clientMutationId: record.clientMutationId,
        operations: record.operations,
        ...(record.versionOperationCounts
          ? { versionOperationCounts: record.versionOperationCounts }
          : {}),
        ...(record.authorId !== undefined ? { authorId: record.authorId } : {}),
        ...(record.restore !== undefined ? { restore: record.restore } : {}),
      };
      const versions = serverVersionsOf(record);
      for (let index = 0; index < versions; index++) base_version = incrementVersion(base_version);
      return replacement;
    });
    if (this.options.pendingStorage) {
      try {
        await this.schedule_queue_replacement(
          records.map((record) => record.clientMutationId),
          replacements,
        );
      } catch (error) {
        const failure = sync_storage_failure(error, { action: "replace-pending" });
        if (!this.destroyed) this.emit({ type: "storage-error", error: failure });
        throw failure;
      }
    }
    return { records, replacements };
  }

  /** Adopts durably persisted queue bases; every record becomes sendable again. */
  private adopt_queue_base({ records, replacements }: QueueBase): void {
    for (let index = 0; index < records.length; index++) {
      const record = records[index]!;
      record.baseVersion = replacements[index]!.baseVersion;
      this.queue.setStatus(record, "pending");
    }
  }

  /** Stops syncing: aborts requests in flight, stops the remote source and drops the in-memory queue. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dispose_grid();
    this.dispose_remote?.();
    this.dispose_remote = undefined;
    this.abort_controller.abort();
    for (const controller of this.active_sends.values()) {
      controller.abort(this.abort_controller.signal.reason);
    }
    this.active_sends.clear();
    this.clear_gap_buffer();
    this.queue.clear();
    this.record_storage_revisions.clear();
    this.record_bytes.clear();
    this.local_reservations.length = 0;
    this.pending_commit_total = 0;
    this.pending_operation_total = 0;
    this.pending_encoded_byte_total = 0;
    this.acknowledged.clear();
    this.acknowledgement_order.length = 0;
    this.connection = "destroyed";
    this.emit_state();
    this.listeners.clear();
  }

  private reserve_local_transaction(
    operations: readonly DocumentOp[],
  ): GridTransactionAdmissionDecision {
    if (this.destroyed || this.hydrating || this.hydration_error !== undefined) {
      const reason = this.destroyed
        ? "destroyed"
        : this.hydrating
          ? "restoring durable records"
          : "unavailable after a restore failure";
      return this.reject_pending_capacity(
        "pending-commits",
        this.limits.maxPendingCommits + 1,
        this.limits.maxPendingCommits,
        `The pending sync queue is ${reason}`,
      );
    }

    if (this.pending_commit_total + 1 > this.limits.maxPendingCommits) {
      return this.reject_pending_capacity(
        "pending-commits",
        this.pending_commit_total + 1,
        this.limits.maxPendingCommits,
        `Pending sync commits exceed the ${this.limits.maxPendingCommits} commit limit`,
      );
    }

    const operation_total = this.pending_operation_total + operations.length;
    if (operation_total > this.limits.maxPendingOperations) {
      return this.reject_pending_capacity(
        "pending-operations",
        operation_total,
        this.limits.maxPendingOperations,
        `Pending sync operations exceed the ${this.limits.maxPendingOperations} operation limit`,
      );
    }

    let sizes: number[];
    try {
      sizes = measureOperationBytes(
        operations,
        this.limits.maxPendingEncodedBytes - this.pending_encoded_byte_total,
      );
    } catch (error) {
      if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
        return this.reject_pending_capacity(
          "pending-encoded-bytes",
          this.pending_encoded_byte_total +
            (error.actual ??
              this.limits.maxPendingEncodedBytes - this.pending_encoded_byte_total + 1),
          this.limits.maxPendingEncodedBytes,
          `Pending sync operations exceed the ${this.limits.maxPendingEncodedBytes} encoded-byte limit`,
        );
      }

      throw error;
    }

    const encoded_bytes = operationArrayBytes(sizes);
    const version_issue = this.version_admission_issue(sizes, encoded_bytes);
    if (version_issue) {
      this.emit_state();
      this.emit({
        type: "error",
        error: new SyncProtocolError("batch-limit", version_issue.message),
      });

      return { ok: false, issue: version_issue };
    }

    const reserved_versions = this.version_operation_counts(sizes, encoded_bytes)?.length ?? 1;
    assertVersion(this.version + this.queue.versionCount + reserved_versions, "pending version");
    const restore = restoreProvenanceOf(operations);
    const reservation: LocalPendingReservation = {
      status: "reserved",
      clientMutationId: "",
      operationCount: operations.length,
      encodedBytes: encoded_bytes,
      ...(restore !== undefined ? { restore } : {}),
    };

    this.local_reservations.push(reservation);
    this.pending_commit_total += 1;
    this.pending_operation_total += reservation.operationCount;
    this.pending_encoded_byte_total += encoded_bytes;

    try {
      const client_mutation_id = this.options.createMutationId?.() ?? create_default_mutation_id();
      assertMutationId(client_mutation_id, this.limits);
      if (
        this.queue.has(client_mutation_id) ||
        this.acknowledged.has(client_mutation_id) ||
        this.local_reservations.some(
          (candidate) =>
            candidate !== reservation && candidate.clientMutationId === client_mutation_id,
        )
      ) {
        throw new Error(`Duplicate client mutation ID: ${client_mutation_id}`);
      }

      reservation.clientMutationId = client_mutation_id;
    } catch (error) {
      reservation.status = "cancelled";
      this.drain_local_reservations();
      const failure = sync_failure(error, { action: "reserve-local" });
      this.emit({ type: "error", error: failure });
      throw failure;
    }

    return {
      ok: true,
      reservation: {
        cancel: () => {
          if (reservation.status !== "reserved") return;
          reservation.status = "cancelled";
          this.drain_local_reservations();
        },
        finish: (outcome) => {
          if (reservation.status !== "reserved") return;
          if (outcome.status !== "applied") {
            reservation.status = "cancelled";
          } else {
            reservation.status = "applied";
            reservation.storageRevision = transactionStorageRevision(outcome.transaction);
            const applied = immutable_operations(outcome.transaction.patches);
            reservation.appliedOperations = applied.operations;
            const applied_sizes = applied.sizes;
            reservation.appliedEncodedBytes = operationArrayBytes(applied_sizes);
            reservation.appliedVersionOperationCounts = this.version_operation_counts(
              applied_sizes,
              reservation.appliedEncodedBytes,
            );
          }

          this.drain_local_reservations();
        },
      },
    };
  }

  private drain_local_reservations(): void {
    while (this.local_reservations[0]?.status !== "reserved") {
      const reservation = this.local_reservations.shift();
      if (!reservation) return;
      if (reservation.status === "cancelled") {
        this.pending_commit_total -= 1;
        this.pending_operation_total -= reservation.operationCount;
        this.pending_encoded_byte_total -= reservation.encodedBytes;
        if (!this.destroyed) this.emit_state();
        continue;
      }

      const operations = reservation.appliedOperations;
      const encoded_bytes = reservation.appliedEncodedBytes;
      if (operations === undefined || encoded_bytes === undefined)
        throw new Error("An applied sync reservation has no measured operations");
      const version_operation_counts = reservation.appliedVersionOperationCounts;
      this.pending_operation_total += operations.length - reservation.operationCount;
      this.pending_encoded_byte_total += encoded_bytes - reservation.encodedBytes;
      const record: SyncMutationRecord = {
        documentId: this.options.documentId,
        baseVersion: this.version + this.queue.versionCount,
        clientMutationId: reservation.clientMutationId,
        operations,
        ...(version_operation_counts ? { versionOperationCounts: version_operation_counts } : {}),
        ...(this.options.authorId !== undefined ? { authorId: this.options.authorId } : {}),
        ...(reservation.restore !== undefined ? { restore: reservation.restore } : {}),
        status: this.options.pendingStorage ? "persisting" : "pending",
      };

      this.queue.add(record);
      if (reservation.storageRevision !== undefined) {
        this.record_storage_revisions.set(record.clientMutationId, reservation.storageRevision);
      }

      this.record_bytes.set(record.clientMutationId, encoded_bytes);

      if (this.options.pendingStorage) {
        this.emit_state();
        this.emit_mutation("persisting", record);
        const pending = this.schedule_persistence(record);
        this.persistence.set(record.clientMutationId, pending);
      } else {
        this.emit_state();
        this.emit_mutation("pending", record);
      }
    }
  }

  /**
   * Check before the local apply that a commit fits one server version, or
   * that the adapter can commit it as one atomic batch within the batch limits.
   * `sizes` are the JSON bytes of each operation.
   */
  private version_admission_issue(
    sizes: readonly number[],
    encoded_bytes: number,
  ): Extract<MutationIssue, { kind: "resource-limit" }> | undefined {
    const limits = this.limits;
    const fits_one_version =
      sizes.length <= limits.maxOperationsPerVersion &&
      encoded_bytes <= limits.maxVersionPayloadBytes;
    if (fits_one_version) return undefined;
    const issue = (
      resource: "operations" | "encoded-bytes" | "batch-versions",
      actual: number,
      max: number,
      message: string,
    ): Extract<MutationIssue, { kind: "resource-limit" }> => ({
      kind: "resource-limit",
      severity: "error",
      resource,
      actual,
      max,
      message,
    });

    if (!this.adapter.commitBatch) {
      return encoded_bytes > limits.maxVersionPayloadBytes
        ? issue(
            "encoded-bytes",
            encoded_bytes,
            limits.maxVersionPayloadBytes,
            `The commit is larger than one server version (${limits.maxVersionPayloadBytes} bytes), and the persistence adapter cannot commit an atomic batch`,
          )
        : issue(
            "operations",
            sizes.length,
            limits.maxOperationsPerVersion,
            `The commit has more operations than one server version (${limits.maxOperationsPerVersion}), and the persistence adapter cannot commit an atomic batch`,
          );
    }

    if (encoded_bytes > limits.maxBatchBytes) {
      return issue(
        "encoded-bytes",
        encoded_bytes,
        limits.maxBatchBytes,
        `The commit exceeds the ${limits.maxBatchBytes} byte atomic batch limit`,
      );
    }

    const counts = partitionVersionOperations(
      sizes,
      limits.maxOperationsPerVersion,
      limits.maxVersionPayloadBytes,
    );
    if (!counts) {
      return issue(
        "encoded-bytes",
        encoded_bytes,
        limits.maxVersionPayloadBytes,
        `One operation of the commit is larger than one server version (${limits.maxVersionPayloadBytes} bytes)`,
      );
    }

    if (counts.length > limits.maxBatchVersions) {
      return issue(
        "batch-versions",
        counts.length,
        limits.maxBatchVersions,
        `The commit needs ${counts.length} server versions, above the ${limits.maxBatchVersions} version atomic batch limit`,
      );
    }

    return undefined;
  }

  /**
   * Operation counts of the atomic batch versions for admitted operations, or
   * `undefined` when they fit one version. Admission already checked the
   * requested operations; the applied operations are the same or fewer.
   */
  private version_operation_counts(
    sizes: readonly number[],
    encoded_bytes: number,
  ): readonly number[] | undefined {
    const limits = this.limits;
    if (
      sizes.length <= limits.maxOperationsPerVersion &&
      encoded_bytes <= limits.maxVersionPayloadBytes
    ) {
      return undefined;
    }
    const counts = partitionVersionOperations(
      sizes,
      limits.maxOperationsPerVersion,
      limits.maxVersionPayloadBytes,
    );
    if (!counts || counts.length < 2 || counts.length > limits.maxBatchVersions) {
      throw new Error("Applied operations do not fit the admitted atomic batch");
    }
    return Object.freeze(counts);
  }

  private reject_pending_capacity(
    resource: Extract<MutationIssue, { kind: "resource-limit" }>["resource"],
    actual: number,
    max: number,
    message: string,
  ): GridTransactionAdmissionDecision {
    const issue: Extract<MutationIssue, { kind: "resource-limit" }> = {
      kind: "resource-limit",
      severity: "error",
      resource,
      actual,
      max,
      message,
    };
    this.emit_state();
    this.emit({ type: "error", error: new SyncPendingCapacityError(issue) });
    return { ok: false, issue };
  }

  private async restore_pending(): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage) return;
    const loaded = await storage.load(this.options.documentId, {
      signal: this.abort_controller.signal,
      maxRecords: this.limits.maxPendingCommits,
      maxOperations: this.limits.maxPendingOperations,
      maxBytes: this.limits.maxPendingEncodedBytes,
    });
    if (this.destroyed) return;
    if (!Array.isArray(loaded)) {
      throw new SyncProtocolError("invalid-operations", "Durable queue did not return an array");
    }
    if (loaded.length > this.limits.maxPendingCommits) {
      throw new SyncProtocolError(
        "pending-count-limit",
        "Durable queue record count exceeds the pending commit limit",
      );
    }

    const restored_bytes_by_index: number[] = [];
    const mutation_ids = new Set<string>();
    let restored_operations = 0;
    let restored_bytes = 0;
    for (const pending of loaded) {
      const bytes = assertPendingCommit(pending, this.options.documentId, this.limits);
      restored_bytes_by_index.push(bytes);
      restored_operations += pending.operations.length;
      restored_bytes += bytes;
      if (restored_operations > this.limits.maxPendingOperations) {
        throw new SyncProtocolError(
          "pending-operation-limit",
          "Durable queue operations exceed the aggregate pending limit",
        );
      }
      if (restored_bytes > this.limits.maxPendingEncodedBytes) {
        throw new SyncProtocolError(
          "pending-byte-limit",
          "Durable queue bytes exceed the aggregate pending limit",
        );
      }
      if (mutation_ids.has(pending.clientMutationId)) {
        throw new SyncProtocolError(
          "invalid-id",
          `Durable queue contains duplicate mutation ID ${pending.clientMutationId}`,
        );
      }
      mutation_ids.add(pending.clientMutationId);
    }

    const prepared = loaded.map((pending, index) => ({
      record: {
        ...clone_pending_commit(pending),
        status: "pending" as const,
      },
      bytes: restored_bytes_by_index[index]!,
    }));
    let first_ambiguous_base: number | undefined;
    let ambiguous_sequence = false;
    const ambiguous_ids = new Set<string>();
    for (const { record } of prepared) {
      incrementVersion(record.baseVersion);
      if (ambiguous_sequence || record.baseVersion < this.version) {
        ambiguous_sequence = true;
        ambiguous_ids.add(record.clientMutationId);
        first_ambiguous_base ??= record.baseVersion;
      }
    }

    const rollbacks: TransactionReplayRollback[] = [];
    const storage_revisions = new Map<string, bigint>();
    let restored = false;
    let restore_failure: SheetwriteError | undefined;

    try {
      for (const { record } of prepared) {
        if (this.destroyed) break;
        if (ambiguous_ids.has(record.clientMutationId)) continue;

        const replay = record.versionOperationCounts
          ? markAtomicBatch(record.operations.slice())
          : record.operations;

        const outcome = this.grid.applyRemoteOperations(requestTransactionReplayRollback(replay), {
          localReplay: true,
        });

        if (outcome.status === "applied") {
          const rollback = takeTransactionReplayRollback(outcome.transaction);
          if (rollback) rollbacks.push(rollback);

          const revision = transactionStorageRevision(outcome.transaction);
          if (revision !== undefined) storage_revisions.set(record.clientMutationId, revision);
        }

        if (
          outcome.status === "conflict" ||
          outcome.status === "rejected" ||
          (outcome.status === "noop" && record.operations.length > 0) ||
          (outcome.status === "applied" && outcome.transaction.patches.length !== replay.length)
        ) {
          throw new Error(`Durable mutation ${record.clientMutationId} could not be restored`);
        }
      }

      restored = !this.destroyed;
    } catch (error) {
      restore_failure = sync_storage_failure(error, { action: "hydrate" });
    }

    const failures: unknown[] = [];
    const finalizing = restored ? rollbacks : rollbacks.reverse();

    for (const rollback of finalizing) {
      try {
        if (!this.destroyed) {
          if (restored) rollback.commit();
          else rollback.rollback();
        }
      } catch (error) {
        failures.push(error);
      } finally {
        try {
          rollback.dispose();
        } catch (error) {
          failures.push(error);
        }
      }
    }

    if (failures.length > 0) {
      if (restore_failure?.cause !== undefined) failures.unshift(restore_failure.cause);

      const failure = new AggregateError(failures, "Durable replay finalization failed");

      if (restore_failure) restore_failure.cause = failure;
      else throw failure;
    }

    if (restore_failure) throw restore_failure;
    if (this.destroyed) return;

    for (const [id, revision] of storage_revisions) this.record_storage_revisions.set(id, revision);

    for (const { record, bytes } of prepared) {
      this.queue.add(record);
      this.record_bytes.set(record.clientMutationId, bytes);
      if (ambiguous_ids.has(record.clientMutationId)) {
        this.ambiguous_restores.add(record.clientMutationId);
      }
    }
    this.pending_commit_total = prepared.length;
    this.pending_operation_total = restored_operations;
    this.pending_encoded_byte_total = restored_bytes;
    this.hydrating = false;
    this.emit_state();
    this.emit({ type: "restored", pending: this.pendingCommits() });
    if (first_ambiguous_base !== undefined && this.connection !== "online") {
      this.emit({
        type: "reload-required",
        expectedVersion: first_ambiguous_base + 1,
        receivedVersion: this.version,
      });
    }
  }

  private schedule_persistence(
    record: SyncMutationRecord,
    wait_until_ready = false,
  ): Promise<void> {
    const scheduled = this.persistence_tail.then(async () => {
      if (wait_until_ready) await this.ready_promise;
      await this.persist_record(record);
    });
    this.persistence_tail = scheduled.catch(() => {});
    return scheduled;
  }

  private schedule_queue_replacement(
    expected_client_mutation_ids: readonly string[],
    commits: readonly PendingCommit[],
  ): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage) return Promise.resolve();
    const scheduled = this.persistence_tail.then(() =>
      storage.replace(
        this.options.documentId,
        expected_client_mutation_ids,
        commits.map(clone_pending_commit),
        this.abort_controller.signal,
      ),
    );
    this.persistence_tail = scheduled.catch(() => {});
    return scheduled;
  }

  private async persist_record(record: SyncMutationRecord): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage || this.destroyed) return;
    this.queue.setStatus(record, "persisting");
    this.storage_errors.delete(record.clientMutationId);
    try {
      await storage.put(clone_pending_commit(record), this.abort_controller.signal);
      if (this.destroyed || !this.queue.has(record.clientMutationId)) return;
      this.queue.setStatus(record, "pending");
      this.emit_state();
      this.emit_mutation("pending", record);
    } catch (error) {
      if (this.destroyed) return;
      const failure = sync_storage_failure(error, {
        action: "persist-pending",
        clientMutationId: record.clientMutationId,
      });
      this.queue.setStatus(record, "storage-error");
      this.storage_errors.set(record.clientMutationId, failure);
      this.emit_state();
      this.emit({
        type: "storage-error",
        error: failure,
        clientMutationId: record.clientMutationId,
      });
    }
  }

  private enqueue_inbound(task: () => void | Promise<void>): Promise<void> {
    const queued = this.inbound_tail.then(async () => {
      if (!this.destroyed) await task();
    });
    this.inbound_tail = queued.catch(() => {});
    return queued;
  }

  private async process_versioned_operation(input: BufferedVersionedOperation): Promise<void> {
    const { operation } = input;
    const mutation_id = operation.clientMutationId;
    if (operation.version <= this.version) {
      if (mutation_id && this.queue.has(mutation_id)) {
        // Only the last member of an own batch acknowledges the whole batch.
        if (operation.batch === undefined || operation.batch.index === operation.batch.count - 1) {
          await this.process_response({
            status: "applied",
            version: operation.version,
            clientMutationId: mutation_id,
          });
        }
      } else if (mutation_id && !this.acknowledged.has(mutation_id)) {
        this.reject_inbound(
          new SyncProtocolError(
            "late-echo",
            `Remote mutation ${mutation_id} is older than the retained acknowledgement window`,
          ),
          operation.version,
          false,
        );
      }
      return;
    }
    // A source that restarts after a reconnect can deliver members of the
    // batch being assembled again; the assembly already holds them.
    if (operation.version <= this.contiguous_head()) return;

    if (mutation_id && this.acknowledged.has(mutation_id)) {
      this.reject_inbound(
        new SyncProtocolError(
          "late-echo",
          `Acknowledged mutation ${mutation_id} arrived at an unexpected future version`,
        ),
        operation.version,
        false,
      );
      return;
    }

    const expected_version = incrementVersion(this.contiguous_head());
    if (operation.version !== expected_version) {
      const distance = operation.version - this.version;
      if (distance > this.limits.maxFutureVersionDistance) {
        this.clear_gap_buffer();
        this.reject_inbound(
          new SyncProtocolError(
            "future-distance-limit",
            `Remote version ${operation.version} exceeds the future-version distance limit`,
          ),
          operation.version,
        );
        return;
      }
      if (!this.gap_buffer.has(operation.version)) {
        input.retained = true;
        this.gap_buffer.set(operation.version, input);
      }
      this.emit_reload_required(operation.version);
      this.request_gap_recovery(operation.version);
      return;
    }

    if (await this.apply_contiguous_operation(input)) {
      await this.drain_gap_buffer();
    }
  }

  private async apply_contiguous_operation(input: BufferedVersionedOperation): Promise<boolean> {
    const { operation } = input;
    if (operation.batch !== undefined || this.batch_assembly !== undefined) {
      return this.assemble_batch_member(input);
    }
    const mutation_id = operation.clientMutationId;
    if (mutation_id && this.queue.has(mutation_id)) {
      await this.process_response({
        status: "applied",
        version: operation.version,
        clientMutationId: mutation_id,
      });
      return this.version >= operation.version;
    }

    if (operation.operations.length > 0) {
      const outcome = this.grid.applyRemoteOperations(operation.operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        this.reject_inbound(
          new SyncProtocolError(
            "remote-operations-rejected",
            `Remote operation ${operation.version} was not applied by the grid`,
          ),
          operation.version,
        );
        return false;
      }
    }

    this.version = operation.version;
    this.emit_state();
    this.emit({ type: "remote-applied", operation: clone_versioned_operation(operation) });
    return true;
  }

  /**
   * Hold each contiguous member of an atomic batch without touching the grid
   * or the server version. The complete batch applies as one transaction.
   */
  private async assemble_batch_member(input: BufferedVersionedOperation): Promise<boolean> {
    const { operation } = input;
    const member = operation.batch;
    const assembly = this.batch_assembly;
    const continues_batch =
      member !== undefined &&
      (member.index === 0
        ? assembly === undefined
        : assembly !== undefined &&
          member.index === assembly.members.length &&
          member.count === assembly.count &&
          operation.clientMutationId === assembly.clientMutationId &&
          operation.authorId === assembly.authorId);
    if (!continues_batch) {
      const start_version = assembly?.members[0]?.version ?? operation.version;
      this.batch_assembly = undefined;
      this.reject_inbound(
        new SyncProtocolError(
          "invalid-batch",
          `Remote version ${operation.version} does not continue an atomic batch`,
        ),
        start_version,
      );
      return false;
    }

    const next: BatchAssembly = assembly ?? {
      count: member.count,
      members: [],
      bytes: 0,
      ...(operation.clientMutationId !== undefined
        ? { clientMutationId: operation.clientMutationId }
        : {}),
      ...(operation.authorId !== undefined ? { authorId: operation.authorId } : {}),
    };

    if (next.bytes + input.bytes > this.limits.maxBatchBytes) {
      this.batch_assembly = undefined;
      this.reject_inbound(
        new SyncProtocolError(
          "batch-limit",
          `Remote atomic batch exceeds the ${this.limits.maxBatchBytes} byte limit`,
        ),
        next.members[0]?.version ?? operation.version,
      );
      return false;
    }

    next.members.push(operation);
    next.bytes += input.bytes;
    if (next.members.length < next.count) {
      this.batch_assembly = next;
      return true;
    }

    this.batch_assembly = undefined;
    return this.apply_complete_batch(next);
  }

  private async apply_complete_batch(assembly: BatchAssembly): Promise<boolean> {
    const first = assembly.members[0];
    const last = assembly.members.at(-1);
    if (!first || !last) throw new Error("A complete atomic batch has no members");
    const mutation_id = assembly.clientMutationId;
    if (mutation_id && this.queue.has(mutation_id)) {
      await this.process_response({
        status: "applied",
        version: last.version,
        clientMutationId: mutation_id,
      });
      return this.version >= last.version;
    }

    const operations = markAtomicBatch(
      assembly.members.flatMap((member) => member.operations as DocumentOp[]),
    );
    if (operations.length > 0) {
      const outcome = this.grid.applyRemoteOperations(operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        this.reject_inbound(
          new SyncProtocolError(
            "remote-operations-rejected",
            `Remote atomic batch ${first.version}-${last.version} was not applied by the grid`,
          ),
          first.version,
        );
        return false;
      }
    }

    this.version = last.version;
    this.emit_state();
    for (const member of assembly.members) {
      this.emit({ type: "remote-applied", operation: clone_versioned_operation(member) });
    }
    return true;
  }

  /** Last contiguous version received: the server version or the last assembled batch member. */
  private contiguous_head(): number {
    return this.batch_assembly?.members.at(-1)?.version ?? this.version;
  }

  /** Drop an assembly that an acknowledgement or conflict moved the server version past. */
  private drop_stale_batch_assembly(): void {
    const start = this.batch_assembly?.members[0]?.version;
    if (start !== undefined && start <= this.version) this.batch_assembly = undefined;
  }

  private inbound_limit_error(
    operation_count: number,
    bytes: number,
  ): SyncProtocolError | undefined {
    if (this.buffered_versions >= this.limits.maxBufferedVersions) {
      return new SyncProtocolError("buffer-count-limit", "Inbound version count limit exceeded");
    }
    if (this.buffered_operations + operation_count > this.limits.maxBufferedOperations) {
      return new SyncProtocolError(
        "buffer-operation-limit",
        "Inbound operation count limit exceeded",
      );
    }
    if (this.buffered_bytes + bytes > this.limits.maxBufferedBytes) {
      return new SyncProtocolError("buffer-byte-limit", "Inbound byte limit exceeded");
    }
    return undefined;
  }

  private reserve_inbound(input: BufferedVersionedOperation): SyncProtocolError | undefined {
    const error = this.inbound_limit_error(input.operation.operations.length, input.bytes);
    if (error) return error;
    this.buffered_versions += 1;
    this.buffered_operations += input.operation.operations.length;
    this.buffered_bytes += input.bytes;
    return undefined;
  }

  private release_buffered(input: BufferedVersionedOperation): void {
    input.retained = false;
    this.buffered_versions -= 1;
    this.buffered_operations -= input.operation.operations.length;
    this.buffered_bytes -= input.bytes;
  }

  private emit_reload_required(received_version: number): void {
    this.emit({
      type: "reload-required",
      expectedVersion: incrementVersion(this.contiguous_head()),
      receivedVersion: received_version,
    });
  }

  private reject_inbound(
    error: SyncProtocolError,
    received_version?: number,
    recover = true,
  ): void {
    if (this.destroyed) return;
    this.emit({ type: "error", error });
    if (received_version === undefined) return;
    this.emit_reload_required(received_version);
    if (recover && received_version >= incrementVersion(this.contiguous_head())) {
      this.request_gap_recovery(received_version);
    }
  }

  private retain_acknowledgement(client_mutation_id: string): void {
    if (this.acknowledged.has(client_mutation_id)) return;
    this.acknowledged.add(client_mutation_id);
    this.acknowledgement_order.push(client_mutation_id);
    if (this.acknowledgement_order.length <= this.limits.maxRecentAcknowledgements) return;
    const expired = this.acknowledgement_order.shift();
    if (expired !== undefined) this.acknowledged.delete(expired);
  }

  private clear_gap_buffer(): void {
    for (const input of this.gap_buffer.values()) this.release_buffered(input);
    this.gap_buffer.clear();
    this.batch_assembly = undefined;
  }

  private request_gap_recovery(received_version: number): void {
    const recover = this.options.recoverVersionGap;
    if (!recover || this.recovery_promise || this.destroyed) return;
    const expected_version = incrementVersion(this.contiguous_head());
    this.recovery_promise = recover({
      documentId: this.options.documentId,
      expectedVersion: expected_version,
      receivedVersion: received_version,
      signal: this.abort_controller.signal,
    })
      .then(async (recovery) => {
        if (this.destroyed) return;
        if (Array.isArray(recovery)) {
          if (recovery.length > this.limits.maxFutureVersionDistance) {
            throw new SyncProtocolError(
              "future-distance-limit",
              "Version-gap recovery returned too many operations",
            );
          }

          for (const operation of recovery) {
            assertVersion((operation as { version?: unknown } | null)?.version, "version");
          }

          const ordered = recovery.slice().sort((a, b) => a.version - b.version);
          for (const operation of ordered) await this.applyVersionedOperation(operation);
          return;
        }

        const snapshot = recovery as WorkbookSnapshot;
        this.emit({
          type: "reload-required",
          expectedVersion: incrementVersion(this.contiguous_head()),
          receivedVersion: received_version,
          snapshot: cloneJsonValue(snapshot),
        });
      })
      .catch((error: unknown) => {
        this.handle_remote_intake_error(error, this.abort_controller.signal);
      })
      .finally(() => {
        this.recovery_promise = undefined;
      });
  }

  private async drain_gap_buffer(): Promise<void> {
    while (!this.destroyed) {
      const expected_version = incrementVersion(this.contiguous_head());
      const next = this.gap_buffer.get(expected_version);
      if (!next) return;
      if (!(await this.apply_contiguous_operation(next))) return;
      this.gap_buffer.delete(expected_version);
      this.release_buffered(next);
    }
  }

  private async consume_remote(
    source: AsyncIterable<VersionedOperation>,
    signal: AbortSignal,
  ): Promise<void> {
    const iterator = source[Symbol.asyncIterator]();
    let closing = false;
    const close = () => {
      if (closing || !iterator.return) return;
      closing = true;
      try {
        void iterator.return().catch((error: unknown) => {
          this.handle_remote_intake_error(error, signal);
        });
      } catch (error) {
        this.handle_remote_intake_error(error, signal);
      }
    };
    signal.addEventListener("abort", close, { once: true });
    try {
      while (!signal.aborted && !this.destroyed) {
        const next = await iterator.next();
        if (next.done || signal.aborted || this.destroyed) break;
        await this.applyVersionedOperation(next.value);
      }
    } catch (error) {
      this.handle_remote_intake_error(error, signal);
      close();
    } finally {
      signal.removeEventListener("abort", close);
      if (signal.aborted || this.destroyed) close();
    }
  }

  private handle_remote_intake_error(error: unknown, signal: AbortSignal): void {
    if (signal.aborted || this.destroyed) return;
    this.connection = "error";
    this.emit_state();
    this.emit({
      type: "error",
      error: sync_failure(error, { action: "receive-remote" }),
    });
  }

  private activity(): SyncActivityState {
    if (this.destroyed) return "destroyed";
    if (this.hydrating) return "hydrating";
    if (this.hydration_error !== undefined || this.storage_errors.size > 0) return "error";
    const busy = this.queue.firstBusyStatus();
    if (busy === "conflicted") return "conflict";
    if (busy !== undefined) return busy;
    return this.queue.count("pending") > 0 ? "pending" : "idle";
  }

  private pending_capacity(): SyncPendingCapacityState {
    if (this.destroyed) return "destroyed";
    if (this.hydrating) return "hydrating";
    if (this.hydration_error !== undefined) return "restore-error";
    if (
      this.pending_commit_total >= this.limits.maxPendingCommits ||
      this.pending_operation_total >= this.limits.maxPendingOperations ||
      this.pending_encoded_byte_total >= this.limits.maxPendingEncodedBytes
    ) {
      return "full";
    }
    return "available";
  }

  private emit_state(): void {
    if (this.listeners.size === 0) return;
    this.emit({ type: "state", state: this.state });
  }

  /**
   * Announce `record` as `type`. Listeners get a copy, made only when someone
   * listens: a queue without listeners copies nothing per commit.
   */
  private emit_mutation(
    type: "persisting" | "pending" | "sending",
    record: SyncMutationRecord,
  ): void {
    if (this.listeners.size === 0) return;
    this.emit({ type, mutation: clone_record(record) });
  }

  private emit(event: SyncCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

interface LocalPendingReservation {
  status: "reserved" | "applied" | "cancelled";
  clientMutationId: string;
  operationCount: number;
  encodedBytes: number;
  appliedOperations?: readonly DocumentOp[];
  appliedEncodedBytes?: number;
  appliedVersionOperationCounts?: readonly number[];
  /** Restore provenance of the reserved operations, if they restore a history version. */
  restore?: RestoreProvenance;
  storageRevision?: bigint;
}

/** Contiguous members of one remote atomic batch received so far. */
interface BatchAssembly {
  clientMutationId?: string;
  /** Every member of one batch names the same author. */
  authorId?: string;
  count: number;
  members: VersionedOperation[];
  /** Encoded operation bytes of the members, bounded by `maxBatchBytes`. */
  bytes: number;
}

/** Pending records in queue order and their commits moved onto a new server version. */
interface QueueBase {
  records: SyncMutationRecord[];
  replacements: PendingCommit[];
}

/** Groups consecutive versions so each atomic batch applies as one transaction. */
function group_atomic_batches(versions: readonly VersionedOperation[]): VersionedOperation[][] {
  const groups: VersionedOperation[][] = [];
  let open: VersionedOperation[] | undefined;
  for (const version of versions) {
    if (version.batch === undefined) {
      open = undefined;
      groups.push([version]);
      continue;
    }
    if (version.batch.index === 0 || !open) {
      open = [];
      groups.push(open);
    }
    open.push(version);
    if (version.batch.index === version.batch.count - 1) open = undefined;
  }
  return groups;
}

interface BufferedVersionedOperation {
  operation: VersionedOperation;
  bytes: number;
  retained?: boolean;
}

function clone_pending_commit(commit: PendingCommit): PendingCommit {
  return {
    documentId: commit.documentId,
    baseVersion: commit.baseVersion,
    clientMutationId: commit.clientMutationId,
    operations: cloneJsonValue(commit.operations),
    ...(commit.versionOperationCounts
      ? { versionOperationCounts: [...commit.versionOperationCounts] }
      : {}),
    ...(commit.authorId !== undefined ? { authorId: commit.authorId } : {}),
    ...(commit.restore !== undefined ? { restore: { ...commit.restore } } : {}),
  };
}

function is_async_iterable(
  source: RemoteOperationSource | AsyncIterable<VersionedOperation>,
): source is AsyncIterable<VersionedOperation> {
  return Symbol.asyncIterator in source;
}

/**
 * Deep-frozen JSON copy of applied operations with the exact JSON bytes of
 * each one, taken from the copy's own encoding instead of a second walk.
 */
function immutable_operations(operations: readonly DocumentOp[]): {
  operations: readonly DocumentOp[];
  sizes: number[];
} {
  const copies: DocumentOp[] = new Array(operations.length);
  const sizes: number[] = new Array(operations.length);
  for (let index = 0; index < operations.length; index++) {
    const json = JSON.stringify(operations[index]);
    sizes[index] = utf8ByteLength(json, Number.POSITIVE_INFINITY);
    copies[index] = JSON.parse(json) as DocumentOp;
  }
  return { operations: deep_freeze(copies), sizes };
}

function clone_record(record: SyncMutationRecord): SyncMutationRecord {
  return {
    ...clone_pending_commit(record),
    status: record.status,
  };
}

function clone_versioned_operation(operation: VersionedOperation): VersionedOperation {
  return {
    version: operation.version,
    operations: cloneJsonValue(operation.operations),
    ...(operation.clientMutationId ? { clientMutationId: operation.clientMutationId } : {}),
    ...(operation.batch ? { batch: { ...operation.batch } } : {}),
    ...(operation.authorId !== undefined ? { authorId: operation.authorId } : {}),
    ...(operation.committedAt !== undefined ? { committedAt: operation.committedAt } : {}),
  };
}

function deep_freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    // Iterate arrays in place: `Object.values` copies a million-cell block.
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      if (child && typeof child === "object") deep_freeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
