import type { CellStyle } from "./cell.js";
import type { Range } from "./coordinates.js";

/** Stable identity for a workbook table. Names may change; IDs never do. */
export type WorkbookTableId = string;

/**
 * Bounded OOXML table-rule metadata. Names are unprefixed SpreadsheetML element
 * names, not markup; the XLSX writer escapes text and attribute values. Keeping
 * the rule tree avoids flattening date groups, custom filters or sort options
 * into Sheetwrite's independently evaluated worksheet filters.
 */
export interface WorkbookTableXmlElement {
  /** SpreadsheetML element name without a prefix, such as `filterColumn`. */
  name: string;
  /** The element's attributes as unescaped name and value text. */
  attributes: Record<string, string>;
  /** The element's own text content, unescaped; empty when it has none. */
  text: string;
  /** Child elements, in document order. */
  children: WorkbookTableXmlElement[];
  /** Style behind a color filter/sort rule; dxfId is regenerated on export. */
  differentialStyle?: CellStyle;
}

/** Aggregate Excel offers for a totals-row cell. */
export type WorkbookTableTotalsFunction =
  | "none"
  | "sum"
  | "min"
  | "max"
  | "average"
  | "count"
  | "countNums"
  | "stdDev"
  | "var"
  | "custom";

/** Stable identity and display metadata for one ordered table column. */
export interface WorkbookTableColumn {
  /** Stable ID, unique within the table; it stays the same when the column is renamed. */
  id: string;
  /** Case-insensitively unique within the table. */
  name: string;
  /** Optional text written in the totals row. Formula cells remain authoritative cell sources. */
  totalsRowLabel?: string;
  /** Persisted rule; existing totals-row cells remain authoritative cell sources. */
  totalsRowFunction?: WorkbookTableTotalsFunction;
  /** OOXML formula text (without `=`), including its optional array attribute. */
  totalsRowFormula?: WorkbookTableXmlElement;
  /** Rule Excel fills into new rows; existing data cells remain authoritative. */
  calculatedColumnFormula?: WorkbookTableXmlElement;
}

/** Bounded native subset of ECMA-376 table style information. */
export interface WorkbookTableStyle {
  /** Excel table style name, such as `TableStyleMedium2`. */
  name?: string;
  /** Whether the first column gets the style's emphasis. */
  showFirstColumn?: boolean;
  /** Whether the last column gets the style's emphasis. */
  showLastColumn?: boolean;
  /** Whether rows alternate in colour (banded rows). */
  showRowStripes?: boolean;
  /** Whether columns alternate in colour (banded columns). */
  showColumnStripes?: boolean;
}

/**
 * OOXML table features outside the persisted rule subset are retained as explicit
 * loss metadata rather than silently flattened into an ordinary range.
 */
export type WorkbookTableUnsupportedFeature =
  | "auto-filter"
  | "sort-state"
  | "calculated-columns"
  | "totals-functions"
  | "query-table"
  | "external-data"
  | "extensions";

/** Serializable canonical workbook table. Its range includes header/totals rows. */
export interface WorkbookTable {
  /** Stable ID, unique in the workbook; it stays the same when the table is renamed. */
  id: WorkbookTableId;
  /** Workbook-global, case-insensitively unique structured-reference name. */
  name: string;
  /** Inclusive table rectangle on one stable sheet ID. */
  range: Range;
  /** Ordered stable columns; length is exactly the table rectangle width. */
  columns: WorkbookTableColumn[];
  /** Whether the first range row is the structured-reference header row. */
  headerRow: boolean;
  /** Whether the last range row is the structured-reference totals row. */
  totalsRow: boolean;
  /** How the table looks in Excel and in the grid. */
  style?: WorkbookTableStyle;
  /** Persisted Excel filter rules; not applied to rows by the Sheetwrite engine. */
  autoFilter?: WorkbookTableXmlElement;
  /** Persisted Excel sort state; not applied to rows by the Sheetwrite engine. */
  sortState?: WorkbookTableXmlElement;
  /** Excel table features in the file that Sheetwrite keeps but does not model. */
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}

/** Mutable table fields accepted by the explicit update operation. */
export interface WorkbookTablePatch {
  /** Replaces the structured-reference name; unique in the workbook, ignoring case. */
  name?: string;
  /** Replaces the table's rectangle, header and totals rows included. */
  range?: Range;
  /** Replaces the columns; there must be one per column of the range. */
  columns?: WorkbookTableColumn[];
  /** Turns the header row on or off. */
  headerRow?: boolean;
  /** Turns the totals row on or off. */
  totalsRow?: boolean;
  /** Replaces the style; `null` removes it. */
  style?: WorkbookTableStyle | null;
  /** Replaces the saved Excel filter rules; `null` removes them. */
  autoFilter?: WorkbookTableXmlElement | null;
  /** Replaces the saved Excel sort state; `null` removes it. */
  sortState?: WorkbookTableXmlElement | null;
  /** Replaces the list of kept Excel features Sheetwrite does not model. */
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}
