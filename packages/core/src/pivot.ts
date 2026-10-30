// Pure pivot-definition rules shared by the protocol, the document controller,
// the store and the history: validation, cloning, structural rebase and the
// WASM payload encoder. Nothing here touches the engine.

import { moveIndex, remapSpan } from "./store/ranges.js";
import type { CellScalar } from "./types/cell.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet } from "./types/document.js";
import type {
  PivotAggregation,
  PivotDefinition,
  PivotFilter,
  PivotResultView,
  PivotSort,
  PivotSource,
  PivotValueField,
} from "./types/pivot.js";

/** Most pivots one workbook may hold; each one owns an engine cache. */
export const MAX_PIVOTS_PER_WORKBOOK = 1_000;
/** Longest pivot ID; matches the table ID bound. */
const MAX_PIVOT_ID_LENGTH = 255;
/** Longest pivot or value-field caption. */
const MAX_PIVOT_NAME_LENGTH = 255;
/** Most entries in one of `rows`, `columns`, `values`, `filters` or `sort`. */
const MAX_PIVOT_FIELD_ENTRIES = 256;
/** Most keep-list values across all filters of one pivot. */
const MAX_PIVOT_FILTER_VALUES = 10_000;
/** Longest text filter value; Excel's cell text limit. */
const MAX_PIVOT_FILTER_TEXT_LENGTH = 32_767;
/** Field indices address source columns, so they share the sheet width bound. */
const MAX_PIVOT_FIELD_INDEX = 16_383;
/** Most output cells one pivot may hold, computed or saved; the engine's bound. */
const MAX_PIVOT_OUTPUT_CELLS = 1_000_000;

const AGGREGATION_CODES: Readonly<Record<PivotAggregation, number>> = {
  SUM: 0,
  COUNT: 1,
  AVERAGE: 2,
  MIN: 3,
  MAX: 4,
  COUNTA: 5,
  DISTINCTCOUNT: 6,
};

/** Path-qualified pivot problem; structurally a `DocumentValidationError`. */
export interface PivotIssue {
  path: string;
  code: "invalid-value" | "missing-reference" | "out-of-bounds" | "resource-limit";
  message: string;
}

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface PivotIssueSink {
  push(...issues: PivotIssue[]): number;
}

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function ownValue(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

function isIndex(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function isPivotScalar(value: unknown): value is CellScalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= MAX_PIVOT_FILTER_TEXT_LENGTH)
  );
}

function issue(
  issues: PivotIssueSink,
  path: string,
  message: string,
  code: PivotIssue["code"] = "invalid-value",
): void {
  issues.push({ path, code, message });
}

function boundedArray(
  record: PlainRecord,
  key: string,
  path: string,
  issues: PivotIssueSink,
  required: boolean,
): unknown[] | undefined {
  const value = ownValue(record, key);
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value)) {
    issue(issues, `${path}.${key}`, `${key} must be an array`);
    return undefined;
  }
  if (value.length > MAX_PIVOT_FIELD_ENTRIES) {
    issue(
      issues,
      `${path}.${key}`,
      `Pivot ${key} limit ${MAX_PIVOT_FIELD_ENTRIES} exceeded`,
      "resource-limit",
    );
    return undefined;
  }
  return value;
}

function validateFieldList(
  record: PlainRecord,
  key: "rows" | "columns",
  path: string,
  issues: PivotIssueSink,
): number[] {
  const fields = boundedArray(record, key, path, issues, true) ?? [];
  const seen = new Set<number>();
  fields.forEach((field, index) => {
    if (!isIndex(field, MAX_PIVOT_FIELD_INDEX)) {
      issue(issues, `${path}.${key}[${index}]`, "Pivot field must be a source column index");
    } else if (seen.has(field)) {
      issue(issues, `${path}.${key}[${index}]`, "Pivot field appears twice on one axis");
    } else {
      seen.add(field);
    }
  });
  return fields.filter((field): field is number => isIndex(field, MAX_PIVOT_FIELD_INDEX));
}

function validateSourceShape(value: unknown, path: string, issues: PivotIssueSink): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, "Pivot source must be an object");
    return;
  }
  const flag = ownValue(value, "invalid");
  if (flag !== undefined && flag !== true) {
    issue(issues, `${path}.invalid`, "invalid must be true when present");
  }
  const range = ownValue(value, "range");
  const table = ownValue(value, "table");
  if ((range === undefined) === (table === undefined)) {
    issue(issues, path, "Pivot source needs exactly one of range or table");
    return;
  }
  if (table !== undefined) {
    if (typeof table !== "string" || table.length === 0) {
      issue(issues, `${path}.table`, "table must be a non-empty table ID");
    }
    return;
  }
  const rangePath = `${path}.range`;
  if (!isPlainRecord(range)) {
    issue(issues, rangePath, "range must be an object");
    return;
  }
  const sheet = ownValue(range, "sheet");
  if (typeof sheet !== "string" || sheet.length === 0) {
    issue(issues, `${rangePath}.sheet`, "sheet must be a non-empty string");
  }
  const corners: { row: number; col: number }[] = [];
  for (const end of ["start", "end"]) {
    const corner = ownValue(range, end);
    const row = isPlainRecord(corner) ? ownValue(corner, "row") : undefined;
    const col = isPlainRecord(corner) ? ownValue(corner, "col") : undefined;
    if (!isIndex(row) || !isIndex(col)) {
      issue(issues, `${rangePath}.${end}`, `${end} must hold non-negative integer row and col`);
      return;
    }
    corners.push({ row, col });
  }
  const [start, finish] = corners;
  // The first range row is the header row, so the rectangle must be canonical.
  if (start && finish && (start.row > finish.row || start.col > finish.col)) {
    issue(issues, rangePath, "Pivot source range must run from top-left to bottom-right");
  }
}

function validateValueShape(value: unknown, path: string, issues: PivotIssueSink): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, "Pivot value field must be an object");
    return;
  }
  if (!isIndex(ownValue(value, "field"), MAX_PIVOT_FIELD_INDEX)) {
    issue(issues, `${path}.field`, "field must be a source column index");
  }
  const aggregation = ownValue(value, "aggregation");
  if (typeof aggregation !== "string" || !Object.hasOwn(AGGREGATION_CODES, aggregation)) {
    issue(issues, `${path}.aggregation`, "Unknown pivot aggregation");
  }
  const name = ownValue(value, "name");
  if (name !== undefined && (typeof name !== "string" || name.length > MAX_PIVOT_NAME_LENGTH)) {
    issue(issues, `${path}.name`, `name must be a string of at most ${MAX_PIVOT_NAME_LENGTH}`);
  }
}

/** Each field takes at most one filter, and all filters share one value budget. */
function validateFiltersShape(pivot: PlainRecord, path: string, issues: PivotIssueSink): void {
  let filterValues = 0;
  const filteredFields = new Set<unknown>();
  boundedArray(pivot, "filters", path, issues, false)?.forEach((entry, index) => {
    const filterPath = `${path}.filters[${index}]`;
    if (!isPlainRecord(entry)) {
      issue(issues, filterPath, "Pivot filter must be an object");
      return;
    }

    const field = ownValue(entry, "field");
    if (!isIndex(field, MAX_PIVOT_FIELD_INDEX)) {
      issue(issues, `${filterPath}.field`, "field must be a source column index");
    } else if (filteredFields.has(field)) {
      issue(issues, `${filterPath}.field`, "A field may have only one filter");
    }
    filteredFields.add(field);

    const values = ownValue(entry, "values");
    if (!Array.isArray(values)) {
      issue(issues, `${filterPath}.values`, "values must be an array");
      return;
    }
    filterValues += values.length;
    if (filterValues > MAX_PIVOT_FILTER_VALUES) {
      issue(
        issues,
        `${filterPath}.values`,
        `Pivot filter value limit ${MAX_PIVOT_FILTER_VALUES} exceeded`,
        "resource-limit",
      );
      return;
    }
    values.forEach((filterValue, valueIndex) => {
      if (!isPivotScalar(filterValue)) {
        issue(issues, `${filterPath}.values[${valueIndex}]`, "Filter value must be a cell scalar");
      }
    });
  });
}

/** A sort key must name a field that groups its axis. */
function validateSortShape(
  pivot: PlainRecord,
  path: string,
  grouped: { rows: readonly unknown[]; columns: readonly unknown[] },
  issues: PivotIssueSink,
): void {
  boundedArray(pivot, "sort", path, issues, false)?.forEach((entry, index) => {
    const sortPath = `${path}.sort[${index}]`;
    if (!isPlainRecord(entry)) {
      issue(issues, sortPath, "Pivot sort must be an object");
      return;
    }

    const axis = ownValue(entry, "axis");
    const field = ownValue(entry, "field");
    if (axis !== "rows" && axis !== "columns") {
      issue(issues, `${sortPath}.axis`, "axis must be rows or columns");
    } else if (!isIndex(field) || !grouped[axis].includes(field)) {
      issue(issues, `${sortPath}.field`, "A sort field must group the sorted axis");
    }
    if (typeof ownValue(entry, "descending") !== "boolean") {
      issue(issues, `${sortPath}.descending`, "descending must be a boolean");
    }
  });
}

/** Shape and resource checks for one untrusted pivot definition. */
export function validatePivotShape(value: unknown, path: string, issues: PivotIssueSink): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, "Pivot definition must be an object");
    return;
  }

  const id = ownValue(value, "id");
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_PIVOT_ID_LENGTH) {
    issue(issues, `${path}.id`, `id must be a non-empty string of at most ${MAX_PIVOT_ID_LENGTH}`);
  }
  const name = ownValue(value, "name");
  if (typeof name !== "string" || name.length > MAX_PIVOT_NAME_LENGTH) {
    issue(issues, `${path}.name`, `name must be a string of at most ${MAX_PIVOT_NAME_LENGTH}`);
  }

  validateSourceShape(ownValue(value, "source"), `${path}.source`, issues);

  const anchor = ownValue(value, "anchor");
  if (
    !isPlainRecord(anchor) ||
    !isIndex(ownValue(anchor, "row")) ||
    !isIndex(ownValue(anchor, "col"))
  ) {
    issue(issues, `${path}.anchor`, "anchor must hold non-negative integer row and col");
  }

  const rows = validateFieldList(value, "rows", path, issues);
  const columns = validateFieldList(value, "columns", path, issues);
  const rowFields = new Set(rows);
  columns.forEach((field, index) => {
    if (rowFields.has(field)) {
      issue(issues, `${path}.columns[${index}]`, "A field may group rows or columns, not both");
    }
  });

  boundedArray(value, "values", path, issues, true)?.forEach((entry, index) => {
    validateValueShape(entry, `${path}.values[${index}]`, issues);
  });

  validateFiltersShape(value, path, issues);
  validateSortShape(value, path, { rows, columns }, issues);

  for (const key of ["rowTotals", "columnTotals", "subtotals"]) {
    const flag = ownValue(value, key);
    if (flag !== undefined && typeof flag !== "boolean") {
      issue(issues, `${path}.${key}`, `${key} must be a boolean`);
    }
  }
  const layout = ownValue(value, "layout");
  if (layout !== undefined && layout !== "compact" && layout !== "tabular") {
    issue(issues, `${path}.layout`, "layout must be compact or tabular");
  }
  const savedOutput = ownValue(value, "savedOutput");
  if (savedOutput !== undefined) validateSavedOutput(savedOutput, `${path}.savedOutput`, issues);
}

function validateSavedOutput(value: unknown, path: string, issues: PivotIssueSink): void {
  if (!isPlainRecord(value)) {
    issue(issues, path, "savedOutput must be an object");
    return;
  }
  const rows = ownValue(value, "rows");
  const cols = ownValue(value, "cols");
  if (!isIndex(rows) || !isIndex(cols) || rows === 0 || cols === 0) {
    issue(issues, path, "savedOutput must hold positive integer rows and cols");
    return;
  }
  if (rows * cols > MAX_PIVOT_OUTPUT_CELLS) {
    issue(
      issues,
      path,
      `Pivot saved output limit ${MAX_PIVOT_OUTPUT_CELLS} cells exceeded`,
      "resource-limit",
    );
    return;
  }
  const cells = ownValue(value, "cells");
  if (!Array.isArray(cells) || cells.length !== rows * cols) {
    issue(issues, `${path}.cells`, "cells must be an array of rows * cols values");
    return;
  }
  const invalidCell = cells.findIndex((cell) => !isPivotScalar(cell));
  if (invalidCell >= 0) {
    issue(issues, `${path}.cells[${invalidCell}]`, "Saved output cell must be a cell scalar");
  }
}

/** The workbook facts a pivot's references are checked against. */
export interface PivotReferenceScope {
  sheetSize(sheet: SheetId): { rows: number; cols: number } | undefined;
  /** Table data columns, or undefined when no table has this ID. */
  tableWidth(table: string): number | undefined;
}

/** Highest field index any part of the definition references, or -1. */
function highestField(pivot: PivotDefinition): number {
  let highest = -1;
  for (const field of pivot.rows) highest = Math.max(highest, field);
  for (const field of pivot.columns) highest = Math.max(highest, field);
  for (const value of pivot.values) highest = Math.max(highest, value.field);
  for (const filter of pivot.filters ?? []) highest = Math.max(highest, filter.field);
  return highest;
}

/**
 * Reference checks for a shape-valid pivot owned by a sheet of `ownerSize`.
 * An invalid source keeps its reference verbatim, so only a live source is
 * resolved; field indices must fit a live source's width.
 */
export function validatePivotReferences(
  pivot: PivotDefinition,
  ownerSize: { rows: number; cols: number },
  scope: PivotReferenceScope,
  path: string,
  issues: PivotIssueSink,
): void {
  // Deleting every row keeps an anchor at row 0, so an empty sheet still owns it.
  if (
    pivot.anchor.row >= Math.max(ownerSize.rows, 1) ||
    pivot.anchor.col >= Math.max(ownerSize.cols, 1)
  ) {
    issue(issues, `${path}.anchor`, "Pivot anchor lies outside its sheet", "out-of-bounds");
  }
  const saved = pivot.savedOutput;
  if (
    saved &&
    (pivot.anchor.row + saved.rows > ownerSize.rows ||
      pivot.anchor.col + saved.cols > ownerSize.cols)
  ) {
    issue(
      issues,
      `${path}.savedOutput`,
      "Pivot saved output lies outside its sheet",
      "out-of-bounds",
    );
  }
  if (pivot.source.invalid) return;

  let width: number;
  if ("range" in pivot.source) {
    const range = pivot.source.range;
    const size = scope.sheetSize(range.sheet);
    if (!size) {
      issue(
        issues,
        `${path}.source.range.sheet`,
        "Pivot source sheet does not exist",
        "missing-reference",
      );
      return;
    }
    if (range.end.row >= size.rows || range.end.col >= size.cols) {
      issue(issues, `${path}.source.range`, "Pivot source lies outside its sheet", "out-of-bounds");
      return;
    }
    width = range.end.col - range.start.col + 1;
  } else {
    const tableWidth = scope.tableWidth(pivot.source.table);
    if (tableWidth === undefined) {
      issue(
        issues,
        `${path}.source.table`,
        "Pivot source table does not exist",
        "missing-reference",
      );
      return;
    }
    width = tableWidth;
  }

  if (highestField(pivot) >= width) {
    issue(issues, path, "Pivot field index lies outside its source", "out-of-bounds");
  }
}

/** Reference scope over live workbook sheets. */
export function sheetPivotScope(sheets: readonly Sheet[]): PivotReferenceScope {
  return {
    sheetSize(id) {
      const sheet = sheets.find((candidate) => candidate.id === id);
      return sheet ? { rows: sheet.rowCount, cols: sheet.columns.length } : undefined;
    },
    tableWidth(id) {
      for (const sheet of sheets) {
        const table = sheet.tables?.find((candidate) => candidate.id === id);
        if (table) return table.columns.length;
      }
      return undefined;
    },
  };
}

function cloneSource(source: PivotSource): PivotSource {
  const clone: PivotSource =
    "range" in source
      ? {
          range: {
            sheet: source.range.sheet,
            start: { row: source.range.start.row, col: source.range.start.col },
            end: { row: source.range.end.row, col: source.range.end.col },
          },
        }
      : { table: source.table };
  if (source.invalid) clone.invalid = true;
  return clone;
}

/** Deep copy holding only the defined fields of a shape-valid definition. */
export function clonePivot(pivot: PivotDefinition): PivotDefinition {
  const clone: PivotDefinition = {
    id: pivot.id,
    name: pivot.name,
    source: cloneSource(pivot.source),
    anchor: { row: pivot.anchor.row, col: pivot.anchor.col },
    rows: pivot.rows.slice(),
    columns: pivot.columns.slice(),
    values: pivot.values.map((value) => {
      const copy: PivotValueField = { field: value.field, aggregation: value.aggregation };
      if (value.name !== undefined) copy.name = value.name;
      return copy;
    }),
  };
  if (pivot.filters) {
    clone.filters = pivot.filters.map((filter) => ({
      field: filter.field,
      values: filter.values.slice(),
    }));
  }
  if (pivot.sort) clone.sort = pivot.sort.map((sort) => ({ ...sort }));
  if (pivot.rowTotals !== undefined) clone.rowTotals = pivot.rowTotals;
  if (pivot.columnTotals !== undefined) clone.columnTotals = pivot.columnTotals;
  if (pivot.subtotals !== undefined) clone.subtotals = pivot.subtotals;
  if (pivot.layout !== undefined) clone.layout = pivot.layout;
  if (pivot.savedOutput) {
    const { rows, cols, cells } = pivot.savedOutput;
    clone.savedOutput = { rows, cols, cells: cells.slice() };
  }
  return clone;
}

/** A copy of `pivot` without its saved output. */
export function withoutSavedOutput(pivot: PivotDefinition): PivotDefinition {
  const copy = { ...pivot };
  delete copy.savedOutput;
  return copy;
}

/** One row or column edit, in the coordinates before the edit. */
export interface PivotAxisEdit {
  readonly sheet: SheetId;
  readonly axis: "row" | "col";
  /** New index of an old row or column; null when the edit deletes it. */
  readonly remap: (index: number) => number | null;
  /** Where an anchor moves when the edit deletes its row or column. */
  readonly anchorFallback: number;
  /** Moves are not monotone: extrema may occur inside the original span. */
  readonly span?: (start: number, end: number) => [number, number];
}

/** Everything one document operation changes about pivot references. */
export interface PivotEditPlan {
  readonly axisEdit?: PivotAxisEdit;
  readonly removedSheet?: SheetId;
  readonly removedTables: ReadonlySet<string>;
  /** Column spans, before a column edit, of the tables on the edited sheet. */
  readonly tableColumns: ReadonlyMap<string, { start: number; end: number }>;
}

/** A pivot whose definition an operation rewrites. */
export interface PivotRewrite {
  readonly owner: SheetId;
  readonly before: PivotDefinition;
  readonly after: PivotDefinition;
}

const NO_TABLES: ReadonlySet<string> = new Set();
const NO_TABLE_COLUMNS: ReadonlyMap<string, { start: number; end: number }> = new Map();

function hasPivots(sheets: readonly Sheet[]): boolean {
  return sheets.some((sheet) => (sheet.pivots?.length ?? 0) > 0);
}

function axisPlan(
  sheet: Sheet,
  axis: "row" | "col",
  remap: (index: number) => number | null,
  anchorFallback: number,
  span?: PivotAxisEdit["span"],
): PivotEditPlan {
  const removedTables = new Set<string>();
  const tableColumns = new Map<string, { start: number; end: number }>();
  for (const table of sheet.tables ?? []) {
    const start = axis === "row" ? table.range.start.row : table.range.start.col;
    const end = axis === "row" ? table.range.end.row : table.range.end.col;
    if (!(span ? span(start, end) : remapSpan(start, end, remap))) removedTables.add(table.id);
    if (axis === "col") {
      tableColumns.set(table.id, { start: Math.min(start, end), end: Math.max(start, end) });
    }
  }
  return {
    axisEdit: { sheet: sheet.id, axis, remap, anchorFallback, span },
    removedTables,
    tableColumns,
  };
}

/** A move has three monotone segments; inspect their ends, not every source row. */
function movedSpan(from: number, count: number, to: number): NonNullable<PivotAxisEdit["span"]> {
  const cuts = [from, from + count, to < from ? to : to + count];
  return (start, end) => {
    let low = Math.min(moveIndex(start, from, count, to), moveIndex(end, from, count, to));
    let high = Math.max(moveIndex(start, from, count, to), moveIndex(end, from, count, to));
    for (const cut of cuts) {
      for (let index = cut - 1; index <= cut; index++) {
        if (index < start || index > end) continue;
        const mapped = moveIndex(index, from, count, to);
        low = Math.min(low, mapped);
        high = Math.max(high, mapped);
      }
    }
    return [low, high];
  };
}

/**
 * The pivot changes `operation` makes, computed from the workbook before it
 * runs. Null when no pivot exists or the operation cannot move a reference.
 * The store applies the result and the undo inverse restores from it, so both
 * use this one rule.
 */
export function planPivotEdit(
  operation: DocumentOp,
  sheets: readonly Sheet[],
): PivotEditPlan | null {
  // The kind check comes first, so cell edits never scan the sheets.
  switch (operation.op) {
    case "removeSheet":
    case "removeTable":
    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
      if (!hasPivots(sheets)) return null;
      break;
    default:
      return null;
  }

  if (operation.op === "removeSheet") {
    return {
      removedSheet: operation.sheet,
      removedTables: new Set(
        sheets.find((sheet) => sheet.id === operation.sheet)?.tables?.map((table) => table.id) ??
          [],
      ),
      tableColumns: NO_TABLE_COLUMNS,
    };
  }
  if (operation.op === "removeTable") {
    return { removedTables: new Set([operation.tableId]), tableColumns: NO_TABLE_COLUMNS };
  }

  const sheet = sheets.find((candidate) => candidate.id === operation.sheet);
  if (!sheet) return null;
  switch (operation.op) {
    case "addRows":
      return axisPlan(
        sheet,
        "row",
        (row) => (row >= operation.at ? row + operation.count : row),
        0,
      );
    case "removeRows": {
      const { at, count } = operation;
      return axisPlan(
        sheet,
        "row",
        (row) => (row < at ? row : row < at + count ? null : row - count),
        Math.max(0, Math.min(at, sheet.rowCount - count - 1)),
      );
    }
    case "moveRows":
      return axisPlan(
        sheet,
        "row",
        (row) => moveIndex(row, operation.from, operation.count, operation.to),
        0,
        movedSpan(operation.from, operation.count, operation.to),
      );
    case "addColumns": {
      const count = operation.columns.length;
      return axisPlan(sheet, "col", (col) => (col >= operation.at ? col + count : col), 0);
    }
    case "removeColumns": {
      const { at, count } = operation;
      return axisPlan(
        sheet,
        "col",
        (col) => (col < at ? col : col < at + count ? null : col - count),
        Math.max(0, Math.min(at, sheet.columns.length - count - 1)),
      );
    }
    default:
      return axisPlan(
        sheet,
        "col",
        (col) => moveIndex(col, operation.from, operation.count, operation.to),
        0,
        movedSpan(operation.from, operation.count, operation.to),
      );
  }
}

/** Plan for a history or rebase edit that knows only the edited index span. */
export function pivotAxisPlan(edit: PivotAxisEdit): PivotEditPlan {
  return { axisEdit: edit, removedTables: NO_TABLES, tableColumns: NO_TABLE_COLUMNS };
}

function remapFields(
  pivot: PivotDefinition,
  mapField: (field: number) => number | null,
): PivotDefinition {
  const changed =
    pivot.rows.some((field) => mapField(field) !== field) ||
    pivot.columns.some((field) => mapField(field) !== field) ||
    pivot.values.some((value) => mapField(value.field) !== value.field) ||
    (pivot.filters?.some((filter) => mapField(filter.field) !== filter.field) ?? false);
  if (!changed) return pivot;

  // A deleted source column leaves the pivot, as Excel drops a deleted field.
  const mapList = (fields: readonly number[]): number[] =>
    fields.map(mapField).filter((field): field is number => field !== null);
  const next: PivotDefinition = {
    ...pivot,
    rows: mapList(pivot.rows),
    columns: mapList(pivot.columns),
    values: pivot.values.flatMap((value): PivotValueField[] => {
      const field = mapField(value.field);
      return field === null ? [] : [{ ...value, field }];
    }),
  };
  if (pivot.filters) {
    next.filters = pivot.filters.flatMap((filter): PivotFilter[] => {
      const field = mapField(filter.field);
      return field === null ? [] : [{ ...filter, field }];
    });
  }
  if (pivot.sort) {
    next.sort = pivot.sort.flatMap((sort): PivotSort[] => {
      const field = mapField(sort.field);
      return field === null ? [] : [{ ...sort, field }];
    });
  }
  return next;
}

function invalidated(source: PivotSource): PivotSource {
  return { ...source, invalid: true };
}

/**
 * Whether `edit` keeps the `count` indices from `start` together: in order,
 * without a gap or a deletion. Saved output survives only such an edit.
 */
function keepsSpanIntact(edit: PivotAxisEdit, start: number, count: number): boolean {
  const first = edit.remap(start);
  if (first === null) return false;
  // Inserts and deletes are monotone, so the ends prove the whole span.
  if (!edit.span) return edit.remap(start + count - 1) === first + count - 1;

  // A move is not monotone: a block moved inside the span keeps its ends.
  for (let offset = 1; offset < count; offset++) {
    if (edit.remap(start + offset) !== first + offset) return false;
  }
  return true;
}

/**
 * The anchor of a pivot on the edited sheet after `edit`, and whether its
 * saved output survives the edit.
 */
function moveAnchor(
  pivot: PivotDefinition,
  edit: PivotAxisEdit,
): { anchor: PivotDefinition["anchor"]; keepsSavedOutput: boolean } {
  const old = edit.axis === "row" ? pivot.anchor.row : pivot.anchor.col;
  const remapped = edit.remap(old);
  const moved = remapped ?? edit.anchorFallback;
  // A deleted anchor needs an exact inverse even if clamping keeps its index.
  const anchor =
    moved === old && remapped !== null
      ? pivot.anchor
      : edit.axis === "row"
        ? { ...pivot.anchor, row: moved }
        : { ...pivot.anchor, col: moved };

  const saved = pivot.savedOutput;
  const keepsSavedOutput =
    !saved || keepsSpanIntact(edit, old, edit.axis === "row" ? saved.rows : saved.cols);
  return { anchor, keepsSavedOutput };
}

/**
 * A live source after `edit`, and the source-column remap a column edit
 * implies for its fields; null when the field indices stay put.
 */
function moveSource(
  source: PivotSource,
  edit: PivotAxisEdit,
  tableColumns: PivotEditPlan["tableColumns"],
): { source: PivotSource; mapField: ((field: number) => number | null) | null } {
  if (!source.invalid && "range" in source && source.range.sheet === edit.sheet) {
    const range = source.range;
    const start = edit.axis === "row" ? range.start.row : range.start.col;
    const end = edit.axis === "row" ? range.end.row : range.end.col;
    const span = edit.span ? edit.span(start, end) : remapSpan(start, end, edit.remap);
    if (!span) return { source: invalidated(source), mapField: null };

    const [newStart, newEnd] = span;
    const moved =
      newStart === start && newEnd === end
        ? source
        : {
            ...source,
            range:
              edit.axis === "row"
                ? {
                    ...range,
                    start: { ...range.start, row: newStart },
                    end: { ...range.end, row: newEnd },
                  }
                : {
                    ...range,
                    start: { ...range.start, col: newStart },
                    end: { ...range.end, col: newEnd },
                  },
          };
    const mapField =
      edit.axis === "col"
        ? (field: number) => {
            const mapped = edit.remap(start + field);
            return mapped === null ? null : mapped - newStart;
          }
        : null;
    return { source: moved, mapField };
  }

  if (!source.invalid && "table" in source && edit.axis === "col") {
    const columns = tableColumns.get(source.table);
    const span = columns
      ? edit.span
        ? edit.span(columns.start, columns.end)
        : remapSpan(columns.start, columns.end, edit.remap)
      : null;
    if (columns && span) {
      const newStart = span[0];
      const mapField = (field: number) => {
        const mapped = edit.remap(columns.start + field);
        return mapped === null ? null : mapped - newStart;
      };
      return { source, mapField };
    }
  }
  return { source, mapField: null };
}

/**
 * Rewrite one pivot owned by `owner` for `plan`. Returns the same object when
 * nothing changes. A source that disappears keeps its reference and becomes
 * invalid; an anchor whose row or column is deleted moves to the fallback.
 */
export function rebasePivot(
  pivot: PivotDefinition,
  owner: SheetId,
  plan: PivotEditPlan,
): PivotDefinition {
  const edit = plan.axisEdit;
  const { anchor, keepsSavedOutput } =
    edit && owner === edit.sheet
      ? moveAnchor(pivot, edit)
      : { anchor: pivot.anchor, keepsSavedOutput: true };
  const { source: movedSource, mapField } = edit
    ? moveSource(pivot.source, edit, plan.tableColumns)
    : { source: pivot.source, mapField: null };

  let source = movedSource;
  if (
    !source.invalid &&
    (("range" in source && source.range.sheet === plan.removedSheet) ||
      ("table" in source && plan.removedTables.has(source.table)))
  ) {
    source = invalidated(source);
  }

  let moved =
    anchor === pivot.anchor && source === pivot.source ? pivot : { ...pivot, anchor, source };
  // The saved values no longer match an output rectangle the edit cut.
  if (!keepsSavedOutput) moved = withoutSavedOutput(moved);
  return mapField && !source.invalid ? remapFields(moved, mapField) : moved;
}

/** Every pivot `plan` rewrites, in sheet order. */
export function pivotRewrites(sheets: readonly Sheet[], plan: PivotEditPlan): PivotRewrite[] {
  const rewrites: PivotRewrite[] = [];
  for (const sheet of sheets) {
    if (sheet.id === plan.removedSheet) continue;
    for (const pivot of sheet.pivots ?? []) {
      const after = rebasePivot(pivot, sheet.id, plan);
      if (after !== pivot) rewrites.push({ owner: sheet.id, before: pivot, after });
    }
  }
  return rewrites;
}

/** Store each rewrite's `after` definition in place of its pivot. */
export function applyPivotRewrites(
  sheets: readonly Sheet[],
  rewrites: readonly PivotRewrite[],
): void {
  for (const rewrite of rewrites) {
    const sheet = sheets.find((candidate) => candidate.id === rewrite.owner);
    if (!sheet?.pivots) continue;
    sheet.pivots = sheet.pivots.map((pivot) =>
      pivot.id === rewrite.before.id ? rewrite.after : pivot,
    );
  }
}

/** Owner sheet of the pivot with `id`, if any sheet holds it. */
export function pivotOwner(sheets: readonly Sheet[], id: string): Sheet | undefined {
  return sheets.find((sheet) => sheet.pivots?.some((pivot) => pivot.id === id));
}

/** Clones of the pivots on `sheet`, or on every sheet in sheet order. */
export function clonePivots(sheets: readonly Sheet[], sheet?: SheetId): PivotDefinition[] {
  const pivots: PivotDefinition[] = [];
  for (const candidate of sheets) {
    if (sheet !== undefined && candidate.id !== sheet) continue;
    for (const pivot of candidate.pivots ?? []) pivots.push(clonePivot(pivot));
  }
  return pivots;
}

/**
 * Result view of a pivot whose engine computes no pivots (the default engine,
 * or a custom store): its saved output, or `unavailable` without one.
 */
export function uncomputedPivotResult(sheet: SheetId, pivot: PivotDefinition): PivotResultView {
  const saved = pivot.savedOutput;
  return {
    status: saved ? "saved" : "unavailable",
    anchor: { sheet, row: pivot.anchor.row, col: pivot.anchor.col },
    rows: saved?.rows ?? 0,
    cols: saved?.cols ?? 0,
    headerRows: 0,
    labelCols: 0,
    cells: saved ? saved.cells.slice() : [],
  };
}

/** The rectangle `pivot.savedOutput` covers on `sheet`, or null without saved output. */
export function savedOutputRange(sheet: SheetId, pivot: PivotDefinition): Range | null {
  const saved = pivot.savedOutput;
  if (!saved) return null;
  return {
    sheet,
    start: { row: pivot.anchor.row, col: pivot.anchor.col },
    end: { row: pivot.anchor.row + saved.rows - 1, col: pivot.anchor.col + saved.cols - 1 },
  };
}

/** Source kinds in the engine payload. */
const SOURCE_RANGE = 0;
const SOURCE_TABLE = 1;
const SOURCE_INVALID = 2;
/** Marks an absent string, such as a value field without a caption. */
const NO_STRING = -1;
/**
 * Unused bound slots after a table id, and after the absent-string slot of an
 * invalid source, so every source takes the slots of a range (sheet, r0, c0,
 * r1, c1). Twins of `TABLE_SOURCE_PADDING` and `INVALID_SOURCE_PADDING` in
 * `packages/wasm/src/store/pivots.rs`.
 */
const TABLE_SOURCE_PADDING = 4;
const INVALID_SOURCE_PADDING = 4;
/** Sort axes in the engine payload; twins of the same names in `pivots.rs`. */
const SORT_ROWS = 0;
const SORT_COLUMNS = 1;
/** Filter value kinds in the engine payload. */
const FILTER_NULL = 0;
const FILTER_NUMBER = 1;
const FILTER_TEXT = 2;
const FILTER_BOOLEAN = 3;
/** Flag bits in the engine payload. */
const FLAG_ROW_TOTALS = 1;
const FLAG_COLUMN_TOTALS = 2;
const FLAG_SUBTOTALS = 4;
const FLAG_TABULAR = 8;

/** Bulk `setPivots` arguments for every pivot of one sheet. */
export interface PivotPayload {
  readonly numbers: Float64Array;
  readonly strings: string[];
}

/**
 * Encode the pivots of one sheet in the `setPivots` wire format (issue #194).
 * Defaults are resolved here so the engine never guesses. A range source on a
 * sheet without an engine handle is sent as invalid. The full engine computes
 * the output, so saved output is not sent.
 */
export function encodePivotPayload(
  pivots: readonly PivotDefinition[],
  sheetHandle: (sheet: SheetId) => number | undefined,
): PivotPayload {
  const numbers: number[] = [];
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const text = (value: string): number => {
    let index = stringIndex.get(value);
    if (index === undefined) {
      index = strings.length;
      strings.push(value);
      stringIndex.set(value, index);
    }
    return index;
  };

  for (const pivot of pivots) {
    numbers.push(text(pivot.id));

    const source = pivot.source;
    const handle =
      !source.invalid && "range" in source ? sheetHandle(source.range.sheet) : undefined;
    if (!source.invalid && "range" in source && handle !== undefined) {
      const range = source.range;
      numbers.push(
        SOURCE_RANGE,
        handle,
        range.start.row,
        range.start.col,
        range.end.row,
        range.end.col,
      );
    } else if (!source.invalid && "table" in source) {
      numbers.push(SOURCE_TABLE, text(source.table));
      for (let slot = 0; slot < TABLE_SOURCE_PADDING; slot++) numbers.push(0);
    } else {
      numbers.push(SOURCE_INVALID, NO_STRING);
      for (let slot = 0; slot < INVALID_SOURCE_PADDING; slot++) numbers.push(0);
    }

    numbers.push(pivot.anchor.row, pivot.anchor.col);
    numbers.push(pivot.rows.length, ...pivot.rows);
    numbers.push(pivot.columns.length, ...pivot.columns);
    numbers.push(pivot.values.length);
    for (const value of pivot.values) {
      numbers.push(
        value.field,
        AGGREGATION_CODES[value.aggregation],
        value.name === undefined ? NO_STRING : text(value.name),
      );
    }

    const filters = pivot.filters ?? [];
    numbers.push(filters.length);
    for (const filter of filters) {
      numbers.push(filter.field, filter.values.length);
      for (const value of filter.values) {
        if (value === null) numbers.push(FILTER_NULL, 0);
        else if (typeof value === "number") numbers.push(FILTER_NUMBER, value);
        else if (typeof value === "string") numbers.push(FILTER_TEXT, text(value));
        else numbers.push(FILTER_BOOLEAN, value ? 1 : 0);
      }
    }

    const sort = pivot.sort ?? [];
    numbers.push(sort.length);
    for (const key of sort) {
      numbers.push(
        key.axis === "rows" ? SORT_ROWS : SORT_COLUMNS,
        key.field,
        key.descending ? 1 : 0,
      );
    }

    numbers.push(
      ((pivot.rowTotals ?? true) ? FLAG_ROW_TOTALS : 0) |
        ((pivot.columnTotals ?? true) ? FLAG_COLUMN_TOTALS : 0) |
        ((pivot.subtotals ?? true) ? FLAG_SUBTOTALS : 0) |
        (pivot.layout === "tabular" ? FLAG_TABULAR : 0),
    );
  }

  return { numbers: Float64Array.from(numbers), strings };
}

/** Cell kinds in the `setSavedPivots` payload. */
const SAVED_BLANK = 0;
const SAVED_NUMBER = 1;
const SAVED_TEXT = 2;
const SAVED_BOOLEAN = 3;
/** `layout` values per saved output: anchor row, anchor column, rows, cols. */
const SAVED_LAYOUT_STRIDE = 4;

/** Bulk `setSavedPivots` arguments for every saved output of one sheet. */
export interface SavedPivotPayload {
  readonly layout: Uint32Array;
  readonly kinds: Uint8Array;
  readonly numbers: Float64Array;
  /** Text cells joined in order. */
  readonly text: string;
  /** Length of each text cell in UTF-16 code units, the unit of `string.length`. */
  readonly textLengths: Uint32Array;
}

/**
 * Encode the saved output of one sheet's pivots for the default engine,
 * which computes no pivots and shows saved output only. Pivots without saved
 * output are not sent.
 */
export function encodeSavedPivotPayload(pivots: readonly PivotDefinition[]): SavedPivotPayload {
  const saved = pivots.filter((pivot) => pivot.savedOutput !== undefined);
  const cellCount = saved.reduce(
    (total, pivot) => total + (pivot.savedOutput?.cells.length ?? 0),
    0,
  );
  const layout = new Uint32Array(saved.length * SAVED_LAYOUT_STRIDE);
  const kinds = new Uint8Array(cellCount);
  const numbers = new Float64Array(cellCount);
  const texts: string[] = [];
  const textLengths: number[] = [];
  let cell = 0;
  saved.forEach((pivot, index) => {
    const output = pivot.savedOutput;
    if (!output) return;
    layout.set(
      [pivot.anchor.row, pivot.anchor.col, output.rows, output.cols],
      index * SAVED_LAYOUT_STRIDE,
    );
    for (const value of output.cells) {
      if (value === null) kinds[cell] = SAVED_BLANK;
      else if (typeof value === "number") {
        kinds[cell] = SAVED_NUMBER;
        numbers[cell] = value;
      } else if (typeof value === "string") {
        kinds[cell] = SAVED_TEXT;
        texts.push(value);
        textLengths.push(value.length);
      } else {
        kinds[cell] = SAVED_BOOLEAN;
        numbers[cell] = value ? 1 : 0;
      }
      cell += 1;
    }
  });
  return {
    layout,
    kinds,
    numbers,
    text: texts.join(""),
    textLengths: Uint32Array.from(textLengths),
  };
}
