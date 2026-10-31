// Grid configuration, events, actions, search, and imperative API contracts.
// No runtime values live here.

import type { SheetwriteError } from "../errors.js";
import type { ResolvedHyperlinkTarget } from "../hyperlink.js";
import type { IconName } from "../icons/icon-names.js";
import type {
  RuntimeMemoryObservation,
  RuntimeResourceOperation,
  RuntimeResourcePhase,
  RuntimeResourceSnapshot,
} from "../resource-accounting.js";
import type {
  CellAlign,
  CellFormat,
  CellHyperlink,
  CellScalar,
  CellStyle,
  CellValue,
  CellVerticalAlign,
  Column,
  ConditionalFormatRule,
} from "./cell.js";
import type { ChartDefinition, ChartRef } from "./chart.js";
import type {
  CellAddress,
  HighlightRange,
  PresenceOverlay,
  Range,
  Selection,
  SheetId,
} from "./coordinates.js";
import type {
  AggregateOp,
  ColumnarData,
  DataSource,
  DataSourceRequest,
  DataSourceStorageOptions,
} from "./data.js";
import type {
  AddSheetInput,
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  SheetVisibility,
  SortKey,
  Workbook,
  WorkbookSnapshot,
} from "./document.js";
import type { PivotDefinition, PivotResultView, PivotSourceField } from "./pivot.js";
import type { CellRenderer, Theme } from "./render.js";
import type { Store } from "./store.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./transaction.js";

/** One side panel that `Grid.openPanel` shows on the grid's right edge. */
export interface GridPanel {
  /** Text in the panel header; it also names the panel for assistive technology. */
  title: string;
  /** Fill `body`, then return a function that releases what `render` set up. */
  render(body: HTMLElement): () => void;
  /**
   * Move keyboard focus into the panel when it opens. Default `true`. Use
   * `false` for a panel that opens on cell selection, so arrow keys keep moving
   * the cell cursor.
   */
  focus?: boolean;
}

/** Selection movement applied after a successful editor commit. */
export type CellEditorNavigation = "down" | "right" | "left" | "none";

/** Viewport-relative geometry of the cell currently owned by an editor. */
export interface CellEditorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Immutable state and guarded completion callbacks for one mounted editor. */
export interface CellEditorContext {
  readonly grid: Grid;
  readonly address: Readonly<CellAddress>;
  readonly viewAddress: Readonly<CellAddress>;
  readonly column: Readonly<Column>;
  readonly value: CellScalar;
  readonly text: string;
  readonly initialInput: string | undefined;
  readonly selectAll: boolean;
  readonly label: string;
  readonly signal: AbortSignal;
  commit(value: string, navigation?: CellEditorNavigation): void;
  cancel(): void;
}

/** Retained lifecycle returned by a custom editor's mount method. */
export interface CellEditorInstance {
  update(context: CellEditorContext): void;
  reposition(rect: CellEditorRect): void;
  commit(navigation: CellEditorNavigation): string | undefined | Promise<string | undefined>;
  cancel(): void;
  destroy(): void;
}

/** Framework-neutral named editor definition registered through GridOptions.editors. */
export interface CellEditor {
  mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
}

/**
 * How a clipboard action ended. Permission failures are OUTCOMES, not
 * exceptions: the returned promise never rejects.
 * - `"done"` — the action completed.
 * - `"unsupported"` — the Clipboard API (or the needed method) is absent,
 *   e.g. a non-secure context or Firefox `readText`.
 * - `"blocked"` — the browser rejected the request, typically a permissions
 *   policy or missing user activation.
 * - `"empty"` — nothing to act on (no focused selection, empty clipboard, or
 *   a read-only grid on paste).
 */
export type ClipboardOutcome = "done" | "unsupported" | "blocked" | "empty";

/** Header semantics used by the retained canvas and accessibility mirror. */
export type GridPresentation = "spreadsheet" | "data-grid";

/** Imperative operations the toolbar and context menu bind to; also exposed as `Grid.actions`. */
export interface GridActions {
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikethrough(): void;
  setAlign(align: CellAlign): void;
  /** Set the selection's text color; null returns it to automatic (the theme color). */
  setTextColor(color: string | null): void;
  /** Set the selection's fill; null removes it (Excel's "No Fill"). */
  setFillColor(color: string | null): void;
  toggleBorder(): void;
  /**
   * Apply an Excel border preset to the selection. Edge presets (`top`,
   * `bottom`, `left`, `right`, `outside`, `thickOutside`) touch only the
   * selection's outer cells and keep each cell's other sides.
   */
  setBorders(preset: BorderPreset): void;
  /** Set the selection's font family; null returns it to the column/theme font. */
  setFontFamily(family: string | null): void;
  /** Set the selection's font size in CSS pixels; null returns it to the default. */
  setFontSize(size: number | null): void;
  /** Step the focus cell's font size to the next larger (1) or smaller (-1) standard size. */
  stepFontSize(direction: 1 | -1): void;
  setVerticalAlign(align: CellVerticalAlign): void;
  toggleWrap(): void;
  /** Set the selection's number format; null returns it to the column's format. */
  setNumberFormat(code: string | null): void;
  /** Show one more (1) or one fewer (-1) decimal place than the focus cell does. */
  stepDecimals(direction: 1 | -1): void;
  /** Merge the selection and center its text, as one undoable step. */
  mergeAndCenter(): void;
  /** Clear the selection's contents and formatting, as one undoable step. */
  clearAll(): void;
  /**
   * Put `=SUM(...)` in the focus cell over the contiguous numbers directly
   * above it, or to its left when there are none above.
   */
  autoSum(): void;
  /** Open the built-in find bar when it is enabled. */
  find(): void;
  /**
   * Freeze rows above and columns left of the focus cell in view coordinates.
   * Does nothing without a selection; focusing A1 unfreezes both axes.
   */
  freezePanes(): void;
  clearFormat(): void;
  merge(): void;
  unmerge(): void;
  sort(ascending: boolean): void;
  insertRowAbove(): void;
  insertRowBelow(): void;
  deleteRow(): void;
  insertColumnLeft(): void;
  insertColumnRight(): void;
  deleteColumn(): void;
  hideRows(rows?: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  autoFitRows(): void;
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  autoFitColumns(cols?: readonly number[]): void;
  clearFilter(col?: number): void;
  /** Copy the focused rectangle to the system clipboard. Never rejects. */
  copy(): Promise<ClipboardOutcome>;
  /** Copy + clear the source (after the clipboard accepted). Never rejects. */
  cut(): Promise<ClipboardOutcome>;
  /** Paste at the focus cell. Never rejects. */
  paste(): Promise<ClipboardOutcome>;
  /** Paste keeping only resolved values — no formulas, no styles (Ctrl+Shift+V). Never rejects. */
  pasteValues(): Promise<ClipboardOutcome>;
  clearContents(): void;
  /** Download the active sheet as CSV. Never throws; a failure emits `export-error`. */
  exportCsv(filename?: string): void;
  /**
   * Download the active sheet as XLSX. Resolves when the download starts and never
   * rejects; a failure emits `export-error`.
   */
  exportXlsx(filename?: string): Promise<void>;
  /**
   * Open the note editor on the focus cell, with its note or empty for a new
   * one. Ctrl or Cmd+Enter and leaving the editor save; Escape cancels. Does
   * nothing on a read-only grid.
   */
  editNote(): void;
  /**
   * Remove the focus cell's note as one undoable step. Does nothing when it has
   * none. Does nothing on a read-only grid.
   */
  deleteNote(): void;
  /**
   * Open the field list of the pivot table whose output holds the focus cell.
   * Does nothing when the focus cell is outside every pivot. Does nothing on a
   * read-only grid.
   */
  showPivotFields(): void;
  undo(): void;
  redo(): void;
}

/** Built-in action names accepted by custom toolbar items. */
export type ToolbarActionName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignTop"
  | "alignMiddle"
  | "alignBottom"
  | "wrap"
  | "textColor"
  | "fillColor"
  | "border"
  | "clearFormat"
  | "merge"
  | "unmerge"
  | "sortAsc"
  | "sortDesc"
  | "exportCsv"
  | "exportXlsx"
  | "undo"
  | "redo"
  | "separator";

/** Built-in command names accepted by state queries and change events. */
export type GridCommandName = Exclude<ToolbarActionName, "separator">;

/** Observable availability and selection-derived activity for one command. */
export interface GridCommandState {
  readonly disabled: boolean;
  readonly activity: "inactive" | "active" | "mixed";
}

/** Complete command-state snapshot emitted whenever availability or activity can change. */
export interface GridCommandStateChangeEvent {
  readonly states: Readonly<Record<GridCommandName, GridCommandState>>;
}

/**
 * Totals over the selected cells the user can see, like Excel's status bar.
 * Rows a filter hides are left out. Overlapping ranges count once per range,
 * as in Excel.
 */
export interface SelectionSummary {
  /** Cells that hold any value, including text and errors. */
  readonly count: number;
  /** Cells that hold a number (dates are numbers too). */
  readonly numericCount: number;
  readonly sum: number;
  /** Mean of the numeric cells; null when there are none. */
  readonly average: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

/** Excel border presets accepted by {@link GridActions.setBorders}. */
export type BorderPreset =
  | "all"
  | "outside"
  | "thickOutside"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "none";

/** Text, DOM node, or node factory used as toolbar icon content. */
export type ToolbarIcon = string | Node | (() => Node);

/**
 * Per-glyph icon overrides, keyed by the names on the command icon sheet
 * (`ICON_NAMES`). One override applies wherever the glyph shows: the flat
 * toolbar, the ribbon and ribbon menus, and the context menu. Strings render
 * as plain text; DOM nodes and node factories support SVG or HTML icons. To
 * replace every glyph at once, set the `--sheetwrite-icon-sheet` CSS property
 * to a sheet drawn on the layout in `@sheetwrite/core/icons.json`.
 */
export type IconOverrides = Partial<Record<IconName, ToolbarIcon>>;

/**
 * Built-in, separator, or custom callback item in the grid toolbar. A built-in
 * `action` renders the same command, glyph and state as the ribbon.
 */
export interface ToolbarItem {
  /** Built-in action to bind (or "separator"). Omit when supplying `onClick`. */
  action?: ToolbarActionName;
  /** Custom click handler; receives the grid handle. Overrides `action`. */
  onClick?: (grid: Grid) => void;
  /**
   * Button icon/content. Strings render as plain text; pass a DOM `Node` or a
   * factory returning one for SVG/HTML icons without using `innerHTML`.
   */
  icon?: ToolbarIcon;
  /** Accessible name and tooltip; replaces the built-in command's label. */
  title?: string;
}

/** Layout of the Excel-style ribbon. `auto` chooses compact below the configured width. */
export type RibbonMode = "full" | "compact" | "auto";

/** Initial layout settings for the built-in or composable ribbon. */
export interface RibbonConfig {
  /** Initial layout (default `full`). The ribbon's layout button changes it at run time. */
  mode?: RibbonMode;
  /** Width in CSS pixels below which `auto` uses compact (default 768). */
  compactWidth?: number;
}

/**
 * The `GridConfig` switches that choose built-in commands. They apply to every
 * renderer of the command model: the toolbar, the full ribbon and the compact
 * ribbon. Each defaults to true, except `export`.
 */
export type CommandFlags = Pick<
  GridConfig,
  | "undo"
  | "bold"
  | "italic"
  | "align"
  | "textColor"
  | "fillColor"
  | "border"
  | "clearFormat"
  | "merge"
  | "sort"
  | "export"
>;

/** Built-in action names accepted by custom context-menu rows. */
export type ContextMenuActionName =
  | "cut"
  | "copy"
  | "paste"
  | "clearContents"
  | "merge"
  | "unmerge"
  | "insertRowAbove"
  | "insertRowBelow"
  | "deleteRow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteColumn"
  | "hideRow"
  | "showAllRows"
  | "autoFitRow"
  | "hideColumn"
  | "showAllColumns"
  | "autoFitColumn"
  | "clearFilter"
  | "exportCsv"
  | "exportXlsx"
  | "editNote"
  | "deleteNote"
  | "pivotFields"
  | "separator";

/** Cell and viewport coordinates resolved for one bundled context-menu opening. */
export interface ContextMenuContext {
  /** Right-clicked cell, or null when the pointer is outside the cell body. */
  readonly cell: CellAddress | null;
  /** Viewport-relative browser pointer coordinate. */
  readonly clientX: number;
  /** Viewport-relative browser pointer coordinate. */
  readonly clientY: number;
}

/**
 * A compact modified key combination or a key object. Modifiers may appear in
 * any order before the final key, for example "Mod+Shift+K" or "Ctrl+Alt+Delete".
 * `Mod`/`mod` means Command on macOS and Control elsewhere; Ctrl and Meta are literal.
 * The parser rejects unknown/repeated modifiers and missing keys.
 */
export type KeyShortcut =
  | `${"Mod" | "Ctrl" | "Meta" | "Alt" | "Shift"}+${string}`
  | {
      key: string;
      mod?: boolean;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
      alt?: boolean;
    };

/** Built-in actions that can be rebound without replacing navigation. */
export type KeyboardAction =
  | "copy"
  | "cut"
  | "paste"
  | "pasteValues"
  | "undo"
  | "redo"
  | "find"
  | "replace"
  | "clearContents"
  | "editNote";

/** Overrides replace all default keys for an action; null disables that action's keys. */
export interface KeyboardOptions {
  bindings?: Partial<Record<KeyboardAction, KeyShortcut | readonly KeyShortcut[] | null>>;
}

/**
 * Built-in, separator, or custom callback row in the right-click menu.
 *
 * @example
 * ```ts
 * import type { ContextMenuItem, GridConfig } from "@sheetwrite/core";
 *
 * const total: ContextMenuItem = {
 *   id: "total",
 *   label: "Show total",
 *   onClick(grid) { window.alert(String(grid.aggregate(0, "sum"))); },
 * };
 * const config: GridConfig = { contextMenu: [total, { action: "separator" }, { action: "copy" }] };
 * ```
 * @see ContextMenuItems
 * @see GridConfig.contextMenu
 */
export interface ContextMenuItem {
  /** Stable host identifier, exposed as `data-context-menu-item`. */
  id?: string;
  /** Built-in action to bind (or "separator"). Omit when supplying `onClick`. */
  action?: ContextMenuActionName;
  /** Custom click handler; receives the grid and the right-clicked cell (null if none). */
  onClick?: (grid: Grid, cell: CellAddress | null) => void;
  /** Menu row text. Defaults per action. */
  label?: string;
  /**
   * A bound action name or a custom key combination. An explicit combination
   * registers `onClick` as a keyboard command; action names only reference the
   * existing built-in binding. Both forms display platform-aware labels.
   * For example, `shortcut: "copy"` follows the configured Copy binding, while
   * `shortcut: "Mod+Shift+K"` binds this item's `onClick` callback.
   * See {@link KeyboardOptions} for built-in action overrides.
   */
  shortcut?: KeyboardAction | KeyShortcut;
  /** Static or request-aware visibility. Hidden separators are normalized. */
  visible?: boolean | ((context: ContextMenuContext) => boolean);
  /** Static or context-aware disabled state. */
  disabled?: boolean | ((context: ContextMenuContext) => boolean);
  /** Glyph shown before the label. Built-in actions have one by default; `config.icons` overrides apply. */
  icon?: IconName;
  /** Rows of a submenu. The row opens it on click, hover or the Right Arrow key and runs nothing itself. */
  items?: readonly ContextMenuItem[];
}

/** Static rows or a context-aware factory evaluated each time the menu opens. */
export type ContextMenuItems =
  | readonly ContextMenuItem[]
  | ((context: ContextMenuContext) => readonly ContextMenuItem[]);

/**
 * Toolbar / feature configuration. When `config` is set the built-in toolbar is
 * shown; control flags default to `true` except the opt-in `export` flag.
 *
 * @example
 * ```ts
 * import type { GridConfig } from "@sheetwrite/core";
 *
 * const config: GridConfig = {
 *   toolbar: true,
 *   contextMenu: [{ action: "copy" }, { action: "paste" }],
 *   keyboard(event, grid) {
 *     if (event.altKey && event.key === "b") {
 *       grid.actions.toggleBold();
 *       return true;
 *     }
 *     return false;
 *   },
 * };
 * ```
 * @see Grid.setConfig
 * @see ContextMenuItem
 */
export interface GridConfig {
  /**
   * Show the built-in toolbar (true), hide it (false), or supply a custom item
   * list. The toolbar shows the ribbon's commands on one row, with the rest in
   * a "More commands" menu.
   */
  toolbar?: boolean | ToolbarItem[];
  /** Show Bold, and Underline and Strikethrough with Italic (default true). See {@link CommandFlags}. */
  bold?: boolean;
  /** Show Italic, and Underline and Strikethrough with Bold (default true). */
  italic?: boolean;
  /** Show the horizontal and vertical alignment commands (default true). */
  align?: boolean;
  /** Show the Font Color command (default true). */
  textColor?: boolean;
  /** Show the Fill Color command (default true). */
  fillColor?: boolean;
  /** Show the Borders command (default true). */
  border?: boolean;
  /** Show the Clear command, which holds Clear Formats (default true). */
  clearFormat?: boolean;
  /** Show the Merge & Center command, which holds Merge and Unmerge (default true). */
  merge?: boolean;
  /** Show Sort & Filter and the sort commands (default true). */
  sort?: boolean;
  /** Show the Export CSV and Export XLSX commands (default false). */
  export?: boolean;
  /**
   * Replace the built-in toolbar with an Excel-style ribbon (Home, Insert,
   * Data and View tabs). Pass an object to choose its initial full, compact
   * or automatic layout. A custom `toolbar` item list still renders the
   * toolbar instead.
   */
  ribbon?: boolean | RibbonConfig;
  /** Replace built-in command icons by glyph name, in the toolbar, ribbon, ribbon menus and context menu. See {@link IconOverrides}. */
  icons?: IconOverrides;
  /** Built-in menu, disabled menu, static rows, or a request-aware row factory. */
  contextMenu?: boolean | ContextMenuItems;
  /** Show Undo and Redo (default true). */
  undo?: boolean;
  /** Built-in Ctrl+F find widget: enabled (true, default) or disabled (false). */
  find?: boolean;
  /** Bottom sheet-tab bar for multi-sheet workbooks (default true). */
  tabs?: boolean;
  /**
   * Built-in keyboard handling. `true` (default) keeps the stock Sheets-style
   * bindings. An object replaces individual action bindings; omitted actions
   * keep their defaults, and `null` disables an action's keys.
   * For example: `{ bindings: { copy: { key: "c", mod: true, shift: true } } }`.
   * Menu hints and toolbar titles use these same bindings. `false` disables
   * all built-in keys. A function intercepts each keydown before the defaults;
   * return true to consume it, false to let the built-in handler continue.
   */
  keyboard?: boolean | KeyboardOptions | ((e: KeyboardEvent, grid: Grid) => boolean);
}

/**
 * Workbook, data, rendering, policy, and built-in UI options used to create a Grid.
 *
 * @example
 * ```ts
 * import type { GridOptions } from "@sheetwrite/core";
 *
 * const options: GridOptions = {
 *   workbook: { activeSheet: "sheet1", sheets: [
 *     { id: "sheet1", name: "Sheet 1", rowCount: 1,
 *       columns: [{ key: "name", header: "Name", type: "text", width: 120 }] },
 *   ] },
 *   data: { rowCount: 1, columns: { name: ["Ada"] } },
 *   config: { toolbar: true, contextMenu: true, keyboard: true },
 * };
 * ```
 * @see createGrid
 * @see GridConfig
 */
export interface GridOptions {
  /** Live workbook schema adopted by the store and updated by document operations. */
  workbook: Workbook;
  /** Eager column-major values loaded into `workbook.activeSheet`; use instead of `datasource`. */
  data?: ColumnarData;
  /** Lazy row provider requested for visible windows; use instead of eager `data`. */
  datasource?: DataSource;
  /** Allocation and cache policy for datasource-backed cell storage. */
  datasourceStorage?: DataSourceStorageOptions;
  /** Paint backend; defaults to main-thread `canvas` and falls back there if a worker fails. */
  renderer?: "canvas" | "worker";
  /**
   * URL of the worker renderer module (`renderer: "worker"`), as served to the
   * BROWSER. Usually not needed: by default the grid creates its worker as
   * `new Worker(new URL("./worker.js", import.meta.url))`, which bundlers such
   * as Vite build together with the worker's imports. Pass a URL when there
   * is no bundler, or when yours copies the file instead of building it, for
   * example a copy of `@sheetwrite/core/dist/` in your public assets (see
   * `/docs/features/worker-rendering/`). A bare specifier like
   * `new URL("@sheetwrite/core/worker", import.meta.url)` is NOT reliable: the
   * platform `Worker` constructor does not consult package exports. If the
   * worker can't be constructed or fails to load, the grid falls back to the
   * main-thread canvas renderer and emits `renderer-fallback` once.
   */
  workerUrl?: string | URL;
  /**
   * Header presentation. Spreadsheet mode (default) paints positional A/B/C
   * labels; data-grid mode paints each column's semantic `header`. Cell
   * addressing, row indices, clipboard values, formulas, and exports are
   * unchanged in both modes.
   */
  presentation?: GridPresentation;
  /** Overrides merged over the default theme and host CSS custom properties. */
  theme?: Partial<Theme>;
  /** Disables mutating interactions while preserving navigation and selection. */
  readOnly?: boolean;
  /**
   * Hyperlink activation never opens a browser URL. `event-only` (default)
   * emits a safe resolved target; `internal-navigation` additionally moves to
   * stable internal destinations; `disabled` rejects every activation request.
   */
  hyperlinkActivation?: "event-only" | "internal-navigation" | "disabled";
  /**
   * Host-owned client UX permission check. Servers must independently authorize
   * every submitted operation; this resolver is not an authentication boundary.
   */
  protectionResolver?: ProtectionResolver;
  /** Atomic rejects the transaction; partial skips denied operation objects. */
  mutationPolicy?: MutationPolicyMode;
  /** Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation. */
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
  /** Custom cell renderers registered up front; also see `Grid.defineCellRenderer`. */
  renderers?: Record<string, CellRenderer>;
  /** Named custom editors resolved from each column's `editor` field. */
  editors?: Record<string, CellEditor>;
  /**
   * Extra row and visible-column positions painted on each viewport edge.
   * Defaults to 6; use 0 to disable the buffer.
   */
  overscan?: number;
  /**
   * Render at least this many columns, adding empty columns past the data. A
   * spreadsheet also adds empty columns to fill the host width; a data grid
   * adds them only through this option.
   */
  minColumns?: number;
  /** Built-in UI controls; providing an object enables the toolbar unless `toolbar` is false. */
  config?: GridConfig;
}

/** Case, whole-cell, sheet, and column constraints for grid search. */
export interface SearchOptions {
  /** Case-sensitive match (default false). */
  matchCase?: boolean;
  /** Match only when the whole cell text equals the query (default false: substring). */
  wholeCell?: boolean;
  /** Restrict to a sheet (defaults to the active sheet). */
  sheet?: SheetId;
  /** Restrict to these column indices (defaults to all columns). */
  columns?: number[];
}

/** Ordered matches and active index produced by a grid search. */
export interface SearchResult {
  /** Query string retained for navigation and subsequent replacement. */
  query: string;
  /** Matching cells in row-major order. */
  matches: CellAddress[];
  /** Index of the active match within `matches`, or -1 when there are none. */
  active: number;
}

/** Replacement count and refreshed search state returned by replace-all. */
export interface ReplaceResult {
  /** How many cells were rewritten. */
  replaced: number;
  /** Search state after the replacement (matches re-scanned against the new data). */
  result: SearchResult;
}

/**
 * View-aware editable snapshot of one cell, for hosts building a detached
 * formula bar or cell inspector. `address` is the translated *data* address —
 * the correct target for `Grid.applyTransaction` even under an active
 * sort/filter view — while the `(row, col)` inputs of
 * {@link Grid.getCellInput} are active-sheet view coordinates.
 */
export interface CellInputSnapshot {
  /** Underlying data address, suitable for a `set` patch. */
  readonly address: CellAddress;
  /** Formula source when the cell is a formula, else the literal display text. */
  readonly text: string;
  /** Column input format, for `parseCellInput`. */
  readonly format: CellFormat;
}

/** Actionable transaction outcome for a stable sheet lifecycle target. */
export type SheetLifecycleResult = ApplyTransactionResult & { readonly sheet: SheetId };

/** Host-safe activation payload emitted only after final target validation. */
interface HyperlinkActivationEvent {
  readonly address: CellAddress;
  readonly hyperlink: CellHyperlink;
  readonly target: ResolvedHyperlinkTarget;
}

/** Payload map for events emitted by a Grid. */
export interface GridEvents {
  change: ChangeEvent;
  selection: { selection: Selection | null };
  scroll: {
    scrollTop: number;
    firstRow: number;
    lastRow: number;
    scrollLeft: number;
    firstVisibleColumn: number | null;
    lastVisibleColumn: number | null;
  };
  "edit-begin": { addr: CellAddress };
  "edit-commit": { addr: CellAddress; value: CellValue };
  search: SearchResult;
  /** Command availability or formatting activity changed. */
  "command-state-change": GridCommandStateChangeEvent;
  "mutation-rejected": { issues: MutationIssue[] };
  /** Emitted after the visible sheet changes (direct call or cross-sheet scroll). */
  "active-sheet": { sheet: SheetId };
  "hyperlink-activate": HyperlinkActivationEvent;
  /** Emitted after `setTheme` or `replaceTheme` changes the base theme. Holds a copy. */
  "theme-change": { theme: Theme };
  /**
   * Emitted once when the worker renderer could not start or stopped and the
   * grid fell back to the main-thread canvas renderer. `error.context.failure`
   * is `spawn`, `crash`, `protocol`, `timeout` or `fatal`.
   */
  "renderer-fallback": { requested: "worker"; error: SheetwriteError };
  "datasource-error": {
    request: Omit<DataSourceRequest, "signal">;
    error: SheetwriteError;
  };
  /** Built-in toolbar/context-menu export failed after its action was dispatched. */
  "export-error": { format: "csv" | "xlsx"; error: SheetwriteError };
  /** A chart object on the active sheet was selected; `null` when no object is selected. */
  "chart-select": ChartRef | null;
  /** The user pressed Enter on a selected chart, for example to open its editor. */
  "chart-activate": ChartRef;
  /**
   * Emitted once when the engine stopped after a WASM trap. `error.code` is
   * `engine-failed`. The grid keeps its last frame, is read-only and does not
   * read its store again; `setReadOnly(false)` does not undo this. To continue,
   * destroy the grid, `await initSheetwrite()` and create a new grid from a
   * saved document.
   */
  "engine-failed": { error: SheetwriteError };
}

/**
 * Imperative grid handle for document commands, events, rendering, and teardown.
 *
 * @example
 * ```ts
 * import type { Grid } from "@sheetwrite/core";
 *
 * function updateTotal(grid: Grid) {
 *   const sheet = grid.getActiveSheet();
 *   const result = grid.applyTransaction({
 *     patches: [{ op: "set", addr: { sheet, row: 0, col: 0 }, value: { kind: "literal", value: 42 } }],
 *   });
 *   if (result.status === "applied") grid.scrollToCell({ sheet, row: 0, col: 0 });
 *   return grid.aggregate(0, "sum");
 * }
 * ```
 * @see createGrid
 * @see Grid.applyTransaction
 */
export interface Grid {
  readonly store: Store;
  /** Imperative action surface for binding custom toolbars/menus. */
  readonly actions: GridActions;
  /** Versioned coarse runtime ownership snapshot, including datasource state. */
  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot;
  /** Query undo/redo availability and formatting active/mixed/disabled state. */
  getCommandState(command: GridCommandName): GridCommandState;
  /**
   * Effective style of the focus cell: its own style over its column's
   * `cellStyle`. Empty when nothing is selected.
   */
  getFocusCellStyle(): CellStyle;
  /**
   * Totals for the current selection, for a status bar. Large selections are
   * read in chunks between frames, so the page stays responsive; abort
   * `signal` to stop early, which rejects with the signal's reason. Resolves
   * null when nothing is selected.
   */
  summarizeSelection(signal?: AbortSignal): Promise<SelectionSummary | null>;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  /**
   * Resolve browser viewport coordinates to an active-sheet cell for host-owned
   * menus and interactions. Returns null outside the cell body.
   */
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
  /** Id of the currently visible sheet. */
  getActiveSheet(): SheetId;
  /**
   * Editable snapshot of the cell at a view position on the active sheet, or
   * null when out of bounds. See {@link CellInputSnapshot}.
   */
  getCellInput(row: number, col: number): CellInputSnapshot | null;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  /** Resolved base theme, before zoom scaling. The returned object is a copy. */
  getTheme(): Theme;
  /** Platform-aware label for a bound action, or an empty string when disabled. */
  getShortcutLabel(action: KeyboardAction): string;
  /** Imperative patch: merge `theme` into the accumulated base theme. */
  setTheme(theme: Partial<Theme>): void;
  /**
   * Option-level replacement: re-run construction-time resolution
   * (`DEFAULT_THEME < CSS custom properties < theme`) with the new partial.
   * `undefined` restores the CSS-variable/default resolution. Adapters call
   * this for their declarative `theme` prop; imperative patching stays on
   * {@link setTheme}.
   */
  replaceTheme(theme: Partial<Theme> | undefined): void;
  /** The effective (post-zoom) theme the renderer is currently painting with. */
  getEffectiveTheme(): Theme;
  /**
   * Update editability without replacing the Grid or clearing session state.
   * Has no effect after `engine-failed`: that grid stays read-only.
   */
  setReadOnly(readOnly: boolean): void;
  /**
   * Reconfigure built-in chrome and keyboard handling without replacing the
   * Grid or clearing selection/history. Construction-bound GridOptions are not
   * accepted here.
   */
  setConfig(config: GridConfig | undefined): void;
  /**
   * Apply arbitrary patches as one undoable Grid commit. No-op when read-only.
   * Use `Store.applyTransaction` only for low-level writes that intentionally
   * bypass Grid history and policy.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function setFirstCell(grid: Grid) {
   *   return grid.applyTransaction({ patches: [
   *     { op: "set", addr: { sheet: grid.getActiveSheet(), row: 0, col: 0 },
   *       value: { kind: "literal", value: 42 } },
   *   ] });
   * }
   * ```
   * @see Transaction
   */
  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
  /** Deterministically export the complete authoritative workbook document. */
  exportSnapshot(): WorkbookSnapshot;
  /**
   * Apply host-supplied operations without undo history or outgoing dirty state.
   * The resulting change event has `source: "remote"`.
   */
  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options?: RemoteOperationOptions,
  ): ApplyTransactionResult;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  /**
   * Column aggregate over the active sheet's data.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function total(grid: Grid) {
   *   return grid.aggregate(1, "sum");
   * }
   * ```
   * @see SheetwriteStore.aggregate
   */
  aggregate(col: number, op: AggregateOp): number;
  /**
   * Sort the displayed rows by a column (does not mutate stored data).
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function showLargestFirst(grid: Grid) {
   *   grid.sortBy(1, false);
   * }
   * ```
   * @see Grid.clearView
   */
  sortBy(col: number, ascending?: boolean): void;
  /** Multi-key sort of the displayed rows (first key primary; stable). */
  sortByMulti(keys: readonly SortKey[]): void;
  /**
   * Filter the displayed rows to those whose column text contains `needle`.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function showOpenRows(grid: Grid) {
   *   grid.filterBy(0, "Open");
   * }
   * ```
   * @see Grid.clearView
   */
  filterBy(col: number, needle: string): void;
  /**
   * Set or clear (null) one column's filter. All column filters AND together
   * and compose with the active sort and hidden rows.
   */
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  /** Persisted multi-key sort of the active sheet. */
  setSort(keys: readonly SortKey[]): ApplyTransactionResult;
  /** Active column filters on the active sheet, keyed by column index. */
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  /**
   * Distinct resolved values of a column in first-seen order. Defaults to
   * 1,000 values for bounded filter menus; pass 0 to request an uncapped scan.
   */
  distinctValues(col: number, limit?: number): CellScalar[];
  /** Hide the given data rows (composes with filters/sort). */
  hideRows(rows: readonly number[]): void;
  /** Show the given data rows again, or every hidden row when omitted. */
  showRows(rows?: readonly number[]): void;
  /** Currently hidden data rows on the active sheet. */
  hiddenRows(): readonly number[];
  /** Hide columns through one bulk-safe metadata transaction. */
  hideColumns(cols?: readonly number[]): void;
  /** Show columns through one bulk-safe metadata transaction. */
  showColumns(cols?: readonly number[]): void;
  /** Currently hidden columns on the active sheet. */
  hiddenColumns(): readonly number[];
  /** Define a collapsible row group over a data-row range (end-inclusive). */
  groupRows(start: number, end: number): void;
  /** Remove a row group (rows become visible if the group was collapsed). */
  ungroupRows(start: number, end: number): void;
  /** Collapse/expand a row group; collapsing hides its rows. */
  setGroupCollapsed(start: number, collapsed: boolean): void;
  /** Row groups on the active sheet. */
  rowGroups(): readonly RowGroup[];
  /** Clear any active sort/filter view. */
  clearView(): void;
  /**
   * Undo the last recorded cell edit. If the restored data is above the
   * transaction resource limits, nothing changes: the Grid emits
   * `mutation-rejected` and removes that entry, so older edits stay undoable.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function undoAndRestore(grid: Grid) {
   *   grid.undo();
   *   grid.redo();
   * }
   * ```
   * @see Grid.redo
   */
  undo(): void;
  /** Redo the last undone cell edit. */
  redo(): void;
  /**
   * Download the active sheet as CSV.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   *
   * function downloadCsv(grid: Grid) {
   *   grid.exportCsv("sales.csv");
   * }
   * ```
   */
  exportCsv(filename: string): void;
  /**
   * Download the active sheet through the registered XLSX backend.
   *
   * @example
   * ```ts
   * import type { Grid } from "@sheetwrite/core";
   * import { registerXlsxBackends } from "@sheetwrite/xlsx";
   *
   * async function downloadXlsx(grid: Grid) {
   *   await registerXlsxBackends();
   *   await grid.exportXlsx("sales.xlsx");
   * }
   * ```
   * @see toXlsxWorkbook
   */
  exportXlsx(filename: string): Promise<void>;
  /** Find cells matching `query`; highlights matches, emits `search`, returns the result. */
  search(query: string, opts?: SearchOptions): SearchResult;
  /** Move the active match to the next match and scroll it into view. */
  findNext(): SearchResult;
  /** Move the active match to the previous match and scroll it into view. */
  findPrev(): SearchResult;
  /** Clear the current search and its highlights. */
  clearSearch(): void;
  /**
   * Replace the active match with `replacement`, then advance to the next match
   * (re-scanning against the new data). Only literal text/number cells are
   * eligible; formula and ref cells are skipped (formula source is never
   * rewritten). Honors the active {@link SearchOptions} (matchCase; `wholeCell`
   * swaps the entire cell). The write flows through the grid's commit path as
   * one undoable step. No-op when read-only or when there is no active match.
   */
  replaceCurrent(replacement: string): SearchResult;
  /**
   * Replace every current match in a single undoable transaction (one
   * `undo()` restores them all), then re-scan. Formula/ref cells are skipped
   * and not counted. No-op when read-only.
   */
  replaceAll(replacement: string): ReplaceResult;
  insertRows(at: number, count?: number): void;
  removeRows(at: number, count?: number): void;
  insertColumns(at: number, count?: number): void;
  removeColumns(at: number, count?: number): void;
  /** Add a sheet with a stable ID and return its actionable transaction outcome. */
  addSheet(input: AddSheetInput): SheetLifecycleResult;
  /** Remove a sheet while preserving at least one visible worksheet. */
  removeSheet(id: SheetId): SheetLifecycleResult;
  renameSheet(id: SheetId, name: string): SheetLifecycleResult;
  moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
  /** Set host-visible worksheet state; stock UI never offers `veryHidden`. */
  setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult;
  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
  setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
  removeHyperlink(id: string): ApplyTransactionResult;
  getHyperlink(addr: CellAddress): CellHyperlink | null;
  /**
   * Validate and emit a host-owned activation event. External targets are never
   * opened by Sheetwrite; internal navigation occurs only under the explicit policy.
   */
  activateHyperlink(addr: CellAddress): boolean;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  /** Clones of the pivot definitions on `sheet`, or on every sheet; no engine is needed. */
  getPivots(sheet?: SheetId): PivotDefinition[];
  /**
   * Insert or replace a pivot as one undo entry. `sheet` defaults to the sheet
   * that holds the pivot's ID, then to the active sheet. The pivot's
   * `savedOutput` is removed, because it does not match a changed definition.
   */
  setPivot(pivot: PivotDefinition, sheet?: SheetId): ApplyTransactionResult;
  /** Remove a pivot from `sheet` (default: the sheet that holds it) as one undo entry. */
  removePivot(id: string, sheet?: SheetId): ApplyTransactionResult;
  /** Source fields for the field list; empty on the default engine. */
  getPivotFields(sheet: SheetId, id: string): PivotSourceField[];
  /**
   * Plain-JSON output of one pivot. The default engine reports the saved
   * output (`saved`), or `unavailable` without one. Null when `sheet` holds
   * no pivot with `id`.
   */
  getPivotResult(sheet: SheetId, id: string): PivotResultView | null;
  /** Clones of the chart definitions on `sheet` (default: the active sheet). */
  getCharts(sheet?: SheetId): readonly ChartDefinition[];
  /**
   * Insert or replace the chart with `chart.id` as one undo entry. `sheet`
   * defaults to the active sheet; chart IDs are unique only within a sheet.
   */
  setChart(chart: ChartDefinition, sheet?: SheetId): ApplyTransactionResult;
  /** Remove a chart from `sheet` (default: the first sheet that holds it) as one undo entry. */
  removeChart(id: string, sheet?: SheetId): ApplyTransactionResult;
  /**
   * Select the chart object `id` on `sheet` (default: the active sheet), or
   * deselect with `null`. Selecting a chart on another sheet activates that
   * sheet first. Emits `chart-select`.
   */
  selectChart(id: string | null, sheet?: SheetId): void;
  /**
   * Show `panel` on the grid's right edge and shrink the cells to make room;
   * `null` closes the open panel. One panel shows at a time: opening a panel
   * closes the previous one. Escape and the close button close it and return
   * focus to the grid.
   */
  openPanel(panel: GridPanel | null): void;
  setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  /**
   * Live-update the render window overscan (row/column positions painted past
   * each edge); `undefined` restores the default of 6.
   */
  setOverscan(overscan?: number): void;
  /**
   * Live-update the minimum rendered column count. Increasing the minimum
   * silently extends presentation padding; `undefined` restores the default.
   */
  setMinColumns(minColumns?: number): void;
  /**
   * Draw temporary highlights outside document history. Pass `null` to clear all
   * highlights: `grid.highlightCells(null)`. Per-range `color` wins over the call color.
   * Undo does not clear highlights; use `styleRange` for persistent cell fills.
   */
  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
  /** Replace ephemeral remote-presence overlays; null clears every collaborator. */
  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
  /**
   * Merge `style` into every cell of `range` (null clears cell styles) as one
   * undoable transaction. Styles land in the store and paint in the canvas —
   * unlike {@link highlightCells}, which draws a translucent overlay above it.
   */
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  /** Open the cell editor at a view cell, optionally seeding text / selecting all. */
  beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
  /**
   * Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the
   * moved axis (row for vertical moves, col for horizontal), or null when the
   * store is not columnar. Under an active sort/filter view, `row` is a view
   * position and vertical moves return view positions. For hosts building
   * their own keymaps (`config.keyboard`).
   */
  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
  /** Set one row's persistent display height through document history. */
  setRowHeight(row: number, height: number): void;
  /** Set one column's width via an undoable `setColumn` patch. */
  setColumnWidth(col: number, width: number): void;
  /** Explicitly resize rows to fit wrapped content; never runs during paint. */
  autoFitRows(range?: Range): void;
  /** Explicitly resize columns from a bulk worksheet read. */
  autoFitColumns(cols?: readonly number[]): void;
  /**
   * Pin the first `rows` view rows and `cols` columns; they stay visible while
   * the body scrolls (0 = unfreeze that axis). Persisted on the active sheet.
   */
  setFrozen(rows: number, cols?: number): void;
  /** Content zoom factor (0.5–2): scales row/column geometry and fonts. */
  setZoom(zoom: number): void;
  getZoom(): number;
  /**
   * Which renderer is actually active: `"worker"` when the OffscreenCanvas
   * worker constructed successfully, `"canvas"` otherwise (including after a
   * `renderer-fallback`).
   */
  rendererKind(): "canvas" | "worker";
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
}
