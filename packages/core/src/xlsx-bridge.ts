import { isDashboard } from "./dashboard.js";
import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { readableBytes } from "./export-stream.js";
import { SheetwriteStore } from "./store.js";
import { autoFilterBody } from "./store/autofilter.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { ColumnarData } from "./types/data.js";
import type { SheetSnapshot, Workbook, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { Store } from "./types/store.js";
import type {
  XlsxSpillExport,
  XlsxWorkbookExportContext,
  XlsxWorkbookOptions,
} from "./types/xlsx.js";
import {
  xlsxTableExportBackend,
  xlsxTableImportBackend,
  xlsxWorkbookBackend,
} from "./xlsx-slots.js";
import { hasAdmittedXlsxSource } from "./xlsx-source.js";

function missing_xlsx_backend(
  function_name: string,
  operation: "xlsx-import" | "xlsx-export",
): SheetwriteError {
  return new SheetwriteError(
    "optional-backend-unavailable",
    operation,
    `Sheetwrite: XLSX add-on not installed. Install @sheetwrite/xlsx and call initSheetwrite({ addons: [xlsxAddon()] }) before calling ${function_name}.`,
    { context: { backend: "xlsx", functionName: function_name }, retryable: false },
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
function xlsx_call_failure(
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
 * @returns The bytes of the `.xlsx` file.
 * @see fromXlsxTable
 */
export async function toXlsxTable(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = xlsxTableExportBackend();
  if (!backend) throw missing_xlsx_backend("toXlsxTable", "xlsx-export");
  try {
    options?.signal?.throwIfAborted();
    return await backend.toXlsxTable(workbook, store, options);
  } catch (error) {
    throw xlsx_call_failure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxTable",
    });
  }
}

/**
 * Stream table XLSX bytes without materializing the finished archive.
 *
 * @returns The `.xlsx` file's bytes, produced as the stream is read; cancelling
 *   the stream stops the export.
 */
export function toXlsxTableStream(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): ReadableStream<Uint8Array> {
  const backend = xlsxTableExportBackend();
  if (!backend?.toXlsxTableStream) throw missing_xlsx_backend("toXlsxTableStream", "xlsx-export");
  return readableBytes(backend.toXlsxTableStream(workbook, store, options), (error) =>
    xlsx_call_failure(error, options?.signal, {
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
 * @param data - The bytes of an `.xlsx` file.
 * @param options - A signal that stops the import, resource limits, and a warning callback.
 * @returns The first sheet's columns, keyed by header text.
 * @see toXlsxTable
 */
export async function fromXlsxTable(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<ColumnarData> {
  const backend = xlsxTableImportBackend();
  if (!backend) throw missing_xlsx_backend("fromXlsxTable", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxTable(data, options);
  } catch (error) {
    throw xlsx_call_failure(error, options?.signal, {
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
function workbook_snapshot_of(input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">): {
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
  const active_sheet: unknown =
    "getActiveSheet" in input && typeof input.getActiveSheet === "function"
      ? input.getActiveSheet()
      : undefined;
  const switched =
    typeof active_sheet === "string" &&
    active_sheet !== snapshot.workbook.activeSheet &&
    snapshot.sheets.some((sheet) => sheet.id === active_sheet);
  return {
    snapshot: switched
      ? { ...snapshot, workbook: { ...snapshot.workbook, activeSheet: active_sheet } }
      : snapshot,
    context: { sourceTracked: hasAdmittedXlsxSource(store) },
    store,
  };
}

/**
 * The export context with what only the store's engine can compute: the
 * rows AutoFilters hide, the spills, the current output of worksheet pivots,
 * the static content of dashboards and the values of charts over pivots. The
 * pivot module loads only for a workbook with a pivot or a dashboard.
 */
async function with_engine_content(
  source: ReturnType<typeof workbook_snapshot_of>,
): Promise<XlsxWorkbookExportContext> {
  const store = source.store;
  if (store === undefined) return source.context;
  const sheets = source.snapshot.sheets;
  const filtered_rows = auto_filtered_rows(store, sheets);
  const engine = storeEngine(store);
  const spills = engine ? sheet_spills(engine, sheets) : new Map<SheetId, XlsxSpillExport[]>();
  const context = {
    ...source.context,
    ...(filtered_rows.size > 0 ? { filteredRows: filtered_rows } : {}),
    ...(spills.size > 0 ? { spills } : {}),
  };
  const pivots = sheets.some((sheet) => !isDashboard(sheet) && (sheet.pivots?.length ?? 0) > 0);
  const dashboards = sheets.some(isDashboard);
  if (!pivots && !dashboards) return context;
  const charts = sheets.some((sheet) => sheet.charts?.some((chart) => chart.pivot !== undefined));
  const { pivotViewExports: pivot_view_exports, worksheetPivotExports: worksheet_pivot_exports } =
    await import("./dashboard/dashboard-export.js");
  // The store can be disposed, with its grid, while the module loads.
  if (storeEngine(store)?.isDisposed) {
    throw new SheetwriteError("aborted", "xlsx-export", "The store was disposed during the export");
  }
  return {
    ...context,
    ...(pivots ? { pivotOutputs: worksheet_pivot_exports(store) } : {}),
    ...(dashboards || charts ? pivot_view_exports(store) : {}),
  };
}

/** The rows each sheet's AutoFilter hides now, which Excel stores as hidden rows. */
function auto_filtered_rows(
  store: SheetwriteStore,
  sheets: readonly SheetSnapshot[],
): Map<SheetId, number[]> {
  const hidden = new Map<SheetId, number[]>();
  for (const sheet of sheets) {
    if (!sheet.autoFilter || (sheet.filters?.length ?? 0) === 0) continue;
    const { start, end } = autoFilterBody(sheet.autoFilter);
    const rows: number[] = [];
    for (let row = start; row <= end; row++) {
      if (store.viewRowOf(sheet.id, row) === null) rows.push(row);
    }
    if (rows.length > 0) hidden.set(sheet.id, rows);
  }
  return hidden;
}

/** Each worksheet's installed spills and their values, which Excel files keep in the covered cells. */
function sheet_spills(
  engine: StoreDataEngine,
  sheets: readonly SheetSnapshot[],
): Map<SheetId, XlsxSpillExport[]> {
  const spills = new Map<SheetId, XlsxSpillExport[]>();
  for (const sheet of sheets) {
    if (isDashboard(sheet)) continue;
    const ranges = engine.spillRanges(sheet.id);
    if (ranges.length === 0) continue;
    const entries: XlsxSpillExport[] = [];
    for (let index = 0; index < ranges.length; index += 4) {
      const [row = 0, col = 0, row_end = 0, col_end = 0] = ranges.subarray(index, index + 4);
      const cells: { row: number; col: number }[] = [];
      for (let r = row; r <= row_end; r++)
        for (let c = col; c <= col_end; c++) cells.push({ row: r, col: c });
      const values: CellScalar[] = engine
        .captureResolvedCells(sheet.id, cells)
        .map((cell) => cell.resolved);
      entries.push({ row, col, rows: row_end - row + 1, cols: col_end - col + 1, values });
    }
    spills.set(sheet.id, entries);
  }
  return spills;
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
 * @param input - The workbook to write: a `WorkbookSnapshot`, or a grid, whose
 *   `exportSnapshot()` is called first.
 * @param options - A signal that stops the export, resource limits, and a warning callback.
 * @returns The bytes of the `.xlsx` file.
 * @see fromXlsxWorkbook
 */
export async function toXlsxWorkbook(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  const backend = xlsxWorkbookBackend();
  if (!backend) throw missing_xlsx_backend("toXlsxWorkbook", "xlsx-export");
  try {
    // Checked before the snapshot is built, which is the largest step on this side.
    options?.signal?.throwIfAborted();
    const source = workbook_snapshot_of(input);
    return await backend.toXlsxWorkbook(
      source.snapshot,
      options,
      await with_engine_content(source),
    );
  } catch (error) {
    throw xlsx_call_failure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxWorkbook",
    });
  }
}

/**
 * Stream formula-preserving workbook XLSX with backpressure and cancellation.
 *
 * @param input - The workbook to write: a `WorkbookSnapshot`, or a grid, whose
 *   `exportSnapshot()` is called first.
 * @param options - A signal that stops the export, resource limits, and a warning callback.
 * @returns The `.xlsx` file's bytes, produced as the stream is read; cancelling
 *   the stream stops the export.
 */
export function toXlsxWorkbookStream(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): ReadableStream<Uint8Array> {
  const backend = xlsxWorkbookBackend();
  if (!backend?.toXlsxWorkbookStream)
    throw missing_xlsx_backend("toXlsxWorkbookStream", "xlsx-export");
  const source = workbook_snapshot_of(input);
  const stream = backend.toXlsxWorkbookStream.bind(backend);
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield* stream(source.snapshot, options, await with_engine_content(source));
  }
  return readableBytes(chunks(), (error) =>
    xlsx_call_failure(error, options?.signal, {
      operation: "xlsx-export",
      backend: backend.name,
      functionName: "toXlsxWorkbookStream",
    }),
  );
}

/**
 * Import a File/Blob. The built-in backend reads it without buffering the compressed workbook.
 *
 * @param file - The `.xlsx` file, such as one picked through `<input type="file">`.
 * @param options - A signal that stops the import, resource limits, and a warning callback.
 * @returns A workbook snapshot of every sheet, with formulas kept, ready for
 *   `createGridFromSnapshot`.
 */
export async function fromXlsxWorkbookFile(
  file: Blob,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  const backend = xlsxWorkbookBackend();
  if (!backend) throw missing_xlsx_backend("fromXlsxWorkbookFile", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    if (backend.fromXlsxWorkbookFile) return await backend.fromXlsxWorkbookFile(file, options);

    // Custom workbook backends may only implement the required byte-array reader.
    const bytes = await file.arrayBuffer();
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxWorkbook(bytes, options);
  } catch (error) {
    throw xlsx_call_failure(error, options?.signal, {
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
 * @param data - The bytes of an `.xlsx` file.
 * @param options - A signal that stops the import, resource limits, and a warning callback.
 * @returns A workbook snapshot of every sheet, with formulas kept, ready for
 *   `createGridFromSnapshot`.
 * @see toXlsxWorkbook
 */
export async function fromXlsxWorkbook(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  const backend = xlsxWorkbookBackend();
  if (!backend) throw missing_xlsx_backend("fromXlsxWorkbook", "xlsx-import");
  try {
    options?.signal?.throwIfAborted();
    return await backend.fromXlsxWorkbook(data, options);
  } catch (error) {
    throw xlsx_call_failure(error, options?.signal, {
      operation: "xlsx-import",
      backend: backend.name,
      functionName: "fromXlsxWorkbook",
    });
  }
}
