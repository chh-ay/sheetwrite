import { rangeA1, shiftA1Refs } from "./a1.js";
import type { CellCommand } from "./cell-commands.js";
import { cellEditText, parseCellEntry } from "./cell-input.js";
import { ContextMenu } from "./context-menu.js";
import { CustomEditorController } from "./custom-editor.js";
import { isDashboard } from "./dashboard.js";
import { dateToSerial } from "./date-serial.js";
import type { DialogHost } from "./dialog.js";
import type { EditDraftSink } from "./edit-draft.js";
import { type EditCompletion, EditController, type EditNavigate } from "./editor.js";
import { type AutoFillChoice, FillController, type FillTip } from "./fill-controller.js";
import { FILL_HANDLE_HIT_RADIUS } from "./grid-constants.js";
import type { Keymap } from "./keymap.js";
import { filterButtonRect, listButtonRect } from "./overlay-painter.js";
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

/** How an edit opens. */
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
  private readonly validationEditor: ValidationEditor;
  private readonly customEditor: CustomEditorController;
  private contextMenu: ContextMenu | null = null;
  /** Corners of the reference the editor last picked by pointer or arrow key. */
  private pointAnchor: CellRef | null = null;
  private pointEnd: CellRef | null = null;
  private editingAddress: Readonly<CellAddress> | null = null;
  private activeEditor:
    | EditController
    | ValidationEditor
    | CustomEditorController
    | PickList
    | null = null;
  /** Pick From Drop-down List, made when it first opens. */
  private pickList: PickList | null = null;
  private generation = 0;
  private fillTarget: SelRect | null = null;
  /** The value tip of the fill handle's drag. */
  private tip: FillTip | null = null;
  /** Fills and the Auto Fill Options that redo them. */
  private readonly fills: FillController;
  /** Excel's End mode: End was the last key, so the next arrow jumps to a data edge. */
  private endMode = false;
  /** Excel's cell mode, which the `cell-mode` event last reported. */
  private mode: CellMode = "ready";
  /**
   * Excel's Tab run: the cell a run of Tab moves left active, and the column
   * the run started in, where the next Enter goes. Any other move ends it.
   */
  private tabRun: { readonly row: number; readonly col: number; readonly start: number } | null =
    null;
  /** AutoComplete's code, once the first edit has loaded it. */
  private autocomplete: typeof import("./autocomplete.js") | null = null;
  /** The load of AutoComplete's code, started by the first edit or list. */
  private autocompleteLoad: Promise<typeof import("./autocomplete.js")> | null = null;
  private dragMove: ((ev: PointerEvent) => void) | null = null;
  private dragUp: ((ev: PointerEvent) => void) | null = null;
  private dragCancel: ((ev: PointerEvent) => void) | null = null;
  /** Pointer that owns the active drag; other pointers' events are ignored. */
  private activePointerId: number | null = null;

  constructor(deps: InteractionDependencies) {
    this.deps = deps;
    this.editor = new EditController(deps.viewportEl, {
      highlightCells: deps.highlightCells,
      sheet: deps.activeSheet,
      cell: () => this.editingAddress,
      store: deps.store,
    });
    this.validationEditor = new ValidationEditor(deps.viewportEl);
    this.customEditor = new CustomEditorController(deps.viewportEl);
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
    deps.scroller.addEventListener("contextmenu", this.onContextMenu);
    deps.scroller.addEventListener("pointerdown", this.onPointerDown);
    deps.scroller.addEventListener("dblclick", this.onDblClick);
    deps.scroller.addEventListener("pointermove", this.onHover);
    deps.host.addEventListener("keydown", this.onKeyDown);
  }

  get isEditing(): boolean {
    return this.activeEditor !== null;
  }

  /** Excel's cell mode now; see {@link CellMode}. */
  get cellMode(): CellMode {
    return this.mode;
  }

  /** Emit `cell-mode` when the mode of the open editor, or of none, changed. */
  private reportCellMode(): void {
    const editor = this.activeEditor;
    let mode: CellMode = "ready";
    if (editor === this.editor) mode = this.editor.mode;
    else if (editor === this.customEditor) mode = "edit";
    if (mode === this.mode) return;
    this.mode = mode;
    for (const listener of this.deps.editListeners["cell-mode"]) listener({ mode });
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

  /**
   * Open the context menu with `items` at a point, for a menu that belongs to
   * an object, not a cell. Returns false when the host turned menus off.
   */
  openMenu(items: readonly ContextMenuItem[], clientX: number, clientY: number): boolean {
    if (!this.contextMenu) return false;

    this.contextMenu.open({ cell: null, clientX, clientY }, items);
    return true;
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
    // Any change but the fill's own ends Auto Fill Options, as in Excel.
    if (change === "sheet" || change === "read-only") this.fills.dismiss();
    else this.fills.documentChanged();
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
        text:
          formula ??
          cellEditText(
            value,
            column.type,
            this.numberFormatAt(address, column),
            column.numberLocale,
          ),
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
      void this.loadAutocomplete().then(() => {
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
      complete: (field, typedText) => current()?.complete(field, typedText) ?? null,
      keyDown: (event, field) => current()?.keyDown(event, field) ?? false,
      reposition: (field) => made?.reposition(field),
      close: () => made?.close(),
    };
  }

  /** AutoComplete's code, loaded once. */
  private loadAutocomplete(): Promise<typeof import("./autocomplete.js")> {
    this.autocompleteLoad ??= import("./autocomplete.js").then((module) => {
      this.autocomplete = module;
      return module;
    });
    return this.autocompleteLoad;
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
    void this.loadAutocomplete().then((module) => {
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
      const list = (this.pickList ??= new module.PickList(this.deps.viewportEl));
      this.editingAddress = address;
      this.activeEditor = list;
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
          this.finishEdit(address, { kind: "literal", value: entry }, navigate),
        onCancel: () => this.endEditor(),
      });
    });
  }

  /**
   * The editor's accessible name: the column and the row number the row
   * header shows, the sheet row under a filter and the view position under a
   * view sort.
   */
  private editorLabel(row: number, col: number): string {
    const sorted = (this.deps.sheet().sortKeys?.length ?? 0) > 0;
    const shown = sorted ? row : this.deps.toDataRow(row);
    return `Edit ${this.deps.columnHeader(col)}, row ${shown + 1}`;
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

  /**
   * Put the reference from view cell `anchor` to `end` into the editor,
   * replacing a picked one. It names sheet rows: under a sort or filter view
   * the pointed cell's row in the sheet, as in Excel.
   */
  private pointAt(anchor: CellRef, end: CellRef): void {
    this.pointAnchor = anchor;
    this.pointEnd = end;
    const sheetCell = (cell: CellRef): CellRef => ({
      row: this.deps.toDataRow(cell.row),
      col: cell.col,
    });
    this.editor.setReference(rangeA1(sheetCell(anchor), sheetCell(end)));
  }

  /**
   * An arrow key in Enter mode: move the pointed reference by one cell, or
   * with Shift stretch it, starting from the edited cell, as in Excel.
   */
  private pointBy(editCell: CellRef, dRow: number, dCol: number, extend: boolean): void {
    const picked = this.editor.isPointing ? this.pointAnchor : null;
    const anchor = picked ?? editCell;
    const end = (picked ? this.pointEnd : null) ?? editCell;
    const step = (cell: CellRef): CellRef => ({
      row: Math.max(0, Math.min(this.deps.rowCount() - 1, cell.row + dRow)),
      col: dCol === 0 ? cell.col : this.deps.nextVisibleCol(cell.col, dCol < 0 ? -1 : 1),
    });
    const moved = step(extend ? end : anchor);
    if (extend) this.pointAt(anchor, moved);
    else this.pointAt(moved, moved);
    this.deps.scrollToCell({ sheet: this.deps.activeSheet(), row: moved.row, col: moved.col });
  }

  private endEditor(): void {
    this.editingAddress = null;
    this.activeEditor = null;
    this.reportCellMode();
    this.deps.host.focus();
    this.deps.scheduleRender();
    this.deps.editDraft.end();
  }

  private cancelEditor(): void {
    ++this.generation;
    this.editingAddress = null;
    const editor = this.activeEditor;
    this.activeEditor = null;
    editor?.cancel();
    this.reportCellMode();
  }

  private finishEdit(
    address: Readonly<CellAddress>,
    input: string | CellValue,
    navigate: EditNavigate,
  ): void {
    if (this.editingAddress !== address) return;
    this.editingAddress = null;
    this.activeEditor = null;
    this.reportCellMode();
    try {
      if (address.sheet !== this.deps.activeSheet()) return;
      const viewRow = this.deps.toViewRow(address.row);
      if (viewRow === null) return;
      const column = this.deps.sheet().columns[address.col];
      const parsed =
        typeof input === "string"
          ? parseCellEntry(
              input,
              column?.type ?? "text",
              this.numberFormatAt(address, column),
              column?.numberLocale,
            )
          : { value: input };
      const value = parsed.value;
      // An entry keeps the cell's formatting, as in Excel; a `set` without a
      // style would clear it. A General entry gives an unformatted cell the
      // format that shows it as typed.
      const patches: DocumentOp[] =
        navigate === "stay"
          ? this.selectionFill(address, viewRow, value, parsed.numberFormat)
          : [
              {
                op: "set",
                addr: { ...address },
                value,
                style: this.entryStyle(address, column, parsed.numberFormat),
              },
            ];
      const entry: CellEntry = { address, value, patches, navigate };
      const decide = (): void => {
        const rule = this.brokenRule(patches);
        if (rule) {
          const text =
            typeof input === "string" ? input : this.entryText(value, column?.type ?? "text");
          this.alertEntry(rule, entry, text);
          return;
        }
        this.commitCellEditAt(entry, viewRow);
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
  private brokenRule(patches: readonly DocumentOp[]): DataValidationRule | undefined {
    const rules = this.deps.sheet().validationRules;
    if (!rules?.length) return undefined;
    let broken: DataValidationRule | undefined;
    for (const patch of patches) {
      if (patch.op !== "set") continue;
      const covering = rules.filter(
        (rule) => rule.policy !== "allow" && rangeContains(rule.range, patch.addr),
      );
      if (covering.length === 0) continue;
      const value = this.enteredScalar(patch.addr, patch.value);
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
  private enteredScalar(addr: Readonly<CellAddress>, value: CellValue): CellScalar | undefined {
    if (value.kind === "literal") return value.value;
    if (value.kind !== "formula") return undefined;
    const preview = storeEngine(this.deps.store)?.previewFormula(addr, value.src);
    if (preview?.status !== "value") return undefined;
    const result = preview.value;
    return typeof result === "object" && result !== null ? result.error : result;
  }

  private entryText(value: CellValue, type: CellFormat): string {
    if (value.kind === "formula") return value.src;
    return value.kind === "literal" ? cellEditText(value.value, type) : "";
  }

  /** A cell's effective number format: its own, then its column's. */
  private numberFormatAt(
    addr: Readonly<CellAddress>,
    column: Column | undefined,
  ): string | undefined {
    return (
      this.deps.store.getCell(addr).style.numberFormat ??
      column?.cellStyle?.numberFormat ??
      column?.numberFormat
    );
  }

  /** The style an entry stores: the cell's own, in `entryFormat` when its format is General. */
  private entryStyle(
    addr: Readonly<CellAddress>,
    column: Column | undefined,
    entryFormat: string | undefined,
  ): CellStyle {
    const style = this.deps.store.getCell(addr).style;
    if (entryFormat === undefined) return style;
    const current = this.numberFormatAt(addr, column);
    return current === undefined || current === "General"
      ? { ...style, numberFormat: entryFormat }
      : style;
  }

  /**
   * Excel's error alert for an entry `rule` refuses. The entry stays in its
   * cell behind the alert as `text`; Retry and No return to it with the text
   * selected, Yes and OK store it, and Cancel drops it.
   */
  private alertEntry(rule: DataValidationRule, entry: CellEntry, text: string): void {
    const generation = this.generation;
    const { address } = entry;
    const current = (): number | null =>
      generation === this.generation && address.sheet === this.deps.activeSheet()
        ? this.deps.toViewRow(address.row)
        : null;
    void import("./validation-alert.js").then(
      async ({ validationAlert }) => {
        let viewRow = current();
        if (viewRow === null || this.isEditing) return;
        this.beginEdit(viewRow, address.col, text, false, false);
        const shown = this.generation;
        const answer = await validationAlert(this.deps.dialogs, rule).result;
        if (shown !== this.generation) return;
        this.cancelEditor();
        viewRow = this.deps.toViewRow(address.row);
        if (viewRow === null || address.sheet !== this.deps.activeSheet()) return;
        if (answer === "retry" || answer === "no") {
          this.beginEdit(viewRow, address.col, text, true);
        } else if (answer === "yes" || answer === "ok") {
          this.commitCellEditAt(entry, viewRow);
        }
      },
      (error: unknown) => {
        // Without its alert the entry would vanish unexplained: hand it back to the editor.
        const viewRow = current();
        if (viewRow !== null && !this.isEditing) this.beginEdit(viewRow, address.col, text);
        reportError(error);
      },
    );
  }

  private cancelPointer(): void {
    if (this.activePointerId === null) return;
    const cancel = this.dragCancel;
    if (cancel) cancel(new PointerEvent("pointercancel", { pointerId: this.activePointerId }));
    else this.detachDrag();
  }

  /**
   * Open the cell editor on `row`, `col`. With `focus` false it opens as the
   * cell's view of a draft another edit surface types (see `setEditText`).
   */
  beginEdit(row: number, col: number, initial?: string, selectAll = false, focus = true): void {
    this.startEdit(row, col, { initial, selectAll, focus });
  }

  /**
   * Open the list of the list rule over view `row`, `col`, as its dropdown
   * arrow and Alt+Down do in Excel. `filter`, typed into the cell, keeps only
   * the items that contain it.
   */
  openList(row: number, col: number, filter = ""): void {
    this.startEdit(row, col, { list: filter });
  }

  private startEdit(row: number, col: number, request: EditRequest): void {
    const { initial, selectAll = false, focus = true, list } = request;
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

    const formula = this.deps.store.getFormula(dataAddr);
    const current = this.deps.store.getCell(dataAddr).resolved;
    const text =
      initial ??
      formula ??
      cellEditText(
        current,
        column.type,
        this.numberFormatAt(dataAddr, column),
        column.numberLocale,
      );
    const contentTop = this.deps.contentTop();

    this.cancelPointer();
    this.deps.onEditStart();
    this.cancelEditor();
    const generation = ++this.generation;
    this.editingAddress = dataAddr;
    const selection = this.deps.selection();
    // Typing inside a selection keeps it, so Enter and Tab move within it and
    // Ctrl+Enter fills it, as in Excel. Elsewhere the edited cell is selected.
    let selectionChanged = false;
    const active = selection.focusCell;
    if (selection.contains(editCell.row, editCell.col)) {
      // Editing the active cell keeps the selection's moving corner for Shift+Arrow.
      if (active?.row !== editCell.row || active.col !== editCell.col) {
        selection.setActiveCell(editCell.row, editCell.col);
      }
    } else {
      selectionChanged = true;
      selection.selectCell(editCell.row, editCell.col);
    }
    this.deps.scheduleRender();
    if (selectionChanged) this.deps.emitSelection();
    if (generation !== this.generation || this.deps.readOnly()) return;
    for (const listener of this.deps.editListeners["edit-begin"]) {
      listener({
        addr: { sheet: dataAddr.sheet, row: editCell.row, col: editCell.col },
        sheetAddress: { ...dataAddr },
      });
    }

    // edit-begin remains a before-open notification. Reentrant callbacks can
    // replace or invalidate this request, but cannot reopen its stale target.
    if (generation !== this.generation || this.deps.readOnly()) return;

    const validationRule = sheet.validationRules?.find(
      (rule) =>
        rangeContains(rule.range, dataAddr) &&
        (rule.condition.kind === "list" || rule.condition.kind === "checkbox"),
    );

    const custom = column.editor ? this.deps.customEditors.get(column.editor) : undefined;
    if (custom) {
      // A custom editor owns its own input; another surface cannot type its draft.
      if (!focus) {
        this.editingAddress = null;
        return;
      }
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
      this.reportCellMode();

      return;
    }

    // A list opens only on request (its arrow, Alt+Down or typing); F2 and a
    // double-click edit the text, as in Excel. A checkbox opens on any edit.
    const condition = validationRule?.condition;
    if (
      validationRule &&
      (condition?.kind === "list" ? list !== undefined : initial === undefined)
    ) {
      this.activeEditor = this.validationEditor;
      this.validationEditor.begin({
        row: editCell.row,
        col: editCell.col,
        rule: validationRule,
        values: validationListItems(
          validationRule,
          dataAddr,
          storeEngine(this.deps.store)?.validationReads,
        ),
        current,
        filter: list ?? "",
        rect: this.deps.screenRect(
          editCell.row,
          editCell.col,
          contentTop,
          this.deps.scroller.scrollLeft,
        ),
        theme: this.deps.theme(),
        onCommit: (value, navigate) =>
          this.finishEdit(dataAddr, { kind: "literal", value }, navigate),
        onCommitText: (value, navigate) => this.finishEdit(dataAddr, value, navigate),
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
      // F2 and double-click put the caret at the end, as in Excel.
      selectAll: focus && selectAll,
      entering: initial !== undefined,
      rect: this.deps.screenRect(
        editCell.row,
        editCell.col,
        contentTop,
        this.deps.scroller.scrollLeft,
      ),
      label: this.editorLabel(editCell.row, editCell.col),
      theme: this.deps.theme(),
      focus,
      onCommit: (value, navigate) => this.finishEdit(dataAddr, value, navigate),
      onCancel: () => this.endEditor(),
      onText: (value) => this.deps.editDraft.text(value),
      onShortcut: (event) => this.runCustomShortcut(event, true),
      onPoint: (dRow, dCol, extend) => this.pointBy(editCell, dRow, dCol, extend),
      complete: this.completion(editCell.row, editCell.col, initial !== undefined),
      onMode: () => this.reportCellMode(),
      onRefuse: (message) => this.refuseFormula(message),
    });
    // A formula bar showing the draft starts from the opened text, completed or not.
    this.deps.editDraft.text(this.editor.value);
  }

  /** Excel's message for a formula that does not parse, with what is wrong with it. */
  private async refuseFormula(problem: string): Promise<void> {
    const { alertDialog } = await import("./dialog.js");
    await alertDialog(this.deps.dialogs, {
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
    if (this.activeEditor !== this.editor || !this.editor.isEditing) return false;
    this.editor.setText(text, selectionStart, selectionEnd);
    return true;
  }

  /**
   * Commit the open cell edit in place, as Enter does in a formula bar. False
   * when the edit stays open: its formula does not parse.
   */
  commitEdit(): boolean {
    return this.activeEditor !== this.editor || this.editor.commit("none");
  }

  /** Cancel the open cell edit; both the editor and any formula bar show the stored value again. */
  cancelEdit(): void {
    if (this.isEditing) this.cancelEditor();
  }

  /** Store `entry`, whose cell shows at `viewRow`, then move as its key asks. */
  private commitCellEditAt(entry: CellEntry, viewRow: number): void {
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
          addr: { sheet: address.sheet, row: viewRow, col: address.col },
          sheetAddress: { ...address },
          value,
        });
      }
      this.moveAfterCommit(viewRow, address.col, navigate);
    }
    this.deps.host.focus();
    this.deps.scheduleRender();
  }

  /**
   * Ctrl+Enter: write the entry into every selected cell, as in Excel. A
   * formula's relative references shift with each cell. One cell when the
   * selection is only the edited cell.
   */
  private selectionFill(
    address: Readonly<CellAddress>,
    viewRow: number,
    value: CellValue,
    entryFormat?: string,
  ): DocumentOp[] {
    const columns = this.deps.sheet().columns;
    const patches: DocumentOp[] = [];
    this.deps.selection().forEachRect((rect) => {
      for (let row = rect.r0; row <= rect.r1; row++) {
        const dataRow = this.deps.toDataRow(row);
        for (let col = rect.c0; col <= rect.c1; col++) {
          const anchor = this.deps.anchorCell(row, col);
          if (anchor.row !== row || anchor.col !== col) continue;
          const addr = { sheet: address.sheet, row: dataRow, col };
          patches.push({
            op: "set",
            addr,
            style: this.entryStyle(addr, columns[col], entryFormat),
            value:
              value.kind === "formula"
                ? {
                    kind: "formula",
                    src: shiftA1Refs(value.src, row - viewRow, col - address.col),
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
            style: this.entryStyle(address, columns[address.col], entryFormat),
          },
        ];
  }

  private moveAfterCommit(row: number, col: number, navigate: EditNavigate): void {
    const selection = this.deps.selection();
    switch (navigate) {
      // Enter and Tab move within a selection of several cells.
      case "down":
        this.moveActiveCell(1, 0);
        return;
      case "up":
        this.moveActiveCell(-1, 0);
        return;
      case "right":
        this.moveActiveCell(0, 1);
        return;
      case "left":
        this.moveActiveCell(0, -1);
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
    return this.fillTarget;
  }

  /** The value tip beside the fill handle while it is dragged. */
  get fillTip(): FillTip | null {
    return this.tip;
  }

  /** The new cells of the dragged fill handle's fill, which show their values in place. */
  get fillValuesArea(): SelRect | null {
    return this.fillTarget ? this.fills.dragArea : null;
  }

  /** What a cell of {@link fillValuesArea} will show; null for a formula. */
  fillValueAt(row: number, col: number): { text: string; right: boolean } | null {
    return this.fills.preview(row, col);
  }

  /** The cells of the last fill-handle fill, whose Auto Fill Options button shows with menus on. */
  get autoFillTarget(): SelRect | null {
    return this.contextMenu && !this.fillTarget ? this.fills.optionsTarget : null;
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
          if (target && this.fills.redo(choice)) this.selectFilled(target);
          this.deps.scheduleRender();
        },
      })),
      clientX,
      clientY,
    );
  }

  private selectFilled(target: SelRect): void {
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

    const contentX = this.deps.contentXAt(clientX - rect.left);
    const contentY = this.deps.contentYAt(py);

    const row = this.deps.rowAtOffset(Math.max(0, contentY));
    const col = this.deps.colAtX(Math.max(0, contentX));
    if (col === -1 || row < 0 || row >= this.deps.sheet().rowCount) return null;

    return this.deps.anchorCell(row, col);
  }

  fillHandleScreen(contentTop: number, scrollLeft: number): { x: number; y: number } | null {
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
    this.pickList?.destroy();
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
      this.pointAt(start, start);
      const move = (ev: PointerEvent): void => {
        const c = this.cellAtPointer(ev.clientX, ev.clientY);
        if (c) this.pointAt(start, c);
      };
      // The picked reference stays replaceable: the next click or arrow key
      // replaces it until the user types, as in Excel's Point mode.
      const up = (): void => {
        this.detachDrag();
      };
      const cancel = (): void => {
        editor.endReference();
        this.detachDrag();
      };
      this.attachDrag(e, move, up, cancel);
      return;
    }
    // A draft typed in a formula bar commits when the user clicks a cell, as
    // the focused editor's blur would.
    if (this.activeEditor === editor && editor.isEditing && !editor.isFocused) {
      editor.commit("none");
    }
    // A selected cell must own subsequent keyboard input across browsers.
    // Keep touch and active-editor gestures focused where they already are.
    if (!isTouch && !this.isEditing) this.deps.host.focus({ preventScroll: true });

    const viewportRect = this.deps.viewportEl.getBoundingClientRect();
    if (!this.isEditing && this.hitsFillHandle(e.clientX, e.clientY)) {
      e.preventDefault();
      this.startFillDrag(e);
      return;
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

    // Column letters select columns and row numbers select rows; Shift
    // extends, Ctrl/Cmd adds, and a drag across the headers extends, as in Excel.
    const px = e.clientX - viewportRect.left;
    const columnHeader = py < theme.headerHeight;
    const rowHeader = !columnHeader && px < theme.rowHeaderWidth;
    if (columnHeader || rowHeader) {
      const headerAt = (ev: PointerEvent): number => {
        const rect = this.deps.viewportEl.getBoundingClientRect();
        if (columnHeader) return this.deps.colAtX(this.deps.contentXAt(ev.clientX - rect.left));
        const row = this.deps.rowAtOffset(Math.max(0, this.deps.contentYAt(ev.clientY - rect.top)));
        return row < this.deps.rowCount() ? row : -1;
      };
      const extendTo = (index: number): void => {
        if (columnHeader) this.deps.selection().extendTo(0, index);
        else this.deps.selection().extendTo(index, this.deps.firstCol());
      };
      const index = headerAt(e);
      if (index === -1) return;
      const selection = this.deps.selection();
      if (e.shiftKey) extendTo(index);
      else if (columnHeader) selection.selectColumn(index, additive);
      else selection.selectRow(index, additive);
      this.deps.emitSelection();
      this.deps.scheduleRender();
      if (isTouch) return;
      const move = (ev: PointerEvent): void => {
        const reached = headerAt(ev);
        if (reached === -1) return;
        extendTo(reached);
        this.deps.emitSelection();
        this.deps.scheduleRender();
      };
      this.attachDrag(e, move, () => this.detachDrag());
      return;
    }

    // The dropdown arrow beside a selected list cell opens its list, or
    // closes it while it is open, as in Excel.
    const listCell = this.activeEditor === this.editor ? null : this.listButtonCellAt(px, py);
    if (listCell) {
      e.preventDefault();
      if (this.activeEditor === this.validationEditor) this.cancelEditor();
      else this.openList(listCell.row, listCell.col);
      return;
    }

    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    if (this.isAutoFilterHeader(cell.row, cell.col)) {
      const button = filterButtonRect(
        this.deps.screenRect(
          cell.row,
          cell.col,
          this.deps.contentTop(),
          this.deps.scroller.scrollLeft,
        ),
      );
      const x = e.clientX - viewportRect.left;
      if (
        x >= button.x &&
        x <= button.x + button.w &&
        py >= button.y &&
        py <= button.y + button.h
      ) {
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
      this.deps.autoFitColumns([resize.index]);
      return;
    }
    if (!this.deps.readOnly() && this.hitsFillHandle(e.clientX, e.clientY)) {
      e.preventDefault();
      this.fillToAdjacentData();
      return;
    }
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.beginEdit(cell.row, cell.col);
  };

  /** Whether a pointer at (clientX, clientY) is on the selection's fill handle. */
  private hitsFillHandle(clientX: number, clientY: number): boolean {
    const handle = this.fillHandleScreen(this.deps.contentTop(), this.deps.scroller.scrollLeft);
    if (!handle) return false;
    const viewport = this.deps.viewportEl.getBoundingClientRect();
    return (
      Math.abs(clientX - viewport.left - handle.x) <= FILL_HANDLE_HIT_RADIUS &&
      Math.abs(clientY - viewport.top - handle.y) <= FILL_HANDLE_HIT_RADIUS
    );
  }

  /**
   * Double-click on the fill handle: fill down as far as the data in the
   * column next to the selection reaches, left column first, as in Excel.
   */
  private fillToAdjacentData(): void {
    const source = this.fillSourceRect();
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
      if (this.fills.fill(source, target, {}, true)) this.selectFilled(target);
      this.deps.scheduleRender();
      return;
    }
  }

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

  /** Runs a host command bound to this key combination; true when one ran. */
  private runCustomShortcut(e: KeyboardEvent, editing: boolean): boolean {
    const focusCell = this.deps.selection().focusCell;
    return this.deps.keymap().runCustom(
      e,
      {
        cell: focusCell ? { sheet: this.deps.activeSheet(), ...focusCell } : null,
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
      this.onKeyDown(e);
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
  private hiddenActiveKey(e: KeyboardEvent, cell: CellAddress, mod: boolean): boolean {
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

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // The inline editor keeps its keys and forwards host shortcuts itself.
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
    // A key pressed while a command loads its code acts after that command.
    if (this.deps.holdKey(e)) {
      e.preventDefault();
      return;
    }

    // Headless hosts own the keymap: a handler intercepts first and consumes
    // by returning true; `false` drops every stock binding but keeps the
    // host's own menu commands.
    const keyboard = this.deps.keyboard();
    if (typeof keyboard === "function" && keyboard(e)) return;
    if (this.runCustomShortcut(e, false)) return;
    if (keyboard === false) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // A modifier pressed alone changes nothing, so End then Shift+Arrow still extends.
    if (Object.hasOwn(MODIFIER_KEYS, e.key)) return;
    // End mode lasts for one key: End, then an arrow jumps like Ctrl+Arrow.
    const endMode = this.endMode;
    this.endMode = false;

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
          this.insertNow(action === "insertDate");
          break;

        case "selectAll":
          this.selectRegionOrSheet();
          break;

        case "fillDown":
          this.fillFromEdge(true);
          break;

        case "fillRight":
          this.fillFromEdge(false);
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
    if (hidden && this.hiddenActiveKey(e, hidden, mod)) {
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
    const jump = mod || endMode;
    const theme = this.deps.theme();
    const pageRows = Math.max(
      1,
      Math.floor((this.deps.viewportH() - theme.headerHeight) / theme.rowHeight),
    );

    switch (e.key) {
      case "ArrowDown":
        // Alt+Down opens a header's AutoFilter dropdown, a list rule's list, or
        // else Pick From Drop-down List, as in Excel and as on a combobox.
        if (e.altKey && !mod && focus && this.isAutoFilterHeader(focus.row, focus.col)) {
          this.deps.openAutoFilter(focus.col);
          break;
        }
        if (e.altKey && !mod && focus && this.hasListRule(focus.row, focus.col)) {
          this.openList(focus.row, focus.col);
          break;
        }
        if (e.altKey && !mod && focus) {
          this.pickFromList(focus.row, focus.col);
          break;
        }
        this.navigate(
          from,
          jump ? this.dataEdgeRow(from, 1) : this.stepFrom(from, 1, 0).row,
          undefined,
          e.shiftKey,
        );
        break;

      case "ArrowUp":
        this.navigate(
          from,
          jump ? this.dataEdgeRow(from, -1) : this.stepFrom(from, -1, 0).row,
          undefined,
          e.shiftKey,
        );
        break;

      case "ArrowRight":
        this.navigate(
          from,
          undefined,
          jump ? this.dataEdgeCol(from, 1) : this.stepFrom(from, 0, 1).col,
          e.shiftKey,
        );
        break;

      case "ArrowLeft":
        this.navigate(
          from,
          undefined,
          jump ? this.dataEdgeCol(from, -1) : this.stepFrom(from, 0, -1).col,
          e.shiftKey,
        );
        break;

      case "PageDown":
        this.navigate(from, (from?.row ?? 0) + pageRows, undefined, e.shiftKey);
        break;

      case "PageUp":
        this.navigate(from, (from?.row ?? 0) - pageRows, undefined, e.shiftKey);
        break;

      case "Home":
        if (mod) this.navigate(from, 0, this.deps.firstCol(), e.shiftKey);
        else this.navigate(from, undefined, this.deps.firstCol(), e.shiftKey);
        break;

      case "End":
        // Ctrl+End goes to the last used cell. End alone only starts End mode.
        if (mod) {
          const last = this.lastUsedCell();
          this.navigate(from, last.row, last.col, e.shiftKey);
        } else this.endMode = true;
        break;

      case "Enter":
        if (mod || e.altKey) return;
        this.moveActiveCell(e.shiftKey ? -1 : 1, 0);
        break;

      case "Tab":
        if (mod || e.altKey) return;
        this.moveActiveCell(0, e.shiftKey ? -1 : 1);
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
        if (this.fillTarget !== null) {
          this.cancelPointer();
          break;
        }
        if (!this.deps.cancelCut()) return;
        break;

      default:
        if (!mod && !e.altKey && focus && PRINTABLE.test(e.key)) {
          // Typing in a list cell opens its list filtered by the typed text,
          // as Excel's AutoComplete for dropdown lists does; a formula still
          // starts in the cell editor.
          if (e.key !== "=" && this.hasListRule(focus.row, focus.col)) {
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
  private moveActiveCell(dRow: -1 | 0 | 1, dCol: -1 | 0 | 1): void {
    const selection = this.deps.selection();
    const focus = selection.focusCell;
    if (!focus) return;
    const run = this.tabRun;
    this.tabRun = null;
    const rect = this.activeRect();
    if (rect === null || (rect.r0 === rect.r1 && rect.c0 === rect.c1)) {
      const inRun = run !== null && run.row === focus.row && run.col === focus.col;
      const start = inRun ? run.start : focus.col;
      let col: number | undefined;
      if (dCol !== 0) col = this.deps.nextVisibleCol(focus.col, dCol);
      else if (dRow > 0 && inRun) col = start;
      this.navigate(focus, focus.row + dRow, col, false);
      const moved = this.deps.selection().focusCell;
      if (dCol !== 0 && moved) this.tabRun = { row: moved.row, col: moved.col, start };
      return;
    }

    let { row, col } = focus;
    if (dRow !== 0) {
      row += dRow;
      if (row > rect.r1 || row < rect.r0) {
        row = dRow > 0 ? rect.r0 : rect.r1;
        col += dRow;
        if (col > rect.c1) col = rect.c0;
        else if (col < rect.c0) col = rect.c1;
      }
    } else {
      col += dCol;
      if (col > rect.c1 || col < rect.c0) {
        col = dCol > 0 ? rect.c0 : rect.c1;
        row += dCol;
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
  private activeRect(): SelRect | null {
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
  private lastUsedCell(): CellRef {
    const lastRow = Math.max(0, this.deps.rowCount() - 1);
    const sheet = this.deps.activeSheet();
    const filled = (row: number, col: number): boolean => {
      const value = this.deps.store.getCell({ sheet, row: this.deps.toDataRow(row), col }).resolved;
      return value !== null && value !== "";
    };
    let row = 0;
    let col = this.deps.firstCol();
    for (const candidate of this.deps.colIndices()) {
      let bottom: number | null = lastRow;
      if (!filled(lastRow, candidate)) {
        const edge = this.deps.dataEdge(lastRow, candidate, -1, 0);
        if (edge === null) return { row: lastRow, col: this.deps.lastCol() };
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
  private selectRegionOrSheet(): void {
    const selection = this.deps.selection();
    const focus = selection.focusCell;
    if (!focus) return;
    const sheetRect: SelRect = {
      r0: 0,
      c0: this.deps.firstCol(),
      r1: Math.max(0, this.deps.rowCount() - 1),
      c1: this.deps.lastCol(),
    };
    const region = this.currentRegion(focus);
    const current = this.activeRect();
    const same =
      current !== null &&
      current.r0 === region.r0 &&
      current.r1 === region.r1 &&
      current.c0 === region.c0 &&
      current.c1 === region.c1;
    const single = region.r0 === region.r1 && region.c0 === region.c1;
    selection.selectRect(same || single ? sheetRect : region, focus);
    this.deps.emitSelection();
    this.deps.scheduleRender();
  }

  /** Excel's current region: grow from `start` while a cell next to the block, diagonals included, is filled. */
  private currentRegion(start: CellRef): SelRect {
    const sheet = this.deps.activeSheet();
    const lastRow = this.deps.rowCount() - 1;
    const columns = this.deps.colIndices();
    const filled = (row: number, col: number): boolean => {
      if (row < 0 || row > lastRow || !columns.includes(col)) return false;
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
      for (let row = Math.max(0, rect.r0 - 1); row <= Math.min(lastRow, rect.r1 + 1); row++) {
        if (after !== rect.c1 && filled(row, after)) {
          rect.c1 = after;
          grown = true;
          break;
        }
      }
      for (let row = Math.max(0, rect.r0 - 1); row <= Math.min(lastRow, rect.r1 + 1); row++) {
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
  private insertNow(date: boolean): void {
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
  private isAutoFilterHeader(row: number, col: number): boolean {
    const range = this.deps.sheet().autoFilter?.range;
    return (
      range !== undefined &&
      this.deps.toDataRow(row) === range.start.row &&
      col >= range.start.col &&
      col <= range.end.col
    );
  }

  /** Whether a list validation rule covers the cell at view `row`, `col`. */
  private hasListRule(row: number, col: number): boolean {
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
  private listButtonCellAt(x: number, y: number): CellRef | null {
    const focus = this.deps.selection().focusCell;
    if (!focus || !this.hasListRule(focus.row, focus.col)) return null;
    const button = listButtonRect(
      this.deps.screenRect(
        focus.row,
        focus.col,
        this.deps.contentTop(),
        this.deps.scroller.scrollLeft,
      ),
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

  /**
   * One arrow step from `from`. A step that would stay inside the same merged
   * cell continues past it, so Right from a merged A6:B6 lands on C6, as in Excel.
   */
  private stepFrom(from: CellRef | null, dRow: number, dCol: -1 | 0 | 1): CellRef {
    const start = from ?? { row: 0, col: this.deps.firstCol() };
    const merged = this.deps.anchorCell(start.row, start.col);
    const maxRow = Math.max(0, this.deps.rowCount() - 1);
    let cell = start;
    for (;;) {
      const next = {
        row: Math.max(0, Math.min(maxRow, cell.row + dRow)),
        col: dCol === 0 ? cell.col : this.deps.nextVisibleCol(cell.col, dCol),
      };
      if (next.row === cell.row && next.col === cell.col) return cell;
      cell = next;
      const anchor = this.deps.anchorCell(cell.row, cell.col);
      if (anchor.row !== merged.row || anchor.col !== merged.col) return cell;
    }
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
    this.fills.dismiss();
    this.fills.beginDrag(source);
    const move = (ev: PointerEvent): void => {
      const c = this.fillCellAt(ev.clientX, ev.clientY);
      const target = this.extendFill(source, c);
      this.fillTarget = target;
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
      this.detachDrag();
      const target = this.fillTarget;
      this.fillTarget = null;
      this.tip = null;
      // Ctrl (Option on a Mac) swaps counting and copying, as in Excel.
      if (target && this.fills.fill(source, target, { swap: ev.ctrlKey || ev.altKey }, true)) {
        this.selectFilled(target);
      }
      this.fills.endDrag();
      this.deps.scheduleRender();
    };
    const cancel = (): void => {
      // A cancelled fill-drag (browser reclaimed the pointer) commits nothing.
      this.fillTarget = null;
      this.tip = null;
      this.fills.endDrag();
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

  /**
   * Ctrl+D and Ctrl+R: copy the top row (or left column) of the selection,
   * with its formats, into the rest of it. With one cell selected, copy the
   * cell above (or to the left) into it, as Excel's Fill Down and Fill Right do.
   */
  private fillFromEdge(down: boolean): void {
    const rect = this.fillSourceRect();
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
