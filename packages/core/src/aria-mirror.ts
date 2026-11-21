import { cellDisplayText } from "./canvas-paint.js";
import type { CellRef } from "./selection.js";
import type { Column } from "./types/cell.js";
import type { Selection } from "./types/coordinates.js";
import type { VisibleWindowView } from "./types/store.js";

let ariaSeq = 0;

function writeSelected(element: HTMLElement, selected: boolean): void {
  if (selected) element.setAttribute("aria-selected", "true");
  else element.removeAttribute("aria-selected");
}

/** Make `target` hold the values of `source`, reusing its storage. */
function copyInto<T>(target: T[], source: readonly T[]): void {
  target.length = source.length;
  for (const [index, value] of source.entries()) target[index] = value;
}

/**
 * The window content the mirror nodes hold: what the last flush wrote. A
 * patch compares against it instead of reading attributes back from the DOM.
 */
class WrittenWindow {
  rowStart = 0;
  focusRow = -1;
  focusCol = -1;
  selectedRow: number | null = null;
  selectedColumn: number | null = null;
  readonly cols: number[] = [];
  readonly headerTexts: string[] = [];
  readonly cellTexts: string[] = [];
  readonly cellDescriptions: (string | null)[] = [];
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
  private readonly column: (col: number) => Column | undefined;
  /** The painted window's columns, parallel to `cols`. */
  private readonly columns: (Column | undefined)[] = [];
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

  // Shape of the last rebuild plus the live nodes it produced. When a fresh
  // window has the same nRows × nCols we patch these in place; a differing
  // window shape forces a full rebuild.
  private lastNRows = -1;
  private lastNCols = -1;
  private headerCells: HTMLDivElement[] = [];
  private rowEls: HTMLDivElement[] = [];
  private cellEls: HTMLDivElement[] = [];
  /** What those nodes hold, so a patch writes only what changed. */
  private readonly written = new WrittenWindow();

  constructor(deps: AriaMirrorDeps) {
    this.host = deps.host;
    this.focusCell = deps.focusCell;
    this.descriptionAt = deps.descriptionAt;
    this.columnHeader = deps.columnHeader;
    this.column = deps.column;
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
    this.columns.length = nCols;
    for (let columnIndex = 0; columnIndex < nCols; columnIndex++) {
      const col = view.cols[columnIndex];
      if (col === undefined) throw new Error("ARIA header has no visible column");

      this.cols[columnIndex] = col;
      this.headerTexts[columnIndex] = this.columnHeader(col);
      this.columns[columnIndex] = this.column(col);
    }
    const cells = nRows * nCols;
    this.cellTexts.length = cells;
    this.cellDescriptions.length = cells;
    for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
      const row = view.rows.start + rowIndex;
      for (let columnIndex = 0; columnIndex < nCols; columnIndex++) {
        const index = rowIndex * nCols + columnIndex;
        const value = view.values[index] ?? null;
        // The text the canvas paints, in the cell's number format: a date, not its serial.
        const column = this.columns[columnIndex];
        const format =
          view.styles[view.styleIds[index] ?? 0]?.numberFormat ??
          column?.cellStyle?.numberFormat ??
          column?.numberFormat;
        this.cellTexts[index] =
          value === null ? "" : cellDisplayText(value, format, column?.numberLocale);
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

    const nCols = this.cols.length;
    if (this.rowCount === this.lastNRows && nCols === this.lastNCols) {
      this.patchInPlace(nCols);
    } else {
      this.rebuild(nCols);
      this.lastNRows = this.rowCount;
      this.lastNCols = nCols;
    }
    this.recordWritten();
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

  /** Full teardown: build a fresh header + data grid and cache its nodes. */
  private rebuild(nCols: number): void {
    const frag = document.createDocumentFragment();
    this.headerCells = [];
    this.rowEls = [];
    this.cellEls = [];

    const headRow = document.createElement("div");
    headRow.setAttribute("role", "row");
    headRow.setAttribute("aria-rowindex", "1");
    for (let cj = 0; cj < nCols; cj++) {
      const col = this.cols[cj] ?? -1;
      const cell = document.createElement("div");
      cell.setAttribute("role", "columnheader");
      if (this.selectedColumn === col) cell.setAttribute("aria-selected", "true");
      cell.setAttribute("aria-colindex", String(col + 1));
      cell.textContent = this.headerTexts[cj] ?? "";
      headRow.appendChild(cell);
      this.headerCells.push(cell);
    }
    frag.appendChild(headRow);

    for (let ri = 0; ri < this.rowCount; ri++) {
      const row = this.rowStart + ri;
      const rowEl = document.createElement("div");
      if (this.selectedRow === row) rowEl.setAttribute("aria-selected", "true");
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-rowindex", String(row + 2));
      for (let cj = 0; cj < nCols; cj++) {
        const col = this.cols[cj] ?? -1;
        const index = ri * nCols + cj;
        const cell = document.createElement("div");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(col + 1));
        cell.id = `${this.aria.id}-${row}-${col}`;
        const text = this.cellTexts[index] ?? "";
        if (text !== "") cell.textContent = text;
        const description = this.cellDescriptions[index] ?? null;
        if (description !== null) cell.setAttribute("aria-description", description);
        if (this.isFocused(row, col)) cell.setAttribute("aria-selected", "true");
        rowEl.appendChild(cell);
        this.cellEls.push(cell);
      }
      frag.appendChild(rowEl);
      this.rowEls.push(rowEl);
    }

    this.aria.replaceChildren(frag);
  }

  /**
   * Same shape, shifted window: rewrite absolute header/cell column indices,
   * labels, per-row `aria-rowindex`, ids, text, and selection state on the
   * retained nodes. Each value is compared with what the last flush wrote,
   * not read back from the DOM, and only a changed value is written.
   */
  private patchInPlace(nCols: number): void {
    this.patchHeaders();
    for (const [rowIndex, rowElement] of this.rowEls.entries()) {
      this.patchRow(rowElement, rowIndex, nCols);
    }
  }

  private patchHeaders(): void {
    const was = this.written;
    for (const [columnIndex, header] of this.headerCells.entries()) {
      const col = this.cols[columnIndex] ?? -1;
      const wasCol = was.cols[columnIndex] ?? -1;
      const selected = this.selectedColumn === col;
      if (selected !== (was.selectedColumn === wasCol)) writeSelected(header, selected);
      const text = this.headerTexts[columnIndex] ?? "";
      if (text !== was.headerTexts[columnIndex]) header.textContent = text;
      if (col !== wasCol) header.setAttribute("aria-colindex", String(col + 1));
    }
  }

  private patchRow(rowElement: HTMLDivElement, rowIndex: number, nCols: number): void {
    const was = this.written;
    const row = this.rowStart + rowIndex;
    const wasRow = was.rowStart + rowIndex;
    const selected = this.selectedRow === row;
    if (selected !== (was.selectedRow === wasRow)) writeSelected(rowElement, selected);
    if (row !== wasRow) rowElement.setAttribute("aria-rowindex", String(row + 2));

    for (let columnIndex = 0; columnIndex < nCols; columnIndex++) {
      const col = this.cols[columnIndex] ?? -1;
      const wasCol = was.cols[columnIndex] ?? -1;
      const index = rowIndex * nCols + columnIndex;
      const cell = this.cellEls[index];
      if (cell === undefined) throw new Error("ARIA cell has no visible coordinate");

      if (row !== wasRow || col !== wasCol) cell.id = `${this.aria.id}-${row}-${col}`;
      if (col !== wasCol) cell.setAttribute("aria-colindex", String(col + 1));
      const text = this.cellTexts[index] ?? "";
      if (text !== was.cellTexts[index]) cell.textContent = text;
      const description = this.cellDescriptions[index] ?? null;
      if (description !== (was.cellDescriptions[index] ?? null)) {
        if (description === null) cell.removeAttribute("aria-description");
        else cell.setAttribute("aria-description", description);
      }
      const focused = this.isFocused(row, col);
      if (focused !== (was.focusRow === wasRow && was.focusCol === wasCol)) {
        writeSelected(cell, focused);
      }
    }
  }

  /** Record the captured content as what the mirror nodes now hold. */
  private recordWritten(): void {
    const was = this.written;
    was.rowStart = this.rowStart;
    was.focusRow = this.focusRow;
    was.focusCol = this.focusCol;
    was.selectedRow = this.selectedRow;
    was.selectedColumn = this.selectedColumn;
    copyInto(was.cols, this.cols);
    copyInto(was.headerTexts, this.headerTexts);
    copyInto(was.cellTexts, this.cellTexts);
    copyInto(was.cellDescriptions, this.cellDescriptions);
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
