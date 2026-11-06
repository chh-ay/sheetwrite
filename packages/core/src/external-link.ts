import { isPlainRecord, ownValue } from "./plain-data.js";
import type { ExternalLink, ExternalLinkValue } from "./types/external-link.js";

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
const ERROR_VALUES: Readonly<Record<string, true>> = {
  "#DIV/0!": true,
  "#NULL!": true,
  "#SPILL!": true,
  "#CALC!": true,
  "#VALUE!": true,
  "#REF!": true,
  "#NAME?": true,
  "#NUM!": true,
  "#N/A": true,
};

/** A path-qualified problem; structurally a `DocumentValidationError`. */
export interface ExternalLinkIssue {
  path: string;
  code: "invalid-value" | "resource-limit";
  message: string;
}

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface ExternalLinkIssueSink {
  push(...issues: ExternalLinkIssue[]): number;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isIndex(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < limit;
}

function isLinkValue(value: unknown): value is ExternalLinkValue {
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return isPlainRecord(value) && Object.hasOwn(ERROR_VALUES, String(ownValue(value, "error")));
}

/** Check that `value` is a list of external links within the resource limits. */
export function validateExternalLinksShape(
  value: unknown,
  path: string,
  issues: ExternalLinkIssueSink,
): void {
  const invalid = (at: string, message: string) => {
    issues.push({ path: at, code: "invalid-value", message });
  };
  if (!Array.isArray(value)) {
    invalid(path, "externalLinks must be an array");
    return;
  }
  if (value.length > MAX_EXTERNAL_LINKS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `External link limit ${MAX_EXTERNAL_LINKS} exceeded`,
    });
    return;
  }

  let cells = 0;
  const books = new Set<string>();
  value.forEach((link: unknown, index) => {
    const at = `${path}[${index}]`;
    const book = isPlainRecord(link) ? ownValue(link, "book") : undefined;
    const sheets = isPlainRecord(link) ? ownValue(link, "sheets") : undefined;
    if (!isPlainRecord(link) || !isName(book) || /[[\]]/.test(book)) {
      invalid(at, "an external link needs a book name without brackets");
      return;
    }
    if (books.has(book.toLowerCase())) invalid(`${at}.book`, "book names must be unique");
    books.add(book.toLowerCase());
    if (!isName(ownValue(link, "target"))) invalid(`${at}.target`, "target must be a name");
    if (!Array.isArray(sheets)) {
      invalid(`${at}.sheets`, "sheets must be an array");
      return;
    }

    sheets.forEach((sheet: unknown, sheetIndex) => {
      const sheetAt = `${at}.sheets[${sheetIndex}]`;
      const sheetCells = isPlainRecord(sheet) ? ownValue(sheet, "cells") : undefined;
      if (!isPlainRecord(sheet) || !isName(ownValue(sheet, "name")) || !Array.isArray(sheetCells)) {
        invalid(sheetAt, "a sheet needs a name and a cells array");
        return;
      }
      cells += sheetCells.length;
      let rows = 1;
      let columns = 1;
      sheetCells.forEach((cell: unknown, cellIndex) => {
        const row = isPlainRecord(cell) ? ownValue(cell, "row") : undefined;
        const col = isPlainRecord(cell) ? ownValue(cell, "col") : undefined;
        const valid =
          isPlainRecord(cell) &&
          isIndex(row, MAX_ROWS) &&
          isIndex(col, MAX_COLUMNS) &&
          isLinkValue(ownValue(cell, "value"));
        if (!valid) {
          invalid(`${sheetAt}.cells[${cellIndex}]`, "invalid external link cell");
          return;
        }
        rows = Math.max(rows, row + 1);
        columns = Math.max(columns, col + 1);
      });
      if (rows * columns > MAX_EXTERNAL_SHEET_AREA) {
        issues.push({
          path: sheetAt,
          code: "resource-limit",
          message: `External link sheet area limit ${MAX_EXTERNAL_SHEET_AREA} exceeded`,
        });
      }
    });
  });

  if (cells > MAX_EXTERNAL_CELLS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `External link cell limit ${MAX_EXTERNAL_CELLS} exceeded`,
    });
  }
}

/** The engine calls that hold link values; `CellStore` implements them. */
export interface ExternalLinkEngine {
  addExternalSheet(book: string, sheet: string, columns: number, rows: number): number;
  setNumber(sheet: number, row: number, col: number, value: number, style: number): void;
  setString(sheet: number, row: number, col: number, value: string, style: number): void;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  setFormula(sheet: number, row: number, col: number, source: string, style: number): void;
  recompute(sheet: number): void;
}

/**
 * Give the engine the saved values of every link. Call it before formulas
 * load, because a formula finds its link when it is entered.
 */
export function installExternalLinks(
  engine: ExternalLinkEngine,
  links: readonly ExternalLink[],
): void {
  for (const link of links) {
    for (const sheet of link.sheets) {
      let rows = 1;
      let columns = 1;
      for (const cell of sheet.cells) {
        rows = Math.max(rows, cell.row + 1);
        columns = Math.max(columns, cell.col + 1);
      }

      const handle = engine.addExternalSheet(link.book, sheet.name, columns, rows);
      let errors = false;
      for (const { row, col, value } of sheet.cells) {
        if (typeof value === "number") engine.setNumber(handle, row, col, value, 0);
        else if (typeof value === "string") engine.setString(handle, row, col, value, 0);
        else if (typeof value === "boolean") engine.setBool(handle, row, col, value, 0);
        else {
          // An error has no setter. A one-value array constant holds it,
          // because the formula parser accepts error values only there.
          engine.setFormula(handle, row, col, `={${value.error}}`, 0);
          errors = true;
        }
      }
      if (errors) engine.recompute(handle);
    }
  }
}
