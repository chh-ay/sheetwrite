import { parseDateInput } from "./date-serial.js";
import { numberFormatDateKind, parseGeneralNumber } from "./general-entry.js";
import { formatNumber } from "./number-format.js";
import type { CellFormat, CellScalar, CellValue } from "./types/cell.js";

/**
 * Spreadsheet display text for a resolved scalar.
 *
 * @returns `""` for an empty cell, `TRUE` or `FALSE` for a boolean, and the
 *   unformatted text of anything else.
 */
export function cellScalarToText(value: CellScalar): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/**
 * The text a cell paints: numbers through the cell's effective number format
 * (cell style, then column), everything else as {@link cellScalarToText}.
 * Measuring code uses this so widths match what the canvas draws.
 */
export function cellDisplayText(value: CellScalar, numberFormat?: string, locale?: string): string {
  return typeof value === "number"
    ? formatNumber(value, numberFormat, locale)
    : cellScalarToText(value);
}

/** Date codes tried for a date cell's edit text, finest last. */
const DATE_EDIT_CODES = ["yyyy-mm-dd", "yyyy-mm-dd hh:mm", "yyyy-mm-dd hh:mm:ss"] as const;

/**
 * The text the cell editor opens with for a resolved scalar. In a `date` column a
 * number opens as the first `yyyy-mm-dd`, `yyyy-mm-dd hh:mm` or
 * `yyyy-mm-dd hh:mm:ss` text that {@link parseDateInput} reads back as exactly
 * that serial, so committing the editor unchanged keeps the value. Any other value,
 * or a serial no such text reproduces, opens as {@link cellScalarToText}.
 *
 * In a `general` column, a number in a date, time or percent format opens as
 * Excel opens it (`1/15/2026`, `9:30:00`, `12%`), and text that would read
 * back as a number opens with Excel's leading apostrophe (`'007`).
 */
export function cellEditText(value: CellScalar, type: CellFormat, numberFormat?: string): string {
  if (type === "general") return generalEditText(value, numberFormat);
  if (type !== "date" || typeof value !== "number") return cellScalarToText(value);

  for (const code of DATE_EDIT_CODES) {
    const text = formatNumber(value, code);
    if (parseDateInput(text) === value) return text;
  }

  return cellScalarToText(value);
}

/** {@link cellEditText} in a `general` column: text that reads back as the same value. */
function generalEditText(value: CellScalar, numberFormat: string | undefined): string {
  if (typeof value === "string") {
    const reread = parseCellEntry(value, "general").value;
    return reread.kind === "literal" && reread.value === value ? value : `'${value}`;
  }
  if (typeof value !== "number") return cellScalarToText(value);
  const kind = numberFormatDateKind(numberFormat);
  const text =
    kind === "date" || (kind === "time" && value >= 1)
      ? formatNumber(value, Number.isInteger(value) ? "m/d/yyyy" : "m/d/yyyy h:mm:ss")
      : kind === "time"
        ? formatNumber(value, "h:mm:ss")
        : numberFormat?.endsWith("%")
          ? `${Number((value * 100).toPrecision(15))}%`
          : null;
  if (text === null) return cellScalarToText(value);
  const reread = parseCellEntry(text, "general").value;
  return reread.kind === "literal" && reread.value === value ? text : cellScalarToText(value);
}

/**
 * Coerce raw text input into a {@link CellValue}, following spreadsheet
 * input-bar conventions:
 *
 * - blank (after trimming) clears the cell to a `null` literal;
 * - in a cell formatted as Text (`@`), anything else stays text exactly as
 *   typed, as in Excel: numbers, dates, `TRUE` and formulas alike;
 * - in a `general` column, the entry reads as Excel's General format reads it:
 *   numbers, percentages, amounts, dates and times, and `'` keeps text;
 * - text longer than one character beginning with `=` becomes a formula;
 * - in a `number`, `currency` or `date` column a finite numeric string becomes a
 *   number literal (in a `date` column, that number is the date serial);
 * - in a `date` column a recognized date string ({@link parseDateInput}) becomes
 *   its serial-number literal;
 * - in a `currency` column a currency string ({@link parseCurrencyInput}) becomes
 *   a plain number literal;
 * - anything else is stored verbatim as a text literal (the untrimmed `raw`).
 *
 * Shared by the grid's inline editor and any host-built formula bar, so input
 * parsing is identical everywhere instead of re-derived per consumer.
 *
 * @param raw - The text the user typed.
 * @param type - The column's format, which decides how dates and currency are read.
 * @param numberFormat - The cell's effective number format (cell style, then
 *   column); the Text format `@` keeps the input as text.
 * @param locale - The column's number locale, whose separators a `general`
 *   column reads.
 */
export function parseCellInput(
  raw: string,
  type: CellFormat,
  numberFormat?: string,
  locale?: string,
): CellValue {
  if (type === "general") return parseCellEntry(raw, type, numberFormat, locale).value;
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { kind: "literal", value: null };
  }

  if (numberFormat === "@") {
    return { kind: "literal", value: raw };
  }

  if (trimmed.length > 1 && trimmed.startsWith("=")) {
    return { kind: "formula", src: trimmed };
  }

  if (/^(TRUE|FALSE)$/i.test(trimmed)) {
    return { kind: "literal", value: trimmed.toUpperCase() === "TRUE" };
  }

  if (type === "number" || type === "currency" || type === "date") {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return { kind: "literal", value: parsed };
    }
  }

  if (type === "date") {
    const serial = parseDateInput(trimmed);
    if (serial !== null) {
      return { kind: "literal", value: serial };
    }
  }

  if (type === "currency") {
    const amount = parseCurrencyInput(trimmed);
    if (amount !== null) {
      return { kind: "literal", value: amount };
    }
  }

  return { kind: "literal", value: raw };
}

/** A typed entry: what the cell stores, and the number format Excel's General gives it. */
export interface ParsedEntry {
  readonly value: CellValue;
  /** The format that shows the entry as typed (`0%` for `12%`); absent when none. */
  readonly numberFormat?: string;
}

/**
 * Read a typed entry as {@link parseCellInput} does, and in a `general`
 * column also the number format Excel's General format gives the cell, as in
 * Excel: `12%` is 0.12 in `0%`, `$4.50` is 4.5 in `$#,##0.00`, `1/15/2026`
 * is its date serial in `m/d/yyyy`, `9:30 PM` a time in `h:mm AM/PM`, `1,234`
 * is 1234 in `#,##0`, `1e5` is 100000 in `0.00E+00` and `1 1/2` is 1.5 in
 * `# ?/?`. `007` is 7. A leading apostrophe keeps the rest as text. `locale`
 * gives the grouping and decimal separators; dates read in US order.
 */
export function parseCellEntry(
  raw: string,
  type: CellFormat,
  numberFormat?: string,
  locale?: string,
): ParsedEntry {
  if (type !== "general") return { value: parseCellInput(raw, type, numberFormat) };
  const trimmed = raw.trim();
  if (trimmed === "") return { value: { kind: "literal", value: null } };
  if (numberFormat === "@") return { value: { kind: "literal", value: raw } };
  if (trimmed.startsWith("'")) return { value: { kind: "literal", value: trimmed.slice(1) } };
  if (trimmed.length > 1 && trimmed.startsWith("=")) {
    return { value: { kind: "formula", src: trimmed } };
  }
  if (BOOLEAN_TEXT.test(trimmed)) {
    return { value: { kind: "literal", value: trimmed.toUpperCase() === "TRUE" } };
  }
  // Most entries are plain decimals, which need no other reading where `.` is the decimal point.
  if (locale === undefined || locale === "en-US") {
    const plain = parsePlainDecimal(trimmed, 0, trimmed.length);
    if (plain !== undefined) return { value: { kind: "literal", value: plain } };
  }
  const number = parseGeneralNumber(trimmed, locale);
  if (number === null) return { value: { kind: "literal", value: raw } };
  const value: CellValue = { kind: "literal", value: number.value };
  return number.numberFormat === undefined
    ? { value }
    : { value, numberFormat: number.numberFormat };
}

/** Spreadsheet booleans; ASCII-only, matching the interactive input rule. */
const BOOLEAN_TEXT = /^(TRUE|FALSE)$/i;
const EQUALS_CODE_UNIT = 0x3d;

/**
 * Parse imported text as a literal using the same boolean, number, date, and
 * currency rules as {@link parseCellInput}. Unlike interactive entry, a leading
 * `=` remains inert text. Declared date columns also accept an existing finite
 * date serial so delimited export/import preserves numeric dates.
 *
 * @param raw - One field of imported text.
 * @param type - The column's format, which decides how dates and currency are read.
 */
export function parseCellLiteralInput(raw: string, type: CellFormat): CellScalar {
  // Imports call this once per field, so the rules are applied directly here
  // instead of building a `CellValue` through `parseCellInput` and trimming twice.
  const trimmed = raw.trim();

  if (trimmed === "") return null;
  // Interactive entry turns this into a formula; imports keep the raw text.
  if (trimmed.length > 1 && trimmed.charCodeAt(0) === EQUALS_CODE_UNIT) return raw;

  if ((trimmed.length === 4 || trimmed.length === 5) && BOOLEAN_TEXT.test(trimmed)) {
    return trimmed.toUpperCase() === "TRUE";
  }
  if (type === "number" || type === "currency" || type === "date") {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (type === "date") {
    const serial = parseDateInput(trimmed);
    if (serial !== null) return serial;
  }
  if (type === "currency") {
    const amount = parseCurrencyInput(trimmed);
    if (amount !== null) return amount;
  }
  return raw;
}

const ZERO_CODE_UNIT = 0x30;
const NINE_CODE_UNIT = 0x39;
const PLUS_CODE_UNIT = 0x2b;
const MINUS_CODE_UNIT = 0x2d;
const DOT_CODE_UNIT = 0x2e;
/** Significant digits whose integer value is exact in a double (below 2^53). */
const MAX_EXACT_DIGITS = 15;
/** Powers of ten that are exact in a double, as literals so no rounding enters. */
const EXACT_POWERS_OF_TEN: readonly number[] = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17,
  1e18, 1e19, 1e20, 1e21, 1e22,
];

/**
 * The number {@link parseCellLiteralInput} reads from `text.slice(start, end)`
 * in a `number`, `currency` or `date` column, without building that string,
 * when the span is a plain decimal: an optional sign, digits with at most one
 * point, nothing else, at most 15 significant digits and 22 decimals.
 * `undefined` for any other span, which then takes the string path.
 *
 * The result equals `Number()`: the digits form an exact integer below 2^53
 * and the power of ten is exact, so one IEEE division rounds correctly.
 */
export function parsePlainDecimal(text: string, start: number, end: number): number | undefined {
  let index = start;
  const sign = text.charCodeAt(index);
  const negative = sign === MINUS_CODE_UNIT;
  if (negative || sign === PLUS_CODE_UNIT) index += 1;
  let mantissa = 0;
  let significantDigits = 0;
  let decimals = 0;
  let hasDigit = false;
  let hasPoint = false;
  for (; index < end; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= ZERO_CODE_UNIT && code <= NINE_CODE_UNIT) {
      hasDigit = true;
      if (hasPoint) decimals += 1;
      // Leading zeros are not significant.
      if (mantissa === 0 && code === ZERO_CODE_UNIT) continue;
      significantDigits += 1;
      if (significantDigits > MAX_EXACT_DIGITS) return undefined;
      mantissa = mantissa * 10 + (code - ZERO_CODE_UNIT);
    } else if (code === DOT_CODE_UNIT && !hasPoint) {
      hasPoint = true;
    } else {
      return undefined;
    }
  }
  const scale = EXACT_POWERS_OF_TEN[decimals];
  if (!hasDigit || scale === undefined) return undefined;
  const magnitude = mantissa / scale;
  return negative ? -magnitude : magnitude;
}

/**
 * Parse a currency-formatted string into a plain number, or `null` when the
 * remaining text is not numeric. Strips currency symbols (`$ € £ ¥ ¤`), thousands
 * grouping (`,`), and whitespace, and reads accounting-style parentheses
 * (`(1,234.50)`) as a negative amount. Grouping/decimals follow the US locale the
 * renderer uses.
 *
 * @param raw - Text such as `$1,234.50` or `(1,234.50)`.
 * @returns The amount, such as `1234.5` or `-1234.5`, or `null`.
 */
export function parseCurrencyInput(raw: string): number | null {
  let body = raw.replace(/[$€£¥¤,\s]/g, "");
  if (body === "") return null;

  let sign = 1;
  if (body.startsWith("(") && body.endsWith(")")) {
    sign = -1;
    body = body.slice(1, -1);
  }
  if (body === "") return null;

  const parsed = Number(body);
  return Number.isFinite(parsed) ? sign * parsed : null;
}
