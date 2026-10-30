import {
  atomicBatchLimits,
  isAtomicBatch,
  markAtomicBatch,
  splitOversizedBlocks,
} from "./atomic-batch.js";
import {
  type AdmittedTransactionResources,
  admitTransactionResources,
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  resolveTransactionResourceValidation,
  validateTransactionResources,
  withAdmittedTransactionResources,
} from "./document-protocol.js";
import {
  type HistoryAction,
  type HistoryPart,
  type HistoryResourceStats,
  materializeHistoryAction,
  UndoManager,
} from "./history.js";
import { cloneCellHyperlink } from "./hyperlink.js";
import {
  encodeRestoreBlock,
  encodeMeasuredRestoreBlock,
  estimateRestoreBlockBytes,
} from "./restore-block.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { GridTransactionAdmissionDecision } from "./transaction-admission.js";
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
  onHistoryApplied: () => void;
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
  private applyingHistory = false;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;

  constructor(private readonly options: DocumentControllerOptions) {
    this.transactionResourceLimits =
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
      ? atomicBatchLimits(this.transactionResourceLimits)
      : this.transactionResourceLimits;
    const resourceValidation = validateTransactionResources(operations, limits);

    if (!resourceValidation.ok) {
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [resourceValidation.issue],
      };
    }

    // The store receives a private copy of the caller's operations; the copy is
    // verified to hold the measured operations before its record is handed over.
    const patches = operations.slice();
    if (atomic) markAtomicBatch(patches);
    const admitted = admitTransactionResources(patches, limits, resourceValidation, operations);

    const outcome = this.options.store.applyTransaction(
      withAdmittedTransactionResources({ patches }, admitted),
      {
        source: "remote",
        commitReason: options.commitReason ?? "api",
        localReplay: options.localReplay,
      },
    );

    // Undo entries hold addresses from before this change: a remote row or
    // column insert or delete moves them exactly as a local one does.
    if (outcome.status === "applied") {
      for (const patch of outcome.transaction.patches) this.rebaseHistoryFor(patch);
    }

    return outcome;
  }

  commit(
    input: DocumentOp[],
    reason: CommitReason,
    admitted?: AdmittedTransactionResources,
  ): ApplyTransactionResult {
    const atomic = isAtomicBatch(input);
    const limits = atomic
      ? atomicBatchLimits(this.transactionResourceLimits)
      : this.transactionResourceLimits;
    const inputResources = resolveTransactionResourceValidation(input, limits, admitted);
    if (!inputResources.result.ok) return this.rejectResources(inputResources.result.issue);

    if (this.options.readOnly()) {
      return { status: "noop", epoch: this.options.epoch(), reason: "read-only" };
    }

    if (input.length === 0) {
      return { status: "noop", epoch: this.options.epoch(), reason: "empty" };
    }

    // Custom callbacks may mutate nested operations while retaining identity.
    // Grid's engine-owned materializer only returns the input when unchanged.
    let admittedPatches = this.options.trustedResourceCallbacks
      ? inputResources.admitted
      : undefined;
    const patches = this.options.materializeVirtualColumns(input);

    if (patches !== input) {
      if (atomic) markAtomicBatch(patches);
      const materializedResources = resolveTransactionResourceValidation(patches, limits);
      if (!materializedResources.result.ok) {
        return this.rejectResources(materializedResources.result.issue);
      }

      admittedPatches = materializedResources.admitted;
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
      admittedPatches = undefined;
    }

    const reservation = admission?.reservation;

    if (this.applyingHistory) {
      let outcome: ApplyTransactionResult;

      try {
        outcome = this.storeApply(patches, reason, admittedPatches);
      } catch (error) {
        reservation?.cancel();
        throw error;
      }

      reservation?.finish(outcome);
      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);

      return outcome;
    }

    const inverseByPatch = new Map<DocumentOp, Array<DocumentOp | HistoryPart>>();
    let outcome: ApplyTransactionResult;

    try {
      // One edit avoids the coordinate/grouping allocation of a batch snapshot.
      if (patches.length > 1) {
        const setsBySheet = new Map<SheetId, Array<Extract<DocumentOp, { op: "set" }>>>();
        for (const patch of patches) {
          if (patch.op !== "set") continue;
          const sets = setsBySheet.get(patch.addr.sheet) ?? [];
          sets.push(patch);
          setsBySheet.set(patch.addr.sheet, sets);
        }

        const engine = storeEngine(this.options.store);
        if (engine) {
          for (const [sheet, sets] of setsBySheet) {
            const captured = this.snapshotSetBatch(sheet, sets);

            for (const [index, patch] of sets.entries()) {
              const cell = captured[index];
              if (!cell) throw new Error("Missing captured inverse cell");

              inverseByPatch.set(patch, [cell]);
            }
          }
        }
      }

      // Custom stores without an engine retain their scalar snapshot contract.
      for (const patch of patches) {
        if (!inverseByPatch.has(patch)) inverseByPatch.set(patch, this.inversePatch(patch));
      }

      outcome = this.storeApply(patches, reason, admittedPatches);
    } catch (error) {
      reservation?.cancel();

      for (const inverse of inverseByPatch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }

      throw error;
    }

    reservation?.finish(outcome);

    if (outcome.status !== "applied") {
      for (const inverse of inverseByPatch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }

      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);

      return outcome;
    }

    if (outcome.rejections?.length) this.options.onMutationRejected(outcome.rejections);

    const applied = outcome.transaction.patches;
    const appliedSet = new Set(applied);
    const inverse: HistoryAction = [];

    // Bulk capture groups by sheet; history still follows input order and
    // captures a reused operation object only once.
    for (const patch of patches) {
      const items = inverseByPatch.get(patch);
      if (!items) continue;
      inverseByPatch.delete(patch);

      if (!appliedSet.has(patch)) {
        for (const item of items) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }

        continue;
      }

      for (const item of items) {
        inverse.push("kind" in item ? item : { kind: "patches", patches: [item] });
      }
    }

    for (const patch of applied) this.rebaseHistoryFor(patch);
    this.history.push(inverse, applied);

    return outcome;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): void {
    const action = this.history.undo();
    if (!action) return;

    let outcome: ApplyTransactionResult | null;

    try {
      outcome = this.applyHistoryPatches(action, "undo");
    } catch (error) {
      this.history.restoreUndo();
      throw error;
    }

    if (outcome?.status === "applied") return;

    // The restore payload and the transaction limits never change, so these
    // rejections repeat on every retry; keeping the entry would block every
    // older undo behind it. Other rejections, such as a full sync queue, can
    // pass later, so those entries stay.
    if (outcome?.status === "rejected" && outcome.issues.some(exceedsTransactionLimit)) {
      this.history.discardUndone();
    } else {
      this.history.restoreUndo();
    }
  }

  redo(): void {
    const action = this.history.redo();
    if (!action) return;

    try {
      if (this.applyHistoryPatches(action, "redo")?.status !== "applied")
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

  private storeApply(
    patches: DocumentOp[],
    reason: CommitReason,
    admitted: AdmittedTransactionResources | undefined,
  ): ApplyTransactionResult {
    return this.options.store.applyTransaction(
      withAdmittedTransactionResources({ patches }, admitted),
      { commitReason: reason },
    );
  }

  private inversePatch(patch: DocumentOp): Array<DocumentOp | HistoryPart> {
    switch (patch.op) {
      case "set":
        return [this.snapshotCell(patch.addr)];
      case "setRange": {
        const engine = storeEngine(this.options.store);
        const width = Math.abs(patch.range.end.col - patch.range.start.col) + 1;
        const height = Math.abs(patch.range.end.row - patch.range.start.row) + 1;

        if (
          engine &&
          (patch.cells.length !== width * height ||
            patch.cells.some((cell) => cell.rowOffset >= height || cell.colOffset >= width))
        ) {
          const rowStart = Math.min(patch.range.start.row, patch.range.end.row);
          const colStart = Math.min(patch.range.start.col, patch.range.end.col);
          const captured = engine.captureCells(
            patch.range.sheet,
            patch.cells.map((cell) => ({
              row: rowStart + cell.rowOffset,
              col: colStart + cell.colOffset,
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

        const captured = this.snapshotRangeCells(patch.range);
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
        const compact = this.compactHistoryPart(patch.range);
        return compact
          ? [compact]
          : [
              {
                op: "setRange",
                range: patch.range,
                cells: this.snapshotRangeCells(patch.range),
              },
            ];
      }
      case "addRows":
        return [{ op: "removeRows", sheet: patch.sheet, at: patch.at, count: patch.count }];
      case "removeRows": {
        const sheet = this.sheetById(patch.sheet);
        const range =
          sheet && sheet.columns.length > 0
            ? {
                sheet: patch.sheet,
                start: { row: patch.at, col: 0 },
                end: { row: patch.at + patch.count - 1, col: sheet.columns.length - 1 },
              }
            : null;
        const compact = range ? this.compactHistoryPart(range) : null;
        return compact
          ? [{ op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count }, compact]
          : [
              { op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count },
              ...this.snapshotRows(patch.sheet, patch.at, patch.count),
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
        ];
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
        const sheet = this.sheetById(patch.sheet);
        const range =
          sheet && sheet.rowCount > 0
            ? {
                sheet: patch.sheet,
                start: { row: 0, col: patch.at },
                end: { row: sheet.rowCount - 1, col: patch.at + patch.count - 1 },
              }
            : null;
        const compact = range ? this.compactHistoryPart(range) : null;
        return compact
          ? [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshotColumns(patch.sheet, patch.at, patch.count),
              },
              compact,
            ]
          : [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshotColumns(patch.sheet, patch.at, patch.count),
              },
              ...this.snapshotColumnCells(patch.sheet, patch.at, patch.count),
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
        ];
      case "setColumn": {
        const sheet = this.sheetById(patch.sheet);
        const column = sheet?.columns[patch.col];
        return column
          ? [
              {
                op: "setColumn",
                sheet: patch.sheet,
                col: patch.col,
                patch: previousColumnPatch(column, patch.patch),
              },
            ]
          : [];
      }
      case "setRowMeta": {
        const sheet = this.sheetById(patch.sheet);
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
          ...this.snapshotCellsInMerge(patch.sheet, patch.merge),
        ];
      case "removeMerge":
        return [{ op: "addMerge", sheet: patch.sheet, merge: patch.merge }];
      case "addSheet":
        return [{ op: "removeSheet", sheet: patch.sheet.id }];
      case "removeSheet": {
        const snapshot = this.snapshotSheet(patch.sheet);
        if (!snapshot) return [];
        const restore: DocumentOp[] = [
          { op: "addSheet", sheet: snapshot },
          ...this.snapshotExternalFormulaAndRefs(patch.sheet),
        ];
        for (const namedRange of this.options.store.getWorkbook().namedRanges ?? []) {
          if (namedRange.range.sheet === patch.sheet || namedRange.scope === patch.sheet) {
            restore.push({ op: "setNamedRange", namedRange: { ...namedRange } });
          }
        }
        return restore;
      }
      case "renameSheet": {
        const sheet = this.sheetById(patch.sheet);
        return sheet ? [{ op: "renameSheet", sheet: patch.sheet, name: sheet.name }] : [];
      }
      case "moveSheet": {
        const from = this.options.store
          .getWorkbook()
          .sheets.findIndex((sheet) => sheet.id === patch.sheet);
        return from < 0 ? [] : [{ op: "moveSheet", sheet: patch.sheet, to: from }];
      }
      case "setSheetVisibility": {
        const sheet = this.sheetById(patch.sheet);
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
        const table = this.sheetById(patch.sheet)?.tables?.find(
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
        const table = this.sheetById(patch.sheet)?.tables?.find(
          (candidate) => candidate.id === patch.tableId,
        );
        return table ? [{ op: "addTable", table: structuredClone(table) }] : [];
      }
      case "setSheetMeta": {
        const sheet = this.sheetById(patch.sheet);
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
            },
          },
        ];
      }
      case "setHyperlink": {
        const previous = this.sheetById(patch.sheet)?.hyperlinks?.find(
          (hyperlink) => hyperlink.id === patch.hyperlink.id,
        );
        return previous
          ? [{ op: "setHyperlink", sheet: patch.sheet, hyperlink: cloneCellHyperlink(previous) }]
          : [{ op: "removeHyperlink", sheet: patch.sheet, id: patch.hyperlink.id }];
      }
      case "removeHyperlink": {
        const previous = this.sheetById(patch.sheet)?.hyperlinks?.find(
          (hyperlink) => hyperlink.id === patch.id,
        );
        return previous
          ? [{ op: "setHyperlink", sheet: patch.sheet, hyperlink: cloneCellHyperlink(previous) }]
          : [];
      }
      case "setValidationRule": {
        const previous = this.sheetById(patch.sheet)?.validationRules?.find(
          (rule) => rule.id === patch.rule.id,
        );
        return previous
          ? [{ op: "setValidationRule", sheet: patch.sheet, rule: structuredClone(previous) }]
          : [{ op: "removeValidationRule", sheet: patch.sheet, id: patch.rule.id }];
      }
      case "removeValidationRule": {
        const previous = this.sheetById(patch.sheet)?.validationRules?.find(
          (rule) => rule.id === patch.id,
        );
        return previous
          ? [{ op: "setValidationRule", sheet: patch.sheet, rule: structuredClone(previous) }]
          : [];
      }
      case "setProtectedRange": {
        const previous = this.sheetById(patch.sheet)?.protectedRanges?.find(
          (range) => range.id === patch.protectedRange.id,
        );
        return previous
          ? [
              {
                op: "setProtectedRange",
                sheet: patch.sheet,
                protectedRange: structuredClone(previous),
              },
            ]
          : [{ op: "removeProtectedRange", sheet: patch.sheet, id: patch.protectedRange.id }];
      }
      case "removeProtectedRange": {
        const previous = this.sheetById(patch.sheet)?.protectedRanges?.find(
          (range) => range.id === patch.id,
        );
        return previous
          ? [
              {
                op: "setProtectedRange",
                sheet: patch.sheet,
                protectedRange: structuredClone(previous),
              },
            ]
          : [];
      }
      case "setNote": {
        const previous = this.sheetById(patch.addr.sheet)?.notes?.find(
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
      case "setNamedRange": {
        const previous = this.options.store
          .getWorkbook()
          .namedRanges?.find(
            (range) =>
              range.name.toUpperCase() === patch.namedRange.name.toUpperCase() &&
              range.scope === patch.namedRange.scope,
          );
        return previous
          ? [{ op: "setNamedRange", namedRange: { ...previous } }]
          : [
              {
                op: "removeNamedRange",
                name: patch.namedRange.name,
                scope: patch.namedRange.scope,
              },
            ];
      }
      case "removeNamedRange": {
        const previous = this.options.store
          .getWorkbook()
          .namedRanges?.find(
            (range) =>
              range.name.toUpperCase() === patch.name.toUpperCase() && range.scope === patch.scope,
          );
        return previous ? [{ op: "setNamedRange", namedRange: { ...previous } }] : [];
      }
    }
  }

  private compactHistoryPart(range: Range): HistoryPart | null {
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

  private snapshotRows(sheetId: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.rowCount, at + count);
    for (let row = at; row < end; row++) {
      for (let col = 0; col < sheet.columns.length; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotColumns(sheetId: SheetId, at: number, count: number): Column[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];
    return sheet.columns.slice(at, at + count).map((column) => ({ ...column }));
  }

  private snapshotColumnCells(sheetId: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.columns.length, at + count);
    for (let row = 0; row < sheet.rowCount; row++) {
      for (let col = at; col < end; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotSetBatch(
    sheet: SheetId,
    sets: readonly Extract<DocumentOp, { op: "set" }>[],
  ): Array<Extract<DocumentOp, { op: "set" }>> {
    const engine = storeEngine(this.options.store);
    // Custom stores without an engine retain their scalar snapshot contract.
    if (!engine) return sets.map((patch) => this.snapshotCell(patch.addr));

    const first = sets[0];
    if (!first) return [];

    let rowStart = first.addr.row;
    let rowEnd = rowStart;
    let colStart = first.addr.col;
    let colEnd = colStart;
    for (const { addr } of sets) {
      rowStart = Math.min(rowStart, addr.row);
      rowEnd = Math.max(rowEnd, addr.row);
      colStart = Math.min(colStart, addr.col);
      colEnd = Math.max(colEnd, addr.col);
    }

    const width = colEnd - colStart + 1;
    const dense =
      sets.length === (rowEnd - rowStart + 1) * width &&
      sets.every(
        ({ addr }, index) =>
          addr.row === rowStart + Math.floor(index / width) &&
          addr.col === colStart + (index % width),
      );
    const range = {
      sheet,
      start: { row: rowStart, col: colStart },
      end: { row: rowEnd, col: colEnd },
    };
    const capturedRange = dense ? this.captureRangeCells(range) : null;

    // Per-operation inverses retain only applied cells when a batch partially
    // succeeds; the range resource itself cannot represent that subset.
    if (capturedRange) {
      return sets.map((patch, offset) => {
        const cell = capturedRange[offset];
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

  private snapshotCell(addr: CellAddress): Extract<DocumentOp, { op: "set" }> {
    const formula = this.options.loadable?.getFormula(addr) ?? this.options.store.getFormula(addr);
    const refTarget = this.options.store.getRefTarget(addr);
    const cell = this.options.store.getCell(addr);
    const owner = this.options.store.getSpillAnchor(addr);
    const isSpillChild = owner !== null && (owner.row !== addr.row || owner.col !== addr.col);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : refTarget
        ? { kind: "ref", target: refTarget }
        : { kind: "literal", value: isSpillChild ? null : cell.resolved };
    return { op: "set", addr, value, style: cell.style };
  }

  private captureRangeCells(range: Range): SnapshotCell[] | null {
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
      const styleId = block.styleIds?.[offset];

      return {
        rowOffset: Math.floor(offset / block.colCount),
        colOffset: offset % block.colCount,
        value: formula
          ? { kind: "formula", src: formula }
          : reference
            ? { kind: "ref", target: reference }
            : { kind: "literal", value },
        style: styleId === undefined ? undefined : block.styleTable?.[styleId],
      };
    });
  }

  private snapshotRangeCells(range: Range): SnapshotCell[] {
    const captured = this.captureRangeCells(range);
    if (captured) return captured;

    // Custom stores and unavailable range captures retain their scalar snapshot contract.
    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);
    const cells: SnapshotCell[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const patch = this.snapshotCell({ sheet: range.sheet, row, col });
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

  private snapshotCellsInMerge(sheet: SheetId, merge: MergeRange): DocumentOp[] {
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

    return this.snapshotSetBatch(sheet, patches);
  }

  private snapshotSheet(id: SheetId): SheetSnapshot | null {
    const sheet = this.sheetById(id);
    if (!sheet) return null;

    const engine = storeEngine(this.options.store);
    const cells: SnapshotCell[] = engine?.captureSheetCells(id) ?? [];
    // Custom stores without an engine retain their scalar snapshot contract.
    if (!engine) {
      for (let row = 0; row < sheet.rowCount; row++) {
        for (let col = 0; col < sheet.columns.length; col++) {
          const patch = this.snapshotCell({ sheet: id, row, col });
          const literalEmpty = patch.value.kind === "literal" && patch.value.value === null;
          if (literalEmpty && Object.keys(patch.style ?? {}).length === 0) continue;
          cells.push({ rowOffset: row, colOffset: col, value: patch.value, style: patch.style });
        }
      }
    }

    const rowMeta: Array<[number, { height?: number; hidden?: boolean }]> = [];
    const rows = new Set([
      ...(sheet.rowHeights?.keys() ?? []),
      ...(sheet.hiddenRows?.values() ?? []),
    ]);
    for (const row of [...rows].sort((left, right) => left - right)) {
      rowMeta.push([
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
      order: this.options.store.getWorkbook().sheets.findIndex((candidate) => candidate.id === id),
      rowCount: sheet.rowCount,
      columns: sheet.columns.map((column) => ({ ...column })),
      frozenRows: sheet.frozenRows,
      frozenCols: sheet.frozenCols,
      rowMeta,
      merges: sheet.merges?.map((candidate) => ({ ...candidate })),
      conditionalFormats: sheet.conditionalFormats?.map((rule) => ({ ...rule })),
      hyperlinks: sheet.hyperlinks?.map(cloneCellHyperlink),
      validationRules: structuredClone(sheet.validationRules),
      protectedRanges: structuredClone(sheet.protectedRanges),
      notes: structuredClone(sheet.notes),
      sortKeys: structuredClone(sheet.sortKeys),
      filters: structuredClone(sheet.filters),
      rowGroups: sheet.rowGroups?.map((group) => ({ ...group })),
      tables: structuredClone(sheet.tables),
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

  private snapshotExternalFormulaAndRefs(removedSheet: SheetId): DocumentOp[] {
    const patches: DocumentOp[] = [];
    for (const sheet of this.options.store.getWorkbook().sheets) {
      if (sheet.id === removedSheet) continue;
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
              patches.push(this.snapshotCell(addr));
            }
          }
        }
      }

      for (const hyperlink of sheet.hyperlinks ?? []) {
        if (hyperlink.target.kind === "internal" && hyperlink.target.range.sheet === removedSheet) {
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

  private rebaseHistoryFor(patch: DocumentOp): void {
    switch (patch.op) {
      case "addRows":
        this.history.rebaseRows(patch.sheet, patch.at, patch.count);
        break;
      case "removeRows":
        this.history.rebaseRows(patch.sheet, patch.at, -patch.count);
        break;
      case "addColumns":
        this.history.rebaseCols(patch.sheet, patch.at, patch.columns.length);
        break;
      case "removeColumns":
        this.history.rebaseCols(patch.sheet, patch.at, -patch.count);
        break;
    }
  }

  private applyHistoryPatches(
    action: HistoryAction,
    reason: "undo" | "redo",
  ): ApplyTransactionResult | null {
    this.applyingHistory = true;
    let outcome: ApplyTransactionResult;
    const preparation = new TransactionPreparation();
    try {
      const patches = materializeHistoryAction(action, preparation);
      if (patches.length === 0) return null;
      const fitted = this.fitHistoryPatches(patches, preparation);
      outcome = this.commit(fitted.patches, reason, fitted.admitted);
    } finally {
      preparation.dispose();
      this.applyingHistory = false;
    }
    if (outcome.status !== "applied") return outcome;
    for (const patch of outcome.transaction.patches) this.rebaseHistoryFor(patch);
    this.options.onHistoryApplied();
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
  private fitHistoryPatches(
    patches: DocumentOp[],
    preparation: TransactionPreparation,
  ): {
    patches: DocumentOp[];
    admitted?: AdmittedTransactionResources;
  } {
    const limits = this.transactionResourceLimits;
    const encodedBytes = preparation.measure(patches);
    const resources =
      patches.length <= limits.maxOperations && encodedBytes <= limits.maxEncodedBytes
        ? { ok: true as const, operationCount: patches.length, encodedBytes }
        : {
            ok: false as const,
            issue: {
              kind: "resource-limit" as const,
              severity: "error" as const,
              resource:
                patches.length > limits.maxOperations
                  ? ("operations" as const)
                  : ("encoded-bytes" as const),
              actual: patches.length > limits.maxOperations ? patches.length : encodedBytes,
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
    if (resources.issue.resource === "encoded-bytes" && this.compactRestoreMayFit(patches)) {
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
          // Above the restore block caps the block stays a candidate for splitting.
          if (!(error instanceof RangeError)) throw error;
          return patch;
        }
      });
      const compactResources = validateTransactionResources(compact, limits);
      if (compactResources.ok) {
        return {
          patches: compact,
          admitted: admitTransactionResources(compact, limits, compactResources),
        };
      }
    }
    const split = splitOversizedBlocks(patches, limits);
    if (!split) return { patches };
    const batch = markAtomicBatch(split.operations);
    const batchLimits = atomicBatchLimits(limits);
    const fitsBatch =
      batch.length <= batchLimits.maxOperations &&
      split.encodedBytes <= batchLimits.maxEncodedBytes;
    return {
      patches: batch,
      ...(fitsBatch
        ? {
            admitted: admitTransactionResources(batch, batchLimits, {
              operationCount: batch.length,
              encodedBytes: split.encodedBytes,
            }),
          }
        : {}),
    };
  }

  /** Whether the combined block compression estimate fits one transaction. */
  private compactRestoreMayFit(patches: readonly DocumentOp[]): boolean {
    let estimate = 0;
    for (const patch of patches) {
      if (patch.op === "setBlock") estimate += estimateRestoreBlockBytes(patch.block);
    }
    return estimate <= this.transactionResourceLimits.maxEncodedBytes;
  }

  /**
   * A host transaction returns this rejection to its caller. Undo and redo have
   * no caller to read it, so they report it through `mutation-rejected`, as the
   * admission and store rejections already do.
   */
  private rejectResources(issue: MutationIssue): ApplyTransactionResult {
    if (this.applyingHistory) this.options.onMutationRejected([issue]);
    return { status: "rejected", epoch: this.options.epoch(), issues: [issue] };
  }

  private sheetById(id: SheetId): Sheet | null {
    return this.options.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }
}

/**
 * Rejections by the fixed transaction and server-version limits, which no
 * retry can pass.
 */
function exceedsTransactionLimit(issue: MutationIssue): boolean {
  return (
    issue.kind === "resource-limit" &&
    (issue.resource === "operations" ||
      issue.resource === "encoded-bytes" ||
      issue.resource === "batch-versions")
  );
}

function previousColumnPatch(column: Column, changed: Partial<Column>): Partial<Column> {
  const previous: Partial<Column> = {};
  for (const key of Object.keys(changed) as Array<keyof Column>) {
    Reflect.set(previous, key, column[key]);
  }
  return previous;
}
