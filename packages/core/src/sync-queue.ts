import type { PendingCommit, SyncMutationRecord, SyncMutationStatus } from "./types/transaction.js";

/** Record statuses that decide the activity of a queue in queue order. */
type BusyMutationStatus = Extract<SyncMutationStatus, "conflicted" | "sending" | "persisting">;

function is_busy_status(status: SyncMutationStatus): status is BusyMutationStatus {
  return status === "conflicted" || status === "sending" || status === "persisting";
}

/** Fewest acknowledged IDs at the front of `order` that a compaction drops. */
const COMPACT_MIN_HEAD = 64;

/**
 * Pending records in queue order. Every add, removal, and status change goes
 * through here so the running totals stay exact: a local commit, state
 * snapshot, or send then costs the same at any queue depth.
 */
export class PendingRecordQueue {
  private readonly records = new Map<string, SyncMutationRecord>();
  /**
   * Mutation IDs in queue order from `start`, always the keys of `records`.
   * Kept beside the map because JavaScriptCore finds the first entry of a Map
   * by walking the slots of entries deleted from its front, which the head
   * lookup would hit after every acknowledgement.
   */
  private readonly order: string[] = [];
  /**
   * Index of the head in `order`. Acknowledging the head only moves it, so a
   * drain costs the same per acknowledgement at any depth. The acknowledged
   * prefix is dropped once it holds at least `COMPACT_MIN_HEAD` IDs and at
   * least half of `order`.
   */
  private start = 0;

  private readonly status_counts: Record<SyncMutationStatus, number> = {
    persisting: 0,
    pending: 0,
    sending: 0,
    conflicted: 0,
    "storage-error": 0,
  };

  private server_versions = 0;

  /** Server versions the queued records occupy once acknowledged. */
  get versionCount(): number {
    return this.server_versions;
  }

  get(clientMutationId: string): SyncMutationRecord | undefined {
    return this.records.get(clientMutationId);
  }

  has(clientMutationId: string): boolean {
    return this.records.has(clientMutationId);
  }

  head(): SyncMutationRecord | undefined {
    const id = this.order[this.start];
    return id === undefined ? undefined : this.records.get(id);
  }

  count(status: SyncMutationStatus): number {
    return this.status_counts[status];
  }

  /** Records in queue order, in a new array. */
  toArray(): SyncMutationRecord[] {
    return Array.from(this.records.values());
  }

  /** Status of the first record in queue order that is conflicted, sending, or persisting. */
  firstBusyStatus(): BusyMutationStatus | undefined {
    const head_status = this.head()?.status;
    if (head_status !== undefined && is_busy_status(head_status)) return head_status;
    const { conflicted, sending, persisting } = this.status_counts;
    const busy_kinds = Number(conflicted > 0) + Number(sending > 0) + Number(persisting > 0);
    if (busy_kinds <= 1) {
      if (conflicted > 0) return "conflicted";
      if (sending > 0) return "sending";
      return persisting > 0 ? "persisting" : undefined;
    }
    // Only the head is ever sent, but a transport may report a conflict for a
    // later mutation through `handleResponse`. Queue order then decides.
    for (const record of this.records.values()) {
      if (is_busy_status(record.status)) return record.status;
    }
    return undefined;
  }

  add(record: SyncMutationRecord): void {
    this.records.set(record.clientMutationId, record);
    this.order.push(record.clientMutationId);
    this.status_counts[record.status] += 1;
    this.server_versions += serverVersionsOf(record);
  }

  remove(clientMutationId: string): void {
    const record = this.records.get(clientMutationId);
    if (!record) return;
    this.records.delete(clientMutationId);
    // Acknowledgements arrive in queue order, so this is the head in practice.
    // An ID nearer the head than the tail moves the IDs before it back one
    // place and advances the head; otherwise the IDs after it move forward.
    const index = this.order.indexOf(clientMutationId, this.start);
    if (index - this.start <= this.order.length - index) {
      this.order.copyWithin(this.start + 1, this.start, index);
      this.start += 1;
      if (this.start >= COMPACT_MIN_HEAD && this.start * 2 >= this.order.length) {
        this.order.splice(0, this.start);
        this.start = 0;
      }
    } else {
      this.order.splice(index, 1);
    }
    this.status_counts[record.status] -= 1;
    this.server_versions -= serverVersionsOf(record);
  }

  /** Set `record.status`. The totals change only while the record is still in the queue. */
  setStatus(record: SyncMutationRecord, status: SyncMutationStatus): void {
    if (this.records.get(record.clientMutationId) === record) {
      this.status_counts[record.status] -= 1;
      this.status_counts[status] += 1;
    }
    record.status = status;
  }

  clear(): void {
    this.records.clear();
    this.order.length = 0;
    this.start = 0;
    for (const status of Object.keys(this.status_counts) as SyncMutationStatus[]) {
      this.status_counts[status] = 0;
    }
    this.server_versions = 0;
  }
}

/** Server versions a pending commit occupies once acknowledged. */
export function serverVersionsOf(record: PendingCommit): number {
  return record.versionOperationCounts?.length ?? 1;
}
