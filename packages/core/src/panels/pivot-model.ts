// Field-list edits of a pivot definition, as plain data. Each function returns
// the next definition, which the field list commits with ONE `setPivot`.

import type { CellScalar } from "../types/cell.js";
import type { Range } from "../types/coordinates.js";
import type {
  PivotAggregation,
  PivotDefinition,
  PivotFieldType,
  PivotSource,
} from "../types/pivot.js";
import type { WorkbookTable } from "../types/table.js";

/** The four areas of the field list, in the order Excel shows them. */
export type PivotArea = "filters" | "columns" | "rows" | "values";

export const PIVOT_AREAS: readonly (readonly [PivotArea, string])[] = [
  ["filters", "Filters"],
  ["columns", "Columns"],
  ["rows", "Rows"],
  ["values", "Values"],
];

/** One entry of an area, by its position in that area's list. */
export interface PivotPlacement {
  readonly area: PivotArea;
  readonly index: number;
}

/** Excel's names for the aggregations, in the order of its value-field menu. */
export const AGGREGATION_LABELS: readonly (readonly [PivotAggregation, string])[] = [
  ["SUM", "Sum"],
  ["COUNTA", "Count"],
  ["AVERAGE", "Average"],
  ["MAX", "Max"],
  ["MIN", "Min"],
  ["COUNT", "Count Numbers"],
  ["DISTINCTCOUNT", "Distinct Count"],
];

/** Most keep-list values a filter may hold; the pivot validator's bound. */
export const MAX_FILTER_VALUES = 10_000;

/** The source fields of one area, in area order. */
export function areaFields(pivot: PivotDefinition, area: PivotArea): number[] {
  switch (area) {
    case "rows":
      return [...pivot.rows];
    case "columns":
      return [...pivot.columns];
    case "values":
      return pivot.values.map((value) => value.field);
    case "filters":
      return (pivot.filters ?? []).map((filter) => filter.field);
  }
}

/** Excel's default: numbers are summed, everything else is counted. */
export function defaultAggregation(type: PivotFieldType | undefined): PivotAggregation {
  return type === "number" ? "SUM" : "COUNTA";
}

function insertAt<T>(list: readonly T[], at: number | undefined, entry: T): T[] {
  const next = [...list];
  next.splice(at === undefined ? next.length : Math.max(0, Math.min(at, next.length)), 0, entry);
  return next;
}

function withoutIndex<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

/** Sort keys may only name fields that group their axis. */
function pruneSort(pivot: PivotDefinition): PivotDefinition {
  if (pivot.sort === undefined) return pivot;
  const sort = pivot.sort.filter((entry) =>
    (entry.axis === "rows" ? pivot.rows : pivot.columns).includes(entry.field),
  );
  return { ...pivot, sort };
}

/** What a moved field brings to its new area: a value field keeps its settings, a filter its keep-list. */
interface MovedField {
  readonly field: number;
  readonly value?: PivotDefinition["values"][number];
  readonly filterValues?: CellScalar[];
}

function removePlacement(
  pivot: PivotDefinition,
  { area, index }: PivotPlacement,
): [PivotDefinition, MovedField | null] {
  switch (area) {
    case "rows": {
      const field = pivot.rows[index];
      if (field === undefined) return [pivot, null];
      return [{ ...pivot, rows: withoutIndex(pivot.rows, index) }, { field }];
    }
    case "columns": {
      const field = pivot.columns[index];
      if (field === undefined) return [pivot, null];
      return [{ ...pivot, columns: withoutIndex(pivot.columns, index) }, { field }];
    }
    case "values": {
      const value = pivot.values[index];
      if (value === undefined) return [pivot, null];
      return [
        { ...pivot, values: withoutIndex(pivot.values, index) },
        { field: value.field, value },
      ];
    }
    case "filters": {
      const filters = pivot.filters ?? [];
      const filter = filters[index];
      if (filter === undefined) return [pivot, null];
      return [
        { ...pivot, filters: withoutIndex(filters, index) },
        { field: filter.field, filterValues: filter.values },
      ];
    }
  }
}

/** The facts about the moved field that a new placement needs. */
export interface FieldFacts {
  /** Type of the field, which picks the default aggregation. */
  readonly type: PivotFieldType | undefined;
  /** Distinct values of the field, for a new filter that keeps every row. */
  readonly distinctValues: () => CellScalar[];
}

/**
 * Put `field` into `to` at index `at` (the end when omitted). With `from`, the
 * entry leaves its old place first, so a move inside one area reorders it.
 * A field groups at most one axis, so a field moved to Rows leaves Columns
 * and the other way around. A field has at most one filter.
 */
export function placeField(
  pivot: PivotDefinition,
  field: number,
  to: PivotArea,
  facts: FieldFacts,
  from: PivotPlacement | null = null,
  at?: number,
): PivotDefinition {
  let next = pivot;
  let moved: MovedField = { field };
  if (from !== null) {
    const [removed, entry] = removePlacement(pivot, from);
    if (entry === null) return pivot;
    next = removed;
    moved = entry;
  }

  switch (to) {
    case "rows":
    case "columns": {
      const rows = next.rows.filter((candidate) => candidate !== field);
      const columns = next.columns.filter((candidate) => candidate !== field);
      next =
        to === "rows"
          ? { ...next, rows: insertAt(rows, at, field), columns }
          : { ...next, rows, columns: insertAt(columns, at, field) };
      break;
    }
    case "values": {
      const value = moved.value ?? { field, aggregation: defaultAggregation(facts.type) };
      next = { ...next, values: insertAt(next.values, at, value) };
      break;
    }
    case "filters": {
      const filters = (next.filters ?? []).filter((filter) => filter.field !== field);
      const values = moved.filterValues ?? facts.distinctValues();
      next = { ...next, filters: insertAt(filters, at, { field, values }) };
      break;
    }
  }
  return pruneSort(next);
}

/** Remove one entry from its area. */
export function removeField(pivot: PivotDefinition, placement: PivotPlacement): PivotDefinition {
  const [next, entry] = removePlacement(pivot, placement);
  return entry === null ? pivot : pruneSort(next);
}

/** Move one entry up (`-1`) or down (`1`) inside its area; the ends do not wrap. */
export function shiftField(
  pivot: PivotDefinition,
  placement: PivotPlacement,
  step: -1 | 1,
  facts: FieldFacts,
): PivotDefinition {
  const fields = areaFields(pivot, placement.area);
  const field = fields[placement.index];
  const target = placement.index + step;
  if (field === undefined || target < 0 || target >= fields.length) return pivot;
  return placeField(pivot, field, placement.area, facts, placement, target);
}

export function setAggregation(
  pivot: PivotDefinition,
  index: number,
  aggregation: PivotAggregation,
): PivotDefinition {
  return {
    ...pivot,
    values: pivot.values.map((value, position) =>
      position === index ? { ...value, aggregation } : value,
    ),
  };
}

/** Ascending order is the default, so only a descending field keeps a sort key. */
export function setSortOrder(
  pivot: PivotDefinition,
  axis: "rows" | "columns",
  field: number,
  descending: boolean,
): PivotDefinition {
  const sort = (pivot.sort ?? []).filter((entry) => entry.axis !== axis || entry.field !== field);
  if (descending) sort.push({ axis, field, descending });
  return { ...pivot, sort };
}

export function isDescending(
  pivot: PivotDefinition,
  axis: "rows" | "columns",
  field: number,
): boolean {
  return (pivot.sort ?? []).some(
    (entry) => entry.axis === axis && entry.field === field && entry.descending,
  );
}

/** Replace the keep-list of the filter at `index`. */
export function setFilterValues(
  pivot: PivotDefinition,
  index: number,
  values: CellScalar[],
): PivotDefinition {
  return {
    ...pivot,
    filters: (pivot.filters ?? []).map((filter, position) =>
      position === index ? { ...filter, values } : filter,
    ),
  };
}

/**
 * The source of a new pivot: the table that holds the whole selection, else
 * the selection itself, whose first row names the fields.
 */
export function pivotSourceFor(range: Range, tables: readonly WorkbookTable[]): PivotSource {
  const table = tables.find(
    (candidate) =>
      candidate.range.sheet === range.sheet &&
      candidate.range.start.row <= range.start.row &&
      candidate.range.start.col <= range.start.col &&
      candidate.range.end.row >= range.end.row &&
      candidate.range.end.col >= range.end.col,
  );
  return table === undefined ? { range } : { table: table.id };
}

/** The rectangle of data rows a source reads, without header and totals rows. */
export function sourceDataRange(
  source: PivotSource,
  tables: readonly WorkbookTable[],
): Range | null {
  if ("range" in source) {
    const { range } = source;
    if (range.end.row <= range.start.row) return null;
    return { ...range, start: { row: range.start.row + 1, col: range.start.col } };
  }

  const table = tables.find((candidate) => candidate.id === source.table);
  if (table === undefined) return null;
  const first = table.range.start.row + (table.headerRow ? 1 : 0);
  const last = table.range.end.row - (table.totalsRow ? 1 : 0);
  if (last < first) return null;
  return {
    ...table.range,
    start: { row: first, col: table.range.start.col },
    end: { row: last, col: table.range.end.col },
  };
}

/** The first `PivotTableN` name and `pivot-N` ID that no pivot in the workbook uses. */
export function nextPivotIdentity(pivots: readonly PivotDefinition[]): {
  id: string;
  name: string;
} {
  const ids = new Set(pivots.map((pivot) => pivot.id));
  const names = new Set(pivots.map((pivot) => pivot.name));
  let number = pivots.length + 1;
  while (ids.has(`pivot-${number}`) || names.has(`PivotTable${number}`)) number += 1;
  return { id: `pivot-${number}`, name: `PivotTable${number}` };
}
