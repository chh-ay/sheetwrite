// The link between a store's pivot views and its engine (#231, #487). The
// dashboard view, the charts over pivots and the XLSX export all read pivot
// results through it, so they see the same slicer filters and hidden pivots.

import { isDashboard } from "../dashboard.js";
import { scanColumnValues } from "../data-window-reads.js";
import { compareScalars, sourceDataRange } from "../panels/pivot-model.js";
import { PIVOT_ERRORS } from "../store/data-engine.js";
import { storeEngine } from "../store/engine-registry.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartDefinition, ChartView } from "../types/chart.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardItem, DashboardSlicerItem } from "../types/dashboard.js";
import type { Sheet } from "../types/document.js";
import type { Store } from "../types/store.js";
import { type PivotOutputRead, pivotChartView } from "./dashboard-chart.js";
import { dashboardPayload, type PivotViewPayload, worksheetPayload } from "./dashboard-payload.js";

/** Most values one slicer lists; more would not fit a box and would read every row. */
const MAX_SLICER_VALUES = 1_000;

/**
 * Slicer selections of read-only viewers, by item ID; null keeps every value.
 * They belong to the store because its engine computes one result per pivot.
 */
const viewSelections = new WeakMap<Store, Map<string, CellScalar[] | null>>();

/** The read-only slicer selections of `store`, which a read-only view changes in place. */
export function slicerOverridesOf(store: Store): Map<string, CellScalar[] | null> {
 let overrides = viewSelections.get(store);
 if (overrides === undefined) {
  overrides = new Map();
  viewSelections.set(store, overrides);
 }
 return overrides;
}

/** What the engine computes for `sheet`: a dashboard's slicers and items, or a worksheet's chart copies. */
function payloadOf(store: Store, sheet: Sheet): PivotViewPayload | undefined {
 if (!isDashboard(sheet)) return worksheetPayload(sheet);
 const workbook = store.getWorkbook();
 return dashboardPayload(sheet, workbook.sheets, workbook.dataModel, slicerOverridesOf(store));
}

/**
 * The payload index of the hidden pivot that `id` reads on `owner`: a
 * dashboard item, or a worksheet chart. -1 when it reads none.
 */
export function hiddenPivotIndex(store: Store, owner: SheetId, id: string): number {
 const sheet = store.getWorkbook().sheets.find((candidate) => candidate.id === owner);
 if (sheet === undefined) return -1;
 return payloadOf(store, sheet)?.hidden.get(id) ?? -1;
}

/** The output of the pivot at `index` in a sheet's payload, or null without one. */
export function pivotOutputOf(store: Store, sheet: SheetId, index: number): PivotOutputRead | null {
 const output = storeEngine(store)?.pivotOutputCells(sheet, index) ?? null;
 if (output === null) return null;
 try {
  const kinds = output.kinds();
  const numbers = output.numbers();
  const texts = output.texts();
  const [rows = 0, cols = 0, headerRows = 0, labelCols = 0] = output.layout();
  let text = 0;
  const cells = Array.from(kinds, (kind, cell): CellScalar => {
   const number = numbers[cell] ?? 0;
   if (kind === 1) return number;
   if (kind === 2) return texts[text++] ?? "";
   if (kind === 3) return number !== 0;
   if (kind === 4) return PIVOT_ERRORS[number] ?? "#VALUE!";
   return null;
  });
  return { cells, rows, cols, headerRows, labelCols };
 } finally {
  output.free();
 }
}

/**
 * The view of a chart over a pivot. On a dashboard it reads the hidden pivot
 * of its chart item; on a worksheet, the chart's copy of the pivot. Callers
 * pass it to `setPivotChartViews` after `applyPivotViews`.
 */
export function pivotChartViewOf(store: Store, owner: SheetId, chart: ChartDefinition): ChartView {
 const sheet = store.getWorkbook().sheets.find((candidate) => candidate.id === owner);
 const reader = isDashboard(sheet)
  ? sheet?.dashboard?.items.find((item) => item.kind === "chart" && item.chart === chart.id)?.id
  : chart.id;
 const output =
  reader === undefined
   ? null
   : pivotOutputOf(store, owner, hiddenPivotIndex(store, owner, reader));
 const pivot = sheet?.pivots?.find((candidate) => candidate.id === chart.pivot);
 return pivotChartView(chart, output, pivot?.values.map((value) => value.numberFormat) ?? []);
}

/**
 * Let the engine of `store` compute the pivot views of `dashboards`, with
 * their slicer filters and hidden pivots, and of every sheet whose charts
 * read a pivot. Call it again after a read-only slicer selection changes.
 */
export function applyPivotViews(store: Store, dashboards: readonly SheetId[]): void {
 const sheets = new Set(dashboards);
 for (const sheet of store.getWorkbook().sheets) {
  if (sheet.charts?.some((chart) => chart.pivot !== undefined)) sheets.add(sheet.id);
 }
 storeEngine(store)?.setPivotView((owner) => payloadOf(store, owner)?.pivots, [...sheets]);
}

/** The IDs of the dashboard sheets of `store`. */
export function dashboardsOf(store: Store): SheetId[] {
 return store
  .getWorkbook()
  .sheets.filter(isDashboard)
  .map((sheet) => sheet.id);
}

/** The chart `id` of dashboard `sheet`, or undefined. */
export function chartOf(store: Store, sheet: SheetId, id: string): ChartDefinition | undefined {
 const owner = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
 return owner?.charts?.find((chart) => chart.id === id);
}

/**
 * The caption of an item on dashboard `sheet`: the pivot name, the chart
 * title, the KPI title or measure name, or the slicer title or column name.
 */
export function dashboardItemTitle(store: Store, sheet: SheetId, item: DashboardItem): string {
 const workbook = store.getWorkbook();
 if (item.kind === "pivot") {
  const owner = workbook.sheets.find((candidate) => candidate.id === sheet);
  return owner?.pivots?.find((pivot) => pivot.id === item.pivot)?.name ?? item.pivot;
 }
 if (item.kind === "chart") return chartOf(store, sheet, item.chart)?.title ?? "Chart";
 if (item.title !== undefined) return item.title;
 if (item.kind === "kpi") {
  const measures = workbook.dataModel?.measures ?? [];
  return measures.find((measure) => measure.id === item.measure)?.name ?? "#REF!";
 }
 const table = workbook.sheets
  .flatMap((owner) => owner.tables ?? [])
  .find((candidate) => candidate.id === item.field.table);
 return table?.columns.find((column) => column.id === item.field.column)?.name ?? "#REF!";
}

/** Distinct values of the slicer's column, sorted as filter lists are; null when it is missing. */
export function slicerValuesOf(store: Store, item: DashboardSlicerItem): CellScalar[] | null {
 const tables = store.getWorkbook().sheets.flatMap((sheet) => sheet.tables ?? []);
 const table = tables.find((candidate) => candidate.id === item.field.table);
 const offset = table?.columns.findIndex((column) => column.id === item.field.column) ?? -1;
 if (table === undefined || offset < 0) return null;

 const range = sourceDataRange({ table: table.id }, tables);
 if (range === null) return [];

 const seen = new Set<CellScalar>();
 const span = {
  sheet: range.sheet,
  col: range.start.col + offset,
  startRow: range.start.row,
  endRow: range.end.row,
 };
 scanColumnValues(store, span, (value) => {
  seen.add(value === "" ? null : value);
  return seen.size < MAX_SLICER_VALUES;
 });
 return [...seen].sort(compareScalars);
}
