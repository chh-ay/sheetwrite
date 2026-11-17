/**
 * The commands behind Excel's number-format and hide keys (Ctrl+Shift+~ ! @
 * # $ % ^, Ctrl+9, Ctrl+0, with Shift to show). Only their key bindings are in
 * the first load; this chunk loads with the first of them, and keys pressed
 * meanwhile wait for it. Insert, Delete and Format Cells are in
 * `insert-delete-format.ts`.
 */

import type { CellCommandsHost } from "./insert-delete-format.js";
import type { KeyboardAction } from "./types/grid.js";

/** Excel's number-format keys, Ctrl+Shift+~ ! @ # $ % ^, and the en-US formats they apply. */
const KEY_NUMBER_FORMATS = {
  formatGeneral: "General",
  formatNumber: "#,##0.00",
  formatTime: "h:mm AM/PM",
  formatDate: "d-mmm-yy",
  formatCurrency: "$#,##0.00_);($#,##0.00)",
  formatPercent: "0%",
  formatScientific: "0.00E+00",
} as const;

/** The keyboard actions this chunk runs. */
export type CellCommand = Extract<
  KeyboardAction,
  keyof typeof KEY_NUMBER_FORMATS | "hideRows" | "unhideRows" | "hideColumns" | "unhideColumns"
>;

/** Run `command` for the grid behind `host`. */
export function runCellCommand(host: CellCommandsHost, command: CellCommand): void {
  const { actions } = host.grid;
  switch (command) {
    case "hideRows":
      actions.hideRows();
      break;
    case "hideColumns":
      actions.hideColumns();
      break;
    case "unhideRows":
    case "unhideColumns":
      unhideInSelection(host, command === "unhideRows");
      break;
    default:
      actions.setNumberFormat(KEY_NUMBER_FORMATS[command]);
  }
}

/**
 * Ctrl+Shift+9 and Ctrl+Shift+0: show the hidden rows (or columns) inside
 * the selected range, as Excel does. A range that starts at the first or
 * ends at the last shown row also takes the hidden rows beyond it, so the
 * whole sheet selected shows every hidden row.
 */
function unhideInSelection(host: CellCommandsHost, rows: boolean): void {
  const { grid, style } = host;
  const rect = host.rect();
  if (rect === null || style.readOnly()) return;
  const [rowCount, firstCol, lastCol] = host.bounds();
  if (rows) {
    const first = rect.r0 === 0 ? 0 : style.toDataRow(rect.r0);
    const last = rect.r1 >= rowCount - 1 ? Infinity : style.toDataRow(rect.r1);
    const hidden = grid.hiddenRows().filter((row) => row >= first && row <= last);
    if (hidden.length > 0) grid.actions.showRows(hidden);
    return;
  }
  const first = rect.c0 <= firstCol ? 0 : rect.c0;
  const last = rect.c1 >= lastCol ? Infinity : rect.c1;
  const hidden = grid.hiddenColumns().filter((col) => col >= first && col <= last);
  if (hidden.length > 0) grid.actions.showColumns(hidden);
}
