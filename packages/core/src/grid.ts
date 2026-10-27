import { colToA1 } from "./a1.js";
import { type ActionFeedback, attachActionFeedback } from "./action-feedback.js";
import { AriaMirror } from "./aria-mirror.js";
import {
  fontFor,
  intersectingMerges,
  layoutTextLines,
  mergeAnchorAt,
  prepareMergeIndex,
} from "./canvas-paint.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { cellDisplayText, cellScalarToText } from "./cell-input.js";
import { ClipboardController } from "./clipboard-controller.js";
import { DatasourceController } from "./datasource-controller.js";
import { DocumentController } from "./document-controller.js";
import {
  admitTransactionResources,
  assertWorkbookAllocationLimits,
  resolveTransactionResourceLimits,
  validateTransactionResources,
} from "./document-protocol.js";
import { DomOverlay } from "./dom-overlay.js";
import {
  ENGINE_LOAD_HINT,
  isEngineLoaded as isLoaded,
  loadEngine,
  type SheetwriteEngine,
} from "./engine.js";
import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { downloadBytes, toCsv, toXlsxTable } from "./export.js";
import { FindBar } from "./find-bar.js";
import { stepFontSizePx, stepNumberFormatDecimals } from "./format-presets.js";
import { GeometryLayoutController } from "./geometry-layout-controller.js";
import { hyperlinkAt, resolveHyperlinkTarget, sanitizeCellHyperlink } from "./hyperlink.js";
import { InteractionSessions } from "./interaction-sessions.js";
import { Keymap } from "./keymap.js";
import { MutationRevisionIndex, type MutationRevisionStats } from "./mutation-revision-index.js";
import { type NoteCell, NotePopover } from "./note-popover.js";
import { ObjectLayer } from "./object-layer.js";
import { OverlayPainter } from "./overlay-painter.js";
import { clonePivots, pivotOwner, uncomputedPivotResult, withoutSavedOutput } from "./pivot.js";
import { type PaintedCells, ReadWindowController } from "./read-window-controller.js";
import {
  createRuntimeResourceSnapshot,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
} from "./resource-accounting.js";
import { RIBBON_EXPANDED_HEIGHT } from "./ribbon/ribbon-metrics.js";
import type { Ribbon } from "./ribbon/ribbon.js";
import { SearchController } from "./search-controller.js";
import { type CellRef, SelectionModel, type SelRect } from "./selection.js";
import { sheetNameKey, validateSheetName } from "./sheet-name.js";
import { SheetTabs } from "./sheet-tabs.js";
import { mountSidePanel } from "./side-panel.js";
import { IncompleteDataError, SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import {
  addRowGroup,
  collapseRowGroup,
  removeRowGroup,
  visibleSheetNeighbor,
} from "./store/ranges.js";
import { StyleActions } from "./style-actions.js";
import { Toolbar } from "./toolbar.js";
import { beginGridTransactionAdmission } from "./transaction-admission.js";
import type {
  CellHyperlink,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatRule,
} from "./types/cell.js";
import type { ChartDefinition } from "./types/chart.js";
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
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
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
import type { KeyboardAction, KeyboardOptions } from "./types/grid.js";
import type {
  CellEditor,
  CellInputSnapshot,
  Grid,
  GridActions,
  GridCommandName,
  GridCommandState,
  GridConfig,
  GridEvents,
  GridOptions,
  GridPanel,
  GridPresentation,
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
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";
import { seedWidgetTheme } from "./widget-theme.js";
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
  const layoutClamp = sizer.getBoundingClientRect().height;
  scroller.scrollTop = 1_000_000_000_000;
  const scrollClamp = scroller.scrollTop > 0 ? scroller.scrollTop + scroller.clientHeight : 0;
  scroller.remove();
  const measured = Math.min(
    Number.isFinite(layoutClamp) && layoutClamp > 0 ? layoutClamp : Number.POSITIVE_INFINITY,
    Number.isFinite(scrollClamp) && scrollClamp > 0 ? scrollClamp : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(measured) || measured < 1_000_000) return MAX_ELEMENT_HEIGHT_FALLBACK;
  return Math.floor(measured) - MAX_ELEMENT_HEIGHT_MARGIN;
}
/** Interaction-tuning default: paint six row and visible-column positions past each viewport edge. */
const DEFAULT_OVERSCAN = 6;
/** Width of synthesized workbook and presentation-padding columns, in CSS pixels. */
const DEFAULT_COL_WIDTH = 100;
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
  "exportCsv",
  "exportXlsx",
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

/**
 * Cells read per store call when summarizing a selection: about a frame's
 * work (measured ~10 ms for 64k cells), so huge selections yield between reads.
 */
const SUMMARY_CELLS_PER_READ = 65_536;

function isFormattingCommand(command: GridCommandName): boolean {
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

function effectiveStyleValue<Key extends keyof CellStyle>(
  cell: CellStyle,
  column: CellStyle | undefined,
  key: Key,
): CellStyle[Key] {
  return Object.hasOwn(cell, key) ? cell[key] : column?.[key];
}

function formattingCommandActive(
  command: GridCommandName,
  cell: CellStyle,
  column: CellStyle | undefined,
): boolean {
  switch (command) {
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
      return effectiveStyleValue(cell, column, command) === true;
    case "alignLeft":
      return effectiveStyleValue(cell, column, "align") === "left";
    case "alignCenter":
      return effectiveStyleValue(cell, column, "align") === "center";
    case "alignRight":
      return effectiveStyleValue(cell, column, "align") === "right";
    case "alignTop":
      return effectiveStyleValue(cell, column, "verticalAlign") === "top";
    case "alignMiddle":
      return (effectiveStyleValue(cell, column, "verticalAlign") ?? "middle") === "middle";
    case "alignBottom":
      return effectiveStyleValue(cell, column, "verticalAlign") === "bottom";
    case "wrap":
      return effectiveStyleValue(cell, column, "wrap") === true;
    case "border":
      return effectiveStyleValue(cell, column, "border") !== undefined;
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
function scaleFontPx(font: string, zoom: number): string {
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
function adaptiveRowHeaderWidth(theme: Theme, dataRowCount: number): number {
  if (theme.rowHeaderWidth <= 0) return theme.rowHeaderWidth;
  const digits = String(Math.max(1, dataRowCount)).length;
  const fontMatch = /(\d+(?:\.\d+)?)px/.exec(theme.font);
  const fontPx = fontMatch ? Number(fontMatch[1]) : 12;
  return Math.max(theme.rowHeaderWidth, Math.ceil(digits * fontPx * 0.6 + 12));
}

/**
 * Load one WASM engine before `createGrid`. The default is `@sheetwrite/wasm`.
 * Pass the `@sheetwrite/formulas` module as the second argument to select the full engine.
 *
 * @example
 * ```ts
 * import { initSheetwrite } from "@sheetwrite/core";
 * import * as formulas from "@sheetwrite/formulas";
 *
 * await initSheetwrite(undefined, formulas);
 * ```
 * @see /docs/start/choose-an-engine/
 * @see createGrid
 */
export async function initSheetwrite(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
  engine?: SheetwriteEngine,
): Promise<void> {
  try {
    await loadEngine(source, engine);
  } catch (error) {
    throw normalizeSheetwriteError(error, "initialization-failed", "initialize");
  }
}

/** Whether `initSheetwrite` has completed — the single readiness source. */
export function isSheetwriteReady(): boolean {
  return isLoaded();
}

/** Read `--sheetwrite-*` CSS custom properties into a partial theme. */
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
  private readonly ownsStore: boolean;
  private readonly host: HTMLElement;
  private readonly scroller: HTMLDivElement;
  private readonly sizer: HTMLDivElement;
  private renderer: Renderer;
  private readonly interactions: InteractionSessions;
  private readonly ariaMirror: AriaMirror;
  private readonly searchController: SearchController;
  private readonly clipboard: ClipboardController;
  private readonly styleActions: StyleActions;
  private readonly document: DocumentController;
  private readonly datasourceController: DatasourceController;
  private readonly geometry: GeometryLayoutController;
  private readonly overlayPainter: OverlayPainter;
  private readonly domOverlay: DomOverlay;
  private readonly readWindows: ReadWindowController;
  private overscan: number;
  private displayedHiddenRows: Set<number>;
  private displayedHasView: boolean;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;
  private readOnly: boolean;
  private maxElementHeight = MAX_ELEMENT_HEIGHT_FALLBACK;
  private lastDevicePixelRatio = 1;
  private tabBar: HTMLDivElement | null = null;
  private sheetTabs: SheetTabs | null = null;
  private tabBarHeight = 0;
  private keyboardPolicy: boolean | KeyboardOptions | ((e: KeyboardEvent) => boolean) = true;
  private keymap: Keymap;
  private zoom = 1;
  private baseTheme: Theme;
  private toolbar: Toolbar | null = null;
  private ribbon: Ribbon | null = null;
  /** Bumped whenever chrome is rebuilt, so a ribbon chunk that loads late is dropped. */
  private chromeGeneration = 0;
  private findBar: FindBar | null = null;
  private readonly notes: NotePopover;
  private readonly actionFeedback: ActionFeedback;
  private config: GridConfig | undefined;
  private readonly presentation: GridPresentation;
  private readonly hyperlinkActivation: "event-only" | "internal-navigation" | "disabled";
  private toolbarHeight = 0;
  private readonly viewportEl: HTMLDivElement;
  private readonly customRenderers = new Map<string, CellRenderer>();
  private readonly customEditors = new Map<string, CellEditor>();
  private readonly listeners: { [K in keyof GridEvents]: Set<(e: GridEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    scroll: new Set(),
    "edit-begin": new Set(),
    "edit-commit": new Set(),
    search: new Set(),
    "command-state-change": new Set(),
    "active-sheet": new Set(),
    "hyperlink-activate": new Set(),
    "renderer-fallback": new Set(),
    "datasource-error": new Set(),
    "mutation-rejected": new Set(),
    "export-error": new Set(),
    "theme-change": new Set(),
    "chart-select": new Set(),
    "chart-activate": new Set(),
  };

  /** Which renderer actually constructed; set by `createRenderer`. */
  private activeRendererKind: "canvas" | "worker" = "canvas";

  private theme: Theme;
  private activeSheet: SheetId;
  /** Memoized active `Sheet` object; invalidated on store change / tab switch. */
  private activeSheetCache: Sheet | null = null;
  /** Pre-change worksheet state retained for deterministic session fallback through remote batches. */
  private sessionSheets: Array<{ id: SheetId; visibility?: SheetVisibility }> = [];
  private readonly virtualColumnTargets = new Map<SheetId, number>();
  private selection: SelectionModel;
  private readonly mutationRevisions = new MutationRevisionIndex();
  private destroyed = false;
  private storeEpoch = 0;
  private windowContentRevision = 0;
  private sourceSheet: SheetId | null = null;
  private sheetHasSources = true;
  private autoFitGeneration = 0;
  private autoFitFrame = 0;
  private autoFitActive = false;
  private commandStateQueued = false;
  private commandStateGeneration = 0;
  private readonly autoFitStats = {
    windowRequests: 0,
    maxWindowCells: 0,
    scheduledChunks: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    committedPatches: 0,
  };
  private resizeObserver: ResizeObserver | null = null;
  private resolutionMediaQuery: MediaQueryList | null = null;
  private readonly onResolutionChange = (): void => {
    if (this.destroyed) return;
    this.armResolutionListener();
    this.syncSizer();
    this.readWindows.invalidate();
    this.scheduleRender();
  };
  private readonly onScroll = () => this.scheduleRender();
  private readonly disposeStore: () => void;
  private readonly objectLayer: ObjectLayer;
  private readonly panelHost: HTMLDivElement;
  /** Cleanup of the open side panel; `null` while no panel is open. */
  private panelDispose: (() => void) | null = null;
  /** Detaches the chart and pivot panel controller once its chunk has loaded. */
  private disposePanels: (() => void) | null = null;

  constructor(
    host: HTMLElement,
    opts: GridOptions,
    store?: Store,
    ownsStore = store === undefined,
  ) {
    this.keymap = new Keymap(opts.config);
    this.transactionResourceLimits = resolveTransactionResourceLimits(
      opts.transactionResourceLimits,
    );
    this.host = host;
    this.presentation = opts.presentation ?? "spreadsheet";
    this.hyperlinkActivation =
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
        transactionResourceLimits: this.transactionResourceLimits,
      });
    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    this.store.setProtectionResolver?.(opts.protectionResolver, opts.mutationPolicy);
    this.ownsStore = ownsStore;
    const virtualTarget = padTarget(host, opts.minColumns, this.presentation);
    for (const sheet of workbook.sheets) {
      this.virtualColumnTargets.set(sheet.id, Math.max(sheet.columns.length, virtualTarget));
    }
    const datasource = opts.datasource;
    this.readOnly = opts.readOnly ?? false;
    this.config = opts.config;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.baseTheme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };
    const requestedActive = opts.workbook.activeSheet;
    const requestedSheet = workbook.sheets.find((sheet) => sheet.id === requestedActive);
    this.activeSheet =
      requestedSheet && (requestedSheet.visibility ?? "visible") === "visible"
        ? requestedActive
        : (visibleSheetNeighbor(workbook.sheets, requestedActive) ??
          workbook.sheets.find((sheet) => (sheet.visibility ?? "visible") === "visible")?.id ??
          requestedActive);
    this.sessionSheets = workbook.sheets.map(({ id, visibility }) => ({ id, visibility }));
    this.displayedHiddenRows = new Set(this.sheet().hiddenRows);
    this.displayedHasView = this.loadable?.hasView(this.activeSheet) ?? false;
    this.theme = this.withAdaptiveGutter(
      this.baseTheme,
      workbook.sheets.find((sheet) => sheet.id === this.activeSheet)?.rowCount ?? 0,
    );
    this.tabBarHeight = opts.config?.tabs !== false ? 28 : 0;
    this.document = new DocumentController({
      store: this.store,
      loadable: this.loadable,
      readOnly: () => this.readOnly,
      epoch: () => this.storeEpoch,
      materializeVirtualColumns: (patches) => this.materializeVirtualColumns(patches),
      onMutationRejected: (issues) => {
        for (const fn of this.listeners["mutation-rejected"]) fn({ issues });
      },
      onHistoryApplied: () => {
        this.emitSelection();
        this.render();
      },
      transactionResourceLimits: this.transactionResourceLimits,
      admitTransaction: (operations) => beginGridTransactionAdmission(this, operations),
      trustedResourceCallbacks: true,
    });

    // Headless hosts opt out of (or intercept) the stock key bindings once at
    // construction; the input controller consults this on every keydown.
    const keyboardOpt = opts.config?.keyboard ?? true;
    this.keyboardPolicy =
      typeof keyboardOpt === "function" ? (e: KeyboardEvent) => keyboardOpt(e, this) : keyboardOpt;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.customRenderers.set(name, r);
    }
    for (const [name, editor] of Object.entries(opts.editors ?? {})) {
      this.customEditors.set(name, editor);
    }

    const sheet = this.sheet();
    this.maxElementHeight = measureMaxElementHeight();
    this.lastDevicePixelRatio = globalThis.devicePixelRatio ?? 1;
    this.geometry = new GeometryLayoutController(
      {
        sheet: () => this.sheet(),
        activeSheet: () => this.activeSheet,
        loadable: this.loadable,
        theme: () => this.theme,
        zoom: () => this.zoom,
        maxElementHeight: () => this.maxElementHeight,
      },
      host.clientHeight - this.tabBarHeight,
    );
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.datasourceController = new DatasourceController(
      {
        datasource,
        columns: (sheetId) => {
          const liveSheet = this.sheetById(sheetId);
          if (!liveSheet) throw new Error(`Sheetwrite: unknown sheet ${sheetId}`);
          return liveSheet.columns;
        },
        loadable: this.loadable,
        activeSheet: () => this.activeSheet,
        rowCount: (sheetId) => this.sheet(sheetId).rowCount,
        revision: () => this.storeEpoch,
        isCellNewerThan: (address, revision) =>
          this.mutationRevisions.isNewerThan(address, revision),
        retainRevision: (revision) => this.mutationRevisions.retainRevision(revision),
        onRowsLoaded: () => {
          this.storeEpoch += 1;
          this.windowContentRevision += 1;
          this.scheduleRender();
        },
        onError: (request, error) => {
          const failure = normalizeSheetwriteError(
            error,
            "datasource-request-failed",
            "datasource-request",
            {
              protocol: request.protocol,
              sheet: request.sheet,
              start: request.start,
              end: request.end,
              revision: request.revision,
              columns: request.columns.map(({ start, end, keys }) => ({
                start,
                end,
                keys: [...keys],
              })),
            },
          );
          for (const fn of this.listeners["datasource-error"]) {
            fn({ request, error: failure });
          }
        },
      },
      sheet.rowCount,
    );
    this.searchController = new SearchController({
      store: this.store,
      loadable: this.loadable,
      activeSheet: () => this.activeSheet,
      sheet: (id) => this.sheet(id),
      toViewRow: (dataRow) => this.toViewRow(dataRow),
      viewportAnchor: () =>
        this.geometry.viewportAnchor(
          this.geometry.toContent(this.scroller.scrollTop),
          this.scroller.scrollLeft,
        ),
      scrollToCell: (addr) => this.scrollToCell(addr),
      scheduleRender: () => this.scheduleRender(),
      emit: (result) => {
        for (const fn of this.listeners.search) fn(result);
      },
      readOnly: () => this.readOnly,
      commit: (patches) => this.document.commit(patches, "replace"),
    });
    this.clipboard = new ClipboardController({
      store: this.store,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      colIndices: () => this.geometry.columnIndices,
      readOnly: () => this.readOnly,
      mergeAnchorAt: (row, col) => this.mergeAnchorAt(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches, reason) => this.document.commit(patches, reason),
    });
    this.styleActions = new StyleActions({
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      readOnly: () => this.readOnly,
      theme: () => this.theme,
      merges: () => this.sheet().merges ?? [],
      anchorCell: (row, col) => this.anchorCell(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches) => this.document.commit(patches, "style"),
    });

    this.actions = this.buildActions();

    // host chrome: optional toolbar (top) + viewport (cells) + optional tab bar.
    host.classList.add("sheetwrite");
    host.style.position = host.style.position || "relative";
    host.style.overflow = "hidden";
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;
    this.actionFeedback = attachActionFeedback(this, host);

    const config = this.config;
    this.createToolbar(config);

    if (config?.find !== false) {
      this.findBar = new FindBar(host, this.theme, this, this.readOnly);
    }

    this.viewportEl = document.createElement("div");
    this.viewportEl.className = "sheetwrite-viewport";
    this.viewportEl.style.cssText = `position:absolute;left:0;right:0;top:${this.toolbarHeight}px;bottom:${this.tabBarHeight}px;`;
    host.appendChild(this.viewportEl);

    this.scroller = document.createElement("div");
    this.scroller.className = "sheetwrite-scroller";
    this.scroller.style.cssText = "position:absolute;inset:0;overflow:auto;will-change:transform;";
    this.sizer = document.createElement("div");
    this.sizer.className = "sheetwrite-sizer";
    this.scroller.appendChild(this.sizer);
    this.viewportEl.appendChild(this.scroller);

    // The side panel docks on the right edge, between the ribbon and the tab bar.
    this.panelHost = document.createElement("div");
    this.panelHost.className = "sheetwrite-panel-host";
    this.panelHost.hidden = true;
    this.panelHost.style.cssText = `position:absolute;right:0;width:${PANEL_WIDTH}px;top:${this.toolbarHeight}px;bottom:${this.tabBarHeight}px;`;
    host.appendChild(this.panelHost);

    this.renderer = this.createRenderer(opts, this.viewportEl);
    this.renderer.setRenderers(this.customRenderers);

    this.interactions = new InteractionSessions({
      host,
      scroller: this.scroller,
      viewportEl: this.viewportEl,
      grid: this,
      customEditors: this.customEditors,
      highlightCells: (ranges) => this.highlightCells(ranges),
      columnHeader: (col) => this.columnHeader(col),
      toViewRow: (row) => this.toViewRow(row),
      editListeners: this.listeners,
      findBar: () => this.findBar,
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      theme: () => this.theme,
      colIndices: () => this.geometry.columnIndices,
      firstCol: () => this.firstCol(),
      lastCol: () => this.lastCol(),
      nextVisibleCol: (col, dir) => this.nextVisibleCol(col, dir),
      previousVisibleColumn: (col) => this.geometry.previousVisibleColumn(col),
      colAtX: (contentX) => this.colAtX(contentX),
      rowAtOffset: (contentY) => this.geometry.rowAtOffset(contentY),
      rowCount: () => this.geometry.rowCount,
      contentTop: () => this.geometry.toContent(this.scroller.scrollTop),
      viewportH: () => this.viewportH(),
      colLeftOf: (col) => this.colLeftOf(col),
      rowTop: (row) => this.geometry.rowOffset(row),
      rowHeight: (row) => this.geometry.rowHeight(row),
      visibleRowWindow: () => this.readWindows.sampleRows(),
      previewColumnWidth: (col, width) => {
        this.geometry.previewColumnWidth(col, width);
        this.applyLayout();
        this.scheduleRender();
      },
      previewRowHeight: (row, height) => {
        this.geometry.previewRowHeight(row, height);
        this.syncSizer();
        this.readWindows.invalidate();
        this.scheduleRender();
      },
      clearResizePreview: () => {
        this.geometry.clearResizePreview();
        this.applyLayout();
        this.scheduleRender();
      },
      dataEdge: (row, col, dRow, dCol) => this.dataEdge(row, col, dRow, dCol),
      keyboard: () => this.keyboardPolicy,
      keymap: () => this.keymap,
      contentXAt: (viewportX) => this.contentXAt(viewportX),
      contentYAt: (viewportY) => this.contentYAt(viewportY),
      zoom: () => this.zoom,
      screenRect: (row, col, contentTop, scrollLeft) =>
        this.screenRect(row, col, contentTop, scrollLeft),
      anchorCell: (row, col) => this.anchorCell(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      clearSelection: () => this.clearSelection(),
      emitSelection: () => this.emitSelection(),
      scrollToCell: (addr) => this.scrollToCell(addr),
      activateHyperlink: (addr) => {
        try {
          return this.activateHyperlink(addr);
        } catch {
          return false;
        }
      },
      scheduleRender: () => this.scheduleRender(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      copy: () => this.clipboard.copy(),
      cut: () => this.clipboard.cut(),
      paste: () => void this.clipboard.paste(),
      pasteValues: () => void this.clipboard.pasteValues(),
      commit: (patches, reason) => this.document.commit(patches, reason),
      readOnly: () => this.readOnly,
      onEditStart: () => this.notes.hideCard(),
    });
    this.interactions.configureMenu(config, this.theme);

    this.notes = new NotePopover({
      host,
      scroller: this.scroller,
      theme: this.baseTheme,
      cellAt: (clientX, clientY) => {
        // The row header column is not a cell, though hit-testing clamps it to the first one.
        const left = this.viewportEl.getBoundingClientRect().left;
        if (clientX - left < this.theme.rowHeaderWidth) return null;

        const cell = this.interactions.cellAtPointer(clientX, clientY);
        return cell ? this.noteCell(cell.row, cell.col) : null;
      },
      noteAt: (address) => this.getNote(address),
      cellRect: (cell) => {
        const viewport = this.viewportEl.getBoundingClientRect();
        const rect = this.screenRect(
          cell.row,
          cell.col,
          this.geometry.toContent(this.scroller.scrollTop),
          this.scroller.scrollLeft,
        );
        const left = viewport.left + rect.x;
        const top = viewport.top + rect.y;
        return { left, top, right: left + rect.w, bottom: top + rect.h };
      },
      editorLabel: (cell) => `Note for ${this.columnHeader(cell.col)}, row ${cell.row + 1}`,
      commit: (address, text) => this.setNote(address, text),
      returnFocus: () => this.host.focus(),
    });

    this.overlayPainter = new OverlayPainter(this.viewportEl, {
      theme: () => this.theme,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      rowOffsetOf: (row) => this.geometry.rowOffset(row),
      freeze: () => ({
        fr: this.frozenRowCount(),
        frozenH: this.frozenHeight(),
        frozenW: this.frozenWidth(),
        firstBodyCol: this.firstBodyCol(),
      }),
      zoom: () => this.zoom,
      colLeftOf: (col) => this.colLeftOf(col),
      screenRect: (row, col, contentTop, scrollLeft) =>
        this.screenRect(row, col, contentTop, scrollLeft),
      toViewRow: (dataRow) => this.toViewRow(dataRow),
      isEditing: () => this.interactions.isEditing,
      fillTarget: () => this.interactions.fillPreview,
      fillHandleScreen: (contentTop, scrollLeft) =>
        this.interactions.fillHandleScreen(contentTop, scrollLeft),
      searchMatches: () => this.searchController.matches,
      searchActive: () => this.searchController.active,
      searchVersion: () => this.searchController.version,
      geometryVersion: () => this.readWindows.geometryVersion,
      scheduleRender: () => this.scheduleRender(),
    });

    this.domOverlay = new DomOverlay(this.viewportEl, {
      host,
      geometry: this.geometry,
    });
    this.domOverlay.setRenderers(this.customRenderers);
    this.domOverlay.setTheme(this.theme);

    this.objectLayer = new ObjectLayer({
      viewport: this.viewportEl,
      scroller: this.scroller,
      store: this.store,
      geometry: this.geometry,
      activeSheet: () => this.activeSheet,
      charts: () => this.sheetById(this.activeSheet)?.charts ?? [],
      theme: () => this.theme,
      zoom: () => this.zoom,
      readOnly: () => this.readOnly,
      setChart: (chart) => this.setChart(this.activeSheet, chart),
      removeChart: (id) => this.removeChart(this.activeSheet, id),
      focusGrid: () => this.host.focus(),
      onSelect: (chart) => {
        for (const fn of this.listeners["chart-select"]) fn(chart);
      },
      onActivate: (chart) => {
        for (const fn of this.listeners["chart-activate"]) fn(chart);
      },
      isHistoryShortcut: (event) => {
        const action = this.keymap.action(event);
        return action === "undo" || action === "redo";
      },
    });
    this.objectLayer.sync();

    this.ariaMirror = new AriaMirror({
      host,
      scroller: this.scroller,
      overlay: this.overlayPainter.element,
      viewport: this.viewportEl,
      rowCount: sheet.rowCount,
      colCount: this.geometry.columnIndices.length,
      readOnly: this.readOnly,
      presentation: this.presentation,
      columnHeader: (col) => this.columnHeader(col),
      focusCell: () => this.selection.focusCell,
      noteAt: (row, col) =>
        this.getNote({ sheet: this.activeSheet, row: this.toDataRow(row), col }),
      selection: () => this.selection.toSelection(this.activeSheet),
    });

    this.readWindows = new ReadWindowController({
      renderer: () => this.renderer,
      domOverlay: this.domOverlay,
      overlayPainter: this.overlayPainter,
      ariaMirror: this.ariaMirror,
      geometry: this.geometry,
      datasource: this.datasourceController,
      datasourceEnabled: Boolean(datasource),
      store: this.store,
      activeSheet: () => this.activeSheet,
      theme: () => this.theme,
      overscan: () => this.overscan,
      zoom: () => this.zoom,
      storeEpoch: () => this.windowContentRevision,
      viewportHeight: () => this.viewportH(),
      viewportWidth: () => this.viewportEl.clientWidth,
      datasourceColumnCount: () => this.sheetById(this.activeSheet)?.columns.length ?? 0,
      scrollTop: () => this.scroller.scrollTop,
      scrollLeft: () => this.scroller.scrollLeft,
      repositionEditor: (contentTop, scrollLeft) => this.repositionEditor(contentTop, scrollLeft),
      emitScroll: (event) => {
        for (const fn of this.listeners.scroll) fn(event);
      },
    });

    if (this.tabBarHeight > 0) this.buildTabBar();

    this.disposeStore = this.store.on("change", (event) => {
      this.storeEpoch += 1;
      if (this.autoFitActive) this.cancelAutoFit();
      this.mutationRevisions.record(event.transaction.patches, this.storeEpoch);
      this.activeSheetCache = null;
      // Presence learned during this change describes the state after it, which
      // cannot vouch for cells it just stopped computing (e.g. a removed spill).
      const presenceKnown = this.sourceSheet === this.activeSheet;
      const windowChanged = this.transactionAffectsWindow(event.transaction.patches);
      if (windowChanged) this.windowContentRevision += 1;
      let geometryChanged = false;
      let shouldRebuildRows = false;
      let shouldReconcileView = false;
      let shouldRebuildColumns = false;
      let shouldApplyLayout = false;
      let sheetsChanged = false;
      let shouldResetDatasource = false;
      const sessionSheets = this.sessionSheets.map((sheet) => ({ ...sheet }));
      let sessionActive = this.activeSheet;
      for (const patch of event.transaction.patches) {
        if ("sheet" in patch && patch.sheet === this.activeSheet) {
          if (
            patch.op !== "setValidationRule" &&
            patch.op !== "removeValidationRule" &&
            patch.op !== "setHyperlink" &&
            patch.op !== "removeHyperlink" &&
            patch.op !== "setProtectedRange" &&
            patch.op !== "removeProtectedRange" &&
            patch.op !== "setChart" &&
            patch.op !== "removeChart"
          ) {
            geometryChanged = true;
          }
          if (
            patch.op === "setSheetMeta" &&
            (patch.patch.sortKeys !== undefined ||
              patch.patch.filters !== undefined ||
              patch.patch.rowGroups !== undefined)
          ) {
            shouldReconcileView = true;
          } else if (patch.op === "setRowMeta") {
            const hidden = this.sheet().hiddenRows?.has(patch.row) ?? false;
            if (hidden !== this.displayedHiddenRows.has(patch.row)) shouldReconcileView = true;
            if (hidden) this.displayedHiddenRows.add(patch.row);
            else this.displayedHiddenRows.delete(patch.row);
          }
        }
        if (
          (patch.op === "addRows" ||
            patch.op === "removeRows" ||
            patch.op === "moveRows" ||
            patch.op === "addColumns" ||
            patch.op === "removeColumns" ||
            patch.op === "moveColumns") &&
          patch.sheet === this.activeSheet
        ) {
          shouldResetDatasource = true;
          // Structure edits can clear query state as well as shift columns/rows.
          // Keep the previous view state: the store has already removed that query.
          shouldReconcileView ||=
            this.displayedHasView || (this.loadable?.hasView(this.activeSheet) ?? false);
        }
        if (
          "sheet" in patch &&
          patch.sheet === this.activeSheet &&
          (patch.op === "addRows" ||
            patch.op === "removeRows" ||
            patch.op === "moveRows" ||
            patch.op === "setRowMeta" ||
            (patch.op === "setSheetMeta" && patch.patch.rowGroups !== undefined))
        ) {
          shouldRebuildRows = true;
        } else if (
          "sheet" in patch &&
          patch.sheet === this.activeSheet &&
          (patch.op === "addColumns" ||
            patch.op === "removeColumns" ||
            patch.op === "moveColumns" ||
            (patch.op === "setColumn" && ("width" in patch.patch || "visible" in patch.patch)))
        ) {
          shouldRebuildColumns = true;
        }
        if (
          "sheet" in patch &&
          patch.sheet === this.activeSheet &&
          (patch.op === "addMerge" || patch.op === "removeMerge" || patch.op === "setSheetMeta")
        ) {
          shouldApplyLayout = true;
        }
        if (
          patch.op === "addSheet" ||
          patch.op === "removeSheet" ||
          patch.op === "renameSheet" ||
          patch.op === "moveSheet" ||
          patch.op === "setSheetVisibility"
        ) {
          sheetsChanged = true;
        }
        if (patch.op === "addSheet") {
          sessionSheets.splice(patch.sheet.order, 0, {
            id: patch.sheet.id,
            visibility: patch.sheet.visibility,
          });
        } else if (patch.op === "removeSheet") {
          const index = sessionSheets.findIndex((sheet) => sheet.id === patch.sheet);
          if (index >= 0) {
            sessionSheets.splice(index, 1);
            if (sessionActive === patch.sheet) {
              sessionActive =
                visibleSheetNeighbor(sessionSheets, patch.sheet, index) ?? sessionActive;
            }
          }
        } else if (patch.op === "moveSheet") {
          const index = sessionSheets.findIndex((sheet) => sheet.id === patch.sheet);
          if (index >= 0) {
            const [sheet] = sessionSheets.splice(index, 1);
            sessionSheets.splice(patch.to, 0, sheet!);
          }
        } else if (patch.op === "setSheetVisibility") {
          const sheet = sessionSheets.find((candidate) => candidate.id === patch.sheet);
          if (sheet) {
            sheet.visibility = patch.visibility;
            if (sessionActive === patch.sheet && patch.visibility !== "visible") {
              sessionActive = visibleSheetNeighbor(sessionSheets, patch.sheet) ?? sessionActive;
            }
          }
        }
      }
      const sheets = this.store.getWorkbook().sheets;
      const reconciled = sheets.find((sheet) => sheet.id === sessionActive);
      if (!reconciled || (reconciled.visibility ?? "visible") !== "visible") {
        sessionActive =
          sheets.find((sheet) => (sheet.visibility ?? "visible") === "visible")?.id ??
          sessionActive;
      }
      if (sessionActive !== this.activeSheet) this.setActiveSheet(sessionActive);
      this.sessionSheets = sheets.map(({ id, visibility }) => ({ id, visibility }));
      this.displayedHasView = this.loadable?.hasView(this.activeSheet) ?? false;
      if (shouldResetDatasource) {
        this.datasourceController.reset(this.sheet().rowCount);
        this.mutationRevisions.clear();
        this.displayedHiddenRows = new Set(this.sheet().hiddenRows);
      }
      const change = shouldResetDatasource
        ? "structure"
        : shouldReconcileView || shouldRebuildRows || shouldRebuildColumns || shouldApplyLayout
          ? "view"
          : "value";
      this.interactions.reconcile(change);

      // A note edit holds a data address that a structure change moves; geometry
      // changes move the shown card away from its cell.
      if (change === "structure") this.notes.dismiss();
      else if (change === "view") this.notes.hideCard();

      if (shouldRebuildRows || shouldReconcileView) this.rebuildIndex();
      if (shouldRebuildColumns) this.rebuildColumnIndex();
      if (shouldRebuildColumns || shouldApplyLayout) this.applyLayout();
      if (geometryChanged) this.readWindows.invalidateData();
      this.searchController.refreshAfterChange(
        event.transaction.patches,
        this.activeSheet,
        presenceKnown && !this.sheetHasSources,
      );
      if (shouldReconcileView) {
        // Selection uses view-row positions: remote/history permutations must reset
        // it and scroll just like named actions, before change listeners run.
        this.selection.clear();
        this.selection.setBounds(this.geometry.rowCount, this.firstCol(), this.lastCol());
        this.emitSelection();
        this.scroller.scrollTop = 0;
        this.readWindows.invalidateData();
      }
      if (sheetsChanged) this.renderTabs();
      if (
        event.transaction.patches.some(
          (patch) => patch.op === "setNote" && patch.addr.sheet === this.activeSheet,
        )
      ) {
        this.ariaMirror.bumpVersion();
        this.notes.refresh();
      }
      // Chart edits, undo and sheet changes all arrive here.
      this.objectLayer.sync();
      this.scheduleRender();
      for (const fn of this.listeners.change) fn(event);
      this.queueCommandStateChange();
    });

    this.applyLayout();
    this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(host);
    }
    this.armResolutionListener();
    this.attachPanels();
    this.render();
  }

  /**
   * The chart and pivot panels load as their own chunk, so they cost nothing
   * before first paint. A data grid has no charts or pivots to edit.
   */
  private attachPanels(): void {
    if (this.presentation !== "spreadsheet") return;
    void import("./panels/panel-controller.js").then(({ attachPanels }) => {
      if (!this.destroyed) this.disposePanels = attachPanels(this, this.config?.icons);
    });
  }

  private refreshSourcePresence(): void {
    const engine = storeEngine(this.store);
    this.sourceSheet = this.activeSheet;
    if (!engine || engine.isPaged(this.activeSheet)) {
      this.sheetHasSources = true;
      return;
    }
    const sources = engine.captureSheetSources(this.activeSheet);
    this.sheetHasSources =
      !sources || sources.formulaOffsets.length > 0 || sources.referenceOffsets.length > 0;
  }

  private transactionAffectsWindow(patches: readonly DocumentOp[]): boolean {
    // The handler runs before a removed or hidden active sheet is replaced, so
    // the old sheet may be gone; the sheet switch repaints everything anyway.
    const sheet = this.sheetById(this.activeSheet);
    if (!sheet) return true;
    // Presence is read after the first change on each sheet, so that change may
    // have removed the last formula (and its spill); repaint it conservatively.
    if (this.sourceSheet !== this.activeSheet) {
      this.refreshSourcePresence();
      return true;
    }
    let affectsWindow = false;
    const engine = storeEngine(this.store);
    // A source-free active sheet cannot receive computed values from another
    // cell or sheet. Formula/ref presence is sticky until a sheet switch, so
    // removing a spill anchor still refreshes its former children. Unknown
    // stores, paged loads, conditional formats, validation and merge anchors
    // stay conservative: their displayed result may depend on off-window data.
    const dependentDisplay = Boolean(
      this.sheetHasSources ||
      !engine ||
      engine.isPaged(this.activeSheet) ||
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
            patch.addr.sheet === this.activeSheet &&
            (patch.value.kind === "formula" || patch.value.kind === "ref")
          )
            this.sheetHasSources = true;
          range = patch.addr;
          break;
        case "setRange":
          if (
            patch.range.sheet === this.activeSheet &&
            patch.cells.some((cell) => cell.value.kind === "formula" || cell.value.kind === "ref")
          )
            this.sheetHasSources = true;
          range = patch.range;
          break;
        case "setBlock":
          if (
            patch.range.sheet === this.activeSheet &&
            (patch.block.formulas?.length || patch.block.refs?.length)
          )
            this.sheetHasSources = true;
          range = patch.range;
          break;
        case "restoreBlock":
          if (patch.range.sheet === this.activeSheet) this.sheetHasSources = true;
          range = patch.range;
          break;
        case "setRangeStyle":
        case "clearRange":
          range = patch.range;
          break;
        case "setNote":
          continue;
        default:
          affectsWindow = true;
          continue;
      }
      if (affectsWindow || dependentDisplay || this.sheetHasSources) {
        affectsWindow = true;
        continue;
      }
      // Large off-screen batches pay for one window snapshot, not one per patch.
      painted ??= this.readWindows.paintedCells();
      affectsWindow =
        "start" in range
          ? painted.intersects(range.sheet, range.start, range.end)
          : painted.intersects(range.sheet, range, range);
    }
    return affectsWindow;
  }

  private createRenderer(opts: GridOptions, host: HTMLElement): Renderer {
    if (opts.renderer === "worker") {
      try {
        let worker: WorkerRenderer;
        worker = new WorkerRenderer(opts.workerUrl, {}, (error) => {
          this.fallbackWorkerRenderer(worker, error);
        });
        worker.mount(host, this.theme);
        this.activeRendererKind = "worker";
        return worker;
      } catch (error) {
        // Worker unavailable (no OffscreenCanvas / construction blocked) —
        // fall back observably after post-construction subscribers can attach.
        this.emitRendererFallback(error);
      }
    }
    const canvas = new CanvasRenderer();
    canvas.mount(host, this.theme);
    this.activeRendererKind = "canvas";
    return canvas;
  }

  private fallbackWorkerRenderer(worker: WorkerRenderer, error: unknown): void {
    if (this.destroyed || this.renderer !== worker || this.activeRendererKind !== "worker") return;

    worker.destroy();
    const canvas = new CanvasRenderer();
    canvas.mount(this.viewportEl, this.theme);
    canvas.setRenderers(this.customRenderers);
    this.renderer = canvas;
    this.activeRendererKind = "canvas";
    this.applyLayout();
    this.scheduleRender();
    this.emitRendererFallback(error);
  }

  private emitRendererFallback(error: unknown): void {
    const failure = normalizeSheetwriteError(error, "renderer-fallback", "renderer-worker", {
      requested: "worker",
    });
    queueMicrotask(() => {
      if (this.destroyed) return;
      for (const fn of this.listeners["renderer-fallback"]) {
        fn({ requested: "worker", error: failure });
      }
    });
  }

  rendererKind(): "canvas" | "worker" {
    return this.activeRendererKind;
  }

  private sheet(id: SheetId = this.activeSheet): Sheet {
    if (id === this.activeSheet && this.activeSheetCache) return this.activeSheetCache;

    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === id);
    if (!stored) throw new Error(`Sheetwrite: unknown sheet ${id}`);
    const target = this.virtualColumnTargets.get(id) ?? stored.columns.length;
    const sheet =
      target > stored.columns.length ? { ...stored, columns: [...stored.columns] } : stored;
    if (sheet !== stored) appendPadColumns(sheet.columns, target);
    if (id === this.activeSheet) this.activeSheetCache = sheet;
    return sheet;
  }

  private sheetById(id: SheetId): Sheet | null {
    return this.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }

  private viewportH(): number {
    return this.viewportEl.clientHeight;
  }

  private nextDefaultSheetName(): string {
    const names = new Set(this.store.getWorkbook().sheets.map((sheet) => sheetNameKey(sheet.name)));
    let number = this.store.getWorkbook().sheets.length + 1;
    while (names.has(sheetNameKey(`Sheet ${number}`))) number += 1;
    return `Sheet ${number}`;
  }

  private buildTabBar(): void {
    const bar = document.createElement("div");
    bar.className = "sheetwrite-tabbar";
    // Positioning is behavior (the bar reserves this.tabBarHeight in the host
    // layout); everything cosmetic lives in styles.css behind CSS custom
    // properties seeded from the theme, so host CSS can restyle freely.
    bar.style.position = "absolute";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.bottom = "0";
    bar.style.height = `${this.tabBarHeight}px`;
    this.host.appendChild(bar);
    this.tabBar = bar;
    this.sheetTabs = new SheetTabs(bar, {
      onActivate: (id) => this.setActiveSheet(id),
      onAdd: () => {
        const result = this.addSheet({ name: this.nextDefaultSheetName() });
        if (result.status === "applied") this.setActiveSheet(result.sheet);
        return result;
      },
      onRemove: (id) => this.removeSheet(id),
      onRename: (id, name) => this.renameSheet(id, name),
      onMove: (id, toIndex) => this.moveSheet(id, toIndex),
      onHide: (id) => this.setSheetVisibility(id, "hidden"),
      onUnhide: (id) => this.setSheetVisibility(id, "visible"),
      readOnly: this.readOnly,
    });
    this.syncTabBarTheme();
    this.renderTabs();
  }

  /** Re-seed the tab bar's CSS custom properties from the (base) theme. */
  private syncTabBarTheme(): void {
    const bar = this.tabBar;
    if (!bar) return;
    bar.style.setProperty("--sheetwrite-tab-font", this.baseTheme.font);
    bar.style.setProperty("--sheetwrite-tab-bg", this.baseTheme.bg);
    bar.style.setProperty("--sheetwrite-tab-fg", this.baseTheme.headerFg);
    bar.style.setProperty("--sheetwrite-tab-border", this.baseTheme.gridLine);
    bar.style.setProperty("--sheetwrite-tab-hover-bg", this.baseTheme.headerBg);
    bar.style.setProperty("--sheetwrite-tab-active-bg", this.baseTheme.selection);
    bar.style.setProperty("--sheetwrite-tab-active-fg", this.baseTheme.selectionBorder);
  }

  private renderTabs(): void {
    this.sheetTabs?.update(this.store.getWorkbook().sheets, this.activeSheet);
  }

  private firstCol(): number {
    return this.geometry.firstColumn();
  }

  private lastCol(): number {
    return this.geometry.lastColumn();
  }

  private colLeftOf(col: number): number {
    return this.geometry.columnLeft(col);
  }

  private colAtX(contentX: number): number {
    return this.geometry.columnAtX(contentX);
  }

  private nextVisibleCol(col: number, dir: 1 | -1): number {
    return this.geometry.nextVisibleColumn(col, dir);
  }

  private frozenRowCount(): number {
    return this.geometry.frozenRowCount();
  }

  private frozenColCount(): number {
    return this.geometry.frozenColumnCount();
  }

  private frozenHeight(): number {
    return this.geometry.frozenHeight();
  }

  private frozenWidth(): number {
    return this.geometry.frozenWidth();
  }

  private firstBodyCol(): number {
    return this.geometry.firstBodyColumn();
  }

  private screenRect(
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    const merge = this.mergeAnchorAt(row, col);
    return this.geometry.rangeRect(
      {
        sheet: this.activeSheet,
        start: { row: merge?.r0 ?? row, col: merge?.c0 ?? col },
        end: { row: merge?.r1 ?? row, col: merge?.c1 ?? col },
      },
      contentTop,
      scrollLeft,
    );
  }

  private contentXAt(viewportX: number): number {
    const contentX = viewportX - this.theme.rowHeaderWidth;
    const frozen = this.frozenColCount() > 0 && contentX < this.frozenWidth();
    return frozen ? contentX : contentX + this.scroller.scrollLeft;
  }

  private contentYAt(viewportY: number): number {
    return this.geometry.pointerContentY(viewportY, this.scroller.scrollTop);
  }

  private columnHeader(col: number): string {
    if (this.presentation === "spreadsheet") return colToA1(col);
    const column = this.sheet().columns[col];
    return (
      column?.header ||
      (column?.key.startsWith("__pad_") ? colToA1(col) : column?.key) ||
      colToA1(col)
    );
  }

  private applyLayout(): void {
    this.readWindows.invalidate();
    const sheet = this.sheet();
    const columns = sheet.columns.map((column, c) => ({
      ...column,
      header: column.visible === false ? "" : this.columnHeader(c),
      // Paint geometry is zoomed to match the column index; base widths stay
      // untouched on the workbook.
      width: column.visible === false ? 0 : this.geometry.columnWidth(c) * this.zoom,
    }));
    const domRendererColumns = new Uint8Array(columns.length);
    for (let col = 0; col < columns.length; col++) {
      const rendererName = columns[col]?.renderer;
      if (rendererName && this.customRenderers.get(rendererName)?.dom) {
        domRendererColumns[col] = 1;
      }
    }
    const layout = {
      columns,
      rowHeight: this.theme.rowHeight,
      headerHeight: this.theme.headerHeight,
      totalRows: this.geometry.rowCount,
      zoom: this.zoom,
      merges: this.loadable?.hasView(this.activeSheet) ? [] : (sheet.merges ?? []),

      domRendererColumns,
    };
    this.renderer.setLayout(layout);
    this.domOverlay.setLayout(layout);
    this.selection.setBounds(this.geometry.rowCount, this.firstCol(), this.lastCol());
    this.syncSizer();
  }

  private syncSizer(): void {
    // Browser zoom moves the layout clamp; a stale cap truncates tall documents.
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    if (devicePixelRatio !== this.lastDevicePixelRatio) {
      this.lastDevicePixelRatio = devicePixelRatio;
      this.maxElementHeight = measureMaxElementHeight();
    }
    const size = this.geometry.layoutSize(this.viewportH());
    this.sizer.style.width = `${size.width}px`;
    this.sizer.style.height = `${size.height}px`;
  }

  /** The gutter tracks the active sheet's digit count; identity when unchanged. */
  private withAdaptiveGutter(theme: Theme, rowCount: number): Theme {
    const rowHeaderWidth = adaptiveRowHeaderWidth(theme, rowCount);
    return rowHeaderWidth === theme.rowHeaderWidth ? theme : { ...theme, rowHeaderWidth };
  }

  private rebuildIndex(): void {
    this.geometry.rebuildRows(
      this.loadable?.viewRowCount(this.activeSheet) ?? this.sheet().rowCount,
    );
    this.datasourceController.resize(this.sheet().rowCount);
    // Row-count changes can grow the row-number gutter (e.g. crossing 1M rows).
    const adjusted = this.withAdaptiveGutter(this.theme, this.sheet().rowCount);
    if (adjusted !== this.theme) {
      this.theme = adjusted;
      this.renderer.setTheme(this.theme);
      this.domOverlay.setTheme(this.theme);
    }
    this.syncSizer();
  }

  private rebuildColumnIndex(): void {
    this.geometry.rebuildColumns();
    this.readWindows.invalidateColumns();
    this.ariaMirror?.setColumnCount(this.geometry.columnIndices.length);
  }

  private toDataRow(viewRow: number): number {
    return this.geometry.toDataRow(viewRow);
  }

  private toViewRow(dataRow: number): number | null {
    return this.geometry.toViewRow(dataRow);
  }

  private mergeAnchorAt(row: number, col: number): SelRect | null {
    if (this.loadable?.hasView(this.activeSheet)) return null;

    const merges = this.sheet().merges;
    if (!merges) return null;

    return mergeAnchorAt(prepareMergeIndex(merges), row, col);
  }

  private anchorCell(row: number, col: number): CellRef {
    const merge = this.mergeAnchorAt(row, col);
    return merge ? { row: merge.r0, col: merge.c0 } : { row, col };
  }

  private scheduleRender(): void {
    this.readWindows.schedule();
  }

  private render(): void {
    this.readWindows.renderNow();
  }

  private repositionEditor(contentTop: number, scrollLeft: number): void {
    this.interactions.reposition(contentTop, scrollLeft);
    this.notes.reposition();
    this.objectLayer.place(contentTop, scrollLeft);
  }

  /** A view cell, resolved to its merge anchor, with the data address its note lives at. */
  private noteCell(row: number, col: number): NoteCell {
    const anchor = this.anchorCell(row, col);
    return {
      row: anchor.row,
      col: anchor.col,
      address: { sheet: this.activeSheet, row: this.toDataRow(anchor.row), col: anchor.col },
    };
  }

  beginEdit(row: number, col: number, initial?: string, selectAll = false): void {
    this.interactions.beginEdit(row, col, initial, selectAll);
  }

  private clearSelection(): void {
    if (this.readOnly || this.selection.isEmpty) return;

    const sheet = this.sheet();
    const patches: DocumentOp[] = [];
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push(rect));
    const merges = sheet.merges;
    const mergeIndex = merges ? prepareMergeIndex(merges) : null;
    const intersectsMerge =
      mergeIndex !== null &&
      rects.some(
        (rect) =>
          intersectingMerges(mergeIndex, rect.r0, rect.r1 + 1, [rect.c0, rect.c1]).length > 0,
      );
    if (!intersectsMerge) {
      for (const rect of rects) {
        let runStart = this.toDataRow(rect.r0);
        let previous = runStart;
        for (let viewRow = rect.r0 + 1; viewRow <= rect.r1 + 1; viewRow++) {
          const dataRow = viewRow <= rect.r1 ? this.toDataRow(viewRow) : -1;
          if (viewRow <= rect.r1 && Math.abs(dataRow - previous) === 1) {
            previous = dataRow;
            continue;
          }
          patches.push({
            op: "clearRange",
            range: {
              sheet: this.activeSheet,
              start: { row: runStart, col: rect.c0 },
              end: { row: previous, col: rect.c1 },
            },
          });
          runStart = dataRow;
          previous = dataRow;
        }
      }
    } else {
      const seen = new Set<number>();
      const nullValue: CellValue = { kind: "literal", value: null };
      for (const rect of rects) {
        for (let r = rect.r0; r <= rect.r1; r++) {
          for (let c = rect.c0; c <= rect.c1; c++) {
            const cell = this.anchorCell(r, c);
            const key = cell.row * sheet.columns.length + cell.col;
            if (seen.has(key)) continue;
            seen.add(key);
            patches.push({
              op: "set",
              addr: { sheet: this.activeSheet, row: this.toDataRow(cell.row), col: cell.col },
              value: nullValue,
            });
          }
        }
      }
    }

    this.document.commit(patches, "clear");
  }

  private emitSelection(): void {
    this.ariaMirror.bumpVersion();
    if (this.listeners.selection.size > 0) {
      const selection = this.getSelection();
      for (const listener of this.listeners.selection) listener({ selection });
    }
    this.emitCommandStateChange();
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    return this.searchController.search(query, opts);
  }

  findNext(): SearchResult {
    return this.searchController.findNext();
  }

  findPrev(): SearchResult {
    return this.searchController.findPrev();
  }

  clearSearch(): void {
    this.searchController.clearSearch();
  }

  replaceCurrent(replacement: string): SearchResult {
    return this.searchController.replaceCurrent(replacement);
  }

  replaceAll(replacement: string): ReplaceResult {
    return this.searchController.replaceAll(replacement);
  }

  getShortcutLabel(action: KeyboardAction): string {
    return this.keymap.label(action);
  }

  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void {
    this.overlayPainter.highlightCells(ranges, color);
  }

  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void {
    this.overlayPainter.setPresenceOverlays(overlays);
  }

  styleRange(range: Range, style: Partial<CellStyle> | null): void {
    if (this.readOnly) return;

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
    return this.loadable.dataEdge(this.activeSheet, row, col, dRow, dCol);
  }
  private measurementContext(): CanvasRenderingContext2D | null {
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  }

  private requireAutoFitRangeLoaded(range: Range): void {
    if (!this.loadable || this.loadable.isRangeFullyLoaded(range)) return;
    const capability = this.loadable.queryCapability(range.sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(range.sheet, capability);
  }

  private withStoreResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    return this.loadable ? this.loadable.withResourceOperation(operation, run) : run();
  }

  private noteAutoFitWindow(rows: number, columns: number): void {
    const cells = rows * columns;
    this.autoFitStats.windowRequests += 1;
    this.autoFitStats.maxWindowCells = Math.max(this.autoFitStats.maxWindowCells, cells);
  }

  private scheduleAutoFitChunk(step: () => void): void {
    this.autoFitStats.scheduledChunks += 1;
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback): number =>
        setTimeout(() => callback(performance.now()), 0) as unknown as number);
    let invokedSynchronously = false;
    const frame = requestFrame(() => {
      invokedSynchronously = true;
      this.autoFitFrame = 0;
      step();
    });
    if (!invokedSynchronously) this.autoFitFrame = frame;
  }

  private cancelAutoFit(): void {
    this.autoFitGeneration += 1;
    if (this.autoFitActive) {
      this.autoFitActive = false;
      this.autoFitStats.cancelledJobs += 1;
    }
    if (this.autoFitFrame !== 0) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.autoFitFrame);
      this.autoFitFrame = 0;
    }
  }

  private measureAutoFitRowWindow(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    bandStart: number,
    requiredHeights: Float64Array,
    mergeWidths: ReadonlyMap<number, number>,
  ): void {
    const fallbackFontSize =
      Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.baseTheme.font)?.[1] ?? "") || 12;
    for (let row = view.rows.start; row < view.rows.end; row++) {
      const requiredIndex = row - bandStart;
      let required = requiredHeights[requiredIndex] ?? this.baseTheme.rowHeight;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const col = columns[columnIndex]!;
        const valueIndex = (row - view.rows.start) * columns.length + columnIndex;
        const value = view.values[valueIndex];
        if (value === null || value === undefined || value === "") continue;
        const column = sheet.columns[col]!;
        const cellStyle = view.styles[view.styleIds[valueIndex]!] ?? {};
        const style = column.cellStyle ? { ...column.cellStyle, ...cellStyle } : cellStyle;
        const text = cellScalarToText(value);
        if (!style.wrap && !text.includes("\n")) continue;
        const width =
          mergeWidths.get(row * sheet.columns.length + col) ?? sheet.columns[col]!.width;
        const fontSize = style.fontSize ?? fallbackFontSize;
        context.font = fontFor(this.baseTheme, style);
        const lineCount = layoutTextLines(context, text, Math.max(0, width - 12)).length;
        required = Math.max(required, Math.ceil(lineCount * fontSize * 1.2 + 8));
      }
      requiredHeights[requiredIndex] = required;
    }
  }

  private measureAutoFitColumnWindow(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    targetOffset: number,
    widths: Float64Array,
  ): void {
    for (let row = view.rows.start; row < view.rows.end; row++) {
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const col = columns[columnIndex]!;
        const valueIndex = (row - view.rows.start) * columns.length + columnIndex;
        const value = view.values[valueIndex];
        if (value === null || value === undefined || value === "") continue;
        const column = sheet.columns[col]!;
        const cellStyle = view.styles[view.styleIds[valueIndex]!] ?? {};
        const style = column.cellStyle ? { ...column.cellStyle, ...cellStyle } : cellStyle;
        context.font = fontFor(this.baseTheme, style);
        let width = widths[targetOffset + columnIndex]!;
        const text = cellDisplayText(
          value,
          style.numberFormat ?? column.numberFormat,
          column.numberLocale,
        );
        for (const line of text.split("\n")) {
          width = Math.max(width, context.measureText(line).width + 12);
        }
        widths[targetOffset + columnIndex] = width;
      }
    }
  }

  autoFitRows(range?: Range): void {
    if (this.readOnly || (range && range.sheet !== this.activeSheet)) return;
    this.cancelAutoFit();
    const sheetId = this.activeSheet;
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
    const measuredRange: Range = {
      sheet: sheetId,
      start: { row: r0, col: c0 },
      end: { row: r1, col: c1 },
    };
    this.requireAutoFitRangeLoaded(measuredRange);
    const context = this.measurementContext();
    if (!context) return;

    const mergeWidths = new Map<number, number>();
    for (const merge of sheet.merges ?? []) {
      let width = 0;
      for (let col = merge.c0; col <= merge.c1; col++) width += sheet.columns[col]?.width ?? 0;
      mergeWidths.set(merge.r0 * sheet.columns.length + merge.c0, width);
    }
    const rowCount = r1 - r0 + 1;
    const columnCount = c1 - c0 + 1;
    const patches: DocumentOp[] = [];
    const appendRowPatches = (bandStart: number, required: Float64Array): void => {
      for (let offset = 0; offset < required.length; offset++) {
        const viewRow = bandStart + offset;
        const dataRow = this.toDataRow(viewRow);
        const height = required[offset]!;
        if ((sheet.rowHeights?.get(dataRow) ?? this.baseTheme.rowHeight) === height) continue;
        patches.push({
          op: "setRowMeta",
          sheet: sheetId,
          row: dataRow,
          meta: { height },
        });
      }
    };

    if (rowCount * columnCount <= AUTO_FIT_CHUNK_CELLS) {
      const columns = Array.from({ length: columnCount }, (_, index) => c0 + index);
      const view = this.withStoreResourceOperation("auto-fit", () =>
        this.store.getVisibleWindow(sheetId, { start: r0, end: r1 + 1 }, columns),
      );
      this.noteAutoFitWindow(rowCount, columnCount);
      const required = new Float64Array(rowCount);
      required.fill(this.baseTheme.rowHeight);
      this.measureAutoFitRowWindow(context, sheet, view, columns, r0, required, mergeWidths);
      appendRowPatches(r0, required);
      this.autoFitStats.completedJobs += 1;
      this.autoFitStats.committedPatches += patches.length;
      this.withStoreResourceOperation("auto-fit", () => this.document.commit(patches, "structure"));
      return;
    }

    const columnsPerWindow = Math.min(columnCount, AUTO_FIT_CHUNK_CELLS);
    const rowsPerBand = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columnsPerWindow));
    let bandStart = r0;
    let bandEnd = Math.min(r1 + 1, bandStart + rowsPerBand);
    let columnStart = c0;
    let required = new Float64Array(bandEnd - bandStart);
    required.fill(this.baseTheme.rowHeight);
    const generation = this.autoFitGeneration;
    this.autoFitActive = true;

    const step = (): void => {
      if (
        !this.autoFitActive ||
        generation !== this.autoFitGeneration ||
        this.destroyed ||
        this.activeSheet !== sheetId
      ) {
        return;
      }
      const count = Math.min(columnsPerWindow, c1 - columnStart + 1);
      const columns = Array.from({ length: count }, (_, index) => columnStart + index);
      const view = this.withStoreResourceOperation("auto-fit", () =>
        this.store.getVisibleWindow(sheetId, { start: bandStart, end: bandEnd }, columns),
      );
      this.noteAutoFitWindow(bandEnd - bandStart, columns.length);
      this.measureAutoFitRowWindow(context, sheet, view, columns, bandStart, required, mergeWidths);
      columnStart += count;
      if (columnStart > c1) {
        appendRowPatches(bandStart, required);
        bandStart = bandEnd;
        if (bandStart > r1) {
          this.autoFitActive = false;
          this.autoFitStats.completedJobs += 1;
          this.autoFitStats.committedPatches += patches.length;
          this.withStoreResourceOperation("auto-fit", () =>
            this.document.commit(patches, "structure"),
          );
          return;
        }
        bandEnd = Math.min(r1 + 1, bandStart + rowsPerBand);
        columnStart = c0;
        required = new Float64Array(bandEnd - bandStart);
        required.fill(this.baseTheme.rowHeight);
      }
      this.scheduleAutoFitChunk(step);
    };
    this.scheduleAutoFitChunk(step);
  }

  autoFitColumns(cols?: readonly number[]): void {
    if (this.readOnly) return;
    this.cancelAutoFit();
    const sheetId = this.activeSheet;
    const sheet = this.sheet();
    const targets = cols
      ? [...new Set(cols)].filter((col) => col >= 0 && col < sheet.columns.length)
      : sheet.columns.map((_, col) => col);
    if (targets.length === 0) return;
    for (const col of targets) {
      this.requireAutoFitRangeLoaded({
        sheet: sheetId,
        start: { row: 0, col },
        end: { row: Math.max(0, sheet.rowCount - 1), col },
      });
    }
    const context = this.measurementContext();
    if (!context) return;
    const widths = new Float64Array(targets.length);
    for (let index = 0; index < targets.length; index++) {
      const column = sheet.columns[targets[index]!]!;
      context.font = fontFor(this.baseTheme, {
        ...column.headerStyle,
        bold: column.headerStyle?.bold ?? true,
      });
      widths[index] = context.measureText(column.header).width + 12;
    }
    const patches: DocumentOp[] = [];
    const commitWidths = (): void => {
      for (let index = 0; index < targets.length; index++) {
        const col = targets[index]!;
        const width = Math.max(1, Math.ceil(widths[index]!));
        if (sheet.columns[col]!.width === width) continue;
        patches.push({ op: "setColumn", sheet: sheetId, col, patch: { width } });
      }
      this.autoFitStats.completedJobs += 1;
      this.autoFitStats.committedPatches += patches.length;
      this.withStoreResourceOperation("auto-fit", () => this.document.commit(patches, "structure"));
    };

    const totalCells = sheet.rowCount * targets.length;
    if (totalCells <= AUTO_FIT_CHUNK_CELLS) {
      const view = this.withStoreResourceOperation("auto-fit", () =>
        this.store.getVisibleWindow(sheetId, { start: 0, end: sheet.rowCount }, targets),
      );
      this.noteAutoFitWindow(sheet.rowCount, targets.length);
      this.measureAutoFitColumnWindow(context, sheet, view, targets, 0, widths);
      commitWidths();
      return;
    }

    const columnsPerWindow = Math.min(targets.length, AUTO_FIT_CHUNK_CELLS);
    const rowsPerWindow = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columnsPerWindow));
    let targetOffset = 0;
    let columns = targets.slice(targetOffset, targetOffset + columnsPerWindow);
    let rowStart = 0;
    const generation = this.autoFitGeneration;
    this.autoFitActive = true;

    const step = (): void => {
      if (
        !this.autoFitActive ||
        generation !== this.autoFitGeneration ||
        this.destroyed ||
        this.activeSheet !== sheetId
      ) {
        return;
      }
      const rowEnd = Math.min(sheet.rowCount, rowStart + rowsPerWindow);
      const view = this.withStoreResourceOperation("auto-fit", () =>
        this.store.getVisibleWindow(sheetId, { start: rowStart, end: rowEnd }, columns),
      );
      this.noteAutoFitWindow(rowEnd - rowStart, columns.length);
      this.measureAutoFitColumnWindow(context, sheet, view, columns, targetOffset, widths);
      rowStart = rowEnd;
      if (rowStart >= sheet.rowCount) {
        targetOffset += columns.length;
        if (targetOffset >= targets.length) {
          this.autoFitActive = false;
          commitWidths();
          return;
        }
        columns = targets.slice(targetOffset, targetOffset + columnsPerWindow);
        rowStart = 0;
      }
      this.scheduleAutoFitChunk(step);
    };
    this.scheduleAutoFitChunk(step);
  }

  setRowHeight(row: number, height: number): void {
    this.document.commit(
      [
        {
          op: "setRowMeta",
          sheet: this.activeSheet,
          row: this.toDataRow(row),
          meta: { height: Math.max(1, height) },
        },
      ],
      "structure",
    );
  }

  setColumnWidth(col: number, width: number): void {
    this.document.commit(
      [{ op: "setColumn", sheet: this.activeSheet, col, patch: { width: Math.max(1, width) } }],
      "structure",
    );
  }

  setMinColumns(minColumns?: number): void {
    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === this.activeSheet);
    if (!stored) return;
    const target = Math.max(
      stored.columns.length,
      padTarget(this.host, minColumns, this.presentation),
    );
    if (target === this.virtualColumnTargets.get(this.activeSheet)) return;
    this.virtualColumnTargets.set(this.activeSheet, target);
    this.activeSheetCache = null;
    this.rebuildColumnIndex();
    this.applyLayout();
    this.scheduleRender();
  }
  setOverscan(overscan?: number): void {
    const next = overscan === undefined ? DEFAULT_OVERSCAN : Math.max(0, Math.floor(overscan));
    if (next === this.overscan) return;
    this.overscan = next;
    // Read per frame by the window calculations; a repaint picks it up.
    this.readWindows.invalidate();
    this.scheduleRender();
  }

  /** Internal structural counters used by allocation regression tests and range benchmarks. */
  getMutationRevisionStats(): MutationRevisionStats {
    return this.mutationRevisions.stats();
  }
  getAutoFitResourceStats(): AutoFitResourceStats {
    return { ...this.autoFitStats, chunkCellLimit: AUTO_FIT_CHUNK_CELLS };
  }

  resetAutoFitResourceStats(): void {
    this.autoFitStats.windowRequests = 0;
    this.autoFitStats.maxWindowCells = 0;
    this.autoFitStats.scheduledChunks = 0;
    this.autoFitStats.completedJobs = 0;
    this.autoFitStats.cancelledJobs = 0;
    this.autoFitStats.committedPatches = 0;
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    if (!this.loadable) {
      throw new Error("Runtime resource diagnostics require a SheetwriteStore");
    }
    const store = this.loadable.getRuntimeResourceSnapshot(operation, phase, runtime);
    return createRuntimeResourceSnapshot({
      operation,
      phase,
      wasm: store.wasm,
      jsOwners: [...store.jsOwners, ...this.datasourceController.getResourceOwners()],
      boundary: store.boundary,
      runtime: store.runtime,
    });
  }

  setActiveSheet(id: SheetId): void {
    const target = this.store.getWorkbook().sheets.find((sheet) => sheet.id === id);
    if (!target || (target.visibility ?? "visible") !== "visible" || id === this.activeSheet)
      return;

    this.interactions.reconcile("sheet");
    this.notes.dismiss();
    this.cancelAutoFit();
    this.domOverlay.reset();
    this.mutationRevisions.clear();
    this.activeSheet = id;
    this.activeSheetCache = null;
    const sheet = this.sheet();
    this.displayedHiddenRows = new Set(sheet.hiddenRows);
    this.displayedHasView = this.loadable?.hasView(id) ?? false;

    this.rebuildColumnIndex();
    this.geometry.rebuildRows(this.loadable?.viewRowCount(id) ?? sheet.rowCount);
    this.selection = new SelectionModel(this.geometry.rowCount, this.firstCol(), this.lastCol());
    this.datasourceController.reset(sheet.rowCount);
    this.scroller.scrollTop = 0;
    this.scroller.scrollLeft = 0;

    this.objectLayer.sync();
    this.applyLayout();
    this.renderTabs();
    for (const fn of this.listeners["active-sheet"]) fn({ sheet: id });
    this.emitSelection();
    this.render();
  }

  getActiveSheet(): SheetId {
    return this.activeSheet;
  }

  getCellAtPoint(clientX: number, clientY: number): CellAddress | null {
    const cell = this.interactions.cellAtPointer(clientX, clientY);
    return cell ? { sheet: this.activeSheet, row: cell.row, col: cell.col } : null;
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

    const cell = this.anchorCell(row, col);
    const address = {
      sheet: this.activeSheet,
      row: this.toDataRow(cell.row),
      col: cell.col,
    };
    const formula = this.loadable?.getFormula(address) ?? this.store.getFormula(address);
    const resolved = this.store.getCell(address).resolved;
    const text = formula ?? cellScalarToText(resolved);

    return { address, text, format: column.type };
  }

  scrollToCell(addr: CellAddress): void {
    if (addr.sheet !== this.activeSheet) this.setActiveSheet(addr.sheet);

    // Cells inside the frozen bands are always visible on their pinned axis.
    const fr = this.frozenRowCount();
    const frozenH = this.frozenHeight();
    if (addr.row >= fr) {
      const top = this.geometry.rowOffset(addr.row);
      const bottom = top + this.geometry.rowHeight(addr.row);
      const bodyHeight = Math.max(0, this.viewportH() - this.theme.headerHeight);
      const contentTop = this.geometry.toContent(this.scroller.scrollTop);

      // Visible body band in content space: [contentTop + frozenH, contentTop + bodyHeight).
      let target = contentTop;
      if (top < contentTop + frozenH) target = top - frozenH;
      else if (bottom > contentTop + bodyHeight) target = bottom - bodyHeight;
      if (target !== contentTop) {
        this.scroller.scrollTop = this.geometry.toScroll(Math.max(0, target));
      }
    }

    this.ensureColumnVisible(addr.col);
    this.scheduleRender();
  }

  private ensureColumnVisible(col: number): void {
    if (this.frozenColCount() > 0 && col < this.firstBodyCol()) return;

    const left = this.colLeftOf(col);
    const width = (this.sheet().columns[col]?.width ?? 0) * this.zoom;
    const frozenW = this.frozenWidth();
    const viewLeft = this.scroller.scrollLeft + frozenW;
    const cellWidth = Math.max(
      0,
      this.viewportEl.clientWidth - this.theme.rowHeaderWidth - frozenW,
    );
    const viewRight = viewLeft + cellWidth;
    if (left < viewLeft) this.scroller.scrollLeft = Math.max(0, left - frozenW);
    else if (left + width > viewRight)
      this.scroller.scrollLeft = Math.max(0, left + width - cellWidth - frozenW);
  }

  getSelection(): Selection | null {
    return this.selection.toSelection(this.activeSheet);
  }

  setSelection(sel: Selection | null): void {
    this.selection.set(sel);
    this.emitSelection();
    this.scheduleRender();
  }

  getTheme(): Theme {
    return { ...this.baseTheme };
  }

  setTheme(theme: Partial<Theme>): void {
    this.baseTheme = { ...this.baseTheme, ...theme };
    this.applyZoomedTheme();
    this.reseedWidgetTheme();
    this.emitThemeChange();
  }

  replaceTheme(theme: Partial<Theme> | undefined): void {
    // Re-run construction-time resolution (grid.ts constructor): defaults,
    // then host CSS custom properties, then the new option value.
    this.baseTheme = { ...DEFAULT_THEME, ...resolveThemeFromCss(this.host), ...(theme ?? {}) };
    this.applyZoomedTheme();
    this.reseedWidgetTheme();
    this.emitThemeChange();
  }

  /**
   * The built-in widgets (toolbar, find bar, context menu, note card) read
   * their palette from custom properties seeded on the grid root when they are
   * created. The note card always exists, so seed them again from the new base
   * theme so a theme switch (for example to dark) repaints the widgets too, not
   * only the canvas.
   */
  private reseedWidgetTheme(): void {
    seedWidgetTheme(this.host, this.baseTheme);
  }

  private createToolbar(config: GridConfig | undefined): void {
    this.chromeGeneration += 1;
    if (!config || config.toolbar === false) return;
    if (config.ribbon !== true || Array.isArray(config.toolbar)) {
      this.toolbar = new Toolbar(this.host, config, this.baseTheme, this);
      this.toolbarHeight = Toolbar.height;
      return;
    }

    // The ribbon is opt-in and sizable, so it loads as its own chunk: grids
    // without it never download it. Its height is reserved now, so the grid
    // does not move when it arrives.
    this.toolbarHeight = RIBBON_EXPANDED_HEIGHT;
    const generation = this.chromeGeneration;
    const current = () => generation === this.chromeGeneration && !this.destroyed;
    void import("./ribbon/ribbon.js").then(
      ({ Ribbon }) => {
        if (current()) this.mountRibbon(Ribbon);
      },
      (error: unknown) => {
        if (!current()) return;
        // Keep the grid usable with the flat toolbar, and still report why.
        this.toolbar = new Toolbar(this.host, config, this.baseTheme, this);
        this.setToolbarHeight(Toolbar.height);
        throw error;
      },
    );
  }

  private mountRibbon(RibbonClass: typeof Ribbon): void {
    // The grid owns widget theming: seed now, reseed on every theme change.
    seedWidgetTheme(this.host, this.baseTheme);
    const icons = this.config?.icons;
    const ribbon = new RibbonClass(this.host, this, {
      onHeightChange: (height) => this.setToolbarHeight(height),
      ...(icons === undefined ? {} : { icons }),
    });

    // Grid layout offsets the viewport by the ribbon's height, so chrome must leave normal flow.
    const el = ribbon.element;
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "0";
    // First in the host, as in Excel: keyboard users reach the ribbon before
    // the grid, whatever was mounted while its chunk loaded.
    this.host.prepend(el);
    this.ribbon = ribbon;
    if (ribbon.height !== this.toolbarHeight) this.setToolbarHeight(ribbon.height);
  }

  private setToolbarHeight(height: number): void {
    this.toolbarHeight = height;
    this.viewportEl.style.top = `${height}px`;
    this.panelHost.style.top = `${height}px`;
    this.applyLayout();
    this.render();
  }

  private emitThemeChange(): void {
    const listeners = this.listeners["theme-change"];
    if (listeners.size === 0) return;
    for (const fn of listeners)
      fn({
        theme: {
          ...this.baseTheme,
        },
      });
  }

  getEffectiveTheme(): Theme {
    return this.theme;
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly === this.readOnly) return;

    this.readOnly = readOnly;
    this.sheetTabs?.setReadOnly(readOnly);
    if (readOnly) {
      this.cancelAutoFit();
      this.interactions.reconcile("read-only");
      this.notes.dismiss();
    }
    if (readOnly) this.host.setAttribute("aria-readonly", "true");
    else this.host.removeAttribute("aria-readonly");

    this.findBar?.destroy();
    this.findBar =
      this.config?.find === false
        ? null
        : new FindBar(this.host, this.baseTheme, this, this.readOnly);
    this.emitCommandStateChange();
    // Object handles show only while the grid can be edited.
    this.scheduleRender();
  }

  setConfig(config: GridConfig | undefined): void {
    // Declarative hosts re-create option objects per render (`config={{...}}`).
    // A shallowly-equal config is the same configuration: adopt the new
    // reference but skip the chrome rebuild — rebuilding would drop widget
    // focus and, through layout-driven scroll events, could re-trigger the
    // host render that produced the object in the first place.
    if (shallowEqualConfig(config, this.config)) {
      this.config = config;
      return;
    }
    const focus = this.selection.focusCell;
    const keymap = new Keymap(config, {
      cell: focus ? { sheet: this.activeSheet, ...focus } : null,
      clientX: 0,
      clientY: 0,
    });
    this.keymap = keymap;
    this.config = config;

    const keyboard = config?.keyboard ?? true;
    this.keyboardPolicy =
      typeof keyboard === "function" ? (event: KeyboardEvent) => keyboard(event, this) : keyboard;

    this.toolbar?.destroy();
    this.ribbon?.destroy();
    this.ribbon = null;
    this.toolbar = null;
    this.toolbarHeight = 0;
    this.createToolbar(config);

    this.interactions.configureMenu(config, this.baseTheme);

    this.findBar?.destroy();
    this.findBar =
      config?.find === false ? null : new FindBar(this.host, this.baseTheme, this, this.readOnly);

    this.sheetTabs?.destroy();
    this.sheetTabs = null;
    this.tabBar?.remove();
    this.tabBar = null;
    this.tabBarHeight = config?.tabs !== false ? 28 : 0;
    if (this.tabBarHeight > 0) this.buildTabBar();

    this.viewportEl.style.top = `${this.toolbarHeight}px`;
    this.viewportEl.style.bottom = `${this.tabBarHeight}px`;
    this.panelHost.style.top = `${this.toolbarHeight}px`;
    this.panelHost.style.bottom = `${this.tabBarHeight}px`;
    this.applyLayout();
    this.render();
    this.emitCommandStateChange();
  }

  applyTransaction(transaction: GridTransaction): ApplyTransactionResult {
    const resourceValidation = validateTransactionResources(
      transaction.patches,
      this.transactionResourceLimits,
    );
    if (!resourceValidation.ok) {
      return {
        status: "rejected",
        epoch: this.storeEpoch,
        issues: [resourceValidation.issue],
      };
    }
    // The controller receives a private copy of the caller's operations. The
    // copy is verified against the measured payload, so the controller and the
    // store reuse this measurement instead of walking it again.
    const patches = transaction.patches.slice();
    const admitted = admitTransactionResources(
      patches,
      this.transactionResourceLimits,
      resourceValidation,
      transaction.patches,
    );
    return this.document.commit(patches, "api", admitted);
  }

  exportSnapshot(): WorkbookSnapshot {
    const snapshot = this.store.exportSnapshot?.();
    if (!snapshot) {
      throw new Error("Sheetwrite: the injected Store does not support snapshot export");
    }
    if (snapshot.workbook.activeSheet === this.activeSheet) return snapshot;
    return {
      ...snapshot,
      workbook: { ...snapshot.workbook, activeSheet: this.activeSheet },
    };
  }

  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options: RemoteOperationOptions = {},
  ): ApplyTransactionResult {
    return this.document.applyRemoteOperations(operations, options);
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom)) return;
    const next = Math.min(2, Math.max(0.5, zoom));
    if (next === this.zoom) return;
    this.zoom = next;
    this.applyZoomedTheme();
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
  private applyZoomedTheme(): void {
    const base = this.baseTheme;
    const z = this.zoom;
    const scaled =
      z === 1
        ? base
        : {
            ...base,
            rowHeight: base.rowHeight * z,
            headerHeight: base.headerHeight * z,
            rowHeaderWidth: base.rowHeaderWidth * z,
            font: scaleFontPx(base.font, z),
          };
    this.theme = this.withAdaptiveGutter(scaled, this.sheet().rowCount);
    this.renderer.setTheme(this.theme);
    this.domOverlay.setTheme(this.theme);
    this.syncTabBarTheme();
    this.rebuildIndex();
    this.rebuildColumnIndex();
    this.applyLayout();
    this.render();
  }

  setFrozen(rows: number, cols = 0): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
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
    this.customRenderers.set(name, renderer);
    this.renderer.setRenderers(this.customRenderers);
    this.domOverlay.setRenderers(this.customRenderers);
    this.applyLayout();
    this.scheduleRender();
  }

  insertRows(at: number, count = 1): void {
    if (count <= 0) return;
    this.document.commit(
      [{ op: "addRows", sheet: this.activeSheet, at: Math.max(0, at), count }],
      "structure",
    );
  }

  removeRows(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.rowCount) return;
    this.document.commit(
      [
        {
          op: "removeRows",
          sheet: this.activeSheet,
          at: Math.max(0, at),
          count: Math.min(count, sheet.rowCount - Math.max(0, at)),
        },
      ],
      "structure",
    );
  }

  insertColumns(at: number, count = 1): void {
    if (count <= 0) return;
    const insertAt = Math.max(0, Math.min(at, this.sheet().columns.length));
    this.document.commit(
      [
        {
          op: "addColumns",
          sheet: this.activeSheet,
          at: insertAt,
          columns: this.makeBlankColumns(insertAt, count),
        },
      ],
      "structure",
    );
  }

  removeColumns(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.columns.length || sheet.columns.length <= 1) return;
    const removeAt = Math.max(0, at);
    this.document.commit(
      [
        {
          op: "removeColumns",
          sheet: this.activeSheet,
          at: removeAt,
          count: Math.min(count, sheet.columns.length - removeAt, sheet.columns.length - 1),
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
      { key: "a", header: "A", width: DEFAULT_COL_WIDTH, type: "text" as const },
    ];
    const name = validateSheetName(
      input.name,
      this.store.getWorkbook().sheets.map((sheet) => sheet.name),
    );
    const snapshot: SheetSnapshot = {
      id,
      name: name.name,
      order: this.store.getWorkbook().sheets.length,
      rowCount: input.rowCount ?? 100,
      columns,
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
          sheet: this.activeSheet,
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
        sheet: this.activeSheet,
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      },
      target: { kind: "external", url: "unsafe:" },
    };
    return this.document.commit(
      [
        {
          op: "setHyperlink",
          sheet: this.activeSheet,
          hyperlink: candidate,
        },
      ],
      "api",
    );
  }

  removeHyperlink(id: string): ApplyTransactionResult {
    return this.document.commit([{ op: "removeHyperlink", sheet: this.activeSheet, id }], "api");
  }

  getHyperlink(addr: CellAddress): CellHyperlink | null {
    return hyperlinkAt(this.store.getWorkbook(), addr);
  }

  activateHyperlink(addr: CellAddress): boolean {
    if (this.hyperlinkActivation === "disabled") return false;
    const hyperlink = hyperlinkAt(this.store.getWorkbook(), addr);
    if (!hyperlink) return false;
    const target = resolveHyperlinkTarget(this.store.getWorkbook(), hyperlink.target);
    for (const listener of this.listeners["hyperlink-activate"]) {
      listener({ address: { ...addr }, hyperlink, target });
    }
    if (target.kind === "internal" && this.hyperlinkActivation === "internal-navigation") {
      this.scrollToCell(target.address);
    }
    return true;
  }

  setValidationRule(rule: DataValidationRule): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "setValidationRule", sheet: this.activeSheet, rule: structuredClone(rule) }],
      "api",
    );
  }

  removeValidationRule(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeValidationRule", sheet: this.activeSheet, id }],
      "api",
    );
  }

  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult {
    return this.document.commit(
      [
        {
          op: "setProtectedRange",
          sheet: this.activeSheet,
          protectedRange: structuredClone(protectedRange),
        },
      ],
      "api",
    );
  }

  removeProtectedRange(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeProtectedRange", sheet: this.activeSheet, id }],
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
      [{ op: "setPivot", sheet: owner ?? this.activeSheet, pivot: changed }],
      "api",
    );
  }

  removePivot(id: string, sheet?: SheetId): ApplyTransactionResult {
    const owner = sheet ?? pivotOwner(this.store.getWorkbook().sheets, id)?.id ?? this.activeSheet;
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

  getCharts(sheet: SheetId = this.activeSheet): readonly ChartDefinition[] {
    return structuredClone(this.sheetById(sheet)?.charts ?? []);
  }

  setChart(sheet: SheetId, chart: ChartDefinition): boolean {
    const result = this.document.commit(
      [{ op: "setChart", sheet, chart: structuredClone(chart) }],
      "api",
    );
    return result.status === "applied";
  }

  removeChart(sheet: SheetId, id: string): boolean {
    return this.document.commit([{ op: "removeChart", sheet, id }], "api").status === "applied";
  }

  selectChart(sheet: SheetId, id: string | null): void {
    if (id !== null && sheet !== this.activeSheet) this.setActiveSheet(sheet);
    // Charts on other sheets are never selected, so there is nothing to deselect there.
    if (sheet === this.activeSheet) this.objectLayer.select(id);
  }

  openPanel(panel: GridPanel | null): void {
    const wasOpen = this.panelDispose !== null;
    const hadFocus = this.panelHost.contains(document.activeElement);
    this.panelDispose?.();
    this.panelDispose = null;

    const isOpen = panel !== null;
    // The panel focuses its first control while it mounts; a hidden host refuses focus.
    this.panelHost.hidden = !isOpen;
    if (panel) {
      this.panelDispose = mountSidePanel(this.panelHost, panel, () => this.openPanel(null));
    }
    if (isOpen !== wasOpen) {
      this.viewportEl.style.right = isOpen ? `${PANEL_WIDTH}px` : "0px";
      this.syncSizer();
      this.render();
    }
    // Escape and the close button leave focus in a removed panel; give it back to the grid.
    if (!isOpen && hadFocus) this.host.focus();
  }

  setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void {
    this.store.setProtectionResolver?.(resolver, mode);
  }

  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult {
    return this.document.commit([{ op: "setNote", addr: { ...addr }, text: text || null }], "api");
  }

  getNote(addr: CellAddress): string | null {
    return (
      this.sheetById(addr.sheet)?.notes?.find(
        (note) => note.addr.row === addr.row && note.addr.col === addr.col,
      )?.text ?? null
    );
  }

  private makeBlankColumns(at: number, count: number): Column[] {
    const used = new Set(this.sheet().columns.map((column) => column.key));
    const columns: Column[] = [];
    for (let i = 0; i < count; i++) {
      const col = at + i;
      const base = `col_${col}`;
      let key = base;
      let suffix = 1;
      while (used.has(key)) key = `${base}_${suffix++}`;
      used.add(key);
      columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "text" });
    }
    return columns;
  }

  private materializeVirtualColumns(patches: DocumentOp[]): DocumentOp[] {
    // A write is measured against the width its sheet has when it runs, so
    // column inserts and deletes earlier in the batch count. Undoing a
    // trailing column delete restores cells right after re-adding the columns.
    const widthBySheet = new Map<SheetId, number>();
    const missingBySheet = new Map<SheetId, number>();
    const widthOf = (sheetId: SheetId): number | null => {
      const width = widthBySheet.get(sheetId);
      if (width !== undefined) return width;

      const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === sheetId);
      if (!stored) return null;
      widthBySheet.set(sheetId, stored.columns.length);
      return stored.columns.length;
    };

    for (const patch of patches) {
      let sheet: SheetId | null = null;
      let col = -1;
      if (patch.op === "addColumns" || patch.op === "removeColumns") {
        const width = widthOf(patch.sheet);
        if (width !== null) {
          const delta = patch.op === "addColumns" ? patch.columns.length : -patch.count;
          widthBySheet.set(patch.sheet, width + delta);
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

      const width = widthOf(sheet);
      if (width === null) continue;
      missingBySheet.set(sheet, Math.max(missingBySheet.get(sheet) ?? 0, col + 1 - width));
    }

    const additions: DocumentOp[] = [];
    for (const [sheetId, missing] of missingBySheet) {
      const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === sheetId);
      if (!stored || missing <= 0) continue;
      const used = new Set(stored.columns.map((column) => column.key));
      const columns: Column[] = [];
      for (let col = stored.columns.length; col < stored.columns.length + missing; col++) {
        const base = `col_${col}`;
        let key = base;
        let suffix = 1;
        while (used.has(key)) key = `${base}_${suffix++}`;
        used.add(key);
        columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "text" });
      }
      additions.push({ op: "addColumns", sheet: sheetId, at: stored.columns.length, columns });
    }
    return additions.length > 0 ? [...additions, ...patches] : patches;
  }

  private buildActions(): GridActions {
    return {
      toggleBold: () => this.styleActions.toggleStyle("bold"),
      toggleItalic: () => this.styleActions.toggleStyle("italic"),
      toggleUnderline: () => this.styleActions.toggleStyle("underline"),
      toggleStrikethrough: () => this.styleActions.toggleStyle("strikethrough"),
      setAlign: (align) => this.styleActions.applyStyle({ align }),
      setTextColor: (color) => this.styleActions.applyStyle({ color: color ?? undefined }),
      setFillColor: (color) =>
        this.styleActions.applyStyle({ backgroundColor: color ?? undefined }),
      setFontFamily: (family) => this.styleActions.applyStyle({ fontFamily: family ?? undefined }),
      setFontSize: (px) => this.styleActions.applyStyle({ fontSize: px ?? undefined }),
      stepFontSize: (direction) => {
        const defaultFontSize = 13;
        const themeFontSize =
          Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.baseTheme.font)?.[1] ?? "") ||
          defaultFontSize;
        this.styleActions.applyStyle({
          fontSize: stepFontSizePx(this.getFocusCellStyle().fontSize ?? themeFontSize, direction),
        });
      },
      setVerticalAlign: (verticalAlign) => this.styleActions.applyStyle({ verticalAlign }),
      toggleWrap: () => this.styleActions.applyStyle({ wrap: !this.getFocusCellStyle().wrap }),
      setNumberFormat: (code) => this.styleActions.applyStyle({ numberFormat: code ?? undefined }),
      stepDecimals: (direction) => {
        const focus = this.selection.focusCell;
        if (!focus) return;
        const column = this.sheet().columns[focus.col];
        const value = this.store.getCell({
          sheet: this.activeSheet,
          row: this.toDataRow(focus.row),
          col: focus.col,
        }).resolved;
        const numberFormat = stepNumberFormatDecimals(
          this.getFocusCellStyle().numberFormat ?? column?.numberFormat,
          direction,
          typeof value === "number" ? value : undefined,
          column?.numberLocale,
        );
        if (numberFormat === undefined) return;

        this.styleActions.applyStyle({ numberFormat });
      },
      setBorders: (preset) => this.styleActions.setBorders(preset),
      mergeAndCenter: () => this.styleActions.mergeSelection(true),
      clearAll: () => this.styleActions.clearAll(),
      autoSum: () => this.autoSum(),
      find: () => this.findBar?.open(),
      freezePanes: () => {
        const focus = this.selection.focusCell;
        if (focus) this.setFrozen(focus.row, focus.col);
      },
      toggleBorder: () => this.styleActions.toggleBorder(),
      clearFormat: () => this.styleActions.applyStyle(null),
      merge: () => this.styleActions.mergeSelection(),
      unmerge: () => this.styleActions.unmergeSelection(),
      sort: (ascending) => {
        const f = this.selection.focusCell;
        if (f) this.sortBy(f.col, ascending);
      },
      insertRowAbove: () => {
        const f = this.selection.focusCell;
        if (f) this.insertRows(this.toDataRow(f.row));
      },
      insertRowBelow: () => {
        const f = this.selection.focusCell;
        if (f) this.insertRows(this.toDataRow(f.row) + 1);
      },
      deleteRow: () => {
        const f = this.selection.focusCell;
        if (f) this.removeRows(this.toDataRow(f.row));
      },
      insertColumnLeft: () => {
        const f = this.selection.focusCell;
        if (f) this.insertColumns(f.col);
      },
      insertColumnRight: () => {
        const f = this.selection.focusCell;
        if (f) this.insertColumns(f.col + 1);
      },
      deleteColumn: () => {
        const f = this.selection.focusCell;
        if (f) this.removeColumns(f.col);
      },
      hideRows: (rows) => {
        const focus = this.selection.focusCell;
        const targets = rows ?? (focus ? [this.toDataRow(focus.row)] : []);
        this.hideRows(targets);
      },
      showRows: (rows) => this.showRows(rows),
      autoFitRows: () => {
        const focus = this.selection.focusCell;
        if (!focus) return;
        const row = this.toDataRow(focus.row);
        this.autoFitRows({
          sheet: this.activeSheet,
          start: { row, col: 0 },
          end: { row, col: Math.max(0, this.sheet().columns.length - 1) },
        });
      },
      hideColumns: (cols) => this.hideColumns(cols),
      showColumns: (cols) => this.showColumns(cols),
      autoFitColumns: (cols) => this.autoFitColumns(cols),
      clearFilter: (col) => {
        const target = col ?? this.selection.focusCell?.col;
        if (target !== undefined) this.setColumnFilter(target, null);
      },
      copy: () => this.clipboard.copy(),
      cut: () => this.clipboard.cut(),
      paste: () => this.clipboard.paste(),
      pasteValues: () => this.clipboard.pasteValues(),
      clearContents: () => this.clearSelection(),
      exportCsv: (filename) => {
        try {
          this.exportCsv(filename ?? "sheetwrite.csv");
        } catch (error) {
          this.emitExportError(error, "csv");
        }
      },
      // Resolves when the download is handed to the browser; never rejects,
      // because a failure is reported once through `export-error`.
      exportXlsx: (filename) =>
        this.exportXlsx(filename ?? "sheetwrite.xlsx").catch((error: unknown) => {
          this.emitExportError(error, "xlsx");
        }),
      editNote: () => {
        // Same gate as the cell editor: do not open an editor whose save must fail.
        const focus = this.selection.focusCell;
        if (this.readOnly || !focus) return;

        const cell = this.noteCell(focus.row, focus.col);
        this.scrollToCell({ sheet: this.activeSheet, row: cell.row, col: cell.col });
        this.notes.edit(cell);
      },
      deleteNote: () => {
        const focus = this.selection.focusCell;
        if (this.readOnly || !focus) return;

        const { address } = this.noteCell(focus.row, focus.col);
        if (this.getNote(address) !== null) this.setNote(address, null);
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
    };
  }

  getFocusCellStyle(): CellStyle {
    const focus = this.selection.focusCell;
    if (!focus) return {};
    const anchor = this.anchorCell(focus.row, focus.col);
    const cell = this.store.getCell({
      sheet: this.activeSheet,
      row: this.toDataRow(anchor.row),
      col: anchor.col,
    });
    return { ...this.sheet().columns[anchor.col]?.cellStyle, ...cell.style };
  }

  async summarizeSelection(signal?: AbortSignal): Promise<SelectionSummary | null> {
    signal?.throwIfAborted();
    if (this.selection.isEmpty) return null;

    // The selection and the active sheet can change while chunks yield, so
    // the whole run works from a copy of both.
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push({ ...rect }));
    const sheet = this.activeSheet;
    const columnCount = this.sheet().columns.length;

    let count = 0;
    let numericCount = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let readSinceYield = 0;

    for (const rect of rects) {
      // Whole-row selections extend past the last column; nothing lives there.
      const lastCol = Math.min(rect.c1, columnCount - 1);
      if (lastCol < rect.c0) continue;

      const cols: number[] = [];
      for (let col = rect.c0; col <= lastCol; col++) cols.push(col);
      const rowsPerRead = Math.max(1, Math.floor(SUMMARY_CELLS_PER_READ / cols.length));

      for (let start = rect.r0; start <= rect.r1; start += rowsPerRead) {
        // Small selections finish in one turn. Larger ones give the page a
        // turn after each frame's worth of reading, then stop if aborted.
        if (readSinceYield >= SUMMARY_CELLS_PER_READ) {
          readSinceYield = 0;
          const pause = Promise.withResolvers<void>();
          setTimeout(pause.resolve, 0);
          await pause.promise;
          signal?.throwIfAborted();
        }

        // View rows: the store maps them through sort and filter, so rows a
        // filter hides are never read, as in Excel's status bar.
        const end = Math.min(rect.r1 + 1, start + rowsPerRead);
        const { values } = this.store.getVisibleWindow(sheet, { start, end }, cols);
        readSinceYield += values.length;

        // Tallied inline: a helper call per cell would cost millions of calls
        // on a whole-sheet selection.
        for (let index = 0; index < values.length; index++) {
          const value = values[index];
          if (value === null || value === undefined || value === "") continue;
          count += 1;

          if (typeof value !== "number") continue;
          numericCount += 1;
          sum += value;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
    }

    const hasNumbers = numericCount > 0;
    return {
      count,
      numericCount,
      sum,
      average: hasNumbers ? sum / numericCount : null,
      min: hasNumbers ? min : null,
      max: hasNumbers ? max : null,
    };
  }

  private autoSum(): void {
    const focus = this.selection.focusCell;
    if (this.readOnly || !focus) return;
    const row = this.toDataRow(focus.row);
    const col = focus.col;
    const chunkCells = 4_096;
    const numericStart = (vertical: boolean): number => {
      let end = vertical ? row : col;
      const origin = end;
      while (end > 0) {
        const start = Math.max(0, end - chunkCells);
        const columns = vertical
          ? [col]
          : Array.from({ length: end - start }, (_, index) => start + index);
        const window = this.store.getDataWindow?.(
          this.activeSheet,
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
            ? engine.captureResolvedCells(this.activeSheet, coordinates)
            : coordinates.map((coordinate) =>
                this.store.getCell({ sheet: this.activeSheet, ...coordinate }),
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
    const firstRow = numericStart(true);
    const vertical = firstRow < row;
    const firstCol = vertical ? col : numericStart(false);
    if (!vertical && firstCol === col) return;
    const start = `${colToA1(firstCol)}${(vertical ? firstRow : row) + 1}`;
    const end = `${colToA1(vertical ? col : col - 1)}${(vertical ? row - 1 : row) + 1}`;
    this.document.commit(
      [
        {
          op: "set",
          addr: { sheet: this.activeSheet, row, col },
          value: { kind: "formula", src: `=SUM(${start}:${end})` },
        },
      ],
      "edit-enter",
    );
  }

  getCommandState(command: GridCommandName): GridCommandState {
    const summary = COMMAND_STATE_ACTIVITY_COMMANDS.includes(command)
      ? this.formattingSummary()
      : undefined;
    return this.resolveCommandState(command, summary);
  }

  private resolveCommandState(
    command: GridCommandName,
    summary?: Readonly<Partial<Record<GridCommandName, number>>>,
  ): GridCommandState {
    if (command === "undo") {
      return {
        disabled: this.readOnly || !this.document.canUndo,
        activity: "inactive",
      };
    }
    if (command === "redo") {
      return {
        disabled: this.readOnly || !this.document.canRedo,
        activity: "inactive",
      };
    }

    const selectionRequired =
      isFormattingCommand(command) ||
      command === "merge" ||
      command === "unmerge" ||
      command === "sortAsc" ||
      command === "sortDesc";
    const disabled =
      (selectionRequired && this.selection.isEmpty) ||
      (this.readOnly && command !== "exportCsv" && command !== "exportXlsx");
    const activity = summary?.[command] ?? 0;
    return {
      disabled,
      activity: activity === 3 ? "mixed" : activity === 1 ? "active" : "inactive",
    };
  }

  private formattingSummary(): Readonly<Partial<Record<GridCommandName, number>>> {
    const summary: Partial<Record<GridCommandName, number>> = {};
    for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) summary[command] = 0;

    if (this.selection.isEmpty) return summary;

    const coordinates: Array<{ row: number; col: number }> = [];
    let complete = true;
    this.selection.forEachRect((rect) => {
      if (!complete) return;

      for (let row = rect.r0; row <= rect.r1; row++) {
        const dataRow = this.toDataRow(row);
        for (let col = rect.c0; col <= rect.c1; col++) {
          if (coordinates.length >= COMMAND_STATE_CELL_LIMIT) {
            complete = false;
            return;
          }

          const column = this.sheet().columns[col];
          if (!column) continue;
          coordinates.push({ row: dataRow, col });
        }
      }
    });

    if (!complete) {
      for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) summary[command] = 3;
      return summary;
    }

    const engine = storeEngine(this.store);
    // Custom stores without an engine retain their single-cell read contract.
    const cells = engine
      ? engine.captureResolvedCells(this.activeSheet, coordinates)
      : coordinates.map(({ row, col }) =>
          this.store.getCell({ sheet: this.activeSheet, row, col }),
        );

    for (const [index, coordinate] of coordinates.entries()) {
      const cell = cells[index];
      const column = this.sheet().columns[coordinate.col];
      if (!cell || !column) continue;

      for (const command of COMMAND_STATE_ACTIVITY_COMMANDS) {
        const bit = formattingCommandActive(command, cell.style, column.cellStyle) ? 1 : 2;
        summary[command] = (summary[command] ?? 0) | bit;
      }
    }

    return summary;
  }

  private commandStateSnapshot(): Readonly<Record<GridCommandName, GridCommandState>> {
    const summary = this.formattingSummary();
    const states = {} as Record<GridCommandName, GridCommandState>;
    for (const command of GRID_COMMANDS) {
      states[command] = this.resolveCommandState(command, summary);
    }
    return states;
  }

  private emitCommandStateChange(): void {
    this.commandStateQueued = false;
    this.commandStateGeneration += 1;
    if (this.destroyed || this.listeners["command-state-change"].size === 0) return;
    const event = { states: this.commandStateSnapshot() };
    for (const listener of this.listeners["command-state-change"]) listener(event);
  }

  private queueCommandStateChange(): void {
    if (this.commandStateQueued || this.destroyed) return;
    this.commandStateQueued = true;
    const generation = ++this.commandStateGeneration;
    queueMicrotask(() => {
      if (!this.commandStateQueued || generation !== this.commandStateGeneration) return;
      this.emitCommandStateChange();
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
    return this.loadable ? this.loadable.aggregate(this.activeSheet, col, op) : 0;
  }

  sortBy(col: number, ascending = true): void {
    void this.setSort([{ col, ascending }]);
  }

  filterBy(col: number, needle: string): void {
    this.setColumnFilter(col, { kind: "contains", text: needle });
  }

  clearView(): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { sortKeys: [], filters: [] },
        },
      ],
      "structure",
    );
  }

  sortByMulti(keys: readonly SortKey[]): void {
    void this.setSort(keys);
  }

  setSort(keys: readonly SortKey[]): ApplyTransactionResult {
    const outcome = this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { sortKeys: keys.map((key) => ({ ...key })) },
        },
      ],
      "structure",
    );
    return outcome;
  }

  setColumnFilter(col: number, filter: ColumnFilter | null): void {
    const filters = new Map(this.sheet().filters ?? []);
    if (filter === null) filters.delete(col);
    else filters.set(col, structuredClone(filter));
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { filters: [...filters] },
        },
      ],
      "structure",
    );
  }

  getColumnFilters(): ReadonlyMap<number, ColumnFilter> {
    return new Map(this.sheet().filters ?? this.loadable?.columnFilters(this.activeSheet) ?? []);
  }

  distinctValues(col: number, limit = 1000): CellScalar[] {
    return this.loadable?.distinctValues(this.activeSheet, col, limit) ?? [];
  }

  hideRows(rows: readonly number[]): void {
    const sheet = this.sheet();
    const patches: DocumentOp[] = [];
    for (const row of new Set(rows)) {
      if (row < 0 || row >= sheet.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet: this.activeSheet,
        row,
        meta: { height: sheet.rowHeights?.get(row), hidden: true },
      });
    }
    this.document.commit(patches, "structure");
  }

  showRows(rows?: readonly number[]): void {
    const sheet = this.sheet();
    const targets = rows ?? [...(sheet.hiddenRows ?? [])];
    const patches: DocumentOp[] = [];
    for (const row of new Set(targets)) {
      if (row < 0 || row >= sheet.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet: this.activeSheet,
        row,
        meta: { height: sheet.rowHeights?.get(row), hidden: false },
      });
    }
    this.document.commit(patches, "structure");
  }

  hiddenRows(): readonly number[] {
    return [...(this.sheet().hiddenRows ?? [])].sort((a, b) => a - b);
  }

  hideColumns(cols?: readonly number[]): void {
    const sheet = this.sheet();
    const targets = cols ?? (this.selection.focusCell ? [this.selection.focusCell.col] : []);
    const unique = [...new Set(targets)]
      .filter(
        (col) => col >= 0 && col < sheet.columns.length && sheet.columns[col]?.visible !== false,
      )
      .sort((left, right) => left - right);
    let visibleCount = sheet.columns.reduce(
      (count, column) => count + (column.visible === false ? 0 : 1),
      0,
    );
    const patches: DocumentOp[] = [];
    for (const col of unique) {
      if (visibleCount <= 1) break;
      patches.push({ op: "setColumn", sheet: this.activeSheet, col, patch: { visible: false } });
      visibleCount--;
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
      patches.push({ op: "setColumn", sheet: this.activeSheet, col, patch: { visible: true } });
    }
    this.document.commit(patches, "structure");
  }

  hiddenColumns(): readonly number[] {
    return this.sheet().columns.flatMap((column, col) => (column.visible === false ? [col] : []));
  }

  groupRows(start: number, end: number): void {
    const groups = addRowGroup(this.sheet().rowGroups, start, end);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  ungroupRows(start: number, end: number): void {
    const groups = removeRowGroup(this.sheet().rowGroups, start, end);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  setGroupCollapsed(start: number, collapsed: boolean): void {
    const groups = collapseRowGroup(this.sheet().rowGroups, start, collapsed);
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: groups } }],
      "structure",
    );
  }

  rowGroups(): readonly RowGroup[] {
    return this.sheet().rowGroups ?? [];
  }

  undo(): void {
    if (!this.readOnly) this.document.undo();
    this.queueCommandStateChange();
  }

  redo(): void {
    if (!this.readOnly) this.document.redo();
    this.queueCommandStateChange();
  }

  private emitExportError(error: unknown, format: "csv" | "xlsx"): void {
    if (this.destroyed) return;
    const operation = format === "csv" ? "delimited-export" : "export-xlsx";
    const failure = normalizeSheetwriteError(error, "export-failed", operation, { format });
    this.actionFeedback.show(`Export failed: ${failure.message} Try again.`);
    for (const listener of this.listeners["export-error"]) {
      listener({ format, error: failure });
    }
  }

  private requireCompleteExport(sheets: readonly Sheet[]): void {
    if (!this.loadable) return;
    for (const sheet of sheets) {
      const capability = this.loadable.queryCapability(sheet.id);
      if (capability.status === "incomplete") {
        throw new IncompleteDataError(sheet.id, capability);
      }
    }
  }

  exportCsv(filename: string): void {
    this.requireCompleteExport([this.sheet()]);
    downloadBytes(toCsv(this.sheet(), this.store), filename, "text/csv;charset=utf-8");
  }

  async exportXlsx(filename: string): Promise<void> {
    const storedWorkbook = this.store.getWorkbook();
    const workbook =
      storedWorkbook.activeSheet === this.activeSheet
        ? storedWorkbook
        : { ...storedWorkbook, activeSheet: this.activeSheet };
    const sheet =
      workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
      workbook.sheets[0];
    if (sheet) this.requireCompleteExport([sheet]);
    const bytes = await toXlsxTable(workbook, this.store);
    downloadBytes(
      bytes,
      filename,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  /**
   * A resolution query stops being useful after it changes, so replace it with
   * one matching the current display. This catches DPR-only changes that do not
   * resize the host and therefore never reach ResizeObserver.
   */
  private armResolutionListener(): void {
    this.resolutionMediaQuery?.removeEventListener("change", this.onResolutionChange);
    this.resolutionMediaQuery = null;
    if (typeof globalThis.matchMedia !== "function") return;

    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    this.resolutionMediaQuery = globalThis.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.resolutionMediaQuery.addEventListener("change", this.onResolutionChange);
  }

  private onResize(): void {
    this.syncSizer();
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelAutoFit();
    this.datasourceController.destroy();
    this.mutationRevisions.clear();
    this.readWindows.destroy();
    this.interactions.destroy();
    this.notes.destroy();
    this.objectLayer.destroy();
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.resizeObserver?.disconnect();
    this.resolutionMediaQuery?.removeEventListener("change", this.onResolutionChange);
    this.resolutionMediaQuery = null;
    this.document.destroy();
    this.disposeStore();
    // Free the WASM CellStore only when we constructed it. A caller-provided
    // store is owned by the caller and must stay usable after the grid is gone.
    if (this.ownsStore) this.loadable?.dispose();
    let failure: unknown;
    let failed = false;
    const cleanup = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    };
    cleanup(() => this.renderer.destroy());
    cleanup(() => this.domOverlay.destroy());
    cleanup(() => this.scroller.remove());
    cleanup(() => this.overlayPainter.destroy());
    cleanup(() => this.sheetTabs?.destroy());
    cleanup(() => this.tabBar?.remove());
    cleanup(() => this.toolbar?.destroy());
    cleanup(() => this.ribbon?.destroy());
    cleanup(() => this.findBar?.destroy());
    cleanup(() => this.actionFeedback.destroy());
    cleanup(() => this.panelDispose?.());
    cleanup(() => this.disposePanels?.());
    cleanup(() => this.panelHost.remove());
    cleanup(() => this.viewportEl.remove());
    cleanup(() => this.ariaMirror.destroy());
    cleanup(() => this.host.classList.remove("sheetwrite"));
    cleanup(() => {
      for (const listeners of Object.values(this.listeners)) listeners.clear();
    });
    if (failed) throw failure;
  }
}

function appendPadColumns(columns: Column[], target: number): void {
  for (let c = columns.length; c < target; c++) {
    columns.push({ key: `__pad_${c}`, header: "", width: DEFAULT_COL_WIDTH, type: "text" });
  }
}

/**
 * Columns needed to satisfy `minColumns` and, for a spreadsheet, to fill the
 * host width. A data grid's columns come from the data, so it adds empty
 * columns only when the host asks for them with `minColumns`.
 */
function padTarget(
  host: HTMLElement,
  minColumns: number | undefined,
  presentation: GridPresentation,
): number {
  if (presentation === "data-grid") return minColumns ?? 0;
  const fillWidth = host.clientWidth - DEFAULT_THEME.rowHeaderWidth;
  const fillCols = fillWidth > 0 ? Math.ceil(fillWidth / DEFAULT_COL_WIDTH) + 1 : 0;
  return Math.max(minColumns ?? 0, fillCols);
}

/**
 * Same configuration by shallow own-property comparison. Fresh-but-identical
 * flag objects from declarative hosts compare equal; arrays, functions, and
 * nested objects recreated inline compare different (conservatively rebuilding).
 */
function shallowEqualConfig(a: GridConfig | undefined, b: GridConfig | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const aKeys = Object.keys(a) as Array<keyof GridConfig>;
  const bKeys = Object.keys(b) as Array<keyof GridConfig>;
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
