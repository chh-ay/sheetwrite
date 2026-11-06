import { isDashboard } from "./dashboard.js";
import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { readableBytes } from "./export-stream.js";
import { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";

import type { ColumnarData } from "./types/data.js";
import type { Workbook, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { Store } from "./types/store.js";
import type {
  XlsxResourceLimits,
  XlsxWorkbookExportContext,
  XlsxWorkbookOptions,
} from "./types/xlsx.js";
import {
  xlsxTableExportBackend,
  xlsxTableImportBackend,
  xlsxWorkbookBackend,
} from "./xlsx-backends.js";
import { hasAdmittedXlsxSource } from "./xlsx-source.js";

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

function missingXlsxBackend(
  functionName: string,
  operation: "xlsx-import" | "xlsx-export",
): SheetwriteError {
  return new SheetwriteError(
    "optional-backend-unavailable",
    operation,
    `Sheetwrite: XLSX add-on not installed. Install @sheetwrite/xlsx and call initSheetwrite({ addons: [xlsxAddon()] }) before calling ${functionName}.`,
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
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 * import { initSheetwrite, toXlsxTable, downloadBytes, type Workbook, type Store } from "@sheetwrite/core";
 *
 * await initSheetwrite({ addons: [xlsxAddon()] });
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
  const backend = xlsxTableExportBackend();
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
  const backend = xlsxTableExportBackend();
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
 * Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
 * row is treated as the header and its cell text becomes each column's key.
 * Numbers stay numbers, date cells use the date-serial convention, strings are
 * verbatim, and empty cells become `null`.
 *
 * @example
 * ```ts
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 * import { fromXlsxTable, initSheetwrite } from "@sheetwrite/core";
 *
 * await initSheetwrite({ addons: [xlsxAddon()] });
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
  const backend = xlsxTableImportBackend();
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


/** Whether workbook import can be offered without loading an optional backend. */
export function hasXlsxWorkbookBackend(): boolean {
  return xlsxWorkbookBackend() !== null;
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
  /** The store with an engine that built the snapshot, if any. */
  store?: SheetwriteStore;
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
    store,
  };
}

/**
 * The export context with what only the store's engine can compute: the
 * current output of worksheet pivots, the static content of dashboards and
 * the values of charts over pivots. The module loads only for a workbook with
 * a pivot or a dashboard.
 */
async function withEngineContent(
  source: ReturnType<typeof workbookSnapshotOf>,
): Promise<XlsxWorkbookExportContext> {
  const store = source.store;
  if (store === undefined) return source.context;
  const sheets = source.snapshot.sheets;
  const pivots = sheets.some((sheet) => !isDashboard(sheet) && (sheet.pivots?.length ?? 0) > 0);
  const dashboards = sheets.some(isDashboard);
  if (!pivots && !dashboards) return source.context;
  const charts = sheets.some((sheet) => sheet.charts?.some((chart) => chart.pivot !== undefined));
  const { pivotViewExports, worksheetPivotExports } =
    await import("./dashboard/dashboard-export.js");
  return {
    ...source.context,
    ...(pivots ? { pivotOutputs: worksheetPivotExports(store) } : {}),
    ...(dashboards || charts ? pivotViewExports(store) : {}),
  };
}

/**
 * Formula-preserving, multi-sheet workbook export through the optional XLSX backend.
 *
 * @example
 * ```ts
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 * import { initSheetwrite, toXlsxWorkbook, downloadBytes, type Grid } from "@sheetwrite/core";
 *
 * await initSheetwrite({ addons: [xlsxAddon()] });
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
  const backend = xlsxWorkbookBackend();
  if (!backend) throw missingXlsxBackend("toXlsxWorkbook", "xlsx-export");
  try {
    // Checked before the snapshot is built, which is the largest step on this side.
    options?.signal?.throwIfAborted();
    const source = workbookSnapshotOf(input);
    return await backend.toXlsxWorkbook(source.snapshot, options, await withEngineContent(source));
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
  const backend = xlsxWorkbookBackend();
  if (!backend?.toXlsxWorkbookStream)
    throw missingXlsxBackend("toXlsxWorkbookStream", "xlsx-export");
  const source = workbookSnapshotOf(input);
  const stream = backend.toXlsxWorkbookStream.bind(backend);
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield* stream(source.snapshot, options, await withEngineContent(source));
  }
  return readableBytes(chunks(), (error) =>
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
  const backend = xlsxWorkbookBackend();
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
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 * import { fromXlsxWorkbook, createGridFromSnapshot, initSheetwrite } from "@sheetwrite/core";
 *
 * async function openWorkbook(host: HTMLElement, file: File) {
 *   await initSheetwrite({ addons: [xlsxAddon()] });
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
  const backend = xlsxWorkbookBackend();
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
