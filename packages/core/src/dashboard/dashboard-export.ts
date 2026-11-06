// The static content of dashboards for an XLSX export (#231). Excel has no
// dashboard sheet, so the export writes each item's current values: what the
// dashboard shows, with its slicer filters. Loaded only for workbooks with a
// dashboard.

import { resolveChartView } from "../charts-live.js";
import type { CellScalar } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardExport, DashboardItem, DashboardItemExport } from "../types/dashboard.js";
import type { Store } from "../types/store.js";
import {
  applyDashboardPayload,
  dashboardItemTitle,
  dashboardPivotOutputOf,
  dashboardsOf,
  hiddenPivotIndex,
  slicerOverridesOf,
  slicerValuesOf,
} from "./dashboard-engine.js";
import { pivotOutputContent } from "../pivot-export.js";
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
  const output = dashboardPivotOutputOf(store, sheet, index);
  const content =
    output === null ? { cells: [], numberFormats: [] } : pivotOutputContent(output, formats);
  const caption = dashboardItemTitle(store, sheet, item);
  return {
    cells: captioned(caption, content.cells),
    numberFormats: [[null], ...content.numberFormats],
  };
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
    const output = dashboardPivotOutputOf(store, sheet, hiddenPivotIndex(store, sheet, item.id));
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

/**
 * The static content of every dashboard of `store`, with the slicer filters
 * applied. The engine computes the dashboards first, so the values match the
 * view even if no dashboard has been shown.
 */
export function dashboardExports(store: Store): DashboardExport[] {
  const dashboards = dashboardsOf(store);
  applyDashboardPayload(store, dashboards);
  return dashboards.map((sheet) => {
    const owner = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    const items = owner?.dashboard?.items ?? [];
    return { sheet, items: items.map((item) => itemExport(store, sheet, item)) };
  });
}
