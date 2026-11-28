import { rangeA1, shiftA1Refs } from "./a1.js";
import {
  cellAlign,
  cellPadding,
  filterButtonHitRect,
  filterTextRight,
  fontFor,
} from "./canvas-paint.js";
import type { CellCommand } from "./cell-commands.js";
import { cellEditText, parseCellEntry } from "./cell-input.js";
import { ContextMenu } from "./context-menu.js";
import { CustomEditorController } from "./custom-editor.js";
import { isDashboard } from "./dashboard.js";
import { dateToSerial } from "./date-serial.js";
import type { DialogHost } from "./dialog.js";
import type { EditDraftSink } from "./edit-draft.js";
import {
  type EditCompletion,
  EditController,
  type EditNavigate,
  type EditorLook,
  type EditRect,
} from "./editor.js";
import { type AutoFillChoice, FillController, type FillTip } from "./fill-controller.js";
import { focusOutside } from "./focus-exit.js";
import { FILL_HANDLE_HIT_RADIUS } from "./grid-constants.js";
import type { Keymap } from "./keymap.js";
import { listButtonRect } from "./overlay-painter.js";
import type { PickList } from "./pick-list.js";
import { MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT, resizeTargetAt } from "./resize.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import type { SheetKey } from "./sheet-commands.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import { rangeContains } from "./store/ranges.js";
import type { CellFormat, CellScalar, CellStyle, CellValue, Column } from "./types/cell.js";
import type { CellAddress, HighlightRange, SheetId } from "./types/coordinates.js";
import type { CommitReason, DataValidationRule, DocumentOp, Sheet } from "./types/document.js";
import type { KeyboardOptions } from "./types/grid.js";
import type {
  CellEditor,
  CellEditorRect,
  CellMode,
  ContextMenuItem,
  Grid,
  GridConfig,
  GridEvents,
} from "./types/grid.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";
import type { ApplyTransactionResult } from "./types/transaction.js";
import { ValidationEditor } from "./validation-editor.js";
import {
  failingValidationRule,
  hasListDropdown,
  ValidationBudgetError,
  validationListItems,
} from "./validation-rule.js";

const PRINTABLE = /^.$/u;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
/** The formats Excel gives a date or time entered with Ctrl+; or Ctrl+Shift+; (en-US). */
const SHORT_DATE_FORMAT = "m/d/yyyy";
const SHORT_TIME_FORMAT = "h:mm AM/PM";
const MODIFIER_KEYS: Readonly<Record<string, true>> = {
  Shift: true,
  Control: true,
  Alt: true,
  Meta: true,
};

/** The Auto Fill Options rows, with Excel's labels. */
const AUTO_FILL_LABELS: Record<AutoFillChoice, string> = {
  copy: "Copy Cells",
  series: "Fill Series",
  formats: "Fill Formatting Only",
  values: "Fill Without Formatting",
  day: "Fill Days",
  weekday: "Fill Weekdays",
  month: "Fill Months",
  year: "Fill Years",
};

interface EditRequest {
  /** Text typed to start the edit; without it the editor opens on the cell's content. */
  readonly initial?: string;
  readonly selectAll?: boolean;
  /** False opens the editor as the view of a draft another surface types. */
  readonly focus?: boolean;
  /** Open the list of the cell's list rule, keeping the items that contain this text. */
  readonly list?: string;
}

/** A finished cell entry and the operations that store it. */
interface CellEntry {
  readonly address: Readonly<CellAddress>;
  readonly value: CellValue;
  /** One `set` for the cell, or one per selected cell for Ctrl+Enter. */
  readonly patches: DocumentOp[];
  readonly navigate: EditNavigate;
}

interface InteractionDependencies {
  host: HTMLElement;
  scroller: HTMLDivElement;
  viewportEl: HTMLDivElement;
  grid: Grid;
  customEditors: ReadonlyMap<string, CellEditor>;
  highlightCells: (ranges: HighlightRange[] | null) => void;
  columnHeader: (col: number) => string;
  toViewRow: (dataRow: number) => number | null;
  /** The active cell on a row the view hides, in sheet coordinates; null otherwise. */
  hiddenActive: () => CellAddress | null;
  /** The view row nearest to sheet row `row` in `direction` that shows; null when none. */
  nearestShownRow: (row: number, direction: 1 | -1) => number | null;
  /** Hand the edit of the hidden active cell to the formula bar; false without one. */
  editActiveCell: (initial: string | null) => boolean;
  editListeners: {
    readonly [K in "edit-begin" | "edit-commit" | "cell-mode"]: ReadonlySet<
      (payload: GridEvents[K]) => void
    >;
  };
  /** Hears the cell edit's draft for the shell's formula bar (see `edit-draft.ts`). */
  editDraft: EditDraftSink;
  /** Open the find bar; it may load first. `replace: true` focuses the replace field. */
  openFind: (options?: { replace?: boolean }) => void;
  /** Open the AutoFilter dropdown of a header cell in `col`. */
  openAutoFilter: (col: number) => void;
  /**
   * Run a key's command from `cell-commands.ts` or, for the keys that switch
   * sheets, `sheet-commands.ts`.
   */
  keyCommand: (command: CellCommand | SheetKey) => void;
  /** Hold a key pressed while lazily loaded UI's code loads; false when none loads. */
  holdKey: (e: KeyboardEvent) => boolean;
  /** Whether the host leaves AutoComplete on (`GridConfig.autoComplete`), read per edit. */
  autoComplete: () => boolean;
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
  /** Fit the widths of `cols` to their contents, as the grid's `autoFitColumns` does. */
  autoFitColumns: (cols: readonly number[]) => void;
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
  keyboard: () => boolean | KeyboardOptions | ((e: KeyboardEvent) => boolean);
  keymap: () => Keymap;
  screenRect: (
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ) => { x: number; y: number; w: number; h: number };
  anchorCell: (row: number, col: number) => CellRef;
  toDataRow: (viewRow: number) => number;
  /** The data rows view rows `first` to `last` span with the rows hidden by hand between them. */
  rowSpan: (first: number, last: number) => { first: number; last: number } | null;
  clearSelection: () => void;
  emitSelection: () => void;
  scrollToCell: (addr: CellAddress) => void;
  /** Ctrl/Meta-click host-safe hyperlink activation. */
  activateHyperlink: (addr: CellAddress) => boolean;
  scheduleRender: () => void;
  undo: () => void;
  redo: () => void;
  /** Clipboard shortcuts start the action; the grid handles how it ends. */
  copy: () => void;
  cut: () => void;
  paste: () => void;
  pasteValues: () => void;
  pasteSpecial: () => void;
  commit: (patches: DocumentOp[], reason: CommitReason) => ApplyTransactionResult;
  /** Runs before a cell editor opens; hides the note card that would cover it. */
  onEditStart: () => void;
  /** Ends the cut that waits for a paste; returns whether there was one. */
  cancelCut: () => boolean;
  readOnly: () => boolean;
  /** Where the grid's dialogs open, such as the message for a formula that does not parse. */
  dialogs: DialogHost;
}

/**
 * Owns grid pointer/keyboard input, including formula point-mode and fill-drag
 * interactions, while delegating mutations back through the grid shell.
 */
export class InteractionSessions {
  private readonly deps: InteractionDependencies;
  private readonly editor: EditController;
  private readonly validation_editor: ValidationEditor;
  private readonly custom_editor: CustomEditorController;
  private context_menu: ContextMenu | null = null;
  /** Corners of the reference the editor last picked by pointer or arrow key. */
  private point_anchor: CellRef | null = null;
  private point_end: CellRef | null = null;
  private editing_address: Readonly<CellAddress> | null = null;
  private active_editor:
    | EditController
    | ValidationEditor
    | CustomEditorController
    | PickList
    | null = null;
  /** Pick From Drop-down List, made when it first opens. */
  private pick_list: PickList | null = null;
  private generation = 0;
  private fill_target: SelRect | null = null;
  /** The value tip of the fill handle's drag. */
  private tip: FillTip | null = null;
  /** Fills and the Auto Fill Options that redo them. */
  private readonly fills: FillController;
  /** Excel's End mode: End was the last key, so the next arrow jumps to a data edge. */
  private end_mode = false;
  /** Escape was the last key on the grid, so Tab leaves the grid instead of moving the cell. */
  private escape_leaves = false;
  /** Excel's cell mode, which the `cell-mode` event last reported. */
  private mode: CellMode = "ready";
  /**
   * Excel's Tab run: the cell a run of Tab moves left active, and the column
   * the run started in, where the next Enter goes. Any other move ends it.
   */
  private tab_run: { readonly row: number; readonly col: number; readonly start: number } | null =
    null;
  /** AutoComplete's code, once the first edit has loaded it. */
  private autocomplete: typeof import("./autocomplete.js") | null = null;
  /** The load of AutoComplete's code, started by the first edit or list. */
  private autocomplete_load: Promise<typeof import("./autocomplete.js")> | null = null;
  private drag_move: ((ev: PointerEvent) => void) | null = null;
  private drag_up: ((ev: PointerEvent) => void) | null = null;
  private drag_cancel: ((ev: PointerEvent) => void) | null = null;
  /** Pointer that owns the active drag; other pointers' events are ignored. */
  private active_pointer_id: number | null = null;

  constructor(deps: InteractionDependencies) {
    this.deps = deps;
    this.editor = new EditController(
      deps.viewportEl,
      {
        highlightCells: deps.highlightCells,
        sheet: deps.activeSheet,
        cell: () => this.editing_address,
        store: deps.store,
      },
      deps.host,
    );
    this.validation_editor = new ValidationEditor(deps.viewportEl);
    this.custom_editor = new CustomEditorController(deps.viewportEl);
    this.fills = new FillController({
      store: deps.store,
      loadable: deps.loadable,
      activeSheet: deps.activeSheet,
      sheet: deps.sheet,
      toDataRow: deps.toDataRow,
      rowSpan: deps.rowSpan,
      readOnly: deps.readOnly,
      commit: deps.commit,
      undo: deps.undo,
    });
    deps.scroller.addEventListener("contextmenu", this.on_context_menu);
    deps.scroller.addEventListener("pointerdown", this.on_pointer_down);
    deps.scroller.addEventListener("dblclick", this.on_dbl_click);
    deps.scroller.addEventListener("pointermove", this.on_hover);
    deps.host.addEventListener("keydown", this.on_key_down);
  }

  get isEditing(): boolean {
    return this.active_editor !== null;
  }

  get cellMode(): CellMode {
    return this.mode;
  }

  /** Emit `cell-mode` when the mode of the open editor, or of none, changed. */
  private report_cell_mode(): void {
    const editor = this.active_editor;
    let mode: CellMode = "ready";
    if (editor === this.editor) mode = this.editor.mode;
    else if (editor === this.custom_editor) mode = "edit";
    if (mode === this.mode) return;
    this.mode = mode;
    for (const listener of this.deps.editListeners["cell-mode"]) listener({ mode });
  }

  configureMenu(config: GridConfig | undefined, theme: Theme): void {
    this.context_menu?.destroy();
    this.context_menu =
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

  /**
   * Open the context menu with `items` at a point, for a menu that belongs to
   * an object, not a cell. Returns false when the host turned menus off.
   */
  openMenu(items: readonly ContextMenuItem[], clientX: number, clientY: number): boolean {
    if (!this.context_menu) return false;

    this.context_menu.open({ cell: null, clientX, clientY }, items);
    return true;
  }

  private readonly on_context_menu = (e: MouseEvent): void => {
    if (!this.context_menu) return;
    e.preventDefault();
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    const address = cell ? { sheet: this.deps.activeSheet(), ...cell } : null;
    const selection = this.deps.selection();
    if (cell && !selection.contains(cell.row, cell.col)) {
      selection.selectCell(cell.row, cell.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
    }
    this.context_menu.open({ cell: address, clientX: e.clientX, clientY: e.clientY });
  };

  reconcile(change: "view" | "sheet" | "structure" | "read-only" | "value"): void {
    if (change !== "value") this.cancel_pointer();
    // Any change but the fill's own ends Auto Fill Options, as in Excel.
    if (change === "sheet" || change === "read-only") this.fills.dismiss();
    else this.fills.documentChanged();
    if (change === "sheet" || change === "structure" || change === "read-only") {
      this.cancel_editor();
      return;
    }
    const address = this.editing_address;
    if (!address) return;
    const view_row = this.deps.toViewRow(address.row);
    const column = this.deps.sheet().columns[address.col];
    if (address.sheet !== this.deps.activeSheet() || view_row === null || !column) {
      this.cancel_editor();
      return;
    }
    if (this.active_editor === this.custom_editor) {
      const cell = this.deps.store.getCell(address);
      const formula =
        this.deps.loadable?.getFormula(address) ?? this.deps.store.getFormula(address);
      this.custom_editor.update({
        viewAddress: { sheet: address.sheet, row: view_row, col: address.col },
        column,
        value: cell.resolved,
        text:
          formula ??
          cellEditText(
            cell.resolved,
            column.type,
            this.number_format_of(cell.style, column),
            column.numberLocale,
          ),
        label: this.editor_label(view_row, address.col),
      });
    }
  }

  reposition(contentTop: number, scrollLeft: number): void {
    const address = this.editing_address;
    if (!address) return;
    const row = this.deps.toViewRow(address.row);
    if (row === null) return;
    const rect = this.deps.screenRect(row, address.col, contentTop, scrollLeft);
    const editor = this.active_editor;
    if (editor instanceof CustomEditorController) {
      editor.position({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
    } else {
      editor?.position(editor === this.editor ? this.text_box(row, address.col, rect) : rect);
    }
  }

  /**
   * Excel's AutoComplete for an edit of view row `row` in `col` (see
   * `autocomplete.ts`). Its code loads with the first edit; while it loads,
   * nothing is completed, and once it arrives the edit that a key opened is
   * completed at once. Hosts that turn AutoComplete off get no completion.
   */
  private completion(row: number, col: number, typed: boolean): EditCompletion | undefined {
    if (!this.deps.autoComplete()) return undefined;
    if (this.autocomplete === null) {
      const generation = this.generation;
      void this.load_autocomplete().then(() => {
        if (typed && this.generation === generation) this.editor.completeNow();
      });
    }
    // Made on first use once the code is here; null for a store without an engine.
    let made: EditCompletion | null | undefined;
    const current = (): EditCompletion | null => {
      if (made === undefined && this.autocomplete !== null) {
        made = this.autocomplete.editCompletion(
          this.deps,
          row,
          col,
          this.deps.viewportEl,
          this.deps.theme(),
          () => this.editor.commit("down"),
        );
      }
      return made ?? null;
    };
    return {
      complete: (field, typed_text) => current()?.complete(field, typed_text) ?? null,
      keyDown: (event, field) => current()?.keyDown(event, field) ?? false,
      reposition: (field) => made?.reposition(field),
      close: () => made?.close(),
    };
  }

  private load_autocomplete(): Promise<typeof import("./autocomplete.js")> {
    this.autocomplete_load ??= import("./autocomplete.js").then((module) => {
      this.autocomplete = module;
      return module;
    });
    return this.autocomplete_load;
  }

  /**
   * Excel's Pick From Drop-down List (Alt+Down on a cell): the text entries
   * that AutoComplete reads around the cell, sorted, in a list under it. Its
   * code loads with AutoComplete's. A column without text entries shows
   * nothing, and so does a read-only grid.
   */
  pickFromList(row: number, col: number): void {
    if (this.deps.readOnly()) return;
    const cell = this.deps.anchorCell(row, col);
    const generation = this.generation;
    void this.load_autocomplete().then((module) => {
      // An edit, a move or read-only since the key wins.
      const focus = this.deps.selection().focusCell;
      if (
        generation !== this.generation ||
        this.isEditing ||
        this.deps.readOnly() ||
        focus?.row !== cell.row ||
        focus.col !== cell.col
      ) {
        return;
      }
      const entries = module.pickListEntries(this.deps, cell.row, cell.col);
      if (entries.length === 0) return;

      const address = {
        sheet: this.deps.activeSheet(),
        row: this.deps.toDataRow(cell.row),
        col: cell.col,
      };
      const current = this.deps.store.getCell(address).resolved;
      this.deps.onEditStart();
      const list = (this.pick_list ??= new module.PickList(this.deps.viewportEl));
      this.editing_address = address;
      this.active_editor = list;
      list.begin({
        entries,
        current: typeof current === "string" ? current : "",
        rect: this.deps.screenRect(
          cell.row,
          cell.col,
          this.deps.contentTop(),
          this.deps.scroller.scrollLeft,
        ),
        theme: this.deps.theme(),
        onCommit: (entry, navigate) =>
          this.finish_edit(address, { kind: "literal", value: entry }, navigate),
        onCancel: () => this.end_editor(),
      });
    });
  }

  /**
   * The editor's accessible name: the column and the row number the row
   * header shows, the sheet row under a filter and the view position under a
   * view sort.
   */
  private editor_label(row: number, col: number): string {
    const sorted = (this.deps.sheet().sortKeys?.length ?? 0) > 0;
    const shown = sorted ? row : this.deps.toDataRow(row);
    return `Edit ${this.deps.columnHeader(col)}, row ${shown + 1}`;
  }

  private editor_rect(
    row: number,
    col: number,
    content_top: number,
    scroll_left: number,
  ): CellEditorRect {
    const rect = this.deps.screenRect(row, col, content_top, scroll_left);
    return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
  }

  /**
   * Where the cell editor sits: the cell, or in an AutoFilter header cell
   * its text box, which ends a gap before the filter button, as in Excel.
   */
  private text_box(row: number, col: number, rect: EditRect): EditRect {
    return this.is_auto_filter_header(row, col)
      ? { ...rect, w: filterTextRight(rect, this.deps.zoom()) - rect.x }
      : rect;
  }

  /**
   * Put the reference from view cell `anchor` to `end` into the editor,
   * replacing a picked one. It names sheet rows: under a sort or filter view
   * the pointed cell's row in the sheet, as in Excel.
   */
  private point_at(anchor: CellRef, end: CellRef): void {
    this.point_anchor = anchor;
    this.point_end = end;
    const sheet_cell = (cell: CellRef): CellRef => ({
      row: this.deps.toDataRow(cell.row),
      col: cell.col,
    });
    this.editor.setReference(rangeA1(sheet_cell(anchor), sheet_cell(end)));
  }

  /**
   * An arrow key in Enter mode: move the pointed reference by one cell, or
   * with Shift stretch it, starting from the edited cell, as in Excel.
   */
  private point_by(edit_cell: CellRef, d_row: number, d_col: number, extend: boolean): void {
    const picked = this.editor.isPointing ? this.point_anchor : null;
    const anchor = picked ?? edit_cell;
    const end = (picked ? this.point_end : null) ?? edit_cell;
    const step = (cell: CellRef): CellRef => ({
      row: Math.max(0, Math.min(this.deps.rowCount() - 1, cell.row + d_row)),
      col: d_col === 0 ? cell.col : this.deps.nextVisibleCol(cell.col, d_col < 0 ? -1 : 1),
    });
    const moved = step(extend ? end : anchor);
    if (extend) this.point_at(anchor, moved);
    else this.point_at(moved, moved);
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: moved.row, col: moved.col });
  }

  private end_editor(): void {
    this.editing_address = null;
    this.active_editor = null;
    this.report_cell_mode();
    this.focus_grid();
    this.deps.scheduleRender();
    this.deps.editDraft.end();
  }

  /**
   * Give the grid the focus back, where the user left the page. Focusing
   * makes the browser lay the page out, so a grid that has the focus already
   * is left alone, and no scroll into view adds to that.
   */
  private focus_grid(): void {
    if (document.activeElement !== this.deps.host) this.deps.host.focus({ preventScroll: true });
  }

  private cancel_editor(): void {
    ++this.generation;
    this.editing_address = null;
    const editor = this.active_editor;
    this.active_editor = null;
    editor?.cancel();
    this.report_cell_mode();
  }

  private finish_edit(
    address: Readonly<CellAddress>,
    input: string | CellValue,
    navigate: EditNavigate,
  ): void {
    if (this.editing_address !== address) return;
    this.editing_address = null;
    this.active_editor = null;
    this.report_cell_mode();
    try {
      if (address.sheet !== this.deps.activeSheet()) return;
      const view_row = this.deps.toViewRow(address.row);
      if (view_row === null) return;
      const column = this.deps.sheet().columns[address.col];
      const style = this.deps.store.getCell(address).style;
      const parsed =
        typeof input === "string"
          ? parseCellEntry(
              input,
              column?.type ?? "text",
              this.number_format_of(style, column),
              column?.numberLocale,
            )
          : { value: input };
      const value = parsed.value;
      // An entry keeps the cell's formatting, as in Excel; a `set` without a
      // style would clear it. A General entry gives an unformatted cell the
      // format that shows it as typed.
      const patches: DocumentOp[] =
        navigate === "stay"
          ? this.selection_fill(address, view_row, value, parsed.numberFormat)
          : [
              {
                op: "set",
                addr: { ...address },
                value,
                style: this.entry_style(style, column, parsed.numberFormat),
              },
            ];
      const entry: CellEntry = { address, value, patches, navigate };
      const decide = (): void => {
        const rule = this.broken_rule(patches);
        if (rule) {
          const text =
            typeof input === "string" ? input : this.entry_text(value, column?.type ?? "text");
          this.alert_entry(rule, entry, text);
          return;
        }
        this.commit_cell_edit_at(entry, view_row);
      };
      // The grid's check and the store's check of the entry are one check:
      // each list source is read once.
      const reads = storeEngine(this.deps.store)?.validationReads;
      if (reads) reads.check(decide);
      else decide();
    } finally {
      this.deps.editDraft.end();
    }
  }

  /**
   * The rule an entry breaks, checked before it is stored, as Excel does. A
   * Stop rule comes first, so Yes on a Warning never meets a Stop afterwards.
   * A formula is checked by the result it would have in its cell. A check
   * that runs out of its budget finds none here; the store then refuses the
   * entry.
   */
  private broken_rule(patches: readonly DocumentOp[]): DataValidationRule | undefined {
    const rules = this.deps.sheet().validationRules;
    if (!rules?.length) return undefined;
    let broken: DataValidationRule | undefined;
    for (const patch of patches) {
      if (patch.op !== "set") continue;
      const covering = rules.filter(
        (rule) => rule.policy !== "allow" && rangeContains(rule.range, patch.addr),
      );
      if (covering.length === 0) continue;
      const value = this.entered_scalar(patch.addr, patch.value);
      if (value === undefined) continue;
      let rule: DataValidationRule | undefined;
      try {
        rule = failingValidationRule(
          covering,
          patch.addr,
          value,
          storeEngine(this.deps.store)?.validationReads,
        );
      } catch (error) {
        if (error instanceof ValidationBudgetError) return undefined;
        throw error;
      }
      if (rule?.policy === "reject") return rule;
      broken ??= rule;
    }
    return broken;
  }

  /** The value `value` gives the cell at `addr`: a formula's result; undefined when unknown. */
  private entered_scalar(addr: Readonly<CellAddress>, value: CellValue): CellScalar | undefined {
    if (value.kind === "literal") return value.value;
    if (value.kind !== "formula") return undefined;
    const preview = storeEngine(this.deps.store)?.previewFormula(addr, value.src);
    if (preview?.status !== "value") return undefined;
    const result = preview.value;
    return typeof result === "object" && result !== null ? result.error : result;
  }

  private entry_text(value: CellValue, type: CellFormat): string {
    if (value.kind === "formula") return value.src;
    return value.kind === "literal" ? cellEditText(value.value, type) : "";
  }

  /** A cell's effective number format: its own, then its column's. */
  private number_format_of(style: CellStyle, column: Column | undefined): string | undefined {
    return style.numberFormat ?? column?.cellStyle?.numberFormat ?? column?.numberFormat;
  }

  /**
   * The style an entry stores: the cell's own `style`, in `entry_format` when
   * its format is General.
   */
  private entry_style(
    style: CellStyle,
    column: Column | undefined,
    entry_format: string | undefined,
  ): CellStyle {
    if (entry_format === undefined) return style;
    const current = this.number_format_of(style, column);
    return current === undefined || current === "General"
      ? { ...style, numberFormat: entry_format }
      : style;
  }

  /**
   * Excel's error alert for an entry `rule` refuses. The entry stays in its
   * cell behind the alert as `text`; Retry and No return to it with the text
   * selected, Yes and OK store it, and Cancel drops it.
   */
  private alert_entry(rule: DataValidationRule, entry: CellEntry, text: string): void {
    const generation = this.generation;
    const { address } = entry;
    const current = (): number | null =>
      generation === this.generation && address.sheet === this.deps.activeSheet()
        ? this.deps.toViewRow(address.row)
        : null;
    void import("./validation-alert.js").then(
      async ({ validationAlert: validation_alert }) => {
        let view_row = current();
        if (view_row === null || this.isEditing) return;
        this.beginEdit(view_row, address.col, text, false, false);
        const shown = this.generation;
        const answer = await validation_alert(this.deps.dialogs, rule).result;
        if (shown !== this.generation) return;
        this.cancel_editor();
        view_row = this.deps.toViewRow(address.row);
        if (view_row === null || address.sheet !== this.deps.activeSheet()) return;
        if (answer === "retry" || answer === "no") {
          this.beginEdit(view_row, address.col, text, true);
        } else if (answer === "yes" || answer === "ok") {
          this.commit_cell_edit_at(entry, view_row);
        }
      },
      (error: unknown) => {
        // Without its alert the entry would vanish unexplained: hand it back to the editor.
        const view_row = current();
        if (view_row !== null && !this.isEditing) this.beginEdit(view_row, address.col, text);
        reportError(error);
      },
    );
  }

  private cancel_pointer(): void {
    if (this.active_pointer_id === null) return;
    const cancel = this.drag_cancel;
    if (cancel) cancel(new PointerEvent("pointercancel", { pointerId: this.active_pointer_id }));
    else this.detach_drag();
  }

  /**
   * Open the cell editor on `row`, `col`. With `focus` false it opens as the
   * cell's view of a draft another edit surface types (see `setEditText`).
   */
  beginEdit(row: number, col: number, initial?: string, selectAll = false, focus = true): void {
    this.start_edit(row, col, { initial, selectAll, focus });
  }

  /**
   * Open the list of the list rule over view `row`, `col`, as its dropdown
   * arrow and Alt+Down do in Excel. `filter`, typed into the cell, keeps only
   * the items that contain it.
   */
  openList(row: number, col: number, filter = ""): void {
    this.start_edit(row, col, { list: filter });
  }

  private start_edit(row: number, col: number, request: EditRequest): void {
    const { initial, selectAll: select_all = false, focus = true, list } = request;
    if (this.deps.readOnly()) return;

    const edit_cell = this.deps.anchorCell(row, col);
    const sheet = this.deps.sheet();
    const column = sheet.columns[edit_cell.col];
    if (!column) return;

    const data_addr = {
      sheet: this.deps.activeSheet(),
      row: this.deps.toDataRow(edit_cell.row),
      col: edit_cell.col,
    };

    const formula = this.deps.store.getFormula(data_addr);
    const cell = this.deps.store.getCell(data_addr);
    const current = cell.resolved;
    const text =
      initial ??
      formula ??
      cellEditText(
        current,
        column.type,
        this.number_format_of(cell.style, column),
        column.numberLocale,
      );
    const content_top = this.deps.contentTop();

    this.cancel_pointer();
    this.deps.onEditStart();
    this.cancel_editor();
    const generation = ++this.generation;
    this.editing_address = data_addr;
    const selection = this.deps.selection();
    // Typing inside a selection keeps it, so Enter and Tab move within it and
    // Ctrl+Enter fills it, as in Excel. Elsewhere the edited cell is selected.
    let selection_changed = false;
    const active = selection.focusCell;
    if (selection.contains(edit_cell.row, edit_cell.col)) {
      // Editing the active cell keeps the selection's moving corner for Shift+Arrow.
      if (active?.row !== edit_cell.row || active.col !== edit_cell.col) {
        selection.setActiveCell(edit_cell.row, edit_cell.col);
      }
    } else {
      selection_changed = true;
      selection.selectCell(edit_cell.row, edit_cell.col);
    }
    this.deps.scheduleRender();
    if (selection_changed) this.deps.emitSelection();
    if (generation !== this.generation || this.deps.readOnly()) return;
    for (const listener of this.deps.editListeners["edit-begin"]) {
      listener({
        addr: { sheet: data_addr.sheet, row: edit_cell.row, col: edit_cell.col },
        sheetAddress: { ...data_addr },
      });
    }

    // edit-begin is a before-open notification. Reentrant callbacks can
    // replace or invalidate this request, but cannot reopen its stale target.
    if (generation !== this.generation || this.deps.readOnly()) return;

    const validation_rule = sheet.validationRules?.find(
      (rule) =>
        rangeContains(rule.range, data_addr) &&
        (rule.condition.kind === "list" || rule.condition.kind === "checkbox"),
    );

    const custom = column.editor ? this.deps.customEditors.get(column.editor) : undefined;
    if (custom) {
      // A custom editor owns its own input; another surface cannot type its draft.
      if (!focus) {
        this.editing_address = null;
        return;
      }
      this.active_editor = this.custom_editor;
      this.custom_editor.begin({
        editor: custom,
        grid: this.deps.grid,
        address: data_addr,
        viewAddress: { sheet: this.deps.activeSheet(), row: edit_cell.row, col: edit_cell.col },
        column,
        value: current,
        text,
        initialInput: initial,
        selectAll: select_all || initial === undefined,
        label: this.editor_label(edit_cell.row, edit_cell.col),
        rect: this.editor_rect(
          edit_cell.row,
          edit_cell.col,
          content_top,
          this.deps.scroller.scrollLeft,
        ),
        onCommit: (value, navigate) => this.finish_edit(data_addr, value, navigate),
        onCancel: () => this.end_editor(),
      });
      this.report_cell_mode();

      return;
    }

    // A list opens only on request (its arrow, Alt+Down or typing); F2 and a
    // double-click edit the text, as in Excel. A checkbox opens on any edit.
    const condition = validation_rule?.condition;
    if (
      validation_rule &&
      (condition?.kind === "list" ? list !== undefined : initial === undefined)
    ) {
      this.active_editor = this.validation_editor;
      this.validation_editor.begin({
        row: edit_cell.row,
        col: edit_cell.col,
        rule: validation_rule,
        values: validationListItems(
          validation_rule,
          data_addr,
          storeEngine(this.deps.store)?.validationReads,
        ),
        current,
        filter: list ?? "",
        rect: this.deps.screenRect(
          edit_cell.row,
          edit_cell.col,
          content_top,
          this.deps.scroller.scrollLeft,
        ),
        theme: this.deps.theme(),
        onCommit: (value, navigate) =>
          this.finish_edit(data_addr, { kind: "literal", value }, navigate),
        onCommitText: (value, navigate) => this.finish_edit(data_addr, value, navigate),
        onCancel: () => this.end_editor(),
      });

      return;
    }

    this.active_editor = this.editor;
    this.editor.begin({
      row: edit_cell.row,
      col: edit_cell.col,
      type: column.type,
      initial: text,
      // F2 and double-click put the caret at the end, as in Excel.
      selectAll: focus && select_all,
      entering: initial !== undefined,
      rect: this.text_box(
        edit_cell.row,
        edit_cell.col,
        this.deps.screenRect(
          edit_cell.row,
          edit_cell.col,
          content_top,
          this.deps.scroller.scrollLeft,
        ),
      ),
      label: this.editor_label(edit_cell.row, edit_cell.col),
      theme: this.deps.theme(),
      look: this.editor_look(
        column,
        cell.style,
        // A formula edits left-aligned under General alignment, as in Excel;
        // a typed entry is not a value yet, so only a column type aligns it.
        initial !== undefined || formula !== null ? null : current,
      ),
      focus,
      onCommit: (value, navigate) => this.finish_edit(data_addr, value, navigate),
      onCancel: () => this.end_editor(),
      onText: (value) => this.deps.editDraft.text(value),
      onShortcut: (event) => this.run_custom_shortcut(event, true),
      onPoint: (d_row, d_col, extend) => this.point_by(edit_cell, d_row, d_col, extend),
      complete: this.completion(edit_cell.row, edit_cell.col, initial !== undefined),
      onMode: () => this.report_cell_mode(),
      onRefuse: (message) => this.refuse_formula(message),
    });
    // A formula bar showing the draft starts from the opened text, completed or not.
    this.deps.editDraft.text(this.editor.value);
  }

  /**
   * How the cell editor shows the cell, as Excel's in-cell editor does: the
   * cell's font, colour and alignment over its column's. Under General
   * alignment the text being edited aligns by Excel's rule for it: `shown`
   * is the value the editor opened on, or null for a typed entry or a
   * formula, which edit left-aligned unless the column type is numeric.
   */
  private editor_look(column: Column, own: CellStyle, shown: CellScalar): EditorLook {
    const style = column.cellStyle === undefined ? own : { ...column.cellStyle, ...own };
    const theme = this.deps.theme();
    const lines = [style.underline ? "underline" : "", style.strikethrough ? "line-through" : ""];
    return {
      align: cellAlign(style, shown, column.type),
      font: fontFor(theme, style, this.deps.zoom()),
      color: style.color ?? theme.fg,
      decoration: lines.filter(Boolean).join(" ") || "none",
      pad: cellPadding(this.deps.zoom()),
    };
  }

  /** Excel's message for a formula that does not parse, with what is wrong with it. */
  private async refuse_formula(problem: string): Promise<void> {
    const { alertDialog: alert_dialog } = await import("./dialog.js");
    await alert_dialog(this.deps.dialogs, {
      title: "Formula",
      message: `There's a problem with this formula. ${problem}`,
    });
  }

  /**
   * Show `text`, typed in another edit surface such as a formula bar, in the
   * cell editor, with that surface's caret. Opens the editor on the focused
   * cell without taking focus when no edit is open. False when the cell
   * cannot be edited as text: read-only, or a custom editor owns it.
   */
  setEditText(text: string, selectionStart: number, selectionEnd: number): boolean {
    if (!this.isEditing) {
      const focus = this.deps.selection().focusCell;
      if (!focus) return false;
      this.beginEdit(focus.row, focus.col, text, false, false);
    }
    if (this.active_editor !== this.editor || !this.editor.isEditing) return false;
    this.editor.setText(text, selectionStart, selectionEnd);
    return true;
  }

  /**
   * Commit the open cell edit in place, as Enter does in a formula bar. False
   * when the edit stays open: its formula does not parse.
   */
  commitEdit(): boolean {
    return this.active_editor !== this.editor || this.editor.commit("none");
  }

  /** Cancel the open cell edit; both the editor and any formula bar show the stored value again. */
  cancelEdit(): void {
    if (this.isEditing) this.cancel_editor();
  }

  /** Store `entry`, whose cell shows at `view_row`, then move as its key asks. */
  private commit_cell_edit_at(entry: CellEntry, view_row: number): void {
    const { address, value, patches, navigate } = entry;
    const reason: CommitReason =
      navigate === "none"
        ? "edit-blur"
        : navigate === "right" || navigate === "left"
          ? "edit-tab"
          : "edit-enter";
    const outcome = this.deps.commit(patches, reason);

    if (outcome.status === "applied") {
      for (const listener of this.deps.editListeners["edit-commit"]) {
        listener({
          addr: { sheet: address.sheet, row: view_row, col: address.col },
          sheetAddress: { ...address },
          value,
        });
      }
      this.move_after_commit(view_row, address.col, navigate);
    }
    this.focus_grid();
    this.deps.scheduleRender();
  }

  /**
   * Ctrl+Enter: write the entry into every selected cell, as in Excel. A
   * formula's relative references shift with each cell. One cell when the
   * selection is only the edited cell.
   */
  private selection_fill(
    address: Readonly<CellAddress>,
    view_row: number,
    value: CellValue,
    entry_format?: string,
  ): DocumentOp[] {
    const columns = this.deps.sheet().columns;
    const patches: DocumentOp[] = [];
    this.deps.selection().forEachRect((rect) => {
      for (let row = rect.r0; row <= rect.r1; row++) {
        const data_row = this.deps.toDataRow(row);
        for (let col = rect.c0; col <= rect.c1; col++) {
          const anchor = this.deps.anchorCell(row, col);
          if (anchor.row !== row || anchor.col !== col) continue;
          const addr = { sheet: address.sheet, row: data_row, col };
          patches.push({
            op: "set",
            addr,
            style: this.entry_style(
              this.deps.store.getCell(addr).style,
              columns[col],
              entry_format,
            ),
            value:
              value.kind === "formula"
                ? {
                    kind: "formula",
                    src: shiftA1Refs(value.src, row - view_row, col - address.col),
                  }
                : value,
          });
        }
      }
    });
    return patches.length > 0
      ? patches
      : [
          {
            op: "set",
            addr: { ...address },
            value,
            style: this.entry_style(
              this.deps.store.getCell(address).style,
              columns[address.col],
              entry_format,
            ),
          },
        ];
  }

  private move_after_commit(row: number, col: number, navigate: EditNavigate): void {
    const selection = this.deps.selection();
    switch (navigate) {
      // Enter and Tab move within a selection of several cells.
      case "down":
        this.move_active_cell(1, 0);
        return;
      case "up":
        this.move_active_cell(-1, 0);
        return;
      case "right":
        this.move_active_cell(0, 1);
        return;
      case "left":
        this.move_active_cell(0, -1);
        return;
      // Ctrl+Enter keeps the selection and the active cell.
      case "stay":
        return;
      // An arrow key in Enter mode leaves the selection, as in Excel.
      case "arrow-down":
        this.navigate({ row, col }, row + 1, undefined, false);
        return;
      case "arrow-up":
        this.navigate({ row, col }, row - 1, undefined, false);
        return;
      case "arrow-right":
        this.navigate({ row, col }, undefined, this.deps.nextVisibleCol(col, 1), false);
        return;
      case "arrow-left":
        this.navigate({ row, col }, undefined, this.deps.nextVisibleCol(col, -1), false);
        return;
      case "none":
        if (selection.contains(row, col)) selection.setActiveCell(row, col);
        else selection.selectCell(row, col);
        this.deps.emitSelection();
        this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row, col });
    }
  }

  get fillPreview(): SelRect | null {
    return this.fill_target;
  }

  get fillTip(): FillTip | null {
    return this.tip;
  }

  /** The fill's `dragArea` while the fill handle is dragged; null otherwise. */
  get fillValuesArea(): SelRect | null {
    return this.fill_target ? this.fills.dragArea : null;
  }

  fillValueAt(row: number, col: number): { text: string; right: boolean } | null {
    return this.fills.preview(row, col);
  }

  /** The cells of the last fill-handle fill, whose Auto Fill Options button shows with menus on. */
  get autoFillTarget(): SelRect | null {
    return this.context_menu && !this.fill_target ? this.fills.optionsTarget : null;
  }

  /**
   * Open Auto Fill Options under its button: each choice redoes the last fill
   * that way, as one undo step. Returns false when the host turned menus off.
   */
  openAutoFillOptions(clientX: number, clientY: number): boolean {
    return this.openMenu(
      this.fills.choices().map((choice) => ({
        id: `autoFill-${choice}`,
        label: AUTO_FILL_LABELS[choice],
        onClick: () => {
          const target = this.fills.optionsTarget;
          if (target && this.fills.redo(choice)) this.select_filled(target);
          this.deps.scheduleRender();
        },
      })),
      clientX,
      clientY,
    );
  }

  private select_filled(target: SelRect): void {
    const selection = this.deps.selection();
    selection.selectCell(target.r0, target.c0);
    selection.extendTo(target.r1, target.c1);
    this.deps.emitSelection();
  }

  cellAtPointer(clientX: number, clientY: number): CellRef | null {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const py = clientY - rect.top;
    const theme = this.deps.theme();
    if (py < theme.headerHeight) return null;

    const content_x = this.deps.contentXAt(clientX - rect.left);
    const content_y = this.deps.contentYAt(py);

    const row = this.deps.rowAtOffset(Math.max(0, content_y));
    const col = this.deps.colAtX(Math.max(0, content_x));
    if (col === -1 || row < 0 || row >= this.deps.sheet().rowCount) return null;

    return this.deps.anchorCell(row, col);
  }

  fillHandleScreen(contentTop: number, scrollLeft: number): { x: number; y: number } | null {
    const src = this.fill_source_rect();
    if (!src) return null;
    const r = this.deps.screenRect(src.r1, src.c1, contentTop, scrollLeft);
    const y = r.y + r.h;
    if (y < this.deps.theme().headerHeight) return null;
    return { x: r.x + r.w, y };
  }

  destroy(): void {
    this.cancel_pointer();
    this.cancel_editor();
    this.editor.destroy();
    this.validation_editor.destroy();
    this.custom_editor.destroy();
    this.pick_list?.destroy();
    this.context_menu?.destroy();
    this.deps.scroller.removeEventListener("contextmenu", this.on_context_menu);
    this.deps.scroller.removeEventListener("pointerdown", this.on_pointer_down);
    this.deps.scroller.removeEventListener("dblclick", this.on_dbl_click);
    this.deps.scroller.removeEventListener("pointermove", this.on_hover);
    this.deps.host.removeEventListener("keydown", this.on_key_down);
  }

  private readonly on_pointer_down = (e: PointerEvent): void => {
    if (this.active_pointer_id !== null) return;
    // Primary button only. Touch contacts always report button 0; a pen barrel
    // button (non-zero) must not select, so the guard covers mouse AND pen.
    if (e.pointerType !== "touch" && e.button !== 0) return;
    const is_touch = e.pointerType === "touch";

    const editor = this.editor;
    // Formula point mode: while editing a "=" formula, clicks/drags pick A1
    // references into the editor instead of moving the grid selection.
    if (editor.isEditing && editor.value.startsWith("=")) {
      e.preventDefault();
      const start = this.cellAtPointer(e.clientX, e.clientY);
      if (!start) return;
      this.point_at(start, start);
      const move = (ev: PointerEvent): void => {
        const c = this.cellAtPointer(ev.clientX, ev.clientY);
        if (c) this.point_at(start, c);
      };
      // The picked reference stays replaceable: the next click or arrow key
      // replaces it until the user types, as in Excel's Point mode.
      const up = (): void => {
        this.detach_drag();
      };
      const cancel = (): void => {
        editor.endReference();
        this.detach_drag();
      };
      this.attach_drag(e, move, up, cancel);
      return;
    }
    // A draft typed in a formula bar commits when the user clicks a cell, as
    // the focused editor's blur would.
    if (this.active_editor === editor && editor.isEditing && !editor.isFocused) {
      editor.commit("none");
    }
    // A selected cell must own subsequent keyboard input across browsers.
    // Keep touch and active-editor gestures focused where they already are.
    if (!is_touch && !this.isEditing) this.deps.host.focus({ preventScroll: true });

    const viewport_rect = this.deps.viewportEl.getBoundingClientRect();
    if (!this.isEditing && this.hits_fill_handle(e.clientX, e.clientY)) {
      e.preventDefault();
      this.start_fill_drag(e);
      return;
    }

    // Resize gesture: near a column boundary in the top header, or a row boundary
    // in the left gutter. Takes priority over selection; disabled while editing.
    if (!this.isEditing && !this.deps.readOnly()) {
      const resize = this.resize_at(e);
      if (resize) {
        e.preventDefault();
        if (resize.kind === "col") this.start_column_resize(e, resize.index, e.clientX);
        else this.start_row_resize(e, resize.index, e.clientY);
        return;
      }
    }

    const additive = e.ctrlKey || e.metaKey;
    const theme = this.deps.theme();
    const py = e.clientY - viewport_rect.top;

    // Column letters select columns and row numbers select rows; Shift
    // extends, Ctrl/Cmd adds, and a drag across the headers extends, as in Excel.
    const px = e.clientX - viewport_rect.left;
    const column_header = py < theme.headerHeight;
    const row_header = !column_header && px < theme.rowHeaderWidth;
    if (column_header || row_header) {
      const header_at = (ev: PointerEvent): number => {
        const rect = this.deps.viewportEl.getBoundingClientRect();
        if (column_header) return this.deps.colAtX(this.deps.contentXAt(ev.clientX - rect.left));
        const row = this.deps.rowAtOffset(Math.max(0, this.deps.contentYAt(ev.clientY - rect.top)));
        return row < this.deps.rowCount() ? row : -1;
      };
      const extend_to = (index: number): void => {
        if (column_header) this.deps.selection().extendTo(0, index);
        else this.deps.selection().extendTo(index, this.deps.firstCol());
      };
      const index = header_at(e);
      if (index === -1) return;
      const selection = this.deps.selection();
      if (e.shiftKey) extend_to(index);
      else if (column_header) selection.selectColumn(index, additive);
      else selection.selectRow(index, additive);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      if (is_touch) return;
      const move = (ev: PointerEvent): void => {
        const reached = header_at(ev);
        if (reached === -1) return;
        extend_to(reached);
        this.deps.emitSelection();
        this.deps.scheduleRender();
      };
      this.attach_drag(e, move, () => this.detach_drag());
      return;
    }

    // The dropdown arrow beside a selected list cell opens its list, or
    // closes it while it is open, as in Excel.
    const list_cell = this.active_editor === this.editor ? null : this.list_button_cell_at(px, py);
    if (list_cell) {
      e.preventDefault();
      if (this.active_editor === this.validation_editor) this.cancel_editor();
      else this.openList(list_cell.row, list_cell.col);
      return;
    }

    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    if (this.is_auto_filter_header(cell.row, cell.col)) {
      // The area is at least 24 px wide, for touch, and may cover the inset.
      const hit = filterButtonHitRect(
        this.deps.screenRect(
          cell.row,
          cell.col,
          this.deps.contentTop(),
          this.deps.scroller.scrollLeft,
        ),
        this.deps.zoom(),
      );
      const x = e.clientX - viewport_rect.left;
      if (x >= hit.x && x <= hit.x + hit.w && py >= hit.y && py <= hit.y + hit.h) {
        e.preventDefault();
        const selection = this.deps.selection();
        selection.selectCell(cell.row, cell.col);
        this.deps.emitSelection();
        this.deps.scheduleRender();
        this.deps.openAutoFilter(cell.col);
        return;
      }
    }
    if (
      !is_touch &&
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
    if (is_touch && !e.shiftKey && !this.touch_extend_hit(e)) {
      selection.selectCell(cell.row, cell.col, additive);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      return;
    }

    if (e.shiftKey) selection.extendTo(cell.row, cell.col);
    else if (!is_touch) selection.selectCell(cell.row, cell.col, additive);
    this.deps.emitSelection();
    this.deps.scheduleRender();

    if (is_touch) e.preventDefault();
    const move = (ev: PointerEvent): void => {
      const c = this.cellAtPointer(ev.clientX, ev.clientY);
      if (!c) return;
      this.deps.selection().extendTo(c.row, c.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
    };
    this.attach_drag(e, move, () => this.detach_drag());
  };

  /**
   * Touch extend-drag hit: the contact lands within a narrow band (±6px)
   * around the rendered border of a current multi-cell selection rectangle.
   * Anywhere else (single cells, rect interiors) stays native-scroll.
   */
  private touch_extend_hit(e: PointerEvent): boolean {
    const viewport_rect = this.deps.viewportEl.getBoundingClientRect();
    const px = e.clientX - viewport_rect.left;
    const py = e.clientY - viewport_rect.top;
    const content_top = this.deps.contentTop();
    const scroll_left = this.deps.scroller.scrollLeft;
    const band = 6;

    let hit = false;
    this.deps.selection().forEachRect((r) => {
      if (r.r0 === r.r1 && r.c0 === r.c1) return;
      const tl = this.deps.screenRect(r.r0, r.c0, content_top, scroll_left);
      const br = this.deps.screenRect(r.r1, r.c1, content_top, scroll_left);
      const left = tl.x;
      const top = tl.y;
      const right = br.x + br.w;
      const bottom = br.y + br.h;
      const within_x = px >= left - band && px <= right + band;
      const within_y = py >= top - band && py <= bottom + band;
      if (!within_x || !within_y) return;
      const on_vertical = Math.abs(px - left) <= band || Math.abs(px - right) <= band;
      const on_horizontal = Math.abs(py - top) <= band || Math.abs(py - bottom) <= band;
      if (on_vertical || on_horizontal) hit = true;
    });
    return hit;
  }

  private readonly on_dbl_click = (e: MouseEvent): void => {
    // Double-click a column boundary → autofit that column.
    const resize = this.deps.readOnly() ? null : this.resize_at(e);
    if (resize && resize.kind === "col") {
      e.preventDefault();
      this.deps.autoFitColumns([resize.index]);
      return;
    }
    if (!this.deps.readOnly() && this.hits_fill_handle(e.clientX, e.clientY)) {
      e.preventDefault();
      this.fill_to_adjacent_data();
      return;
    }
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.beginEdit(cell.row, cell.col);
  };

  private hits_fill_handle(client_x: number, client_y: number): boolean {
    const handle = this.fillHandleScreen(this.deps.contentTop(), this.deps.scroller.scrollLeft);
    if (!handle) return false;
    const viewport = this.deps.viewportEl.getBoundingClientRect();
    return (
      Math.abs(client_x - viewport.left - handle.x) <= FILL_HANDLE_HIT_RADIUS &&
      Math.abs(client_y - viewport.top - handle.y) <= FILL_HANDLE_HIT_RADIUS
    );
  }

  /**
   * Double-click on the fill handle: fill down as far as the data in the
   * column next to the selection reaches, left column first, as in Excel.
   */
  private fill_to_adjacent_data(): void {
    const source = this.fill_source_rect();
    if (!source) return;
    const below = source.r1 + 1;
    if (below >= this.deps.rowCount()) return;
    const sheet = this.deps.activeSheet();
    const filled = (col: number): boolean => {
      const value = this.deps.store.getCell({
        sheet,
        row: this.deps.toDataRow(below),
        col,
      }).resolved;
      return value !== null && value !== "";
    };
    const columns = this.deps.colIndices();
    for (const col of [source.c0 - 1, source.c1 + 1]) {
      if (!columns.includes(col) || !filled(col)) continue;
      const end = this.deps.dataEdge(below, col, 1, 0);
      if (end === null || end < below) return;
      const target = { ...source, r1: end };
      if (this.fills.fill(source, target, {}, true)) this.select_filled(target);
      this.deps.scheduleRender();
      return;
    }
  }

  private readonly on_hover = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return; // no hover cursors for touch
    const resize = this.deps.readOnly() ? null : this.resize_at(e);
    this.deps.scroller.style.cursor =
      resize?.kind === "col" ? "col-resize" : resize?.kind === "row" ? "row-resize" : "";
  };

  private resize_at(e: MouseEvent): { kind: "col" | "row"; index: number } | null {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const theme = this.deps.theme();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y < theme.headerHeight && x >= theme.rowHeaderWidth) {
      const content_x = this.deps.contentXAt(x);
      const col = this.deps.colAtX(Math.max(0, content_x));
      if (col === -1) return null;

      const prev = this.deps.previousVisibleColumn(col);
      const start = this.deps.colLeftOf(col);
      const width = (this.deps.sheet().columns[col]?.width ?? MIN_COLUMN_WIDTH) * this.deps.zoom();
      const target = resizeTargetAt(content_x, col, start, width, prev);
      return target === null ? null : { kind: "col", index: target };
    }

    if (x < theme.rowHeaderWidth && y >= theme.headerHeight) {
      const content_y = this.deps.contentYAt(y);
      const row = this.deps.rowAtOffset(Math.max(0, content_y));
      if (row < 0 || row >= this.deps.rowCount()) return null;

      const target = resizeTargetAt(
        content_y,
        row,
        this.deps.rowTop(row),
        this.deps.rowHeight(row),
        row - 1,
      );
      return target === null ? null : { kind: "row", index: target };
    }

    return null;
  }

  private start_column_resize(e: PointerEvent, col: number, start_x: number): void {
    const start_width = this.deps.sheet().columns[col]?.width ?? MIN_COLUMN_WIDTH;
    let final_width = start_width;

    const move = (ev: PointerEvent): void => {
      // Pointer deltas are screen px; widths persist in base (unzoomed) units.
      const delta = (ev.clientX - start_x) / this.deps.zoom();
      final_width = Math.max(MIN_COLUMN_WIDTH, Math.round(start_width + delta));
      this.deps.previewColumnWidth(col, final_width);
    };
    const up = (): void => {
      this.detach_drag();
      this.deps.clearResizePreview();
      this.deps.commit(
        [
          {
            op: "setColumn",
            sheet: this.deps.activeSheet(),
            col,
            patch: { width: final_width },
          },
        ],
        "structure",
      );
    };
    const cancel = (): void => {
      this.detach_drag();
      this.deps.clearResizePreview();
    };
    this.attach_drag(e, move, up, cancel);
  }

  private start_row_resize(e: PointerEvent, row: number, start_y: number): void {
    const sheet = this.deps.activeSheet();
    const data_row = this.deps.toDataRow(row);
    const start_height = this.deps.rowHeight(row) / this.deps.zoom();
    let final_height = start_height;
    const move = (ev: PointerEvent): void => {
      final_height = Math.max(
        MIN_ROW_HEIGHT,
        Math.round(start_height + (ev.clientY - start_y) / this.deps.zoom()),
      );
      this.deps.previewRowHeight(row, final_height);
    };
    const cancel = (): void => {
      this.detach_drag();
      this.deps.clearResizePreview();
    };
    const up = (): void => {
      cancel();
      this.deps.commit(
        [{ op: "setRowMeta", sheet, row: data_row, meta: { height: final_height } }],
        "structure",
      );
    };
    this.attach_drag(e, move, up, cancel);
  }

  /** Runs a host command bound to this key combination; true when one ran. */
  private run_custom_shortcut(e: KeyboardEvent, editing: boolean): boolean {
    const focus_cell = this.deps.selection().focusCell;
    return this.deps.keymap().runCustom(
      e,
      {
        cell: focus_cell ? { sheet: this.deps.activeSheet(), ...focus_cell } : null,
        clientX: 0,
        clientY: 0,
      },
      this.deps.grid,
      editing,
    );
  }

  /**
   * Act on a key that waited while a command's code loaded, where the focus
   * is now: on the grid as usual, as text in a field the command focused, or
   * at the element that has the focus.
   */
  replayKey(e: KeyboardEvent): void {
    const target = document.activeElement;
    // Nothing focused, or the grid: the key acts on the grid, which it was pressed on.
    if (!target || target === this.deps.host || target === document.body) {
      this.on_key_down(e);
    } else if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      target.setRangeText(e.key, target.selectionStart ?? 0, target.selectionEnd ?? 0, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      target.dispatchEvent(new KeyboardEvent("keydown", e));
    }
  }

  /**
   * A key on the active cell of a row the view hides, as Excel's Go To leaves
   * it. Up, Down, Enter and Shift+Enter move to the nearest row that shows;
   * Left, Right and Tab move along the hidden row; F2, Backspace and typing
   * edit the cell in the formula bar. Returns false for the other keys, which
   * act as usual.
   */
  private hidden_active_key(e: KeyboardEvent, cell: CellAddress, mod: boolean): boolean {
    if (mod || e.altKey) return false;
    const enter = e.key === "Enter";
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || enter) {
      const direction = e.key === "ArrowUp" || (enter && e.shiftKey) ? -1 : 1;
      const row = this.deps.nearestShownRow(cell.row, direction);
      if (row !== null) {
        const shown = { sheet: cell.sheet, row, col: cell.col };
        this.deps.grid.setSelection({ kind: "cell", addr: shown });
        this.deps.scrollToCell(shown);
      }
      return true;
    }
    const tab = e.key === "Tab";
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || tab) {
      const direction = e.key === "ArrowLeft" || (tab && e.shiftKey) ? -1 : 1;
      this.deps.grid.goToCell({ ...cell, col: this.deps.nextVisibleCol(cell.col, direction) });
      return true;
    }
    if (this.deps.readOnly()) return false;
    if (e.key === "F2") return this.deps.editActiveCell(null);
    if (e.key === "Backspace") return this.deps.editActiveCell("");
    return PRINTABLE.test(e.key) && this.deps.editActiveCell(e.key);
  }

  /**
   * The keys that take the focus out of the grid, so Tab can move between
   * cells as in Excel without trapping the keyboard: F6 and Shift+F6, as
   * Excel's F6 moves between the parts of its window, and Escape then Tab or
   * Shift+Tab. A shell handles F6 itself before this. They run before a
   * host's own keymap, so no binding can close the way out.
   */
  private leave_grid_key(e: KeyboardEvent): boolean {
    // Shift on its own, on the way to Shift+Tab, keeps Escape's effect.
    if (Object.hasOwn(MODIFIER_KEYS, e.key)) return false;
    const after_escape = this.escape_leaves;
    this.escape_leaves = e.key === "Escape";
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== "F6" && !(after_escape && e.key === "Tab")) return false;
    e.preventDefault();
    focusOutside(this.deps.host, !e.shiftKey);
    return true;
  }

  private readonly on_key_down = (e: KeyboardEvent): void => {
    // The inline editor keeps its keys and forwards host shortcuts itself.
    if (this.isEditing) return;
    // Keys typed into an editable widget inside the host (find bar, custom
    // toolbar fields) belong to that widget. Without this guard the grid's
    // type-to-edit default steals focus mid-keystroke and Backspace becomes a
    // destructive clearSelection().
    const target = e.target;
    const in_editable_widget =
      target !== this.deps.host &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable));
    if (in_editable_widget) return;
    // A key pressed while a command loads its code acts after that command.
    if (this.deps.holdKey(e)) {
      e.preventDefault();
      return;
    }
    if (this.leave_grid_key(e)) return;

    // Headless hosts own the keymap: a handler intercepts first and consumes
    // by returning true; `false` drops every stock binding but keeps the
    // host's own menu commands.
    const keyboard = this.deps.keyboard();
    if (typeof keyboard === "function" && keyboard(e)) return;
    if (this.run_custom_shortcut(e, false)) return;
    if (keyboard === false) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // A modifier pressed alone changes nothing, so End then Shift+Arrow still extends.
    if (Object.hasOwn(MODIFIER_KEYS, e.key)) return;
    // End mode lasts for one key: End, then an arrow jumps like Ctrl+Arrow.
    const end_mode = this.end_mode;
    this.end_mode = false;

    const action = this.deps.keymap().action(e);
    // A dashboard has no cells: of the grid keys, only undo and redo act on it.
    if (isDashboard(this.deps.sheet())) {
      if (action !== "undo" && action !== "redo") return;
      e.preventDefault();
      if (action === "undo") this.deps.undo();
      else this.deps.redo();
      return;
    }
    if (action) {
      e.preventDefault();
      switch (action) {
        case "find":
          this.deps.openFind();
          break;

        case "replace":
          this.deps.openFind({ replace: true });
          break;

        case "undo":
          this.deps.undo();
          break;

        case "redo":
          this.deps.redo();
          break;

        case "copy":
          this.deps.copy();
          break;

        case "cut":
          this.deps.cut();
          break;

        case "paste":
          this.deps.paste();
          break;

        case "pasteValues":
          this.deps.pasteValues();
          break;

        case "pasteSpecial":
          this.deps.pasteSpecial();
          break;

        case "clearContents":
          this.deps.clearSelection();
          break;

        case "editNote":
          this.deps.grid.actions.editNote();
          break;

        case "bold":
          this.deps.grid.actions.toggleBold();
          break;

        case "italic":
          this.deps.grid.actions.toggleItalic();
          break;

        case "underline":
          this.deps.grid.actions.toggleUnderline();
          break;

        case "strikethrough":
          this.deps.grid.actions.toggleStrikethrough();
          break;

        case "insertDate":
        case "insertTime":
          this.insert_now(action === "insertDate");
          break;

        case "selectAll":
          this.select_region_or_sheet();
          break;

        case "fillDown":
          this.fill_from_edge(true);
          break;

        case "fillRight":
          this.fill_from_edge(false);
          break;

        case "toggleFilter":
          this.deps.grid.actions.toggleAutoFilter();
          break;

        default:
          // The format, hide, insert, Format Cells and sheet keys.
          this.deps.keyCommand(action);
      }

      return;
    }

    const selection = this.deps.selection();
    const focus = selection.focusCell;
    // The active cell on a row the view hides, after the Name Box went to it.
    const hidden = focus ? null : this.deps.hiddenActive();
    if (hidden && this.hidden_active_key(e, hidden, mod)) {
      e.preventDefault();
      return;
    }
    if (focus && key === " " && mod) {
      selection.selectColumn(focus.col, false, focus.row);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      e.preventDefault();
      return;
    }

    if (focus && key === " " && e.shiftKey) {
      selection.selectRow(focus.row, false, focus.col);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      e.preventDefault();
      return;
    }

    // Shift extends from the selection's moving corner; the active cell stays.
    const from = e.shiftKey ? (selection.extentCell ?? focus) : focus;
    const jump = mod || end_mode;
    const theme = this.deps.theme();
    const page_rows = Math.max(
      1,
      Math.floor((this.deps.viewportH() - theme.headerHeight) / theme.rowHeight),
    );

    switch (e.key) {
      case "ArrowDown":
        // Alt+Down opens a header's AutoFilter dropdown, a list rule's list, or
        // else Pick From Drop-down List, as in Excel and as on a combobox.
        if (e.altKey && !mod && focus && this.is_auto_filter_header(focus.row, focus.col)) {
          this.deps.openAutoFilter(focus.col);
          break;
        }
        if (e.altKey && !mod && focus && this.has_list_rule(focus.row, focus.col)) {
          this.openList(focus.row, focus.col);
          break;
        }
        if (e.altKey && !mod && focus) {
          this.pickFromList(focus.row, focus.col);
          break;
        }
        this.navigate(
          from,
          jump ? this.data_edge_row(from, 1) : this.step_from(from, 1, 0).row,
          undefined,
          e.shiftKey,
        );
        break;

      case "ArrowUp":
        this.navigate(
          from,
          jump ? this.data_edge_row(from, -1) : this.step_from(from, -1, 0).row,
          undefined,
          e.shiftKey,
        );
        break;

      case "ArrowRight":
        this.navigate(
          from,
          undefined,
          jump ? this.data_edge_col(from, 1) : this.step_from(from, 0, 1).col,
          e.shiftKey,
        );
        break;

      case "ArrowLeft":
        this.navigate(
          from,
          undefined,
          jump ? this.data_edge_col(from, -1) : this.step_from(from, 0, -1).col,
          e.shiftKey,
        );
        break;

      case "PageDown":
        this.navigate(from, (from?.row ?? 0) + page_rows, undefined, e.shiftKey);
        break;

      case "PageUp":
        this.navigate(from, (from?.row ?? 0) - page_rows, undefined, e.shiftKey);
        break;

      case "Home":
        if (mod) this.navigate(from, 0, this.deps.firstCol(), e.shiftKey);
        else this.navigate(from, undefined, this.deps.firstCol(), e.shiftKey);
        break;

      case "End":
        // Ctrl+End goes to the last used cell. End alone only starts End mode.
        if (mod) {
          const last = this.last_used_cell();
          this.navigate(from, last.row, last.col, e.shiftKey);
        } else this.end_mode = true;
        break;

      case "Enter":
        if (mod || e.altKey) return;
        this.move_active_cell(e.shiftKey ? -1 : 1, 0);
        break;

      case "Tab":
        if (mod || e.altKey) return;
        this.move_active_cell(0, e.shiftKey ? -1 : 1);
        break;

      case "F2":
        if (focus) this.beginEdit(focus.row, focus.col);
        break;

      case "Backspace":
        // Excel clears the active cell and opens it for typing; Esc restores it.
        if (mod || e.altKey || !focus) return;
        this.beginEdit(focus.row, focus.col, "");
        break;

      case "Escape":
        // Esc ends a fill-handle drag without filling, and a cut's moving
        // border, as in Excel.
        if (this.fill_target !== null) {
          this.cancel_pointer();
          break;
        }
        if (!this.deps.cancelCut()) return;
        break;

      default:
        if (!mod && !e.altKey && focus && PRINTABLE.test(e.key)) {
          // Typing in a list cell opens its list filtered by the typed text,
          // as Excel's AutoComplete for dropdown lists does; a formula still
          // starts in the cell editor.
          if (e.key !== "=" && this.has_list_rule(focus.row, focus.col)) {
            this.openList(focus.row, focus.col, e.key);
          } else this.beginEdit(focus.row, focus.col, e.key, false);
        } else {
          return;
        }
    }

    e.preventDefault();
  };

  /**
   * Enter and Tab: move the active cell one step. Inside a selection of
   * several cells the active cell wraps within it and the selection stays,
   * as in Excel; otherwise it moves to the next visible cell, and Enter after
   * a run of Tab moves goes to the column where the run started.
   */
  private move_active_cell(d_row: -1 | 0 | 1, d_col: -1 | 0 | 1): void {
    const selection = this.deps.selection();
    const focus = selection.focusCell;
    if (!focus) return;
    const run = this.tab_run;
    this.tab_run = null;
    const rect = this.active_rect();
    if (rect === null || (rect.r0 === rect.r1 && rect.c0 === rect.c1)) {
      const in_run = run !== null && run.row === focus.row && run.col === focus.col;
      const start = in_run ? run.start : focus.col;
      let col: number | undefined;
      if (d_col !== 0) col = this.deps.nextVisibleCol(focus.col, d_col);
      else if (d_row > 0 && in_run) col = start;
      this.navigate(focus, focus.row + d_row, col, false);
      const moved = this.deps.selection().focusCell;
      if (d_col !== 0 && moved) this.tab_run = { row: moved.row, col: moved.col, start };
      return;
    }

    let { row, col } = focus;
    if (d_row !== 0) {
      row += d_row;
      if (row > rect.r1 || row < rect.r0) {
        row = d_row > 0 ? rect.r0 : rect.r1;
        col += d_row;
        if (col > rect.c1) col = rect.c0;
        else if (col < rect.c0) col = rect.c1;
      }
    } else {
      col += d_col;
      if (col > rect.c1 || col < rect.c0) {
        col = d_col > 0 ? rect.c0 : rect.c1;
        row += d_col;
        if (row > rect.r1) row = rect.r0;
        else if (row < rect.r0) row = rect.r1;
      }
    }
    selection.setActiveCell(row, col);
    this.deps.emitSelection();
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row, col });
    this.deps.scheduleRender();
  }

  /** The selected rectangle that holds the active cell, or null without a selection. */
  private active_rect(): SelRect | null {
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

  /**
   * Ctrl+End's target: the lowest used row and the rightmost used column, as
   * in Excel; A1 on an empty sheet. Stores without data-edge support give the
   * sheet's last cell.
   */
  private last_used_cell(): CellRef {
    const last_row = Math.max(0, this.deps.rowCount() - 1);
    const sheet = this.deps.activeSheet();
    const filled = (row: number, col: number): boolean => {
      const value = this.deps.store.getCell({ sheet, row: this.deps.toDataRow(row), col }).resolved;
      return value !== null && value !== "";
    };
    let row = 0;
    let col = this.deps.firstCol();
    for (const candidate of this.deps.colIndices()) {
      let bottom: number | null = last_row;
      if (!filled(last_row, candidate)) {
        const edge = this.deps.dataEdge(last_row, candidate, -1, 0);
        if (edge === null) return { row: last_row, col: this.deps.lastCol() };
        bottom = filled(edge, candidate) ? edge : null;
      }
      if (bottom === null) continue;
      row = Math.max(row, bottom);
      col = candidate;
    }
    return { row, col };
  }

  /**
   * Ctrl+A: select the current region around the active cell (the block of
   * filled cells bounded by empty rows and columns), and the whole sheet when
   * that region is already selected or the active cell has no data around it.
   */
  private select_region_or_sheet(): void {
    const selection = this.deps.selection();
    const focus = selection.focusCell;
    if (!focus) return;
    const sheet_rect: SelRect = {
      r0: 0,
      c0: this.deps.firstCol(),
      r1: Math.max(0, this.deps.rowCount() - 1),
      c1: this.deps.lastCol(),
    };
    const region = this.current_region(focus);
    const current = this.active_rect();
    const same =
      current !== null &&
      current.r0 === region.r0 &&
      current.r1 === region.r1 &&
      current.c0 === region.c0 &&
      current.c1 === region.c1;
    const single = region.r0 === region.r1 && region.c0 === region.c1;
    selection.selectRect(same || single ? sheet_rect : region, focus);
    this.deps.emitSelection();
    this.deps.scheduleRender();
  }

  /** Excel's current region: grow from `start` while a cell next to the block, diagonals included, is filled. */
  private current_region(start: CellRef): SelRect {
    const sheet = this.deps.activeSheet();
    const last_row = this.deps.rowCount() - 1;
    const columns = this.deps.colIndices();
    const filled = (row: number, col: number): boolean => {
      if (row < 0 || row > last_row || !columns.includes(col)) return false;
      const value = this.deps.store.getCell({ sheet, row: this.deps.toDataRow(row), col }).resolved;
      return value !== null && value !== "";
    };
    const rect: SelRect = { r0: start.row, c0: start.col, r1: start.row, c1: start.col };
    for (let grown = true; grown;) {
      grown = false;
      const before = this.deps.nextVisibleCol(rect.c0, -1);
      const after = this.deps.nextVisibleCol(rect.c1, 1);
      for (let col = before; col <= after; col++) {
        if (filled(rect.r1 + 1, col)) {
          rect.r1 = Math.max(
            rect.r1 + 1,
            this.deps.dataEdge(rect.r1 + 1, col, 1, 0) ?? rect.r1 + 1,
          );
          grown = true;
        }
        if (filled(rect.r0 - 1, col)) {
          rect.r0 = Math.min(
            rect.r0 - 1,
            this.deps.dataEdge(rect.r0 - 1, col, -1, 0) ?? rect.r0 - 1,
          );
          grown = true;
        }
      }
      for (let row = Math.max(0, rect.r0 - 1); row <= Math.min(last_row, rect.r1 + 1); row++) {
        if (after !== rect.c1 && filled(row, after)) {
          rect.c1 = after;
          grown = true;
          break;
        }
      }
      for (let row = Math.max(0, rect.r0 - 1); row <= Math.min(last_row, rect.r1 + 1); row++) {
        if (before !== rect.c0 && filled(row, before)) {
          rect.c0 = before;
          grown = true;
          break;
        }
      }
    }
    return rect;
  }

  /**
   * Ctrl+; and Ctrl+Shift+;: enter today's date or the current time in the
   * active cell as a date serial with Excel's short date or time format.
   */
  private insert_now(date: boolean): void {
    const focus = this.deps.selection().focusCell;
    if (!focus || this.deps.readOnly()) return;
    const cell = this.deps.anchorCell(focus.row, focus.col);
    const now = new Date();
    const value = date
      ? dateToSerial(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
      : (now.getHours() * MINUTES_PER_HOUR + now.getMinutes()) / MINUTES_PER_DAY;
    const sheet = this.deps.activeSheet();
    const at = { row: this.deps.toDataRow(cell.row), col: cell.col };
    this.deps.commit(
      [
        { op: "set", addr: { sheet, ...at }, value: { kind: "literal", value } },
        {
          op: "setRangeStyle",
          range: { sheet, start: at, end: at },
          style: { numberFormat: date ? SHORT_DATE_FORMAT : SHORT_TIME_FORMAT },
        },
      ],
      "edit-enter",
    );
    this.deps.scheduleRender();
  }

  /** Whether view `row`, `col` is a header cell of the sheet's AutoFilter. */
  private is_auto_filter_header(row: number, col: number): boolean {
    const range = this.deps.sheet().autoFilter?.range;
    return (
      range !== undefined &&
      this.deps.toDataRow(row) === range.start.row &&
      col >= range.start.col &&
      col <= range.end.col
    );
  }

  /** Whether a list validation rule covers the cell at view `row`, `col`. */
  private has_list_rule(row: number, col: number): boolean {
    const cell = this.deps.anchorCell(row, col);
    const addr = {
      sheet: this.deps.activeSheet(),
      row: this.deps.toDataRow(cell.row),
      col: cell.col,
    };
    return (
      this.deps
        .sheet()
        .validationRules?.some(
          (rule) => hasListDropdown(rule) && rangeContains(rule.range, addr),
        ) ?? false
    );
  }

  /**
   * The active cell when (`x`, `y`), in viewport pixels, falls on the
   * dropdown arrow painted beside it; null otherwise.
   */
  private list_button_cell_at(x: number, y: number): CellRef | null {
    const focus = this.deps.selection().focusCell;
    if (!focus || !this.has_list_rule(focus.row, focus.col)) return null;
    const button = listButtonRect(
      this.deps.screenRect(
        focus.row,
        focus.col,
        this.deps.contentTop(),
        this.deps.scroller.scrollLeft,
      ),
      this.deps.zoom(),
    );
    const inside =
      x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h;
    return inside ? focus : null;
  }

  private navigate(
    focus: CellRef | null,
    row: number | undefined,
    col: number | undefined,
    extend: boolean,
  ): void {
    const max_row = Math.max(0, this.deps.rowCount() - 1);
    const first_col = this.deps.firstCol();
    const last_col = this.deps.lastCol();
    const target_row = Math.max(0, Math.min(max_row, row ?? focus?.row ?? 0));
    const target_col = Math.max(first_col, Math.min(last_col, col ?? focus?.col ?? first_col));
    const selection = this.deps.selection();
    if (extend) selection.extendTo(target_row, target_col);
    else selection.selectCell(target_row, target_col);
    this.deps.emitSelection();
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: target_row, col: target_col });
    this.deps.scheduleRender();
  }

  /**
   * One arrow step from `from`. A step that would stay inside the same merged
   * cell continues past it, so Right from a merged A6:B6 lands on C6, as in Excel.
   */
  private step_from(from: CellRef | null, d_row: number, d_col: -1 | 0 | 1): CellRef {
    const start = from ?? { row: 0, col: this.deps.firstCol() };
    const merged = this.deps.anchorCell(start.row, start.col);
    const max_row = Math.max(0, this.deps.rowCount() - 1);
    let cell = start;
    for (;;) {
      const next = {
        row: Math.max(0, Math.min(max_row, cell.row + d_row)),
        col: d_col === 0 ? cell.col : this.deps.nextVisibleCol(cell.col, d_col),
      };
      if (next.row === cell.row && next.col === cell.col) return cell;
      cell = next;
      const anchor = this.deps.anchorCell(cell.row, cell.col);
      if (anchor.row !== merged.row || anchor.col !== merged.col) return cell;
    }
  }

  /** Ctrl+Arrow vertical target: data-run edge when available, else sheet edge. */
  private data_edge_row(focus: CellRef | null, dir: 1 | -1): number {
    const edge = dir > 0 ? this.deps.rowCount() - 1 : 0;
    if (!focus) return edge;
    return this.deps.dataEdge(focus.row, focus.col, dir, 0) ?? edge;
  }

  /**
   * Ctrl+Arrow horizontal target. A data edge landing on a hidden column is
   * nudged to the nearest visible column in the travel direction.
   */
  private data_edge_col(focus: CellRef | null, dir: 1 | -1): number {
    const edge = dir > 0 ? this.deps.lastCol() : this.deps.firstCol();
    if (!focus) return edge;

    const target = this.deps.dataEdge(focus.row, focus.col, 0, dir);
    if (target === null) return edge;

    const cols = this.deps.colIndices();
    if (cols.includes(target)) return target;
    return this.deps.nextVisibleCol(target, dir);
  }

  private fill_source_rect(): SelRect | null {
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

  private fill_cell_at(client_x: number, client_y: number): CellRef {
    const rect = this.deps.viewportEl.getBoundingClientRect();
    const content_x = this.deps.contentXAt(client_x - rect.left);
    const content_y = this.deps.contentYAt(client_y - rect.top);
    const row_count = this.deps.sheet().rowCount;
    const row = Math.max(0, Math.min(row_count - 1, this.deps.rowAtOffset(Math.max(0, content_y))));
    let col = this.deps.colAtX(Math.max(0, content_x));
    if (col === -1) {
      const cols = this.deps.colIndices();
      col = content_x < 0 ? (cols[0] ?? 0) : (cols[cols.length - 1] ?? 0);
    }
    return { row, col };
  }

  private start_fill_drag(e: PointerEvent): void {
    const source = this.fill_source_rect();
    if (!source) return;
    this.fill_target = null;
    this.fills.dismiss();
    this.fills.beginDrag(source);
    const move = (ev: PointerEvent): void => {
      const c = this.fill_cell_at(ev.clientX, ev.clientY);
      const target = this.extend_fill(source, c);
      this.fill_target = target;
      // Excel's tip: the value the last cell will get, beside the pointer.
      const text = this.fills.drag(target, { swap: ev.ctrlKey || ev.altKey });
      const viewport = this.deps.viewportEl.getBoundingClientRect();
      this.tip =
        text === null
          ? null
          : { text, x: ev.clientX - viewport.left, y: ev.clientY - viewport.top };
      this.deps.scheduleRender();
    };
    const up = (ev: PointerEvent): void => {
      this.detach_drag();
      const target = this.fill_target;
      this.fill_target = null;
      this.tip = null;
      // Ctrl (Option on a Mac) swaps counting and copying, as in Excel.
      if (target && this.fills.fill(source, target, { swap: ev.ctrlKey || ev.altKey }, true)) {
        this.select_filled(target);
      }
      this.fills.endDrag();
      this.deps.scheduleRender();
    };
    const cancel = (): void => {
      // A cancelled fill-drag (browser reclaimed the pointer) commits nothing.
      this.fill_target = null;
      this.tip = null;
      this.fills.endDrag();
      this.detach_drag();
      this.deps.scheduleRender();
    };
    this.attach_drag(e, move, up, cancel);
  }

  private extend_fill(source: SelRect, c: CellRef): SelRect {
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

  /**
   * Ctrl+D and Ctrl+R: copy the top row (or left column) of the selection,
   * with its formats, into the rest of it. With one cell selected, copy the
   * cell above (or to the left) into it, as Excel's Fill Down and Fill Right do.
   */
  private fill_from_edge(down: boolean): void {
    const rect = this.fill_source_rect();
    if (!rect) return;
    const single = down ? rect.r0 === rect.r1 : rect.c0 === rect.c1;
    if (single && (down ? rect.r0 === 0 : rect.c0 === this.deps.firstCol())) return;
    const target = single
      ? down
        ? { ...rect, r0: rect.r0 - 1 }
        : { ...rect, c0: this.deps.nextVisibleCol(rect.c0, -1) }
      : rect;
    const source = down ? { ...target, r1: target.r0 } : { ...target, c1: target.c0 };
    // With one cell, Ctrl+D and Ctrl+R copy the cell before it only, as in
    // Excel; over a range they fill the rows hidden by hand in it too.
    this.fills.fill(source, target, { copy: true }, false, !single);
    this.deps.scheduleRender();
  }

  /**
   * Capture the initiating pointer on the scroller and track it until
   * `pointerup` (commit) or `pointercancel` (abandon, never commit). Events
   * from other pointers are ignored for the drag's lifetime.
   */
  private attach_drag(
    e: PointerEvent,
    move: (ev: PointerEvent) => void,
    up: (ev: PointerEvent) => void,
    cancel?: (ev: PointerEvent) => void,
  ): void {
    this.cancel_pointer();
    const scroller = this.deps.scroller;
    this.active_pointer_id = e.pointerId;

    const own = (ev: PointerEvent): boolean => ev.pointerId === this.active_pointer_id;
    this.drag_move = (ev) => {
      if (own(ev)) move(ev);
    };
    this.drag_up = (ev) => {
      if (own(ev)) up(ev);
    };
    this.drag_cancel = (ev) => {
      if (!own(ev)) return;
      if (cancel) cancel(ev);
      else this.detach_drag();
    };

    scroller.addEventListener("pointermove", this.drag_move);
    scroller.addEventListener("pointerup", this.drag_up);
    scroller.addEventListener("pointercancel", this.drag_cancel);
    scroller.addEventListener("lostpointercapture", this.drag_cancel);
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

  private detach_drag(): void {
    const scroller = this.deps.scroller;
    if (this.drag_move) scroller.removeEventListener("pointermove", this.drag_move);
    if (this.drag_up) scroller.removeEventListener("pointerup", this.drag_up);
    if (this.drag_cancel) {
      scroller.removeEventListener("pointercancel", this.drag_cancel);
      scroller.removeEventListener("lostpointercapture", this.drag_cancel);
    }
    this.drag_move = null;
    this.drag_up = null;
    this.drag_cancel = null;

    const pointer_id = this.active_pointer_id;
    this.active_pointer_id = null;
    if (
      pointer_id !== null &&
      typeof scroller.hasPointerCapture === "function" &&
      typeof scroller.releasePointerCapture === "function" &&
      scroller.hasPointerCapture(pointer_id)
    ) {
      scroller.releasePointerCapture(pointer_id);
    }
  }
}
