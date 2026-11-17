// Excel's AutoFilter: the filtered range of a sheet, how its custom
// conditions read as COUNTIF criteria, and which dates its dynamic date
// filters keep.

import { dateToSerial } from "../date-serial.js";
import type {
  AutoFilter,
  CustomColumnFilter,
  DynamicDateFilter,
  FilterCondition,
} from "../types/document.js";

const COMPARISON_PREFIX = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
} as const;

/**
 * The COUNTIF criterion a condition matches as, which is also how Excel's
 * custom filter dialog reads it: "begins with ab" is `=ab*`. Wildcards the
 * user types stay wildcards, as in Excel.
 */
export function conditionCriterion(condition: FilterCondition): string {
  const value = String(condition.value);
  switch (condition.op) {
    case "beginsWith":
      return `=${value}*`;
    case "endsWith":
      return `=*${value}`;
    case "contains":
      return `=*${value}*`;
    case "notContains":
      return `<>*${value}*`;
    default:
      return `${COMPARISON_PREFIX[condition.op]}${value}`;
  }
}

/** The comparisons a custom filter condition can make. */
const FILTER_CONDITION_OPS: readonly FilterCondition["op"][] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "beginsWith",
  "endsWith",
  "contains",
  "notContains",
];

const TEXT_ONLY_OPS: ReadonlySet<FilterCondition["op"]> = new Set([
  "beginsWith",
  "endsWith",
  "contains",
  "notContains",
]);

/** Whether a condition has a known comparison and a value it can compare. */
export function validFilterCondition(condition: {
  readonly op: unknown;
  readonly value: unknown;
}): boolean {
  const op = FILTER_CONDITION_OPS.find((candidate) => candidate === condition.op);
  if (op === undefined) return false;
  if (typeof condition.value === "string") return true;
  return (
    typeof condition.value === "number" &&
    Number.isFinite(condition.value) &&
    !TEXT_ONLY_OPS.has(op)
  );
}

/** Whether a custom filter has one or two valid conditions and a known join. */
export function validCustomFilter(filter: CustomColumnFilter): boolean {
  return (
    (filter.join === "and" || filter.join === "or") &&
    Array.isArray(filter.conditions) &&
    filter.conditions.length >= 1 &&
    filter.conditions.length <= 2 &&
    filter.conditions.every(validFilterCondition)
  );
}

/** Excel's dynamic date filters, by their XLSX `dynamicFilter` names. */
export const DYNAMIC_DATE_FILTERS: ReadonlySet<string> = new Set<DynamicDateFilter>([
  "tomorrow",
  "today",
  "yesterday",
  "nextWeek",
  "thisWeek",
  "lastWeek",
  "nextMonth",
  "thisMonth",
  "lastMonth",
  "nextQuarter",
  "thisQuarter",
  "lastQuarter",
  "nextYear",
  "thisYear",
  "lastYear",
  "yearToDate",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M8",
  "M9",
  "M10",
  "M11",
  "M12",
]);

/** Whether `name` is one of Excel's dynamic date filters, as an XLSX file may name it. */
export function isDynamicDateFilter(name: string): name is DynamicDateFilter {
  return DYNAMIC_DATE_FILTERS.has(name);
}

const DAYS_IN_WEEK = 7;
const MONTHS_IN_QUARTER = 3;
const MONTHS_IN_YEAR = 12;

/**
 * What a dynamic date filter keeps, on the local calendar day of `now` as
 * Excel reads the computer's clock: the serials `[start, end)` of a span
 * relative to that day, or the months (1 to 12) of a period of any year.
 */
export function dynamicDateSpan(
  type: DynamicDateFilter,
  now: Date,
): { readonly start: number; readonly end: number } | { readonly months: readonly number[] } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  // Date.UTC carries a day or month past its end into the next one.
  const serial = (atMonth: number, atDay: number) =>
    dateToSerial(new Date(Date.UTC(year, atMonth, atDay)));
  const days = (offset: number, length: number) => ({
    start: serial(month, day + offset),
    end: serial(month, day + offset + length),
  });
  const months = (first: number, length: number) => ({
    start: serial(first, 1),
    end: serial(first + length, 1),
  });
  const weekStart = -now.getDay();
  const quarterStart = month - (month % MONTHS_IN_QUARTER);
  switch (type) {
    case "yesterday":
      return days(-1, 1);
    case "today":
      return days(0, 1);
    case "tomorrow":
      return days(1, 1);
    case "lastWeek":
      return days(weekStart - DAYS_IN_WEEK, DAYS_IN_WEEK);
    case "thisWeek":
      return days(weekStart, DAYS_IN_WEEK);
    case "nextWeek":
      return days(weekStart + DAYS_IN_WEEK, DAYS_IN_WEEK);
    case "lastMonth":
      return months(month - 1, 1);
    case "thisMonth":
      return months(month, 1);
    case "nextMonth":
      return months(month + 1, 1);
    case "lastQuarter":
      return months(quarterStart - MONTHS_IN_QUARTER, MONTHS_IN_QUARTER);
    case "thisQuarter":
      return months(quarterStart, MONTHS_IN_QUARTER);
    case "nextQuarter":
      return months(quarterStart + MONTHS_IN_QUARTER, MONTHS_IN_QUARTER);
    case "lastYear":
      return months(-MONTHS_IN_YEAR, MONTHS_IN_YEAR);
    case "thisYear":
      return months(0, MONTHS_IN_YEAR);
    case "nextYear":
      return months(MONTHS_IN_YEAR, MONTHS_IN_YEAR);
    case "yearToDate":
      return { start: serial(0, 1), end: serial(month, day + 1) };
    default: {
      // Q1 to Q4 and M1 to M12: the months of the period, in any year.
      const index = Number(type.slice(1));
      if (type.startsWith("M")) return { months: [index] };
      const first = (index - 1) * MONTHS_IN_QUARTER + 1;
      return { months: [first, first + 1, first + 2] };
    }
  }
}

/** The data rows an AutoFilter filters: those of its range below the header. */
export function autoFilterBody(autoFilter: AutoFilter): { start: number; end: number } {
  return { start: autoFilter.range.start.row + 1, end: autoFilter.range.end.row };
}

/** The first index in ascending `rows` whose row is at least `row`. */
function lowerBound(rows: Uint32Array, row: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle]! < row) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The rows that show: those of `survivors` (ascending, from the column
 * filters) inside the AutoFilter's body, and every row outside it, the header
 * row included. Without an AutoFilter, filters apply to every row.
 */
export function keepOutsideAutoFilter(
  survivors: Uint32Array,
  autoFilter: AutoFilter | undefined,
  rowCount: number,
): Uint32Array {
  if (!autoFilter) return survivors;

  const body = autoFilterBody(autoFilter);
  const start = Math.min(body.start, rowCount);
  const end = Math.min(body.end + 1, rowCount);
  const from = lowerBound(survivors, start);
  const to = lowerBound(survivors, end);
  const kept = new Uint32Array(start + (to - from) + Math.max(0, rowCount - end));
  for (let row = 0; row < start; row++) kept[row] = row;
  kept.set(survivors.subarray(from, to), start);
  let at = start + (to - from);
  for (let row = end; row < rowCount; row++) kept[at++] = row;
  return kept;
}
