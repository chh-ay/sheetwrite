import type { CellSnapshot, EngineInstance, RangeSnapshot } from "@sheetwrite/wasm";

import { type FormulaAxisEdit, remapFormulaA1Refs } from "../a1.js";
import { parseCellLiteralInput } from "../cell-input.js";
import {
  assertWorkbookCharts,
  type ChartAxisEdit,
  chartFitsSheets,
  invalidateChartSheet,
  MAX_CHARTS_PER_SHEET,
  rebaseChartAxis,
  sanitizeChartDefinition,
  sheetChartsFit,
} from "../chart-definition.js";
import { capturedClearCells } from "../clear-capture.js";
import { validConditionalRules } from "../conditional-format.js";
import {
  dashboardFields,
  dashboardPivotAllowed,
  dashboardTakes,
  findDashboardItem,
  isDashboard,
  validateDashboardItemAdmission,
  withDashboardItem,
  withoutDashboardItem,
} from "../dashboard.js";
import {
  type DataModelIssue,
  findMeasure,
  findRelationship,
  validateMeasureAdmission,
  withMeasure,
  withoutMeasure,
  validateRelationshipAdmission,
  withoutRelationship,
  withRelationship,
} from "../data-model.js";
import { dateToSerial } from "../date-serial.js";
import { isValidCalculationSettings, storedCalculationSettings } from "../document-protocol.js";
import { ENGINE_LOAD_HINT, getEngine, isEngineLoaded as isLoaded } from "../engine.js";
import {
  datasourceFailure,
  SheetwriteError,
  type SheetwriteErrorCode,
  type SheetwriteErrorContext,
} from "../errors.js";
import type { FormulaFunctionMetadata } from "../functions/types.js";
import { DEFAULT_DISTINCT_VALUES_LIMIT } from "../grid-constants.js";
import {
  cloneCellHyperlink,
  MAX_HYPERLINKS_PER_SHEET,
  sanitizeCellHyperlink,
} from "../hyperlink.js";
import { formulaNameKey } from "../name-key.js";
import {
  applyPivotRewrites,
  clonePivot,
  encodePivotPayload,
  encodeSavedPivotPayload,
  MAX_PIVOTS_PER_WORKBOOK,
  type PivotIssue,
  pivotOwner,
  pivotRewrites,
  planPivotEdit,
  savedOutputRange,
  sheetPivotScope,
  uncomputedPivotResult,
  validatePivotReferences,
  validatePivotShape,
} from "../pivot.js";
import { cloneJsonValue } from "../plain-data.js";
import {
  consumeSourceSnapshot,
  type RangeSourceProjection,
  referenceTargetFromPacked,
} from "../reference.js";
import {
  BoundaryResourceAccounting,
  createRuntimeResourceSnapshot,
  decodeStoreMemoryStats,
  emptyStoreMemoryStats,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
  type StoreMemoryBreakdown,
  type TransientResourcePeak,
} from "../resource-accounting.js";
import { restoreBlockFacts } from "../restore-block.js";
import {
  decodeRowOrder,
  encodeRowOrder,
  type PermuteRowsOperation,
  ROW_ORDER_ENCODING,
} from "../row-order.js";
import {
  type SavedQueryIssue,
  validateQueryAdmission,
  validateQueryRemoval,
  withoutQuery,
  withQuery,
} from "../saved-query.js";
import { canAddSheetSnapshot } from "../sheet-lifecycle.js";
import { validateSheetName } from "../sheet-name.js";
import { StyleDictionary } from "../style-dictionary.js";
import { preparedHistoryBlock, type TransactionPreparation } from "../transaction-preparation.js";
import type {
  CellFormat,
  CellHyperlink,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatRule,
} from "../types/cell.js";
import type { ChartDefinition } from "../types/chart.js";
import type { CellAddress, MergeRange, Range, SheetId } from "../types/coordinates.js";
import type { DataModel, RelationshipStatus } from "../types/data-model.js";
import type {
  AggregateOp,
  ColumnarData,
  DataCell,
  DataSourceColumnBand,
  RowData,
} from "../types/data.js";
import type {
  CalculationSettings,
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  NamedRangeSnapshot,
  PackedCellBlock,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  Sheet,
  SheetSnapshot,
  SnapshotCell,
  SortKey,
  Workbook,
  WorkbookSnapshot,
} from "../types/document.js";
import type {
  PivotDefinition,
  PivotFieldType,
  PivotResultView,
  PivotSourceField,
} from "../types/pivot.js";
import type {
  CellLoadState,
  ClipboardWindowView,
  PagedStoreStats,
  QueryCapability,
  ResolvedCell,
  ResourceOwnerBytes,
  VisibleWindowView,
} from "../types/store.js";
import type { WorkbookTable, WorkbookTableColumn } from "../types/table.js";
import type { ChangeEvent } from "../types/transaction.js";
import {
  assertWorkbookTables,
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  remapWorkbookTableRuleColumns,
  validWorkbookTable,
  workbookTableNameKey,
} from "../workbook-table.js";
import { PagedDirtyPreflight } from "./paged-dirty-preflight.js";
import {
  MERGED_CELLS_SORT_MESSAGE,
  permutedHyperlinks,
  permutedMerges,
  permutedNotes,
  type SortRangePlan,
  tablesAllowRowMove,
  tableSortState,
  tableWithBody,
} from "./permute-rows.js";
import { type PivotStatusRecord, pivotStatusAt } from "./pivot-status.js";
import {
  cellRange,
  deleteRemap,
  insertRemap,
  integerAt,
  mergeCrossesFreeze,
  mergesOverlap,
  moveRemap,
  normalizedRange,
  normalizeMerge,
  patchSheetId,
  pivotWrittenRange,
  positiveCount,
  rangesIntersect,
  rebaseRangeAxis,
  rebaseRangeItems,
  rebaseRangeSpan,
  remapSpan,
  type SheetAxis,
  sameMerge,
  uniqueColumnKeys,
  validMerge,
  validProtectedRanges,
  validSortAndFilters,
  validValidationRules,
  visibleSheetNeighbor,
} from "./ranges.js";
import { SheetRegistry } from "./sheet-registry.js";
import { StoreSnapshotCodec } from "./snapshot-codec.js";
import { StoreViewState } from "./view-state.js";
import type { PivotOutputCells, RecomputingCellStore } from "./wasm-contract.js";
import { StoreWindowReader } from "./window-reader.js";
import {
  KIND_BOOL,
  KIND_FORMULA,
  KIND_NUMBER,
  KIND_STRING,
  NO_CELL_COORDINATE,
  CELL_STATE_UNLOADED,
  CELL_STATE_LOADED_EMPTY,
  CELL_STATE_LOCAL_EDIT,
} from "./wire-tags.js";

const AGG_OP: Record<AggregateOp, number> = { sum: 0, avg: 1, min: 2, max: 3, count: 4 };

/** Engine field-type codes, indexed by code. */
const PIVOT_FIELD_TYPES: readonly PivotFieldType[] = [
  "blank",
  "number",
  "text",
  "boolean",
  "mixed",
];

/** Error sentinels by engine `FormulaError` slot; `pivotStatus` sends slot + 1. */
export const PIVOT_ERRORS: readonly string[] = [
  "#CYCLE!",
  "#DIV/0!",
  "#REF!",
  "#NUM!",
  "#VALUE!",
  "#NAME?",
  "#N/A",
  "#SPILL!",
  "#CALC!",
  "#LOADING!",
  "#NULL!",
];

/** Values in a `relationshipStatus` record: code, firstRow, secondRow, unmatched. */
const RELATIONSHIP_STATUS_STRIDE = 4;
/** Codes of `relationshipStatus`; twins of the `STATUS_*` codes in `store/relationships.rs`. */
const RELATIONSHIP_STATUS = {
  ok: 0,
  missingTable: 1,
  missingColumn: 2,
  oneSideType: 3,
  manySideType: 4,
  duplicateKey: 5,
} as const;

/** Decodes one engine `relationshipStatus` record. */
function relationshipStatusOf(record: Uint32Array): RelationshipStatus {
  const [code, first = 0, second = 0, unmatched = 0] = record;
  switch (code) {
    case RELATIONSHIP_STATUS.ok:
      return { status: "ok", unmatched };
    case RELATIONSHIP_STATUS.missingTable:
      return { status: "missingTable" };
    case RELATIONSHIP_STATUS.missingColumn:
      return { status: "missingColumn" };
    case RELATIONSHIP_STATUS.oneSideType:
      return { status: "typeMismatch", side: "to", row: first };
    case RELATIONSHIP_STATUS.manySideType:
      return { status: "typeMismatch", side: "from", row: first };
    case RELATIONSHIP_STATUS.duplicateKey:
      return { status: "duplicateKey", rows: [first, second] };
    default:
      throw new Error(`Sheetwrite: unknown relationship status code ${code}`);
  }
}

/** Rows per allocation-lazy chunk; this matches the store engine's native default. */
const DEFAULT_PAGED_CHUNK_ROWS = 4_096;
/** Per-sheet budget for clean, unpinned chunks; dirty or visible chunks stay resident. */
const DEFAULT_PAGED_CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_PAGED_DIRTY_CELL_LIMIT = 1_000_000;
const MAX_PAGED_REFERENCE_SIMULATION_ENTRIES = 100_000;

/** Store-local compact history resource. Never serialize `resource`. */
export interface CompactRangeHistory {
  readonly range: Range;
  readonly resource: RangeSnapshot;
  readonly byteLength: number;
  readonly refs: ReadonlyArray<[offset: number, target: CellAddress]>;
  toDocumentOp(
    range: Range,
    preparation?: TransactionPreparation,
  ): Extract<DocumentOp, { op: "setBlock" }>;
  dispose(): void;
}

export interface PreparedEngineMemoryRelease {
  commit(): void;
  abort(): void;
}

export interface RangeMutationAllocationStats {
  readonly documentOperations: number;
  readonly jsPatchObjects: number;
  readonly ffiCalls: number;
  readonly maxTransferredArrayLength: number;
  readonly distinctStyleIds: number;
  readonly historySnapshots: number;
  readonly historySnapshotBytes: number;
  readonly historyMaterializations: number;
  readonly historyDisposals: number;
  readonly styleDictionaryEntries: number;
  readonly admissionReferenceEntriesScanned: number;
  readonly admissionReferenceMapsMaterialized: number;
}

export interface SheetwriteStoreOptions {
  /** Storage engine; defaults to eager `dense` allocation. */
  storage?: "dense" | "paged";
  /** Paged row chunk size; defaults to 4,096 and is normalized to a power of two. */
  chunkRows?: number;
  /** Per-sheet clean-chunk budget; defaults to 32 MiB. Dirty and pinned chunks may exceed it. */
  cacheBytes?: number;
  /** Maximum sparse local edits retained outside the clean page cache. Defaults to 1,000,000 cells; further edits reject atomically. */
  dirtyCellLimit?: number;
  /** Maximum clean references retained for exact multi-operation remove-sheet simulation. */
  referenceSimulationLimit?: number;
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
}

function rebaseHyperlinkAxis(
  hyperlink: CellHyperlink,
  editedSheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): CellHyperlink | null {
  const rebaseRange = (range: Range): Range | null =>
    range.sheet === editedSheet ? rebaseRangeSpan(range, axis, remap) : range;

  const range = rebaseRange(hyperlink.range);
  if (!range) return null;
  if (hyperlink.target.kind === "external") {
    return range === hyperlink.range ? hyperlink : { ...hyperlink, range };
  }

  const targetRange = rebaseRange(hyperlink.target.range);
  if (!targetRange) return null;
  return {
    ...hyperlink,
    range,
    target:
      targetRange === hyperlink.target.range
        ? hyperlink.target
        : { kind: "internal", range: targetRange },
  };
}
/** A copy of `items` with `item` at `index`, or appended when `index` is negative. */
function withEntry<T>(items: readonly T[], index: number, item: T): T[] {
  if (index < 0) return [...items, item];

  const next = [...items];
  next[index] = item;
  return next;
}

/**
 * `items` with `item` in place of the first entry that `matches`, or with
 * `item` appended. The list is copied, never mutated, so a list captured for
 * undo stays exact.
 */
function upsertWhere<T>(items: readonly T[], item: T, matches: (existing: T) => boolean): T[] {
  return withEntry(items, items.findIndex(matches), item);
}

/** `upsertWhere` keyed by `id`; null when an append would pass `maxEntries`. */
function upsertById<T extends { readonly id: string }>(items: readonly T[], item: T): T[];
function upsertById<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
  maxEntries: number,
): T[] | null;
function upsertById<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
  maxEntries = Number.POSITIVE_INFINITY,
): T[] | null {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index < 0 && items.length >= maxEntries) return null;

  return withEntry(items, index, item);
}

/** Copies of the range-keyed items that a row or column move carries. */
interface MovedItems {
  readonly namedRanges: readonly (NamedRangeSnapshot & { range: Range })[];
  readonly validationRules: readonly DataValidationRule[];
  readonly protectedRanges: readonly ProtectedRange[];
  readonly notes: NonNullable<Sheet["notes"]>;
  readonly conditionalFormats: readonly ConditionalFormatRule[];
  readonly hyperlinks: ReadonlyArray<readonly [SheetId, readonly CellHyperlink[]]>;
  readonly tables: readonly WorkbookTable[];
  readonly charts: ReadonlyMap<Sheet, readonly ChartDefinition[]> | null;
}

type RowMetaPatch = Extract<DocumentOp, { op: "setRowMeta" }>["meta"];

/** Height and hidden state of each moved row; null for a row with neither. */
function movedRowMeta(sheet: Sheet, from: number, count: number): Array<RowMetaPatch | null> {
  return Array.from({ length: count }, (_, offset) => {
    const row = from + offset;
    const height = sheet.rowHeights?.get(row);
    const hidden = sheet.hiddenRows?.has(row) ?? false;
    return height === undefined && !hidden ? null : { height, hidden };
  });
}

/** One `setRange` that writes the moved cells at their target rows or columns. */
function movedCellsPatch(
  sheet: Sheet,
  patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
  axis: SheetAxis,
  cells: readonly Extract<DocumentOp, { op: "set" }>[],
): DocumentOp {
  const last = patch.to + patch.count - 1;
  const range: Range =
    axis === "row"
      ? {
          sheet: patch.sheet,
          start: { row: patch.to, col: 0 },
          end: { row: last, col: sheet.columns.length - 1 },
        }
      : {
          sheet: patch.sheet,
          start: { row: 0, col: patch.to },
          end: { row: sheet.rowCount - 1, col: last },
        };

  return {
    op: "setRange",
    range,
    cells: cells.map((cell) => ({
      rowOffset: axis === "row" ? cell.addr.row - patch.from : cell.addr.row,
      colOffset: axis === "row" ? cell.addr.col : cell.addr.col - patch.from,
      value: cell.value,
      style: cell.style,
    })),
  };
}

/** Row heights, hidden rows and row groups after a row insert or delete. */
function rebaseRowMeta(meta: Sheet, remap: (row: number) => number | null): void {
  if (meta.rowHeights) {
    const next = new Map<number, number>();
    for (const [row, height] of meta.rowHeights) {
      const mapped = remap(row);
      if (mapped !== null) next.set(mapped, height);
    }

    meta.rowHeights = next;
  }

  if (meta.hiddenRows) {
    const next = new Set<number>();
    for (const row of meta.hiddenRows) {
      const mapped = remap(row);
      if (mapped !== null) next.add(mapped);
    }

    meta.hiddenRows = next;
  }

  meta.rowGroups = meta.rowGroups
    ?.map((group) => {
      const span = remapSpan(group.start, group.end, remap);
      return span ? { ...group, start: span[0], end: span[1] } : null;
    })
    .filter((group): group is RowGroup => group !== null);
}

function rebaseMergeAxis(
  merge: MergeRange,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): MergeRange | null {
  if (axis === "row") {
    const span = remapSpan(merge.r0, merge.r1, remap);
    return span ? { ...merge, r0: span[0], r1: span[1] } : null;
  }

  const span = remapSpan(merge.c0, merge.c1, remap);
  return span ? { ...merge, c0: span[0], c1: span[1] } : null;
}

/** Frozen rows or columns after an axis edit: up to the last frozen index that survives. */
function frozenCountAfter(count: number, remap: (index: number) => number | null): number {
  const boundary = remapSpan(0, count - 1, remap);
  return boundary ? boundary[1] + 1 : 0;
}

/** Notes on `sheet` moved along `axis`; a note whose cell is removed is dropped. */
function rebaseNotes(
  notes: NonNullable<Sheet["notes"]>,
  sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): NonNullable<Sheet["notes"]> {
  const key = axis === "row" ? "row" : "col";
  const rebased: NonNullable<Sheet["notes"]> = [];
  for (const note of notes) {
    if (note.addr.sheet !== sheet) {
      rebased.push(note);
      continue;
    }

    const index = remap(note.addr[key]);
    if (index !== null) rebased.push({ ...note, addr: { ...note.addr, [key]: index } });
  }
  return rebased;
}

/** Hyperlinks rebased with `rebaseHyperlinkAxis`, dropping the removed ones. */
function rebaseHyperlinks(
  hyperlinks: readonly CellHyperlink[],
  sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): CellHyperlink[] {
  return hyperlinks
    .map((hyperlink) => rebaseHyperlinkAxis(hyperlink, sheet, axis, remap))
    .filter((hyperlink): hyperlink is CellHyperlink => hyperlink !== null);
}

/**
 * Carry the conditional formats of `editedSheet` through a row or column
 * edit: each range moves with `remap` and each formula rule's references
 * follow `formulaEdit`. A rule whose range is removed is dropped.
 */
function rebaseConditionalFormats(
  rules: readonly ConditionalFormatRule[],
  editedSheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
  formulaEdit: FormulaAxisEdit,
): ConditionalFormatRule[] {
  const rebased: ConditionalFormatRule[] = [];
  for (const rule of rules) {
    if (rule.range.sheet !== editedSheet) {
      rebased.push(rule);
      continue;
    }

    const range = rebaseRangeSpan(rule.range, axis, remap);
    if (!range) continue;

    const when =
      rule.when.kind === "formula"
        ? { ...rule.when, source: remapFormulaA1Refs(rule.when.source, axis, formulaEdit) }
        : rule.when;
    rebased.push({ ...rule, range, when });
  }
  return rebased;
}

/** A store failure caused by the workbook, options or call the host gave. */
function storeFailure(
  code: SheetwriteErrorCode,
  message: string,
  context?: SheetwriteErrorContext,
): SheetwriteError {
  return new SheetwriteError(code, "store", message, context === undefined ? {} : { context });
}

/** Error thrown when an operation requires datasource cells that are not loaded. */
export class IncompleteDataError extends SheetwriteError {
  override readonly name = "IncompleteDataError";
  declare readonly code: "incomplete-data";
  readonly capability: Extract<QueryCapability, { status: "incomplete" }>;

  constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete" }>) {
    super("incomplete-data", "query", `Sheetwrite: ${sheet} has unloaded datasource cells`, {
      context: {
        sheet,
        loadedCells: capability.loadedCells,
        totalCells: capability.totalCells,
      },
    });
    this.capability = capability;
  }
}

export interface StoreDataEngineEffects {
  readonly appliedPatches: DocumentOp[];
  readonly changes: ChangeEvent["changes"] | null;
  readonly storageRevision: bigint;
}

function literalOf(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

/** Shared empty style; keeps change capture from allocating a style per cell. */
const EMPTY_STYLE: CellStyle = {};
const TEXT_ENCODER = new TextEncoder();
/** Worst-case UTF-8 bytes of one UTF-16 code unit, used to size a retry. */
const MAX_UTF8_BYTES_PER_CODE_UNIT = 3;

/**
 * Cell strings of one block packed into a single UTF-8 buffer.
 *
 * Text crosses into WASM once per block instead of once per cell: `add` appends
 * each string after the previous one and `offsets` records the byte boundary of
 * every string, so the native side slices the buffer and never re-encodes.
 * Strings must be added in the flat input order of their cells: row-major for
 * document blocks and column-major for columnar imports.
 */
class PackedTextBuffer {
  private written = 0;
  private count = 0;
  private bytes: Uint8Array;
  /** Start of each string, plus the packed length as the final entry. */
  readonly offsets: Uint32Array;

  constructor(byteCapacity: number, textCount: number) {
    this.bytes = new Uint8Array(Math.max(byteCapacity, 1));
    this.offsets = new Uint32Array(textCount + 1);
  }

  add(value: string): void {
    this.offsets[this.count] = this.written;
    let encoded = TEXT_ENCODER.encodeInto(value, this.bytes.subarray(this.written));
    if (encoded.read < value.length) {
      // The initial capacity assumes ASCII text; non-ASCII needs more bytes.
      this.grow(this.written + value.length * MAX_UTF8_BYTES_PER_CODE_UNIT);
      encoded = TEXT_ENCODER.encodeInto(value, this.bytes.subarray(this.written));
    }
    this.written += encoded.written;
    this.count += 1;
    this.offsets[this.count] = this.written;
  }

  packedBytes(): Uint8Array {
    return this.written === this.bytes.length ? this.bytes : this.bytes.subarray(0, this.written);
  }

  private grow(requiredBytes: number): void {
    let capacity = this.bytes.length;
    while (capacity < requiredBytes) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.written));
    this.bytes = grown;
  }
}

/** What `@sheetwrite/core/functions` installs on an engine; core only calls it. */
export interface HostFunctionHooks {
  /** Throws while a host function runs, so no store call reaches the busy engine. */
  assertIdle(): void;
  /** Registers every host function on a replacement WASM store without recalculating. */
  restore(wasm: RecomputingCellStore): void;
  /** Makes `wasm` the store that later registrations change; called once it is live. */
  adopt(wasm: RecomputingCellStore): void;
  /** The registered functions, for chrome that lists them (Formulas › Insert Function). */
  metadata(): readonly FormulaFunctionMetadata[];
}

/**
 * Owns the raw workbook/WASM state and returns typed effects to the public
 * transaction facade. It never owns public listeners, epochs, or policy.
 */
export class StoreDataEngine {
  private wasm: RecomputingCellStore;
  private readonly workbook: Workbook;
  private readonly storageOptions: SheetwriteStoreOptions;
  /** Sheets and engine handles, shared with the store parts and the public store. */
  readonly sheets: SheetRegistry;
  private readonly styles = new StyleDictionary();
  private readonly sheetIdsByHandle: SheetId[] = [];
  private readonly view: StoreViewState;
  private readonly windowReader: StoreWindowReader;
  private readonly snapshotCodec: StoreSnapshotCodec;
  private readonly pagedDirtyPreflight: PagedDirtyPreflight | null;
  private readonly boundaryAccounting = new BoundaryResourceAccounting();
  private resourceOperation: RuntimeResourceOperation | null = "startup";
  private disposed = false;
  private committedBytesAfterDispose: number | null = null;
  private readonly spillBlockersDirty = new Set<SheetId>();
  /** Sheets whose pivots must be sent to the engine before the mutation commits. */
  private readonly pivotSheetsDirty = new Set<SheetId>();
  /**
   * The definitions the engine computes for a sheet's pivots, when they
   * differ from the saved ones. The dashboard chunk sets it to add slicer
   * filters, so first paint carries only this slot.
   */
  private pivotView: ((sheet: Sheet) => PivotDefinition[] | undefined) | null = null;

  private readonly rangeHistory = new Map<
    CompactRangeHistory,
    { sheetHandle: number; replace(resource: RangeSnapshot): void }
  >();

  private pendingPageRequests = 0;

  private pageIdleWaiters: Array<() => void> | undefined;

  private readonly memoryReleaseListeners = new Set<() => void>();

  /** Hooks of `@sheetwrite/core/functions`; `undefined` until a host function is registered. */
  hostFunctions: HostFunctionHooks | undefined;

  /** Paged sheets hydrated from a snapshot treat omitted cells as known empty. */
  private readonly authoritativeSnapshotSheets = new Set<SheetId>();
  private snapshotAuthoritative = false;

  private readonly rangeMutationStats = {
    documentOperations: 0,
    jsPatchObjects: 0,
    ffiCalls: 0,
    maxTransferredArrayLength: 0,
    distinctStyleIds: 0,
    historySnapshots: 0,
    historySnapshotBytes: 0,
    historyMaterializations: 0,
    historyDisposals: 0,
    admissionReferenceEntriesScanned: 0,
    admissionReferenceMapsMaterialized: 0,
  };

  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    if (!isLoaded()) {
      throw storeFailure(
        "initialization-required",
        `Sheetwrite: await initSheetwrite() before constructing SheetwriteStore. ${ENGINE_LOAD_HINT}`,
      );
    }

    if (
      options.referenceSimulationLimit !== undefined &&
      (!Number.isSafeInteger(options.referenceSimulationLimit) ||
        options.referenceSimulationLimit <= 0)
    ) {
      throw storeFailure(
        "invalid-argument",
        "Sheetwrite: referenceSimulationLimit must be a positive safe integer",
      );
    }

    if (data && options.storage === "paged") {
      throw storeFailure("invalid-argument", "Sheetwrite: ColumnarData requires dense storage");
    }

    assertWorkbookTables(
      workbook.sheets,
      DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
      (workbook.namedRanges ?? []).map((range) => range.name),
    );

    assertWorkbookCharts(workbook.sheets);

    this.workbook = workbook;
    this.sheets = new SheetRegistry(workbook);
    this.storageOptions = options;
    this.wasm = new (getEngine().CellStore)();
    this.boundaryAccounting.record("startup", "js-to-wasm", 0, "scalar");
    this.view = new StoreViewState(this.wasm, this.sheets);
    this.windowReader = new StoreWindowReader(this.wasm, this.sheets, this.styles);
    this.snapshotCodec = new StoreSnapshotCodec(workbook, this.windowReader, this.sheetIdsByHandle);
    this.pagedDirtyPreflight =
      options.storage === "paged"
        ? new PagedDirtyPreflight(
            this.wasm,
            this.sheets,
            this.sheetIdsByHandle,
            this.rangeMutationStats,
            this.boundaryAccounting,
            options.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT,
            options.referenceSimulationLimit ?? MAX_PAGED_REFERENCE_SIMULATION_ENTRIES,
          )
        : null;

    for (const sheet of workbook.sheets) {
      const handle = this.allocateSheet(sheet.columns.length, sheet.rowCount);
      this.boundaryAccounting.record(
        this.resourceOperation ?? "startup",
        "js-to-wasm",
        (sheet.id.length + sheet.name.length) * 2,
        "scalar",
      );
      this.wasm.setSheetName(handle, sheet.id, sheet.name);
      this.sheets.handles.set(sheet.id, handle);
      this.sheetIdsByHandle[handle] = sheet.id;
      this.syncSpillBlockers(sheet);
      this.view.queueHiddenRows(sheet.id);
    }

    // Before any formula is loaded, so SUBTOTAL computes once with the saved hidden rows.
    this.view.flushHiddenRows();
    for (const sheet of workbook.sheets) {
      for (const table of sheet.tables ?? []) {
        if (!this.syncTable(table)) {
          this.wasm.free();
          throw storeFailure("invalid-snapshot", `invalid workbook table: ${table.id}`, {
            table: table.id,
          });
        }
      }
    }

    for (const namedRange of workbook.namedRanges ?? []) {
      if (!this.syncNamedRange(namedRange)) {
        this.wasm.free();
        throw storeFailure("invalid-snapshot", `invalid named range: ${namedRange.name}`, {
          name: namedRange.name,
        });
      }
    }

    if (!this.syncRelationships(workbook.dataModel)) {
      this.wasm.free();
      throw storeFailure("invalid-snapshot", "invalid data model");
    }

    this.loadPivots();

    // Before any cell is loaded, so formulas compute once under the stored limits.
    // Defaults need no engine call and are dropped to keep snapshots unchanged.
    const calculation = storedCalculationSettings(workbook.calculation);
    if (calculation === undefined) delete workbook.calculation;
    else if (this.syncCalculation(calculation)) workbook.calculation = calculation;
    else {
      this.wasm.free();
      throw storeFailure("invalid-snapshot", "invalid calculation settings");
    }

    if (data) {
      this.withResourceOperation("ingest", () => this.loadColumnar(workbook.activeSheet, data));
    } else if (workbook.sheets.some((sheet) => sheet.pivots?.length)) {
      this.wasm.commitSources();
    }

    // After the cells, because filters and sort keys read cell values.
    for (const sheet of workbook.sheets) this.view.sheetLoaded(sheet.id);
    if (this.view.hasQueuedHiddenRows()) this.flushHiddenRowsAndCommit();

    this.resourceOperation = null;
  }

  /** Internal allocation counters for deterministic range-mutation gates. */
  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return {
      ...this.rangeMutationStats,
      styleDictionaryEntries: this.styles.table.length,
    };
  }

  resetRangeMutationAllocationStats(): void {
    for (const key of Object.keys(this.rangeMutationStats) as Array<
      keyof typeof this.rangeMutationStats
    >) {
      this.rangeMutationStats[key] = 0;
    }
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    let wasm: StoreMemoryBreakdown;
    if (this.disposed) {
      wasm = emptyStoreMemoryStats(this.committedBytesAfterDispose);
    } else {
      const committed = this.wasm.wasmCommittedBytes();
      wasm = decodeStoreMemoryStats(this.wasm.memoryStats(), committed > 0 ? committed : null);
    }
    return createRuntimeResourceSnapshot({
      operation,
      phase,
      wasm,
      jsOwners: this.disposed ? [] : this.resourceOwners(),
      boundary: this.boundaryAccounting.snapshot(),
      runtime,
    });
  }

  resetRuntimeResourceAccounting(): void {
    this.boundaryAccounting.reset();
  }

  getFormulaMatrixResourcePeak(): TransientResourcePeak {
    const values = this.wasm.formulaMatrixResourceStats();
    if (
      values.length !== 3 ||
      !values.every((value) => Number.isSafeInteger(value) && value >= 0)
    ) {
      throw new Error("Invalid formula matrix resource stats");
    }
    return {
      owner: "wasm.formula.transient-matrices",
      peakBytes: values[1]!,
      allocations: values[2]!,
      measurement: "instrumented-operation-peak",
    };
  }

  resetFormulaMatrixResourcePeak(): void {
    this.wasm.resetFormulaMatrixResourceStats();
  }

  withResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    const previous = this.resourceOperation;
    this.resourceOperation = operation;
    try {
      return run();
    } finally {
      this.resourceOperation = previous;
    }
  }

  private resourceOwners(): ResourceOwnerBytes[] {
    return [
      {
        owner: "js.store.sheet-handles",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.sheets.handles.size,
        measurement: "entry-count-only",
      },
      ...this.styles.resourceOwners(),
      ...this.view.resourceOwners(),
      ...this.windowReader.resourceOwners(),
    ];
  }

  private recordWindowBoundary(
    window: VisibleWindowView,
    fallbackOperation: RuntimeResourceOperation,
  ): void {
    const operation = this.resourceOperation ?? fallbackOperation;
    const calls = window.ffiBoundaryCalls ?? window.ffiCalls ?? 0;
    const largest = window.ffiLargestTransferBytes ?? 0;
    this.boundaryAccounting.record(
      operation,
      "js-to-wasm",
      window.ffiInputBytes ?? 0,
      "bulk",
      calls,
      largest,
    );
    this.boundaryAccounting.record(
      operation,
      "wasm-to-js",
      window.ffiOutputBytes ?? 0,
      "bulk",
      0,
      largest,
    );
  }

  private noteRangeMutationFfi(transferredArrayLength = 0, transferredBytes?: number): void {
    this.rangeMutationStats.ffiCalls += 1;
    this.rangeMutationStats.maxTransferredArrayLength = Math.max(
      this.rangeMutationStats.maxTransferredArrayLength,
      transferredArrayLength,
    );
    const bytes = transferredBytes ?? transferredArrayLength * Uint32Array.BYTES_PER_ELEMENT;
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      bytes,
      transferredArrayLength > 0 ? "bulk" : "scalar",
    );
  }

  private syncSpillBlockers(sheet: Sheet): void {
    const bounds: number[] = [];
    for (const merge of sheet.merges ?? []) {
      bounds.push(merge.r0, merge.c0, merge.r1, merge.c1);
    }
    for (const protectedRange of sheet.protectedRanges ?? []) {
      const range = normalizedRange(protectedRange.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    for (const validationRule of sheet.validationRules ?? []) {
      const range = normalizedRange(validationRule.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    if (!this.wasm.setSpillBlockers(this.sheets.handleOf(sheet.id), Uint32Array.from(bounds))) {
      throw storeFailure(
        "resource-limit",
        `spill blocker resource limit exceeded for sheet: ${sheet.id}`,
        { sheet: sheet.id },
      );
    }
  }

  private flushSpillBlockers(): void {
    for (const sheetId of this.spillBlockersDirty) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheetId);
      if (sheet) this.syncSpillBlockers(sheet);
    }
    this.spillBlockersDirty.clear();
  }

  /** Validate every loaded pivot against the whole workbook, then install them. */
  private loadPivots(): void {
    const ids = new Set<string>();
    for (const sheet of this.workbook.sheets) {
      for (const [index, pivot] of (sheet.pivots ?? []).entries()) {
        const issues = this.pivotIssues(pivot, sheet, this.workbook.sheets);
        if (ids.has(pivot.id) || ids.size >= MAX_PIVOTS_PER_WORKBOOK || issues.length > 0) {
          this.wasm.free();
          const reason = issues[0]?.message ?? "Pivot IDs must be unique within the limit";
          throw storeFailure(
            "invalid-snapshot",
            `invalid pivot ${sheet.id}.pivots[${index}]: ${reason}`,
            {
              sheet: sheet.id,
              pivotIndex: index,
            },
          );
        }
        ids.add(pivot.id);
      }
      if (sheet.pivots?.length) this.syncPivots(sheet);
    }
  }

  private pivotIssues(pivot: unknown, owner: Sheet, sheets: readonly Sheet[]): PivotIssue[] {
    const issues: PivotIssue[] = [];
    validatePivotShape(pivot, "pivot", issues);
    if (issues.length > 0) return issues;

    // Shape validation above proves the definition schema.
    validatePivotReferences(
      pivot as PivotDefinition,
      { rows: owner.rowCount, cols: owner.columns.length },
      sheetPivotScope(sheets),
      "pivot",
      issues,
    );
    return issues;
  }

  /** The full engine gets every definition; the default engine only saved output. */
  private syncPivots(sheet: Sheet, wasm: RecomputingCellStore = this.wasm): void {
    const pivots = sheet.pivots ?? [];
    if (!wasm.setPivots) {
      if (!wasm.setSavedPivots) {
        if (pivots.some((pivot) => pivot.savedOutput !== undefined)) {
          throw new Error("Engine cannot install saved pivot output");
        }

        return;
      }

      const saved = encodeSavedPivotPayload(pivots);
      this.boundaryAccounting.record(
        this.resourceOperation ?? "edit",
        "js-to-wasm",
        saved.layout.byteLength +
          saved.kinds.byteLength +
          saved.numbers.byteLength +
          saved.textLengths.byteLength,
        "bulk",
      );
      const handle = this.sheets.handleOf(sheet.id);
      const { layout, kinds, numbers, text, textLengths } = saved;
      if (!wasm.setSavedPivots(handle, layout, kinds, numbers, text, textLengths)) {
        throw storeFailure(
          "resource-limit",
          `saved pivot payload rejected for sheet: ${sheet.id}`,
          {
            sheet: sheet.id,
          },
        );
      }

      return;
    }

    const payload = encodePivotPayload(this.pivotView?.(sheet) ?? pivots, (id) =>
      this.sheets.handles.get(id),
    );
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      payload.numbers.byteLength,
      "bulk",
    );
    if (!wasm.setPivots(this.sheets.handleOf(sheet.id), payload.numbers, payload.strings)) {
      throw storeFailure("resource-limit", `pivot payload rejected for sheet: ${sheet.id}`, {
        sheet: sheet.id,
      });
    }
  }

  /**
   * Compute pivots from `view` instead of the saved definitions, and send
   * `sheets` again. A view changes inputs that are not in the document, such
   * as a read-only viewer's slicer selection, so it needs no transaction.
   */
  setPivotView(
    view: (sheet: Sheet) => PivotDefinition[] | undefined,
    sheets: readonly SheetId[],
  ): void {
    this.pivotView = view;
    this.wasm.beginMutation();
    try {
      for (const id of sheets) this.pivotSheetsDirty.add(id);
      this.flushPivots();
    } finally {
      this.wasm.commitSources();
    }
  }

  /** Runs inside the mutation, so the engine renders pivots at the commit barrier. */
  private flushPivots(): void {
    for (const sheetId of this.pivotSheetsDirty) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheetId);
      if (sheet) this.syncPivots(sheet);
    }
    this.pivotSheetsDirty.clear();
  }

  private admitsSourceRange(range: Range): boolean {
    const bounds = normalizedRange(range);
    return this.wasm.admitSourceRange(
      this.sheets.handleOf(bounds.sheet),
      bounds.start.row,
      bounds.start.col,
      bounds.end.row,
      bounds.end.col,
    );
  }

  private captureSourceProjection(
    sheet: SheetId,
    rowStart: number,
    colStart: number,
    rows: number,
    cols: number,
  ): RangeSourceProjection | null {
    this.noteRangeMutationFfi();
    const snapshot = this.wasm.captureSources(
      this.sheets.handleOf(sheet),
      rowStart,
      colStart,
      rows,
      cols,
    );
    return snapshot ? consumeSourceSnapshot(snapshot, this.sheetIdsByHandle) : null;
  }

  private namedRangeScope(scope: SheetId | undefined): number {
    return scope === undefined ? -1 : this.sheets.handleOf(scope);
  }

  /**
   * Sends every relationship and measure of `model` to an engine that
   * computes model pivots. A measure travels as a relationship record with
   * an empty one-side table: `[id, homeTable, formula, "", name]`. Returns
   * false when the engine refuses them; an engine without the call keeps
   * them only in the workbook.
   */
  private syncRelationships(
    model: DataModel | undefined,
    wasm: RecomputingCellStore = this.wasm,
  ): boolean {
    if (!wasm.setRelationships) return true;
    const strings = (model?.relationships ?? []).flatMap((relationship) => [
      relationship.id,
      relationship.from.table,
      relationship.from.column,
      relationship.to.table,
      relationship.to.column,
    ]);
    for (const measure of model?.measures ?? []) {
      strings.push(measure.id, measure.table, measure.formula, "", measure.name);
    }
    return wasm.setRelationships(strings);
  }

  private syncTable(table: WorkbookTable): boolean {
    const range = normalizedRange(table.range);
    const textBytes =
      (table.id.length +
        table.name.length +
        table.columns.reduce((total, column) => total + column.id.length + column.name.length, 0)) *
      2;
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      textBytes,
      "scalar",
    );
    return this.wasm.setTable(
      table.id,
      table.name,
      this.sheets.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      range.end.row,
      range.end.col,
      table.headerRow,
      table.totalsRow,
      table.columns.map((column) => column.id),
      table.columns.map((column) => column.name),
    );
  }

  private insertedTableColumns(
    table: WorkbookTable,
    columns: readonly Column[],
  ): WorkbookTableColumn[] {
    const ids = new Set(table.columns.map((column) => workbookTableNameKey(column.id)));
    const names = new Set(table.columns.map((column) => workbookTableNameKey(column.name)));
    return columns.map((column, index) => {
      const fallback = `Column${table.columns.length + index + 1}`;
      const rawId = (column.key || fallback).normalize("NFC");
      let id = rawId.slice(0, DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxIdLength);
      for (let suffix = 2; ids.has(workbookTableNameKey(id)); suffix++) {
        const marker = `_${suffix}`;
        id = `${rawId.slice(
          0,
          DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxIdLength - marker.length,
        )}${marker}`;
      }

      ids.add(workbookTableNameKey(id));
      const normalizedHeader = (column.header || fallback).normalize("NFC");
      const rawName =
        /[[\],]/u.test(normalizedHeader) ||
        normalizedHeader.startsWith("@") ||
        normalizedHeader.startsWith("#")
          ? fallback
          : normalizedHeader;
      let name = rawName.slice(0, DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxNameLength);
      for (let suffix = 2; names.has(workbookTableNameKey(name)); suffix++) {
        const marker = `_${suffix}`;
        name = `${rawName.slice(
          0,
          DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxNameLength - marker.length,
        )}${marker}`;
      }

      names.add(workbookTableNameKey(name));
      return { id, name };
    });
  }

  /**
   * Hand settings to the engine. Checked here first because the binding
   * truncates a fractional or out-of-range count to u32 instead of refusing it.
   */
  private syncCalculation(calculation: CalculationSettings): boolean {
    if (!isValidCalculationSettings(calculation)) return false;

    return this.wasm.setIterativeCalculation(
      calculation.iterate,
      calculation.maxIterations,
      calculation.maxChange,
    );
  }

  private syncNamedRange(namedRange: NamedRangeSnapshot): boolean {
    const scope = this.namedRangeScope(namedRange.scope);
    if (namedRange.range === undefined) {
      this.boundaryAccounting.record(
        this.resourceOperation ?? "edit",
        "js-to-wasm",
        (namedRange.name.length + namedRange.formula.length) * 2,
        "scalar",
      );
      return this.wasm.setNamedFormula(namedRange.name, scope, namedRange.formula);
    }

    const range = normalizedRange(namedRange.range);
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      namedRange.name.length * 2,
      "scalar",
    );
    return this.wasm.setNamedRange(
      namedRange.name,
      scope,
      this.sheets.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      range.end.row,
      range.end.col,
    );
  }

  /**
   * Read back the formula of every defined name that holds one. The engine
   * rewrites them when a sheet is renamed or removed and when rows or
   * columns are added or removed.
   */
  private refreshNamedFormulas(): void {
    const namedRanges = this.workbook.namedRanges;
    if (!namedRanges?.some((namedRange) => namedRange.formula !== undefined)) return;

    this.workbook.namedRanges = namedRanges.map((namedRange) => {
      if (namedRange.formula === undefined) return namedRange;
      const formula = this.wasm.namedFormulaSource(
        namedRange.name,
        this.namedRangeScope(namedRange.scope),
      );
      return formula === undefined || formula === namedRange.formula
        ? namedRange
        : { ...namedRange, formula };
    });
  }

  /** Plan every name rewrite before the move can change cells or metadata. */
  private prepareMovedNamedFormulas(
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
  ): Extract<NamedRangeSnapshot, { formula: string }>[] | null {
    const rewritten: Extract<NamedRangeSnapshot, { formula: string }>[] = [];
    const sheet = this.sheets.handleOf(patch.sheet);
    for (const original of this.workbook.namedRanges ?? []) {
      if (original.formula === undefined) continue;
      const formula = this.wasm.moveNamedFormulaSource(
        original.formula,
        sheet,
        patch.op === "moveColumns",
        patch.from,
        patch.count,
        patch.to,
      );
      if (formula === undefined) return null;
      rewritten.push({ ...original, formula });
    }
    return rewritten;
  }

  private restoreMovedNamedFormulas(
    definitions: readonly Extract<NamedRangeSnapshot, { formula: string }>[],
  ): boolean {
    for (const namedRange of definitions) {
      if (!this.applyPatch({ op: "setNamedRange", namedRange }, null)) return false;
    }
    return true;
  }

  private sameNamedRange(
    namedRange: NamedRangeSnapshot,
    name: string,
    scope: SheetId | undefined,
  ): boolean {
    return formulaNameKey(namedRange.name) === formulaNameKey(name) && namedRange.scope === scope;
  }

  private allocateSheet(columns: number, rows: number): number {
    const handle =
      this.storageOptions.storage === "paged"
        ? this.wasm.addPagedSheet(
            columns,
            rows,
            this.storageOptions.chunkRows ?? DEFAULT_PAGED_CHUNK_ROWS,
            this.storageOptions.cacheBytes ?? DEFAULT_PAGED_CACHE_BYTES,
            this.storageOptions.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT,
          )
        : this.wasm.addSheet(columns, rows);
    this.boundaryAccounting.record(this.resourceOperation ?? "edit", "js-to-wasm", 0, "scalar");
    return handle;
  }

  isPaged(sheet: SheetId): boolean {
    return this.wasm.isPaged(this.sheets.handleOf(sheet));
  }

  getPagedStats(sheet: SheetId): PagedStoreStats {
    const stats = this.wasm.pagedStats(this.sheets.handleOf(sheet));
    return {
      chunks: stats[0] ?? 0,
      loadedCells: stats[1] ?? 0,
      dirtyCells: stats[2] ?? 0,
      allocatedBytes: stats[3] ?? 0,
      dirtyAllocatedBytes: stats[5] ?? 0,
      fullyLoaded: stats[4] === 1,
    };
  }

  queryCapability(sheet: SheetId): QueryCapability {
    const meta = this.sheets.sheetMeta(sheet);
    const stats = this.getPagedStats(sheet);
    if (!this.isPaged(sheet) || stats.fullyLoaded || this.authoritativeSnapshotSheets.has(sheet)) {
      return { status: "complete" };
    }
    return {
      status: "incomplete",
      loadedCells: stats.loadedCells,
      totalCells: meta.rowCount * meta.columns.length,
    };
  }

  getCellLoadState(addr: CellAddress): CellLoadState {
    const state = this.wasm.cellState(this.sheets.handleOf(addr.sheet), addr.row, addr.col);
    if (state === CELL_STATE_UNLOADED) return "unloaded";
    if (state === CELL_STATE_LOADED_EMPTY) return "loaded-empty";
    if (state === CELL_STATE_LOCAL_EDIT) return "local-edit";
    return "loaded-value";
  }

  isRangeFullyLoaded(input: Range): boolean {
    const range = normalizedRange(input);
    return this.wasm.rangeFullyLoaded(
      this.sheets.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      range.end.row,
      range.end.col,
    );
  }

  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean {
    return this.wasm.columnsFullyLoaded(
      this.sheets.handleOf(sheet),
      startRow,
      endRow,
      Uint32Array.from(columns),
    );
  }

  /**
   * Loaded row runs `[start, end)` of one column inside a row band.
   *
   * The pairs are the per-row view of {@link areColumnsFullyLoaded}: a row is in
   * a run only when the store reports it loaded. One call reconciles a whole
   * column instead of probing the band row by row with one call per probe.
   */
  loadedSpans(sheet: SheetId, startRow: number, endRow: number, column: number): Uint32Array {
    return this.wasm.loadedSpans(this.sheets.handleOf(sheet), startRow, endRow, column);
  }

  /**
   * Same-sheet cells that the formulas of a window read, as flat
   * `[rowStart, rowEnd, columnStart, columnEnd)` rectangles. The walk follows
   * reads into the formula cells they reach and skips any read that does not
   * fit the remaining `maxCells` budget.
   */
  formulaReadBands(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
    maxCells: number,
  ): Uint32Array {
    return this.wasm.formulaReadBands(
      this.sheets.handleOf(sheet),
      startRow,
      endRow,
      Uint32Array.from(columns),
      maxCells,
    );
  }

  /** Empty protection releases remain valid after their sheet has been removed. */
  pinViewportBands(sheet: SheetId, bands: Uint32Array): void {
    const handle = this.sheets.handles.get(sheet);
    if (handle === undefined && bands.length === 0) return;
    this.wasm.pinViewportBands(handle ?? this.sheets.handleOf(sheet), bands);
  }

  canApplyLocally(patch: DocumentOp): boolean {
    const sheet = patchSheetId(patch);
    if (sheet === null || !this.sheets.handles.has(sheet) || !this.isPaged(sheet)) return true;
    if (
      patch.op === "setSheetMeta" &&
      ((patch.patch.sortKeys?.length ?? 0) > 0 || (patch.patch.filters?.length ?? 0) > 0)
    ) {
      return this.queryCapability(sheet).status === "complete";
    }
    if (patch.op === "setRangeStyle" || patch.op === "clearRange") {
      return this.isRangeFullyLoaded(patch.range);
    }
    if (
      patch.op === "removeRows" ||
      patch.op === "moveRows" ||
      patch.op === "removeColumns" ||
      patch.op === "moveColumns"
    ) {
      return this.wasm.isFullyLoaded(this.sheets.handleOf(sheet));
    }
    return true;
  }

  pagedDirtyCapacityIssue(patches: readonly DocumentOp[]): MutationIssue | null {
    return this.pagedDirtyPreflight?.issue(patches, this.resourceOperation) ?? null;
  }

  /** Throw `IncompleteDataError` while a paged sheet has unloaded cells a query would need. */
  requireCompleteQuery(sheet: SheetId): void {
    const capability = this.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  private isCellInBounds(addr: CellAddress): boolean {
    const meta = this.workbook.sheets.find((s) => s.id === addr.sheet);
    return (
      meta !== undefined &&
      Number.isInteger(addr.row) &&
      Number.isInteger(addr.col) &&
      addr.row >= 0 &&
      addr.row < meta.rowCount &&
      addr.col >= 0 &&
      addr.col < meta.columns.length
    );
  }

  /**
   * Capture one rectangle in WASM for undo. The returned resource is local to
   * this store and must be disposed by history when evicted or destroyed.
   */
  captureRangeHistory(input: Range): CompactRangeHistory | null {
    const range = normalizedRange(input);
    const sheet = this.sheets.sheetMeta(range.sheet);
    if (
      range.start.row < 0 ||
      range.start.col < 0 ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length
    ) {
      return null;
    }

    const rows = range.end.row - range.start.row + 1;
    const cols = range.end.col - range.start.col + 1;
    this.noteRangeMutationFfi();
    const capturedResource = this.wasm.captureRange(
      this.sheets.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      rows,
      cols,
    );
    if (!capturedResource) return null;

    let resource: RangeSnapshot = capturedResource;
    this.rangeMutationStats.historySnapshots += 1;
    this.rangeMutationStats.historySnapshotBytes += resource.byteLength();

    const formulaCoordinates = resource.formulaOffsets();
    const formulaSources = resource.formulaSources();
    const formulas: Array<[number, string]> = new Array(formulaSources.length);
    for (let index = 0; index < formulaSources.length; index++) {
      const coordinate = index * 2;
      formulas[index] = [
        formulaCoordinates[coordinate]! * cols + formulaCoordinates[coordinate + 1]!,
        formulaSources[index]!,
      ];
    }

    const referenceCoordinates = resource.referenceOffsets();
    const referenceTargets = resource.referenceTargets();
    const refs: Array<[number, CellAddress]> = new Array(referenceCoordinates.length / 2);
    for (let index = 0; index < refs.length; index++) {
      const coordinate = index * 2;
      const packedTarget = referenceTargets.subarray(index * 3, index * 3 + 3);
      const target = referenceTargetFromPacked(packedTarget, this.sheetIdsByHandle);
      if (!target) {
        resource.free();
        throw new Error("history snapshot contains an unknown reference target");
      }

      refs[index] = [
        referenceCoordinates[coordinate]! * cols + referenceCoordinates[coordinate + 1]!,
        target,
      ];
    }

    let disposed = false;
    const history: CompactRangeHistory = {
      range,
      byteLength: resource.byteLength(),

      get resource() {
        return resource;
      },

      refs,
      toDocumentOp: (target, preparation) => {
        if (disposed) throw new Error("history range snapshot already disposed");
        this.rangeMutationStats.historyMaterializations += 1;

        const kindsColumnMajor = resource.kinds();
        const numbersColumnMajor = this.wasm.snapshotNumbers(resource);
        const textsColumnMajor = kindsColumnMajor.includes(KIND_STRING)
          ? this.wasm.snapshotTexts(resource)
          : undefined;
        const stylesColumnMajor = resource.styleIds();

        const values: CellScalar[] = new Array(rows * cols);
        const styleIds: number[] = new Array(rows * cols);
        const styleTable: CellStyle[] = [];
        const styleLookup = new Map<number, number>();

        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const source = col * rows + row;
            const offset = row * cols + col;
            const kind = kindsColumnMajor[source]!;
            const number = numbersColumnMajor[source]!;
            const text = textsColumnMajor?.[source] ?? "";
            values[offset] =
              kind === KIND_NUMBER
                ? number
                : kind === KIND_BOOL
                  ? number !== 0
                  : kind === KIND_STRING
                    ? text
                    : null;
            const storeStyleId = stylesColumnMajor[source]!;
            let tableId = styleLookup.get(storeStyleId);
            if (tableId === undefined) {
              tableId = styleTable.length;
              styleLookup.set(storeStyleId, tableId);
              styleTable.push({ ...this.styles.get(storeStyleId) });
            }

            styleIds[offset] = tableId;
          }
        }

        const block: PackedCellBlock = {
          rowCount: rows,
          colCount: cols,
          values,
          formulas: formulas.length > 0 ? formulas : undefined,
          refs: refs.length > 0 ? refs.map(([offset, ref]) => [offset, { ...ref }]) : undefined,
          styleTable,
          styleIds,
        };

        const operation: Extract<DocumentOp, { op: "setBlock" }> = {
          op: "setBlock",
          range: target,
          block,
        };

        preparation?.seedHistory(operation, (bounds) => {
          if (disposed) throw new Error("history range snapshot already disposed");
          if (
            bounds.end.row - bounds.start.row + 1 !== rows ||
            bounds.end.col - bounds.start.col + 1 !== cols
          )
            return false;
          this.noteRangeMutationFfi();
          return this.wasm.restoreRange(
            this.sheets.handleOf(bounds.sheet),
            bounds.start.row,
            bounds.start.col,
            resource,
          );
        });

        return operation;
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        resource.free();
        this.rangeHistory.delete(history);
        this.rangeMutationStats.historyDisposals += 1;
      },
    };

    this.rangeHistory.set(history, {
      sheetHandle: this.sheets.handleOf(range.sheet),
      replace: (replacement) => {
        const previous = resource;
        resource = replacement;
        previous.free();
      },
    });

    return history;
  }

  /**
   * Engine transfer bytes of one rectangle: source kinds, payloads, style IDs,
   * strings and formula sources, with no JavaScript object per cell. The
   * history diff kernel reads them; the engine copy is freed before return.
   */
  captureRangeTransfer(input: Range): Uint8Array | null {
    const range = normalizedRange(input);
    const sheet = this.sheets.sheetMeta(range.sheet);
    if (
      range.start.row < 0 ||
      range.start.col < 0 ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length
    ) {
      return null;
    }

    const handle = this.sheets.handleOf(range.sheet);
    const resource = this.wasm.captureRange(
      handle,
      range.start.row,
      range.start.col,
      range.end.row - range.start.row + 1,
      range.end.col - range.start.col + 1,
    );
    if (!resource) {
      return null;
    }

    try {
      return resource.exportMemoryState(handle);
    } finally {
      resource.free();
    }
  }

  /** Style of each store style ID, as stored in cells; ID 0 is the empty style. */
  styleTable(): readonly CellStyle[] {
    return this.styles.table;
  }

  getWorkbook(): Workbook {
    return this.workbook;
  }

  private pivotCount(): number {
    let count = 0;
    for (const sheet of this.workbook.sheets) count += sheet.pivots?.length ?? 0;
    return count;
  }

  /** Status record of the pivot at `index` on `sheet`, or null without engine support. */
  private pivotStatusRecord(sheet: SheetId, index: number): PivotStatusRecord | null {
    if (!this.wasm.pivotStatus) return null;
    return pivotStatusAt(this.wasm.pivotStatus(this.sheets.handleOf(sheet)), index);
  }

  /**
   * Rendered output rectangles of the pivots on `sheet`. The default engine
   * has no `pivotStatus`, so the rectangle comes from the anchor and
   * `savedOutput`, and counts only while the engine shows it: a blocked
   * saved output owns no cells, so the user can clear its blocker.
   */
  pivotOutputs(sheet: SheetId): Array<{ id: string; range: Range }> {
    const pivots = this.workbook.sheets.find((candidate) => candidate.id === sheet)?.pivots;
    if (!pivots?.length) return [];
    if (!this.wasm.pivotStatus) return this.savedPivotOutputs(sheet, pivots);

    const status = this.wasm.pivotStatus(this.sheets.handleOf(sheet));
    const outputs: Array<{ id: string; range: Range }> = [];
    for (const [index, pivot] of pivots.entries()) {
      const record = pivotStatusAt(status, index);
      if (!record || record.rows === 0 || record.cols === 0) continue;
      outputs.push({
        id: pivot.id,
        range: {
          sheet,
          start: { row: record.row, col: record.col },
          end: { row: record.row + record.rows - 1, col: record.col + record.cols - 1 },
        },
      });
    }
    return outputs;
  }

  private savedPivotOutputs(
    sheet: SheetId,
    pivots: readonly PivotDefinition[],
  ): Array<{ id: string; range: Range }> {
    const outputs: Array<{ id: string; range: Range }> = [];
    for (const pivot of pivots) {
      const range = savedOutputRange(sheet, pivot);
      if (!range) continue;
      // An installed output owns its anchor; a blocked one does not.
      const owner = this.getSpillAnchor({ sheet, row: range.start.row, col: range.start.col });
      if (owner && owner.row === range.start.row && owner.col === range.start.col) {
        outputs.push({ id: pivot.id, range });
      }
    }
    return outputs;
  }

  /** Key status of the relationship with `id`, checked now from the cell values. */
  getRelationshipStatus(id: string): RelationshipStatus {
    const record = this.wasm.relationshipStatus?.(id);
    if (!record || record.length < RELATIONSHIP_STATUS_STRIDE) return { status: "unavailable" };
    return relationshipStatusOf(record);
  }

  /**
   * Plain view of one pivot's output: one status call and one bulk read.
   * Null when `sheet` holds no pivot with `id`.
   */
  getPivotResult(sheet: SheetId, id: string): PivotResultView | null {
    const pivots = this.workbook.sheets.find((candidate) => candidate.id === sheet)?.pivots ?? [];
    const index = pivots.findIndex((pivot) => pivot.id === id);
    const pivot = pivots[index];
    if (!pivot) return null;

    const record = this.pivotStatusRecord(sheet, index);
    if (!record) {
      const result = uncomputedPivotResult(sheet, pivot);
      if (!pivot.savedOutput) return result;
      const owner = this.getSpillAnchor({ sheet, ...pivot.anchor });
      if (owner && owner.row === pivot.anchor.row && owner.col === pivot.anchor.col) return result;
      return { ...result, status: "error", error: "#SPILL!", rows: 0, cols: 0, cells: [] };
    }

    if (record.error !== 0) {
      // An anchor that holds a source keeps it, so the code names the error, not the cell.
      return {
        status: "error",
        error: PIVOT_ERRORS[record.error - 1] ?? "#VALUE!",
        anchor: { sheet, row: record.row, col: record.col },
        rows: 0,
        cols: 0,
        headerRows: 0,
        labelCols: 0,
        cells: [],
      };
    }

    const owner = this.workbook.sheets.find((candidate) => candidate.id === sheet);
    // A dashboard has no cells: its view reads the output with `dashboardPivotOutput`.
    const cells = isDashboard(owner) ? [] : this.pivotWindowCells(sheet, record);
    return {
      status: "ok",
      anchor: { sheet, row: record.row, col: record.col },
      rows: record.rows,
      cols: record.cols,
      headerRows: record.headerRows,
      labelCols: record.labelCols,
      cells,
    };
  }

  /** Output cells that a worksheet pivot placed, read from the sheet. */
  private pivotWindowCells(sheet: SheetId, record: PivotStatusRecord): CellScalar[] {
    const cols = Array.from({ length: record.cols }, (_, offset) => record.col + offset);
    const window = this.getDataWindow(
      sheet,
      { start: record.row, end: record.row + record.rows },
      cols,
    );
    return Array.from(window.values);
  }

  /**
   * The engine output of the pivot at `index` in a dashboard's payload,
   * which places none in cells; the caller frees it. Null on the default
   * engine. Indices past the sheet's pivots read hidden pivots of a pivot view.
   */
  dashboardPivotOutput(sheet: SheetId, index: number): PivotOutputCells | null {
    if (index < 0 || !this.wasm.pivotOutput) return null;
    return this.wasm.pivotOutput(this.sheets.handleOf(sheet), index);
  }

  /**
   * Whether the loaded engine computes pivots. The full engine does; the
   * default engine only shows saved output. The ribbon needs this before any
   * pivot exists, and `getPivotFields` cannot tell the engines apart without one.
   */
  get computesPivots(): boolean {
    return this.wasm.pivotFields !== undefined;
  }

  /** Source fields of one pivot; empty on the default engine or for an unknown pivot. */
  getPivotFields(sheet: SheetId, id: string): PivotSourceField[] {
    const index =
      this.workbook.sheets
        .find((candidate) => candidate.id === sheet)
        ?.pivots?.findIndex((pivot) => pivot.id === id) ?? -1;
    if (index < 0 || !this.wasm.pivotFields) return [];

    const list = this.wasm.pivotFields(this.sheets.handleOf(sheet), index);
    try {
      const names = list.names();
      const types = list.types();
      return names.map((header, field) => ({
        index: field,
        header,
        type: PIVOT_FIELD_TYPES[types[field] ?? 0] ?? "mixed",
      }));
    } finally {
      list.free();
    }
  }

  getCell(addr: CellAddress): ResolvedCell {
    const cell = this.wasm.getCell(this.sheets.handleOf(addr.sheet), addr.row, addr.col);
    const resolved = resolvedScalar(cell.kind, cell.num, cell.string ?? null);
    const style = this.styles.get(cell.style);
    cell.free();
    return { resolved, style };
  }

  /** The formula source at `addr`, or null if the cell isn't a formula. */
  getFormula(addr: CellAddress): string | null {
    return this.wasm.formulaSource(this.sheets.handleOf(addr.sheet), addr.row, addr.col) ?? null;
  }

  /** The owning formula anchor for a spill cell, including the anchor itself. */
  getSpillAnchor(addr: CellAddress): CellAddress | null {
    const handle = this.sheets.handleOf(addr.sheet);
    const row = this.wasm.spillAnchorRow(handle, addr.row, addr.col);
    if (row === NO_CELL_COORDINATE) return null;
    const col = this.wasm.spillAnchorCol(handle, addr.row, addr.col);
    if (col === NO_CELL_COORDINATE) return null;
    return { sheet: addr.sheet, row, col };
  }

  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null {
    return referenceTargetFromPacked(
      this.wasm.referenceTarget(this.sheets.handleOf(addr.sheet), addr.row, addr.col),
      this.sheetIdsByHandle,
    );
  }

  recomputeVolatile(now: Date): void {
    const milliseconds = now.getTime();
    if (!Number.isFinite(milliseconds)) {
      throw storeFailure("invalid-argument", "invalid volatile recalculation date");
    }
    this.wasm.recomputeVolatile(dateToSerial(now));
  }

  /**
   * Gives `@sheetwrite/core/functions` the WASM store. Core holds only this
   * slot, so a bundle that never registers a host function carries no
   * registry code.
   */
  installHostFunctions(hooks: HostFunctionHooks): void {
    this.hostFunctions = hooks;
    hooks.adopt(this.wasm);
  }

  /** Map a displayed row position to the backing data row under sort/filter. */
  dataRowAt(sheet: SheetId, viewRow: number): number {
    return this.view.dataRowAt(sheet, viewRow);
  }

  /** Map a backing data row to its displayed position, or null when filtered out. */
  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    return this.view.viewRowOf(sheet, dataRow);
  }

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const window = this.windowReader.read(sheet, rows, cols, this.view.order(sheet), true);
    this.recordWindowBoundary(window, "scroll");
    return window;
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const window = this.windowReader.read(sheet, rows, cols, undefined, false);
    this.recordWindowBoundary(window, "scroll");
    return window;
  }

  getClipboardWindow(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
  ): ClipboardWindowView {
    const order = this.view.order(sheet);
    const clippedEnd = order ? Math.min(viewRows.end, order.length) : viewRows.end;
    const rowCount = Math.max(0, clippedEnd - viewRows.start);
    const dataRows = new Uint32Array(rowCount);
    if (order) {
      dataRows.set(order.subarray(viewRows.start, clippedEnd));
    } else {
      for (let index = 0; index < rowCount; index++) dataRows[index] = viewRows.start + index;
    }

    const window = this.windowReader.read(
      sheet,
      { start: viewRows.start, end: clippedEnd },
      cols,
      order,
      false,
    );
    this.recordWindowBoundary(window, "export");
    const formulas: Array<{ offset: number; source: string }> = [];
    const refs: Array<{ offset: number; target: CellAddress }> = [];
    const sourceSnapshot = this.windowReader.captureSourcesForRows(sheet, dataRows, cols);
    const spillDerived = sourceSnapshot?.spillDerived() ?? new Uint8Array();
    if (sourceSnapshot) {
      const sources = consumeSourceSnapshot(sourceSnapshot, this.sheetIdsByHandle);
      for (let index = 0; index < sources.formulaOffsets.length; index++) {
        formulas.push({
          offset: sources.formulaOffsets[index]!,
          source: sources.formulaSources[index]!,
        });
      }

      for (let index = 0; index < sources.referenceOffsets.length; index++) {
        const offset = sources.referenceOffsets[index]!;
        const target = sources.referenceAt(offset);
        if (target) refs.push({ offset, target });
      }
    }

    return {
      sheet,
      viewRows: { start: viewRows.start, end: clippedEnd },
      dataRows,
      cols,
      values: window.values,
      styleIds: window.styleIds,
      styles: window.styles,
      spillDerived,
      formulas,
      refs,
      ffiCalls: (window.ffiCalls ?? 0) + (sourceSnapshot ? 2 : 1),
      transferredElements:
        window.values.length +
        window.styleIds.length +
        dataRows.length +
        window.styles.length +
        formulas.length * 2 +
        refs.length * 4 +
        spillDerived.length,
    };
  }

  /**
   * Whether any cell in the rectangle takes its value from elsewhere: a formula,
   * a cross-reference, a spill child or pivot output. Chart tracking calls it
   * once per series range when its index is rebuilt, never per edit: the source
   * capture walks every formula on the sheet. Callers clip the range to the
   * sheet first.
   */
  chartSourcesComputed(range: Range): boolean {
    const bounds = normalizedRange(range);

    // The engine writes pivot output with no document op on its cells. The output
    // grows down and right from the anchor like a spill, so a pivot anchored at or
    // above-left of the range end can reach it. This model test is cheap, so do it first.
    const pivots = this.workbook.sheets.find((sheet) => sheet.id === bounds.sheet)?.pivots ?? [];
    const pivotReaches = pivots.some(
      (pivot) => pivot.anchor.row <= bounds.end.row && pivot.anchor.col <= bounds.end.col,
    );
    if (pivotReaches) return true;

    // Spill children carry no source of their own, so the source capture cannot see them.
    if (this.hasSpillChildren(range)) return true;

    // Include anchors above and left: an existing spill may grow into this range
    // after a precedent changes. This conservatively follows those formulas too.
    // Not `captureSourceProjection`: that one counts toward range-mutation statistics.
    const snapshot = this.wasm.captureSources(
      this.sheets.handleOf(bounds.sheet),
      0,
      0,
      bounds.end.row + 1,
      bounds.end.col + 1,
    );
    if (!snapshot) return false;

    try {
      return snapshot.formulaOffsets().length > 0 || snapshot.referenceOffsets().length > 0;
    } finally {
      snapshot.free();
    }
  }

  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    this.requireCompleteQuery(sheet);
    return this.wasm.aggregate(this.sheets.handleOf(sheet), col, AGG_OP[op]);
  }

  /** Live view of a sheet's active column filters, keyed by column index. */
  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.view.columnFilters(sheet);
  }

  /**
   * Distinct resolved values of a column in first-seen order, capped at `limit`
   * distinct values (`0` = uncapped). Blanks collapse to a single `null` entry.
   */
  distinctValues(sheet: SheetId, col: number, limit = DEFAULT_DISTINCT_VALUES_LIMIT): CellScalar[] {
    this.requireCompleteQuery(sheet);
    return this.view.distinctValues(sheet, col, limit);
  }

  /** The sheet's explicitly hidden data rows, ascending. */
  hiddenRows(sheet: SheetId): number[] {
    return [...(this.sheets.sheetMeta(sheet).hiddenRows ?? [])].sort((a, b) => a - b);
  }

  /** Live view of a sheet's row groups. */
  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.view.rowGroups(sheet);
  }

  /**
   * Ctrl+Arrow destination. With an active view order `row` is a VIEW position
   * and the scan runs in view space (`dataEdgeOrdered`): a vertical move returns
   * the destination VIEW position, a horizontal move returns a column index.
   * Without a view it scans data space (`dataEdge`).
   */
  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    this.requireCompleteQuery(sheet);
    return this.view.dataEdge(sheet, row, col, dRow, dCol);
  }

  /** Cells whose text matches `query`, scanned in WASM and returned row-major. */
  searchCells(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): CellAddress[] {
    const flat = this.searchCellsFlat(sheet, query, opts);

    const out: CellAddress[] = [];

    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ sheet, row: flat[i]!, col: flat[i + 1]! });
    }

    return out;
  }

  /** Flat row-major `[row, col, ...]` pairs for internal consumers that must not allocate cells. */
  searchCellsFlat(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): Uint32Array {
    this.requireCompleteQuery(sheet);
    const handle = this.sheets.handleOf(sheet);
    const columns = opts.columns ?? this.sheets.sheetMeta(sheet).columns.map((_, i) => i);

    return this.wasm.search(
      handle,
      Uint32Array.from(columns),
      query,
      !opts.matchCase,
      opts.wholeCell ?? false,
    );
  }

  viewRowCount(sheet: SheetId): number {
    return this.view.viewRowCount(sheet);
  }

  hasView(sheet: SheetId): boolean {
    return this.view.hasView(sheet);
  }

  ensureColumns(sheet: SheetId, columns: readonly Column[]): void {
    const meta = this.sheets.sheetMeta(sheet);
    if (columns.length <= meta.columns.length) return;

    const additions = columns.slice(meta.columns.length);
    if (!this.wasm.insertCols(this.sheets.handleOf(sheet), meta.columns.length, additions.length)) {
      throw storeFailure("resource-limit", "the engine cannot hold the added columns");
    }
    meta.columns.push(...additions);
  }

  /** Persisted cells only: empty space and unstyled spill children need no history payload. */
  captureSheetCells(sheet: SheetId): SnapshotCell[] {
    const captured = this.windowReader.capturePersistedCells(sheet);
    const formulas = new Map<number, string>();
    const references = new Map<number, CellAddress>();
    for (const [index, offset] of captured.formulaOffsets.entries()) {
      const source = captured.formulaSources[index];
      if (source === undefined) throw new Error("Missing persisted formula source");

      formulas.set(offset, source);
    }
    for (const [index, offset] of captured.referenceOffsets.entries()) {
      const target = referenceTargetFromPacked(
        captured.referenceTargets.subarray(index * 3, index * 3 + 3),
        this.sheetIdsByHandle,
      );
      if (!target) throw new Error("Missing persisted reference target");

      references.set(offset, target);
    }

    const cells = captured.values.map((value, index): SnapshotCell => {
      const row = captured.coordinates[index * 2];
      const col = captured.coordinates[index * 2 + 1];
      if (row === undefined || col === undefined)
        throw new Error("Missing persisted cell coordinate");
      const formula = formulas.get(index);
      const reference = references.get(index);

      return {
        rowOffset: row,
        colOffset: col,
        value: formula
          ? { kind: "formula", src: formula }
          : reference
            ? { kind: "ref", target: reference }
            : { kind: "literal", value },
        style: captured.styles[index],
      };
    });

    return cells.sort(
      (left, right) => left.rowOffset - right.rowOffset || left.colOffset - right.colOffset,
    );
  }

  /** Cells on `sheet` whose formula holds a 3-D reference, which a tab move can rewrite. */
  sheetSpanFormulaCells(sheet: SheetId): { row: number; col: number }[] {
    const pairs = this.wasm.sheetSpanFormulaCells(this.sheets.handleOf(sheet));
    const cells: { row: number; col: number }[] = [];
    for (let index = 0; index + 1 < pairs.length; index += 2) {
      cells.push({ row: pairs[index] ?? 0, col: pairs[index + 1] ?? 0 });
    }
    return cells;
  }

  /** Sources for a whole logical sheet, without reading every resolved cell. */
  captureSheetSources(sheet: SheetId): RangeSourceProjection | null {
    const metadata = this.sheets.sheetMeta(sheet);
    if (metadata.rowCount === 0 || metadata.columns.length === 0) return null;

    return this.captureSourceProjection(sheet, 0, 0, metadata.rowCount, metadata.columns.length);
  }

  /** Whether a rectangular write would include a derived spill child. */
  hasSpillChildren(range: Range): boolean {
    const bounds = normalizedRange(range);
    const columns = Array.from(
      { length: bounds.end.col - bounds.start.col + 1 },
      (_, index) => bounds.start.col + index,
    );

    return this.windowReader
      .spillDerivedMask(bounds.sheet, { start: bounds.start.row, end: bounds.end.row + 1 }, columns)
      .some((derived) => derived !== 0);
  }

  /**
   * Cells, at their address before the move, whose formula a `permuteRows`
   * operation adjusts in a way that its inverse cannot undo. History captures
   * them before the operation applies.
   */
  permuteRowsLosses(patch: PermuteRowsOperation): CellAddress[] {
    const bounds = normalizedRange(patch.range);
    const handle = this.sheets.handles.get(bounds.sheet);
    const order = decodeRowOrder(patch);
    if (handle === undefined || !order) return [];

    const cols = bounds.end.col - bounds.start.col + 1;
    const offsets = this.wasm.permuteRowsLosses(
      handle,
      bounds.start.row,
      bounds.start.col,
      cols,
      order,
    );
    return Array.from(offsets, (offset) => ({
      sheet: bounds.sheet,
      row: bounds.start.row + Math.floor(offset / cols),
      col: bounds.start.col + (offset % cols),
    }));
  }

  /** The operation that moves every row of `patch` back, or `null` for an invalid order. */
  invertedPermutation(patch: PermuteRowsOperation): PermuteRowsOperation | null {
    const order = decodeRowOrder(patch);
    const inverse = order ? this.wasm.rowOrderTargets(order) : null;
    if (!order || !inverse || inverse.length !== order.length) return null;

    const { range } = patch;
    return {
      op: "permuteRows",
      range: { ...range, start: { ...range.start }, end: { ...range.end } },
      encoding: ROW_ORDER_ENCODING,
      order: encodeRowOrder(inverse),
    };
  }

  /** Excel's current region around a data cell: the block bounded by empty rows and columns. */
  currentRegion(addr: CellAddress): Range | null {
    const handle = this.sheets.handles.get(addr.sheet);
    if (handle === undefined) return null;

    const [top, left, bottom, right] = this.wasm.currentRegion(handle, addr.row, addr.col);
    if (top === undefined || left === undefined || bottom === undefined || right === undefined) {
      return null;
    }

    return { sheet: addr.sheet, start: { row: top, col: left }, end: { row: bottom, col: right } };
  }

  /**
   * The plan that sorts the data rows of `range` by `keys`: a `permuteRows`
   * operation, no change, or Excel's refusal. Rows that are hidden or
   * filtered out keep their place, as in Excel; the others take the sorted
   * order among the visible positions. Keys are columns inside the range.
   */
  sortRangePlan(range: Range, keys: readonly SortKey[], hasHeader: boolean): SortRangePlan {
    const bounds = normalizedRange(range);
    const sheet = this.sheets.sheetMeta(bounds.sheet);
    const dataStart = bounds.start.row + (hasHeader ? 1 : 0);
    const keysInside = keys.every(
      (key) => integerAt(key.col) && key.col >= bounds.start.col && key.col <= bounds.end.col,
    );
    if (
      keys.length === 0 ||
      !keysInside ||
      bounds.start.row < 0 ||
      bounds.start.col < 0 ||
      bounds.end.row >= sheet.rowCount ||
      bounds.end.col >= sheet.columns.length ||
      dataStart > bounds.end.row
    ) {
      return { kind: "unchanged" };
    }

    const height = this.recordHeight(sheet, bounds, dataStart);
    if (height === null) return { kind: "refused", message: MERGED_CELLS_SORT_MESSAGE };

    const starts = this.visibleRecordStarts(bounds.sheet, dataStart, bounds.end.row, height);
    if (starts.length < 2) return { kind: "unchanged" };

    const sorted = this.wasm.sortRowsMulti(
      this.sheets.handleOf(bounds.sheet),
      Uint32Array.from(keys, (key) => key.col),
      Uint8Array.from(keys, (key) => (key.ascending ? 1 : 0)),
      starts,
    );
    const order = new Uint32Array(bounds.end.row - dataStart + 1);
    for (let offset = 0; offset < order.length; offset++) order[offset] = offset;
    for (const [position, target] of starts.entries()) {
      const source = sorted[position] ?? target;
      for (let row = 0; row < height; row++) {
        order[target - dataStart + row] = source - dataStart + row;
      }
    }

    const sortedRange: Range = {
      sheet: bounds.sheet,
      start: { row: dataStart, col: bounds.start.col },
      end: { row: bounds.end.row, col: bounds.end.col },
    };
    const permute: PermuteRowsOperation = {
      op: "permuteRows",
      range: sortedRange,
      encoding: ROW_ORDER_ENCODING,
      order: encodeRowOrder(order),
    };
    const table = tableWithBody(sheet.tables ?? [], sortedRange);
    const operations: DocumentOp[] = table
      ? [
          permute,
          {
            op: "updateTable",
            sheet: bounds.sheet,
            tableId: table.id,
            patch: { sortState: tableSortState(sortedRange, keys) },
          },
        ]
      : [permute];
    return { kind: "move", operations };
  }

  /**
   * Visible rows from `first` to `last` that start a record of `height`
   * rows, in sheet order. A record is visible when its first row is.
   */
  private visibleRecordStarts(
    sheet: SheetId,
    first: number,
    last: number,
    height: number,
  ): Uint32Array {
    const hidden = this.sheets.sheetMeta(sheet).hiddenRows;
    const filtered = this.view.hasView(sheet);
    const rows = new Uint32Array(Math.ceil((last - first + 1) / height));
    let count = 0;
    for (let row = first; row <= last; row += height) {
      if (hidden?.has(row)) continue;
      if (filtered && this.view.viewRowOf(sheet, row) === null) continue;
      rows[count] = row;
      count += 1;
    }
    return rows.subarray(0, count);
  }

  /**
   * Rows per sorted record, or `null` when Excel refuses the sort. Merged
   * cells in the data rows must all have the same size, start on record
   * boundaries, lie inside the range and repeat in every record; they then
   * make records of their height, which sort as units. Microsoft Learn, "An
   * error message when you sort a range that contains merged cells in Excel".
   */
  private recordHeight(sheet: Sheet, bounds: Range, dataStart: number): number | null {
    const merges = (sheet.merges ?? []).filter(
      (merge) =>
        merge.r0 <= bounds.end.row &&
        merge.r1 >= dataStart &&
        merge.c0 <= bounds.end.col &&
        merge.c1 >= bounds.start.col,
    );
    const [first] = merges;
    if (!first) return 1;

    const rows = bounds.end.row - dataStart + 1;
    const height = first.r1 - first.r0 + 1;
    const width = first.c1 - first.c0 + 1;
    if (rows % height !== 0) return null;

    const recordColumns = new Set<number>();
    for (const merge of merges) {
      const sameSize = merge.r1 - merge.r0 + 1 === height && merge.c1 - merge.c0 + 1 === width;
      const inside =
        merge.r0 >= dataStart && merge.c0 >= bounds.start.col && merge.c1 <= bounds.end.col;
      if (!sameSize || !inside || (merge.r0 - dataStart) % height !== 0) return null;
      recordColumns.add(merge.c0);
    }

    const everyRecordMerged = merges.length === (rows / height) * recordColumns.size;
    return everyRecordMerged ? height : null;
  }

  /**
   * Capture resolved cells and serializable sources in input order. Rows with
   * the same selected columns share a source read, without capturing the empty
   * bounding rectangle of a sparse selection.
   */
  captureCells(
    sheet: SheetId,
    coordinates: readonly { row: number; col: number }[],
  ): Array<ResolvedCell & { value: CellValue; isSpillChild: boolean }> {
    if (coordinates.length === 0) return [];

    const resolved = this.captureSparseBeforeCells(
      { sheet, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      coordinates.map(({ row, col }) => ({ rowOffset: row, colOffset: col })),
    );
    const captured = resolved.map((cell) => ({
      ...cell,
      value: { kind: "literal", value: cell.resolved } as CellValue,
      isSpillChild: false,
    }));

    const byRow = new Map<number, Map<number, number[]>>();
    for (const [index, coordinate] of coordinates.entries()) {
      let columns = byRow.get(coordinate.row);
      if (!columns) {
        columns = new Map();
        byRow.set(coordinate.row, columns);
      }

      const indices = columns.get(coordinate.col) ?? [];
      indices.push(index);
      columns.set(coordinate.col, indices);
    }

    const groups = new Map<string, { rows: number[]; cols: number[] }>();
    for (const [row, columns] of byRow) {
      const cols = [...columns.keys()].sort((left, right) => left - right);
      const key = cols.join(",");
      const group = groups.get(key);
      if (group) group.rows.push(row);
      else groups.set(key, { rows: [row], cols });
    }

    for (const { rows, cols } of groups.values()) {
      const snapshot = this.windowReader.captureSourcesForRows(sheet, Uint32Array.from(rows), cols);
      if (!snapshot) continue;

      const spillDerived = snapshot.spillDerived();
      const sources = consumeSourceSnapshot(snapshot, this.sheetIdsByHandle);
      for (const [rowIndex, row] of rows.entries()) {
        const columns = byRow.get(row);
        if (!columns) throw new Error("Missing row in cell capture");

        for (const [colIndex, col] of cols.entries()) {
          const offset = rowIndex * cols.length + colIndex;
          const formula = sources.formulaAt(offset);
          const reference = sources.referenceAt(offset);
          for (const index of columns.get(col) ?? []) {
            const cell = captured[index];
            if (!cell) throw new Error("Missing resolved cell in cell capture");

            cell.isSpillChild = Boolean(spillDerived[offset]);
            cell.value = formula
              ? { kind: "formula", src: formula }
              : reference
                ? { kind: "ref", target: reference }
                : { kind: "literal", value: spillDerived[offset] ? null : cell.resolved };
          }
        }
      }
    }

    return captured;
  }

  captureResolvedCells(
    sheet: SheetId,
    coordinates: readonly { row: number; col: number }[],
  ): ResolvedCell[] {
    const rows = new Uint32Array(coordinates.length);
    const columns = new Uint32Array(coordinates.length);

    for (const [index, cell] of coordinates.entries()) {
      rows[index] = cell.row;
      columns[index] = cell.col;
    }

    return consumeCellSnapshots(
      this.wasm.cellSnapshots(this.sheets.handleOf(sheet), rows, columns),
      (styleId) => this.styles.get(styleId),
    );
  }

  /**
   * Previous values of a sparse cell list, read in one batched call.
   *
   * Entry `n` belongs to cell `n` of `cells` and matches what `getCell` reports
   * for that address; the batch exists so a large `setRange` costs one crossing
   * instead of one per captured cell.
   */
  private captureSparseBeforeCells(
    bounds: Range,
    cells: readonly { rowOffset: number; colOffset: number }[],
  ): ResolvedCell[] {
    const rows = new Uint32Array(cells.length);
    const columns = new Uint32Array(cells.length);

    for (const [index, cell] of cells.entries()) {
      rows[index] = bounds.start.row + cell.rowOffset;
      columns[index] = bounds.start.col + cell.colOffset;
    }

    return consumeCellSnapshots(
      this.wasm.cellSnapshots(this.sheets.handleOf(bounds.sheet), rows, columns),
      (styleId) => this.styles.get(styleId),
    );
  }

  /**
   * Previous values of one dense block, read in one packed call.
   *
   * Each entry is the resolved value and style `getCell` reports for the same
   * address, so captured `oldValue`/`oldStyle` payloads stay unchanged while the
   * read costs one crossing instead of one per cell.
   */
  private captureBlockBeforeCells(
    bounds: Range,
    rows: number,
    cols: number,
    occupiedOnly = false,
  ): Array<{ addr: CellAddress; before: ResolvedCell }> {
    const columns: number[] = new Array(cols);
    for (let col = 0; col < cols; col += 1) columns[col] = bounds.start.col + col;

    const snapshot = this.windowReader.readRectangle(bounds.sheet, bounds.start.row, rows, columns);
    const cells: Array<{ addr: CellAddress; before: ResolvedCell }> = [];
    // Style ids index this window's own style list, so find its empty slots once.
    const emptyStyleSlots = occupiedOnly
      ? snapshot.styles.map((style) => Object.keys(style).length === 0)
      : [];
    // A formula or reference can resolve to empty and still be cleared.
    const sources = occupiedOnly
      ? this.captureSourceProjection(bounds.sheet, bounds.start.row, bounds.start.col, rows, cols)
      : null;
    const sourceOffsets = new Set([
      ...(sources?.formulaOffsets ?? []),
      ...(sources?.referenceOffsets ?? []),
    ]);

    for (let offset = 0; offset < rows * cols; offset += 1) {
      const resolved = snapshot.values[offset] ?? null;
      const styleId = snapshot.styleIds[offset] ?? 0;
      // A clear changes nothing in an empty, unstyled cell without a source;
      // skipping it keeps a whole-column clear from allocating one change per row.
      if (
        occupiedOnly &&
        resolved === null &&
        emptyStyleSlots[styleId] !== false &&
        !sourceOffsets.has(offset)
      ) {
        continue;
      }
      const style = snapshot.styles[styleId] ?? EMPTY_STYLE;

      const row = bounds.start.row + Math.floor(offset / cols);
      const col = bounds.start.col + (offset % cols);
      cells.push({ addr: { sheet: bounds.sheet, row, col }, before: { resolved, style } });
    }

    return cells;
  }

  private writePackedBlock(bounds: Range, block: PackedCellBlock): boolean {
    const rows = bounds.end.row - bounds.start.row + 1;
    const cols = bounds.end.col - bounds.start.col + 1;
    const cellCount = rows * cols;
    const values = block.values;
    const styleIds = block.styleIds;
    const kinds = new Uint8Array(cellCount);
    const numbers = new Float64Array(cellCount);
    const wasmStyles = new Uint32Array(cellCount);
    const styleTable = block.styleTable ?? [];

    // Sizing the text buffer up front costs one extra pass over `values` and
    // keeps the packing pass free of reallocations for ASCII text.
    let textCount = 0;
    let textBytes = 0;

    for (let offset = 0; offset < cellCount; offset += 1) {
      const value = values[offset];
      if (typeof value !== "string") continue;

      textCount += 1;
      textBytes += value.length;
    }

    const texts = new PackedTextBuffer(textBytes, textCount);

    for (let offset = 0; offset < cellCount; offset++) {
      const value = values[offset];
      writeScalarWire(kinds, numbers, offset, value);
      if (typeof value === "string") texts.add(value);

      const styleId = styleIds === undefined ? undefined : styleIds[offset];
      wasmStyles[offset] = this.styles.intern(
        styleId === undefined ? undefined : styleTable[styleId],
      );
    }

    const formulas = block.formulas ?? [];
    const refs = block.refs ?? [];
    const referenceTargets = new Uint32Array(refs.length * 3);

    for (let index = 0; index < refs.length; index++) {
      const target = refs[index]![1];
      const targetHandle = this.sheets.handles.get(target.sheet);
      if (targetHandle === undefined || !this.isCellInBounds(target)) return false;

      const packed = index * 3;
      referenceTargets[packed] = targetHandle;
      referenceTargets[packed + 1] = target.row;
      referenceTargets[packed + 2] = target.col;
    }

    this.noteRangeMutationFfi(cellCount);

    return (
      this.wasm.setBlockPacked(
        this.sheets.handleOf(bounds.sheet),
        bounds.start.row,
        bounds.start.col,
        rows,
        cols,
        kinds,
        numbers,
        texts.packedBytes(),
        texts.offsets,
        wasmStyles,
        Uint32Array.from(formulas, ([offset]) => offset),
        formulas.map(([, source]) => source),
        Uint32Array.from(refs, ([offset]) => offset),
        referenceTargets,
      ) === 0
    );
  }

  private writeSparseBlock(
    bounds: Range,
    cells: readonly { offset: number; value: CellValue; style?: CellStyle }[],
  ): boolean {
    const offsets = new Uint32Array(cells.length);
    const kinds = new Uint8Array(cells.length);
    const numbers = new Float64Array(cells.length);
    const texts: string[] = new Array(cells.length);
    const styles = new Uint32Array(cells.length);
    const formulaOffsets: number[] = [];
    const formulaSources: string[] = [];
    const referenceOffsets: number[] = [];
    const referenceTargets: number[] = [];

    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index]!;
      offsets[index] = cell.offset;
      styles[index] = this.styles.intern(cell.style);

      if (cell.value.kind === "formula") {
        formulaOffsets.push(cell.offset);
        formulaSources.push(cell.value.src);
        texts[index] = "";
      } else if (cell.value.kind === "ref") {
        const targetHandle = this.sheets.handles.get(cell.value.target.sheet);
        if (targetHandle === undefined || !this.isCellInBounds(cell.value.target)) return false;

        referenceOffsets.push(cell.offset);
        referenceTargets.push(targetHandle, cell.value.target.row, cell.value.target.col);
        texts[index] = "";
      } else {
        const value = cell.value.value;
        writeScalarWire(kinds, numbers, index, value);
        texts[index] = typeof value === "string" ? value : "";
      }
    }

    this.noteRangeMutationFfi(cells.length);

    return (
      this.wasm.setSparseBlock(
        this.sheets.handleOf(bounds.sheet),
        bounds.start.row,
        bounds.start.col,
        bounds.end.row - bounds.start.row + 1,
        bounds.end.col - bounds.start.col + 1,
        offsets,
        kinds,
        numbers,
        texts,
        styles,
        Uint32Array.from(formulaOffsets),
        formulaSources,
        Uint32Array.from(referenceOffsets),
        Uint32Array.from(referenceTargets),
      ) === 0
    );
  }

  /**
   * Peer operations and history may restore a source that blocks derived
   * output. Uninstall only the pivots whose output a replayed write touches;
   * `flushPivots` reinstalls them at the barrier. The engine keeps the caches
   * of unchanged definitions, so other pivots on the sheet are not rebuilt.
   */
  private releaseReplayedPivotOutputs(patches: readonly DocumentOp[]): void {
    // One status call per sheet, not per patch; null marks a sheet without pivots.
    const outputsBySheet = new Map<SheetId, Array<{ id: string; range: Range }> | null>();
    const releasedBySheet = new Map<SheetId, Set<string>>();
    for (const patch of patches) {
      const sheetId = patchSheetId(patch);
      if (sheetId === null) continue;
      let outputs = outputsBySheet.get(sheetId);
      if (outputs === undefined) {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheetId);
        outputs = sheet?.pivots?.length ? this.pivotOutputs(sheetId) : null;
        outputsBySheet.set(sheetId, outputs);
      }
      if (!outputs?.length) continue;

      const written = pivotWrittenRange(patch);
      if (!written) continue;
      for (const output of outputs) {
        if (!rangesIntersect(output.range, written)) continue;
        let released = releasedBySheet.get(sheetId);
        if (!released) {
          released = new Set();
          releasedBySheet.set(sheetId, released);
        }
        released.add(output.id);
      }
    }

    for (const [sheetId, released] of releasedBySheet) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheetId);
      if (!sheet) continue;
      const kept = (sheet.pivots ?? []).filter((pivot) => !released.has(pivot.id));
      this.syncPivots({ ...sheet, pivots: kept });
      this.pivotSheetsDirty.add(sheetId);
    }
  }

  /** Apply raw patches once; remote loads suppress paged dirty tracking. */
  applyPatches(
    patches: readonly DocumentOp[],
    {
      remoteLoad,
      captureChanges,
      captureDetailedChanges = false,
      trustedHistory = false,
      replayPivotSources = false,
    }: {
      remoteLoad: boolean;
      captureChanges: boolean;
      captureDetailedChanges?: boolean;
      trustedHistory?: boolean;
      replayPivotSources?: boolean;
    },
  ): StoreDataEngineEffects {
    const changes: ChangeEvent["changes"] | null = captureChanges ? [] : null;
    const appliedPatches: DocumentOp[] = [];
    const touchedSheets = new Set<SheetId>();
    let hasStructuralPatch = false;
    const tracksPagedRevision = !remoteLoad && this.storageOptions.storage === "paged";
    const mutationRevision = remoteLoad ? 0n : this.wasm.beginMutation();
    const storageRevision = tracksPagedRevision ? mutationRevision : 0n;

    if (remoteLoad) this.wasm.beginPageLoad();
    try {
      if (replayPivotSources) this.releaseReplayedPivotOutputs(patches);
      for (const patch of patches) {
        // Planned before the edit, from the same rule the undo inverse uses.
        const pivotPlan = planPivotEdit(patch, this.workbook.sheets);
        const rewrites = pivotPlan ? pivotRewrites(this.workbook.sheets, pivotPlan) : [];
        if (!this.applyPatch(patch, changes, captureDetailedChanges, trustedHistory)) continue;
        if (rewrites.length > 0) {
          applyPivotRewrites(this.workbook.sheets, rewrites);
          for (const rewrite of rewrites) this.pivotSheetsDirty.add(rewrite.owner);
        }

        appliedPatches.push(patch);

        // A removed sheet has no spill blockers left to rebuild.
        const touchedSheet = patch.op === "removeSheet" ? null : patchSheetId(patch);
        if (touchedSheet !== null) touchedSheets.add(touchedSheet);

        if (
          patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns" ||
          patch.op === "addSheet" ||
          patch.op === "removeSheet"
        ) {
          hasStructuralPatch = true;
        }
      }

      if (hasStructuralPatch) {
        for (const touched of touchedSheets) this.spillBlockersDirty.add(touched);
      }

      this.flushSpillBlockers();
      this.flushPivots();
      this.rangeMutationStats.documentOperations += appliedPatches.length;
      this.rangeMutationStats.jsPatchObjects += appliedPatches.length;

      return { appliedPatches, changes, storageRevision };
    } finally {
      // Most transactions queue no hidden rows. With the flush and its nested
      // try on every edit, JavaScriptCore optimized one-cell edits later, and
      // the engine memory probe measured a 27% slower edit median.
      if (this.view.hasQueuedHiddenRows()) this.flushHiddenRowsAndCommit();
      else this.wasm.commitSources();
    }
  }

  /** Send the queued hidden rows, then close the mutation, even when the engine rejects the runs. */
  private flushHiddenRowsAndCommit(): void {
    try {
      this.view.flushHiddenRows();
    } finally {
      this.wasm.commitSources();
    }
  }

  /** Whether the sheet that `patch` targets takes it; a dashboard has no cells, rows or columns. */
  private sheetTakes(patch: DocumentOp): boolean {
    if (dashboardTakes(patch.op)) return true;
    const target = patchSheetId(patch);
    return !isDashboard(this.workbook.sheets.find((sheet) => sheet.id === target));
  }

  private applyPatch(
    patch: DocumentOp,
    changes: ChangeEvent["changes"] | null,
    captureDetailedChanges = false,
    trustedHistory = false,
  ): boolean {
    if (!this.sheetTakes(patch)) return false;

    switch (patch.op) {
      case "set": {
        if (!this.isCellInBounds(patch.addr)) return false;
        const before = changes ? this.getCell(patch.addr) : null;
        const bounds: Range = cellRange(patch.addr);

        if (
          !this.writeSparseBlock(bounds, [{ offset: 0, value: patch.value, style: patch.style }])
        ) {
          return false;
        }

        if (changes && before) {
          changes.push({
            addr: patch.addr,
            oldValue: literalOf(before.resolved),
            newValue: patch.value,
            oldStyle: before.style,
            newStyle: patch.style,
          });
        }

        return true;
      }

      case "setRange": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheets.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }

        if (
          patch.cells.some(
            (cell) =>
              !integerAt(cell.rowOffset) ||
              !integerAt(cell.colOffset) ||
              bounds.start.row + cell.rowOffset > bounds.end.row ||
              bounds.start.col + cell.colOffset > bounds.end.col,
          )
        ) {
          return false;
        }

        const cols = bounds.end.col - bounds.start.col + 1;
        const beforeCells = changes ? this.captureSparseBeforeCells(bounds, patch.cells) : null;
        const sparseCells = patch.cells.map((cell, index) => ({
          offset: cell.rowOffset * cols + cell.colOffset,
          value: cell.value,
          style: cell.style,
          addr: {
            sheet: bounds.sheet,
            row: bounds.start.row + cell.rowOffset,
            col: bounds.start.col + cell.colOffset,
          },
          before: beforeCells?.[index] ?? null,
        }));

        this.rangeMutationStats.jsPatchObjects += patch.cells.length;
        if (!this.writeSparseBlock(bounds, sparseCells)) return false;
        if (changes) {
          for (const cell of sparseCells) {
            if (!cell.before) continue;
            changes.push({
              addr: cell.addr,
              oldValue: literalOf(cell.before.resolved),
              newValue: cell.value,
              oldStyle: cell.before.style,
              newStyle: cell.style,
            });
          }
        }

        return true;
      }

      case "setBlock":
      case "restoreBlock": {
        const { range, block } = patch.op === "restoreBlock" ? restoreBlockFacts(patch) : patch;
        const bounds = patch.op === "restoreBlock" ? range : normalizedRange(range);

        const sheet = this.sheets.sheetMeta(bounds.sheet);
        const rows = bounds.end.row - bounds.start.row + 1;
        const cols = bounds.end.col - bounds.start.col + 1;
        const cellCount = rows * cols;
        const styleTable = block.styleTable ?? [];
        const styleIds = block.styleIds;
        const exceptions = [...(block.formulas ?? []), ...(block.refs ?? [])];

        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length ||
          block.rowCount !== rows ||
          block.colCount !== cols ||
          block.values.length !== cellCount ||
          (styleIds !== undefined && styleIds.length !== cellCount) ||
          exceptions.some(
            ([offset]) => !Number.isInteger(offset) || offset < 0 || offset >= cellCount,
          ) ||
          (styleIds?.some(
            (styleId) => !Number.isInteger(styleId) || styleId < 0 || styleId >= styleTable.length,
          ) ??
            false)
        ) {
          return false;
        }

        const beforeCells =
          changes && captureDetailedChanges
            ? this.captureBlockBeforeCells(bounds, rows, cols)
            : null;
        const history = trustedHistory ? preparedHistoryBlock(block) : undefined;
        const applied = history ? history.restore(bounds) : this.writePackedBlock(bounds, block);
        if (!applied || !changes || !beforeCells) return applied;
        const formulas = new Map(block.formulas ?? []);
        const refs = new Map(block.refs ?? []);
        for (let offset = 0; offset < beforeCells.length; offset += 1) {
          const entry = beforeCells[offset]!;
          const formula = formulas.get(offset);
          const target = refs.get(offset);
          const next: CellValue =
            formula !== undefined
              ? { kind: "formula", src: formula }
              : target !== undefined
                ? { kind: "ref", target }
                : { kind: "literal", value: block.values[offset]! };
          changes.push({
            addr: entry.addr,
            oldValue: literalOf(entry.before.resolved),
            newValue: next,
            oldStyle: entry.before.style,
          });
        }

        return applied;
      }

      case "setRangeStyle": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheets.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }

        this.noteRangeMutationFfi();
        const oldIds = this.wasm.rangeStyleIds(
          this.sheets.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
        );
        this.rangeMutationStats.distinctStyleIds = Math.max(
          this.rangeMutationStats.distinctStyleIds,
          oldIds.length,
        );
        this.rangeMutationStats.maxTransferredArrayLength = Math.max(
          this.rangeMutationStats.maxTransferredArrayLength,
          oldIds.length,
        );
        const newIds = new Uint32Array(oldIds.length);
        for (let i = 0; i < oldIds.length; i++) {
          newIds[i] =
            patch.style === null
              ? 0
              : this.styles.intern({ ...this.styles.get(oldIds[i]!), ...patch.style });
        }

        this.noteRangeMutationFfi(Math.max(oldIds.length, newIds.length));
        return this.wasm.remapRangeStyles(
          this.sheets.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
          oldIds,
          newIds,
        );
      }

      case "clearRange": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheets.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }

        if ((patch.contents ?? true) && !this.admitsSourceRange(bounds)) return false;
        const clearContents = patch.contents ?? true;
        const clearStyle = patch.style ?? true;

        const beforeCells =
          changes && captureDetailedChanges && clearContents
            ? this.captureBlockBeforeCells(
                bounds,
                bounds.end.row - bounds.start.row + 1,
                bounds.end.col - bounds.start.col + 1,
                true,
              )
            : null;

        const applied = this.wasm.clearRange(
          this.sheets.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
          clearContents,
          clearStyle,
        );

        if (applied && changes && beforeCells) {
          capturedClearCells.set(
            patch,
            beforeCells.map((entry) => entry.addr),
          );
          for (const entry of beforeCells) {
            changes.push({
              addr: entry.addr,
              oldValue: literalOf(entry.before.resolved),
              newValue: { kind: "literal", value: null },
              oldStyle: entry.before.style,
            });
          }
        }

        return applied;
      }

      case "addRows": {
        const meta = this.sheets.sheetMeta(patch.sheet);
        if (!integerAt(patch.at) || !positiveCount(patch.count) || patch.at > meta.rowCount) {
          return false;
        }

        // The engine refuses a grid it cannot hold; the patch then changes nothing.
        if (!this.wasm.addRows(this.sheets.handleOf(patch.sheet), patch.at, patch.count))
          return false;
        meta.rowCount += patch.count;
        this.rebaseSheetAxis(patch.sheet, "row", insertRemap(patch.at, patch.count), {
          at: patch.at,
          delta: patch.count,
        });

        this.rebaseCharts({
          kind: "insert",
          sheet: patch.sheet,
          axis: "row",
          at: patch.at,
          count: patch.count,
        });

        return true;
      }

      case "removeRows": {
        const meta = this.sheets.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          !positiveCount(patch.count) ||
          patch.at + patch.count > meta.rowCount
        ) {
          return false;
        }

        if (!this.wasm.removeRows(this.sheets.handleOf(patch.sheet), patch.at, patch.count))
          return false;
        meta.rowCount -= patch.count;
        this.rebaseSheetAxis(patch.sheet, "row", deleteRemap(patch.at, patch.count), {
          at: patch.at,
          delta: -patch.count,
        });
        this.rebaseCharts({
          kind: "delete",
          sheet: patch.sheet,
          axis: "row",
          at: patch.at,
          count: patch.count,
          remaining: meta.rowCount,
        });

        return true;
      }

      case "moveRows":
        return this.moveAxis(patch, changes);

      case "permuteRows":
        return this.permuteRows(patch, changes, captureDetailedChanges);

      case "addColumns": {
        const meta = this.sheets.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          patch.at > meta.columns.length ||
          patch.columns.length === 0 ||
          !uniqueColumnKeys([...meta.columns, ...patch.columns])
        ) {
          return false;
        }

        if (
          !this.wasm.insertCols(this.sheets.handleOf(patch.sheet), patch.at, patch.columns.length)
        ) {
          return false;
        }

        meta.columns.splice(patch.at, 0, ...patch.columns);
        this.rebaseSheetAxis(patch.sheet, "column", insertRemap(patch.at, patch.columns.length), {
          at: patch.at,
          delta: patch.columns.length,
          inserted: patch.columns,
        });
        this.rebaseCharts({
          kind: "insert",
          sheet: patch.sheet,
          axis: "column",
          at: patch.at,
          count: patch.columns.length,
        });

        return true;
      }

      case "removeColumns": {
        const meta = this.sheets.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          !positiveCount(patch.count) ||
          patch.at + patch.count > meta.columns.length ||
          patch.count === meta.columns.length
        ) {
          return false;
        }

        if (!this.wasm.removeCols(this.sheets.handleOf(patch.sheet), patch.at, patch.count))
          return false;
        meta.columns.splice(patch.at, patch.count);
        this.rebaseSheetAxis(patch.sheet, "column", deleteRemap(patch.at, patch.count), {
          at: patch.at,
          delta: -patch.count,
        });
        this.rebaseCharts({
          kind: "delete",
          sheet: patch.sheet,
          axis: "column",
          at: patch.at,
          count: patch.count,
          remaining: meta.columns.length,
        });

        return true;
      }

      case "moveColumns":
        return this.moveAxis(patch, changes);

      case "setColumn": {
        const meta = this.sheets.sheetMeta(patch.sheet);
        const column = meta.columns[patch.col];
        if (!column) return false;
        const next = { ...column, ...patch.patch };
        if (
          !Number.isFinite(next.width) ||
          next.width < 0 ||
          (next.key !== column.key && meta.columns.some((item) => item.key === next.key))
        ) {
          return false;
        }

        meta.columns[patch.col] = next;
        return true;
      }

      case "setRowMeta": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        if (!integerAt(patch.row) || patch.row >= sheet.rowCount) return false;
        if (
          patch.meta?.height !== undefined &&
          (!Number.isFinite(patch.meta.height) || patch.meta.height <= 0)
        ) {
          return false;
        }

        if (!sheet.rowHeights) sheet.rowHeights = new Map();
        if (!sheet.hiddenRows) sheet.hiddenRows = new Set();
        if (patch.meta?.height !== undefined) {
          sheet.rowHeights.set(patch.row, patch.meta.height);
        } else {
          sheet.rowHeights.delete(patch.row);
        }

        if (patch.meta?.hidden) sheet.hiddenRows.add(patch.row);
        else sheet.hiddenRows.delete(patch.row);
        this.view.metadataChanged(patch.sheet);
        return true;
      }

      case "setHyperlink": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const hyperlink = sanitizeCellHyperlink(patch.hyperlink);
        if (!hyperlink || hyperlink.range.sheet !== patch.sheet) return false;
        const source = hyperlink.range;
        if (source.end.row >= sheet.rowCount || source.end.col >= sheet.columns.length) {
          return false;
        }

        if (hyperlink.target.kind === "internal") {
          const target = hyperlink.target.range;
          const targetSheet = this.workbook.sheets.find(
            (candidate) => candidate.id === target.sheet,
          );
          if (
            !targetSheet ||
            target.end.row >= targetSheet.rowCount ||
            target.end.col >= targetSheet.columns.length
          ) {
            return false;
          }
        }

        const links = upsertById(sheet.hyperlinks ?? [], hyperlink, MAX_HYPERLINKS_PER_SHEET);
        if (!links) return false;
        sheet.hyperlinks = links;

        this.view.metadataChanged(patch.sheet);
        return true;
      }

      case "removeHyperlink": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const links = sheet.hyperlinks ?? [];
        if (!links.some((hyperlink) => hyperlink.id === patch.id)) return false;
        sheet.hyperlinks = links.filter((hyperlink) => hyperlink.id !== patch.id);
        this.view.metadataChanged(patch.sheet);
        return true;
      }

      case "setChart": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const chart = sanitizeChartDefinition(patch.chart);
        if (!chart || !chartFitsSheets(chart, sheet, this.workbook.sheets)) return false;

        // Chart lists are replaced, never mutated, so captured definitions stay exact for undo.
        const charts = upsertById(sheet.charts ?? [], chart, MAX_CHARTS_PER_SHEET);
        if (!charts) return false;
        sheet.charts = charts;

        return true;
      }

      case "removeChart": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const charts = sheet.charts ?? [];
        if (!charts.some((chart) => chart.id === patch.id)) return false;
        sheet.charts = charts.filter((chart) => chart.id !== patch.id);
        return true;
      }

      case "setValidationRule": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const rule = {
          ...patch.rule,
          range: normalizedRange(patch.rule.range),
          condition: cloneJsonValue(patch.rule.condition),
        };

        if (!validValidationRules(sheet, [rule]) || rule.range.sheet !== patch.sheet) return false;
        sheet.validationRules = upsertById(sheet.validationRules ?? [], rule);

        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "removeValidationRule": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const rules = sheet.validationRules ?? [];
        if (!rules.some((rule) => rule.id === patch.id)) return false;
        sheet.validationRules = rules.filter((rule) => rule.id !== patch.id);
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "setProtectedRange": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const protectedRange = {
          ...patch.protectedRange,
          range: normalizedRange(patch.protectedRange.range),
        };

        if (
          protectedRange.range.sheet !== patch.sheet ||
          !validProtectedRanges(sheet, [protectedRange])
        ) {
          return false;
        }

        sheet.protectedRanges = upsertById(sheet.protectedRanges ?? [], protectedRange);

        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "removeProtectedRange": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const ranges = sheet.protectedRanges ?? [];
        if (!ranges.some((range) => range.id === patch.id)) return false;
        sheet.protectedRanges = ranges.filter((range) => range.id !== patch.id);
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "setNote": {
        if (!this.isCellInBounds(patch.addr)) return false;
        const sheet = this.sheets.sheetMeta(patch.addr.sheet);
        const notes = sheet.notes ?? [];
        const index = notes.findIndex(
          (note) => note.addr.row === patch.addr.row && note.addr.col === patch.addr.col,
        );
        if (patch.text === null || patch.text.length === 0) {
          if (index < 0) return false;
          sheet.notes = [...notes.slice(0, index), ...notes.slice(index + 1)];
        } else if (index < 0) {
          sheet.notes = [...notes, { addr: { ...patch.addr }, text: patch.text }];
        } else {
          const next = [...notes];
          next[index] = { addr: { ...patch.addr }, text: patch.text };
          sheet.notes = next;
        }

        return true;
      }

      case "addMerge": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        if (!validMerge(sheet, merge) || mergeCrossesFreeze(sheet, merge)) return false;
        const merges = sheet.merges ?? [];
        if (merges.some((existing) => mergesOverlap(existing, merge))) return false;
        sheet.merges = [...merges, merge];
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "removeMerge": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        const merges = sheet.merges ?? [];
        const index = merges.findIndex((existing) => sameMerge(existing, merge));
        if (index < 0) return false;
        sheet.merges = [...merges.slice(0, index), ...merges.slice(index + 1)];
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }

      case "addSheet":
        return this.addSheetSnapshot(patch.sheet, changes);

      case "removeSheet":
        return this.removeSheetSnapshot(patch.sheet);

      case "renameSheet": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet) return false;
        const name = validateSheetName(
          patch.name,
          this.workbook.sheets
            .filter((candidate) => candidate.id !== patch.sheet)
            .map((candidate) => candidate.name),
        );
        if (!name.ok || !this.renameSheetFormulaIdentity(patch.sheet, name.name)) return false;
        sheet.name = name.name;
        this.refreshNamedFormulas();
        return true;
      }

      case "moveSheet": {
        const from = this.workbook.sheets.findIndex((sheet) => sheet.id === patch.sheet);
        if (from < 0 || !integerAt(patch.to) || patch.to >= this.workbook.sheets.length)
          return false;
        const [sheet] = this.workbook.sheets.splice(from, 1);
        this.workbook.sheets.splice(patch.to, 0, sheet!);
        this.syncSheetOrder();
        return true;
      }

      case "setSheetVisibility": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet) return false;
        const previous = sheet.visibility ?? "visible";
        if (previous === patch.visibility) return false;
        if (
          previous === "visible" &&
          patch.visibility !== "visible" &&
          this.workbook.sheets.filter(
            (candidate) => (candidate.visibility ?? "visible") === "visible",
          ).length <= 1
        ) {
          return false;
        }

        const fallback =
          this.workbook.activeSheet === patch.sheet && patch.visibility !== "visible"
            ? visibleSheetNeighbor(this.workbook.sheets, patch.sheet)
            : null;
        if (
          this.workbook.activeSheet === patch.sheet &&
          patch.visibility !== "visible" &&
          !fallback
        ) {
          return false;
        }

        sheet.visibility = patch.visibility;
        if (fallback) this.workbook.activeSheet = fallback;
        return true;
      }

      case "addTable": {
        const sheet = this.workbook.sheets.find(
          (candidate) => candidate.id === patch.table.range.sheet,
        );
        if (!sheet) return false;
        const tableCount = this.workbook.sheets.reduce(
          (count, candidate) => count + (candidate.tables?.length ?? 0),
          0,
        );
        if (
          tableCount >= DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables ||
          (this.workbook.namedRanges ?? []).some(
            (range) => formulaNameKey(range.name) === formulaNameKey(patch.table.name),
          )
        ) {
          return false;
        }

        const existing = this.workbook.sheets.flatMap((candidate) => candidate.tables ?? []);
        if (!validWorkbookTable(patch.table, sheet, existing)) return false;
        const table = structuredClone(patch.table);
        if (!this.syncTable(table)) return false;
        sheet.tables = [...(sheet.tables ?? []), table];
        return true;
      }

      case "updateTable": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        const tables = sheet?.tables;
        const index = tables?.findIndex((table) => table.id === patch.tableId) ?? -1;
        const current = index >= 0 ? tables?.[index] : undefined;
        if (!sheet || !tables || !current) return false;
        const candidate: WorkbookTable = {
          ...current,
          ...patch.patch,
          id: current.id,
          style:
            patch.patch.style === null
              ? undefined
              : patch.patch.style === undefined
                ? current.style
                : patch.patch.style,
          autoFilter:
            patch.patch.autoFilter === null
              ? undefined
              : (patch.patch.autoFilter ?? current.autoFilter),
          sortState:
            patch.patch.sortState === null
              ? undefined
              : (patch.patch.sortState ?? current.sortState),
        };

        const existing = this.workbook.sheets.flatMap((candidateSheet) =>
          (candidateSheet.tables ?? []).filter((table) => table.id !== current.id),
        );
        if (
          (this.workbook.namedRanges ?? []).some(
            (range) => formulaNameKey(range.name) === formulaNameKey(candidate.name),
          )
        ) {
          return false;
        }

        if (!validWorkbookTable(candidate, sheet, existing)) return false;
        const next = structuredClone(candidate);
        if (next.style === undefined) delete next.style;
        if (next.autoFilter === undefined) delete next.autoFilter;
        if (next.sortState === undefined) delete next.sortState;
        if (!this.syncTable(next)) return false;
        const nextTables = [...tables];
        nextTables[index] = next;
        sheet.tables = nextTables;
        return true;
      }

      case "removeTable": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        const tables = sheet?.tables;
        const index = tables?.findIndex((table) => table.id === patch.tableId) ?? -1;
        if (!sheet || !tables || index < 0 || !this.wasm.removeTable(patch.tableId)) return false;
        sheet.tables = [...tables.slice(0, index), ...tables.slice(index + 1)];
        return true;
      }

      case "setPivot": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (
          !sheet ||
          !dashboardPivotAllowed(sheet, patch.pivot) ||
          this.pivotIssues(patch.pivot, sheet, this.workbook.sheets).length > 0
        ) {
          return false;
        }

        const owner = pivotOwner(this.workbook.sheets, patch.pivot.id);
        if (owner && owner !== sheet) return false;
        if (!owner && this.pivotCount() >= MAX_PIVOTS_PER_WORKBOOK) return false;

        const pivot = clonePivot(patch.pivot);
        sheet.pivots = upsertById(sheet.pivots ?? [], pivot);
        this.pivotSheetsDirty.add(sheet.id);
        return true;
      }

      case "removePivot": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet?.pivots?.some((pivot) => pivot.id === patch.id)) return false;
        sheet.pivots = sheet.pivots.filter((pivot) => pivot.id !== patch.id);
        // Free the output now, not at the barrier: a later write in the same
        // batch may target the cells, and the engine refuses writes into output.
        this.syncPivots(sheet);
        return true;
      }

      case "setSheetMeta": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        if (
          patch.patch.frozenRows !== undefined &&
          (!integerAt(patch.patch.frozenRows) || patch.patch.frozenRows > sheet.rowCount)
        ) {
          return false;
        }

        if (
          patch.patch.frozenCols !== undefined &&
          (!integerAt(patch.patch.frozenCols) || patch.patch.frozenCols > sheet.columns.length)
        ) {
          return false;
        }

        if (
          patch.patch.rowGroups?.some(
            (group) =>
              !integerAt(group.start) ||
              !integerAt(group.end) ||
              group.start > group.end ||
              group.end >= sheet.rowCount,
          ) ||
          (patch.patch.conditionalFormats !== undefined &&
            !validConditionalRules(sheet, patch.patch.conditionalFormats)) ||
          (patch.patch.sortKeys !== undefined &&
            !validSortAndFilters(sheet, patch.patch.sortKeys, patch.patch.filters ?? [])) ||
          (patch.patch.filters !== undefined &&
            !validSortAndFilters(sheet, patch.patch.sortKeys ?? [], patch.patch.filters))
        ) {
          return false;
        }

        if (patch.patch.frozenRows !== undefined) sheet.frozenRows = patch.patch.frozenRows;
        if (patch.patch.frozenCols !== undefined) sheet.frozenCols = patch.patch.frozenCols;
        if (patch.patch.conditionalFormats !== undefined) {
          patch.patch.conditionalFormats = structuredClone(patch.patch.conditionalFormats);
          sheet.conditionalFormats = patch.patch.conditionalFormats;
          this.windowReader.conditionalRulesChanged(patch.sheet);
        }

        if (patch.patch.rowGroups !== undefined) {
          sheet.rowGroups = patch.patch.rowGroups.map((group) => ({ ...group }));
          this.view.metadataChanged(patch.sheet);
        }

        if (patch.patch.sortKeys !== undefined || patch.patch.filters !== undefined) {
          if (patch.patch.sortKeys !== undefined) {
            sheet.sortKeys = patch.patch.sortKeys.map((key) => ({ ...key }));
          }

          if (patch.patch.filters !== undefined) {
            sheet.filters = patch.patch.filters.map(([col, filter]) => [
              col,
              cloneJsonValue(filter),
            ]);
          }

          this.view.metadataChanged(patch.sheet);
        }

        return true;
      }

      case "setNamedRange": {
        if (
          this.workbook.sheets.some((sheet) =>
            (sheet.tables ?? []).some(
              (table) => formulaNameKey(table.name) === formulaNameKey(patch.namedRange.name),
            ),
          )
        ) {
          return false;
        }

        if (
          (patch.namedRange.range !== undefined &&
            !this.workbook.sheets.some((sheet) => sheet.id === patch.namedRange.range?.sheet)) ||
          (patch.namedRange.scope !== undefined &&
            !this.workbook.sheets.some((sheet) => sheet.id === patch.namedRange.scope))
        ) {
          return false;
        }

        const namedRange: NamedRangeSnapshot =
          patch.namedRange.range === undefined
            ? { ...patch.namedRange }
            : { ...patch.namedRange, range: normalizedRange(patch.namedRange.range) };

        if (!this.syncNamedRange(namedRange)) return false;
        this.upsertNamedRange(namedRange);

        return true;
      }

      case "removeNamedRange": {
        const ranges = this.workbook.namedRanges ?? [];
        if (!ranges.some((range) => this.sameNamedRange(range, patch.name, patch.scope))) {
          return false;
        }

        if (!this.wasm.removeNamedRange(patch.name, this.namedRangeScope(patch.scope)))
          return false;
        this.workbook.namedRanges = ranges.filter(
          (range) => !this.sameNamedRange(range, patch.name, patch.scope),
        );
        return true;
      }

      case "setCalculation": {
        if (!this.syncCalculation(patch.calculation)) return false;
        this.workbook.calculation = storedCalculationSettings(patch.calculation);
        return true;
      }

      case "setMeasure":
      case "removeMeasure": {
        const current = this.workbook.dataModel;
        if (patch.op === "setMeasure") {
          const issues: DataModelIssue[] = [];
          validateMeasureAdmission(patch.measure, current, this.workbook.sheets, issues);
          if (issues.length > 0) return false;
        } else if (!findMeasure(current, patch.id)) {
          return false;
        }

        const model =
          patch.op === "setMeasure"
            ? withMeasure(current, patch.measure)
            : withoutMeasure(current, patch.id);
        if (!this.syncRelationships(model)) return false;
        this.workbook.dataModel = model;
        return true;
      }

      case "setDashboardItem": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        const issues: DataModelIssue[] = [];
        if (!sheet) return false;
        validateDashboardItemAdmission(patch.item, sheet, issues);
        if (issues.length > 0) return false;
        sheet.dashboard = withDashboardItem(sheet.dashboard, patch.item);
        // A slicer filters the dashboard's pivots.
        this.pivotSheetsDirty.add(sheet.id);
        return true;
      }

      case "removeDashboardItem": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet || !findDashboardItem(sheet, patch.id)) return false;
        sheet.dashboard = withoutDashboardItem(sheet.dashboard, patch.id);
        this.pivotSheetsDirty.add(sheet.id);
        return true;
      }

      case "setRelationship": {
        const issues: DataModelIssue[] = [];
        validateRelationshipAdmission(
          patch.relationship,
          this.workbook.dataModel,
          this.workbook.sheets,
          issues,
        );
        if (issues.length > 0) return false;
        const model = withRelationship(this.workbook.dataModel, patch.relationship);
        if (!this.syncRelationships(model)) return false;
        this.workbook.dataModel = model;
        return true;
      }

      case "removeRelationship": {
        if (!findRelationship(this.workbook.dataModel, patch.id)) return false;
        const model = withoutRelationship(this.workbook.dataModel, patch.id);
        if (!this.syncRelationships(model)) return false;
        this.workbook.dataModel = model;
        return true;
      }

      case "setQuery": {
        const issues: SavedQueryIssue[] = [];
        validateQueryAdmission(patch.query, this.workbook.queries, issues);
        if (issues.length > 0) return false;
        this.workbook.queries = withQuery(this.workbook.queries, patch.query);
        return true;
      }

      case "removeQuery": {
        const issues: SavedQueryIssue[] = [];
        validateQueryRemoval(patch.id, this.workbook.queries, issues);
        if (issues.length > 0) return false;
        this.workbook.queries = withoutQuery(this.workbook.queries, patch.id);
        return true;
      }
    }
  }

  private snapshotCells(
    sheet: SheetId,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number,
  ): Array<Extract<DocumentOp, { op: "set" }>> {
    const rows = rowEnd - rowStart;
    const cols = colEnd - colStart;

    this.noteRangeMutationFfi();
    const snapshot = this.wasm.captureSources(
      this.sheets.handleOf(sheet),
      rowStart,
      colStart,
      rows,
      cols,
    );
    const derived = snapshot?.spillDerived();
    const sources = snapshot ? consumeSourceSnapshot(snapshot, this.sheetIdsByHandle) : null;

    // Only outputs crossing the moved rectangle need a per-cell ownership check.
    const outputs = this.pivotOutputs(sheet).filter(
      ({ range }) =>
        range.start.row < rowEnd &&
        range.end.row >= rowStart &&
        range.start.col < colEnd &&
        range.end.col >= colStart,
    );

    const columns = Array.from({ length: cols }, (_, offset) => colStart + offset);
    const window = this.windowReader.read(
      sheet,
      { start: rowStart, end: rowEnd },
      columns,
      undefined,
      false,
    );

    const patches: Array<Extract<DocumentOp, { op: "set" }>> = [];
    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const addr = { sheet, row, col };
        const offset = (row - rowStart) * cols + col - colStart;
        const style = window.styles[window.styleIds[offset] ?? 0] ?? {};
        const formula = sources?.formulaAt(offset);
        const target = sources?.referenceAt(offset);
        const pivotDerived = outputs.some(
          ({ range }) =>
            row >= range.start.row &&
            row <= range.end.row &&
            col >= range.start.col &&
            col <= range.end.col,
        );
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : target
            ? { kind: "ref", target }
            : {
                kind: "literal",
                value: derived?.[offset] || pivotDerived ? null : (window.values[offset] ?? null),
              };

        if (value.kind === "literal" && value.value === null && Object.keys(style).length === 0) {
          continue;
        }

        patches.push({ op: "set", addr, value, style });
      }
    }

    return patches;
  }

  /**
   * Move whole rows or columns. The engine removes and re-adds them; this
   * puts back their cells, row metadata and tables, and carries every
   * range-keyed item (rules, notes, hyperlinks, charts, names) to the moved
   * positions from a copy taken before the remove.
   */
  private moveAxis(
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    const sheet = this.sheets.sheetMeta(patch.sheet);
    const axis: SheetAxis = patch.op === "moveRows" ? "row" : "column";
    const extent = axis === "row" ? sheet.rowCount : sheet.columns.length;
    if (
      !integerAt(patch.from) ||
      !integerAt(patch.to) ||
      !positiveCount(patch.count) ||
      patch.from + patch.count > extent ||
      patch.to > extent - patch.count
    ) {
      return false;
    }

    if (patch.from === patch.to) return true;

    const movedNamedFormulas = this.prepareMovedNamedFormulas(patch);
    if (movedNamedFormulas === null) return false;

    const moved = this.captureMovedItems(sheet, axis);
    const end = patch.from + patch.count;
    const cells =
      axis === "row"
        ? this.snapshotCells(patch.sheet, patch.from, end, 0, sheet.columns.length)
        : this.snapshotCells(patch.sheet, 0, sheet.rowCount, patch.from, end);
    const rowMeta = axis === "row" ? movedRowMeta(sheet, patch.from, patch.count) : [];
    const columns = axis === "column" ? sheet.columns.slice(patch.from, end) : [];

    const reinserted =
      this.applyPatch(
        {
          op: axis === "row" ? "removeRows" : "removeColumns",
          sheet: patch.sheet,
          at: patch.from,
          count: patch.count,
        },
        changes,
      ) &&
      this.applyPatch(
        axis === "row"
          ? { op: "addRows", sheet: patch.sheet, at: patch.to, count: patch.count }
          : { op: "addColumns", sheet: patch.sheet, at: patch.to, columns },
        changes,
      );
    if (!reinserted) return false;

    if (cells.length > 0 && !this.applyPatch(movedCellsPatch(sheet, patch, axis, cells), changes)) {
      return false;
    }

    for (let offset = 0; offset < rowMeta.length; offset++) {
      const meta = rowMeta[offset];
      if (meta) {
        this.applyPatch(
          { op: "setRowMeta", sheet: patch.sheet, row: patch.to + offset, meta },
          changes,
        );
      }
    }

    return (
      this.restoreMovedItems(sheet, moved, patch, axis) &&
      this.restoreMovedNamedFormulas(movedNamedFormulas)
    );
  }

  /**
   * Copies of the range-keyed items a move carries. The move runs as remove
   * then add, which would drop or shrink items inside the moved block, so
   * they are put back from these copies.
   */
  private captureMovedItems(sheet: Sheet, axis: SheetAxis): MovedItems {
    return {
      namedRanges: (this.workbook.namedRanges ?? [])
        .filter(
          (namedRange): namedRange is NamedRangeSnapshot & { range: Range } =>
            namedRange.range?.sheet === sheet.id,
        )
        .map((namedRange) => cloneJsonValue(namedRange)),
      validationRules: cloneJsonValue(sheet.validationRules) ?? [],
      protectedRanges: cloneJsonValue(sheet.protectedRanges) ?? [],
      notes: cloneJsonValue(sheet.notes) ?? [],
      conditionalFormats: cloneJsonValue(sheet.conditionalFormats ?? []),
      hyperlinks: this.workbook.sheets.map(
        (owner) => [owner.id, owner.hyperlinks?.map(cloneCellHyperlink) ?? []] as const,
      ),
      // Only a column move puts table metadata back; see `restoreMovedTables`.
      tables: axis === "column" ? cloneJsonValue(sheet.tables ?? []) : [],
      charts: this.captureCharts(),
    };
  }

  private restoreMovedItems(
    sheet: Sheet,
    moved: MovedItems,
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
    axis: SheetAxis,
  ): boolean {
    const moveAt = moveRemap(patch.from, patch.count, patch.to);
    const formulaEdit: FormulaAxisEdit = {
      kind: "move",
      from: patch.from,
      count: patch.count,
      to: patch.to,
    };

    sheet.validationRules = rebaseRangeItems(moved.validationRules, sheet.id, axis, moveAt);
    sheet.protectedRanges = rebaseRangeItems(moved.protectedRanges, sheet.id, axis, moveAt);
    sheet.notes = rebaseNotes(moved.notes, sheet.id, axis, moveAt);
    sheet.conditionalFormats = rebaseConditionalFormats(
      moved.conditionalFormats,
      sheet.id,
      axis,
      moveAt,
      formulaEdit,
    );
    for (const [ownerId, hyperlinks] of moved.hyperlinks) {
      const owner = this.workbook.sheets.find((candidate) => candidate.id === ownerId);
      if (owner) owner.hyperlinks = rebaseHyperlinks(hyperlinks, sheet.id, axis, moveAt);
    }

    if (axis === "column") this.restoreMovedTables(sheet, moved.tables, moveAt);
    this.restoreMovedCharts(moved.charts, { ...formulaEdit, sheet: sheet.id, axis });
    this.windowReader.conditionalRulesChanged(sheet.id);
    return moved.namedRanges.every((original) => {
      const namedRange = rebaseRangeAxis(original, sheet.id, axis, moveAt);
      return namedRange === null || this.upsertMovedNamedRange(namedRange);
    });
  }

  private upsertMovedNamedRange(namedRange: NamedRangeSnapshot): boolean {
    this.upsertNamedRange(namedRange);
    return this.syncNamedRange(namedRange);
  }

  /** Add `namedRange`, or replace the definition with its name and scope. */
  private upsertNamedRange(namedRange: NamedRangeSnapshot): void {
    this.workbook.namedRanges = upsertWhere(this.workbook.namedRanges ?? [], namedRange, (range) =>
      this.sameNamedRange(range, namedRange.name, namedRange.scope),
    );
  }

  /**
   * Move the rows of a range by the operation's permutation. The engine moves
   * cells and adjusts their formulas; notes, hyperlinks and merged cells of
   * the range move here. Nothing changes when a check fails.
   */
  private permuteRows(
    patch: PermuteRowsOperation,
    changes: ChangeEvent["changes"] | null,
    captureDetailedChanges: boolean,
  ): boolean {
    const bounds = normalizedRange(patch.range);
    const sheet = this.sheets.sheetMeta(bounds.sheet);
    const rows = bounds.end.row - bounds.start.row + 1;
    const order = decodeRowOrder(patch);
    if (
      !order ||
      bounds.start.row < 0 ||
      bounds.start.col < 0 ||
      bounds.end.row >= sheet.rowCount ||
      bounds.end.col >= sheet.columns.length
    ) {
      return false;
    }

    const targets = this.wasm.rowOrderTargets(order);
    if (targets.length !== rows) return false;

    const move = { bounds, targets };
    const merges = permutedMerges(sheet.merges ?? [], move);
    if (!merges || merges.some((merge) => mergeCrossesFreeze(sheet, merge))) return false;
    if (!tablesAllowRowMove(sheet.tables ?? [], bounds)) return false;

    const cols = bounds.end.col - bounds.start.col + 1;
    const beforeCells =
      changes && captureDetailedChanges ? this.captureBlockBeforeCells(bounds, rows, cols) : null;

    this.noteRangeMutationFfi(rows);
    const status = this.wasm.permuteRows(
      this.sheets.handleOf(bounds.sheet),
      bounds.start.row,
      bounds.start.col,
      cols,
      order,
    );
    if (status !== 0) return false;

    if (sheet.merges) {
      sheet.merges = merges;
      this.spillBlockersDirty.add(bounds.sheet);
    }
    if (sheet.notes) sheet.notes = permutedNotes(sheet.notes, move);
    if (sheet.hyperlinks) sheet.hyperlinks = permutedHyperlinks(sheet.hyperlinks, move);

    if (beforeCells && changes) this.pushPermutedChanges(bounds, beforeCells, changes);
    return true;
  }

  /**
   * Cell-level effects of a row permutation, for listeners that ask for them
   * (such as a row bridge). Other listeners read the operation's range.
   */
  private pushPermutedChanges(
    bounds: Range,
    beforeCells: Array<{ addr: CellAddress; before: ResolvedCell }>,
    changes: ChangeEvent["changes"],
  ): void {
    const after = this.captureCells(
      bounds.sheet,
      beforeCells.map(({ addr }) => addr),
    );
    for (const [index, entry] of beforeCells.entries()) {
      const next = after[index];
      if (!next) continue;

      changes.push({
        addr: entry.addr,
        oldValue: literalOf(entry.before.resolved),
        newValue: next.value,
        oldStyle: entry.before.style,
      });
    }
  }

  /**
   * A move runs as remove then add, which drops the moved columns' table
   * metadata and rebuilds them as new columns. When a table's columns still
   * form one rectangle after the move, put back its original column objects
   * (names, totals and calculated-column rules) in moved order and carry its
   * filter and sort rules with them. A table that would be split, would
   * overlap another table, or that the engine rejects keeps the remove/add
   * result, so a move never stops half-applied after its cells moved.
   */
  private restoreMovedTables(
    sheet: Sheet,
    originals: readonly WorkbookTable[],
    moveCol: (col: number) => number,
  ): void {
    let tables = sheet.tables ?? [];
    for (const original of originals) {
      const positions = original.columns.map((_column, offset) =>
        moveCol(original.range.start.col + offset),
      );
      const start = Math.min(...positions);
      const end = Math.max(...positions);
      if (end - start + 1 !== positions.length) continue;
      const columns = original.columns
        .map((column, offset) => ({ column, position: positions[offset] ?? start }))
        .sort((left, right) => left.position - right.position)
        .map(({ column }) => column);
      const restored: WorkbookTable = {
        ...original,
        columns,
        range: {
          ...original.range,
          start: { ...original.range.start, col: start },
          end: { ...original.range.end, col: end },
        },
      };

      delete restored.autoFilter;
      delete restored.sortState;
      Object.assign(restored, remapWorkbookTableRuleColumns(original, moveCol, start, end));
      const others = this.workbook.sheets
        .flatMap((owner) => (owner === sheet ? tables : (owner.tables ?? [])))
        .filter((table) => table.id !== original.id);
      if (!validWorkbookTable(restored, sheet, others) || !this.syncTable(restored)) continue;
      tables = upsertById(tables, restored);
    }

    sheet.tables = tables;
  }

  /** Keep chart list identity until a rewrite changes at least one definition. */
  private rewriteCharts(map: (chart: ChartDefinition, ownerId: SheetId) => ChartDefinition): void {
    for (const owner of this.workbook.sheets) {
      const charts = owner.charts;
      if (!charts) continue;

      let next: ChartDefinition[] | null = null;
      for (let index = 0; index < charts.length; index++) {
        const chart = charts[index];
        if (chart === undefined) continue;

        const rewritten = map(chart, owner.id);
        if (rewritten === chart) continue;

        next ??= charts.slice();
        next[index] = rewritten;
      }

      if (next) owner.charts = next;
    }
  }

  /** Rewrite every chart that is anchored on, or reads from, the edited sheet. */
  private rebaseCharts(edit: ChartAxisEdit): void {
    this.rewriteCharts((chart, ownerId) => rebaseChartAxis(chart, ownerId, edit));
  }

  /**
   * The live chart lists before a move. A move runs as remove then add, which
   * would turn sources inside the moved block into `#REF!`; the lists are
   * replaced rather than mutated, so these references keep the pre-move state.
   */
  private captureCharts(): Map<Sheet, readonly ChartDefinition[]> | null {
    let captured: Map<Sheet, readonly ChartDefinition[]> | null = null;
    for (const owner of this.workbook.sheets) {
      if (!owner.charts?.length) continue;
      captured ??= new Map();
      captured.set(owner, owner.charts);
    }
    return captured;
  }

  private restoreMovedCharts(
    originals: ReadonlyMap<Sheet, readonly ChartDefinition[]> | null,
    edit: Extract<ChartAxisEdit, { kind: "move" }>,
  ): void {
    if (!originals) return;
    for (const [owner, charts] of originals) {
      owner.charts = charts.map((chart) => rebaseChartAxis(chart, owner.id, edit));
    }
  }

  private addSheetSnapshot(
    snapshot: SheetSnapshot,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    if (!canAddSheetSnapshot(snapshot, this.workbook.sheets)) return false;
    const name = validateSheetName(
      snapshot.name,
      this.workbook.sheets.map((sheet) => sheet.name),
    );
    if (!name.ok) return false;
    const merges = snapshot.merges?.map(normalizeMerge) ?? [];
    const sheet: Sheet = {
      id: snapshot.id,
      name: name.name,
      ...dashboardFields(snapshot),
      visibility: snapshot.visibility,
      rowCount: snapshot.rowCount,
      columns: snapshot.columns.map((column) => ({ ...column })),
      frozenRows: snapshot.frozenRows,
      frozenCols: snapshot.frozenCols,
      merges,
      conditionalFormats: snapshot.conditionalFormats?.map((rule) => ({ ...rule })),
      hyperlinks: snapshot.hyperlinks?.map(cloneCellHyperlink),
      validationRules: cloneJsonValue(snapshot.validationRules),
      protectedRanges: cloneJsonValue(snapshot.protectedRanges),
      notes: cloneJsonValue(snapshot.notes),
      sortKeys: cloneJsonValue(snapshot.sortKeys),
      sortState: cloneJsonValue(snapshot.sortState),
      filters: cloneJsonValue(snapshot.filters),
      rowGroups: snapshot.rowGroups?.map((group) => ({ ...group })),
      tables: structuredClone(snapshot.tables),
      rowHeights: new Map(),
      hiddenRows: new Set(),
    };

    // Charts may read sheets already present, so bounds are checked against every tab.
    if (snapshot.charts) {
      const charts: ChartDefinition[] = [];
      for (const source of snapshot.charts) {
        const chart = sanitizeChartDefinition(source);
        if (!chart) return false;
        charts.push(chart);
      }

      if (!sheetChartsFit(charts, sheet, [...this.workbook.sheets, sheet])) return false;

      sheet.charts = charts;
    }

    try {
      assertWorkbookTables(
        [...this.workbook.sheets, sheet],
        DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
        (this.workbook.namedRanges ?? []).map((range) => range.name),
      );
    } catch {
      return false;
    }

    if (snapshot.pivots?.length) {
      const sheets = [...this.workbook.sheets, sheet];
      if (this.pivotCount() + snapshot.pivots.length > MAX_PIVOTS_PER_WORKBOOK) return false;
      const ids = new Set<string>();
      for (const pivot of snapshot.pivots) {
        if (
          ids.has(pivot.id) ||
          pivotOwner(this.workbook.sheets, pivot.id) ||
          this.pivotIssues(pivot, sheet, sheets).length > 0
        ) {
          return false;
        }

        ids.add(pivot.id);
      }

      sheet.pivots = snapshot.pivots.map(clonePivot);
      this.pivotSheetsDirty.add(sheet.id);
    }

    const handle = this.allocateSheet(snapshot.columns.length, snapshot.rowCount);
    this.wasm.setSheetName(handle, snapshot.id, name.name);
    this.sheets.handles.set(snapshot.id, handle);
    this.sheetIdsByHandle[handle] = snapshot.id;
    for (const [row, meta] of snapshot.rowMeta ?? []) {
      if (meta.height !== undefined) sheet.rowHeights!.set(row, meta.height);
      if (meta.hidden) sheet.hiddenRows!.add(row);
    }

    this.view.queueHiddenRows(snapshot.id);
    this.workbook.sheets.splice(snapshot.order, 0, sheet);
    this.syncSheetOrder();
    for (const table of sheet.tables ?? []) {
      if (!this.syncTable(table)) return false;
    }

    for (const block of snapshot.cells) {
      if (
        !this.applyPatch(
          {
            op: "setRange",
            range: {
              sheet: snapshot.id,
              start: { row: block.startRow, col: block.startCol },
              end: {
                row: block.startRow + block.rowCount - 1,
                col: block.startCol + block.colCount - 1,
              },
            },
            cells: block.cells,
          },
          changes,
        )
      ) {
        return false;
      }
    }

    this.windowReader.conditionalRulesChanged(snapshot.id);
    this.view.sheetLoaded(snapshot.id);
    if (this.snapshotAuthoritative) this.authoritativeSnapshotSheets.add(snapshot.id);
    return true;
  }

  private removeSheetSnapshot(sheetId: SheetId): boolean {
    const index = this.workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
    if (index < 0 || this.workbook.sheets.length <= 1) return false;
    const removed = this.workbook.sheets[index]!;
    if (
      (removed.visibility ?? "visible") === "visible" &&
      this.workbook.sheets.filter((sheet) => (sheet.visibility ?? "visible") === "visible")
        .length <= 1
    ) {
      return false;
    }

    const fallback =
      this.workbook.activeSheet === sheetId
        ? visibleSheetNeighbor(this.workbook.sheets, sheetId)
        : null;
    if (this.workbook.activeSheet === sheetId && !fallback) return false;
    if (!this.removeSheetFormulaIdentity(sheetId)) return false;
    this.sheets.handles.delete(sheetId);
    this.authoritativeSnapshotSheets.delete(sheetId);
    this.view.removeSheet(sheetId);
    this.windowReader.removeSheet(sheetId);
    this.workbook.sheets.splice(index, 1);
    if (fallback) this.workbook.activeSheet = fallback;
    this.workbook.namedRanges = this.workbook.namedRanges?.filter(
      (range) => range.range?.sheet !== sheetId && range.scope !== sheetId,
    );
    this.refreshNamedFormulas();
    for (const owner of this.workbook.sheets) {
      owner.hyperlinks = owner.hyperlinks?.filter(
        (hyperlink) =>
          hyperlink.target.kind !== "internal" || hyperlink.target.range.sheet !== sheetId,
      );
    }

    // A chart keeps a source on a removed sheet as an explicit `#REF!`.
    this.rewriteCharts((chart) => invalidateChartSheet(chart, sheetId));

    return true;
  }

  /**
   * Carry the sheet's row- or column-keyed metadata through an insert or
   * delete that the engine already applied; `remap` gives each old index its
   * new one, or null for a removed index.
   */
  private rebaseSheetAxis(
    sheet: SheetId,
    axis: SheetAxis,
    remap: (index: number) => number | null,
    edit: { at: number; delta: number; inserted?: readonly Column[] },
  ): void {
    const meta = this.sheets.sheetMeta(sheet);
    if (axis === "row") rebaseRowMeta(meta, remap);

    meta.merges = meta.merges
      ?.map((merge) => rebaseMergeAxis(merge, axis, remap))
      .filter((merge): merge is MergeRange => merge !== null);
    const formulaEdit: FormulaAxisEdit = { kind: "shift", at: edit.at, delta: edit.delta };
    meta.conditionalFormats =
      meta.conditionalFormats &&
      rebaseConditionalFormats(meta.conditionalFormats, sheet, axis, remap, formulaEdit);
    for (const owner of this.workbook.sheets) {
      owner.hyperlinks = owner.hyperlinks && rebaseHyperlinks(owner.hyperlinks, sheet, axis, remap);
    }

    this.windowReader.conditionalRulesChanged(sheet);
    meta.validationRules =
      meta.validationRules && rebaseRangeItems(meta.validationRules, sheet, axis, remap);
    meta.protectedRanges =
      meta.protectedRanges && rebaseRangeItems(meta.protectedRanges, sheet, axis, remap);
    meta.notes = meta.notes && rebaseNotes(meta.notes, sheet, axis, remap);
    meta.tables = this.rebaseTables(meta, axis, remap, edit);
    if (axis === "row" && meta.frozenRows)
      meta.frozenRows = frozenCountAfter(meta.frozenRows, remap);
    if (axis === "column" && meta.frozenCols) {
      meta.frozenCols = frozenCountAfter(meta.frozenCols, remap);
    }

    this.workbook.namedRanges = this.workbook.namedRanges
      ?.map((namedRange) =>
        namedRange.range === undefined
          ? namedRange
          : rebaseRangeAxis(namedRange, sheet, axis, remap),
      )
      .filter((range): range is NonNullable<Workbook["namedRanges"]>[number] => range !== null);
    this.refreshNamedFormulas();
    if (axis === "row") this.view.rowsChanged(sheet);
    else this.view.columnsChanged(sheet);
  }

  /**
   * The sheet's tables after an axis edit. A table whose span the edit
   * removes is dropped from the engine. A column edit inside a table also
   * inserts or removes the table's column definitions and remaps its
   * filter and sort rules; a table whose columns no longer match its span
   * is dropped.
   */
  private rebaseTables(
    meta: Sheet,
    axis: SheetAxis,
    remap: (index: number) => number | null,
    edit: { at: number; delta: number; inserted?: readonly Column[] },
  ): WorkbookTable[] {
    const tables: WorkbookTable[] = [];
    for (const table of meta.tables ?? []) {
      const range = rebaseRangeSpan(table.range, axis, remap);
      const next =
        range &&
        (axis === "row" ? { ...table, range } : this.rebaseTableColumns(table, range, remap, edit));
      if (!next) {
        this.wasm.removeTable(table.id);
        continue;
      }

      tables.push(next);
      this.syncTable(next);
    }
    return tables;
  }

  private rebaseTableColumns(
    table: WorkbookTable,
    range: Range,
    remap: (col: number) => number | null,
    edit: { at: number; delta: number; inserted?: readonly Column[] },
  ): WorkbookTable | null {
    let columns = table.columns;
    if (edit.delta > 0 && edit.at > table.range.start.col && edit.at <= table.range.end.col) {
      const added = this.insertedTableColumns(table, edit.inserted ?? []);
      const offset = edit.at - table.range.start.col;
      columns = [...columns.slice(0, offset), ...added, ...columns.slice(offset)];
    } else if (edit.delta < 0) {
      columns = columns.filter((_column, offset) => remap(table.range.start.col + offset) !== null);
    }

    if (columns.length !== range.end.col - range.start.col + 1) return null;

    const next: WorkbookTable = { ...table, columns, range };
    delete next.autoFilter;
    delete next.sortState;
    Object.assign(
      next,
      remapWorkbookTableRuleColumns(table, remap, range.start.col, range.end.col),
    );
    return next;
  }

  private acknowledgedSetStillMatches(
    addr: CellAddress,
    value: CellValue,
    style: CellStyle | undefined,
    sources?: RangeSourceProjection | null,
    sourceOffset = 0,
    current: ResolvedCell = this.getCell(addr),
  ): boolean {
    if (this.styles.intern(current.style) !== this.styles.intern(style)) return false;

    const formula =
      sources === undefined ? this.getFormula(addr) : sources?.formulaAt(sourceOffset);
    const target =
      sources === undefined ? this.getRefTarget(addr) : sources?.referenceAt(sourceOffset);

    if (value.kind === "formula") return formula === value.src;
    if (value.kind === "ref") {
      return (
        target?.sheet === value.target.sheet &&
        target.row === value.target.row &&
        target.col === value.target.col
      );
    }

    return formula == null && target == null && Object.is(current.resolved, value.value);
  }

  acknowledgeOperations(operations: readonly DocumentOp[], storageRevision?: bigint): void {
    if (storageRevision !== undefined && storageRevision !== 0n) {
      this.wasm.acknowledgeRevision(storageRevision);
      return;
    }

    for (const operation of operations) {
      if (operation.op === "set") {
        // Read in operation order so a later invalid address cannot prevent earlier acknowledgements.
        if (!this.acknowledgedSetStillMatches(operation.addr, operation.value, operation.style)) {
          continue;
        }

        this.wasm.markRangeClean(
          this.sheets.handleOf(operation.addr.sheet),
          operation.addr.row,
          operation.addr.row + 1,
          operation.addr.col,
          operation.addr.col + 1,
        );
      } else if (operation.op === "setRange") {
        const range = normalizedRange(operation.range);
        const rows = range.end.row - range.start.row + 1;
        const cols = range.end.col - range.start.col + 1;
        const sources = this.captureSourceProjection(
          range.sheet,
          range.start.row,
          range.start.col,
          rows,
          cols,
        );

        const currentCells = this.captureSparseBeforeCells(range, operation.cells);
        const matchedRowsByColumn = new Map<number, Set<number>>();

        for (const [index, cell] of operation.cells.entries()) {
          const row = range.start.row + cell.rowOffset;
          const col = range.start.col + cell.colOffset;
          const current = currentCells[index];
          if (!current) continue;

          if (
            !this.acknowledgedSetStillMatches(
              { sheet: range.sheet, row, col },
              cell.value,
              cell.style,
              sources,
              cell.rowOffset * cols + cell.colOffset,
              current,
            )
          ) {
            continue;
          }

          let matchedRows = matchedRowsByColumn.get(col);
          if (!matchedRows) {
            matchedRows = new Set<number>();
            matchedRowsByColumn.set(col, matchedRows);
          }

          matchedRows.add(row);
        }

        for (const [col, matchedRows] of matchedRowsByColumn) {
          const sortedRows = [...matchedRows].sort((left, right) => left - right);
          let start: number | undefined;
          let end: number | undefined;

          for (const row of sortedRows) {
            if (end !== undefined && row !== end && start !== undefined) {
              this.wasm.markRangeClean(this.sheets.handleOf(range.sheet), start, end, col, col + 1);
              start = undefined;
            }

            start ??= row;
            end = row + 1;
          }

          if (start !== undefined && end !== undefined) {
            this.wasm.markRangeClean(this.sheets.handleOf(range.sheet), start, end, col, col + 1);
          }
        }
      } else if (
        operation.op === "setBlock" ||
        operation.op === "restoreBlock" ||
        operation.op === "setRangeStyle" ||
        operation.op === "clearRange"
      ) {
        const range = normalizedRange(operation.range);
        this.wasm.markRangeClean(
          this.sheets.handleOf(range.sheet),
          range.start.row,
          range.end.row + 1,
          range.start.col,
          range.end.col + 1,
        );
      }
    }
  }

  exportSnapshot(
    documentId: string | undefined,
    documentVersion: number | undefined,
  ): WorkbookSnapshot {
    for (const sheet of this.workbook.sheets) {
      this.requireCompleteQuery(sheet.id);
    }
    return this.snapshotCodec.encode(documentId, documentVersion);
  }

  /** Rewrite resolved formula sheet identity without changing the stable WASM handle. */
  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    const handle = this.sheets.handleOf(sheet);
    return this.wasm.renameSheet(handle, sheet, name);
  }

  /** Tombstone a stable WASM handle and rewrite surviving formulas to `#REF!`. */
  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    const handle = this.sheets.handleOf(sheet);
    return this.wasm.removeSheet(handle);
  }

  /** Give the engine the tab order, which 3-D references such as `Sheet1:Sheet3!A1` span. */
  private syncSheetOrder(): void {
    const order = Uint32Array.from(this.workbook.sheets, (sheet) => this.sheets.handleOf(sheet.id));
    if (!this.wasm.setSheetOrder(order)) {
      throw new Error("engine sheet handles do not match the workbook tabs");
    }
  }

  /** Bulk-load one rectangular datasource page in one Rust-owned source transaction. */
  loadPage(
    sheet: SheetId,
    start: number,
    columns: readonly DataSourceColumnBand[],
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    if (rows.length === 0 || columns.length === 0) return;
    const meta = this.sheets.sheetMeta(sheet);
    const rowCount = Math.min(rows.length, Math.max(0, meta.rowCount - start));
    if (rowCount === 0) return;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw datasourceFailure("datasource page contains an invalid row start");
    }

    let previousEnd = -1;
    const declaredKeys = new Set<string>();
    for (const band of columns) {
      if (
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start < previousEnd ||
        band.end <= band.start ||
        band.end > meta.columns.length ||
        band.keys.length !== band.end - band.start
      ) {
        throw datasourceFailure("datasource page contains invalid column bounds");
      }

      for (let offset = 0; offset < band.keys.length; offset++) {
        const key = band.keys[offset]!;
        if (meta.columns[band.start + offset]?.key !== key || declaredKeys.has(key)) {
          throw datasourceFailure("datasource page contains invalid column keys");
        }

        declaredKeys.add(key);
      }

      previousEnd = band.end;
    }

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
      const row = rows[rowOffset]!;
      for (const key of declaredKeys) {
        if (!Object.hasOwn(row, key)) {
          throw datasourceFailure("datasource page omits declared cell data");
        }
      }

      for (const key of Object.keys(row)) {
        if (!declaredKeys.has(key))
          throw datasourceFailure("datasource page contains undeclared cell data");
      }
    }

    const blockStart = columns[0]!.start;
    const blockEnd = columns[columns.length - 1]!.end;
    const blockWidth = blockEnd - blockStart;

    const cells: Array<{ offset: number; value: CellValue; style?: CellStyle }> = [];
    const address: CellAddress = { sheet, row: start, col: blockStart };
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
      address.row = start + rowOffset;
      const row = rows[rowOffset]!;
      for (const band of columns) {
        for (let col = band.start; col < band.end; col++) {
          address.col = col;
          if (protect?.(address)) continue;
          const column = meta.columns[col]!;
          const dataCell = row[column.key];
          const wrapped = isStyledDataCell(dataCell) ? dataCell : undefined;

          const source = columnarScalar(dataCellValue(dataCell), column.type);
          const value: CellValue =
            source && typeof source === "object"
              ? source
              : { kind: "literal", value: source ?? null };
          cells.push({
            offset: rowOffset * blockWidth + col - blockStart,
            value,
            style: wrapped?.style,
          });
        }
      }
    }

    if (cells.length === 0) return;
    const bounds: Range = {
      sheet,
      start: { row: start, col: blockStart },
      end: { row: start + rowCount - 1, col: blockEnd - 1 },
    };

    const previousOperation = this.resourceOperation;
    this.resourceOperation ??= "ingest";
    let accepted = false;
    this.wasm.beginPageLoad();
    try {
      accepted = this.writeSparseBlock(bounds, cells);
    } finally {
      this.boundaryAccounting.record(this.resourceOperation ?? "ingest", "js-to-wasm", 0, "scalar");
      this.wasm.commitSources();
      this.resourceOperation = previousOperation;
    }

    if (!accepted) throw new Error("datasource page contains invalid persisted sources");
  }

  hydrateSnapshot(snapshot: WorkbookSnapshot): void {
    let accepted = true;
    this.wasm.beginPageLoad();
    try {
      for (const sourceSheet of snapshot.sheets) {
        for (const block of sourceSheet.cells) {
          const bounds: Range = {
            sheet: sourceSheet.id,
            start: { row: block.startRow, col: block.startCol },
            end: {
              row: block.startRow + block.rowCount - 1,
              col: block.startCol + block.colCount - 1,
            },
          };

          const cells = block.cells.map((cell) => ({
            offset: cell.rowOffset * block.colCount + cell.colOffset,
            value: cell.value,
            style: cell.style,
          }));

          if (!this.writeSparseBlock(bounds, cells)) {
            accepted = false;
            break;
          }
        }

        if (!accepted) break;
        this.windowReader.conditionalRulesChanged(sourceSheet.id);
      }
    } finally {
      this.wasm.commitSources();
    }

    if (!accepted) throw new Error("snapshot hydration contains invalid persisted sources");
    this.snapshotAuthoritative = true;
    for (const sheet of snapshot.sheets) {
      this.authoritativeSnapshotSheets.add(sheet.id);
      this.view.cellsLoaded(sheet.id);
    }

    if (this.view.hasQueuedHiddenRows()) this.flushHiddenRowsAndCommit();
  }

  beginPageRequest(): void {
    this.pendingPageRequests += 1;
  }

  endPageRequest(): void {
    this.pendingPageRequests -= 1;

    if (this.pendingPageRequests === 0) this.releasePageIdleWaiters();
  }

  /** A memory release waits here; a disposed store has no page load left to wait for. */
  private releasePageIdleWaiters(): void {
    const waiters = this.pageIdleWaiters;
    this.pageIdleWaiters = undefined;
    if (waiters) for (const resolve of waiters) resolve();
  }

  waitForPageLoads(): Promise<void> | undefined {
    if (this.disposed || this.pendingPageRequests === 0) return undefined;

    const { promise, resolve } = Promise.withResolvers<void>();
    this.pageIdleWaiters ??= [];
    this.pageIdleWaiters.push(resolve);

    return promise;
  }

  /** Drop the window reader's rebuildable caches; cell data stays in the engine. */
  trimMemory(): void {
    this.windowReader.trim();
  }

  onMemoryRelease(listener: () => void): () => void {
    this.memoryReleaseListeners.add(listener);
    return () => this.memoryReleaseListeners.delete(listener);
  }

  notifyMemoryRelease(): void {
    for (const listener of this.memoryReleaseListeners) listener();
  }

  /** Build everything before any live store is changed. Commit is synchronous and non-allocating. */
  prepareMemoryRelease(instance: EngineInstance): PreparedEngineMemoryRelease | null {
    if (this.disposed) return null;

    const replacement = instance.CellStore.importMemoryState(this.wasm.exportMemoryState());
    const history: Array<{
      replacement: RangeSnapshot;
      replace(resource: RangeSnapshot): void;
    }> = [];

    try {
      for (const [snapshot, owner] of this.rangeHistory) {
        history.push({
          replacement: replacement.importRangeMemoryState(
            snapshot.resource.exportMemoryState(owner.sheetHandle),
            owner.sheetHandle,
            snapshot.range.start.row,
            snapshot.range.start.col,
          ),
          replace: owner.replace,
        });
      }

      // The JS definitions survive the release; the new instance gets them again.
      // Host functions come first: the pivot pass below can calculate formulas
      // that call them. The registry switches to the replacement only in
      // commit, so an aborted release leaves it on the live store.
      this.hostFunctions?.restore(replacement);
      if (!this.syncRelationships(this.workbook.dataModel, replacement)) {
        throw new Error("Sheetwrite: the replacement engine refused the relationships");
      }
      for (const sheet of this.workbook.sheets) {
        if (sheet.pivots?.length) this.syncPivots(sheet, replacement);
      }
      // Installing definitions marks pivots dirty; finish calculation before the
      // replacement becomes observable, without changing no-pivot transfers.
      if (this.workbook.sheets.some((sheet) => sheet.pivots?.length)) replacement.commitSources();
    } catch (cause) {
      for (const snapshot of history) snapshot.replacement.free();
      replacement.free();
      throw new Error("Sheetwrite: compact history migration failed", { cause });
    }

    return {
      abort: () => {
        for (const snapshot of history) snapshot.replacement.free();
        replacement.free();
      },
      commit: () => {
        const previous = this.wasm;
        this.wasm = replacement;
        this.hostFunctions?.adopt(replacement);
        this.view.replaceEngine(replacement);
        this.windowReader.replaceEngine(replacement);
        this.pagedDirtyPreflight?.replaceEngine(replacement);

        for (const snapshot of history) snapshot.replace(snapshot.replacement);

        previous.free();
      },
    };
  }

  /** Release the WASM-side cell store immediately; the store is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    const committed = this.wasm.wasmCommittedBytes();
    this.committedBytesAfterDispose = committed > 0 ? committed : null;
    this.boundaryAccounting.record("teardown", "js-to-wasm", 0, "scalar");
    for (const history of this.rangeHistory.keys()) history.dispose();
    this.memoryReleaseListeners.clear();
    this.releasePageIdleWaiters();
    this.view.dispose();
    this.windowReader.clear();
    this.styles.clear();
    this.sheets.handles.clear();
    this.authoritativeSnapshotSheets.clear();
    this.wasm.free();
    this.disposed = true;
  }

  /**
   * Ingest one columnar sheet.
   *
   * The source columns arrive column by column, and the store keeps its cells in
   * the same column-major order, so the packed block arrays are filled column by
   * column: cell `(row, col)` sits at `col * rowCount + row`. No row-major
   * `values` copy is built.
   */
  private loadColumnar(sheet: SheetId, data: ColumnarData): void {
    const meta = this.sheets.sheetMeta(sheet);
    const columns = meta.columns;
    const rowCount = Math.min(data.rowCount, meta.rowCount);
    if (rowCount === 0 || columns.length === 0) return;
    const colCount = columns.length;
    const cellCount = rowCount * colCount;
    const kinds = new Uint8Array(cellCount);
    const numbers = new Float64Array(cellCount);
    const wasmStyles = new Uint32Array(cellCount);
    const formulas: Array<[number, string]> = [];
    const refs: Array<[number, CellAddress]> = [];
    const texts: string[] = [];
    for (let col = 0; col < colCount; col++) {
      const column = columns[col]!;
      const source = data.columns[column.key];
      const base = col * rowCount;
      for (let row = 0; row < rowCount; row++) {
        const parsed = columnarScalar(source?.[row], column.type);
        const offset = base + row;
        if (parsed && typeof parsed === "object") {
          if (parsed.kind === "formula") formulas.push([offset, parsed.src]);
          else if (parsed.kind === "ref") refs.push([offset, parsed.target]);
          else writeColumnarValue(kinds, numbers, texts, offset, parsed.value);
        } else {
          writeColumnarValue(kinds, numbers, texts, offset, parsed);
        }
      }
    }

    const referenceTargets = new Uint32Array(refs.length * 3);
    for (let index = 0; index < refs.length; index++) {
      const target = refs[index]![1];
      const targetHandle = this.sheets.handles.get(target.sheet);
      if (targetHandle === undefined || !this.isCellInBounds(target)) {
        throw new Error("columnar import contains invalid persisted sources");
      }

      const packed = index * 3;
      referenceTargets[packed] = targetHandle;
      referenceTargets[packed + 1] = target.row;
      referenceTargets[packed + 2] = target.col;
    }

    let textBytes = 0;
    for (const text of texts) textBytes += text.length;
    const packedText = new PackedTextBuffer(textBytes, texts.length);
    for (const text of texts) packedText.add(text);

    this.noteRangeMutationFfi(cellCount);
    const applied = this.wasm.setColumnBlockPacked(
      this.sheets.handleOf(sheet),
      0,
      0,
      rowCount,
      colCount,
      kinds,
      numbers,
      packedText.packedBytes(),
      packedText.offsets,
      wasmStyles,
      Uint32Array.from(formulas, ([offset]) => offset),
      formulas.map(([, source]) => source),
      Uint32Array.from(refs, ([offset]) => offset),
      referenceTargets,
    );
    if (applied !== 0) {
      throw new Error("columnar import contains invalid persisted sources");
    }

    this.noteRangeMutationFfi();
    this.wasm.commitSources();
    this.noteRangeMutationFfi();
    this.wasm.compactStringStorage();
  }
}

/**
 * Write the wire kind and number payload of one scalar at `offset`. An empty
 * value leaves the slot at KIND_EMPTY; the caller stores string text in its
 * own text buffer.
 */
function writeScalarWire(
  kinds: Uint8Array,
  numbers: Float64Array,
  offset: number,
  value: CellScalar | undefined,
): void {
  if (typeof value === "number") {
    kinds[offset] = KIND_NUMBER;
    numbers[offset] = value;
  } else if (typeof value === "boolean") {
    kinds[offset] = KIND_BOOL;
    numbers[offset] = value ? 1 : 0;
  } else if (typeof value === "string") {
    kinds[offset] = KIND_STRING;
  }
}

/** Write one columnar source scalar into the column-major block arrays. */
function writeColumnarValue(
  kinds: Uint8Array,
  numbers: Float64Array,
  texts: string[],
  offset: number,
  value: CellScalar | undefined,
): void {
  writeScalarWire(kinds, numbers, offset, value);
  if (typeof value === "string") texts.push(value);
}

function resolvedScalar(kind: number, num: number, text: string | null): CellScalar {
  if (kind === KIND_NUMBER || kind === KIND_FORMULA) return num;
  if (kind === KIND_BOOL) return num !== 0;
  if (kind === KIND_STRING) return text;
  return null;
}

/** Read one batched cell snapshot into resolved cells, then release WASM memory. */
function consumeCellSnapshots(
  snapshot: CellSnapshot | undefined,
  styleOf: (styleId: number) => CellStyle,
): ResolvedCell[] {
  if (!snapshot) throw new Error("Sheetwrite: cell snapshot batch has mismatched coordinates");
  try {
    const { kinds, numbers, styles, textIndex, strings } = snapshot;
    const cells = new Array<ResolvedCell>(kinds.length);
    for (const [index, kind] of kinds.entries()) {
      const slot = textIndex[index] ?? -1;
      cells[index] = {
        resolved: resolvedScalar(
          kind,
          numbers[index] ?? 0,
          slot < 0 ? null : (strings[slot] ?? null),
        ),
        style: styleOf(styles[index] ?? 0),
      };
    }
    return cells;
  } finally {
    snapshot.free();
  }
}

/** Whether a data cell is the `{ value, style }` form rather than a bare value. */
function isStyledDataCell(
  value: DataCell | undefined,
): value is { value: CellValue; style?: CellStyle } {
  return value !== null && typeof value === "object" && !("kind" in value) && "value" in value;
}

function dataCellValue(value: DataCell | undefined): CellScalar | CellValue | undefined {
  return isStyledDataCell(value) ? value.value : value;
}

function columnarScalar(
  value: CellScalar | CellValue | undefined,
  type: CellFormat,
): CellScalar | CellValue | undefined {
  const unwrapped = dataCellValue(value);
  if (unwrapped && typeof unwrapped === "object" && unwrapped.kind === "literal") {
    return columnarScalar(unwrapped.value, type);
  }
  return typeof unwrapped === "string" ? parseCellLiteralInput(unwrapped, type) : unwrapped;
}
