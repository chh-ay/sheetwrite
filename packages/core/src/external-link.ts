import { isPlainRecord, ownValue } from "./plain-data.js";
import type {
  ExternalLink,
  ExternalLinkCell,
  ExternalLinkSheet,
  ExternalLinkValue,
} from "./types/external-link.js";

/** Most linked workbooks in one workbook; Excel files rarely hold more than a few. */
const MAX_EXTERNAL_LINKS = 1_024;
/** Most defined names of one linked workbook. */
const MAX_EXTERNAL_NAMES = 10_000;
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

/** A sheet before `!` in a link name's reference: quoted, or plain. */
const SHEET_QUALIFIER = /(?:'((?:[^']|'')*)'|([\p{L}\p{N}_.\\]+))(?=!)/gu;
/** The scope argument of the engine for a name of the whole workbook. */
const WORKBOOK_SCOPE = -1;

/** `'[book]sheet'`: a sheet of a linked workbook, quoted as a formula writes it. */
function link_sheet(book: string, sheet: string): string {
  return `'${`[${book}]${sheet}`.replaceAll("'", "''")}'`;
}

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface ExternalLinkIssueSink {
  push(...issues: { path: string; code: "invalid-value"; message: string }[]): number;
}

function is_name(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function is_index(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < limit;
}

/**
 * Check the bounded shape of `value` at the trust boundary: at most
 * `MAX_EXTERNAL_LINKS` links with unique book names without brackets, a
 * target, named sheets with cell arrays, and optional names with a reference.
 * The cells themselves are checked once, when `installExternalLinks` gives
 * them to the engine.
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
      const unique = is_name(book) && !/[[\]]/.test(book) && !books.has(book.toLowerCase());
      if (unique) books.add(book.toLowerCase());
      return (
        unique &&
        isPlainRecord(link) &&
        is_name(ownValue(link, "target")) &&
        Array.isArray(sheets) &&
        sheets.every(
          (sheet: unknown) =>
            isPlainRecord(sheet) &&
            is_name(ownValue(sheet, "name")) &&
            Array.isArray(ownValue(sheet, "cells")),
        ) &&
        valid_names(ownValue(link, "names"))
      );
    });
  if (!valid) issues.push({ path, code: "invalid-value", message: "invalid external links" });
}

/** An absent list, or at most `MAX_EXTERNAL_NAMES` names that each have a name, a reference and an optional sheet. */
function valid_names(names: unknown): boolean {
  return (
    names === undefined ||
    (Array.isArray(names) &&
      names.length <= MAX_EXTERNAL_NAMES &&
      names.every((entry: unknown) => {
        const sheet = isPlainRecord(entry) ? ownValue(entry, "sheet") : undefined;
        return (
          isPlainRecord(entry) &&
          is_name(ownValue(entry, "name")) &&
          is_name(ownValue(entry, "refersTo")) &&
          (sheet === undefined || is_name(sheet))
        );
      }))
  );
}

/** The engine calls that hold link values; `CellStore` implements them. */
export interface ExternalLinkEngine {
  addExternalSheet(book: string, sheet: string, columns: number, rows: number): number;
  setNumber(sheet: number, row: number, col: number, value: number, style: number): void;
  setString(sheet: number, row: number, col: number, value: string, style: number): void;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  setFormula(sheet: number, row: number, col: number, source: string, style: number): void;
  clearCell(sheet: number, row: number, col: number, style: number): void;
  recompute(sheet: number): void;
  removeExternalSheet(book: string, sheet: string): boolean;
  setNamedFormula(name: string, scope: number, source: string): boolean;
}

/**
 * Remove the values of every link from the engine, and with its sheets the
 * names that refer to them; formulas that read them show `#REF!`.
 */
export function removeExternalLinks(
  engine: ExternalLinkEngine,
  links: readonly ExternalLink[],
): void {
  for (const link of links) {
    for (const sheet of link.sheets) engine.removeExternalSheet(link.book, sheet.name);
  }
}

/** Rows and columns from A1 to the last saved cell of a linked sheet. */
interface SheetExtent {
  rows: number;
  columns: number;
}

/** The extent of `sheet`'s saved cells, or `null` at the first cell outside the sheet limits or with a value formulas cannot hold. */
function sheet_extent(sheet: ExternalLinkSheet): SheetExtent | null {
  let rows = 1;
  let columns = 1;
  for (const cell of sheet.cells) {
    const value: unknown = cell.value;
    const valid =
      is_index(cell.row, MAX_ROWS) &&
      is_index(cell.col, MAX_COLUMNS) &&
      (typeof value === "number"
        ? Number.isFinite(value)
        : typeof value === "string" ||
          typeof value === "boolean" ||
          (isPlainRecord(value) && ERROR_VALUE.test(String(ownValue(value, "error")))));
    if (!valid) return null;
    rows = Math.max(rows, cell.row + 1);
    columns = Math.max(columns, cell.col + 1);
  }
  return { rows, columns };
}

function write_cell(engine: ExternalLinkEngine, handle: number, cell: ExternalLinkCell): void {
  const { row, col, value } = cell;
  if (typeof value === "number") engine.setNumber(handle, row, col, value, 0);
  else if (typeof value === "string") engine.setString(handle, row, col, value, 0);
  else if (typeof value === "boolean") engine.setBool(handle, row, col, value, 0);
  // An error has no setter. A one-value array constant holds it, because
  // the formula parser accepts error values only there.
  else engine.setFormula(handle, row, col, `={${value.error}}`, 0);
}

function same_value(left: ExternalLinkValue, right: ExternalLinkValue): boolean {
  if (typeof left === "object" || typeof right === "object") {
    return typeof left === "object" && typeof right === "object" && left.error === right.error;
  }
  return Object.is(left, right);
}

/**
 * Rewrite the cells of a linked sheet the engine already holds from
 * `previous` to `next`: only cells whose value changes are written, and
 * cells that `next` leaves out are cleared, so only the formulas that read
 * them recalculate.
 */
function rewrite_cells(
  engine: ExternalLinkEngine,
  handle: number,
  previous: readonly ExternalLinkCell[],
  next: readonly ExternalLinkCell[],
): void {
  const position = (cell: ExternalLinkCell) => cell.row * MAX_COLUMNS + cell.col;
  const old = new Map<number, ExternalLinkValue>();
  for (const cell of previous) old.set(position(cell), cell.value);
  for (const cell of next) {
    const key = position(cell);
    const value = old.get(key);
    old.delete(key);
    if (value === undefined || !same_value(value, cell.value)) write_cell(engine, handle, cell);
  }
  for (const key of old.keys()) {
    engine.clearCell(handle, Math.floor(key / MAX_COLUMNS), key % MAX_COLUMNS, 0);
  }
}

/**
 * Give the engine the names of `link`. A name is a defined name of this
 * workbook named as formulas write it, `'[Budget.xlsx]'!Total` or
 * `'[Budget.xlsx]Annual'!Total`, whose sheet references name the link's
 * sheets. A reference to a sheet the link does not hold reads `#REF!`, as
 * in Excel.
 */
function install_names(engine: ExternalLinkEngine, link: ExternalLink): void {
  for (const { name, refersTo: refers_to, sheet } of link.names ?? []) {
    const qualified = `${link_sheet(link.book, sheet ?? "")}!${name}`;
    const source = refers_to.replace(SHEET_QUALIFIER, (_, quoted?: string, plain?: string) =>
      link_sheet(link.book, quoted?.replaceAll("''", "'") ?? plain ?? ""),
    );
    engine.setNamedFormula(
      qualified,
      WORKBOOK_SCOPE,
      source.startsWith("=") ? source : `=${source}`,
    );
  }
}

/**
 * Write `links` to the engine, and return false at the first cell outside
 * the sheet limits, a value that formulas cannot hold, or a linked sheet
 * past the cell or area limits. A link with an entry in `kept` keeps the
 * sheets the engine holds for that previous link, which have the same
 * extents: only its changed cells are written. Every other link is added.
 */
function write_links(
  engine: ExternalLinkEngine,
  links: readonly ExternalLink[],
  kept: ReadonlyMap<ExternalLink, ExternalLink>,
): boolean {
  let total = 0;
  for (const link of links) {
    const previous = kept.get(link);
    for (const [index, sheet] of link.sheets.entries()) {
      const extent = sheet_extent(sheet);
      total += sheet.cells.length;
      if (
        extent === null ||
        total > MAX_EXTERNAL_CELLS ||
        extent.rows * extent.columns > MAX_EXTERNAL_SHEET_AREA
      ) {
        return false;
      }

      const handle = engine.addExternalSheet(link.book, sheet.name, extent.columns, extent.rows);
      const previous_cells = previous?.sheets[index]?.cells;
      if (previous_cells) {
        rewrite_cells(engine, handle, previous_cells, sheet.cells);
      } else {
        for (const cell of sheet.cells) write_cell(engine, handle, cell);
        engine.recompute(handle);
      }
    }

    if (!previous) install_names(engine, link);
  }
  return true;
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
  return write_links(engine, links, new Map());
}

/** Whether `next` names the same sheets, with the same extents, and the same names as `previous`. */
function keeps_sheets(previous: ExternalLink, next: ExternalLink): boolean {
  return (
    previous.book === next.book &&
    previous.sheets.length === next.sheets.length &&
    previous.sheets.every((sheet, index) => {
      const other = next.sheets[index];
      if (other === undefined || other.name !== sheet.name) return false;
      const before = sheet_extent(sheet);
      const after = sheet_extent(other);
      return (
        before !== null &&
        after !== null &&
        before.rows === after.rows &&
        before.columns === after.columns
      );
    }) &&
    JSON.stringify(previous.names ?? []) === JSON.stringify(next.names ?? [])
  );
}

/**
 * Replace the links `previous` in the engine with `next`, and return false
 * as `installExternalLinks` does. A link that keeps its sheets, their
 * extents and its names keeps its engine sheets, and only its changed cells
 * are written, so only the formulas that read them recalculate. Every other
 * link is removed and installed again, which relinks and recalculates every
 * formula that names it.
 */
export function replaceExternalLinks(
  engine: ExternalLinkEngine,
  previous: readonly ExternalLink[],
  next: readonly ExternalLink[],
): boolean {
  const by_book = new Map(previous.map((link) => [link.book, link]));
  const kept = new Map<ExternalLink, ExternalLink>();
  for (const link of next) {
    const old = by_book.get(link.book);
    if (old !== undefined && keeps_sheets(old, link)) kept.set(link, old);
  }

  const kept_previous = new Set(kept.values());
  removeExternalLinks(
    engine,
    previous.filter((link) => !kept_previous.has(link)),
  );
  return write_links(engine, next, kept);
}
