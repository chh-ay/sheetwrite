// What the grid needs to draw and open AutoFilter dropdowns: the header
// button's place and the kind of filters a column offers.

import type { CellScalar, Column } from "./types/cell.js";

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
