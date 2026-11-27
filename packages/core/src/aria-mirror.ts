import { cellDisplayText } from "./canvas-paint.js";
import type { CellRef } from "./selection.js";
import type { Column } from "./types/cell.js";
import type { Selection } from "./types/coordinates.js";
import type { VisibleWindowView } from "./types/store.js";

let aria_seq = 0;

function write_selected(element: HTMLElement, selected: boolean): void {
  if (selected) element.setAttribute("aria-selected", "true");
  else element.removeAttribute("aria-selected");
}

/**
 * Make `element`'s text `text`. A cell that holds one text node keeps it and
 * gets the new data: `textContent` would replace the node, and the browser
 * would then rebuild the cell's layout box, in every shown cell a loaded page
 * of values fills.
 */
function write_text(element: HTMLElement, text: string): void {
  const node = element.firstChild;
  if (text !== "" && node instanceof Text && node.nextSibling === null) node.data = text;
  else element.textContent = text;
}

/** A mirror node that stands for one column or one view row, its `key`. */
interface Keyed {
  readonly el: HTMLDivElement;
  readonly key: number;
}

/**
 * A mirror header cell (its key is its column) and the values it holds: what
 * the last flush wrote to it. A flush compares against these instead of
 * reading the DOM back.
 */
interface MirrorHeader extends Keyed {
  text: string;
  selected: boolean;
}

/** A mirror data cell, keyed by its column (see {@link MirrorHeader}). */
interface MirrorCell extends Keyed {
  text: string;
  description: string | null;
  selected: boolean;
}

/** A mirror row, keyed by its view row, and its cells (see {@link MirrorHeader}). */
interface MirrorRow extends Keyed {
  selected: boolean;
  cells: MirrorCell[];
}

/**
 * Make `parent`'s nodes `items` the nodes of the keys `key_at(0)` to
 * `key_at(count - 1)`, in that order. A node whose key stays in the window
 * stays as it is; a node whose key left is removed, and `create` makes the
 * node of a new key. A scroll by a column or a row then adds and removes a few
 * nodes instead of rewriting the coordinates and text of every cell. Keys
 * ascend in both lists, so one pass over them places every node.
 */
function reconcile<T extends Keyed>(
  parent: HTMLElement,
  items: readonly T[],
  count: number,
  key_at: (index: number) => number,
  create: (key: number) => T,
): T[] {
  const next: T[] = [];
  let old = 0;
  for (let index = 0; index < count; index++) {
    const key = key_at(index);
    let kept = items[old];
    while (kept !== undefined && kept.key < key) {
      kept.el.remove();
      old++;
      kept = items[old];
    }
    if (kept?.key === key) {
      next.push(kept);
      old++;
      continue;
    }
    const made = create(key);
    parent.insertBefore(made.el, kept?.el ?? null);
    next.push(made);
  }
  for (let index = old; index < items.length; index++) items[index]?.el.remove();
  return next;
}

/** A node with the role `role`. */
function node(role: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", role);
  return el;
}

export interface AriaMirrorDeps {
  host: HTMLElement;
  scroller: HTMLElement;
  overlay: HTMLElement;
  viewport: HTMLElement;
  rowCount: number;
  colCount: number;
  readOnly: boolean;
  presentation: "spreadsheet" | "data-grid";
  columnHeader: (col: number) => string;
  /** The sheet's column `col`, for its number format and locale. */
  column: (col: number) => Column | undefined;
  focusCell: () => CellRef | null;
  /** The description of the cell at view `row`, `col`: its note and input message. */
  descriptionAt: (row: number, col: number) => string | null;
  selection: () => Selection | null;
}

/**
 * Keeps a compact, screen-reader-visible mirror of the rendered window while the
 * canvas and overlay remain hidden from assistive technology.
 *
 * The mirror itself is the `grid`: it owns only rows and cells. The host
 * holds the grid's chrome (toolbar, sheet tabs, panels, find bar) as well,
 * so it is a labelled `group` that keeps the focus and points
 * `aria-activedescendant` at the active cell when the mirror shows it.
 *
 * A paint only captures the mirror's content (`update`, `setRowCount`); the
 * paint's last step, `flush`, writes the DOM, after the paint's layout reads.
 * Writing it earlier would make a later read in the same paint (the editor's
 * position, a scroll listener) lay out the mirror first.
 */
export class AriaMirror {
  private readonly host: HTMLElement;
  private readonly aria: HTMLDivElement;
  private readonly focus_cell: () => CellRef | null;
  private readonly description_at: (row: number, col: number) => string | null;
  private readonly column_header: (col: number) => string;
  private readonly column: (col: number) => Column | undefined;
  /** The painted window's columns, parallel to `cols`. */
  private readonly columns: (Column | undefined)[] = [];
  private readonly selection: () => Selection | null;
  private key = "";
  private version = 0;

  // Captured content that the next flush writes.
  private content_pending = false;
  private row_count_value: string;
  private focus_id = "";
  private row_start = 0;
  private row_count = 0;
  private focus_row = -1;
  private focus_col = -1;
  private selected_row: number | null = null;
  private selected_column: number | null = null;
  private readonly cols: number[] = [];
  private readonly header_texts: string[] = [];
  private readonly cell_texts: string[] = [];
  private readonly cell_descriptions: (string | null)[] = [];
  /** A paint can destroy the grid (a listener); its flush must not write the host again. */
  private destroyed = false;

  /** Last `aria-activedescendant` written to the host; avoids redundant writes. */
  private last_focus_id: string | null = null;

  // The live nodes with what each holds, keyed by column and view row.
  private head_row: HTMLDivElement | null = null;
  private headers: MirrorHeader[] = [];
  private rows: MirrorRow[] = [];

  constructor(deps: AriaMirrorDeps) {
    this.host = deps.host;
    this.focus_cell = deps.focusCell;
    this.description_at = deps.descriptionAt;
    this.column_header = deps.columnHeader;
    this.column = deps.column;
    this.selection = deps.selection;

    const aria = document.createElement("div");
    aria.className = "sheetwrite-aria";
    aria.id = `sheetwrite-grid-${++aria_seq}`;
    aria.setAttribute("role", "grid");
    // `contain: strict` keeps the mirror's changes in every frame of a scroll
    // from laying out and restyling the page around it. In Firefox this takes
    // about a third off the layout and style time of a sideways scroll. Screen
    // readers still read the contained cells.
    aria.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;contain:strict;";
    deps.host.appendChild(aria);
    this.aria = aria;

    this.row_count_value = String(deps.rowCount + 1);
    aria.setAttribute("aria-multiselectable", "true");
    aria.setAttribute("aria-rowcount", this.row_count_value);
    aria.setAttribute("aria-colcount", String(deps.colCount));
    if (deps.readOnly) aria.setAttribute("aria-readonly", "true");
    deps.host.setAttribute("role", "group");
    if (!deps.host.hasAttribute("aria-label")) {
      deps.host.setAttribute(
        "aria-label",
        deps.presentation === "data-grid" ? "Data grid" : "Spreadsheet grid",
      );
    }
    deps.scroller.setAttribute("aria-hidden", "true");
    deps.overlay.setAttribute("aria-hidden", "true");
    deps.viewport.querySelector("canvas")?.setAttribute("aria-hidden", "true");
  }

  bumpVersion(): void {
    this.version++;
  }

  setColumnCount(count: number): void {
    this.aria.setAttribute("aria-colcount", String(count));
    this.bumpVersion();
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly) this.aria.setAttribute("aria-readonly", "true");
    else this.aria.removeAttribute("aria-readonly");
  }

  /** Displayed data rows; the header row adds one to `aria-rowcount`. */
  setRowCount(count: number): void {
    this.row_count_value = String(count + 1);
  }

  /** Capture the painted window; `flush` writes it. */
  update(view: VisibleWindowView): void {
    const focus = this.focus_cell();
    const focus_id = focus ? `${this.aria.id}-${focus.row}-${focus.col}` : "";
    const key = `${view.rows.start}:${view.rows.end}:${view.cols.length}:${focus_id}:${this.version}`;
    if (key === this.key) return;
    this.key = key;

    const selection = this.selection();
    const n_cols = view.cols.length;
    const n_rows = view.rows.end - view.rows.start;
    this.focus_row = focus?.row ?? -1;
    this.focus_col = focus?.col ?? -1;
    this.selected_column = selection?.kind === "column" ? selection.col : null;
    this.selected_row = selection?.kind === "row" ? selection.row : null;
    this.row_start = view.rows.start;
    this.row_count = n_rows;
    this.cols.length = n_cols;
    this.header_texts.length = n_cols;
    let focus_col_shown = false;
    this.columns.length = n_cols;
    for (let column_index = 0; column_index < n_cols; column_index++) {
      const col = view.cols[column_index];
      if (col === undefined) throw new Error("ARIA header has no visible column");

      this.cols[column_index] = col;
      this.header_texts[column_index] = this.column_header(col);
      if (col === this.focus_col) focus_col_shown = true;
      this.columns[column_index] = this.column(col);
    }
    // The active cell can lie outside the mirrored window (scrolled away, or
    // hidden); `aria-activedescendant` then names nothing rather than a
    // missing id.
    const focus_row_shown = this.focus_row >= view.rows.start && this.focus_row < view.rows.end;
    this.focus_id = focus_row_shown && focus_col_shown ? focus_id : "";
    const cells = n_rows * n_cols;
    this.cell_texts.length = cells;
    this.cell_descriptions.length = cells;
    for (let row_index = 0; row_index < n_rows; row_index++) {
      const row = view.rows.start + row_index;
      for (let column_index = 0; column_index < n_cols; column_index++) {
        const index = row_index * n_cols + column_index;
        const value = view.values[index] ?? null;
        // The text the canvas paints, in the cell's number format: a date, not its serial.
        const column = this.columns[column_index];
        const format =
          view.styles[view.styleIds[index] ?? 0]?.numberFormat ??
          column?.cellStyle?.numberFormat ??
          column?.numberFormat;
        this.cell_texts[index] =
          value === null ? "" : cellDisplayText(value, format, column?.numberLocale);
        this.cell_descriptions[index] = this.description_at(row, this.cols[column_index] ?? -1);
      }
    }
    this.content_pending = true;
  }

  /** Write the captured content to the mirror and the host. */
  flush(): void {
    if (this.destroyed) return;
    if (this.aria.getAttribute("aria-rowcount") !== this.row_count_value) {
      this.aria.setAttribute("aria-rowcount", this.row_count_value);
    }
    if (!this.content_pending) return;
    this.content_pending = false;

    this.write_nodes();
    this.patch_headers();
    for (const [row_index, mirror_row] of this.rows.entries())
      this.patch_row(mirror_row, row_index);
    this.write_active_descendant(this.focus_id);
  }

  private write_active_descendant(focus_id: string): void {
    if (focus_id === this.last_focus_id) return;
    if (focus_id === "") this.host.removeAttribute("aria-activedescendant");
    else this.host.setAttribute("aria-activedescendant", focus_id);
    this.last_focus_id = focus_id;
  }

  private is_focused(row: number, col: number): boolean {
    return this.focus_row === row && this.focus_col === col;
  }

  /**
   * Make the mirror's nodes those of the captured window's columns and rows:
   * the nodes of columns and rows still in the window stay, the others are
   * removed or made. A new node gets its role and coordinates here; its text,
   * description and selection come from the patch that follows.
   */
  private write_nodes(): void {
    let head_row = this.head_row;
    if (head_row === null) {
      head_row = node("row");
      head_row.setAttribute("aria-rowindex", "1");
      this.aria.appendChild(head_row);
      this.head_row = head_row;
    }
    const n_cols = this.cols.length;
    const col_at = (index: number) => this.cols[index] ?? -1;
    this.headers = reconcile(head_row, this.headers, n_cols, col_at, (col) => {
      const el = node("columnheader");
      el.setAttribute("aria-colindex", String(col + 1));
      return { el, key: col, text: "", selected: false };
    });

    const cell_of = (row: number) => (col: number) => {
      const el = node("gridcell");
      el.setAttribute("aria-colindex", String(col + 1));
      el.id = `${this.aria.id}-${row}-${col}`;
      return { el, key: col, text: "", description: null, selected: false };
    };
    this.rows = reconcile(
      this.aria,
      this.rows,
      this.row_count,
      (index) => this.row_start + index,
      (row) => {
        const el = node("row");
        el.setAttribute("aria-rowindex", String(row + 2));
        const cells = reconcile(el, [], n_cols, col_at, cell_of(row));
        return { el, key: row, selected: false, cells };
      },
    );
    for (const mirror_row of this.rows) {
      mirror_row.cells = reconcile(
        mirror_row.el,
        mirror_row.cells,
        n_cols,
        col_at,
        cell_of(mirror_row.key),
      );
    }
  }

  /**
   * Write header labels and selection. Each value is compared with what the
   * node holds, not read back from the DOM, and only a changed value is
   * written.
   */
  private patch_headers(): void {
    for (const [column_index, header] of this.headers.entries()) {
      const selected = this.selected_column === header.key;
      if (selected !== header.selected) write_selected(header.el, selected);
      const text = this.header_texts[column_index] ?? "";
      if (text !== header.text) write_text(header.el, text);
      header.text = text;
      header.selected = selected;
    }
  }

  /** {@link patch_headers} for the row at `row_index` of the window and its cells. */
  private patch_row(mirror_row: MirrorRow, row_index: number): void {
    const row = mirror_row.key;
    const selected = this.selected_row === row;
    if (selected !== mirror_row.selected) write_selected(mirror_row.el, selected);
    mirror_row.selected = selected;

    const n_cols = this.cols.length;
    for (const [column_index, cell] of mirror_row.cells.entries()) {
      const index = row_index * n_cols + column_index;
      const text = this.cell_texts[index] ?? "";
      if (text !== cell.text) write_text(cell.el, text);
      const description = this.cell_descriptions[index] ?? null;
      if (description !== cell.description) {
        if (description === null) cell.el.removeAttribute("aria-description");
        else cell.el.setAttribute("aria-description", description);
      }
      const focused = this.is_focused(row, cell.key);
      if (focused !== cell.selected) write_selected(cell.el, focused);
      cell.text = text;
      cell.description = description;
      cell.selected = focused;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.aria.remove();
    this.host.removeAttribute("role");
    this.host.removeAttribute("aria-activedescendant");
  }

  get element(): HTMLDivElement {
    return this.aria;
  }
}
