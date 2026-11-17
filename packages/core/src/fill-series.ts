// Autofill series detection for drag-to-fill, following Excel's AutoFill
// defaults. Given the source cells along the fill direction, decide whether
// the fill extends a series or copies the source. Pure and DOM-free: the
// caller supplies resolved scalars, formula flags and date formats, and
// resolves copied cells itself (so formula reference-shifting stays in the
// grid layer).
// https://support.microsoft.com/en-us/excel/get-started/fill-data-automatically-in-worksheet-cells

import { dateToSerial, FICTIONAL_LEAP_DAY_SERIAL, serialToDate } from "./date-serial.js";
import type { CellScalar } from "./types/cell.js";

/** One source cell in fill order (top→bottom for a vertical fill, left→right for a horizontal one). */
export interface FillSourceCell {
  /** Resolved scalar value of the source cell. */
  value: CellScalar;
  /** True when the cell holds a formula; formulas copy (with ref-shift), never extend. */
  isFormula: boolean;
  /** True when the cell shows its number as a date, so one cell steps by a day. */
  isDate?: boolean;
  /** True when the cell shows only a time of day, so one cell steps by an hour. */
  isTime?: boolean;
}

/**
 * What to write at a target offset:
 * - `value`: a literal produced by extending a series.
 * - `tile`: copy the source cell at `sourceIndex` (caller resolves value / shifts refs).
 */
type FillStep = { kind: "value"; value: number | string } | { kind: "tile"; sourceIndex: number };

/** A resolved fill plan for one row or column of source cells. */
export interface FillSeries {
  /**
   * Fill for target offset `p`, measured in cells from the source start. `p` is
   * negative before the source (up or left fill), `>= length` after it, and
   * within `[0, length)` inside the source itself (callers normally skip those).
   */
  stepAt(p: number): FillStep;
}

/** The date step of Auto Fill Options › Fill Days, Fill Weekdays, Fill Months and Fill Years. */
export type FillDateUnit = "day" | "weekday" | "month" | "year";

/** How a fill treats its source. */
export interface FillOptions {
  /**
   * Ctrl (Option on a Mac) held while dragging, which swaps Excel's default:
   * one number then counts up by 1, and a series is copied instead.
   */
  readonly swap?: boolean;
  /** Copy the source unchanged, as Fill Down (Ctrl+D) and Fill Right (Ctrl+R) do. */
  readonly copy?: boolean;
  /**
   * Fill a series even where the default copies, as Auto Fill Options ›
   * Fill Series does: one number then counts up by 1.
   */
  readonly series?: boolean;
  /**
   * Step from the first source date by this unit per cell, as Auto Fill
   * Options › Fill Days, Fill Weekdays, Fill Months and Fill Years do.
   */
  readonly unit?: FillDateUnit;
}

/** Relative+absolute slack so float deltas (0.1, 0.2, 0.3, …) read as constant. */
const DELTA_EPSILON = 1e-9;

/** One hour as a fraction of a date serial's day. */
const HOUR = 1 / 24;

/** Excel's built-in custom lists, which AutoFill continues. */
const NAME_LISTS: readonly (readonly string[])[] = [
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
];

/** Text that ends in a whole number, such as `Item 1` or `Q01`. */
const TRAILING_NUMBER = /^(.*?)(\d+)$/s;
/** A quarter that wraps after 4: `Q3`, `Q 3`, `Qtr3`, `Qtr 3`, `Quarter 3`. */
const QUARTER = /^(q|qtr|quarter)(\s*)([1-4])$/i;
/** A quarter written as an ordinal: `3rd Qtr`, `3rd Quarter`. */
const ORDINAL_QUARTER = /^([1-4])(st|nd|rd|th)(\s*)(qtr|quarter)$/i;
/** Text that starts with an ordinal number, such as `1st` or `1st Period`. */
const ORDINAL = /^(\d+)(st|nd|rd|th)(?![a-z])(.*)$/is;

function wrap(offset: number, size: number): number {
  return ((offset % size) + size) % size;
}

function isFiniteNumber(v: CellScalar): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function tilingSeries(length: number): FillSeries {
  const n = Math.max(1, length);
  return {
    stepAt: (p) => ({ kind: "tile", sourceIndex: wrap(p, n) }),
  };
}

/** The constant step of `values`, or null when the steps differ. */
function constantStep(values: readonly number[]): number | null {
  const first = values[0];
  const second = values[1];
  if (first === undefined || second === undefined) return null;
  let maxAbs = 0;
  for (const value of values) maxAbs = Math.max(maxAbs, Math.abs(value));
  const tolerance = DELTA_EPSILON * Math.max(1, maxAbs);
  const delta = second - first;
  for (let i = 2; i < values.length; i++) {
    const current = values[i] ?? 0;
    const previous = values[i - 1] ?? 0;
    if (Math.abs(current - previous - delta) > tolerance) return null;
  }
  return delta;
}

/** Least-squares line through (index, value), as Excel's linear trend fill computes. */
function linearTrend(values: readonly number[]): { base: number; slope: number } {
  const n = values.length;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const value of values) meanY += value / n;
  let covariance = 0;
  let variance = 0;
  values.forEach((value, x) => {
    covariance += (x - meanX) * (value - meanY);
    variance += (x - meanX) ** 2;
  });
  const slope = variance === 0 ? 0 : covariance / variance;
  return { base: meanY - slope * meanX, slope };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The serial of `day` (clamped, or the month's last day) in month `index` counted from year 0. */
function monthSerial(index: number, day: number | "last"): number {
  const year = Math.floor(index / 12);
  const month = wrap(index, 12);
  const last = daysInMonth(year, month);
  return dateToSerial(new Date(Date.UTC(year, month, day === "last" ? last : Math.min(day, last))));
}

/** One unit per cell from `base`, keeping its time of day; weekdays skip Saturday and Sunday. */
function dateUnitSeries(base: number, unit: FillDateUnit): FillSeries {
  const whole = Math.floor(base);
  const time = base - whole;
  if (unit === "day") return { stepAt: (p) => ({ kind: "value", value: base + p }) };
  if (unit === "weekday") {
    return {
      stepAt: (p) => {
        // Serial 1 is a Sunday; 0 is Sunday … 6 is Saturday.
        const direction = p < 0 ? -1 : 1;
        let serial = whole + 7 * Math.trunc(p / 5);
        for (let left = Math.abs(p % 5); left > 0;) {
          serial += direction;
          const weekday = wrap(serial - 1, 7);
          if (weekday !== 0 && weekday !== 6) left--;
        }
        return { kind: "value", value: serial + time };
      },
    };
  }
  const date = serialToDate(whole);
  const first = date.getUTCFullYear() * 12 + date.getUTCMonth();
  const day = date.getUTCDate();
  const months = unit === "month" ? 1 : 12;
  return {
    stepAt: (p) => ({ kind: "value", value: monthSerial(first + months * p, day) + time }),
  };
}

/**
 * Dates on the same day of the month (`1-Jan, 1-Apr`), or each on the last
 * day of its month (`31-Jan, 28-Feb`), step by whole months or years as in
 * Excel; other dates step by days.
 */
function monthSeries(values: readonly number[]): FillSeries | null {
  const months: number[] = [];
  let day: number | null = null;
  let sameDay = true;
  let lastDays = true;
  for (const value of values) {
    if (!Number.isInteger(value) || value === FICTIONAL_LEAP_DAY_SERIAL) return null;
    const date = serialToDate(value);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const dayOfMonth = date.getUTCDate();
    months.push(year * 12 + month);
    day ??= dayOfMonth;
    sameDay &&= dayOfMonth === day;
    lastDays &&= dayOfMonth === daysInMonth(year, month);
  }
  const step = constantStep(months);
  if (step === null || step === 0 || day === null || !(sameDay || lastDays)) return null;
  const first = months[0] ?? 0;
  const target = sameDay ? day : "last";
  return {
    stepAt: (p) => ({ kind: "value", value: monthSerial(first + step * p, target) }),
  };
}

function numericSeries(
  cells: readonly FillSourceCell[],
  values: number[],
  swap: boolean,
): FillSeries {
  if (values.length === 1) {
    // One date counts up by a day and one time by an hour; one number is
    // copied. Ctrl swaps counting and copying.
    const time = cells[0]?.isTime === true;
    const counts = (cells[0]?.isDate === true || time) !== swap;
    const unit = time && !swap ? HOUR : 1;
    const base = values[0] ?? 0;
    return counts
      ? { stepAt: (p) => ({ kind: "value", value: base + unit * p }) }
      : tilingSeries(1);
  }
  if (swap) return tilingSeries(values.length);
  if (cells.every((cell) => cell.isDate === true)) {
    const months = monthSeries(values);
    if (months !== null) return months;
  }
  const delta = constantStep(values);
  if (delta !== null) {
    const base = values[0] ?? 0;
    return { stepAt: (p) => ({ kind: "value", value: base + delta * p }) };
  }
  const { base, slope } = linearTrend(values);
  return { stepAt: (p) => ({ kind: "value", value: base + slope * p }) };
}

/** Text with a number AutoFill counts: `Item 1`, `1st Period`, `Qtr3`. */
interface CountedText {
  /** The same for every text of one series: the text around the number. */
  readonly key: string;
  readonly number: number;
  /** The text for another number of the series. */
  readonly write: (number: number) => string;
}

/** `st`, `nd`, `rd` or `th` for a whole number, in upper case when `upper`. */
function ordinalSuffix(number: number, upper: boolean): string {
  const tens = number % 100;
  const units = number % 10;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : units === 1
        ? "st"
        : units === 2
          ? "nd"
          : units === 3
            ? "rd"
            : "th";
  return upper ? suffix.toUpperCase() : suffix;
}

/** Quarters run 1 to 4 and start again, as Excel's `Qtr4, Qtr1` does. */
function quarter(number: number): number {
  return wrap(number - 1, 4) + 1;
}

function countedText(text: string): CountedText | null {
  const quarterMatch = QUARTER.exec(text);
  if (quarterMatch !== null) {
    const [, label = "", space = "", digit = ""] = quarterMatch;
    return {
      key: `q${label}${space}`,
      number: Number(digit),
      write: (number) => `${label}${space}${quarter(number)}`,
    };
  }
  const ordinalQuarter = ORDINAL_QUARTER.exec(text);
  if (ordinalQuarter !== null) {
    const [, digit = "", suffix = "", space = "", label = ""] = ordinalQuarter;
    const upper = suffix === suffix.toUpperCase();
    return {
      key: `r${upper}${space}${label}`,
      number: Number(digit),
      write: (number) => {
        const q = quarter(number);
        return `${q}${ordinalSuffix(q, upper)}${space}${label}`;
      },
    };
  }
  const ordinal = ORDINAL.exec(text);
  const [, digits = "", suffix = "", rest = ""] = ordinal ?? [];
  const upper = suffix === suffix.toUpperCase();
  if (ordinal !== null && suffix === ordinalSuffix(Number(digits), upper)) {
    return {
      key: `o${upper}${rest}`,
      number: Number(digits),
      write: (number) => {
        const whole = Math.abs(number);
        return `${whole}${ordinalSuffix(whole, upper)}${rest}`;
      },
    };
  }
  const trailing = TRAILING_NUMBER.exec(text);
  if (trailing === null) return null;
  const [, prefix = "", trailingDigits = ""] = trailing;
  const width = trailingDigits.startsWith("0") ? trailingDigits.length : 0;
  return {
    key: `t${prefix}`,
    number: Number(trailingDigits),
    write: (number) => `${prefix}${String(Math.abs(number)).padStart(width, "0")}`,
  };
}

/** Write `name` in the letter case of `sample`: `MON`, `mon` or `Mon`. */
function matchCase(name: string, sample: string): string {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) return name.toUpperCase();
  if (sample === sample.toLowerCase()) return name.toLowerCase();
  return name;
}

function listSeries(texts: readonly string[]): FillSeries | null {
  for (const list of NAME_LISTS) {
    const positions = texts.map((text) =>
      list.findIndex((name) => name.toLowerCase() === text.toLowerCase()),
    );
    if (positions.some((position) => position < 0)) continue;
    const first = positions[0] ?? 0;
    const step = positions.length > 1 ? constantStep(positions) : 1;
    if (step === null) return null;
    const sample = texts[0] ?? "";
    const size = list.length;
    return {
      stepAt: (p) => {
        const index = (((first + step * p) % size) + size) % size;
        return { kind: "value", value: matchCase(list[index] ?? "", sample) };
      },
    };
  }
  return null;
}

/**
 * The source repeats, and each text with a number counts up by one per
 * repeat, as Excel fills `text1, textA` with `text2, textA, text3, textA`.
 */
function repeatingSeries(cells: readonly FillSourceCell[]): FillSeries {
  const n = cells.length;
  const counted = cells.map((cell) =>
    typeof cell.value === "string" ? countedText(cell.value) : null,
  );
  if (counted.every((text) => text === null)) return tilingSeries(n);
  return {
    stepAt: (p) => {
      const sourceIndex = wrap(p, n);
      const text = counted[sourceIndex];
      if (!text) return { kind: "tile", sourceIndex };
      return { kind: "value", value: text.write(text.number + Math.floor(p / n)) };
    },
  };
}

function textSeries(
  cells: readonly FillSourceCell[],
  texts: readonly string[],
  swap: boolean,
): FillSeries {
  if (swap) return tilingSeries(texts.length);
  const listed = listSeries(texts);
  if (listed !== null) return listed;
  const counted = texts.map(countedText);
  const first = counted[0];
  if (first && counted.every((text) => text?.key === first.key)) {
    const numbers = counted.map((text) => text?.number ?? 0);
    const step = numbers.length > 1 ? constantStep(numbers) : 1;
    if (step !== null) {
      return { stepAt: (p) => ({ kind: "value", value: first.write(first.number + step * p) }) };
    }
  }
  return repeatingSeries(cells);
}

/**
 * Classify the source cells and return their fill plan, as Excel's AutoFill:
 * - one number → copy; one date → one day per cell; one time → one hour per cell;
 * - dates on one day of the month → step by months; numbers with a constant
 *   step → continue the step; other numbers → linear trend;
 * - day and month names → continue the list; quarters → count to 4 and wrap;
 *   text that ends in a number or starts with an ordinal → count up;
 * - formulas → copy the source cells in turn; other text and mixed cells →
 *   repeat, each text with a number counting up once per repeat.
 * `options.swap` (Ctrl-drag) counts one number up and copies a series instead.
 * `options.series` counts one number up and fills every series;
 * `options.unit` steps the first date by days, weekdays, months or years.
 */
export function detectFillSeries(
  source: readonly FillSourceCell[],
  options: FillOptions = {},
): FillSeries {
  const n = source.length;
  if (n === 0 || options.copy === true || source.some((cell) => cell.isFormula)) {
    return tilingSeries(n);
  }
  const first = source[0];
  if (options.unit !== undefined && first && isFiniteNumber(first.value)) {
    return dateUnitSeries(first.value, options.unit);
  }
  const plainNumber = n === 1 && first?.isDate !== true && first?.isTime !== true;
  const swap = options.series === true ? plainNumber : options.swap === true;

  const numbers: number[] = [];
  const texts: string[] = [];
  for (const cell of source) {
    if (isFiniteNumber(cell.value)) numbers.push(cell.value);
    else if (typeof cell.value === "string" && cell.value !== "") texts.push(cell.value);
  }
  if (numbers.length === n) return numericSeries(source, numbers, swap);
  if (texts.length === n) return textSeries(source, texts, swap);
  return swap ? tilingSeries(n) : repeatingSeries(source);
}
