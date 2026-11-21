// Independent input factories for the two Sheets-style formula-row controls.
// Both subscribe only to public grid events, keep a focused-draft guard so
// asynchronous refreshes never clobber in-progress typing, and return focus to
// the grid after Enter/Escape through the caller-provided callback.

import { colToA1, labelToCol } from "../a1.js";
import { editDraftFor } from "../edit-draft.js";
import {
  EDIT_SURFACE_ATTRIBUTE,
  editorLineCount,
  insertEditorLineBreak,
  sizeEditorTextarea,
} from "../editor-textarea.js";
import { FormulaAssist } from "../formula-assist.js";
import { Scope } from "../scope.js";
import type { Range } from "../types/coordinates.js";
import type { CellInputSnapshot, Grid } from "../types/grid.js";
import { commitCellInput } from "./grid-binding.js";

/** A mounted shell piece: its root element plus an idempotent teardown. */
export interface ShellPiece {
  /** The piece's root element, already appended to its host. */
  readonly element: HTMLElement;
  /** Removes the piece and its listeners; calling it twice is safe. */
  destroy(): void;
}

/** Host elements and callbacks used to bind a name box to a Grid. */
export interface NameBoxOptions {
  /** Called after a successful Enter navigation so the grid regains focus. */
  focusGrid?: () => void;
  /** Accessible label (default "Cell reference"). */
  label?: string;
}

/** `B7` or `B2:D9`, each part optionally `$`-anchored as users paste them. */
const A1_CELL_OR_RANGE = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/;

/**
 * A1 jump box, like Excel's name box: shows the focused cell's reference, and
 * on Enter selects the typed cell (`B7`) or range (`B2:D9`); `$` markers are
 * accepted. References use the sheet's row numbers, as the row headers do,
 * also while a filter, hidden rows or a view sort change which rows show; a
 * typed range selects the rows of it that show, and a typed cell on a hidden
 * row becomes the active cell, as in Excel (`Grid.goToCell`). Invalid or
 * out-of-bounds references set `aria-invalid` and change nothing; Escape
 * restores the displayed reference.
 *
 * @param host - Element the name box is appended to.
 * @param grid - The grid the name box reads and selects in.
 * @param options - The accessible label, and how to return focus to the grid.
 */
export function createNameBox(
  host: HTMLElement,
  grid: Grid,
  options: NameBoxOptions = {},
): ShellPiece {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "sheetwrite-shell-namebox";
  input.setAttribute("aria-label", options.label ?? "Cell reference");
  input.autocomplete = "off";
  input.spellcheck = false;

  let committed = "";
  let dirty = false;

  const refresh = (): void => {
    if (document.activeElement === input && dirty) return;
    // The active cell in sheet rows, also on a row the view hides.
    const cell = grid.getActiveSheetCell();
    committed = cell ? `${colToA1(cell.col)}${cell.row + 1}` : "";
    input.value = committed;
    input.removeAttribute("aria-invalid");
    dirty = false;
  };

  const jump = (): void => {
    const match = A1_CELL_OR_RANGE.exec(input.value.trim());
    if (!match) {
      input.setAttribute("aria-invalid", "true");
      return;
    }

    // A single cell is a range whose corners are the same cell.
    const [, startCol, startRow, endCol = startCol, endRow = startRow] = match;
    const corner = (col: string | undefined, row: string | undefined) => ({
      row: Number(row) - 1,
      col: labelToCol((col ?? "").toUpperCase()),
    });
    const start = corner(startCol, startRow);
    const end = corner(endCol, endRow);
    const left = Math.min(start.col, end.col);
    const right = Math.max(start.col, end.col);
    const sheetId = grid.getActiveSheet();
    const rowCount =
      grid.store.getWorkbook().sheets.find((sheet) => sheet.id === sheetId)?.rowCount ?? 0;

    // One cell becomes the active cell, also on a row a filter or Hide Rows
    // hides, as in Excel.
    if (start.row === end.row && start.col === end.col) {
      // Not dirty, so the selection event shows the cell's reference.
      dirty = false;
      if (!grid.goToCell({ sheet: sheetId, row: start.row, col: start.col })) {
        dirty = true;
        input.setAttribute("aria-invalid", "true");
        return;
      }
      options.focusGrid?.();
      return;
    }
    // The typed sheet rows that show, as view rows; a filter, hidden rows or a
    // view sort can leave gaps or change their order.
    const shown: number[] = [];
    if (start.row >= 0 && end.row >= 0 && Math.max(start.row, end.row) < rowCount) {
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
        const viewRow = grid.viewRowOf(row);
        if (viewRow !== null) shown.push(viewRow);
      }
    }
    shown.sort((a, b) => a - b);

    // The cells the grid shows and edits: the sheet's columns and the empty
    // ones past them that fill the grid's width.
    const first = shown[0];
    if (
      first === undefined ||
      grid.getCellInput(first, left) === null ||
      grid.getCellInput(first, right) === null
    ) {
      input.setAttribute("aria-invalid", "true");
      return;
    }

    // Consecutive view rows make one range each.
    const ranges: Range[] = [];
    let runStart = first;
    for (let index = 1; index <= shown.length; index++) {
      const previous = shown[index - 1]!;
      if (shown[index] === previous + 1) continue;
      ranges.push({
        sheet: sheetId,
        start: { row: runStart, col: left },
        end: { row: previous, col: right },
      });
      runStart = shown[index] ?? 0;
    }

    const addr = { sheet: sheetId, row: first, col: left };
    const [only] = ranges;
    if (ranges.length > 1) grid.setSelection({ kind: "multi", ranges });
    else if (only && (only.start.row !== only.end.row || left !== right)) {
      grid.setSelection({ kind: "range", range: only });
    } else grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    dirty = false;
    input.removeAttribute("aria-invalid");
    options.focusGrid?.();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      jump();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = committed;
      input.removeAttribute("aria-invalid");
      dirty = false;
      options.focusGrid?.();
    } else {
      dirty = true;
      input.removeAttribute("aria-invalid");
    }
  };

  const lifetime = new Scope();
  input.addEventListener("keydown", onKeydown, { signal: lifetime.signal });
  lifetime.add(grid.on("selection", refresh));
  lifetime.add(grid.on("active-sheet", refresh));
  refresh();
  host.appendChild(input);
  lifetime.add(() => input.remove());

  return {
    element: input,
    destroy: () => lifetime.close(),
  };
}

const FORMULA_BAR_MIN_HEIGHT = 26;

/** Host elements and callbacks used to bind a formula bar to a Grid. */
export interface FormulaBarOptions {
  /** Called after Enter commits or Escape cancels, so the grid regains focus. */
  focusGrid?: () => void;
  /** Accessible label (default "Formula bar"). */
  label?: string;
}

/** A formula bar piece; `setReadOnly` blocks commits without unmounting. */
export interface FormulaBarPiece extends ShellPiece {
  /** Stops or allows writing to the cell from the bar. */
  setReadOnly(readOnly: boolean): void;
}

/**
 * Detached formula bar: mirrors the focused cell's editable text (exact
 * formula source, else literal text) and commits on Enter through the grid's
 * undoable transaction path, targeting the data address captured with the
 * draft — correct even under an active sort/filter view.
 *
 * During a cell edit the bar and the cell editor share one draft, as in
 * Excel: typing in the editor shows in the bar keystroke by keystroke, and
 * typing in the bar shows in the cell, which opens its editor without taking
 * focus. Escape in either restores the stored text in both. A focused draft
 * is never overwritten by selection/change events. While focused, the bar
 * shows formula help as the cell editor does.
 *
 * @param host - Element the formula bar is appended to.
 * @param grid - The grid whose focused cell the bar shows and edits.
 * @param options - The accessible label, and how to return focus to the grid.
 */
export function createFormulaBar(
  host: HTMLElement,
  grid: Grid,
  options: FormulaBarOptions = {},
): FormulaBarPiece {
  const input = document.createElement("textarea");
  input.rows = 1;
  input.wrap = "off";
  input.setAttribute("aria-multiline", "true");
  input.setAttribute(EDIT_SURFACE_ATTRIBUTE, "");
  input.className = "sheetwrite-shell-formula";
  input.setAttribute("aria-label", options.label ?? "Formula bar");
  input.autocomplete = "off";
  input.spellcheck = false;

  const assist = new FormulaAssist({
    highlightCells: (ranges) => grid.highlightCells(ranges),
    sheet: () => grid.getActiveSheet(),
    cell: () => snapshot?.address ?? null,
    store: grid.store,
  });

  let snapshot: CellInputSnapshot | null = null;
  let committed = "";
  let dirty = false;
  let readOnly = false;
  let composing = false;
  /** The built-in grid's draft channel; another `Grid` implementation has none. */
  const draft = editDraftFor(grid);
  /** A cell edit is open and the bar shows its draft. */
  let editing = false;
  /** Lines the bar was last sized for. */
  let sizedLines = -1;

  const size = (): void => {
    sizeEditorTextarea(input, FORMULA_BAR_MIN_HEIGHT);
    sizedLines = editorLineCount(input.value);
  };

  const refresh = (): void => {
    if (editing || (document.activeElement === input && dirty)) return;
    snapshot = grid.getActiveCellInput();
    committed = snapshot?.text ?? "";
    input.value = committed;
    size();
    dirty = false;
    if (document.activeElement === input) assist.update();
  };

  const restore = (): void => {
    dirty = false;
    if (editing) {
      // The cancel reaches the bar through the draft's `end`, which restores it.
      draft?.cancel();
      return;
    }
    input.value = committed;
    size();
    assist.update();
  };

  const commit = (): void => {
    if (readOnly || !snapshot) return;
    if (editing) {
      // A formula that does not parse stays in the bar to be fixed, as in Excel.
      if (draft?.commit() === false) return;
    } else commitCellInput(grid, snapshot, input.value);
    dirty = false;
    options.focusGrid?.();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (composing || event.isComposing) {
      event.stopPropagation();
      return;
    }
    if (insertEditorLineBreak(event, input)) {
      event.stopPropagation();
    } else if (assist.handleKeyDown(event)) {
      event.stopPropagation();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restore();
      options.focusGrid?.();
    }
  };

  // Typing, paste, drop and IME all fire `input`; a key alone does not change the draft.
  const onInput = (): void => {
    dirty = true;
    size();
    assist.update();
    if (readOnly) return;
    editing = draft?.setText(input.value, input.selectionStart, input.selectionEnd) ?? false;
  };
  const onFocus = (): void => {
    size();
    assist.attach(input, null);
  };
  const onBlur = (): void => assist.detach();

  /** The cell editor's draft: shown here unless the user is typing in the bar. */
  const onEditInput = (text: string): void => {
    editing = true;
    if (document.activeElement === input || input.value === text) return;
    input.value = text;
    dirty = true;
    // Typing within a line keeps the bar's height, so it is laid out only at a line break.
    if (editorLineCount(text) !== sizedLines) size();
  };
  /**
   * Edit an active cell the view hides, which has no cell editor: the bar
   * takes the focus and starts from the typed key, or the cell's text (F2).
   */
  const onEditRequest = (initial: string | null): boolean => {
    if (readOnly || !snapshot) return false;
    input.focus();
    if (initial !== null) input.value = initial;
    input.setSelectionRange(input.value.length, input.value.length);
    dirty = true;
    size();
    assist.update();
    return true;
  };
  const onEditEnd = (): void => {
    editing = false;
    dirty = false;
    refresh();
  };

  const lifetime = new Scope();
  const { signal } = lifetime;
  input.addEventListener(
    "compositionstart",
    () => {
      composing = true;
    },
    { signal },
  );
  input.addEventListener(
    "compositionend",
    () => {
      composing = false;
    },
    { signal },
  );
  input.addEventListener("keydown", onKeydown, { signal });
  input.addEventListener("input", onInput, { signal });
  input.addEventListener("focus", onFocus, { signal });
  input.addEventListener("blur", onBlur, { signal });
  lifetime.add(grid.on("selection", refresh));
  lifetime.add(grid.on("change", refresh));
  lifetime.add(grid.on("active-sheet", refresh));
  if (draft) {
    lifetime.add(draft.subscribe({ text: onEditInput, end: onEditEnd, edit: onEditRequest }));
  }
  host.appendChild(input);
  refresh();
  lifetime.add(() => input.remove());
  lifetime.add(() => assist.detach());

  return {
    element: input,
    setReadOnly(value: boolean) {
      readOnly = value;
      input.readOnly = value;
      // A pending draft cannot commit anymore; restore the stable text.
      if (value) restore();
    },
    destroy: () => lifetime.close(),
  };
}
