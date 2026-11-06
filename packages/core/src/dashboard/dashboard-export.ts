// The static content of dashboards and the values of charts over pivots for
// an XLSX export (#231, #487). Excel has no dashboard sheet, so the export
// writes each item's current values: what the dashboard shows, with its
// slicer filters. A chart over a pivot is written with the values it plots.
// Loaded only for workbooks with a dashboard or a chart over a pivot.

import { resolveChartView, setPivotChartViews } from "../charts-live.js";
import { isDashboard } from "../dashboard.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartView } from "../types/chart.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardExport, DashboardItem, DashboardItemExport } from "../types/dashboard.js";
import type { Store } from "../types/store.js";
import {
  applyPivotViews,
  dashboardItemTitle,
  dashboardsOf,
  hiddenPivotIndex,
  pivotChartViewOf,
  pivotOutputOf,
  slicerOverridesOf,
  slicerValuesOf,
} from "./dashboard-engine.js";
import { slicerSelection } from "./dashboard-payload.js";

/** A caption row over value rows that use General. */
function captioned(
  caption: string,
  rows: readonly (readonly CellScalar[])[],
): DashboardItemExport["cells"] {
  return [[caption], ...rows];
}

/** General for every cell of `cells`. */
function generalFormats(cells: DashboardItemExport["cells"]): (string | null)[][] {
  return cells.map((row) => row.map(() => null));
}

/** The pivot result under its name, with each value field's number format. */
function pivotExport(store: Store, sheet: SheetId, item: DashboardItem & { kind: "pivot" }) {
  const owner = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
  const index = owner?.pivots?.findIndex((pivot) => pivot.id === item.pivot) ?? -1;
  const formats = owner?.pivots?.[index]?.values.map((value) => value.numberFormat ?? null) ?? [];
  const output = pivotOutputOf(store, sheet, index);
  const rows: CellScalar[][] = [];
  const rowFormats: (string | null)[][] = [];
  for (let row = 0; output !== null && row < output.rows; row++) {
    rows.push(output.cells.slice(row * output.cols, (row + 1) * output.cols));
    rowFormats.push(
      Array.from({ length: output.cols }, (_, col) => {
        const value = row >= output.headerRows && col >= output.labelCols;
        return value ? (formats[(col - output.labelCols) % formats.length] ?? null) : null;
      }),
    );
  }
  const caption = dashboardItemTitle(store, sheet, item);
  return { cells: captioned(caption, rows), numberFormats: [[null], ...rowFormats] };
}

/** The static content of one item. */
function itemExport(store: Store, sheet: SheetId, item: DashboardItem): DashboardItemExport {
  const caption = dashboardItemTitle(store, sheet, item);
  if (item.kind === "pivot") return { id: item.id, ...pivotExport(store, sheet, item) };
  if (item.kind === "chart") {
    const chart = resolveChartView(store, sheet, item.chart) ?? undefined;
    return { id: item.id, cells: [], numberFormats: [], ...(chart ? { chart } : {}) };
  }
  if (item.kind === "kpi") {
    const output = pivotOutputOf(store, sheet, hiddenPivotIndex(store, sheet, item.id));
    const value = output?.cells.at(-1) ?? null;
    return {
      id: item.id,
      cells: captioned(caption, [[value]]),
      numberFormats: [[null], [item.numberFormat ?? null]],
    };
  }
  // A slicer lists the values it keeps; with no selection it keeps every value.
  const kept = slicerSelection(item, slicerOverridesOf(store)) ?? slicerValuesOf(store, item) ?? [];
  const cells = captioned(
    caption,
    kept.map((value) => [value]),
  );
  return { id: item.id, cells, numberFormats: generalFormats(cells) };
}

/** What an XLSX export writes from the pivot views of a store. */
interface PivotViewExports {
  /** The static content of every dashboard. */
  readonly dashboards: DashboardExport[];
  /** The resolved view of each worksheet chart over a pivot, by sheet and chart ID. */
  readonly pivotCharts: Map<SheetId, Map<string, ChartView>>;
}

/**
 * The static content of every dashboard of `store`, with the slicer filters
 * applied, and the view of every worksheet chart over a pivot. The engine
 * computes the pivot views first, so the values match the view even if no
 * dashboard or chart has been shown.
 */
export function pivotViewExports(store: Store): PivotViewExports {
  const dashboards = dashboardsOf(store);
  applyPivotViews(store, dashboards);
  setPivotChartViews(store, pivotChartViewOf);

  const pivotCharts = new Map<SheetId, Map<string, ChartView>>();
  for (const sheet of store.getWorkbook().sheets) {
    if (isDashboard(sheet)) continue;
    for (const chart of sheet.charts ?? []) {
      if (chart.pivot === undefined) continue;
      const view = resolveChartView(store, sheet.id, chart.id);
      if (view === null) continue;
      let views = pivotCharts.get(sheet.id);
      if (views === undefined) {
        views = new Map();
        pivotCharts.set(sheet.id, views);
      }
      views.set(chart.id, view);
    }
  }

  return {
    dashboards: dashboards.map((sheet) => {
      const owner = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
      const items = owner?.dashboard?.items ?? [];
      return { sheet, items: items.map((item) => itemExport(store, sheet, item)) };
    }),
    pivotCharts,
  };
}
