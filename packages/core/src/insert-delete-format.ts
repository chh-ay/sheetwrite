// Excel's Insert, Delete and Format Cells: `GridActions.insertCells`,
// `deleteCells` and `formatCells`, and the keys Ctrl++, Ctrl+- and Ctrl+1.
// They apply when they are called. Excel's Insert, Delete and Format Cells
// dialogs, which the keys and `ask` open, load on first use.

import type { FormatCellsChange } from "./format-cells.js";
import type { SelRect } from "./selection.js";
import { StyleActions, type StyleActionsDeps } from "./style-actions.js";
import type { CellStyle } from "./types/cell.js";
import type { DocumentOp } from "./types/document.js";
import type { BorderPreset, Grid } from "./types/grid.js";

/** What the cell commands read and change in the grid that runs them. */
export interface CellCommandsHost {
  readonly grid: Grid;
  /** The selection, the store and the commit the style commands use. */
  readonly style: StyleActionsDeps;
  /** The selected rectangle that holds the active cell, in view rows. */
  rect(): SelRect | null;
  /** The sheet's row count and its first and last shown columns. */
  bounds(): readonly [rows: number, firstCol: number, lastCol: number];
  /**
   * Excel's Insert (`insert`) or Delete dialog for a `wide` or a tall range;
   * resolves to `row`, `column` or null. Its code loads on first use, and
   * keys pressed meanwhile reach it once it opens.
   */
  insertDeleteDialog(insert: boolean, wide: boolean): Promise<string | null>;
  /**
   * The Format Cells dialog for the selection; resolves to what OK changes,
   * or null. It loads as the Insert dialog does.
   */
  formatCellsDialog(): Promise<FormatCellsChange | null>;
}

/**
 * Ctrl++ and Ctrl+-: insert or delete as Excel does. Whole selected rows or
 * columns go at once. Other ranges take entire rows or columns: `entire`, or
 * with `ask` the user's choice in Excel's Insert or Delete dialog, or else the
 * dialog's own default, rows for a range at least as wide as it is tall.
 */
export function insertOrDelete(
  host: CellCommandsHost,
  insert: boolean,
  options: { readonly entire?: "row" | "column"; readonly ask?: boolean } = {},
): void {
  const rect = host.rect();
  if (rect === null || host.style.readOnly()) return;
  const { actions } = host.grid;
  const run = (choice: string | null): void => {
    if (choice === "row") {
      if (insert) actions.insertRowAbove();
      else actions.deleteRow();
    } else if (choice === "column") {
      if (insert) actions.insertColumnLeft();
      else actions.deleteColumn();
    }
  };
  const [rowCount, firstCol, lastCol] = host.bounds();
  const wholeRows = rect.c0 <= firstCol && rect.c1 >= lastCol;
  const wholeColumns = rect.r0 === 0 && rect.r1 >= rowCount - 1;
  if (wholeRows || wholeColumns) {
    run(wholeRows ? "row" : "column");
    return;
  }
  // Excel's default choice follows the range's shape.
  const wide = rect.c1 - rect.c0 >= rect.r1 - rect.r0;
  if (options.entire || !options.ask) run(options.entire ?? (wide ? "row" : "column"));
  else void host.insertDeleteDialog(insert, wide).then(run);
}

/**
 * Format Cells' OK: merge `style` into the selection's styles and apply the
 * border `preset`, as one undoable step. The style operations come first, so
 * the border runs merge into the styles they leave.
 */
function formatSelection(
  deps: StyleActionsDeps,
  style: Partial<CellStyle>,
  preset: BorderPreset | null,
): void {
  const patches: DocumentOp[] = [];
  const collect = new StyleActions({ ...deps, commit: (ops) => patches.push(...ops) });
  if (Object.keys(style).length > 0) collect.applyStyle(style);
  if (preset !== null) collect.setBorders(preset);
  if (patches.length > 0) deps.commit(patches);
}

/**
 * Ctrl+1: apply `format` to the selection at once, as Format Cells' OK does;
 * without it, open the Format Cells dialog.
 */
export function formatCells(
  host: CellCommandsHost,
  format?: { readonly style?: Partial<CellStyle>; readonly border?: BorderPreset },
): void {
  const deps = host.style;
  if (deps.selection().focusCell === null || deps.readOnly()) return;
  if (format) {
    formatSelection(deps, format.style ?? {}, format.border ?? null);
    return;
  }
  void host.formatCellsDialog().then((change) => {
    if (change !== null) formatSelection(deps, change.style, change.border);
  });
}
