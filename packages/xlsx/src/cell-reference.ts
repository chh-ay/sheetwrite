import { cellA1, labelToCol, rangeA1 } from "@sheetwrite/core";

/** A rectangle of cells, with zero-based inclusive corners. */
export interface CellRect {
  readonly r0: number;
  readonly c0: number;
  readonly r1: number;
  readonly c1: number;
}

/** Two cell corners of a range, in any order. */
interface Corners {
  readonly start: { readonly row: number; readonly col: number };
  readonly end: { readonly row: number; readonly col: number };
}

const CELL_REFERENCE = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i;

/** The cell of an A1 reference such as `B2` or `$B$2`, or undefined when it is not one. */
export function parseCellReference(text: string): { row: number; col: number } | undefined {
  const match = CELL_REFERENCE.exec(text);
  const label = match?.[1];
  const rowText = match?.[2];
  if (label === undefined || rowText === undefined) return undefined;

  const row = Number(rowText) - 1;
  if (!Number.isSafeInteger(row)) return undefined;
  return { row, col: labelToCol(label.toUpperCase()) };
}

/**
 * The rectangle of an A1 range such as `A1:B3`, or of one cell, with its
 * corners in order; undefined when the text is not one.
 */
export function parseCellRect(text: string): CellRect | undefined {
  const [first, last = first, extra] = text.split(":");
  if (first === undefined || last === undefined || extra !== undefined) return undefined;

  const start = parseCellReference(first);
  const end = parseCellReference(last);
  if (!start || !end) return undefined;
  return {
    r0: Math.min(start.row, end.row),
    c0: Math.min(start.col, end.col),
    r1: Math.max(start.row, end.row),
    c1: Math.max(start.col, end.col),
  };
}

/** The A1 text of a rectangle: `A1:B3`, or `A1` for one cell. */
export function rectA1(rect: CellRect): string {
  return rangeA1({ row: rect.r0, col: rect.c0 }, { row: rect.r1, col: rect.c1 });
}

/** The A1 text of a range with both corners, such as `A1:B3`, also for one cell. */
export function areaA1({ start, end }: Corners): string {
  const top = Math.min(start.row, end.row);
  const left = Math.min(start.col, end.col);
  const bottom = Math.max(start.row, end.row);
  const right = Math.max(start.col, end.col);
  return `${cellA1(top, left)}:${cellA1(bottom, right)}`;
}
