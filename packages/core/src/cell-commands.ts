/**
 * Excel's commands that run only from their keys or menus: show the hidden
 * rows or columns of the selection (Ctrl+Shift+9, Ctrl+Shift+0), insert or
 * delete (Ctrl++, Ctrl+-) and Format Cells (Ctrl+1). They load on first use,
 * so the first load carries none of them.
 */

import { type DialogHost, insertDeleteDialog } from "./dialog.js";
import type { SelRect } from "./selection.js";
import type { CellScalar, CellStyle } from "./types/cell.js";
import type { BorderPreset, Grid } from "./types/grid.js";

/** What the commands read and change in the grid that runs them. */
export interface CellCommandsHost {
  readonly grid: Grid;
  readonly dialogs: DialogHost;
  readOnly(): boolean;
  /** The selected rectangle that holds the active cell, in view rows. */
  activeRect(): SelRect | null;
  firstCol(): number;
  lastCol(): number;
  rowCount(): number;
  toDataRow(viewRow: number): number;
  /** The active cell's style, with its column's number format when it has none, and its value. */
  activeCell(): { readonly style: CellStyle; readonly sample: CellScalar } | null;
  /** The theme's font shorthand, for the size and family an unstyled cell shows. */
  font(): string;
  /** Apply Format Cells' changes to the selection as one undoable step. */
  formatSelection(style: Partial<CellStyle>, border: BorderPreset | null): void;
}

/**
 * Ctrl+Shift+9 and Ctrl+Shift+0: show the hidden rows (or columns) inside
 * the selected range, as Excel does. A range that starts at the first or
 * ends at the last shown row also takes the hidden rows beyond it, so the
 * whole sheet selected shows every hidden row.
 */
export function unhideInSelection(host: CellCommandsHost, rows: boolean): void {
  const rect = host.activeRect();
  if (rect === null || host.readOnly()) return;
  const { grid } = host;
  if (rows) {
    const first = rect.r0 === 0 ? 0 : host.toDataRow(rect.r0);
    const last = rect.r1 >= host.rowCount() - 1 ? Infinity : host.toDataRow(rect.r1);
    const hidden = grid.hiddenRows().filter((row) => row >= first && row <= last);
    if (hidden.length > 0) grid.actions.showRows(hidden);
    return;
  }
  const first = rect.c0 <= host.firstCol() ? 0 : rect.c0;
  const last = rect.c1 >= host.lastCol() ? Infinity : rect.c1;
  const hidden = grid.hiddenColumns().filter((col) => col >= first && col <= last);
  if (hidden.length > 0) grid.actions.showColumns(hidden);
}

/**
 * Ctrl++ and Ctrl+-: insert or delete as Excel does. Whole selected rows or
 * columns go at once; for other ranges Excel's Insert or Delete dialog asks
 * what to insert or delete.
 */
export function insertOrDelete(host: CellCommandsHost, insert: boolean): void {
  const rect = host.activeRect();
  if (rect === null || host.readOnly()) return;
  const { actions } = host.grid;
  const run = (choice: string | null): void => {
    if (choice === "entireRow") {
      if (insert) actions.insertRowAbove();
      else actions.deleteRow();
    } else if (choice === "entireColumn") {
      if (insert) actions.insertColumnLeft();
      else actions.deleteColumn();
    }
  };
  const wholeRows = rect.c0 <= host.firstCol() && rect.c1 >= host.lastCol();
  const wholeColumns = rect.r0 === 0 && rect.r1 >= host.rowCount() - 1;
  if (wholeRows || wholeColumns) {
    run(wholeRows ? "entireRow" : "entireColumn");
    return;
  }
  // Excel's default choice follows the range's shape.
  const wide = rect.c1 - rect.c0 >= rect.r1 - rect.r0;
  void insertDeleteDialog(host.dialogs, insert, wide).result.then(run);
}

/** Ctrl+1: the Format Cells dialog for the selection; its code is a chunk of its own. */
export async function formatCells(host: CellCommandsHost): Promise<void> {
  const cell = host.activeCell();
  if (cell === null || host.readOnly()) return;
  const { formatCellsDialog } = await import("./format-cells.js");
  const input = { style: cell.style, sample: cell.sample, font: host.font() };
  const change = await formatCellsDialog(host.dialogs, input).result;
  if (change !== null) host.formatSelection(change.style, change.border);
}
