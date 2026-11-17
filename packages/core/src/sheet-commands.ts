// Excel's sheet commands whose code loads on first use, as one chunk: copying
// a sheet, the sheet menu's Move or Copy dialog and Tab Color palette, and the
// keys that switch sheets. Grid loads it through `loadCommand`, so keys pressed
// meanwhile wait for it.

import type { DocumentController } from "./document-controller.js";
import { planSheetCopy } from "./sheet-copy.js";
import type { SheetId } from "./types/coordinates.js";
import type { Workbook } from "./types/document.js";
import type { Grid, KeyboardAction, SheetLifecycleResult } from "./types/grid.js";

export { openTabPanel } from "./sheet-tab-panels.js";

/** The keys that switch sheets. */
export type SheetKey = Extract<KeyboardAction, "nextSheet" | "previousSheet">;

/** Copy sheet `id` of `workbook` in one undo step; null when there is no such sheet. */
export function copySheet(
  document: DocumentController,
  workbook: Workbook,
  id: SheetId,
  options: { index?: number; name?: string },
): SheetLifecycleResult | null {
  const plan = planSheetCopy(workbook, (sheet) => document.snapshotSheet(sheet), id, options);
  return plan && { ...document.commit(plan.operations, "structure"), sheet: plan.sheet };
}

/**
 * Excel's Ctrl+PageDown and Ctrl+PageUp: activate the next or previous
 * visible sheet. The first and last sheets stay.
 */
export function stepSheet(grid: Grid, key: SheetKey): void {
  const visible = grid.store
    .getWorkbook()
    .sheets.filter((sheet) => (sheet.visibility ?? "visible") === "visible");
  const index = visible.findIndex((sheet) => sheet.id === grid.getActiveSheet());
  const next = index < 0 ? undefined : visible[index + (key === "nextSheet" ? 1 : -1)];
  if (next) grid.setActiveSheet(next.id);
}
