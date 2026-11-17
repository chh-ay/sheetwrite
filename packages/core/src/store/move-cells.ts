/**
 * Sheet metadata that moves with a block of cells in a `moveCells`
 * operation, as Excel's Cut and Paste moves it: the block's notes,
 * hyperlinks and merged cells go with it and replace those of the cells it
 * lands on. A range elsewhere follows the block by the rule the engine uses
 * for formula references (`moveCellRange`).
 */
import type { CellHyperlink } from "../types/cell.js";
import type { MergeRange, Range, SheetId } from "../types/coordinates.js";
import type { CellNote, DocumentOp, Sheet } from "../types/document.js";
import { cellRange, movedBlock, normalizedRange } from "./ranges.js";

export type MoveCellsOperation = Extract<DocumentOp, { op: "moveCells" }>;

/** The normalized source block of a move and the block it lands on. */
export interface CellBlockMove {
  readonly from: Range;
  readonly to: Range;
}

export function cellBlockMove(patch: MoveCellsOperation): CellBlockMove {
  return { from: normalizedRange(patch.range), to: movedBlock(patch) };
}

function holds(block: Range, sheet: SheetId, row: number, col: number): boolean {
  return (
    sheet === block.sheet &&
    row >= block.start.row &&
    row <= block.end.row &&
    col >= block.start.col &&
    col <= block.end.col
  );
}

function holdsRange(block: Range, range: Range): boolean {
  return (
    holds(block, range.sheet, range.start.row, range.start.col) &&
    holds(block, range.sheet, range.end.row, range.end.col)
  );
}

function meets(block: Range, range: Range): boolean {
  return (
    range.sheet === block.sheet &&
    range.start.row <= block.end.row &&
    range.end.row >= block.start.row &&
    range.start.col <= block.end.col &&
    range.end.col >= block.start.col
  );
}

function shifted(range: Range, move: CellBlockMove): Range {
  const rows = move.to.start.row - move.from.start.row;
  const cols = move.to.start.col - move.from.start.col;
  return {
    sheet: move.to.sheet,
    start: { row: range.start.row + rows, col: range.start.col + cols },
    end: { row: range.end.row + rows, col: range.end.col + cols },
  };
}

/**
 * The span `start..end` after the indices `from..from + count - 1` move to
 * `to`, when they hold exactly one end of it; `null` otherwise.
 */
function movedEdge(
  start: number,
  end: number,
  from: number,
  count: number,
  to: number,
): [number, number] | null {
  const inside = (index: number) => index >= from && index < from + count;
  let span: [number, number];
  if (!inside(start) && inside(end)) span = [start, end - from + to];
  else if (inside(start) && !inside(end)) span = [start - from + to, end];
  else return null;
  return span[0] <= span[1] ? span : null;
}

/** The axis a block moves along, then the axis it must cover the range on. */
const AXES = [
  ["row", "col"],
  ["col", "row"],
] as const;

/**
 * Where `range` is after `move`, as the engine moves a reference. A range
 * inside the source block moves with it. A range inside the cells the block
 * lands on is lost: `null`, which a formula shows as `#REF!`. A range the
 * block covers only in part moves the edge the block holds when the block
 * moves along it, so `A1:A10` becomes `A1:A15` when A10 moves to A15. Any
 * other range keeps its place. `last` is the last row and column of the
 * source sheet: a range that spans its sheet on an axis keeps spanning it.
 */
export function moveCellRange(
  range: Range,
  move: CellBlockMove,
  last: { row: number; col: number },
): Range | null {
  const bounds = normalizedRange(range);
  const { from, to } = move;
  if (holdsRange(from, bounds)) return shifted(bounds, move);
  if (holdsRange(to, bounds)) return null;
  if (bounds.sheet !== from.sheet || to.sheet !== from.sheet) return range;

  const { start, end } = bounds;
  for (const [axis, across] of AXES) {
    const along =
      from.start[across] === to.start[across] &&
      from.start[across] <= start[across] &&
      end[across] <= from.end[across] &&
      !(start[axis] === 0 && end[axis] >= last[axis]);
    if (!along) continue;
    const count = from.end[axis] - from.start[axis] + 1;
    const span = movedEdge(start[axis], end[axis], from.start[axis], count, to.start[axis]);
    if (!span) return range;
    return {
      sheet: bounds.sheet,
      start: { ...start, [axis]: span[0] },
      end: { ...end, [axis]: span[1] },
    };
  }
  return range;
}

/**
 * Items of both sheets that sit on a range of cells, after the move: an item
 * inside the block moves with it, and one on the cells it lands on goes. For
 * a move on one sheet, `fromItems` and `toItems` are the same list.
 */
function movedItems<T>(
  fromItems: readonly T[],
  toItems: readonly T[],
  move: CellBlockMove,
  rangeOf: (item: T) => Range,
  placed: (item: T, range: Range) => T,
): { from: T[]; to: T[] } {
  const moving: T[] = [];
  const keptFrom: T[] = [];
  for (const item of fromItems) {
    const range = rangeOf(item);
    if (holdsRange(move.from, range)) moving.push(placed(item, shifted(range, move)));
    else if (!meets(move.to, range)) keptFrom.push(item);
  }
  if (move.from.sheet === move.to.sheet) {
    const items = [...keptFrom, ...moving];
    return { from: items, to: items };
  }
  const keptTo = toItems.filter((item) => !meets(move.to, rangeOf(item)));
  return { from: keptFrom, to: [...keptTo, ...moving] };
}

/** Notes of both sheets after the move; see `movedItems`. */
export function movedNotes(
  fromNotes: readonly CellNote[],
  toNotes: readonly CellNote[],
  move: CellBlockMove,
): { from: CellNote[]; to: CellNote[] } {
  return movedItems(
    fromNotes,
    toNotes,
    move,
    (note) => cellRange(note.addr),
    (note, range) => ({ ...note, addr: { sheet: range.sheet, ...range.start } }),
  );
}

/** Hyperlinks of both sheets after the move; see `movedItems`. */
export function movedHyperlinks(
  fromLinks: readonly CellHyperlink[],
  toLinks: readonly CellHyperlink[],
  move: CellBlockMove,
): { from: CellHyperlink[]; to: CellHyperlink[] } {
  return movedItems(
    fromLinks,
    toLinks,
    move,
    (link) => normalizedRange(link.range),
    (link, range) => ({ ...link, range }),
  );
}

function mergeRange(sheet: SheetId, merge: MergeRange): Range {
  return {
    sheet,
    start: { row: merge.r0, col: merge.c0 },
    end: { row: merge.r1, col: merge.c1 },
  };
}

/**
 * Merged cells of both sheets after the move, or `null` when the move would
 * cut through a merged cell: one that the source block or the cells it lands
 * on hold only in part ("Cannot change part of a merged cell" in Excel).
 */
export function movedMerges(
  fromSheet: Sheet,
  toSheet: Sheet,
  move: CellBlockMove,
): { from: MergeRange[]; to: MergeRange[] } | null {
  const moving: MergeRange[] = [];
  const keptFrom: MergeRange[] = [];
  for (const merge of fromSheet.merges ?? []) {
    const range = mergeRange(fromSheet.id, merge);
    if (holdsRange(move.from, range)) {
      const { start, end } = shifted(range, move);
      moving.push({ ...merge, r0: start.row, c0: start.col, r1: end.row, c1: end.col });
    } else if (meets(move.from, range)) {
      return null;
    } else {
      keptFrom.push(merge);
    }
  }

  const keep = (merges: readonly MergeRange[], sheet: SheetId): MergeRange[] | null => {
    const kept: MergeRange[] = [];
    for (const merge of merges) {
      const range = mergeRange(sheet, merge);
      if (!meets(move.to, range)) kept.push(merge);
      else if (!holdsRange(move.to, range)) return null;
    }
    return kept;
  };
  if (fromSheet === toSheet) {
    const kept = keep(keptFrom, fromSheet.id);
    return kept && { from: [...kept, ...moving], to: [...kept, ...moving] };
  }
  const keptFromSheet = keep(keptFrom, fromSheet.id);
  const keptTo = keep(toSheet.merges ?? [], toSheet.id);
  return keptFromSheet && keptTo && { from: keptFromSheet, to: [...keptTo, ...moving] };
}
