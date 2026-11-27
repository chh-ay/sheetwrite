import {
  atomicBatchLimits,
  isAtomicBatch,
  markAtomicBatch,
  splitOversizedBlocks,
} from "./atomic-batch.js";
import { readBlockArraysOnce } from "./block-ingress.js";
import { chartTouchesSheet, cloneChartDefinition } from "./chart-definition.js";
import { findDashboardItem } from "./dashboard.js";
import { cloneMeasure, cloneRelationship, findMeasure, findRelationship } from "./data-model.js";
import {
  type AdmittedTransactionResources,
  admitTransactionResources,
  DEFAULT_CALCULATION_SETTINGS,
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  resolveTransactionResourceValidation,
  validateTransactionResources,
  withAdmittedTransactionResources,
} from "./document-protocol.js";
import { SheetwriteError } from "./errors.js";
import {
  type AxisResize,
  type HistoryAction,
  type HistoryPart,
  type HistoryResourceStats,
  type HistoryStep,
  historyStepName,
  materializeHistoryAction,
  UndoManager,
} from "./history.js";
import { cloneCellHyperlink } from "./hyperlink.js";
import { formulaNameKey, sheetNameKey } from "./name-key.js";
import { clonePivot, planPivotEdit, pivotRewrites } from "./pivot.js";
import { cloneJsonValue } from "./plain-data.js";
import {
  encodeRestoreBlock,
  encodeMeasuredRestoreBlock,
  estimateRestoreBlockBytes,
} from "./restore-block.js";
import type { PermuteRowsOperation } from "./row-order.js";
import { cloneQuery, findQuery } from "./saved-query.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import { cellBlockMove, type MoveCellsOperation, shiftDeletedCells } from "./store/move-cells.js";
import { movedCellBounds, rangesIntersect } from "./store/ranges.js";
import {
  type GridTransactionAdmissionDecision,
  setTransactionReplayRollback,
  takeTransactionReplayRollbackRequest,
} from "./transaction-admission.js";
import { preparedHistoryBlock, TransactionPreparation } from "./transaction-preparation.js";
import type { CellValue, Column } from "./types/cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "./types/coordinates.js";
import type {
  CommitReason,
  DocumentOp,
  MutationIssue,
  Sheet,
  SheetSnapshot,
  SnapshotCell,
} from "./types/document.js";
import type { Store } from "./types/store.js";
import type { WorkbookTablePatch } from "./types/table.js";
import type {
  ApplyTransactionResult,
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";

export interface DocumentControllerOptions {
  store: Store;
  loadable: SheetwriteStore | null;
  readOnly: () => boolean;
  epoch: () => number;
  materializeVirtualColumns: (patches: DocumentOp[]) => DocumentOp[];
  onMutationRejected: (issues: MutationIssue[]) => void;
  /**
   * Called after an undo or redo applies, with the operations it applied and
   * the step: its direction and its name, such as "Paste".
   */
  onHistoryApplied: (
    patches: readonly DocumentOp[],
    step: { readonly direction: "undo" | "redo"; readonly name: string },
  ) => void;
  transactionResourceLimits?: Readonly<TransactionResourceLimits>;
  admitTransaction?: (operations: readonly DocumentOp[]) => GridTransactionAdmissionDecision;
  /** Only engine-owned callbacks may preserve payload measurements by identity. */
  trustedResourceCallbacks?: true;
}

/**
 * Owns local document policy, inverse capture, and undo/redo state. It has no
 * DOM or renderer dependency; GridImpl remains responsible for visual
 * invalidation after the store emits its document change.
 */
export class DocumentController {
  private readonly history = new UndoManager();
  private applying_history = false;
  private readonly transaction_resource_limits: Readonly<TransactionResourceLimits>;

  constructor(private readonly options: DocumentControllerOptions) {
    this.transaction_resource_limits =
      options.transactionResourceLimits ?? DEFAULT_TRANSACTION_RESOURCE_LIMITS;
  }

  applyTransaction(transaction: GridTransaction): ApplyTransactionResult {
    return this.commit(transaction.patches, "api");
  }

  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options: RemoteOperationOptions = {},
  ): ApplyTransactionResult {
    const atomic = isAtomicBatch(operations);
    const limits = atomic
      ? atomicBatchLimits(this.transaction_resource_limits)
      : this.transaction_resource_limits;
    // Each setBlock's `values` and `styleIds` are read once into private
    // copies, which the measurement, the store and the change event all use.
    const owned =
      (Array.isArray(operations) ? readBlockArraysOnce(operations) : undefined) ?? operations;
    const resource_validation = validateTransactionResources(owned, limits);

    if (!resource_validation.ok) {
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [resource_validation.issue],
      };
    }

    // The store receives a private copy of the caller's operations; the copy is
    // verified to hold the measured operations before its record is handed over.
    const patches = owned.slice();
    if (atomic) markAtomicBatch(patches);
    const admitted = admitTransactionResources(patches, limits, resource_validation, owned);

    const capture_replay = takeTransactionReplayRollbackRequest(operations);
    const captured = capture_replay ? this.capture_inverses(patches) : undefined;
    let outcome: ApplyTransactionResult;
    try {
      outcome = this.options.store.applyTransaction(
        withAdmittedTransactionResources({ patches }, admitted),
        {
          source: "remote",
          commitReason: options.commitReason ?? "api",
          localReplay: options.localReplay,
        },
      );
    } catch (error) {
      if (captured) this.dispose_inverses(captured);
      throw error;
    }

    if (outcome.status === "applied" && captured) {
      const inverse = this.take_applied_inverses(patches, captured, outcome.transaction.patches);
      const rebases: Array<{ edit: AxisResize; extent: number }> = [];
      this.rebase_history_for(outcome.transaction.patches, (edit, extent) => {
        rebases.push({ edit, extent });
      });
      const dispose = () => {
        for (const part of inverse) if (part.kind === "rangeSnapshot") part.dispose();
      };
      setTransactionReplayRollback(outcome.transaction, {
        commit: () => {
          for (const { edit, extent } of rebases) this.history.rebaseAxis(edit, extent);
        },
        rollback: () => this.rollback_replay(inverse),
        dispose,
      });
    } else {
      if (captured) this.dispose_inverses(captured);
      // A replay rebases history in its `commit` callback, once every stored
      // record has applied. Any other applied transaction rebases it now.
      if (outcome.status === "applied") this.rebase_history_for(outcome.transaction.patches);
    }

    return outcome;
  }

  /**
   * Commit `input` as one undoable transaction. `trailingInverse` runs at the
   * end of this transaction's undo, after every captured inverse: history
   * restore uses it to put back sources that an inverse insert alone cannot.
   */
  commit(
    input: DocumentOp[],
    reason: CommitReason,
    admitted?: AdmittedTransactionResources,
    trailingInverse: readonly DocumentOp[] = [],
  ): ApplyTransactionResult {
    const atomic = isAtomicBatch(input);
    const limits = atomic
      ? atomicBatchLimits(this.transaction_resource_limits)
      : this.transaction_resource_limits;
    const input_resources = resolveTransactionResourceValidation(input, limits, admitted);
    if (!input_resources.result.ok) return this.reject_resources(input_resources.result.issue);

    if (this.options.readOnly()) {
      return { status: "noop", epoch: this.options.epoch(), reason: "read-only" };
    }

    if (input.length === 0) {
      return { status: "noop", epoch: this.options.epoch(), reason: "empty" };
    }

    // Custom callbacks may mutate nested operations while retaining identity.
    // Grid's engine-owned materializer only returns the input when unchanged.
    let admitted_patches = this.options.trustedResourceCallbacks
      ? input_resources.admitted
      : undefined;
    const patches = this.options.materializeVirtualColumns(input);

    if (patches !== input) {
      if (atomic) markAtomicBatch(patches);
      const materialized_resources = resolveTransactionResourceValidation(patches, limits);
      if (!materialized_resources.result.ok) {
        return this.reject_resources(materialized_resources.result.issue);
      }

      admitted_patches = materialized_resources.admitted;
    }

    if (patches.some((patch) => this.options.loadable?.canApplyLocally(patch) === false)) {
      return { status: "noop", epoch: this.options.epoch(), reason: "incomplete-data" };
    }

    const admission = this.options.admitTransaction?.(patches);
    if (admission && !admission.ok) {
      this.options.onMutationRejected([admission.issue]);
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [admission.issue],
      };
    }

    if (admission && (!this.options.trustedResourceCallbacks || admission.inspectedOperations)) {
      admitted_patches = undefined;
    }

    const reservation = admission?.reservation;

    if (this.applying_history) {
      let outcome: ApplyTransactionResult;

      try {
        outcome = this.store_apply(patches, reason, admitted_patches);
      } catch (error) {
        reservation?.cancel();
        throw error;
      }

      reservation?.finish(outcome);
      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);

      return outcome;
    }

    let inverse_by_patch = new Map<DocumentOp, Array<DocumentOp | HistoryPart>>();
    let outcome: ApplyTransactionResult;

    try {
      inverse_by_patch = this.capture_inverses(patches);

      outcome = this.store_apply(patches, reason, admitted_patches);
    } catch (error) {
      reservation?.cancel();

      for (const inverse of inverse_by_patch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }

      throw error;
    }

    reservation?.finish(outcome);

    if (outcome.status !== "applied") {
      for (const inverse of inverse_by_patch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }

      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);

      return outcome;
    }

    if (outcome.rejections?.length) this.options.onMutationRejected(outcome.rejections);

    const applied = outcome.transaction.patches;
    const inverse = this.take_applied_inverses(patches, inverse_by_patch, applied);
    for (const operation of trailingInverse) {
      inverse.push({ kind: "patches", patches: [operation] });
    }

    this.rebase_history_for(applied);
    this.history.push(inverse, applied, historyStepName(reason, applied));

    return outcome;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  /** See `UndoManager.lastUndo`. */
  get lastUndo(): object | null {
    return this.history.lastUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): void {
    const step = this.history.undo();
    if (!step) return;

    let outcome: ApplyTransactionResult | null;

    try {
      outcome = this.apply_history_patches(step, "undo");
    } catch (error) {
      this.history.restoreUndo();
      throw error;
    }

    if (outcome?.status === "applied") return;

    // The restore payload and the transaction limits never change, so these
    // rejections repeat on every retry; keeping the entry would block every
    // older undo behind it. Other rejections, such as a full sync queue, can
    // pass later, so those entries stay.
    if (outcome?.status === "rejected" && outcome.issues.some(exceeds_transaction_limit)) {
      this.history.discardUndone();
    } else {
      this.history.restoreUndo();
    }
  }

  redo(): void {
    const step = this.history.redo();
    if (!step) return;

    try {
      if (this.apply_history_patches(step, "redo")?.status !== "applied")
        this.history.restoreRedo();
    } catch (error) {
      this.history.restoreRedo();
      throw error;
    }
  }

  getHistoryResourceStats(): HistoryResourceStats {
    return this.history.getResourceStats();
  }

  destroy(): void {
    this.history.clear();
  }

  private store_apply(
    patches: DocumentOp[],
    reason: CommitReason,
    admitted: AdmittedTransactionResources | undefined,
  ): ApplyTransactionResult {
    return this.options.store.applyTransaction(
      withAdmittedTransactionResources({ patches }, admitted),
      { commitReason: reason },
    );
  }

  private capture_inverses(
    patches: readonly DocumentOp[],
  ): Map<DocumentOp, Array<DocumentOp | HistoryPart>> {
    const captured = new Map<DocumentOp, Array<DocumentOp | HistoryPart>>();
    try {
      // With several operations, the cells of the `set` operations are read in
      // one batch per sheet.
      if (patches.length > 1) {
        const sets_by_sheet = new Map<SheetId, Array<Extract<DocumentOp, { op: "set" }>>>();
        for (const patch of patches) {
          if (patch.op !== "set") continue;
          const sets = sets_by_sheet.get(patch.addr.sheet) ?? [];
          sets.push(patch);
          sets_by_sheet.set(patch.addr.sheet, sets);
        }

        if (storeEngine(this.options.store)) {
          for (const [sheet, sets] of sets_by_sheet) {
            const cells = this.snapshot_set_batch(sheet, sets);
            for (const [index, patch] of sets.entries()) {
              const cell = cells[index];
              if (!cell) throw new Error("Missing captured inverse cell");
              captured.set(patch, [cell]);
            }
          }
        }
      }

      for (const patch of patches) {
        if (!captured.has(patch)) {
          captured.set(patch, [...this.inverse_patch(patch), ...this.pivot_restores(patch)]);
        }
      }
      return captured;
    } catch (error) {
      this.dispose_inverses(captured);
      throw error;
    }
  }

  private dispose_inverses(captured: Map<DocumentOp, Array<DocumentOp | HistoryPart>>): void {
    for (const inverse of captured.values()) {
      for (const part of inverse) {
        if ("kind" in part && part.kind === "rangeSnapshot") part.dispose();
      }
    }
  }

  private take_applied_inverses(
    patches: readonly DocumentOp[],
    captured: Map<DocumentOp, Array<DocumentOp | HistoryPart>>,
    applied: readonly DocumentOp[],
  ): HistoryAction {
    const applied_set = new Set(applied);
    const inverse: HistoryAction = [];

    for (const patch of patches) {
      const items = captured.get(patch);
      if (!items) continue;

      captured.delete(patch);

      if (!applied_set.has(patch)) {
        for (const part of items) {
          if ("kind" in part && part.kind === "rangeSnapshot") part.dispose();
        }

        continue;
      }

      for (const part of items) {
        inverse.push("kind" in part ? part : { kind: "patches", patches: [part] });
      }
    }

    return inverse;
  }

  private rollback_replay(action: HistoryAction): void {
    const preparation = new TransactionPreparation();
    try {
      const patches = materializeHistoryAction(action, preparation);
      if (patches.length === 0) return;
      const fitted = this.fit_history_patches(patches, preparation);
      // Rollback is not a new local edit. It must bypass sync admission and
      // dirty-capacity checks, including while the pending queue is hydrating.
      const outcome = this.options.store.applyTransaction(
        withAdmittedTransactionResources({ patches: fitted.patches }, fitted.admitted),
        { source: "remote" },
      );
      if (outcome.status !== "applied") throw new Error("Durable replay rollback failed");
    } finally {
      preparation.dispose();
    }
  }

  private inverse_patch(patch: DocumentOp): Array<DocumentOp | HistoryPart> {
    // A transaction that adds rows can also write them, as a paste past the
    // sheet's end does. Those rows need no restore, because undoing the added
    // rows removes them, and they cannot be read before the transaction.
    if (
      patch.op === "setRange" ||
      patch.op === "setBlock" ||
      patch.op === "restoreBlock" ||
      patch.op === "setRangeStyle" ||
      patch.op === "clearRange"
    ) {
      const range = this.existing_rows(patch.range);
      if (range === null) return [];
      if (range !== patch.range) {
        const last = range.end.row - range.start.row;
        return this.inverse_patch(
          patch.op === "setRange"
            ? { ...patch, range, cells: patch.cells.filter((cell) => cell.rowOffset <= last) }
            : { ...patch, range },
        );
      }
    }
    switch (patch.op) {
      case "set":
        return [this.snapshot_cell(patch.addr)];

      case "setRange": {
        const engine = storeEngine(this.options.store);
        const width = Math.abs(patch.range.end.col - patch.range.start.col) + 1;
        const height = Math.abs(patch.range.end.row - patch.range.start.row) + 1;

        if (
          engine &&
          (patch.cells.length !== width * height ||
            patch.cells.some((cell) => cell.rowOffset >= height || cell.colOffset >= width))
        ) {
          const row_start = Math.min(patch.range.start.row, patch.range.end.row);
          const col_start = Math.min(patch.range.start.col, patch.range.end.col);
          const captured = engine.captureCells(
            patch.range.sheet,
            patch.cells.map((cell) => ({
              row: row_start + cell.rowOffset,
              col: col_start + cell.colOffset,
            })),
          );

          return [
            {
              op: "setRange",
              range: patch.range,
              cells: patch.cells.map((cell, index) => {
                const previous = captured[index];
                if (!previous) throw new Error("Missing captured sparse inverse cell");

                return {
                  rowOffset: cell.rowOffset,
                  colOffset: cell.colOffset,
                  value: previous.value,
                  style: previous.style,
                };
              }),
            },
          ];
        }

        const captured = this.snapshot_range_cells(patch.range);
        return [
          {
            op: "setRange",
            range: patch.range,
            cells: patch.cells.map((cell) => {
              const previous = captured[cell.rowOffset * width + cell.colOffset];
              if (!previous) throw new Error("Missing captured dense inverse cell");

              return { ...cell, value: previous.value, style: previous.style };
            }),
          },
        ];
      }

      case "setBlock":
      case "restoreBlock":
      case "setRangeStyle":
      case "clearRange": {
        const compact = this.compact_history_part(patch.range);
        return compact
          ? [compact]
          : [
              {
                op: "setRange",
                range: patch.range,
                cells: this.snapshot_range_cells(patch.range),
              },
            ];
      }

      case "addRows":
        return [{ op: "removeRows", sheet: patch.sheet, at: patch.at, count: patch.count }];

      case "removeRows": {
        const sheet = this.sheet_by_id(patch.sheet);
        const range =
          sheet && sheet.columns.length > 0
            ? {
                sheet: patch.sheet,
                start: { row: patch.at, col: 0 },
                end: { row: patch.at + patch.count - 1, col: sheet.columns.length - 1 },
              }
            : null;
        const compact = range ? this.compact_history_part(range) : null;
        const charts = this.chart_restores(patch.sheet, { includeOwned: true });
        return compact
          ? [
              { op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count },
              compact,
              ...charts,
              ...this.auto_filter_restore(patch.sheet),
            ]
          : [
              { op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count },
              ...this.snapshot_rows(patch.sheet, patch.at, patch.count),
              ...charts,
              ...this.auto_filter_restore(patch.sheet),
            ];
      }

      case "moveRows":
        return [
          {
            op: "moveRows",
            sheet: patch.sheet,
            from: patch.to,
            count: patch.count,
            to: patch.from,
          },
          ...this.move_losses(patch),
          ...this.chart_restores(patch.sheet, { includeOwned: true }),
        ];

      case "permuteRows":
        return this.inverse_permutation(patch);

      case "addColumns":
        return [
          {
            op: "removeColumns",
            sheet: patch.sheet,
            at: patch.at,
            count: patch.columns.length,
          },
        ];

      case "removeColumns": {
        const sheet = this.sheet_by_id(patch.sheet);
        const range =
          sheet && sheet.rowCount > 0
            ? {
                sheet: patch.sheet,
                start: { row: 0, col: patch.at },
                end: { row: sheet.rowCount - 1, col: patch.at + patch.count - 1 },
              }
            : null;

        const compact = range ? this.compact_history_part(range) : null;
        const charts = this.chart_restores(patch.sheet, { includeOwned: true });

        return compact
          ? [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshot_columns(patch.sheet, patch.at, patch.count),
              },
              compact,
              ...charts,
              ...this.auto_filter_restore(patch.sheet),
            ]
          : [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshot_columns(patch.sheet, patch.at, patch.count),
              },
              ...this.snapshot_column_cells(patch.sheet, patch.at, patch.count),
              ...charts,
              ...this.auto_filter_restore(patch.sheet),
            ];
      }

      case "moveColumns":
        return [
          {
            op: "moveColumns",
            sheet: patch.sheet,
            from: patch.to,
            count: patch.count,
            to: patch.from,
          },
          ...this.move_losses(patch),
          ...this.chart_restores(patch.sheet, { includeOwned: true }),
        ];

      case "moveCells":
        return this.inverse_move_cells(patch);

      case "setColumn": {
        const sheet = this.sheet_by_id(patch.sheet);
        const column = sheet?.columns[patch.col];
        return column
          ? [
              {
                op: "setColumn",
                sheet: patch.sheet,
                col: patch.col,
                patch: previous_column_patch(column, patch.patch),
              },
            ]
          : [];
      }

      case "setRowMeta": {
        const sheet = this.sheet_by_id(patch.sheet);
        if (!sheet) return [];
        const height = sheet.rowHeights?.get(patch.row);
        const hidden = sheet.hiddenRows?.has(patch.row) ?? false;
        return [
          {
            op: "setRowMeta",
            sheet: patch.sheet,
            row: patch.row,
            meta: height === undefined && !hidden ? null : { height, hidden },
          },
        ];
      }

      case "addMerge":
        return [
          { op: "removeMerge", sheet: patch.sheet, merge: patch.merge },
          ...this.snapshot_cells_in_merge(patch.sheet, patch.merge),
        ];

      case "removeMerge":
        return [{ op: "addMerge", sheet: patch.sheet, merge: patch.merge }];

      case "addSheet":
        return [{ op: "removeSheet", sheet: patch.sheet.id }];

      case "removeSheet": {
        const snapshot = this.snapshotSheet(patch.sheet);
        if (!snapshot) return [];
        // The snapshot carries the sheet's own charts; other sheets' charts need theirs back.
        const restore: DocumentOp[] = [
          { op: "addSheet", sheet: snapshot },
          ...this.snapshot_external_formula_and_refs(patch.sheet),
          ...this.chart_restores(patch.sheet, { includeOwned: false }),
        ];
        // Removing the sheet turns a formula name's references to it into #REF!. A name whose
        // text holds the sheet name may refer to it; restoring one that does not is harmless.
        const sheet_name = sheetNameKey(snapshot.name);
        for (const named_range of this.options.store.getWorkbook().namedRanges ?? []) {
          if (
            named_range.scope === patch.sheet ||
            (named_range.range === undefined
              ? sheetNameKey(named_range.formula).replaceAll("''", "'").includes(sheet_name)
              : named_range.range.sheet === patch.sheet)
          ) {
            restore.push({ op: "setNamedRange", namedRange: { ...named_range } });
          }
        }

        return restore;
      }

      case "renameSheet": {
        const sheet = this.sheet_by_id(patch.sheet);
        return sheet ? [{ op: "renameSheet", sheet: patch.sheet, name: sheet.name }] : [];
      }

      case "moveSheet": {
        const from = this.options.store
          .getWorkbook()
          .sheets.findIndex((sheet) => sheet.id === patch.sheet);
        if (from < 0) return [];
        // A move can rewrite the endpoints of 3-D references. Setting their
        // sources again after moving back restores the text exactly.
        return [
          { op: "moveSheet", sheet: patch.sheet, to: from },
          ...this.snapshot_span_formulas(),
        ];
      }

      case "setSheetVisibility": {
        const sheet = this.sheet_by_id(patch.sheet);
        return sheet
          ? [
              {
                op: "setSheetVisibility",
                sheet: patch.sheet,
                visibility: sheet.visibility ?? "visible",
              },
            ]
          : [];
      }

      case "addTable":
        return [
          {
            op: "removeTable",
            sheet: patch.table.range.sheet,
            tableId: patch.table.id,
          },
        ];

      case "updateTable": {
        const table = this.sheet_by_id(patch.sheet)?.tables?.find(
          (candidate) => candidate.id === patch.tableId,
        );
        if (!table) return [];
        const previous: WorkbookTablePatch = {};
        if (patch.patch.name !== undefined) previous.name = table.name;
        if (patch.patch.range !== undefined) previous.range = structuredClone(table.range);
        if (patch.patch.columns !== undefined) previous.columns = structuredClone(table.columns);
        if (patch.patch.headerRow !== undefined) previous.headerRow = table.headerRow;
        if (patch.patch.totalsRow !== undefined) previous.totalsRow = table.totalsRow;
        if (patch.patch.style !== undefined) {
          previous.style = table.style ? structuredClone(table.style) : null;
        }

        if (patch.patch.autoFilter !== undefined) {
          previous.autoFilter = structuredClone(table.autoFilter ?? null);
        }

        if (patch.patch.sortState !== undefined) {
          previous.sortState = structuredClone(table.sortState ?? null);
        }

        if (patch.patch.unsupportedFeatures !== undefined) {
          previous.unsupportedFeatures = structuredClone(table.unsupportedFeatures ?? []);
        }

        return [
          {
            op: "updateTable",
            sheet: patch.sheet,
            tableId: patch.tableId,
            patch: previous,
          },
        ];
      }

      case "removeTable": {
        const table = this.sheet_by_id(patch.sheet)?.tables?.find(
          (candidate) => candidate.id === patch.tableId,
        );
        return table ? [{ op: "addTable", table: structuredClone(table) }] : [];
      }

      case "setSheetMeta": {
        const sheet = this.sheet_by_id(patch.sheet);
        if (!sheet) return [];

        return [
          {
            op: "setSheetMeta",
            sheet: patch.sheet,
            patch: {
              frozenRows:
                patch.patch.frozenRows === undefined ? undefined : (sheet.frozenRows ?? 0),
              frozenCols:
                patch.patch.frozenCols === undefined ? undefined : (sheet.frozenCols ?? 0),
              conditionalFormats:
                patch.patch.conditionalFormats === undefined
                  ? undefined
                  : structuredClone(sheet.conditionalFormats ?? []),
              rowGroups:
                patch.patch.rowGroups === undefined
                  ? undefined
                  : (sheet.rowGroups?.map((group) => ({ ...group })) ?? []),
              sortKeys:
                patch.patch.sortKeys === undefined
                  ? undefined
                  : (sheet.sortKeys?.map((key) => ({ ...key })) ?? []),
              filters:
                patch.patch.filters === undefined
                  ? undefined
                  : (sheet.filters?.map(([col, filter]) => [col, structuredClone(filter)]) ?? []),
              autoFilter:
                patch.patch.autoFilter === undefined
                  ? undefined
                  : sheet.autoFilter
                    ? structuredClone(sheet.autoFilter)
                    : null,
              tabColor: patch.patch.tabColor === undefined ? undefined : (sheet.tabColor ?? null),
            },
          },
        ];
      }

      case "setHyperlink":
      case "removeHyperlink": {
        const id = patch.op === "setHyperlink" ? patch.hyperlink.id : patch.id;
        const previous = this.sheet_by_id(patch.sheet)?.hyperlinks?.find(
          (entry) => entry.id === id,
        );
        return entry_inverse(
          previous,
          (hyperlink) => ({
            op: "setHyperlink",
            sheet: patch.sheet,
            hyperlink: cloneCellHyperlink(hyperlink),
          }),
          patch.op === "setHyperlink" ? { op: "removeHyperlink", sheet: patch.sheet, id } : null,
        );
      }

      case "setChart":
      case "removeChart": {
        const id = patch.op === "setChart" ? patch.chart.id : patch.id;
        const previous = this.sheet_by_id(patch.sheet)?.charts?.find((entry) => entry.id === id);
        return entry_inverse(
          previous,
          (chart) => ({ op: "setChart", sheet: patch.sheet, chart: cloneChartDefinition(chart) }),
          patch.op === "setChart" ? { op: "removeChart", sheet: patch.sheet, id } : null,
        );
      }

      case "setValidationRule":
      case "removeValidationRule": {
        const id = patch.op === "setValidationRule" ? patch.rule.id : patch.id;
        const previous = this.sheet_by_id(patch.sheet)?.validationRules?.find(
          (entry) => entry.id === id,
        );
        return entry_inverse(
          previous,
          (rule) => ({ op: "setValidationRule", sheet: patch.sheet, rule: structuredClone(rule) }),
          patch.op === "setValidationRule"
            ? { op: "removeValidationRule", sheet: patch.sheet, id }
            : null,
        );
      }

      case "setProtectedRange":
      case "removeProtectedRange": {
        const id = patch.op === "setProtectedRange" ? patch.protectedRange.id : patch.id;
        const previous = this.sheet_by_id(patch.sheet)?.protectedRanges?.find(
          (entry) => entry.id === id,
        );
        return entry_inverse(
          previous,
          (protected_range) => ({
            op: "setProtectedRange",
            sheet: patch.sheet,
            protectedRange: structuredClone(protected_range),
          }),
          patch.op === "setProtectedRange"
            ? { op: "removeProtectedRange", sheet: patch.sheet, id }
            : null,
        );
      }

      case "setNote": {
        const previous = this.sheet_by_id(patch.addr.sheet)?.notes?.find(
          (note) => note.addr.row === patch.addr.row && note.addr.col === patch.addr.col,
        );
        return [
          {
            op: "setNote",
            addr: { ...patch.addr },
            text: previous?.text ?? null,
          },
        ];
      }

      case "setNamedRange":
      case "removeNamedRange": {
        const { name, scope } = patch.op === "setNamedRange" ? patch.namedRange : patch;
        const previous = this.options.store
          .getWorkbook()
          .namedRanges?.find(
            (range) => formulaNameKey(range.name) === formulaNameKey(name) && range.scope === scope,
          );
        return entry_inverse(
          previous,
          (named_range) => ({ op: "setNamedRange", namedRange: { ...named_range } }),
          patch.op === "setNamedRange" ? { op: "removeNamedRange", name, scope } : null,
        );
      }

      case "setExternalLinks":
        return [
          {
            op: "setExternalLinks",
            links: cloneJsonValue(this.options.store.getWorkbook().externalLinks ?? []),
          },
        ];

      case "setCalculation": {
        // Absent settings are the defaults, which undo must restore explicitly.
        const previous =
          this.options.store.getWorkbook().calculation ?? DEFAULT_CALCULATION_SETTINGS;
        return [{ op: "setCalculation", calculation: { ...previous } }];
      }

      case "setMeasure":
      case "removeMeasure": {
        const id = patch.op === "setMeasure" ? patch.measure.id : patch.id;
        const previous = findMeasure(this.options.store.getWorkbook().dataModel, id);
        return entry_inverse(
          previous,
          (measure) => ({ op: "setMeasure", measure: cloneMeasure(measure) }),
          patch.op === "setMeasure" ? { op: "removeMeasure", id } : null,
        );
      }

      case "setRelationship":
      case "removeRelationship": {
        const id = patch.op === "setRelationship" ? patch.relationship.id : patch.id;
        const previous = findRelationship(this.options.store.getWorkbook().dataModel, id);
        return entry_inverse(
          previous,
          (relationship) => ({
            op: "setRelationship",
            relationship: cloneRelationship(relationship),
          }),
          patch.op === "setRelationship" ? { op: "removeRelationship", id } : null,
        );
      }

      case "setQuery":
      case "removeQuery": {
        const id = patch.op === "setQuery" ? patch.query.id : patch.id;
        const previous = findQuery(this.options.store.getWorkbook().queries, id);
        return entry_inverse(
          previous,
          (query) => ({ op: "setQuery", query: cloneQuery(query) }),
          patch.op === "setQuery" ? { op: "removeQuery", id } : null,
        );
      }

      case "setPivot":
      case "removePivot": {
        const sheet = this.sheet_by_id(patch.sheet);
        // A sheet created in this batch is removed by the addSheet inverse,
        // with all its pivots. A later removePivot would target a missing sheet.
        if (!sheet) return [];

        const id = patch.op === "setPivot" ? patch.pivot.id : patch.id;
        const previous = sheet.pivots?.find((pivot) => pivot.id === id);
        return entry_inverse(
          previous,
          (pivot) => ({ op: "setPivot", sheet: patch.sheet, pivot: clonePivot(pivot) }),
          patch.op === "setPivot" ? { op: "removePivot", sheet: patch.sheet, id } : null,
        );
      }

      case "setDashboardItem":
      case "removeDashboardItem": {
        const id = patch.op === "setDashboardItem" ? patch.item.id : patch.id;
        const previous = findDashboardItem(this.sheet_by_id(patch.sheet), id);
        if (previous) {
          return [{ op: "setDashboardItem", sheet: patch.sheet, item: structuredClone(previous) }];
        }
        return patch.op === "setDashboardItem"
          ? [{ op: "removeDashboardItem", sheet: patch.sheet, id }]
          : [];
      }
    }
  }

  /**
   * Pivots an edit rewrites, restored with their definitions from before it.
   * They follow the structural inverse, so anchors and sources are back in
   * bounds when the restore is validated. The store applies the same plan.
   */
  private pivot_restores(patch: DocumentOp): DocumentOp[] {
    const sheets = this.options.store.getWorkbook().sheets;
    const plan = planPivotEdit(patch, sheets);
    if (!plan) return [];
    return pivotRewrites(sheets, plan).map((rewrite) => ({
      op: "setPivot",
      sheet: rewrite.owner,
      pivot: clonePivot(rewrite.before),
    }));
  }

  private compact_history_part(range: Range): HistoryPart | null {
    const snapshot = this.options.loadable?.captureRangeHistory(range);
    if (!snapshot) return null;
    return {
      kind: "rangeSnapshot",
      range: snapshot.range,
      byteLength: snapshot.byteLength,
      toPatch: (target, preparation) => snapshot.toDocumentOp(target, preparation),
      dispose: () => snapshot.dispose(),
    };
  }

  private snapshot_rows(sheet_id: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheet_by_id(sheet_id);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.rowCount, at + count);
    for (let row = at; row < end; row++) {
      for (let col = 0; col < sheet.columns.length; col++) {
        patches.push(this.snapshot_cell({ sheet: sheet_id, row, col }));
      }
    }
    return patches;
  }

  private snapshot_columns(sheet_id: SheetId, at: number, count: number): Column[] {
    const sheet = this.sheet_by_id(sheet_id);
    if (!sheet) return [];
    return sheet.columns.slice(at, at + count).map((column) => ({ ...column }));
  }

  private snapshot_column_cells(sheet_id: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheet_by_id(sheet_id);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.columns.length, at + count);
    for (let row = 0; row < sheet.rowCount; row++) {
      for (let col = at; col < end; col++) {
        patches.push(this.snapshot_cell({ sheet: sheet_id, row, col }));
      }
    }
    return patches;
  }

  private snapshot_set_batch(
    sheet: SheetId,
    sets: readonly Extract<DocumentOp, { op: "set" }>[],
  ): Array<Extract<DocumentOp, { op: "set" }>> {
    const engine = storeEngine(this.options.store);
    // Custom stores without an engine retain their scalar snapshot contract.
    if (!engine) return sets.map((patch) => this.snapshot_cell(patch.addr));

    const first = sets[0];
    if (!first) return [];

    let row_start = first.addr.row;
    let row_end = row_start;
    let col_start = first.addr.col;
    let col_end = col_start;
    for (const { addr } of sets) {
      row_start = Math.min(row_start, addr.row);
      row_end = Math.max(row_end, addr.row);
      col_start = Math.min(col_start, addr.col);
      col_end = Math.max(col_end, addr.col);
    }

    const width = col_end - col_start + 1;
    const dense =
      sets.length === (row_end - row_start + 1) * width &&
      sets.every(
        ({ addr }, index) =>
          addr.row === row_start + Math.floor(index / width) &&
          addr.col === col_start + (index % width),
      );
    const range = {
      sheet,
      start: { row: row_start, col: col_start },
      end: { row: row_end, col: col_end },
    };
    const captured_range = dense ? this.capture_range_cells(range) : null;

    // Per-operation inverses retain only applied cells when a batch partially
    // succeeds; the range resource itself cannot represent that subset.
    if (captured_range) {
      return sets.map((patch, offset) => {
        const cell = captured_range[offset];
        if (!cell) throw new Error("Missing captured dense inverse cell");

        return { op: "set", addr: patch.addr, value: cell.value, style: cell.style };
      });
    }

    const captured = engine.captureCells(
      sheet,
      sets.map((patch) => patch.addr),
    );
    return sets.map((patch, index) => {
      const cell = captured[index];
      if (!cell) throw new Error("Missing captured inverse cell");

      return { op: "set", addr: patch.addr, value: cell.value, style: cell.style };
    });
  }

  /**
   * The inverse order moves every row back. A formula whose adjusted text
   * lost a reference (`#REF!`) cannot be adjusted back, so its cell is
   * captured before the sort and restored after the inverse order.
   */
  private inverse_permutation(patch: PermuteRowsOperation): DocumentOp[] {
    const engine = storeEngine(this.options.store);
    const reverse = engine?.invertedPermutation(patch);
    if (!engine || !reverse) return [];

    const losses = engine.permuteRowsLosses(patch);
    return [reverse, ...losses.map((addr) => this.snapshot_cell(addr))];
  }

  /**
   * A formula whose range lost a moved row or column at its edge does not
   * get it back from the move back, so its cell is captured before the move
   * and restored after the move back.
   */
  private move_losses(
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
  ): Extract<DocumentOp, { op: "set" }>[] {
    const engine = storeEngine(this.options.store);
    return engine ? engine.moveLosses(patch).map((addr) => this.snapshot_cell(addr)) : [];
  }

  /**
   * The move back, then what it cannot restore: the cells both blocks held,
   * the notes, hyperlinks, validation rules and merged cells of the cells
   * the block landed on, the conditional formats of both sheets, and the
   * formulas elsewhere whose reference became `#REF!` or lost an edge. Each
   * block is captured before the move.
   * A shift moves back by the opposite shift; its cells and items are those
   * from the first block to the last, the cells a deletion closes included,
   * and the merged cells it restores are those of the deleted cells.
   */
  private inverse_move_cells(patch: MoveCellsOperation): Array<DocumentOp | HistoryPart> {
    const move = cellBlockMove(patch);
    const { from, to } = move;
    const blocks = move.shift ? movedCellBounds(patch) : [to, from];
    const landed = blocks[0]!;
    const deleted = move.shift ? shiftDeletedCells(move) : to;
    const engine = storeEngine(this.options.store);
    const sheet = this.sheet_by_id(to.sheet);
    const meets_target = (range: Range) => rangesIntersect(range, landed);
    // A conditional format has no ID, so each sheet gets its whole list back.
    const formats = [...new Set([from.sheet, to.sheet])].map((id): DocumentOp => ({
      op: "setSheetMeta",
      sheet: id,
      patch: { conditionalFormats: cloneJsonValue(this.sheet_by_id(id)?.conditionalFormats ?? []) },
    }));
    return [
      {
        op: "moveCells",
        range: to,
        to: { sheet: from.sheet, ...from.start },
        ...(move.shift ? { shift: true as const } : {}),
      },
      ...blocks.map((block) => this.block_cells(block)),
      ...(sheet?.notes ?? [])
        .filter((note) => meets_target({ sheet: to.sheet, start: note.addr, end: note.addr }))
        .map((note): DocumentOp => ({ op: "setNote", addr: { ...note.addr }, text: note.text })),
      ...(sheet?.hyperlinks ?? [])
        .filter((link) => meets_target(link.range))
        .map((link): DocumentOp => ({
          op: "setHyperlink",
          sheet: to.sheet,
          hyperlink: cloneCellHyperlink(link),
        })),
      ...(sheet?.validationRules ?? [])
        .filter((rule) => meets_target(rule.range))
        .map((rule): DocumentOp => ({
          op: "setValidationRule",
          sheet: to.sheet,
          rule: cloneJsonValue(rule),
        })),
      ...formats,
      ...(sheet?.merges ?? [])
        .filter(
          (merge) =>
            deleted !== null &&
            rangesIntersect(deleted, {
              sheet: to.sheet,
              start: { row: merge.r0, col: merge.c0 },
              end: { row: merge.r1, col: merge.c1 },
            }),
        )
        .map((merge): DocumentOp => ({ op: "addMerge", sheet: to.sheet, merge: { ...merge } })),
      ...(engine?.moveCellsLosses(patch) ?? []).map((addr) => this.snapshot_cell(addr)),
    ];
  }

  /** The cells of `block` as they are now, as one history part. */
  private block_cells(block: Range): DocumentOp | HistoryPart {
    return (
      this.compact_history_part(block) ?? {
        op: "setRange",
        range: block,
        cells: this.snapshot_range_cells(block),
      }
    );
  }

  private snapshot_cell(addr: CellAddress): Extract<DocumentOp, { op: "set" }> {
    const formula = this.options.loadable?.getFormula(addr) ?? this.options.store.getFormula(addr);
    const ref_target = this.options.store.getRefTarget(addr);
    const cell = this.options.store.getCell(addr);
    const owner = this.options.store.getSpillAnchor(addr);
    const is_spill_child = owner !== null && (owner.row !== addr.row || owner.col !== addr.col);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : ref_target
        ? { kind: "ref", target: ref_target }
        : { kind: "literal", value: is_spill_child ? null : cell.resolved };
    return { op: "set", addr, value, style: cell.style };
  }

  private capture_range_cells(range: Range): SnapshotCell[] | null {
    const snapshot = storeEngine(this.options.store)?.captureRangeHistory(range);
    if (!snapshot) return null;

    let block: Extract<DocumentOp, { op: "setBlock" }>["block"];
    try {
      block = snapshot.toDocumentOp(range).block;
    } finally {
      snapshot.dispose();
    }

    const formulas = new Map(block.formulas);
    const references = new Map(block.refs);
    return block.values.map((value, offset) => {
      const formula = formulas.get(offset);
      const reference = references.get(offset);
      const style_id = block.styleIds?.[offset];

      return {
        rowOffset: Math.floor(offset / block.colCount),
        colOffset: offset % block.colCount,
        value: formula
          ? { kind: "formula", src: formula }
          : reference
            ? { kind: "ref", target: reference }
            : { kind: "literal", value },
        style: style_id === undefined ? undefined : block.styleTable?.[style_id],
      };
    });
  }

  private snapshot_range_cells(range: Range): SnapshotCell[] {
    const captured = this.capture_range_cells(range);
    if (captured) return captured;

    // Custom stores and unavailable range captures retain their scalar snapshot contract.
    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);
    const cells: SnapshotCell[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const patch = this.snapshot_cell({ sheet: range.sheet, row, col });
        cells.push({
          rowOffset: row - r0,
          colOffset: col - c0,
          value: patch.value,
          style: patch.style,
        });
      }
    }

    return cells;
  }

  private snapshot_cells_in_merge(sheet: SheetId, merge: MergeRange): DocumentOp[] {
    const patches: Array<Extract<DocumentOp, { op: "set" }>> = [];
    const r0 = Math.min(merge.r0, merge.r1);
    const r1 = Math.max(merge.r0, merge.r1);
    const c0 = Math.min(merge.c0, merge.c1);
    const c1 = Math.max(merge.c0, merge.c1);

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        patches.push({
          op: "set",
          addr: { sheet, row, col },
          value: { kind: "literal", value: null },
        });
      }
    }

    return this.snapshot_set_batch(sheet, patches);
  }

  /**
   * The sheet's AutoFilter and column filters as they are, for the inverse of
   * an edit that can shrink or drop them, such as deleting its header row.
   */
  private auto_filter_restore(sheet_id: SheetId): DocumentOp[] {
    const sheet = this.sheet_by_id(sheet_id);
    if (!sheet?.autoFilter) return [];

    return [
      {
        op: "setSheetMeta",
        sheet: sheet_id,
        patch: {
          autoFilter: structuredClone(sheet.autoFilter),
          filters: sheet.filters?.map(([col, filter]) => [col, structuredClone(filter)]) ?? [],
        },
      },
    ];
  }

  /**
   * Pre-edit definitions of every chart a structural edit of `sheet` may rewrite,
   * set back after the structure is restored so undo returns them exactly.
   * `includeOwned` false skips charts anchored on `sheet`, which its snapshot carries.
   */
  private chart_restores(
    sheet: SheetId,
    { includeOwned: include_owned }: { includeOwned: boolean },
  ): readonly DocumentOp[] {
    const restores: DocumentOp[] = [];
    for (const owner of this.options.store.getWorkbook().sheets) {
      const charts = owner.charts;
      if (!charts || (!include_owned && owner.id === sheet)) continue;

      for (const chart of charts) {
        if (chartTouchesSheet(chart, owner.id, sheet)) {
          restores.push({ op: "setChart", sheet: owner.id, chart: cloneChartDefinition(chart) });
        }
      }
    }
    return restores;
  }

  /** The whole sheet as a snapshot, as `addSheet` takes it back, or null when there is none. */
  snapshotSheet(id: SheetId): SheetSnapshot | null {
    const sheet = this.sheet_by_id(id);
    if (!sheet) return null;

    const engine = storeEngine(this.options.store);
    const cells: SnapshotCell[] = engine?.captureSheetCells(id) ?? [];
    // Custom stores without an engine retain their scalar snapshot contract.
    if (!engine) {
      for (let row = 0; row < sheet.rowCount; row++) {
        for (let col = 0; col < sheet.columns.length; col++) {
          const patch = this.snapshot_cell({ sheet: id, row, col });
          const literal_empty = patch.value.kind === "literal" && patch.value.value === null;
          if (literal_empty && Object.keys(patch.style ?? {}).length === 0) continue;
          cells.push({ rowOffset: row, colOffset: col, value: patch.value, style: patch.style });
        }
      }
    }

    const row_meta: Array<[number, { height?: number; hidden?: boolean }]> = [];
    const rows = new Set([
      ...(sheet.rowHeights?.keys() ?? []),
      ...(sheet.hiddenRows?.values() ?? []),
    ]);
    for (const row of [...rows].sort((left, right) => left - right)) {
      row_meta.push([
        row,
        {
          height: sheet.rowHeights?.get(row),
          hidden: sheet.hiddenRows?.has(row) || undefined,
        },
      ]);
    }

    return {
      id: sheet.id,
      name: sheet.name,
      visibility: sheet.visibility,
      tabColor: sheet.tabColor,
      order: this.options.store.getWorkbook().sheets.findIndex((candidate) => candidate.id === id),
      rowCount: sheet.rowCount,
      columns: sheet.columns.map((column) => ({ ...column })),
      frozenRows: sheet.frozenRows,
      frozenCols: sheet.frozenCols,
      rowMeta: row_meta,
      merges: sheet.merges?.map((candidate) => ({ ...candidate })),
      conditionalFormats: sheet.conditionalFormats?.map((rule) => ({ ...rule })),
      hyperlinks: sheet.hyperlinks?.map(cloneCellHyperlink),
      validationRules: structuredClone(sheet.validationRules),
      protectedRanges: structuredClone(sheet.protectedRanges),
      notes: structuredClone(sheet.notes),
      sortKeys: structuredClone(sheet.sortKeys),
      sortState: structuredClone(sheet.sortState),
      filters: structuredClone(sheet.filters),
      autoFilter: structuredClone(sheet.autoFilter),
      rowGroups: sheet.rowGroups?.map((group) => ({ ...group })),
      tables: structuredClone(sheet.tables),
      charts: sheet.charts?.map(cloneChartDefinition),
      pivots: sheet.pivots?.map(clonePivot),
      cells:
        cells.length === 0
          ? []
          : [
              {
                startRow: 0,
                startCol: 0,
                rowCount: sheet.rowCount,
                colCount: sheet.columns.length,
                cells,
              },
            ],
    };
  }

  private snapshot_external_formula_and_refs(removed_sheet: SheetId): DocumentOp[] {
    const patches: DocumentOp[] = [];
    for (const sheet of this.options.store.getWorkbook().sheets) {
      if (sheet.id === removed_sheet) continue;
      const engine = storeEngine(this.options.store);
      if (engine) {
        const sources = engine.captureSheetSources(sheet.id);
        const offsets = new Set([
          ...(sources?.formulaOffsets ?? []),
          ...(sources?.referenceOffsets ?? []),
        ]);
        const addresses = [...offsets]
          .sort((left, right) => left - right)
          .map((offset) => ({
            sheet: sheet.id,
            row: Math.floor(offset / sheet.columns.length),
            col: offset % sheet.columns.length,
          }));
        const captured = engine.captureCells(sheet.id, addresses);
        for (const [index, addr] of addresses.entries()) {
          const cell = captured[index];
          if (!cell) throw new Error("Missing external source snapshot");

          patches.push({ op: "set", addr, value: cell.value, style: cell.style });
        }
      } else {
        // Custom stores without an engine retain their scalar source discovery contract.
        for (let row = 0; row < sheet.rowCount; row++) {
          for (let col = 0; col < sheet.columns.length; col++) {
            const addr = { sheet: sheet.id, row, col };
            if (this.options.store.getFormula(addr) || this.options.store.getRefTarget(addr)) {
              patches.push(this.snapshot_cell(addr));
            }
          }
        }
      }

      for (const hyperlink of sheet.hyperlinks ?? []) {
        if (
          hyperlink.target.kind === "internal" &&
          hyperlink.target.range.sheet === removed_sheet
        ) {
          patches.push({
            op: "setHyperlink",
            sheet: sheet.id,
            hyperlink: cloneCellHyperlink(hyperlink),
          });
        }
      }
    }

    return patches;
  }

  private snapshot_span_formulas(): DocumentOp[] {
    const engine = storeEngine(this.options.store);
    if (!engine) return [];
    const patches: DocumentOp[] = [];
    for (const sheet of this.options.store.getWorkbook().sheets) {
      const cells = engine.sheetSpanFormulaCells(sheet.id);
      if (cells.length === 0) continue;
      const captured = engine.captureCells(sheet.id, cells);
      for (const [index, cell] of cells.entries()) {
        const source = captured[index];
        if (!source) throw new Error("Missing 3-D formula source snapshot");
        patches.push({
          op: "set",
          addr: { sheet: sheet.id, row: cell.row, col: cell.col },
          value: source.value,
          style: source.style,
        });
      }
    }
    return patches;
  }

  /**
   * Rebase undo history past the row and column edits of one applied
   * transaction. A deleted pivot anchor falls back inside the sheet as it stood
   * right after its own edit, and later edits in the batch may resize the sheet
   * again, so each edit's extent is recovered from the final one.
   */
  private rebase_history_for(
    patches: readonly DocumentOp[],
    defer?: (edit: AxisResize, extent: number) => void,
  ): void {
    const extents = new Map<SheetId, { row: number; col: number }>();
    for (const patch of patches) {
      const edit = axis_resize(patch);
      if (!edit) continue;

      let extent = extents.get(edit.sheet);
      if (!extent) {
        const sheet = this.sheet_by_id(edit.sheet);
        extent = { row: sheet?.rowCount ?? 0, col: sheet?.columns.length ?? 0 };
        extents.set(edit.sheet, extent);
      }
      extent[edit.axis] -= edit.delta;
    }

    for (const patch of patches) {
      const edit = axis_resize(patch);
      const extent = edit && extents.get(edit.sheet);
      if (!edit || !extent) continue;

      extent[edit.axis] += edit.delta;
      if (defer) defer(edit, extent[edit.axis]);
      else this.history.rebaseAxis(edit, extent[edit.axis]);
    }
  }

  private apply_history_patches(
    step: HistoryStep,
    reason: "undo" | "redo",
  ): ApplyTransactionResult | null {
    this.applying_history = true;
    let outcome: ApplyTransactionResult;
    const preparation = new TransactionPreparation();
    try {
      const patches = materializeHistoryAction(step.action, preparation);
      if (patches.length === 0) return null;
      const fitted = this.fit_history_patches(patches, preparation);
      outcome = this.commit(fitted.patches, reason, fitted.admitted);
    } finally {
      preparation.dispose();
      this.applying_history = false;
    }
    if (outcome.status !== "applied") return outcome;
    this.rebase_history_for(outcome.transaction.patches);
    this.options.onHistoryApplied(outcome.transaction.patches, {
      direction: reason,
      name: step.name,
    });
    return outcome;
  }

  /**
   * Undo and redo restore old state, which can be much larger than the edit.
   * A restore above the transaction limits first becomes compact
   * `restoreBlock` operations, which keeps it one transaction and one server
   * version. If it is still too large, its blocks are split into pieces that
   * each fit one version, and the pieces become one atomic batch: one store
   * commit, one history step, one `change` event, and an all-or-nothing
   * multi-version commit in sync. The returned measurement lets the commit
   * skip a second walk of the payload.
   */
  private fit_history_patches(
    patches: DocumentOp[],
    preparation: TransactionPreparation,
  ): {
    patches: DocumentOp[];
    admitted?: AdmittedTransactionResources;
  } {
    const limits = this.transaction_resource_limits;
    const encoded_bytes = preparation.measure(patches);
    const resources =
      patches.length <= limits.maxOperations && encoded_bytes <= limits.maxEncodedBytes
        ? { ok: true as const, operationCount: patches.length, encodedBytes: encoded_bytes }
        : {
            ok: false as const,
            issue: {
              kind: "resource-limit" as const,
              severity: "error" as const,
              resource:
                patches.length > limits.maxOperations
                  ? ("operations" as const)
                  : ("encoded-bytes" as const),
              actual: patches.length > limits.maxOperations ? patches.length : encoded_bytes,
              max:
                patches.length > limits.maxOperations
                  ? limits.maxOperations
                  : limits.maxEncodedBytes,
              message: "History restore exceeds the transaction resource limits",
            },
          };

    if (resources.ok) {
      return { patches, admitted: admitTransactionResources(patches, limits, resources) };
    }

    if (resources.issue.kind !== "resource-limit") return { patches };
    if (resources.issue.resource === "encoded-bytes" && this.compact_restore_may_fit(patches)) {
      const compact = patches.map((patch) => {
        if (patch.op !== "setBlock") return patch;
        try {
          const measured = preparedHistoryBlock(patch.block);
          const operation = measured
            ? encodeMeasuredRestoreBlock(patch.range, patch.block, measured.blockBytes)
            : encodeRestoreBlock(patch.range, patch.block);
          preparation.seed(operation, patch.block);
          return operation;
        } catch (error) {
          // A block above the restore block caps stays a candidate for splitting.
          const above_cap =
            error instanceof RangeError ||
            (error instanceof SheetwriteError && error.code === "resource-limit");
          if (!above_cap) throw error;
          return patch;
        }
      });

      const compact_resources = validateTransactionResources(compact, limits);
      if (compact_resources.ok) {
        return {
          patches: compact,
          admitted: admitTransactionResources(compact, limits, compact_resources),
        };
      }
    }

    const split = splitOversizedBlocks(patches, limits);
    if (!split) return { patches };
    const batch = markAtomicBatch(split.operations);
    const batch_limits = atomicBatchLimits(limits);
    const fits_batch =
      batch.length <= batch_limits.maxOperations &&
      split.encodedBytes <= batch_limits.maxEncodedBytes;
    return {
      patches: batch,
      ...(fits_batch
        ? {
            admitted: admitTransactionResources(batch, batch_limits, {
              operationCount: batch.length,
              encodedBytes: split.encodedBytes,
            }),
          }
        : {}),
    };
  }

  /** Whether the combined block compression estimate fits one transaction. */
  private compact_restore_may_fit(patches: readonly DocumentOp[]): boolean {
    let estimate = 0;
    for (const patch of patches) {
      if (patch.op === "setBlock") estimate += estimateRestoreBlockBytes(patch.block);
    }
    return estimate <= this.transaction_resource_limits.maxEncodedBytes;
  }

  /**
   * A host transaction returns this rejection to its caller. Undo and redo have
   * no caller to read it, so they report it through `mutation-rejected`, as the
   * admission and store rejections already do.
   */
  private reject_resources(issue: MutationIssue): ApplyTransactionResult {
    if (this.applying_history) this.options.onMutationRejected([issue]);
    return { status: "rejected", epoch: this.options.epoch(), issues: [issue] };
  }

  private sheet_by_id(id: SheetId): Sheet | null {
    return this.options.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }

  /**
   * `range` cut to the rows its sheet has now, or null when it starts past
   * them. A range written upward (end above start) is kept as it is.
   */
  private existing_rows(range: Range): Range | null {
    const row_count = this.sheet_by_id(range.sheet)?.rowCount;
    if (row_count === undefined || range.start.row > range.end.row || range.end.row < row_count) {
      return range;
    }
    if (range.start.row >= row_count) return null;
    return { ...range, end: { row: row_count - 1, col: range.end.col } };
  }
}

/**
 * Rejections by the fixed transaction and server-version limits, which no
 * retry can pass.
 */
function exceeds_transaction_limit(issue: MutationIssue): boolean {
  return (
    issue.kind === "resource-limit" &&
    (issue.resource === "operations" ||
      issue.resource === "encoded-bytes" ||
      issue.resource === "batch-versions")
  );
}

/** The row or column count change `patch` makes; null for any other operation. */
function axis_resize(patch: DocumentOp): AxisResize | null {
  switch (patch.op) {
    case "addRows":
      return { sheet: patch.sheet, axis: "row", at: patch.at, delta: patch.count };
    case "removeRows":
      return { sheet: patch.sheet, axis: "row", at: patch.at, delta: -patch.count };
    case "addColumns":
      return { sheet: patch.sheet, axis: "col", at: patch.at, delta: patch.columns.length };
    case "removeColumns":
      return { sheet: patch.sheet, axis: "col", at: patch.at, delta: -patch.count };
    default:
      return null;
  }
}

function previous_column_patch(column: Column, changed: Partial<Column>): Partial<Column> {
  const previous: Partial<Column> = {};
  for (const key of Object.keys(changed) as Array<keyof Column>) {
    Reflect.set(previous, key, column[key]);
  }
  return previous;
}

/**
 * Inverse of setting or removing one entry of a keyed collection: put back
 * the entry the edit replaced, or remove the entry a set added. Removing an
 * entry that did not exist needs no inverse.
 */
function entry_inverse<T>(
  previous: T | undefined,
  restore: (entry: T) => DocumentOp,
  remove_added: DocumentOp | null,
): DocumentOp[] {
  if (previous !== undefined) return [restore(previous)];

  return remove_added ? [remove_added] : [];
}
