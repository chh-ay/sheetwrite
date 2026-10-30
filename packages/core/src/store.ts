import { atomicBatchLimits, isAtomicBatch } from "./atomic-batch.js";
import { chartSourceRanges } from "./chart-definition.js";
import {
  assertWorkbookAllocationLimits,
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  resolveTransactionResourceLimits,
  resolveTransactionResourceValidation,
  SnapshotResourceError,
  type SnapshotResourceLimits,
  SnapshotValidationError,
  takeAdmittedTransactionResources,
  validateDocumentOperationShape,
} from "./document-protocol.js";
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
import { registerStoreEngine } from "./store/engine-registry.js";
import { StoreMutationPolicy } from "./store/mutation-policy.js";
import { addRowGroup, collapseRowGroup, patchSheetId, removeRowGroup } from "./store/ranges.js";
import { decodeWorkbookSnapshot, freezeXlsxSource } from "./store/snapshot-codec.js";
import { setTransactionStorageRevision } from "./transaction-admission.js";
import { preparedRestore, TransactionPreparation } from "./transaction-preparation.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
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
  SortKey,
  Workbook,
  WorkbookSnapshot,
  XlsxSourceSnapshot,
} from "./types/document.js";
import type { FormulaFunction, FormulaFunctionMetadata } from "./types/formula.js";
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
import { admitStoreXlsxSource } from "./xlsx-source.js";

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
  if (error instanceof SnapshotResourceError || error instanceof RangeError) return true;
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
  private readonly engine: StoreDataEngine;
  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private detailedChangeCapture = false;
  private protectionResolver: ProtectionResolver | undefined;
  private mutationPolicy: MutationPolicyMode;
  private readonly policy: StoreMutationPolicy;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;
  private documentId?: string;
  private documentVersion?: number;

  constructor(
    private readonly workbook: Workbook,
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
    try {
      this.engine = new StoreDataEngine(workbook, data, options);
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
    registerStoreEngine(this, this.engine);
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
      store?.dispose();
      if (isSnapshotAllocationFailure(error)) {
        throw new SnapshotValidationError([
          {
            path: "$",
            code: "resource-limit",
            message: error instanceof Error ? error.message : "Snapshot allocation failed",
          },
        ]);
      }
      throw error;
    }
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
    this.engine.recomputeVolatile(now);
    this.notifyRecalculated();
  }

  /**
   * Registers a synchronous JavaScript function that formulas in this store
   * can call, then recalculates every formula. Registering a name again
   * replaces the function. The function receives each argument as a scalar,
   * or as row arrays for a block of more than one cell, and returns a number,
   * text, boolean, or `null` for an empty result. A thrown error or any other
   * result shows `#VALUE!`. Snapshots keep only the formula text, so register
   * the function again after you load one.
   *
   * @throws {SheetwriteError} `invalid-function` when the name is a built-in
   * function, a cell reference, or not a function name, or when the metadata
   * is malformed.
   * @example
   * ```ts
   * import type { SheetwriteStore } from "@sheetwrite/core";
   *
   * function addTaxRate(store: SheetwriteStore) {
   *   store.registerFunction(
   *     {
   *       name: "TAXRATE",
   *       description: "Sales tax rate of a region.",
   *       arguments: [{ name: "region", types: ["text"] }],
   *       returnKind: "number",
   *     },
   *     (region) => (region === "EU" ? 0.2 : 0.07),
   *   );
   * }
   * ```
   * @see /docs/features/formulas/custom-functions/
   */
  registerFunction(metadata: FormulaFunctionMetadata, implementation: FormulaFunction): void {
    this.engine.registerFunction(metadata, implementation);
    this.notifyRecalculated();
  }

  /** Removes a host function. Formulas that call it show `#NAME?`. Returns whether it existed. */
  unregisterFunction(name: string): boolean {
    const removed = this.engine.unregisterFunction(name);
    if (removed) this.notifyRecalculated();

    return removed;
  }

  /**
   * Metadata of every function that formulas in this store can call: the
   * built-in functions of the active engine, then the host functions of this
   * store in registration order. Formula help reads this one list.
   */
  listFunctions(): readonly FormulaFunctionMetadata[] {
    return this.engine.listFunctions();
  }

  /** Calculated values changed without a document edit. */
  private notifyRecalculated(): void {
    this.epoch += 1;
    const event: ChangeEvent = {
      transaction: { patches: [] },
      changes: [],
      commitReason: "api",
      source: "local",
      epoch: this.epoch,
    };
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

  sortBy(sheet: SheetId, col: number, ascending: boolean): void {
    this.sortByMulti(sheet, [{ col, ascending }]);
  }

  sortByMulti(sheet: SheetId, keys: readonly SortKey[]): void {
    if (keys.length > 0) this.requireCompleteQuery(sheet);
    void this.applyTransaction(
      {
        patches: [
          {
            op: "setSheetMeta",
            sheet,
            patch: { sortKeys: keys.map((key) => ({ ...key })) },
          },
        ],
      },
      "structure",
    );
  }

  setColumnFilter(sheet: SheetId, col: number, filter: ColumnFilter | null): void {
    if (filter !== null) this.requireCompleteQuery(sheet);
    const filters = new Map(this.sheetMeta(sheet).filters ?? []);
    if (filter === null) {
      if (!filters.delete(col)) return;
    } else {
      filters.set(col, JSON.parse(JSON.stringify(filter)));
    }
    void this.applyTransaction(
      {
        patches: [{ op: "setSheetMeta", sheet, patch: { filters: [...filters] } }],
      },
      "structure",
    );
  }

  filterBy(sheet: SheetId, col: number, needle: string): void {
    this.setColumnFilter(sheet, col, { kind: "contains", text: needle });
  }

  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.engine.columnFilters(sheet);
  }

  distinctValues(sheet: SheetId, col: number, limit = 1000): CellScalar[] {
    return this.engine.distinctValues(sheet, col, limit);
  }

  hideRows(sheet: SheetId, rows: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const patches: DocumentOp[] = [];
    for (const row of new Set(rows)) {
      if (!Number.isInteger(row) || row < 0 || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: true },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  showRows(sheet: SheetId, rows?: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const targets = rows ?? [...(meta.hiddenRows ?? [])];
    const patches: DocumentOp[] = [];
    for (const row of new Set(targets)) {
      if (!Number.isInteger(row) || row < 0 || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: false },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  hiddenRows(sheet: SheetId): number[] {
    return this.engine.hiddenRows(sheet);
  }

  groupRows(sheet: SheetId, start: number, end: number): void {
    const groups = addRowGroup(this.sheetMeta(sheet).rowGroups, start, end);
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  ungroupRows(sheet: SheetId, start: number, end: number): void {
    const groups = removeRowGroup(this.sheetMeta(sheet).rowGroups, start, end);
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  setGroupCollapsed(sheet: SheetId, start: number, collapsed: boolean): void {
    const groups = collapseRowGroup(this.sheetMeta(sheet).rowGroups, start, collapsed);
    void this.applyTransaction(
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

  clearView(sheet: SheetId): void {
    const meta = this.sheetMeta(sheet);
    if ((meta.sortKeys?.length ?? 0) === 0 && (meta.filters?.length ?? 0) === 0) return;
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { sortKeys: [], filters: [] } }] },
      "structure",
    );
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
    const preparation = new TransactionPreparation(tx.patches);
    try {
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
      const resourceValidation = resourceResolution.result;
      if (!resourceValidation.ok) {
        return { status: "rejected", epoch: this.epoch, issues: [resourceValidation.issue] };
      }
      const invalidOperations = this.validateTransactionOperations(tx);
      if (invalidOperations) return invalidOperations;
      const options =
        typeof reasonOrOptions === "string" ? { commitReason: reasonOrOptions } : reasonOrOptions;
      const commitReason = options.commitReason ?? "api";
      const source = options.source ?? "local";
      if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
        return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
      }

      let effectiveTx = tx;
      let policyWarnings: MutationIssue[] = [];
      let policyRejections: MutationIssue[] = [];
      if (source === "local") {
        const policy = this.policy.evaluate(
          tx.patches,
          commitReason,
          this.protectionResolver,
          this.mutationPolicy,
        );
        policyWarnings = policy.warnings;
        policyRejections = policy.rejections;
        if (policy.rejections.length > 0 && policy.patches.length === 0) {
          return { status: "rejected", epoch: this.epoch, issues: policy.rejections };
        }
        if (policy.patches.length !== tx.patches.length) {
          effectiveTx = { ...tx, patches: policy.patches };
        }
        if (this.protectionResolver) {
          preparation.bind(effectiveTx.patches);
          // Permission callbacks receive live operations and may edit nested
          // payloads after ingress validation. Do not reuse their measurements.
          const callbackResources = resolveTransactionResourceValidation(
            effectiveTx.patches,
            limits,
          ).result;
          if (!callbackResources.ok) {
            return { status: "rejected", epoch: this.epoch, issues: [callbackResources.issue] };
          }
          const callbackOperations = this.validateTransactionOperations(effectiveTx);
          if (callbackOperations) return callbackOperations;
        }
      }

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
      const effects = this.engine.applyPatches(
        effectiveTx.patches,
        source === "remote" && options.localReplay !== true,
        hasListeners,
        this.detailedChangeCapture,
        admittedResources !== undefined &&
          resourceResolution.admitted === admittedResources &&
          !this.protectionResolver,
        source === "remote" || commitReason === "undo" || commitReason === "redo",
      );
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
      if (!hasListeners) {
        return {
          status: "applied",
          epoch: this.epoch,
          transaction,
          ...(policyWarnings.length > 0 ? { warnings: policyWarnings } : {}),
          ...(policyRejections.length > 0 ? { rejections: policyRejections } : {}),
        };
      }

      const event: ChangeEvent = {
        transaction,
        changes: effects.changes ?? [],
        commitReason,
        source,
        epoch: this.epoch,
      };
      for (const listener of this.listeners) listener(event);
      return {
        status: "applied",
        epoch: this.epoch,
        transaction,
        ...(policyWarnings.length > 0 ? { warnings: policyWarnings } : {}),
        ...(policyRejections.length > 0 ? { rejections: policyRejections } : {}),
      };
    } finally {
      preparation.dispose();
    }
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
        patch.op === "setCalculation"
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
    this.engine.loadPage(sheet, start, columns, rows, protect);
  }

  dispose(): void {
    this.engine.dispose();
  }

  private validateTransactionOperations(tx: Transaction): ApplyTransactionResult | undefined {
    const sheetLifecycle = createSheetLifecycleState(this.engine.getWorkbook().sheets);
    for (let operationIndex = 0; operationIndex < tx.patches.length; operationIndex++) {
      const operationPath = `transaction.patches[${operationIndex}]`;
      const operation = tx.patches[operationIndex];
      const unsafeError = validateDocumentOperationShape(operation, operationPath).find(
        (error) => error.code !== "out-of-bounds",
      );
      if (unsafeError || !operation) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "invalid-operation",
              severity: "error",
              operationIndex,
              message: unsafeError?.message ?? "Operation is missing",
            },
          ],
        };
      }
      const lifecycle = applySheetLifecycleOperation(sheetLifecycle, operation);
      if (lifecycle && !lifecycle.ok) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "sheet-lifecycle",
              severity: "error",
              code: lifecycle.code,
              sheet:
                operation.op === "addSheet"
                  ? operation.sheet.id
                  : (patchSheetId(operation) ?? undefined),
              operationIndex,
              message: SHEET_LIFECYCLE_MESSAGES[lifecycle.code],
            },
          ],
        };
      }
      const requiredSheets: SheetId[] = [];
      if (operation.op === "addSheet") {
        for (const block of operation.sheet.cells) {
          for (const cell of block.cells) {
            if (cell.value.kind === "ref") requiredSheets.push(cell.value.target.sheet);
          }
        }
        for (const rule of operation.sheet.conditionalFormats ?? []) {
          requiredSheets.push(rule.range.sheet);
        }
        for (const hyperlink of operation.sheet.hyperlinks ?? []) {
          requiredSheets.push(hyperlink.range.sheet);
          if (hyperlink.target.kind === "internal") {
            requiredSheets.push(hyperlink.target.range.sheet);
          }
        }
        for (const rule of operation.sheet.validationRules ?? []) {
          requiredSheets.push(rule.range.sheet);
        }
        for (const entry of operation.sheet.protectedRanges ?? []) {
          requiredSheets.push(entry.range.sheet);
        }
        for (const note of operation.sheet.notes ?? []) requiredSheets.push(note.addr.sheet);
        for (const chart of operation.sheet.charts ?? []) {
          for (const range of chartSourceRanges(chart)) requiredSheets.push(range.sheet);
        }
      } else {
        const primarySheet = patchSheetId(operation);
        if (lifecycle === null && primarySheet !== null) requiredSheets.push(primarySheet);
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
          requiredSheets.push(operation.namedRange.range.sheet);
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
      }
      const missingSheet = requiredSheets.find(
        (sheet) => !sheetLifecycle.sheets.some((candidate) => candidate.id === sheet),
      );
      if (missingSheet !== undefined) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "invalid-operation",
              severity: "error",
              operationIndex,
              message: `Sheet ${missingSheet} does not exist`,
            },
          ],
        };
      }
    }
    return undefined;
  }

  private requireCompleteQuery(sheet: SheetId): void {
    const capability = this.engine.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  private sheetMeta(sheet: SheetId) {
    const meta = this.engine.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    if (!meta) throw new Error(`unknown sheet: ${sheet}`);
    return meta;
  }
}
