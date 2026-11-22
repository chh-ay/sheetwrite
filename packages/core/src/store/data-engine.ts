import type { CellSnapshot, EngineInstance, RangeSnapshot } from "@sheetwrite/wasm";

import { type FormulaAxisEdit, remapFormulaA1Refs } from "../a1.js";
import { parseCellLiteralInput } from "../cell-input.js";
import {
  assertWorkbookCharts,
  type ChartAxisEdit,
  chartFitsSheets,
  invalidateChartSheet,
  mapChartSources,
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
  cloneRelationships,
  validateRelationshipAdmission,
  withoutRelationship,
  withRelationship,
} from "../data-model.js";
import { dateToSerial } from "../date-serial.js";
import {
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  isValidCalculationSettings,
  type SnapshotResourceLimits,
  storedCalculationSettings,
} from "../document-protocol.js";
import { ENGINE_LOAD_HINT, getEngine, isEngineLoaded as isLoaded } from "../engine.js";
import {
  datasourceFailure,
  SheetwriteError,
  type SheetwriteErrorCode,
  type SheetwriteErrorContext,
} from "../errors.js";
import {
  installExternalLinks,
  removeExternalLinks,
  replaceExternalLinks,
} from "../external-link.js";
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
import { cloneColumnFilter, cloneJsonValue } from "../plain-data.js";
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
import { operationAcceptsSheetName, validateSheetName } from "../sheet-name.js";
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
import { mapValidationFormulas, type ValidationReads } from "../validation-rule.js";
import {
  assertWorkbookTables,
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  remapWorkbookTableRuleColumns,
  validWorkbookTable,
  workbookTableNameKey,
} from "../workbook-table.js";
import { decodePreview, type FormulaPreview, PREVIEW_FIELDS } from "./formula-preview-result.js";
import {
  cellBlockMove,
  type CellBlockMove,
  moveCellRange,
  type MoveCellsOperation,
  movedConditionalFormats,
  movedHyperlinks,
  movedMerges,
  movedNotes,
  type MovedSheetItems,
  movedValidationRules,
} from "./move-cells.js";
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
  MAX_VALIDATION_RULES,
  mergeCrossesFreeze,
  mergesOverlap,
  movedCellBounds,
  moveRemap,
  normalizedRange,
  normalizeMerge,
  patchSheetId,
  pivotWrittenRange,
  positiveCount,
  rangesIntersect,
  rebaseRangeAxis,
  rebaseMovedRange,
  rebaseRangeItems,
  rebaseRangeSpan,
  rebaseSheetAutoFilter,
  remapSpan,
  type SheetAxis,
  sameMerge,
  staysWholeAfterMove,
  uniqueColumnKeys,
  validAutoFilter,
  validMerge,
  validProtectedRanges,
  validSortAndFilters,
  validValidationRules,
  visibleSheetNeighbor,
} from "./ranges.js";
import { SheetRegistry } from "./sheet-registry.js";
import { StoreSnapshotCodec } from "./snapshot-codec.js";
import { type StoreValidationReads, storeValidationReads } from "./validation-reads.js";
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

/** The snapshot limits the engine applies to dense and local sheets. */
type StorageLimits = Pick<SnapshotResourceLimits, "maxDenseCells" | "maxLocalPagedCells">;

/** Shared report of a commit that recalculated nothing; never written. */
const EMPTY_RECALCULATION = new Uint32Array(0);

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
function relationship_status_of(record: Uint32Array): RelationshipStatus {
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

/** Allocation counters of a store's range edits, for tests and benchmarks; `getRangeMutationAllocationStats` returns them. */
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
  /** Decides which protected cells a local edit may change; servers must still check every edit. */
  protectionResolver?: ProtectionResolver;
  /** What happens to a transaction with denied operations: `atomic` (default) rejects it, `partial` skips them. */
  mutationPolicy?: MutationPolicyMode;
}

function rebase_hyperlink_axis(
  hyperlink: CellHyperlink,
  edited_sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): CellHyperlink | null {
  const rebase_range = (range: Range): Range | null =>
    range.sheet === edited_sheet ? rebaseRangeSpan(range, axis, remap) : range;

  const range = rebase_range(hyperlink.range);
  if (!range) return null;
  if (hyperlink.target.kind === "external") {
    return range === hyperlink.range ? hyperlink : { ...hyperlink, range };
  }

  const target_range = rebase_range(hyperlink.target.range);
  if (!target_range) return null;
  return {
    ...hyperlink,
    range,
    target:
      target_range === hyperlink.target.range
        ? hyperlink.target
        : { kind: "internal", range: target_range },
  };
}
/** A copy of `items` with `item` at `index`, or appended when `index` is negative. */
function with_entry<T>(items: readonly T[], index: number, item: T): T[] {
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
function upsert_where<T>(items: readonly T[], item: T, matches: (existing: T) => boolean): T[] {
  return with_entry(items, items.findIndex(matches), item);
}

/** `upsert_where` keyed by `id`; null when an append would pass `maxEntries`. */
function upsertById<T extends { readonly id: string }>(items: readonly T[], item: T): T[];
function upsertById<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
  maxEntries: number,
): T[] | null;
function upsertById<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
  max_entries = Number.POSITIVE_INFINITY,
): T[] | null {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index < 0 && items.length >= max_entries) return null;

  return with_entry(items, index, item);
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

/**
 * The rows or columns a move changes: the moved block and the indexes it
 * passes over, across the whole sheet.
 */
function moved_span_range(
  sheet: Sheet,
  patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
  axis: SheetAxis,
): Range {
  const first = Math.min(patch.from, patch.to);
  const last = Math.max(patch.from, patch.to) + patch.count - 1;
  return axis === "row"
    ? {
        sheet: patch.sheet,
        start: { row: first, col: 0 },
        end: { row: last, col: sheet.columns.length - 1 },
      }
    : {
        sheet: patch.sheet,
        start: { row: 0, col: first },
        end: { row: sheet.rowCount - 1, col: last },
      };
}

/** Row heights, hidden rows and row groups after a row insert or delete. */
function rebase_row_meta(meta: Sheet, remap: (row: number) => number | null): void {
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

function rebase_merge_axis(
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
function frozen_count_after(count: number, remap: (index: number) => number | null): number {
  const boundary = remapSpan(0, count - 1, remap);
  return boundary ? boundary[1] + 1 : 0;
}

/** Notes on `sheet` moved along `axis`; a note whose cell is removed is dropped. */
function rebase_notes(
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

/** Hyperlinks rebased with `rebase_hyperlink_axis`, dropping the removed ones. */
function rebase_hyperlinks(
  hyperlinks: readonly CellHyperlink[],
  sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): CellHyperlink[] {
  return hyperlinks
    .map((hyperlink) => rebase_hyperlink_axis(hyperlink, sheet, axis, remap))
    .filter((hyperlink): hyperlink is CellHyperlink => hyperlink !== null);
}

/**
 * Carry the conditional formats of `edited_sheet` through a row or column
 * edit: each range moves with `remap` and each formula rule's references
 * follow `formula_edit`. A rule whose range is removed is dropped.
 */
function rebase_conditional_formats(
  rules: readonly ConditionalFormatRule[],
  edited_sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
  formula_edit: FormulaAxisEdit,
): ConditionalFormatRule[] {
  const rebased: ConditionalFormatRule[] = [];
  for (const rule of rules) {
    if (rule.range.sheet !== edited_sheet) {
      rebased.push(rule);
      continue;
    }

    const range = rebaseRangeSpan(rule.range, axis, remap);
    if (!range) continue;

    const when =
      rule.when.kind === "formula"
        ? { ...rule.when, source: remapFormulaA1Refs(rule.when.source, axis, formula_edit) }
        : rule.when;
    rebased.push({ ...rule, range, when });
  }
  return rebased;
}

/**
 * Validation rules after a row or column edit on `edited_sheet`: their ranges
 * follow it, and so do the references of their formulas.
 */
function rebase_validation_rules(
  rules: readonly DataValidationRule[],
  edited_sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
  formula_edit: FormulaAxisEdit,
): DataValidationRule[] {
  return rebaseRangeItems(rules, edited_sheet, axis, remap).map((rule) =>
    rule.range.sheet === edited_sheet
      ? {
          ...rule,
          condition: mapValidationFormulas(rule.condition, (formula) =>
            remapFormulaA1Refs(formula, axis, formula_edit),
          ),
        }
      : rule,
  );
}

/** A store failure caused by the workbook, options or call the host gave. */
function store_failure(
  code: SheetwriteErrorCode,
  message: string,
  context?: SheetwriteErrorContext,
): SheetwriteError {
  return new SheetwriteError(code, "store", message, context === undefined ? {} : { context });
}

/** Error thrown when an operation requires datasource cells that are not loaded. */
export class IncompleteDataError extends SheetwriteError {
  /** Always `"IncompleteDataError"`. */
  override readonly name = "IncompleteDataError";
  /** Always `"incomplete-data"`. */
  declare readonly code: "incomplete-data";
  /** How many of the sheet's cells are loaded, out of the total. */
  readonly capability: Extract<QueryCapability, { status: "incomplete" }>;

  /** Creates the error for a query on `sheet`, which has unloaded cells. */
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

function literal_of(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

/** Shared empty style; keeps change capture from allocating a style per cell. */
const EMPTY_STYLE: CellStyle = {};
const TEXT_ENCODER = new TextEncoder();
/** Worst-case UTF-8 bytes of one UTF-16 code unit. */
const MAX_UTF8_BYTES_PER_CODE_UNIT = 3;
/** Strings joined per `encodeInto` call, which bounds the temporary joined string. */
const TEXT_PACK_CHUNK = 65_536;
const NON_ASCII = /[^\0-\x7f]/;

/**
 * Cell strings of one block packed into a single UTF-8 buffer.
 *
 * Text crosses into WASM once per block instead of once per cell: `bytes`
 * holds every string after the previous one and `offsets` records the byte
 * boundary of every string, so the native side slices the buffer and never
 * re-encodes. `texts` must be in the flat input order of their cells:
 * row-major for document blocks and column-major for columnar imports.
 */
function pack_texts(texts: readonly string[]): { bytes: Uint8Array; offsets: Uint32Array } {
  // Start of each string, plus the packed length as the final entry.
  const offsets = new Uint32Array(texts.length + 1);
  let bytes = new Uint8Array(0);
  let written = 0;
  for (let start = 0; start < texts.length; start += TEXT_PACK_CHUNK) {
    const end = Math.min(texts.length, start + TEXT_PACK_CHUNK);
    // One encode per chunk: ASCII strings take one byte per code unit, so the
    // offsets follow from their lengths.
    const joined = texts.slice(start, end).join("");
    const ascii = !NON_ASCII.test(joined);
    const required = written + joined.length * (ascii ? 1 : MAX_UTF8_BYTES_PER_CODE_UNIT);
    if (required > bytes.length) {
      const grown = new Uint8Array(Math.max(required, bytes.length * 2));
      grown.set(bytes.subarray(0, written));
      bytes = grown;
    }

    if (ascii) {
      for (let index = start; index < end; index++) {
        offsets[index] = written;
        written += (texts[index] ?? "").length;
      }
      TEXT_ENCODER.encodeInto(joined, bytes.subarray(offsets[start] ?? 0, written));
      continue;
    }

    for (let index = start; index < end; index++) {
      offsets[index] = written;
      written += TEXT_ENCODER.encodeInto(texts[index] ?? "", bytes.subarray(written)).written;
    }
  }
  offsets[texts.length] = written;
  return { bytes: bytes.subarray(0, written), offsets };
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
  private readonly storage_options: SheetwriteStoreOptions;
  /** Sheets and engine handles, shared with the store parts and the public store. */
  readonly sheets: SheetRegistry;
  private readonly styles = new StyleDictionary();
  private readonly sheet_ids_by_handle: SheetId[] = [];
  private readonly view: StoreViewState;
  private readonly window_reader: StoreWindowReader;
  private readonly snapshot_codec: StoreSnapshotCodec;
  private readonly paged_dirty_preflight: PagedDirtyPreflight | null;
  private readonly boundary_accounting = new BoundaryResourceAccounting();
  private resource_operation: RuntimeResourceOperation | null = "startup";
  private disposed = false;
  private committed_bytes_after_dispose: number | null = null;
  private readonly spill_blockers_dirty = new Set<SheetId>();
  /** Sheets whose pivots must be sent to the engine before the mutation commits. */
  private readonly pivot_sheets_dirty = new Set<SheetId>();
  /**
   * The definitions the engine computes for a sheet's pivots, when they
   * differ from the saved ones. The dashboard chunk sets it to add slicer
   * filters, so first paint carries only this slot.
   */
  private pivot_view: ((sheet: Sheet) => PivotDefinition[] | undefined) | null = null;

  private readonly range_history = new Map<
    CompactRangeHistory,
    { sheetHandle: number; replace(resource: RangeSnapshot): void }
  >();

  private pending_page_requests = 0;

  private page_idle_waiters: Array<() => void> | undefined;

  private readonly memory_release_listeners = new Set<() => void>();
  private chart_recalculation_tracked = false;
  /** Rectangles the last engine commit reported; -1 asks for a conservative refresh. */
  private recalculated_rect_count = -1;
  /** Epoch of the commit whose report {@link chart_recalculation} holds. */
  private chart_recalculation_epoch: number | undefined;
  /** That commit's rectangles; null when it must refresh conservatively. */
  private chart_recalculation: Uint32Array | null = null;

  /** Hooks of `@sheetwrite/core/functions`; `undefined` until a host function is registered. */
  hostFunctions: HostFunctionHooks | undefined;

  /** Paged sheets hydrated from a snapshot treat omitted cells as known empty. */
  private readonly authoritative_snapshot_sheets = new Set<SheetId>();
  private snapshot_authoritative = false;

  private readonly range_mutation_stats = {
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

  /**
   * `storageLimits` are the store's resolved snapshot limits; the engine
   * places and refuses dense and local sheets with them, as snapshot
   * validation and `SheetGrowth` do.
   */
  constructor(
    workbook: Workbook,
    data?: ColumnarData,
    options: SheetwriteStoreOptions = {},
    storageLimits: Readonly<StorageLimits> = DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  ) {
    if (!isLoaded()) {
      throw store_failure(
        "initialization-required",
        `Sheetwrite: await initSheetwrite() before constructing SheetwriteStore. ${ENGINE_LOAD_HINT}`,
      );
    }

    if (
      options.referenceSimulationLimit !== undefined &&
      (!Number.isSafeInteger(options.referenceSimulationLimit) ||
        options.referenceSimulationLimit <= 0)
    ) {
      throw store_failure(
        "invalid-argument",
        "Sheetwrite: referenceSimulationLimit must be a positive safe integer",
      );
    }

    if (data && options.storage === "paged") {
      throw store_failure("invalid-argument", "Sheetwrite: ColumnarData requires dense storage");
    }

    // The store checked the tables already, in `assertWorkbookAllocationLimits`.
    assertWorkbookCharts(workbook.sheets);

    this.workbook = workbook;
    this.sheets = new SheetRegistry(workbook);
    this.storage_options = options;
    this.wasm = new (getEngine().CellStore)();
    // A new engine starts with the default limits, the engine's ceilings.
    if (
      storageLimits.maxDenseCells !== DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells ||
      storageLimits.maxLocalPagedCells !== DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxLocalPagedCells
    ) {
      this.wasm.setStorageLimits(storageLimits.maxDenseCells, storageLimits.maxLocalPagedCells);
      this.boundary_accounting.record("startup", "js-to-wasm", 0, "scalar");
    }
    this.view = new StoreViewState(this.wasm, this.sheets);
    this.window_reader = new StoreWindowReader(this.wasm, this.sheets, this.styles);
    this.snapshot_codec = new StoreSnapshotCodec(
      workbook,
      this.window_reader,
      this.sheet_ids_by_handle,
    );
    this.paged_dirty_preflight =
      options.storage === "paged"
        ? new PagedDirtyPreflight(
            this.wasm,
            this.sheets,
            this.sheet_ids_by_handle,
            this.range_mutation_stats,
            this.boundary_accounting,
            options.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT,
            options.referenceSimulationLimit ?? MAX_PAGED_REFERENCE_SIMULATION_ENTRIES,
          )
        : null;

    for (const sheet of workbook.sheets) {
      const handle = this.allocate_sheet(sheet.columns.length, sheet.rowCount);
      this.boundary_accounting.record(
        this.resource_operation ?? "startup",
        "js-to-wasm",
        (sheet.id.length + sheet.name.length) * 2,
        "scalar",
      );
      if (!this.wasm.setSheetName(handle, sheet.id, sheet.name)) {
        this.wasm.free();
        throw store_failure("invalid-snapshot", `invalid sheet name: ${sheet.name}`, {
          sheet: sheet.id,
        });
      }

      this.sheets.handles.set(sheet.id, handle);
      this.sheet_ids_by_handle[handle] = sheet.id;
      if (
        (sheet.merges?.length ?? 0) > 0 ||
        (sheet.protectedRanges?.length ?? 0) > 0 ||
        (sheet.validationRules?.length ?? 0) > 0
      )
        this.sync_spill_blockers(sheet);
      if ((sheet.hiddenRows?.size ?? 0) > 0 || sheet.rowGroups?.some((group) => group.collapsed))
        this.view.queueHiddenRows(sheet.id);
    }

    // Before any formula is loaded, so formulas find the links they read.
    if (!installExternalLinks(this.wasm, workbook.externalLinks ?? [])) {
      this.wasm.free();
      throw store_failure("invalid-snapshot", "invalid external link values");
    }

    // Before any formula is loaded, so SUBTOTAL computes once with the saved hidden rows.
    this.view.flushHiddenRows();
    for (const sheet of workbook.sheets) {
      for (const table of sheet.tables ?? []) {
        if (!this.sync_table(table)) {
          this.wasm.free();
          throw store_failure("invalid-snapshot", `invalid workbook table: ${table.id}`, {
            table: table.id,
          });
        }
      }
    }

    for (const named_range of workbook.namedRanges ?? []) {
      if (!this.sync_named_range(named_range)) {
        this.wasm.free();
        throw store_failure("invalid-snapshot", `invalid named range: ${named_range.name}`, {
          name: named_range.name,
        });
      }
    }

    // A new engine holds no relationships or measures.
    const model = workbook.dataModel;
    if (
      ((model?.relationships?.length ?? 0) > 0 || (model?.measures?.length ?? 0) > 0) &&
      !this.sync_relationships(model)
    ) {
      this.wasm.free();
      throw store_failure("invalid-snapshot", "invalid data model");
    }

    this.load_pivots();

    // Before any cell is loaded, so formulas compute once under the stored limits.
    // Defaults need no engine call and are dropped to keep snapshots unchanged.
    const calculation = storedCalculationSettings(workbook.calculation);
    if (calculation === undefined) delete workbook.calculation;
    else if (this.sync_calculation(calculation)) workbook.calculation = calculation;
    else {
      this.wasm.free();
      throw store_failure("invalid-snapshot", "invalid calculation settings");
    }

    if (data) {
      this.withResourceOperation("ingest", () => this.load_columnar(workbook.activeSheet, data));
    } else if (workbook.sheets.some((sheet) => sheet.pivots?.length)) {
      this.commit_engine_sources();
    }

    // After the cells, because filters and sort keys read cell values.
    for (const sheet of workbook.sheets) this.view.sheetLoaded(sheet.id);
    if (this.view.hasQueuedHiddenRows()) this.flush_hidden_rows_and_commit();

    this.resource_operation = null;
  }

  /** Internal allocation counters for deterministic range-mutation gates. */
  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return {
      ...this.range_mutation_stats,
      styleDictionaryEntries: this.styles.table.length,
    };
  }

  resetRangeMutationAllocationStats(): void {
    for (const key of Object.keys(this.range_mutation_stats) as Array<
      keyof typeof this.range_mutation_stats
    >) {
      this.range_mutation_stats[key] = 0;
    }
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    let wasm: StoreMemoryBreakdown;
    if (this.disposed) {
      wasm = emptyStoreMemoryStats(this.committed_bytes_after_dispose);
    } else {
      const committed = this.wasm.wasmCommittedBytes();
      wasm = decodeStoreMemoryStats(this.wasm.memoryStats(), committed > 0 ? committed : null);
    }
    return createRuntimeResourceSnapshot({
      operation,
      phase,
      wasm,
      jsOwners: this.disposed ? [] : this.resource_owners(),
      boundary: this.boundary_accounting.snapshot(),
      runtime,
    });
  }

  resetRuntimeResourceAccounting(): void {
    this.boundary_accounting.reset();
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
    const previous = this.resource_operation;
    this.resource_operation = operation;
    try {
      return run();
    } finally {
      this.resource_operation = previous;
    }
  }

  private resource_owners(): ResourceOwnerBytes[] {
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
      ...this.window_reader.resourceOwners(),
    ];
  }

  private record_window_boundary(
    window: VisibleWindowView,
    fallback_operation: RuntimeResourceOperation,
  ): void {
    const operation = this.resource_operation ?? fallback_operation;
    const calls = window.ffiBoundaryCalls ?? window.ffiCalls ?? 0;
    const largest = window.ffiLargestTransferBytes ?? 0;
    this.boundary_accounting.record(
      operation,
      "js-to-wasm",
      window.ffiInputBytes ?? 0,
      "bulk",
      calls,
      largest,
    );
    this.boundary_accounting.record(
      operation,
      "wasm-to-js",
      window.ffiOutputBytes ?? 0,
      "bulk",
      0,
      largest,
    );
  }

  private note_range_mutation_ffi(transferred_array_length = 0, transferred_bytes?: number): void {
    this.range_mutation_stats.ffiCalls += 1;
    this.range_mutation_stats.maxTransferredArrayLength = Math.max(
      this.range_mutation_stats.maxTransferredArrayLength,
      transferred_array_length,
    );
    const bytes = transferred_bytes ?? transferred_array_length * Uint32Array.BYTES_PER_ELEMENT;
    this.boundary_accounting.record(
      this.resource_operation ?? "edit",
      "js-to-wasm",
      bytes,
      transferred_array_length > 0 ? "bulk" : "scalar",
    );
  }

  private sync_spill_blockers(sheet: Sheet): void {
    const bounds: number[] = [];
    for (const merge of sheet.merges ?? []) {
      bounds.push(merge.r0, merge.c0, merge.r1, merge.c1);
    }
    for (const protected_range of sheet.protectedRanges ?? []) {
      const range = normalizedRange(protected_range.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    for (const validation_rule of sheet.validationRules ?? []) {
      const range = normalizedRange(validation_rule.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    if (!this.wasm.setSpillBlockers(this.sheets.handleOf(sheet.id), Uint32Array.from(bounds))) {
      throw store_failure(
        "resource-limit",
        `spill blocker resource limit exceeded for sheet: ${sheet.id}`,
        { sheet: sheet.id },
      );
    }
  }

  private flush_spill_blockers(): void {
    for (const sheet_id of this.spill_blockers_dirty) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheet_id);
      if (sheet) this.sync_spill_blockers(sheet);
    }
    this.spill_blockers_dirty.clear();
  }

  /** Validate every loaded pivot against the whole workbook, then install them. */
  private load_pivots(): void {
    const ids = new Set<string>();
    for (const sheet of this.workbook.sheets) {
      for (const [index, pivot] of (sheet.pivots ?? []).entries()) {
        const issues = this.pivot_issues(pivot, sheet, this.workbook.sheets);
        if (ids.has(pivot.id) || ids.size >= MAX_PIVOTS_PER_WORKBOOK || issues.length > 0) {
          this.wasm.free();
          const reason = issues[0]?.message ?? "Pivot IDs must be unique within the limit";
          throw store_failure(
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
      if (sheet.pivots?.length) this.sync_pivots(sheet);
    }
  }

  private pivot_issues(pivot: unknown, owner: Sheet, sheets: readonly Sheet[]): PivotIssue[] {
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
  private sync_pivots(sheet: Sheet, wasm: RecomputingCellStore = this.wasm): void {
    const pivots = sheet.pivots ?? [];
    if (!wasm.setPivots) {
      if (!wasm.setSavedPivots) {
        if (pivots.some((pivot) => pivot.savedOutput !== undefined)) {
          throw new Error("Engine cannot install saved pivot output");
        }

        return;
      }

      const saved = encodeSavedPivotPayload(pivots);
      this.boundary_accounting.record(
        this.resource_operation ?? "edit",
        "js-to-wasm",
        saved.layout.byteLength +
          saved.kinds.byteLength +
          saved.numbers.byteLength +
          saved.textLengths.byteLength,
        "bulk",
      );
      const handle = this.sheets.handleOf(sheet.id);
      const { layout, kinds, numbers, text, textLengths: text_lengths } = saved;
      if (!wasm.setSavedPivots(handle, layout, kinds, numbers, text, text_lengths)) {
        throw store_failure(
          "resource-limit",
          `saved pivot payload rejected for sheet: ${sheet.id}`,
          {
            sheet: sheet.id,
          },
        );
      }

      return;
    }

    const payload = encodePivotPayload(this.pivot_view?.(sheet) ?? pivots, (id) =>
      this.sheets.handles.get(id),
    );
    this.boundary_accounting.record(
      this.resource_operation ?? "edit",
      "js-to-wasm",
      payload.numbers.byteLength,
      "bulk",
    );
    if (!wasm.setPivots(this.sheets.handleOf(sheet.id), payload.numbers, payload.strings)) {
      throw store_failure("resource-limit", `pivot payload rejected for sheet: ${sheet.id}`, {
        sheet: sheet.id,
      });
    }
  }

  /** Whether `dispose` freed the WASM store; a lazy load that finishes later must not call it. */
  get isDisposed(): boolean {
    return this.disposed;
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
    this.pivot_view = view;
    this.wasm.beginMutation();
    try {
      for (const id of sheets) this.pivot_sheets_dirty.add(id);
      this.flush_pivots();
    } finally {
      this.commit_engine_sources();
    }
  }

  /** Runs inside the mutation, so the engine renders pivots at the commit barrier. */
  private flush_pivots(): void {
    for (const sheet_id of this.pivot_sheets_dirty) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheet_id);
      if (sheet) this.sync_pivots(sheet);
    }
    this.pivot_sheets_dirty.clear();
  }

  private admits_source_range(range: Range): boolean {
    const bounds = normalizedRange(range);
    return this.wasm.admitSourceRange(
      this.sheets.handleOf(bounds.sheet),
      bounds.start.row,
      bounds.start.col,
      bounds.end.row,
      bounds.end.col,
    );
  }

  private capture_source_projection(
    sheet: SheetId,
    row_start: number,
    col_start: number,
    rows: number,
    cols: number,
  ): RangeSourceProjection | null {
    this.note_range_mutation_ffi();
    const snapshot = this.wasm.captureSources(
      this.sheets.handleOf(sheet),
      row_start,
      col_start,
      rows,
      cols,
    );
    return snapshot ? consumeSourceSnapshot(snapshot, this.sheet_ids_by_handle) : null;
  }

  private named_range_scope(scope: SheetId | undefined): number {
    return scope === undefined ? -1 : this.sheets.handleOf(scope);
  }

  /**
   * Sends every relationship and measure of `model` to an engine that
   * computes model pivots. A measure travels as a relationship record with
   * an empty one-side table: `[id, homeTable, formula, "", name]`. Returns
   * false when the engine refuses them; an engine without the call keeps
   * them only in the workbook.
   */
  private sync_relationships(
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

  /**
   * `model` with each `[table, column, to]` rename applied to every measure
   * formula, as Excel updates the formulas that name a renamed table,
   * column or measure; see `renameStructuredReference`. A rename to the same
   * name is skipped. Returns `model` itself when no formula changes.
   */
  private with_renames(
    model: DataModel | undefined,
    renames: [table: string, column: string, to: string][],
  ): DataModel | undefined {
    let changed = false;
    const measures = (model?.measures ?? []).map((measure) => {
      let formula = measure.formula;
      for (const [table, column, to] of renames) {
        if ((column || table) === to) continue;
        formula = getEngine().renameStructuredReference(formula, table, column, to);
      }
      changed ||= formula !== measure.formula;
      return { ...measure, formula };
    });
    return changed ? { relationships: cloneRelationships(model), measures } : model;
  }

  private sync_table(table: WorkbookTable): boolean {
    const range = normalizedRange(table.range);
    const text_bytes =
      (table.id.length +
        table.name.length +
        table.columns.reduce((total, column) => total + column.id.length + column.name.length, 0)) *
      2;
    this.boundary_accounting.record(
      this.resource_operation ?? "edit",
      "js-to-wasm",
      text_bytes,
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

  private inserted_table_columns(
    table: WorkbookTable,
    columns: readonly Column[],
  ): WorkbookTableColumn[] {
    const ids = new Set(table.columns.map((column) => workbookTableNameKey(column.id)));
    const names = new Set(table.columns.map((column) => workbookTableNameKey(column.name)));
    return columns.map((column, index) => {
      const fallback = `Column${table.columns.length + index + 1}`;
      const raw_id = (column.key || fallback).normalize("NFC");
      let id = raw_id.slice(0, DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxIdLength);
      for (let suffix = 2; ids.has(workbookTableNameKey(id)); suffix++) {
        const marker = `_${suffix}`;
        id = `${raw_id.slice(
          0,
          DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxIdLength - marker.length,
        )}${marker}`;
      }

      ids.add(workbookTableNameKey(id));
      const normalized_header = (column.header || fallback).normalize("NFC");
      const raw_name =
        /[[\],]/u.test(normalized_header) ||
        normalized_header.startsWith("@") ||
        normalized_header.startsWith("#")
          ? fallback
          : normalized_header;
      let name = raw_name.slice(0, DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxNameLength);
      for (let suffix = 2; names.has(workbookTableNameKey(name)); suffix++) {
        const marker = `_${suffix}`;
        name = `${raw_name.slice(
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
  private sync_calculation(calculation: CalculationSettings): boolean {
    if (!isValidCalculationSettings(calculation)) return false;

    return this.wasm.setIterativeCalculation(
      calculation.iterate,
      calculation.maxIterations,
      calculation.maxChange,
    );
  }

  private sync_named_range(named_range: NamedRangeSnapshot): boolean {
    const scope = this.named_range_scope(named_range.scope);
    if (named_range.range === undefined) {
      this.boundary_accounting.record(
        this.resource_operation ?? "edit",
        "js-to-wasm",
        (named_range.name.length + named_range.formula.length) * 2,
        "scalar",
      );
      return this.wasm.setNamedFormula(named_range.name, scope, named_range.formula);
    }

    const range = normalizedRange(named_range.range);
    this.boundary_accounting.record(
      this.resource_operation ?? "edit",
      "js-to-wasm",
      named_range.name.length * 2,
      "scalar",
    );
    return this.wasm.setNamedRange(
      named_range.name,
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
  private refresh_named_formulas(): void {
    const named_ranges = this.workbook.namedRanges;
    if (!named_ranges?.some((named_range) => named_range.formula !== undefined)) return;

    this.workbook.namedRanges = named_ranges.map((named_range) => {
      if (named_range.formula === undefined) return named_range;
      const formula = this.wasm.namedFormulaSource(
        named_range.name,
        this.named_range_scope(named_range.scope),
      );
      return formula === undefined || formula === named_range.formula
        ? named_range
        : { ...named_range, formula };
    });
  }

  /** The result `text` would have in `cell`, read without changing the store. */
  previewFormula(cell: CellAddress, text: string): FormulaPreview {
    const fields = new Float64Array(PREVIEW_FIELDS);
    const target = Uint32Array.of(this.sheets.handleOf(cell.sheet), cell.row, cell.col);
    const result = this.wasm.previewFormula(target, text, fields);
    return decodePreview(fields, result);
  }

  /**
   * As {@link previewFormula}, as if `cell` held `trial`: the formulas that
   * read the cell see `trial`, and the cell keeps its content. A data
   * validation custom formula checks a typed value with it before it is stored.
   */
  previewFormulaWith(cell: CellAddress, text: string, trial: CellScalar): FormulaPreview {
    const fields = new Float64Array(PREVIEW_FIELDS);
    const target = Uint32Array.of(this.sheets.handleOf(cell.sheet), cell.row, cell.col);
    const result = this.wasm.previewFormulaWith(
      target,
      text,
      trial_kind(trial),
      typeof trial === "number" ? trial : trial === true ? 1 : 0,
      typeof trial === "string" ? trial : "",
      fields,
    );
    return decodePreview(fields, result);
  }

  private validation_reads_cache: StoreValidationReads | undefined;

  /** What data validation rules read from this store: formula results and list sources. */
  get validationReads(): ValidationReads {
    this.validation_reads_cache ??= storeValidationReads({
      workbook: () => this.workbook,
      // One window read of a list's source, kept out of the scroll counts.
      values: (sheet, rows, cols) =>
        this.window_reader.read(sheet, rows, cols, undefined, false).values,
      previewFormula: (cell, text) => this.previewFormula(cell, text),
      previewFormulaWith: (cell, text, trial) => this.previewFormulaWith(cell, text, trial),
    });
    return this.validation_reads_cache;
  }

  private same_named_range(
    named_range: NamedRangeSnapshot,
    name: string,
    scope: SheetId | undefined,
  ): boolean {
    return formulaNameKey(named_range.name) === formulaNameKey(name) && named_range.scope === scope;
  }

  private allocate_sheet(columns: number, rows: number): number {
    const handle =
      this.storage_options.storage === "paged"
        ? this.wasm.addPagedSheet(
            columns,
            rows,
            this.storage_options.chunkRows ?? DEFAULT_PAGED_CHUNK_ROWS,
            this.storage_options.cacheBytes ?? DEFAULT_PAGED_CACHE_BYTES,
            this.storage_options.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT,
          )
        : this.wasm.addSheet(columns, rows);
    this.boundary_accounting.record(this.resource_operation ?? "edit", "js-to-wasm", 0, "scalar");
    return handle;
  }

  isPaged(sheet: SheetId): boolean {
    return this.wasm.isPaged(this.sheets.handleOf(sheet));
  }

  /** Whether the engine keeps a dense sheet past `maxDenseCells` in local pages. */
  isLocalPaged(sheet: SheetId): boolean {
    return this.wasm.isLocalPaged(this.sheets.handleOf(sheet));
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
    if (
      !this.isPaged(sheet) ||
      stats.fullyLoaded ||
      this.authoritative_snapshot_sheets.has(sheet)
    ) {
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

  /** Clean-chunk cache budget of each paged sheet, in bytes. */
  pagedCacheBytes(): number {
    return this.storage_options.cacheBytes ?? DEFAULT_PAGED_CACHE_BYTES;
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
    if (patch.op === "moveCells") {
      return movedCellBounds(patch).every((range) => this.block_loaded(range));
    }
    const sheet = patchSheetId(patch);
    if (sheet === null || !this.sheets.handles.has(sheet) || !this.isPaged(sheet)) return true;
    if (
      patch.op === "setSheetMeta" &&
      ((patch.patch.sortKeys?.length ?? 0) > 0 ||
        (patch.patch.filters?.length ?? 0) > 0 ||
        patch.patch.autoFilter != null)
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
    return this.paged_dirty_preflight?.issue(patches, this.resource_operation) ?? null;
  }

  /** Throw `IncompleteDataError` while a paged sheet has unloaded cells a query would need. */
  requireCompleteQuery(sheet: SheetId): void {
    const capability = this.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  private is_cell_in_bounds(addr: CellAddress): boolean {
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
    this.note_range_mutation_ffi();
    const captured_resource = this.wasm.captureRange(
      this.sheets.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      rows,
      cols,
    );
    if (!captured_resource) return null;

    let resource: RangeSnapshot = captured_resource;
    this.range_mutation_stats.historySnapshots += 1;
    this.range_mutation_stats.historySnapshotBytes += resource.byteLength();

    const formula_coordinates = resource.formulaOffsets();
    const formula_sources = resource.formulaSources();
    const formulas: Array<[number, string]> = new Array(formula_sources.length);
    for (let index = 0; index < formula_sources.length; index++) {
      const coordinate = index * 2;
      formulas[index] = [
        formula_coordinates[coordinate]! * cols + formula_coordinates[coordinate + 1]!,
        formula_sources[index]!,
      ];
    }

    const reference_coordinates = resource.referenceOffsets();
    const reference_targets = resource.referenceTargets();
    const refs: Array<[number, CellAddress]> = new Array(reference_coordinates.length / 2);
    for (let index = 0; index < refs.length; index++) {
      const coordinate = index * 2;
      const packed_target = reference_targets.subarray(index * 3, index * 3 + 3);
      const target = referenceTargetFromPacked(packed_target, this.sheet_ids_by_handle);
      if (!target) {
        resource.free();
        throw new Error("history snapshot contains an unknown reference target");
      }

      refs[index] = [
        reference_coordinates[coordinate]! * cols + reference_coordinates[coordinate + 1]!,
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
        this.range_mutation_stats.historyMaterializations += 1;

        const kinds_column_major = resource.kinds();
        const numbers_column_major = this.wasm.snapshotNumbers(resource);
        const texts_column_major = kinds_column_major.includes(KIND_STRING)
          ? this.wasm.snapshotTexts(resource)
          : undefined;
        const styles_column_major = resource.styleIds();

        const values: CellScalar[] = new Array(rows * cols);
        const style_ids: number[] = new Array(rows * cols);
        const style_table: CellStyle[] = [];
        const style_lookup = new Map<number, number>();

        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const source = col * rows + row;
            const offset = row * cols + col;
            const kind = kinds_column_major[source]!;
            const number = numbers_column_major[source]!;
            const text = texts_column_major?.[source] ?? "";
            values[offset] =
              kind === KIND_NUMBER
                ? number
                : kind === KIND_BOOL
                  ? number !== 0
                  : kind === KIND_STRING
                    ? text
                    : null;
            const store_style_id = styles_column_major[source]!;
            let table_id = style_lookup.get(store_style_id);
            if (table_id === undefined) {
              table_id = style_table.length;
              style_lookup.set(store_style_id, table_id);
              style_table.push({ ...this.styles.get(store_style_id) });
            }

            style_ids[offset] = table_id;
          }
        }

        const block: PackedCellBlock = {
          rowCount: rows,
          colCount: cols,
          values,
          formulas: formulas.length > 0 ? formulas : undefined,
          refs: refs.length > 0 ? refs.map(([offset, ref]) => [offset, { ...ref }]) : undefined,
          styleTable: style_table,
          styleIds: style_ids,
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
          this.note_range_mutation_ffi();
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
        this.range_history.delete(history);
        this.range_mutation_stats.historyDisposals += 1;
      },
    };

    this.range_history.set(history, {
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

  private pivot_count(): number {
    let count = 0;
    for (const sheet of this.workbook.sheets) count += sheet.pivots?.length ?? 0;
    return count;
  }

  /** Status record of the pivot at `index` on `sheet`, or null without engine support. */
  private pivot_status_record(sheet: SheetId, index: number): PivotStatusRecord | null {
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
    if (!this.wasm.pivotStatus) return this.saved_pivot_outputs(sheet, pivots);

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

  private saved_pivot_outputs(
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
    return relationship_status_of(record);
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

    const record = this.pivot_status_record(sheet, index);
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
    // A dashboard has no cells: its view reads the output with `pivotOutputCells`.
    const cells = isDashboard(owner) ? [] : this.pivot_window_cells(sheet, record);
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
  private pivot_window_cells(sheet: SheetId, record: PivotStatusRecord): CellScalar[] {
    const cols = Array.from({ length: record.cols }, (_, offset) => record.col + offset);
    const window = this.getDataWindow(
      sheet,
      { start: record.row, end: record.row + record.rows },
      cols,
    );
    return Array.from(window.values);
  }

  /**
   * The engine output of the pivot at `index` in a sheet's payload; the
   * caller frees it. It serves the pivots that place no output: those of a
   * dashboard and the chart copies of a worksheet pivot. Null on the default
   * engine. Indices past the sheet's pivots read hidden pivots of a pivot view.
   */
  pivotOutputCells(sheet: SheetId, index: number): PivotOutputCells | null {
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
      const names = list.takeNames();
      const types = list.takeTypes();
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
    const resolved = resolved_scalar(cell.kind, cell.num, cell.string ?? null);
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

  /** Each installed spill on `sheet` as `row, col, rowEnd, colEnd`, four numbers per spill. */
  spillRanges(sheet: SheetId): Uint32Array {
    return this.wasm.spillRanges(this.sheets.handleOf(sheet));
  }

  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null {
    return referenceTargetFromPacked(
      this.wasm.referenceTarget(this.sheets.handleOf(addr.sheet), addr.row, addr.col),
      this.sheet_ids_by_handle,
    );
  }

  recomputeVolatile(now: Date): void {
    const milliseconds = now.getTime();
    if (!Number.isFinite(milliseconds)) {
      throw store_failure("invalid-argument", "invalid volatile recalculation date");
    }
    // A list source may hold a volatile formula.
    this.validation_reads_cache?.invalidate();
    this.wasm.recomputeVolatile(dateToSerial(now));
    if (this.chart_recalculation_tracked)
      this.recalculated_rect_count = this.wasm.recalculatedRectCount();
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
    const window = this.window_reader.read(sheet, rows, cols, this.view.order(sheet), true);
    this.record_window_boundary(window, "scroll");
    return window;
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const window = this.window_reader.read(sheet, rows, cols, undefined, false);
    this.record_window_boundary(window, "scroll");
    return window;
  }

  getClipboardWindow(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
    options?: { readonly dataRows?: boolean },
  ): ClipboardWindowView {
    // Data rows read in sheet order, past the rows the view hides.
    const order = options?.dataRows ? undefined : this.view.order(sheet);
    const clipped_end = order ? Math.min(viewRows.end, order.length) : viewRows.end;
    const row_count = Math.max(0, clipped_end - viewRows.start);
    const data_rows = new Uint32Array(row_count);
    if (order) {
      data_rows.set(order.subarray(viewRows.start, clipped_end));
    } else {
      for (let index = 0; index < row_count; index++) data_rows[index] = viewRows.start + index;
    }

    const window = this.window_reader.read(
      sheet,
      { start: viewRows.start, end: clipped_end },
      cols,
      order,
      false,
    );
    this.record_window_boundary(window, "export");
    const formulas: Array<{ offset: number; source: string }> = [];
    const refs: Array<{ offset: number; target: CellAddress }> = [];
    const source_snapshot = this.window_reader.captureSourcesForRows(sheet, data_rows, cols);
    const spill_derived = source_snapshot?.spillDerived() ?? new Uint8Array();
    if (source_snapshot) {
      const sources = consumeSourceSnapshot(source_snapshot, this.sheet_ids_by_handle);
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
      viewRows: { start: viewRows.start, end: clipped_end },
      dataRows: data_rows,
      cols,
      values: window.values,
      styleIds: window.styleIds,
      styles: window.styles,
      spillDerived: spill_derived,
      formulas,
      refs,
      ffiCalls: (window.ffiCalls ?? 0) + (source_snapshot ? 2 : 1),
      transferredElements:
        window.values.length +
        window.styleIds.length +
        data_rows.length +
        window.styles.length +
        formulas.length * 2 +
        refs.length * 4 +
        spill_derived.length,
    };
  }

  /**
   * Close the engine mutation. The engine returns the size of its chart
   * recalculation report with it, so a commit costs no extra boundary call.
   */
  private commit_engine_sources(): void {
    this.recalculated_rect_count = this.wasm.commitSources();
  }

  /** Keep one bounded engine report per commit only while charts are observed. */
  trackChartRecalculation(enabled: boolean): void {
    this.chart_recalculation_tracked = enabled;
    this.chart_recalculation_epoch = undefined;
    this.chart_recalculation = null;
    this.wasm.setRecalculationTracking(enabled);
  }

  /**
   * Take the engine report of the commit `epoch` before any change listener runs, so a
   * listener that commits again replaces it with its own commit's report.
   */
  captureChartRecalculation(epoch: number | undefined): void {
    if (!this.chart_recalculation_tracked) return;
    const count = this.recalculated_rect_count;
    this.chart_recalculation_epoch = epoch;
    // An event without an epoch cannot be matched to its report later.
    this.chart_recalculation =
      epoch === undefined || count < 0
        ? null
        : count === 0
          ? EMPTY_RECALCULATION
          : this.wasm.recalculatedRects();
  }

  /**
   * The half-open `[sheet handle, row start, row end, col start, col end)`
   * rectangles the commit `epoch` recalculated, or null to refresh
   * conservatively: tracking off, an overflowing report, or a listener that
   * committed again before this one ran. Read-only; resolve handles with
   * {@link sheetIdOfHandle}.
   */
  recalculatedRects(epoch: number | undefined): Uint32Array | null {
    return epoch === this.chart_recalculation_epoch ? this.chart_recalculation : null;
  }

  /** The sheet an engine handle names, or undefined for a removed sheet. */
  sheetIdOfHandle(handle: number): SheetId | undefined {
    return this.sheet_ids_by_handle[handle];
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
   * `rows`, end-exclusive canonical data rows, limits the scan to a source
   * range; without it the whole column is read. `only`, with `rows`, reads
   * just those data rows of the range, in their order.
   */
  distinctValues(
    sheet: SheetId,
    col: number,
    limit = DEFAULT_DISTINCT_VALUES_LIMIT,
    rows?: { start: number; end: number },
    only?: Uint32Array,
  ): CellScalar[] {
    this.requireCompleteQuery(sheet);
    return this.view.distinctValues(sheet, col, limit, rows, only).values;
  }

  /**
   * {@link distinctValues} with the number format each value shows with (its
   * first cell's, or `undefined` when that cell has none) and how many rows
   * hold it. The counts cover every row of `rows`, past `limit` values too.
   */
  distinctEntries(
    sheet: SheetId,
    col: number,
    limit: number,
    rows: { start: number; end: number },
    only?: Uint32Array,
  ): { values: CellScalar[]; formats: (string | undefined)[]; counts: Uint32Array } {
    this.requireCompleteQuery(sheet);
    const { values, styles, counts } = this.view.distinctValues(
      sheet,
      col,
      limit,
      rows,
      only,
      true,
    );
    const formats = new Array<string | undefined>(styles.length);
    for (let index = 0; index < styles.length; index++) {
      formats[index] = this.styles.get(styles[index] ?? 0).numberFormat;
    }
    return { values, formats, counts };
  }

  /** The data rows of `sheet` that every filter in `filters` keeps, ascending. */
  filteredRows(sheet: SheetId, filters: ReadonlyMap<number, ColumnFilter>): Uint32Array {
    this.requireCompleteQuery(sheet);
    return this.view.filteredRows(sheet, filters);
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

  /** Cells that Find's `query` matches, scanned in WASM and returned row-major. */
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
    opts: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
      lookIn?: "formulas" | "values";
    } = {},
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
      opts.lookIn !== "values",
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
      throw store_failure("resource-limit", "the engine cannot hold the added columns");
    }
    meta.columns.push(...additions);
  }

  /** Persisted cells only: empty space and unstyled spill children need no history payload. */
  captureSheetCells(sheet: SheetId): SnapshotCell[] {
    const captured = this.window_reader.capturePersistedCells(sheet);
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
        this.sheet_ids_by_handle,
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

    return this.capture_source_projection(sheet, 0, 0, metadata.rowCount, metadata.columns.length);
  }

  /** Whether a rectangular write would include a derived spill child. */
  hasSpillChildren(range: Range): boolean {
    const bounds = normalizedRange(range);
    const columns = Array.from(
      { length: bounds.end.col - bounds.start.col + 1 },
      (_, index) => bounds.start.col + index,
    );

    return this.window_reader
      .spillDerivedMask(bounds.sheet, { start: bounds.start.row, end: bounds.end.row + 1 }, columns)
      .some((derived) => derived !== 0);
  }

  /**
   * Cells, at their address before the move, whose formula a `permute_rows`
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

  /**
   * Cells, at their address before the move, whose formula a move back
   * cannot restore: a range that lost a moved row or column at its edge.
   * History captures them before the move applies.
   */
  moveLosses(patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>): CellAddress[] {
    const handle = this.sheets.handles.get(patch.sheet);
    if (handle === undefined) return [];

    const triples = this.wasm.moveLosses(
      handle,
      patch.op === "moveColumns",
      patch.from,
      patch.count,
      patch.to,
    );
    const losses: CellAddress[] = [];
    for (let index = 0; index + 2 < triples.length; index += 3) {
      const sheet = this.sheet_ids_by_handle[triples[index] ?? -1];
      const row = triples[index + 1];
      const col = triples[index + 2];
      if (sheet !== undefined && row !== undefined && col !== undefined) {
        losses.push({ sheet, row, col });
      }
    }
    return losses;
  }

  /**
   * Cells outside both blocks, at their address before the move, whose
   * formula a move back cannot restore: a reference that became `#REF!` or a
   * range whose edge moved. History captures them before the move applies.
   */
  moveCellsLosses(patch: MoveCellsOperation): CellAddress[] {
    const move = cellBlockMove(patch);
    const { from, to } = move;
    const handle = this.sheets.handles.get(from.sheet);
    const to_handle = this.sheets.handles.get(to.sheet);
    if (handle === undefined || to_handle === undefined) return [];

    const triples = this.wasm.moveCellsLosses(
      handle,
      from.start.row,
      from.start.col,
      from.end.row - from.start.row + 1,
      from.end.col - from.start.col + 1,
      to_handle,
      to.start.row,
      to.start.col,
      move.shift,
    );
    const losses: CellAddress[] = [];
    for (let index = 0; index + 2 < triples.length; index += 3) {
      const sheet = this.sheet_ids_by_handle[triples[index] ?? -1];
      const row = triples[index + 1];
      const col = triples[index + 2];
      if (sheet !== undefined && row !== undefined && col !== undefined) {
        losses.push({ sheet, row, col });
      }
    }
    return losses;
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
   * The plan that sorts the data rows of `range` by `keys`: a `permute_rows`
   * operation, no change, or Excel's refusal. Rows that are hidden or
   * filtered out keep their place, as in Excel; the others take the sorted
   * order among the visible positions. Keys are columns inside the range.
   */
  sortRangePlan(range: Range, keys: readonly SortKey[], hasHeader: boolean): SortRangePlan {
    const bounds = normalizedRange(range);
    const sheet = this.sheets.sheetMeta(bounds.sheet);
    const data_start = bounds.start.row + (hasHeader ? 1 : 0);
    const keys_inside = keys.every(
      (key) => integerAt(key.col) && key.col >= bounds.start.col && key.col <= bounds.end.col,
    );
    if (
      keys.length === 0 ||
      !keys_inside ||
      bounds.start.row < 0 ||
      bounds.start.col < 0 ||
      bounds.end.row >= sheet.rowCount ||
      bounds.end.col >= sheet.columns.length ||
      data_start > bounds.end.row
    ) {
      return { kind: "unchanged" };
    }

    const height = this.record_height(sheet, bounds, data_start);
    if (height === null) return { kind: "refused", message: MERGED_CELLS_SORT_MESSAGE };

    const starts = this.visible_record_starts(bounds.sheet, data_start, bounds.end.row, height);
    if (starts.length < 2) return { kind: "unchanged" };

    const sorted = this.wasm.sortRowsMulti(
      this.sheets.handleOf(bounds.sheet),
      Uint32Array.from(keys, (key) => key.col),
      Uint8Array.from(keys, (key) => (key.ascending ? 1 : 0)),
      starts,
    );
    const order = new Uint32Array(bounds.end.row - data_start + 1);
    for (let offset = 0; offset < order.length; offset++) order[offset] = offset;
    for (const [position, target] of starts.entries()) {
      const source = sorted[position] ?? target;
      for (let row = 0; row < height; row++) {
        order[target - data_start + row] = source - data_start + row;
      }
    }

    const sorted_range: Range = {
      sheet: bounds.sheet,
      start: { row: data_start, col: bounds.start.col },
      end: { row: bounds.end.row, col: bounds.end.col },
    };
    const permute: PermuteRowsOperation = {
      op: "permuteRows",
      range: sorted_range,
      encoding: ROW_ORDER_ENCODING,
      order: encodeRowOrder(order),
    };
    const table = tableWithBody(sheet.tables ?? [], sorted_range);
    const operations: DocumentOp[] = table
      ? [
          permute,
          {
            op: "updateTable",
            sheet: bounds.sheet,
            tableId: table.id,
            patch: { sortState: tableSortState(sorted_range, keys) },
          },
        ]
      : [permute];
    return { kind: "move", operations };
  }

  /**
   * Visible rows from `first` to `last` that start a record of `height`
   * rows, in sheet order. A record is visible when its first row is.
   */
  private visible_record_starts(
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
  private record_height(sheet: Sheet, bounds: Range, data_start: number): number | null {
    const merges = (sheet.merges ?? []).filter(
      (merge) =>
        merge.r0 <= bounds.end.row &&
        merge.r1 >= data_start &&
        merge.c0 <= bounds.end.col &&
        merge.c1 >= bounds.start.col,
    );
    const [first] = merges;
    if (!first) return 1;

    const rows = bounds.end.row - data_start + 1;
    const height = first.r1 - first.r0 + 1;
    const width = first.c1 - first.c0 + 1;
    if (rows % height !== 0) return null;

    const record_columns = new Set<number>();
    for (const merge of merges) {
      const same_size = merge.r1 - merge.r0 + 1 === height && merge.c1 - merge.c0 + 1 === width;
      const inside =
        merge.r0 >= data_start && merge.c0 >= bounds.start.col && merge.c1 <= bounds.end.col;
      if (!same_size || !inside || (merge.r0 - data_start) % height !== 0) return null;
      record_columns.add(merge.c0);
    }

    const every_record_merged = merges.length === (rows / height) * record_columns.size;
    return every_record_merged ? height : null;
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

    const resolved = this.capture_sparse_before_cells(
      { sheet, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      coordinates.map(({ row, col }) => ({ rowOffset: row, colOffset: col })),
    );
    const captured = resolved.map((cell) => ({
      ...cell,
      value: { kind: "literal", value: cell.resolved } as CellValue,
      isSpillChild: false,
    }));

    const by_row = new Map<number, Map<number, number[]>>();
    for (const [index, coordinate] of coordinates.entries()) {
      let columns = by_row.get(coordinate.row);
      if (!columns) {
        columns = new Map();
        by_row.set(coordinate.row, columns);
      }

      const indices = columns.get(coordinate.col) ?? [];
      indices.push(index);
      columns.set(coordinate.col, indices);
    }

    const groups = new Map<string, { rows: number[]; cols: number[] }>();
    for (const [row, columns] of by_row) {
      const cols = [...columns.keys()].sort((left, right) => left - right);
      const key = cols.join(",");
      const group = groups.get(key);
      if (group) group.rows.push(row);
      else groups.set(key, { rows: [row], cols });
    }

    for (const { rows, cols } of groups.values()) {
      const snapshot = this.window_reader.captureSourcesForRows(
        sheet,
        Uint32Array.from(rows),
        cols,
      );
      if (!snapshot) continue;

      const spill_derived = snapshot.spillDerived();
      const sources = consumeSourceSnapshot(snapshot, this.sheet_ids_by_handle);
      for (const [row_index, row] of rows.entries()) {
        const columns = by_row.get(row);
        if (!columns) throw new Error("Missing row in cell capture");

        for (const [col_index, col] of cols.entries()) {
          const offset = row_index * cols.length + col_index;
          const formula = sources.formulaAt(offset);
          const reference = sources.referenceAt(offset);
          for (const index of columns.get(col) ?? []) {
            const cell = captured[index];
            if (!cell) throw new Error("Missing resolved cell in cell capture");

            cell.isSpillChild = Boolean(spill_derived[offset]);
            cell.value = formula
              ? { kind: "formula", src: formula }
              : reference
                ? { kind: "ref", target: reference }
                : { kind: "literal", value: spill_derived[offset] ? null : cell.resolved };
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

    return consume_cell_snapshots(
      this.wasm.cellSnapshots(this.sheets.handleOf(sheet), rows, columns),
      (style_id) => this.styles.get(style_id),
    );
  }

  /**
   * Previous values of a sparse cell list, read in one batched call.
   *
   * Entry `n` belongs to cell `n` of `cells` and matches what `getCell` reports
   * for that address; the batch exists so a large `setRange` costs one crossing
   * instead of one per captured cell.
   */
  private capture_sparse_before_cells(
    bounds: Range,
    cells: readonly { rowOffset: number; colOffset: number }[],
  ): ResolvedCell[] {
    const rows = new Uint32Array(cells.length);
    const columns = new Uint32Array(cells.length);

    for (const [index, cell] of cells.entries()) {
      rows[index] = bounds.start.row + cell.rowOffset;
      columns[index] = bounds.start.col + cell.colOffset;
    }

    return consume_cell_snapshots(
      this.wasm.cellSnapshots(this.sheets.handleOf(bounds.sheet), rows, columns),
      (style_id) => this.styles.get(style_id),
    );
  }

  /**
   * Previous values of one dense block, read in one packed call.
   *
   * Each entry is the resolved value and style `getCell` reports for the same
   * address, so captured `oldValue`/`oldStyle` payloads stay unchanged while the
   * read costs one crossing instead of one per cell.
   */
  private capture_block_before_cells(
    bounds: Range,
    rows: number,
    cols: number,
    occupied_only = false,
  ): Array<{ addr: CellAddress; before: ResolvedCell }> {
    const columns: number[] = new Array(cols);
    for (let col = 0; col < cols; col += 1) columns[col] = bounds.start.col + col;

    const snapshot = this.window_reader.readRectangle(
      bounds.sheet,
      bounds.start.row,
      rows,
      columns,
    );
    const cells: Array<{ addr: CellAddress; before: ResolvedCell }> = [];
    // Style ids index this window's own style list, so find its empty slots once.
    const empty_style_slots = occupied_only
      ? snapshot.styles.map((style) => Object.keys(style).length === 0)
      : [];
    // A formula or reference can resolve to empty and still be cleared.
    const sources = occupied_only
      ? this.capture_source_projection(bounds.sheet, bounds.start.row, bounds.start.col, rows, cols)
      : null;
    const source_offsets = new Set([
      ...(sources?.formulaOffsets ?? []),
      ...(sources?.referenceOffsets ?? []),
    ]);

    for (let offset = 0; offset < rows * cols; offset += 1) {
      const resolved = snapshot.values[offset] ?? null;
      const style_id = snapshot.styleIds[offset] ?? 0;
      // A clear changes nothing in an empty, unstyled cell without a source;
      // skipping it keeps a whole-column clear from allocating one change per row.
      if (
        occupied_only &&
        resolved === null &&
        empty_style_slots[style_id] !== false &&
        !source_offsets.has(offset)
      ) {
        continue;
      }
      const style = snapshot.styles[style_id] ?? EMPTY_STYLE;

      const row = bounds.start.row + Math.floor(offset / cols);
      const col = bounds.start.col + (offset % cols);
      cells.push({ addr: { sheet: bounds.sheet, row, col }, before: { resolved, style } });
    }

    return cells;
  }

  private write_packed_block(bounds: Range, block: PackedCellBlock): boolean {
    const rows = bounds.end.row - bounds.start.row + 1;
    const cols = bounds.end.col - bounds.start.col + 1;
    const cell_count = rows * cols;
    const values = block.values;
    const style_ids = block.styleIds;
    const kinds = new Uint8Array(cell_count);
    const numbers = new Float64Array(cell_count);
    const wasm_styles = new Uint32Array(cell_count);
    const style_table = block.styleTable ?? [];
    // Interning builds a key from every style field, so each table entry is
    // interned once, on first use, instead of once per cell. First use keeps
    // the order in which the dictionary assigns ids.
    const table_ids: Array<number | undefined> = new Array(style_table.length);

    const texts: string[] = [];
    for (let offset = 0; offset < cell_count; offset++) {
      const value = values[offset];
      write_scalar_wire(kinds, numbers, offset, value);
      if (typeof value === "string") texts.push(value);

      const style_id = style_ids?.[offset];
      if (style_id === undefined) continue;
      let id = table_ids[style_id];
      if (id === undefined) {
        id = this.styles.intern(style_table[style_id]);
        table_ids[style_id] = id;
      }
      wasm_styles[offset] = id;
    }

    const formulas = block.formulas ?? [];
    const refs = block.refs ?? [];
    const reference_targets = new Uint32Array(refs.length * 3);

    for (let index = 0; index < refs.length; index++) {
      const target = refs[index]![1];
      const target_handle = this.sheets.handles.get(target.sheet);
      if (target_handle === undefined || !this.is_cell_in_bounds(target)) return false;

      const packed = index * 3;
      reference_targets[packed] = target_handle;
      reference_targets[packed + 1] = target.row;
      reference_targets[packed + 2] = target.col;
    }

    const packed_text = pack_texts(texts);
    this.note_range_mutation_ffi(cell_count);

    return (
      this.wasm.setBlockPacked(
        this.sheets.handleOf(bounds.sheet),
        bounds.start.row,
        bounds.start.col,
        rows,
        cols,
        kinds,
        numbers,
        packed_text.bytes,
        packed_text.offsets,
        wasm_styles,
        Uint32Array.from(formulas, ([offset]) => offset),
        formulas.map(([, source]) => source),
        Uint32Array.from(refs, ([offset]) => offset),
        reference_targets,
      ) === 0
    );
  }

  private write_sparse_block(
    bounds: Range,
    cells: readonly { offset: number; value: CellValue; style?: CellStyle }[],
  ): boolean {
    const offsets = new Uint32Array(cells.length);
    const kinds = new Uint8Array(cells.length);
    const numbers = new Float64Array(cells.length);
    const literal_texts: string[] = [];
    const styles = new Uint32Array(cells.length);
    const formula_offsets: number[] = [];
    const formula_sources: string[] = [];
    const reference_offsets: number[] = [];
    const reference_targets: number[] = [];

    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index]!;
      offsets[index] = cell.offset;
      styles[index] = this.styles.intern(cell.style);

      if (cell.value.kind === "formula") {
        formula_offsets.push(cell.offset);
        formula_sources.push(cell.value.src);
      } else if (cell.value.kind === "ref") {
        const target_handle = this.sheets.handles.get(cell.value.target.sheet);
        if (target_handle === undefined || !this.is_cell_in_bounds(cell.value.target)) return false;

        reference_offsets.push(cell.offset);
        reference_targets.push(target_handle, cell.value.target.row, cell.value.target.col);
      } else {
        const value = cell.value.value;
        write_scalar_wire(kinds, numbers, index, value);
        if (typeof value === "string") literal_texts.push(value);
      }
    }

    // One UTF-8 buffer for the text cells, so a block does not cross the
    // boundary as one JS string per cell.
    const packed_text = pack_texts(literal_texts);

    this.note_range_mutation_ffi(cells.length);

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
        packed_text.bytes,
        packed_text.offsets,
        styles,
        Uint32Array.from(formula_offsets),
        formula_sources,
        Uint32Array.from(reference_offsets),
        Uint32Array.from(reference_targets),
      ) === 0
    );
  }

  /**
   * Peer operations and history may restore a source that blocks derived
   * output. Uninstall only the pivots whose output a replayed write touches;
   * `flush_pivots` reinstalls them at the barrier. The engine keeps the caches
   * of unchanged definitions, so other pivots on the sheet are not rebuilt.
   */
  private release_replayed_pivot_outputs(patches: readonly DocumentOp[]): void {
    // One status call per sheet, not per patch; null marks a sheet without pivots.
    const outputs_by_sheet = new Map<SheetId, Array<{ id: string; range: Range }> | null>();
    const released_by_sheet = new Map<SheetId, Set<string>>();
    for (const patch of patches) {
      const sheet_id = patchSheetId(patch);
      if (sheet_id === null) continue;
      let outputs = outputs_by_sheet.get(sheet_id);
      if (outputs === undefined) {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheet_id);
        outputs = sheet?.pivots?.length ? this.pivotOutputs(sheet_id) : null;
        outputs_by_sheet.set(sheet_id, outputs);
      }
      if (!outputs?.length) continue;

      const written = pivotWrittenRange(patch);
      if (!written) continue;
      for (const output of outputs) {
        if (!rangesIntersect(output.range, written)) continue;
        let released = released_by_sheet.get(sheet_id);
        if (!released) {
          released = new Set();
          released_by_sheet.set(sheet_id, released);
        }
        released.add(output.id);
      }
    }

    for (const [sheet_id, released] of released_by_sheet) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheet_id);
      if (!sheet) continue;
      const kept = (sheet.pivots ?? []).filter((pivot) => !released.has(pivot.id));
      this.sync_pivots({ ...sheet, pivots: kept });
      this.pivot_sheets_dirty.add(sheet_id);
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
    // A check that spans this write reads its lists again after it.
    this.validation_reads_cache?.invalidate();
    const changes: ChangeEvent["changes"] | null = captureChanges ? [] : null;
    const applied_patches: DocumentOp[] = [];
    const touched_sheets = new Set<SheetId>();
    let has_structural_patch = false;
    const tracks_paged_revision = !remoteLoad && this.storage_options.storage === "paged";
    const mutation_revision = remoteLoad ? 0n : this.wasm.beginMutation();
    const storage_revision = tracks_paged_revision ? mutation_revision : 0n;

    if (remoteLoad) this.wasm.beginRemoteLoad();
    try {
      if (replayPivotSources) this.release_replayed_pivot_outputs(patches);
      for (const patch of patches) {
        // Planned before the edit, from the same rule the undo inverse uses.
        const pivot_plan = planPivotEdit(patch, this.workbook.sheets);
        const rewrites = pivot_plan ? pivotRewrites(this.workbook.sheets, pivot_plan) : [];
        if (!this.apply_patch(patch, changes, captureDetailedChanges, trustedHistory)) continue;
        if (rewrites.length > 0) {
          applyPivotRewrites(this.workbook.sheets, rewrites);
          for (const rewrite of rewrites) this.pivot_sheets_dirty.add(rewrite.owner);
        }

        applied_patches.push(patch);

        // A removed sheet has no spill blockers left to rebuild.
        const touched_sheet = patch.op === "removeSheet" ? null : patchSheetId(patch);
        if (touched_sheet !== null) touched_sheets.add(touched_sheet);

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
          has_structural_patch = true;
        }
      }

      if (has_structural_patch) {
        for (const touched of touched_sheets) this.spill_blockers_dirty.add(touched);
      }

      this.flush_spill_blockers();
      this.flush_pivots();
      this.range_mutation_stats.documentOperations += applied_patches.length;
      this.range_mutation_stats.jsPatchObjects += applied_patches.length;

      return { appliedPatches: applied_patches, changes, storageRevision: storage_revision };
    } finally {
      // Most transactions queue no hidden rows. With the flush and its nested
      // try on every edit, JavaScriptCore optimized one-cell edits later, and
      // the engine memory probe measured a 27% slower edit median.
      if (this.view.hasQueuedHiddenRows()) this.flush_hidden_rows_and_commit();
      else this.commit_engine_sources();
    }
  }

  /** Send the queued hidden rows, then close the mutation, even when the engine rejects the runs. */
  private flush_hidden_rows_and_commit(): void {
    try {
      this.view.flushHiddenRows();
    } finally {
      this.commit_engine_sources();
    }
  }

  /** Whether the sheet that `patch` targets takes it; a dashboard has no cells, rows or columns. */
  private sheet_takes(patch: DocumentOp): boolean {
    if (dashboardTakes(patch.op)) return true;
    const target = patchSheetId(patch);
    return !isDashboard(this.workbook.sheets.find((sheet) => sheet.id === target));
  }

  private apply_patch(
    patch: DocumentOp,
    changes: ChangeEvent["changes"] | null,
    capture_detailed_changes = false,
    trusted_history = false,
  ): boolean {
    if (!this.sheet_takes(patch)) return false;

    switch (patch.op) {
      case "set": {
        if (!this.is_cell_in_bounds(patch.addr)) return false;
        const before = changes ? this.getCell(patch.addr) : null;
        const bounds: Range = cellRange(patch.addr);

        if (
          !this.write_sparse_block(bounds, [{ offset: 0, value: patch.value, style: patch.style }])
        ) {
          return false;
        }

        if (changes && before) {
          changes.push({
            addr: patch.addr,
            oldValue: literal_of(before.resolved),
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
        const before_cells = changes ? this.capture_sparse_before_cells(bounds, patch.cells) : null;
        const sparse_cells = patch.cells.map((cell, index) => ({
          offset: cell.rowOffset * cols + cell.colOffset,
          value: cell.value,
          style: cell.style,
          addr: {
            sheet: bounds.sheet,
            row: bounds.start.row + cell.rowOffset,
            col: bounds.start.col + cell.colOffset,
          },
          before: before_cells?.[index] ?? null,
        }));

        this.range_mutation_stats.jsPatchObjects += patch.cells.length;
        if (!this.write_sparse_block(bounds, sparse_cells)) return false;
        if (changes) {
          for (const cell of sparse_cells) {
            if (!cell.before) continue;
            changes.push({
              addr: cell.addr,
              oldValue: literal_of(cell.before.resolved),
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
        const cell_count = rows * cols;
        const style_table = block.styleTable ?? [];
        const style_ids = block.styleIds;
        const exceptions = [...(block.formulas ?? []), ...(block.refs ?? [])];

        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length ||
          block.rowCount !== rows ||
          block.colCount !== cols ||
          block.values.length !== cell_count ||
          (style_ids !== undefined && style_ids.length !== cell_count) ||
          exceptions.some(
            ([offset]) => !Number.isInteger(offset) || offset < 0 || offset >= cell_count,
          ) ||
          (style_ids?.some(
            (style_id) =>
              !Number.isInteger(style_id) || style_id < 0 || style_id >= style_table.length,
          ) ??
            false)
        ) {
          return false;
        }

        const before_cells =
          changes && capture_detailed_changes
            ? this.capture_block_before_cells(bounds, rows, cols)
            : null;
        const history = trusted_history ? preparedHistoryBlock(block) : undefined;
        const applied = history ? history.restore(bounds) : this.write_packed_block(bounds, block);
        if (!applied || !changes || !before_cells) return applied;
        const formulas = new Map(block.formulas ?? []);
        const refs = new Map(block.refs ?? []);
        for (let offset = 0; offset < before_cells.length; offset += 1) {
          const entry = before_cells[offset]!;
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
            oldValue: literal_of(entry.before.resolved),
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

        this.note_range_mutation_ffi();
        const old_ids = this.wasm.rangeStyleIds(
          this.sheets.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
        );
        this.range_mutation_stats.distinctStyleIds = Math.max(
          this.range_mutation_stats.distinctStyleIds,
          old_ids.length,
        );
        this.range_mutation_stats.maxTransferredArrayLength = Math.max(
          this.range_mutation_stats.maxTransferredArrayLength,
          old_ids.length,
        );
        const new_ids = new Uint32Array(old_ids.length);
        for (let i = 0; i < old_ids.length; i++) {
          new_ids[i] =
            patch.style === null
              ? 0
              : this.styles.intern({ ...this.styles.get(old_ids[i]!), ...patch.style });
        }

        this.note_range_mutation_ffi(Math.max(old_ids.length, new_ids.length));
        return this.wasm.remapRangeStyles(
          this.sheets.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
          old_ids,
          new_ids,
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

        if ((patch.contents ?? true) && !this.admits_source_range(bounds)) return false;
        const clear_contents = patch.contents ?? true;
        const clear_style = patch.style ?? true;

        const before_cells =
          changes && capture_detailed_changes && clear_contents
            ? this.capture_block_before_cells(
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
          clear_contents,
          clear_style,
        );

        if (applied && changes && before_cells) {
          capturedClearCells.set(
            patch,
            before_cells.map((entry) => entry.addr),
          );
          for (const entry of before_cells) {
            changes.push({
              addr: entry.addr,
              oldValue: literal_of(entry.before.resolved),
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
        this.rebase_sheet_axis(patch.sheet, "row", insertRemap(patch.at, patch.count), {
          at: patch.at,
          delta: patch.count,
        });

        this.rebase_charts({
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
        this.rebase_sheet_axis(patch.sheet, "row", deleteRemap(patch.at, patch.count), {
          at: patch.at,
          delta: -patch.count,
        });
        this.rebase_charts({
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
        return this.move_axis(patch, changes, capture_detailed_changes);

      case "permuteRows":
        return this.permute_rows(patch, changes, capture_detailed_changes);

      case "moveCells":
        return this.move_cells(patch, changes, capture_detailed_changes);

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
        this.rebase_sheet_axis(patch.sheet, "column", insertRemap(patch.at, patch.columns.length), {
          at: patch.at,
          delta: patch.columns.length,
          inserted: patch.columns,
        });
        this.rebase_charts({
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
        this.rebase_sheet_axis(patch.sheet, "column", deleteRemap(patch.at, patch.count), {
          at: patch.at,
          delta: -patch.count,
        });
        this.rebase_charts({
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
        return this.move_axis(patch, changes, capture_detailed_changes);

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
          const target_sheet = this.workbook.sheets.find(
            (candidate) => candidate.id === target.sheet,
          );
          if (
            !target_sheet ||
            target.end.row >= target_sheet.rowCount ||
            target.end.col >= target_sheet.columns.length
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
        const previous = sheet.charts?.find((candidate) => candidate.id === chart.id);

        // Chart lists are replaced, never mutated, so captured definitions stay exact for undo.
        const charts = upsertById(sheet.charts ?? [], chart, MAX_CHARTS_PER_SHEET);
        if (!charts) return false;
        sheet.charts = charts;
        // A chart over a pivot reads a copy of it that the pivot view adds.
        if (chart.pivot !== undefined || previous?.pivot !== undefined) {
          this.pivot_sheets_dirty.add(patch.sheet);
        }

        return true;
      }

      case "removeChart": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const charts = sheet.charts ?? [];
        const removed = charts.find((chart) => chart.id === patch.id);
        if (removed === undefined) return false;
        sheet.charts = charts.filter((chart) => chart !== removed);
        if (removed.pivot !== undefined) this.pivot_sheets_dirty.add(patch.sheet);
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
        const rules = upsertById(sheet.validationRules ?? [], rule, MAX_VALIDATION_RULES);
        if (!rules) return false;
        sheet.validationRules = rules;

        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "removeValidationRule": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const rules = sheet.validationRules ?? [];
        if (!rules.some((rule) => rule.id === patch.id)) return false;
        sheet.validationRules = rules.filter((rule) => rule.id !== patch.id);
        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "setProtectedRange": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const protected_range = {
          ...patch.protectedRange,
          range: normalizedRange(patch.protectedRange.range),
        };

        if (
          protected_range.range.sheet !== patch.sheet ||
          !validProtectedRanges(sheet, [protected_range])
        ) {
          return false;
        }

        sheet.protectedRanges = upsertById(sheet.protectedRanges ?? [], protected_range);

        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "removeProtectedRange": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const ranges = sheet.protectedRanges ?? [];
        if (!ranges.some((range) => range.id === patch.id)) return false;
        sheet.protectedRanges = ranges.filter((range) => range.id !== patch.id);
        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "setNote": {
        if (!this.is_cell_in_bounds(patch.addr)) return false;
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
        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "removeMerge": {
        const sheet = this.sheets.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        const merges = sheet.merges ?? [];
        const index = merges.findIndex((existing) => sameMerge(existing, merge));
        if (index < 0) return false;
        sheet.merges = [...merges.slice(0, index), ...merges.slice(index + 1)];
        this.spill_blockers_dirty.add(patch.sheet);
        return true;
      }

      case "addSheet":
        return this.add_sheet_snapshot(patch.sheet, changes);

      case "removeSheet":
        return this.remove_sheet_snapshot(patch.sheet);

      case "renameSheet": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet) return false;
        const name = validateSheetName(
          patch.name,
          this.workbook.sheets
            .filter((candidate) => candidate.id !== patch.sheet)
            .map((candidate) => candidate.name),
        );
        if (
          !operationAcceptsSheetName(name) ||
          !this.renameSheetFormulaIdentity(patch.sheet, name.name)
        )
          return false;
        sheet.name = name.name;
        this.refresh_named_formulas();
        return true;
      }

      case "moveSheet": {
        const from = this.workbook.sheets.findIndex((sheet) => sheet.id === patch.sheet);
        if (from < 0 || !integerAt(patch.to) || patch.to >= this.workbook.sheets.length)
          return false;
        const [sheet] = this.workbook.sheets.splice(from, 1);
        this.workbook.sheets.splice(patch.to, 0, sheet!);
        this.sync_sheet_order();
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
        const table_count = this.workbook.sheets.reduce(
          (count, candidate) => count + (candidate.tables?.length ?? 0),
          0,
        );
        if (
          table_count >= DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables ||
          (this.workbook.namedRanges ?? []).some(
            (range) => formulaNameKey(range.name) === formulaNameKey(patch.table.name),
          )
        ) {
          return false;
        }

        const existing = this.workbook.sheets.flatMap((candidate) => candidate.tables ?? []);
        if (!validWorkbookTable(patch.table, sheet, existing)) return false;
        const table = structuredClone(patch.table);
        if (!this.sync_table(table)) return false;
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

        const existing = this.workbook.sheets.flatMap((candidate_sheet) =>
          (candidate_sheet.tables ?? []).filter((table) => table.id !== current.id),
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
        if (!this.sync_table(next)) return false;
        const next_tables = [...tables];
        next_tables[index] = next;
        sheet.tables = next_tables;

        const renames: [string, string, string][] = [[current.name, "", next.name]];
        for (const column of next.columns) {
          const previous = current.columns.find((candidate) => candidate.id === column.id);
          if (previous) renames.push([next.name, previous.name, column.name]);
        }
        const model = this.with_renames(this.workbook.dataModel, renames);
        if (model === this.workbook.dataModel) return true;
        if (!this.sync_relationships(model)) return false;
        this.workbook.dataModel = model;
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
          this.pivot_issues(patch.pivot, sheet, this.workbook.sheets).length > 0
        ) {
          return false;
        }

        const owner = pivotOwner(this.workbook.sheets, patch.pivot.id);
        if (owner && owner !== sheet) return false;
        if (!owner && this.pivot_count() >= MAX_PIVOTS_PER_WORKBOOK) return false;

        const pivot = clonePivot(patch.pivot);
        sheet.pivots = upsertById(sheet.pivots ?? [], pivot);
        this.pivot_sheets_dirty.add(sheet.id);
        return true;
      }

      case "removePivot": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet?.pivots?.some((pivot) => pivot.id === patch.id)) return false;
        sheet.pivots = sheet.pivots.filter((pivot) => pivot.id !== patch.id);
        // Free the output now, not at the barrier: a later write in the same
        // batch may target the cells, and the engine refuses writes into output.
        this.sync_pivots(sheet);
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
            !validSortAndFilters(sheet, patch.patch.sortKeys ?? [], patch.patch.filters)) ||
          (patch.patch.autoFilter != null && !validAutoFilter(sheet, patch.patch.autoFilter))
        ) {
          return false;
        }

        // The protocol checked the color's format before the operation got here.
        const { tabColor: tab_color } = patch.patch;
        if (tab_color !== undefined) sheet.tabColor = tab_color ?? undefined;
        if (patch.patch.frozenRows !== undefined) sheet.frozenRows = patch.patch.frozenRows;
        if (patch.patch.frozenCols !== undefined) sheet.frozenCols = patch.patch.frozenCols;
        if (patch.patch.conditionalFormats !== undefined) {
          patch.patch.conditionalFormats = structuredClone(patch.patch.conditionalFormats);
          sheet.conditionalFormats = patch.patch.conditionalFormats;
          this.window_reader.conditionalRulesChanged(patch.sheet);
        }

        if (patch.patch.rowGroups !== undefined) {
          sheet.rowGroups = patch.patch.rowGroups.map((group) => ({ ...group }));
          this.view.metadataChanged(patch.sheet);
        }

        const { autoFilter: auto_filter } = patch.patch;
        if (
          patch.patch.sortKeys !== undefined ||
          patch.patch.filters !== undefined ||
          auto_filter !== undefined
        ) {
          if (patch.patch.sortKeys !== undefined) {
            sheet.sortKeys = patch.patch.sortKeys.map((key) => ({ ...key }));
          }

          if (patch.patch.filters !== undefined) {
            sheet.filters = patch.patch.filters.map(([col, filter]) => [
              col,
              cloneColumnFilter(filter),
            ]);
          }

          if (auto_filter === null) delete sheet.autoFilter;
          else if (auto_filter !== undefined) sheet.autoFilter = cloneJsonValue(auto_filter);

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

        const named_range: NamedRangeSnapshot =
          patch.namedRange.range === undefined
            ? { ...patch.namedRange }
            : { ...patch.namedRange, range: normalizedRange(patch.namedRange.range) };

        if (!this.sync_named_range(named_range)) return false;
        this.upsert_named_range(named_range);

        return true;
      }

      case "removeNamedRange": {
        const ranges = this.workbook.namedRanges ?? [];
        if (!ranges.some((range) => this.same_named_range(range, patch.name, patch.scope))) {
          return false;
        }

        if (!this.wasm.removeNamedRange(patch.name, this.named_range_scope(patch.scope)))
          return false;
        this.workbook.namedRanges = ranges.filter(
          (range) => !this.same_named_range(range, patch.name, patch.scope),
        );
        return true;
      }

      case "setExternalLinks": {
        // The engine turns references to a removed link sheet back into
        // unresolved references and re-resolves them when it is added, so
        // replacing the links never changes formula text. A link that keeps
        // its sheets and their extents keeps its engine sheets, and only its
        // changed values are written.
        const previous = this.workbook.externalLinks ?? [];
        if (!replaceExternalLinks(this.wasm, previous, patch.links)) {
          removeExternalLinks(this.wasm, patch.links);
          installExternalLinks(this.wasm, previous);
          return false;
        }
        this.workbook.externalLinks =
          patch.links.length > 0 ? cloneJsonValue(patch.links) : undefined;
        return true;
      }

      case "setCalculation": {
        if (!this.sync_calculation(patch.calculation)) return false;
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

        const previous = findMeasure(current, patch.op === "setMeasure" ? patch.measure.id : "");
        const model =
          patch.op === "setMeasure"
            ? this.with_renames(withMeasure(current, patch.measure), [
                ["", previous?.name ?? "", patch.measure.name],
              ])
            : withoutMeasure(current, patch.id);
        if (!this.sync_relationships(model)) return false;
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
        this.pivot_sheets_dirty.add(sheet.id);
        return true;
      }

      case "removeDashboardItem": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet || !findDashboardItem(sheet, patch.id)) return false;
        sheet.dashboard = withoutDashboardItem(sheet.dashboard, patch.id);
        this.pivot_sheets_dirty.add(sheet.id);
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
        if (!this.sync_relationships(model)) return false;
        this.workbook.dataModel = model;
        return true;
      }

      case "removeRelationship": {
        if (!findRelationship(this.workbook.dataModel, patch.id)) return false;
        const model = withoutRelationship(this.workbook.dataModel, patch.id);
        if (!this.sync_relationships(model)) return false;
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

  /**
   * Move whole rows or columns, as Excel's Cut and Insert Cut Cells does.
   * The engine moves the cells and makes every formula and defined name
   * follow the cells it names; this moves the row heights, column
   * definitions, merges and tables with them and carries every range-keyed
   * item (rules, notes, hyperlinks, charts, names) to the moved positions.
   */
  private move_axis(
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
    changes: ChangeEvent["changes"] | null,
    capture_detailed_changes: boolean,
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

    if (!(sheet.tables ?? []).every((table) => staysWholeAfterMove(table.range, axis, patch))) {
      return false;
    }

    const move_at = moveRemap(patch.from, patch.count, patch.to);
    const merges = sheet.merges
      ?.map((merge) => rebase_merge_axis(merge, axis, move_at))
      .filter((merge): merge is MergeRange => merge !== null);
    if (merges?.some((merge) => mergeCrossesFreeze(sheet, merge))) return false;

    const moved = this.capture_moved_items(sheet, axis);
    const span = moved_span_range(sheet, patch, axis);
    const rows = span.end.row - span.start.row + 1;
    const cols = span.end.col - span.start.col + 1;
    const before_cells =
      changes && capture_detailed_changes
        ? this.capture_block_before_cells(span, rows, cols)
        : null;

    this.note_range_mutation_ffi(rows);
    const handle = this.sheets.handleOf(patch.sheet);
    const status =
      axis === "row"
        ? this.wasm.moveRows(handle, patch.from, patch.count, patch.to)
        : this.wasm.moveCols(handle, patch.from, patch.count, patch.to);
    if (status !== 0) return false;

    if (axis === "row") {
      rebase_row_meta(sheet, move_at);
      this.move_table_rows(sheet, patch);
    } else {
      const columns = sheet.columns.splice(patch.from, patch.count);
      sheet.columns.splice(patch.to, 0, ...columns);
    }
    if (merges) {
      sheet.merges = merges;
      this.spill_blockers_dirty.add(patch.sheet);
    }

    const restored = this.restore_moved_items(sheet, moved, patch, axis);
    this.refresh_named_formulas();
    if (sheet.autoFilter) {
      sheet.autoFilter = { range: rebaseMovedRange(sheet.autoFilter.range, axis, patch) };
    }
    if (axis === "row") this.view.rowsChanged(patch.sheet);
    else this.view.columnsChanged(patch.sheet, move_at);
    if (before_cells && changes) this.push_permuted_changes(span, before_cells, changes);
    return restored;
  }

  /** A row move changes each table's rows as it changes a range; see `rebaseMovedRange`. */
  private move_table_rows(
    sheet: Sheet,
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
  ): void {
    if (!sheet.tables) return;

    sheet.tables = sheet.tables.map((table) => {
      const range = rebaseMovedRange(table.range, "row", patch);
      if (range === table.range) return table;
      const next = { ...table, range };
      this.sync_table(next);
      return next;
    });
  }

  /**
   * Copies of the range-keyed items a move carries, taken before the move
   * and put back at the moved positions.
   */
  private capture_moved_items(sheet: Sheet, axis: SheetAxis): MovedItems {
    return {
      namedRanges: (this.workbook.namedRanges ?? [])
        .filter(
          (named_range): named_range is NamedRangeSnapshot & { range: Range } =>
            named_range.range?.sheet === sheet.id,
        )
        .map((named_range) => cloneJsonValue(named_range)),
      validationRules: cloneJsonValue(sheet.validationRules) ?? [],
      protectedRanges: cloneJsonValue(sheet.protectedRanges) ?? [],
      notes: cloneJsonValue(sheet.notes) ?? [],
      conditionalFormats: cloneJsonValue(sheet.conditionalFormats ?? []),
      hyperlinks: this.workbook.sheets.map(
        (owner) => [owner.id, owner.hyperlinks?.map(cloneCellHyperlink) ?? []] as const,
      ),
      // Only a column move puts table metadata back; see `restore_moved_tables`.
      tables: axis === "column" ? cloneJsonValue(sheet.tables ?? []) : [],
      charts: this.capture_charts(),
    };
  }

  private restore_moved_items(
    sheet: Sheet,
    moved: MovedItems,
    patch: Extract<DocumentOp, { op: "moveRows" | "moveColumns" }>,
    axis: SheetAxis,
  ): boolean {
    const move_at = moveRemap(patch.from, patch.count, patch.to);
    const formula_edit: FormulaAxisEdit = {
      kind: "move",
      from: patch.from,
      count: patch.count,
      to: patch.to,
    };

    sheet.validationRules = rebase_validation_rules(
      moved.validationRules,
      sheet.id,
      axis,
      move_at,
      formula_edit,
    );
    sheet.protectedRanges = rebaseRangeItems(moved.protectedRanges, sheet.id, axis, move_at);
    sheet.notes = rebase_notes(moved.notes, sheet.id, axis, move_at);
    sheet.conditionalFormats = rebase_conditional_formats(
      moved.conditionalFormats,
      sheet.id,
      axis,
      move_at,
      formula_edit,
    );
    for (const [owner_id, hyperlinks] of moved.hyperlinks) {
      const owner = this.workbook.sheets.find((candidate) => candidate.id === owner_id);
      if (owner) owner.hyperlinks = rebase_hyperlinks(hyperlinks, sheet.id, axis, move_at);
    }

    if (axis === "column") this.restore_moved_tables(sheet, moved.tables, move_at);
    this.restore_moved_charts(moved.charts, { ...formula_edit, sheet: sheet.id, axis });
    this.window_reader.conditionalRulesChanged(sheet.id);
    // A named range changes as a formula's range does, so formulas that use
    // the name and formulas that use the range read the same cells.
    return moved.namedRanges.every((original) =>
      this.upsert_moved_named_range({
        ...original,
        range: rebaseMovedRange(original.range, axis, patch),
      }),
    );
  }

  private upsert_moved_named_range(named_range: NamedRangeSnapshot): boolean {
    this.upsert_named_range(named_range);
    return this.sync_named_range(named_range);
  }

  /** Add `named_range`, or replace the definition with its name and scope. */
  private upsert_named_range(named_range: NamedRangeSnapshot): void {
    this.workbook.namedRanges = upsert_where(
      this.workbook.namedRanges ?? [],
      named_range,
      (range) => this.same_named_range(range, named_range.name, named_range.scope),
    );
  }

  /**
   * Move the rows of a range by the operation's permutation. The engine moves
   * cells and adjusts their formulas; notes, hyperlinks and merged cells of
   * the range move here. Nothing changes when a check fails.
   */
  private permute_rows(
    patch: PermuteRowsOperation,
    changes: ChangeEvent["changes"] | null,
    capture_detailed_changes: boolean,
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
    const before_cells =
      changes && capture_detailed_changes
        ? this.capture_block_before_cells(bounds, rows, cols)
        : null;

    this.note_range_mutation_ffi(rows);
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
      this.spill_blockers_dirty.add(bounds.sheet);
    }
    if (sheet.notes) sheet.notes = permutedNotes(sheet.notes, move);
    if (sheet.hyperlinks) sheet.hyperlinks = permutedHyperlinks(sheet.hyperlinks, move);

    if (before_cells && changes) this.push_permuted_changes(bounds, before_cells, changes);
    return true;
  }

  /**
   * Move a block of cells, as Excel's Cut and Paste does. The engine moves
   * the cells and makes every formula and defined name follow them; this
   * carries the block's notes, hyperlinks and merged cells, which replace
   * those of the cells it lands on, and moves named ranges and chart sources
   * by the engine's rule. A block that would cut through a table, pivot
   * output or merged cell does not move.
   */
  private move_cells(
    patch: MoveCellsOperation,
    changes: ChangeEvent["changes"] | null,
    capture_detailed_changes: boolean,
  ): boolean {
    const move = cellBlockMove(patch);
    const { from, to } = move;
    const from_sheet = this.workbook.sheets.find((sheet) => sheet.id === from.sheet);
    const to_sheet = this.workbook.sheets.find((sheet) => sheet.id === to.sheet);
    if (
      !from_sheet ||
      !to_sheet ||
      isDashboard(to_sheet) ||
      ![from.start.row, from.start.col, to.start.row, to.start.col].every(integerAt) ||
      from.end.row >= from_sheet.rowCount ||
      from.end.col >= from_sheet.columns.length ||
      to.end.row >= to_sheet.rowCount ||
      to.end.col >= to_sheet.columns.length
    ) {
      return false;
    }

    if (
      from.sheet === to.sheet &&
      from.start.row === to.start.row &&
      from.start.col === to.start.col
    ) {
      return true;
    }

    // A shift also moves the cells a deletion closes between the blocks.
    const bounds = movedCellBounds(patch);
    if (
      bounds.some((block) =>
        this.block_meets_owned_cells(block.sheet === from.sheet ? from_sheet : to_sheet, block),
      )
    ) {
      return false;
    }

    const merges = movedMerges(from_sheet, to_sheet, move);
    if (!merges || merges.to.some((merge) => mergeCrossesFreeze(to_sheet, merge))) return false;

    const rows = from.end.row - from.start.row + 1;
    const cols = from.end.col - from.start.col + 1;
    const before =
      changes && capture_detailed_changes
        ? bounds.map((block) => ({
            bounds: block,
            cells: this.capture_block_before_cells(
              block,
              block.end.row - block.start.row + 1,
              block.end.col - block.start.col + 1,
            ),
          }))
        : null;

    this.note_range_mutation_ffi(rows);
    const status = this.wasm.moveCells(
      this.sheets.handleOf(from.sheet),
      from.start.row,
      from.start.col,
      rows,
      cols,
      this.sheets.handleOf(to.sheet),
      to.start.row,
      to.start.col,
      move.shift,
    );
    if (status !== 0) return false;

    if (from_sheet.merges || merges.from.length > 0) from_sheet.merges = merges.from;
    if (to_sheet.merges || merges.to.length > 0) to_sheet.merges = merges.to;
    this.spill_blockers_dirty.add(from.sheet);
    this.spill_blockers_dirty.add(to.sheet);
    this.move_block_items(from_sheet, to_sheet, move);
    if (before && changes) {
      for (const block of before) this.push_permuted_changes(block.bounds, block.cells, changes);
    }
    return true;
  }

  /** Whether a table or pivot output meets the block: a cut moves neither in part. */
  private block_meets_owned_cells(sheet: Sheet, block: Range): boolean {
    return (
      (sheet.tables ?? []).some((table) => rangesIntersect(table.range, block)) ||
      this.pivotOutputs(sheet.id).some((output) => rangesIntersect(output.range, block))
    );
  }

  /**
   * Carry the notes, hyperlinks, validation and conditional-format rules,
   * named ranges and chart sources that a block move takes along.
   */
  private move_block_items(from_sheet: Sheet, to_sheet: Sheet, move: CellBlockMove): void {
    const place = <K extends MovedSheetItems>(key: K, lists: { from: Sheet[K]; to: Sheet[K] }) => {
      if (from_sheet[key] || lists.from?.length) from_sheet[key] = lists.from;
      if (to_sheet[key] || lists.to?.length) to_sheet[key] = lists.to;
    };
    place("notes", movedNotes(from_sheet.notes ?? [], to_sheet.notes ?? [], move));
    place(
      "hyperlinks",
      movedHyperlinks(from_sheet.hyperlinks ?? [], to_sheet.hyperlinks ?? [], move),
    );
    place(
      "validationRules",
      movedValidationRules(from_sheet.validationRules ?? [], to_sheet.validationRules ?? [], move),
    );
    place(
      "conditionalFormats",
      movedConditionalFormats(
        from_sheet.conditionalFormats ?? [],
        to_sheet.conditionalFormats ?? [],
        move,
      ),
    );
    this.window_reader.conditionalRulesChanged(from_sheet.id);
    if (to_sheet !== from_sheet) this.window_reader.conditionalRulesChanged(to_sheet.id);

    this.rewrite_charts((chart) =>
      mapChartSources(chart, (range) => moveCellRange(range, move) ?? "#REF!"),
    );
    // A named range follows as a formula's range does; the engine moved its own copy.
    for (const named_range of [...(this.workbook.namedRanges ?? [])]) {
      if (!named_range.range) continue;
      const range = moveCellRange(named_range.range, move);
      if (range && range !== named_range.range)
        this.upsert_moved_named_range({ ...named_range, range });
    }
    this.refresh_named_formulas();
  }

  /** Whether every cell of the block is loaded, so a move can read and write it. */
  private block_loaded(range: Range): boolean {
    if (!this.sheets.handles.has(range.sheet) || !this.isPaged(range.sheet)) return true;
    return this.isRangeFullyLoaded(range);
  }

  /**
   * Cell-level effects of a row permutation, for listeners that ask for them
   * (such as a row bridge). Other listeners read the operation's range.
   */
  private push_permuted_changes(
    bounds: Range,
    before_cells: Array<{ addr: CellAddress; before: ResolvedCell }>,
    changes: ChangeEvent["changes"],
  ): void {
    const after = this.captureCells(
      bounds.sheet,
      before_cells.map(({ addr }) => addr),
    );
    for (const [index, entry] of before_cells.entries()) {
      const next = after[index];
      if (!next) continue;

      changes.push({
        addr: entry.addr,
        oldValue: literal_of(entry.before.resolved),
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
  private restore_moved_tables(
    sheet: Sheet,
    originals: readonly WorkbookTable[],
    move_col: (col: number) => number,
  ): void {
    let tables = sheet.tables ?? [];
    for (const original of originals) {
      const positions = original.columns.map((_column, offset) =>
        move_col(original.range.start.col + offset),
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
      Object.assign(restored, remapWorkbookTableRuleColumns(original, move_col, start, end));
      const others = this.workbook.sheets
        .flatMap((owner) => (owner === sheet ? tables : (owner.tables ?? [])))
        .filter((table) => table.id !== original.id);
      if (!validWorkbookTable(restored, sheet, others) || !this.sync_table(restored)) continue;
      tables = upsertById(tables, restored);
    }

    sheet.tables = tables;
  }

  /** Keep chart list identity until a rewrite changes at least one definition. */
  private rewrite_charts(map: (chart: ChartDefinition, ownerId: SheetId) => ChartDefinition): void {
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
  private rebase_charts(edit: ChartAxisEdit): void {
    this.rewrite_charts((chart, owner_id) => rebaseChartAxis(chart, owner_id, edit));
  }

  /**
   * The live chart lists before a move. A move runs as remove then add, which
   * would turn sources inside the moved block into `#REF!`; the lists are
   * replaced rather than mutated, so these references keep the pre-move state.
   */
  private capture_charts(): Map<Sheet, readonly ChartDefinition[]> | null {
    let captured: Map<Sheet, readonly ChartDefinition[]> | null = null;
    for (const owner of this.workbook.sheets) {
      if (!owner.charts?.length) continue;
      captured ??= new Map();
      captured.set(owner, owner.charts);
    }
    return captured;
  }

  private restore_moved_charts(
    originals: ReadonlyMap<Sheet, readonly ChartDefinition[]> | null,
    edit: Extract<ChartAxisEdit, { kind: "move" }>,
  ): void {
    if (!originals) return;
    for (const [owner, charts] of originals) {
      owner.charts = charts.map((chart) => rebaseChartAxis(chart, owner.id, edit));
    }
  }

  private add_sheet_snapshot(
    snapshot: SheetSnapshot,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    if (!canAddSheetSnapshot(snapshot, this.workbook.sheets)) return false;
    const name = validateSheetName(
      snapshot.name,
      this.workbook.sheets.map((sheet) => sheet.name),
    );
    if (!operationAcceptsSheetName(name)) return false;
    const merges = snapshot.merges?.map(normalizeMerge) ?? [];
    const sheet: Sheet = {
      id: snapshot.id,
      name: name.name,
      ...dashboardFields(snapshot),
      visibility: snapshot.visibility,
      tabColor: snapshot.tabColor,
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
      autoFilter: cloneJsonValue(snapshot.autoFilter),
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
      if (this.pivot_count() + snapshot.pivots.length > MAX_PIVOTS_PER_WORKBOOK) return false;
      const ids = new Set<string>();
      for (const pivot of snapshot.pivots) {
        if (
          ids.has(pivot.id) ||
          pivotOwner(this.workbook.sheets, pivot.id) ||
          this.pivot_issues(pivot, sheet, sheets).length > 0
        ) {
          return false;
        }

        ids.add(pivot.id);
      }

      sheet.pivots = snapshot.pivots.map(clonePivot);
      this.pivot_sheets_dirty.add(sheet.id);
    }

    const handle = this.allocate_sheet(snapshot.columns.length, snapshot.rowCount);
    if (!this.wasm.setSheetName(handle, snapshot.id, name.name)) {
      this.wasm.removeSheet(handle);
      return false;
    }

    this.sheets.handles.set(snapshot.id, handle);
    this.sheet_ids_by_handle[handle] = snapshot.id;
    for (const [row, meta] of snapshot.rowMeta ?? []) {
      if (meta.height !== undefined) sheet.rowHeights!.set(row, meta.height);
      if (meta.hidden) sheet.hiddenRows!.add(row);
    }

    this.view.queueHiddenRows(snapshot.id);
    this.sheets.insertSheet(sheet, snapshot.order);
    this.sync_sheet_order();
    for (const table of sheet.tables ?? []) {
      if (!this.sync_table(table)) return false;
    }

    for (const block of snapshot.cells) {
      if (
        !this.apply_patch(
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

    this.window_reader.conditionalRulesChanged(snapshot.id);
    this.view.sheetLoaded(snapshot.id);
    if (this.snapshot_authoritative) this.authoritative_snapshot_sheets.add(snapshot.id);
    return true;
  }

  private remove_sheet_snapshot(sheet_id: SheetId): boolean {
    const index = this.workbook.sheets.findIndex((sheet) => sheet.id === sheet_id);
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
      this.workbook.activeSheet === sheet_id
        ? visibleSheetNeighbor(this.workbook.sheets, sheet_id)
        : null;
    if (this.workbook.activeSheet === sheet_id && !fallback) return false;
    if (!this.removeSheetFormulaIdentity(sheet_id)) return false;
    this.sheets.handles.delete(sheet_id);
    this.authoritative_snapshot_sheets.delete(sheet_id);
    this.view.removeSheet(sheet_id);
    this.window_reader.removeSheet(sheet_id);
    this.sheets.removeSheetAt(index);
    if (fallback) this.workbook.activeSheet = fallback;
    this.workbook.namedRanges = this.workbook.namedRanges?.filter(
      (range) => range.range?.sheet !== sheet_id && range.scope !== sheet_id,
    );
    this.refresh_named_formulas();
    for (const owner of this.workbook.sheets) {
      owner.hyperlinks = owner.hyperlinks?.filter(
        (hyperlink) =>
          hyperlink.target.kind !== "internal" || hyperlink.target.range.sheet !== sheet_id,
      );
    }

    // A chart keeps a source on a removed sheet as an explicit `#REF!`.
    this.rewrite_charts((chart) => invalidateChartSheet(chart, sheet_id));

    return true;
  }

  /**
   * Carry the sheet's row- or column-keyed metadata through an insert or
   * delete that the engine already applied; `remap` gives each old index its
   * new one, or null for a removed index.
   */
  private rebase_sheet_axis(
    sheet: SheetId,
    axis: SheetAxis,
    remap: (index: number) => number | null,
    edit: { at: number; delta: number; inserted?: readonly Column[] },
  ): void {
    const meta = this.sheets.sheetMeta(sheet);
    if (axis === "row") rebase_row_meta(meta, remap);

    meta.merges = meta.merges
      ?.map((merge) => rebase_merge_axis(merge, axis, remap))
      .filter((merge): merge is MergeRange => merge !== null);
    const formula_edit: FormulaAxisEdit = { kind: "shift", at: edit.at, delta: edit.delta };
    meta.conditionalFormats =
      meta.conditionalFormats &&
      rebase_conditional_formats(meta.conditionalFormats, sheet, axis, remap, formula_edit);
    for (const owner of this.workbook.sheets) {
      owner.hyperlinks =
        owner.hyperlinks && rebase_hyperlinks(owner.hyperlinks, sheet, axis, remap);
    }

    this.window_reader.conditionalRulesChanged(sheet);
    meta.validationRules =
      meta.validationRules &&
      rebase_validation_rules(meta.validationRules, sheet, axis, remap, formula_edit);
    meta.protectedRanges =
      meta.protectedRanges && rebaseRangeItems(meta.protectedRanges, sheet, axis, remap);
    meta.notes = meta.notes && rebase_notes(meta.notes, sheet, axis, remap);
    meta.tables = this.rebase_tables(meta, axis, remap, edit);
    if (axis === "row" && meta.frozenRows)
      meta.frozenRows = frozen_count_after(meta.frozenRows, remap);
    if (axis === "column" && meta.frozenCols) {
      meta.frozenCols = frozen_count_after(meta.frozenCols, remap);
    }

    this.workbook.namedRanges = this.workbook.namedRanges
      ?.map((named_range) =>
        named_range.range === undefined
          ? named_range
          : rebaseRangeAxis(named_range, sheet, axis, remap),
      )
      .filter((range): range is NonNullable<Workbook["namedRanges"]>[number] => range !== null);
    this.refresh_named_formulas();
    rebaseSheetAutoFilter(meta, axis, remap);
    if (axis === "row") this.view.rowsChanged(sheet);
    else this.view.columnsChanged(sheet, remap);
  }

  /**
   * The sheet's tables after an axis edit. A table whose span the edit
   * removes is dropped from the engine. A column edit inside a table also
   * inserts or removes the table's column definitions and remaps its
   * filter and sort rules; a table whose columns no longer match its span
   * is dropped.
   */
  private rebase_tables(
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
        (axis === "row"
          ? { ...table, range }
          : this.rebase_table_columns(table, range, remap, edit));
      if (!next) {
        this.wasm.removeTable(table.id);
        continue;
      }

      tables.push(next);
      this.sync_table(next);
    }
    return tables;
  }

  private rebase_table_columns(
    table: WorkbookTable,
    range: Range,
    remap: (col: number) => number | null,
    edit: { at: number; delta: number; inserted?: readonly Column[] },
  ): WorkbookTable | null {
    let columns = table.columns;
    if (edit.delta > 0 && edit.at > table.range.start.col && edit.at <= table.range.end.col) {
      const added = this.inserted_table_columns(table, edit.inserted ?? []);
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

  private acknowledged_set_still_matches(
    addr: CellAddress,
    value: CellValue,
    style: CellStyle | undefined,
    sources?: RangeSourceProjection | null,
    source_offset = 0,
    current: ResolvedCell = this.getCell(addr),
  ): boolean {
    if (this.styles.intern(current.style) !== this.styles.intern(style)) return false;

    const formula =
      sources === undefined ? this.getFormula(addr) : sources?.formulaAt(source_offset);
    const target =
      sources === undefined ? this.getRefTarget(addr) : sources?.referenceAt(source_offset);

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
        if (
          !this.acknowledged_set_still_matches(operation.addr, operation.value, operation.style)
        ) {
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
        const sources = this.capture_source_projection(
          range.sheet,
          range.start.row,
          range.start.col,
          rows,
          cols,
        );

        const current_cells = this.capture_sparse_before_cells(range, operation.cells);
        const matched_rows_by_column = new Map<number, Set<number>>();

        for (const [index, cell] of operation.cells.entries()) {
          const row = range.start.row + cell.rowOffset;
          const col = range.start.col + cell.colOffset;
          const current = current_cells[index];
          if (!current) continue;

          if (
            !this.acknowledged_set_still_matches(
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

          let matched_rows = matched_rows_by_column.get(col);
          if (!matched_rows) {
            matched_rows = new Set<number>();
            matched_rows_by_column.set(col, matched_rows);
          }

          matched_rows.add(row);
        }

        for (const [col, matched_rows] of matched_rows_by_column) {
          const sorted_rows = [...matched_rows].sort((left, right) => left - right);
          let start: number | undefined;
          let end: number | undefined;

          for (const row of sorted_rows) {
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
    return this.snapshot_codec.encode(documentId, documentVersion);
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
  private sync_sheet_order(): void {
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
    const row_count = Math.min(rows.length, Math.max(0, meta.rowCount - start));
    if (row_count === 0) return;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw datasourceFailure("datasource page contains an invalid row start");
    }

    let previous_end = -1;
    const declared_keys = new Set<string>();
    for (const band of columns) {
      if (
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start < previous_end ||
        band.end <= band.start ||
        band.end > meta.columns.length ||
        band.keys.length !== band.end - band.start
      ) {
        throw datasourceFailure("datasource page contains invalid column bounds");
      }

      for (let offset = 0; offset < band.keys.length; offset++) {
        const key = band.keys[offset]!;
        if (meta.columns[band.start + offset]?.key !== key || declared_keys.has(key)) {
          throw datasourceFailure("datasource page contains invalid column keys");
        }

        declared_keys.add(key);
      }

      previous_end = band.end;
    }

    for (let row_offset = 0; row_offset < row_count; row_offset++) {
      const row = rows[row_offset]!;
      for (const key of declared_keys) {
        if (!Object.hasOwn(row, key)) {
          throw datasourceFailure("datasource page omits declared cell data");
        }
      }

      for (const key of Object.keys(row)) {
        if (!declared_keys.has(key))
          throw datasourceFailure("datasource page contains undeclared cell data");
      }
    }

    const block_start = columns[0]!.start;
    const block_end = columns[columns.length - 1]!.end;
    const block_width = block_end - block_start;

    const cells: Array<{ offset: number; value: CellValue; style?: CellStyle }> = [];
    const address: CellAddress = { sheet, row: start, col: block_start };
    for (let row_offset = 0; row_offset < row_count; row_offset++) {
      address.row = start + row_offset;
      const row = rows[row_offset]!;
      for (const band of columns) {
        for (let col = band.start; col < band.end; col++) {
          address.col = col;
          if (protect?.(address)) continue;
          const column = meta.columns[col]!;
          const data_cell = row[column.key];
          const wrapped = is_styled_data_cell(data_cell) ? data_cell : undefined;

          const source = columnar_scalar(data_cell_value(data_cell), column.type);
          const value: CellValue =
            source && typeof source === "object"
              ? source
              : { kind: "literal", value: source ?? null };
          cells.push({
            offset: row_offset * block_width + col - block_start,
            value,
            style: wrapped?.style,
          });
        }
      }
    }

    if (cells.length === 0) return;
    const bounds: Range = {
      sheet,
      start: { row: start, col: block_start },
      end: { row: start + row_count - 1, col: block_end - 1 },
    };

    const previous_operation = this.resource_operation;
    this.resource_operation ??= "ingest";
    let accepted = false;
    this.wasm.beginPageLoad();
    try {
      accepted = this.write_sparse_block(bounds, cells);
    } finally {
      this.boundary_accounting.record(
        this.resource_operation ?? "ingest",
        "js-to-wasm",
        0,
        "scalar",
      );
      this.commit_engine_sources();
      this.resource_operation = previous_operation;
    }

    if (!accepted) throw new Error("datasource page contains invalid persisted sources");
  }

  hydrateSnapshot(snapshot: WorkbookSnapshot): void {
    let accepted = true;
    this.wasm.beginPageLoad();
    try {
      for (const source_sheet of snapshot.sheets) {
        for (const block of source_sheet.cells) {
          const bounds: Range = {
            sheet: source_sheet.id,
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

          if (!this.write_sparse_block(bounds, cells)) {
            accepted = false;
            break;
          }
        }

        if (!accepted) break;
        this.window_reader.conditionalRulesChanged(source_sheet.id);
      }
    } finally {
      this.commit_engine_sources();
    }

    if (!accepted) throw new Error("snapshot hydration contains invalid persisted sources");
    this.snapshot_authoritative = true;
    for (const sheet of snapshot.sheets) {
      this.authoritative_snapshot_sheets.add(sheet.id);
      this.view.cellsLoaded(sheet.id);
    }

    if (this.view.hasQueuedHiddenRows()) this.flush_hidden_rows_and_commit();
  }

  beginPageRequest(): void {
    this.pending_page_requests += 1;
  }

  endPageRequest(): void {
    this.pending_page_requests -= 1;

    if (this.pending_page_requests === 0) this.release_page_idle_waiters();
  }

  /** A memory release waits here; a disposed store has no page load left to wait for. */
  private release_page_idle_waiters(): void {
    const waiters = this.page_idle_waiters;
    this.page_idle_waiters = undefined;
    if (waiters) for (const resolve of waiters) resolve();
  }

  waitForPageLoads(): Promise<void> | undefined {
    if (this.disposed || this.pending_page_requests === 0) return undefined;

    const { promise, resolve } = Promise.withResolvers<void>();
    this.page_idle_waiters ??= [];
    this.page_idle_waiters.push(resolve);

    return promise;
  }

  /** Drop the window reader's rebuildable caches; cell data stays in the engine. */
  trimMemory(): void {
    this.window_reader.trim();
  }

  onMemoryRelease(listener: () => void): () => void {
    this.memory_release_listeners.add(listener);
    return () => this.memory_release_listeners.delete(listener);
  }

  notifyMemoryRelease(): void {
    for (const listener of this.memory_release_listeners) listener();
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
      for (const [snapshot, owner] of this.range_history) {
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
      if (!this.sync_relationships(this.workbook.dataModel, replacement)) {
        throw new Error("Sheetwrite: the replacement engine refused the relationships");
      }
      for (const sheet of this.workbook.sheets) {
        if (sheet.pivots?.length) this.sync_pivots(sheet, replacement);
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
        if (this.chart_recalculation_tracked) replacement.setRecalculationTracking(true);
        this.hostFunctions?.adopt(replacement);
        this.view.replaceEngine(replacement);
        this.window_reader.replaceEngine(replacement);
        this.paged_dirty_preflight?.replaceEngine(replacement);

        for (const snapshot of history) snapshot.replace(snapshot.replacement);

        previous.free();
      },
    };
  }

  /** Release the WASM-side cell store immediately; the store is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    const committed = this.wasm.wasmCommittedBytes();
    this.committed_bytes_after_dispose = committed > 0 ? committed : null;
    this.boundary_accounting.record("teardown", "js-to-wasm", 0, "scalar");
    for (const history of this.range_history.keys()) history.dispose();
    this.memory_release_listeners.clear();
    this.release_page_idle_waiters();
    this.view.dispose();
    this.window_reader.clear();
    this.styles.clear();
    this.sheets.handles.clear();
    this.authoritative_snapshot_sheets.clear();
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
  private load_columnar(sheet: SheetId, data: ColumnarData): void {
    const meta = this.sheets.sheetMeta(sheet);
    const columns = meta.columns;
    const row_count = Math.min(data.rowCount, meta.rowCount);
    if (row_count === 0 || columns.length === 0) return;
    const col_count = columns.length;
    const cell_count = row_count * col_count;
    const kinds = new Uint8Array(cell_count);
    const numbers = new Float64Array(cell_count);
    const wasm_styles = new Uint32Array(cell_count);
    const formulas: Array<[number, string]> = [];
    const refs: Array<[number, CellAddress]> = [];
    const texts: string[] = [];
    for (let col = 0; col < col_count; col++) {
      const column = columns[col]!;
      const source = data.columns[column.key];
      const base = col * row_count;
      if (source instanceof Float64Array) {
        write_number_column(kinds, numbers, base, source, row_count);
        continue;
      }
      for (let row = 0; row < row_count; row++) {
        const value = source?.[row];
        const offset = base + row;
        // A number, the most common cell, needs no parsing.
        if (typeof value === "number") {
          kinds[offset] = KIND_NUMBER;
          numbers[offset] = value;
          continue;
        }
        const parsed = columnar_scalar(value, column.type);
        if (parsed && typeof parsed === "object") {
          if (parsed.kind === "formula") formulas.push([offset, parsed.src]);
          else if (parsed.kind === "ref") refs.push([offset, parsed.target]);
          else write_columnar_value(kinds, numbers, texts, offset, parsed.value);
        } else {
          write_columnar_value(kinds, numbers, texts, offset, parsed);
        }
      }
    }

    const reference_targets = new Uint32Array(refs.length * 3);
    for (let index = 0; index < refs.length; index++) {
      const target = refs[index]![1];
      const target_handle = this.sheets.handles.get(target.sheet);
      if (target_handle === undefined || !this.is_cell_in_bounds(target)) {
        throw new Error("columnar import contains invalid persisted sources");
      }

      const packed = index * 3;
      reference_targets[packed] = target_handle;
      reference_targets[packed + 1] = target.row;
      reference_targets[packed + 2] = target.col;
    }

    const packed_text = pack_texts(texts);

    this.note_range_mutation_ffi(cell_count);
    const applied = this.wasm.setColumnBlockPacked(
      this.sheets.handleOf(sheet),
      0,
      0,
      row_count,
      col_count,
      kinds,
      numbers,
      packed_text.bytes,
      packed_text.offsets,
      wasm_styles,
      Uint32Array.from(formulas, ([offset]) => offset),
      formulas.map(([, source]) => source),
      Uint32Array.from(refs, ([offset]) => offset),
      reference_targets,
    );
    if (applied !== 0) {
      throw new Error("columnar import contains invalid persisted sources");
    }

    this.note_range_mutation_ffi();
    this.commit_engine_sources();
    this.note_range_mutation_ffi();
    this.wasm.compactStringStorage();
  }
}

/**
 * Write a `Float64Array` column at `base`: every entry is a number cell, so
 * the column is copied in one call. Rows past the end of `source` stay empty.
 */
function write_number_column(
  kinds: Uint8Array,
  numbers: Float64Array,
  base: number,
  source: Float64Array,
  row_count: number,
): void {
  const length = Math.min(source.length, row_count);
  numbers.set(source.subarray(0, length), base);
  kinds.fill(KIND_NUMBER, base, base + length);
}

/**
 * Write the wire kind and number payload of one scalar at `offset`. An empty
 * value leaves the slot at KIND_EMPTY; the caller stores string text in its
 * own text buffer.
 */
function write_scalar_wire(
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
function write_columnar_value(
  kinds: Uint8Array,
  numbers: Float64Array,
  texts: string[],
  offset: number,
  value: CellScalar | undefined,
): void {
  write_scalar_wire(kinds, numbers, offset, value);
  if (typeof value === "string") texts.push(value);
}

function resolved_scalar(kind: number, num: number, text: string | null): CellScalar {
  if (kind === KIND_NUMBER || kind === KIND_FORMULA) return num;
  if (kind === KIND_BOOL) return num !== 0;
  if (kind === KIND_STRING) return text;
  return null;
}

/** Read one batched cell snapshot into resolved cells, then release WASM memory. */
function consume_cell_snapshots(
  snapshot: CellSnapshot | undefined,
  style_of: (styleId: number) => CellStyle,
): ResolvedCell[] {
  if (!snapshot) throw new Error("Sheetwrite: cell snapshot batch has mismatched coordinates");
  try {
    const { kinds, numbers, styles, textIndex: text_index, strings } = snapshot;
    const cells = new Array<ResolvedCell>(kinds.length);
    for (const [index, kind] of kinds.entries()) {
      const slot = text_index[index] ?? -1;
      cells[index] = {
        resolved: resolved_scalar(
          kind,
          numbers[index] ?? 0,
          slot < 0 ? null : (strings[slot] ?? null),
        ),
        style: style_of(styles[index] ?? 0),
      };
    }
    return cells;
  } finally {
    snapshot.free();
  }
}

/** Whether a data cell is the `{ value, style }` form rather than a bare value. */
function is_styled_data_cell(
  value: DataCell | undefined,
): value is { value: CellValue; style?: CellStyle } {
  return value !== null && typeof value === "object" && !("kind" in value) && "value" in value;
}

function data_cell_value(value: DataCell | undefined): CellScalar | CellValue | undefined {
  return is_styled_data_cell(value) ? value.value : value;
}

function columnar_scalar(
  value: CellScalar | CellValue | undefined,
  type: CellFormat,
): CellScalar | CellValue | undefined {
  const unwrapped = data_cell_value(value);
  if (unwrapped && typeof unwrapped === "object" && unwrapped.kind === "literal") {
    return columnar_scalar(unwrapped.value, type);
  }
  return typeof unwrapped === "string" ? parseCellLiteralInput(unwrapped, type) : unwrapped;
}

/** The engine's number for the kind of a trial value: 0 blank, 1 number, 2 text, 3 logical. */
function trial_kind(trial: CellScalar): number {
  if (trial === null) return 0;
  if (typeof trial === "number") return 1;
  return typeof trial === "string" ? 2 : 3;
}
