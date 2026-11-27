// Excel's sheet keys and the empty sheet that its Insert adds. Copying a sheet
// is `Grid.copySheet`; the sheet menu's Move or Copy dialog and Tab Color
// palette are in `sheet-tab-panels.ts`, which loads on first use.

import { colToA1 } from "./a1.js";
import { sheetNameKey } from "./name-key.js";
import type { Column } from "./types/cell.js";
import type { SheetSnapshot } from "./types/document.js";
import type { Grid, KeyboardAction, SheetLifecycleResult } from "./types/grid.js";

/** The keys that switch sheets, and Shift+F11, which inserts one. */
export type SheetKey = Extract<KeyboardAction, "nextSheet" | "previousSheet" | "insertSheet">;

/**
 * A new sheet's rows and its columns A to Z. Sheets keep their cells in
 * memory, so a new one is not Excel's 1,048,576 × 16,384; the grid still
 * shows empty columns past Z to fill its width, and typing in one adds it.
 */
const NEW_SHEET_ROWS = 1000;
const NEW_SHEET_COLUMNS = 26;
/** The grid's default column width. */
const NEW_SHEET_COLUMN_WIDTH = 100;

/**
 * Excel's name for a new sheet: `Sheet` and the number after the sheet
 * count, or the next one no sheet uses (`Sheet4` beside three sheets).
 */
export function nextSheetName(sheets: readonly { readonly name: string }[]): string {
  const names = new Set(sheets.map((sheet) => sheetNameKey(sheet.name)));
  let number = sheets.length + 1;
  while (names.has(sheetNameKey(`Sheet${number}`))) number += 1;
  return `Sheet${number}`;
}

export function newSheetShape(): Pick<SheetSnapshot, "rowCount" | "columns"> {
  const columns: Column[] = [];
  for (let col = 0; col < NEW_SHEET_COLUMNS; col++) {
    const label = colToA1(col);
    columns.push({ key: label, header: label, width: NEW_SHEET_COLUMN_WIDTH, type: "general" });
  }
  return { rowCount: NEW_SHEET_ROWS, columns };
}

/**
 * Insert an empty sheet at workbook position `index`, named as Excel names
 * it, and activate it: the tab bar's add button, its menu's Insert and
 * Shift+F11.
 */
export function insertSheet(grid: Grid, index: number): SheetLifecycleResult {
  const result = grid.addSheet({
    name: nextSheetName(grid.store.getWorkbook().sheets),
    index,
    ...newSheetShape(),
  });
  if (result.status === "applied") grid.setActiveSheet(result.sheet);
  return result;
}

/**
 * Excel's Ctrl+PageDown and Ctrl+PageUp activate the next or previous
 * visible sheet; the first and last sheets stay. Shift+F11 inserts a sheet
 * before the active one.
 */
export function runSheetKey(grid: Grid, key: SheetKey): void {
  const sheets = grid.store.getWorkbook().sheets;
  if (key === "insertSheet") {
    insertSheet(
      grid,
      sheets.findIndex((sheet) => sheet.id === grid.getActiveSheet()),
    );
    return;
  }

  const visible = sheets.filter((sheet) => (sheet.visibility ?? "visible") === "visible");
  const index = visible.findIndex((sheet) => sheet.id === grid.getActiveSheet());
  const next = index < 0 ? undefined : visible[index + (key === "nextSheet" ? 1 : -1)];
  if (next) grid.setActiveSheet(next.id);
}
