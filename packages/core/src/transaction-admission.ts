import { releaseOwnedArrays } from "./json-bytes.js";
import type { DocumentOp, MutationIssue } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { ApplyTransactionResult, Transaction } from "./types/transaction.js";

export interface GridTransactionAdmissionReservation {
  cancel(): void;
  finish(outcome: ApplyTransactionResult): void;
}

export type GridTransactionAdmissionDecision =
  | {
      ok: true;
      reservation: GridTransactionAdmissionReservation;
      /** Receiving operations permits nested mutation, so measurements must be dropped. */
      inspectedOperations?: boolean;
    }
  | { ok: false; issue: MutationIssue };

export interface GridTransactionAdmissionGuard {
  reserve(operations: readonly DocumentOp[]): GridTransactionAdmissionDecision;
  /** The guard never changes the operations it receives, so measurements stay valid. */
  readonly preservesOperations?: true;
}

const guards_by_grid = new WeakMap<Grid, Set<GridTransactionAdmissionGuard>>();
const storage_revision_by_transaction = new WeakMap<Transaction, bigint>();

/** Owns the temporary inverse resources of one durable local replay. */
export interface TransactionReplayRollback {
  commit(): void;
  rollback(): void;
  dispose(): void;
}

const replay_rollback_by_transaction = new WeakMap<Transaction, TransactionReplayRollback>();
const replay_rollback_requests = new WeakSet<readonly DocumentOp[]>();

/** Only the restore owner may defer history and retain inverse resources. */
export function requestTransactionReplayRollback(
  operations: readonly DocumentOp[],
): readonly DocumentOp[] {
  replay_rollback_requests.add(operations);
  return operations;
}

export function takeTransactionReplayRollbackRequest(operations: readonly DocumentOp[]): boolean {
  return replay_rollback_requests.delete(operations);
}

export function setTransactionReplayRollback(
  transaction: Transaction,
  rollback: TransactionReplayRollback,
): void {
  replay_rollback_by_transaction.set(transaction, rollback);
}

export function takeTransactionReplayRollback(
  transaction: Transaction,
): TransactionReplayRollback | undefined {
  const rollback = replay_rollback_by_transaction.get(transaction);
  replay_rollback_by_transaction.delete(transaction);
  return rollback;
}

export function setTransactionStorageRevision(transaction: Transaction, revision: bigint): void {
  storage_revision_by_transaction.set(transaction, revision);
}

export function transactionStorageRevision(transaction: Transaction): bigint | undefined {
  return storage_revision_by_transaction.get(transaction);
}
const EMPTY_RESERVATION: GridTransactionAdmissionReservation = Object.freeze({
  cancel: () => {},
  finish: () => {},
});
const EMPTY_DECISION: GridTransactionAdmissionDecision = Object.freeze({
  ok: true,
  reservation: EMPTY_RESERVATION,
});

export function registerGridTransactionAdmission(
  grid: Grid,
  guard: GridTransactionAdmissionGuard,
): () => void {
  const guards = guards_by_grid.get(grid) ?? new Set<GridTransactionAdmissionGuard>();
  guards_by_grid.set(grid, guards);
  guards.add(guard);
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    guards.delete(guard);
    if (guards.size === 0) guards_by_grid.delete(grid);
  };
}

/** Document replacement cannot run while a session owns local admission. */
export function hasGridTransactionAdmission(grid: Grid): boolean {
  return (guards_by_grid.get(grid)?.size ?? 0) > 0;
}

export function beginGridTransactionAdmission(
  grid: Grid,
  operations: readonly DocumentOp[],
): GridTransactionAdmissionDecision {
  const guards = guards_by_grid.get(grid);
  if (!guards || guards.size === 0) return EMPTY_DECISION;

  // Guards receive the operations; measurements after them must not trust them.
  releaseOwnedArrays();
  const reservations: GridTransactionAdmissionReservation[] = [];
  let inspected_operations = false;
  try {
    for (const guard of guards) {
      const decision = guard.reserve(operations);
      if (!decision.ok) {
        for (const reservation of reservations) reservation.cancel();
        return decision;
      }
      reservations.push(decision.reservation);
      if (!guard.preservesOperations) inspected_operations = true;
    }
  } catch (error) {
    for (const reservation of reservations) reservation.cancel();
    throw error;
  }

  const sole_reservation = reservations[0];
  if (reservations.length === 1 && sole_reservation) {
    return { ok: true, reservation: sole_reservation, inspectedOperations: inspected_operations };
  }
  let finished = false;
  return {
    ok: true,
    inspectedOperations: inspected_operations,
    reservation: {
      cancel() {
        if (finished) return;
        finished = true;
        for (const reservation of reservations) reservation.cancel();
      },
      finish(outcome) {
        if (finished) return;
        finished = true;
        for (const reservation of reservations) reservation.finish(outcome);
      },
    },
  };
}
