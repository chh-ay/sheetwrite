// The worksheet `<autoFilter>`: its range and the conditions of its filtered
// columns, as Excel writes them (ECMA-376 Part 1, 18.3.2).

import type {
  CellScalar,
  Column,
  ColumnFilter,
  FilterCondition,
  SheetId,
  SheetSnapshot,
  SnapshotCell,
} from "@sheetwrite/core";
import { formatNumber, isDynamicDateFilter } from "@sheetwrite/core";

import { type CellRect, parseCellRect } from "./cell-reference.js";
import { checkAbort, emitWarning, type XlsxCodecContext } from "./resources.js";
import { type XmlElement, xmlAttribute, xmlChild, xmlChildren, xmlLocalName } from "./xml.js";

/**
 * One filtered column. A value list holds the cells' display text, as the
 * file does; the assembly turns it into the cells' values.
 */
type ParsedFilterColumn =
  | {
      readonly col: number;
      readonly kind: "values";
      readonly texts: string[];
      readonly blanks: boolean;
    }
  | { readonly col: number; readonly kind: "filter"; readonly filter: ColumnFilter };

/** A worksheet AutoFilter: its range, header row first, and its filtered columns. */
export interface ParsedAutoFilter {
  readonly range: CellRect;
  readonly columns: readonly ParsedFilterColumn[];
}

const OPERATORS: Readonly<Record<string, FilterCondition["op"]>> = {
  equal: "eq",
  notEqual: "neq",
  greaterThan: "gt",
  greaterThanOrEqual: "gte",
  lessThan: "lt",
  lessThanOrEqual: "lte",
};

const has_wildcard = (text: string): boolean => /[*?~]/.test(text);

/** A number when the text is one, as Excel's dialog stores a typed number. */
function condition_value(text: string): number | string {
  const number = Number(text);
  return text.trim() !== "" && Number.isFinite(number) ? number : text;
}

/**
 * The condition a `customFilter` states. Excel writes "begins with ab" as
 * `equal ab*`, "contains ab" as `equal *ab*` and "does not contain ab" as
 * `notEqual *ab*`; those read back as the named conditions.
 */
function custom_filter_condition(operator: string, val: string): FilterCondition | null {
  // An own key only: "constructor" and the like are not operators.
  const op = Object.hasOwn(OPERATORS, operator) ? OPERATORS[operator] : undefined;
  if (op === undefined) return null;

  if (op === "eq" || op === "neq") {
    const inner = val.slice(1, -1);
    if (val.length > 2 && val.startsWith("*") && val.endsWith("*") && !has_wildcard(inner)) {
      return { op: op === "eq" ? "contains" : "notContains", value: inner };
    }
    if (op === "eq" && val.length > 1 && val.endsWith("*") && !has_wildcard(val.slice(0, -1))) {
      return { op: "beginsWith", value: val.slice(0, -1) };
    }
    if (op === "eq" && val.length > 1 && val.startsWith("*") && !has_wildcard(val.slice(1))) {
      return { op: "endsWith", value: val.slice(1) };
    }
  }

  return { op, value: condition_value(val) };
}

function parse_custom_filters(element: XmlElement): ColumnFilter | null {
  const entries = xmlChildren(element, "customFilter");
  if (entries.length < 1 || entries.length > 2) return null;

  const conditions: FilterCondition[] = [];
  for (const entry of entries) {
    const condition = custom_filter_condition(
      xmlAttribute(entry, "operator") ?? "equal",
      xmlAttribute(entry, "val") ?? "",
    );
    if (!condition) return null;
    conditions.push(condition);
  }

  // Excel writes "non blanks" as `notEqual " "`.
  const [first] = conditions;
  if (conditions.length === 1 && first?.op === "neq" && first.value === " ") {
    return { kind: "nonEmpty" };
  }

  // The join matters only between two conditions; one condition reads as
  // "and", the join Sheetwrite and Excel's dialog start with.
  const and = xmlAttribute(element, "and");
  return {
    kind: "custom",
    join: conditions.length === 1 || and === "1" || and === "true" ? "and" : "or",
    conditions: conditions.length === 1 ? [conditions[0]!] : [conditions[0]!, conditions[1]!],
  };
}

function parse_filter_column(element: XmlElement, col: number): ParsedFilterColumn | null {
  const filters = xmlChild(element, "filters");
  if (filters) {
    if (xmlChildren(filters, "dateGroupItem").length > 0) return null;
    const blank = xmlAttribute(filters, "blank");
    return {
      col,
      kind: "values",
      texts: xmlChildren(filters, "filter").map((filter) => xmlAttribute(filter, "val") ?? ""),
      blanks: blank === "1" || blank === "true",
    };
  }

  // Excel's relative date filters and All Dates in the Period; above and
  // below average have no Sheetwrite equivalent.
  const dynamic = xmlChild(element, "dynamicFilter");
  const type = dynamic ? xmlAttribute(dynamic, "type") : undefined;
  if (type !== undefined && isDynamicDateFilter(type)) {
    return { col, kind: "filter", filter: { kind: "dynamic", type } };
  }

  const custom = xmlChild(element, "customFilters");
  const filter = custom ? parse_custom_filters(custom) : null;
  return filter ? { col, kind: "filter", filter } : null;
}

/**
 * The worksheet's AutoFilter, or `undefined` without one. A column whose
 * filter has no Sheetwrite equivalent (colours, icons, top 10, above or below
 * average, date groups) is left unfiltered, with a warning.
 */
export function parseAutoFilter(
  root: XmlElement,
  context: XlsxCodecContext,
  sheetName: string,
): ParsedAutoFilter | undefined {
  const element = xmlChild(root, "autoFilter");
  const ref = element && xmlAttribute(element, "ref");
  const range = ref ? parseCellRect(ref) : undefined;
  if (!element || !range) return undefined;

  const columns: ParsedFilterColumn[] = [];
  const seen = new Set<number>();
  for (const filter_column of xmlChildren(element, "filterColumn")) {
    const col_id = Number(xmlAttribute(filter_column, "colId"));
    const col = range.c0 + col_id;
    if (!Number.isInteger(col_id) || col_id < 0 || col > range.c1) continue;
    const kinds = filter_column.children.map((child) => xmlLocalName(child.name));
    if (kinds.length === 0) continue;
    // One filter per column, as Excel writes: a repeated column is dropped, so
    // the filters stay bounded by the range's width.
    if (seen.has(col)) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `A second AutoFilter filter for column ${col_id + 1} of the range was dropped`,
        sheet: sheetName,
      });
      continue;
    }
    seen.add(col);

    const parsed = parse_filter_column(filter_column, col);
    if (parsed) {
      columns.push(parsed);
      continue;
    }
    emitWarning(context, {
      code: "unsupported-feature",
      message: `An AutoFilter column filter (${kinds.join(", ")}) has no Sheetwrite equivalent and was dropped`,
      sheet: sheetName,
    });
  }
  return { range, columns };
}

/**
 * Row metadata without the hidden flag of rows in the AutoFilter's body.
 * Excel hides the rows its filter leaves out; they show again when the filter
 * clears, so they belong to the filter, not to the sheet's hidden rows.
 */
export function rowMetaShownByFilter<Meta extends { readonly hidden?: boolean }>(
  rowMeta: readonly [number, Meta][],
  range: CellRect,
): [number, Meta][] {
  return rowMeta.flatMap(([row, meta]): [number, Meta][] => {
    if (!meta.hidden || row <= range.r0 || row > range.r1) return [[row, meta]];
    const { hidden: _hidden, ...shown } = meta;
    return Object.keys(shown).length > 0 ? [[row, shown as Meta]] : [];
  });
}

/** The text a cell shows, which Excel's value lists name it by. */
function display_text(cell: SnapshotCell, column: Column | undefined): string | null {
  if (cell.value.kind !== "literal") return null;
  const { value } = cell.value;
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  return formatNumber(
    value,
    cell.style?.numberFormat ?? column?.numberFormat,
    column?.numberLocale,
  );
}

/**
 * The body cells of each column that has a value list, read in one pass over
 * the sheet's cells however many filtered columns there are; a long pass
 * stops when the import is aborted.
 */
function body_cells_by_column(
  parsed: ParsedAutoFilter,
  body: { start: number; end: number },
  cells: readonly SnapshotCell[],
  context: XlsxCodecContext,
): Map<number, SnapshotCell[]> {
  const by_column = new Map<number, SnapshotCell[]>();
  for (const column of parsed.columns) if (column.kind === "values") by_column.set(column.col, []);
  if (by_column.size === 0) return by_column;

  for (let index = 0; index < cells.length; index++) {
    if ((index & 4_095) === 0) checkAbort(context);
    const cell = cells[index]!;
    if (cell.rowOffset < body.start || cell.rowOffset > body.end) continue;
    by_column.get(cell.colOffset)?.push(cell);
  }
  return by_column;
}

/**
 * The values a value list keeps. Excel names each value by the text its cells
 * show, so the list keeps the value of every body cell of the column whose
 * text is on it, compared without case as Excel does. Text that names no
 * cell (a formula's result, say) stays as text, or as a number when it is one.
 */
function values_showing(
  texts: readonly string[],
  blanks: boolean,
  cells: readonly SnapshotCell[],
  column: Column | undefined,
): CellScalar[] {
  const wanted = new Set(texts.map((text) => text.toLowerCase()));
  const named = new Set<string>();
  const values = new Map<string, CellScalar>();
  for (const cell of cells) {
    const text = display_text(cell, column)?.toLowerCase();
    if (text === undefined || !wanted.has(text) || cell.value.kind !== "literal") continue;
    named.add(text);
    const { value } = cell.value;
    values.set(`${typeof value}:${String(value)}`, value);
  }

  const kept = [...values.values()];
  for (const text of texts) {
    if (named.has(text.toLowerCase())) continue;
    const number = Number(text);
    kept.push(text.trim() !== "" && Number.isFinite(number) ? number : text);
  }
  if (blanks) kept.push(null);
  return kept;
}

/**
 * The AutoFilter and column filters of an imported sheet. Sheetwrite's own
 * metadata wins when the file's AutoFilter still has its range and filtered
 * columns, as it keeps the exact conditions; otherwise the file's conditions
 * are read, as Excel left them. Without an AutoFilter in the file, saved view
 * filters come back only if they were not an AutoFilter's.
 */
export function snapshotAutoFilter(
  parsed: ParsedAutoFilter | undefined,
  meta: SheetSnapshot | undefined,
  sheet: SheetId,
  cells: readonly SnapshotCell[],
  columns: readonly Column[],
  rowCount: number,
  context: XlsxCodecContext,
): Pick<SheetSnapshot, "autoFilter" | "filters"> {
  if (!parsed) {
    return !meta?.autoFilter && meta?.filters ? { filters: structuredClone(meta.filters) } : {};
  }

  const r1 = Math.min(parsed.range.r1, rowCount - 1);
  const c1 = Math.min(parsed.range.c1, columns.length - 1);
  if (parsed.range.r0 > r1 || parsed.range.c0 > c1) return {};

  const range = {
    sheet,
    start: { row: parsed.range.r0, col: parsed.range.c0 },
    end: { row: r1, col: c1 },
  };
  const saved = meta?.autoFilter?.range;
  const saved_columns = new Set(meta?.filters?.map(([col]) => col) ?? []);
  if (
    saved &&
    saved.start.row === range.start.row &&
    saved.start.col === range.start.col &&
    saved.end.row === range.end.row &&
    saved.end.col === range.end.col &&
    saved_columns.size === parsed.columns.length &&
    parsed.columns.every((column) => saved_columns.has(column.col))
  ) {
    return {
      autoFilter: { range },
      ...(meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
    };
  }

  const body = { start: range.start.row + 1, end: range.end.row };
  const cells_by_column = body_cells_by_column(parsed, body, cells, context);
  const filters: [number, ColumnFilter][] = parsed.columns
    .filter((column) => column.col <= c1)
    .map((column) => [
      column.col,
      column.kind === "filter"
        ? column.filter
        : {
            kind: "values",
            values: values_showing(
              column.texts,
              column.blanks,
              cells_by_column.get(column.col) ?? [],
              columns[column.col],
            ),
          },
    ]);
  return { autoFilter: { range }, ...(filters.length > 0 ? { filters } : {}) };
}
