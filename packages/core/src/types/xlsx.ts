// XLSX backend contracts shared by core's XLSX bridge and the XLSX add-on.
// No runtime values live here.

import type { DashboardExport } from "./dashboard.js";
import type { ColumnarData } from "./data.js";
import type { Workbook, WorkbookSnapshot } from "./document.js";
import type { PowerQueryCodec } from "./query.js";
import type { Store } from "./store.js";

/** Resource dimensions bounded by every XLSX import and export path. */
export interface XlsxResourceLimits {
  /** Compressed workbook input bytes; defaults to 32 MiB. */
  maxInputBytes: number;
  /** Encoded workbook output bytes; defaults to 128 MiB. */
  maxOutputBytes: number;
  /** ZIP archive entries; defaults to 1,024. */
  maxArchiveEntries: number;
  /** Uncompressed bytes in any one ZIP entry; defaults to 64 MiB. */
  maxEntryUncompressedBytes: number;
  /** Aggregate uncompressed ZIP entry bytes; defaults to 256 MiB. */
  maxTotalUncompressedBytes: number;
  /** Retained opaque compressed payload bytes; defaults to 64 MiB. */
  maxPreservedBytes: number;
  /** Uncompressed-to-compressed ratio for one ZIP entry; defaults to 100. */
  maxCompressionRatio: number;
  /** Workbook worksheets; defaults to 256. */
  maxSheets: number;
  /** Rows in any worksheet; defaults to 1,048,576. */
  maxRowsPerSheet: number;
  /** Columns in any worksheet; defaults to 16,384. */
  maxColumnsPerSheet: number;
  /** Cells accounted by the active conversion path; defaults to 1,000,000. */
  maxCells: number;
  /** Aggregate merged ranges; defaults to 100,000. */
  maxMerges: number;
  /** Shared-string table entries; defaults to 1,000,000. */
  maxSharedStrings: number;
  /** Style-related records; defaults to 65,536. */
  maxStyles: number;
  /** Elements in any one XML part; defaults to 2,000,000. */
  maxXmlElements: number;
  /** Element nesting depth in any one XML part; defaults to 64. */
  maxXmlDepth: number;
  /** Attributes on any one XML element; defaults to 128. */
  maxXmlAttributesPerElement: number;
  /** UTF-8 text bytes in one XML element or attribute; defaults to 16 MiB. */
  maxXmlTextBytes: number;
}

/**
 * Pluggable first-row-header, first-sheet table export backend.
 */
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
  toXlsxTableStream?(
    workbook: Workbook,
    store: Store,
    options?: XlsxWorkbookOptions,
  ): AsyncIterable<Uint8Array>;
}

/**
 * Pluggable table import backend. Parses raw `.xlsx` bytes into the same
 * `ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
 * format-agnostic.
 */
export interface XlsxTableImportBackend {
  name: string;
  fromXlsxTable(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<ColumnarData>;
}

/** Structured fidelity warning emitted during XLSX conversion. */
export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature"
    | "external-relationship"
    | "external-formula"
    | "format-loss"
    | "validation-loss"
    | "invalid-metadata"
    | "query-loss";
  message: string;
  sheet?: string;
  cell?: string;
  part?: string;
}

/** Shared options passed to every registered table and workbook XLSX backend. */
export interface XlsxWorkbookOptions {
  /**
   * Checked before the work and once per ZIP entry, worksheet and chunk of
   * cells. After it fires, the call rejects (or the stream errors) with
   * `signal.reason`, not with a `SheetwriteError`.
   */
  signal?: AbortSignal;
  /** Cells accounted by the active conversion path; defaults to 1,000,000. */
  maxCells?: number;
  /** Positive overrides for every XLSX resource dimension except `maxCells`. */
  resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
  /**
   * Power Query translation for saved queries, such as `loadPowerQueryCodec()`
   * from `@sheetwrite/queries`. Without it, import keeps query parts as opaque
   * parts, and export writes them back only while `workbook.queries` is
   * unchanged since import.
   */
  powerQuery?: PowerQueryCodec;
}

/** @internal Core-owned provenance for snapshots it materialized during this call. */
export interface XlsxWorkbookExportContext {
  readonly sourceTracked?: boolean;
  /** Static content of each dashboard sheet, which only core can compute. */
  readonly dashboards?: readonly DashboardExport[];
  /**
   * Current output of each worksheet pivot, by sheet: each item's `id` is a
   * pivot ID and its cells start at the pivot's anchor. The export writes
   * them for pivots it keeps in Sheetwrite metadata, as Excel files carry a
   * pivot's output as cell values.
   */
  readonly pivotOutputs?: readonly DashboardExport[];
}

/** Optional backend contract for complete workbook XLSX interchange. */
export interface XlsxWorkbookBackend {
  name: string;
  toXlsxWorkbook(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
    context?: XlsxWorkbookExportContext,
  ): Promise<Uint8Array>;
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
  toXlsxWorkbookStream?(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
    context?: XlsxWorkbookExportContext,
  ): AsyncIterable<Uint8Array>;
  fromXlsxWorkbookFile?(file: Blob, options?: XlsxWorkbookOptions): Promise<WorkbookSnapshot>;
  /** @internal Verify opaque payloads at store ingress, without retaining inflated bytes. */
  verifySource?(snapshot: WorkbookSnapshot): WorkbookSnapshot["workbook"]["xlsxSource"];
}
