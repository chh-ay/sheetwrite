import type { AriaMirror } from "./aria-mirror.js";
import { intersectingMerges, prepareMergeIndex } from "./canvas-paint.js";
import type { DatasourceController } from "./datasource-controller.js";
import type { DomMergeAnchorRequest, DomOverlay } from "./dom-overlay.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import type { OverlayPainter } from "./overlay-painter.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { PanePaint, Renderer, Theme, Viewport } from "./types/render.js";
import type { Store, VisibleWindowView } from "./types/store.js";

const FORMULA_CLOSURE_MAX_CELLS = 32_768;
const EMPTY_BANDS = new Uint32Array(0);

export interface ReadWindowControllerOptions {
  renderer: () => Renderer;
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
}

/** Owns paint/read plans, hydration demand, formula closure and residency. */
export class ReadWindowController {
  private frame = 0;
  private paintInvalidationEpoch = 0;
  private dataInvalidationEpoch = 0;
  private columnWindowStart = -1;
  private columnWindowEnd = -1;
  private windowedColumnIndices: readonly number[] = [];
  private datasourceColumnIndices: readonly number[] = [];
  private datasourceFrozenColumns = -1;
  private columnWindowRevision = 0;
  private lastDataSheet: SheetId | null = null;
  private lastDataRowStart = 0;
  private lastDataRowEnd = 0;
  private lastDataColumnWindowRevision = 0;
  private lastDataStoreEpoch = 0;
  private lastDataInvalidationEpoch = 0;
  private lastDataFrozenRows = 0;
  private lastDataFrozenColumns = 0;
  private lastPaintContentTop = 0;
  private lastPaintScrollLeft = 0;
  private lastPaintClientWidth = 0;
  private lastPaintClientHeight = 0;
  private lastPaintInvalidationEpoch = 0;
  private lastPaintFrozenHeight = 0;
  private lastPaintFrozenWidth = 0;
  private lastPaintZoom = 0;
  private lastPaintView: VisibleWindowView | null = null;
  private cachedPaneViews: VisibleWindowView[] = [];
  private readonly paneValuePools: CellScalar[][] = [];
  private cachedDomMergeAnchorViews: VisibleWindowView[] = [];
  private readonly domMergeAnchorValuePools: CellScalar[][] = [];
  private readonly domMergeSourceViews: VisibleWindowView[] = [];
  private mainViewValuePool: CellScalar[] = [];
  private readonly domMergeAnchorState: Array<SheetId | number> = [];
  private formulaBands = EMPTY_BANDS;
  private pinnedSheet: SheetId | null = null;
  private destroyed = false;
  private readonly stopMemoryRelease: (() => void) | undefined;

  constructor(private readonly options: ReadWindowControllerOptions) {
    this.stopMemoryRelease = storeEngine(options.store)?.onMemoryRelease(() => {
      this.invalidateData();
      this.schedule();
    });
  }

  get geometryVersion(): number {
    return this.options.storeEpoch() + this.paintInvalidationEpoch + this.dataInvalidationEpoch;
  }

  /** Preserve autofit's operation-owned sampling band without changing viewport protection. */
  sampleRows(): { start: number; end: number } {
    const { geometry } = this.options;
    return geometry.visibleRowWindow(
      geometry.toContent(this.options.scrollTop()),
      this.options.viewportHeight(),
      this.options.overscan(),
    );
  }

  /** Invalidates pixel/layout paint state without discarding stable data windows. */
  invalidate(): void {
    this.paintInvalidationEpoch += 1;
  }

  /** Invalidates logical row/column contents or order and all dependent paint state. */
  invalidateData(): void {
    this.dataInvalidationEpoch += 1;
    this.paintInvalidationEpoch += 1;
  }

  invalidateColumns(): void {
    this.columnWindowStart = -1;
    this.columnWindowEnd = -1;
    this.datasourceColumnIndices = [];
    this.datasourceFrozenColumns = -1;
    this.invalidateData();
  }

  schedule(): void {
    if (this.frame || this.destroyed) return;
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => setTimeout(callback, 16));
    this.frame = requestFrame(() => {
      this.frame = 0;
      this.render();
    }) as unknown as number;
  }

  renderNow(): void {
    if (this.destroyed) return;
    if (this.frame) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
      this.frame = 0;
    }
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopMemoryRelease?.();
    if (this.pinnedSheet !== null) {
      storeEngine(this.options.store)?.pinViewportBands(this.pinnedSheet, EMPTY_BANDS);
      this.pinnedSheet = null;
    }
    if (this.frame) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
      this.frame = 0;
    }
    this.lastPaintView = null;
    this.cachedPaneViews = [];
    this.cachedDomMergeAnchorViews = [];
    this.domMergeSourceViews.length = 0;
    this.domMergeAnchorState.length = 0;
  }

  private render(): void {
    const { geometry } = this.options;
    const clientHeight = this.options.viewportHeight();
    const clientWidth = this.options.viewportWidth();
    const theme = this.options.theme();
    const bodyHeight = Math.max(0, clientHeight - theme.headerHeight);
    const contentTop = geometry.toContent(this.options.scrollTop());
    const scrollLeft = this.options.scrollLeft();
    const cellViewportWidth = Math.max(0, clientWidth - theme.rowHeaderWidth);
    const paintWindow = geometry.paintWindow(
      contentTop,
      scrollLeft,
      bodyHeight,
      cellViewportWidth,
      this.options.overscan(),
    );
    const rows = paintWindow.rows;
    const columns = paintWindow.columns;
    const frozenRows = paintWindow.frozenRows;
    const frozenColumns = paintWindow.frozenColumns;
    const frozenHeight = paintWindow.frozenHeight;
    const frozenWidth = paintWindow.frozenWidth;
    const visibleColumns = geometry.columnWindow(scrollLeft, cellViewportWidth, 0);
    const firstBodyVisibleColumn = geometry.columnIndices[visibleColumns.start] ?? null;
    const lastBodyVisibleColumn = geometry.columnIndices[visibleColumns.end - 1] ?? null;
    const firstVisibleColumn =
      frozenColumns > 0
        ? (geometry.columnIndices[0] ?? firstBodyVisibleColumn)
        : firstBodyVisibleColumn;
    const lastVisibleColumn =
      lastBodyVisibleColumn ??
      (frozenColumns > 0 ? (geometry.columnIndices[frozenColumns - 1] ?? null) : null);
    const rawVisibleRows = geometry.visibleRowWindow(
      contentTop + frozenHeight,
      Math.max(0, bodyHeight - frozenHeight) + theme.headerHeight,
      0,
    );
    const visibleRows =
      frozenRows > 0
        ? {
            start: Math.max(rawVisibleRows.start, frozenRows),
            end: Math.max(rawVisibleRows.end, frozenRows),
          }
        : rawVisibleRows;
    const usePanes =
      (frozenRows > 0 || frozenColumns > 0) && this.options.renderer().paintPanes !== undefined;
    const rowGeometry = geometry.rowGeometry(rows);
    const columnWindowChanged =
      columns.start !== this.columnWindowStart || columns.end !== this.columnWindowEnd;
    if (columnWindowChanged) {
      const columnCount = columns.end - columns.start;
      let contentsChanged = columnCount !== this.windowedColumnIndices.length;
      for (let offset = 0; !contentsChanged && offset < columnCount; offset++) {
        if (geometry.columnIndices[columns.start + offset] !== this.windowedColumnIndices[offset]) {
          contentsChanged = true;
        }
      }
      this.columnWindowStart = columns.start;
      this.columnWindowEnd = columns.end;
      this.windowedColumnIndices = geometry.columnIndices.slice(columns.start, columns.end);
      if (contentsChanged) this.columnWindowRevision += 1;
      this.options.ariaMirror.bumpVersion();
    }
    if (columnWindowChanged || frozenColumns !== this.datasourceFrozenColumns) {
      const frozenColumnIndices =
        frozenColumns > 0 ? geometry.columnIndices.slice(0, frozenColumns) : [];
      const demanded = [...frozenColumnIndices, ...this.windowedColumnIndices].sort(
        (left, right) => left - right,
      );
      const datasourceColumnCount =
        this.options.datasourceColumnCount?.() ?? Number.MAX_SAFE_INTEGER;
      let write = 0;
      for (const column of demanded) {
        if (
          column >= 0 &&
          column < datasourceColumnCount &&
          (write === 0 || demanded[write - 1] !== column)
        ) {
          demanded[write++] = column;
        }
      }
      demanded.length = write;
      this.datasourceColumnIndices = demanded;
      this.datasourceFrozenColumns = frozenColumns;
    }

    const activeSheet = this.options.activeSheet();
    const storeEpoch = this.options.storeEpoch();
    const viewport: Viewport = {
      scrollTop: contentTop,
      scrollLeft,
      width: clientWidth,
      height: clientHeight,
      contentRevision: storeEpoch + this.dataInvalidationEpoch + this.paintInvalidationEpoch,
    };
    if (rowGeometry) {
      viewport.rowTops = rowGeometry.rowTops;
      viewport.rowHeights = rowGeometry.rowHeights;
    }
    this.options.renderer().setViewport(viewport);

    const zoom = this.options.zoom();
    const refreshData =
      this.lastPaintView === null ||
      activeSheet !== this.lastDataSheet ||
      rows.start !== this.lastDataRowStart ||
      rows.end !== this.lastDataRowEnd ||
      this.columnWindowRevision !== this.lastDataColumnWindowRevision ||
      storeEpoch !== this.lastDataStoreEpoch ||
      this.dataInvalidationEpoch !== this.lastDataInvalidationEpoch ||
      frozenRows !== this.lastDataFrozenRows ||
      frozenColumns !== this.lastDataFrozenColumns;
    const repaint =
      refreshData ||
      !Object.is(contentTop, this.lastPaintContentTop) ||
      !Object.is(scrollLeft, this.lastPaintScrollLeft) ||
      !Object.is(clientWidth, this.lastPaintClientWidth) ||
      !Object.is(clientHeight, this.lastPaintClientHeight) ||
      this.paintInvalidationEpoch !== this.lastPaintInvalidationEpoch ||
      !Object.is(frozenHeight, this.lastPaintFrozenHeight) ||
      !Object.is(frozenWidth, this.lastPaintFrozenWidth) ||
      !Object.is(zoom, this.lastPaintZoom);
    this.updateDemand(activeSheet, rows, visibleRows, frozenRows, refreshData);

    let view: VisibleWindowView;
    if (usePanes) {
      view = this.paintFrozenPanes(
        activeSheet,
        rows,
        this.windowedColumnIndices,
        frozenRows,
        frozenColumns,
        frozenHeight,
        frozenWidth,
        contentTop,
        scrollLeft,
        clientWidth,
        clientHeight,
        rowGeometry,
        refreshData,
        repaint,
      );
    } else {
      if (refreshData) {
        this.cachedPaneViews = [];
        this.lastPaintView = this.options.store.getVisibleWindow(
          activeSheet,
          rows,
          this.windowedColumnIndices,
        );
      }
      const cachedView = this.lastPaintView;
      if (!cachedView) throw new Error("Sheetwrite: paint window was not resolved");
      view = cachedView;
      if (repaint) {
        this.domMergeSourceViews[0] = view;
        this.domMergeSourceViews.length = 1;
        const requests = this.options.domOverlay.mergeAnchorRequests(this.domMergeSourceViews);
        const refreshAnchors = this.domMergeAnchorsNeedRefresh(requests, refreshData);
        if (refreshAnchors && requests.length > 0) {
          view = this.retainMainView(view);
          this.lastPaintView = view;
          this.domMergeSourceViews[0] = view;
        }
        if (refreshAnchors) this.loadDomMergeAnchorViews(requests);
        this.options.domOverlay.paint(view, viewport, this.cachedDomMergeAnchorViews);
        this.options.renderer().paint(view);
      }
    }
    this.lastPaintView = view;
    this.lastDataSheet = activeSheet;
    this.lastDataRowStart = rows.start;
    this.lastDataRowEnd = rows.end;
    this.lastDataColumnWindowRevision = this.columnWindowRevision;
    this.lastDataStoreEpoch = storeEpoch;
    this.lastDataInvalidationEpoch = this.dataInvalidationEpoch;
    this.lastDataFrozenRows = frozenRows;
    this.lastDataFrozenColumns = frozenColumns;
    this.lastPaintContentTop = contentTop;
    this.lastPaintScrollLeft = scrollLeft;
    this.lastPaintClientWidth = clientWidth;
    this.lastPaintClientHeight = clientHeight;
    this.lastPaintInvalidationEpoch = this.paintInvalidationEpoch;
    this.lastPaintFrozenHeight = frozenHeight;
    this.lastPaintFrozenWidth = frozenWidth;
    this.lastPaintZoom = zoom;
    this.options.ariaMirror.update(view);
    this.options.overlayPainter.paint(contentTop, scrollLeft, clientWidth, clientHeight);
    this.options.repositionEditor(contentTop, scrollLeft);
    this.options.emitScroll({
      scrollTop: contentTop,
      scrollLeft,
      firstRow: rows.start,
      lastRow: Math.max(rows.start, rows.end - 1),
      firstVisibleColumn,
      lastVisibleColumn,
    });
  }

  private paintFrozenPanes(
    activeSheet: SheetId,
    bodyRows: { start: number; end: number },
    bodyColumns: readonly number[],
    frozenRows: number,
    frozenColumns: number,
    frozenHeight: number,
    frozenWidth: number,
    contentTop: number,
    scrollLeft: number,
    clientWidth: number,
    clientHeight: number,
    bodyGeometry: { rowTops: Float64Array; rowHeights: Float64Array } | null,
    refreshData: boolean,
    repaint: boolean,
  ): VisibleWindowView {
    const theme = this.options.theme();
    const gutter = theme.rowHeaderWidth;
    const headerHeight = theme.headerHeight;
    const xSplit = frozenColumns > 0 ? gutter + frozenWidth : 0;
    const ySplit = frozenRows > 0 ? headerHeight + frozenHeight : 0;
    const frozenRowWindow = { start: 0, end: frozenRows };
    const frozenColumnIndices =
      frozenColumns > 0 ? this.options.geometry.columnIndices.slice(0, frozenColumns) : [];
    const frozenGeometry =
      frozenRows > 0 ? this.options.geometry.frozenRowGeometry(frozenRows) : null;
    const panes: PanePaint[] = [];
    const paneView = (
      rows: { start: number; end: number },
      columns: readonly number[],
    ): VisibleWindowView => {
      const slot = panes.length;
      let view = this.cachedPaneViews[slot];
      if (refreshData || !view) {
        view = this.retainPaneView(
          this.options.store.getVisibleWindow(activeSheet, rows, columns),
          slot,
        );
        this.cachedPaneViews[slot] = view;
      }
      return view;
    };

    if (frozenRows > 0 && frozenColumns > 0) {
      panes.push({
        view: paneView(frozenRowWindow, frozenColumnIndices),
        clip: { x: 0, y: 0, w: xSplit, h: ySplit },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenRows > 0) {
      panes.push({
        view: paneView(frozenRowWindow, bodyColumns),
        clip: { x: xSplit, y: 0, w: Math.max(0, clientWidth - xSplit), h: ySplit },
        scrollTop: 0,
        scrollLeft,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenColumns > 0) {
      panes.push({
        view: paneView(bodyRows, frozenColumnIndices),
        clip: { x: 0, y: ySplit, w: xSplit, h: Math.max(0, clientHeight - ySplit) },
        scrollTop: contentTop,
        scrollLeft: 0,
        rowTops: bodyGeometry?.rowTops,
        rowHeights: bodyGeometry?.rowHeights,
      });
    }

    const bodyView = paneView(bodyRows, bodyColumns);
    panes.push({
      view: bodyView,
      clip: {
        x: xSplit,
        y: ySplit,
        w: Math.max(0, clientWidth - xSplit),
        h: Math.max(0, clientHeight - ySplit),
      },
      scrollTop: contentTop,
      scrollLeft,
      rowTops: bodyGeometry?.rowTops,
      rowHeights: bodyGeometry?.rowHeights,
    });
    this.cachedPaneViews.length = panes.length;
    if (repaint) {
      this.domMergeSourceViews.length = panes.length;
      for (let slot = 0; slot < panes.length; slot++) {
        const pane = panes[slot];
        if (!pane) throw new Error("Sheetwrite: missing frozen pane");
        this.domMergeSourceViews[slot] = pane.view;
      }
      const requests = this.options.domOverlay.mergeAnchorRequests(this.domMergeSourceViews);
      if (this.domMergeAnchorsNeedRefresh(requests, refreshData)) {
        this.loadDomMergeAnchorViews(requests);
      }
      this.options.domOverlay.paintPanes(panes, this.cachedDomMergeAnchorViews);
      this.options.renderer().paintPanes?.(panes, {
        x: frozenColumns > 0 ? xSplit - 0.5 : null,
        y: frozenRows > 0 ? ySplit - 0.5 : null,
      });
    }
    return bodyView;
  }

  private domMergeAnchorsNeedRefresh(
    requests: readonly DomMergeAnchorRequest[],
    refreshData: boolean,
  ): boolean {
    let changed = refreshData;
    let stateIndex = 0;
    for (const request of requests) {
      if (this.domMergeAnchorState[stateIndex] !== request.sheet) changed = true;
      this.domMergeAnchorState[stateIndex++] = request.sheet;
      if (this.domMergeAnchorState[stateIndex] !== request.row) changed = true;
      this.domMergeAnchorState[stateIndex++] = request.row;
      if (this.domMergeAnchorState[stateIndex] !== request.cols.length) changed = true;
      this.domMergeAnchorState[stateIndex++] = request.cols.length;
      for (const col of request.cols) {
        if (this.domMergeAnchorState[stateIndex] !== col) changed = true;
        this.domMergeAnchorState[stateIndex++] = col;
      }
    }
    if (this.domMergeAnchorState.length !== stateIndex) changed = true;
    this.domMergeAnchorState.length = stateIndex;
    return changed;
  }

  private loadDomMergeAnchorViews(requests: readonly DomMergeAnchorRequest[]): void {
    this.cachedDomMergeAnchorViews.length = requests.length;
    for (let slot = 0; slot < requests.length; slot++) {
      const request = requests[slot];
      if (!request) throw new Error("Sheetwrite: missing merge anchor request");
      const view = this.options.store.getVisibleWindow(
        request.sheet,
        { start: request.row, end: request.row + 1 },
        request.cols,
      );
      let values = this.domMergeAnchorValuePools[slot];
      if (!values || values.length !== view.values.length) {
        values = new Array<CellScalar>(view.values.length);
        this.domMergeAnchorValuePools[slot] = values;
      }
      for (let index = 0; index < values.length; index++)
        values[index] = view.values[index] ?? null;
      this.cachedDomMergeAnchorViews[slot] = { ...view, values };
    }
  }

  private updateDemand(
    sheet: SheetId,
    paintRows: { start: number; end: number },
    visibleRows: { start: number; end: number },
    frozenRows: number,
    refreshData: boolean,
  ): void {
    const engine = storeEngine(this.options.store);
    const refreshClosure =
      refreshData &&
      engine !== null &&
      (this.options.datasourceEnabled === true || engine.isPaged(sheet));
    if (refreshData && !refreshClosure) {
      this.formulaBands = EMPTY_BANDS;
      if (engine && this.pinnedSheet !== null) {
        engine.pinViewportBands(this.pinnedSheet, EMPTY_BANDS);
        this.pinnedSheet = null;
      }
    }
    const anchors: DomMergeAnchorRequest[] = [];
    if (refreshClosure) {
      const merges =
        this.options.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)
          ?.merges ?? [];
      if (merges.length > 0) {
        const index = prepareMergeIndex(merges);
        const reached = new Set(
          intersectingMerges(index, paintRows.start, paintRows.end, this.datasourceColumnIndices),
        );
        if (frozenRows > 0) {
          for (const merge of intersectingMerges(
            index,
            0,
            frozenRows,
            this.datasourceColumnIndices,
          )) {
            reached.add(merge);
          }
        }
        for (const merge of reached) {
          anchors.push({ sheet, row: merge.r0, cols: [merge.c0] });
        }
      }
    }
    if (engine && refreshClosure) {
      const roots = [
        { sheet, row: paintRows.start, end: paintRows.end, cols: this.datasourceColumnIndices },
        ...(frozenRows > 0
          ? [{ sheet, row: 0, end: frozenRows, cols: this.datasourceColumnIndices }]
          : []),
        ...anchors.map((anchor) => ({ ...anchor, end: anchor.row + 1 })),
      ];
      const protectedBands: number[] = [];
      const formulaBands: number[] = [];
      let remainingCells = FORMULA_CLOSURE_MAX_CELLS;
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
          for (const col of root.cols) protectedBands.push(start, end, col, col + 1);
          const bands = engine.formulaReadBands(sheet, start, end, root.cols, remainingCells);
          for (let index = 0; index < bands.length; index += 4) {
            const rowStart = bands[index];
            const rowEnd = bands[index + 1];
            const colStart = bands[index + 2];
            const colEnd = bands[index + 3];
            if (
              rowStart === undefined ||
              rowEnd === undefined ||
              colStart === undefined ||
              colEnd === undefined
            ) {
              throw new Error("Sheetwrite: invalid formula closure band");
            }
            formulaBands.push(rowStart, rowEnd, colStart, colEnd);
            protectedBands.push(rowStart, rowEnd, colStart, colEnd);
            remainingCells -= (rowEnd - rowStart) * (colEnd - colStart);
          }
        }
      }
      if (this.pinnedSheet !== null && this.pinnedSheet !== sheet) {
        engine.pinViewportBands(this.pinnedSheet, EMPTY_BANDS);
      }
      this.formulaBands = formulaBands.length === 0 ? EMPTY_BANDS : Uint32Array.from(formulaBands);
      engine.pinViewportBands(sheet, Uint32Array.from(protectedBands));
      this.pinnedSheet = sheet;
    }
    // Protection is committed before any page can hydrate or evict a chunk.
    if (frozenRows > 0)
      this.options.datasource.ensureLoaded(0, frozenRows, this.datasourceColumnIndices);
    for (const anchor of anchors) {
      this.options.datasource.ensureLoaded(anchor.row, anchor.row + 1, anchor.cols);
    }
    this.options.datasource.updateViewport(
      visibleRows.start,
      visibleRows.end,
      this.datasourceColumnIndices,
      this.formulaBands,
    );
  }

  private retainMainView(view: VisibleWindowView): VisibleWindowView {
    if (this.mainViewValuePool.length !== view.values.length) {
      this.mainViewValuePool = new Array<CellScalar>(view.values.length);
    }
    for (let index = 0; index < this.mainViewValuePool.length; index++) {
      this.mainViewValuePool[index] = view.values[index] ?? null;
    }
    return { ...view, values: this.mainViewValuePool };
  }

  private retainPaneView(view: VisibleWindowView, slot: number): VisibleWindowView {
    let values = this.paneValuePools[slot];
    if (!values || values.length !== view.values.length) {
      values = new Array<CellScalar>(view.values.length);
      this.paneValuePools[slot] = values;
    }
    for (let index = 0; index < values.length; index++) values[index] = view.values[index] ?? null;
    return { ...view, values };
  }
}
