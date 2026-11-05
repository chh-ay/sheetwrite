/**
 * Sheet metadata that moves with the rows of a `permuteRows` operation.
 * Notes and hyperlinks are cell properties, so they move with their row, as
 * in an Excel sort. A merged cell moves only as a whole record of rows.
 */
import type { PermuteRowsOperation } from "../row-order.js";
import type { CellHyperlink } from "../types/cell.js";
import type { MergeRange, Range } from "../types/coordinates.js";
import type { CellNote } from "../types/document.js";
import type { WorkbookTable } from "../types/table.js";

/** Normalized bounds of a permuted range and where each of its rows goes. */
export interface RowMove {
  readonly bounds: Range;
  /** `targets[i]` is the new row offset of source row offset `i`. */
  readonly targets: Uint32Array;
}

function insideColumns(move: RowMove, startCol: number, endCol: number): boolean {
  return startCol >= move.bounds.start.col && endCol <= move.bounds.end.col;
}

function insideRows(move: RowMove, startRow: number, endRow: number): boolean {
  return startRow >= move.bounds.start.row && endRow <= move.bounds.end.row;
}

function movedRow(move: RowMove, row: number): number {
  const offset = row - move.bounds.start.row;
  return move.bounds.start.row + (move.targets[offset] ?? offset);
}

/** Notes of cells in the range, at their new rows. */
export function permutedNotes(notes: readonly CellNote[], move: RowMove): CellNote[] {
  return notes.map((note) => {
    const { row, col } = note.addr;
    if (
      note.addr.sheet !== move.bounds.sheet ||
      !insideRows(move, row, row) ||
      !insideColumns(move, col, col)
    ) {
      return note;
    }

    return { ...note, addr: { ...note.addr, row: movedRow(move, row) } };
  });
}

/**
 * Hyperlinks inside one row of the range move with that row. A hyperlink
 * over several rows has no single row to follow and keeps its range.
 */
export function permutedHyperlinks(
  hyperlinks: readonly CellHyperlink[],
  move: RowMove,
): CellHyperlink[] {
  return hyperlinks.map((hyperlink) => {
    const { range } = hyperlink;
    const row = range.start.row;
    if (
      range.sheet !== move.bounds.sheet ||
      range.end.row !== row ||
      !insideRows(move, row, row) ||
      !insideColumns(move, range.start.col, range.end.col)
    ) {
      return hyperlink;
    }

    const target = movedRow(move, row);
    return {
      ...hyperlink,
      range: {
        ...range,
        start: { ...range.start, row: target },
        end: { ...range.end, row: target },
      },
    };
  });
}

/**
 * Merged cells after the move, or `null` when a merge cannot move: it
 * crosses the edge of the range, or the order splits its rows. Microsoft
 * Learn, "An error message when you sort a range that contains merged cells
 * in Excel": a sort needs identically sized merged cells.
 */
export function permutedMerges(merges: readonly MergeRange[], move: RowMove): MergeRange[] | null {
  const { start, end } = move.bounds;
  const moved: MergeRange[] = [];

  for (const merge of merges) {
    const crossesRows = merge.r0 <= end.row && merge.r1 >= start.row;
    const crossesCols = merge.c0 <= end.col && merge.c1 >= start.col;
    if (!crossesRows || !crossesCols) {
      moved.push(merge);
      continue;
    }

    if (!insideRows(move, merge.r0, merge.r1) || !insideColumns(move, merge.c0, merge.c1)) {
      return null;
    }

    const top = movedRow(move, merge.r0);
    for (let row = merge.r0 + 1; row <= merge.r1; row++) {
      if (movedRow(move, row) !== top + (row - merge.r0)) return null;
    }

    moved.push({ ...merge, r0: top, r1: top + (merge.r1 - merge.r0) });
  }

  return moved;
}

/**
 * Whether the range may move rows of the tables on its sheet. A sort in a
 * table sorts its whole body: all table columns, without the header and
 * totals rows. A range that crosses a table edge cannot sort (Microsoft
 * Support, "Sort data in a range or table in Excel": "You cannot sort this
 * way in a table").
 */
export function tablesAllowRowMove(tables: readonly WorkbookTable[], bounds: Range): boolean {
  return tables.every((table) => {
    const { range } = table;
    const bodyStart = range.start.row + (table.headerRow ? 1 : 0);
    const bodyEnd = range.end.row - (table.totalsRow ? 1 : 0);
    const crosses =
      range.sheet === bounds.sheet &&
      range.start.row <= bounds.end.row &&
      range.end.row >= bounds.start.row &&
      range.start.col <= bounds.end.col &&
      range.end.col >= bounds.start.col;
    if (!crosses) return true;

    return (
      bounds.start.row === bodyStart &&
      bounds.end.row === bodyEnd &&
      bounds.start.col === range.start.col &&
      bounds.end.col === range.end.col
    );
  });
}

/** Excel's message when merged cells of different sizes block a sort. */
export const MERGED_CELLS_SORT_MESSAGE =
  "This operation requires the merged cells to be identically sized.";

/** How a sort request changes a range. */
export type SortRangePlan =
  | { kind: "move"; operation: PermuteRowsOperation }
  | { kind: "unchanged" }
  | { kind: "refused"; message: string };
