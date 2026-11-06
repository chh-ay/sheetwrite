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

/** The slicers of `sheet` in item order, with the values each keeps in this view. */
function slicersOf(sheet: Sheet, overrides: SlicerOverrides) {
  return (sheet.dashboard?.items ?? []).flatMap((item) =>
    item.kind === "slicer" ? [{ item, values: slicerSelection(item, overrides) }] : [],
  );
}

/**
 * The hidden pivot that lists the values of `slicer` that some row of its
 * table has under the other slicers: its column on rows, no values and no
 * totals. A value missing from its labels has no data, as Excel's slicer
 * cross filtering shows ([MS-XLSX] 2.3.2.1.7).
 */
function dataPivot(
  slicer: DashboardSlicerItem,
  others: readonly { item: DashboardSlicerItem; values: readonly CellScalar[] | undefined }[],
  tables: readonly WorkbookTable[],
  relationships: readonly TableRelationship[],
): PivotDefinition | null {
  const table = tables.find((candidate) => candidate.id === slicer.field.table);
  const field = table?.columns.findIndex((column) => column.id === slicer.field.column) ?? -1;
  if (table === undefined || field < 0) return null;
  const base: PivotDefinition = {
    id: `slicer-data-${slicer.id}`,
    name: slicer.id,
    source: { table: table.id },
    anchor: { row: 0, col: 0 },
    rows: [field],
    columns: [],
    values: [],
    rowTotals: false,
    columnTotals: false,
  };
  return others.reduce(
    (current, { item, values }) =>
      values === undefined || item.id === slicer.id
        ? current
        : sliced(current, item, values, tables, relationships),
    base,
  );
}

/**
 * The definitions the engine computes for the pivots of `sheet`: first its
 * pivots in their order, each with the keep-list of every slicer that reaches
 * it, then one hidden pivot per slicer that marks values with no data.
 * Undefined when nothing differs from the saved definitions.
 */
export function slicedPivots(
  sheet: Sheet,
  sheets: readonly Sheet[],
  relationships: readonly TableRelationship[],
  overrides: SlicerOverrides,
): PivotDefinition[] | undefined {
  const slicers = slicersOf(sheet, overrides);
  if (slicers.length === 0) return undefined;

  const tables = sheets.flatMap((candidate) => candidate.tables ?? []);
  const pivots = (sheet.pivots ?? []).map((pivot) =>
    slicers.reduce(
      (current, { item, values }) =>
        values === undefined ? current : sliced(current, item, values, tables, relationships),
      pivot,
    ),
  );
  const hidden = slicers.flatMap(({ item }) => {
    if (item.itemsWithNoData === "show") return [];
    const pivot = dataPivot(item, slicers, tables, relationships);
    return pivot === null ? [] : [pivot];
  });
  return [...pivots, ...hidden];
}

/**
 * The payload index of the hidden pivot of `slicer` on `sheet`, in the
 * order `slicedPivots` adds them; -1 when it has none.
 */
export function dataPivotIndex(sheet: Sheet, slicer: DashboardSlicerItem, sheets: readonly Sheet[]): number {
  const tables = sheets.flatMap((candidate) => candidate.tables ?? []);
  let index = sheet.pivots?.length ?? 0;
  for (const item of sheet.dashboard?.items ?? []) {
    if (item.kind !== "slicer" || item.itemsWithNoData === "show") continue;
    const table = tables.find((candidate) => candidate.id === item.field.table);
    if (!table?.columns.some((column) => column.id === item.field.column)) continue;
    if (item.id === slicer.id) return index;
    index += 1;
  }
  return -1;
}
