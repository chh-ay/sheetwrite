// Excel's AutoFilter: the filtered range of a sheet and how its custom
// conditions read as COUNTIF criteria.

import type { AutoFilter, CustomColumnFilter, FilterCondition } from "../types/document.js";

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
