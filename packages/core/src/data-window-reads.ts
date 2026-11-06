// Bulk reads of canonical data rows for UI code that inspects a source range
// (pivot field lists, slicers, chart and sort inference). A store with
// `getDataWindow` is read one packed window per chunk; a custom store without
// it is read through `getCell`, its single-cell contract.

import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { Store } from "./types/store.js";

/** Rows one window covers, so an early stop wastes at most one chunk of reads. */
const COLUMN_SCAN_CHUNK_ROWS = 4096;

/** One column over an inclusive band of canonical data rows. */
export interface ColumnSpan {
  readonly sheet: SheetId;
  readonly col: number;
  readonly startRow: number;
  readonly endRow: number;
}

/** One canonical data row over an inclusive band of columns. */
export interface RowSpan {
  readonly sheet: SheetId;
  readonly row: number;
  readonly startCol: number;
  readonly endCol: number;
}

/**
 * Visit the resolved values of a column span top to bottom. The scan stops
 * when `visit` returns false.
 */
export function scanColumnValues(
  store: Store,
  span: ColumnSpan,
  visit: (value: CellScalar) => boolean,
): void {
  const { sheet, col, startRow, endRow } = span;
  const columns = [col];

  for (let chunkStart = startRow; chunkStart <= endRow; chunkStart += COLUMN_SCAN_CHUNK_ROWS) {
    const chunkEnd = Math.min(endRow + 1, chunkStart + COLUMN_SCAN_CHUNK_ROWS);
    const window = store.getDataWindow?.(sheet, { start: chunkStart, end: chunkEnd }, columns);

    for (let row = chunkStart; row < chunkEnd; row++) {
      const value = window
        ? (window.values[row - chunkStart] ?? null)
        : store.getCell({ sheet, row, col }).resolved;
      if (!visit(value)) return;
    }
  }
}

/** Resolved values of a row span, left to right. */
export function readRowValues(store: Store, span: RowSpan): CellScalar[] {
  const { sheet, row, startCol, endCol } = span;
  const width = Math.max(0, endCol - startCol + 1);
  const columns = Array.from({ length: width }, (_, offset) => startCol + offset);
  const window = store.getDataWindow?.(sheet, { start: row, end: row + 1 }, columns);

  return columns.map((col, offset) =>
    window ? (window.values[offset] ?? null) : store.getCell({ sheet, row, col }).resolved,
  );
}
