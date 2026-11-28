/**
 * The commands behind Excel's format, hide, insert and Format Cells keys
 * (Ctrl+Shift+~ ! @ # $ % ^, Ctrl+9, Ctrl+0, Ctrl++, Ctrl+-, Ctrl+1), and
 * `GridActions.insertCells`, `deleteCells` and `formatCells`. They apply when
 * they are called; only the Insert, Delete and Format Cells dialogs load on
 * first use.
 */

import type { FormatCellsChange } from "./format-cells.js";
import type { SelRect } from "./selection.js";
import { StyleActions, type StyleActionsDeps } from "./style-actions.js";
import type { CellStyle } from "./types/cell.js";
import type { CellAddress, Range } from "./types/coordinates.js";
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
  /** The selected rectangle that holds the active cell, in view rows. */
  rect(): SelRect | null;
  /** The sheet's row count and its first and last shown columns. */
  bounds(): readonly [rows: number, firstCol: number, lastCol: number];
  /** Commit a structural change as one undoable step; whether it applied. */
  commit(patches: DocumentOp[]): boolean;
  /** Tell the user why a command did nothing, in an alert they close with OK. */
  alert(title: string, message: string): void;
  /**
   * Excel's Insert (`insert`) or Delete dialog for a `wide` or a tall range;
   * resolves to `shiftRight`, `shiftDown`, `row`, `column` or null. Its code
   * loads on first use, and keys pressed meanwhile reach it once it opens.
   */
  insertDeleteDialog(insert: boolean, wide: boolean): Promise<string | null>;
  /**
   * The Format Cells dialog for the selection; resolves to what OK changes,
   * or null. It loads as the Insert dialog does.
   */
  formatCellsDialog(): Promise<FormatCellsChange | null>;
}

/** What to insert or delete in a range that is neither whole rows nor whole columns. */
type InsertDeleteOptions = {
  readonly entire?: "row" | "column";
  readonly shift?: "right" | "down";
  readonly ask?: boolean;
};

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
      unhide_in_selection(host, command === "unhideRows");
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

/**
 * Ctrl+Shift+9 and Ctrl+Shift+0: show the hidden rows (or columns) inside
 * the selected range, as Excel does. A range that starts at the first or
 * ends at the last shown row also takes the hidden rows beyond it, so the
 * whole sheet selected shows every hidden row.
 */
function unhide_in_selection(host: CellCommandsHost, rows: boolean): void {
  const { grid, style } = host;
  const rect = host.rect();
  if (rect === null || style.readOnly()) return;
  const [row_count, first_col, last_col] = host.bounds();
  if (rows) {
    const first = rect.r0 === 0 ? 0 : style.toDataRow(rect.r0);
    const last = rect.r1 >= row_count - 1 ? Infinity : style.toDataRow(rect.r1);
    const hidden = grid.hiddenRows().filter((row) => row >= first && row <= last);
    if (hidden.length > 0) grid.actions.showRows(hidden);
    return;
  }
  const first = rect.c0 <= first_col ? 0 : rect.c0;
  const last = rect.c1 >= last_col ? Infinity : rect.c1;
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
  const rect = host.rect();
  if (rect === null || host.style.readOnly()) return;
  const { actions } = host.grid;
  const run = (choice: string | null): void => {
    if (choice === "shiftRight" || choice === "right") {
      shift_cells(host, rect, insert, false);
    } else if (choice === "shiftDown" || choice === "down") {
      shift_cells(host, rect, insert, true);
    } else if (choice === "row") {
      if (insert) actions.insertRowAbove();
      else actions.deleteRow();
    } else if (choice === "column") {
      if (insert) actions.insertColumnLeft();
      else actions.deleteColumn();
    }
  };
  const [row_count, first_col, last_col] = host.bounds();
  const whole_rows = rect.c0 <= first_col && rect.c1 >= last_col;
  const whole_columns = rect.r0 === 0 && rect.r1 >= row_count - 1;
  if (whole_rows || whole_columns) {
    run(whole_rows ? "row" : "column");
    return;
  }
  // Excel's default choice follows the range's shape.
  const wide = rect.c1 - rect.c0 >= rect.r1 - rect.r0;
  const chosen = options.entire ?? options.shift;
  if (chosen === undefined && options.ask) void host.insertDeleteDialog(insert, wide).then(run);
  else run(chosen ?? (wide ? "row" : "column"));
}

/** Excel's messages when Insert or Delete cannot shift the cells. */
const SHIFT_OFF_SHEET =
  "To prevent possible loss of data, cells that are not blank can't be shifted off the sheet.";
const SHIFT_BLOCKED =
  "The cells can't be shifted: a table, PivotTable, merged cell or spill range is in the way.";
const SHIFT_IN_VIEW = "Cells can't be shifted while the sheet is sorted or filtered.";

/**
 * The last cell from `from` on, along a line of the sheet (a column for a
 * shift down, a row for a shift right), that holds a value or a formula;
 * -1 when none does. `last` is the line's last index.
 */
function last_used_along(
  host: CellCommandsHost,
  down: boolean,
  line: number,
  from: number,
  last: number,
): number {
  const { store } = host.style;
  const sheet = host.style.activeSheet();
  const at = (index: number): CellAddress =>
    down ? { sheet, row: index, col: line } : { sheet, row: line, col: index };
  const used = (index: number) =>
    store.getCell(at(index)).resolved !== null || store.getFormula(at(index)) !== null;
  if (used(last)) return last;
  if (!down) {
    // A row has few cells: look at each from the end.
    for (let index = last - 1; index >= from; index--) if (used(index)) return index;
    return -1;
  }
  // A column can have a million: Ctrl+Up from its empty last cell reaches
  // the data nearest the end, at one end of its block, and Ctrl+Down from
  // there finds the block's far end, the last used cell.
  let found = host.grid.dataEdge(last, line, -1, 0);
  if (found === null) return last;
  if (!used(found)) return -1;
  if (found < last && used(found + 1)) found = host.grid.dataEdge(found, line, 1, 0) ?? last;
  return found >= from ? found : -1;
}

/**
 * Insert or Delete with Shift cells down (up) or right (left), as Excel
 * does: one `moveCells` with `shift` of the used cells after the selection
 * in its columns (rows), so references follow Excel's rule for inserted and
 * deleted cells. An insert that would push cells that are not blank off the
 * sheet does nothing, with Excel's message.
 */
function shift_cells(host: CellCommandsHost, rect: SelRect, insert: boolean, down: boolean): void {
  const { style } = host;
  const sheet = style.sheet();
  const sheet_id = style.activeSheet();
  const r0 = style.toDataRow(rect.r0);
  const r1 = style.toDataRow(rect.r1);
  if (r1 - r0 !== rect.r1 - rect.r0 || host.bounds()[0] !== sheet.rowCount) {
    host.alert(insert ? "Insert" : "Delete", SHIFT_IN_VIEW);
    return;
  }
  // Along the shift, then across it.
  const [first, last] = down ? [r0, r1] : [rect.c0, rect.c1];
  const [cross_first, cross_last] = down ? [rect.c0, rect.c1] : [r0, r1];
  const last_along = down ? sheet.rowCount - 1 : sheet.columns.length - 1;
  const count = last - first + 1;
  const at = (along: number, across: number) =>
    down ? { row: along, col: across } : { row: across, col: along };
  const span = (start: number, end: number): Range => ({
    sheet: sheet_id,
    start: at(start, cross_first),
    end: at(end, cross_last),
  });
  const last_used = (from: number): number => {
    let used = -1;
    for (let line = cross_first; line <= cross_last; line++) {
      used = Math.max(used, last_used_along(host, down, line, from, last_along));
    }
    return used;
  };

  let patch: DocumentOp;
  if (insert) {
    // The used cells from the selection on move; with none, one empty line
    // still carries the references to the cells after it.
    const used = last_used(first);
    const end = Math.max(used, first);
    if (end + count > last_along) {
      if (used >= first) host.alert(insert ? "Insert" : "Delete", SHIFT_OFF_SHEET);
      else host.commit([{ op: "clearRange", range: span(first, last) }]);
      return;
    }
    patch = {
      op: "moveCells",
      range: span(first, end),
      to: { sheet: sheet_id, ...at(first + count, cross_first) },
      shift: true,
    };
  } else {
    const below = last + 1;
    if (below > last_along) {
      host.commit([{ op: "clearRange", range: span(first, last) }]);
      return;
    }
    // At least as many cells as are deleted move up, so they cover them;
    // the engine empties what a shorter block at the sheet's edge leaves.
    const end = Math.min(Math.max(last_used(below), below + count - 1), last_along);
    patch = {
      op: "moveCells",
      range: span(below, end),
      to: { sheet: sheet_id, ...at(first, cross_first) },
      shift: true,
    };
  }
  if (!host.commit([patch])) host.alert(insert ? "Insert" : "Delete", SHIFT_BLOCKED);
}

/**
 * Format Cells' OK: merge `style` into the selection's styles and apply the
 * border `preset`, as one undoable step. The style operations come first, so
 * the border runs merge into the styles they leave.
 */
function format_selection(
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
    format_selection(deps, format.style ?? {}, format.border ?? null);
    return;
  }
  void host.formatCellsDialog().then((change) => {
    if (change !== null) format_selection(deps, change.style, change.border);
  });
}
