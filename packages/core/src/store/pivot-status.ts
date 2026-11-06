// One pivot's record in the full engine's `pivotStatus` array. The store
// reads it for results and output rectangles, and the window reader for the
// value cells that a value field's number format styles.

/** `pivotStatus` values per pivot: error, row, col, rows, cols, headerRows, labelCols. */
const PIVOT_STATUS_STRIDE = 7;

/** Where one pivot's output is, and its header rows and label columns. */
export interface PivotStatusRecord {
  /** 0 when the output rendered; otherwise the anchor shows an error. */
  readonly error: number;
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
  readonly headerRows: number;
  readonly labelCols: number;
}

/** The record of the pivot at `index` in the sheet's payload, or null past the end. */
export function pivotStatusAt(status: Uint32Array, index: number): PivotStatusRecord | null {
  const base = index * PIVOT_STATUS_STRIDE;
  if (base + PIVOT_STATUS_STRIDE > status.length) return null;
  const at = (offset: number): number => status[base + offset] ?? 0;
  return {
    error: at(0),
    row: at(1),
    col: at(2),
    rows: at(3),
    cols: at(4),
    headerRows: at(5),
    labelCols: at(6),
  };
}
