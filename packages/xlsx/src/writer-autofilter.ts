// The worksheet `<autoFilter>` Excel reads: the range and each filtered
// column's condition (ECMA-376 Part 1, 18.3.2).

import type {
  AutoFilter,
  CellScalar,
  Column,
  ColumnFilter,
  FilterCondition,
  SheetSnapshot,
} from "@sheetwrite/core";
import { cellA1, formatNumber } from "@sheetwrite/core/codec";

import { encodeXstring, escapeXml } from "./xml.js";

const OPERATORS: Readonly<Record<"eq" | "neq" | "gt" | "gte" | "lt" | "lte", string>> = {
  eq: "equal",
  neq: "notEqual",
  gt: "greaterThan",
  gte: "greaterThanOrEqual",
  lt: "lessThan",
  lte: "lessThanOrEqual",
};

const attribute = (value: string): string => escapeXml(encodeXstring(value));

function custom_filter(op: keyof typeof OPERATORS, val: string): string {
  const operator = op === "eq" ? "" : ` operator="${OPERATORS[op]}"`;
  return `<customFilter${operator} val="${attribute(val)}"/>`;
}

/** A condition as Excel's dialog writes it: "begins with ab" is `equal ab*`. */
function condition_xml(condition: FilterCondition): string {
  const value = String(condition.value);
  switch (condition.op) {
    case "beginsWith":
      return custom_filter("eq", `${value}*`);
    case "endsWith":
      return custom_filter("eq", `*${value}`);
    case "contains":
      return custom_filter("eq", `*${value}*`);
    case "notContains":
      return custom_filter("neq", `*${value}*`);
    default:
      return custom_filter(condition.op, value);
  }
}

/**
 * The text a value shows in its cells, which Excel's value lists name it by:
 * a number in the format of its first cell in the list, else the column's.
 */
function value_text(
  value: Exclude<CellScalar, null>,
  formats: ReadonlyMap<number, string | undefined>,
  column: Column | undefined,
): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  return formatNumber(value, formats.get(value) ?? column?.numberFormat, column?.numberLocale);
}

/** The number format of the first body cell in `col` that holds each number. */
function cell_formats(
  sheet: SheetSnapshot,
  col: number,
  body: { readonly start: number; readonly end: number },
): Map<number, string | undefined> {
  const formats = new Map<number, string | undefined>();
  for (const block of sheet.cells) {
    if (col < block.startCol || col >= block.startCol + block.colCount) continue;
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      if (block.startCol + cell.colOffset !== col || row < body.start || row > body.end) continue;
      const { value } = cell;
      if (value.kind !== "literal" || typeof value.value !== "number") continue;
      if (!formats.has(value.value)) formats.set(value.value, cell.style?.numberFormat);
    }
  }
  return formats;
}

function filter_xml(
  filter: ColumnFilter,
  formats: ReadonlyMap<number, string | undefined>,
  column: Column | undefined,
): string {
  switch (filter.kind) {
    case "values": {
      const blank = filter.values.includes(null) ? ' blank="1"' : "";
      const values = filter.values
        .filter((value): value is Exclude<CellScalar, null> => value !== null)
        .map((value) => `<filter val="${attribute(value_text(value, formats, column))}"/>`);
      return `<filters${blank}>${values.join("")}</filters>`;
    }
    case "contains":
      return `<customFilters>${custom_filter("eq", `*${filter.text}*`)}</customFilters>`;
    case "compare":
      return `<customFilters>${custom_filter(filter.op, String(filter.value))}</customFilters>`;
    case "empty":
      return '<filters blank="1"/>';
    case "nonEmpty":
      // Excel writes "non blanks" this way.
      return `<customFilters>${custom_filter("neq", " ")}</customFilters>`;
    case "custom": {
      const and = filter.join === "and" && filter.conditions.length > 1 ? ' and="1"' : "";
      return `<customFilters${and}>${filter.conditions.map(condition_xml).join("")}</customFilters>`;
    }
    case "dynamic":
      return `<dynamicFilter type="${filter.type}"/>`;
  }
}

/** The sheet's `<autoFilter>`, with a `filterColumn` for each filter inside its range. */
export function autoFilterXml(sheet: SheetSnapshot, autoFilter: AutoFilter): string {
  const { start, end } = autoFilter.range;
  const columns = (sheet.filters ?? [])
    .filter(([col]) => col >= start.col && col <= end.col)
    .sort(([left], [right]) => left - right)
    .map(([col, filter]) => {
      // Only a value list names numbers by their text, so only it reads cells.
      const formats =
        filter.kind === "values"
          ? cell_formats(sheet, col, { start: start.row + 1, end: end.row })
          : new Map<number, string | undefined>();
      const xml = filter_xml(filter, formats, sheet.columns[col]);
      return `<filterColumn colId="${col - start.col}">${xml}</filterColumn>`;
    });
  const ref = `${cellA1(start.row, start.col)}:${cellA1(end.row, end.col)}`;
  return columns.length > 0
    ? `<autoFilter ref="${ref}">${columns.join("")}</autoFilter>`
    : `<autoFilter ref="${ref}"/>`;
}
