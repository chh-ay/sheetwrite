// What the engine computes for a dashboard. Each slicer keeps the rows whose value
// in its column is selected, and filters every pivot whose base table reaches
// the slicer's table through relationships, as an Excel slicer filters the
// PivotTables connected to it (#231). The result is what the engine computes;
// the saved pivot definitions do not change.
//
// A worksheet adds one hidden copy of each pivot that a chart reads, so the
// chart plots the pivot's leaf items without its totals (#487).

import { baseTable, relatedTables, withModelField } from "../panels/pivot-model.js";
import type { CellScalar } from "../types/cell.js";
import type {
  DashboardChartItem,
  DashboardKpiItem,
  DashboardSlicerItem,
} from "../types/dashboard.js";
import type { DataModel, TableRelationship } from "../types/data-model.js";
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
 * Row of the anchor of the first chart copy of a worksheet pivot; each next
 * copy takes the next row. The rows are below the last row of every sheet,
 * and deleting rows above them never brings them inside, so the engine
 * computes the copies without placing them in cells. Row and column edits
 * move every copy alike, so their anchors never meet.
 */
const UNPLACED_ROW = 2 ** 30;

/**
 * The copy of `pivot` that a chart reads: without subtotals or totals and
 * with one label column per row field, as an Excel PivotChart leaves totals
 * out.
 */
function chartCopy(pivot: PivotDefinition, id: string): PivotDefinition {
  return {
    ...pivot,
    id,
    layout: "tabular",
    subtotals: false,
    rowTotals: false,
    columnTotals: false,
  };
}

/** The hidden pivot that charts `item`: its chart's pivot, as the slicers filter it. */
function chartPivot(
  item: DashboardChartItem,
  sheet: Sheet,
  pivots: readonly PivotDefinition[],
): PivotDefinition | null {
  const chart = sheet.charts?.find((candidate) => candidate.id === item.chart);
  const pivot = pivots.find((candidate) => candidate.id === chart?.pivot);
  if (pivot === undefined) return null;
  return chartCopy(pivot, `chart-data-${item.id}`);
}

/**
 * The hidden pivot of a KPI card: its measure over the measure's home table,
 * with no rows or columns, filtered by every slicer that reaches that table.
 * Its output is the measure's caption over its one value.
 */
function kpiPivot(
  item: DashboardKpiItem,
  model: DataModel | undefined,
  slicers: ReturnType<typeof slicersOf>,
  tables: readonly WorkbookTable[],
): PivotDefinition | null {
  const measure = model?.measures?.find((candidate) => candidate.id === item.measure);
  const column = tables.find((table) => table.id === measure?.table)?.columns[0];
  if (measure === undefined || column === undefined) return null;
  // A model source lists at least one field; the first column of the home table is unused.
  const pivot: PivotDefinition = {
    id: `kpi-data-${item.id}`,
    name: measure.name,
    source: {
      model: { table: measure.table, fields: [{ table: measure.table, column: column.id }] },
    },
    anchor: { row: 0, col: 0 },
    rows: [],
    columns: [],
    values: [{ measure: measure.id }],
  };
  const relationships = model?.relationships ?? [];
  return slicers.reduce(
    (current, { item: slicer, values }) =>
      values === undefined ? current : sliced(current, slicer, values, tables, relationships),
    pivot,
  );
}

/** What the engine computes for a sheet, and where its hidden pivots are. */
export interface PivotViewPayload {
  /** The sheet's pivots in their order, then the hidden pivots. */
  readonly pivots: PivotDefinition[];
  /** Payload index of each hidden pivot, by the ID of the item or chart that reads it. */
  readonly hidden: ReadonlyMap<string, number>;
}

/**
 * The definitions the engine computes for the pivots of `sheet`: first its
 * pivots in their order, each with the keep-list of every slicer that
 * reaches it, then one hidden pivot per slicer that marks values with no data
 * and one per chart item and KPI card. Undefined when nothing differs from the saved
 * definitions.
 */
export function dashboardPayload(
  sheet: Sheet,
  sheets: readonly Sheet[],
  model: DataModel | undefined,
  overrides: SlicerOverrides,
): PivotViewPayload | undefined {
  const slicers = slicersOf(sheet, overrides);
  const items = sheet.dashboard?.items ?? [];
  const charts = items.filter((item): item is DashboardChartItem => item.kind === "chart");
  const kpis = items.filter((item): item is DashboardKpiItem => item.kind === "kpi");
  if (slicers.length === 0 && charts.length === 0 && kpis.length === 0) return undefined;

  const relationships = model?.relationships ?? [];

  const tables = sheets.flatMap((candidate) => candidate.tables ?? []);
  const pivots = (sheet.pivots ?? []).map((pivot) =>
    slicers.reduce(
      (current, { item, values }) =>
        values === undefined ? current : sliced(current, item, values, tables, relationships),
      pivot,
    ),
  );
  const hidden = new Map<string, number>();
  const all = [...pivots];
  const add = (id: string, pivot: PivotDefinition | null): void => {
    if (pivot === null) return;
    hidden.set(id, all.length);
    all.push(pivot);
  };
  for (const { item } of slicers) {
    if (item.itemsWithNoData !== "show")
      add(item.id, dataPivot(item, slicers, tables, relationships));
  }
  for (const item of charts) add(item.id, chartPivot(item, sheet, pivots));
  for (const item of kpis) add(item.id, kpiPivot(item, model, slicers, tables));
  return { pivots: all, hidden };
}

/**
 * The definitions the engine computes for the pivots of worksheet `sheet`:
 * its pivots in their order, then one copy of each pivot that a chart reads,
 * which the engine computes without placing it in cells. Charts over the
 * same pivot share its copy. Undefined when no chart reads a pivot.
 */
export function worksheetPayload(sheet: Sheet): PivotViewPayload | undefined {
  const pivots = sheet.pivots ?? [];
  const copies = new Map<string, number>();
  const hidden = new Map<string, number>();
  const all = [...pivots];
  for (const chart of sheet.charts ?? []) {
    const pivot = pivots.find((candidate) => candidate.id === chart.pivot);
    if (pivot === undefined) continue;

    let index = copies.get(pivot.id);
    if (index === undefined) {
      index = all.length;
      const copy = chartCopy(pivot, `chart-data-${pivot.id}`);
      all.push({ ...copy, anchor: { row: UNPLACED_ROW + copies.size, col: 0 } });
      copies.set(pivot.id, index);
    }
    hidden.set(chart.id, index);
  }
  return hidden.size === 0 ? undefined : { pivots: all, hidden };
}
