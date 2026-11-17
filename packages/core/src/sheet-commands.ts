// Excel's keys that switch sheets. Copying a sheet is `Grid.copySheet`; the
// sheet menu's Move or Copy dialog and Tab Color palette are in
// `sheet-tab-panels.ts`, which loads on first use.

import type { Grid, KeyboardAction } from "./types/grid.js";

/** The keys that switch sheets. */
export type SheetKey = Extract<KeyboardAction, "nextSheet" | "previousSheet">;

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
