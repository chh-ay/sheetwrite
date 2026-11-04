import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { readableBytes } from "./export-stream.js";
import { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { ColumnarData } from "./types/data.js";
import type { Workbook, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { Store } from "./types/store.js";
import { hasAdmittedXlsxSource, setXlsxSourceVerifier } from "./xlsx-source.js";

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
 * Codec defaults combine SpreadsheetML worksheet dimensions with independent
 * ZIP/XML and aggregate-work ceilings for untrusted in-memory conversion.
 */
export const DEFAULT_XLSX_RESOURCE_LIMITS: Readonly<XlsxResourceLimits> = Object.freeze({
  // Bound caller input and the single returned byte array.
  maxInputBytes: 32 * 1024 * 1024,
  maxOutputBytes: 128 * 1024 * 1024,
  // Bound archive fan-out and decompression, including zip-bomb ratios.
  maxArchiveEntries: 1_024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxPreservedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 100,
  // SpreadsheetML worksheet compatibility dimensions.
  maxSheets: 256,
  maxRowsPerSheet: 1_048_576,
  maxColumnsPerSheet: 16_384,
  // Bound aggregate conversion collections.
  maxCells: 1_000_000,
  maxMerges: 100_000,
  maxSharedStrings: 1_000_000,
  maxStyles: 65_536,
  // Bound each hand-parsed XML part independently.
  maxXmlElements: 2_000_000,
  maxXmlDepth: 64,
  maxXmlAttributesPerElement: 128,
  maxXmlTextBytes: 16 * 1024 * 1024,
});

/** Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data. */
export class XlsxResourceError extends SheetwriteError {
  override readonly name = "XlsxResourceError";
  declare readonly code: "xlsx-resource-limit";

  constructor(
    readonly resource: keyof XlsxResourceLimits,
    readonly limit: number,
    readonly actual: number,
    operation: "import" | "export",
  ) {
    super(
      "xlsx-resource-limit",
      `xlsx-${operation}`,
      `Sheetwrite: XLSX ${operation} ${resource} limit is ${limit}; observed ${actual}`,
      { context: { format: "xlsx", resource, limit, actual } },
    );
  }
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

let tableExportBackend: XlsxTableExportBackend | null = null;

/** Registers the optional table XLSX export implementation used by core. */
export function setXlsxTableExportBackend(next: XlsxTableExportBackend): void {
  tableExportBackend = next;
}

function missingXlsxBackend(
  functionName: string,
  operation: "xlsx-import" | "xlsx-export",
): SheetwriteError {
  return new SheetwriteError(
    "optional-backend-unavailable",
    operation,
    `Sheetwrite: XLSX backend not registered. Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling ${functionName}.`,
    { context: { backend: "xlsx", functionName }, retryable: false },
  );
}

/**
 * Characters of a registered backend name copied into a failure context. A name
 * is an identifier, but it comes from the host, so a long one is cut.
 */
const MAX_BACKEND_NAME_LENGTH = 256;

/** Which public XLSX call failed, through which registered backend. */
interface XlsxCallSite {
  readonly operation: "xlsx-import" | "xlsx-export";
  readonly backend: string;
  readonly functionName: string;
}

/**
 * The rejection of a failed XLSX call. An abort is not a failure: once the
 * caller's signal fired, the result is `signal.reason`, unwrapped.
 */
function xlsxCallFailure(
  error: unknown,
  signal: AbortSignal | undefined,
  site: XlsxCallSite,
): unknown {
  if (signal?.aborted) return signal.reason;
  return normalizeSheetwriteError(
    error,
    site.operation === "xlsx-export" ? "export-failed" : "xlsx-import-failed",
    site.operation,
    {
      backend: site.backend.slice(0, MAX_BACKEND_NAME_LENGTH),
      functionName: site.functionName,
    },
  );
}

/**
 * Exports a table model through the registered optional XLSX backend.
 *
 * @example
 * ```ts
 * import { registerXlsxBackends } from "@sheetwrite/xlsx";
 * import { toXlsxTable, downloadBytes, type Workbook, type Store } from "@sheetwrite/core";
 *
 * registerXlsxBackends();
 * async function download(workbook: Workbook, store: Store) {
 *   const bytes = await toXlsxTable(workbook, store);
 *   downloadBytes(bytes, "table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 * }
 * ```
 * @see fromXlsxTable
 */
export async function toXlsxTable(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = tableExportBackend;
  if (!backend) throw missingXlsxBackend("toXlsxTable", "xlsx-export");
  try {
    options?.signal?.throwIfAborted();
    return await backend.toXlsxTable(workbook, store, options);
  } catch (error) {
    throw xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxTable",
    });
  }
}

/** Stream table XLSX bytes without materializing the finished archive. */
export function toXlsxTableStream(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): ReadableStream<Uint8Array> {
  const backend = tableExportBackend;
  if (!backend?.toXlsxTableStream) throw missingXlsxBackend("toXlsxTableStream", "xlsx-export");
  return readableBytes(backend.toXlsxTableStream(workbook, store, options), (error) =>
    xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxTableStream",
    }),
  );
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

let tableImportBackend: XlsxTableImportBackend | null = null;

/** Registers the optional table XLSX import implementation used by core. */
export function setXlsxTableImportBackend(next: XlsxTableImportBackend): void {
  tableImportBackend = next;
}

/**
 * Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
 * row is treated as the header and its cell text becomes each column's key.
 * Numbers stay numbers, date cells use the date-serial convention, strings are
 * verbatim, and empty cells become `null`.
 *
 * @example
 * ```ts
 * import { registerXlsxBackends } from "@sheetwrite/xlsx";
 * import { fromXlsxTable } from "@sheetwrite/core";
 *
 * registerXlsxBackends();
 * async function openTable(file: File) {
 *   return fromXlsxTable(await file.arrayBuffer());
 * }
 * ```
 * @see toXlsxTable
 */
export async function fromXlsxTable(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<ColumnarData> {
  const backend = tableImportBackend;
  if (!backend) throw missingXlsxBackend("fromXlsxTable", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxTable(data, options);
  } catch (error) {
    throw xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-import",
      backend: backend.name,
      functionName: "fromXlsxTable",
    });
  }
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
    | "invalid-metadata";
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
}

/** @internal Core-owned provenance for snapshots it materialized during this call. */
interface XlsxWorkbookExportContext {
  readonly sourceTracked?: boolean;
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

let workbookBackend: XlsxWorkbookBackend | null = null;

/** Registers the optional workbook XLSX implementation used by core. */
export function setXlsxWorkbookBackend(next: XlsxWorkbookBackend | null): void {
  workbookBackend = next;
  setXlsxSourceVerifier(next?.verifySource?.bind(next));
}

/** Whether workbook import can be offered without loading an optional backend. */
export function hasXlsxWorkbookBackend(): boolean {
  return workbookBackend !== null;
}

/**
 * Only a SheetwriteStore drops stale XLSX graphs as edits commit, so the
 * export is tracked only when core itself builds the snapshot from one, through
 * the class method that a caller cannot replace per instance. Custom stores,
 * look-alike objects and plain snapshots take the backend's fingerprint check.
 */
function workbookSnapshotOf(input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">): {
  snapshot: WorkbookSnapshot;
  context: XlsxWorkbookExportContext;
} {
  if ("schemaVersion" in input) return { snapshot: input, context: {} };
  const store = "store" in input ? input.store : input;
  if (!(store instanceof SheetwriteStore) || storeEngine(store) === null) {
    return { snapshot: input.exportSnapshot(), context: {} };
  }

  const snapshot = SheetwriteStore.prototype.exportSnapshot.call(store);
  // A Grid may show a different tab than the store's stored active sheet.
  const activeSheet: unknown =
    "getActiveSheet" in input && typeof input.getActiveSheet === "function"
      ? input.getActiveSheet()
      : undefined;
  const switched =
    typeof activeSheet === "string" &&
    activeSheet !== snapshot.workbook.activeSheet &&
    snapshot.sheets.some((sheet) => sheet.id === activeSheet);
  return {
    snapshot: switched
      ? { ...snapshot, workbook: { ...snapshot.workbook, activeSheet } }
      : snapshot,
    context: { sourceTracked: hasAdmittedXlsxSource(store) },
  };
}

/**
 * Formula-preserving, multi-sheet workbook export through the optional XLSX backend.
 *
 * @example
 * ```ts
 * import { registerXlsxBackends } from "@sheetwrite/xlsx";
 * import { toXlsxWorkbook, downloadBytes, type Grid } from "@sheetwrite/core";
 *
 * registerXlsxBackends();
 * async function download(grid: Grid) {
 *   const bytes = await toXlsxWorkbook(grid);
 *   downloadBytes(bytes, "workbook.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 * }
 * ```
 * @see fromXlsxWorkbook
 */
export async function toXlsxWorkbook(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = workbookBackend;
  if (!backend) throw missingXlsxBackend("toXlsxWorkbook", "xlsx-export");
  try {
    // Checked before the snapshot is built, which is the largest step on this side.
    options?.signal?.throwIfAborted();
    const source = workbookSnapshotOf(input);
    return await backend.toXlsxWorkbook(source.snapshot, options, source.context);
  } catch (error) {
    throw xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxWorkbook",
    });
  }
}

/** Stream formula-preserving workbook XLSX with backpressure and cancellation. */
export function toXlsxWorkbookStream(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): ReadableStream<Uint8Array> {
  const backend = workbookBackend;
  if (!backend?.toXlsxWorkbookStream)
    throw missingXlsxBackend("toXlsxWorkbookStream", "xlsx-export");
  const source = workbookSnapshotOf(input);
  return readableBytes(
    backend.toXlsxWorkbookStream(source.snapshot, options, source.context),
    (error) =>
      xlsxCallFailure(error, options?.signal, {
        operation: "xlsx-export",
        backend: backend.name,
        functionName: "toXlsxWorkbookStream",
      }),
  );
}

/** Import a File/Blob. The built-in backend reads it without buffering the compressed workbook. */
export async function fromXlsxWorkbookFile(
  file: Blob,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  const backend = workbookBackend;
  if (!backend) throw missingXlsxBackend("fromXlsxWorkbookFile", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    if (backend.fromXlsxWorkbookFile) return await backend.fromXlsxWorkbookFile(file, options);

    // Custom workbook backends may only implement the required byte-array reader.
    const bytes = await file.arrayBuffer();
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxWorkbook(bytes, options);
  } catch (error) {
    throw xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-import",
      backend: backend.name,
      functionName: "fromXlsxWorkbookFile",
    });
  }
}

/**
 * Formula-preserving, multi-sheet workbook import through the optional XLSX backend.
 *
 * @example
 * ```ts
 * import { registerXlsxBackends } from "@sheetwrite/xlsx";
 * import { fromXlsxWorkbook, createGridFromSnapshot, initSheetwrite } from "@sheetwrite/core";
 *
 * registerXlsxBackends();
 * async function openWorkbook(host: HTMLElement, file: File) {
 *   await initSheetwrite();
 *   const snapshot = await fromXlsxWorkbook(await file.arrayBuffer());
 *   return createGridFromSnapshot(host, snapshot);
 * }
 * ```
 * @see toXlsxWorkbook
 */
export async function fromXlsxWorkbook(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  const backend = workbookBackend;
  if (!backend) throw missingXlsxBackend("fromXlsxWorkbook", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxWorkbook(data, options);
  } catch (error) {
    throw xlsxCallFailure(error, options?.signal, {
      operation: "xlsx-import",
      backend: backend.name,
      functionName: "fromXlsxWorkbook",
    });
  }
}
