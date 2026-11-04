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

const guardsByGrid = new WeakMap<Grid, Set<GridTransactionAdmissionGuard>>();
const storageRevisionByTransaction = new WeakMap<Transaction, bigint>();

/** Owns the temporary inverse resources of one durable local replay. */
export interface TransactionReplayRollback {
  commit(): void;
  rollback(): void;
  dispose(): void;
}

const replayRollbackByTransaction = new WeakMap<Transaction, TransactionReplayRollback>();
const replayRollbackRequests = new WeakSet<readonly DocumentOp[]>();

/** Only the restore owner may defer history and retain inverse resources. */
export function requestTransactionReplayRollback(
  operations: readonly DocumentOp[],
): readonly DocumentOp[] {
  replayRollbackRequests.add(operations);
  return operations;
}

export function takeTransactionReplayRollbackRequest(operations: readonly DocumentOp[]): boolean {
  return replayRollbackRequests.delete(operations);
}

export function setTransactionReplayRollback(
  transaction: Transaction,
  rollback: TransactionReplayRollback,
): void {
  replayRollbackByTransaction.set(transaction, rollback);
}

export function takeTransactionReplayRollback(
  transaction: Transaction,
): TransactionReplayRollback | undefined {
  const rollback = replayRollbackByTransaction.get(transaction);
  replayRollbackByTransaction.delete(transaction);
  return rollback;
}

export function setTransactionStorageRevision(transaction: Transaction, revision: bigint): void {
  storageRevisionByTransaction.set(transaction, revision);
}

export function transactionStorageRevision(transaction: Transaction): bigint | undefined {
  return storageRevisionByTransaction.get(transaction);
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
  const guards = guardsByGrid.get(grid) ?? new Set<GridTransactionAdmissionGuard>();
  guardsByGrid.set(grid, guards);
  guards.add(guard);
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    guards.delete(guard);
    if (guards.size === 0) guardsByGrid.delete(grid);
  };
}

/** Document replacement cannot run while a session owns local admission. */
export function hasGridTransactionAdmission(grid: Grid): boolean {
  return (guardsByGrid.get(grid)?.size ?? 0) > 0;
}

export function beginGridTransactionAdmission(
  grid: Grid,
  operations: readonly DocumentOp[],
): GridTransactionAdmissionDecision {
  const guards = guardsByGrid.get(grid);
  if (!guards || guards.size === 0) return EMPTY_DECISION;

  const reservations: GridTransactionAdmissionReservation[] = [];
  let inspectedOperations = false;
  try {
    for (const guard of guards) {
      const decision = guard.reserve(operations);
      if (!decision.ok) {
        for (const reservation of reservations) reservation.cancel();
        return decision;
      }
      reservations.push(decision.reservation);
      if (!guard.preservesOperations) inspectedOperations = true;
    }
  } catch (error) {
    for (const reservation of reservations) reservation.cancel();
    throw error;
  }

  const soleReservation = reservations[0];
  if (reservations.length === 1 && soleReservation) {
    return { ok: true, reservation: soleReservation, inspectedOperations };
  }
  let finished = false;
  return {
    ok: true,
    inspectedOperations,
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
