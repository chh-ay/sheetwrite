import { isPlainRecord, ownValue } from "./plain-data.js";
import type { CellValue } from "./types/cell.js";
import type { ExternalLinkSheet } from "./types/external-link.js";

/** Most linked workbooks in one workbook; Excel files rarely hold more than a few. */
const MAX_EXTERNAL_LINKS = 1_024;
/** Longest book name, sheet name or target. */
const MAX_NAME_LENGTH = 2_048;
/** Most saved cells over all links, which bounds the engine memory they use. */
export const MAX_EXTERNAL_CELLS = 1_000_000;
/**
 * Most cells in the rectangle from A1 to the last saved cell of one linked
 * sheet: the engine holds that rectangle densely, so this matches its limit.
 */
export const MAX_EXTERNAL_SHEET_AREA = 5_000_000;
/** Excel's sheet limits; link cells use the same coordinates. */
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
/** The errors that formulas can hold as values. */
const ERROR_VALUE = /^#(?:DIV\/0!|NULL!|SPILL!|CALC!|VALUE!|REF!|NAME\?|NUM!|N\/A)$/;

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface ExternalLinkIssueSink {
  push(...issues: { path: string; code: "invalid-value"; message: string }[]): number;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isIndex(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < limit;
}

/**
 * Check the bounded shape of `value` at the trust boundary: at most
 * `MAX_EXTERNAL_LINKS` links with unique book names without brackets, a
 * target, and named sheets with cell arrays. The cells themselves are checked
 * once, when `installExternalLinks` gives them to the engine.
 */
export function validateExternalLinksShape(
  value: unknown,
  path: string,
  issues: ExternalLinkIssueSink,
): void {
  const books = new Set<string>();
  const valid =
    Array.isArray(value) &&
    value.length <= MAX_EXTERNAL_LINKS &&
    value.every((link: unknown) => {
      const book = isPlainRecord(link) ? ownValue(link, "book") : undefined;
      const sheets = isPlainRecord(link) ? ownValue(link, "sheets") : undefined;
      const unique = isName(book) && !/[[\]]/.test(book) && !books.has(book.toLowerCase());
      if (unique) books.add(book.toLowerCase());
      return (
        unique &&
        isPlainRecord(link) &&
        isName(ownValue(link, "target")) &&
        Array.isArray(sheets) &&
        sheets.every(
          (sheet: unknown) =>
            isPlainRecord(sheet) &&
            isName(ownValue(sheet, "name")) &&
            Array.isArray(ownValue(sheet, "cells")),
        )
      );
    });
  if (!valid) issues.push({ path, code: "invalid-value", message: "invalid external links" });
}

/**
 * The cells of one linked sheet as one sparse block from A1 to its last cell,
 * or undefined for a cell outside the sheet limits, a value that formulas
 * cannot hold, or a block past `MAX_EXTERNAL_SHEET_AREA`. An error has no
 * literal cell value, so a one-value array constant (`={#N/A}`) holds it.
 */
export function externalLinkBlock(
  sheet: ExternalLinkSheet,
): { rows: number; cols: number; cells: { offset: number; value: CellValue }[] } | undefined {
  let rows = 1;
  let cols = 1;
  for (const { row, col, value } of sheet.cells) {
    const valid =
      isIndex(row, MAX_ROWS) &&
      isIndex(col, MAX_COLUMNS) &&
      (typeof value === "number"
        ? Number.isFinite(value)
        : typeof value === "string" ||
          typeof value === "boolean" ||
          (isPlainRecord(value) && ERROR_VALUE.test(String(ownValue(value, "error")))));
    if (!valid) return undefined;
    rows = Math.max(rows, row + 1);
    cols = Math.max(cols, col + 1);
  }
  if (rows * cols > MAX_EXTERNAL_SHEET_AREA) return undefined;

  const cells = sheet.cells.map(({ row, col, value }) => ({
    offset: row * cols + col,
    value:
      typeof value === "object"
        ? ({ kind: "formula", src: `={${value.error}}` } as const)
        : ({ kind: "literal", value } as const),
  }));
  return { rows, cols, cells };
}
