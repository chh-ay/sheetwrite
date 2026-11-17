/**
 * The commands behind Excel's format, hide, insert and Format Cells keys
 * (Ctrl+Shift+~ ! @ # $ % ^, Ctrl+9, Ctrl+0, Ctrl++, Ctrl+-, Ctrl+1), and
 * `GridActions.insertCells`, `deleteCells` and `formatCells`. They apply when
 * they are called; only the Insert, Delete and Format Cells dialogs load on
 * first use.
 */

import type { DialogHost } from "./dialog.js";
import type { SelRect } from "./selection.js";
import { StyleActions, type StyleActionsDeps } from "./style-actions.js";
import type { CellStyle } from "./types/cell.js";
import type { DocumentOp } from "./types/document.js";
import type { BorderPreset, Grid, KeyboardAction } from "./types/grid.js";

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

/** The keyboard actions `runCellCommand` runs. */
export type CellCommand = Extract<
  KeyboardAction,
  | keyof typeof KEY_NUMBER_FORMATS
  | "hideRows"
  | "unhideRows"
  | "hideColumns"
  | "unhideColumns"
  | "insertCells"
  | "deleteCells"
  | "formatCells"
>;

/** What the commands read and change in the grid that runs them. */
export interface CellCommandsHost {
  readonly grid: Grid;
  /** The selection, the store and the commit the style commands use. */
  readonly style: StyleActionsDeps;
  /** The sheet's row count and its first and last shown columns. */
  bounds(): readonly [rows: number, firstCol: number, lastCol: number];
  /** The theme's font shorthand, for the size and family an unstyled cell shows. */
  font(): string;
  /**
   * Open a dialog from `load`, a module that loads on first use; keys pressed
   * while it loads wait, then reach the dialog. Resolves with the dialog's
   * answer, or null when the grid is gone before it opens.
   */
  dialog<M, T>(
    load: Promise<M>,
    open: (module: M, dialogs: DialogHost) => Promise<T | null>,
  ): Promise<T | null>;
}

/** What to insert or delete in a range that is neither whole rows nor whole columns. */
type InsertDeleteOptions = { readonly entire?: "row" | "column"; readonly ask?: boolean };

/** Run the key's `command` for the grid behind `host`. */
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
    case "insertCells":
    case "deleteCells":
      insertOrDelete(host, command === "insertCells", { ask: true });
      break;
    case "formatCells":
      formatCells(host);
      break;
    default:
      actions.setNumberFormat(KEY_NUMBER_FORMATS[command]);
  }
}

/** The selected rectangle that holds the active cell, in view rows. */
function activeRect(style: StyleActionsDeps): SelRect | null {
  const selection = style.selection();
  const focus = selection.focusCell;
  if (focus === null) return null;
  let found: SelRect | null = null;
  selection.forEachRect((rect) => {
    if (
      rect.r0 <= focus.row &&
      focus.row <= rect.r1 &&
      rect.c0 <= focus.col &&
      focus.col <= rect.c1
    ) {
      found = rect;
    }
  });
  return found;
}

/**
 * Ctrl+Shift+9 and Ctrl+Shift+0: show the hidden rows (or columns) inside
 * the selected range, as Excel does. A range that starts at the first or
 * ends at the last shown row also takes the hidden rows beyond it, so the
 * whole sheet selected shows every hidden row.
 */
function unhideInSelection(host: CellCommandsHost, rows: boolean): void {
  const { grid, style } = host;
  const rect = activeRect(style);
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

/**
 * Ctrl++ and Ctrl+-: insert or delete as Excel does. Whole selected rows or
 * columns go at once. Other ranges take entire rows or columns: `entire`, or
 * with `ask` the user's choice in Excel's Insert or Delete dialog, or else the
 * dialog's own default, rows for a range at least as wide as it is tall.
 */
export function insertOrDelete(
  host: CellCommandsHost,
  insert: boolean,
  options: InsertDeleteOptions = {},
): void {
  const rect = activeRect(host.style);
  if (rect === null || host.style.readOnly()) return;
  const { actions } = host.grid;
  const run = (choice: "row" | "column" | null): void => {
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
  if (options.entire || !options.ask) {
    run(options.entire ?? (wide ? "row" : "column"));
    return;
  }
  void host
    .dialog(
      import("./dialog.js"),
      (module, dialogs) => module.insertDeleteDialog(dialogs, insert, wide).result,
    )
    .then((choice) =>
      run(choice === "entireRow" ? "row" : choice === "entireColumn" ? "column" : null),
    );
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
 * without it, open the Format Cells dialog, whose code loads on first use.
 */
export function formatCells(
  host: CellCommandsHost,
  format?: { readonly style?: Partial<CellStyle>; readonly border?: BorderPreset },
): void {
  const deps = host.style;
  const focus = deps.selection().focusCell;
  if (focus === null || deps.readOnly()) return;
  if (format) {
    formatSelection(deps, format.style ?? {}, format.border ?? null);
    return;
  }
  const anchor = deps.anchorCell(focus.row, focus.col);
  const cell = deps.store.getCell({
    sheet: deps.activeSheet(),
    row: deps.toDataRow(anchor.row),
    col: anchor.col,
  });
  const numberFormat = cell.style.numberFormat ?? deps.sheet().columns[anchor.col]?.numberFormat;
  const input = {
    style: { ...cell.style, numberFormat },
    sample: cell.resolved,
    font: host.font(),
  };
  void host
    .dialog(
      import("./format-cells.js"),
      (module, dialogs) => module.formatCellsDialog(dialogs, input).result,
    )
    .then((change) => {
      if (change !== null) formatSelection(deps, change.style, change.border);
    });
}
