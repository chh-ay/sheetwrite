import { isPlainRecord, ownValue } from "./plain-data.js";
import type { ExternalLink } from "./types/external-link.js";

/** Most linked workbooks in one workbook; Excel files rarely hold more than a few. */
const MAX_EXTERNAL_LINKS = 1_024;
/** Longest book name, sheet name or target. */
const MAX_NAME_LENGTH = 2_048;
/** Most saved cells over all links, which bounds the engine memory they use. */
const MAX_EXTERNAL_CELLS = 1_000_000;
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

/** The engine calls that hold link values; `CellStore` implements them. */
export interface ExternalLinkEngine {
  addExternalSheet(book: string, sheet: string, columns: number, rows: number): number;
  setNumber(sheet: number, row: number, col: number, value: number, style: number): void;
  setString(sheet: number, row: number, col: number, value: string, style: number): void;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  setFormula(sheet: number, row: number, col: number, source: string, style: number): void;
  recompute(sheet: number): void;
  removeExternalSheet(book: string, sheet: string): boolean;
}

/** Remove the values of every link from the engine; formulas that read them show `#REF!`. */
export function removeExternalLinks(
  engine: ExternalLinkEngine,
  links: readonly ExternalLink[],
): void {
  for (const link of links) {
    for (const sheet of link.sheets) engine.removeExternalSheet(link.book, sheet.name);
  }
}

/**
 * Give the engine the saved values of every link, and return false at the
 * first cell outside the sheet limits, a value that formulas cannot hold, or
 * a linked sheet past the cell or area limits. Call it before formulas load,
 * because a formula finds its link when it is entered.
 */
export function installExternalLinks(
  engine: ExternalLinkEngine,
  links: readonly ExternalLink[],
): boolean {
  let total = 0;
  for (const link of links) {
    for (const sheet of link.sheets) {
      let rows = 1;
      let columns = 1;
      for (const cell of sheet.cells) {
        const value: unknown = cell.value;
        const valid =
          isIndex(cell.row, MAX_ROWS) &&
          isIndex(cell.col, MAX_COLUMNS) &&
          (typeof value === "number"
            ? Number.isFinite(value)
            : typeof value === "string" ||
              typeof value === "boolean" ||
              (isPlainRecord(value) && ERROR_VALUE.test(String(ownValue(value, "error")))));
        if (!valid) return false;
        rows = Math.max(rows, cell.row + 1);
        columns = Math.max(columns, cell.col + 1);
      }
      total += sheet.cells.length;
      if (total > MAX_EXTERNAL_CELLS || rows * columns > MAX_EXTERNAL_SHEET_AREA) return false;

      const handle = engine.addExternalSheet(link.book, sheet.name, columns, rows);
      for (const { row, col, value } of sheet.cells) {
        if (typeof value === "number") engine.setNumber(handle, row, col, value, 0);
        else if (typeof value === "string") engine.setString(handle, row, col, value, 0);
        else if (typeof value === "boolean") engine.setBool(handle, row, col, value, 0);
        // An error has no setter. A one-value array constant holds it,
        // because the formula parser accepts error values only there.
        else engine.setFormula(handle, row, col, `={${value.error}}`, 0);
      }
      engine.recompute(handle);
    }
  }
  return true;
}
