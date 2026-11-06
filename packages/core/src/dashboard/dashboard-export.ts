// The static content of dashboards and worksheet pivots for an XLSX export
// (#231, #495). Excel has no dashboard sheet, so the export writes each item's
// current values: what the dashboard shows, with its slicer filters. A
// worksheet pivot that the export cannot write natively also writes its
// current output as cells, as Excel files carry every pivot's output. Loaded
// only for an export of a workbook with a dashboard or a pivot.

import { resolveChartView } from "../charts-live.js";
import { isDashboard } from "../dashboard.js";
import type { SheetwriteStore } from "../store.js";
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

/** A computed pivot output: cells in row-major order and its layout counts. */
interface PivotOutputCells {
  readonly cells: readonly CellScalar[];
  readonly rows: number;
  readonly cols: number;
  readonly headerRows: number;
  readonly labelCols: number;
}

/**
 * The rows of `output` and the number format of each cell: value cells take
 * their value field's format (data columns cycle through the value fields),
 * labels and headers use General.
 */
function pivotOutputContent(
  output: PivotOutputCells,
  formats: readonly (string | null)[],
): Pick<DashboardItemExport, "cells" | "numberFormats"> {
  const cells: CellScalar[][] = [];
  const numberFormats: (string | null)[][] = [];
  for (let row = 0; row < output.rows; row++) {
    cells.push(output.cells.slice(row * output.cols, (row + 1) * output.cols));
    numberFormats.push(
      Array.from({ length: output.cols }, (_, col) => {
        const value = row >= output.headerRows && col >= output.labelCols;
        return value ? (formats[(col - output.labelCols) % formats.length] ?? null) : null;
      }),
    );
  }
  return { cells, numberFormats };
}

/**
 * The current output of each worksheet pivot that the engine computed, by
 * sheet; each item's `id` is a pivot ID and its cells start at the pivot's
 * anchor. A pivot with an error or no output is left out.
 */
export function worksheetPivotExports(store: SheetwriteStore): DashboardExport[] {
  const exports: DashboardExport[] = [];
  for (const sheet of store.getWorkbook().sheets) {
    if (isDashboard(sheet) || !sheet.pivots?.length) continue;
    const items: DashboardItemExport[] = [];
    for (const pivot of sheet.pivots) {
      const result = store.getPivotResult(sheet.id, pivot.id);
      if (result?.status !== "ok" || result.cells.length === 0) continue;
      const formats = pivot.values.map((value) => value.numberFormat ?? null);
      items.push({ id: pivot.id, ...pivotOutputContent(result, formats) });
    }
    if (items.length > 0) exports.push({ sheet: sheet.id, items });
  }
  return exports;
}
