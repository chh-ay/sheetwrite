// Autofill series detection for drag-to-fill, following Excel's AutoFill
// defaults. Given the source cells along the fill direction, decide whether
// the fill extends a series or copies the source. Pure and DOM-free: the
// caller supplies resolved scalars, formula flags and date formats, and
// resolves copied cells itself (so formula reference-shifting stays in the
// grid layer).
// https://support.microsoft.com/en-us/excel/get-started/fill-data-automatically-in-worksheet-cells

import type { CellScalar } from "./types/cell.js";

/** One source cell in fill order (top→bottom for a vertical fill, left→right for a horizontal one). */
export interface FillSourceCell {
  /** Resolved scalar value of the source cell. */
  value: CellScalar;
  /** True when the cell holds a formula; formulas copy (with ref-shift), never extend. */
  isFormula: boolean;
  /** True when the cell shows its number as a date, so one cell steps by a day. */
  isDate?: boolean;
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

/** How a fill treats its source. */
export interface FillOptions {
  /**
   * Ctrl (Option on a Mac) held while dragging, which swaps Excel's default:
   * one number then counts up by 1, and a series is copied instead.
   */
  readonly swap?: boolean;
  /** Copy the source unchanged, as Fill Down (Ctrl+D) and Fill Right (Ctrl+R) do. */
  readonly copy?: boolean;
}

/** Relative+absolute slack so float deltas (0.1, 0.2, 0.3, …) read as constant. */
const DELTA_EPSILON = 1e-9;

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

function isFiniteNumber(v: CellScalar): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function tilingSeries(length: number): FillSeries {
  const n = Math.max(1, length);
  return {
    stepAt: (p) => ({ kind: "tile", sourceIndex: ((p % n) + n) % n }),
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

function numericSeries(
  cells: readonly FillSourceCell[],
  values: number[],
  swap: boolean,
): FillSeries {
  if (values.length === 1) {
    // One date counts up by a day; one number is copied. Ctrl swaps the two.
    const counts = (cells[0]?.isDate === true) !== swap;
    const base = values[0] ?? 0;
    return counts ? { stepAt: (p) => ({ kind: "value", value: base + p }) } : tilingSeries(1);
  }
  if (swap) return tilingSeries(values.length);
  const delta = constantStep(values);
  if (delta !== null) {
    const base = values[0] ?? 0;
    return { stepAt: (p) => ({ kind: "value", value: base + delta * p }) };
  }
  const { base, slope } = linearTrend(values);
  return { stepAt: (p) => ({ kind: "value", value: base + slope * p }) };
}

/** `Item 1`, `Item 2`: the shared text, and the numbers with their written width. */
function trailingNumbers(
  texts: readonly string[],
): { prefix: string; numbers: number[]; width: number } | null {
  let prefix: string | null = null;
  let width = 0;
  const numbers: number[] = [];
  for (const text of texts) {
    const match = TRAILING_NUMBER.exec(text);
    const digits = match?.[2];
    if (match === null || digits === undefined) return null;
    const head = match[1] ?? "";
    if (prefix !== null && head !== prefix) return null;
    prefix = head;
    if (digits.startsWith("0")) width = Math.max(width, digits.length);
    numbers.push(Number(digits));
  }
  return prefix === null ? null : { prefix, numbers, width };
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

function textSeries(texts: readonly string[], swap: boolean): FillSeries {
  if (swap) return tilingSeries(texts.length);
  const listed = listSeries(texts);
  if (listed !== null) return listed;
  const numbered = trailingNumbers(texts);
  if (numbered === null) return tilingSeries(texts.length);
  const { prefix, numbers, width } = numbered;
  const step = numbers.length > 1 ? constantStep(numbers) : 1;
  if (step === null) return tilingSeries(texts.length);
  const base = numbers[0] ?? 0;
  return {
    stepAt: (p) => {
      const number = Math.abs(base + step * p);
      return { kind: "value", value: `${prefix}${String(number).padStart(width, "0")}` };
    },
  };
}

/**
 * Classify the source cells and return their fill plan, as Excel's AutoFill:
 * - one number → copy; one date → one day per cell;
 * - numbers with a constant step → continue the step; other numbers → linear trend;
 * - day and month names → continue the list; text ending in a number → count up;
 * - formulas, mixed or other text → copy the source cells in turn.
 * `options.swap` (Ctrl-drag) counts one number up and copies a series instead.
 */
export function detectFillSeries(
  source: readonly FillSourceCell[],
  options: FillOptions = {},
): FillSeries {
  const n = source.length;
  if (n === 0 || options.copy === true || source.some((cell) => cell.isFormula)) {
    return tilingSeries(n);
  }
  const swap = options.swap === true;

  const numbers: number[] = [];
  const texts: string[] = [];
  for (const cell of source) {
    if (isFiniteNumber(cell.value)) numbers.push(cell.value);
    else if (typeof cell.value === "string" && cell.value !== "") texts.push(cell.value);
  }
  if (numbers.length === n) return numericSeries(source, numbers, swap);
  if (texts.length === n) return textSeries(texts, swap);
  return tilingSeries(n);
}
