import type { CellRef } from "./selection.js";

/** Last column index (0-based, "XFD") and last row number of an Excel worksheet. */
const LAST_COLUMN_INDEX = 16_383;
const LAST_ROW_NUMBER = 1_048_576;

/** A range with a `#REF!` corner; Excel replaces the whole range with `#REF!`. */
const RANGE_WITH_CORNERS =
  /"(?:[^"]|"")*"|'(?:[^']|'')*'|(#REF!|\$?[A-Za-z]{1,3}\$?[0-9]+):(#REF!|\$?[A-Za-z]{1,3}\$?[0-9]+)/g;

const NAME_CHARACTER = /[A-Za-z0-9_]/;

/**
 * Whether A1-shaped text at `offset` is part of a longer name, not a reference:
 * a letter, digit or `_` touches it on either side, or `(` follows it, as in
 * `LOG10(` or `BIN2DEC`.
 */
function isGluedToName(text: string, offset: number, length: number): boolean {
  const before = offset > 0 ? text.charAt(offset - 1) : "";
  const after = text.charAt(offset + length);
  return NAME_CHARACTER.test(before) || after === "(" || NAME_CHARACTER.test(after);
}

/** Column index (0-based) → A1 column label (0 → "A", 26 → "AA"). */
export function colToA1(col: number): string {
  let c = col + 1;
  let out = "";

  while (c > 0) {
    const rem = (c - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    c = Math.floor((c - 1) / 26);
  }

  return out;
}

/** A1 column label → 0-based column index (inverse of {@link colToA1}). */
export function labelToCol(label: string): number {
  let c = 0;
  for (let i = 0; i < label.length; i++) c = c * 26 + (label.charCodeAt(i) - 64);
  return c - 1;
}

/** 0-based (row, col) → A1 cell reference (0, 0 → "A1"). */
export function cellA1(row: number, col: number): string {
  return `${colToA1(col)}${row + 1}`;
}

/** Two cell corners → A1 range ("A1:B3"), collapsing to a single ref when equal. */
export function rangeA1(a: CellRef, b: CellRef): string {
  if (a.row === b.row && a.col === b.col) return cellA1(a.row, a.col);

  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col);
  const c1 = Math.max(a.col, b.col);

  return `${cellA1(r0, c0)}:${cellA1(r1, c1)}`;
}

/**
 * Shift relative A1 references in a formula by (dRow, dCol) — used when a
 * formula is filled into other cells. Absolute parts ($A, A$1) stay fixed, and
 * tokens preceded by an alphanumeric (function names, identifiers) are skipped.
 * A reference shifted off the sheet becomes `#REF!`, and so does any range
 * with such a corner.
 */
export function shiftA1Refs(src: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return src;

  const shifted = src.replace(
    /"(?:[^"]|"")*"|'(?:[^']|'')*'|(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)/g,
    (
      match: string,
      ca: string,
      letters: string,
      ra: string,
      digits: string,
      offset: number,
      full: string,
    ): string => {
      if (match.startsWith('"') || match.startsWith("'")) return match;
      if (isGluedToName(full, offset, match.length)) return match;

      let col = labelToCol(letters.toUpperCase());
      let rowNum = Number(digits);

      if (!ca) col += dCol;
      if (!ra) rowNum += dRow;
      if (col < 0 || col > LAST_COLUMN_INDEX || rowNum < 1 || rowNum > LAST_ROW_NUMBER) {
        return "#REF!";
      }

      return `${ca}${colToA1(col)}${ra}${rowNum}`;
    },
  );

  return shifted.replace(RANGE_WITH_CORNERS, (match: string, start?: string, end?: string) =>
    start === "#REF!" || end === "#REF!" ? "#REF!" : match,
  );
}

/** One A1 corner parsed for a structural remap. */
interface A1Corner {
  readonly colAbsolute: string;
  readonly rowAbsolute: string;
  readonly col: number;
  readonly row: number;
}

function a1Corner(colAbsolute: string, letters: string, rowAbsolute: string, digits: string) {
  return {
    colAbsolute,
    rowAbsolute,
    col: labelToCol(letters.toUpperCase()),
    row: Number(digits) - 1,
  } satisfies A1Corner;
}

function writeCorner(corner: A1Corner, axis: "row" | "column", index: number): string {
  const col = axis === "column" ? index : corner.col;
  const row = axis === "row" ? index : corner.row;
  return `${corner.colAbsolute}${colToA1(col)}${corner.rowAbsolute}${row + 1}`;
}

/**
 * First surviving index from `from` toward `to`, or null when every index in
 * between was deleted. The walk ends after the deleted run, so it costs at most
 * the number of deleted rows or columns.
 */
function survivingIndex(
  from: number,
  to: number,
  remap: (index: number) => number | null,
): number | null {
  const step = from <= to ? 1 : -1;
  for (let index = from; ; index += step) {
    const mapped = remap(index);
    if (mapped !== null) return mapped;
    if (index === to) return null;
  }
}

/**
 * Rewrite unqualified A1 references through one structural row/column mapping.
 * Absolute markers control copy translation, not structural identity, so both
 * relative and absolute coordinates follow inserts/removes/moves. Qualified
 * references are left for their target sheet's own structural pass. As in
 * Excel, a range whose edge rows or columns are deleted shrinks to the ones
 * left, and only a range with none left becomes `#REF!`.
 */
export function remapFormulaA1Refs(
  source: string,
  axis: "row" | "column",
  remap: (index: number) => number | null,
): string {
  return source.replace(
    /"(?:[^"]|"")*"|'(?:[^']|'')*'|(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)(?::(\$?)([A-Za-z]{1,3})(\$?)([0-9]+))?(#?)/g,
    (
      match: string,
      colAbsolute: string,
      letters: string,
      rowAbsolute: string,
      digits: string,
      endColAbsolute: string | undefined,
      endLetters: string | undefined,
      endRowAbsolute: string | undefined,
      endDigits: string | undefined,
      spill: string,
      offset: number,
      full: string,
    ): string => {
      if (match.startsWith('"') || match.startsWith("'")) return match;
      if (offset > 0 && full.charAt(offset - 1) === "!") return match;
      if (isGluedToName(full, offset, match.length)) return match;
      const start = a1Corner(colAbsolute, letters, rowAbsolute, digits);
      const at = (corner: A1Corner) => (axis === "row" ? corner.row : corner.col);

      if (endLetters === undefined || endDigits === undefined) {
        const mapped = remap(at(start));
        // A deleted anchor also ends its spill reference: `A1#` becomes `#REF!`.
        return mapped === null ? "#REF!" : `${writeCorner(start, axis, mapped)}${spill}`;
      }

      const end = a1Corner(endColAbsolute ?? "", endLetters, endRowAbsolute ?? "", endDigits);
      const low = Math.min(at(start), at(end));
      const high = Math.max(at(start), at(end));
      const mappedLow = survivingIndex(low, high, remap);
      const mappedHigh = survivingIndex(high, low, remap);
      if (mappedLow === null || mappedHigh === null) return "#REF!";
      const startIsLow = at(start) <= at(end);
      const range = `${writeCorner(start, axis, startIsLow ? mappedLow : mappedHigh)}:${writeCorner(end, axis, startIsLow ? mappedHigh : mappedLow)}`;
      return `${range}${spill}`;
    },
  );
}
