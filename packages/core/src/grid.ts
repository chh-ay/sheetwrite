import { cellA1, colToA1 } from "./a1.js";
import { type ActionFeedback, attachActionFeedback, errorDetail } from "./action-feedback.js";
import type { AddonRegistry } from "./addons.js";
import { AriaMirror } from "./aria-mirror.js";
import type { AutoFilterHost } from "./autofilter-actions.js";
import {
  type AutoFilterCommandsHost,
  clearFilters,
  filterBySelection,
  toggleAutoFilter,
} from "./autofilter-commands.js";
import { readBlockArraysOnce } from "./block-ingress.js";
import {
  fontFor,
  intersectingMerges,
  layoutTextLines,
  mergeAnchorAt,
  prepareMergeIndex,
} from "./canvas-paint.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import {
  type CellCommandsHost,
  formatCells,
  insertOrDelete,
  runCellCommand,
} from "./cell-commands.js";
import { cellDisplayText, cellEditText, cellScalarToText } from "./cell-input.js";
import { EMPTY_STYLE } from "./cell-style-fields.js";
import { ClipboardController } from "./clipboard-controller.js";
import { isDashboard } from "./dashboard.js";
import { attachDashboardView, type DashboardViewHook } from "./dashboard/dashboard-loader.js";
import { DatasourceController } from "./datasource-controller.js";
import type { DialogHost } from "./dialog.js";
import { DocumentController } from "./document-controller.js";
import {
  admitTransactionResources,
  assertWorkbookAllocationLimits,
  resolveTransactionResourceLimits,
  validateTransactionResources,
} from "./document-protocol.js";
import { DomOverlay } from "./dom-overlay.js";
import { type EditDraftSink, registerEditDraft } from "./edit-draft.js";
import {
  ENGINE_LOAD_HINT,
  engineFailedError,
  engineGeneration,
  isEngineLoaded as isLoaded,
  loadEngine,
  onEngineFailure,
  type SheetwriteEngine,
  stopEngine,
} from "./engine.js";
import {
  isSheetwriteError,
  normalizeSheetwriteError,
  SheetwriteError,
  unknownSheetError,
} from "./errors.js";
import { downloadBytesIn, toCsv } from "./export.js";
import type { FindBar } from "./find-bar.js";
import { GRID_EXIT_HINT } from "./focus-exit.js";
import { stepFontSizePx, stepNumberFormatDecimals } from "./format-presets.js";
import { GeometryLayoutController } from "./geometry-layout-controller.js";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  CELL_TEXT_HORIZONTAL_PADDING,
  DEFAULT_DISTINCT_VALUES_LIMIT,
  TAB_BAR_HEIGHT,
} from "./grid-constants.js";
import { hyperlinkAt, resolveHyperlinkTarget, sanitizeCellHyperlink } from "./hyperlink.js";
import { InteractionSessions } from "./interaction-sessions.js";
import { Keymap } from "./keymap.js";
import { mergeSelection } from "./merge-command.js";
import { MutationRevisionIndex, type MutationRevisionStats } from "./mutation-revision-index.js";
import { type NoteCell, NotePopover } from "./note-popover.js";
import { trimNumberFormatCaches } from "./number-format.js";
import { ObjectLayer } from "./object-layer.js";
import { OverlayPainter } from "./overlay-painter.js";
import { attachPanelTriggers, showPivotFields, showSortPanel } from "./panels/panel-loader.js";
import { clonePivots, pivotOwner, uncomputedPivotResult, withoutSavedOutput } from "./pivot.js";
import {
  type PaintedCells,
  type PaintedView,
  type PaintedWindowTransform,
  ReadWindowController,
} from "./read-window-controller.js";
import {
  createRuntimeResourceSnapshot,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
} from "./resource-accounting.js";
import { registerGridDocument } from "./restore-commit.js";
import type { CommandToolbar } from "./ribbon/command-toolbar.js";
import { assertRibbonConfig, ribbonHeight, TOOLBAR_HEIGHT } from "./ribbon/ribbon-metrics.js";
import type { Ribbon } from "./ribbon/ribbon.js";
import { FirstFailure, scheduleFrame, Scope, ScopeSlot } from "./scope.js";
import { SearchController } from "./search-controller.js";
import { type CellRef, SelectionModel, type SelRect } from "./selection.js";
import { insertSheet, runSheetKey } from "./sheet-commands.js";
import { planSheetCopy } from "./sheet-copy.js";
import { validateSheetName } from "./sheet-name.js";
import { changesSheetTabs, SheetTabs } from "./sheet-tabs.js";
import { mountSidePanel } from "./side-panel.js";
import { currentRegion, looksLikeHeader } from "./sort-target.js";
import { IncompleteDataError, SHEET_LIFECYCLE_MESSAGES, SheetwriteStore } from "./store.js";
import { autoFilterBody } from "./store/autofilter.js";
import { storeEngine, storeGeneration } from "./store/engine-registry.js";
import {
  addRowGroup,
  collapseRowGroup,
  movedBlock,
  rangeContains,
  removeRowGroup,
  resolveActiveSheet,
  visibleSheetNeighbor,
} from "./store/ranges.js";
import {
  autoFilterPatch,
  clearViewPatch,
  columnFilterPatch,
  reapplyFilterPatch,
  rowVisibilityPatches,
  viewSortPatch,
} from "./store/view-patches.js";
import { StyleActions, type StyleActionsDeps } from "./style-actions.js";
import { checkStylePart } from "./style-parts.js";
import {
  beginGridTransactionAdmission,
  hasGridTransactionAdmission,
} from "./transaction-admission.js";
import type { SheetwriteAddon } from "./types/addon.js";
import type {
  CellHyperlink,
  CellScalar,
  CellStyle,
  Column,
  ConditionalFormatRule,
} from "./types/cell.js";
import type { ChartDefinition, ChartRef } from "./types/chart.js";
import type {
  CellAddress,
  HighlightRange,
  PresenceOverlay,
  Range,
  Selection,
  SheetId,
} from "./types/coordinates.js";
import type { AggregateOp } from "./types/data.js";
import type {
  AddSheetInput,
  AutoFilter,
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  Sheet,
  SheetSnapshot,
  SheetVisibility,
  SortKey,
  WorkbookSnapshot,
} from "./types/document.js";
import type { ContextMenuItem, KeyboardAction, KeyboardOptions } from "./types/grid.js";
import type {
  CellEditor,
  CellInputSnapshot,
  CellMode,
  ClipboardOutcome,
  Grid,
  GridActions,
  GridCommandName,
  GridCommandState,
  GridConfig,
  GridEvents,
  GridOptions,
  GridPanel,
  GridPresentation,
  ReplacePreview,
  ReplaceResult,
  SearchOptions,
  SearchResult,
  SelectionSummary,
  SheetLifecycleResult,
} from "./types/grid.js";
import type { PivotDefinition, PivotResultView, PivotSourceField } from "./types/pivot.js";
import type { CellRenderer, Renderer, Theme } from "./types/render.js";
import type { Store, VisibleWindowView } from "./types/store.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";
import { hasInputMessage } from "./validation-rule.js";
import { seedWidgetTheme, tabBarFont } from "./widget-theme.js";
import { WorkerRenderer } from "./worker-renderer.js";

/** Platform fallback used when no reliable browser scroll clamp can be measured. */
const MAX_ELEMENT_HEIGHT_FALLBACK = 15_000_000;
/** Safety margin below the measured clamp, reserved for layout rounding. */
const MAX_ELEMENT_HEIGHT_MARGIN = 4_096;

/**
 * Browsers clamp both element heights and scroll offsets at engine-specific
 * ceilings that SHRINK with browser zoom / `devicePixelRatio` (Chromium:
 * ~33.5M CSS px at 100% zoom, /1.25 at 125%). The two clamps are not the
 * same and neither is a constant, so the achievable scroll range is measured
 * end to end with a real scroller probe: force `scrollTop` past any limit and
 * read back what the engine actually kept. Re-measured on zoom changes.
 */
export function measureMaxElementHeight(
  doc: Document | null | undefined = typeof document === "undefined" ? undefined : document,
): number {
  if (!doc?.body) return MAX_ELEMENT_HEIGHT_FALLBACK;
  const scroller = doc.createElement("div");
  scroller.style.cssText =
    "position:absolute;visibility:hidden;left:-9999px;width:32px;height:32px;overflow:scroll;";
  const sizer = doc.createElement("div");
  sizer.style.cssText = "width:1px;height:1000000000000px;";
  scroller.append(sizer);
  doc.body.append(scroller);
  const layout_clamp = sizer.getBoundingClientRect().height;
  scroller.scrollTop = 1_000_000_000_000;
  const scroll_clamp = scroller.scrollTop > 0 ? scroller.scrollTop + scroller.clientHeight : 0;
  scroller.remove();
  const measured = Math.min(
    Number.isFinite(layout_clamp) && layout_clamp > 0 ? layout_clamp : Number.POSITIVE_INFINITY,
    Number.isFinite(scroll_clamp) && scroll_clamp > 0 ? scroll_clamp : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(measured) || measured < 1_000_000) return MAX_ELEMENT_HEIGHT_FALLBACK;
  return Math.floor(measured) - MAX_ELEMENT_HEIGHT_MARGIN;
}
/** Interaction-tuning default: paint six row and visible-column positions past each viewport edge. */
const DEFAULT_OVERSCAN = 6;
/** Width of synthesized workbook and presentation-padding columns, in CSS pixels. */
const DEFAULT_COL_WIDTH = 100;
/** How long the cells an undo or redo changed stay tinted, in milliseconds. */
const FLASH_MS = 600;
/** Changed ranges tinted at most; a step that changes more cells tints the first ones. */
const FLASH_RANGES = 256;
/** Width of the side panel, in CSS pixels; the cells give up this much room while it is open. */
const PANEL_WIDTH = 320;
const GRID_COMMANDS: readonly GridCommandName[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignTop",
  "alignMiddle",
  "alignBottom",
  "wrap",
  "textColor",
  "fillColor",
  "border",
  "clearFormat",
  "merge",
  "unmerge",
  "sortAsc",
  "sortDesc",
  "filter",
  "exportCsv",
  "exportXlsx",
  "importXlsx",
  "versionHistory",
  "saveVersion",
  "newDashboard",
  "undo",
  "redo",
];
const COMMAND_STATE_ACTIVITY_COMMANDS: readonly GridCommandName[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignTop",
  "alignMiddle",
  "alignBottom",
  "wrap",
  "border",
];
/** Bound synchronous command-state work; larger uniform selections report mixed conservatively. */
const COMMAND_STATE_CELL_LIMIT = 4_096;

/** Column bands copied into a datasource failure; the full count goes beside them. */
const MAX_DATASOURCE_ERROR_COLUMN_BANDS = 64;

function is_formatting_command(command: GridCommandName): boolean {
  return (
    command === "bold" ||
    command === "italic" ||
    command === "underline" ||
    command === "strikethrough" ||
    command === "alignLeft" ||
    command === "alignCenter" ||
    command === "alignRight" ||
    command === "alignTop" ||
    command === "alignMiddle" ||
    command === "alignBottom" ||
    command === "wrap" ||
    command === "textColor" ||
    command === "fillColor" ||
    command === "border" ||
    command === "clearFormat"
  );
}

function effective_style_value<Key extends keyof CellStyle>(
  cell: CellStyle,
  column: CellStyle | undefined,
  key: Key,
): CellStyle[Key] {
  return Object.hasOwn(cell, key) ? cell[key] : column?.[key];
}

function formatting_command_active(
  command: GridCommandName,
  cell: CellStyle,
  column: CellStyle | undefined,
): boolean {
  switch (command) {
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
      return effective_style_value(cell, column, command) === true;
    case "alignLeft":
      return effective_style_value(cell, column, "align") === "left";
    case "alignCenter":
      return effective_style_value(cell, column, "align") === "center";
    case "alignRight":
      return effective_style_value(cell, column, "align") === "right";
    case "alignTop":
      return effective_style_value(cell, column, "verticalAlign") === "top";
    case "alignMiddle":
      return (effective_style_value(cell, column, "verticalAlign") ?? "middle") === "middle";
    case "alignBottom":
      return effective_style_value(cell, column, "verticalAlign") === "bottom";
    case "wrap":
      return effective_style_value(cell, column, "wrap") === true;
    case "border":
      return effective_style_value(cell, column, "border") !== undefined;
    default:
      return false;
  }
}

/** Bounds each auto-fit store read; larger scans continue in frame-scheduled chunks. */
export const AUTO_FIT_CHUNK_CELLS = 16_384;

export interface AutoFitResourceStats {
  readonly chunkCellLimit: number;
  readonly windowRequests: number;
  readonly maxWindowCells: number;
  readonly scheduledChunks: number;
  readonly completedJobs: number;
  readonly cancelledJobs: number;
  readonly committedPatches: number;
}

/** Scale every `<n>px` occurrence in a CSS font shorthand by `zoom`. */
function scale_font_px(font: string, zoom: number): string {
  return font.replace(
    /(\d+(?:\.\d+)?)px/g,
    (_, px: string) => `${Math.round(Number.parseFloat(px) * zoom * 10) / 10}px`,
  );
}

/** Default canvas theme used before CSS and explicit theme overrides. */
export const DEFAULT_THEME: Theme = {
  font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  bg: "#ffffff",
  fg: "#111111",
  gridLine: "#eeeeee",
  headerBg: "#f4ede1",
  headerFg: "#6b4a1f",
  selection: "#2563eb22",
  selectionBorder: "#2563eb",
  rowHeight: 28,
  headerHeight: 32,
  rowHeaderWidth: 48,
  searchMatch: "#ffd54f80",
  searchActiveMatch: "#f59e0b",
  highlight: "#a7f3d080",
};

/**
 * Widen the row-number gutter to fit the largest row label; a fixed width
 * clips at 6-7 digit row counts. An explicit `rowHeaderWidth: 0` still hides
 * the gutter entirely.
 */
function adaptive_row_header_width(theme: Theme, data_row_count: number): number {
  if (theme.rowHeaderWidth <= 0) return theme.rowHeaderWidth;
  const digits = String(Math.max(1, data_row_count)).length;
  const font_match = /(\d+(?:\.\d+)?)px/.exec(theme.font);
  const font_px = font_match ? Number(font_match[1]) : 12;
  return Math.max(theme.rowHeaderWidth, Math.ceil(digits * font_px * 0.6 + 12));
}

/**
 * What {@link initSheetwrite} loads: the engine, where its WASM comes from,
 * and the add-ons it installs.
 */
export interface InitSheetwriteOptions {
  /** Engine module; defaults to `@sheetwrite/wasm`. Pass `@sheetwrite/formulas` for the full engine. */
  engine?: SheetwriteEngine;
  /** Explicit WASM bytes or location, for bundlers that cannot resolve the engine asset. */
  source?: BufferSource | URL | string | Request | WebAssembly.Module;
  /**
   * Add-ons to install, in this order, after the engine loads. A name listed
   * twice rejects; a name installed by an earlier call is kept.
   */
  addons?: readonly SheetwriteAddon[];
}

/**
 * The add-on registry, once `initSheetwrite` installed any add-on. Its module
 * loads only then, so a page without add-ons carries none of its code.
 */
let addons: AddonRegistry | undefined;

/**
 * Load one WASM engine and install add-ons before `createGrid`.
 *
 * @example
 * ```ts
 * import { chartsAddon } from "@sheetwrite/charts";
 * import { initSheetwrite } from "@sheetwrite/core";
 * import * as formulas from "@sheetwrite/formulas";
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 *
 * await initSheetwrite({ engine: formulas, addons: [chartsAddon(), xlsxAddon()] });
 * ```
 * @see /docs/start/choose-an-engine/
 * @see createGrid
 */
export async function initSheetwrite(options: InitSheetwriteOptions = {}): Promise<void> {
  try {
    await loadEngine(options.source, options.engine);
  } catch (error) {
    throw normalizeSheetwriteError(error, "initialization-failed", "initialize");
  }

  if (options.addons?.length) {
    const registry = await import("./addons.js");
    addons = registry.addonRegistry;
    await addons.install(options.addons);
  }
}

/**
 * Whether `initSheetwrite` has completed — the single readiness source.
 *
 * @returns `true` once the engine has loaded, so `createGrid` will not throw
 *   for a missing engine; add-ons may still be installing.
 */
export function isSheetwriteReady(): boolean {
  return isLoaded();
}

/**
 * Read `--sheetwrite-*` CSS custom properties into a partial theme.
 *
 * @param el - Element whose computed style is read. Custom properties inherit,
 *   so any element inside the themed container works.
 * @returns Only the theme fields whose property is set; empty outside a browser.
 */
export function resolveThemeFromCss(el: HTMLElement): Partial<Theme> {
  if (typeof getComputedStyle !== "function") return {};

  const cs = getComputedStyle(el);
  const theme: Partial<Theme> = {};
  const read = (name: string): string => cs.getPropertyValue(name).trim();

  const map: Array<[keyof Theme, string]> = [
    ["bg", "--sheetwrite-bg"],
    ["fg", "--sheetwrite-fg"],
    ["gridLine", "--sheetwrite-grid-line"],
    ["headerBg", "--sheetwrite-header-bg"],
    ["headerFg", "--sheetwrite-header-fg"],
    ["selection", "--sheetwrite-selection"],
    ["selectionBorder", "--sheetwrite-selection-border"],
    ["searchMatch", "--sheetwrite-search-match"],
    ["searchActiveMatch", "--sheetwrite-search-active"],
    ["highlight", "--sheetwrite-highlight"],
  ];
  for (const [key, prop] of map) {
    const value = read(prop);
    if (value) (theme[key] as string) = value;
  }

  const rh = read("--sheetwrite-row-height");
  if (rh) theme.rowHeight = Number.parseFloat(rh);

  // `--sheetwrite-font` may be a full CSS font shorthand including a
  // line-height (`13px / 1.4 system-ui`); canvas `ctx.font` and the px
  // parsers reject that segment, so strip it before mapping.
  const font = read("--sheetwrite-font");
  if (font)
    theme.font = font
      .replace(/\/\s*[\d.]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  return theme;
}

/**
 * Creates and mounts an imperative Grid in the supplied host element.
 *
 * @example
 * ```ts
 * import { createGrid, initSheetwrite } from "@sheetwrite/core";
 *
 * await initSheetwrite();
 * const host = document.createElement("div");
 * host.style.height = "400px";
 * document.body.append(host);
 * const grid = createGrid(host, {
 *   workbook: {
 *     activeSheet: "sales",
 *     sheets: [{ id: "sales", name: "Sales", rowCount: 2,
 *       columns: [{ key: "amount", header: "Amount", type: "number", width: 120 }] }],
 *   },
 *   data: { rowCount: 2, columns: { amount: [12, 18] } },
 * });
 * grid.scrollToCell({ sheet: "sales", row: 1, col: 0 });
 * // Call when the host view is removed.
 * grid.destroy();
 * ```
 * @param host - Element the grid renders into. The grid fills it and follows its
 *   size, so give it a height.
 * @param opts - The workbook, its data or datasource, and the grid's settings
 *   and callbacks.
 * @see Grid
 * @see GridOptions
 */
export function createGrid(host: HTMLElement, opts: GridOptions): Grid {
  if (!isLoaded()) {
    throw new SheetwriteError(
      "initialization-required",
      "create-grid",
      `Sheetwrite: await initSheetwrite() before createGrid(). ${ENGINE_LOAD_HINT}`,
    );
  }

  return new GridImpl(host, opts);
}

/** One chunked auto-fit run; its scope cancels the pending frame when it closes. */
interface AutoFitJob {
  readonly scope: Scope;
  completed: boolean;
}

export class GridImpl implements Grid {
  readonly store: Store;
  readonly actions: GridActions;
  private readonly loadable: SheetwriteStore | null;
  /**
   * Store ownership. `true` when the grid constructed its own `SheetwriteStore`
   * (no store was injected via the constructor). Only an owned store is disposed
   * in `destroy()`; a caller-provided store outlives the grid, so freeing its
   * WASM `CellStore` is the caller's responsibility, not ours.
   */
  private readonly owns_store: boolean;
  private readonly host: HTMLElement;
  private readonly scroller: HTMLDivElement;
  private readonly sizer: HTMLDivElement;
  private renderer: Renderer;
  private readonly interactions: InteractionSessions;
  private readonly aria_mirror: AriaMirror;
  private readonly search_controller: SearchController;
  private readonly clipboard: ClipboardController;
  private readonly style_actions: StyleActions;
  /** What the style actions and the lazily loaded merge command read and write. */
  private readonly style_deps: StyleActionsDeps;
  private readonly document: DocumentController;
  private readonly datasource_controller: DatasourceController;
  private readonly geometry: GeometryLayoutController;
  private readonly overlay_painter: OverlayPainter;
  private readonly dom_overlay: DomOverlay;
  private readonly read_windows: ReadWindowController;
  private overscan: number;
  private displayed_hidden_rows: Set<number>;
  private displayed_has_view: boolean;
  private readonly transaction_resource_limits: Readonly<TransactionResourceLimits>;
  private read_only: boolean;
  private max_element_height = MAX_ELEMENT_HEIGHT_FALLBACK;
  private last_device_pixel_ratio = 1;
  private tab_bar: HTMLDivElement | null = null;
  private sheet_tabs: SheetTabs | null = null;
  private tab_bar_height = 0;
  private keyboard_policy: boolean | KeyboardOptions | ((e: KeyboardEvent) => boolean) = true;
  private keymap: Keymap;
  private zoom = 1;
  private base_theme: Theme;
  /**
   * The grid's root scope. `destroy()` closes it, which closes every scope
   * below: chrome builds, the find bar, the side panel, auto-fit jobs,
   * clipboard actions, summaries and exports.
   */
  private readonly lifetime = new Scope();
  /** The toolbar or ribbon build; a rebuild closes it, so a chunk that loads late is dropped. */
  private readonly chrome_builds = new ScopeSlot(this.lifetime);
  /** The loaded find bar; `null` until its first open, and again after a reset. */
  private find_bar: FindBar | null = null;
  /** The find bar build; a reset closes it, so a chunk that loads late is dropped. */
  private readonly find_bar_builds = new ScopeSlot(this.lifetime);
  /** Built on first use by `auto_filter()`, whose doc says what uses it. */
  private auto_filter_host: (AutoFilterHost & AutoFilterCommandsHost) | null = null;
  /** The dropdown chunk's build; a destroy closes it, so a chunk that loads late is dropped. */
  private readonly auto_filter_builds = new ScopeSlot(this.lifetime);
  /** The open dialog; opening another or destroying the grid closes it. */
  private readonly dialogs = new ScopeSlot(this.lifetime);
  /** What the lazily loaded dialogs use; one is open at a time. */
  private readonly dialog_host: DialogHost;
  /** Built on first use by `cell_commands()`, whose doc says what uses it. */
  private cell_commands_host: CellCommandsHost | null = null;
  /** Find, dialogs, panels and the dashboard builder whose code is loading on first use. */
  private command_loads = 0;
  /** Keys pressed on the grid while they load, in order. */
  private readonly held_keys: KeyboardEvent[] = [];
  private readonly notes: NotePopover;
  private readonly action_feedback: ActionFeedback;
  private config: GridConfig | undefined;
  private readonly presentation: GridPresentation;
  private readonly hyperlink_activation: "event-only" | "internal-navigation" | "disabled";
  private toolbar_height = 0;
  private readonly viewport_el: HTMLDivElement;
  private readonly custom_renderers = new Map<string, CellRenderer>();
  private readonly custom_editors = new Map<string, CellEditor>();

  /** The shell's formula bar hearing the cell edit's draft (internal, see `edit-draft.ts`). */
  private readonly edit_draft_listeners = new Set<EditDraftSink>();
  /**
   * The active cell when {@link goToCell} went to a row the view hides, in
   * sheet coordinates; null otherwise. The selection is then empty.
   */
  private hidden_active: CellAddress | null = null;

  private readonly listeners: { [K in keyof GridEvents]: Set<(e: GridEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    scroll: new Set(),
    "edit-begin": new Set(),
    "edit-commit": new Set(),
    "cell-mode": new Set(),
    search: new Set(),
    "command-state-change": new Set(),
    "active-sheet": new Set(),
    "history-step": new Set(),
    "hyperlink-activate": new Set(),
    "renderer-fallback": new Set(),
    "datasource-error": new Set(),
    "mutation-rejected": new Set(),
    "export-error": new Set(),
    "theme-change": new Set(),
    "chart-select": new Set(),
    "chart-activate": new Set(),
    "engine-failed": new Set(),
    "key-bindings-change": new Set(),
  };

  /** Which renderer actually constructed; set by `create_renderer`. */
  private active_renderer_kind: "canvas" | "worker" = "canvas";

  private theme: Theme;
  private active_sheet: SheetId;
  /** Memoized active `Sheet` object; invalidated on store change / tab switch. */
  private active_sheet_cache: Sheet | null = null;
  /** Shows the dashboard view while a dashboard sheet is active; spreadsheet grids only. */
  private dashboard_view: DashboardViewHook | null = null;
  /** Pre-change worksheet state retained for deterministic session fallback through remote batches. */
  private session_sheets: Array<{ id: SheetId; visibility?: SheetVisibility }> = [];
  /**
   * The columns each sheet shows: its own and the empty ones that fill the
   * width. It never shrinks, so deleting a column keeps the sheet as wide. A
   * sheet gets its entry when the grid first reads it.
   */
  private readonly virtual_column_targets = new Map<SheetId, number>();
  /** Format Cells' preview of the selection while the dialog is open; nothing reaches the document. */
  private format_preview: PaintedWindowTransform | null = null;
  /** The `min_columns` option, as constructed or last set. */
  private min_columns: number | undefined;
  /** Each sheet's selection and scroll when another sheet became active. */
  private readonly sheet_views = new Map<
    SheetId,
    { selection: Selection | null; top: number; left: number }
  >();
  /** Removes the tint of the cells the last undo or redo changed. */
  private flash_timer: number | undefined;
  private selection: SelectionModel;
  private readonly mutation_revisions = new MutationRevisionIndex();
  /** The open side panel; closing it runs the panel's cleanup. */
  private readonly side_panels = new ScopeSlot(this.lifetime);
  /** The panel `side_panels` holds open, which `trimMemory` asks to trim. */
  private open_side_panel: GridPanel | null = null;
  /** Engine generation of this grid's store; traps from its reads stop that instance only. */
  private readonly engine_generation: number;
  /** Set once the engine stopped; read-only stays on until the host recreates the grid. */
  private engine_failure: SheetwriteError | null = null;
  private readonly remove_engine_failure_listener: () => void;
  private store_epoch = 0;
  private window_content_revision = 0;
  private source_sheet: SheetId | null = null;
  private sheet_has_sources = true;
  /** The running auto-fit job; a new job or an edit closes it. */
  private readonly auto_fits = new ScopeSlot(this.lifetime);
  private measure_context: CanvasRenderingContext2D | null = null;
  private imports: ScopeSlot | null = null;
  private document_operations: ScopeSlot | null = null;
  private readonly has_datasource: boolean;
  private command_state_queued = false;
  private command_state_generation = 0;

  private readonly auto_fit_stats = {
    windowRequests: 0,
    maxWindowCells: 0,
    scheduledChunks: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    committedPatches: 0,
  };

  private resolution_media_query: MediaQueryList | null = null;

  private readonly on_resolution_change = (): void => {
    if (this.lifetime.closed) return;
    this.arm_resolution_listener();
    this.sync_sizer();
    this.read_windows.invalidate();
    this.schedule_render();
  };

  private readonly on_scroll = () => {
    this.read_windows.noteViewportMoved();
    this.schedule_render();
  };
  private readonly dispose_store: () => void;
  private readonly object_layer: ObjectLayer;
  private readonly panel_host: HTMLDivElement;
  /** The cell selection last emitted, to tell a real move from a re-emit. */
  private last_selection_key = "";

  constructor(
    host: HTMLElement,
    opts: GridOptions,
    store?: Store,
    ownsStore = store === undefined,
  ) {
    // Settings for an add-on that `initSheetwrite` did not install reject before anything is built.
    for (const name in opts.addons) {
      if (!addons?.has(name)) {
        throw new SheetwriteError(
          "invalid-argument",
          "create-grid",
          `Sheetwrite: add-on "${name}" is not installed.`,
          { context: { addon: name } },
        );
      }
    }

    assertRibbonConfig(opts.config?.ribbon);
    this.keymap = new Keymap(opts.config);
    this.transaction_resource_limits = resolveTransactionResourceLimits(
      opts.transactionResourceLimits,
    );
    this.host = host;
    this.presentation = opts.presentation ?? "spreadsheet";
    this.hyperlink_activation =
      opts.hyperlinkActivation === undefined
        ? "event-only"
        : opts.hyperlinkActivation === "event-only" ||
            opts.hyperlinkActivation === "internal-navigation" ||
            opts.hyperlinkActivation === "disabled"
          ? opts.hyperlinkActivation
          : "disabled";
    const workbook = opts.workbook;
    if (!(store instanceof SheetwriteStore)) {
      assertWorkbookAllocationLimits(workbook, {
        storage: opts.datasourceStorage?.mode ?? "dense",
      });
    }

    this.store =
      store ??
      new SheetwriteStore(workbook, opts.data, {
        storage: opts.datasourceStorage?.mode ?? "dense",
        chunkRows: opts.datasourceStorage?.chunkRows,
        cacheBytes: opts.datasourceStorage?.cacheBytes,
        dirtyCellLimit: opts.datasourceStorage?.dirtyCellLimit,
        protectionResolver: opts.protectionResolver,
        mutationPolicy: opts.mutationPolicy,
        transactionResourceLimits: this.transaction_resource_limits,
      });

    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    // A host store keeps the generation of the engine it was built on.
    this.engine_generation = storeGeneration(this.store) ?? engineGeneration();
    this.store.setProtectionResolver?.(opts.protectionResolver, opts.mutationPolicy);
    this.owns_store = ownsStore;
    this.min_columns = opts.minColumns;

    const datasource = opts.datasource;
    this.has_datasource = datasource !== undefined;
    this.read_only = opts.readOnly ?? false;
    this.config = opts.config;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.base_theme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };

    this.active_sheet = resolveActiveSheet(workbook.sheets, opts.workbook.activeSheet);

    this.session_sheets = workbook.sheets.map(({ id, visibility }) => ({ id, visibility }));
    this.displayed_hidden_rows = new Set(this.sheet().hiddenRows);
    this.displayed_has_view = this.loadable?.hasView(this.active_sheet) ?? false;
    this.theme = this.with_adaptive_gutter(
      this.base_theme,
      workbook.sheets.find((sheet) => sheet.id === this.active_sheet)?.rowCount ?? 0,
    );

    this.tab_bar_height = opts.config?.tabs !== false ? TAB_BAR_HEIGHT : 0;

    this.document = new DocumentController({
      store: this.store,
      loadable: this.loadable,
      readOnly: () => this.read_only,
      epoch: () => this.store_epoch,
      materializeVirtualColumns: (patches) => this.materialize_virtual_columns(patches),
      onMutationRejected: (issues) => {
        for (const fn of this.listeners["mutation-rejected"]) fn({ issues });
      },
      onHistoryApplied: (patches, step) => {
        this.select_changed_cells(patches);
        this.emit_selection();
        this.show_history_step(patches, step);
        this.render();
      },
      transactionResourceLimits: this.transaction_resource_limits,
      admitTransaction: (operations) => beginGridTransactionAdmission(this, operations),
      trustedResourceCallbacks: true,
    });
    registerGridDocument(this, this.document);
    this.lifetime.add(() => window.clearTimeout(this.flash_timer));
    registerEditDraft(this, {
      subscribe: (listener) => {
        this.edit_draft_listeners.add(listener);
        return () => this.edit_draft_listeners.delete(listener);
      },
      setText: (text, start, end) => this.interactions.setEditText(text, start, end),
      commit: () => this.interactions.commitEdit(),
      cancel: () => this.interactions.cancelEdit(),
    });

    // Headless hosts opt out of (or intercept) the stock key bindings once at
    // construction; the input controller consults this on every keydown.
    const keyboard_opt = opts.config?.keyboard ?? true;
    this.keyboard_policy =
      typeof keyboard_opt === "function"
        ? (e: KeyboardEvent) => keyboard_opt(e, this)
        : keyboard_opt;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.custom_renderers.set(name, r);
    }

    for (const [name, editor] of Object.entries(opts.editors ?? {})) {
      this.custom_editors.set(name, editor);
    }

    const sheet = this.sheet();
    this.max_element_height = measureMaxElementHeight();
    this.last_device_pixel_ratio = globalThis.devicePixelRatio ?? 1;

    this.geometry = new GeometryLayoutController(
      {
        sheet: () => this.sheet(),
        activeSheet: () => this.active_sheet,
        loadable: this.loadable,
        theme: () => this.theme,
        zoom: () => this.zoom,
        maxElementHeight: () => this.max_element_height,
      },
      host.clientHeight - this.tab_bar_height,
    );

    this.selection = new SelectionModel(sheet.rowCount, this.first_col(), this.last_col());

    this.datasource_controller = new DatasourceController(
      {
        datasource,
        columns: (sheet_id) => {
          const live_sheet = this.sheet_by_id(sheet_id);
          if (!live_sheet) throw unknownSheetError(sheet_id);
          return live_sheet.columns;
        },
        loadable: this.loadable,
        activeSheet: () => this.active_sheet,
        rowCount: (sheet_id) => this.sheet(sheet_id).rowCount,
        revision: () => this.store_epoch,
        isCellNewerThan: (address, revision) =>
          this.mutation_revisions.isNewerThan(address, revision),
        retainRevision: (revision) => this.mutation_revisions.retainRevision(revision),
        onRowsLoaded: () => {
          this.store_epoch += 1;
          this.window_content_revision += 1;
          this.schedule_render();
        },
        onError: (request, error) => {
          // Identifiers and numbers only: column keys are host text, and a wide
          // request can hold thousands of bands.
          const context = {
            protocol: request.protocol,
            sheet: request.sheet,
            start: request.start,
            end: request.end,
            revision: request.revision,
            columnBandCount: request.columns.length,
            columns: request.columns
              .slice(0, MAX_DATASOURCE_ERROR_COLUMN_BANDS)
              .map(({ start, end }) => ({ start, end })),
          };

          // The controller's own page checks carry this code without the
          // request, so they are wrapped once to add it; host failures with
          // another code keep their identity.
          const failure =
            isSheetwriteError(error) && error.code !== "datasource-request-failed"
              ? normalizeSheetwriteError(error, "datasource-request-failed", "datasource-request")
              : new SheetwriteError(
                  "datasource-request-failed",
                  "datasource-request",
                  error instanceof Error ? error.message : "Sheetwrite datasource-request failed",
                  { cause: error, context },
                );
          for (const fn of this.listeners["datasource-error"]) {
            fn({ request, error: failure });
          }
        },
      },
      sheet.rowCount,
    );

    this.search_controller = new SearchController({
      store: this.store,
      loadable: this.loadable,
      activeSheet: () => this.active_sheet,
      activateSheet: (sheet) => this.setActiveSheet(sheet),
      sheet: (id) => this.sheet(id),
      toViewRow: (data_row) => this.to_view_row(data_row),
      viewportAnchor: () =>
        this.geometry.viewportAnchor(
          this.geometry.toContent(this.scroller.scrollTop),
          this.scroller.scrollLeft,
        ),
      scrollToCell: (addr) => this.scrollToCell(addr),
      selectCell: (addr) => this.setSelection({ kind: "cell", addr }),
      setActiveCell: (addr) => {
        this.selection.setActiveCell(addr.row, addr.col);
        this.emit_selection();
        this.schedule_render();
      },
      selectionScope: () => this.find_scope(),
      scheduleRender: () => this.schedule_render(),
      emit: (result) => {
        for (const fn of this.listeners.search) fn(result);
      },
      readOnly: () => this.read_only,
      commit: (patches) => this.document.commit(patches, "replace"),
    });

    this.clipboard = new ClipboardController({
      lifetime: this.lifetime,
      store: this.store,
      selection: () => this.selection,
      hiddenActive: () => this.hidden_active,
      activeSheet: () => this.active_sheet,
      sheet: () => this.sheet(),
      colIndices: () => this.geometry.columnIndices,
      readOnly: () => this.read_only,
      mergeAnchorAt: (row, col) => this.merge_anchor_at(row, col),
      toDataRow: (view_row) => this.to_data_row(view_row),
      toViewRow: (data_row) => this.to_view_row(data_row),
      rowSpan: (first, last) => this.row_span(first, last),
      commit: (patches, reason) => this.document.commit(patches, reason),
      undo: () => this.undo(),
      redo: () => this.redo(),
      lastUndo: () => this.document.lastUndo,
      onCutChange: (range) => this.overlay_painter.setCutMark(range),
      loadPasteSpecial: () => import("./paste-special.js"),
      askPasteSpecial: (own_copy) =>
        this.open_dialog(import("./paste-special.js"), (special, host) =>
          special.pasteSpecialDialog(host, own_copy),
        ),
      sheetName: (sheet) => this.sheet_by_id(sheet)?.name,
      keepValidation: () => this.config?.paste?.keepValidation === true,
      onValidationRefused: (refused, warned) => {
        this.validation_refused_notice(refused, warned);
      },
      onPasteRefused: (reason) => {
        this.action_feedback.show(`Nothing was pasted: ${reason}`);
      },
      validationReads: () => storeEngine(this.store)?.validationReads,
      // Excel's cut moves, and its paste writes into, the rows a filter or
      // Hide Rows hides without a word; say so. Show them clears the filters
      // and shows the step's hidden rows, as one undo step.
      onHiddenRowsMoved: (count, step, spans) => {
        const rows = count === 1 ? "1 hidden row" : `${count} hidden rows`;
        // The rows are the sheet's that is active now; Show them acts on it
        // even after a switch to another sheet.
        const sheet_id = this.active_sheet;
        this.action_feedback.show(
          step === "cut"
            ? `This cut includes ${rows}.`
            : step === "paste"
              ? `This paste moved ${rows}.`
              : `This paste wrote into ${rows}. Paste Options › Paste into visible rows only skips them.`,
          {
            label: "Show them",
            run: () => {
              const sheet = this.sheet_by_id(sheet_id);
              if (!sheet) return;
              const shown = [...(sheet.hiddenRows ?? [])].filter((row) =>
                spans.some(({ start, end }) => row >= start && row <= end),
              );
              const patches = rowVisibilityPatches(sheet, shown, false);
              if ((sheet.filters?.length ?? 0) > 0) {
                patches.push({ op: "setSheetMeta", sheet: sheet.id, patch: { filters: [] } });
              }
              if (patches.length > 0) this.document.commit(patches, "structure");
            },
          },
        );
      },
    });

    this.style_deps = {
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.active_sheet,
      sheet: () => this.sheet(),
      readOnly: () => this.read_only,
      theme: () => this.theme,
      merges: () => this.sheet().merges ?? [],
      anchorCell: (row, col) => this.anchor_cell(row, col),
      toDataRow: (view_row) => this.to_data_row(view_row),
      commit: (patches) => this.document.commit(patches, "style"),
    };
    this.style_actions = new StyleActions(this.style_deps);
    this.dialog_host = {
      host: this.host,
      theme: () => this.base_theme,
      returnFocus: () => {
        if (!this.lifetime.closed) this.host.focus();
      },
      adopt: (close) => {
        this.dialogs.next().add(close);
      },
    };

    this.actions = this.build_actions();

    // host chrome: optional toolbar (top) + viewport (cells) + optional tab bar.
    host.classList.add("sheetwrite");
    checkStylePart(host, "grid", "The grid");
    host.style.position = host.style.position || "relative";
    host.style.overflow = "hidden";
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;
    // Said once, when the focus enters the grid: Tab stays inside it, so name the way out.
    if (!host.hasAttribute("aria-description")) {
      host.setAttribute("aria-description", GRID_EXIT_HINT);
      this.lifetime.add(() => host.removeAttribute("aria-description"));
    }
    this.action_feedback = attachActionFeedback(this, host, this.lifetime);

    const config = this.config;
    this.create_toolbar(config);

    this.viewport_el = document.createElement("div");
    this.viewport_el.className = "sheetwrite-viewport";
    this.viewport_el.style.cssText = `position:absolute;left:0;right:0;top:${this.toolbar_height}px;bottom:${this.tab_bar_height}px;`;
    host.appendChild(this.viewport_el);

    this.scroller = document.createElement("div");
    this.scroller.className = "sheetwrite-scroller";
    this.scroller.style.cssText = "position:absolute;inset:0;overflow:auto;will-change:transform;";
    this.sizer = document.createElement("div");
    this.sizer.className = "sheetwrite-sizer";
    this.scroller.appendChild(this.sizer);
    this.viewport_el.appendChild(this.scroller);

    // The side panel docks on the right edge, between the ribbon and the tab bar.
    this.panel_host = document.createElement("div");
    this.panel_host.className = "sheetwrite-panel-host";
    this.panel_host.hidden = true;
    this.panel_host.style.cssText = `position:absolute;right:0;width:${PANEL_WIDTH}px;top:${this.toolbar_height}px;bottom:${this.tab_bar_height}px;`;
    host.appendChild(this.panel_host);

    this.renderer = this.create_renderer(opts, this.viewport_el);
    this.renderer.setRenderers(this.custom_renderers);

    this.interactions = new InteractionSessions({
      host,
      scroller: this.scroller,
      viewportEl: this.viewport_el,
      grid: this,
      customEditors: this.custom_editors,
      highlightCells: (ranges) => this.highlightCells(ranges),
      columnHeader: (col) => this.column_header(col),
      toViewRow: (row) => this.to_view_row(row),
      editListeners: this.listeners,
      hiddenActive: () => this.hidden_active,
      nearestShownRow: (row, direction) => this.nearest_shown_row(row, direction),
      editActiveCell: (initial) => {
        for (const listener of this.edit_draft_listeners) {
          if (listener.edit?.(initial)) return true;
        }
        return false;
      },
      editDraft: {
        text: (value) => {
          for (const listener of this.edit_draft_listeners) listener.text(value);
        },
        end: () => {
          for (const listener of this.edit_draft_listeners) listener.end();
        },
      },
      openFind: (options) => this.open_find_bar(options),
      keyCommand: (command) => {
        if (command === "nextSheet" || command === "previousSheet" || command === "insertSheet")
          runSheetKey(this, command);
        else runCellCommand(this.cell_commands(), command);
      },
      openAutoFilter: (col) =>
        this.with_auto_filter_menu((filters, host) => filters.openAutoFilterMenu(host, col)),
      holdKey: (key) => this.command_loads > 0 && this.held_keys.push(key) > 0,
      autoComplete: () => this.config?.autoComplete !== false,
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.active_sheet,
      sheet: () => this.sheet(),
      theme: () => this.theme,
      colIndices: () => this.geometry.columnIndices,
      firstCol: () => this.first_col(),
      lastCol: () => this.last_col(),
      nextVisibleCol: (col, dir) => this.next_visible_col(col, dir),
      previousVisibleColumn: (col) => this.geometry.previousVisibleColumn(col),
      colAtX: (content_x) => this.col_at_x(content_x),
      rowAtOffset: (content_y) => this.geometry.rowAtOffset(content_y),
      rowCount: () => this.geometry.rowCount,
      contentTop: () => this.geometry.toContent(this.scroller.scrollTop),
      viewportH: () => this.viewport_h(),
      colLeftOf: (col) => this.col_left_of(col),
      rowTop: (row) => this.geometry.rowOffset(row),
      rowHeight: (row) => this.geometry.rowHeight(row),
      autoFitColumns: (cols) => this.autoFitColumns(cols),
      previewColumnWidth: (col, width) => {
        this.geometry.previewColumnWidth(col, width);
        this.apply_layout();
        this.schedule_render();
      },
      previewRowHeight: (row, height) => {
        this.geometry.previewRowHeight(row, height);
        this.sync_sizer();
        this.read_windows.invalidate();
        this.schedule_render();
      },
      clearResizePreview: () => {
        this.geometry.clearResizePreview();
        this.apply_layout();
        this.schedule_render();
      },
      dataEdge: (row, col, d_row, d_col) => this.dataEdge(row, col, d_row, d_col),
      keyboard: () => this.keyboard_policy,
      keymap: () => this.keymap,
      contentXAt: (viewport_x) => this.content_x_at(viewport_x),
      contentYAt: (viewport_y) => this.content_y_at(viewport_y),
      zoom: () => this.zoom,
      screenRect: (row, col, content_top, scroll_left) =>
        this.screen_rect(row, col, content_top, scroll_left),
      anchorCell: (row, col) => this.anchor_cell(row, col),
      toDataRow: (view_row) => this.to_data_row(view_row),
      rowSpan: (first, last) => this.row_span(first, last),
      clearSelection: () => this.clear_selection(),
      emitSelection: () => this.emit_selection(),
      scrollToCell: (addr) => this.scrollToCell(addr),
      activateHyperlink: (addr) => {
        try {
          return this.activateHyperlink(addr);
        } catch {
          return false;
        }
      },
      scheduleRender: () => this.schedule_render(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      copy: () => this.run_keyboard_clipboard(this.clipboard.copy()),
      cut: () => this.run_keyboard_clipboard(this.clipboard.cut()),
      paste: () => this.run_keyboard_clipboard(this.clipboard.paste()),
      pasteValues: () => this.run_keyboard_clipboard(this.clipboard.pasteValues()),
      // Ctrl+Alt+V opens Excel's Paste Special dialog.
      pasteSpecial: () => this.run_keyboard_clipboard(this.clipboard.pasteSpecial({ ask: true })),
      commit: (patches, reason) => this.document.commit(patches, reason),
      readOnly: () => this.read_only,
      onEditStart: () => {
        this.notes.hideCard();
        // As in Excel, a new edit ends the cut that waits for a paste.
        this.clipboard.cancelCut();
      },
      cancelCut: () => this.clipboard.cancelCut(),
      dialogs: this.dialog_host,
    });

    this.interactions.configureMenu(config, this.theme);

    this.notes = new NotePopover({
      host,
      scroller: this.scroller,
      theme: this.base_theme,
      cellAt: (client_x, client_y) => {
        // The row header column is not a cell, though hit-testing clamps it to the first one.
        const left = this.viewport_el.getBoundingClientRect().left;
        if (client_x - left < this.theme.rowHeaderWidth) return null;

        const cell = this.interactions.cellAtPointer(client_x, client_y);
        return cell ? this.note_cell(cell.row, cell.col) : null;
      },
      noteAt: (address) => this.getNote(address),
      cellRect: (cell) => this.cell_client_rect(cell.row, cell.col),
      editorLabel: (cell) => `Note for ${this.column_header(cell.col)}, row ${cell.row + 1}`,
      commit: (address, text) => this.setNote(address, text),
      returnFocus: () => this.host.focus(),
    });

    this.overlay_painter = new OverlayPainter(this.viewport_el, {
      theme: () => this.theme,
      activeSheet: () => this.active_sheet,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      rowOffsetOf: (row) => this.geometry.rowOffset(row),
      freeze: () => ({
        fr: this.frozen_row_count(),
        frozenH: this.frozen_height(),
        frozenW: this.frozen_width(),
        firstBodyCol: this.first_body_col(),
      }),
      zoom: () => this.zoom,
      colLeftOf: (col) => this.col_left_of(col),
      screenRect: (row, col, content_top, scroll_left) =>
        this.screen_rect(row, col, content_top, scroll_left),
      toViewRow: (data_row) => this.to_view_row(data_row),
      isEditing: () => this.interactions.isEditing,
      fillTarget: () => this.interactions.fillPreview,
      fillHandleScreen: (content_top, scroll_left) =>
        this.interactions.fillHandleScreen(content_top, scroll_left),
      fillTip: () => this.interactions.fillTip,
      fillValuesArea: () => this.interactions.fillValuesArea,
      fillValueAt: (row, col) => this.interactions.fillValueAt(row, col),
      rowAtOffset: (content_y) => this.geometry.rowAtOffset(content_y),
      autoFillTarget: () => this.interactions.autoFillTarget,
      openAutoFillOptions: (client_x, client_y) => {
        this.interactions.openAutoFillOptions(client_x, client_y);
      },
      icons: () => this.config?.icons,
      searchMatches: () => this.search_controller.matches,
      searchActive: () => this.search_controller.active,
      searchVersion: () => this.search_controller.version,
      geometryVersion: () => this.read_windows.geometryVersion,
      validationRuleAt: (row, col) => this.validation_rule_at(row, col),
      scheduleRender: () => this.schedule_render(),
    });

    this.dom_overlay = new DomOverlay(this.viewport_el, {
      host,
      geometry: this.geometry,
    });

    this.dom_overlay.setRenderers(this.custom_renderers);
    this.dom_overlay.setTheme(this.theme);

    this.object_layer = new ObjectLayer({
      viewport: this.viewport_el,
      scroller: this.scroller,
      store: this.store,
      geometry: this.geometry,
      activeSheet: () => this.active_sheet,
      charts: () => {
        // A dashboard draws its charts in its items, not over cells.
        const sheet = this.sheet_by_id(this.active_sheet);
        return isDashboard(sheet) ? [] : (sheet?.charts ?? []);
      },
      theme: () => this.theme,
      zoom: () => this.zoom,
      readOnly: () => this.read_only,
      setChart: (chart) => this.setChart(chart, this.active_sheet),
      removeChart: (id) => this.removeChart(id, this.active_sheet),
      focusGrid: () => this.host.focus(),
      onSelect: (chart) => {
        for (const fn of this.listeners["chart-select"]) fn(chart);
      },
      onActivate: (chart) => {
        for (const fn of this.listeners["chart-activate"]) fn(chart);
      },
      onContextMenu: (chart, client_x, client_y) =>
        this.interactions.openMenu(this.chart_menu_items(chart), client_x, client_y),
      isHistoryShortcut: (event) => {
        const action = this.keymap.action(event);
        return action === "undo" || action === "redo";
      },
    });

    this.object_layer.sync();
    // The grid emits no selection at construction; start from the real one so
    // the first re-emit (an undo, say) does not count as a move.
    this.last_selection_key = JSON.stringify(this.getSelection());

    this.aria_mirror = new AriaMirror({
      host,
      scroller: this.scroller,
      overlay: this.overlay_painter.element,
      viewport: this.viewport_el,
      rowCount: sheet.rowCount,
      colCount: this.geometry.columnIndices.length,
      readOnly: this.read_only,
      presentation: this.presentation,
      columnHeader: (col) => this.column_header(col),
      column: (col) => this.sheet().columns[col],
      focusCell: () => this.selection.focusCell,
      descriptionAt: (row, col) => this.cell_description(row, col),
      selection: () => this.selection.toSelection(this.active_sheet),
    });

    this.read_windows = new ReadWindowController({
      // Under a filter or hidden rows the headers show sheet row numbers, as in
      // Excel; a view sort keeps view positions, as rows have no order to keep.
      rowNumbers: (rows) => {
        if (!this.displayed_has_view || (this.sheet().sortKeys?.length ?? 0) > 0) return undefined;
        const numbers = new Uint32Array(Math.max(0, rows.end - rows.start));
        for (let index = 0; index < numbers.length; index++) {
          numbers[index] = this.to_data_row(rows.start + index) + 1;
        }
        return numbers;
      },
      // A filtered list's row numbers are blue in Excel.
      filteredRows: () => {
        const { autoFilter: auto_filter, filters } = this.sheet();
        return auto_filter && (filters?.length ?? 0) > 0 ? autoFilterBody(auto_filter) : undefined;
      },
      // Header text ends before the filter buttons, as in Excel.
      filterHeader: () => {
        const range = this.sheet().autoFilter?.range;
        const row = range ? this.to_view_row(range.start.row) : null;
        return range && row !== null
          ? { row, start: range.start.col, end: range.end.col }
          : undefined;
      },
      renderer: () => this.renderer,
      domOverlay: this.dom_overlay,
      overlayPainter: this.overlay_painter,
      ariaMirror: this.aria_mirror,
      geometry: this.geometry,
      datasource: this.datasource_controller,
      datasourceEnabled: Boolean(datasource),
      store: this.store,
      activeSheet: () => this.active_sheet,
      theme: () => this.theme,
      overscan: () => this.overscan,
      zoom: () => this.zoom,
      storeEpoch: () => this.window_content_revision,
      viewportHeight: () => this.viewport_h(),
      viewportWidth: () => this.viewport_el.clientWidth,
      datasourceColumnCount: () => this.sheet_by_id(this.active_sheet)?.columns.length ?? 0,
      scrollTop: () => this.scroller.scrollTop,
      scrollLeft: () => this.scroller.scrollLeft,
      scrollerWidth: () => this.scroller.clientWidth,
      scrollerHeight: () => this.scroller.clientHeight,
      repositionEditor: (content_top, scroll_left) =>
        this.reposition_editor(content_top, scroll_left),
      emitScroll: (event) => {
        for (const fn of this.listeners.scroll) fn(event);
      },
      onEngineTrap: (cause) => {
        this.on_engine_failed(stopEngine(cause, this.engine_generation));
      },
      previewWindow: () => this.format_preview,
    });

    if (this.tab_bar_height > 0) this.build_tab_bar();

    this.dispose_store = this.store.on("change", (event) => this.on_store_change(event));

    this.apply_layout();
    this.scroller.addEventListener("scroll", this.on_scroll, {
      passive: true,
      signal: this.lifetime.signal,
    });

    if (typeof ResizeObserver !== "undefined") {
      const resize_observer = new ResizeObserver(() => this.on_resize());
      resize_observer.observe(host);
      this.lifetime.add(() => resize_observer.disconnect());
    }

    this.arm_resolution_listener();
    this.attach_panels();
    // A host store built before an engine stop starts this grid read-only.
    if (this.engine_generation !== engineGeneration()) this.on_engine_failed(engineFailedError());
    this.render();
    // Registered last: a constructor that throws earlier leaves no listener
    // behind. A trap in the first paint reaches `on_engine_failed` through `onEngineTrap`.
    this.remove_engine_failure_listener = onEngineFailure((failure) =>
      this.on_engine_failed(failure),
    );
    // A failing add-on hook destroys this grid and rethrows.
    addons?.attach(this, opts.addons);
  }

  /**
   * The engine stopped. Its instance can be half-written, so this grid keeps
   * its last frame, refuses edits at once and never reads the store again.
   * The chrome update and the event run one microtask later, so host code
   * cannot replace the `engine-failed` error of the failing call.
   */
  private on_engine_failed(failure: SheetwriteError): void {
    if (this.lifetime.closed || this.engine_failure) return;

    this.engine_failure = failure;
    this.read_only = true;
    this.read_windows.freeze();
    // A microtask cannot be cancelled, so it reads the closed state instead.
    queueMicrotask(() => {
      if (this.lifetime.closed) return;

      try {
        this.sync_read_only_chrome(true);
      } finally {
        for (const fn of this.listeners["engine-failed"]) fn({ error: failure });
      }
    });
  }

  /** Listen for first use without fetching the panel chunk on ordinary grids. */
  private attach_panels(): void {
    if (this.presentation !== "spreadsheet") return;
    this.lifetime.add(attachPanelTriggers(this, this.config?.icons));
    const dashboard = attachDashboardView(this, this.viewport_el, () => this.read_only);
    this.dashboard_view = dashboard;
    this.lifetime.add(() => dashboard.dispose());
  }

  private refresh_source_presence(): void {
    const engine = storeEngine(this.store);
    this.source_sheet = this.active_sheet;
    if (!engine || engine.isPaged(this.active_sheet)) {
      this.sheet_has_sources = true;
      return;
    }
    const sources = engine.captureSheetSources(this.active_sheet);
    this.sheet_has_sources =
      !sources || sources.formulaOffsets.length > 0 || sources.referenceOffsets.length > 0;
  }

  /** Bring every grid part up to date with one committed store change. */
  private on_store_change(event: ChangeEvent): void {
    this.store_epoch += 1;
    this.cancel_auto_fit();
    this.mutation_revisions.record(event.transaction.patches, this.store_epoch);
    this.active_sheet_cache = null;
    this.clipboard.storeChanged(event);

    // Presence learned during this change describes the state after it, which
    // cannot vouch for cells it just stopped computing (e.g. a removed spill).
    const presence_known = this.source_sheet === this.active_sheet;
    const window_changed = this.transaction_affects_window(event.transaction.patches);
    if (window_changed) this.window_content_revision += 1;

    const effects = this.classify_patches(event.transaction.patches);
    const view_changed = (effects & VIEW_EFFECTS) !== 0;
    this.follow_session_sheets(event.transaction.patches);

    const had_view = this.displayed_has_view;
    this.displayed_has_view = this.loadable?.hasView(this.active_sheet) ?? false;
    if (effects & RESET_DATASOURCE) {
      this.datasource_controller.reset(this.sheet().rowCount);
      this.mutation_revisions.clear();
      this.displayed_hidden_rows = new Set(this.sheet().hiddenRows);
    }

    const change = effects & RESET_DATASOURCE ? "structure" : view_changed ? "view" : "value";
    this.interactions.reconcile(change);

    // A note edit holds a data address that a structure change moves; geometry
    // changes move the shown card away from its cell.
    if (change === "structure") this.notes.dismiss();
    else if (change === "view") this.notes.hideCard();

    if (effects & (REBUILD_ROWS | RECONCILE_VIEW)) this.rebuild_index();
    else if (effects & RESIZE_ROWS) this.resize_rows(event.transaction.patches);
    if (effects & REBUILD_COLUMNS) this.rebuild_column_index();
    if (effects & (REBUILD_COLUMNS | APPLY_LAYOUT)) this.apply_layout();
    if (effects & GEOMETRY_CHANGED) this.read_windows.invalidateData();
    this.search_controller.refreshAfterChange(
      event.transaction.patches,
      this.active_sheet,
      presence_known && !this.sheet_has_sources,
    );

    if (effects & RECONCILE_VIEW) {
      this.selection.setBounds(this.geometry.rowCount, this.first_col(), this.last_col());
      if (this.selection_keeps_through_filter(event.transaction.patches, had_view)) {
        // An AutoFilter hides only rows below its header, so a selection on
        // the header (where its button was pressed) or above stays, as in Excel;
        // so does any selection while no row was or is hidden.
        this.read_windows.invalidateData();
      } else {
        // Selection uses view-row positions: remote/history permutations must reset
        // it and scroll just like named actions, before change listeners run.
        this.selection.clear();
        this.emit_selection();
        this.scroller.scrollTop = 0;
        this.read_windows.noteViewportMoved();
        this.read_windows.invalidateData();
      }
    }

    // A filter cleared or changed: the hidden active cell is selected once its
    // row shows.
    const hidden = this.hidden_active;
    if (hidden && effects & RECONCILE_VIEW) {
      const row = this.to_view_row(hidden.row);
      if (row !== null) {
        const cell = { ...hidden, row };
        this.setSelection({ kind: "cell", addr: cell });
        this.scrollToCell(cell);
      }
    }

    if (effects & SHEETS_CHANGED) this.render_tabs();
    if (
      event.transaction.patches.some(
        (patch) => patch.op === "setNote" && patch.addr.sheet === this.active_sheet,
      )
    ) {
      this.aria_mirror.bumpVersion();
      this.notes.refresh();
    }

    // Chart edits, undo and sheet changes all arrive here.
    this.object_layer.sync();
    this.schedule_render();
    for (const fn of this.listeners.change) fn(event);
    this.queue_command_state_change();
  }

  /**
   * Effect bits a committed change requires of the active sheet's view. Row metadata
   * edits also update `displayed_hidden_rows`, whose difference from the store
   * decides whether the view must be rebuilt.
   */
  private classify_patches(patches: readonly DocumentOp[]): number {
    let effects = 0;

    for (const patch of patches) {
      if (changesSheetTabs(patch)) effects |= SHEETS_CHANGED;
      // A block move carries merged cells along.
      if (
        patch.op === "moveCells" &&
        (patch.range.sheet === this.active_sheet || patch.to.sheet === this.active_sheet)
      ) {
        effects |= APPLY_LAYOUT;
      }
      if (!("sheet" in patch) || patch.sheet !== this.active_sheet) continue;

      if (!annotates_sheet(patch)) effects |= GEOMETRY_CHANGED;

      if (
        patch.op === "setSheetMeta" &&
        (patch.patch.sortKeys !== undefined ||
          patch.patch.filters !== undefined ||
          patch.patch.autoFilter !== undefined ||
          patch.patch.rowGroups !== undefined)
      ) {
        effects |= RECONCILE_VIEW;
      } else if (patch.op === "setRowMeta") {
        const hidden = this.sheet().hiddenRows?.has(patch.row) ?? false;
        if (hidden !== this.displayed_hidden_rows.has(patch.row)) effects |= RECONCILE_VIEW;
        if (hidden) this.displayed_hidden_rows.add(patch.row);
        else this.displayed_hidden_rows.delete(patch.row);
      }

      if (changes_sheet_structure(patch)) {
        effects |= RESET_DATASOURCE;
        // Structure edits can clear query state as well as shift columns/rows.
        // Keep the previous view state: the store has already removed that query.
        if (
          (effects & RECONCILE_VIEW) === 0 &&
          (this.displayed_has_view || (this.loadable?.hasView(this.active_sheet) ?? false))
        ) {
          effects |= RECONCILE_VIEW;
        }
      }

      if (
        patch.op === "addRows" ||
        patch.op === "removeRows" ||
        patch.op === "moveRows" ||
        (patch.op === "setSheetMeta" && patch.patch.rowGroups !== undefined)
      ) {
        effects |= REBUILD_ROWS;
      } else if (patch.op === "setRowMeta") {
        effects |= RESIZE_ROWS;
      } else if (
        patch.op === "addColumns" ||
        patch.op === "removeColumns" ||
        patch.op === "moveColumns" ||
        (patch.op === "setColumn" && ("width" in patch.patch || "visible" in patch.patch))
      ) {
        effects |= REBUILD_COLUMNS;
      }

      if (patch.op === "addMerge" || patch.op === "removeMerge" || patch.op === "setSheetMeta") {
        effects |= APPLY_LAYOUT;
      }
    }

    return effects;
  }

  /**
   * Replay sheet adds, removals, moves and visibility changes on the session's
   * sheet list, so the active sheet moves to the neighbour a user would expect.
   */
  private follow_session_sheets(patches: readonly DocumentOp[]): void {
    const session_sheets = this.session_sheets.map((sheet) => ({ ...sheet }));
    let session_active = this.active_sheet;

    for (const patch of patches) {
      if (patch.op === "addSheet") {
        session_sheets.splice(patch.sheet.order, 0, {
          id: patch.sheet.id,
          visibility: patch.sheet.visibility,
        });
      } else if (patch.op === "removeSheet") {
        const index = session_sheets.findIndex((sheet) => sheet.id === patch.sheet);
        if (index < 0) continue;

        session_sheets.splice(index, 1);
        if (session_active === patch.sheet) {
          session_active =
            visibleSheetNeighbor(session_sheets, patch.sheet, index) ?? session_active;
        }
      } else if (patch.op === "moveSheet") {
        const index = session_sheets.findIndex((sheet) => sheet.id === patch.sheet);
        const [sheet] = index >= 0 ? session_sheets.splice(index, 1) : [];
        if (sheet) session_sheets.splice(patch.to, 0, sheet);
      } else if (patch.op === "setSheetVisibility") {
        const sheet = session_sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet) continue;

        sheet.visibility = patch.visibility;
        if (session_active === patch.sheet && patch.visibility !== "visible") {
          session_active = visibleSheetNeighbor(session_sheets, patch.sheet) ?? session_active;
        }
      }
    }

    const sheets = this.store.getWorkbook().sheets;
    session_active = resolveActiveSheet(sheets, session_active);

    if (session_active !== this.active_sheet) this.setActiveSheet(session_active);
    this.session_sheets = sheets.map(({ id, visibility }) => ({ id, visibility }));
  }

  private transaction_affects_window(patches: readonly DocumentOp[]): boolean {
    // The handler runs before a removed or hidden active sheet is replaced, so
    // the old sheet may be gone; the sheet switch repaints everything anyway.
    const sheet = this.sheet_by_id(this.active_sheet);
    if (!sheet) return true;
    // Presence is read after the first change on each sheet, so that change may
    // have removed the last formula (and its spill); repaint it conservatively.
    if (this.source_sheet !== this.active_sheet) {
      this.refresh_source_presence();
      return true;
    }

    let affects_window = false;
    const engine = storeEngine(this.store);
    // A source-free active sheet cannot receive computed values from another
    // cell or sheet. Formula/ref presence is sticky until a sheet switch, so
    // removing a spill anchor still refreshes its former children. Unknown
    // stores, paged loads, conditional formats, validation and merge anchors
    // stay conservative: their displayed result may depend on off-window data.
    const dependent_display = Boolean(
      this.sheet_has_sources ||
      !engine ||
      engine.isPaged(this.active_sheet) ||
      sheet.conditionalFormats?.length ||
      sheet.validationRules?.length ||
      sheet.merges?.length ||
      sheet.pivots?.length,
    );
    let painted: PaintedCells | null = null;
    for (const patch of patches) {
      let range: Range | CellAddress;
      switch (patch.op) {
        case "set":
          if (
            patch.addr.sheet === this.active_sheet &&
            (patch.value.kind === "formula" || patch.value.kind === "ref")
          )
            this.sheet_has_sources = true;
          range = patch.addr;
          break;

        case "setRange":
          if (
            patch.range.sheet === this.active_sheet &&
            patch.cells.some((cell) => cell.value.kind === "formula" || cell.value.kind === "ref")
          )
            this.sheet_has_sources = true;
          range = patch.range;
          break;

        case "setBlock":
          if (
            patch.range.sheet === this.active_sheet &&
            (patch.block.formulas?.length || patch.block.refs?.length)
          )
            this.sheet_has_sources = true;
          range = patch.range;
          break;

        case "restoreBlock":
          if (patch.range.sheet === this.active_sheet) this.sheet_has_sources = true;
          range = patch.range;
          break;

        case "setRangeStyle":
        case "clearRange":
        case "permuteRows":
          range = patch.range;
          break;

        case "setNote":
          continue;

        default:
          affects_window = true;
          continue;
      }

      if (affects_window || dependent_display || this.sheet_has_sources) {
        affects_window = true;
        continue;
      }

      // Large off-screen batches pay for one window snapshot, not one per patch.
      painted ??= this.read_windows.paintedCells();
      affects_window =
        "start" in range
          ? painted.intersects(range.sheet, range.start, range.end)
          : painted.intersects(range.sheet, range, range);
    }

    return affects_window;
  }

  private create_renderer(opts: GridOptions, host: HTMLElement): Renderer {
    if (opts.renderer === "worker") {
      try {
        let worker: WorkerRenderer;
        worker = new WorkerRenderer(opts.workerUrl, {}, (error) => {
          this.fallback_worker_renderer(worker, error);
        });
        worker.mount(host, this.theme);
        this.active_renderer_kind = "worker";
        return worker;
      } catch (error) {
        // Worker unavailable (no OffscreenCanvas / construction blocked) —
        // fall back observably after post-construction subscribers can attach.
        this.emit_renderer_fallback(error);
      }
    }
    const canvas = new CanvasRenderer();
    canvas.mount(host, this.theme);
    this.active_renderer_kind = "canvas";
    return canvas;
  }

  private fallback_worker_renderer(worker: WorkerRenderer, error: unknown): void {
    if (
      this.lifetime.closed ||
      this.renderer !== worker ||
      this.active_renderer_kind !== "worker"
    ) {
      return;
    }

    worker.destroy();
    const canvas = new CanvasRenderer();
    canvas.mount(this.viewport_el, this.theme);
    canvas.setRenderers(this.custom_renderers);
    this.renderer = canvas;
    this.active_renderer_kind = "canvas";
    this.apply_layout();
    this.schedule_render();
    this.emit_renderer_fallback(error);
  }

  private emit_renderer_fallback(error: unknown): void {
    const failure = normalizeSheetwriteError(error, "renderer-fallback", "renderer-worker", {
      requested: "worker",
    });
    queueMicrotask(() => {
      if (this.lifetime.closed) return;
      for (const fn of this.listeners["renderer-fallback"]) {
        fn({ requested: "worker", error: failure });
      }
    });
  }

  rendererKind(): "canvas" | "worker" {
    return this.active_renderer_kind;
  }

  private sheet(id: SheetId = this.active_sheet): Sheet {
    if (id === this.active_sheet && this.active_sheet_cache) return this.active_sheet_cache;

    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === id);
    if (!stored) throw unknownSheetError(id);
    let target = this.virtual_column_targets.get(id);
    if (target === undefined) {
      target = Math.max(
        stored.columns.length,
        pad_target(this.host, this.min_columns, this.presentation),
      );
      this.virtual_column_targets.set(id, target);
    }

    const sheet =
      target > stored.columns.length ? { ...stored, columns: [...stored.columns] } : stored;
    if (sheet !== stored) append_pad_columns(sheet.columns, target);
    if (id === this.active_sheet) this.active_sheet_cache = sheet;
    return sheet;
  }

  private sheet_by_id(id: SheetId): Sheet | null {
    return this.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }

  private viewport_h(): number {
    return this.viewport_el.clientHeight;
  }

  private build_tab_bar(): void {
    const bar = document.createElement("div");
    bar.className = "sheetwrite-tabbar";
    // Positioning is behavior (the bar reserves this.tabBarHeight in the host
    // layout); everything cosmetic lives in styles.css behind CSS custom
    // properties seeded from the theme, so host CSS can restyle freely.
    bar.style.position = "absolute";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.bottom = "0";
    bar.style.height = `${this.tab_bar_height}px`;
    this.host.appendChild(bar);
    this.tab_bar = bar;
    this.sheet_tabs = new SheetTabs(bar, {
      onActivate: (id) => this.setActiveSheet(id),
      focusSheet: () => this.host.focus({ preventScroll: true }),
      onAdd: (index) => insertSheet(this, index),
      onRemove: (id) => this.removeSheet(id),
      onRename: (id, name) => this.renameSheet(id, name),
      onMove: (id, to_index) => this.moveSheet(id, to_index),
      onCommand: (command, id) =>
        this.load_command(import("./sheet-tab-panels.js"), ({ openTabPanel: open_tab_panel }) => {
          if (this.sheet_tabs) open_tab_panel(this, this.sheet_tabs, command, id);
        }),
      onHide: (id) => this.setSheetVisibility(id, "hidden"),
      onUnhide: (id) => this.setSheetVisibility(id, "visible"),
      readOnly: this.read_only,
      icons: () => this.config?.icons,
    });
    this.sync_tab_bar_theme();
    this.render_tabs();
  }

  /** Re-seed the tab bar's CSS custom properties from the (base) theme. */
  private sync_tab_bar_theme(): void {
    const bar = this.tab_bar;
    if (!bar) return;
    bar.style.setProperty("--sheetwrite-tab-font", tabBarFont(this.base_theme.font));
    bar.style.setProperty("--sheetwrite-tab-bg", this.base_theme.bg);
    bar.style.setProperty("--sheetwrite-tab-fg", this.base_theme.headerFg);
    bar.style.setProperty("--sheetwrite-tab-border", this.base_theme.gridLine);
    bar.style.setProperty("--sheetwrite-tab-hover-bg", this.base_theme.headerBg);
    bar.style.setProperty("--sheetwrite-tab-active-bg", this.base_theme.selection);
    bar.style.setProperty("--sheetwrite-tab-active-fg", this.base_theme.selectionBorder);
  }

  private render_tabs(): void {
    this.sheet_tabs?.update(this.store.getWorkbook().sheets, this.active_sheet);
  }

  private first_col(): number {
    return this.geometry.firstColumn();
  }

  private last_col(): number {
    return this.geometry.lastColumn();
  }

  private col_left_of(col: number): number {
    return this.geometry.columnLeft(col);
  }

  private col_at_x(content_x: number): number {
    return this.geometry.columnAtX(content_x);
  }

  private next_visible_col(col: number, dir: 1 | -1): number {
    return this.geometry.nextVisibleColumn(col, dir);
  }

  private frozen_row_count(): number {
    return this.geometry.frozenRowCount();
  }

  private frozen_col_count(): number {
    return this.geometry.frozenColumnCount();
  }

  private frozen_height(): number {
    return this.geometry.frozenHeight();
  }

  private frozen_width(): number {
    return this.geometry.frozenWidth();
  }

  /** View `row`, `col` in client coordinates, a merge's whole area for its cells. */
  private cell_client_rect(
    row: number,
    col: number,
  ): { left: number; top: number; right: number; bottom: number } {
    const viewport = this.viewport_el.getBoundingClientRect();
    const rect = this.screen_rect(
      row,
      col,
      this.geometry.toContent(this.scroller.scrollTop),
      this.scroller.scrollLeft,
    );
    const left = viewport.left + rect.x;
    const top = viewport.top + rect.y;
    return { left, top, right: left + rect.w, bottom: top + rect.h };
  }

  private first_body_col(): number {
    return this.geometry.firstBodyColumn();
  }

  private screen_rect(
    row: number,
    col: number,
    content_top: number,
    scroll_left: number,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    const merge = this.merge_anchor_at(row, col);
    return this.geometry.rangeRect(
      {
        sheet: this.active_sheet,
        start: { row: merge?.r0 ?? row, col: merge?.c0 ?? col },
        end: { row: merge?.r1 ?? row, col: merge?.c1 ?? col },
      },
      content_top,
      scroll_left,
    );
  }

  private content_x_at(viewport_x: number): number {
    const content_x = viewport_x - this.theme.rowHeaderWidth;
    const frozen = this.frozen_col_count() > 0 && content_x < this.frozen_width();
    return frozen ? content_x : content_x + this.scroller.scrollLeft;
  }

  private content_y_at(viewport_y: number): number {
    return this.geometry.pointerContentY(viewport_y, this.scroller.scrollTop);
  }

  private column_header(col: number): string {
    if (this.presentation === "spreadsheet") return colToA1(col);
    const column = this.sheet().columns[col];
    return (
      column?.header ||
      (column?.key.startsWith("__pad_") ? colToA1(col) : column?.key) ||
      colToA1(col)
    );
  }

  private apply_layout(): void {
    this.read_windows.invalidate();
    const sheet = this.sheet();
    const columns = sheet.columns.map((column, c) => ({
      ...column,
      header: column.visible === false ? "" : this.column_header(c),
      // Paint geometry is zoomed to match the column index; base widths stay
      // untouched on the workbook.
      width: column.visible === false ? 0 : this.geometry.columnWidth(c) * this.zoom,
    }));
    const dom_renderer_columns = new Uint8Array(columns.length);
    for (let col = 0; col < columns.length; col++) {
      const renderer_name = columns[col]?.renderer;
      if (renderer_name && this.custom_renderers.get(renderer_name)?.dom) {
        dom_renderer_columns[col] = 1;
      }
    }
    const layout = {
      columns,
      rowHeight: this.theme.rowHeight,
      headerHeight: this.theme.headerHeight,
      totalRows: this.geometry.rowCount,
      zoom: this.zoom,
      merges: this.loadable?.hasView(this.active_sheet) ? [] : (sheet.merges ?? []),

      domRendererColumns: dom_renderer_columns,
    };
    this.renderer.setLayout(layout);
    this.dom_overlay.setLayout(layout);
    this.selection.setBounds(this.geometry.rowCount, this.first_col(), this.last_col());
    this.sync_sizer();
  }

  private sync_sizer(): void {
    // Browser zoom moves the layout clamp; a stale cap truncates tall documents.
    const device_pixel_ratio = globalThis.devicePixelRatio ?? 1;
    if (device_pixel_ratio !== this.last_device_pixel_ratio) {
      this.last_device_pixel_ratio = device_pixel_ratio;
      this.max_element_height = measureMaxElementHeight();
    }
    // The scroller's client area leaves out classic scrollbars; the room a
    // scroll into view needs past the last column and row depends on it.
    const size = this.geometry.layoutSize(
      this.viewport_h(),
      this.scroller.clientWidth,
      this.scroller.clientHeight,
    );
    this.sizer.style.width = `${size.width}px`;
    this.sizer.style.height = `${size.height}px`;
    // A new size can add or drop a classic scrollbar, which resizes the scroller.
    this.read_windows.noteViewportMoved();
  }

  /** The gutter tracks the active sheet's digit count; identity when unchanged. */
  private with_adaptive_gutter(theme: Theme, row_count: number): Theme {
    const row_header_width = adaptive_row_header_width(theme, row_count);
    return row_header_width === theme.rowHeaderWidth
      ? theme
      : { ...theme, rowHeaderWidth: row_header_width };
  }

  private rebuild_index(): void {
    this.geometry.rebuildRows(
      this.loadable?.viewRowCount(this.active_sheet) ?? this.sheet().rowCount,
    );
    this.datasource_controller.resize(this.sheet().rowCount);
    // Row-count changes can grow the row-number gutter (e.g. crossing 1M rows).
    const adjusted = this.with_adaptive_gutter(this.theme, this.sheet().rowCount);
    if (adjusted !== this.theme) {
      this.theme = adjusted;
      this.renderer.setTheme(this.theme);
      this.dom_overlay.setTheme(this.theme);
    }
    this.sync_sizer();
  }

  /** Give the row index the committed heights of a change that only resized rows. */
  private resize_rows(patches: readonly DocumentOp[]): void {
    const rows: number[] = [];
    for (const patch of patches) {
      if (patch.op === "setRowMeta" && patch.sheet === this.active_sheet) rows.push(patch.row);
    }
    this.geometry.updateRowHeights(rows);
    this.sync_sizer();
  }

  private rebuild_column_index(): void {
    this.geometry.rebuildColumns();
    this.read_windows.invalidateColumns();
    this.aria_mirror?.setColumnCount(this.geometry.columnIndices.length);
  }

  private to_data_row(view_row: number): number {
    return this.geometry.toDataRow(view_row);
  }

  private to_view_row(data_row: number): number | null {
    return this.geometry.toViewRow(data_row);
  }

  /**
   * The data rows that view rows `first` to `last` span, with the rows hidden
   * by hand (Hide Rows or a collapsed group) between them, as Excel's copy and
   * fill take them. Null when a sort orders the view or a filter hides a row
   * between them: then only the rows the view shows count, as in Excel.
   */
  private row_span(first: number, last: number): { first: number; last: number } | null {
    const sheet = this.sheet();
    if ((sheet.sortKeys?.length ?? 0) > 0) return null;
    const start = this.to_data_row(first);
    const end = this.to_data_row(last);
    const gaps = end - start - (last - first);
    if (gaps === 0) return { first: start, last: end };
    const hidden = new Set<number>();
    for (const row of sheet.hiddenRows ?? []) {
      if (row > start && row < end) hidden.add(row);
    }
    for (const group of sheet.rowGroups ?? []) {
      if (!group.collapsed) continue;
      for (let row = Math.max(group.start, start + 1); row <= Math.min(group.end, end - 1); row++) {
        hidden.add(row);
      }
    }
    return hidden.size === gaps ? { first: start, last: end } : null;
  }

  /**
   * Select the cells that `patches` change and scroll to them, as Excel's
   * undo and redo do. When they change no cell of the active sheet, the
   * sheet of the first changed cell becomes active first, so the change is
   * never out of sight. Row, column and object edits leave the selection
   * alone.
   */
  private select_changed_cells(patches: readonly DocumentOp[]): void {
    let target: SheetId | null = null;
    for (const patch of patches) {
      const sheet = changed_cells(patch)?.sheet;
      if (sheet === this.active_sheet) {
        target = sheet;
        break;
      }
      target ??= sheet ?? null;
    }
    if (target === null) return;
    // A hidden sheet cannot become active, so its change stays out of view.
    if (target !== this.active_sheet) this.setActiveSheet(target);
    if (target !== this.active_sheet) return;

    let top = Number.POSITIVE_INFINITY;
    let left = Number.POSITIVE_INFINITY;
    let bottom = -1;
    let right = -1;
    for (const patch of patches) {
      const range = changed_cells(patch);
      if (range?.sheet !== target) continue;
      const first = this.to_view_row(range.start.row);
      const last = this.to_view_row(range.end.row);
      if (first === null || last === null) continue;
      top = Math.min(top, first, last);
      bottom = Math.max(bottom, first, last);
      left = Math.min(left, range.start.col, range.end.col);
      right = Math.max(right, range.start.col, range.end.col);
    }
    if (bottom < 0) return;

    const sheet = this.active_sheet;
    const start = { row: top, col: left };
    this.selection.set(
      top === bottom && left === right
        ? { kind: "cell", addr: { sheet, ...start } }
        : { kind: "range", range: { sheet, start, end: { row: bottom, col: right } } },
    );
    this.scrollToCell({ sheet, ...start });
  }

  /**
   * After an undo or redo, tint the cells it changed on the active sheet for
   * a moment and report the step with `history-step`, so the user sees what
   * changed and what the step was, even over many cells.
   */
  private show_history_step(
    patches: readonly DocumentOp[],
    step: { readonly direction: "undo" | "redo"; readonly name: string },
  ): void {
    const sheet = this.active_sheet;
    const flash: Range[] = [];
    let top = Number.POSITIVE_INFINITY;
    let left = Number.POSITIVE_INFINITY;
    let bottom = -1;
    let right = -1;
    for (const patch of patches) {
      const range = changed_cells(patch);
      if (range?.sheet !== sheet) continue;
      if (flash.length < FLASH_RANGES) flash.push(range);
      top = Math.min(top, range.start.row, range.end.row);
      bottom = Math.max(bottom, range.start.row, range.end.row);
      left = Math.min(left, range.start.col, range.end.col);
      right = Math.max(right, range.start.col, range.end.col);
    }

    window.clearTimeout(this.flash_timer);
    this.overlay_painter.setFlash(flash);
    if (flash.length > 0) {
      this.flash_timer = window.setTimeout(() => this.overlay_painter.setFlash([]), FLASH_MS);
    }

    const range =
      bottom < 0
        ? null
        : { sheet, start: { row: top, col: left }, end: { row: bottom, col: right } };
    for (const fn of this.listeners["history-step"]) {
      fn({ direction: step.direction, step: step.name, range });
    }
  }

  private merge_anchor_at(row: number, col: number): SelRect | null {
    if (this.loadable?.hasView(this.active_sheet)) return null;

    const merges = this.sheet().merges;
    if (!merges) return null;

    return mergeAnchorAt(prepareMergeIndex(merges), row, col);
  }

  private anchor_cell(row: number, col: number): CellRef {
    const merge = this.merge_anchor_at(row, col);
    return merge ? { row: merge.r0, col: merge.c0 } : { row, col };
  }

  /**
   * What a screen reader hears after the cell at view `row`, `col`: its note,
   * and the input message of its validation rule, which Excel shows beside it.
   * The mirror asks for each cell it shows whenever its window moves, so a
   * sheet without notes or rules answers at once, and a cell without both
   * builds no list.
   */
  private cell_description(row: number, col: number): string | null {
    if (
      !this.sheet_by_id(this.active_sheet)?.notes?.length &&
      !this.sheet().validationRules?.length
    ) {
      return null;
    }
    const note = this.getNote({ sheet: this.active_sheet, row: this.to_data_row(row), col });
    const rule = this.validation_rule_at(row, col);
    const input =
      rule && hasInputMessage(rule)
        ? [rule.inputTitle, rule.inputMessage].filter(Boolean).join(": ")
        : "";
    if (!note) return input || null;
    return input ? `Note: ${note}. ${input}` : `Note: ${note}`;
  }

  /**
   * The status notice after a paste that kept the target's validation rules
   * (`paste.keepValidation`): the cells whose values it refused, and those it
   * pasted against a `warn` rule, with a button that selects them.
   */
  private validation_refused_notice(
    refused: readonly CellAddress[],
    warned: readonly CellAddress[],
  ): void {
    const SHOWN = 3;
    const named = (cells: readonly CellAddress[], what: string): string => {
      const names = cells.slice(0, SHOWN).map((cell) => cellA1(cell.row, cell.col));
      const more = cells.length > SHOWN ? ` and ${cells.length - SHOWN} more` : "";
      return `${cells.length} ${cells.length === 1 ? "cell" : "cells"} ${what}: ${names.join(", ")}${more}.`;
    };
    const parts = [
      ...(refused.length > 0 ? [named(refused, "refused")] : []),
      ...(warned.length > 0 ? [named(warned, "outside the rules")] : []),
    ];
    const cells = [...refused, ...warned];
    const ranges = cells.map(({ sheet, row, col }) => ({
      sheet,
      start: { row, col },
      end: { row, col },
    }));
    this.action_feedback.show(parts.join(" "), {
      label: "Select them",
      run: () => this.setSelection({ kind: "multi", ranges }),
    });
  }

  /** The validation rule over the cell at view `row`, `col`, if any; a merge answers for its anchor. */
  private validation_rule_at(row: number, col: number): DataValidationRule | undefined {
    const rules = this.sheet().validationRules;
    if (!rules?.length) return undefined;
    const cell = this.anchor_cell(row, col);
    const addr = { sheet: this.active_sheet, row: this.to_data_row(cell.row), col: cell.col };
    return rules.find((rule) => rangeContains(rule.range, addr));
  }

  /**
   * The selected rectangles when they hold more than one cell: Excel's Find
   * and Replace search only those. One cell, or one merged cell, gives null.
   */
  private find_scope(): SelRect[] | null {
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push({ ...rect }));
    const [first] = rects;
    if (first === undefined) return null;
    if (rects.length > 1) return rects;

    const cell = this.merge_anchor_at(first.r0, first.c0) ?? {
      ...first,
      r1: first.r0,
      c1: first.c0,
    };
    const is_one_cell =
      cell.r0 === first.r0 && cell.c0 === first.c0 && cell.r1 === first.r1 && cell.c1 === first.c1;
    return is_one_cell ? null : rects;
  }

  private schedule_render(): void {
    this.read_windows.schedule();
  }

  private render(): void {
    this.read_windows.renderNow();
  }

  private reposition_editor(content_top: number, scroll_left: number): void {
    this.interactions.reposition(content_top, scroll_left);
    this.notes.reposition();
    this.object_layer.place(content_top, scroll_left);
  }

  /** A view cell, resolved to its merge anchor, with the data address its note lives at. */
  private note_cell(row: number, col: number): NoteCell {
    const anchor = this.anchor_cell(row, col);
    return {
      row: anchor.row,
      col: anchor.col,
      address: { sheet: this.active_sheet, row: this.to_data_row(anchor.row), col: anchor.col },
    };
  }

  beginEdit(row: number, col: number, initial?: string, selectAll = false): void {
    this.interactions.beginEdit(row, col, initial, selectAll);
  }

  /**
   * Delete and Clear Contents: the selected cells' values and formulas go,
   * and their formats stay, as Excel's Delete does. In a merge, its first
   * cell is cleared.
   */
  private clear_selection(): void {
    // Delete on a hidden active cell clears it, as in Excel.
    const hidden = this.hidden_active;
    if (hidden) {
      if (this.read_only) return;
      const cell = { row: hidden.row, col: hidden.col };
      this.document.commit(
        [
          {
            op: "clearRange",
            range: { sheet: hidden.sheet, start: cell, end: cell },
            style: false,
          },
        ],
        "clear",
      );
      return;
    }
    if (this.read_only || this.selection.isEmpty) return;

    const sheet = this.sheet();
    const patches: DocumentOp[] = [];
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push(rect));
    const merges = sheet.merges;
    const merge_index = merges ? prepareMergeIndex(merges) : null;
    const intersects_merge =
      merge_index !== null &&
      rects.some(
        (rect) =>
          intersectingMerges(merge_index, rect.r0, rect.r1 + 1, [rect.c0, rect.c1]).length > 0,
      );
    if (!intersects_merge) {
      for (const rect of rects) {
        let run_start = this.to_data_row(rect.r0);
        let previous = run_start;
        for (let view_row = rect.r0 + 1; view_row <= rect.r1 + 1; view_row++) {
          const data_row = view_row <= rect.r1 ? this.to_data_row(view_row) : -1;
          if (view_row <= rect.r1 && Math.abs(data_row - previous) === 1) {
            previous = data_row;
            continue;
          }

          patches.push({
            op: "clearRange",
            range: {
              sheet: this.active_sheet,
              start: { row: run_start, col: rect.c0 },
              end: { row: previous, col: rect.c1 },
            },
            style: false,
          });

          run_start = data_row;
          previous = data_row;
        }
      }
    } else {
      const seen = new Set<number>();
      for (const rect of rects) {
        for (let r = rect.r0; r <= rect.r1; r++) {
          for (let c = rect.c0; c <= rect.c1; c++) {
            const cell = this.anchor_cell(r, c);
            const key = cell.row * sheet.columns.length + cell.col;
            if (seen.has(key)) continue;
            seen.add(key);
            const addr = { row: this.to_data_row(cell.row), col: cell.col };
            patches.push({
              op: "clearRange",
              range: { sheet: this.active_sheet, start: addr, end: addr },
              style: false,
            });
          }
        }
      }
    }

    this.document.commit(patches, "clear");
  }

  private emit_selection(): void {
    this.aria_mirror.bumpVersion();
    const selection = this.getSelection();

    // One thing is selected at a time: a new cell selection, by any route,
    // deselects the chart. Undo re-emits an unchanged selection and must keep it.
    const selection_key = JSON.stringify(selection);
    if (selection_key !== this.last_selection_key) {
      this.last_selection_key = selection_key;
      this.object_layer.select(null);
    }

    const focus = this.selection.focusCell;
    // A selected cell ends a hidden active cell.
    if (focus) this.hidden_active = null;
    const sheet_focus = focus
      ? { sheet: this.active_sheet, row: this.to_data_row(focus.row), col: focus.col }
      : this.hidden_active && { ...this.hidden_active };
    for (const listener of this.listeners.selection)
      listener({ selection, sheetFocus: sheet_focus });
    this.emit_command_state_change();
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    return this.search_controller.search(query, opts);
  }

  findNext(): SearchResult {
    return this.search_controller.findNext();
  }

  findPrev(): SearchResult {
    return this.search_controller.findPrev();
  }

  selectMatch(index: number): SearchResult {
    return this.search_controller.selectMatch(index);
  }

  clearSearch(): void {
    this.search_controller.clearSearch();
  }

  replaceCurrent(replacement: string): SearchResult {
    return this.search_controller.replaceCurrent(replacement);
  }

  replaceAll(replacement: string): ReplaceResult {
    return this.search_controller.replaceAll(replacement);
  }

  previewReplaceAll(replacement: string, limit?: number): ReplacePreview {
    return this.search_controller.previewReplaceAll(replacement, limit);
  }

  getShortcutLabel(action: KeyboardAction): string {
    return this.keymap.label(action);
  }

  /** The panel's code is a chunk of its own, loaded on first use. */
  openKeyboardSettings(): void {
    if (!this.config?.keyboardSettings || this.lifetime.closed) return;
    const opener = this.host.ownerDocument.activeElement;
    this.load_command(
      import("./keyboard-settings.js"),
      ({ openKeyboardSettings: open_keyboard_settings }) => {
        if (this.lifetime.closed) return;
        open_keyboard_settings({
          grid: this,
          dialogs: this.dialog_host,
          opener,
          config: () => this.config,
          changed: (bindings) => {
            for (const fn of this.listeners["key-bindings-change"]) fn({ bindings });
          },
        });
      },
    );
  }

  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void {
    this.overlay_painter.highlightCells(ranges, color);
  }

  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void {
    this.overlay_painter.setPresenceOverlays(overlays);
  }

  styleRange(range: Range, style: Partial<CellStyle> | null): void {
    if (this.read_only) return;

    this.document.commit(
      [
        {
          op: "setRangeStyle",
          range: {
            sheet: range.sheet,
            start: {
              row: Math.min(range.start.row, range.end.row),
              col: Math.min(range.start.col, range.end.col),
            },
            end: {
              row: Math.max(range.start.row, range.end.row),
              col: Math.max(range.start.col, range.end.col),
            },
          },
          style,
        },
      ],
      "style",
    );
  }

  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null {
    // View-aware in the store: with an active sort/filter view, `row` is a
    // view position and vertical moves return view positions.
    if (!this.loadable) return null;
    return this.loadable.dataEdge(this.active_sheet, row, col, dRow, dCol);
  }

  /** The one detached 2D context that auto-fit measures text with; `trimMemory` drops it. */
  private measurement_context(): CanvasRenderingContext2D | null {
    this.measure_context ??= document.createElement("canvas").getContext("2d");
    return this.measure_context;
  }

  private require_auto_fit_range_loaded(range: Range): void {
    if (!this.loadable || this.loadable.isRangeFullyLoaded(range)) return;
    const capability = this.loadable.queryCapability(range.sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(range.sheet, capability);
  }

  private with_store_resource_operation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    return this.loadable ? this.loadable.withResourceOperation(operation, run) : run();
  }

  private note_auto_fit_window(rows: number, columns: number): void {
    const cells = rows * columns;
    this.auto_fit_stats.windowRequests += 1;
    this.auto_fit_stats.maxWindowCells = Math.max(this.auto_fit_stats.maxWindowCells, cells);
  }

  /** A new auto-fit job closes the running one; a job closed before it completes counts as cancelled. */
  private start_auto_fit(): AutoFitJob {
    const job: AutoFitJob = { scope: this.auto_fits.next(), completed: false };
    job.scope.add(() => {
      if (!job.completed) this.auto_fit_stats.cancelledJobs += 1;
    });
    return job;
  }

  private complete_auto_fit(job: AutoFitJob): void {
    job.completed = true;
    job.scope.close();
  }

  /** Run `step` in the next frame, unless the job closes first. */
  private schedule_auto_fit_chunk(job: AutoFitJob, step: () => void): void {
    this.auto_fit_stats.scheduledChunks += 1;

    // Some hosts run the callback synchronously; then no frame is left to cancel.
    let ran = false;
    let remove_cancel: (() => void) | undefined;
    const cancel = scheduleFrame(() => {
      ran = true;
      remove_cancel?.();
      step();
    });
    if (!ran) remove_cancel = job.scope.add(cancel);
  }

  private cancel_auto_fit(): void {
    this.auto_fits.close();
  }

  private measure_auto_fit_row_window(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    band_start: number,
    required_heights: Float64Array,
    merge_widths: ReadonlyMap<number, number>,
  ): void {
    const fallback_font_size =
      Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.base_theme.font)?.[1] ?? "") || 12;
    for (let row = view.rows.start; row < view.rows.end; row++) {
      const required_index = row - band_start;
      let required = required_heights[required_index] ?? this.base_theme.rowHeight;
      for (let column_index = 0; column_index < columns.length; column_index++) {
        const col = columns[column_index]!;
        const cell = auto_fit_cell(sheet, view, row, column_index, col);
        if (!cell) continue;
        const { value, style } = cell;
        const text = cellScalarToText(value);
        if (!style.wrap && !text.includes("\n")) continue;
        const width =
          merge_widths.get(row * sheet.columns.length + col) ?? sheet.columns[col]!.width;
        const font_size = style.fontSize ?? fallback_font_size;
        context.font = fontFor(this.base_theme, style);
        const line_count = layoutTextLines(
          context,
          text,
          Math.max(0, width - CELL_TEXT_HORIZONTAL_PADDING),
        ).length;
        required = Math.max(required, Math.ceil(line_count * font_size * 1.2 + 8));
      }
      required_heights[required_index] = required;
    }
  }

  private measure_auto_fit_column_window(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    target_offset: number,
    widths: Float64Array,
  ): void {
    for (let row = view.rows.start; row < view.rows.end; row++) {
      for (let column_index = 0; column_index < columns.length; column_index++) {
        const col = columns[column_index]!;
        const cell = auto_fit_cell(sheet, view, row, column_index, col);
        if (!cell) continue;
        const { value, style, column } = cell;
        context.font = fontFor(this.base_theme, style);
        let width = widths[target_offset + column_index]!;
        const text = cellDisplayText(
          value,
          style.numberFormat ?? column.numberFormat,
          column.numberLocale,
        );
        for (const line of text.split("\n")) {
          width = Math.max(width, context.measureText(line).width + CELL_TEXT_HORIZONTAL_PADDING);
        }
        widths[target_offset + column_index] = width;
      }
    }
  }

  autoFitRows(range?: Range): void {
    if (this.read_only || (range && range.sheet !== this.active_sheet)) return;
    this.cancel_auto_fit();
    const sheet_id = this.active_sheet;
    const sheet = this.sheet();
    const r0 = Math.max(0, Math.min(range?.start.row ?? 0, range?.end.row ?? sheet.rowCount - 1));
    const r1 = Math.min(
      sheet.rowCount - 1,
      Math.max(range?.start.row ?? 0, range?.end.row ?? sheet.rowCount - 1),
    );
    const c0 = Math.max(
      0,
      Math.min(range?.start.col ?? 0, range?.end.col ?? sheet.columns.length - 1),
    );
    const c1 = Math.min(
      sheet.columns.length - 1,
      Math.max(range?.start.col ?? 0, range?.end.col ?? sheet.columns.length - 1),
    );
    if (r1 < r0 || c1 < c0) return;
    const measured_range: Range = {
      sheet: sheet_id,
      start: { row: r0, col: c0 },
      end: { row: r1, col: c1 },
    };

    this.require_auto_fit_range_loaded(measured_range);
    const context = this.measurement_context();
    if (!context) return;

    const merge_widths = new Map<number, number>();
    // Measurement walks view rows, so key each merge by the view row it shows on.
    for (const merge of sheet.merges ?? []) {
      const view_row = this.to_view_row(merge.r0);
      if (view_row === null) continue;
      let width = 0;
      for (let col = merge.c0; col <= merge.c1; col++) width += sheet.columns[col]?.width ?? 0;
      merge_widths.set(view_row * sheet.columns.length + merge.c0, width);
    }

    const row_count = r1 - r0 + 1;
    const column_count = c1 - c0 + 1;
    const patches: DocumentOp[] = [];
    const append_row_patches = (band_start: number, required: Float64Array): void => {
      for (let offset = 0; offset < required.length; offset++) {
        const view_row = band_start + offset;
        const data_row = this.to_data_row(view_row);
        const height = required[offset]!;
        if ((sheet.rowHeights?.get(data_row) ?? this.base_theme.rowHeight) === height) continue;
        patches.push({
          op: "setRowMeta",
          sheet: sheet_id,
          row: data_row,
          meta: { height },
        });
      }
    };

    if (row_count * column_count <= AUTO_FIT_CHUNK_CELLS) {
      const columns = Array.from({ length: column_count }, (_, index) => c0 + index);
      const view = this.with_store_resource_operation("auto-fit", () =>
        this.store.getVisibleWindow(sheet_id, { start: r0, end: r1 + 1 }, columns),
      );
      this.note_auto_fit_window(row_count, column_count);
      const required = new Float64Array(row_count);
      required.fill(this.base_theme.rowHeight);
      this.measure_auto_fit_row_window(context, sheet, view, columns, r0, required, merge_widths);
      append_row_patches(r0, required);
      this.auto_fit_stats.completedJobs += 1;
      this.auto_fit_stats.committedPatches += patches.length;
      this.with_store_resource_operation("auto-fit", () =>
        this.document.commit(patches, "structure"),
      );
      return;
    }

    const columns_per_window = Math.min(column_count, AUTO_FIT_CHUNK_CELLS);
    const rows_per_band = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columns_per_window));
    let band_start = r0;
    let band_end = Math.min(r1 + 1, band_start + rows_per_band);
    let column_start = c0;
    let required = new Float64Array(band_end - band_start);
    required.fill(this.base_theme.rowHeight);
    const job = this.start_auto_fit();

    const step = (): void => {
      if (job.scope.closed || this.active_sheet !== sheet_id) return;
      const count = Math.min(columns_per_window, c1 - column_start + 1);
      const columns = Array.from({ length: count }, (_, index) => column_start + index);
      const view = this.with_store_resource_operation("auto-fit", () =>
        this.store.getVisibleWindow(sheet_id, { start: band_start, end: band_end }, columns),
      );
      this.note_auto_fit_window(band_end - band_start, columns.length);
      this.measure_auto_fit_row_window(
        context,
        sheet,
        view,
        columns,
        band_start,
        required,
        merge_widths,
      );
      column_start += count;
      if (column_start > c1) {
        append_row_patches(band_start, required);
        band_start = band_end;
        if (band_start > r1) {
          this.complete_auto_fit(job);
          this.auto_fit_stats.completedJobs += 1;
          this.auto_fit_stats.committedPatches += patches.length;
          this.with_store_resource_operation("auto-fit", () =>
            this.document.commit(patches, "structure"),
          );
          return;
        }

        band_end = Math.min(r1 + 1, band_start + rows_per_band);
        column_start = c0;
        required = new Float64Array(band_end - band_start);
        required.fill(this.base_theme.rowHeight);
      }

      this.schedule_auto_fit_chunk(job, step);
    };

    this.schedule_auto_fit_chunk(job, step);
  }

  autoFitColumns(cols?: readonly number[]): void {
    if (this.read_only) return;
    this.cancel_auto_fit();
    const sheet_id = this.active_sheet;
    const sheet = this.sheet();
    const targets = cols
      ? [...new Set(cols)].filter((col) => col >= 0 && col < sheet.columns.length)
      : sheet.columns.map((_, col) => col);
    if (targets.length === 0) return;
    for (const col of targets) {
      this.require_auto_fit_range_loaded({
        sheet: sheet_id,
        start: { row: 0, col },
        end: { row: Math.max(0, sheet.rowCount - 1), col },
      });
    }

    const context = this.measurement_context();
    if (!context) return;
    const widths = new Float64Array(targets.length);
    for (let index = 0; index < targets.length; index++) {
      const column = sheet.columns[targets[index]!]!;
      context.font = fontFor(this.base_theme, {
        ...column.headerStyle,
        bold: column.headerStyle?.bold ?? true,
      });

      widths[index] = context.measureText(column.header).width + CELL_TEXT_HORIZONTAL_PADDING;
    }

    const patches: DocumentOp[] = [];
    const commit_widths = (): void => {
      for (let index = 0; index < targets.length; index++) {
        const col = targets[index]!;
        const width = Math.max(1, Math.ceil(widths[index]!));
        if (sheet.columns[col]!.width === width) continue;
        patches.push({ op: "setColumn", sheet: sheet_id, col, patch: { width } });
      }

      this.auto_fit_stats.completedJobs += 1;
      this.auto_fit_stats.committedPatches += patches.length;
      this.with_store_resource_operation("auto-fit", () =>
        this.document.commit(patches, "structure"),
      );
    };

    const total_cells = sheet.rowCount * targets.length;
    if (total_cells <= AUTO_FIT_CHUNK_CELLS) {
      const view = this.with_store_resource_operation("auto-fit", () =>
        this.store.getVisibleWindow(sheet_id, { start: 0, end: sheet.rowCount }, targets),
      );
      this.note_auto_fit_window(sheet.rowCount, targets.length);
      this.measure_auto_fit_column_window(context, sheet, view, targets, 0, widths);
      commit_widths();
      return;
    }

    const columns_per_window = Math.min(targets.length, AUTO_FIT_CHUNK_CELLS);
    const rows_per_window = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columns_per_window));
    let target_offset = 0;
    let columns = targets.slice(target_offset, target_offset + columns_per_window);
    let row_start = 0;
    const job = this.start_auto_fit();

    const step = (): void => {
      if (job.scope.closed || this.active_sheet !== sheet_id) return;
      const row_end = Math.min(sheet.rowCount, row_start + rows_per_window);
      const view = this.with_store_resource_operation("auto-fit", () =>
        this.store.getVisibleWindow(sheet_id, { start: row_start, end: row_end }, columns),
      );
      this.note_auto_fit_window(row_end - row_start, columns.length);
      this.measure_auto_fit_column_window(context, sheet, view, columns, target_offset, widths);
      row_start = row_end;
      if (row_start >= sheet.rowCount) {
        target_offset += columns.length;
        if (target_offset >= targets.length) {
          this.complete_auto_fit(job);
          commit_widths();
          return;
        }

        columns = targets.slice(target_offset, target_offset + columns_per_window);
        row_start = 0;
      }

      this.schedule_auto_fit_chunk(job, step);
    };

    this.schedule_auto_fit_chunk(job, step);
  }

  setRowHeight(row: number, height: number): void {
    this.document.commit(
      [
        {
          op: "setRowMeta",
          sheet: this.active_sheet,
          row: this.to_data_row(row),
          meta: { height: Math.max(1, height) },
        },
      ],
      "structure",
    );
  }

  setColumnWidth(col: number, width: number): void {
    this.document.commit(
      [{ op: "setColumn", sheet: this.active_sheet, col, patch: { width: Math.max(1, width) } }],
      "structure",
    );
  }

  setMinColumns(minColumns?: number): void {
    this.min_columns = minColumns;
    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === this.active_sheet);
    if (!stored) return;
    const target = Math.max(
      stored.columns.length,
      pad_target(this.host, minColumns, this.presentation),
    );
    if (target === this.virtual_column_targets.get(this.active_sheet)) return;
    this.virtual_column_targets.set(this.active_sheet, target);
    this.active_sheet_cache = null;
    this.rebuild_column_index();
    this.apply_layout();
    this.schedule_render();
  }

  setOverscan(overscan?: number): void {
    const next = overscan === undefined ? DEFAULT_OVERSCAN : Math.max(0, Math.floor(overscan));
    if (next === this.overscan) return;
    this.overscan = next;
    // Read per frame by the window calculations; a repaint picks it up.
    this.read_windows.invalidate();
    this.schedule_render();
  }

  /** Internal structural counters used by allocation regression tests and range benchmarks. */
  getMutationRevisionStats(): MutationRevisionStats {
    return this.mutation_revisions.stats();
  }

  getAutoFitResourceStats(): AutoFitResourceStats {
    return { ...this.auto_fit_stats, chunkCellLimit: AUTO_FIT_CHUNK_CELLS };
  }

  resetAutoFitResourceStats(): void {
    this.auto_fit_stats.windowRequests = 0;
    this.auto_fit_stats.maxWindowCells = 0;
    this.auto_fit_stats.scheduledChunks = 0;
    this.auto_fit_stats.completedJobs = 0;
    this.auto_fit_stats.cancelledJobs = 0;
    this.auto_fit_stats.committedPatches = 0;
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    if (!this.loadable) {
      throw new SheetwriteError(
        "unavailable",
        "resource-diagnostics",
        "Runtime resource diagnostics require a SheetwriteStore",
      );
    }
    const store = this.loadable.getRuntimeResourceSnapshot(operation, phase, runtime);
    return createRuntimeResourceSnapshot({
      operation,
      phase,
      wasm: store.wasm,
      jsOwners: [...store.jsOwners, ...this.datasource_controller.getResourceOwners()],
      boundary: store.boundary,
      runtime: store.runtime,
    });
  }

  setActiveSheet(id: SheetId, reset = false): void {
    const target = this.store.getWorkbook().sheets.find((sheet) => sheet.id === id);
    if (
      !target ||
      (target.visibility ?? "visible") !== "visible" ||
      (id === this.active_sheet && !reset)
    )
      return;

    if (reset) this.sheet_views.clear();
    else {
      this.sheet_views.set(this.active_sheet, {
        selection: this.getSelection(),
        top: this.scroller.scrollTop,
        left: this.scroller.scrollLeft,
      });
    }

    this.interactions.reconcile("sheet");
    this.hidden_active = null;
    this.notes.dismiss();
    this.cancel_auto_fit();
    this.dom_overlay.reset();
    this.mutation_revisions.clear();
    this.active_sheet = id;
    this.active_sheet_cache = null;
    const sheet = this.sheet();
    this.displayed_hidden_rows = new Set(sheet.hiddenRows);
    this.displayed_has_view = this.loadable?.hasView(id) ?? false;

    this.rebuild_column_index();
    this.geometry.rebuildRows(this.loadable?.viewRowCount(id) ?? sheet.rowCount);
    this.selection = new SelectionModel(this.geometry.rowCount, this.first_col(), this.last_col());
    this.datasource_controller.reset(sheet.rowCount);

    // As in Excel, a sheet shows the selection and scroll it was left with;
    // a spreadsheet's sheet shown for the first time has A1 selected.
    const view = this.sheet_views.get(id);
    const first_cell =
      this.presentation === "spreadsheet" && !isDashboard(sheet) && this.geometry.rowCount > 0
        ? { kind: "cell" as const, addr: { sheet: id, row: 0, col: this.first_col() } }
        : null;
    this.selection.set(view ? view.selection : first_cell);
    // Rows or columns removed while the sheet was away can leave the old active cell outside it.
    const focus = this.selection.focusCell;
    if (focus && (focus.row >= this.geometry.rowCount || focus.col > this.last_col())) {
      this.selection.set(first_cell);
    }
    this.scroller.scrollTop = view?.top ?? 0;
    this.scroller.scrollLeft = view?.left ?? 0;
    this.read_windows.noteViewportMoved();

    this.object_layer.sync();
    this.apply_layout();
    this.render_tabs();
    for (const fn of this.listeners["active-sheet"]) fn({ sheet: id });
    this.emit_selection();
    this.render();
  }

  getActiveSheet(): SheetId {
    return this.active_sheet;
  }

  getCellAtPoint(clientX: number, clientY: number): CellAddress | null {
    const cell = this.interactions.cellAtPointer(clientX, clientY);
    return cell ? { sheet: this.active_sheet, row: cell.row, col: cell.col } : null;
  }

  getCellText(addr: CellAddress): string {
    const cell = this.store.getCell(addr);
    const column = this.sheet(addr.sheet).columns[addr.col];
    return cellDisplayText(
      cell.resolved,
      cell.style.numberFormat ?? column?.numberFormat,
      column?.numberLocale,
    );
  }

  /**
   * View-aware editable snapshot of a cell: `(row, col)` are active-sheet view
   * coordinates; the returned address is the translated data address, so a
   * formula-bar commit through `applyTransaction` targets the correct row even
   * under an active sort/filter view.
   */
  getCellInput(row: number, col: number): CellInputSnapshot | null {
    const sheet = this.sheet();
    const column = sheet.columns[col];
    if (!column || row < 0 || row >= this.geometry.rowCount) return null;

    const cell = this.anchor_cell(row, col);
    return this.cell_input_at(
      { sheet: this.active_sheet, row: this.to_data_row(cell.row), col: cell.col },
      column,
    );
  }

  getActiveCellInput(): CellInputSnapshot | null {
    const hidden = this.hidden_active;
    if (!hidden) {
      const focus = this.selection.focusCell;
      return focus ? this.getCellInput(focus.row, focus.col) : null;
    }
    const column = this.sheet().columns[hidden.col];
    return column ? this.cell_input_at({ ...hidden }, column) : null;
  }

  /** The editable snapshot of the cell at sheet address `address` in `column`. */
  private cell_input_at(address: CellAddress, column: Column): CellInputSnapshot {
    const formula = this.loadable?.getFormula(address) ?? this.store.getFormula(address);
    const stored = this.store.getCell(address);
    // The text the cell editor opens with, so the formula bar reads it back the same.
    const text =
      formula ??
      cellEditText(
        stored.resolved,
        column.type,
        stored.style.numberFormat ?? column.cellStyle?.numberFormat ?? column.numberFormat,
        column.numberLocale,
      );

    return { address, text, format: column.type };
  }

  scrollToCell(addr: CellAddress): void {
    if (addr.sheet !== this.active_sheet) this.setActiveSheet(addr.sheet);

    // Most moves stay on screen, which the last paint tells without reading
    // the scroller's layout; it is read only when the last paint may be stale
    // or the cell is not wholly in it.
    const painted = this.read_windows.paintedView();
    if (painted === null || this.scroll_target(addr, painted) !== null) {
      const target = this.scroll_target(addr, this.measured_view());
      if (target !== null) {
        if (target.top !== null) this.scroller.scrollTop = this.geometry.toScroll(target.top);
        if (target.left !== null) this.scroller.scrollLeft = target.left;
        this.read_windows.noteViewportMoved();
      }
    }
    this.schedule_render();
  }

  /** Where the scroller is and how big, read from its layout. */
  private measured_view(): PaintedView {
    return {
      contentTop: this.geometry.toContent(this.scroller.scrollTop),
      scrollLeft: this.scroller.scrollLeft,
      scrollerWidth: this.scroller.clientWidth,
      scrollerHeight: this.scroller.clientHeight,
    };
  }

  /**
   * The scroll from `view` that shows the cell at `addr` whole: null when it
   * shows already, else the content top and the left to go to, each null on
   * an axis that stays. A scroll into view moves by whole rows and columns,
   * as in Excel: going down or right it stops at the first row or column
   * boundary that shows the target whole, so the first row and column on
   * screen start at their gridlines. A target larger than the body aligns its
   * own top or left edge. Cells inside the frozen bands are always visible on
   * their pinned axis.
   */
  private scroll_target(
    addr: CellAddress,
    view: PaintedView,
  ): { top: number | null; left: number | null } | null {
    let top: number | null = null;
    if (addr.row >= this.frozen_row_count()) {
      const frozen_h = this.frozen_height();
      const row_top = this.geometry.rowOffset(addr.row);
      const row_bottom = row_top + this.geometry.rowHeight(addr.row);
      const body_height = Math.max(0, view.scrollerHeight - this.theme.headerHeight);
      // Visible body band in content space: [contentTop + frozen_h, contentTop + body_height).
      let target = view.contentTop;
      if (row_top < view.contentTop + frozen_h) target = row_top - frozen_h;
      else if (row_bottom > view.contentTop + body_height) {
        target =
          Math.min(row_top, this.geometry.rowStartFrom(row_bottom - body_height + frozen_h)) -
          frozen_h;
      }
      if (target !== view.contentTop) top = Math.max(0, target);
    }

    let left: number | null = null;
    if (this.frozen_col_count() === 0 || addr.col >= this.first_body_col()) {
      const frozen_w = this.frozen_width();
      const cell_left = this.col_left_of(addr.col);
      const width = (this.sheet().columns[addr.col]?.width ?? 0) * this.zoom;
      const view_left = view.scrollLeft + frozen_w;
      const cell_width = Math.max(0, view.scrollerWidth - this.theme.rowHeaderWidth - frozen_w);
      if (cell_left < view_left) left = Math.max(0, cell_left - frozen_w);
      else if (cell_left + width > view_left + cell_width) {
        const start = Math.min(
          cell_left,
          this.geometry.columnStartFrom(cell_left + width - cell_width),
        );
        left = Math.max(0, start - frozen_w);
      }
    }
    return top === null && left === null ? null : { top, left };
  }

  getSelection(): Selection | null {
    return this.selection.toSelection(this.active_sheet);
  }

  getCellMode(): CellMode {
    return this.interactions.cellMode;
  }

  setSelection(sel: Selection | null): void {
    // The host's selection replaces a hidden active cell, an empty one too.
    this.hidden_active = null;
    this.selection.set(sel);
    this.emit_selection();
    this.schedule_render();
  }

  getTheme(): Theme {
    return { ...this.base_theme };
  }

  setTheme(theme: Partial<Theme>): void {
    this.base_theme = { ...this.base_theme, ...theme };
    this.apply_zoomed_theme();
    this.reseed_widget_theme();
    this.emit_theme_change();
  }

  replaceTheme(theme: Partial<Theme> | undefined): void {
    // Resolve the theme as the constructor does: defaults,
    // then host CSS custom properties, then the new option value.
    this.base_theme = { ...DEFAULT_THEME, ...resolveThemeFromCss(this.host), ...(theme ?? {}) };
    this.apply_zoomed_theme();
    this.reseed_widget_theme();
    this.emit_theme_change();
  }

  /**
   * The built-in widgets (toolbar, find bar, context menu, note card) read
   * their palette from custom properties seeded on the grid root when they are
   * created. The note card always exists, so seed them again from the new base
   * theme so a theme switch (for example to dark) repaints the widgets too, not
   * only the canvas.
   */
  private reseed_widget_theme(): void {
    seedWidgetTheme(this.host, this.base_theme);
  }

  /**
   * The toolbar and the ribbon render the command model, which loads as its
   * own chunk: grids without chrome never download it. The chrome's height is
   * reserved now, so the grid does not move when it arrives. Each call closes
   * the previous build, so a chunk that arrives after a rebuild, or after
   * destroy, is dropped.
   */
  private create_toolbar(config: GridConfig | undefined): void {
    const build = this.chrome_builds.next();
    if (!config || config.toolbar === false) return;

    const ribbon = Boolean(config.ribbon) && !Array.isArray(config.toolbar);
    const failed = (error: unknown): void => {
      if (build.closed) return;

      // Give the space back and tell the user; the load error still reaches the host.
      this.set_toolbar_height(0);
      this.action_feedback.show(
        `The ${ribbon ? "ribbon" : "toolbar"} could not load: ${errorDetail(error)}`,
      );
      throw error;
    };

    if (!ribbon) {
      this.toolbar_height = TOOLBAR_HEIGHT;
      void import("./ribbon/command-toolbar.js").then(({ CommandToolbar: ToolbarClass }) => {
        if (!build.closed) this.mount_toolbar(build, ToolbarClass, config);
      }, failed);
      return;
    }

    // The ribbon spans the host, so the host's width decides its layout now.
    const layout = typeof config.ribbon === "object" ? config.ribbon : {};
    this.toolbar_height = ribbonHeight(layout, this.host.clientWidth);
    void import("./ribbon/ribbon.js").then(({ Ribbon: RibbonClass }) => {
      if (!build.closed) this.mount_ribbon(build, RibbonClass, config);
    }, failed);
  }

  /**
   * Open the find bar. Its code is in its own chunk, loaded on the first open,
   * so a grid that never searches does not download or build it. A chunk that
   * arrives after a reset or after destroy is dropped.
   */
  private open_find_bar(options?: { replace?: boolean }): void {
    if (this.config?.find === false || this.lifetime.closed) return;
    if (this.find_bar) {
      this.find_bar.open(options);
      return;
    }

    // Opens during the load share one build, so the bar is made once.
    const build = this.find_bar_builds.current();
    this.load_command(
      import("./find-bar.js"),
      ({ FindBar: FindBarClass }) => {
        if (build.closed) return;
        if (!this.find_bar) {
          const find_bar = new FindBarClass(this.host, this.base_theme, this, this.read_only);
          this.find_bar = find_bar;
          build.add(() => {
            find_bar.destroy();
            this.find_bar = null;
          });
        }
        this.find_bar.open(options);
      },
      (error: unknown) => {
        if (build.closed) return;
        // Tell the user; the load error still reaches the host.
        this.action_feedback.show(`The find bar could not load: ${errorDetail(error)}`);
        throw error;
      },
    );
  }

  /**
   * Whether the selection can stay after `patches`, which changed the view:
   * they change only the AutoFilter or column filters of the active sheet,
   * and either no row was or is hidden (view rows are data rows on both
   * sides), or the selection lies on or above the AutoFilter's header row,
   * whose rows keep their view positions.
   */
  private selection_keeps_through_filter(
    patches: readonly DocumentOp[],
    had_view: boolean,
  ): boolean {
    if (this.selection.isEmpty) return false;
    const filters_only = patches.every(
      (patch) =>
        patch.op === "setSheetMeta" &&
        patch.sheet === this.active_sheet &&
        Object.entries(patch.patch).every(
          ([key, value]) => value === undefined || key === "filters" || key === "autoFilter",
        ),
    );
    if (!filters_only) return false;
    if (!had_view && !this.displayed_has_view) return true;

    const range = this.sheet().autoFilter?.range;
    const header = range ? this.to_view_row(range.start.row) : null;
    // A view sort moves every row, those above the header too.
    if (header === null || (this.sheet().sortKeys?.length ?? 0) > 0) return false;
    let above = true;
    this.selection.forEachRect((rect) => {
      if (rect.r1 > header) above = false;
    });
    return above;
  }

  /**
   * What the AutoFilter commands and its dropdown read and change in the
   * grid; built on first use.
   */
  private auto_filter(): AutoFilterHost & AutoFilterCommandsHost {
    this.auto_filter_host ??= {
      grid: this,
      host: this.host,
      theme: this.base_theme,
      sheet: () => this.sheet(),
      focus: () => {
        const focus = this.selection.focusCell;
        return focus
          ? { sheet: this.active_sheet, row: this.to_data_row(focus.row), col: focus.col }
          : null;
      },
      selectedRange: () => this.selected_sort_range(),
      commit: (op) => this.document.commit([op], "structure"),
      feedback: (message) => this.action_feedback.show(message),
      anchor: (row, col) => {
        const view_row = this.to_view_row(row);
        return view_row === null ? null : this.cell_client_rect(view_row, col);
      },
      adopt: (dispose) => this.auto_filter_builds.current().add(dispose),
    };
    return this.auto_filter_host;
  }

  /** Run `run` with the AutoFilter dropdown's code, which loads on first use, as the find bar's does. */
  private with_auto_filter_menu(
    run: (filters: typeof import("./autofilter-actions.js"), host: AutoFilterHost) => void,
  ): void {
    if (this.lifetime.closed) return;
    const build = this.auto_filter_builds.current();
    this.load_command(
      import("./autofilter-actions.js"),
      (filters) => {
        if (!build.closed) run(filters, this.auto_filter());
      },
      (error: unknown) => {
        if (build.closed) return;
        // Tell the user; the load error still reaches the host.
        this.action_feedback.show(`The filter could not load: ${errorDetail(error)}`);
        throw error;
      },
    );
  }

  /**
   * Merge or Merge & Center. With `ask`, as Excel's own command, a range in
   * which more than one cell holds a value merges after the warning's OK;
   * otherwise it merges now.
   */
  private merge_cells(center: boolean, options?: { ask?: boolean }): void {
    const warn = (message: string): Promise<boolean> =>
      this.open_dialog(
        import("./dialog.js"),
        (dialogs, host) => dialogs.confirmDialog(host, { title: "Merge Cells", message }).result,
      ).then((ok) => ok === true);
    mergeSelection(this.style_deps, center, options?.ask ? warn : undefined);
  }

  /**
   * Run UI whose code loads on first use: the find bar, a dialog, a panel or
   * the dashboard builder. Keys pressed on the grid while any such load is
   * pending wait, then act in order where the UI left the focus, as they
   * would have had the code been there.
   */
  private load_command<T>(
    load: Promise<T>,
    run: (module: T) => void,
    failed: (error: unknown) => void = (error) => {
      throw error;
    },
  ): void {
    this.command_loads++;
    void load.then(
      (module) => {
        try {
          run(module);
        } finally {
          this.release_keys();
        }
      },
      (error: unknown) => {
        this.release_keys();
        failed(error);
      },
    );
  }

  /** Once no command's code is loading, the keys pressed meanwhile act, in order. */
  private release_keys(): void {
    if (--this.command_loads > 0) return;
    for (const key of this.held_keys.splice(0)) this.interactions.replayKey(key);
  }

  /** Data › Data Validation; the command and its dialog load the first time it opens. */
  private data_validation(): void {
    this.load_command(
      import("./data-validation-command.js"),
      ({ dataValidationCommand: data_validation_command }) => {
        if (this.lifetime.closed) return;
        void data_validation_command({ dialogs: this.dialog_host, style: this.style_deps });
      },
    );
  }

  /** What the commands of `cell-commands.ts` use; built on first use. */
  private cell_commands(): CellCommandsHost {
    this.cell_commands_host ??= {
      grid: this,
      style: this.style_deps,
      rect: () => this.active_selection_rect(),
      bounds: () => [this.geometry.rowCount, this.first_col(), this.last_col()],
      commit: (patches) => this.document.commit(patches, "structure").status === "applied",
      alert: (title, message) => {
        void this.open_dialog(import("./dialog.js"), async (dialogs, host) => {
          await dialogs.alertDialog(host, { title, message });
          return null;
        });
      },
      // The dialogs' lazy imports stay in this module, with the grid's others.
      insertDeleteDialog: (insert, wide) =>
        this.open_dialog(
          import("./dialog.js"),
          (dialogs, host) => dialogs.insertDeleteDialog(host, insert, wide).result,
        ),
      formatCellsDialog: () =>
        this.open_dialog(import("./format-cells.js"), (dialogs, host) =>
          dialogs.formatSelectionDialog(host, this.style_deps, this.theme.font, (preview) => {
            this.format_preview = preview;
            this.read_windows.invalidateData();
            this.schedule_render();
          }),
        ),
    };
    return this.cell_commands_host;
  }

  /**
   * Open a dialog from `load`, a module that loads on first use, as
   * `load_command` runs UI. Resolves with the dialog's answer, or null when
   * the grid is destroyed before it opens.
   */
  private open_dialog<M, T>(
    load: Promise<M>,
    open: (module: M, dialogs: DialogHost) => Promise<T | null>,
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.load_command(
        load,
        (module) => resolve(this.lifetime.closed ? null : open(module, this.dialog_host)),
        reject,
      );
    });
  }

  /** Drop the find bar, so the next open builds it for the current config and read-only state. */
  private reset_find_bar(): void {
    this.find_bar_builds.close();
  }

  /** Chrome sits first in the host, so keyboard users reach it before the grid. */
  private place_chrome(element: HTMLElement): void {
    // The grid owns widget theming: seed now, reseed on every theme change.
    seedWidgetTheme(this.host, this.base_theme);

    // Grid layout offsets the viewport by the chrome's height, so chrome must leave normal flow.
    element.style.position = "absolute";
    element.style.top = "0";
    element.style.left = "0";
    element.style.right = "0";
    this.host.prepend(element);
  }

  private mount_toolbar(
    build: Scope,
    ToolbarClass: typeof CommandToolbar,
    config: GridConfig,
  ): void {
    const toolbar = new ToolbarClass(this.host, this, {
      label: "Spreadsheet formatting",
      className: "sheetwrite-toolbar",
      flags: config,
      ...(Array.isArray(config.toolbar) ? { items: config.toolbar } : {}),
      ...(config.icons === undefined ? {} : { icons: config.icons }),
    });
    toolbar.element.style.height = `${TOOLBAR_HEIGHT}px`;
    this.place_chrome(toolbar.element);
    build.add(() => toolbar.destroy());
  }

  private mount_ribbon(build: Scope, RibbonClass: typeof Ribbon, config: GridConfig): void {
    const ribbon = new RibbonClass(this.host, this, {
      onHeightChange: (height) => this.set_toolbar_height(height),
      flags: config,
      ...(typeof config.ribbon === "object" ? config.ribbon : {}),
      ...(config.icons === undefined ? {} : { icons: config.icons }),
    });
    this.place_chrome(ribbon.element);
    build.add(() => ribbon.destroy());
    if (ribbon.height !== this.toolbar_height) this.set_toolbar_height(ribbon.height);
  }

  private set_toolbar_height(height: number): void {
    this.toolbar_height = height;
    this.viewport_el.style.top = `${height}px`;
    this.panel_host.style.top = `${height}px`;
    this.apply_layout();
    this.render();
  }

  private emit_theme_change(): void {
    const listeners = this.listeners["theme-change"];
    if (listeners.size === 0) return;
    for (const fn of listeners)
      fn({
        theme: {
          ...this.base_theme,
        },
      });
  }

  getEffectiveTheme(): Theme {
    return this.theme;
  }

  setReadOnly(readOnly: boolean): void {
    // Only a new grid on a restarted engine can edit again.
    if (this.engine_failure || readOnly === this.read_only) return;

    this.read_only = readOnly;
    this.sync_read_only_chrome(readOnly);
  }

  /** Bring editors, tabs, the find bar and command state in line with `read_only`. */
  private sync_read_only_chrome(read_only: boolean): void {
    this.sheet_tabs?.setReadOnly(read_only);
    this.dashboard_view?.sync();
    if (read_only) {
      this.cancel_auto_fit();
      this.interactions.reconcile("read-only");
      this.notes.dismiss();
    }
    this.aria_mirror.setReadOnly(read_only);

    this.reset_find_bar();
    this.emit_command_state_change();
    // Object handles show only while the grid can be edited.
    this.schedule_render();
  }

  setConfig(config: GridConfig | undefined): void {
    // Declarative hosts re-create option objects per render (`config={{...}}`).
    // A shallowly-equal config is the same configuration: adopt the new
    // reference but skip the chrome rebuild — rebuilding would drop widget
    // focus and, through layout-driven scroll events, could re-trigger the
    // host render that produced the object in the first place.
    if (shallow_equal_config(config, this.config)) {
      this.config = config;
      return;
    }
    assertRibbonConfig(config?.ribbon);
    const focus = this.selection.focusCell;
    const keymap = new Keymap(config, {
      cell: focus ? { sheet: this.active_sheet, ...focus } : null,
      clientX: 0,
      clientY: 0,
    });
    this.keymap = keymap;
    this.config = config;

    const keyboard = config?.keyboard ?? true;
    this.keyboard_policy =
      typeof keyboard === "function" ? (event: KeyboardEvent) => keyboard(event, this) : keyboard;

    // `create_toolbar` closes the previous build, which destroys its toolbar or ribbon.
    this.toolbar_height = 0;
    this.create_toolbar(config);

    this.interactions.configureMenu(config, this.base_theme);

    this.reset_find_bar();

    this.sheet_tabs?.destroy();
    this.sheet_tabs = null;
    this.tab_bar?.remove();
    this.tab_bar = null;
    this.tab_bar_height = config?.tabs !== false ? TAB_BAR_HEIGHT : 0;
    if (this.tab_bar_height > 0) this.build_tab_bar();

    this.viewport_el.style.top = `${this.toolbar_height}px`;
    this.viewport_el.style.bottom = `${this.tab_bar_height}px`;
    this.panel_host.style.top = `${this.toolbar_height}px`;
    this.panel_host.style.bottom = `${this.tab_bar_height}px`;
    this.apply_layout();
    this.render();
    this.emit_command_state_change();
  }

  applyTransaction(transaction: GridTransaction): ApplyTransactionResult {
    // The controller receives a private copy of the caller's operations, with
    // each setBlock's cell arrays read once. Validation, the store and the
    // change event all see the copy, so they reuse this measurement.
    const patches = Array.isArray(transaction.patches)
      ? (readBlockArraysOnce(transaction.patches) ?? transaction.patches.slice())
      : transaction.patches;
    const resource_validation = validateTransactionResources(
      patches,
      this.transaction_resource_limits,
    );
    if (!resource_validation.ok) {
      return {
        status: "rejected",
        epoch: this.store_epoch,
        issues: [resource_validation.issue],
      };
    }
    const admitted = admitTransactionResources(
      patches,
      this.transaction_resource_limits,
      resource_validation,
    );
    return this.document.commit(patches, "api", admitted);
  }

  exportSnapshot(): WorkbookSnapshot {
    const snapshot = this.store.exportSnapshot?.();
    if (!snapshot) {
      throw new SheetwriteError(
        "unavailable",
        "store",
        "Sheetwrite: the injected Store does not support snapshot export",
      );
    }
    if (snapshot.workbook.activeSheet === this.active_sheet) return snapshot;
    return {
      ...snapshot,
      workbook: { ...snapshot.workbook, activeSheet: this.active_sheet },
    };
  }

  async importWorkbook(
    source: WorkbookSnapshot | ((signal: AbortSignal) => Promise<WorkbookSnapshot>),
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    const run = (this.imports ??= new ScopeSlot(this.lifetime)).next();

    try {
      // Replacement owns cold bootstrap and cleanup; normal grid hosts do not load it.
      const { replaceDocument: replace_document } = await import("./document-replace.js");
      await replace_document(
        {
          grid: this,
          store: this.loadable,
          cancelOperations: () => this.document_operations?.close(),
          windows: this.read_windows,
          history: this.document,
          clipboard: this.clipboard,
          closeFind: () => {
            this.find_bar_builds.close();
            this.find_bar?.destroy();
            this.find_bar = null;
          },
          activate: (workbook, active_sheet) => {
            this.virtual_column_targets.clear();
            this.session_sheets = workbook.sheets.map(({ id, visibility }) => ({ id, visibility }));

            this.store_epoch += 1;
            this.window_content_revision += 1;

            this.setActiveSheet(active_sheet, true);
            this.apply_zoomed_theme();
            this.emit_command_state_change();
          },
        },
        source,
        run,
        options?.signal,
      );
    } finally {
      run.close();
    }
  }

  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options: RemoteOperationOptions = {},
  ): ApplyTransactionResult {
    return this.document.applyRemoteOperations(operations, options);
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom)) return;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    if (next === this.zoom) return;
    this.zoom = next;
    this.apply_zoomed_theme();
    this.notes.hideCard();
  }

  getZoom(): number {
    return this.zoom;
  }

  /**
   * Re-derive the effective (zoom-scaled) theme from the base theme, then
   * rebuild every geometry consumer. Widgets (toolbar/find/menu) keep the base
   * theme: zoom scales grid content only, like Sheets.
   */
  private apply_zoomed_theme(): void {
    const base = this.base_theme;
    const z = this.zoom;
    const scaled =
      z === 1
        ? base
        : {
            ...base,
            rowHeight: base.rowHeight * z,
            headerHeight: base.headerHeight * z,
            rowHeaderWidth: base.rowHeaderWidth * z,
            font: scale_font_px(base.font, z),
          };
    this.theme = this.with_adaptive_gutter(scaled, this.sheet().rowCount);
    this.renderer.setTheme(this.theme);
    this.dom_overlay.setTheme(this.theme);
    this.object_layer.setTheme(this.theme);
    this.sync_tab_bar_theme();
    this.rebuild_index();
    this.rebuild_column_index();
    this.apply_layout();
    this.render();
  }

  setFrozen(rows: number, cols = 0): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.active_sheet,
          patch: {
            frozenRows: Math.max(0, Math.floor(rows)),
            frozenCols: Math.max(0, Math.floor(cols)),
          },
        },
      ],
      "structure",
    );
  }

  defineCellRenderer(name: string, renderer: CellRenderer): void {
    this.custom_renderers.set(name, renderer);
    this.renderer.setRenderers(this.custom_renderers);
    this.dom_overlay.setRenderers(this.custom_renderers);
    this.apply_layout();
    this.schedule_render();
  }

  insertRows(at: number, count = 1): void {
    if (count <= 0) return;
    this.report_rejected_insert(
      this.document.commit(
        [{ op: "addRows", sheet: this.active_sheet, at: Math.max(0, at), count }],
        "structure",
      ),
    );
  }

  /**
   * A row or column insert past a document limit is refused; the user reads
   * which limit in the grid's alert, beside the `mutation-rejected` event.
   */
  private report_rejected_insert(outcome: ApplyTransactionResult): void {
    if (outcome.status !== "rejected") return;
    const issue = outcome.issues.find((candidate) => candidate.kind === "resource-limit");
    if (issue) this.action_feedback.show(issue.message);
  }

  removeRows(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.rowCount) return;
    this.document.commit(
      [
        {
          op: "removeRows",
          sheet: this.active_sheet,
          at: Math.max(0, at),
          count: Math.min(count, sheet.rowCount - Math.max(0, at)),
        },
      ],
      "structure",
    );
  }

  insertColumns(at: number, count = 1): void {
    if (count <= 0) return;
    const insert_at = Math.max(0, Math.min(at, this.sheet().columns.length));
    this.report_rejected_insert(
      this.document.commit(
        [
          {
            op: "addColumns",
            sheet: this.active_sheet,
            at: insert_at,
            columns: this.make_blank_columns(insert_at, count),
          },
        ],
        "structure",
      ),
    );
  }

  removeColumns(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.columns.length || sheet.columns.length <= 1) return;
    const remove_at = Math.max(0, at);
    this.document.commit(
      [
        {
          op: "removeColumns",
          sheet: this.active_sheet,
          at: remove_at,
          count: Math.min(count, sheet.columns.length - remove_at, sheet.columns.length - 1),
        },
      ],
      "structure",
    );
  }

  addSheet(input: AddSheetInput): SheetLifecycleResult {
    const used = new Set(this.store.getWorkbook().sheets.map((sheet) => sheet.id));
    let id = input.id?.trim() || "sheet";
    let suffix = 2;
    while (used.has(id)) id = `${input.id?.trim() || "sheet"}-${suffix++}`;
    const columns = input.columns?.map((column) => ({ ...column })) ?? [
      { key: "a", header: "A", width: DEFAULT_COL_WIDTH, type: "general" as const },
    ];
    const name = validateSheetName(
      input.name,
      this.store.getWorkbook().sheets.map((sheet) => sheet.name),
    );
    // A dashboard has no rows or columns.
    const dashboard = input.kind === "dashboard";
    const snapshot: SheetSnapshot = {
      id,
      name: name.name,
      order: input.index ?? this.store.getWorkbook().sheets.length,
      ...(dashboard ? { kind: "dashboard", dashboard: { items: [] } } : {}),
      rowCount: dashboard ? 0 : (input.rowCount ?? 100),
      columns: dashboard ? [] : columns,
      cells: [],
    };
    const result = this.document.commit([{ op: "addSheet", sheet: snapshot }], "structure");
    return { ...result, sheet: id };
  }

  removeSheet(id: SheetId): SheetLifecycleResult {
    const result = this.document.commit([{ op: "removeSheet", sheet: id }], "structure");
    return { ...result, sheet: id };
  }

  renameSheet(id: SheetId, name: string): SheetLifecycleResult {
    const validation = validateSheetName(
      name,
      this.store
        .getWorkbook()
        .sheets.filter((sheet) => sheet.id !== id)
        .map((sheet) => sheet.name),
    );
    // Excel refuses History only when a user names a sheet; operations, undo
    // and version restore may give the name back.
    if (!validation.ok && validation.code === "reserved") {
      return this.reject_sheet(id, "reserved");
    }
    const result = this.document.commit(
      [{ op: "renameSheet", sheet: id, name: validation.name }],
      "structure",
    );
    return { ...result, sheet: id };
  }

  moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult {
    const result = this.document.commit([{ op: "moveSheet", sheet: id, to: toIndex }], "structure");
    return { ...result, sheet: id };
  }

  copySheet(id: SheetId, options: { index?: number; name?: string } = {}): SheetLifecycleResult {
    const plan = planSheetCopy(
      this.store.getWorkbook(),
      (sheet) => this.document.snapshotSheet(sheet),
      id,
      options,
    );
    if (!plan) return this.reject_sheet(id, "sheet-not-found");
    return { ...this.document.commit(plan.operations, "structure"), sheet: plan.sheet };
  }

  private reject_sheet(id: SheetId, code: "reserved" | "sheet-not-found"): SheetLifecycleResult {
    const issue: MutationIssue = {
      kind: "sheet-lifecycle",
      severity: "error",
      code,
      sheet: id,
      operationIndex: 0,
      message: SHEET_LIFECYCLE_MESSAGES[code],
    };
    for (const fn of this.listeners["mutation-rejected"]) fn({ issues: [issue] });
    return { status: "rejected", epoch: this.store_epoch, issues: [issue], sheet: id };
  }

  setSheetTabColor(id: SheetId, color: string | null): SheetLifecycleResult {
    const result = this.document.commit(
      [{ op: "setSheetMeta", sheet: id, patch: { tabColor: color } }],
      "structure",
    );
    return { ...result, sheet: id };
  }

  setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult {
    const result = this.document.commit(
      [{ op: "setSheetVisibility", sheet: id, visibility }],
      "structure",
    );
    return { ...result, sheet: id };
  }

  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.active_sheet,
          patch: { conditionalFormats: rules.map((rule) => ({ ...rule })) },
        },
      ],
      "style",
    );
  }

  setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult {
    const sanitized = sanitizeCellHyperlink(hyperlink);
    const candidate: CellHyperlink = sanitized ?? {
      id: "",
      range: {
        sheet: this.active_sheet,
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      },
      target: { kind: "external", url: "unsafe:" },
    };
    return this.document.commit(
      [
        {
          op: "setHyperlink",
          sheet: this.active_sheet,
          hyperlink: candidate,
        },
      ],
      "api",
    );
  }

  removeHyperlink(id: string): ApplyTransactionResult {
    return this.document.commit([{ op: "removeHyperlink", sheet: this.active_sheet, id }], "api");
  }

  getHyperlink(addr: CellAddress): CellHyperlink | null {
    return hyperlinkAt(this.store.getWorkbook(), addr);
  }

  activateHyperlink(addr: CellAddress): boolean {
    if (this.hyperlink_activation === "disabled") return false;
    const hyperlink = hyperlinkAt(this.store.getWorkbook(), addr);
    if (!hyperlink) return false;
    const target = resolveHyperlinkTarget(this.store.getWorkbook(), hyperlink.target);
    for (const listener of this.listeners["hyperlink-activate"]) {
      listener({ address: { ...addr }, hyperlink, target });
    }
    if (target.kind === "internal" && this.hyperlink_activation === "internal-navigation") {
      // The link names a sheet row; a filter or view sort may show it at
      // another view row, or not at all.
      const { address } = target;
      if (address.sheet !== this.active_sheet) this.setActiveSheet(address.sheet);
      const row = this.to_view_row(address.row);
      if (row !== null) this.scrollToCell({ ...address, row });
    }
    return true;
  }

  setValidationRule(rule: DataValidationRule): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "setValidationRule", sheet: this.active_sheet, rule: structuredClone(rule) }],
      "api",
    );
  }

  removeValidationRule(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeValidationRule", sheet: this.active_sheet, id }],
      "api",
    );
  }

  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult {
    return this.document.commit(
      [
        {
          op: "setProtectedRange",
          sheet: this.active_sheet,
          protectedRange: structuredClone(protectedRange),
        },
      ],
      "api",
    );
  }

  removeProtectedRange(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeProtectedRange", sheet: this.active_sheet, id }],
      "api",
    );
  }

  getPivots(sheet?: SheetId): PivotDefinition[] {
    return clonePivots(this.store.getWorkbook().sheets, sheet);
  }

  setPivot(pivot: PivotDefinition, sheet?: SheetId): ApplyTransactionResult {
    const owner = sheet ?? pivotOwner(this.store.getWorkbook().sheets, pivot.id)?.id;
    // Saved values do not match a definition the caller changed.
    const changed = withoutSavedOutput(structuredClone(pivot));
    return this.document.commit(
      [{ op: "setPivot", sheet: owner ?? this.active_sheet, pivot: changed }],
      "api",
    );
  }

  removePivot(id: string, sheet?: SheetId): ApplyTransactionResult {
    const owner = sheet ?? pivotOwner(this.store.getWorkbook().sheets, id)?.id ?? this.active_sheet;
    return this.document.commit([{ op: "removePivot", sheet: owner, id }], "api");
  }

  getPivotFields(sheet: SheetId, id: string): PivotSourceField[] {
    return storeEngine(this.store)?.getPivotFields(sheet, id) ?? [];
  }

  getPivotResult(sheet: SheetId, id: string): PivotResultView | null {
    const engine = storeEngine(this.store);
    if (engine) return engine.getPivotResult(sheet, id);

    // A custom store has no pivot engine; its definitions still read normally.
    const pivot = this.store
      .getWorkbook()
      .sheets.find((candidate) => candidate.id === sheet)
      ?.pivots?.find((candidate) => candidate.id === id);
    return pivot ? uncomputedPivotResult(sheet, pivot) : null;
  }

  getCharts(sheet: SheetId = this.active_sheet): readonly ChartDefinition[] {
    return structuredClone(this.sheet_by_id(sheet)?.charts ?? []);
  }

  setChart(chart: ChartDefinition, sheet: SheetId = this.active_sheet): ApplyTransactionResult {
    return this.document.commit([{ op: "setChart", sheet, chart: structuredClone(chart) }], "api");
  }

  removeChart(id: string, sheet?: SheetId): ApplyTransactionResult {
    const owner =
      sheet ??
      this.store
        .getWorkbook()
        .sheets.find((candidate) => candidate.charts?.some((chart) => chart.id === id))?.id ??
      this.active_sheet;
    return this.document.commit([{ op: "removeChart", sheet: owner, id }], "api");
  }

  selectChart(id: string | null, sheet: SheetId = this.active_sheet): void {
    if (id !== null && sheet !== this.active_sheet) this.setActiveSheet(sheet);
    // Charts on other sheets are never selected, so there is nothing to deselect there.
    if (sheet === this.active_sheet) this.object_layer.select(id);
  }

  /**
   * A chart's right-click menu. Edit chart does what Enter does; a read-only
   * grid can open the chart's panel but not delete the chart.
   */
  private chart_menu_items(chart: ChartRef): ContextMenuItem[] {
    return [
      {
        id: "editChart",
        label: "Edit chart",
        icon: "chart",
        onClick: () => {
          for (const fn of this.listeners["chart-activate"]) fn(chart);
        },
      },
      { action: "separator" },
      {
        id: "deleteChart",
        label: "Delete chart",
        icon: "delete",
        visible: () => !this.read_only,
        onClick: () => {
          this.removeChart(chart.id, chart.sheet);
          // The menu would hand focus back to the chart it opened on, which no
          // longer exists; whether its frame is gone yet depends on timing.
          // Focus the grid so Ctrl+Z, arrows and typing keep working.
          this.host.focus({ preventScroll: true });
        },
      },
    ];
  }

  openPanel(panel: GridPanel | null): void {
    if (this.lifetime.closed) return;
    const was_open = this.side_panels.active;
    const had_focus = this.panel_host.contains(document.activeElement);
    this.side_panels.close();
    this.open_side_panel = panel;

    const is_open = panel !== null;
    // The panel focuses its first control while it mounts; a hidden host refuses focus.
    this.panel_host.hidden = !is_open;
    if (panel) {
      const scope = this.side_panels.next();
      scope.add(mountSidePanel(this.panel_host, panel, () => this.openPanel(null)));
    }
    if (is_open !== was_open) {
      this.viewport_el.style.right = is_open ? `${PANEL_WIDTH}px` : "0px";
      this.sync_sizer();
      this.render();
    }
    // Escape and the close button leave focus in a removed panel; give it back to the grid.
    if (!is_open && had_focus) this.host.focus();
  }

  setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void {
    this.store.setProtectionResolver?.(resolver, mode);
  }

  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult {
    return this.document.commit([{ op: "setNote", addr: { ...addr }, text: text || null }], "api");
  }

  getNote(addr: CellAddress): string | null {
    return (
      this.sheet_by_id(addr.sheet)?.notes?.find(
        (note) => note.addr.row === addr.row && note.addr.col === addr.col,
      )?.text ?? null
    );
  }

  private make_blank_columns(at: number, count: number): Column[] {
    const used = new Set(this.sheet().columns.map((column) => column.key));
    const columns: Column[] = [];
    for (let i = 0; i < count; i++) {
      const col = at + i;
      const base = `col_${col}`;
      let key = base;
      let suffix = 1;
      while (used.has(key)) key = `${base}_${suffix++}`;
      used.add(key);
      columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "general" });
    }
    return columns;
  }

  private materialize_virtual_columns(patches: DocumentOp[]): DocumentOp[] {
    // A write is measured against the width its sheet has when it runs, so
    // column inserts and deletes earlier in the batch count. Undoing a
    // trailing column delete restores cells right after re-adding the columns.
    const width_by_sheet = new Map<SheetId, number>();
    const missing_by_sheet = new Map<SheetId, number>();
    const width_of = (sheet_id: SheetId): number | null => {
      const width = width_by_sheet.get(sheet_id);
      if (width !== undefined) return width;

      const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === sheet_id);
      if (!stored) return null;
      width_by_sheet.set(sheet_id, stored.columns.length);
      return stored.columns.length;
    };

    for (const patch of patches) {
      let sheet: SheetId | null = null;
      let col = -1;
      if (patch.op === "addColumns" || patch.op === "removeColumns") {
        const width = width_of(patch.sheet);
        if (width !== null) {
          const delta = patch.op === "addColumns" ? patch.columns.length : -patch.count;
          width_by_sheet.set(patch.sheet, width + delta);
        }
      } else if (patch.op === "set") {
        sheet = patch.addr.sheet;
        col = patch.addr.col;
      } else if (
        patch.op === "setRange" ||
        patch.op === "setBlock" ||
        patch.op === "restoreBlock" ||
        patch.op === "setRangeStyle" ||
        patch.op === "clearRange"
      ) {
        sheet = patch.range.sheet;
        col = Math.max(patch.range.start.col, patch.range.end.col);
      } else if (patch.op === "setColumn") {
        sheet = patch.sheet;
        col = patch.col;
      } else if (patch.op === "addMerge" || patch.op === "removeMerge") {
        sheet = patch.sheet;
        col = Math.max(patch.merge.c0, patch.merge.c1);
      }
      if (sheet === null) continue;

      const width = width_of(sheet);
      if (width === null) continue;
      missing_by_sheet.set(sheet, Math.max(missing_by_sheet.get(sheet) ?? 0, col + 1 - width));
    }

    const additions: DocumentOp[] = [];
    for (const [sheet_id, missing] of missing_by_sheet) {
      const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === sheet_id);
      if (!stored || missing <= 0) continue;
      const used = new Set(stored.columns.map((column) => column.key));
      const columns: Column[] = [];
      for (let col = stored.columns.length; col < stored.columns.length + missing; col++) {
        const base = `col_${col}`;
        let key = base;
        let suffix = 1;
        while (used.has(key)) key = `${base}_${suffix++}`;
        used.add(key);
        columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "general" });
      }
      additions.push({ op: "addColumns", sheet: sheet_id, at: stored.columns.length, columns });
    }
    return additions.length > 0 ? [...additions, ...patches] : patches;
  }

  /**
   * The view rows of the selected rectangle that holds the active cell. A
   * whole-column selection gives only the active cell's row, so a row command
   * never runs over the entire sheet.
   */
  private selected_rows(): { first: number; count: number } | null {
    const rect = this.active_selection_rect();
    const focus = this.selection.focusCell;
    if (!rect || !focus) return null;
    const count = rect.r1 - rect.r0 + 1;
    if (count === this.sheet().rowCount && count > 1) return { first: focus.row, count: 1 };
    return { first: rect.r0, count };
  }

  /** The columns of the selected rectangle that holds the active cell; a whole row gives the active column. */
  private selected_columns(): { first: number; count: number } | null {
    const rect = this.active_selection_rect();
    const focus = this.selection.focusCell;
    if (!rect || !focus) return null;
    const count = rect.c1 - rect.c0 + 1;
    if (count === this.sheet().columns.length && count > 1) return { first: focus.col, count: 1 };
    return { first: rect.c0, count };
  }

  private active_selection_rect(): SelRect | null {
    const focus = this.selection.focusCell;
    if (!focus) return null;
    let found: SelRect | null = null;
    this.selection.forEachRect((rect) => {
      if (
        rect.r0 <= focus.row &&
        focus.row <= rect.r1 &&
        rect.c0 <= focus.col &&
        focus.col <= rect.c1
      )
        found = rect;
    });
    return found;
  }

  private build_actions(): GridActions {
    return {
      toggleBold: () => this.style_actions.toggleStyle("bold"),
      toggleItalic: () => this.style_actions.toggleStyle("italic"),
      toggleUnderline: () => this.style_actions.toggleStyle("underline"),
      toggleStrikethrough: () => this.style_actions.toggleStyle("strikethrough"),
      setAlign: (align) => this.style_actions.applyStyle({ align }),
      setTextColor: (color) => this.style_actions.applyStyle({ color: color ?? undefined }),
      setFillColor: (color) =>
        this.style_actions.applyStyle({ backgroundColor: color ?? undefined }),
      setFontFamily: (family) => this.style_actions.applyStyle({ fontFamily: family ?? undefined }),
      setFontSize: (px) => this.style_actions.applyStyle({ fontSize: px ?? undefined }),
      stepFontSize: (direction) => {
        const default_font_size = 13;
        const theme_font_size =
          Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.base_theme.font)?.[1] ?? "") ||
          default_font_size;
        this.style_actions.applyStyle({
          fontSize: stepFontSizePx(this.getFocusCellStyle().fontSize ?? theme_font_size, direction),
        });
      },
      setVerticalAlign: (vertical_align) =>
        this.style_actions.applyStyle({ verticalAlign: vertical_align }),
      toggleWrap: () => this.style_actions.applyStyle({ wrap: !this.getFocusCellStyle().wrap }),
      setNumberFormat: (code) => this.style_actions.applyStyle({ numberFormat: code ?? undefined }),
      stepDecimals: (direction) => {
        const focus = this.selection.focusCell;
        if (!focus) return;
        const column = this.sheet().columns[focus.col];
        const value = this.store.getCell({
          sheet: this.active_sheet,
          row: this.to_data_row(focus.row),
          col: focus.col,
        }).resolved;

        const number_format = stepNumberFormatDecimals(
          this.getFocusCellStyle().numberFormat,
          direction,
          typeof value === "number" ? value : undefined,
          column?.numberLocale,
        );
        if (number_format === undefined) return;

        this.style_actions.applyStyle({ numberFormat: number_format });
      },
      setBorders: (preset) => this.style_actions.setBorders(preset),
      mergeAndCenter: (options) => this.merge_cells(true, options),
      clearAll: () => this.style_actions.clearAll(),
      autoSum: () => this.auto_sum(),
      find: () => this.open_find_bar(),
      freezePanes: () => {
        const focus = this.selection.focusCell;
        if (focus) this.setFrozen(focus.row, focus.col);
      },
      toggleBorder: () => this.style_actions.toggleBorder(),
      clearFormat: () => this.style_actions.applyStyle(null),
      merge: (options) => this.merge_cells(false, options),
      unmerge: () => this.style_actions.unmergeSelection(),
      sort: (ascending) => {
        const f = this.selection.focusCell;
        if (f) this.sortBy(f.col, ascending);
      },
      sortView: (ascending) => {
        const f = this.selection.focusCell;
        if (f) this.setViewSort([{ col: f.col, ascending }]);
      },
      customSort: () => showSortPanel(this),
      // As in Excel, row and column commands act on every row or column of the
      // selection, not only the active cell's.
      insertRowAbove: () => {
        const rows = this.selected_rows();
        if (rows) this.insertRows(this.to_data_row(rows.first), rows.count);
      },
      insertRowBelow: () => {
        const rows = this.selected_rows();
        if (rows) this.insertRows(this.to_data_row(rows.first + rows.count - 1) + 1, rows.count);
      },
      deleteRow: () => {
        const rows = this.selected_rows();
        if (!rows) return;
        const data_rows = Array.from({ length: rows.count }, (_, index) =>
          this.to_data_row(rows.first + index),
        );
        const first = data_rows[0] ?? 0;
        if (data_rows.every((row, index) => row === first + index)) {
          this.removeRows(first, rows.count);
        } else {
          // A sorted view can scatter the selected rows; remove the lowest first.
          for (const row of data_rows.sort((left, right) => right - left)) this.removeRows(row);
        }
      },
      insertColumnLeft: () => {
        const cols = this.selected_columns();
        if (cols) this.insertColumns(cols.first, cols.count);
      },
      insertColumnRight: () => {
        const cols = this.selected_columns();
        if (cols) this.insertColumns(cols.first + cols.count, cols.count);
      },
      deleteColumn: () => {
        const cols = this.selected_columns();
        if (cols) this.removeColumns(cols.first, cols.count);
      },
      insertCells: (options) => insertOrDelete(this.cell_commands(), true, options),
      deleteCells: (options) => insertOrDelete(this.cell_commands(), false, options),
      formatCells: (format) => formatCells(this.cell_commands(), format),
      dataValidation: () => this.data_validation(),
      hideRows: (rows) => {
        const span = this.selected_rows();
        const targets =
          rows ??
          (span
            ? Array.from({ length: span.count }, (_, index) => this.to_data_row(span.first + index))
            : []);
        this.hideRows(targets);
      },
      showRows: (rows) => this.showRows(rows),
      autoFitRows: () => {
        const rows = this.selected_rows();
        if (!rows) return;
        // `autoFitRows` takes view rows, the same space as the selection.
        this.autoFitRows({
          sheet: this.active_sheet,
          start: { row: rows.first, col: 0 },
          end: {
            row: rows.first + rows.count - 1,
            col: Math.max(0, this.sheet().columns.length - 1),
          },
        });
      },
      hideColumns: (cols) => {
        const span = this.selected_columns();
        this.hideColumns(
          cols ??
            (span ? Array.from({ length: span.count }, (_, index) => span.first + index) : []),
        );
      },
      showColumns: (cols) => this.showColumns(cols),
      autoFitColumns: (cols) => this.autoFitColumns(cols),
      clearFilter: (col) => {
        const target = col ?? this.selection.focusCell?.col;
        if (target !== undefined) this.setColumnFilter(target, null);
      },
      toggleAutoFilter: () => toggleAutoFilter(this.auto_filter()),
      clearFilters: () => clearFilters(this.auto_filter()),
      reapplyFilter: () => {
        this.reapplyFilter();
      },
      filterBySelection: () => filterBySelection(this.auto_filter()),
      copy: () => this.clipboard.copy(),
      cut: () => this.clipboard.cut(),
      paste: () => this.clipboard.paste(),
      pasteValues: () => this.clipboard.pasteValues(),
      pasteSpecial: (options) => this.clipboard.pasteSpecial(options),
      pasteVisibleRows: () => this.clipboard.pasteShownRows(),
      clearContents: () => this.clear_selection(),
      exportCsv: (filename) => {
        try {
          this.exportCsv(filename ?? "sheetwrite.csv");
        } catch (error) {
          this.emit_export_error(error, "csv");
        }
      },
      // Resolves when the download is handed to the browser; never rejects,
      // because a failure is reported once through `export-error`.
      exportXlsx: (filename) =>
        this.exportXlsx(filename ?? "sheetwrite.xlsx").catch((error: unknown) => {
          this.emit_export_error(error, "xlsx");
        }),
      importXlsx: async () => {
        // File selection is optional chrome, not part of initial grid delivery.
        const { pickXlsxWorkbook: pick_xlsx_workbook } = await import("./workbook-io.js");
        await pick_xlsx_workbook(this, this.host, this.lifetime);
      },
      versionHistory: () => this.historyCommand?.("open"),
      // The dashboard chunk names and adds the sheet; first paint carries only this call.
      newDashboard: () =>
        this.load_command(import("./dashboard/dashboard-layout.js"), (m) => {
          if (!this.lifetime.closed) m.newDashboard(this);
        }),
      saveVersion: () => {
        if (!this.read_only) this.historyCommand?.("save");
      },
      editNote: () => {
        // Same gate as the cell editor: do not open an editor whose save must fail.
        const focus = this.selection.focusCell;
        if (this.read_only || !focus) return;

        const cell = this.note_cell(focus.row, focus.col);
        this.scrollToCell({ sheet: this.active_sheet, row: cell.row, col: cell.col });
        this.notes.edit(cell);
      },
      deleteNote: () => {
        const focus = this.selection.focusCell;
        if (this.read_only || !focus) return;

        const { address } = this.note_cell(focus.row, focus.col);
        if (this.getNote(address) !== null) this.setNote(address, null);
      },
      pickFromList: () => {
        const focus = this.selection.focusCell;
        if (focus) this.interactions.pickFromList(focus.row, focus.col);
      },
      showPivotFields: () => {
        // The field list edits the pivot, so a read-only grid does not open it.
        if (this.read_only) return;

        showPivotFields(this);
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
    };
  }

  getFocusCellStyle(): CellStyle {
    const focus = this.selection.focusCell;
    if (!focus) return {};
    const anchor = this.anchor_cell(focus.row, focus.col);
    const cell = this.store.getCell({
      sheet: this.active_sheet,
      row: this.to_data_row(anchor.row),
      col: anchor.col,
    });
    const column = this.sheet().columns[anchor.col];
    const style: CellStyle = { ...column?.cellStyle, ...cell.style };
    // Without a style's format the cell shows its column's, as the canvas paints it.
    const number_format = style.numberFormat ?? column?.numberFormat;
    return number_format === undefined ? style : { ...style, numberFormat: number_format };
  }

  async summarizeSelection(signal?: AbortSignal): Promise<SelectionSummary | null> {
    signal?.throwIfAborted();
    // A destroyed grid has freed its store: the call rejects with the grid's abort reason.
    this.lifetime.signal.throwIfAborted();
    if (this.selection.isEmpty) return null;

    // Summaries are independent, but none may read a replaced document.
    const run = (this.document_operations ??= new ScopeSlot(this.lifetime)).current().child();
    signal?.addEventListener("abort", () => run.close(signal.reason), {
      once: true,
      signal: run.signal,
    });
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push({ ...rect }));
    const sheet = this.active_sheet;
    const column_count = this.sheet().columns.length;
    try {
      // Summary scans are cold work; do not add them to initial grid delivery.
      const { summarizeRects: summarize_rects } = await import("./selection-summary.js");
      return await summarize_rects(this.store, sheet, column_count, rects, run);
    } finally {
      run.close();
    }
  }

  private auto_sum(): void {
    const focus = this.selection.focusCell;
    if (this.read_only || !focus) return;

    const row = this.to_data_row(focus.row);
    const col = focus.col;
    const chunk_cells = 4_096;

    const numeric_start = (vertical: boolean): number => {
      let end = vertical ? row : col;
      const origin = end;
      while (end > 0) {
        const start = Math.max(0, end - chunk_cells);
        const columns = vertical
          ? [col]
          : Array.from({ length: end - start }, (_, index) => start + index);
        const window = this.store.getDataWindow?.(
          this.active_sheet,
          vertical ? { start, end } : { start: row, end: row + 1 },
          columns,
        );

        let values: ArrayLike<CellScalar>;
        if (window) values = window.values;
        else {
          const coordinates =
            columns.length === 1 && vertical
              ? Array.from({ length: end - start }, (_, index) => ({ row: start + index, col }))
              : columns.map((column) => ({ row, col: column }));

          const engine = storeEngine(this.store);
          // Custom stores without canonical windows retain their scalar data-address contract.
          const cells = engine
            ? engine.captureResolvedCells(this.active_sheet, coordinates)
            : coordinates.map((coordinate) =>
                this.store.getCell({ sheet: this.active_sheet, ...coordinate }),
              );
          values = cells.map((cell) => cell.resolved);
        }

        for (let index = values.length - 1; index >= 0; index--) {
          if (typeof values[index] !== "number") return start + index + 1;
        }

        end = start;
      }

      return origin === 0 ? origin : end;
    };

    const first_row = numeric_start(true);
    const vertical = first_row < row;
    const first_col = vertical ? col : numeric_start(false);
    if (!vertical && first_col === col) return;
    const start = `${colToA1(first_col)}${(vertical ? first_row : row) + 1}`;
    const end = `${colToA1(vertical ? col : col - 1)}${(vertical ? row - 1 : row) + 1}`;
    this.document.commit(
      [
        {
          op: "set",
          addr: { sheet: this.active_sheet, row, col },
          value: { kind: "formula", src: `=SUM(${start}:${end})` },
        },
      ],
      "edit-enter",
    );
  }

  getCommandState(command: GridCommandName): GridCommandState {
    const summary = COMMAND_STATE_ACTIVITY_COMMANDS.includes(command)
      ? this.formatting_summary()
      : undefined;
    return this.resolve_command_state(command, summary);
  }

  private resolve_command_state(
    command: GridCommandName,
    summary?: Readonly<Partial<Record<GridCommandName, number>>>,
  ): GridCommandState {
    if (command === "undo") {
      return {
        disabled: this.read_only || !this.document.canUndo,
        activity: "inactive",
      };
    }
    if (command === "redo") {
      return {
        disabled: this.read_only || !this.document.canRedo,
        activity: "inactive",
      };
    }
    if (command === "versionHistory" || command === "saveVersion") {
      return {
        disabled: !this.historyCommand || (command === "saveVersion" && this.read_only),
        activity: "inactive",
      };
    }
    if (command === "filter") {
      return {
        disabled: this.read_only || isDashboard(this.sheet()),
        activity: this.sheet().autoFilter ? "active" : "inactive",
      };
    }
    if (command === "importXlsx") {
      return {
        disabled:
          this.read_only ||
          !this.owns_store ||
          this.has_datasource ||
          hasGridTransactionAdmission(this),
        activity: "inactive",
      };
    }

    const selection_required =
      is_formatting_command(command) ||
      command === "merge" ||
      command === "unmerge" ||
      command === "sortAsc" ||
      command === "sortDesc";
    const disabled =
      (selection_required && this.selection.isEmpty) ||
      (this.read_only && command !== "exportCsv" && command !== "exportXlsx");
    const activity = summary?.[command] ?? 0;
    return {
      disabled,
      activity: activity === 3 ? "mixed" : activity === 1 ? "active" : "inactive",
    };
  }

  private formatting_summary(): Readonly<Partial<Record<GridCommandName, number>>> {
    const summary: Partial<Record<GridCommandName, number>> = {};
    for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) summary[command] = 0;

    // A stopped engine cannot answer style reads; a read-only grid needs none.
    if (this.selection.isEmpty || this.engine_failure) return summary;

    const columns = this.sheet().columns;
    const rects: SelRect[] = [];
    let cell_count = 0;
    this.selection.forEachRect((rect) => {
      const last_col = Math.min(rect.c1, columns.length - 1);
      if (last_col < rect.c0) return;
      cell_count += (rect.r1 - rect.r0 + 1) * (last_col - rect.c0 + 1);
      rects.push(rect);
    });

    if (cell_count > COMMAND_STATE_CELL_LIMIT) {
      for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) summary[command] = 3;
      return summary;
    }

    const add = (style: CellStyle, column: Column): void => {
      for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) {
        const bit = formatting_command_active(command, style, column.cellStyle) ? 1 : 2;
        summary[command] = (summary[command] ?? 0) | bit;
      }
    };
    const engine = storeEngine(this.store);
    const sheet = this.active_sheet;

    // Without a view, a selected row is its data row, and a sheet that is not
    // paged has every cell loaded: each rectangle reads only its distinct
    // styles, once per run of columns that share a column style.
    if (engine && !engine.hasView(sheet) && !engine.isPaged(sheet)) {
      for (const rect of rects) {
        const last_col = Math.min(rect.c1, columns.length - 1);
        for (let first = rect.c0; first <= last_col;) {
          const column = columns[first]!;
          let end = first;
          while (end < last_col && columns[end + 1]!.cellStyle === column.cellStyle) end++;
          for (const style of engine.rangeStyles(sheet, rect.r0, first, rect.r1, end)) {
            add(style, column);
          }
          first = end + 1;
        }
      }
      return summary;
    }

    const coordinates: Array<{ row: number; col: number }> = [];
    for (const rect of rects) {
      const last_col = Math.min(rect.c1, columns.length - 1);
      for (let row = rect.r0; row <= rect.r1; row++) {
        const data_row = this.to_data_row(row);
        for (let col = rect.c0; col <= last_col; col++) coordinates.push({ row: data_row, col });
      }
    }
    // Custom stores without an engine retain their single-cell read contract.
    const cells = engine
      ? engine.captureResolvedCells(sheet, coordinates)
      : coordinates.map(({ row, col }) => this.store.getCell({ sheet, row, col }));

    for (const [index, coordinate] of coordinates.entries()) {
      const cell = cells[index];
      const column = columns[coordinate.col];
      if (cell && column) add(cell.style, column);
    }

    return summary;
  }

  private command_state_snapshot(): Readonly<Record<GridCommandName, GridCommandState>> {
    const summary = this.formatting_summary();
    const states = {} as Record<GridCommandName, GridCommandState>;
    for (const command of GRID_COMMANDS) {
      states[command] = this.resolve_command_state(command, summary);
    }
    return states;
  }

  private emit_command_state_change(): void {
    this.command_state_queued = false;
    this.command_state_generation += 1;
    if (this.lifetime.closed || this.listeners["command-state-change"].size === 0) return;
    const event = { states: this.command_state_snapshot() };
    for (const listener of this.listeners["command-state-change"]) listener(event);
  }

  private queue_command_state_change(): void {
    if (this.command_state_queued || this.lifetime.closed) return;
    this.command_state_queued = true;
    const generation = ++this.command_state_generation;
    queueMicrotask(() => {
      if (!this.command_state_queued || generation !== this.command_state_generation) return;
      this.emit_command_state_change();
    });
  }

  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void {
    this.listeners[evt].add(fn);
    return () => this.listeners[evt].delete(fn);
  }

  refresh(): void {
    this.render();
  }

  aggregate(col: number, op: AggregateOp): number {
    return this.loadable ? this.loadable.aggregate(this.active_sheet, col, op) : 0;
  }

  sortBy(col: number, ascending = true): ApplyTransactionResult {
    return this.quick_sort(col, ascending);
  }

  filterBy(col: number, needle: string): void {
    this.setColumnFilter(col, { kind: "contains", text: needle });
  }

  clearView(): void {
    const patch = clearViewPatch(this.sheet());
    if (patch) this.document.commit([patch], "structure");
  }

  setViewSort(keys: readonly SortKey[]): ApplyTransactionResult {
    return this.document.commit([viewSortPatch(this.active_sheet, keys)], "structure");
  }

  sortRange(
    range: Range,
    keys: readonly SortKey[],
    options: { hasHeader?: boolean } = {},
  ): ApplyTransactionResult {
    const engine = storeEngine(this.store);
    if (!engine || engine.queryCapability(range.sheet).status !== "complete") {
      return { status: "noop", epoch: this.store_epoch, reason: "incomplete-data" };
    }

    const plan = engine.sortRangePlan(range, keys, options.hasHeader ?? false);
    if (plan.kind === "unchanged") {
      return { status: "noop", epoch: this.store_epoch, reason: "empty" };
    }
    if (plan.kind === "refused") {
      const issue: MutationIssue = {
        kind: "invalid-operation",
        severity: "error",
        operationIndex: 0,
        message: plan.message,
      };
      for (const fn of this.listeners["mutation-rejected"]) fn({ issues: [issue] });
      return { status: "rejected", epoch: this.store_epoch, issues: [issue] };
    }

    return this.document.commit(plan.operations, "sort");
  }

  /**
   * Excel's quick sort: sort the table body that holds the focus cell, or
   * else the selected range, or else the current region around the focus.
   */
  private quick_sort(col: number, ascending: boolean): ApplyTransactionResult {
    const focus = this.selection.focusCell;
    const addr = {
      sheet: this.active_sheet,
      row: focus ? this.to_data_row(focus.row) : 0,
      col,
    };
    const target = this.quick_sort_target(addr);
    if (!target) return { status: "noop", epoch: this.store_epoch, reason: "empty" };

    return this.sortRange(target.range, [{ col, ascending }], { hasHeader: target.hasHeader });
  }

  private quick_sort_target(addr: CellAddress): { range: Range; hasHeader: boolean } | null {
    const table = this.sheet().tables?.find((candidate) => range_holds(candidate.range, addr));
    if (table) {
      const { range } = table;
      const start = { row: range.start.row + (table.headerRow ? 1 : 0), col: range.start.col };
      const end = { row: range.end.row - (table.totalsRow ? 1 : 0), col: range.end.col };
      return { range: { sheet: range.sheet, start, end }, hasHeader: false };
    }

    const range = this.selected_sort_range() ?? currentRegion(this.store, addr);
    if (!range || !range_holds(range, addr)) return null;

    return { range, hasHeader: looksLikeHeader(this.store, range) };
  }

  /**
   * The selected rectangle in data rows, when one rectangle of more than one
   * cell is selected and the rows show in data order. A view sort or filter
   * scatters the data rows of a view rectangle, so it gives `null`.
   */
  private selected_sort_range(): Range | null {
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push(rect));
    const [rect] = rects;
    if (rects.length !== 1 || !rect || this.loadable?.hasView(this.active_sheet)) return null;
    if (rect.r0 === rect.r1 && rect.c0 === rect.c1) return null;

    return {
      sheet: this.active_sheet,
      start: { row: rect.r0, col: rect.c0 },
      end: { row: rect.r1, col: rect.c1 },
    };
  }

  setColumnFilter(col: number, filter: ColumnFilter | null): void {
    const patch = columnFilterPatch(this.sheet(), col, filter);
    if (patch) this.document.commit([patch], "structure");
  }

  setAutoFilter(range: Range | null): ApplyTransactionResult {
    const patch = autoFilterPatch(this.sheet(), range);
    if (!patch) return { status: "noop", epoch: this.store_epoch, reason: "empty" };
    return this.document.commit([patch], "structure");
  }

  getAutoFilter(): AutoFilter | null {
    const auto_filter = this.sheet().autoFilter;
    return auto_filter ? structuredClone(auto_filter) : null;
  }

  reapplyFilter(): ApplyTransactionResult {
    const patch = reapplyFilterPatch(this.sheet());
    if (!patch) return { status: "noop", epoch: this.store_epoch, reason: "empty" };
    return this.document.commit([patch], "structure");
  }

  getColumnFilters(): ReadonlyMap<number, ColumnFilter> {
    return new Map(this.sheet().filters ?? this.loadable?.columnFilters(this.active_sheet) ?? []);
  }

  distinctValues(col: number, limit = DEFAULT_DISTINCT_VALUES_LIMIT): CellScalar[] {
    return this.loadable?.distinctValues(this.active_sheet, col, limit) ?? [];
  }

  hideRows(rows: readonly number[]): void {
    this.document.commit(rowVisibilityPatches(this.sheet(), rows, true), "structure");
  }

  showRows(rows?: readonly number[]): void {
    const sheet = this.sheet();
    const patches = rowVisibilityPatches(sheet, rows ?? [...(sheet.hiddenRows ?? [])], false);
    this.document.commit(patches, "structure");
  }

  hiddenRows(): readonly number[] {
    return [...(this.sheet().hiddenRows ?? [])].sort((a, b) => a - b);
  }

  canPasteVisibleRows(): boolean {
    return this.clipboard.canPasteShownRows;
  }

  sheetRowOf(viewRow: number): number | null {
    if (!Number.isInteger(viewRow) || viewRow < 0 || viewRow >= this.geometry.rowCount) {
      return null;
    }
    return this.to_data_row(viewRow);
  }

  viewRowOf(sheetRow: number): number | null {
    if (!Number.isInteger(sheetRow) || sheetRow < 0 || sheetRow >= this.sheet().rowCount) {
      return null;
    }
    return this.to_view_row(sheetRow);
  }

  goToCell(addr: CellAddress): boolean {
    const target = this.store.getWorkbook().sheets.find((sheet) => sheet.id === addr.sheet);
    if (
      !target ||
      !Number.isInteger(addr.row) ||
      addr.row < 0 ||
      addr.row >= target.rowCount ||
      !Number.isInteger(addr.col) ||
      addr.col < 0
    ) {
      return false;
    }
    if (addr.sheet !== this.active_sheet) this.setActiveSheet(addr.sheet);
    if (addr.sheet !== this.active_sheet || !this.sheet().columns[addr.col]) return false;

    const row = this.to_view_row(addr.row);
    if (row !== null) {
      const cell = { sheet: addr.sheet, row, col: addr.col };
      this.setSelection({ kind: "cell", addr: cell });
      this.scrollToCell(cell);
      return true;
    }
    // A hidden row: nothing shows as selected, as in Excel. The view scrolls
    // to where the row would be.
    this.selection.set(null);
    this.hidden_active = { sheet: addr.sheet, row: addr.row, col: addr.col };
    this.emit_selection();
    const near = this.nearest_shown_row(addr.row, 1) ?? this.nearest_shown_row(addr.row, -1);
    if (near !== null) this.scrollToCell({ sheet: addr.sheet, row: near, col: addr.col });
    this.schedule_render();
    return true;
  }

  getActiveSheetCell(): CellAddress | null {
    if (this.hidden_active) return { ...this.hidden_active };
    const focus = this.selection.focusCell;
    return focus
      ? { sheet: this.active_sheet, row: this.to_data_row(focus.row), col: focus.col }
      : null;
  }

  /**
   * The view row of the row that shows nearest to sheet row `row` in
   * `direction`, or null when none does. View rows show sheet rows in order
   * unless a view sort reorders them, so a binary search finds it; under a
   * view sort the closest sheet row wins.
   */
  private nearest_shown_row(row: number, direction: 1 | -1): number | null {
    const count = this.geometry.rowCount;
    if ((this.sheet().sortKeys?.length ?? 0) > 0) {
      let best: number | null = null;
      let best_row = 0;
      for (let view_row = 0; view_row < count; view_row++) {
        const sheet_row = this.to_data_row(view_row);
        if ((sheet_row - row) * direction <= 0) continue;
        if (best === null || (sheet_row - best_row) * direction < 0) {
          best = view_row;
          best_row = sheet_row;
        }
      }
      return best;
    }
    // The first view row past `row`.
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.to_data_row(middle) <= row) low = middle + 1;
      else high = middle;
    }
    if (direction > 0) return low < count ? low : null;
    return low > 0 ? low - 1 : null;
  }

  hideColumns(cols?: readonly number[]): void {
    const sheet = this.sheet();
    const targets = cols ?? (this.selection.focusCell ? [this.selection.focusCell.col] : []);
    const unique = [...new Set(targets)]
      .filter(
        (col) => col >= 0 && col < sheet.columns.length && sheet.columns[col]?.visible !== false,
      )
      .sort((left, right) => left - right);
    let visible_count = sheet.columns.reduce(
      (count, column) => count + (column.visible === false ? 0 : 1),
      0,
    );
    const patches: DocumentOp[] = [];
    for (const col of unique) {
      if (visible_count <= 1) break;
      patches.push({ op: "setColumn", sheet: this.active_sheet, col, patch: { visible: false } });
      visible_count--;
    }
    this.document.commit(patches, "structure");
  }

  showColumns(cols?: readonly number[]): void {
    const sheet = this.sheet();
    const targets =
      cols ?? sheet.columns.flatMap((column, col) => (column.visible === false ? [col] : []));
    const patches: DocumentOp[] = [];
    for (const col of new Set(targets)) {
      if (col < 0 || col >= sheet.columns.length || sheet.columns[col]?.visible !== false) continue;
      patches.push({ op: "setColumn", sheet: this.active_sheet, col, patch: { visible: true } });
    }
    this.document.commit(patches, "structure");
  }

  hiddenColumns(): readonly number[] {
    return this.sheet().columns.flatMap((column, col) => (column.visible === false ? [col] : []));
  }

  groupRows(start: number, end: number): void {
    const groups = addRowGroup(this.sheet().rowGroups, start, end);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.active_sheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  ungroupRows(start: number, end: number): void {
    const groups = removeRowGroup(this.sheet().rowGroups, start, end);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.active_sheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  setGroupCollapsed(start: number, collapsed: boolean): void {
    const groups = collapseRowGroup(this.sheet().rowGroups, start, collapsed);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.active_sheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  rowGroups(): readonly RowGroup[] {
    return this.sheet().rowGroups ?? [];
  }

  undo(): void {
    if (!this.read_only) this.document.undo();
    this.queue_command_state_change();
  }

  redo(): void {
    if (!this.read_only) this.document.redo();
    this.queue_command_state_change();
  }

  private emit_export_error(error: unknown, format: "csv" | "xlsx"): void {
    if (this.lifetime.closed) return;
    const operation = format === "csv" ? "delimited-export" : "xlsx-export";
    const failure = normalizeSheetwriteError(error, "export-failed", operation, { format });
    this.action_feedback.show(`Export failed: ${failure.message} Try again.`);
    for (const listener of this.listeners["export-error"]) {
      listener({ format, error: failure });
    }
  }

  /** Both export formats write only the active sheet, so only its rows must be loaded. */
  private require_complete_sheet(): void {
    const capability = this.loadable?.queryCapability(this.active_sheet);
    if (capability?.status === "incomplete") {
      throw new IncompleteDataError(this.active_sheet, capability);
    }
  }

  exportCsv(filename: string): void {
    this.require_complete_sheet();
    downloadBytesIn(
      this.lifetime,
      toCsv(this.sheet(), this.store),
      filename,
      "text/csv;charset=utf-8",
    );
  }

  async exportXlsx(filename: string): Promise<void> {
    // Destroy aborts the export; its listeners on the signal go with this scope.
    const run = (this.document_operations ??= new ScopeSlot(this.lifetime)).current().child();
    try {
      this.require_complete_sheet();

      // XLSX conversion is optional document work, not initial grid code.
      const { exportWorkbookFile: export_workbook_file } = await import("./workbook-io.js");
      await export_workbook_file(this, filename, run, this.lifetime);
    } finally {
      run.close();
    }
  }

  /**
   * A resolution query stops being useful after it changes, so replace it with
   * one matching the current display. This catches DPR-only changes that do not
   * resize the host and therefore never reach ResizeObserver.
   */
  private arm_resolution_listener(): void {
    this.resolution_media_query?.removeEventListener("change", this.on_resolution_change);
    this.resolution_media_query = null;
    if (typeof globalThis.matchMedia !== "function") return;

    const device_pixel_ratio = globalThis.devicePixelRatio ?? 1;
    this.resolution_media_query = globalThis.matchMedia(`(resolution: ${device_pixel_ratio}dppx)`);
    this.resolution_media_query.addEventListener("change", this.on_resolution_change);
  }

  private on_resize(): void {
    this.read_windows.noteViewportMoved();
    this.sync_sizer();
    this.render();
  }

  /**
   * A clipboard shortcut has no caller to await it. Its outcomes need no
   * message (the shortcut itself is the fallback the menu messages suggest),
   * but a failure is a bug: tell the user, and let the error reach the host.
   */
  private run_keyboard_clipboard(action: Promise<ClipboardOutcome>): void {
    void action.then(undefined, (error: unknown) => {
      if (this.lifetime.closed) return;
      this.action_feedback.show(`The command did not finish: ${errorDetail(error)}`);
      throw error;
    });
  }

  /** Opens the history panel or its Save Version form; the history add-on sets it. */
  declare historyCommand?: (action: "open" | "save") => void;

  /** Run `cleanup` when the grid is destroyed. */
  addCleanup(cleanup: () => void): void {
    this.lifetime.add(cleanup);
  }

  /**
   * Closing the root scope first aborts every running operation and frees the
   * chrome, panels and timers it owns. The grid's own parts follow in a fixed
   * order, because later ones (the store, the renderer) are read by earlier ones.
   */
  destroy(): void {
    if (this.lifetime.closed) return;
    this.remove_engine_failure_listener();
    const failures = new FirstFailure();
    const cleanup = (operation: () => void): void => failures.run(operation);

    cleanup(() => this.lifetime.close());
    cleanup(() => this.datasource_controller.destroy());
    cleanup(() => this.mutation_revisions.clear());
    cleanup(() => this.read_windows.destroy());
    cleanup(() => this.interactions.destroy());
    cleanup(() => this.notes.destroy());
    cleanup(() => this.object_layer.destroy());
    cleanup(() =>
      this.resolution_media_query?.removeEventListener("change", this.on_resolution_change),
    );
    this.resolution_media_query = null;
    cleanup(() => this.document.destroy());
    cleanup(() => this.dispose_store());
    // A caller-provided store remains owned by its caller.
    if (this.owns_store) cleanup(() => this.loadable?.dispose());
    cleanup(() => this.renderer.destroy());
    cleanup(() => this.dom_overlay.destroy());
    cleanup(() => this.scroller.remove());
    cleanup(() => this.overlay_painter.destroy());
    cleanup(() => this.sheet_tabs?.destroy());
    cleanup(() => this.tab_bar?.remove());
    cleanup(() => this.panel_host.remove());
    cleanup(() => this.viewport_el.remove());
    cleanup(() => this.aria_mirror.destroy());
    cleanup(() => this.host.classList.remove("sheetwrite"));
    cleanup(() => {
      for (const listeners of Object.values(this.listeners)) listeners.clear();
    });

    failures.rethrow();
  }

  trimMemory(): void {
    if (this.lifetime.closed) return;
    this.open_side_panel?.trimMemory?.();

    // A worker drops its strings only when the host reader drops its own, so
    // the next frame resends them. A store without an engine sends no pool ids.
    const engine = storeEngine(this.store);
    if (engine) {
      engine.trimMemory();
      this.renderer.trimMemory?.();
    }
    trimNumberFormatCaches();
    this.measure_context = null;
    this.overlay_painter.trimMemory();

    // The next frame reads its window again, so a worker renderer gets every
    // string it paints, and the same cells paint the same output.
    this.read_windows.invalidateData();
    this.schedule_render();
  }
}

/** The cells whose contents or style `patch` writes; null for row, column, sheet and object edits. */
function changed_cells(patch: DocumentOp): Range | null {
  switch (patch.op) {
    case "set":
    case "setNote":
      return { sheet: patch.addr.sheet, start: patch.addr, end: patch.addr };

    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
      return patch.range;

    case "moveCells":
      return movedBlock(patch);

    default:
      return null;
  }
}

function append_pad_columns(columns: Column[], target: number): void {
  for (let c = columns.length; c < target; c++) {
    columns.push({ key: `__pad_${c}`, header: "", width: DEFAULT_COL_WIDTH, type: "general" });
  }
}

/**
 * Columns needed to satisfy `min_columns` and, for a spreadsheet, to fill the
 * host width. A data grid's columns come from the data, so it adds empty
 * columns only when the host asks for them with `min_columns`.
 */
function pad_target(
  host: HTMLElement,
  min_columns: number | undefined,
  presentation: GridPresentation,
): number {
  if (presentation === "data-grid") return min_columns ?? 0;
  const fill_width = host.clientWidth - DEFAULT_THEME.rowHeaderWidth;
  const fill_cols = fill_width > 0 ? Math.ceil(fill_width / DEFAULT_COL_WIDTH) + 1 : 0;
  return Math.max(min_columns ?? 0, fill_cols);
}

/**
 * Same configuration by shallow own-property comparison. Fresh-but-identical
 * flag objects from declarative hosts compare equal. Ribbon settings compare
 * by field so a re-render does not reset the user's layout choice. Arrays,
 * functions, and other nested objects recreated inline compare different
 * (conservatively rebuilding).
 */
function shallow_equal_config(a: GridConfig | undefined, b: GridConfig | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const a_keys = Object.keys(a) as Array<keyof GridConfig>;
  const b_keys = Object.keys(b) as Array<keyof GridConfig>;
  if (a_keys.length !== b_keys.length) return false;

  for (const key of a_keys) {
    if (key === "ribbon" ? !same_ribbon_config(a.ribbon, b.ribbon) : !Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function same_ribbon_config(a: GridConfig["ribbon"], b: GridConfig["ribbon"]): boolean {
  if (typeof a !== "object" || typeof b !== "object") return Object.is(a, b);

  return a.mode === b.mode && a.compactWidth === b.compactWidth;
}

/** Whether `range` holds `addr`; ranges here are normalized. */
function range_holds(range: Range, addr: CellAddress): boolean {
  return (
    range.sheet === addr.sheet &&
    addr.row >= range.start.row &&
    addr.row <= range.end.row &&
    addr.col >= range.start.col &&
    addr.col <= range.end.col
  );
}

// Bits of what one committed change requires of the active sheet's view.
const GEOMETRY_CHANGED = 1;
const REBUILD_ROWS = 2;
const RECONCILE_VIEW = 4;
const REBUILD_COLUMNS = 8;
const APPLY_LAYOUT = 16;
const SHEETS_CHANGED = 32;
const RESET_DATASOURCE = 64;
/** Row heights changed without moving, hiding or showing rows. */
const RESIZE_ROWS = 128;

/** Effects that change which cells the view shows or where they sit. */
const VIEW_EFFECTS = REBUILD_ROWS | RESIZE_ROWS | RECONCILE_VIEW | REBUILD_COLUMNS | APPLY_LAYOUT;

/** Validation, hyperlinks, protection and charts sit on a sheet without moving its cells. */
function annotates_sheet(patch: DocumentOp): boolean {
  switch (patch.op) {
    case "setValidationRule":
    case "removeValidationRule":
    case "setHyperlink":
    case "removeHyperlink":
    case "setProtectedRange":
    case "removeProtectedRange":
    case "setChart":
    case "removeChart":
      return true;
    default:
      return false;
  }
}

/** Row and column inserts, removals and moves shift every cell after them. */
function changes_sheet_structure(patch: DocumentOp): boolean {
  switch (patch.op) {
    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
      return true;
    default:
      return false;
  }
}

/**
 * The non-empty cell an auto-fit measures at `row` of a window, with its
 * column style under its own; null for an empty cell.
 */
function auto_fit_cell(
  sheet: Sheet,
  view: VisibleWindowView,
  row: number,
  column_index: number,
  col: number,
): { value: CellScalar; style: CellStyle; column: Column } | null {
  const value_index = (row - view.rows.start) * view.cols.length + column_index;
  const value = view.values[value_index];
  if (value === null || value === undefined || value === "") return null;

  const column = sheet.columns[col];
  if (!column) return null;

  const cell_style = view.styles[view.styleIds[value_index] ?? 0] ?? EMPTY_STYLE;
  const style = column.cellStyle ? { ...column.cellStyle, ...cell_style } : cell_style;
  return { value, style, column };
}
