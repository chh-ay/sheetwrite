import { cellScalarToText, parseCellLiteralInput, parsePlainDecimal } from "./cell-input.js";
import { neutralizeInjection } from "./clipboard.js";
import {
  assertDelimitedTextDimensions,
  type DelimitedTextOptions,
  encodeDelimitedText,
  encodeDelimitedTextChunks,
  parseDelimitedText,
  resolveDelimitedTextResourceLimits,
  scanDelimitedText,
} from "./delimited-text.js";
import { SheetwriteError } from "./errors.js";
import { readableBytes, utf8Chunks } from "./export-stream.js";
import type { Scope } from "./scope.js";
import { IncompleteDataError } from "./store.js";
import { visibleColumns } from "./store/ranges.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { Range } from "./types/coordinates.js";
import type { ColumnarData } from "./types/data.js";
import type { Sheet } from "./types/document.js";
import type { Store } from "./types/store.js";

/**
 * Neutralize a TEXT field before it is quoted: a string beginning with one of
 * `= + - @ \t \r` is prefixed with `'` so it cannot execute as a formula when the
 * file is reopened in Excel/Sheets. Numeric values are legitimate data and pass
 * through untouched — a negative number is a number, not an attack vector.
 */
function safeText(value: CellScalar): string {
  return typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value);
}

/** Harden a column header (always text) exactly as a text cell value. */
function safeHeader(header: string): string {
  return neutralizeInjection(header);
}

function assertCompleteData(store: Store, sheet: string): void {
  const capability = store.queryCapability?.(sheet);
  if (capability?.status === "incomplete") throw new IncompleteDataError(sheet, capability);
}

/** Visible CSV view rows, read one bounded store window at a time. */
function csvRows(
  sheet: Sheet,
  store: Store,
  options: DelimitedTextOptions,
): Iterable<readonly string[]> {
  assertCompleteData(store, sheet.id);
  const limits = resolveDelimitedTextResourceLimits(options);
  const cols = visibleColumns(sheet);
  const viewRows = store.viewRowCount(sheet.id);
  assertDelimitedTextDimensions(viewRows + 1, cols.length, limits, "export");

  function* rows(): Generator<readonly string[]> {
    yield cols.map((column) => safeHeader(sheet.columns[column]!.header));
    for (let start = 0; start < viewRows; start += limits.maxWriterWindowRows) {
      const end = Math.min(viewRows, start + limits.maxWriterWindowRows);
      options.signal?.throwIfAborted();
      if (store.viewRowCount(sheet.id) !== viewRows) {
        throw new SheetwriteError(
          "export-failed",
          "delimited-export",
          "Sheetwrite: sheet view changed during CSV export",
          {
            context: { sheet: sheet.id },
          },
        );
      }
      const view = store.getVisibleWindow(sheet.id, { start, end }, cols);
      for (let row = 0; row < end - start; row++) {
        const fields: string[] = new Array(cols.length);
        for (let column = 0; column < cols.length; column++) {
          fields[column] = safeText(view.values[row * cols.length + column] ?? null);
        }
        yield fields;
      }
    }
  }

  return rows();
}

/**
 * Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and
 * view-ordered rows surviving sort, filter, hidden-row, and group state. String
 * values beginning with `= + - @ \t \r` are prefixed with `'`. The synchronous
 * API returns one in-memory string, but fetches at most
 * `maxWriterWindowRows` view rows from the store per read.
 *
 * @throws {@link IncompleteDataError} before serialization when a paged sheet is incomplete.
 * @throws {@link DelimitedTextResourceError} when a configured resource ceiling is exceeded.
 */
export function toCsv(sheet: Sheet, store: Store, options: DelimitedTextOptions = {}): string {
  return encodeDelimitedText(csvRows(sheet, store, options), ",", options, {
    bom: true,
    operation: "export",
  });
}

/** Export UTF-8 CSV on demand, retaining only one store window and one byte chunk. */
export function toCsvStream(
  sheet: Sheet,
  store: Store,
  options: DelimitedTextOptions = {},
): ReadableStream<Uint8Array> {
  return readableBytes(
    utf8Chunks(
      encodeDelimitedTextChunks(csvRows(sheet, store, options), ",", options, {
        bom: true,
        operation: "export",
      }),
    ),
  );
}

/** Canonical data-space rows of a range, read one bounded store window at a time. */
function tsvRows(
  range: Range,
  store: Store,
  options: DelimitedTextOptions,
): Iterable<readonly string[]> {
  assertCompleteData(store, range.sheet);
  const limits = resolveDelimitedTextResourceLimits(options);
  const startRow = Math.min(range.start.row, range.end.row);
  const endRow = Math.max(range.start.row, range.end.row);
  const startColumn = Math.min(range.start.col, range.end.col);
  const endColumn = Math.max(range.start.col, range.end.col);
  const rowCount = endRow - startRow + 1;
  const columnCount = endColumn - startColumn + 1;
  assertDelimitedTextDimensions(rowCount, columnCount, limits, "export");

  function* rows(): Generator<readonly string[]> {
    const columns = Array.from({ length: columnCount }, (_, index) => startColumn + index);
    for (
      let chunkStart = startRow;
      chunkStart <= endRow;
      chunkStart += limits.maxWriterWindowRows
    ) {
      const chunkEnd = Math.min(endRow + 1, chunkStart + limits.maxWriterWindowRows);
      options.signal?.throwIfAborted();
      const window = store.getDataWindow?.(
        range.sheet,
        { start: chunkStart, end: chunkEnd },
        columns,
      );
      for (let row = chunkStart; row < chunkEnd; row++) {
        const fields: string[] = new Array(columnCount);
        for (let column = 0; column < columnCount; column++) {
          const value = window
            ? (window.values[(row - chunkStart) * columnCount + column] ?? null)
            : store.getCell({ sheet: range.sheet, row, col: startColumn + column }).resolved;
          fields[column] = safeText(value);
        }
        yield fields;
      }
    }
  }

  return rows();
}

/**
 * Export a canonical data-space range as clipboard-compatible TSV (CRLF, no
 * BOM). Reversed corners are normalized; active sort and filter views do not
 * remap the supplied row coordinates. Values are injection-hardened. The
 * synchronous API returns one in-memory string and fetches at most
 * `maxWriterWindowRows` canonical rows per packed store read.
 *
 * @throws {@link IncompleteDataError} before serialization when a paged sheet is incomplete.
 * @throws {@link DelimitedTextResourceError} when a configured resource ceiling is exceeded.
 */
export function toTsv(range: Range, store: Store, options: DelimitedTextOptions = {}): string {
  return encodeDelimitedText(tsvRows(range, store, options), "\t", options, {
    operation: "export",
  });
}

/** Export canonical data-space TSV with pull-driven store reads and cancellation. */
export function toTsvStream(
  range: Range,
  store: Store,
  options: DelimitedTextOptions = {},
): ReadableStream<Uint8Array> {
  return readableBytes(
    utf8Chunks(
      encodeDelimitedTextChunks(tsvRows(range, store, options), "\t", options, {
        operation: "export",
      }),
    ),
  );
}

/**
 * Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes,
 * bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional
 * leading UTF-8 BOM. The synchronous API consumes an existing in-memory string
 * and returns an in-memory grid; it does not claim streaming. Scanning enforces
 * resource ceilings before materializing the next oversized field or record.
 */
export function parseCsv(text: string, options: DelimitedTextOptions = {}): string[][] {
  return parseDelimitedText(text, ",", options);
}

/**
 * Parse CSV into `ColumnarData`. The first record is consumed as a positional
 * header. Input fields project onto declared visible columns; hidden declared
 * columns are initialized to `null`, matching the visible-column CSV export.
 * Extra fields are ignored and missing fields become `null`. The returned
 * columnar table is fully materialized in memory.
 */
export function fromCsv(
  text: string,
  columns: readonly Column[],
  options: DelimitedTextOptions = {},
): ColumnarData {
  const limits = resolveDelimitedTextResourceLimits(options);
  const projected = columns.filter((column) => column.visible !== false);
  const numeric = projected.map(
    ({ type }) => type === "number" || type === "currency" || type === "date",
  );
  const values: CellScalar[][] = Array.from({ length: projected.length }, () => []);
  let scannedRows = 0;
  let cursor = 0;
  const append = (column: number, value: CellScalar): void => {
    while (cursor < column) {
      values[cursor]?.push(null);
      cursor += 1;
    }
    values[column]?.push(value);
    cursor = column + 1;
  };
  scanDelimitedText(
    text,
    ",",
    limits,
    {
      fieldLimit: projected.length,
      // A plain decimal in a numeric column becomes its number without a string.
      span: (row, column, source, start, end) => {
        if (row === 0) return true;
        if (numeric[column] !== true) return false;
        const number = parsePlainDecimal(source, start, end);
        if (number === undefined) return false;
        append(column, number);
        return true;
      },
      field: (row, column, value) => {
        if (row === 0) return;
        const target = projected[column];
        if (target === undefined) return;
        append(column, parseCellLiteralInput(value, target.type));
      },
      row: (row) => {
        if (row > 0) {
          while (cursor < projected.length) {
            values[cursor]?.push(null);
            cursor += 1;
          }
          cursor = 0;
        }
        scannedRows = row + 1;
      },
    },
    options.signal,
  );

  const rowCount = Math.max(0, scannedRows - 1);
  assertDelimitedTextDimensions(rowCount, columns.length, limits, "import");

  const result: Record<string, CellScalar[]> = Object.create(null);
  let visibleIndex = 0;
  for (const column of columns) {
    if (column.visible === false) {
      // Keep declared key order without replacing a visible bucket for the same key.
      result[column.key] ??= new Array<CellScalar>(rowCount).fill(null);
    } else {
      const bucket = values[visibleIndex];
      if (bucket !== undefined) result[column.key] = bucket;
      visibleIndex += 1;
    }
  }

  return { rowCount, columns: result };
}

/**
 * Trigger a browser download from in-memory bytes. The temporary anchor is
 * removed and its object URL is scheduled for revocation even when DOM append or
 * click throws.
 */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void {
  startDownload(bytes, filename, mime, (revoke) => setTimeout(revoke, 0));
}

/**
 * {@link downloadBytes} for a download that `owner` starts: when `owner`
 * closes before the deferred revoke, it revokes the object URL at once, so
 * no URL and no timer outlives it.
 */
export function downloadBytesIn(
  owner: Scope,
  bytes: Uint8Array | string,
  filename: string,
  mime: string,
): void {
  startDownload(bytes, filename, mime, (revoke) => owner.disposeAfter(revoke, 0));
}

function startDownload(
  bytes: Uint8Array | string,
  filename: string,
  mime: string,
  scheduleRevoke: (revoke: () => void) => void,
): void {
  if (typeof document === "undefined") {
    throw new Error("Sheetwrite: downloadBytes requires a browser environment");
  }

  const needsCopy =
    typeof bytes !== "string" &&
    typeof SharedArrayBuffer !== "undefined" &&
    bytes.buffer instanceof SharedArrayBuffer;
  const part: BlobPart = needsCopy ? new Uint8Array(bytes) : (bytes as BlobPart);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      // A synchronous revoke can race download navigation in some engines.
      scheduleRevoke(() => URL.revokeObjectURL(url));
    }
  }
}
