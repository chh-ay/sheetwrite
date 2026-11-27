// Workbook, view, validation, protection, snapshot, and operation contracts.
// No runtime values live here.

import type {
  CellHyperlink,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatRule,
} from "./cell.js";
import type { ChartDefinition } from "./chart.js";
import type { CellAddress, MergeRange, Range, SheetId } from "./coordinates.js";
import type { Dashboard, DashboardItem, SheetKind } from "./dashboard.js";
import type { DataModel, Measure, TableRelationship } from "./data-model.js";
import type { ExternalLink } from "./external-link.js";
import type { PivotDefinition } from "./pivot.js";
import type { SavedQuery } from "./query.js";
import type { WorkbookTable, WorkbookTablePatch, WorkbookTableXmlElement } from "./table.js";

/** Stable reason codes returned by worksheet-name validation. */
export type SheetNameIssueCode =
  | "blank"
  | "too-long"
  | "forbidden-character"
  | "edge-apostrophe"
  | "reserved"
  | "duplicate";

/** Successful canonical name or an actionable validation failure. */
export type SheetNameValidationResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly key: string;
    }
  | {
      readonly ok: false;
      readonly code: SheetNameIssueCode;
      readonly name: string;
      readonly key: string;
    };

/** Native worksheet visibility preserved across workbook snapshots and tab rendering. */
export type SheetVisibility = "visible" | "hidden" | "veryHidden";

/** Workbook sheet schema used when creating a live grid. */
export interface Sheet {
  /** Stable identifier, unique within the workbook and used by every cell address. */
  id: SheetId;
  /** User-facing sheet name shown in tabs and workbook exports. */
  name: string;
  /** A dashboard holds items and no cells; absent means a worksheet. */
  kind?: SheetKind;
  /** Items of a dashboard sheet; only on `kind: "dashboard"`. */
  dashboard?: Dashboard;
  /** Hidden worksheets remain addressable but are omitted from the tab strip. */
  visibility?: SheetVisibility;
  /**
   * The tab's color, as `#RRGGBB` (Excel's Tab Color); absent shows the
   * default tab.
   */
  tabColor?: string;
  /** Ordered schema; array positions are the zero-based column coordinates. */
  columns: Column[];
  /** Row count for both in-memory and datasource-backed sheets. */
  rowCount: number;
  /** Sparse per-row height overrides; default comes from the theme. */
  rowHeights?: Map<number, number>;
  /** Persisted hidden data rows; runtime form is sparse and non-JSON. */
  hiddenRows?: Set<number>;
  /** Persisted collapsible row groups. */
  rowGroups?: RowGroup[];
  /** Conditional styles folded into the bulk render-window style dictionary. */
  conditionalFormats?: ConditionalFormatRule[];
  /** Stable, serializable range hyperlinks; external URLs pass the shared safety policy. */
  hyperlinks?: CellHyperlink[];
  /** Serializable data-entry rules evaluated at the local mutation barrier. */
  validationRules?: DataValidationRule[];
  /** Client-side protected-range policy metadata; never server authorization. */
  protectedRanges?: ProtectedRange[];
  /** Simple cell notes. Discussion threads live outside the document model. */
  notes?: CellNote[];
  /** Persisted sort keys for the sheet's view. */
  sortKeys?: SortKey[];
  /**
   * The worksheet `sortState` of an imported XLSX file. Excel writes it after
   * a sort whose cells it already moved, so Sheetwrite keeps it for export and
   * does not apply it. Export writes it while its references lie inside the
   * sheet; a view sort (`sortKeys`) replaces it.
   */
  sortState?: WorkbookTableXmlElement;
  /** Persisted column filters as JSON-safe index/value tuples. */
  filters?: Array<[col: number, filter: ColumnFilter]>;
  /**
   * Excel's AutoFilter: the range whose header row shows filter buttons. With
   * it, `filters` hide only the range's rows below its header.
   */
  autoFilter?: AutoFilter;
  /** Persisted merged-cell regions; covered cells render/export from the anchor. */
  merges?: MergeRange[];
  /** Leading view rows pinned above the scrolling body (0/undefined = none). */
  frozenRows?: number;
  /** Leading columns pinned left of the scrolling body (0/undefined = none). */
  frozenCols?: number;
  /** Native workbook tables anchored to this stable worksheet identity. */
  tables?: WorkbookTable[];
  /** Charts anchored to this sheet; series sources use stable sheet IDs. */
  charts?: ChartDefinition[];

  /** Pivot tables anchored on this sheet; IDs are unique in the workbook. */
  pivots?: PivotDefinition[];
}

/** One key of a multi-column sort, applied in array order (first = primary). */
export interface SortKey {
  /** Zero-based index of the column to sort by. */
  col: number;
  /** `true` sorts smallest first (A to Z for text); `false` the reverse. */
  ascending: boolean;
}

/**
 * One column's filter predicate. All active column filters AND together;
 * matching is against the cell's resolved value (text or number).
 */
export type ColumnFilter =
  | { kind: "values"; values: readonly CellScalar[] }
  | { kind: "contains"; text: string; matchCase?: boolean }
  | { kind: "compare"; op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq"; value: number }
  | { kind: "empty" }
  | { kind: "nonEmpty" }
  | CustomColumnFilter
  | { kind: "dynamic"; type: DynamicDateFilter };

/**
 * One of Excel's Date Filters that has no value: dates relative to today, as
 * the computer's clock gives it when the filter applies (`today`,
 * `thisMonth`, `lastQuarter`, `yearToDate` and the others), or the dates
 * in a quarter (`Q1` to `Q4`) or month (`M1` to `M12`) of any year, as
 * All Dates in the Period. Weeks start on Sunday. The names are those of
 * Excel's XLSX `dynamicFilter`.
 */
export type DynamicDateFilter =
  | "tomorrow"
  | "today"
  | "yesterday"
  | "nextWeek"
  | "thisWeek"
  | "lastWeek"
  | "nextMonth"
  | "thisMonth"
  | "lastMonth"
  | "nextQuarter"
  | "thisQuarter"
  | "lastQuarter"
  | "nextYear"
  | "thisYear"
  | "lastYear"
  | "yearToDate"
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "M1"
  | "M2"
  | "M3"
  | "M4"
  | "M5"
  | "M6"
  | "M7"
  | "M8"
  | "M9"
  | "M10"
  | "M11"
  | "M12";

/**
 * Excel's custom AutoFilter: one or two conditions joined by AND or OR. A
 * condition matches as a COUNTIF criterion does: text compares without case,
 * and `*` and `?` in text are wildcards (`~` escapes them).
 */
export interface CustomColumnFilter {
  kind: "custom";
  /** How the two conditions combine; ignored with one condition. */
  join: "and" | "or";
  conditions: readonly [FilterCondition] | readonly [FilterCondition, FilterCondition];
}

/** One condition of a {@link CustomColumnFilter}. */
export interface FilterCondition {
  /**
   * The comparison. `beginsWith`, `endsWith`, `contains` and `notContains`
   * take text; the others take a number (a date is its serial) or text.
   */
  op:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "beginsWith"
    | "endsWith"
    | "contains"
    | "notContains";
  value: number | string;
}

/** Excel's AutoFilter on a sheet: filter buttons on the first row of `range`. */
export interface AutoFilter {
  /**
   * The filtered range, on the sheet that holds it. Its first row is the
   * header: it shows the buttons and is never filtered.
   */
  range: Range;
}

/** A collapsible row group (data-row range, end-inclusive), Sheets-style. */
export interface RowGroup {
  /** Zero-based first row of the group. */
  start: number;
  /** Zero-based last row of the group, included. */
  end: number;
  /** `true` hides the group's rows behind its collapse control. */
  collapsed: boolean;
}

/**
 * Workbook calculation options, mirroring Excel's "Enable iterative calculation".
 * A workbook without this record uses the defaults.
 */
export interface CalculationSettings {
  /** Recalculate circular references iteratively instead of showing `#CYCLE!`; Excel default `false`. */
  iterate: boolean;
  /** Most passes over each circular reference; an integer from 1 to 32,767, Excel default 100. */
  maxIterations: number;
  /** Iteration stops once no value changes by more than this; finite and >= 0, Excel default 0.001. */
  maxChange: number;
}

/** Live workbook schema containing ordered sheets and the active sheet ID. */
export interface Workbook {
  /** Sheets in display/tab order. */
  sheets: Sheet[];
  /** Active sheet ID and initial tab presented when the grid is created. */
  activeSheet: SheetId;
  /** Formula names shared by the workbook or shadowed within a sheet scope. */
  namedRanges?: NamedRangeSnapshot[];
  /** Opaque OOXML graphs from an imported file; edits drop the graphs that depend on them. */
  xlsxSource?: XlsxSourceSnapshot;
  /** Iterative calculation options; absent means the defaults. */
  calculation?: CalculationSettings;
  /** Relationships between workbook tables; absent means none. */
  dataModel?: DataModel;
  /** Saved refreshable queries; absent means none. */
  queries?: SavedQuery[];
  /** Saved values of linked workbooks; absent means none. */
  externalLinks?: ExternalLink[];
}

/** The sheet that `addSheet` adds: its name, and optionally its ID, kind, size, columns and tab position. */
export interface AddSheetInput {
  id?: SheetId;
  name: string;
  /** `"dashboard"` adds a dashboard, which ignores `rowCount` and `columns`. */
  kind?: SheetKind;
  rowCount?: number;
  columns?: Column[];
  /** Zero-based tab position of the new sheet; absent adds it after the last tab. */
  index?: number;
}

/**
 * A defined name: a workbook-global or sheet-scoped name that formulas use.
 * It refers to one rectangular range, or holds a formula such as a constant,
 * an expression or a `LAMBDA`.
 */
export type NamedRangeSnapshot = NamedReferenceSnapshot | NamedFormulaSnapshot;

/** A defined name that refers to one rectangular range. */
interface NamedReferenceSnapshot {
  name: string;
  /** Formula-context sheet whose local definition shadows the workbook definition. */
  scope?: SheetId;
  range: Range;
  formula?: never;
}

/**
 * A defined name that holds a formula, written with its leading `=`.
 * Relative references in it are relative to cell A1, as in an XLSX file: a
 * formula that uses the name at C5 reads them two columns right and four
 * rows down. A `LAMBDA` name is called like a function (`=MYFN(A1)`) in the
 * full engine; the default engine keeps it and returns `#NAME?` for the call.
 */
interface NamedFormulaSnapshot {
  name: string;
  /** Formula-context sheet whose local definition shadows the workbook definition. */
  scope?: SheetId;
  formula: string;
  range?: never;
}

/** Reject-or-warn policy attached to a data-validation rule. */
export type ValidationPolicy = "reject" | "warn" | "allow";

/**
 * The style of Excel's error alert for a value a rule rejects, chosen in Data
 * Validation › Error Alert. `stop` refuses the value (Retry, Cancel);
 * `warning` asks whether to keep it (Yes, No, Cancel); `information` tells
 * the user and keeps it (OK, Cancel).
 */
export type ValidationErrorStyle = "stop" | "warning" | "information";

/**
 * One bound of a validation comparison: a number, or a formula with its
 * leading `=`, such as `"=B1"` or `"=TODAY()"`, as Excel's Minimum and
 * Maximum boxes take. A formula's relative references are relative to the
 * top-left cell of the rule's range; each checked cell reads them shifted to
 * itself, as Excel does.
 */
export type DataValidationOperand = number | string;

/**
 * Native comparison semantics for numeric, date-serial, and text-length validation.
 * Interval operands are inclusive; `notBetween` accepts values outside that interval.
 */
export type DataValidationComparison =
  | {
      operator: "between" | "notBetween";
      min: DataValidationOperand;
      max: DataValidationOperand;
    }
  | {
      operator:
        | "equal"
        | "notEqual"
        | "greaterThan"
        | "lessThan"
        | "greaterThanOrEqual"
        | "lessThanOrEqual";
      value: DataValidationOperand;
    };

/**
 * Serializable condition enforced by a data-validation rule.
 *
 * `min` and `max` are inclusive bounds. Use `comparison` when the operator
 * itself is significant; a condition takes `comparison` or `min`/`max`, not both.
 * Formulas (`source`, `formula`, formula operands) are relative to the
 * top-left cell of the rule's range, as in Excel.
 */
export type DataValidationCondition =
  /** Excel's "Any value": every value passes; the rule carries an input message. */
  | { kind: "any" }
  | { kind: "list"; values: readonly CellScalar[]; allowCustom?: boolean }
  /**
   * A list whose items are the cells of a range or a defined name, written
   * as Excel's Source box takes it: `"=$H$2:$H$5"`, `"=Lists!$A$1:$A$9"` or
   * `"=Regions"`. The list follows edits to those cells.
   */
  | { kind: "list"; source: string; allowCustom?: boolean }
  | {
      kind: "number";
      min?: number;
      max?: number;
      integer?: boolean;
      comparison?: DataValidationComparison;
    }
  | { kind: "date"; min?: number; max?: number; comparison?: DataValidationComparison }
  /** A time of day as a fraction of a day: 0.5 is 12:00. */
  | { kind: "time"; min?: number; max?: number; comparison?: DataValidationComparison }
  | { kind: "textLength"; min?: number; max?: number; comparison?: DataValidationComparison }
  /**
   * Excel's Custom: a value passes when `formula` (with its leading `=`) is
   * TRUE or a non-zero number in its cell with the value in it, as in
   * `"=COUNTIF($A:$A,A1)=1"`.
   */
  | { kind: "custom"; formula: string }
  | {
      kind: "checkbox";
      checkedValue?: CellScalar;
      uncheckedValue?: CellScalar;
    };

/** One stable, range-scoped data-entry rule. Blank cells are allowed unless disabled. */
export interface DataValidationRule {
  /** Stable ID, unique on the sheet; validation issues report it as `ruleId`. */
  id: string;
  /** Cells the rule checks. */
  range: Range;
  /** What a value must satisfy, such as a list of choices or a number range. */
  condition: DataValidationCondition;
  /**
   * `reject` refuses a failing value, `warn` accepts it with a warning, `allow`
   * skips the check. In the grid, `reject` shows a Stop alert, `warn` a Warning
   * or Information alert ({@link DataValidationRule.errorStyle}), and `allow`
   * no alert (Excel's "Show error alert" turned off).
   */
  policy: ValidationPolicy;
  /** Whether clearing a cell passes the rule; defaults to `true`. */
  allowBlank?: boolean;
  /**
   * Whether a list rule shows its dropdown arrow and list (Excel's "In-cell
   * dropdown"); defaults to `true`. Other kinds ignore it.
   */
  inCellDropdown?: boolean;
  /**
   * The error alert's message, shown when a value fails; without it, the grid
   * shows Excel's default text and `MutationIssue.message` is built from the
   * condition. At most 255 characters.
   */
  helpText?: string;
  /** The error alert's title; without it, "Data Validation". At most 32 characters. */
  errorTitle?: string;
  /**
   * The error alert's style. Must agree with `policy`: `stop` (the default)
   * for `reject`; `warning` (the default) or `information` for `warn`. With
   * `allow` it keeps the style chosen while the alert is off; default `stop`.
   */
  errorStyle?: ValidationErrorStyle;
  /** Whether the input message shows when a cell of the rule is selected; defaults to `true`. */
  showInputMessage?: boolean;
  /** The input message's title. At most 32 characters. */
  inputTitle?: string;
  /** The input message, shown beside a selected cell of the rule. At most 255 characters. */
  inputMessage?: string;
}

/** Serializable client UX policy. A host resolver decides whether a local mutation may proceed. */
export interface ProtectedRange {
  /** Stable ID, unique on the sheet. */
  id: string;
  /** Cells the protection covers. */
  range: Range;
  /** Name to show users, such as "Totals"; not used for decisions. */
  label?: string;
  /** Your key for the permission your `ProtectionResolver` checks; Sheetwrite only passes it on. */
  permissionKey?: string;
}

/** Serializable plain-text note anchored to a cell. */
export interface CellNote {
  /** Cell the note is attached to. */
  addr: CellAddress;
  /** The note's plain text. */
  text: string;
}

/** Atomic or partial handling for locally denied operations. */
export type MutationPolicyMode = "atomic" | "partial";

/**
 * The gesture/operation that produced a committed transaction. Consumers
 * switching on reasons MUST keep a default branch — the union grows with new
 * mutation features.
 */
export type CommitReason =
  | "edit-blur"
  | "edit-enter"
  | "edit-tab"
  | "edit-programmatic"
  | "paste"
  /** Never emitted: a cut changes nothing, and its paste commits as `"paste"`. */
  | "cut"
  | "clear"
  | "fill"
  /** Row/column insert/delete/resize. */
  | "structure"
  /** Style, merge, and format actions. */
  | "style"
  /** Find-and-replace. */
  | "replace"
  /** In-place sort that moves the rows of a range. */
  | "sort"
  | "undo"
  | "redo"
  /** Restore of a history version. */
  | "restore"
  /** `store.applyTransaction` from host code / unclassified. */
  | "api";

/** Local operation and protected-range context supplied to the host policy. */
export interface ProtectionRequest {
  /** The protected range the operation touches. */
  protectedRange: Readonly<ProtectedRange>;
  /** The local operation waiting for your answer. */
  operation: Readonly<DocumentOp>;
  /** The user action or API call that produced the operation, such as `"paste"`. */
  commitReason: CommitReason;
}

/** Host-owned client UX permission callback for protected mutations. */
export type ProtectionResolver = (request: ProtectionRequest) => "allow" | "deny";

/** Stable lifecycle rejection codes suitable for inline sheet-management UI. */
export type SheetLifecycleIssueCode =
  | SheetNameIssueCode
  | "duplicate-sheet-id"
  | "sheet-not-found"
  | "invalid-sheet"
  | "invalid-position"
  | "last-visible-sheet";

/** Structured warning or rejection produced while applying an operation. */
export type MutationIssue =
  | {
      kind: "validation";
      severity: "error" | "warning";
      ruleId: string;
      addr: CellAddress;
      value: CellValue;
      message: string;
      operationIndex: number;
    }
  | {
      kind: "protection";
      severity: "error";
      protectedRangeId: string;
      range: Range;
      operationIndex: number;
      message: string;
    }
  | {
      kind: "invalid-operation";
      severity: "error";
      operationIndex: number;
      message: string;
    }
  | {
      kind: "resource-limit";
      severity: "error";
      /**
       * Resource dimension exceeded by the transaction, its server versions,
       * or the durable pending queue; or the document limit a row or column
       * insert would pass (`sheet-rows`, `sheet-columns` and `sheet-cells`
       * per sheet, `local-paged-cells` across the workbook's local sheets,
       * which dense sheets past `maxDenseCells` continue in); or
       * `validation-checks`, the work a transaction's data validation may
       * take, counted in rule tests, list cells read and formula results.
       */
      resource:
        | "operations"
        | "encoded-bytes"
        | "batch-versions"
        | "pending-commits"
        | "pending-operations"
        | "pending-encoded-bytes"
        | "paged-dirty-cells"
        | "paged-reference-simulation"
        | "sheet-rows"
        | "sheet-columns"
        | "sheet-cells"
        | "local-paged-cells"
        | "validation-checks";
      /** Count or incrementally observed encoded bytes at rejection. */
      actual: number;
      /** Configured inclusive ceiling for the resource. */
      max: number;
      message: string;
    }
  | {
      kind: "sheet-lifecycle";
      severity: "error";
      code: SheetLifecycleIssueCode;
      sheet?: SheetId;
      operationIndex: number;
      message: string;
    }
  /** A local write into cells a pivot table's output owns. */
  | {
      kind: "pivot-output";
      severity: "error";
      pivotId: string;
      range: Range;
      operationIndex: number;
      message: string;
    };

/** Persistent display and grouping metadata for one document row. */
export interface RowMetadata {
  /** Row height in CSS pixels; absent uses the theme's row height. */
  height?: number;
  /** `true` hides the row; it keeps its data and formulas. */
  hidden?: boolean;
}

/** Serializable cell value and optional style inside a snapshot block. */
export interface SnapshotCell {
  /** Row of the cell, counted from the block's first row (0 is that row). */
  rowOffset: number;
  /** Column of the cell, counted from the block's first column. */
  colOffset: number;
  /** The cell's content: a literal value, a formula, or a reference. */
  value: CellValue;
  /** The cell's own style, over its column's default. */
  style?: CellStyle;
}
/**
 * Dense row-major mutation payload. Primitive arrays keep large paste/fill
 * operations JSON-safe without allocating one operation object per cell.
 * Formula/reference tuples are sparse exceptions keyed by row-major offset.
 */
export interface PackedCellBlock {
  /** Rows in the block; `values` holds `rowCount * colCount` entries. */
  rowCount: number;
  /** Columns in the block: the length of one row in `values`. */
  colCount: number;
  /** One value per cell, row by row: cell (r, c) is at `r * colCount + c`. */
  values: CellScalar[];
  /** Cells that hold a formula, as row-major offset and source text such as `=A1*2`. */
  formulas?: Array<[offset: number, source: string]>;
  /** Cells that refer to another cell, as row-major offset and the cell they show. */
  refs?: Array<[offset: number, target: CellAddress]>;
  /** The distinct styles the block uses; `styleIds` points into it. */
  styleTable?: CellStyle[];
  /** One index into `styleTable` per cell, in the same order as `values`. */
  styleIds?: number[];
}

/** Sparse row-major cells bounded by one rectangular block. */
export interface CellBlock {
  /** Zero-based sheet row of the block's first row. */
  startRow: number;
  /** Zero-based sheet column of the block's first column. */
  startCol: number;
  /** Rows the block spans, down from `startRow`. */
  rowCount: number;
  /** Columns the block spans, right from `startCol`. */
  colCount: number;
  /** The block's stored cells, placed by offsets from its first row and column. */
  cells: SnapshotCell[];
}

/** Serializable complete state for one workbook sheet. */
export interface SheetSnapshot {
  /** Stable identifier, unique within the workbook and used by every cell address. */
  id: SheetId;
  /** User-facing sheet name shown in tabs and workbook exports. */
  name: string;
  /** Zero-based position of the sheet's tab. */
  order: number;
  /** A dashboard holds items and no cells; absent means a worksheet. */
  kind?: SheetKind;
  /** Items of a dashboard sheet; only on `kind: "dashboard"`. */
  dashboard?: Dashboard;
  /** Hidden worksheets remain in the workbook and retain formulas/references. */
  visibility?: SheetVisibility;
  /** See `Sheet.tabColor`. */
  tabColor?: string;
  /** Rows in the sheet, empty rows after the last stored cell included. */
  rowCount: number;
  /** Keys are stable, unique document column identities as well as datasource keys. */
  columns: Column[];
  /** Leading rows pinned above the scrolling body; absent or 0 means none. */
  frozenRows?: number;
  /** Leading columns pinned left of the scrolling body; absent or 0 means none. */
  frozenCols?: number;
  /** Height and hidden state of rows that differ from the default, as `[row, metadata]` pairs. */
  rowMeta?: Array<[row: number, meta: RowMetadata]>;
  /** Merged-cell regions; covered cells render and export from the top-left cell. */
  merges?: MergeRange[];
  /** Conditional styles, in precedence order. */
  conditionalFormats?: ConditionalFormatRule[];
  /** Hyperlinks attached to ranges of the sheet. */
  hyperlinks?: CellHyperlink[];
  /** Data-entry rules checked when a value is written. */
  validationRules?: DataValidationRule[];
  /** Ranges whose edits go through your `ProtectionResolver`. */
  protectedRanges?: ProtectedRange[];
  /** Plain-text notes attached to cells. */
  notes?: CellNote[];
  /** Sort keys of the sheet's view, primary first. */
  sortKeys?: SortKey[];
  /** See `Sheet.sortState`. */
  sortState?: WorkbookTableXmlElement;
  /** Column filters of the sheet's view, as `[column index, filter]` pairs. */
  filters?: Array<[col: number, filter: ColumnFilter]>;
  /** See `Sheet.autoFilter`. */
  autoFilter?: AutoFilter;
  /** Collapsible row groups. */
  rowGroups?: RowGroup[];
  /** Workbook tables anchored on this sheet. */
  tables?: WorkbookTable[];
  /** Charts anchored on this sheet. */
  charts?: ChartDefinition[];
  /** Pivot tables anchored on this sheet. */
  pivots?: PivotDefinition[];
  /** The sheet's non-empty cells, in rectangular blocks. */
  cells: CellBlock[];
}

/**
 * One retained OOXML part, kept as its original compressed ZIP payload so a
 * save copies it without inflating or recompressing. Runtime copies are frozen.
 */
export interface XlsxSourcePart {
  /** Path of the part inside the `.xlsx` file, such as `xl/media/image1.png`. */
  readonly name: string;
  /** The part's MIME content type from the package's `[Content_Types].xml`. */
  readonly contentType: string;
  /** ZIP compression method of `data`: 0 for stored, 8 for deflate. */
  readonly method: 0 | 8;
  /** CRC-32 checksum of the uncompressed part, as the ZIP entry records it. */
  readonly crc32: number;
  /** Size of the part in bytes once uncompressed. */
  readonly uncompressedSize: number;
  /** Base64 of the compressed payload. */
  readonly data: string;
}

/** What an opaque graph reads; any change to it drops the graph on save. */
export interface XlsxSourceDependency {
  /** Stable ID of the sheet the graph reads. */
  readonly sheetId: SheetId;
  /** Sheet name at import; OOXML formulas inside the graph refer to sheets by name. */
  readonly name: string;
  /** `layout` graphs (images) only follow row/column structure; `values` graphs (charts, pivots) read cells. */
  readonly scope: "layout" | "values";
  /** 64-bit hex fingerprint of the sheet at import, for snapshots edited outside a Store. */
  readonly digest: string;
}

/** One relationship from the package, workbook, or a sheet to a retained part graph. */
export interface XlsxSourceGraph {
  /** Which part holds the relationship: the package root, the workbook, or a sheet. */
  readonly owner: "root" | "workbook" | "sheet";
  /** Stable ID of the owning sheet when `owner` is `"sheet"`. */
  readonly sheetId?: SheetId;
  /** OPC relationship type URI. */
  readonly type: string;
  /** Relationship target part. */
  readonly target: string;
  /** Pivot cache id written into `<pivotCaches>`. */
  readonly cacheId?: string;
  /**
   * 64-bit hex digest of `workbook.queries` at import, for graphs that hold
   * saved query definitions (the DataMashup and its connections). Any query
   * change makes the graph stale, so it is dropped.
   */
  readonly queries?: string;
  /**
   * 64-bit hex digest of the `workbook.externalLinks` entry that an external
   * link part holds, at import. When that link's values change, the part is
   * stale: it is dropped and the link is written from the model.
   */
  readonly externalLink?: string;
  /**
   * Power Query members of a kept DataMashup that no saved query represents,
   * with the codec's reason. They leave with the graph, so a list never names
   * a member that the next XLSX save would drop.
   */
  readonly unsupportedQueries?: readonly XlsxUnsupportedQuery[];
  /** Every retained part reached from `target`, including `.rels` parts. */
  readonly parts: readonly string[];
  /** Sheets the graph reads; a change to any of them drops the graph on save. */
  readonly dependencies: readonly XlsxSourceDependency[];
}

/** A kept Power Query member and why the query engine cannot run it. */
export interface XlsxUnsupportedQuery {
  /** Section member name, at most 1,024 characters. */
  readonly member: string;
  /** The codec's reason code, at most 64 characters. */
  readonly reason: string;
}

/** Bounded, frozen record of the OOXML parts Sheetwrite does not model. */
export interface XlsxSourceSnapshot {
  /** The kept parts, each still compressed as in the original file. */
  readonly parts: readonly XlsxSourcePart[];
  /** The relationships that reach the kept parts, with what each one depends on. */
  readonly graphs: readonly XlsxSourceGraph[];
  /** Targets of graphs dropped by committed edits; undo does not restore them. */
  readonly dropped?: readonly string[];
}

/** Schema-versioned serializable workbook document. */
export interface WorkbookSnapshot {
  /** Format version of the snapshot; always `1`. */
  schemaVersion: 1;
  /** ID of the document in your storage, kept through sync and persistence. */
  documentId?: string;
  /** Document version the snapshot was taken at, as sync and persistence count it; absent means 0. */
  version?: number;
  /** Workbook-wide state: the active sheet, named ranges, and kept XLSX parts. */
  workbook: {
    /** Stable ID of the sheet shown when the workbook opens. */
    activeSheet: SheetId;
    namedRanges?: NamedRangeSnapshot[];
    /** Opaque OOXML graphs kept for the next XLSX save; never interpreted by Sheetwrite. */
    xlsxSource?: XlsxSourceSnapshot;
    /** Iterative calculation options; omitted when every field has its default. */
    calculation?: CalculationSettings;
    /** Relationships between workbook tables; omitted when there are none. */
    dataModel?: DataModel;
    /** Saved refreshable queries; omitted when there are none. */
    queries?: SavedQuery[];
    /** Saved values of linked workbooks; omitted when there are none. */
    externalLinks?: ExternalLink[];
  };
  /** Every sheet of the workbook, worksheets and dashboards alike. */
  sheets: SheetSnapshot[];
}

/** Exhaustive serializable operation union for workbook mutations. */
export type DocumentOp =
  | { op: "set"; addr: CellAddress; value: CellValue; style?: CellStyle }
  | { op: "setRange"; range: Range; cells: SnapshotCell[] }
  | { op: "setBlock"; range: Range; block: PackedCellBlock }
  | {
      op: "restoreBlock";
      range: Range;
      encoding: "deflate-json-v1";
      decodedBytes: number;
      data: string;
    }
  | { op: "setRangeStyle"; range: Range; style: Partial<CellStyle> | null }
  | { op: "clearRange"; range: Range; contents?: boolean; style?: boolean }
  /**
   * Move the rows of `range` by a permutation, as an in-place sort does. Target
   * row offset `i` receives the cells of source row offset `order[i]`. `order`
   * holds one little-endian `u32` per row of `range`, in base64.
   */
  | { op: "permuteRows"; range: Range; encoding: "u32le-base64-v1"; order: string }
  | { op: "addRows"; sheet: SheetId; at: number; count: number }
  | { op: "removeRows"; sheet: SheetId; at: number; count: number }
  | { op: "moveRows"; sheet: SheetId; from: number; count: number; to: number }
  | { op: "addColumns"; sheet: SheetId; at: number; columns: Column[] }
  | { op: "removeColumns"; sheet: SheetId; at: number; count: number }
  | { op: "moveColumns"; sheet: SheetId; from: number; count: number; to: number }
  /**
   * Move the cells of `range` so that its top-left cell lands on `to`, which
   * may be on another sheet, as Excel's Cut and Paste does. The cells it
   * lands on are replaced, the cells it leaves are emptied, and every
   * reference to a moved cell follows it.
   *
   * With `shift`, it is Excel's Insert or Delete with Shift cells instead:
   * `range` moves along one axis of its sheet, and references to every cell
   * of its columns (rows, for a move along a row) from where it starts or
   * lands to the sheet's edge follow the rule of inserted and deleted rows.
   * Moving down or right inserts the cells it leaves; moving up or left
   * deletes the cells between where it lands and where it started, so
   * references to them become `#REF!`.
   */
  | { op: "moveCells"; range: Range; to: CellAddress; shift?: true }
  | { op: "setColumn"; sheet: SheetId; col: number; patch: Partial<Column> }
  | { op: "setRowMeta"; sheet: SheetId; row: number; meta: RowMetadata | null }
  | { op: "addMerge"; sheet: SheetId; merge: MergeRange }
  | { op: "removeMerge"; sheet: SheetId; merge: MergeRange }
  | { op: "addSheet"; sheet: SheetSnapshot }
  | { op: "removeSheet"; sheet: SheetId }
  | { op: "renameSheet"; sheet: SheetId; name: string }
  | { op: "moveSheet"; sheet: SheetId; to: number }
  | { op: "setSheetVisibility"; sheet: SheetId; visibility: SheetVisibility }
  | { op: "addTable"; table: WorkbookTable }
  | { op: "updateTable"; sheet: SheetId; tableId: string; patch: WorkbookTablePatch }
  | { op: "removeTable"; sheet: SheetId; tableId: string }
  | {
      op: "setSheetMeta";
      sheet: SheetId;
      patch: {
        frozenRows?: number;
        frozenCols?: number;
        conditionalFormats?: ConditionalFormatRule[];
        rowGroups?: RowGroup[];
        sortKeys?: SortKey[];
        filters?: Array<[col: number, filter: ColumnFilter]>;
        /** Turn the sheet's AutoFilter on for a range, or off with `null`. */
        autoFilter?: AutoFilter | null;
        /** Color the sheet's tab (`#RRGGBB`), or show the default tab with `null`. */
        tabColor?: string | null;
      };
    }
  | { op: "setValidationRule"; sheet: SheetId; rule: DataValidationRule }
  | { op: "removeValidationRule"; sheet: SheetId; id: string }
  | { op: "setHyperlink"; sheet: SheetId; hyperlink: CellHyperlink }
  | { op: "removeHyperlink"; sheet: SheetId; id: string }
  | { op: "setProtectedRange"; sheet: SheetId; protectedRange: ProtectedRange }
  | { op: "removeProtectedRange"; sheet: SheetId; id: string }
  | { op: "setNote"; addr: CellAddress; text: string | null }
  | { op: "setNamedRange"; namedRange: NamedRangeSnapshot }
  | { op: "removeNamedRange"; name: string; scope?: SheetId }
  | { op: "setCalculation"; calculation: CalculationSettings }
  /** Replace the saved values of every linked workbook; an empty list removes them. */
  | { op: "setExternalLinks"; links: ExternalLink[] }
  /** Insert or replace the relationship with `relationship.id`. */
  | { op: "setRelationship"; relationship: TableRelationship }
  | { op: "removeRelationship"; id: string }
  /** Insert or replace a model measure by its stable identity. */
  | { op: "setMeasure"; measure: Measure }
  /** Remove a measure while keeping pivot references for undo. */
  | { op: "removeMeasure"; id: string }
  /** Insert or replace the saved query with `query.id`. */
  | { op: "setQuery"; query: SavedQuery }
  /** Remove a saved query; its output table and values stay. */
  | { op: "removeQuery"; id: string }
  | { op: "setChart"; sheet: SheetId; chart: ChartDefinition }
  | { op: "removeChart"; sheet: SheetId; id: string }

  /** Insert or replace the pivot with `pivot.id` on `sheet`. */
  | { op: "setPivot"; sheet: SheetId; pivot: PivotDefinition }
  | { op: "removePivot"; sheet: SheetId; id: string }

  /** Insert or replace the item with `item.id` on the dashboard `sheet`. */
  | { op: "setDashboardItem"; sheet: SheetId; item: DashboardItem }
  | { op: "removeDashboardItem"; sheet: SheetId; id: string };
