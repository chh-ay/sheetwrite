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
import { formatNumber } from "@sheetwrite/core";

import { type CellRect, parseCellRect } from "./cell-reference.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { type XmlElement, xmlAttribute, xmlChild, xmlChildren, xmlLocalName } from "./xml.js";

/**
 * One filtered column. A value list holds the cells' display text, as the
 * file does; the assembly turns it into the cells' values.
 */
export type ParsedFilterColumn =
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

const hasWildcard = (text: string): boolean => /[*?~]/.test(text);

/** A number when the text is one, as Excel's dialog stores a typed number. */
function conditionValue(text: string): number | string {
  const number = Number(text);
  return text.trim() !== "" && Number.isFinite(number) ? number : text;
}

/**
 * The condition a `customFilter` states. Excel writes "begins with ab" as
 * `equal ab*`, "contains ab" as `equal *ab*` and "does not contain ab" as
 * `notEqual *ab*`; those read back as the named conditions.
 */
export function customFilterCondition(operator: string, val: string): FilterCondition | null {
  const op = OPERATORS[operator];
  if (op === undefined) return null;

  if (op === "eq" || op === "neq") {
    const inner = val.slice(1, -1);
    if (val.length > 2 && val.startsWith("*") && val.endsWith("*") && !hasWildcard(inner)) {
      return { op: op === "eq" ? "contains" : "notContains", value: inner };
    }
    if (op === "eq" && val.length > 1 && val.endsWith("*") && !hasWildcard(val.slice(0, -1))) {
      return { op: "beginsWith", value: val.slice(0, -1) };
    }
    if (op === "eq" && val.length > 1 && val.startsWith("*") && !hasWildcard(val.slice(1))) {
      return { op: "endsWith", value: val.slice(1) };
    }
  }

  return { op, value: conditionValue(val) };
}

function parseCustomFilters(element: XmlElement): ColumnFilter | null {
  const entries = xmlChildren(element, "customFilter");
  if (entries.length < 1 || entries.length > 2) return null;

  const conditions: FilterCondition[] = [];
  for (const entry of entries) {
    const condition = customFilterCondition(
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

  const and = xmlAttribute(element, "and");
  return {
    kind: "custom",
    join: and === "1" || and === "true" ? "and" : "or",
    conditions: conditions.length === 1 ? [conditions[0]!] : [conditions[0]!, conditions[1]!],
  };
}

function parseFilterColumn(element: XmlElement, col: number): ParsedFilterColumn | null {
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

  const custom = xmlChild(element, "customFilters");
  const filter = custom ? parseCustomFilters(custom) : null;
  return filter ? { col, kind: "filter", filter } : null;
}

/**
 * The worksheet's AutoFilter, or `undefined` without one. A column whose
 * filter has no Sheetwrite equivalent (colours, icons, top 10, dynamic dates,
 * date groups) is left unfiltered, with a warning.
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
  for (const filterColumn of xmlChildren(element, "filterColumn")) {
    const colId = Number(xmlAttribute(filterColumn, "colId"));
    const col = range.c0 + colId;
    if (!Number.isInteger(colId) || colId < 0 || col > range.c1) continue;
    const kinds = filterColumn.children.map((child) => xmlLocalName(child.name));
    if (kinds.length === 0) continue;

    const parsed = parseFilterColumn(filterColumn, col);
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
function displayText(cell: SnapshotCell, column: Column | undefined): string | null {
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
 * The values a value list keeps. Excel names each value by the text its cells
 * show, so the list keeps the value of every body cell of the column whose
 * text is on it, compared without case as Excel does. Text that names no
 * cell (a formula's result, say) stays as text, or as a number when it is one.
 */
function valuesShowing(
  texts: readonly string[],
  blanks: boolean,
  col: number,
  body: { start: number; end: number },
  cells: readonly SnapshotCell[],
  column: Column | undefined,
): CellScalar[] {
  const wanted = new Set(texts.map((text) => text.toLowerCase()));
  const named = new Set<string>();
  const values = new Map<string, CellScalar>();
  for (const cell of cells) {
    if (cell.colOffset !== col || cell.rowOffset < body.start || cell.rowOffset > body.end)
      continue;
    const text = displayText(cell, column)?.toLowerCase();
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
  const savedColumns = new Set(meta?.filters?.map(([col]) => col) ?? []);
  if (
    saved &&
    saved.start.row === range.start.row &&
    saved.start.col === range.start.col &&
    saved.end.row === range.end.row &&
    saved.end.col === range.end.col &&
    savedColumns.size === parsed.columns.length &&
    parsed.columns.every((column) => savedColumns.has(column.col))
  ) {
    return {
      autoFilter: { range },
      ...(meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
    };
  }

  const body = { start: range.start.row + 1, end: range.end.row };
  const filters: [number, ColumnFilter][] = parsed.columns
    .filter((column) => column.col <= c1)
    .map((column) => [
      column.col,
      column.kind === "filter"
        ? column.filter
        : {
            kind: "values",
            values: valuesShowing(
              column.texts,
              column.blanks,
              column.col,
              body,
              cells,
              columns[column.col],
            ),
          },
    ]);
  return { autoFilter: { range }, ...(filters.length > 0 ? { filters } : {}) };
}
