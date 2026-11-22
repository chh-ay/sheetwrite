import {
  type CellFormat,
  type CellScalar,
  type CellStyle,
  type Column,
  createGrid,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  parseCellLiteralInput,
  type Workbook,
} from "@sheetwrite/core";

import "@sheetwrite/core/styles.css";
import type { CellValue, GridSettings, HotInstance } from "handsontable";

import {
  getMergeIndexResourceStatsForTest,
  intersectingMerges,
  prepareMergeIndex,
  resetMergeIndexResourceStatsForTest,
} from "../../packages/core/src/canvas-paint.js";
import {
  formatNumber,
  getNumberFormatResourceStatsForTest,
  resetNumberFormatResourcesForTest,
} from "../../packages/core/src/number-format.js";
import type { InstrumentedVisibleWindowView } from "../../packages/core/src/store/window-reader.js";
import type { PanePaint } from "../../packages/core/src/types/render.js";

import "handsontable/styles/handsontable.css";
import "handsontable/styles/ht-theme-main.css";
import {
  type BenchColumn,
  COL,
  COLUMNS,
  type ColumnarDataset,
  datasetChecksum,
  makeColumnar,
  toAoA,
} from "./dataset.js";
import { createHandsontable } from "./handsontable-runtime.js";
import {
  ALL_RENDER_SCENARIOS,
  type BrowserCombinationResult,
  type EngineId,
  type FailedScenario,
  type FailureStage,
  RENDER_MINIMUM_SAMPLE_MS,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  RENDER_VIEWPORT,
  RENDER_WARMUP_SAMPLES,
  type RenderResourceMetrics,
  type ScenarioId,
  type ScenarioResult,
  WINDOW_TRANSFER_SCENARIO_IDS,
} from "./render-protocol.js";
import {
  type CellSelection,
  CONDITIONAL_AMOUNT_THRESHOLD,
  CONDITIONAL_HIGH_BACKGROUND,
  CONDITIONAL_LOW_COLOR,
  CURRENCY_NUMBER_FORMAT,
  type FrozenPaneProbe,
  type GeometryObservation,
  measureUnresizedMillionRowGeometry,
  type RenderBenchAdapter,
  type RenderBenchDiagnosticAdapter,
  type ResolvedStyleProbe,
  runRenderScenario,
  type ScrollObservation,
  SEARCH_MATCH_PREFIX,
  type SearchProbe,
  type WindowReadDiagnosticMode,
  type WindowTransferCounters,
  WRAP_HEAVY_TEXT_LENGTH,
  WRAP_HEAVY_TEXT_PREFIX,
  WRAP_UNICODE_CELL,
} from "./render-scenarios.js";

const SHEET = "bench";
const SHEETWRITE_ROW_HEIGHT = 28;
const HANDSONTABLE_ROW_HEIGHT = 23;
const FORMULA_DENSE_ROWS = 64;
const TRANSACTION_CHUNK_SIZE = 8_000;
const LONG_TEXT_SUFFIX = "x".repeat(192);
const AMOUNT_NUMBER_FORMAT = "#,##0.00";
const DATE_NUMBER_FORMAT = "mmm d, yyyy";
const NUMBER_LOCALE = "en-US";

interface PageConfiguration {
  readonly engine: EngineId;
  readonly rows: number;
  readonly scenarios: readonly ScenarioId[];
  readonly measuredSamples: number;
  readonly warmupSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly runId: string;
  readonly round: number;
  readonly windowTransferDiagnostic: boolean;
}

declare global {
  interface Window {
    __benchResults?: BrowserCombinationResult;
    __benchDone?: boolean;
    __benchError?: string;
    __benchStage?: FailureStage | "complete";
  }
}

function next_frame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

function settle(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
}

function dispatch_key(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** The date column is typed in Sheetwrite, so its ISO text ingests as date serials. */
function sheetwrite_column_type(column: BenchColumn): CellFormat {
  return column.key === "date" ? "date" : column.type;
}

function make_workbook(row_count: number): Workbook {
  const columns: Column[] = COLUMNS.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
    type: sheetwrite_column_type(column),
    numberFormat:
      column.key === "amount"
        ? AMOUNT_NUMBER_FORMAT
        : column.key === "date"
          ? DATE_NUMBER_FORMAT
          : undefined,
    numberLocale: NUMBER_LOCALE,
  }));
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Bench", rowCount: row_count, columns }],
  };
}
function dataset_value_at(dataset: ColumnarDataset, row: number, col: number): string | number {
  if (col === 0) return dataset.id[row]!;
  if (col === 1) return dataset.date[row]!;
  if (col === 2) return dataset.customer[row]!;
  if (col === 3) return dataset.city[row]!;
  return dataset.amount[row]!;
}

/**
 * The value Sheetwrite's column-aware ingest holds for a dataset cell. Restores
 * write this rather than the dataset text, so a restored cell matches a freshly
 * loaded one and no scenario depends on which scenarios ran before it.
 */
function ingested_value_at(dataset: ColumnarDataset, row: number, col: number): CellScalar {
  const column = COLUMNS[col];
  if (!column) throw new RangeError(`benchmark column ${col} is missing`);
  const value = dataset_value_at(dataset, row, col);
  return typeof value === "string"
    ? parseCellLiteralInput(value, sheetwrite_column_type(column))
    : value;
}

/** Signature of the built-in renderer's frozen-pane paint hook. */
type PanePaintFn = (
  panes: readonly PanePaint[],
  divider: { x: number | null; y: number | null },
) => void;

function empty_frozen_pane_probe(): FrozenPaneProbe {
  return {
    paneFrames: 0,
    paneCount: 0,
    pinnedRows: null,
    pinnedColumns: [],
    pinnedScrollTop: null,
    bodyRows: null,
    bodyScrollTop: null,
    bodyScrollLeft: null,
  };
}

class SheetwriteAdapter implements RenderBenchDiagnosticAdapter {
  readonly id = "sheetwrite" as const;
  readonly initialRowCount: number;
  readonly colCount = COLUMNS.length;
  private grid!: Grid;
  private host!: HTMLElement;
  private readonly data: { rowCount: number; columns: Record<string, ArrayLike<string | number>> };
  private readonly dataset: ColumnarDataset;
  private formula_dense_rows = 0;
  private text_heavy_rows = 0;
  private wrap_heavy_rows = 0;
  private search_match_rows = 0;
  private conditional_format_rows = 0;
  private frozen_pane_probe_armed = false;
  private frozen_pane_probe_state: FrozenPaneProbe = empty_frozen_pane_probe();
  private window_read_diagnostic_mode: WindowReadDiagnosticMode = "baseline";
  private prior_decoded_view: InstrumentedVisibleWindowView | undefined;
  private window_transfer_counters_state = {
    logicalFrames: 0,
    windowReadRequests: 0,
    logicalWindowReads: 0,
    copiedBytes: 0,
    outputAllocationEvents: 0,
  };
  /** Canvas frames the renderer has drawn; `repaint()` fails when one call draws none. */
  private canvas_frames = 0;
  private read_windows!: { invalidateData(): void };
  /** The renderer's canvas, which `present_frame()` rasterizes. */
  private frame_canvas: HTMLCanvasElement | null = null;
  /**
   * A one-pixel canvas that `present_frame()` copies the renderer's canvas
   * into and reads back. Reading it runs the copy at once, so it keeps no
   * snapshot of the renderer's canvas that the next draw would have to copy.
   */
  private readonly frame_sink = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  constructor(
    dataset: ColumnarDataset,
    private readonly windowTransferDiagnostic: boolean,
  ) {
    this.dataset = dataset;
    this.initialRowCount = dataset.rowCount;
    this.data = {
      rowCount: dataset.rowCount,
      columns: {
        id: dataset.id,
        date: dataset.date,
        customer: dataset.customer,
        city: dataset.city,
        amount: dataset.amount,
      },
    };
  }

  mount(host: HTMLElement): void {
    this.host = host;
    this.grid = createGrid(host, {
      workbook: make_workbook(this.initialRowCount),
      data: this.data,
    });
    this.install_frame_counter();
    if (this.windowTransferDiagnostic) this.install_window_transfer_diagnostic();
  }

  /**
   * Resolve the internals `repaint()` and `present_frame()` drive and count
   * every canvas frame. An internal that was renamed or removed fails the
   * mount instead of turning a timed repaint into a no-op.
   */
  private install_frame_counter(): void {
    const read_windows: unknown = Reflect.get(this.grid, "read_windows");
    if (
      typeof read_windows !== "object" ||
      read_windows === null ||
      typeof Reflect.get(read_windows, "invalidateData") !== "function"
    ) {
      throw new Error("repaint requires the grid's read-window controller");
    }
    this.read_windows = read_windows as { invalidateData(): void };
    const renderer = Reflect.get(this.grid, "renderer") as
      | {
          paint?: (view: InstrumentedVisibleWindowView) => void;
          paintPanes?: PanePaintFn;
        }
      | undefined;
    if (!renderer || typeof renderer.paint !== "function") {
      throw new Error("repaint requires a canvas renderer");
    }
    const canvas: unknown = Reflect.get(renderer, "canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("presenting a frame requires the canvas renderer's canvas");
    }
    this.frame_canvas = canvas;
    const paint = renderer.paint.bind(renderer);
    renderer.paint = (view) => {
      this.canvas_frames++;
      paint(view);
    };
    if (typeof renderer.paintPanes === "function") {
      const paint_panes = renderer.paintPanes.bind(renderer);
      renderer.paintPanes = (panes, divider) => {
        this.canvas_frames++;
        paint_panes(panes, divider);
      };
    }
  }

  private install_window_transfer_diagnostic(): void {
    const original_read = this.grid.store.getVisibleWindow.bind(this.grid.store);
    this.grid.store.getVisibleWindow = ((...args) => {
      this.window_transfer_counters_state.windowReadRequests++;
      if (this.window_read_diagnostic_mode === "reuse-decoded-view-upper-bound") {
        if (!this.prior_decoded_view) {
          throw new Error("window-transfer upper bound has no prior decoded view");
        }
        return this.prior_decoded_view;
      }
      const view = original_read(...args) as InstrumentedVisibleWindowView;
      const copied_bytes = view.ffiOutputBytes;
      const output_allocation_events = view.ffiOutputAllocationEvents;
      if (
        typeof copied_bytes !== "number" ||
        !Number.isSafeInteger(copied_bytes) ||
        copied_bytes < 0 ||
        typeof output_allocation_events !== "number" ||
        !Number.isSafeInteger(output_allocation_events) ||
        output_allocation_events <= 0
      ) {
        throw new Error("visible-window read omitted exact output transfer counters");
      }
      this.window_transfer_counters_state.logicalWindowReads++;
      this.window_transfer_counters_state.copiedBytes += copied_bytes;
      this.window_transfer_counters_state.outputAllocationEvents += output_allocation_events;
      this.prior_decoded_view = view;
      return view;
    }) as typeof this.grid.store.getVisibleWindow;

    const renderer = Reflect.get(this.grid, "renderer") as {
      paint(view: InstrumentedVisibleWindowView): void;
    };
    const original_paint = renderer.paint.bind(renderer);
    renderer.paint = (view): void => {
      this.window_transfer_counters_state.logicalFrames++;
      original_paint(view);
    };
  }

  isMountedAndAccessible(): boolean {
    return (
      this.host.isConnected &&
      this.host.getAttribute("aria-label") !== null &&
      this.host.querySelector("canvas") !== null &&
      this.host.querySelector(".sheetwrite-scroller") !== null
    );
  }

  rowCount(): number {
    return this.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === SHEET)?.rowCount ?? -1;
  }

  cellValue(row: number, col: number): unknown {
    return this.grid.store.getCell({ sheet: SHEET, row, col }).resolved;
  }

  setCellValue(row: number, col: number, value: string | number | null): void {
    this.grid.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value },
        },
      ],
    });
    this.grid.refresh();
  }

  selection(): CellSelection | null {
    const selection = this.grid.getSelection();
    return selection?.kind === "cell" ? { row: selection.addr.row, col: selection.addr.col } : null;
  }

  editorOpen(): boolean {
    return this.host.querySelector(".sheetwrite-editor") !== null;
  }

  private scroll_element(): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!element) throw new Error("sheetwrite scroller is not mounted");
    return element;
  }

  prepareScroll(axis: "top" | "left", startMiddle: boolean): void {
    const element = this.scroll_element();
    element.scrollTop = axis === "top" && startMiddle ? Math.floor(element.scrollHeight / 2) : 0;
    element.scrollLeft = axis === "left" && startMiddle ? Math.floor(element.scrollWidth / 2) : 0;
    this.grid.refresh();
    this.present_frame();
  }

  /**
   * Rasterize the frame just painted, as the browser does when it presents a
   * frame between two scroll events, so a timed step starts from a drawn
   * frame. Chromium records canvas drawing and rasterizes it at the next frame
   * or when something reads the canvas. A scroll blit reads it, so without this
   * the timed step would also pay for rasterizing the untimed setup frame.
   * The renderer's canvas is read through a copy into another canvas, not with
   * `getImageData`, which can make Chromium move it off the GPU.
   */
  private present_frame(): void {
    if (this.frame_canvas === null || this.frame_sink === null) {
      throw new Error("presenting a frame requires the mounted renderer's canvas");
    }
    this.frame_sink.drawImage(this.frame_canvas, 0, 0, 1, 1, 0, 0, 1, 1);
    this.frame_sink.getImageData(0, 0, 1, 1);
  }

  scrollBy(axis: "top" | "left", pixels: number): void {
    const element = this.scroll_element();
    if (axis === "top") element.scrollTop += pixels;
    else element.scrollLeft += pixels;
    this.grid.refresh();
  }

  scrollObservation(): ScrollObservation {
    const element = this.scroll_element();
    return {
      top: element.scrollTop,
      left: element.scrollLeft,
      maximumTop: Math.max(0, element.scrollHeight - element.clientHeight),
      maximumLeft: Math.max(0, element.scrollWidth - element.clientWidth),
      firstVisibleRow: Math.floor(element.scrollTop / SHEETWRITE_ROW_HEIGHT),
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  selectAndReveal(row: number, col: number): void {
    this.grid.setSelection({ kind: "cell", addr: { sheet: SHEET, row, col } });
    this.grid.scrollToCell({ sheet: SHEET, row, col });
    this.grid.refresh();
  }

  openEditor(): void {
    this.host.focus();
    dispatch_key(this.host, "F2");
    if (!this.editorOpen()) throw new Error("Sheetwrite editor did not open");
  }

  closeEditor(): void {
    const editor = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (editor) dispatch_key(editor, "Escape");
  }

  editCommit(value: string): void {
    this.openEditor();
    const editor = this.host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
    if (!editor) throw new Error("Sheetwrite editor disappeared before commit");
    editor.value = value;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    dispatch_key(editor, "Enter");
  }

  moveSelection(direction: "down" | "right"): void {
    this.host.focus();
    dispatch_key(this.host, direction === "down" ? "ArrowDown" : "ArrowRight");
    this.grid.refresh();
  }

  insertRows(at: number, count: number): void {
    this.apply_row_edit({ op: "addRows", sheet: SHEET, at, count });
  }

  removeRows(at: number, count: number): void {
    this.apply_row_edit({ op: "removeRows", sheet: SHEET, at, count });
  }

  /** A row edit the store refuses fails the scenario instead of timing a no-op. */
  private apply_row_edit(patch: DocumentOp): void {
    const result = this.grid.store.applyTransaction({ patches: [patch] });
    if (result.status !== "applied") {
      const detail =
        result.status === "rejected"
          ? result.issues.map((issue) => issue.message).join("; ")
          : result.status === "noop"
            ? result.reason
            : "conflict";
      throw new Error(`${patch.op} was ${result.status}: ${detail}`);
    }
    this.grid.refresh();
  }

  resetFormatResources(): void {
    resetNumberFormatResourcesForTest();
  }

  /**
   * One full frame, as `hot.render()` re-renders every visible cell from its
   * data: the visible window is read again and the canvas painted. Fails when
   * the call draws no canvas frame, so a timed repaint can never be a no-op.
   */
  repaint(): void {
    const before = this.canvas_frames;
    this.read_windows.invalidateData();
    this.grid.refresh();
    if (this.canvas_frames === before) throw new Error("repaint drew no canvas frame");
  }

  formattedSentinels(): readonly [string, string] {
    const amount = this.cellValue(0, 4);
    const date = this.cellValue(0, 1);
    return [
      typeof amount === "number" ? formatNumber(amount, "#,##0.00", "en-US") : "",
      typeof date === "number" ? formatNumber(date, "mmm d, yyyy", "en-US") : "",
    ];
  }

  formatResources(): RenderResourceMetrics {
    return getNumberFormatResourceStatsForTest();
  }

  private apply_patches(patches: readonly DocumentOp[]): void {
    for (let start = 0; start < patches.length; start += TRANSACTION_CHUNK_SIZE) {
      this.grid.store.applyTransaction({
        patches: patches.slice(start, start + TRANSACTION_CHUNK_SIZE),
      });
    }
    this.grid.refresh();
  }

  installFormulaDense(): void {
    this.formula_dense_rows = Math.min(FORMULA_DENSE_ROWS, this.initialRowCount - 1);
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.formula_dense_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "formula", src: `=A${row + 1}+${col}` },
        });
      }
    }
    this.apply_patches(patches);
  }

  clearFormulaDense(): void {
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.formula_dense_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value: ingested_value_at(this.dataset, row, col) },
        });
      }
    }
    this.formula_dense_rows = 0;
    this.apply_patches(patches);
  }

  installTextHeavy(rowCount: number): void {
    this.text_heavy_rows = Math.min(rowCount, this.initialRowCount - 1);
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.text_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value: `diagnostic-long-${row}-${col}-${LONG_TEXT_SUFFIX}` },
        });
      }
    }
    this.apply_patches(patches);
  }

  clearTextHeavy(): void {
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.text_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value: ingested_value_at(this.dataset, row, col) },
        });
      }
    }
    this.text_heavy_rows = 0;
    this.apply_patches(patches);
  }

  installWrapHeavy(rowCount: number): void {
    this.wrap_heavy_rows = Math.min(rowCount, this.initialRowCount - 1);
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.wrap_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        const prefix = `${WRAP_HEAVY_TEXT_PREFIX}${row}-${col}-`;
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: {
            kind: "literal",
            value: `${prefix}${"w".repeat(WRAP_HEAVY_TEXT_LENGTH)}`.slice(
              0,
              WRAP_HEAVY_TEXT_LENGTH,
            ),
          },
          style: { wrap: true },
        });
      }
    }
    this.apply_patches(patches);
  }

  clearWrapHeavy(): void {
    if (this.wrap_heavy_rows === 0) return;
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.wrap_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        patches.push({
          op: "set",
          addr: { sheet: SHEET, row, col },
          value: { kind: "literal", value: ingested_value_at(this.dataset, row, col) },
        });
      }
    }
    this.wrap_heavy_rows = 0;
    this.apply_patches(patches);
  }

  installWrapUnicode(text: string): void {
    const { row, col } = WRAP_UNICODE_CELL;
    this.apply_patches([
      {
        op: "set",
        addr: { sheet: SHEET, row, col },
        value: { kind: "literal", value: text },
        style: { wrap: true },
      },
    ]);
  }

  clearWrapUnicode(): void {
    const { row, col } = WRAP_UNICODE_CELL;
    this.apply_patches([
      {
        op: "set",
        addr: { sheet: SHEET, row, col },
        value: { kind: "literal", value: ingested_value_at(this.dataset, row, col) },
      },
    ]);
  }

  installSearchMatches(rowCount: number): void {
    this.search_match_rows = Math.min(rowCount, this.initialRowCount - 1);
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.search_match_rows; row++) {
      patches.push({
        op: "set",
        addr: { sheet: SHEET, row, col: COL.customer },
        value: { kind: "literal", value: `${SEARCH_MATCH_PREFIX}${row}` },
      });
    }
    this.apply_patches(patches);
  }

  clearSearchMatches(): void {
    if (this.search_match_rows === 0) return;
    const patches: DocumentOp[] = [];
    for (let row = 1; row <= this.search_match_rows; row++) {
      patches.push({
        op: "set",
        addr: { sheet: SHEET, row, col: COL.customer },
        value: { kind: "literal", value: this.dataset.customer[row] ?? "" },
      });
    }
    this.search_match_rows = 0;
    this.apply_patches(patches);
  }

  beginSearch(query: string): void {
    this.grid.search(query);
  }

  /**
   * Live find state without re-scanning the sheet, so a corrupt or cleared match
   * set cannot pass by recomputing the expected answer.
   */
  searchState(): SearchProbe {
    const controller = Reflect.get(this.grid, "search_controller") as
      | {
          matches: { length: number; at(index: number): { row: number; col: number } | null };
          active: number;
          searchQuery: string;
        }
      | undefined;
    if (!controller) throw new Error("search probe requires the grid search controller");
    const describe = (index: number): string | null => {
      const match = controller.matches.at(index);
      return match ? `${match.row},${match.col}` : null;
    };
    return {
      query: controller.searchQuery,
      matches: controller.matches.length,
      active: controller.active,
      first: describe(0),
      last: describe(controller.matches.length - 1),
    };
  }

  endSearch(): void {
    this.grid.clearSearch();
  }

  installFrozenPanes(rows: number, cols: number): void {
    this.grid.setFrozen(rows, cols);
  }

  clearFrozenPanes(): void {
    this.grid.setFrozen(0, 0);
  }

  armFrozenPaneProbe(): void {
    const renderer = Reflect.get(this.grid, "renderer") as
      | {
          paintPanes?: PanePaintFn;
        }
      | undefined;
    if (!renderer || typeof renderer.paintPanes !== "function") {
      throw new Error("frozen-pane probe requires a pane-capable renderer");
    }
    if (!this.frozen_pane_probe_armed) {
      const paint_original = renderer.paintPanes.bind(renderer);
      renderer.paintPanes = (panes, divider) => {
        this.record_frozen_pane_frame(panes);
        paint_original(panes, divider);
      };
      this.frozen_pane_probe_armed = true;
    }
    this.frozen_pane_probe_state = empty_frozen_pane_probe();
  }

  frozenPaneProbe(): FrozenPaneProbe {
    return this.frozen_pane_probe_state;
  }

  /** The coordinator pushes the corner, top, left, and body panes in that order. */
  private record_frozen_pane_frame(panes: readonly PanePaint[]): void {
    const pinned = panes[0];
    const body = panes[panes.length - 1];
    this.frozen_pane_probe_state = {
      paneFrames: this.frozen_pane_probe_state.paneFrames + 1,
      paneCount: panes.length,
      pinnedRows: pinned ? { start: pinned.view.rows.start, end: pinned.view.rows.end } : null,
      pinnedColumns: pinned ? [...pinned.view.cols] : [],
      pinnedScrollTop: pinned ? pinned.scrollTop : null,
      bodyRows: body ? { start: body.view.rows.start, end: body.view.rows.end } : null,
      bodyScrollTop: body ? body.scrollTop : null,
      bodyScrollLeft: body ? body.scrollLeft : null,
    };
  }

  installConditionalFormats(rowCount: number): void {
    this.conditional_format_rows = Math.min(rowCount, this.initialRowCount - 1);
    if (this.conditional_format_rows < 1) {
      throw new RangeError("conditional formats need at least one body row");
    }
    const range = {
      sheet: SHEET,
      start: { row: 1, col: 0 },
      end: { row: this.conditional_format_rows, col: this.colCount - 1 },
    };
    const amount_column = String.fromCharCode("A".charCodeAt(0) + COL.amount);
    this.grid.setConditionalFormats([
      {
        range,
        when: { kind: "formula", source: `=$${amount_column}1>${CONDITIONAL_AMOUNT_THRESHOLD}` },
        style: { backgroundColor: CONDITIONAL_HIGH_BACKGROUND },
      },
      {
        range,
        when: { kind: "formula", source: `=$${amount_column}1<=${CONDITIONAL_AMOUNT_THRESHOLD}` },
        style: { color: CONDITIONAL_LOW_COLOR },
      },
      {
        range,
        when: { kind: "formula", source: "=$A1>0" },
        style: { underline: true },
      },
    ]);
  }

  clearConditionalFormats(): void {
    if (this.conditional_format_rows === 0) return;
    this.conditional_format_rows = 0;
    this.grid.setConditionalFormats([]);
  }

  installCurrencyFormat(): void {
    const column = this.sheet().columns[COL.amount];
    if (!column) throw new RangeError("benchmark sheet is missing the amount column");
    this.apply_amount_column_format(
      { type: "currency", numberFormat: CURRENCY_NUMBER_FORMAT, numberLocale: NUMBER_LOCALE },
      column.width,
    );
  }

  clearCurrencyFormat(): void {
    const column = this.sheet().columns[COL.amount];
    if (!column) throw new RangeError("benchmark sheet is missing the amount column");
    this.apply_amount_column_format(
      { type: "number", numberFormat: AMOUNT_NUMBER_FORMAT, numberLocale: NUMBER_LOCALE },
      column.width,
    );
  }

  /**
   * Paint reads a layout snapshot taken from the sheet, so the unchanged width is
   * re-applied to rebuild that snapshot for the new format.
   */
  private apply_amount_column_format(patch: Partial<Column>, width: number): void {
    this.grid.store.applyTransaction({
      patches: [{ op: "setColumn", sheet: SHEET, col: COL.amount, patch }],
    });
    this.grid.setColumnWidth(COL.amount, width);
    this.grid.refresh();
  }

  resolvedStyle(row: number, col: number): ResolvedStyleProbe {
    const view = this.grid.store.getVisibleWindow(SHEET, { start: row, end: row + 1 }, [col]);
    const style: CellStyle = view.styles[view.styleIds[0] ?? 0] ?? {};
    return {
      wrap: style.wrap === true,
      underline: style.underline === true,
      background: style.backgroundColor ?? null,
      color: style.color ?? null,
    };
  }

  formattedText(row: number, col: number): string {
    const value = this.cellValue(row, col);
    const column = this.sheet().columns[col];
    if (typeof value !== "number" || !column) return String(value ?? "");
    return formatNumber(value, column.numberFormat, column.numberLocale);
  }

  private sheet() {
    const sheet = this.grid.store.getWorkbook().sheets.find((candidate) => candidate.id === SHEET);
    if (!sheet) throw new Error("benchmark sheet is missing");
    return sheet;
  }

  measureUnresizedMillionRowGeometry(): GeometryObservation {
    return measureUnresizedMillionRowGeometry();
  }

  installMergeHeavy(): void {
    const count = Math.min(2_000, Math.floor(this.initialRowCount / 2));
    this.grid.store.applyTransaction({
      patches: Array.from({ length: count }, (_, index) => ({
        op: "addMerge" as const,
        sheet: SHEET,
        merge: { r0: index * 2, c0: 0, r1: index * 2, c1: 1 },
      })),
    });
  }

  clearMergeHeavy(): void {
    const merges = this.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === SHEET)?.merges;
    if (!merges || merges.length === 0) return;
    this.grid.store.applyTransaction({
      patches: merges.map((merge) => ({ op: "removeMerge" as const, sheet: SHEET, merge })),
    });
  }

  resetMergeResources(): void {
    resetMergeIndexResourceStatsForTest();
  }

  mergeResources() {
    const merges = this.grid.store.getWorkbook().sheets.find((sheet) => sheet.id === SHEET)?.merges;
    if (merges && merges.length > 0) {
      intersectingMerges(prepareMergeIndex(merges), 0, 20, [0, 1, 2, 3, 4]);
    }
    return getMergeIndexResourceStatsForTest();
  }

  setWindowReadDiagnosticMode(mode: WindowReadDiagnosticMode): void {
    if (!this.windowTransferDiagnostic) {
      throw new Error("window-transfer mode requires benchmark diagnostic configuration");
    }
    if (mode === "reuse-decoded-view-upper-bound" && !this.prior_decoded_view) {
      this.window_read_diagnostic_mode = "baseline";
      this.grid.store.getVisibleWindow(
        SHEET,
        { start: 0, end: Math.min(32, this.initialRowCount) },
        Array.from({ length: this.colCount }, (_, column) => column),
      );
    }
    this.window_read_diagnostic_mode = mode;
  }

  resetWindowTransferCounters(): void {
    this.window_transfer_counters_state.logicalFrames = 0;
    this.window_transfer_counters_state.windowReadRequests = 0;
    this.window_transfer_counters_state.logicalWindowReads = 0;
    this.window_transfer_counters_state.copiedBytes = 0;
    this.window_transfer_counters_state.outputAllocationEvents = 0;
  }

  windowTransferCounters(): WindowTransferCounters {
    return { ...this.window_transfer_counters_state };
  }

  destroy(): void {
    this.grid.destroy();
  }
}

class HandsontableAdapter implements RenderBenchAdapter {
  readonly id = "handsontable" as const;
  readonly initialRowCount: number;
  readonly colCount = COLUMNS.length;
  private hot!: HotInstance;
  private host!: HTMLElement;
  private readonly data: CellValue[][];
  private readonly dataset: ColumnarDataset;
  private formula_dense_rows = 0;
  private text_heavy_rows = 0;

  constructor(dataset: ColumnarDataset) {
    this.dataset = dataset;
    this.initialRowCount = dataset.rowCount;
    this.data = toAoA(dataset);
  }

  mount(host: HTMLElement): void {
    host.classList.add("ht-theme-main");
    this.host = host;
    const settings: GridSettings = {
      data: this.data,
      columns: COLUMNS.map((column, index) => ({
        data: index,
        type: column.type === "number" ? "numeric" : "text",
      })),
      colHeaders: COLUMNS.map((column) => column.header),
      colWidths: COLUMNS.map((column) => column.width),
      rowHeaders: true,
      columnSorting: true,
      filters: true,
      width: RENDER_VIEWPORT.width,
      height: RENDER_VIEWPORT.height,
      renderAllRows: false,
      autoColumnSize: false,
      autoRowSize: false,
      licenseKey: "non-commercial-and-evaluation",
    };
    this.hot = createHandsontable(host, settings, [
      "alter",
      "countRows",
      "destroy",
      "getActiveEditor",
      "getDataAtCell",
      "getSelectedLast",
      "render",
      "scrollViewportTo",
      "selectCell",
      "setDataAtCell",
      "updateSettings",
    ]);
  }

  isMountedAndAccessible(): boolean {
    return (
      this.host.isConnected &&
      this.host.getAttribute("aria-label") !== null &&
      this.host.querySelector(".ht_master") !== null &&
      this.host.querySelector("table") !== null
    );
  }

  rowCount(): number {
    return this.hot.countRows();
  }

  cellValue(row: number, col: number): unknown {
    return this.hot.getDataAtCell(row, col);
  }

  setCellValue(row: number, col: number, value: string | number | null): void {
    const target = this.data[row];
    if (!target) throw new RangeError(`missing Handsontable row ${row}`);
    target[col] = value;
    this.hot.render();
  }

  selection(): CellSelection | null {
    const selection = this.hot.getSelectedLast();
    const row = selection?.[0];
    const col = selection?.[1];
    return row === undefined || col === undefined ? null : { row, col };
  }

  editorOpen(): boolean {
    return this.hot.getActiveEditor()?.isOpened() ?? false;
  }

  private scroll_element(): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(".ht_master .wtHolder");
    if (!element) throw new Error("Handsontable scroller is not mounted");
    return element;
  }

  prepareScroll(axis: "top" | "left", startMiddle: boolean): void {
    const element = this.scroll_element();
    element.scrollTop = axis === "top" && startMiddle ? Math.floor(element.scrollHeight / 2) : 0;
    element.scrollLeft = axis === "left" && startMiddle ? Math.floor(element.scrollWidth / 2) : 0;
    element.dispatchEvent(new Event("scroll"));
    this.hot.render();
    // Lay the setup frame out, as presenting it would, so the timed step does
    // not pay for it; the Sheetwrite adapter rasterizes its canvas likewise.
    element.getBoundingClientRect();
  }

  scrollBy(axis: "top" | "left", pixels: number): void {
    const element = this.scroll_element();
    if (axis === "top") element.scrollTop += pixels;
    else element.scrollLeft += pixels;
    element.dispatchEvent(new Event("scroll"));
    this.hot.render();
  }

  scrollObservation(): ScrollObservation {
    const element = this.scroll_element();
    return {
      top: element.scrollTop,
      left: element.scrollLeft,
      maximumTop: Math.max(0, element.scrollHeight - element.clientHeight),
      maximumLeft: Math.max(0, element.scrollWidth - element.clientWidth),
      firstVisibleRow: Math.floor(element.scrollTop / HANDSONTABLE_ROW_HEIGHT),
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  selectAndReveal(row: number, col: number): void {
    this.hot.selectCell(row, col);
    this.hot.scrollViewportTo(row, col);
  }

  openEditor(): void {
    const editor = this.hot.getActiveEditor();
    if (!editor) throw new Error("Handsontable has no active editor");
    editor.beginEditing();
    if (!editor.isOpened()) throw new Error("Handsontable editor did not open");
  }

  closeEditor(): void {
    const editor = this.hot.getActiveEditor();
    if (editor?.isOpened()) editor.finishEditing(true);
  }

  editCommit(value: string): void {
    const editor = this.hot.getActiveEditor();
    if (!editor) throw new Error("Handsontable has no active editor");
    editor.beginEditing();
    editor.setValue(value);
    editor.finishEditing();
  }

  moveSelection(direction: "down" | "right"): void {
    const selection = this.hot.getSelectedLast();
    const selected_row = selection?.[0];
    const selected_col = selection?.[1];
    if (selected_row === undefined || selected_col === undefined) {
      throw new Error("Handsontable has no active selection");
    }
    const row =
      direction === "down" ? Math.min(this.hot.countRows() - 1, selected_row + 1) : selected_row;
    const col =
      direction === "right" ? Math.min(this.hot.countCols() - 1, selected_col + 1) : selected_col;
    this.hot.selectCell(row, col);
  }

  insertRows(at: number, count: number): void {
    this.hot.alter("insert_row_above", at, count);
  }

  removeRows(at: number, count: number): void {
    this.hot.alter("remove_row", at, count);
  }

  resetFormatResources(): void {
    resetNumberFormatResourcesForTest();
  }

  repaint(): void {
    this.hot.render();
  }

  formattedSentinels(): readonly [string, string] {
    return ["1,234.50", "Feb 29, 2024"];
  }

  formatResources(): RenderResourceMetrics {
    return getNumberFormatResourceStatsForTest();
  }

  installFormulaDense(): void {
    this.formula_dense_rows = Math.min(FORMULA_DENSE_ROWS, this.initialRowCount - 1);
    for (let row = 1; row <= this.formula_dense_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.data[row]![col] = `=A${row + 1}+${col}`;
      }
    }
    this.hot.render();
  }

  clearFormulaDense(): void {
    for (let row = 1; row <= this.formula_dense_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.data[row]![col] = dataset_value_at(this.dataset, row, col);
      }
    }
    this.formula_dense_rows = 0;
    this.hot.render();
  }

  installTextHeavy(rowCount: number): void {
    this.text_heavy_rows = Math.min(rowCount, this.initialRowCount - 1);
    for (let row = 1; row <= this.text_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.data[row]![col] = `diagnostic-long-${row}-${col}-${LONG_TEXT_SUFFIX}`;
      }
    }
    this.hot.render();
  }

  clearTextHeavy(): void {
    for (let row = 1; row <= this.text_heavy_rows; row++) {
      for (let col = 1; col < this.colCount; col++) {
        this.data[row]![col] = dataset_value_at(this.dataset, row, col);
      }
    }
    this.text_heavy_rows = 0;
    this.hot.render();
  }

  measureUnresizedMillionRowGeometry(): GeometryObservation {
    return measureUnresizedMillionRowGeometry();
  }

  installMergeHeavy(): void {
    const count = Math.min(2_000, Math.floor(this.initialRowCount / 2));
    this.hot.updateSettings({
      mergeCells: Array.from({ length: count }, (_, index) => ({
        row: index * 2,
        col: 0,
        rowspan: 1,
        colspan: 2,
      })),
    });
  }

  clearMergeHeavy(): void {
    this.hot.updateSettings({ mergeCells: [] });
  }

  resetMergeResources(): void {
    resetMergeIndexResourceStatsForTest();
  }

  mergeResources() {
    return getMergeIndexResourceStatsForTest();
  }

  setWindowReadDiagnosticMode(_mode: WindowReadDiagnosticMode): void {
    throw new Error("window-transfer diagnostics support only sheetwrite");
  }

  resetWindowTransferCounters(): void {
    throw new Error("window-transfer diagnostics support only sheetwrite");
  }

  windowTransferCounters(): WindowTransferCounters {
    return {
      logicalFrames: 0,
      windowReadRequests: 0,
      logicalWindowReads: 0,
      copiedBytes: 0,
      outputAllocationEvents: 0,
    };
  }

  destroy(): void {
    this.hot.destroy();
  }
}

const status_element = document.getElementById("status");
const results_element = document.getElementById("results");
const stage_element = document.getElementById("stage");

function set_status(text: string): void {
  if (status_element) status_element.textContent = text;
}

function render_results(result: BrowserCombinationResult): void {
  if (!results_element) return;
  const lines = [
    `run: ${result.runId}`,
    `engine: ${result.engine} · rows: ${result.rows.toLocaleString("en-US")} · round: ${result.round}`,
    `dataset: ${result.datasetHash}`,
    "",
  ];
  for (const scenario of result.results) {
    if (scenario.status === "failed") {
      lines.push(`${scenario.scenarioId.padEnd(32)} FAILED ${scenario.stage}: ${scenario.message}`);
    } else {
      lines.push(
        `${scenario.scenarioId.padEnd(32)} median ${scenario.medianMs.toFixed(5)} ms · p95 ${scenario.p95Ms.toFixed(5)} · MAD ${scenario.madMs.toFixed(5)} · ${scenario.operationCount} ops`,
      );
    }
  }
  results_element.textContent = lines.join("\n");
}

function teardown_failures(results: readonly ScenarioResult[], error: unknown): ScenarioResult[] {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return results.map((result): FailedScenario => ({
    runId: result.runId,
    round: result.round,
    engine: result.engine,
    rows: result.rows,
    scenarioId: result.scenarioId,
    group: result.group,
    ...(result.dataValidity === undefined ? {} : { dataValidity: result.dataValidity }),
    status: "failed",
    stage: "teardown",
    errorClass: normalized.name || "Error",
    message: normalized.message,
    timeout: false,
    crash: false,
    consoleErrors: result.status === "failed" ? result.consoleErrors : [],
    pageErrors: result.status === "failed" ? result.pageErrors : [],
    partialSamples: result.status === "success" ? result.rawSamples : result.partialSamples,
    validation: result.validation,
    memory: result.memory,
  }));
}

async function run(configuration: PageConfiguration): Promise<void> {
  if (!stage_element) throw new Error("benchmark page is missing #stage");
  window.__benchStage = "build";
  set_status(`building ${configuration.rows.toLocaleString("en-US")}-row dataset`);
  await next_frame();
  if (configuration.engine === "sheetwrite") await initSheetwrite();
  const dataset = makeColumnar(configuration.rows);
  const hash = datasetChecksum(dataset);

  stage_element.replaceChildren();
  const host = document.createElement("div");
  host.style.width = `${RENDER_VIEWPORT.width}px`;
  host.style.height = `${RENDER_VIEWPORT.height}px`;
  host.tabIndex = 0;
  host.setAttribute("role", "application");
  host.setAttribute("aria-label", `${configuration.engine} benchmark grid`);
  stage_element.appendChild(host);

  let adapter: RenderBenchAdapter =
    configuration.engine === "sheetwrite"
      ? new SheetwriteAdapter(dataset, configuration.windowTransferDiagnostic)
      : new HandsontableAdapter(dataset);
  window.__benchStage = "mount";
  set_status(`mounting ${configuration.engine}`);
  adapter.mount(host);
  await settle();

  let output: BrowserCombinationResult = {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: configuration.runId,
    round: configuration.round,
    engine: configuration.engine,
    rows: configuration.rows,
    datasetHash: hash,
    results: [],
  };
  window.__benchResults = output;

  const results: ScenarioResult[] = [];
  for (const scenario_id of configuration.scenarios) {
    set_status(`running ${scenario_id}`);
    const result = runRenderScenario(adapter, dataset, scenario_id, {
      runId: configuration.runId,
      round: configuration.round,
      warmupSamples: configuration.warmupSamples,
      measuredSamples: configuration.measuredSamples,
      minimumSampleDurationMs: configuration.minimumSampleDurationMs,
      onStage: (stage) => {
        window.__benchStage = stage;
      },
    });
    results.push(result);
    output = { ...output, results: [...results] };
    window.__benchResults = output;
    render_results(output);
    await settle();
    if (result.status === "failed") {
      // A failed scenario can leak mutated document state (e.g. rows it never
      // rolled back). Rebuild the fixture so later scenarios validate against
      // the canonical document instead of cascading the wreckage into
      // spurious failures.
      set_status(`rebuilding ${configuration.engine} after ${scenario_id} failure`);
      try {
        adapter.destroy();
      } catch {
        // The failed engine may be beyond clean teardown; the rebuild below
        // replaces every observable surface regardless.
      }
      host.replaceChildren();
      adapter =
        configuration.engine === "sheetwrite"
          ? new SheetwriteAdapter(dataset, configuration.windowTransferDiagnostic)
          : new HandsontableAdapter(dataset);
      adapter.mount(host);
      await settle();
    }
  }

  window.__benchStage = "teardown";
  try {
    adapter.destroy();
  } catch (error) {
    output = { ...output, results: teardown_failures(results, error) };
    window.__benchResults = output;
  }
  window.__benchStage = "complete";
  window.__benchDone = true;
  render_results(output);
  set_status(`done — ${configuration.engine} @ ${configuration.rows.toLocaleString("en-US")} rows`);
  console.log("[render-bench]", JSON.stringify(output));
}

function positive_integer(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function non_negative_integer(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function read_configuration(params: URLSearchParams): PageConfiguration {
  const engine = params.get("engine") === "handsontable" ? "handsontable" : "sheetwrite";
  const run_id = params.get("runId");
  if (!run_id) throw new Error("render benchmark requires a runId");
  const requested_scenarios =
    params.get("scenarios")?.split(",") ?? RENDER_SCENARIOS.map((scenario) => scenario.id);
  if (
    requested_scenarios.length === 0 ||
    new Set(requested_scenarios).size !== requested_scenarios.length
  ) {
    throw new Error("render benchmark scenarios must be non-empty and unique");
  }
  for (const scenario_id of requested_scenarios) {
    if (!ALL_RENDER_SCENARIOS.some((scenario) => scenario.id === scenario_id)) {
      throw new Error(`unknown render benchmark scenario: ${scenario_id}`);
    }
  }
  const diagnostic = params.get("diagnostic");
  if (diagnostic !== null && diagnostic !== "window-transfer") {
    throw new Error("unknown render benchmark diagnostic configuration");
  }
  const window_transfer_diagnostic = diagnostic === "window-transfer";
  const requested_window_transfer_scenarios = requested_scenarios.filter((scenario) =>
    WINDOW_TRANSFER_SCENARIO_IDS.includes(
      scenario as (typeof WINDOW_TRANSFER_SCENARIO_IDS)[number],
    ),
  );
  if (
    requested_window_transfer_scenarios.length > 0 &&
    (!window_transfer_diagnostic ||
      engine !== "sheetwrite" ||
      requested_window_transfer_scenarios.length !== WINDOW_TRANSFER_SCENARIO_IDS.length ||
      !WINDOW_TRANSFER_SCENARIO_IDS.every((scenario) => requested_scenarios.includes(scenario)))
  ) {
    throw new Error(
      "window-transfer scenarios require the complete sheetwrite benchmark diagnostic pair",
    );
  }
  if (window_transfer_diagnostic && requested_window_transfer_scenarios.length === 0) {
    throw new Error("window-transfer diagnostic configuration requires its scenario pair");
  }
  return {
    engine,
    scenarios: requested_scenarios as ScenarioId[],
    rows: positive_integer(params.get("rows"), 100_000),
    measuredSamples: positive_integer(params.get("samples"), 3),
    warmupSamples: non_negative_integer(params.get("warmups"), RENDER_WARMUP_SAMPLES),
    minimumSampleDurationMs: Math.max(
      RENDER_MINIMUM_SAMPLE_MS,
      positive_integer(params.get("minimumSampleMs"), RENDER_MINIMUM_SAMPLE_MS),
    ),
    runId: run_id,
    round: positive_integer(params.get("round"), 1),
    windowTransferDiagnostic: window_transfer_diagnostic,
  };
}

async function boot(): Promise<void> {
  delete window.__benchResults;
  delete window.__benchError;
  delete window.__benchStage;
  window.__benchDone = false;
  const params = new URLSearchParams(location.search);
  const run_button = document.getElementById("run");
  const launch = async (): Promise<void> => {
    delete window.__benchResults;
    delete window.__benchError;
    window.__benchDone = false;
    try {
      await run(read_configuration(params));
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      window.__benchError = normalized.message;
      window.__benchDone = true;
      set_status(`error: ${normalized.message}`);
      if (results_element)
        results_element.textContent = `${normalized.name}: ${normalized.message}\n${normalized.stack ?? ""}`;
    }
  };
  run_button?.addEventListener("click", () => void launch());
  if (params.get("auto") === "1") await launch();
  else set_status("ready — automated runs must provide runId and auto=1");
}

void boot();
