// XLSX backend contracts shared by core's XLSX bridge and the XLSX add-on.
// No runtime values live here.

import type { CellScalar } from "./cell.js";
import type { ChartView } from "./chart.js";
import type { SheetId } from "./coordinates.js";
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
  /** Short backend name; failures carry it in their `context.backend`. */
  name: string;
  /** Writes the workbook's active sheet as a one-sheet `.xlsx` table, header row first. */
  toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
  /** The same file as `toXlsxTable`, yielded in chunks; without it, `toXlsxTableStream` throws. */
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
  /** Short backend name; failures carry it in their `context.backend`. */
  name: string;
  /** Reads the first sheet, using the first row's text as column keys. */
  fromXlsxTable(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<ColumnarData>;
}

/** Structured fidelity warning emitted during XLSX conversion. */
export interface XlsxWorkbookWarning {
  /** What was lost or changed, such as `rich-text` when formatted runs became plain text. */
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
  /** One English sentence for logs; match on `code`, not on this text. */
  message: string;
  /** Name of the worksheet the warning is about, when it is about one. */
  sheet?: string;
  /** A1-style reference of the cell, such as `B4`, when the warning is about one cell. */
  cell?: string;
  /** Path of the package part inside the `.xlsx` file, such as `xl/comments1.xml`. */
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
  /**
   * Called for each fidelity warning as it happens, at most 64 times per call;
   * the conversion goes on after each one.
   */
  onWarning?: (warning: XlsxWorkbookWarning) => void;
  /**
   * Power Query translation for saved queries, such as `loadPowerQueryCodec()`
   * from `@sheetwrite/queries`. Without it, import keeps query parts as opaque
   * parts, and export writes them back only while `workbook.queries` is
   * unchanged since import.
   */
  powerQuery?: PowerQueryCodec;
  /**
   * How export compresses the parts of the file; import ignores it.
   * `"deterministic"`, the default, uses the bundled `fflate` codec, so one
   * workbook gives the same bytes in every runtime. `"native"` uses the
   * runtime's `CompressionStream` where it has one, and `fflate` elsewhere.
   * It is faster, but the compressed bytes differ between runtimes and can
   * change when the runtime is updated. The parts of the file, and what Excel
   * reads from them, are the same.
   */
  compression?: "deterministic" | "native";
}

/** @internal One installed spill and the values it shows now. */
export interface XlsxSpillExport {
  /** Row of the formula that spills. */
  readonly row: number;
  /** Column of the formula that spills. */
  readonly col: number;
  /** Rows the spill covers, the formula's own row included. */
  readonly rows: number;
  /** Columns the spill covers, the formula's own column included. */
  readonly cols: number;
  /** Every covered cell's value, row by row: the formula's own value first. */
  readonly values: readonly CellScalar[];
}

/**
 * What core tells an XLSX workbook backend about a snapshot it built for this
 * export call. Core fills it; a backend only reads it.
 */
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
  /** The resolved view of each worksheet chart over a pivot, by sheet and chart ID. */
  readonly pivotCharts?: ReadonlyMap<SheetId, ReadonlyMap<string, ChartView>>;
  /** The rows each worksheet AutoFilter hides, by sheet; Excel stores them hidden. */
  readonly filteredRows?: ReadonlyMap<SheetId, readonly number[]>;
  /**
   * The installed spills of each worksheet, by sheet. Excel marks their
   * formulas as dynamic arrays and keeps their values in the covered cells.
   */
  readonly spills?: ReadonlyMap<SheetId, readonly XlsxSpillExport[]>;
}

/** Optional backend contract for complete workbook XLSX interchange. */
export interface XlsxWorkbookBackend {
  /** Short backend name; failures carry it in their `context.backend`. */
  name: string;
  /** Writes a whole workbook snapshot, formulas included, to `.xlsx` bytes. */
  toXlsxWorkbook(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
    context?: XlsxWorkbookExportContext,
  ): Promise<Uint8Array>;
  /** Reads every sheet of `.xlsx` bytes into a workbook snapshot, formulas included. */
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
  /** The same file as `toXlsxWorkbook`, yielded in chunks; without it, `toXlsxWorkbookStream` throws. */
  toXlsxWorkbookStream?(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
    context?: XlsxWorkbookExportContext,
  ): AsyncIterable<Uint8Array>;
  /** Reads a `Blob` directly; without it, `fromXlsxWorkbookFile` reads the whole file into memory first. */
  fromXlsxWorkbookFile?(file: Blob, options?: XlsxWorkbookOptions): Promise<WorkbookSnapshot>;
  /**
   * Checks the kept XLSX parts of a snapshot as a store loads it, without
   * keeping inflated bytes. Sheetwrite calls it; your code does not need to.
   *
   * @internal
   */
  verifySource?(snapshot: WorkbookSnapshot): WorkbookSnapshot["workbook"]["xlsxSource"];
}
