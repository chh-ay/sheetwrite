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
  name: string;
  attributes: Record<string, string>;
  text: string;
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
  name?: string;
  showFirstColumn?: boolean;
  showLastColumn?: boolean;
  showRowStripes?: boolean;
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
  style?: WorkbookTableStyle;
  /** Persisted Excel filter rules; not applied to rows by the Sheetwrite engine. */
  autoFilter?: WorkbookTableXmlElement;
  /** Persisted Excel sort state; not applied to rows by the Sheetwrite engine. */
  sortState?: WorkbookTableXmlElement;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}

/** Mutable table fields accepted by the explicit update operation. */
export interface WorkbookTablePatch {
  name?: string;
  range?: Range;
  columns?: WorkbookTableColumn[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: WorkbookTableStyle | null;
  autoFilter?: WorkbookTableXmlElement | null;
  sortState?: WorkbookTableXmlElement | null;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}
