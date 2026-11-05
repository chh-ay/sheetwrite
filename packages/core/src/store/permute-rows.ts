/**
 * Sheet metadata that moves with the rows of a `permuteRows` operation.
 * Notes and hyperlinks are cell properties, so they move with their row, as
 * in an Excel sort. A merged cell moves only as a whole record of rows.
 */
import type { CellHyperlink } from "../types/cell.js";
import type { MergeRange, Range } from "../types/coordinates.js";
import type { CellNote } from "../types/document.js";

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
