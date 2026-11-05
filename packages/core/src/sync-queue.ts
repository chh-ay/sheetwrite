import type { PendingCommit, SyncMutationRecord, SyncMutationStatus } from "./types/transaction.js";

/** Record statuses that decide the activity of a queue in queue order. */
type BusyMutationStatus = Extract<SyncMutationStatus, "conflicted" | "sending" | "persisting">;

function isBusyStatus(status: SyncMutationStatus): status is BusyMutationStatus {
  return status === "conflicted" || status === "sending" || status === "persisting";
}

/**
 * Pending records in queue order. Every add, removal, and status change goes
 * through here so the running totals stay exact: a local commit, state
 * snapshot, or send then costs the same at any queue depth.
 */
export class PendingRecordQueue {
  private readonly records = new Map<string, SyncMutationRecord>();
  /**
   * Mutation IDs in queue order, always the keys of `records`. Kept beside the
   * map because JavaScriptCore finds the first entry of a Map by walking the
   * slots of entries deleted from its front, which the head lookup would hit
   * after every acknowledgement.
   */
  private readonly order: string[] = [];

  private readonly statusCounts: Record<SyncMutationStatus, number> = {
    persisting: 0,
    pending: 0,
    sending: 0,
    conflicted: 0,
    "storage-error": 0,
  };

  private serverVersions = 0;

  /** Server versions the queued records occupy once acknowledged. */
  get versionCount(): number {
    return this.serverVersions;
  }

  get(clientMutationId: string): SyncMutationRecord | undefined {
    return this.records.get(clientMutationId);
  }

  has(clientMutationId: string): boolean {
    return this.records.has(clientMutationId);
  }

  head(): SyncMutationRecord | undefined {
    const id = this.order[0];
    return id === undefined ? undefined : this.records.get(id);
  }

  count(status: SyncMutationStatus): number {
    return this.statusCounts[status];
  }

  /** Records in queue order, in a new array. */
  toArray(): SyncMutationRecord[] {
    return Array.from(this.records.values());
  }

  /** Status of the first record in queue order that is conflicted, sending, or persisting. */
  firstBusyStatus(): BusyMutationStatus | undefined {
    const headStatus = this.head()?.status;
    if (headStatus !== undefined && isBusyStatus(headStatus)) return headStatus;
    const { conflicted, sending, persisting } = this.statusCounts;
    const busyKinds = Number(conflicted > 0) + Number(sending > 0) + Number(persisting > 0);
    if (busyKinds <= 1) {
      if (conflicted > 0) return "conflicted";
      if (sending > 0) return "sending";
      return persisting > 0 ? "persisting" : undefined;
    }
    // Only the head is ever sent, but a transport may report a conflict for a
    // later mutation through `handleResponse`. Queue order then decides.
    for (const record of this.records.values()) {
      if (isBusyStatus(record.status)) return record.status;
    }
    return undefined;
  }

  add(record: SyncMutationRecord): void {
    this.records.set(record.clientMutationId, record);
    this.order.push(record.clientMutationId);
    this.statusCounts[record.status] += 1;
    this.serverVersions += serverVersionsOf(record);
  }

  remove(clientMutationId: string): void {
    const record = this.records.get(clientMutationId);
    if (!record) return;
    this.records.delete(clientMutationId);
    // Acknowledgements arrive in queue order, so this is the head in practice.
    this.order.splice(this.order.indexOf(clientMutationId), 1);
    this.statusCounts[record.status] -= 1;
    this.serverVersions -= serverVersionsOf(record);
  }

  /** Records that already left the queue change status without touching the totals. */
  setStatus(record: SyncMutationRecord, status: SyncMutationStatus): void {
    if (this.records.get(record.clientMutationId) === record) {
      this.statusCounts[record.status] -= 1;
      this.statusCounts[status] += 1;
    }
    record.status = status;
  }

  clear(): void {
    this.records.clear();
    this.order.length = 0;
    for (const status of Object.keys(this.statusCounts) as SyncMutationStatus[]) {
      this.statusCounts[status] = 0;
    }
    this.serverVersions = 0;
  }
}

/** Server versions a pending commit occupies once acknowledged. */
export function serverVersionsOf(record: PendingCommit): number {
  return record.versionOperationCounts?.length ?? 1;
}
