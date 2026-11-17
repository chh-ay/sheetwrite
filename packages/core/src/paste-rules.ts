// The notes and conditional formats a copy carries, and the operations that
// paste them. As in Excel, the pasted cells take the copied cells' notes and
// conditional formats in place of their own; Paste Special's "All merging
// conditional formats" keeps the target's rules beside the copied ones.

import { shiftA1Refs } from "./a1.js";
import { rangesIntersect } from "./store/ranges.js";
import type { ConditionalFormatRule } from "./types/cell.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet } from "./types/document.js";
import { subtractRanges } from "./validation-transfer.js";

/** A copied note, at its offset from the copied block's top-left. */
export interface CopiedNote {
  readonly row: number;
  readonly col: number;
  readonly text: string;
}

/**
 * The part of a conditional format's range inside a copied block: first and
 * last row and column as offsets from the block's top-left. A formula rule is
 * re-anchored at the part's own top-left.
 */
export interface CopiedConditionalFormat {
  readonly rule: Omit<ConditionalFormatRule, "range">;
  readonly rows: readonly [number, number];
  readonly cols: readonly [number, number];
}

/**
 * Where a paste lands, in data rows: its top-left, the rows and columns it
 * fills (the copied block, or a selection the block repeats over), and
 * whether it turns rows into columns.
 */
export interface PasteArea {
  readonly sheet: SheetId;
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
  readonly transpose?: boolean;
}

interface Bounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

function boundsOf(range: Range): Bounds {
  return {
    r0: Math.min(range.start.row, range.end.row),
    c0: Math.min(range.start.col, range.end.col),
    r1: Math.max(range.start.row, range.end.row),
    c1: Math.max(range.start.col, range.end.col),
  };
}

/** A rule cut down to `part` of its range; a formula follows its new top-left. */
function rulePart(rule: ConditionalFormatRule, from: Bounds, part: Bounds, sheet: SheetId) {
  const when =
    rule.when.kind === "formula"
      ? {
          kind: "formula" as const,
          source: shiftA1Refs(rule.when.source, part.r0 - from.r0, part.c0 - from.c0),
        }
      : rule.when;
  return {
    ...rule,
    when,
    range: { sheet, start: { row: part.r0, col: part.c0 }, end: { row: part.r1, col: part.c1 } },
  };
}

export function copyNotes(sheet: Sheet, block: Range): CopiedNote[] {
  const b = boundsOf(block);
  const notes: CopiedNote[] = [];
  for (const note of sheet.notes ?? []) {
    const { row, col } = note.addr;
    if (row < b.r0 || row > b.r1 || col < b.c0 || col > b.c1) continue;
    notes.push({ row: row - b.r0, col: col - b.c0, text: note.text });
  }
  return notes;
}

export function copyConditionalFormats(sheet: Sheet, block: Range): CopiedConditionalFormat[] {
  const b = boundsOf(block);
  const parts: CopiedConditionalFormat[] = [];
  for (const rule of sheet.conditionalFormats ?? []) {
    const r = boundsOf(rule.range);
    const part = {
      r0: Math.max(r.r0, b.r0),
      c0: Math.max(r.c0, b.c0),
      r1: Math.min(r.r1, b.r1),
      c1: Math.min(r.c1, b.c1),
    };
    if (part.r0 > part.r1 || part.c0 > part.c1) continue;
    const { range: _, ...cut } = rulePart(rule, r, part, block.sheet);
    parts.push({
      rule: cut,
      rows: [part.r0 - b.r0, part.r1 - b.r0],
      cols: [part.c0 - b.c0, part.c1 - b.c0],
    });
  }
  return parts;
}

/**
 * Each copy of the block the paste writes: its top-left offset in the area.
 * A block repeats when the area is a whole multiple of it, as cells do.
 */
function copiesOf(block: { rows: number; cols: number }, area: PasteArea): Array<[number, number]> {
  const rows = area.transpose ? block.cols : block.rows;
  const cols = area.transpose ? block.rows : block.cols;
  const repeat = area.rows % rows === 0 && area.cols % cols === 0;
  const copies: Array<[number, number]> = [];
  for (let row = 0; row < (repeat ? area.rows : rows); row += rows) {
    for (let col = 0; col < (repeat ? area.cols : cols); col += cols) copies.push([row, col]);
  }
  return copies;
}

/** Where a copied part lands in one copy of the block, transposed when the paste is. */
function placed(
  rows: readonly [number, number],
  cols: readonly [number, number],
  area: PasteArea,
  [row, col]: [number, number],
): Bounds {
  const [r, c] = area.transpose ? [cols, rows] : [rows, cols];
  return {
    r0: area.row + row + r[0],
    c0: area.col + col + c[0],
    r1: area.row + row + r[1],
    c1: area.col + col + c[1],
  };
}

/** The area's cells take the copied notes: notes of other cells there go. */
export function notePastePatches(
  sheet: Sheet,
  notes: readonly CopiedNote[],
  block: { rows: number; cols: number },
  area: PasteArea,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  const added = new Set<string>();
  for (const copy of copiesOf(block, area)) {
    for (const note of notes) {
      const at = placed([note.row, note.row], [note.col, note.col], area, copy);
      added.add(`${at.r0}:${at.c0}`);
      patches.push({
        op: "setNote",
        addr: { sheet: area.sheet, row: at.r0, col: at.c0 },
        text: note.text,
      });
    }
  }
  const removed: DocumentOp[] = [];
  for (const note of sheet.notes ?? []) {
    const { row, col } = note.addr;
    if (row < area.row || row >= area.row + area.rows) continue;
    if (col < area.col || col >= area.col + area.cols || added.has(`${row}:${col}`)) continue;
    removed.push({ op: "setNote", addr: { sheet: area.sheet, row, col }, text: null });
  }
  return [...removed, ...patches];
}

/**
 * The area's cells take the copied conditional formats. The target's own
 * rules leave the area (a rule that covers part of it keeps the rest of its
 * range, in up to four pieces), unless `merge` keeps them, as Excel's "All
 * merging conditional formats" does.
 */
export function conditionalFormatPastePatches(
  sheet: Sheet,
  parts: readonly CopiedConditionalFormat[],
  block: { rows: number; cols: number },
  area: PasteArea,
  merge: boolean,
): DocumentOp[] {
  const existing = sheet.conditionalFormats ?? [];
  if (parts.length === 0 && (merge || existing.length === 0)) return [];
  const hole: Range = {
    sheet: area.sheet,
    start: { row: area.row, col: area.col },
    end: { row: area.row + area.rows - 1, col: area.col + area.cols - 1 },
  };
  const rules: ConditionalFormatRule[] = [];
  for (const rule of existing) {
    if (merge || !rangesIntersect(rule.range, hole)) {
      rules.push(rule);
      continue;
    }
    // The rest of the range around the hole, as validation rules split.
    const from = boundsOf(rule.range);
    for (const piece of subtractRanges(rule.range, [hole])) {
      rules.push(rulePart(rule, from, boundsOf(piece), area.sheet));
    }
  }
  for (const copy of copiesOf(block, area)) {
    for (const part of parts) {
      const at = placed(part.rows, part.cols, area, copy);
      rules.push({
        ...part.rule,
        range: {
          sheet: area.sheet,
          start: { row: at.r0, col: at.c0 },
          end: { row: at.r1, col: at.c1 },
        },
      });
    }
  }
  return [{ op: "setSheetMeta", sheet: area.sheet, patch: { conditionalFormats: rules } }];
}
