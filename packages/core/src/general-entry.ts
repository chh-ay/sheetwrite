// Excel's General format reads typed text as a number, date or time and gives
// the cell the number format that shows it as typed: `12%` is 0.12 shown as
// `0%`, `1/15/2026` the date serial shown as `m/d/yyyy`. A `general` column
// (every column Sheetwrite makes itself) reads entries this way; a column a
// host types as `text` keeps the text (#911).
// https://support.microsoft.com/en-us/office/available-number-formats-in-excel-0afe8f52-97db-41f1-b972-4b46e9f1e8d2

import { componentsToSerial, parseDateInput } from "./date-serial.js";

/** A number read from General text, and the format Excel gives the cell, if any. */
export interface GeneralNumber {
  readonly value: number;
  readonly numberFormat?: string;
}

interface Separators {
  readonly group: string;
  readonly decimal: string;
}

const US_SEPARATORS: Separators = { group: ",", decimal: "." };
const separatorCache = new Map<string, Separators>();

/** The grouping and decimal separators of `locale`, as `Intl` formats numbers there. */
function separatorsOf(locale: string | undefined): Separators {
  if (locale === undefined || locale === "en-US") return US_SEPARATORS;
  let found = separatorCache.get(locale);
  if (found === undefined) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12_345.6);
    found = {
      group: parts.find((part) => part.type === "group")?.value ?? ",",
      decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    };
    separatorCache.set(locale, found);
  }
  return found;
}

const CURRENCY_SYMBOLS = "$€£¥";
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Excel's two-digit years: 00 to 29 are 2000s, 30 to 99 are 1900s. */
function fullYear(text: string): number {
  const year = Number(text);
  if (text.length > 2) return year;
  return year < 30 ? 2000 + year : 1900 + year;
}

/** The month its English name or first three letters (or `Sept`) give, 1 to 12, or 0. */
function monthOf(name: string): number {
  const lower = name.toLowerCase();
  const index = MONTHS.findIndex(
    (month) =>
      lower === month || lower === month.slice(0, 3) || (lower === "sept" && month === "september"),
  );
  return index + 1;
}

const PLAIN_NUMBER = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/**
 * A number in General text: signs, parentheses for a negative, grouping in
 * threes, a decimal part, an exponent, a leading currency symbol or a
 * trailing `%`.
 */
function generalNumber(text: string, separators: Separators): GeneralNumber | null {
  let body = text;
  let negative = false;
  if (body.startsWith("(") && body.endsWith(")")) {
    negative = true;
    body = body.slice(1, -1).trim();
  }
  let signed = false;
  const takeSign = (): void => {
    if (signed || negative) return;
    if (body.startsWith("-") || body.startsWith("+")) {
      negative = body.startsWith("-");
      signed = true;
      body = body.slice(1).trimStart();
    }
  };
  takeSign();
  let symbol = "";
  if (body.length > 0 && CURRENCY_SYMBOLS.includes(body[0]!)) {
    symbol = body[0]!;
    body = body.slice(1).trimStart();
    takeSign();
  }
  let percent = false;
  if (symbol === "" && body.endsWith("%")) {
    percent = true;
    body = body.slice(0, -1).trimEnd();
  }

  // Grouping is in threes after the first group, as Excel reads it.
  let grouped = false;
  const decimalAt = body.indexOf(separators.decimal);
  const whole = decimalAt < 0 ? body : body.slice(0, decimalAt);
  if (whole.includes(separators.group)) {
    const groups = whole.split(separators.group);
    if (!/^\d{1,3}$/.test(groups[0]!) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) {
      return null;
    }
    grouped = true;
  }
  const plain =
    (grouped ? whole.split(separators.group).join("") : whole) +
    (decimalAt < 0 ? "" : `.${body.slice(decimalAt + separators.decimal.length)}`);
  const match = PLAIN_NUMBER.exec(plain);
  if (match === null || (match[1] === "" && (match[2] ?? "") === "")) return null;
  const scientific = match[3] !== undefined;
  if (scientific && (grouped || percent || symbol !== "")) return null;
  const decimals = (match[2] ?? "").length > 0;

  let value = Number(plain);
  if (!Number.isFinite(value)) return null;
  if (percent) value = Number((value / 100).toPrecision(15));
  if (negative) value = -value;

  if (scientific) return { value, numberFormat: "0.00E+00" };
  if (percent) return { value, numberFormat: decimals ? "0.00%" : "0%" };
  if (symbol !== "") return { value, numberFormat: `${symbol}#,##0${decimals ? ".00" : ""}` };
  if (grouped) return { value, numberFormat: decimals ? "#,##0.00" : "#,##0" };
  return { value };
}

const TIME = /^(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(?:([AaPp])[Mm]?)?$/;

/** A time of day as a fraction of a day: `9:30`, `9:30:15`, `9:30 PM`, `9 PM`. */
function generalTime(text: string): GeneralNumber | null {
  const match = TIME.exec(text);
  if (match === null) return null;
  const [, hourText, minuteText, secondText, meridiem] = match;
  // A bare number is not a time; `9 PM` is.
  if (minuteText === undefined && meridiem === undefined) return null;
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  if (minute > 59 || second > 59) return null;
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);
  }
  const value = (hour * 3600 + minute * 60 + second) / 86_400;
  const seconds = secondText !== undefined;
  if (meridiem !== undefined) {
    return { value, numberFormat: seconds ? "h:mm:ss AM/PM" : "h:mm AM/PM" };
  }
  // Excel reads 25:30 as a duration past one day.
  if (hour > 23) return { value, numberFormat: "[h]:mm:ss" };
  return { value, numberFormat: seconds ? "h:mm:ss" : "h:mm" };
}

const SLASH_DATE = /^(\d{1,2})\/(\d{1,2}|\d{4})(?:\/(\d{2}|\d{4}))?$/;
const DAY_MONTH_YEAR = /^(\d{1,2})[-\s]([A-Za-z]{3,9})(?:[-\s](\d{2}|\d{4}))?$/;
const MONTH_DAY_YEAR = /^([A-Za-z]{3,9})\s(\d{1,2}),?\s(\d{4})$/;
const MONTH_NUMBER = /^([A-Za-z]{3,9})[-\s](\d{1,2}|\d{4})$/;

/**
 * A date of a month and one number, as Excel reads it: day and month of the
 * current year when that day exists, else the first of the month in that
 * year, else text. `Jan-26` is 26 January, `Feb-30` is February 1930 and
 * `1/99` is January 1999.
 * https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/two-digit-year-numbers
 */
function twoPartDate(month: number, number: string): GeneralNumber | null {
  if (number.length <= 2) {
    const day = componentsToSerial(new Date().getFullYear(), month, Number(number), 0, 0, 0);
    if (day !== null) return { value: day, numberFormat: "d-mmm" };
  }
  const first = componentsToSerial(fullYear(number), month, 1, 0, 0, 0);
  return first === null ? null : { value: first, numberFormat: "mmm-yy" };
}

/** A date with no time: the forms Excel's General reads in the US English locale. */
function generalDate(text: string): GeneralNumber | null {
  const slash = SLASH_DATE.exec(text);
  if (slash) {
    const [, month, day, year] = slash;
    if (year === undefined) return twoPartDate(Number(month), day!);
    if (day!.length > 2) return null;
    const serial = componentsToSerial(fullYear(year), Number(month), Number(day), 0, 0, 0);
    if (serial === null) return null;
    return { value: serial, numberFormat: "m/d/yyyy" };
  }
  const dayMonth = DAY_MONTH_YEAR.exec(text);
  if (dayMonth) {
    const [, day, name, year] = dayMonth;
    const month = monthOf(name!);
    const serial =
      month === 0
        ? null
        : componentsToSerial(
            year === undefined ? new Date().getFullYear() : fullYear(year),
            month,
            Number(day),
            0,
            0,
            0,
          );
    if (serial === null) return null;
    return { value: serial, numberFormat: year === undefined ? "d-mmm" : "d-mmm-yy" };
  }
  const monthDay = MONTH_DAY_YEAR.exec(text);
  if (monthDay) {
    const [, name, day, year] = monthDay;
    const month = monthOf(name!);
    const serial =
      month === 0 ? null : componentsToSerial(Number(year), month, Number(day), 0, 0, 0);
    return serial === null ? null : { value: serial, numberFormat: "d-mmm-yy" };
  }
  const monthNumber = MONTH_NUMBER.exec(text);
  if (monthNumber) {
    const month = monthOf(monthNumber[1]!);
    return month === 0 ? null : twoPartDate(month, monthNumber[2]!);
  }
  const iso = parseDateInput(text);
  if (iso === null) return null;
  return { value: iso, numberFormat: Number.isInteger(iso) ? "m/d/yyyy" : "m/d/yyyy h:mm" };
}

const DATE_THEN_TIME = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm]?)?)$/;
const FRACTION = /^(-?)(\d+)\s+(\d+)\/(\d+)$/;
/**
 * The longest text the fraction, time and date forms read. The longest of
 * them, `September 30, 2026 12:59:59 PM`, has 30 characters; past this
 * limit a pasted or stored string skips them, so their backtracking stays
 * bounded (`DATE_THEN_TIME` is quadratic in the text's length).
 */
const MAX_DATE_TEXT_LENGTH = 40;

/**
 * The number Excel's General format reads from `text` (trimmed, not empty,
 * not a formula), with the number format it gives the cell; `null` when the
 * text stays text. `locale` sets the grouping and decimal separators.
 */
export function parseGeneralNumber(text: string, locale?: string): GeneralNumber | null {
  const number = generalNumber(text, separatorsOf(locale));
  if (number !== null) return number;
  if (text.length > MAX_DATE_TEXT_LENGTH) return null;

  const fraction = FRACTION.exec(text);
  if (fraction) {
    const [, sign, whole, numerator, denominator] = fraction;
    const over = Number(denominator);
    if (over === 0 || over > 99 || Number(numerator) >= over) return null;
    const value = Number(whole) + Number(numerator) / over;
    return { value: sign ? -value : value, numberFormat: over < 10 ? "# ?/?" : "# ??/??" };
  }

  const time = generalTime(text);
  if (time !== null) return time;
  const date = generalDate(text);
  if (date !== null) return date;

  const stamp = DATE_THEN_TIME.exec(text);
  if (stamp) {
    const day = generalDate(stamp[1]!);
    const clock = generalTime(stamp[2]!);
    if (day === null || clock === null || clock.value >= 1) return null;
    const seconds = clock.numberFormat?.includes("ss") === true;
    return {
      value: day.value + clock.value,
      numberFormat: seconds ? "m/d/yyyy h:mm:ss" : "m/d/yyyy h:mm",
    };
  }
  return null;
}

/**
 * Whether a number format shows a date (day or year parts), only a time, or
 * neither (`#`, `0` and `?` show numbers).
 */
export function numberFormatDateKind(format: string | undefined): "date" | "time" | null {
  if (format === undefined) return null;
  const visible = format.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  if (/[#0?]/.test(visible)) return null;
  if (/[dy]/i.test(visible)) return "date";
  return /[hs]/i.test(visible) || /\[[hms]+\]/i.test(format) ? "time" : null;
}

/** Three lowercase letters as one number: `jan` and `Jan` give the same key. */
function letterKey(text: string): number {
  return (
    ((text.charCodeAt(0) | 0x20) << 16) |
    ((text.charCodeAt(1) | 0x20) << 8) |
    (text.charCodeAt(2) | 0x20)
  );
}

const MONTH_KEYS = new Set(MONTHS.map(letterKey));

/**
 * Whether General could read `text` (trimmed, not empty) as a number, date or
 * time: it starts with a digit, a sign, `(`, a decimal point or a currency
 * symbol, or with the first three letters of an English month. Most text
 * fails on its first character, so it skips the parser without allocating.
 */
export function mayBeGeneralNumber(text: string): boolean {
  const first = text.charCodeAt(0);
  if (first >= 0x30 && first <= 0x39) return true;
  // + - ( . ,
  if (first === 0x2b || first === 0x2d || first === 0x28 || first === 0x2e || first === 0x2c) {
    return true;
  }
  // $ £ ¥ €
  if (first === 0x24 || first === 0xa3 || first === 0xa5 || first === 0x20ac) return true;
  const lower = first | 0x20;
  if (lower < 0x61 || lower > 0x7a || text.length < 3) return false;
  return MONTH_KEYS.has(letterKey(text));
}
