/**
 * The commands behind Excel's format, hide, insert and Format Cells keys
 * (Ctrl+Shift+~ ! @ # $ % ^, Ctrl+9, Ctrl+0, Ctrl++, Ctrl+-, Ctrl+1). Only
 * their key bindings are in the first load; this chunk loads with the first
 * of them, and keys pressed meanwhile wait for it.
 */

import { type DialogHost, insertDeleteDialog, openDialog } from "./dialog.js";
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

/** The keyboard actions this chunk runs. */
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
  readonly dialogs: DialogHost;
  /** The selection, the store and the commit the style commands use. */
  readonly style: StyleActionsDeps;
  /** Commit a structural change as one undoable step; whether it applied. */
  commit(patches: DocumentOp[]): boolean;
  /** The sheet's row count and its first and last shown columns. */
  bounds(): readonly [rows: number, firstCol: number, lastCol: number];
  /** The theme's font shorthand, for the size and family an unstyled cell shows. */
  font(): string;
}

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
    case "insertCells":
    case "deleteCells":
      insertOrDelete(host, command === "insertCells");
      break;
    case "formatCells":
      void formatCells(host);
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
 * columns go at once; for other ranges Excel's Insert or Delete dialog asks
 * what to insert or delete.
 */
function insertOrDelete(host: CellCommandsHost, insert: boolean): void {
  const rect = activeRect(host.style);
  if (rect === null || host.style.readOnly()) return;
  const { actions } = host.grid;
  const run = (choice: string | null): void => {
    if (choice === "shiftDown" || choice === "shiftRight") {
      shiftCells(host, rect, insert, choice === "shiftDown");
    } else if (choice === "entireRow") {
      if (insert) actions.insertRowAbove();
      else actions.deleteRow();
    } else if (choice === "entireColumn") {
      if (insert) actions.insertColumnLeft();
      else actions.deleteColumn();
    }
  };
  const [rowCount, firstCol, lastCol] = host.bounds();
  const wholeRows = rect.c0 <= firstCol && rect.c1 >= lastCol;
  const wholeColumns = rect.r0 === 0 && rect.r1 >= rowCount - 1;
  if (wholeRows || wholeColumns) {
    run(wholeRows ? "entireRow" : "entireColumn");
    return;
  }
  // Excel's default choice follows the range's shape.
  const wide = rect.c1 - rect.c0 >= rect.r1 - rect.r0;
  void insertDeleteDialog(host.dialogs, insert, wide).result.then(run);
}

/** Excel's messages when Insert or Delete cannot shift the cells. */
const SHIFT_OFF_SHEET =
  "To prevent possible loss of data, cells that are not blank can't be shifted off the sheet.";
const SHIFT_BLOCKED =
  "The cells can't be shifted: a table, PivotTable, merged cell or spill range is in the way.";
const SHIFT_IN_VIEW = "Cells can't be shifted while the sheet is sorted or filtered.";

/** Tell the user why a shift did not happen; OK closes it and focus goes back to the grid. */
function shiftNotice(host: CellCommandsHost, insert: boolean, message: string): void {
  openDialog(host.dialogs, {
    title: insert ? "Insert" : "Delete",
    role: "alertdialog",
    body: message,
    buttons: [{ label: "OK", value: "ok", default: true }],
    cancel: "ok",
  });
}

/**
 * The last cell from `from` on, along a line of the sheet (a column for a
 * shift down, a row for a shift right), that holds a value or a formula;
 * -1 when none does. `last` is the line's last index.
 */
function lastUsedAlong(
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
function shiftCells(host: CellCommandsHost, rect: SelRect, insert: boolean, down: boolean): void {
  const { style } = host;
  const sheet = style.sheet();
  const sheetId = style.activeSheet();
  const r0 = style.toDataRow(rect.r0);
  const r1 = style.toDataRow(rect.r1);
  if (r1 - r0 !== rect.r1 - rect.r0 || host.bounds()[0] !== sheet.rowCount) {
    shiftNotice(host, insert, SHIFT_IN_VIEW);
    return;
  }
  // Along the shift, then across it.
  const [first, last] = down ? [r0, r1] : [rect.c0, rect.c1];
  const [crossFirst, crossLast] = down ? [rect.c0, rect.c1] : [r0, r1];
  const lastAlong = down ? sheet.rowCount - 1 : sheet.columns.length - 1;
  const count = last - first + 1;
  const at = (along: number, across: number) =>
    down ? { row: along, col: across } : { row: across, col: along };
  const span = (start: number, end: number): Range => ({
    sheet: sheetId,
    start: at(start, crossFirst),
    end: at(end, crossLast),
  });
  const lastUsed = (from: number): number => {
    let used = -1;
    for (let line = crossFirst; line <= crossLast; line++) {
      used = Math.max(used, lastUsedAlong(host, down, line, from, lastAlong));
    }
    return used;
  };

  let patch: DocumentOp;
  if (insert) {
    // The used cells from the selection on move; with none, one empty line
    // still carries the references to the cells after it.
    const used = lastUsed(first);
    const end = Math.max(used, first);
    if (end + count > lastAlong) {
      if (used >= first) shiftNotice(host, insert, SHIFT_OFF_SHEET);
      else host.commit([{ op: "clearRange", range: span(first, last) }]);
      return;
    }
    patch = {
      op: "moveCells",
      range: span(first, end),
      to: { sheet: sheetId, ...at(first + count, crossFirst) },
      shift: true,
    };
  } else {
    const below = last + 1;
    if (below > lastAlong) {
      host.commit([{ op: "clearRange", range: span(first, last) }]);
      return;
    }
    // At least as many cells as are deleted move up, so they cover them;
    // the engine empties what a shorter block at the sheet's edge leaves.
    const end = Math.min(Math.max(lastUsed(below), below + count - 1), lastAlong);
    patch = {
      op: "moveCells",
      range: span(below, end),
      to: { sheet: sheetId, ...at(first, crossFirst) },
      shift: true,
    };
  }
  if (!host.commit([patch])) shiftNotice(host, insert, SHIFT_BLOCKED);
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

/** Ctrl+1: the Format Cells dialog for the selection; its code is a chunk of its own. */
async function formatCells(host: CellCommandsHost): Promise<void> {
  const deps = host.style;
  const focus = deps.selection().focusCell;
  if (focus === null || deps.readOnly()) return;
  const anchor = deps.anchorCell(focus.row, focus.col);
  const cell = deps.store.getCell({
    sheet: deps.activeSheet(),
    row: deps.toDataRow(anchor.row),
    col: anchor.col,
  });
  const numberFormat = cell.style.numberFormat ?? deps.sheet().columns[anchor.col]?.numberFormat;
  const { formatCellsDialog } = await import("./format-cells.js");
  const input = {
    style: { ...cell.style, numberFormat },
    sample: cell.resolved,
    font: host.font(),
  };
  const change = await formatCellsDialog(host.dialogs, input).result;
  if (change !== null) formatSelection(deps, change.style, change.border);
}
