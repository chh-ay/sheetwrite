// The current output of pivots for an XLSX export. Excel files carry every
// pivot's output as cell values, so the export writes them for a pivot it
// cannot write as a native pivot, such as a pivot over the data model. Only
// the store's engine can compute them; the module loads with an export.

import { isDashboard } from "./dashboard.js";
import type { SheetwriteStore } from "./store.js";
import type { CellScalar } from "./types/cell.js";
import type { DashboardExport, DashboardItemExport } from "./types/dashboard.js";

/** A computed pivot output: cells in row-major order and its layout counts. */
export interface PivotOutputCells {
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
export function pivotOutputContent(
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
