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
import { cellA1, formatNumber } from "@sheetwrite/core";

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

function customFilter(op: keyof typeof OPERATORS, val: string): string {
  const operator = op === "eq" ? "" : ` operator="${OPERATORS[op]}"`;
  return `<customFilter${operator} val="${attribute(val)}"/>`;
}

/** A condition as Excel's dialog writes it: "begins with ab" is `equal ab*`. */
function conditionXml(condition: FilterCondition): string {
  const value = String(condition.value);
  switch (condition.op) {
    case "beginsWith":
      return customFilter("eq", `${value}*`);
    case "endsWith":
      return customFilter("eq", `*${value}`);
    case "contains":
      return customFilter("eq", `*${value}*`);
    case "notContains":
      return customFilter("neq", `*${value}*`);
    default:
      return customFilter(condition.op, value);
  }
}

/** The text a value shows in `column`, which Excel's value lists name it by. */
function valueText(value: Exclude<CellScalar, null>, column: Column | undefined): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  return formatNumber(value, column?.numberFormat, column?.numberLocale);
}

function filterXml(filter: ColumnFilter, column: Column | undefined): string {
  switch (filter.kind) {
    case "values": {
      const blank = filter.values.includes(null) ? ' blank="1"' : "";
      const values = filter.values
        .filter((value): value is Exclude<CellScalar, null> => value !== null)
        .map((value) => `<filter val="${attribute(valueText(value, column))}"/>`);
      return `<filters${blank}>${values.join("")}</filters>`;
    }
    case "contains":
      return `<customFilters>${customFilter("eq", `*${filter.text}*`)}</customFilters>`;
    case "compare":
      return `<customFilters>${customFilter(filter.op, String(filter.value))}</customFilters>`;
    case "empty":
      return '<filters blank="1"/>';
    case "nonEmpty":
      // Excel writes "non blanks" this way.
      return `<customFilters>${customFilter("neq", " ")}</customFilters>`;
    case "custom": {
      const and = filter.join === "and" && filter.conditions.length > 1 ? ' and="1"' : "";
      return `<customFilters${and}>${filter.conditions.map(conditionXml).join("")}</customFilters>`;
    }
  }
}

/** The sheet's `<autoFilter>`, with a `filterColumn` for each filter inside its range. */
export function autoFilterXml(sheet: SheetSnapshot, autoFilter: AutoFilter): string {
  const { start, end } = autoFilter.range;
  const columns = (sheet.filters ?? [])
    .filter(([col]) => col >= start.col && col <= end.col)
    .sort(([left], [right]) => left - right)
    .map(
      ([col, filter]) =>
        `<filterColumn colId="${col - start.col}">${filterXml(filter, sheet.columns[col])}</filterColumn>`,
    );
  const ref = `${cellA1(start.row, start.col)}:${cellA1(end.row, end.col)}`;
  return columns.length > 0
    ? `<autoFilter ref="${ref}">${columns.join("")}</autoFilter>`
    : `<autoFilter ref="${ref}"/>`;
}
