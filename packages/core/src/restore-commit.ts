import { markAtomicBatch, splitOversizedBlocks } from "./atomic-batch.js";
import type { DocumentController } from "./document-controller.js";
import { DEFAULT_TRANSACTION_RESOURCE_LIMITS } from "./document-protocol.js";
import type { DocumentOp } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { ApplyTransactionResult, RestoreProvenance } from "./types/transaction.js";

/**
 * Restore commits go through the grid's document controller as one atomic
 * batch, so a restore larger than one server version is still one undo step,
 * one change event and one synchronized transaction. `Grid.applyTransaction`
 * stays limited to ordinary transactions.
 */
const controllers = new WeakMap<Grid, DocumentController>();

/** Provenance of a restore commit, keyed by its operation array until sync reserves it. */
const provenance = new WeakMap<readonly DocumentOp[], RestoreProvenance>();

/** Called once by each grid when it builds its document controller. */
export function registerGridDocument(grid: Grid, controller: DocumentController): void {
  controllers.set(grid, controller);
}

/** Restore provenance of an operation array that `commitRestore` submitted, if any. */
export function restoreProvenanceOf(
  operations: readonly DocumentOp[],
): RestoreProvenance | undefined {
  return provenance.get(operations);
}

/**
 * Commit `operations` on `grid` as one atomic restore transaction. `guards`
 * run at the end of its undo; see `DocumentController.commit`. Returns `null`
 * when a cell block cannot be cut small enough to fit one server version.
 */
export function commitRestore(
  grid: Grid,
  operations: readonly DocumentOp[],
  guards: readonly DocumentOp[],
  restore: RestoreProvenance,
): ApplyTransactionResult | null {
  const controller = controllers.get(grid);
  if (!controller) {
    throw new Error("Restore requires a grid created by Sheetwrite");
  }

  // Each cell band must fit one server version, so sync can send the restore as an atomic batch.
  const split = splitOversizedBlocks(operations, DEFAULT_TRANSACTION_RESOURCE_LIMITS);
  if (!split) {
    return null;
  }

  const batch = markAtomicBatch(split.operations);
  provenance.set(batch, { ...restore });

  return controller.commit(batch, "restore", undefined, guards);
}
