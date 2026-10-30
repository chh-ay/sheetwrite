// A1 text for the ranges that panels edit: `B2:D9`, `B7`, or a sheet-qualified
// `Sales!B2:D9` / `'Q1 Sales'!B2`. `$` markers are accepted, as in the name box.

import { labelToCol, rangeA1 } from "../a1.js";
import { sheetNameKey } from "../sheet-name.js";
import type { Range, SheetId } from "../types/coordinates.js";

/** The sheet facts that parsing needs: the ID, the name and the size. */
export interface RangeTextSheet {
  readonly id: SheetId;
  readonly name: string;
  readonly rowCount: number;
  readonly columns: { readonly length: number };
}

/** A parsed range, or the message that the panel shows under the field. */
export type RangeTextResult = { readonly range: Range } | { readonly error: string };

const RANGE_ERROR = "Enter a cell or range, for example B2:D9 or Sheet1!B2:D9.";
const SHEET_ERROR = "No sheet has this name.";
const BOUNDS_ERROR = "The range is outside the sheet.";

/** Optional `Sheet!` or `'Sheet name'!` prefix, then one cell or a two-cell range. */
const RANGE_TEXT =
  /^(?:(?:'((?:[^']|'')+)'|([^!'\s][^!]*))!)?\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/;

/** Sheet names that hold other characters than letters, digits and `_` are quoted. */
const PLAIN_SHEET_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * Parse `text` into a range. Without a sheet prefix the range is on
 * `defaultSheet`. Both corners must be inside the sheet.
 */
export function parseRangeText(
  text: string,
  sheets: readonly RangeTextSheet[],
  defaultSheet: SheetId,
): RangeTextResult {
  const match = RANGE_TEXT.exec(text.trim());
  if (!match) return { error: RANGE_ERROR };

  const [, quoted, plain, startCol = "", startRow, endCol = startCol, endRow = startRow] = match;
  const name = quoted === undefined ? plain : quoted.replaceAll("''", "'");
  const sheet =
    name === undefined
      ? sheets.find((candidate) => candidate.id === defaultSheet)
      : sheets.find((candidate) => sheetNameKey(candidate.name) === sheetNameKey(name.trim()));
  if (sheet === undefined) return { error: name === undefined ? RANGE_ERROR : SHEET_ERROR };

  const corner = (col: string, row: string | undefined) => ({
    row: Number(row) - 1,
    col: labelToCol(col.toUpperCase()),
  });
  const a = corner(startCol, startRow);
  const b = corner(endCol, endRow);
  const inside = ({ row, col }: { row: number; col: number }): boolean =>
    row >= 0 && row < sheet.rowCount && col >= 0 && col < sheet.columns.length;
  if (!inside(a) || !inside(b)) return { error: BOUNDS_ERROR };

  return {
    range: {
      sheet: sheet.id,
      start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
      end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
    },
  };
}

/** A1 text for `range`; the sheet name is written only when it is not `currentSheet`. */
export function formatRangeText(
  range: Range,
  sheets: readonly RangeTextSheet[],
  currentSheet: SheetId,
): string {
  const a1 = rangeA1(range.start, range.end);
  if (range.sheet === currentSheet) return a1;
  const sheet = sheets.find((candidate) => candidate.id === range.sheet);
  if (sheet === undefined) return a1;
  const name = PLAIN_SHEET_NAME.test(sheet.name)
    ? sheet.name
    : `'${sheet.name.replaceAll("'", "''")}'`;
  return `${name}!${a1}`;
}
