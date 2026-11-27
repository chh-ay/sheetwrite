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
function safe_text(value: CellScalar): string {
  return typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value);
}

/** Harden a column header (always text) exactly as a text cell value. */
function safe_header(header: string): string {
  return neutralizeInjection(header);
}

function assert_complete_data(store: Store, sheet: string): void {
  const capability = store.queryCapability?.(sheet);
  if (capability?.status === "incomplete") throw new IncompleteDataError(sheet, capability);
}

/** Visible CSV view rows, read one bounded store window at a time. */
function csv_rows(
  sheet: Sheet,
  store: Store,
  options: DelimitedTextOptions,
): Iterable<readonly string[]> {
  assert_complete_data(store, sheet.id);
  const limits = resolveDelimitedTextResourceLimits(options);
  const cols = visibleColumns(sheet);
  const view_rows = store.viewRowCount(sheet.id);
  assertDelimitedTextDimensions(view_rows + 1, cols.length, limits, "export");

  function* rows(): Generator<readonly string[]> {
    yield cols.map((column) => safe_header(sheet.columns[column]!.header));
    for (let start = 0; start < view_rows; start += limits.maxWriterWindowRows) {
      const end = Math.min(view_rows, start + limits.maxWriterWindowRows);
      options.signal?.throwIfAborted();
      if (store.viewRowCount(sheet.id) !== view_rows) {
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
          fields[column] = safe_text(view.values[row * cols.length + column] ?? null);
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
 * @returns The whole CSV file as one string, starting with the BOM.
 */
export function toCsv(sheet: Sheet, store: Store, options: DelimitedTextOptions = {}): string {
  return encodeDelimitedText(csv_rows(sheet, store, options), ",", options, {
    bom: true,
    operation: "export",
  });
}

/**
 * Export UTF-8 CSV on demand, retaining only one store window and one byte chunk.
 *
 * @returns The CSV file's bytes, produced as the stream is read; cancelling the
 *   stream stops the export.
 */
export function toCsvStream(
  sheet: Sheet,
  store: Store,
  options: DelimitedTextOptions = {},
): ReadableStream<Uint8Array> {
  return readableBytes(
    utf8Chunks(
      encodeDelimitedTextChunks(csv_rows(sheet, store, options), ",", options, {
        bom: true,
        operation: "export",
      }),
    ),
  );
}

/** Canonical data-space rows of a range, read one bounded store window at a time. */
function tsv_rows(
  range: Range,
  store: Store,
  options: DelimitedTextOptions,
): Iterable<readonly string[]> {
  assert_complete_data(store, range.sheet);
  const limits = resolveDelimitedTextResourceLimits(options);
  const start_row = Math.min(range.start.row, range.end.row);
  const end_row = Math.max(range.start.row, range.end.row);
  const start_column = Math.min(range.start.col, range.end.col);
  const end_column = Math.max(range.start.col, range.end.col);
  const row_count = end_row - start_row + 1;
  const column_count = end_column - start_column + 1;
  assertDelimitedTextDimensions(row_count, column_count, limits, "export");

  function* rows(): Generator<readonly string[]> {
    const columns = Array.from({ length: column_count }, (_, index) => start_column + index);
    for (
      let chunk_start = start_row;
      chunk_start <= end_row;
      chunk_start += limits.maxWriterWindowRows
    ) {
      const chunk_end = Math.min(end_row + 1, chunk_start + limits.maxWriterWindowRows);
      options.signal?.throwIfAborted();
      const window = store.getDataWindow?.(
        range.sheet,
        { start: chunk_start, end: chunk_end },
        columns,
      );
      for (let row = chunk_start; row < chunk_end; row++) {
        const fields: string[] = new Array(column_count);
        for (let column = 0; column < column_count; column++) {
          const value = window
            ? (window.values[(row - chunk_start) * column_count + column] ?? null)
            : store.getCell({ sheet: range.sheet, row, col: start_column + column }).resolved;
          fields[column] = safe_text(value);
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
 * @returns The range as TSV text, ready for the clipboard.
 */
export function toTsv(range: Range, store: Store, options: DelimitedTextOptions = {}): string {
  return encodeDelimitedText(tsv_rows(range, store, options), "\t", options, {
    operation: "export",
  });
}

/**
 * Export canonical data-space TSV with pull-driven store reads and cancellation.
 *
 * @returns The TSV text's UTF-8 bytes, produced as the stream is read;
 *   cancelling the stream stops the export.
 */
export function toTsvStream(
  range: Range,
  store: Store,
  options: DelimitedTextOptions = {},
): ReadableStream<Uint8Array> {
  return readableBytes(
    utf8Chunks(
      encodeDelimitedTextChunks(tsv_rows(range, store, options), "\t", options, {
        operation: "export",
      }),
    ),
  );
}

/**
 * Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes,
 * bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional
 * leading UTF-8 BOM. The synchronous API consumes an existing in-memory string
 * and returns an in-memory grid; it does not stream. Scanning enforces
 * resource ceilings before materializing the next oversized field or record.
 *
 * @param text - The CSV file's text.
 * @param options - Resource limits that replace the defaults, and a signal
 *   that stops the parse.
 * @returns One array of field strings per record, in file order; values are
 *   not converted to numbers.
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
 *
 * @param text - The CSV file's text; its first record is the header row.
 * @param columns - The sheet's columns. Visible ones take the fields left to
 *   right. `TRUE` and `FALSE` become booleans, and number, currency and date
 *   columns turn number text (and dates or amounts) into numbers.
 * @param options - Resource limits that replace the defaults, and a signal
 *   that stops the parse.
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
  let scanned_rows = 0;
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
        scanned_rows = row + 1;
      },
    },
    options.signal,
  );

  const row_count = Math.max(0, scanned_rows - 1);
  assertDelimitedTextDimensions(row_count, columns.length, limits, "import");

  const result: Record<string, CellScalar[]> = Object.create(null);
  let visible_index = 0;
  for (const column of columns) {
    if (column.visible === false) {
      // Keep declared key order without replacing a visible bucket for the same key.
      result[column.key] ??= new Array<CellScalar>(row_count).fill(null);
    } else {
      const bucket = values[visible_index];
      if (bucket !== undefined) result[column.key] = bucket;
      visible_index += 1;
    }
  }

  return { rowCount: row_count, columns: result };
}

/**
 * Trigger a browser download from in-memory bytes. The temporary anchor is
 * removed and its object URL is scheduled for revocation even when DOM append or
 * click throws.
 *
 * @param bytes - File contents; a string is saved as its text.
 * @param filename - Name the browser offers for the saved file, such as `report.xlsx`.
 * @param mime - MIME type of the file, such as `text/csv`.
 */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void {
  start_download(bytes, filename, mime, (revoke) => setTimeout(revoke, 0));
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
  start_download(bytes, filename, mime, (revoke) => owner.disposeAfter(revoke, 0));
}

function start_download(
  bytes: Uint8Array | string,
  filename: string,
  mime: string,
  schedule_revoke: (revoke: () => void) => void,
): void {
  if (typeof document === "undefined") {
    throw new Error("Sheetwrite: downloadBytes requires a browser environment");
  }

  const needs_copy =
    typeof bytes !== "string" &&
    typeof SharedArrayBuffer !== "undefined" &&
    bytes.buffer instanceof SharedArrayBuffer;
  const part: BlobPart = needs_copy ? new Uint8Array(bytes) : (bytes as BlobPart);
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
      schedule_revoke(() => URL.revokeObjectURL(url));
    }
  }
}
