// Excel's AutoFilter: the filtered range of a sheet and how its custom
// conditions read as COUNTIF criteria.

import type { CellScalar, Column } from "./types/cell.js";
import type { AutoFilter, CustomColumnFilter, FilterCondition } from "./types/document.js";

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

/** The rows of ascending `rows` from `start` to `end`, both included. */
export function rowsWithin(rows: Uint32Array, start: number, end: number): Uint32Array {
  return rows.subarray(lowerBound(rows, start), lowerBound(rows, end + 1));
}

/** The rows in both ascending row lists. */
export function intersectSortedRows(left: Uint32Array, right: Uint32Array): Uint32Array {
  const out = new Uint32Array(Math.min(left.length, right.length));
  let count = 0;
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i]!;
    const b = right[j]!;
    if (a === b) {
      out[count++] = a;
      i++;
      j++;
    } else if (a < b) i++;
    else j++;
  }
  return out.subarray(0, count);
}

/** Edge of the filter button, in CSS pixels at zoom 1. */
const FILTER_BUTTON_SIZE = 16;

/**
 * Where an AutoFilter header cell's filter button sits: a square at the
 * cell's right edge, as in Excel. `cell` and the result share a coordinate space.
 */
export function filterButtonRect(cell: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const size = Math.max(0, Math.min(FILTER_BUTTON_SIZE, cell.h - 4, cell.w - 4));
  return { x: cell.x + cell.w - size - 2, y: cell.y + (cell.h - size) / 2, w: size, h: size };
}

/** Most values a dropdown lists, as Excel's list shows at most 10,000. */
export const AUTO_FILTER_VALUE_LIMIT = 10_000;

/** Date codes: a year, a day or month next to a separator, or a month name. */
const DATE_FORMAT = /y{2}|d{1,2}[/.-]|[/.-]d{1,2}|m{3}/i;

/**
 * Whether a column's dropdown offers Number, Text or Date Filters: a date
 * column or date format gives dates, a numeric type or all-number values
 * give numbers, anything else text.
 */
export function autoFilterColumnKind(
  column: Column | undefined,
  values: readonly CellScalar[],
): "number" | "text" | "date" {
  if (column?.type === "date" || DATE_FORMAT.test(column?.numberFormat ?? "")) return "date";
  if (column?.type === "number" || column?.type === "currency") return "number";
  const present = values.filter((value) => value !== null && value !== "");
  return present.length > 0 && present.every((value) => typeof value === "number")
    ? "number"
    : "text";
}
