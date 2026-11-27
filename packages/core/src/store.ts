import { atomicBatchLimits, isAtomicBatch } from "./atomic-batch.js";
import { readBlockArraysOnce } from "./block-ingress.js";
import { chartSourceRanges } from "./chart-definition.js";
import { dashboardFields } from "./dashboard.js";
import {
  cloneMeasure,
  cloneRelationship,
  cloneRelationships,
  findMeasure,
  findTable,
} from "./data-model.js";
import {
  assertWorkbookAllocationLimits,
  isEngineBuiltTransaction,
  resolveTransactionResourceLimits,
  resolveTransactionResourceValidation,
  SnapshotResourceError,
  type SnapshotResourceLimits,
  SnapshotValidationError,
  takeAdmittedTransactionResources,
  type TransactionResourceValidationResult,
  validateDocumentOperationShape,
} from "./document-protocol.js";
import {
  engineFailedError,
  engineGeneration,
  getEngine,
  isEngineTrap,
  stopEngine,
} from "./engine.js";
import { SheetwriteError } from "./errors.js";
import { DEFAULT_DISTINCT_VALUES_LIMIT } from "./grid-constants.js";
import { releaseOwnedArrays } from "./json-bytes.js";
import { clonePivots, pivotOwner, withoutSavedOutput } from "./pivot.js";
import type {
  RuntimeMemoryObservation,
  RuntimeResourceOperation,
  RuntimeResourcePhase,
  RuntimeResourceSnapshot,
  TransientResourcePeak,
} from "./resource-accounting.js";
import { applySheetLifecycleOperation, createSheetLifecycleState } from "./sheet-lifecycle.js";
import {
  type CompactRangeHistory,
  IncompleteDataError,
  type RangeMutationAllocationStats,
  StoreDataEngine,
  type SheetwriteStoreOptions as StoreDataEngineOptions,
} from "./store/data-engine.js";
import {
  forgetLiveStoreEngine,
  registerStoreEngine,
  replaceStoreEngine,
} from "./store/engine-registry.js";
import { StoreMutationPolicy } from "./store/mutation-policy.js";
import { addRowGroup, collapseRowGroup, patchSheetId, removeRowGroup } from "./store/ranges.js";
import { type SheetDimensions, SheetGrowth } from "./store/sheet-growth.js";
import { decodeWorkbookSnapshot, freezeXlsxSource } from "./store/snapshot-codec.js";
import {
  clearViewPatch,
  columnFilterPatch,
  rowVisibilityPatches,
  viewSortPatch,
} from "./store/view-patches.js";
import { setTransactionStorageRevision } from "./transaction-admission.js";
import { preparedRestore, TransactionPreparation } from "./transaction-preparation.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { Dashboard, DashboardItem } from "./types/dashboard.js";
import type {
  Measure,
  MeasureStatus,
  RelationshipStatus,
  TableRelationship,
} from "./types/data-model.js";
import type { AggregateOp, ColumnarData, DataSourceColumnBand, RowData } from "./types/data.js";
import type {
  ColumnFilter,
  CommitReason,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectionResolver,
  RowGroup,
  SheetLifecycleIssueCode,
  SheetSnapshot,
  SortKey,
  Workbook,
  WorkbookSnapshot,
  XlsxSourceSnapshot,
} from "./types/document.js";
import type { PivotDefinition, PivotResultView, PivotSourceField } from "./types/pivot.js";
import type {
  CellLoadState,
  ClipboardWindowView,
  PagedStoreStats,
  QueryCapability,
  ResolvedCell,
  Store,
  VisibleWindowView,
} from "./types/store.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  Transaction,
  TransactionApplicationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";
import { admitStoreXlsxSource, replaceStoreXlsxSource } from "./xlsx-source.js";

export type { CompactRangeHistory, RangeMutationAllocationStats };
export { IncompleteDataError };

/** Storage layout plus snapshot and transaction resource ceilings for one store. */
export interface SheetwriteStoreOptions extends StoreDataEngineOptions {
  /** Overrides canonical snapshot/workbook allocation ceilings before construction. */
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
  /** Overrides inclusive operation-count and encoded-byte ceilings for every transaction. */
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
}

type ChangeListener = (event: ChangeEvent) => void;
/** The message of each sheet lifecycle issue code. */
export const SHEET_LIFECYCLE_MESSAGES: Readonly<Record<SheetLifecycleIssueCode, string>> = {
  blank: "Sheet name cannot be blank",
  "too-long": "Sheet name exceeds 31 UTF-16 code units",
  "forbidden-character": "Sheet name contains a forbidden character",
  "edge-apostrophe": "Sheet name cannot begin or end with an apostrophe",
  reserved: "History is a reserved sheet name",
  duplicate: "Sheet name duplicates another sheet case-insensitively",
  "duplicate-sheet-id": "Sheet ID already exists",
  "sheet-not-found": "Sheet does not exist",
  "invalid-sheet": "Sheet snapshot is invalid",
  "invalid-position": "Sheet position is out of bounds",
  "last-visible-sheet": "Workbook must retain at least one visible sheet",
};

/** Edits that move or resize cells, and so the anchors of retained OOXML drawings. */
const XLSX_LAYOUT_OPS: ReadonlySet<DocumentOp["op"]> = new Set([
  "addRows",
  "removeRows",
  "moveRows",
  "addColumns",
  "removeColumns",
  "moveColumns",
  "setColumn",
  "setRowMeta",
  "addMerge",
  "removeMerge",
]);

function is_snapshot_allocation_failure(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  if (error instanceof SheetwriteError && error.code === "resource-limit") return true;
  if (typeof error === "string") {
    return /allocation|capacity|memory|resource limit|out of bounds memory access/i.test(error);
  }
  if (typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError) {
    return true;
  }
  return (
    error instanceof Error &&
    /allocation|capacity|memory|resource limit|out of bounds memory access/i.test(error.message)
  );
}

/** A local transaction after the mutation policy, with the issues it reported. */
interface LocalPolicyOutcome {
  readonly tx: Transaction;
  readonly warnings: MutationIssue[];
  readonly rejections: MutationIssue[];
}

/**
 * Stable public facade and the sole transaction, epoch, policy, and event barrier.
 *
 * @example
 * ```ts
 * import { initSheetwrite, SheetwriteStore, type Workbook } from "@sheetwrite/core";
 *
 * async function total(workbook: Workbook) {
 *   await initSheetwrite();
 *   const store = new SheetwriteStore(workbook);
 *   try {
 *     return store.aggregate(workbook.activeSheet, 0, "sum");
 *   } finally {
 *     store.dispose();
 *   }
 * }
 * ```
 * @see Store.aggregate
 * @see createGrid
 */
export class SheetwriteStore implements Store {
  private data_engine: StoreDataEngine;

  /**
   * Every store call reaches the engine through here, so one check refuses
   * all of them while a host function from `@sheetwrite/core/functions` runs.
   */
  private get engine(): StoreDataEngine {
    this.data_engine.hostFunctions?.assertIdle();
    return this.data_engine;
  }

  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private detailed_change_capture = false;
  private protection_resolver: ProtectionResolver | undefined;
  private mutation_policy: MutationPolicyMode;
  private policy: StoreMutationPolicy;
  private readonly transaction_resource_limits: Readonly<TransactionResourceLimits>;
  /** Document limits a snapshot of this store must meet; row and column inserts are held to them. */
  private readonly snapshot_resource_limits: Readonly<SnapshotResourceLimits>;
  private document_id?: string;
  private document_version?: number;
  private readonly generation = engineGeneration();

  /** Creates a store for `workbook`, filled from `data` when given; too large a workbook throws. */
  constructor(
    private workbook: Workbook,
    data?: ColumnarData,
    options: SheetwriteStoreOptions = {},
  ) {
    // Frozen once here so exported snapshots share the payloads instead of copying them.
    if (workbook.xlsxSource) workbook.xlsxSource = freezeXlsxSource(workbook.xlsxSource);
    this.transaction_resource_limits = resolveTransactionResourceLimits(
      options.transactionResourceLimits,
    );
    const storage = options.storage ?? "dense";
    // Validates every override, and gives the limits it checked.
    this.snapshot_resource_limits = assertWorkbookAllocationLimits(workbook, {
      storage,
      resourceLimits: options.snapshotResourceLimits,
    });

    try {
      this.data_engine = new StoreDataEngine(
        workbook,
        data,
        options,
        this.snapshot_resource_limits,
      );
    } catch (error) {
      if (!is_snapshot_allocation_failure(error)) throw error;
      const resource = storage === "dense" ? "maxDenseCells" : "maxLogicalCellsPerSheet";
      let actual = 0;
      for (const sheet of workbook.sheets) {
        const cells = sheet.rowCount * sheet.columns.length;
        actual = storage === "dense" ? actual + cells : Math.max(actual, cells);
      }

      throw new SnapshotResourceError(resource, this.snapshot_resource_limits[resource], actual, {
        cause: error,
      });
    }

    this.policy = new StoreMutationPolicy(
      workbook,
      (sheet) => this.engine.pivotOutputs(sheet),
      () => this.engine.validationReads,
    );
    this.protection_resolver = options.protectionResolver;
    this.mutation_policy = options.mutationPolicy ?? "atomic";
    registerStoreEngine(this, this.engine, this.generation);
  }

  /** Creates a store from a saved snapshot, validating it first; an invalid one throws. */
  static fromSnapshot(input: unknown, options: SheetwriteStoreOptions = {}): SheetwriteStore {
    resolveTransactionResourceLimits(options.transactionResourceLimits);
    const { snapshot, workbook } = decodeWorkbookSnapshot(input, {
      storage: options.storage ?? "dense",
      resourceLimits: options.snapshotResourceLimits,
    });
    let store: SheetwriteStore | undefined;
    try {
      store = new SheetwriteStore(workbook, undefined, options);
      store.document_id = snapshot.documentId;
      store.document_version = snapshot.version;
      store.epoch = snapshot.version ?? 0;
      store.engine.hydrateSnapshot(snapshot);
      if (workbook.xlsxSource) {
        const admitted = admitStoreXlsxSource(store, {
          ...snapshot,
          workbook: { ...snapshot.workbook, xlsxSource: workbook.xlsxSource },
        });
        workbook.xlsxSource = admitted ? freezeXlsxSource(admitted) : undefined;
      }
      return store;
    } catch (error) {
      if (store && isEngineTrap(error)) {
        // A trap (in practice an allocation abort) leaves this store's cell
        // store borrowed, so every later call into it throws. Disposing it
        // would replace this error; memory release must not migrate it either.
        forgetLiveStoreEngine(store);
      } else {
        store?.dispose();
      }

      if (is_snapshot_allocation_failure(error)) {
        throw new SnapshotValidationError(
          [
            {
              path: "$",
              code: "resource-limit",
              message: error instanceof Error ? error.message : "Snapshot allocation failed",
            },
          ],
          { cause: error },
        );
      }
      throw error;
    }
  }

  /** Replace only after a separate store has validated and hydrated every sheet. */
  replaceSnapshot(snapshot: WorkbookSnapshot): void {
    this.assert_engine_running();

    const replacement = SheetwriteStore.fromSnapshot(snapshot, {
      protectionResolver: this.protection_resolver,
      mutationPolicy: this.mutation_policy,
      transactionResourceLimits: this.transaction_resource_limits,
    });

    const previous = this.engine;
    replaceStoreEngine(this, replacement);
    this.data_engine = replacement.data_engine;
    this.workbook = replacement.workbook;
    this.document_id = replacement.document_id;
    this.document_version = replacement.document_version;
    this.epoch += 1;
    this.policy = new StoreMutationPolicy(
      this.workbook,
      (sheet) => this.engine.pivotOutputs(sheet),
      () => this.engine.validationReads,
    );
    replaceStoreXlsxSource(this, replacement);

    previous.dispose();
  }

  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode = this.mutation_policy,
  ): void {
    this.protection_resolver = resolver;
    this.mutation_policy = mode;
  }

  /** Clones of the pivot definitions on `sheet`, or on every sheet; readable without the engine. */
  getPivots(sheet?: SheetId): PivotDefinition[] {
    return clonePivots(this.engine.getWorkbook().sheets, sheet);
  }

  /**
   * Insert or replace a pivot. `sheet` defaults to the sheet that holds the
   * pivot's ID, then to the active sheet. The pivot's `savedOutput` is
   * removed: saved values do not match a definition the caller changed.
   */
  setPivot(pivot: PivotDefinition, sheet?: SheetId): ApplyTransactionResult {
    const sheets = this.engine.getWorkbook().sheets;
    const owner =
      sheet ?? pivotOwner(sheets, pivot.id)?.id ?? this.engine.getWorkbook().activeSheet;
    return this.applyTransaction(
      { patches: [{ op: "setPivot", sheet: owner, pivot: withoutSavedOutput(pivot) }] },
      "api",
    );
  }

  /** Remove a pivot; `sheet` defaults to the sheet that holds it. */
  removePivot(id: string, sheet?: SheetId): ApplyTransactionResult {
    const owner = sheet ?? pivotOwner(this.engine.getWorkbook().sheets, id)?.id;
    if (owner === undefined) return { status: "noop", epoch: this.epoch, reason: "out-of-bounds" };
    return this.applyTransaction({ patches: [{ op: "removePivot", sheet: owner, id }] }, "api");
  }

  /** Source fields of one pivot; empty on the default engine or for an unknown pivot. */
  getPivotFields(sheet: SheetId, id: string): PivotSourceField[] {
    return this.engine.getPivotFields(sheet, id);
  }

  /**
   * Plain-JSON output of one pivot. The default engine reports the saved
   * output (`saved`), or `unavailable` without one. Null when `sheet` holds
   * no pivot with `id`.
   */
  getPivotResult(sheet: SheetId, id: string): PivotResultView | null {
    return this.engine.getPivotResult(sheet, id);
  }

  /** Clones of the workbook's table relationships; readable without the engine. */
  getRelationships(): TableRelationship[] {
    return cloneRelationships(this.engine.getWorkbook().dataModel);
  }

  /**
   * Whether the keys of the relationship with `id` resolve, checked now from
   * the cell values. The default engine checks no keys and reports
   * `unavailable`, as it does for an unknown ID.
   */
  getRelationshipStatus(id: string): RelationshipStatus {
    return this.engine.getRelationshipStatus(id);
  }

  /**
   * Insert a relationship, or replace the one with its ID. Both columns must
   * exist, at most one relationship may join two tables, and relationships
   * must not form a cycle; otherwise the result is a no-op.
   */
  setRelationship(relationship: TableRelationship): ApplyTransactionResult {
    return this.applyTransaction(
      { patches: [{ op: "setRelationship", relationship: cloneRelationship(relationship) }] },
      "api",
    );
  }

  /** Remove the relationship with `id`. */
  removeRelationship(id: string): ApplyTransactionResult {
    return this.applyTransaction({ patches: [{ op: "removeRelationship", id }] }, "api");
  }

  /** Detached copies of the workbook's saved measures. */
  getMeasures(): Measure[] {
    return (this.engine.getWorkbook().dataModel?.measures ?? []).map(cloneMeasure);
  }

  /** Save or replace a model measure. */
  setMeasure(measure: Measure): ApplyTransactionResult {
    return this.applyTransaction(
      { patches: [{ op: "setMeasure", measure: cloneMeasure(measure) }] },
      "api",
    );
  }

  /** A copy of the items of the dashboard `sheet`, or `null` when it is not a dashboard. */
  getDashboard(sheet: SheetId): Dashboard | null {
    const owner = this.engine.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    return owner ? (dashboardFields(owner).dashboard ?? null) : null;
  }

  /**
   * Insert an item on the dashboard `sheet`, or replace the one with its ID.
   * Items stay inside the 12 columns and do not overlap; otherwise the result
   * is a no-op.
   */
  setDashboardItem(sheet: SheetId, item: DashboardItem): ApplyTransactionResult {
    return this.applyTransaction(
      { patches: [{ op: "setDashboardItem", sheet, item: structuredClone(item) }] },
      "api",
    );
  }

  /** Remove a saved measure, retaining pivot references for undo. */
  removeMeasure(id: string): ApplyTransactionResult {
    return this.applyTransaction({ patches: [{ op: "removeMeasure", id }] }, "api");
  }

  /**
   * Checks a measure from the saved model on every engine: its home table,
   * then its formula syntax with the engine's parser. References are
   * checked where the measure is calculated, so pivot cells show those.
   */
  getMeasureStatus(id: string): MeasureStatus {
    const workbook = this.engine.getWorkbook();
    const measure = findMeasure(workbook.dataModel, id);
    if (!measure) return { status: "unavailable" };
    if (!findTable(workbook.sheets, measure.table)) return { status: "missingTable" };
    if (getEngine().checkFormulaSyntax(measure.formula) !== undefined) return { status: "syntax" };
    return { status: "ok" };
  }

  /** Remove the item with `id` from the dashboard `sheet`. */
  removeDashboardItem(sheet: SheetId, id: string): ApplyTransactionResult {
    return this.applyTransaction({ patches: [{ op: "removeDashboardItem", sheet, id }] }, "api");
  }

  /** Allocation counters of range edits, for tests and benchmarks. */
  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return this.engine.getRangeMutationAllocationStats();
  }

  /** Sets the range-edit allocation counters back to zero. */
  resetRangeMutationAllocationStats(): void {
    this.engine.resetRangeMutationAllocationStats();
  }

  /** Memory held by each part of the engine at this moment, for one operation phase. */
  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    return this.engine.getRuntimeResourceSnapshot(operation, phase, runtime);
  }

  /** Clears the memory figures `getRuntimeResourceSnapshot` reports. */
  resetRuntimeResourceAccounting(): void {
    this.engine.resetRuntimeResourceAccounting();
  }

  /** The largest temporary formula-matrix memory seen since the last reset. */
  getFormulaMatrixResourcePeak(): TransientResourcePeak {
    return this.engine.getFormulaMatrixResourcePeak();
  }

  /** Starts a new peak measurement for `getFormulaMatrixResourcePeak`. */
  resetFormulaMatrixResourcePeak(): void {
    this.engine.resetFormulaMatrixResourcePeak();
  }

  /** Runs `run` with its memory use counted under `operation`. */
  withResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    return this.engine.withResourceOperation(operation, run);
  }

  /** `true` when the sheet stores its cells in pages loaded from a data source. */
  isPaged(sheet: SheetId): boolean {
    return this.engine.isPaged(sheet);
  }

  /** Memory and load figures of a paged data-source sheet. */
  getPagedStats(sheet: SheetId): PagedStoreStats {
    return this.engine.getPagedStats(sheet);
  }

  queryCapability(sheet: SheetId): QueryCapability {
    return this.engine.queryCapability(sheet);
  }

  getCellLoadState(addr: CellAddress): CellLoadState {
    return this.engine.getCellLoadState(addr);
  }

  /** `true` when every row from `startRow` up to `endRow` (not included) is loaded for the given columns. */
  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean {
    return this.engine.areColumnsFullyLoaded(sheet, startRow, endRow, columns);
  }

  /** `true` when every cell of `input` is loaded from the data source. */
  isRangeFullyLoaded(input: Range): boolean {
    return this.engine.isRangeFullyLoaded(input);
  }

  /** Whether the operation can be applied to this store as it is now. */
  canApplyLocally(patch: DocumentOp): boolean {
    return this.engine.canApplyLocally(patch);
  }

  /** Copies one range for undo; the caller must dispose the copy when it is dropped. */
  captureRangeHistory(input: Range): CompactRangeHistory | null {
    return this.engine.captureRangeHistory(input);
  }

  /** The workbook model: its sheets, columns and metadata, without cell values. */
  getWorkbook(): Workbook {
    return this.engine.getWorkbook();
  }

  getCell(addr: CellAddress): ResolvedCell {
    return this.engine.getCell(addr);
  }

  getFormula(addr: CellAddress): string | null {
    return this.engine.getFormula(addr);
  }

  /** Owning dynamic-array formula cell, or null when `addr` is not spilled. */
  getSpillAnchor(addr: CellAddress): CellAddress | null {
    return this.engine.getSpillAnchor(addr);
  }

  getRefTarget(addr: CellAddress): CellAddress | null {
    return this.engine.getRefTarget(addr);
  }

  recalculateVolatile(now = new Date()): void {
    this.assert_engine_running();
    try {
      this.engine.recomputeVolatile(now);
    } catch (error) {
      throw this.stop_on_trap(error);
    }

    this.epoch += 1;
    const event: ChangeEvent = {
      transaction: { patches: [] },
      changes: [],
      commitReason: "api",
      source: "local",
      epoch: this.epoch,
    };
    this.engine.captureChartRecalculation(event.epoch);
    for (const listener of this.listeners) listener(event);
  }

  /** The data row shown at a displayed row position, under the active sort and filters. */
  dataRowAt(sheet: SheetId, viewRow: number): number {
    return this.engine.dataRowAt(sheet, viewRow);
  }

  /** The displayed position of a data row, or `null` when a filter hides it. */
  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    return this.engine.viewRowOf(sheet, dataRow);
  }

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.engine.getVisibleWindow(sheet, rows, cols);
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.engine.getDataWindow(sheet, rows, cols);
  }

  getClipboardWindow(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
    options?: { readonly dataRows?: boolean },
  ): ClipboardWindowView {
    return this.engine.getClipboardWindow(sheet, viewRows, cols, options);
  }

  /**
   * Aggregate one column. Datasource-backed sheets must be fully loaded.
   *
   * @example
   * ```ts
   * import type { SheetwriteStore, SheetId } from "@sheetwrite/core";
   *
   * function totals(store: SheetwriteStore, sheet: SheetId) {
   *   return { total: store.aggregate(sheet, 0, "sum"), average: store.aggregate(sheet, 0, "avg") };
   * }
   * ```
   * @see AggregateOp
   */
  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    return this.engine.aggregate(sheet, col, op);
  }

  /**
   * Sort the displayed rows of a sheet by `keys` (first key primary; stable)
   * without moving any cell; an empty list clears the view sort. The keys
   * are saved in the sheet and export to XLSX as `sortState`. To move the
   * cells, as Excel's Sort does, use `sortRange`.
   *
   * @example
   * ```ts
   * import type { SheetwriteStore } from "@sheetwrite/core";
   *
   * function showLargestFirst(store: SheetwriteStore) {
   *   return store.setViewSort("s1", [{ col: 2, ascending: false }]);
   * }
   * ```
   */
  setViewSort(sheet: SheetId, keys: readonly SortKey[]): ApplyTransactionResult {
    if (keys.length > 0) this.engine.requireCompleteQuery(sheet);
    return this.applyTransaction({ patches: [viewSortPatch(sheet, keys)] }, "structure");
  }

  /**
   * Sort the rows of `range` in place, as Excel's Sort does: cells move with
   * their row in one undoable transaction, and formulas follow Excel's
   * rules for sorted rows. Hidden and filtered-out rows keep their place.
   * With `hasHeader`, the first row of `range` stays. A sort that would
   * move part of a merged cell or spill range is rejected.
   *
   * @example
   * ```ts
   * import type { SheetwriteStore } from "@sheetwrite/core";
   *
   * function sortByRevenue(store: SheetwriteStore) {
   *   return store.sortRange(
   *     { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 99, col: 3 } },
   *     [{ col: 2, ascending: false }],
   *     { hasHeader: true },
   *   );
   * }
   * ```
   */
  sortRange(
    range: Range,
    keys: readonly SortKey[],
    options: { hasHeader?: boolean } = {},
  ): ApplyTransactionResult {
    this.engine.requireCompleteQuery(range.sheet);
    const plan = this.engine.sortRangePlan(range, keys, options.hasHeader ?? false);
    if (plan.kind === "unchanged") return { status: "noop", epoch: this.epoch, reason: "empty" };
    if (plan.kind === "refused") {
      return {
        status: "rejected",
        epoch: this.epoch,
        issues: [
          {
            kind: "invalid-operation",
            severity: "error",
            operationIndex: 0,
            message: plan.message,
          },
        ],
      };
    }

    return this.applyTransaction({ patches: plan.operations }, "sort");
  }

  /** Sets the filter on one column, or removes it when `filter` is `null`, as one change. */
  setColumnFilter(
    sheet: SheetId,
    col: number,
    filter: ColumnFilter | null,
  ): ApplyTransactionResult {
    if (filter !== null) this.engine.requireCompleteQuery(sheet);
    const patch = columnFilterPatch(this.engine.sheets.sheetMeta(sheet), col, filter);
    if (!patch) return { status: "noop", epoch: this.epoch, reason: "empty" };

    return this.applyTransaction({ patches: [patch] }, "structure");
  }

  /** Filters the column to rows whose text contains `needle`. */
  filterBy(sheet: SheetId, col: number, needle: string): ApplyTransactionResult {
    return this.setColumnFilter(sheet, col, { kind: "contains", text: needle });
  }

  /** The sheet's active column filters, by zero-based column. */
  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.engine.columnFilters(sheet);
  }

  /** The column's distinct shown values in first-seen order, at most `limit` (0 for no limit); blanks count once as `null`. */
  distinctValues(sheet: SheetId, col: number, limit = DEFAULT_DISTINCT_VALUES_LIMIT): CellScalar[] {
    return this.engine.distinctValues(sheet, col, limit);
  }

  /** Hides the given zero-based rows as one undoable change. */
  hideRows(sheet: SheetId, rows: readonly number[]): ApplyTransactionResult {
    const patches = rowVisibilityPatches(this.engine.sheets.sheetMeta(sheet), rows, true);
    return this.applyTransaction({ patches }, "structure");
  }

  /** Shows the given hidden rows again, or every hidden row when `rows` is omitted, as one change. */
  showRows(sheet: SheetId, rows?: readonly number[]): ApplyTransactionResult {
    const meta = this.engine.sheets.sheetMeta(sheet);
    const patches = rowVisibilityPatches(meta, rows ?? [...(meta.hiddenRows ?? [])], false);
    return this.applyTransaction({ patches }, "structure");
  }

  /** The sheet's hidden rows, zero-based. */
  hiddenRows(sheet: SheetId): number[] {
    return this.engine.hiddenRows(sheet);
  }

  /** Adds a collapsible group over rows `start` to `end`, both included, as one change. */
  groupRows(sheet: SheetId, start: number, end: number): ApplyTransactionResult {
    const groups = addRowGroup(this.engine.sheets.sheetMeta(sheet).rowGroups, start, end);
    return this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  /** Removes the row group over rows `start` to `end`. */
  ungroupRows(sheet: SheetId, start: number, end: number): ApplyTransactionResult {
    const groups = removeRowGroup(this.engine.sheets.sheetMeta(sheet).rowGroups, start, end);
    return this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  /** Collapses or expands the row group that starts at `start`. */
  setGroupCollapsed(sheet: SheetId, start: number, collapsed: boolean): ApplyTransactionResult {
    const groups = collapseRowGroup(
      this.engine.sheets.sheetMeta(sheet).rowGroups,
      start,
      collapsed,
    );
    return this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  /** The sheet's collapsible row groups. */
  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.engine.rowGroups(sheet);
  }

  /** Where Ctrl+Arrow lands from a cell: the edge of the data block in the direction `dRow`, `dCol`. */
  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    return this.engine.dataEdge(sheet, row, col, dRow, dCol);
  }

  /**
   * Cells that Find's `query` matches, in row order. `query` takes Excel's
   * wildcards (`*`, `?`, `~`); formula cells match by their formula text
   * unless `lookIn` is `"values"`.
   */
  searchCells(
    sheet: SheetId,
    query: string,
    opts: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
      lookIn?: "formulas" | "values";
    } = {},
  ): CellAddress[] {
    return this.engine.searchCells(sheet, query, opts);
  }

  /** Like `searchCells`, as one flat `[row, col, row, col, ...]` array. */
  searchCellsFlat(
    sheet: SheetId,
    query: string,
    opts: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
      lookIn?: "formulas" | "values";
    } = {},
  ): Uint32Array {
    return this.engine.searchCellsFlat(sheet, query, opts);
  }

  /** Removes the sheet's view sort and filters as one change; a no-op when there are none. */
  clearView(sheet: SheetId): ApplyTransactionResult {
    const patch = clearViewPatch(this.engine.sheets.sheetMeta(sheet));
    if (!patch) return { status: "noop", epoch: this.epoch, reason: "empty" };

    return this.applyTransaction({ patches: [patch] }, "structure");
  }

  viewRowCount(sheet: SheetId): number {
    return this.engine.viewRowCount(sheet);
  }

  /** `true` when the sheet has a view sort or filter. */
  hasView(sheet: SheetId): boolean {
    return this.engine.hasView(sheet);
  }

  ensureColumns(sheet: SheetId, columns: readonly Column[]): void {
    this.engine.ensureColumns(sheet, columns);
  }

  applyTransaction(
    tx: Transaction,
    reasonOrOptions: CommitReason | TransactionApplicationOptions = {},
  ): ApplyTransactionResult {
    this.assert_engine_running();
    // Each setBlock's `values` and `styleIds` are read once into private
    // copies. An engine-built transaction already went through its layer's
    // ingress, and that layer matches results to its operations by identity.
    const copied =
      Array.isArray(tx.patches) && !isEngineBuiltTransaction(tx)
        ? readBlockArraysOnce(tx.patches)
        : undefined;
    const owned = copied ? { ...tx, patches: copied } : tx;
    const preparation = new TransactionPreparation(owned.patches);
    try {
      return this.apply_prepared_transaction(owned, reasonOrOptions, preparation);
    } catch (error) {
      // Change listeners run inside this call too: a trap in a listener's
      // engine read stops the engine the same way.
      throw this.stop_on_trap(error);
    } finally {
      preparation.dispose();
    }
  }

  /** Admission, policy, application and notification for one transaction, in that order. */
  private apply_prepared_transaction(
    tx: Transaction,
    reason_or_options: CommitReason | TransactionApplicationOptions,
    preparation: TransactionPreparation,
  ): ApplyTransactionResult {
    // A transaction built and measured by an engine layer carries its resource
    // record; without one, direct callers pay the full payload walk. An
    // engine-built atomic batch is bounded by the batch ceilings instead.
    const limits = isAtomicBatch(tx.patches)
      ? atomicBatchLimits(this.transaction_resource_limits)
      : this.transaction_resource_limits;
    const admitted_resources = takeAdmittedTransactionResources(tx);
    const resource_resolution = resolveTransactionResourceValidation(
      tx.patches,
      limits,
      admitted_resources,
    );
    const rejected = this.admission_rejection(tx, resource_resolution.result);
    if (rejected) return rejected;

    const options =
      typeof reason_or_options === "string"
        ? { commitReason: reason_or_options }
        : reason_or_options;
    const commit_reason = options.commitReason ?? "api";
    const source = options.source ?? "local";
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }

    const policy =
      source === "local"
        ? this.apply_local_policy(tx, commit_reason, limits, preparation)
        : { tx, warnings: [], rejections: [] };
    if ("status" in policy) return policy;

    const effective_tx = policy.tx;
    if (source === "local" || options.localReplay === true) {
      const dirty_capacity_issue = this.engine.pagedDirtyCapacityIssue(effective_tx.patches);
      if (dirty_capacity_issue) {
        return { status: "rejected", epoch: this.epoch, issues: [dirty_capacity_issue] };
      }
    }

    if (
      source === "local" &&
      effective_tx.patches.some((patch) => !this.engine.canApplyLocally(patch))
    ) {
      return { status: "noop", epoch: this.epoch, reason: "incomplete-data" };
    }

    const has_listeners = this.listeners.size > 0;
    const effects = this.engine.applyPatches(effective_tx.patches, {
      remoteLoad: source === "remote" && options.localReplay !== true,
      captureChanges: has_listeners,
      captureDetailedChanges: this.detailed_change_capture,
      trustedHistory:
        admitted_resources !== undefined &&
        resource_resolution.admitted === admitted_resources &&
        !this.protection_resolver,
      replayPivotSources:
        source === "remote" || commit_reason === "undo" || commit_reason === "redo",
    });
    // Listeners and the result hand the operations to callers.
    releaseOwnedArrays();

    if (effects.appliedPatches.length === 0) {
      return {
        status: "noop",
        epoch: this.epoch,
        reason: effective_tx.patches.length === 0 ? "empty" : "out-of-bounds",
      };
    }

    const xlsx_source = this.workbook.xlsxSource;
    if (xlsx_source) this.invalidate_xlsx_graphs(xlsx_source, effects.appliedPatches);

    this.epoch += 1;
    const transaction =
      effects.appliedPatches.length === effective_tx.patches.length
        ? effective_tx
        : { ...effective_tx, patches: effects.appliedPatches };
    setTransactionStorageRevision(transaction, effects.storageRevision);

    if (has_listeners) {
      const event: ChangeEvent = {
        transaction,
        changes: effects.changes ?? [],
        commitReason: commit_reason,
        source,
        epoch: this.epoch,
      };

      this.engine.captureChartRecalculation(event.epoch);
      for (const listener of this.listeners) listener(event);
    }

    return {
      status: "applied",
      epoch: this.epoch,
      transaction,
      ...(policy.warnings.length > 0 ? { warnings: policy.warnings } : {}),
      ...(policy.rejections.length > 0 ? { rejections: policy.rejections } : {}),
    };
  }

  /** Reject a transaction whose payload exceeds its limits or whose operations cannot apply. */
  private admission_rejection(
    tx: Transaction,
    resources: TransactionResourceValidationResult,
  ): ApplyTransactionResult | undefined {
    if (!resources.ok) return { status: "rejected", epoch: this.epoch, issues: [resources.issue] };

    const issue = this.transaction_operation_issue(tx);
    return issue ? { status: "rejected", epoch: this.epoch, issues: [issue] } : undefined;
  }

  /**
   * Run the mutation policy on a local transaction. Permission callbacks
   * receive live operations and may edit them, so the kept operations are
   * admitted again afterwards.
   */
  private apply_local_policy(
    tx: Transaction,
    commit_reason: CommitReason,
    limits: Readonly<TransactionResourceLimits>,
    preparation: TransactionPreparation,
  ): LocalPolicyOutcome | ApplyTransactionResult {
    // Permission callbacks receive the operations; the re-check below must not trust them.
    releaseOwnedArrays();
    const policy = this.policy.evaluate(
      tx.patches,
      commit_reason,
      this.protection_resolver,
      this.mutation_policy,
    );
    if (policy.rejections.length > 0 && policy.patches.length === 0) {
      return { status: "rejected", epoch: this.epoch, issues: policy.rejections };
    }

    const effective_tx =
      policy.patches.length === tx.patches.length ? tx : { ...tx, patches: policy.patches };
    if (this.protection_resolver) {
      preparation.bind(effective_tx.patches);

      // Do not reuse measurements taken before the callbacks ran.
      const callback_resources = resolveTransactionResourceValidation(
        effective_tx.patches,
        limits,
      ).result;
      const rejected = this.admission_rejection(effective_tx, callback_resources);
      if (rejected) return rejected;
    }

    return { tx: effective_tx, warnings: policy.warnings, rejections: policy.rejections };
  }

  /**
   * Drop retained OOXML graphs that a committed edit may have made stale. Costs
   * O(patches + graphs) and never reads cells; undo cannot restore a dropped
   * graph because the original package is not kept.
   */
  private invalidate_xlsx_graphs(source: XlsxSourceSnapshot, patches: readonly DocumentOp[]): void {
    const values_touched = new Set<SheetId>();
    const layout_touched = new Set<SheetId>();
    for (const patch of patches) {
      // A native chart reads cells but changes neither values nor layout, so retained
      // drawings and charts stay valid beside it.
      if (patch.op === "setChart" || patch.op === "removeChart") continue;
      if (
        patch.op === "setNamedRange" ||
        patch.op === "removeNamedRange" ||
        patch.op === "setCalculation" ||
        patch.op === "setExternalLinks"
      ) {
        // A chart or pivot may read through a defined name, whose target is not tracked,
        // and a calculation change can move any formula result.
        for (const sheet of this.workbook.sheets) values_touched.add(sheet.id);
        continue;
      }
      const sheet = patchSheetId(patch);
      if (sheet === null) continue;
      values_touched.add(sheet);
      if (XLSX_LAYOUT_OPS.has(patch.op)) layout_touched.add(sheet);
    }

    const live = new Map(this.workbook.sheets.map((sheet) => [sheet.id, sheet.name]));
    const dropped = new Set(source.dropped);
    const graphs = source.graphs.filter((graph) => {
      const valid =
        (graph.sheetId === undefined || live.has(graph.sheetId)) &&
        graph.dependencies.every((dependency) =>
          dependency.scope === "values"
            ? live.get(dependency.sheetId) === dependency.name &&
              !values_touched.has(dependency.sheetId)
            : live.has(dependency.sheetId) && !layout_touched.has(dependency.sheetId),
        );
      if (!valid) dropped.add(graph.target);
      return valid;
    });
    if (graphs.length === source.graphs.length) return;

    const members = new Set(graphs.flatMap((graph) => graph.parts));
    this.workbook.xlsxSource = freezeXlsxSource({
      parts: source.parts.filter((part) => members.has(part.name)),
      graphs,
      dropped: [...dropped],
    });
  }

  /** Calls `fn` after each committed transaction; returns a function that removes it. */
  on(_evt: "change", fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setDetailedChangeCapture(enabled: boolean): void {
    this.detailed_change_capture = enabled;
  }

  acknowledgeOperations(operations: readonly DocumentOp[], storageRevision?: bigint): void {
    this.engine.acknowledgeOperations(operations, storageRevision);
  }

  exportSnapshot(): WorkbookSnapshot {
    return this.engine.exportSnapshot(this.document_id, this.document_version);
  }

  /** Updates formulas that name the sheet to its new name. */
  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    return this.engine.renameSheetFormulaIdentity(sheet, name);
  }

  /** Turns references to a deleted sheet into `#REF!` in the remaining formulas. */
  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    return this.engine.removeSheetFormulaIdentity(sheet);
  }

  /** Writes rows a data source returned, starting at row `start`. Cells for which `protect` returns `true` keep their value. */
  loadPage(
    sheet: SheetId,
    start: number,
    columns: readonly DataSourceColumnBand[],
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    this.assert_engine_running();
    try {
      this.engine.loadPage(sheet, start, columns, rows, protect);
    } catch (error) {
      throw this.stop_on_trap(error);
    }
  }

  /** Frees the engine memory this store holds; do not use the store afterwards. */
  dispose(): void {
    // A stopped instance can throw from any call, even `free`. Its linear
    // memory goes with the instance when the last of its stores is collected.
    if (this.generation !== engineGeneration()) return;

    this.engine.dispose();
  }

  /** Refuse work once the engine stopped: its instance can be half-written. */
  private assert_engine_running(): void {
    if (this.generation !== engineGeneration()) throw engineFailedError();
  }

  private stop_on_trap(error: unknown): unknown {
    return isEngineTrap(error) ? stopEngine(error, this.generation) : error;
  }

  /**
   * The first operation that is malformed, breaks sheet lifecycle, names a
   * missing sheet, or grows a sheet past a document limit.
   */
  private transaction_operation_issue(tx: Transaction): MutationIssue | undefined {
    const sheet_lifecycle = createSheetLifecycleState(this.engine.getWorkbook().sheets);
    let growth: SheetGrowth | undefined;
    for (let operation_index = 0; operation_index < tx.patches.length; operation_index++) {
      const operation_path = `transaction.patches[${operation_index}]`;
      const operation = tx.patches[operation_index];
      const unsafe_error = validateDocumentOperationShape(operation, operation_path).find(
        (error) => error.code !== "out-of-bounds",
      );
      if (unsafe_error || !operation) {
        return {
          kind: "invalid-operation",
          severity: "error",
          operationIndex: operation_index,
          message: unsafe_error?.message ?? "Operation is missing",
        };
      }

      const lifecycle = applySheetLifecycleOperation(sheet_lifecycle, operation);
      if (lifecycle && !lifecycle.ok) {
        return {
          kind: "sheet-lifecycle",
          severity: "error",
          code: lifecycle.code,
          sheet:
            operation.op === "addSheet"
              ? operation.sheet.id
              : (patchSheetId(operation) ?? undefined),
          operationIndex: operation_index,
          message: SHEET_LIFECYCLE_MESSAGES[lifecycle.code],
        };
      }

      const required_sheets = required_operation_sheets(operation, lifecycle === null);
      const missing_sheet = required_sheets.find(
        (sheet) => !sheet_lifecycle.sheets.some((candidate) => candidate.id === sheet),
      );
      if (missing_sheet !== undefined) {
        return {
          kind: "invalid-operation",
          severity: "error",
          operationIndex: operation_index,
          message: `Sheet ${missing_sheet} does not exist`,
        };
      }

      if (operation.op === "addRows" || operation.op === "addColumns") {
        growth ??= this.sheet_growth();
        const issue = growth.grow(
          operation.sheet,
          operation.op === "addRows" ? operation.count : 0,
          operation.op === "addColumns" ? operation.columns.length : 0,
        );
        if (issue) return issue;
      }
    }

    return undefined;
  }

  /** Every sheet's dimensions now, and where its cells live, for {@link SheetGrowth}. */
  private sheet_growth(): SheetGrowth {
    const sheets = new Map<SheetId, SheetDimensions>();
    for (const sheet of this.engine.getWorkbook().sheets) {
      sheets.set(sheet.id, {
        name: sheet.name,
        rows: sheet.rowCount,
        columns: sheet.columns.length,
        storage: this.engine.isPaged(sheet.id)
          ? "paged"
          : this.engine.isLocalPaged(sheet.id)
            ? "local"
            : "dense",
      });
    }
    return new SheetGrowth(sheets, this.snapshot_resource_limits);
  }
}

/** Every sheet a new sheet's snapshot refers to, which must exist once it is added. */
function added_sheet_references(sheet: SheetSnapshot): SheetId[] {
  const required_sheets: SheetId[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.value.kind === "ref") required_sheets.push(cell.value.target.sheet);
    }
  }

  for (const rule of sheet.conditionalFormats ?? []) {
    required_sheets.push(rule.range.sheet);
  }

  for (const hyperlink of sheet.hyperlinks ?? []) {
    required_sheets.push(hyperlink.range.sheet);
    if (hyperlink.target.kind === "internal") {
      required_sheets.push(hyperlink.target.range.sheet);
    }
  }

  for (const rule of sheet.validationRules ?? []) {
    required_sheets.push(rule.range.sheet);
  }

  for (const entry of sheet.protectedRanges ?? []) {
    required_sheets.push(entry.range.sheet);
  }

  for (const note of sheet.notes ?? []) required_sheets.push(note.addr.sheet);
  for (const chart of sheet.charts ?? []) {
    for (const range of chartSourceRanges(chart)) required_sheets.push(range.sheet);
  }

  return required_sheets;
}

/**
 * Sheets an operation reads or writes. The primary sheet is included unless
 * sheet lifecycle already checked it.
 */
function required_operation_sheets(operation: DocumentOp, include_primary: boolean): SheetId[] {
  if (operation.op === "addSheet") return added_sheet_references(operation.sheet);

  const required_sheets: SheetId[] = [];
  const primary_sheet = patchSheetId(operation);
  if (include_primary && primary_sheet !== null) required_sheets.push(primary_sheet);

  if (operation.op === "set" && operation.value.kind === "ref") {
    required_sheets.push(operation.value.target.sheet);
  } else if (operation.op === "setRange") {
    for (const cell of operation.cells) {
      if (cell.value.kind === "ref") required_sheets.push(cell.value.target.sheet);
    }
  } else if (operation.op === "setBlock" || operation.op === "restoreBlock") {
    if (operation.op === "restoreBlock") {
      required_sheets.push(
        ...preparedRestore(operation, validateDocumentOperationShape).requiredSheets,
      );
    } else {
      for (const [, target] of operation.block.refs ?? []) required_sheets.push(target.sheet);
    }
  } else if (operation.op === "setNamedRange") {
    if (operation.namedRange.range) required_sheets.push(operation.namedRange.range.sheet);
    if (operation.namedRange.scope !== undefined) {
      required_sheets.push(operation.namedRange.scope);
    }
  } else if (operation.op === "removeNamedRange" && operation.scope !== undefined) {
    required_sheets.push(operation.scope);
  } else if (operation.op === "setHyperlink") {
    required_sheets.push(operation.hyperlink.range.sheet);
    if (operation.hyperlink.target.kind === "internal") {
      required_sheets.push(operation.hyperlink.target.range.sheet);
    }
  } else if (operation.op === "setValidationRule") {
    required_sheets.push(operation.rule.range.sheet);
  } else if (operation.op === "setProtectedRange") {
    required_sheets.push(operation.protectedRange.range.sheet);
  } else if (operation.op === "setSheetMeta") {
    for (const rule of operation.patch.conditionalFormats ?? []) {
      required_sheets.push(rule.range.sheet);
    }
  } else if (operation.op === "setChart") {
    for (const range of chartSourceRanges(operation.chart)) required_sheets.push(range.sheet);
  } else if (
    operation.op === "setPivot" &&
    !operation.pivot.source.invalid &&
    "range" in operation.pivot.source
  ) {
    required_sheets.push(operation.pivot.source.range.sheet);
  }

  return required_sheets;
}
