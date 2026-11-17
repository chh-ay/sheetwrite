/**
 * Sheet metadata that moves with a block of cells in a `moveCells`
 * operation, as Excel's Cut and Paste moves it: the block's notes,
 * hyperlinks, validation and conditional-format rules and merged cells go
 * with it and replace those of the cells it lands on. A range elsewhere
 * follows the block by the rule the engine uses for formula references
 * (`moveCellRange`). A shifting move (Excel's Insert or Delete with Shift
 * cells) moves every item and range by the rule of inserted and deleted
 * cells instead (`shiftCellRange`), and refuses to cut through a merged
 * cell.
 */
import { moveFormulaCellRefs } from "../a1.js";
import type { CellHyperlink, ConditionalFormatRule } from "../types/cell.js";
import type { MergeRange, Range, SheetId } from "../types/coordinates.js";
import type { CellNote, DataValidationRule, DocumentOp, Sheet } from "../types/document.js";
import { cellRange, movedBlock, normalizedRange } from "./ranges.js";

export type MoveCellsOperation = Extract<DocumentOp, { op: "moveCells" }>;

/**
 * The normalized source block of a move, the block it lands on, and whether
 * it is Excel's Insert or Delete with Shift cells.
 */
export interface CellBlockMove {
  readonly from: Range;
  readonly to: Range;
  readonly shift: boolean;
}

export function cellBlockMove(patch: MoveCellsOperation): CellBlockMove {
  return { from: normalizedRange(patch.range), to: movedBlock(patch), shift: patch.shift === true };
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

/** The last row and column of every sheet: a range that reaches one from the first keeps spanning its axis. */
const SHEET_LAST = { row: 1_048_575, col: 16_383 } as const;

/**
 * Where `range` is after `move`, as the engine moves a reference. A range
 * inside the source block moves with it. A range inside the cells the block
 * lands on is lost: `null`, which a formula shows as `#REF!`. A range the
 * block covers only in part moves the edge the block holds when the block
 * moves along it, so `A1:A10` becomes `A1:A15` when A10 moves to A15. Any
 * other range keeps its place, and a whole row or column keeps spanning its
 * sheet.
 */
export function moveCellRange(range: Range, move: CellBlockMove): Range | null {
  if (move.shift) return shiftCellRange(range, move);
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
      !(start[axis] === 0 && end[axis] >= SHEET_LAST[axis]);
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
 * The span `start..end` after `delta` indices are inserted (positive) or
 * deleted (negative) at `at`, as inserted and deleted rows change a range:
 * it grows or shrinks, and `null` when every index of it is deleted.
 */
function shiftedSpan(
  start: number,
  end: number,
  at: number,
  delta: number,
): [number, number] | null {
  if (delta >= 0) return [start >= at ? start + delta : start, end >= at ? end + delta : end];
  const deletedEnd = at - delta;
  if (end < at) return [start, end];
  if (start >= deletedEnd) return [start + delta, end + delta];
  if (start < at) return [start, end >= deletedEnd ? end + delta : at - 1];
  return end >= deletedEnd ? [at, end + delta] : null;
}

/**
 * Where `range` is after a shifting move, as the engine moves a reference
 * (`CellMove::shift_fate`): inside the block's columns (rows, for a move
 * along a row), inserting moves everything from the block's first row down
 * and deleting removes the cells between where the block lands and where it
 * starts. A range in deleted cells, or pushed past the sheet's edge, is
 * lost: `null`. A range that also covers a column beside the block, or
 * spans its sheet, keeps its place.
 */
export function shiftCellRange(range: Range, move: CellBlockMove): Range | null {
  const bounds = normalizedRange(range);
  const { from, to } = move;
  if (bounds.sheet !== from.sheet) return range;
  const [axis, across] = from.start.col === to.start.col ? AXES[0] : AXES[1];
  const { start, end } = bounds;
  const last = SHEET_LAST[axis];
  if (
    start[across] < from.start[across] ||
    end[across] > from.end[across] ||
    (start[axis] === 0 && end[axis] >= last)
  ) {
    return range;
  }
  const blockStart = from.start[axis];
  const landing = to.start[axis];
  const at = Math.min(blockStart, landing);
  const span = shiftedSpan(start[axis], end[axis], at, landing - blockStart);
  if (!span || span[0] > last) return null;
  const movedEnd = Math.min(span[1], last);
  if (span[0] === start[axis] && movedEnd === end[axis]) return range;
  return {
    sheet: bounds.sheet,
    start: { ...start, [axis]: span[0] },
    end: { ...end, [axis]: movedEnd },
  };
}

/**
 * The cells a shifting move changes: from where the block starts or lands,
 * whichever is first, to the sheet's edge, in the block's columns (rows,
 * for a move along a row).
 */
function shiftedArea(move: CellBlockMove): Range {
  const { from, to } = move;
  const [axis] = from.start.col === to.start.col ? AXES[0] : AXES[1];
  const start = { ...from.start, [axis]: Math.min(from.start[axis], to.start[axis]) };
  const end = { ...from.end, [axis]: SHEET_LAST[axis] };
  return { sheet: from.sheet, start, end };
}
/**
 * The cells a shifting move deletes: those between where the block lands
 * and where it started, when it moves up or left; otherwise `null`.
 */
export function shiftDeletedCells(move: CellBlockMove): Range | null {
  const { from, to } = move;
  if (!move.shift) return null;
  const [axis] = from.start.col === to.start.col ? AXES[0] : AXES[1];
  if (to.start[axis] >= from.start[axis]) return null;
  return {
    sheet: from.sheet,
    start: { ...from.start, [axis]: to.start[axis] },
    end: { ...from.end, [axis]: from.start[axis] - 1 },
  };
}

/** The lists of a sheet that hold items on ranges of cells, which a block move carries. */
export type MovedSheetItems = "notes" | "hyperlinks" | "validationRules" | "conditionalFormats";

/** How `movedItems` reads and moves one kind of item. */
interface ItemKind<T> {
  readonly rangeOf: (item: T) => Range;
  readonly placed: (item: T, range: Range, move: CellBlockMove) => T;
  /**
   * Whether an item that stays goes because the block lands on it. A note
   * or link goes when the block covers any of its cells. A rule goes only
   * when the block covers all of its range: a rule cannot keep part of it.
   */
  readonly replaced: (target: Range, range: Range) => boolean;
}

/**
 * Items of both sheets after the move: an item inside the block moves with
 * it, and an item on the cells it lands on goes. For a move on one sheet,
 * `fromItems` and `toItems` are the same list.
 */
function movedItems<T>(
  fromItems: readonly T[],
  toItems: readonly T[],
  move: CellBlockMove,
  kind: ItemKind<T>,
): { from: T[]; to: T[] } {
  if (move.shift) {
    // A shift stays on one sheet; each item follows the rule of inserted
    // and deleted cells, and one in deleted cells goes.
    const items: T[] = [];
    for (const item of fromItems) {
      const range = kind.rangeOf(item);
      const moved = shiftCellRange(range, move);
      if (moved === range) items.push(item);
      else if (moved) items.push(kind.placed(item, moved, move));
    }
    return { from: items, to: items };
  }
  const moving: T[] = [];
  const keptFrom: T[] = [];
  for (const item of fromItems) {
    const range = kind.rangeOf(item);
    if (holdsRange(move.from, range)) moving.push(kind.placed(item, shifted(range, move), move));
    else if (!kind.replaced(move.to, range)) keptFrom.push(item);
  }
  if (move.from.sheet === move.to.sheet) {
    const items = [...keptFrom, ...moving];
    return { from: items, to: items };
  }
  const keptTo = toItems.filter((item) => !kind.replaced(move.to, kind.rangeOf(item)));
  return { from: keptFrom, to: [...keptTo, ...moving] };
}

const NOTES: ItemKind<CellNote> = {
  rangeOf: (note) => cellRange(note.addr),
  placed: (note, range) => ({ ...note, addr: { sheet: range.sheet, ...range.start } }),
  replaced: meets,
};

const HYPERLINKS: ItemKind<CellHyperlink> = {
  rangeOf: (link) => normalizedRange(link.range),
  placed: (link, range) => ({ ...link, range }),
  replaced: meets,
};

const VALIDATION_RULES: ItemKind<DataValidationRule> = {
  rangeOf: (rule) => normalizedRange(rule.range),
  placed: (rule, range) => ({ ...rule, range }),
  replaced: holdsRange,
};

/**
 * A formula rule is anchored at its range's top-left cell, which moves with
 * the block, so its references follow the engine's cut rules as a moved
 * cell's formula does.
 */
const CONDITIONAL_FORMATS: ItemKind<ConditionalFormatRule> = {
  rangeOf: (rule) => normalizedRange(rule.range),
  placed: (rule, range, { from, to, shift }) => {
    if (rule.when.kind !== "formula") return { ...rule, range };
    const block = {
      row: from.start.row,
      col: from.start.col,
      rows: from.end.row - from.start.row + 1,
      cols: from.end.col - from.start.col + 1,
    };
    const source = moveFormulaCellRefs(rule.when.source, block, to.start, shift);
    return { ...rule, range, when: { kind: "formula", source } };
  },
  replaced: holdsRange,
};

/** Notes of both sheets after the move; see `movedItems`. */
export function movedNotes(
  fromNotes: readonly CellNote[],
  toNotes: readonly CellNote[],
  move: CellBlockMove,
): { from: CellNote[]; to: CellNote[] } {
  return movedItems(fromNotes, toNotes, move, NOTES);
}

/** Hyperlinks of both sheets after the move; see `movedItems`. */
export function movedHyperlinks(
  fromLinks: readonly CellHyperlink[],
  toLinks: readonly CellHyperlink[],
  move: CellBlockMove,
): { from: CellHyperlink[]; to: CellHyperlink[] } {
  return movedItems(fromLinks, toLinks, move, HYPERLINKS);
}

/** Validation rules of both sheets after the move; see `movedItems`. */
export function movedValidationRules(
  fromRules: readonly DataValidationRule[],
  toRules: readonly DataValidationRule[],
  move: CellBlockMove,
): { from: DataValidationRule[]; to: DataValidationRule[] } {
  return movedItems(fromRules, toRules, move, VALIDATION_RULES);
}

/** Conditional-format rules of both sheets after the move; see `movedItems`. */
export function movedConditionalFormats(
  fromRules: readonly ConditionalFormatRule[],
  toRules: readonly ConditionalFormatRule[],
  move: CellBlockMove,
): { from: ConditionalFormatRule[]; to: ConditionalFormatRule[] } {
  return movedItems(fromRules, toRules, move, CONDITIONAL_FORMATS);
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
  if (move.shift) {
    // A merged cell inside the shifted cells moves whole, one in deleted
    // cells goes, and one the shift would stretch, shrink or split stops it.
    const area = shiftedArea(move);
    const size = (range: Range) =>
      `${range.end.row - range.start.row},${range.end.col - range.start.col}`;
    const merges: MergeRange[] = [];
    for (const merge of fromSheet.merges ?? []) {
      const range = mergeRange(fromSheet.id, merge);
      if (!meets(area, range)) {
        merges.push(merge);
        continue;
      }
      const moved = shiftCellRange(range, move);
      if (moved === null) continue;
      if (moved === range || size(moved) !== size(range)) return null;
      merges.push({
        ...merge,
        r0: moved.start.row,
        c0: moved.start.col,
        r1: moved.end.row,
        c1: moved.end.col,
      });
    }
    return { from: merges, to: merges };
  }
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
