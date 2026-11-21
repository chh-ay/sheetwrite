import type { CellRef } from "./selection.js";
import type { Selection } from "./types/coordinates.js";
import type { VisibleWindowView } from "./types/store.js";

let ariaSeq = 0;

function writeSelected(element: HTMLElement, selected: boolean): void {
  if (selected) element.setAttribute("aria-selected", "true");
  else element.removeAttribute("aria-selected");
}

/**
 * Make `element`'s text `text`. A cell that holds one text node keeps it and
 * gets the new data: `textContent` would replace the node, and the browser
 * would then rebuild the cell's layout box, in every shown cell a loaded page
 * of values fills.
 */
function writeText(element: HTMLElement, text: string): void {
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
 * Make `parent`'s nodes `items` the nodes of the keys `keyAt(0)` to
 * `keyAt(count - 1)`, in that order. A node whose key stays in the window
 * stays as it is; a node whose key left is removed, and `create` makes the
 * node of a new key. A scroll by a column or a row then adds and removes a few
 * nodes instead of rewriting the coordinates and text of every cell. Keys
 * ascend in both lists, so one pass over them places every node.
 */
function reconcile<T extends Keyed>(
  parent: HTMLElement,
  items: readonly T[],
  count: number,
  keyAt: (index: number) => number,
  create: (key: number) => T,
): T[] {
  const next: T[] = [];
  let old = 0;
  for (let index = 0; index < count; index++) {
    const key = keyAt(index);
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
  focusCell: () => CellRef | null;
  /** The description of the cell at view `row`, `col`: its note and input message. */
  descriptionAt: (row: number, col: number) => string | null;
  selection: () => Selection | null;
}

/**
 * Keeps a compact, screen-reader-visible mirror of the rendered window while the
 * canvas and overlay remain hidden from assistive technology.
 *
 * A paint only captures the mirror's content (`update`, `setRowCount`); the
 * paint's last step, `flush`, writes the DOM, after the paint's layout reads.
 * Writing it earlier would make a later read in the same paint (the editor's
 * position, a scroll listener) lay out the mirror first.
 */
export class AriaMirror {
  private readonly host: HTMLElement;
  private readonly aria: HTMLDivElement;
  private readonly focusCell: () => CellRef | null;
  private readonly descriptionAt: (row: number, col: number) => string | null;
  private readonly columnHeader: (col: number) => string;
  private readonly selection: () => Selection | null;
  private key = "";
  private version = 0;

  // Captured content that the next flush writes.
  private contentPending = false;
  private rowCountValue: string;
  private focusId = "";
  private rowStart = 0;
  private rowCount = 0;
  private focusRow = -1;
  private focusCol = -1;
  private selectedRow: number | null = null;
  private selectedColumn: number | null = null;
  private readonly cols: number[] = [];
  private readonly headerTexts: string[] = [];
  private readonly cellTexts: string[] = [];
  private readonly cellDescriptions: (string | null)[] = [];
  /** A paint can destroy the grid (a listener); its flush must not write the host again. */
  private destroyed = false;

  /** Last `aria-activedescendant` written to the host; avoids redundant writes. */
  private lastFocusId: string | null = null;

  // The live nodes with what each holds, keyed by column and view row.
  private headRow: HTMLDivElement | null = null;
  private headers: MirrorHeader[] = [];
  private rows: MirrorRow[] = [];

  constructor(deps: AriaMirrorDeps) {
    this.host = deps.host;
    this.focusCell = deps.focusCell;
    this.descriptionAt = deps.descriptionAt;
    this.columnHeader = deps.columnHeader;
    this.selection = deps.selection;

    const aria = document.createElement("div");
    aria.className = "sheetwrite-aria";
    aria.id = `sheetwrite-grid-${++ariaSeq}`;
    aria.setAttribute("role", "rowgroup");
    aria.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";
    deps.host.appendChild(aria);
    this.aria = aria;

    this.rowCountValue = String(deps.rowCount + 1);
    deps.host.setAttribute("role", "grid");
    deps.host.setAttribute("aria-multiselectable", "true");
    deps.host.setAttribute("aria-rowcount", this.rowCountValue);
    deps.host.setAttribute("aria-colcount", String(deps.colCount));
    if (deps.readOnly) deps.host.setAttribute("aria-readonly", "true");
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
    this.host.setAttribute("aria-colcount", String(count));
    this.bumpVersion();
  }

  /** Displayed data rows; the header row adds one to `aria-rowcount`. */
  setRowCount(count: number): void {
    this.rowCountValue = String(count + 1);
  }

  /** Capture the painted window; `flush` writes it. */
  update(view: VisibleWindowView): void {
    const focus = this.focusCell();
    const focusId = focus ? `${this.aria.id}-${focus.row}-${focus.col}` : "";
    const key = `${view.rows.start}:${view.rows.end}:${view.cols.length}:${focusId}:${this.version}`;
    if (key === this.key) return;
    this.key = key;

    const selection = this.selection();
    const nCols = view.cols.length;
    const nRows = view.rows.end - view.rows.start;
    this.focusId = focusId;
    this.focusRow = focus?.row ?? -1;
    this.focusCol = focus?.col ?? -1;
    this.selectedColumn = selection?.kind === "column" ? selection.col : null;
    this.selectedRow = selection?.kind === "row" ? selection.row : null;
    this.rowStart = view.rows.start;
    this.rowCount = nRows;
    this.cols.length = nCols;
    this.headerTexts.length = nCols;
    for (let columnIndex = 0; columnIndex < nCols; columnIndex++) {
      const col = view.cols[columnIndex];
      if (col === undefined) throw new Error("ARIA header has no visible column");

      this.cols[columnIndex] = col;
      this.headerTexts[columnIndex] = this.columnHeader(col);
    }
    const cells = nRows * nCols;
    this.cellTexts.length = cells;
    this.cellDescriptions.length = cells;
    for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
      const row = view.rows.start + rowIndex;
      for (let columnIndex = 0; columnIndex < nCols; columnIndex++) {
        const index = rowIndex * nCols + columnIndex;
        const value = view.values[index] ?? null;
        this.cellTexts[index] = value !== null ? String(value) : "";
        this.cellDescriptions[index] = this.descriptionAt(row, this.cols[columnIndex] ?? -1);
      }
    }
    this.contentPending = true;
  }

  /** Write the captured content to the mirror and the host. */
  flush(): void {
    if (this.destroyed) return;
    if (this.host.getAttribute("aria-rowcount") !== this.rowCountValue) {
      this.host.setAttribute("aria-rowcount", this.rowCountValue);
    }
    if (!this.contentPending) return;
    this.contentPending = false;

    this.writeNodes();
    this.patchHeaders();
    for (const [rowIndex, mirrorRow] of this.rows.entries()) this.patchRow(mirrorRow, rowIndex);
    this.writeActiveDescendant(this.focusId);
  }

  private writeActiveDescendant(focusId: string): void {
    if (focusId === this.lastFocusId) return;
    this.host.setAttribute("aria-activedescendant", focusId);
    this.lastFocusId = focusId;
  }

  private isFocused(row: number, col: number): boolean {
    return this.focusRow === row && this.focusCol === col;
  }

  /**
   * Make the mirror's nodes those of the captured window's columns and rows:
   * the nodes of columns and rows still in the window stay, the others are
   * removed or made. A new node gets its role and coordinates here; its text,
   * description and selection come from the patch that follows.
   */
  private writeNodes(): void {
    let headRow = this.headRow;
    if (headRow === null) {
      headRow = node("row");
      headRow.setAttribute("aria-rowindex", "1");
      this.aria.appendChild(headRow);
      this.headRow = headRow;
    }
    const nCols = this.cols.length;
    const colAt = (index: number) => this.cols[index] ?? -1;
    this.headers = reconcile(headRow, this.headers, nCols, colAt, (col) => {
      const el = node("columnheader");
      el.setAttribute("aria-colindex", String(col + 1));
      return { el, key: col, text: "", selected: false };
    });

    const cellOf = (row: number) => (col: number) => {
      const el = node("gridcell");
      el.setAttribute("aria-colindex", String(col + 1));
      el.id = `${this.aria.id}-${row}-${col}`;
      return { el, key: col, text: "", description: null, selected: false };
    };
    this.rows = reconcile(
      this.aria,
      this.rows,
      this.rowCount,
      (index) => this.rowStart + index,
      (row) => {
        const el = node("row");
        el.setAttribute("aria-rowindex", String(row + 2));
        const cells = reconcile(el, [], nCols, colAt, cellOf(row));
        return { el, key: row, selected: false, cells };
      },
    );
    for (const mirrorRow of this.rows) {
      mirrorRow.cells = reconcile(
        mirrorRow.el,
        mirrorRow.cells,
        nCols,
        colAt,
        cellOf(mirrorRow.key),
      );
    }
  }

  /**
   * Write header labels and selection. Each value is compared with what the
   * node holds, not read back from the DOM, and only a changed value is
   * written.
   */
  private patchHeaders(): void {
    for (const [columnIndex, header] of this.headers.entries()) {
      const selected = this.selectedColumn === header.key;
      if (selected !== header.selected) writeSelected(header.el, selected);
      const text = this.headerTexts[columnIndex] ?? "";
      if (text !== header.text) writeText(header.el, text);
      header.text = text;
      header.selected = selected;
    }
  }

  /** {@link patchHeaders} for the row at `rowIndex` of the window and its cells. */
  private patchRow(mirrorRow: MirrorRow, rowIndex: number): void {
    const row = mirrorRow.key;
    const selected = this.selectedRow === row;
    if (selected !== mirrorRow.selected) writeSelected(mirrorRow.el, selected);
    mirrorRow.selected = selected;

    const nCols = this.cols.length;
    for (const [columnIndex, cell] of mirrorRow.cells.entries()) {
      const index = rowIndex * nCols + columnIndex;
      const text = this.cellTexts[index] ?? "";
      if (text !== cell.text) writeText(cell.el, text);
      const description = this.cellDescriptions[index] ?? null;
      if (description !== cell.description) {
        if (description === null) cell.el.removeAttribute("aria-description");
        else cell.el.setAttribute("aria-description", description);
      }
      const focused = this.isFocused(row, cell.key);
      if (focused !== cell.selected) writeSelected(cell.el, focused);
      cell.text = text;
      cell.description = description;
      cell.selected = focused;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.aria.remove();
    for (const attr of [
      "role",
      "aria-multiselectable",
      "aria-rowcount",
      "aria-colcount",
      "aria-readonly",
      "aria-activedescendant",
    ]) {
      this.host.removeAttribute(attr);
    }
  }

  get element(): HTMLDivElement {
    return this.aria;
  }
}
