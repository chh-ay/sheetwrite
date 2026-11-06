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
const ERROR_VALUE = /^#(?:DIV\/0!|NULL!|SPILL!|CALC!|VALUE!|REF!|NAME\?|NUM!|N\/A)$/;

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface ExternalLinkIssueSink {
  push(
    ...issues: { path: string; code: "invalid-value" | "resource-limit"; message: string }[]
  ): number;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isIndex(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < limit;
}

function isLinkValue(value: unknown): value is ExternalLinkValue {
  if (typeof value === "number") return Number.isFinite(value);
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (isPlainRecord(value) && ERROR_VALUE.test(String(ownValue(value, "error"))))
  );
}

/** Whether one linked sheet has a name and valid cells within the area limit. */
function isLinkSheet(sheet: unknown, budget: { cells: number }): boolean {
  const cells = isPlainRecord(sheet) ? ownValue(sheet, "cells") : undefined;
  if (!isPlainRecord(sheet) || !isName(ownValue(sheet, "name")) || !Array.isArray(cells)) {
    return false;
  }

  budget.cells += cells.length;
  let rows = 1;
  let columns = 1;
  for (const cell of cells) {
    const row = isPlainRecord(cell) ? ownValue(cell, "row") : undefined;
    const col = isPlainRecord(cell) ? ownValue(cell, "col") : undefined;
    if (
      !isPlainRecord(cell) ||
      !isIndex(row, MAX_ROWS) ||
      !isIndex(col, MAX_COLUMNS) ||
      !isLinkValue(ownValue(cell, "value"))
    ) {
      return false;
    }
    rows = Math.max(rows, row + 1);
    columns = Math.max(columns, col + 1);
  }
  return rows * columns <= MAX_EXTERNAL_SHEET_AREA;
}

/**
 * Check that `value` is a list of external links within the resource limits:
 * unique book names without brackets, named sheets, and saved values that
 * formulas can hold. One issue names the first link that fails.
 */
export function validateExternalLinksShape(
  value: unknown,
  path: string,
  issues: ExternalLinkIssueSink,
): void {
  if (!Array.isArray(value) || value.length > MAX_EXTERNAL_LINKS) {
    issues.push({
      path,
      code: "invalid-value",
      message: `externalLinks must be an array of at most ${MAX_EXTERNAL_LINKS} links`,
    });
    return;
  }

  const books = new Set<string>();
  const budget = { cells: 0 };
  for (const [index, link] of value.entries()) {
    const book = isPlainRecord(link) ? ownValue(link, "book") : undefined;
    const sheets = isPlainRecord(link) ? ownValue(link, "sheets") : undefined;
    const valid =
      isPlainRecord(link) &&
      isName(book) &&
      !/[[\]]/.test(book) &&
      !books.has(book.toLowerCase()) &&
      isName(ownValue(link, "target")) &&
      Array.isArray(sheets) &&
      sheets.every((sheet) => isLinkSheet(sheet, budget)) &&
      budget.cells <= MAX_EXTERNAL_CELLS;
    if (!valid) {
      issues.push({
        path: `${path}[${index}]`,
        code: "invalid-value",
        message: `An external link needs a unique book name without brackets, a target, and sheets of valid cells within ${MAX_EXTERNAL_CELLS} cells and an area of ${MAX_EXTERNAL_SHEET_AREA}`,
      });
      return;
    }
    books.add(book.toLowerCase());
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
