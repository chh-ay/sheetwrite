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
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
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
const SHEET_LIFECYCLE_MESSAGES: Readonly<Record<SheetLifecycleIssueCode, string>> = {
  blank: "Sheet name cannot be blank",
  "too-long": "Sheet name exceeds 31 UTF-16 code units",
  "forbidden-character": "Sheet name contains a forbidden character",
  "edge-apostrophe": "Sheet name cannot begin or end with an apostrophe",
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

function isSnapshotAllocationFailure(error: unknown): boolean {
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
  private dataEngine: StoreDataEngine;

  /**
   * Every store call reaches the engine through here, so one check refuses
   * all of them while a host function from `@sheetwrite/core/functions` runs.
   */
  private get engine(): StoreDataEngine {
    this.dataEngine.hostFunctions?.assertIdle();
    return this.dataEngine;
  }

  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private detailedChangeCapture = false;
  private protectionResolver: ProtectionResolver | undefined;
  private mutationPolicy: MutationPolicyMode;
  private policy: StoreMutationPolicy;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;
  /** Document limits a snapshot of this store must meet; row and column inserts are held to them. */
  private readonly snapshotResourceLimits: Readonly<SnapshotResourceLimits>;
  private documentId?: string;
  private documentVersion?: number;
  /** Engine generation at construction; a different current value means the instance stopped. */
  private readonly generation = engineGeneration();

  constructor(
    private workbook: Workbook,
    data?: ColumnarData,
    options: SheetwriteStoreOptions = {},
  ) {
    // Frozen once here so exported snapshots share the payloads instead of copying them.
    if (workbook.xlsxSource) workbook.xlsxSource = freezeXlsxSource(workbook.xlsxSource);
    this.transactionResourceLimits = resolveTransactionResourceLimits(
      options.transactionResourceLimits,
    );
    const storage = options.storage ?? "dense";
    assertWorkbookAllocationLimits(workbook, {
      storage,
      resourceLimits: options.snapshotResourceLimits,
    });
    // The assertion above has validated every override.
    this.snapshotResourceLimits = {
      ...DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
      ...options.snapshotResourceLimits,
    };

    try {
      this.dataEngine = new StoreDataEngine(workbook, data, options);
    } catch (error) {
      if (!isSnapshotAllocationFailure(error)) throw error;
      const resource = storage === "dense" ? "maxDenseCells" : "maxLogicalCellsPerSheet";
      let actual = 0;
      for (const sheet of workbook.sheets) {
        const cells = sheet.rowCount * sheet.columns.length;
        actual = storage === "dense" ? actual + cells : Math.max(actual, cells);
      }

      throw new SnapshotResourceError(
        resource,
        options.snapshotResourceLimits?.[resource] ?? DEFAULT_SNAPSHOT_RESOURCE_LIMITS[resource],
        actual,
        { cause: error },
      );
    }

    this.policy = new StoreMutationPolicy(workbook, (sheet) => this.engine.pivotOutputs(sheet));
    this.protectionResolver = options.protectionResolver;
    this.mutationPolicy = options.mutationPolicy ?? "atomic";
    registerStoreEngine(this, this.engine, this.generation);
  }

  static fromSnapshot(input: unknown, options: SheetwriteStoreOptions = {}): SheetwriteStore {
    resolveTransactionResourceLimits(options.transactionResourceLimits);
    const { snapshot, workbook } = decodeWorkbookSnapshot(input, {
      storage: options.storage ?? "dense",
      resourceLimits: options.snapshotResourceLimits,
    });
    let store: SheetwriteStore | undefined;
    try {
      store = new SheetwriteStore(workbook, undefined, options);
      store.documentId = snapshot.documentId;
      store.documentVersion = snapshot.version;
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

      if (isSnapshotAllocationFailure(error)) {
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
    this.assertEngineRunning();

    const replacement = SheetwriteStore.fromSnapshot(snapshot, {
      protectionResolver: this.protectionResolver,
      mutationPolicy: this.mutationPolicy,
      transactionResourceLimits: this.transactionResourceLimits,
    });

    const previous = this.engine;
    replaceStoreEngine(this, replacement);
    this.dataEngine = replacement.dataEngine;
    this.workbook = replacement.workbook;
    this.documentId = replacement.documentId;
    this.documentVersion = replacement.documentVersion;
    this.epoch += 1;
    this.policy = new StoreMutationPolicy(this.workbook, (sheet) =>
      this.engine.pivotOutputs(sheet),
    );
    replaceStoreXlsxSource(this, replacement);

    previous.dispose();
  }

  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode = this.mutationPolicy,
  ): void {
    this.protectionResolver = resolver;
    this.mutationPolicy = mode;
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

  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return this.engine.getRangeMutationAllocationStats();
  }

  resetRangeMutationAllocationStats(): void {
    this.engine.resetRangeMutationAllocationStats();
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    return this.engine.getRuntimeResourceSnapshot(operation, phase, runtime);
  }

  resetRuntimeResourceAccounting(): void {
    this.engine.resetRuntimeResourceAccounting();
  }

  getFormulaMatrixResourcePeak(): TransientResourcePeak {
    return this.engine.getFormulaMatrixResourcePeak();
  }

  resetFormulaMatrixResourcePeak(): void {
    this.engine.resetFormulaMatrixResourcePeak();
  }

  withResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    return this.engine.withResourceOperation(operation, run);
  }

  isPaged(sheet: SheetId): boolean {
    return this.engine.isPaged(sheet);
  }

  getPagedStats(sheet: SheetId): PagedStoreStats {
    return this.engine.getPagedStats(sheet);
  }

  queryCapability(sheet: SheetId): QueryCapability {
    return this.engine.queryCapability(sheet);
  }

  getCellLoadState(addr: CellAddress): CellLoadState {
    return this.engine.getCellLoadState(addr);
  }

  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean {
    return this.engine.areColumnsFullyLoaded(sheet, startRow, endRow, columns);
  }

  isRangeFullyLoaded(input: Range): boolean {
    return this.engine.isRangeFullyLoaded(input);
  }

  canApplyLocally(patch: DocumentOp): boolean {
    return this.engine.canApplyLocally(patch);
  }

  captureRangeHistory(input: Range): CompactRangeHistory | null {
    return this.engine.captureRangeHistory(input);
  }

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
    this.assertEngineRunning();
    try {
      this.engine.recomputeVolatile(now);
    } catch (error) {
      throw this.stopOnTrap(error);
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

  dataRowAt(sheet: SheetId, viewRow: number): number {
    return this.engine.dataRowAt(sheet, viewRow);
  }

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
  ): ClipboardWindowView {
    return this.engine.getClipboardWindow(sheet, viewRows, cols);
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

  filterBy(sheet: SheetId, col: number, needle: string): ApplyTransactionResult {
    return this.setColumnFilter(sheet, col, { kind: "contains", text: needle });
  }

  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.engine.columnFilters(sheet);
  }

  distinctValues(sheet: SheetId, col: number, limit = DEFAULT_DISTINCT_VALUES_LIMIT): CellScalar[] {
    return this.engine.distinctValues(sheet, col, limit);
  }

  hideRows(sheet: SheetId, rows: readonly number[]): ApplyTransactionResult {
    const patches = rowVisibilityPatches(this.engine.sheets.sheetMeta(sheet), rows, true);
    return this.applyTransaction({ patches }, "structure");
  }

  showRows(sheet: SheetId, rows?: readonly number[]): ApplyTransactionResult {
    const meta = this.engine.sheets.sheetMeta(sheet);
    const patches = rowVisibilityPatches(meta, rows ?? [...(meta.hiddenRows ?? [])], false);
    return this.applyTransaction({ patches }, "structure");
  }

  hiddenRows(sheet: SheetId): number[] {
    return this.engine.hiddenRows(sheet);
  }

  groupRows(sheet: SheetId, start: number, end: number): ApplyTransactionResult {
    const groups = addRowGroup(this.engine.sheets.sheetMeta(sheet).rowGroups, start, end);
    return this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  ungroupRows(sheet: SheetId, start: number, end: number): ApplyTransactionResult {
    const groups = removeRowGroup(this.engine.sheets.sheetMeta(sheet).rowGroups, start, end);
    return this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

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

  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.engine.rowGroups(sheet);
  }

  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    return this.engine.dataEdge(sheet, row, col, dRow, dCol);
  }

  searchCells(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): CellAddress[] {
    return this.engine.searchCells(sheet, query, opts);
  }

  searchCellsFlat(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): Uint32Array {
    return this.engine.searchCellsFlat(sheet, query, opts);
  }

  clearView(sheet: SheetId): ApplyTransactionResult {
    const patch = clearViewPatch(this.engine.sheets.sheetMeta(sheet));
    if (!patch) return { status: "noop", epoch: this.epoch, reason: "empty" };

    return this.applyTransaction({ patches: [patch] }, "structure");
  }

  viewRowCount(sheet: SheetId): number {
    return this.engine.viewRowCount(sheet);
  }

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
    this.assertEngineRunning();
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
      return this.applyPreparedTransaction(owned, reasonOrOptions, preparation);
    } catch (error) {
      // Change listeners run inside this call too: a trap in a listener's
      // engine read stops the engine the same way.
      throw this.stopOnTrap(error);
    } finally {
      preparation.dispose();
    }
  }

  /** Admission, policy, application and notification for one transaction, in that order. */
  private applyPreparedTransaction(
    tx: Transaction,
    reasonOrOptions: CommitReason | TransactionApplicationOptions,
    preparation: TransactionPreparation,
  ): ApplyTransactionResult {
    // A transaction built and measured by an engine layer carries its resource
    // record; without one, direct callers pay the full payload walk. An
    // engine-built atomic batch is bounded by the batch ceilings instead.
    const limits = isAtomicBatch(tx.patches)
      ? atomicBatchLimits(this.transactionResourceLimits)
      : this.transactionResourceLimits;
    const admittedResources = takeAdmittedTransactionResources(tx);
    const resourceResolution = resolveTransactionResourceValidation(
      tx.patches,
      limits,
      admittedResources,
    );
    const rejected = this.admissionRejection(tx, resourceResolution.result);
    if (rejected) return rejected;

    const options =
      typeof reasonOrOptions === "string" ? { commitReason: reasonOrOptions } : reasonOrOptions;
    const commitReason = options.commitReason ?? "api";
    const source = options.source ?? "local";
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }

    const policy =
      source === "local"
        ? this.applyLocalPolicy(tx, commitReason, limits, preparation)
        : { tx, warnings: [], rejections: [] };
    if ("status" in policy) return policy;

    const effectiveTx = policy.tx;
    if (source === "local" || options.localReplay === true) {
      const dirtyCapacityIssue = this.engine.pagedDirtyCapacityIssue(effectiveTx.patches);
      if (dirtyCapacityIssue) {
        return { status: "rejected", epoch: this.epoch, issues: [dirtyCapacityIssue] };
      }
    }

    if (
      source === "local" &&
      effectiveTx.patches.some((patch) => !this.engine.canApplyLocally(patch))
    ) {
      return { status: "noop", epoch: this.epoch, reason: "incomplete-data" };
    }

    const hasListeners = this.listeners.size > 0;
    const effects = this.engine.applyPatches(effectiveTx.patches, {
      remoteLoad: source === "remote" && options.localReplay !== true,
      captureChanges: hasListeners,
      captureDetailedChanges: this.detailedChangeCapture,
      trustedHistory:
        admittedResources !== undefined &&
        resourceResolution.admitted === admittedResources &&
        !this.protectionResolver,
      replayPivotSources: source === "remote" || commitReason === "undo" || commitReason === "redo",
    });

    if (effects.appliedPatches.length === 0) {
      return {
        status: "noop",
        epoch: this.epoch,
        reason: effectiveTx.patches.length === 0 ? "empty" : "out-of-bounds",
      };
    }

    const xlsxSource = this.workbook.xlsxSource;
    if (xlsxSource) this.invalidateXlsxGraphs(xlsxSource, effects.appliedPatches);

    this.epoch += 1;
    const transaction =
      effects.appliedPatches.length === effectiveTx.patches.length
        ? effectiveTx
        : { ...effectiveTx, patches: effects.appliedPatches };
    setTransactionStorageRevision(transaction, effects.storageRevision);

    if (hasListeners) {
      const event: ChangeEvent = {
        transaction,
        changes: effects.changes ?? [],
        commitReason,
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
  private admissionRejection(
    tx: Transaction,
    resources: TransactionResourceValidationResult,
  ): ApplyTransactionResult | undefined {
    if (!resources.ok) return { status: "rejected", epoch: this.epoch, issues: [resources.issue] };

    const issue = this.transactionOperationIssue(tx);
    return issue ? { status: "rejected", epoch: this.epoch, issues: [issue] } : undefined;
  }

  /**
   * Run the mutation policy on a local transaction. Permission callbacks
   * receive live operations and may edit them, so the kept operations are
   * admitted again afterwards.
   */
  private applyLocalPolicy(
    tx: Transaction,
    commitReason: CommitReason,
    limits: Readonly<TransactionResourceLimits>,
    preparation: TransactionPreparation,
  ): LocalPolicyOutcome | ApplyTransactionResult {
    const policy = this.policy.evaluate(
      tx.patches,
      commitReason,
      this.protectionResolver,
      this.mutationPolicy,
    );
    if (policy.rejections.length > 0 && policy.patches.length === 0) {
      return { status: "rejected", epoch: this.epoch, issues: policy.rejections };
    }

    const effectiveTx =
      policy.patches.length === tx.patches.length ? tx : { ...tx, patches: policy.patches };
    if (this.protectionResolver) {
      preparation.bind(effectiveTx.patches);

      // Do not reuse measurements taken before the callbacks ran.
      const callbackResources = resolveTransactionResourceValidation(
        effectiveTx.patches,
        limits,
      ).result;
      const rejected = this.admissionRejection(effectiveTx, callbackResources);
      if (rejected) return rejected;
    }

    return { tx: effectiveTx, warnings: policy.warnings, rejections: policy.rejections };
  }

  /**
   * Drop retained OOXML graphs that a committed edit may have made stale. Costs
   * O(patches + graphs) and never reads cells; undo cannot restore a dropped
   * graph because the original package is not kept.
   */
  private invalidateXlsxGraphs(source: XlsxSourceSnapshot, patches: readonly DocumentOp[]): void {
    const valuesTouched = new Set<SheetId>();
    const layoutTouched = new Set<SheetId>();
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
        for (const sheet of this.workbook.sheets) valuesTouched.add(sheet.id);
        continue;
      }
      const sheet = patchSheetId(patch);
      if (sheet === null) continue;
      valuesTouched.add(sheet);
      if (XLSX_LAYOUT_OPS.has(patch.op)) layoutTouched.add(sheet);
    }

    const live = new Map(this.workbook.sheets.map((sheet) => [sheet.id, sheet.name]));
    const dropped = new Set(source.dropped);
    const graphs = source.graphs.filter((graph) => {
      const valid =
        (graph.sheetId === undefined || live.has(graph.sheetId)) &&
        graph.dependencies.every((dependency) =>
          dependency.scope === "values"
            ? live.get(dependency.sheetId) === dependency.name &&
              !valuesTouched.has(dependency.sheetId)
            : live.has(dependency.sheetId) && !layoutTouched.has(dependency.sheetId),
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

  on(_evt: "change", fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setDetailedChangeCapture(enabled: boolean): void {
    this.detailedChangeCapture = enabled;
  }

  acknowledgeOperations(operations: readonly DocumentOp[], storageRevision?: bigint): void {
    this.engine.acknowledgeOperations(operations, storageRevision);
  }

  exportSnapshot(): WorkbookSnapshot {
    return this.engine.exportSnapshot(this.documentId, this.documentVersion);
  }

  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    return this.engine.renameSheetFormulaIdentity(sheet, name);
  }

  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    return this.engine.removeSheetFormulaIdentity(sheet);
  }

  loadPage(
    sheet: SheetId,
    start: number,
    columns: readonly DataSourceColumnBand[],
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    this.assertEngineRunning();
    try {
      this.engine.loadPage(sheet, start, columns, rows, protect);
    } catch (error) {
      throw this.stopOnTrap(error);
    }
  }

  dispose(): void {
    // A stopped instance can throw from any call, even `free`. Its linear
    // memory goes with the instance when the last of its stores is collected.
    if (this.generation !== engineGeneration()) return;

    this.engine.dispose();
  }

  /** Refuse work once the engine stopped: its instance can be half-written. */
  private assertEngineRunning(): void {
    if (this.generation !== engineGeneration()) throw engineFailedError();
  }

  private stopOnTrap(error: unknown): unknown {
    return isEngineTrap(error) ? stopEngine(error, this.generation) : error;
  }

  /**
   * The first operation that is malformed, breaks sheet lifecycle, names a
   * missing sheet, or grows a sheet past a document limit.
   */
  private transactionOperationIssue(tx: Transaction): MutationIssue | undefined {
    const sheetLifecycle = createSheetLifecycleState(this.engine.getWorkbook().sheets);
    let growth: SheetGrowth | undefined;
    for (let operationIndex = 0; operationIndex < tx.patches.length; operationIndex++) {
      const operationPath = `transaction.patches[${operationIndex}]`;
      const operation = tx.patches[operationIndex];
      const unsafeError = validateDocumentOperationShape(operation, operationPath).find(
        (error) => error.code !== "out-of-bounds",
      );
      if (unsafeError || !operation) {
        return {
          kind: "invalid-operation",
          severity: "error",
          operationIndex,
          message: unsafeError?.message ?? "Operation is missing",
        };
      }

      const lifecycle = applySheetLifecycleOperation(sheetLifecycle, operation);
      if (lifecycle && !lifecycle.ok) {
        return {
          kind: "sheet-lifecycle",
          severity: "error",
          code: lifecycle.code,
          sheet:
            operation.op === "addSheet"
              ? operation.sheet.id
              : (patchSheetId(operation) ?? undefined),
          operationIndex,
          message: SHEET_LIFECYCLE_MESSAGES[lifecycle.code],
        };
      }

      const requiredSheets = requiredOperationSheets(operation, lifecycle === null);
      const missingSheet = requiredSheets.find(
        (sheet) => !sheetLifecycle.sheets.some((candidate) => candidate.id === sheet),
      );
      if (missingSheet !== undefined) {
        return {
          kind: "invalid-operation",
          severity: "error",
          operationIndex,
          message: `Sheet ${missingSheet} does not exist`,
        };
      }

      if (operation.op === "addRows" || operation.op === "addColumns") {
        growth ??= this.sheetGrowth();
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

  /** Every sheet's dimensions now, and which hold dense storage, for {@link SheetGrowth}. */
  private sheetGrowth(): SheetGrowth {
    const sheets = new Map<SheetId, SheetDimensions>();
    for (const sheet of this.engine.getWorkbook().sheets) {
      sheets.set(sheet.id, {
        name: sheet.name,
        rows: sheet.rowCount,
        columns: sheet.columns.length,
        dense: !this.engine.isPaged(sheet.id),
      });
    }
    return new SheetGrowth(sheets, this.snapshotResourceLimits);
  }
}

/** Every sheet a new sheet's snapshot refers to, which must exist once it is added. */
function addedSheetReferences(sheet: SheetSnapshot): SheetId[] {
  const requiredSheets: SheetId[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.value.kind === "ref") requiredSheets.push(cell.value.target.sheet);
    }
  }

  for (const rule of sheet.conditionalFormats ?? []) {
    requiredSheets.push(rule.range.sheet);
  }

  for (const hyperlink of sheet.hyperlinks ?? []) {
    requiredSheets.push(hyperlink.range.sheet);
    if (hyperlink.target.kind === "internal") {
      requiredSheets.push(hyperlink.target.range.sheet);
    }
  }

  for (const rule of sheet.validationRules ?? []) {
    requiredSheets.push(rule.range.sheet);
  }

  for (const entry of sheet.protectedRanges ?? []) {
    requiredSheets.push(entry.range.sheet);
  }

  for (const note of sheet.notes ?? []) requiredSheets.push(note.addr.sheet);
  for (const chart of sheet.charts ?? []) {
    for (const range of chartSourceRanges(chart)) requiredSheets.push(range.sheet);
  }

  return requiredSheets;
}

/**
 * Sheets an operation reads or writes. The primary sheet is included unless
 * sheet lifecycle already checked it.
 */
function requiredOperationSheets(operation: DocumentOp, includePrimary: boolean): SheetId[] {
  if (operation.op === "addSheet") return addedSheetReferences(operation.sheet);

  const requiredSheets: SheetId[] = [];
  const primarySheet = patchSheetId(operation);
  if (includePrimary && primarySheet !== null) requiredSheets.push(primarySheet);

  if (operation.op === "set" && operation.value.kind === "ref") {
    requiredSheets.push(operation.value.target.sheet);
  } else if (operation.op === "setRange") {
    for (const cell of operation.cells) {
      if (cell.value.kind === "ref") requiredSheets.push(cell.value.target.sheet);
    }
  } else if (operation.op === "setBlock" || operation.op === "restoreBlock") {
    if (operation.op === "restoreBlock") {
      requiredSheets.push(
        ...preparedRestore(operation, validateDocumentOperationShape).requiredSheets,
      );
    } else {
      for (const [, target] of operation.block.refs ?? []) requiredSheets.push(target.sheet);
    }
  } else if (operation.op === "setNamedRange") {
    if (operation.namedRange.range) requiredSheets.push(operation.namedRange.range.sheet);
    if (operation.namedRange.scope !== undefined) {
      requiredSheets.push(operation.namedRange.scope);
    }
  } else if (operation.op === "removeNamedRange" && operation.scope !== undefined) {
    requiredSheets.push(operation.scope);
  } else if (operation.op === "setHyperlink") {
    requiredSheets.push(operation.hyperlink.range.sheet);
    if (operation.hyperlink.target.kind === "internal") {
      requiredSheets.push(operation.hyperlink.target.range.sheet);
    }
  } else if (operation.op === "setValidationRule") {
    requiredSheets.push(operation.rule.range.sheet);
  } else if (operation.op === "setProtectedRange") {
    requiredSheets.push(operation.protectedRange.range.sheet);
  } else if (operation.op === "setSheetMeta") {
    for (const rule of operation.patch.conditionalFormats ?? []) {
      requiredSheets.push(rule.range.sheet);
    }
  } else if (operation.op === "setChart") {
    for (const range of chartSourceRanges(operation.chart)) requiredSheets.push(range.sheet);
  } else if (
    operation.op === "setPivot" &&
    !operation.pivot.source.invalid &&
    "range" in operation.pivot.source
  ) {
    requiredSheets.push(operation.pivot.source.range.sheet);
  }

  return requiredSheets;
}
