// The link between a store's dashboards and its engine (#231). The view and
// the XLSX export both read dashboard results through it, so both see the
// same slicer filters, hidden pivots and charts.

import { setPivotChartViews } from "../charts-live.js";
import { isDashboard } from "../dashboard.js";
import { compareScalars, sourceDataRange } from "../panels/pivot-model.js";
import { PIVOT_ERRORS } from "../store/data-engine.js";
import { storeEngine } from "../store/engine-registry.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartDefinition, ChartView } from "../types/chart.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardItem, DashboardSlicerItem } from "../types/dashboard.js";
import type { Store } from "../types/store.js";
import { type PivotOutputRead, pivotChartView } from "./dashboard-chart.js";
import { dashboardPayload } from "./dashboard-payload.js";

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

/** The payload index of the hidden pivot of item `itemId` on `owner`; -1 when it has none. */
export function hiddenPivotIndex(store: Store, owner: SheetId, itemId: string): number {
  const workbook = store.getWorkbook();
  const sheet = workbook.sheets.find((candidate) => candidate.id === owner);
  if (sheet === undefined) return -1;
  const payload = dashboardPayload(
    sheet,
    workbook.sheets,
    workbook.dataModel,
    slicerOverridesOf(store),
  );
  return payload?.hidden.get(itemId) ?? -1;
}

/** The output of the pivot at `index` in a dashboard's payload, or null without one. */
export function dashboardPivotOutputOf(
  store: Store,
  sheet: SheetId,
  index: number,
): PivotOutputRead | null {
  const output = storeEngine(store)?.dashboardPivotOutput(sheet, index) ?? null;
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

/** The view of a chart over a dashboard pivot: its chart item's hidden pivot. */
function dashboardChartView(store: Store, owner: SheetId, chart: ChartDefinition): ChartView {
  const sheet = store.getWorkbook().sheets.find((candidate) => candidate.id === owner);
  const item = sheet?.dashboard?.items.find(
    (candidate) => candidate.kind === "chart" && candidate.chart === chart.id,
  );
  const output =
    item === undefined
      ? null
      : dashboardPivotOutputOf(store, owner, hiddenPivotIndex(store, owner, item.id));
  const pivot = sheet?.pivots?.find((candidate) => candidate.id === chart.pivot);
  return pivotChartView(chart, output, pivot?.values.map((value) => value.numberFormat) ?? []);
}

/**
 * Let the engine compute the dashboards `dashboards` of `store` with their
 * slicer filters and hidden pivots, and let charts over their pivots resolve.
 * Call it again after a read-only slicer selection changes.
 */
export function applyDashboardPayload(store: Store, dashboards: readonly SheetId[]): void {
  setPivotChartViews(dashboardChartView);
  storeEngine(store)?.setPivotView((owner) => {
    if (!isDashboard(owner)) return undefined;
    const workbook = store.getWorkbook();
    return dashboardPayload(owner, workbook.sheets, workbook.dataModel, slicerOverridesOf(store))
      ?.pivots;
  }, dashboards);
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
  const seen = new Set<CellScalar>();
  for (let row = range?.start.row ?? 1; range !== null && row <= range.end.row; row++) {
    const address = { sheet: range.sheet, row, col: range.start.col + offset };
    const value = store.getCell(address).resolved;
    seen.add(value === "" ? null : value);
    if (seen.size >= MAX_SLICER_VALUES) break;
  }
  return [...seen].sort(compareScalars);
}
