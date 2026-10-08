import { cellA1, rangeA1, shiftA1Refs } from "./a1.js";
import { cellScalarToText, parseCellInput } from "./cell-input.js";
import { ContextMenu } from "./context-menu.js";
import { CustomEditorController } from "./custom-editor.js";
import { EditController, type EditNavigate } from "./editor.js";
import { detectFillSeries, type FillSeries, type FillSourceCell } from "./fill-series.js";
import type { FindBar } from "./find-bar.js";
import { formatNumber } from "./number-format.js";
import { autofitColumnWidth, MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT, resizeTargetAt } from "./resize.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import type { CellValue } from "./types/cell.js";
import type { CellAddress, HighlightRange, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, Sheet } from "./types/document.js";
import type { CellEditor, CellEditorRect, Grid, GridConfig, GridEvents } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";
import type { ApplyTransactionResult } from "./types/transaction.js";
import { ValidationEditor } from "./validation-editor.js";

const PRINTABLE = /^.$/u;

interface InteractionDependencies {
  host: HTMLElement;
  scroller: HTMLDivElement;
  viewportEl: HTMLDivElement;
  grid: Grid;
  customEditors: ReadonlyMap<string, CellEditor>;
  highlightCells: (ranges: HighlightRange[] | null) => void;
  columnHeader: (col: number) => string;
  toViewRow: (dataRow: number) => number | null;
  notify: <K extends "edit-begin" | "edit-commit">(event: K, payload: GridEvents[K]) => void;
  findBar: () => FindBar | null;
  store: Store;
  loadable: SheetwriteStore | null;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  theme: () => Theme;
  colIndices: () => number[];
  firstCol: () => number;
  lastCol: () => number;
  nextVisibleCol: (col: number, dir: 1 | -1) => number;
  /** Visible column before `col`, or -1 when `col` is hidden or the first one. */
  previousVisibleColumn: (col: number) => number;
  colAtX: (contentX: number) => number;
  rowAtOffset: (contentY: number) => number;
  /**
   * Freeze-aware viewport→content mapping: coordinates inside a frozen band
   * resolve without the scroll offset, body coordinates with it. All pointer
   * hit-testing MUST go through these, never raw scroll math.
   */
  contentXAt: (viewportX: number) => number;
  contentYAt: (viewportY: number) => number;
  /** Content zoom: pointer deltas are screen px, persisted sizes base units. */
  zoom: () => number;
  rowCount: () => number;
  contentTop: () => number;
  viewportH: () => number;
  /** Left content-X of a visible column (for boundary hit-testing). */
  colLeftOf: (col: number) => number;
  /** Top content-Y and height of a row (for row-boundary hit-testing). */
  rowTop: (row: number) => number;
  rowHeight: (row: number) => number;
  /** Current vertical render window, for event-driven autofit measurement. */
  visibleRowWindow: () => { start: number; end: number };
  /** Live column-resize preview: set the width and re-lay-out without committing. */
  previewColumnWidth: (col: number, width: number) => void;
  previewRowHeight: (row: number, height: number) => void;
  clearResizePreview: () => void;
  /**
   * Ctrl+Arrow data-edge target for the moved axis (row for vertical, col for
   * horizontal), or null when unsupported (non-columnar store or an active
   * sort/filter view) — callers then fall back to the sheet edge.
   */
  dataEdge: (row: number, col: number, dRow: number, dCol: number) => number | null;
  /**
   * Stock-keymap policy: `false` disables every built-in binding, a function
   * intercepts first (returning true consumes the event). See GridConfig.keyboard.
   */
  keyboard: () => boolean | ((e: KeyboardEvent) => boolean);
  screenRect: (
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ) => { x: number; y: number; w: number; h: number };
  anchorCell: (row: number, col: number) => CellRef;
  toDataRow: (viewRow: number) => number;
  clearSelection: () => void;
  emitSelection: () => void;
  scrollToCell: (addr: CellAddress) => void;
  /** Ctrl/Meta-click host-safe hyperlink activation. */
  activateHyperlink: (addr: CellAddress) => boolean;
  scheduleRender: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  pasteValues: () => void;
  commit: (patches: DocumentOp[], reason: CommitReason) => ApplyTransactionResult;
  readOnly: () => boolean;
}

/**
 * Owns grid pointer/keyboard input, including formula point-mode and fill-drag
 * interactions, while delegating mutations back through the grid shell.
 */
export class InteractionSessions {
  private readonly deps: InteractionDependencies;
  private readonly editor: EditController;
  private readonly validationEditor: ValidationEditor;
  private readonly customEditor: CustomEditorController;
  private contextMenu: ContextMenu | null = null;
  private editingAddress: Readonly<CellAddress> | null = null;
  private activeEditor: EditController | ValidationEditor | CustomEditorController | null = null;
  private generation = 0;
  private fillTarget: SelRect | null = null;
  private dragMove: ((ev: PointerEvent) => void) | null = null;
  private dragUp: ((ev: PointerEvent) => void) | null = null;
  private dragCancel: ((ev: PointerEvent) => void) | null = null;
  /** Pointer that owns the active drag; other pointers' events are ignored. */
  private activePointerId: number | null = null;
  /** Detached 2D context for autofit text measurement; lazily created. */
  private measureCtx: CanvasRenderingContext2D | null = null;

  constructor(deps: InteractionDependencies) {
    this.deps = deps;
    this.editor = new EditController(deps.viewportEl, {
      highlightCells: deps.highlightCells,
      sheet: deps.activeSheet,
    });
    this.validationEditor = new ValidationEditor(deps.viewportEl);
    this.customEditor = new CustomEditorController(deps.viewportEl);
    deps.scroller.addEventListener("contextmenu", this.onContextMenu);
    deps.scroller.addEventListener("pointerdown", this.onPointerDown);
    deps.scroller.addEventListener("dblclick", this.onDblClick);
    deps.scroller.addEventListener("pointermove", this.onHover);
    deps.host.addEventListener("keydown", this.onKeyDown);
  }

  get isEditing(): boolean {
    return this.activeEditor !== null;
  }

  configureMenu(config: GridConfig | undefined, theme: Theme): void {
    this.contextMenu?.destroy();
    this.contextMenu =
      config?.contextMenu === false
        ? null
        : new ContextMenu(
            this.deps.host,
            config ?? {},
            theme,
            this.deps.grid.actions,
            this.deps.grid,
          );
  }

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (!this.contextMenu) return;
    e.preventDefault();
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    const address = cell ? { sheet: this.deps.activeSheet(), ...cell } : null;
    const selection = this.deps.selection();
    if (cell && !selection.contains(cell.row, cell.col)) {
      selection.selectCell(cell.row, cell.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
    }
    this.contextMenu.open({ cell: address, clientX: e.clientX, clientY: e.clientY });
  };

  reconcile(change: "view" | "sheet" | "structure" | "read-only" | "value"): void {
    if (change !== "value") this.cancelPointer();
    if (change === "sheet" || change === "structure" || change === "read-only") {
      this.cancelEditor();
      return;
    }
    const address = this.editingAddress;
    if (!address) return;
    const viewRow = this.deps.toViewRow(address.row);
    const column = this.deps.sheet().columns[address.col];
    if (address.sheet !== this.deps.activeSheet() || viewRow === null || !column) {
      this.cancelEditor();
      return;
    }
    if (this.activeEditor === this.customEditor) {
      const value = this.deps.store.getCell(address).resolved;
      const formula =
        this.deps.loadable?.getFormula(address) ?? this.deps.store.getFormula(address);
      this.customEditor.update({
        viewAddress: { sheet: address.sheet, row: viewRow, col: address.col },
        column,
        value,
        text: formula ?? cellScalarToText(value),
        label: this.editorLabel(viewRow, address.col),
      });
    }
  }

  reposition(contentTop: number, scrollLeft: number): void {
    const address = this.editingAddress;
    if (!address) return;
    const row = this.deps.toViewRow(address.row);
    if (row === null) return;
    const rect = this.deps.screenRect(row, address.col, contentTop, scrollLeft);
    const editor = this.activeEditor;
    if (editor instanceof CustomEditorController) {
      editor.position({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
    } else {
      editor?.position(rect);
    }
  }

  private editorLabel(row: number, col: number): string {
    return `Edit ${this.deps.columnHeader(col)}, row ${row + 1}`;
  }

  private editorRect(
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ): CellEditorRect {
    const rect = this.deps.screenRect(row, col, contentTop, scrollLeft);
    return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
  }

  private endEditor(): void {
    this.editingAddress = null;
    this.activeEditor = null;
    this.deps.host.focus();
    this.deps.scheduleRender();
  }

  private cancelEditor(): void {
    ++this.generation;
    this.editingAddress = null;
    const editor = this.activeEditor;
    this.activeEditor = null;
    editor?.cancel();
  }

  private finishEdit(
    address: Readonly<CellAddress>,
    input: string | CellValue,
    navigate: EditNavigate,
  ): void {
    if (this.editingAddress !== address) return;
    this.editingAddress = null;
    this.activeEditor = null;
    if (address.sheet !== this.deps.activeSheet()) return;
    const viewRow = this.deps.toViewRow(address.row);
    if (viewRow === null) return;
    const column = this.deps.sheet().columns[address.col];
    const value = typeof input === "string" ? parseCellInput(input, column?.type ?? "text") : input;
    this.commitCellEditAt(address, viewRow, value, navigate);
  }

  private cancelPointer(): void {
    if (this.activePointerId === null) return;
    const cancel = this.dragCancel;
    if (cancel) cancel(new PointerEvent("pointercancel", { pointerId: this.activePointerId }));
    else this.detachDrag();
  }

  beginEdit(row: number, col: number, initial?: string, selectAll = false): void {
    if (this.deps.readOnly()) return;

    const editCell = this.deps.anchorCell(row, col);
    const sheet = this.deps.sheet();
    const column = sheet.columns[editCell.col];
    if (!column) return;

    const dataAddr = {
      sheet: this.deps.activeSheet(),
      row: this.deps.toDataRow(editCell.row),
      col: editCell.col,
    };
    const formula = this.deps.loadable?.getFormula(dataAddr) ?? null;
    const current = this.deps.store.getCell(dataAddr).resolved;
    const text = initial ?? formula ?? (current === null ? "" : String(current));
    const contentTop = this.deps.contentTop();

    this.cancelPointer();
    this.cancelEditor();
    const generation = ++this.generation;
    this.editingAddress = dataAddr;
    const selection = this.deps.selection();
    const focus = selection.focusCell;
    const selectionChanged =
      !focus ||
      focus.row !== editCell.row ||
      focus.col !== editCell.col ||
      selection.toSelection(dataAddr.sheet)?.kind !== "cell";
    selection.selectCell(editCell.row, editCell.col);
    this.deps.scheduleRender();
    if (selectionChanged) this.deps.emitSelection();
    if (generation !== this.generation || this.deps.readOnly()) return;
    this.deps.notify("edit-begin", {
      addr: { sheet: dataAddr.sheet, row: editCell.row, col: editCell.col },
    });
    // edit-begin remains a before-open notification. Reentrant callbacks can
    // replace or invalidate this request, but cannot reopen its stale target.
    if (generation !== this.generation || this.deps.readOnly()) return;

    const validationRule = sheet.validationRules?.find(
      (rule) =>
        rule.range.sheet === dataAddr.sheet &&
        dataAddr.row >= Math.min(rule.range.start.row, rule.range.end.row) &&
        dataAddr.row <= Math.max(rule.range.start.row, rule.range.end.row) &&
        dataAddr.col >= Math.min(rule.range.start.col, rule.range.end.col) &&
        dataAddr.col <= Math.max(rule.range.start.col, rule.range.end.col) &&
        (rule.condition.kind === "list" || rule.condition.kind === "checkbox"),
    );
    const custom = column.editor ? this.deps.customEditors.get(column.editor) : undefined;
    if (custom) {
      this.activeEditor = this.customEditor;
      this.customEditor.begin({
        editor: custom,
        grid: this.deps.grid,
        address: dataAddr,
        viewAddress: { sheet: this.deps.activeSheet(), row: editCell.row, col: editCell.col },
        column,
        value: current,
        text,
        initialInput: initial,
        selectAll: selectAll || initial === undefined,
        label: this.editorLabel(editCell.row, editCell.col),
        rect: this.editorRect(
          editCell.row,
          editCell.col,
          contentTop,
          this.deps.scroller.scrollLeft,
        ),
        onCommit: (value, navigate) => this.finishEdit(dataAddr, value, navigate),
        onCancel: () => this.endEditor(),
      });
      return;
    }
    if (initial === undefined && validationRule) {
      this.activeEditor = this.validationEditor;
      this.validationEditor.begin({
        row: editCell.row,
        col: editCell.col,
        rule: validationRule,
        current,
        rect: this.deps.screenRect(
          editCell.row,
          editCell.col,
          contentTop,
          this.deps.scroller.scrollLeft,
        ),
        theme: this.deps.theme(),
        onCommit: (value, navigate) =>
          this.finishEdit(dataAddr, { kind: "literal", value }, navigate),
        onCancel: () => this.endEditor(),
      });
      return;
    }
    this.activeEditor = this.editor;
    this.editor.begin({
      row: editCell.row,
      col: editCell.col,
      type: column.type,
      initial: text,
      selectAll: selectAll || initial === undefined,
      rect: this.deps.screenRect(
        editCell.row,
        editCell.col,
        contentTop,
        this.deps.scroller.scrollLeft,
      ),
      label: this.editorLabel(editCell.row, editCell.col),
      theme: this.deps.theme(),
      onCommit: (value, navigate) => this.finishEdit(dataAddr, value, navigate),
      onCancel: () => this.endEditor(),
    });
  }

  private commitCellEditAt(
    address: Readonly<CellAddress>,
    viewRow: number,
    value: CellValue,
    navigate: EditNavigate,
  ): void {
    const reason: CommitReason =
      navigate === "down" ? "edit-enter" : navigate === "none" ? "edit-blur" : "edit-tab";
    const outcome = this.deps.commit(
      [
        {
          op: "set",
          addr: { ...address },
          value,
        },
      ],
      reason,
    );

    if (outcome.status === "applied") {
      this.deps.notify("edit-commit", {
        addr: { sheet: address.sheet, row: viewRow, col: address.col },
        value,
      });
      this.moveAfterCommit(viewRow, address.col, navigate);
    }
    this.deps.host.focus();
    this.deps.scheduleRender();
  }

  private moveAfterCommit(row: number, col: number, navigate: EditNavigate): void {
    const sheet = this.deps.sheet();
    if (navigate === "down")
      this.deps.selection().selectCell(Math.min(sheet.rowCount - 1, row + 1), col);
    else if (navigate === "right")
      this.deps.selection().selectCell(row, this.deps.nextVisibleCol(col, 1));
    else if (navigate === "left")
      this.deps.selection().selectCell(row, this.deps.nextVisibleCol(col, -1));
    else this.deps.selection().selectCell(row, col);
    this.deps.emitSelection();
    const f = this.deps.selection().focusCell;
    if (f) this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: f.row, col: f.col });
  }

  get fillPreview(): SelRect | null {
    return this.fillTarget;
  }

  cellAtPointer(clientX: number, clientY: number): CellRef | null {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const py = clientY - rect.top;
    const theme = this.deps.theme();
    if (py < theme.headerHeight) return null;

    const contentX = this.deps.contentXAt(clientX - rect.left);
    const contentY = this.deps.contentYAt(py);

    const row = this.deps.rowAtOffset(Math.max(0, contentY));
    const col = this.deps.colAtX(Math.max(0, contentX));
    if (col === -1 || row < 0 || row >= this.deps.sheet().rowCount) return null;

    return this.deps.anchorCell(row, col);
  }

  fillHandleScreen(contentTop: number, scrollLeft: number): { x: number; y: number } | null {
    if (this.deps.loadable?.hasView(this.deps.activeSheet())) return null;
    const src = this.fillSourceRect();
    if (!src) return null;
    const r = this.deps.screenRect(src.r1, src.c1, contentTop, scrollLeft);
    const y = r.y + r.h;
    if (y < this.deps.theme().headerHeight) return null;
    return { x: r.x + r.w, y };
  }

  destroy(): void {
    this.cancelPointer();
    this.cancelEditor();
    this.editor.destroy();
    this.validationEditor.destroy();
    this.customEditor.destroy();
    this.contextMenu?.destroy();
    this.deps.scroller.removeEventListener("contextmenu", this.onContextMenu);
    this.deps.scroller.removeEventListener("pointerdown", this.onPointerDown);
    this.deps.scroller.removeEventListener("dblclick", this.onDblClick);
    this.deps.scroller.removeEventListener("pointermove", this.onHover);
    this.deps.host.removeEventListener("keydown", this.onKeyDown);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    // Primary button only. Touch contacts always report button 0; a pen barrel
    // button (non-zero) must not select, so the guard covers mouse AND pen.
    if (e.pointerType !== "touch" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch";

    const editor = this.editor;
    // Formula point mode: while editing a "=" formula, clicks/drags pick A1
    // references into the editor instead of moving the grid selection.
    if (editor.isEditing && editor.value.startsWith("=")) {
      e.preventDefault();
      const start = this.cellAtPointer(e.clientX, e.clientY);
      if (!start) return;
      editor.setReference(cellA1(start.row, start.col));
      const move = (ev: PointerEvent): void => {
        const c = this.cellAtPointer(ev.clientX, ev.clientY);
        if (c) editor.setReference(rangeA1(start, c));
      };
      const up = (): void => {
        editor.endReference();
        this.detachDrag();
      };
      this.attachDrag(e, move, up, up);
      return;
    }
    // A selected cell must own subsequent keyboard input across browsers.
    // Keep touch and active-editor gestures focused where they already are.
    if (!isTouch && !this.isEditing) this.deps.host.focus({ preventScroll: true });

    const viewportRect = this.deps.viewportEl.getBoundingClientRect();
    const fillHandle = this.fillHandleScreen(this.deps.contentTop(), this.deps.scroller.scrollLeft);
    if (fillHandle && !this.isEditing) {
      const hx = e.clientX - viewportRect.left;
      const hy = e.clientY - viewportRect.top;
      if (Math.abs(hx - fillHandle.x) <= 5 && Math.abs(hy - fillHandle.y) <= 5) {
        e.preventDefault();
        this.startFillDrag(e);
        return;
      }
    }

    // Resize gesture: near a column boundary in the top header, or a row boundary
    // in the left gutter. Takes priority over selection; disabled while editing.
    if (!this.isEditing && !this.deps.readOnly()) {
      const resize = this.resizeAt(e);
      if (resize) {
        e.preventDefault();
        if (resize.kind === "col") this.startColumnResize(e, resize.index, e.clientX);
        else this.startRowResize(e, resize.index, e.clientY);
        return;
      }
    }

    const additive = e.ctrlKey || e.metaKey;
    const theme = this.deps.theme();
    const py = e.clientY - viewportRect.top;
    const contentX = this.deps.contentXAt(e.clientX - viewportRect.left);

    // header row → column selection
    if (py < theme.headerHeight) {
      const col = this.deps.colAtX(contentX);
      if (col !== -1) {
        const selection = this.deps.selection();
        if (e.shiftKey) selection.extendTo(0, col);
        else selection.selectColumn(col, additive);
        this.deps.emitSelection();
        this.deps.scheduleRender();
      }
      return;
    }

    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    if (
      !isTouch &&
      additive &&
      !e.shiftKey &&
      this.deps.activateHyperlink({
        sheet: this.deps.activeSheet(),
        row: this.deps.toDataRow(cell.row),
        col: cell.col,
      })
    ) {
      e.preventDefault();
      return;
    }

    const selection = this.deps.selection();

    // Touch policy: a tap selects, but a drag that starts on a plain cell
    // belongs to native scrolling — no capture, no preventDefault, no drag
    // listeners. Only a drag starting on the current multi-cell selection's
    // border extends the selection under touch.
    if (isTouch && !e.shiftKey && !this.touchExtendHit(e)) {
      selection.selectCell(cell.row, cell.col, additive);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      return;
    }

    if (e.shiftKey) selection.extendTo(cell.row, cell.col);
    else if (!isTouch) selection.selectCell(cell.row, cell.col, additive);
    this.deps.emitSelection();
    this.deps.scheduleRender();

    if (isTouch) e.preventDefault();
    const move = (ev: PointerEvent): void => {
      const c = this.cellAtPointer(ev.clientX, ev.clientY);
      if (!c) return;
      this.deps.selection().extendTo(c.row, c.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
    };
    this.attachDrag(e, move, () => this.detachDrag());
  };

  /**
   * Touch extend-drag hit: the contact lands within a narrow band (±6px)
   * around the rendered border of a current multi-cell selection rectangle.
   * Anywhere else (single cells, rect interiors) stays native-scroll.
   */
  private touchExtendHit(e: PointerEvent): boolean {
    const viewportRect = this.deps.viewportEl.getBoundingClientRect();
    const px = e.clientX - viewportRect.left;
    const py = e.clientY - viewportRect.top;
    const contentTop = this.deps.contentTop();
    const scrollLeft = this.deps.scroller.scrollLeft;
    const band = 6;

    let hit = false;
    this.deps.selection().forEachRect((r) => {
      if (r.r0 === r.r1 && r.c0 === r.c1) return;
      const tl = this.deps.screenRect(r.r0, r.c0, contentTop, scrollLeft);
      const br = this.deps.screenRect(r.r1, r.c1, contentTop, scrollLeft);
      const left = tl.x;
      const top = tl.y;
      const right = br.x + br.w;
      const bottom = br.y + br.h;
      const withinX = px >= left - band && px <= right + band;
      const withinY = py >= top - band && py <= bottom + band;
      if (!withinX || !withinY) return;
      const onVertical = Math.abs(px - left) <= band || Math.abs(px - right) <= band;
      const onHorizontal = Math.abs(py - top) <= band || Math.abs(py - bottom) <= band;
      if (onVertical || onHorizontal) hit = true;
    });
    return hit;
  }

  private readonly onDblClick = (e: MouseEvent): void => {
    // Double-click a column boundary → autofit that column.
    const resize = this.deps.readOnly() ? null : this.resizeAt(e);
    if (resize && resize.kind === "col") {
      e.preventDefault();
      this.autofitColumn(resize.index);
      return;
    }
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.beginEdit(cell.row, cell.col, undefined, true);
  };

  private readonly onHover = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return; // no hover cursors for touch
    const resize = this.deps.readOnly() ? null : this.resizeAt(e);
    this.deps.scroller.style.cursor =
      resize?.kind === "col" ? "col-resize" : resize?.kind === "row" ? "row-resize" : "";
  };

  private resizeAt(e: MouseEvent): { kind: "col" | "row"; index: number } | null {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const theme = this.deps.theme();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y < theme.headerHeight && x >= theme.rowHeaderWidth) {
      const contentX = this.deps.contentXAt(x);
      const col = this.deps.colAtX(Math.max(0, contentX));
      if (col === -1) return null;

      const prev = this.deps.previousVisibleColumn(col);
      const start = this.deps.colLeftOf(col);
      const width = (this.deps.sheet().columns[col]?.width ?? MIN_COLUMN_WIDTH) * this.deps.zoom();
      const target = resizeTargetAt(contentX, col, start, width, prev);
      return target === null ? null : { kind: "col", index: target };
    }

    if (x < theme.rowHeaderWidth && y >= theme.headerHeight) {
      const contentY = this.deps.contentYAt(y);
      const row = this.deps.rowAtOffset(Math.max(0, contentY));
      if (row < 0 || row >= this.deps.rowCount()) return null;

      const target = resizeTargetAt(
        contentY,
        row,
        this.deps.rowTop(row),
        this.deps.rowHeight(row),
        row - 1,
      );
      return target === null ? null : { kind: "row", index: target };
    }

    return null;
  }

  private startColumnResize(e: PointerEvent, col: number, startX: number): void {
    const startWidth = this.deps.sheet().columns[col]?.width ?? MIN_COLUMN_WIDTH;
    let finalWidth = startWidth;

    const move = (ev: PointerEvent): void => {
      // Pointer deltas are screen px; widths persist in base (unzoomed) units.
      const delta = (ev.clientX - startX) / this.deps.zoom();
      finalWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + delta));
      this.deps.previewColumnWidth(col, finalWidth);
    };
    const up = (): void => {
      this.detachDrag();
      this.deps.clearResizePreview();
      this.deps.commit(
        [
          {
            op: "setColumn",
            sheet: this.deps.activeSheet(),
            col,
            patch: { width: finalWidth },
          },
        ],
        "structure",
      );
    };
    const cancel = (): void => {
      this.detachDrag();
      this.deps.clearResizePreview();
    };
    this.attachDrag(e, move, up, cancel);
  }

  private startRowResize(e: PointerEvent, row: number, startY: number): void {
    const sheet = this.deps.activeSheet();
    const dataRow = this.deps.toDataRow(row);
    const startHeight = this.deps.rowHeight(row) / this.deps.zoom();
    let finalHeight = startHeight;
    const move = (ev: PointerEvent): void => {
      finalHeight = Math.max(
        MIN_ROW_HEIGHT,
        Math.round(startHeight + (ev.clientY - startY) / this.deps.zoom()),
      );
      this.deps.previewRowHeight(row, finalHeight);
    };
    const cancel = (): void => {
      this.detachDrag();
      this.deps.clearResizePreview();
    };
    const up = (): void => {
      cancel();
      this.deps.commit(
        [{ op: "setRowMeta", sheet, row: dataRow, meta: { height: finalHeight } }],
        "structure",
      );
    };
    this.attachDrag(e, move, up, cancel);
  }

  private autofitColumn(col: number): void {
    const column = this.deps.sheet().columns[col];
    if (!column) return;

    const win = this.deps.visibleRowWindow();
    const view = this.deps.store.getVisibleWindow(this.deps.activeSheet(), win, [col]);
    const values = view.values;
    const texts: string[] = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i] ?? null;
      if (value === null) texts.push("");
      else if (typeof value === "number")
        texts.push(formatNumber(value, column.numberFormat, column.numberLocale));
      else if (typeof value === "boolean") texts.push(value ? "TRUE" : "FALSE");
      else texts.push(value);
    }

    const width = autofitColumnWidth((text) => this.measureText(text), texts, column.header);
    this.deps.commit(
      [
        {
          op: "setColumn",
          sheet: this.deps.activeSheet(),
          col,
          // measureText ran under the zoomed font; persist base units.
          patch: { width: Math.max(MIN_COLUMN_WIDTH, Math.round(width / this.deps.zoom())) },
        },
      ],
      "structure",
    );
  }

  private measureText(text: string): number {
    if (!this.measureCtx) {
      const canvas = document.createElement("canvas");
      this.measureCtx = canvas.getContext("2d");
    }

    const ctx = this.measureCtx;
    if (!ctx) return text.length * 8;
    ctx.font = this.deps.theme().font;
    return ctx.measureText(text).width;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.isEditing) return;
    // Keys typed into an editable widget inside the host (find bar, custom
    // toolbar fields) belong to that widget. Without this guard the grid's
    // type-to-edit default steals focus mid-keystroke and Backspace becomes a
    // destructive clearSelection().
    const target = e.target;
    const inEditableWidget =
      target !== this.deps.host &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable));
    if (inEditableWidget) return;

    // Headless hosts own the keymap: `false` drops every stock binding, a
    // handler intercepts first and consumes by returning true.
    const keyboard = this.deps.keyboard();
    if (keyboard === false) return;
    if (typeof keyboard === "function" && keyboard(e)) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === "f") {
      e.preventDefault();
      this.deps.findBar()?.open();
      return;
    }

    if (mod && key === "h") {
      e.preventDefault();
      this.deps.findBar()?.open({ replace: true });
      return;
    }

    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) this.deps.redo();
      else this.deps.undo();
      return;
    }

    if (mod && key === "y") {
      e.preventDefault();
      this.deps.redo();
      return;
    }

    if (mod && key === "c") return void this.deps.copy();
    if (mod && key === "x") return void this.deps.cut();
    if (mod && key === "v") return void (e.shiftKey ? this.deps.pasteValues() : this.deps.paste());

    const selection = this.deps.selection();
    const focus = selection.focusCell;
    if (focus && key === " " && mod) {
      selection.selectColumn(focus.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      e.preventDefault();
      return;
    }
    if (focus && key === " " && e.shiftKey) {
      selection.selectRow(focus.row);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      e.preventDefault();
      return;
    }
    const sheet = this.deps.sheet();
    const theme = this.deps.theme();
    const pageRows = Math.max(
      1,
      Math.floor((this.deps.viewportH() - theme.headerHeight) / theme.rowHeight),
    );

    switch (e.key) {
      case "ArrowDown":
        this.navigate(
          focus,
          mod ? this.dataEdgeRow(focus, 1) : (focus?.row ?? 0) + 1,
          undefined,
          e.shiftKey,
        );
        break;
      case "ArrowUp":
        this.navigate(
          focus,
          mod ? this.dataEdgeRow(focus, -1) : (focus?.row ?? 0) - 1,
          undefined,
          e.shiftKey,
        );
        break;
      case "ArrowRight":
        this.navigate(
          focus,
          undefined,
          mod
            ? this.dataEdgeCol(focus, 1)
            : this.deps.nextVisibleCol(focus?.col ?? this.deps.firstCol(), 1),
          e.shiftKey,
        );
        break;
      case "ArrowLeft":
        this.navigate(
          focus,
          undefined,
          mod
            ? this.dataEdgeCol(focus, -1)
            : this.deps.nextVisibleCol(focus?.col ?? this.deps.firstCol(), -1),
          e.shiftKey,
        );
        break;
      case "PageDown":
        this.navigate(focus, (focus?.row ?? 0) + pageRows, undefined, e.shiftKey);
        break;
      case "PageUp":
        this.navigate(focus, (focus?.row ?? 0) - pageRows, undefined, e.shiftKey);
        break;
      case "Home":
        if (mod) this.navigate(focus, 0, this.deps.firstCol(), e.shiftKey);
        else this.navigate(focus, undefined, this.deps.firstCol(), e.shiftKey);
        break;
      case "End":
        if (mod) this.navigate(focus, sheet.rowCount - 1, this.deps.lastCol(), e.shiftKey);
        else this.navigate(focus, undefined, this.deps.lastCol(), e.shiftKey);
        break;
      case "Enter":
      case "F2":
        if (focus) this.beginEdit(focus.row, focus.col, undefined, e.key === "F2");
        break;
      case "Delete":
      case "Backspace":
        this.deps.clearSelection();
        break;
      default:
        if (!mod && !e.altKey && focus && PRINTABLE.test(e.key)) {
          this.beginEdit(focus.row, focus.col, e.key, false);
        } else {
          return;
        }
    }
    e.preventDefault();
  };

  private navigate(
    focus: CellRef | null,
    row: number | undefined,
    col: number | undefined,
    extend: boolean,
  ): void {
    const maxRow = Math.max(0, this.deps.rowCount() - 1);
    const firstCol = this.deps.firstCol();
    const lastCol = this.deps.lastCol();
    const targetRow = Math.max(0, Math.min(maxRow, row ?? focus?.row ?? 0));
    const targetCol = Math.max(firstCol, Math.min(lastCol, col ?? focus?.col ?? firstCol));
    const selection = this.deps.selection();
    if (extend) selection.extendTo(targetRow, targetCol);
    else selection.selectCell(targetRow, targetCol);
    this.deps.emitSelection();
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: targetRow, col: targetCol });
    this.deps.scheduleRender();
  }

  /** Ctrl+Arrow vertical target: data-run edge when available, else sheet edge. */
  private dataEdgeRow(focus: CellRef | null, dir: 1 | -1): number {
    const edge = dir > 0 ? this.deps.rowCount() - 1 : 0;
    if (!focus) return edge;
    return this.deps.dataEdge(focus.row, focus.col, dir, 0) ?? edge;
  }

  /**
   * Ctrl+Arrow horizontal target. A data edge landing on a hidden column is
   * nudged to the nearest visible column in the travel direction.
   */
  private dataEdgeCol(focus: CellRef | null, dir: 1 | -1): number {
    const edge = dir > 0 ? this.deps.lastCol() : this.deps.firstCol();
    if (!focus) return edge;

    const target = this.deps.dataEdge(focus.row, focus.col, 0, dir);
    if (target === null) return edge;

    const cols = this.deps.colIndices();
    if (cols.includes(target)) return target;
    return this.deps.nextVisibleCol(target, dir);
  }

  private fillSourceRect(): SelRect | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    let found: SelRect | null = null;
    this.deps.selection().forEachRect((r) => {
      if (r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1) {
        found = r;
      }
    });
    return found;
  }

  private fillCellAt(clientX: number, clientY: number): CellRef {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const contentX = this.deps.contentXAt(clientX - rect.left);
    const contentY = this.deps.contentYAt(clientY - rect.top);
    const rowCount = this.deps.sheet().rowCount;
    const row = Math.max(0, Math.min(rowCount - 1, this.deps.rowAtOffset(Math.max(0, contentY))));
    let col = this.deps.colAtX(Math.max(0, contentX));
    if (col === -1) {
      const cols = this.deps.colIndices();
      col = contentX < 0 ? (cols[0] ?? 0) : (cols[cols.length - 1] ?? 0);
    }
    return { row, col };
  }

  private startFillDrag(e: PointerEvent): void {
    const source = this.fillSourceRect();
    if (!source) return;
    this.fillTarget = null;
    const move = (ev: PointerEvent): void => {
      const c = this.fillCellAt(ev.clientX, ev.clientY);
      this.fillTarget = this.extendFill(source, c);
      this.deps.scheduleRender();
    };
    const up = (): void => {
      this.detachDrag();
      const target = this.fillTarget;
      this.fillTarget = null;
      if (target && this.commitFill(source, target)) {
        const selection = this.deps.selection();
        selection.selectCell(target.r0, target.c0);
        selection.extendTo(target.r1, target.c1);
        this.deps.emitSelection();
      }
      this.deps.scheduleRender();
    };
    const cancel = (): void => {
      // A cancelled fill-drag (browser reclaimed the pointer) commits nothing.
      this.fillTarget = null;
      this.detachDrag();
      this.deps.scheduleRender();
    };
    this.attachDrag(e, move, up, cancel);
  }

  private extendFill(source: SelRect, c: CellRef): SelRect {
    const down = Math.max(c.row - source.r1, 0);
    const up = Math.max(source.r0 - c.row, 0);
    const right = Math.max(c.col - source.c1, 0);
    const left = Math.max(source.c0 - c.col, 0);
    const vert = Math.max(down, up);
    const horiz = Math.max(right, left);
    if (vert === 0 && horiz === 0) return { ...source };
    if (vert >= horiz) {
      if (down >= up) return { r0: source.r0, c0: source.c0, r1: c.row, c1: source.c1 };
      return { r0: c.row, c0: source.c0, r1: source.r1, c1: source.c1 };
    }
    if (right >= left) return { r0: source.r0, c0: source.c0, r1: source.r1, c1: c.col };
    return { r0: source.r0, c0: c.col, r1: source.r1, c1: source.c1 };
  }

  private commitFill(source: SelRect, target: SelRect): boolean {
    if (this.deps.readOnly()) return false;
    const srcCols = source.c1 - source.c0 + 1;
    const series = new Map<number, FillSeries>();
    const patches: DocumentOp[] = [];

    for (let c = target.c0; c <= target.c1; c++) {
      const sc = source.c0 + ((((c - source.c0) % srcCols) + srcCols) % srcCols);
      series.set(sc, this.seriesForColumn(source, sc));
    }

    for (let r = target.r0; r <= target.r1; r++) {
      for (let c = target.c0; c <= target.c1; c++) {
        if (r >= source.r0 && r <= source.r1 && c >= source.c0 && c <= source.c1) continue;

        const sc = source.c0 + ((((c - source.c0) % srcCols) + srcCols) % srcCols);
        const columnSeries = series.get(sc);
        if (!columnSeries) throw new Error(`Missing fill series for column ${sc}`);
        const step = columnSeries.stepAt(r - source.r0);
        const targetDataRow = this.deps.toDataRow(r);
        patches.push({
          op: "set",
          addr: { sheet: this.deps.activeSheet(), row: targetDataRow, col: c },
          value:
            step.kind === "value"
              ? { kind: "literal", value: step.value }
              : this.fillValueFrom(
                  source.r0 + step.sourceIndex,
                  sc,
                  targetDataRow - this.deps.toDataRow(source.r0 + step.sourceIndex),
                  c - sc,
                ),
        });
      }
    }
    return this.deps.commit(patches, "fill").status === "applied";
  }

  private seriesForColumn(source: SelRect, col: number): FillSeries {
    const cells: FillSourceCell[] = [];
    for (let row = source.r0; row <= source.r1; row++) {
      const addr = { sheet: this.deps.activeSheet(), row: this.deps.toDataRow(row), col };
      cells.push({
        value: this.deps.store.getCell(addr).resolved,
        isFormula: (this.deps.loadable?.getFormula(addr) ?? null) !== null,
      });
    }
    return detectFillSeries(cells);
  }

  private fillValueFrom(sr: number, sc: number, dRow: number, dCol: number): CellValue {
    const addr = { sheet: this.deps.activeSheet(), row: this.deps.toDataRow(sr), col: sc };
    const formula = this.deps.loadable?.getFormula(addr) ?? null;
    if (formula) return { kind: "formula", src: shiftA1Refs(formula, dRow, dCol) };
    return { kind: "literal", value: this.deps.store.getCell(addr).resolved };
  }

  /**
   * Window-drag replacement: capture the initiating pointer on the scroller and
   * track it until `pointerup` (commit) or `pointercancel` (abandon, never
   * commit). Events from other pointers are ignored for the drag's lifetime.
   */
  private attachDrag(
    e: PointerEvent,
    move: (ev: PointerEvent) => void,
    up: (ev: PointerEvent) => void,
    cancel?: (ev: PointerEvent) => void,
  ): void {
    this.cancelPointer();
    const scroller = this.deps.scroller;
    this.activePointerId = e.pointerId;

    const own = (ev: PointerEvent): boolean => ev.pointerId === this.activePointerId;
    this.dragMove = (ev) => {
      if (own(ev)) move(ev);
    };
    this.dragUp = (ev) => {
      if (own(ev)) up(ev);
    };
    this.dragCancel = (ev) => {
      if (!own(ev)) return;
      if (cancel) cancel(ev);
      else this.detachDrag();
    };

    scroller.addEventListener("pointermove", this.dragMove);
    scroller.addEventListener("pointerup", this.dragUp);
    scroller.addEventListener("pointercancel", this.dragCancel);
    scroller.addEventListener("lostpointercapture", this.dragCancel);
    if (typeof scroller.setPointerCapture === "function") {
      try {
        scroller.setPointerCapture(e.pointerId);
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
        // Detached grids cannot capture; scoped listeners still own termination.
        console.warn("Pointer capture unavailable for detached grid", error);
      }
    }
  }

  private detachDrag(): void {
    const scroller = this.deps.scroller;
    if (this.dragMove) scroller.removeEventListener("pointermove", this.dragMove);
    if (this.dragUp) scroller.removeEventListener("pointerup", this.dragUp);
    if (this.dragCancel) {
      scroller.removeEventListener("pointercancel", this.dragCancel);
      scroller.removeEventListener("lostpointercapture", this.dragCancel);
    }
    this.dragMove = null;
    this.dragUp = null;
    this.dragCancel = null;

    const pointerId = this.activePointerId;
    this.activePointerId = null;
    if (
      pointerId !== null &&
      typeof scroller.hasPointerCapture === "function" &&
      typeof scroller.releasePointerCapture === "function" &&
      scroller.hasPointerCapture(pointerId)
    ) {
      scroller.releasePointerCapture(pointerId);
    }
  }
}
