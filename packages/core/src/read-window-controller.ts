import type { AriaMirror } from "./aria-mirror.js";
import { intersectingMerges, prepareMergeIndex } from "./canvas-paint.js";
import type { DatasourceController } from "./datasource-controller.js";
import type { DomMergeAnchorRequest, DomOverlay } from "./dom-overlay.js";
import { isEngineTrap } from "./engine.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import type { OverlayPainter } from "./overlay-painter.js";
import { scheduleFrame } from "./scope.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { PanePaint, Renderer, Theme, Viewport } from "./types/render.js";
import type { Store, VisibleWindowView } from "./types/store.js";

interface CellCoordinate {
  readonly row: number;
  readonly col: number;
}

const FORMULA_CLOSURE_MAX_CELLS = 32_768;
const EMPTY_BANDS = new Uint32Array(0);

/** True when a sorted array holds a value inside the inclusive span. */
function sorted_has_value_in(values: Uint32Array, start: number, end: number): boolean {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? 0) < start) low = middle + 1;
    else high = middle;
  }
  return low < values.length && (values[low] ?? 0) <= end;
}

/**
 * Backing rows and columns of the painted window, including overscan and frozen
 * panes. Built once per transaction so each patch costs two binary searches.
 */
export class PaintedCells {
  constructor(
    private readonly sheet: SheetId,
    private readonly rows: Uint32Array,
    private readonly cols: Uint32Array,
  ) {}

  /** Corners are passed separately so a single-cell edit needs no range object. */
  intersects(sheet: SheetId, start: CellCoordinate, end: CellCoordinate): boolean {
    return (
      sheet === this.sheet &&
      sorted_has_value_in(this.cols, Math.min(start.col, end.col), Math.max(start.col, end.col)) &&
      sorted_has_value_in(this.rows, Math.min(start.row, end.row), Math.max(start.row, end.row))
    );
  }
}

/** Turns a window the store read into the window the grid paints. */
export type PaintedWindowTransform = (view: VisibleWindowView) => VisibleWindowView;

export interface ReadWindowControllerOptions {
  renderer: () => Renderer;
  /** Row header labels for view rows `rows`, or undefined when they are the view positions. */
  rowNumbers: (rows: { start: number; end: number }) => Uint32Array | undefined;
  /** The sheet rows whose numbers show a filtered list, or undefined without a filter. */
  filteredRows: () => { start: number; end: number } | undefined;
  /** The AutoFilter header cells in view, or undefined without an AutoFilter. */
  filterHeader: () => { row: number; start: number; end: number } | undefined;
  domOverlay: DomOverlay;
  overlayPainter: OverlayPainter;
  ariaMirror: AriaMirror;
  geometry: GeometryLayoutController;
  datasource: DatasourceController;
  datasourceEnabled?: boolean;
  store: Store;
  activeSheet: () => SheetId;
  theme: () => Theme;
  overscan: () => number;
  zoom: () => number;
  storeEpoch: () => number;
  viewportHeight: () => number;
  viewportWidth: () => number;
  datasourceColumnCount?: () => number;
  scrollTop: () => number;
  scrollLeft: () => number;
  repositionEditor: (contentTop: number, scrollLeft: number) => void;
  emitScroll: (event: {
    scrollTop: number;
    scrollLeft: number;
    firstRow: number;
    lastRow: number;
    firstVisibleColumn: number | null;
    lastVisibleColumn: number | null;
  }) => void;
  /** Receives a WASM trap from a frame's engine reads; without it the trap is rethrown. */
  onEngineTrap?: (cause: unknown) => void;
  /** A change to each window before it paints, such as the Format Cells preview; null for none. */
  previewWindow?: () => PaintedWindowTransform | null;
}

/** Owns paint/read plans, hydration demand, formula closure and residency. */
export class ReadWindowController {
  private cancel_scheduled_frame: (() => void) | null = null;
  private paint_invalidation_epoch = 0;
  private data_invalidation_epoch = 0;
  private column_window_start = -1;
  private column_window_end = -1;
  private windowed_column_indices: readonly number[] = [];
  private datasource_column_indices: readonly number[] = [];
  private datasource_frozen_columns = -1;
  private column_window_revision = 0;
  private last_data_sheet: SheetId | null = null;
  private last_data_row_start = 0;
  private last_data_row_end = 0;
  private last_data_column_window_revision = 0;
  private last_data_store_epoch = 0;
  private last_data_invalidation_epoch = 0;
  private last_data_frozen_rows = 0;
  private last_data_frozen_columns = 0;
  private last_paint_content_top = 0;
  private last_paint_scroll_left = 0;
  private last_paint_client_width = 0;
  private last_paint_client_height = 0;
  private last_paint_invalidation_epoch = 0;
  private last_paint_frozen_height = 0;
  private last_paint_frozen_width = 0;
  private last_paint_zoom = 0;
  private last_paint_view: VisibleWindowView | null = null;
  private cached_pane_views: VisibleWindowView[] = [];
  private readonly pane_value_pools: CellScalar[][] = [];
  private cached_dom_merge_anchor_views: VisibleWindowView[] = [];
  private readonly dom_merge_anchor_value_pools: CellScalar[][] = [];
  private readonly dom_merge_source_views: VisibleWindowView[] = [];
  private main_view_value_pool: CellScalar[] = [];
  private readonly dom_merge_anchor_state: Array<SheetId | number> = [];
  private formula_bands = EMPTY_BANDS;
  private pinned_sheet: SheetId | null = null;
  private destroyed = false;
  /** Set after the engine stops: the last frame stays and no read reaches the store again. */
  private frozen = false;
  private stop_memory_release: (() => void) | undefined;

  constructor(private readonly options: ReadWindowControllerOptions) {
    this.bind_memory_release();
  }

  /** A replacement has a new engine and must not retain the old window or listener. */
  resetDocument(): void {
    this.stop_memory_release?.();
    this.cancel_frame();
    this.pinned_sheet = null;
    this.formula_bands = EMPTY_BANDS;
    this.last_paint_view = null;
    this.cached_pane_views = [];
    this.cached_dom_merge_anchor_views = [];
    this.dom_merge_source_views.length = 0;
    this.dom_merge_anchor_state.length = 0;
    this.main_view_value_pool.length = 0;
    this.pane_value_pools.length = 0;
    this.dom_merge_anchor_value_pools.length = 0;
    this.bind_memory_release();
    this.invalidateColumns();
  }

  private bind_memory_release(): void {
    this.stop_memory_release = storeEngine(this.options.store)?.onMemoryRelease(() => {
      this.invalidateData();
      this.schedule();
    });
  }

  get geometryVersion(): number {
    return this.paint_invalidation_epoch + this.data_invalidation_epoch;
  }

  /** View rows are mapped to backing rows, so reordered views compare correctly. */
  paintedCells(): PaintedCells {
    const { geometry } = this.options;
    const theme = this.options.theme();
    const window = geometry.paintWindow(
      geometry.toContent(this.options.scrollTop()),
      this.options.scrollLeft(),
      Math.max(0, this.options.viewportHeight() - theme.headerHeight),
      Math.max(0, this.options.viewportWidth() - theme.rowHeaderWidth),
      this.options.overscan(),
    );

    const body_columns = window.columns.end - window.columns.start;
    const cols = new Uint32Array(window.frozenColumns + body_columns);
    for (let index = 0; index < window.frozenColumns; index++) {
      cols[index] = geometry.columnIndices[index] ?? 0;
    }
    for (let offset = 0; offset < body_columns; offset++) {
      cols[window.frozenColumns + offset] =
        geometry.columnIndices[window.columns.start + offset] ?? 0;
    }

    const body_rows = window.rows.end - window.rows.start;
    const rows = new Uint32Array(window.frozenRows + body_rows);
    for (let row = 0; row < window.frozenRows; row++) rows[row] = geometry.toDataRow(row);
    for (let offset = 0; offset < body_rows; offset++) {
      rows[window.frozenRows + offset] = geometry.toDataRow(window.rows.start + offset);
    }

    return new PaintedCells(this.options.activeSheet(), rows.sort(), cols.sort());
  }

  /** Invalidates pixel/layout paint state without discarding stable data windows. */
  invalidate(): void {
    this.paint_invalidation_epoch += 1;
  }

  /** Invalidates logical row/column contents or order and all dependent paint state. */
  invalidateData(): void {
    this.data_invalidation_epoch += 1;
    this.paint_invalidation_epoch += 1;
  }

  invalidateColumns(): void {
    this.column_window_start = -1;
    this.column_window_end = -1;
    this.datasource_column_indices = [];
    this.datasource_frozen_columns = -1;
    this.invalidateData();
  }

  schedule(): void {
    if (this.cancel_scheduled_frame || this.destroyed || this.frozen) return;

    let ran = false;
    const cancel = scheduleFrame(() => {
      ran = true;
      this.cancel_scheduled_frame = null;
      this.paint();
    });
    // A synchronous frame source (a test stub) has already painted; nothing is left to cancel.
    if (!ran) this.cancel_scheduled_frame = cancel;
  }

  renderNow(): void {
    if (this.destroyed || this.frozen) return;
    this.cancel_frame();
    this.paint();
  }

  /** Keep the last frame and stop every later engine read; used after the engine stops. */
  freeze(): void {
    this.frozen = true;
    this.cancel_frame();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop_memory_release?.();
    if (this.pinned_sheet !== null) {
      // A frozen controller's store sits on a stopped instance; unpinning would call it.
      if (!this.frozen)
        storeEngine(this.options.store)?.pinViewportBands(this.pinned_sheet, EMPTY_BANDS);
      this.pinned_sheet = null;
    }

    this.cancel_frame();
    this.last_paint_view = null;
    this.cached_pane_views = [];
    this.cached_dom_merge_anchor_views = [];
    this.dom_merge_source_views.length = 0;
    this.dom_merge_anchor_state.length = 0;
  }

  private cancel_frame(): void {
    const cancel = this.cancel_scheduled_frame;
    if (!cancel) return;

    cancel();
    this.cancel_scheduled_frame = null;
  }

  private paint(): void {
    try {
      this.render();
    } catch (error) {
      const on_engine_trap = this.options.onEngineTrap;
      if (!on_engine_trap || !isEngineTrap(error)) throw error;

      on_engine_trap(error);
    } finally {
      // Last, after every layout read of the paint, in the same task.
      this.options.ariaMirror.flush();
    }
  }

  private render(): void {
    const { geometry } = this.options;
    const client_height = this.options.viewportHeight();
    const client_width = this.options.viewportWidth();
    const theme = this.options.theme();
    const body_height = Math.max(0, client_height - theme.headerHeight);
    const content_top = geometry.toContent(this.options.scrollTop());
    const scroll_left = this.options.scrollLeft();
    const cell_viewport_width = Math.max(0, client_width - theme.rowHeaderWidth);

    const paint_window = geometry.paintWindow(
      content_top,
      scroll_left,
      body_height,
      cell_viewport_width,
      this.options.overscan(),
    );
    const rows = paint_window.rows;
    const columns = paint_window.columns;
    const frozen_rows = paint_window.frozenRows;
    const frozen_columns = paint_window.frozenColumns;
    const frozen_height = paint_window.frozenHeight;
    const frozen_width = paint_window.frozenWidth;

    const visible_columns = geometry.columnWindow(scroll_left, cell_viewport_width, 0);
    const first_body_visible_column = geometry.columnIndices[visible_columns.start] ?? null;
    const last_body_visible_column = geometry.columnIndices[visible_columns.end - 1] ?? null;
    const first_visible_column =
      frozen_columns > 0
        ? (geometry.columnIndices[0] ?? first_body_visible_column)
        : first_body_visible_column;
    const last_visible_column =
      last_body_visible_column ??
      (frozen_columns > 0 ? (geometry.columnIndices[frozen_columns - 1] ?? null) : null);
    const raw_visible_rows = geometry.visibleRowWindow(
      content_top + frozen_height,
      Math.max(0, body_height - frozen_height) + theme.headerHeight,
      0,
    );
    const visible_rows =
      frozen_rows > 0
        ? {
            start: Math.max(raw_visible_rows.start, frozen_rows),
            end: Math.max(raw_visible_rows.end, frozen_rows),
          }
        : raw_visible_rows;

    const use_panes =
      (frozen_rows > 0 || frozen_columns > 0) && this.options.renderer().paintPanes !== undefined;
    const row_geometry = geometry.rowGeometry(rows);
    const column_window_changed =
      columns.start !== this.column_window_start || columns.end !== this.column_window_end;
    if (column_window_changed) {
      const column_count = columns.end - columns.start;
      let contents_changed = column_count !== this.windowed_column_indices.length;
      for (let offset = 0; !contents_changed && offset < column_count; offset++) {
        if (
          geometry.columnIndices[columns.start + offset] !== this.windowed_column_indices[offset]
        ) {
          contents_changed = true;
        }
      }

      this.column_window_start = columns.start;
      this.column_window_end = columns.end;
      this.windowed_column_indices = geometry.columnIndices.slice(columns.start, columns.end);
      if (contents_changed) this.column_window_revision += 1;
      this.options.ariaMirror.bumpVersion();
    }

    if (column_window_changed || frozen_columns !== this.datasource_frozen_columns) {
      const frozen_column_indices =
        frozen_columns > 0 ? geometry.columnIndices.slice(0, frozen_columns) : [];
      const demanded = [...frozen_column_indices, ...this.windowed_column_indices].sort(
        (left, right) => left - right,
      );
      const datasource_column_count =
        this.options.datasourceColumnCount?.() ?? Number.MAX_SAFE_INTEGER;
      let write = 0;
      for (const column of demanded) {
        if (
          column >= 0 &&
          column < datasource_column_count &&
          (write === 0 || demanded[write - 1] !== column)
        ) {
          demanded[write++] = column;
        }
      }

      demanded.length = write;
      this.datasource_column_indices = demanded;
      this.datasource_frozen_columns = frozen_columns;
    }

    const active_sheet = this.options.activeSheet();
    const store_epoch = this.options.storeEpoch();
    const viewport: Viewport = {
      scrollTop: content_top,
      scrollLeft: scroll_left,
      width: client_width,
      height: client_height,
      contentRevision: store_epoch + this.data_invalidation_epoch + this.paint_invalidation_epoch,
    };
    if (row_geometry) {
      viewport.rowTops = row_geometry.rowTops;
      viewport.rowHeights = row_geometry.rowHeights;
    }
    const row_numbers = this.options.rowNumbers(rows);
    if (row_numbers) viewport.rowNumbers = row_numbers;
    const filtered_rows = this.options.filteredRows();
    if (filtered_rows) viewport.filteredRows = filtered_rows;
    const filter_header = this.options.filterHeader();
    if (filter_header) viewport.filterHeader = filter_header;

    this.options.renderer().setViewport(viewport);

    const zoom = this.options.zoom();
    const refresh_data =
      this.last_paint_view === null ||
      active_sheet !== this.last_data_sheet ||
      rows.start !== this.last_data_row_start ||
      rows.end !== this.last_data_row_end ||
      this.column_window_revision !== this.last_data_column_window_revision ||
      store_epoch !== this.last_data_store_epoch ||
      this.data_invalidation_epoch !== this.last_data_invalidation_epoch ||
      frozen_rows !== this.last_data_frozen_rows ||
      frozen_columns !== this.last_data_frozen_columns;
    const repaint =
      refresh_data ||
      !Object.is(content_top, this.last_paint_content_top) ||
      !Object.is(scroll_left, this.last_paint_scroll_left) ||
      !Object.is(client_width, this.last_paint_client_width) ||
      !Object.is(client_height, this.last_paint_client_height) ||
      this.paint_invalidation_epoch !== this.last_paint_invalidation_epoch ||
      !Object.is(frozen_height, this.last_paint_frozen_height) ||
      !Object.is(frozen_width, this.last_paint_frozen_width) ||
      !Object.is(zoom, this.last_paint_zoom);

    this.update_demand(active_sheet, rows, visible_rows, frozen_rows, refresh_data);

    let view: VisibleWindowView;
    if (use_panes) {
      view = this.paint_frozen_panes(
        active_sheet,
        rows,
        this.windowed_column_indices,
        frozen_rows,
        frozen_columns,
        frozen_height,
        frozen_width,
        content_top,
        scroll_left,
        client_width,
        client_height,
        row_geometry,
        refresh_data,
        repaint,
      );
    } else {
      if (refresh_data) {
        this.cached_pane_views = [];
        // Store windows borrow a reusable value scratch array. Unrelated reads
        // must not overwrite a window retained across display-neutral edits.
        this.last_paint_view = this.previewed(
          this.retain_main_view(
            this.options.store.getVisibleWindow(active_sheet, rows, this.windowed_column_indices),
          ),
        );
      }

      const cached_view = this.last_paint_view;
      if (!cached_view) throw new Error("Sheetwrite: paint window was not resolved");
      view = cached_view;
      if (repaint) {
        this.dom_merge_source_views[0] = view;
        this.dom_merge_source_views.length = 1;
        const requests = this.options.domOverlay.mergeAnchorRequests(this.dom_merge_source_views);
        const refresh_anchors = this.dom_merge_anchors_need_refresh(requests, refresh_data);
        if (refresh_anchors && requests.length > 0) {
          view = this.retain_main_view(view);
          this.last_paint_view = view;
          this.dom_merge_source_views[0] = view;
        }

        if (refresh_anchors) this.load_dom_merge_anchor_views(requests);
        this.options.domOverlay.paint(view, viewport, this.cached_dom_merge_anchor_views);
        this.options.renderer().paint(view);
      }
    }

    this.last_paint_view = view;
    this.last_data_sheet = active_sheet;
    this.last_data_row_start = rows.start;
    this.last_data_row_end = rows.end;
    this.last_data_column_window_revision = this.column_window_revision;
    this.last_data_store_epoch = store_epoch;
    this.last_data_invalidation_epoch = this.data_invalidation_epoch;
    this.last_data_frozen_rows = frozen_rows;
    this.last_data_frozen_columns = frozen_columns;
    this.last_paint_content_top = content_top;
    this.last_paint_scroll_left = scroll_left;
    this.last_paint_client_width = client_width;
    this.last_paint_client_height = client_height;
    this.last_paint_invalidation_epoch = this.paint_invalidation_epoch;
    this.last_paint_frozen_height = frozen_height;
    this.last_paint_frozen_width = frozen_width;
    this.last_paint_zoom = zoom;

    if (refresh_data) this.options.ariaMirror.bumpVersion();
    // Inserts, deletes, filters and sheet switches all change the displayed rows.
    this.options.ariaMirror.setRowCount(this.options.store.viewRowCount(active_sheet));
    this.options.ariaMirror.update(view);
    this.options.overlayPainter.paint(content_top, scroll_left, client_width, client_height);
    this.options.repositionEditor(content_top, scroll_left);
    this.options.emitScroll({
      scrollTop: content_top,
      scrollLeft: scroll_left,
      firstRow: rows.start,
      lastRow: Math.max(rows.start, rows.end - 1),
      firstVisibleColumn: first_visible_column,
      lastVisibleColumn: last_visible_column,
    });
  }

  private paint_frozen_panes(
    active_sheet: SheetId,
    body_rows: { start: number; end: number },
    body_columns: readonly number[],
    frozen_rows: number,
    frozen_columns: number,
    frozen_height: number,
    frozen_width: number,
    content_top: number,
    scroll_left: number,
    client_width: number,
    client_height: number,
    body_geometry: { rowTops: Float64Array; rowHeights: Float64Array } | null,
    refresh_data: boolean,
    repaint: boolean,
  ): VisibleWindowView {
    const theme = this.options.theme();
    const gutter = theme.rowHeaderWidth;
    const header_height = theme.headerHeight;
    const x_split = frozen_columns > 0 ? gutter + frozen_width : 0;
    const y_split = frozen_rows > 0 ? header_height + frozen_height : 0;
    const frozen_row_window = { start: 0, end: frozen_rows };
    const frozen_column_indices =
      frozen_columns > 0 ? this.options.geometry.columnIndices.slice(0, frozen_columns) : [];
    const frozen_geometry =
      frozen_rows > 0 ? this.options.geometry.frozenRowGeometry(frozen_rows) : null;
    const panes: PanePaint[] = [];
    const frozen_numbers = frozen_rows > 0 ? this.options.rowNumbers(frozen_row_window) : undefined;
    const body_numbers = this.options.rowNumbers(body_rows);
    const filtered_rows = this.options.filteredRows();
    const filter_header = this.options.filterHeader();

    const pane_view = (
      rows: { start: number; end: number },
      columns: readonly number[],
    ): VisibleWindowView => {
      const slot = panes.length;
      let view = this.cached_pane_views[slot];
      if (refresh_data || !view) {
        view = this.previewed(
          this.retain_pane_view(
            this.options.store.getVisibleWindow(active_sheet, rows, columns),
            slot,
          ),
        );
        this.cached_pane_views[slot] = view;
      }

      return view;
    };

    if (frozen_rows > 0 && frozen_columns > 0) {
      panes.push({
        view: pane_view(frozen_row_window, frozen_column_indices),
        clip: { x: 0, y: 0, w: x_split, h: y_split },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: frozen_geometry?.rowTops,
        rowHeights: frozen_geometry?.rowHeights,
        rowNumbers: frozen_numbers,
        filteredRows: filtered_rows,
        filterHeader: filter_header,
      });
    }

    if (frozen_rows > 0) {
      panes.push({
        view: pane_view(frozen_row_window, body_columns),
        clip: { x: x_split, y: 0, w: Math.max(0, client_width - x_split), h: y_split },
        scrollTop: 0,
        scrollLeft: scroll_left,
        rowTops: frozen_geometry?.rowTops,
        rowHeights: frozen_geometry?.rowHeights,
        rowNumbers: frozen_numbers,
        filteredRows: filtered_rows,
        filterHeader: filter_header,
      });
    }

    if (frozen_columns > 0) {
      panes.push({
        view: pane_view(body_rows, frozen_column_indices),
        clip: { x: 0, y: y_split, w: x_split, h: Math.max(0, client_height - y_split) },
        scrollTop: content_top,
        scrollLeft: 0,
        rowTops: body_geometry?.rowTops,
        rowHeights: body_geometry?.rowHeights,
        rowNumbers: body_numbers,
        filteredRows: filtered_rows,
        filterHeader: filter_header,
      });
    }

    const body_view = pane_view(body_rows, body_columns);
    panes.push({
      view: body_view,
      clip: {
        x: x_split,
        y: y_split,
        w: Math.max(0, client_width - x_split),
        h: Math.max(0, client_height - y_split),
      },
      scrollTop: content_top,
      scrollLeft: scroll_left,
      rowTops: body_geometry?.rowTops,
      rowHeights: body_geometry?.rowHeights,
      rowNumbers: body_numbers,
      filteredRows: filtered_rows,
      filterHeader: filter_header,
    });
    this.cached_pane_views.length = panes.length;

    if (repaint) {
      this.dom_merge_source_views.length = panes.length;
      for (let slot = 0; slot < panes.length; slot++) {
        const pane = panes[slot];
        if (!pane) throw new Error("Sheetwrite: missing frozen pane");
        this.dom_merge_source_views[slot] = pane.view;
      }

      const requests = this.options.domOverlay.mergeAnchorRequests(this.dom_merge_source_views);
      if (this.dom_merge_anchors_need_refresh(requests, refresh_data)) {
        this.load_dom_merge_anchor_views(requests);
      }

      this.options.domOverlay.paintPanes(panes, this.cached_dom_merge_anchor_views);
      this.options.renderer().paintPanes?.(panes, {
        x: frozen_columns > 0 ? x_split - 0.5 : null,
        y: frozen_rows > 0 ? y_split - 0.5 : null,
      });
    }

    return body_view;
  }

  private dom_merge_anchors_need_refresh(
    requests: readonly DomMergeAnchorRequest[],
    refresh_data: boolean,
  ): boolean {
    let changed = refresh_data;
    let state_index = 0;

    for (const request of requests) {
      if (this.dom_merge_anchor_state[state_index] !== request.sheet) changed = true;
      this.dom_merge_anchor_state[state_index++] = request.sheet;
      if (this.dom_merge_anchor_state[state_index] !== request.row) changed = true;
      this.dom_merge_anchor_state[state_index++] = request.row;
      if (this.dom_merge_anchor_state[state_index] !== request.cols.length) changed = true;
      this.dom_merge_anchor_state[state_index++] = request.cols.length;
      for (const col of request.cols) {
        if (this.dom_merge_anchor_state[state_index] !== col) changed = true;
        this.dom_merge_anchor_state[state_index++] = col;
      }
    }

    if (this.dom_merge_anchor_state.length !== state_index) changed = true;
    this.dom_merge_anchor_state.length = state_index;
    return changed;
  }

  private load_dom_merge_anchor_views(requests: readonly DomMergeAnchorRequest[]): void {
    this.cached_dom_merge_anchor_views.length = requests.length;
    for (let slot = 0; slot < requests.length; slot++) {
      const request = requests[slot];
      if (!request) throw new Error("Sheetwrite: missing merge anchor request");

      const view = this.options.store.getVisibleWindow(
        request.sheet,
        { start: request.row, end: request.row + 1 },
        request.cols,
      );
      let values = this.dom_merge_anchor_value_pools[slot];
      if (!values || values.length !== view.values.length) {
        values = new Array<CellScalar>(view.values.length);
        this.dom_merge_anchor_value_pools[slot] = values;
      }

      for (let index = 0; index < values.length; index++)
        values[index] = view.values[index] ?? null;
      this.cached_dom_merge_anchor_views[slot] = this.previewed({ ...view, values });
    }
  }

  private update_demand(
    sheet: SheetId,
    paint_rows: { start: number; end: number },
    visible_rows: { start: number; end: number },
    frozen_rows: number,
    refresh_data: boolean,
  ): void {
    const engine = storeEngine(this.options.store);
    const refresh_closure =
      refresh_data &&
      engine !== null &&
      (this.options.datasourceEnabled === true || engine.isPaged(sheet));

    if (refresh_data && !refresh_closure) {
      this.formula_bands = EMPTY_BANDS;
      if (engine && this.pinned_sheet !== null) {
        engine.pinViewportBands(this.pinned_sheet, EMPTY_BANDS);
        this.pinned_sheet = null;
      }
    }

    const anchors: DomMergeAnchorRequest[] = [];
    if (refresh_closure) {
      const merges =
        this.options.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)
          ?.merges ?? [];
      if (merges.length > 0) {
        const index = prepareMergeIndex(merges);
        const reached = new Set(
          intersectingMerges(
            index,
            paint_rows.start,
            paint_rows.end,
            this.datasource_column_indices,
          ),
        );
        if (frozen_rows > 0) {
          for (const merge of intersectingMerges(
            index,
            0,
            frozen_rows,
            this.datasource_column_indices,
          )) {
            reached.add(merge);
          }
        }

        for (const merge of reached) {
          anchors.push({ sheet, row: merge.r0, cols: [merge.c0] });
        }
      }
    }

    if (engine && refresh_closure) {
      const roots = [
        { sheet, row: paint_rows.start, end: paint_rows.end, cols: this.datasource_column_indices },
        ...(frozen_rows > 0
          ? [{ sheet, row: 0, end: frozen_rows, cols: this.datasource_column_indices }]
          : []),
        ...anchors.map((anchor) => ({ ...anchor, end: anchor.row + 1 })),
      ];
      const protected_bands: number[] = [];
      const formula_bands: number[] = [];
      let remaining_cells = FORMULA_CLOSURE_MAX_CELLS;

      for (const root of roots) {
        if (root.sheet !== sheet) continue;
        // Formula discovery and engine pins use backing rows, never display rows.
        for (let row = root.row; row < root.end;) {
          const start = engine.dataRowAt(sheet, row);
          let end = start + 1;
          row += 1;
          while (row < root.end && engine.dataRowAt(sheet, row) === end) {
            end += 1;
            row += 1;
          }

          for (const col of root.cols) protected_bands.push(start, end, col, col + 1);
          const bands = engine.formulaReadBands(sheet, start, end, root.cols, remaining_cells);
          for (let index = 0; index < bands.length; index += 4) {
            const row_start = bands[index];
            const row_end = bands[index + 1];
            const col_start = bands[index + 2];
            const col_end = bands[index + 3];
            if (
              row_start === undefined ||
              row_end === undefined ||
              col_start === undefined ||
              col_end === undefined
            ) {
              throw new Error("Sheetwrite: invalid formula closure band");
            }

            formula_bands.push(row_start, row_end, col_start, col_end);
            protected_bands.push(row_start, row_end, col_start, col_end);
            remaining_cells -= (row_end - row_start) * (col_end - col_start);
          }
        }
      }

      if (this.pinned_sheet !== null && this.pinned_sheet !== sheet) {
        engine.pinViewportBands(this.pinned_sheet, EMPTY_BANDS);
      }

      this.formula_bands =
        formula_bands.length === 0 ? EMPTY_BANDS : Uint32Array.from(formula_bands);
      engine.pinViewportBands(sheet, Uint32Array.from(protected_bands));
      this.pinned_sheet = sheet;
    }

    // Protection is committed before any page can hydrate or evict a chunk.
    if (frozen_rows > 0)
      this.options.datasource.ensureLoaded(0, frozen_rows, this.datasource_column_indices);
    for (const anchor of anchors) {
      this.options.datasource.ensureLoaded(anchor.row, anchor.row + 1, anchor.cols);
    }

    this.options.datasource.updateViewport(
      visible_rows.start,
      visible_rows.end,
      this.datasource_column_indices,
      this.formula_bands,
    );
  }

  private retain_main_view(view: VisibleWindowView): VisibleWindowView {
    if (this.main_view_value_pool.length !== view.values.length) {
      this.main_view_value_pool = new Array<CellScalar>(view.values.length);
    }
    for (let index = 0; index < this.main_view_value_pool.length; index++) {
      this.main_view_value_pool[index] = view.values[index] ?? null;
    }
    return { ...view, values: this.main_view_value_pool };
  }

  private previewed(view: VisibleWindowView): VisibleWindowView {
    return this.options.previewWindow?.()?.(view) ?? view;
  }

  private retain_pane_view(view: VisibleWindowView, slot: number): VisibleWindowView {
    let values = this.pane_value_pools[slot];
    if (!values || values.length !== view.values.length) {
      values = new Array<CellScalar>(view.values.length);
      this.pane_value_pools[slot] = values;
    }

    for (let index = 0; index < values.length; index++) values[index] = view.values[index] ?? null;
    return { ...view, values };
  }
}
