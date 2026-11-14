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
import { selectionCell } from "../selection.js";
import type { CellInputSnapshot, Grid } from "../types/grid.js";
import { commitCellInput } from "./grid-binding.js";

/** A mounted shell piece: its root element plus an idempotent teardown. */
export interface ShellPiece {
  readonly element: HTMLElement;
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
 * accepted. Invalid or out-of-bounds references set `aria-invalid` and make
 * no grid calls; Escape restores the displayed reference.
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
    const focus = selectionCell(grid.getSelection());
    committed = focus ? `${colToA1(focus.col)}${focus.row + 1}` : "";
    input.value = committed;
    input.removeAttribute("aria-invalid");
    dirty = false;
  };

  const jump = (): void => {
    const match = A1_CELL_OR_RANGE.exec(input.value.trim());
    const sheetId = grid.getActiveSheet();
    const sheet = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheetId);
    if (!match || !sheet) {
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
    const inBounds = ({ row, col }: { row: number; col: number }) =>
      col >= 0 && col < sheet.columns.length && row >= 0 && row < sheet.rowCount;
    if (!inBounds(start) || !inBounds(end)) {
      input.setAttribute("aria-invalid", "true");
      return;
    }

    const addr = { sheet: sheetId, ...start };
    if (start.row === end.row && start.col === end.col) {
      grid.setSelection({ kind: "cell", addr });
    } else {
      grid.setSelection({ kind: "range", range: { sheet: sheetId, start, end } });
    }
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
    const focus = selectionCell(grid.getSelection());
    snapshot = focus ? grid.getCellInput(focus.row, focus.col) : null;
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
    if (editing) draft?.commit();
    else commitCellInput(grid, snapshot, input.value);
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
  if (draft) lifetime.add(draft.subscribe({ text: onEditInput, end: onEditEnd }));
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
