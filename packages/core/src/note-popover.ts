import type { CellAddress } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** How long the pointer rests on a noted cell before its note shows, as in Excel. */
export const NOTE_HOVER_DELAY_MS = 400;

/** Space between the cell edge and the card. */
const CARD_GAP = 4;

/** Closest the card comes to a window edge. */
const VIEWPORT_MARGIN = 8;

let editorSerial = 0;

/** One cell in both coordinate spaces: view for geometry, data for the note. */
export interface NoteCell {
  readonly row: number;
  readonly col: number;
  readonly address: CellAddress;
}

/** Window (client) coordinates of a cell's box. */
interface NoteCellRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface NotePopoverDependencies {
  /** Grid root; the card mounts here so the widget theme variables reach it. */
  readonly host: HTMLElement;
  /** Element that receives pointer movement over the cells. */
  readonly scroller: HTMLElement;
  readonly theme: Theme;
  cellAt(clientX: number, clientY: number): NoteCell | null;
  noteAt(address: CellAddress): string | null;
  cellRect(cell: NoteCell): NoteCellRect;
  /** Accessible name of the editor for this cell. */
  editorLabel(cell: NoteCell): string;
  commit(address: CellAddress, text: string | null): void;
  /** Move focus back to the grid after a keyboard commit or cancel. */
  returnFocus(): void;
}

function sameCell(a: NoteCell | null, b: NoteCell): boolean {
  return (
    a !== null &&
    a.address.sheet === b.address.sheet &&
    a.address.row === b.address.row &&
    a.address.col === b.address.col
  );
}

/**
 * Excel-style cell notes: a read-only card that shows when the pointer rests
 * on a noted cell, and a text box that edits the focus cell's note. The card
 * never takes focus or pointer events, so the grid under it stays usable.
 */
export class NotePopover {
  private readonly card: HTMLDivElement;
  private readonly editor: HTMLTextAreaElement;
  private hoverTimer: number | undefined;
  /** Cell under the pointer that has a note, shown or waiting for the delay. */
  private hovered: NoteCell | null = null;
  private shown = false;
  /** Cell whose note is open in the editor, with the text it had at open. */
  private editing: { readonly cell: NoteCell; readonly original: string | null } | null = null;

  constructor(private readonly deps: NotePopoverDependencies) {
    seedWidgetTheme(deps.host, deps.theme);

    // Position, visibility and hit-testing are behavior, so they stay inline;
    // everything cosmetic lives in styles.css.
    this.card = document.createElement("div");
    this.card.className = "sheetwrite-note";
    this.card.setAttribute("role", "tooltip");
    this.card.style.position = "fixed";
    this.card.style.pointerEvents = "none";

    editorSerial += 1;
    this.editor = document.createElement("textarea");
    this.editor.className = "sheetwrite-note-editor";
    this.editor.id = `sheetwrite-note-editor-${editorSerial}`;
    this.editor.style.position = "fixed";
    this.editor.addEventListener("keydown", this.onEditorKeyDown);
    this.editor.addEventListener("blur", this.onEditorBlur);

    deps.scroller.addEventListener("pointermove", this.onPointerMove);
    deps.scroller.addEventListener("pointerleave", this.onPointerLeave);
    deps.scroller.addEventListener("scroll", this.onScroll, { passive: true });
  }

  /** Open the editor on `cell` with its current note, or empty for a new note. */
  edit(cell: NoteCell): void {
    this.hideCard();
    this.cancel();

    const original = this.deps.noteAt(cell.address);
    this.editing = { cell, original };
    this.editor.value = original ?? "";
    this.editor.setAttribute("aria-label", this.deps.editorLabel(cell));
    this.deps.host.appendChild(this.editor);
    this.place(this.editor, cell);

    this.editor.focus();
    const end = this.editor.value.length;
    this.editor.setSelectionRange(end, end);
  }

  /** Follow the edited cell after a scroll, zoom or layout change. */
  reposition(): void {
    if (this.editing) this.place(this.editor, this.editing.cell);
  }

  /** Re-read the shown note after a note change; hide the card when it was removed. */
  refresh(): void {
    if (!this.shown || !this.hovered) return;

    const text = this.deps.noteAt(this.hovered.address);
    if (text === null) {
      this.hideCard();
      return;
    }

    this.card.textContent = text;
    this.place(this.card, this.hovered);
  }

  /** Hide the hover card; an open editor stays open. */
  hideCard(): void {
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = undefined;
    this.hovered = null;
    this.shown = false;
    this.card.remove();
  }

  /** Hide the card and drop any unsaved editor text, e.g. on a sheet switch. */
  dismiss(): void {
    this.hideCard();
    this.cancel();
  }

  destroy(): void {
    this.dismiss();
    this.editor.removeEventListener("keydown", this.onEditorKeyDown);
    this.editor.removeEventListener("blur", this.onEditorBlur);
    this.deps.scroller.removeEventListener("pointermove", this.onPointerMove);
    this.deps.scroller.removeEventListener("pointerleave", this.onPointerLeave);
    this.deps.scroller.removeEventListener("scroll", this.onScroll);
  }

  private show(cell: NoteCell): void {
    const text = this.deps.noteAt(cell.address);
    if (text === null) return;

    this.card.textContent = text;
    this.deps.host.appendChild(this.card);
    this.shown = true;
    this.place(this.card, cell);
  }

  /**
   * Close the editor first, so the blur that removing a focused element can
   * fire finds no session and commits nothing.
   */
  private cancel(): void {
    if (!this.editing) return;
    this.editing = null;
    this.editor.remove();
  }

  private commit(returnFocus: boolean): void {
    const session = this.editing;
    if (!session) return;
    this.cancel();

    // Blank text has nothing to show, so it removes the note.
    const text = this.editor.value.trim() === "" ? null : this.editor.value;
    if (text !== session.original) this.deps.commit(session.cell.address, text);
    if (returnFocus) this.deps.returnFocus();
  }

  /**
   * Beside the cell's right edge, top-aligned. Flip to the left edge or up to
   * the cell's bottom when the window edge is near. The surface is fixed so
   * the host's `overflow: hidden` cannot clip it; a transformed ancestor moves
   * the fixed origin, so measure where (0, 0) lands and subtract it.
   */
  private place(surface: HTMLElement, cell: NoteCell): void {
    surface.style.left = "0px";
    surface.style.top = "0px";
    const origin = surface.getBoundingClientRect();
    const rect = this.deps.cellRect(cell);

    const right = rect.right + CARD_GAP;
    const fitsRight = right + origin.width <= window.innerWidth - VIEWPORT_MARGIN;
    const left = fitsRight ? right : rect.left - CARD_GAP - origin.width;

    const fitsBelow = rect.top + origin.height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow ? rect.top : rect.bottom - origin.height;

    surface.style.left = `${Math.max(VIEWPORT_MARGIN, left) - origin.left}px`;
    surface.style.top = `${Math.max(VIEWPORT_MARGIN, top) - origin.top}px`;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    // Touch has no hover; a tap must not leave a card behind.
    if (event.pointerType === "touch") return;

    const cell = this.deps.cellAt(event.clientX, event.clientY);
    if (cell && sameCell(this.hovered, cell)) return;

    this.hideCard();
    if (!cell || this.deps.noteAt(cell.address) === null) return;
    if (this.editing && sameCell(this.editing.cell, cell)) return;

    this.hovered = cell;
    this.hoverTimer = window.setTimeout(() => {
      this.hoverTimer = undefined;
      this.show(cell);
    }, NOTE_HOVER_DELAY_MS);
  };

  private readonly onPointerLeave = (): void => {
    this.hideCard();
  };

  private readonly onScroll = (): void => {
    this.hideCard();
  };

  private readonly onEditorKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      this.deps.returnFocus();
      return;
    }

    // Plain Enter types a new line, as in Excel; Ctrl or Cmd+Enter saves.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.commit(true);
    }
  };

  private readonly onEditorBlur = (): void => {
    this.commit(false);
  };
}
