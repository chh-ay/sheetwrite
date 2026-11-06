// The filter context of a dashboard: each slicer keeps the rows whose value
// in its column is selected, and filters every pivot whose base table reaches
// the slicer's table through relationships, as an Excel slicer filters the
// PivotTables connected to it (#231). The result is what the engine computes;
// the saved pivot definitions do not change.

import { baseTable, relatedTables, withModelField } from "../panels/pivot-model.js";
import type { CellScalar } from "../types/cell.js";
import type { DashboardSlicerItem } from "../types/dashboard.js";
import type { TableRelationship } from "../types/data-model.js";
import type { Sheet } from "../types/document.js";
import type { PivotDefinition, PivotFilter } from "../types/pivot.js";
import type { WorkbookTable } from "../types/table.js";

/** Slicer selections that hold only in one view, by item ID; null keeps every value. */
export type SlicerOverrides = ReadonlyMap<string, readonly CellScalar[] | null>;

/** The values a slicer keeps in this view: its view selection, else its saved one. */
export function slicerSelection(
  item: DashboardSlicerItem,
  overrides: SlicerOverrides,
): readonly CellScalar[] | undefined {
  const override = overrides.get(item.id);
  if (override === null) return undefined;
  return override ?? item.selected;
}

/** `filters` with `values` kept on `field`: both keep-lists when the field has one. */
function withFilter(
  filters: readonly PivotFilter[],
  field: number,
  values: readonly CellScalar[],
): PivotFilter[] {
  const current = filters.find((filter) => filter.field === field);
  if (current === undefined) return [...filters, { field, values: [...values] }];
  const kept = current.values.filter((value) => values.includes(value));
  return filters.map((filter) => (filter === current ? { field, values: kept } : filter));
}

/** `pivot` with one slicer's keep-list, or `pivot` when the slicer's table is out of its reach. */
function sliced(
  pivot: PivotDefinition,
  slicer: DashboardSlicerItem,
  values: readonly CellScalar[],
  tables: readonly WorkbookTable[],
  relationships: readonly TableRelationship[],
): PivotDefinition {
  const base = baseTable(pivot.source);
  if (base === undefined) return pivot;
  const { table, column } = slicer.field;

  // A table pivot filters its own column by its index; a related column needs a model field.
  if ("table" in pivot.source && table === base) {
    const field = tables
      .find((candidate) => candidate.id === base)
      ?.columns.findIndex((candidate) => candidate.id === column);
    if (field === undefined || field < 0) return pivot;
    return { ...pivot, filters: withFilter(pivot.filters ?? [], field, values) };
  }
  const reached =
    table === base || relatedTables(base, tables, relationships).some((t) => t.id === table);
  const added = reached ? withModelField(pivot, tables, slicer.field) : null;
  if (added === null) return pivot;
  return {
    ...added.pivot,
    filters: withFilter(added.pivot.filters ?? [], added.field, values),
  };
}

/**
 * The definitions the engine computes for the pivots of `sheet`, in their
 * order: each with the keep-list of every slicer that reaches it. Undefined
 * when no slicer of the sheet keeps a selection, so the saved ones apply.
 */
export function slicedPivots(
  sheet: Sheet,
  sheets: readonly Sheet[],
  relationships: readonly TableRelationship[],
  overrides: SlicerOverrides,
): PivotDefinition[] | undefined {
  const slicers = (sheet.dashboard?.items ?? []).flatMap((item) => {
    if (item.kind !== "slicer") return [];
    const values = slicerSelection(item, overrides);
    return values === undefined ? [] : [{ item, values }];
  });
  if (slicers.length === 0 || !sheet.pivots?.length) return undefined;

  const tables = sheets.flatMap((candidate) => candidate.tables ?? []);
  return sheet.pivots.map((pivot) =>
    slicers.reduce(
      (current, { item, values }) => sliced(current, item, values, tables, relationships),
      pivot,
    ),
  );
}
