/**
 * The data validation rules a copy carries and a paste lands. Excel's Paste,
 * and Paste Special's All and Validation choices, give the cells a paste
 * covers the copied cells' rules in place of their own. This module is the one
 * path for that: the clipboard's paste and Paste Special (#821) both call
 * `validationPastePatches`, and the Data Validation command shares
 * `clearedValidationPatches` with it.
 */

import { shiftA1Refs } from "./a1.js";
import { normalizedRange, rangesIntersect } from "./store/ranges.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DataValidationRule, DocumentOp, Sheet } from "./types/document.js";
import { mapValidationFormulas } from "./validation-rule.js";

/** A rule's fields without its ID and range. */
export type ValidationSettings = Omit<DataValidationRule, "id" | "range">;

/**
 * A copied rule over part of the copied block: `rows` and `cols` are offsets
 * from the block's top-left cell, inclusive. Its formulas are anchored at the
 * piece's own top-left cell, so a paste only places the piece.
 */
export interface CopiedValidation {
  readonly rule: ValidationSettings;
  readonly rows: readonly [number, number];
  readonly cols: readonly [number, number];
}

/** Where a paste lands, in data rows: its top-left cell and its size. */
export interface PasteArea {
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
}

/** `range` without the cells of `cut`: up to four rectangles around it. */
function subtract(range: Range, cut: Range): Range[] {
  const outer = normalizedRange(range);
  if (!rangesIntersect(outer, cut)) return [outer];
  const inner = normalizedRange(cut);
  const top = Math.max(outer.start.row, inner.start.row);
  const bottom = Math.min(outer.end.row, inner.end.row);
  const pieces: Range[] = [];
  const piece = (r0: number, c0: number, r1: number, c1: number): void => {
    if (r0 <= r1 && c0 <= c1) {
      pieces.push({ sheet: outer.sheet, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } });
    }
  };
  piece(outer.start.row, outer.start.col, inner.start.row - 1, outer.end.col);
  piece(inner.end.row + 1, outer.start.col, outer.end.row, outer.end.col);
  piece(top, outer.start.col, bottom, inner.start.col - 1);
  piece(top, inner.end.col + 1, bottom, outer.end.col);
  return pieces;
}

/** `range` without the cells of every one of `cuts`. */
export function subtractRanges(range: Range, cuts: readonly Range[]): Range[] {
  let pieces = [normalizedRange(range)];
  for (const cut of cuts) pieces = pieces.flatMap((piece) => subtract(piece, cut));
  return pieces;
}

/** Hands out rule IDs that none of `rules` uses: `validation-1`, `validation-2`… */
export function validationIdSource(rules: readonly DataValidationRule[]): () => string {
  const ids = new Set(rules.map((rule) => rule.id));
  let next = 1;
  return () => {
    while (ids.has(`validation-${next}`)) next++;
    const id = `validation-${next}`;
    ids.add(id);
    return id;
  };
}

/** `rule`'s settings with its formulas anchored at `cell` instead of its range's top-left. */
function reanchored(rule: DataValidationRule, cell: { row: number; col: number }): ValidationSettings {
  const origin = normalizedRange(rule.range).start;
  const { id: _id, range: _range, ...settings } = rule;
  const rows = cell.row - origin.row;
  const cols = cell.col - origin.col;
  if (rows === 0 && cols === 0) return settings;
  return {
    ...settings,
    condition: mapValidationFormulas(rule.condition, (formula) => shiftA1Refs(formula, rows, cols)),
  };
}

/** The rules over the copied `block` (data rows), cut to it. */
export function copiedValidation(
  rules: readonly DataValidationRule[],
  block: Range,
): CopiedValidation[] {
  const source = normalizedRange(block);
  const pieces: CopiedValidation[] = [];
  for (const rule of rules) {
    if (rule.range.sheet !== source.sheet || !rangesIntersect(rule.range, source)) continue;
    const range = normalizedRange(rule.range);
    const start = {
      row: Math.max(range.start.row, source.start.row),
      col: Math.max(range.start.col, source.start.col),
    };
    const end = {
      row: Math.min(range.end.row, source.end.row),
      col: Math.min(range.end.col, source.end.col),
    };
    pieces.push({
      rule: reanchored(rule, start),
      rows: [start.row - source.start.row, end.row - source.start.row],
      cols: [start.col - source.start.col, end.col - source.start.col],
    });
  }
  return pieces;
}

/**
 * The operations that take the rules off `areas` of `sheet`: a rule inside
 * them goes, and a rule they cover in part keeps its other cells, split into
 * rectangles with new IDs from `newId`.
 */
export function clearedValidationPatches(
  sheet: SheetId,
  rules: readonly DataValidationRule[],
  areas: readonly Range[],
  newId: () => string,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  for (const rule of rules) {
    if (!areas.some((area) => rangesIntersect(rule.range, area))) continue;
    const [kept, ...split] = subtractRanges(rule.range, areas);
    patches.push(
      kept
        ? { op: "setValidationRule", sheet, rule: { ...rule, range: kept } }
        : { op: "removeValidationRule", sheet, id: rule.id },
    );
    for (const range of split) {
      patches.push({ op: "setValidationRule", sheet, rule: { ...rule, id: newId(), range } });
    }
  }
  return patches;
}

/**
 * The operations a paste of `pieces`, copied from a `block`-sized range,
 * makes to the rules of `sheet` at `target`: the target's rules leave the
 * pasted cells, and the copied rules land on them. When `target` is a whole
 * multiple of the block, the block repeats to fill it, as the cells do.
 * `transpose` swaps each piece's rows and columns, as Paste Special's
 * Transpose does.
 */
export function validationPastePatches(
  sheet: Sheet,
  pieces: readonly CopiedValidation[],
  block: { readonly rows: number; readonly cols: number },
  target: PasteArea,
  options: { readonly transpose?: boolean } = {},
): DocumentOp[] {
  const transpose = options.transpose === true;
  const blockRows = transpose ? block.cols : block.rows;
  const blockCols = transpose ? block.rows : block.cols;
  if (blockRows <= 0 || blockCols <= 0) return [];
  const tiles =
    target.rows % blockRows === 0 && target.cols % blockCols === 0
      ? { rows: target.rows / blockRows, cols: target.cols / blockCols }
      : { rows: 1, cols: 1 };
  const pasted: Range = {
    sheet: sheet.id,
    start: { row: target.row, col: target.col },
    end: {
      row: target.row + blockRows * tiles.rows - 1,
      col: target.col + blockCols * tiles.cols - 1,
    },
  };
  const rules = sheet.validationRules ?? [];
  const newId = validationIdSource(rules);
  const patches = clearedValidationPatches(sheet.id, rules, [pasted], newId);
  for (let tileRow = 0; tileRow < tiles.rows; tileRow++) {
    for (let tileCol = 0; tileCol < tiles.cols; tileCol++) {
      const top = target.row + tileRow * blockRows;
      const left = target.col + tileCol * blockCols;
      for (const piece of pieces) {
        const [r0, r1] = transpose ? piece.cols : piece.rows;
        const [c0, c1] = transpose ? piece.rows : piece.cols;
        const range: Range = {
          sheet: sheet.id,
          start: { row: top + r0, col: left + c0 },
          end: { row: top + r1, col: left + c1 },
        };
        patches.push({ op: "setValidationRule", sheet: sheet.id, rule: { ...piece.rule, id: newId(), range } });
      }
    }
  }
  return patches;
}
