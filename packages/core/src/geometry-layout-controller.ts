import { ColumnIndex } from "./column-index.js";
import { DEFAULT_SNAPSHOT_RESOURCE_LIMITS, SnapshotResourceError } from "./document-protocol.js";
import { OffsetIndex, ScaledScroll } from "./fenwick.js";
import type { SheetwriteStore } from "./store.js";
import { visibleColumns } from "./store/ranges.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { Sheet } from "./types/document.js";
import type { Theme } from "./types/render.js";
import { computeColumnWindow, computeWindow } from "./virtualization.js";

interface GeometryLayoutOptions {
  sheet: () => Sheet;
  activeSheet: () => SheetId;
  loadable: SheetwriteStore | null;
  theme: () => Theme;
  zoom: () => number;
  maxElementHeight: () => number;
}

export interface GeometryPaintWindow {
  rows: { start: number; end: number };
  columns: { start: number; end: number };
  frozenRows: number;
  frozenColumns: number;
  frozenHeight: number;
  frozenWidth: number;
}

function assertGeometryDimensions(rowCount: number, columnCount: number): void {
  // Snapshot row ceilings govern admission, not growth of an already-admitted sheet.
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new SnapshotResourceError(
      "maxRowsPerSheet",
      DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet,
      rowCount,
    );
  }
  if (columnCount > DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxColumnsPerSheet) {
    throw new SnapshotResourceError(
      "maxColumnsPerSheet",
      DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxColumnsPerSheet,
      columnCount,
    );
  }
}

/** Owns row/column indexes, scaled scrolling, viewport windows, and frozen-pane mapping. */
export class GeometryLayoutController {
  private rowIndex: OffsetIndex;
  private columnIndex: ColumnIndex;
  private visibleColumnIndices: number[];
  private scrollScale: ScaledScroll;
  private rowTopsScratch = new Float64Array(0);
  private rowHeightsScratch = new Float64Array(0);
  private rowTopsView = this.rowTopsScratch;
  private rowHeightsView = this.rowHeightsScratch;
  private rowGeometryLength = 0;
  private previewColumn = -1;
  private previewWidth = 0;
  /** View row whose height a resize drag previews, or -1. */
  private previewRow = -1;

  previewColumnWidth(column: number, width: number): void {
    this.previewColumn = column;
    this.previewWidth = width;
    this.columnIndex.setWidth(column, width * this.options.zoom());
  }

  columnWidth(column: number): number {
    return this.previewColumn === column
      ? this.previewWidth
      : (this.options.sheet().columns[column]?.width ?? 0);
  }

  previewRowHeight(row: number, height: number): void {
    if (this.previewRow !== -1 && this.previewRow !== row) {
      this.rowIndex.setHeight(this.previewRow, this.committedRowHeight(this.previewRow));
    }
    this.previewRow = row;
    this.rowIndex.setHeight(row, height * this.options.zoom());
  }

  clearResizePreview(): void {
    if (this.previewColumn !== -1) {
      const column = this.previewColumn;
      this.previewColumn = -1;
      this.columnIndex.setWidth(column, this.columnWidth(column) * this.options.zoom());
    }
    if (this.previewRow !== -1) {
      const row = this.previewRow;
      this.previewRow = -1;
      this.rowIndex.setHeight(row, this.committedRowHeight(row));
    }
  }

  constructor(
    private readonly options: GeometryLayoutOptions,
    viewportHeight: number,
  ) {
    const sheet = options.sheet();
    assertGeometryDimensions(sheet.rowCount, sheet.columns.length);
    this.visibleColumnIndices = visibleColumns(sheet);
    this.columnIndex = buildColumnIndex(sheet, this.visibleColumnIndices, options.zoom());
    this.rowIndex = this.createRowIndex(
      sheet,
      options.loadable?.viewRowCount(options.activeSheet()) ?? sheet.rowCount,
    );
    this.scrollScale = new ScaledScroll(
      this.rowIndex.totalHeight + options.theme().headerHeight,
      viewportHeight,
      options.maxElementHeight(),
    );
  }

  get columnIndices(): number[] {
    return this.visibleColumnIndices;
  }

  get rowCount(): number {
    return this.rowIndex.count;
  }

  firstColumn(): number {
    return this.visibleColumnIndices[0] ?? 0;
  }

  lastColumn(): number {
    return this.visibleColumnIndices[this.visibleColumnIndices.length - 1] ?? 0;
  }

  columnLeft(column: number): number {
    return this.columnIndex.leftOf(column);
  }

  columnAtX(contentX: number): number {
    return this.columnIndex.columnAtX(contentX);
  }

  nextVisibleColumn(column: number, direction: 1 | -1): number {
    const position = this.columnIndex.positionOf(column);
    if (position === -1) return column;
    const next = position + direction;
    if (next < 0 || next >= this.visibleColumnIndices.length) return column;
    return this.visibleColumnIndices[next]!;
  }

  /** Visible column before `column`, or -1 when it is hidden or the first one. */
  previousVisibleColumn(column: number): number {
    const position = this.columnIndex.positionOf(column);
    if (position <= 0) return -1;
    return this.visibleColumnIndices[position - 1] ?? -1;
  }

  rowAtOffset(contentY: number): number {
    return this.rowIndex.rowAtOffset(contentY).row;
  }

  rowOffset(row: number): number {
    return this.rowIndex.offsetOf(row);
  }

  rowHeight(row: number): number {
    return this.rowIndex.heightOf(row);
  }

  toContent(scrollTop: number): number {
    return this.scrollScale.toContent(scrollTop);
  }

  toScroll(contentTop: number): number {
    return this.scrollScale.toScroll(contentTop);
  }

  toDataRow(viewRow: number): number {
    return this.options.loadable?.dataRowAt(this.options.activeSheet(), viewRow) ?? viewRow;
  }

  toViewRow(dataRow: number): number | null {
    if (!this.options.loadable) return dataRow;
    return this.options.loadable.viewRowOf(this.options.activeSheet(), dataRow);
  }

  frozenRowCount(): number {
    const frozen = this.options.sheet().frozenRows ?? 0;
    return Math.max(0, Math.min(frozen, Math.max(0, this.rowIndex.count - 1)));
  }

  frozenColumnCount(): number {
    const frozen = this.options.sheet().frozenCols ?? 0;
    return Math.max(0, Math.min(frozen, Math.max(0, this.visibleColumnIndices.length - 1)));
  }

  frozenHeight(): number {
    const frozen = this.frozenRowCount();
    return frozen > 0 ? this.rowIndex.offsetOf(frozen) : 0;
  }

  frozenWidth(): number {
    const frozen = this.frozenColumnCount();
    if (frozen <= 0) return 0;
    const firstBodyColumn = this.visibleColumnIndices[frozen];
    return firstBodyColumn === undefined
      ? this.columnIndex.totalWidth
      : this.columnIndex.leftOf(firstBodyColumn);
  }

  firstBodyColumn(): number {
    const frozen = this.frozenColumnCount();
    return frozen > 0 ? (this.visibleColumnIndices[frozen] ?? Number.MAX_SAFE_INTEGER) : 0;
  }

  screenRowTop(row: number, contentTop: number): number {
    const scroll = row < this.frozenRowCount() ? 0 : contentTop;
    return this.options.theme().headerHeight + this.rowIndex.offsetOf(row) - scroll;
  }

  screenColumnLeft(column: number, scrollLeft: number): number {
    const scroll = column < this.firstBodyColumn() ? 0 : scrollLeft;
    return this.options.theme().rowHeaderWidth + this.columnIndex.leftOf(column) - scroll;
  }

  rangeRect(
    range: Range,
    contentTop: number,
    scrollLeft: number,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    return {
      x: this.screenColumnLeft(range.start.col, scrollLeft),
      y: this.screenRowTop(range.start.row, contentTop),
      w: this.columnIndex.leftOf(range.end.col + 1) - this.columnIndex.leftOf(range.start.col),
      h: this.rowIndex.offsetOf(range.end.row + 1) - this.rowIndex.offsetOf(range.start.row),
    };
  }

  pointerContentY(screenY: number, scrollTop: number): number {
    const bodyY = Math.max(0, screenY - this.options.theme().headerHeight);
    const inFrozenBand = this.frozenRowCount() > 0 && bodyY < this.frozenHeight();
    return inFrozenBand ? bodyY : bodyY + this.scrollScale.toContent(scrollTop);
  }

  paintWindow(
    contentTop: number,
    scrollLeft: number,
    bodyHeight: number,
    cellViewportWidth: number,
    overscan: number,
  ): GeometryPaintWindow {
    const frozenRows = this.frozenRowCount();
    const frozenColumns = this.frozenColumnCount();
    const frozenHeight = this.frozenHeight();
    const frozenWidth = this.frozenWidth();
    const rawRows = computeWindow(
      this.rowIndex,
      contentTop + frozenHeight,
      Math.max(0, bodyHeight - frozenHeight),
      overscan,
    );
    const columns = this.columnWindow(scrollLeft, cellViewportWidth, overscan);
    return {
      rows:
        frozenRows > 0
          ? {
              start: Math.max(rawRows.start, frozenRows),
              end: Math.max(rawRows.end, frozenRows),
            }
          : rawRows,
      columns,
      frozenRows,
      frozenColumns,
      frozenHeight,
      frozenWidth,
    };
  }

  columnWindow(
    scrollLeft: number,
    cellViewportWidth: number,
    overscan: number,
  ): { start: number; end: number } {
    const frozenColumns = this.frozenColumnCount();
    const frozenWidth = this.frozenWidth();
    const rawColumns = computeColumnWindow(
      this.columnIndex,
      scrollLeft + frozenWidth,
      Math.max(0, cellViewportWidth - frozenWidth),
      overscan,
    );
    return frozenColumns > 0
      ? {
          start: Math.max(rawColumns.start, frozenColumns),
          end: Math.max(rawColumns.end, frozenColumns),
        }
      : rawColumns;
  }

  visibleRowWindow(
    contentTop: number,
    viewportHeight: number,
    overscan: number,
  ): {
    start: number;
    end: number;
  } {
    return computeWindow(
      this.rowIndex,
      contentTop,
      Math.max(0, viewportHeight - this.options.theme().headerHeight),
      overscan,
    );
  }

  viewportAnchor(contentTop: number, scrollLeft: number): { row: number; col: number } {
    return {
      row: this.rowIndex.rowAtOffset(contentTop + this.frozenHeight()).row,
      col: this.columnIndex.columnAtX(scrollLeft + this.frozenWidth()),
    };
  }

  rowGeometry(window: { start: number; end: number }): {
    rowTops: Float64Array;
    rowHeights: Float64Array;
  } | null {
    const sheet = this.options.sheet();
    if (this.previewRow === -1 && (!sheet.rowHeights || sheet.rowHeights.size === 0)) return null;

    const count = Math.max(0, window.end - window.start);
    if (this.rowTopsScratch.length < count) {
      this.rowTopsScratch = new Float64Array(count);
      this.rowHeightsScratch = new Float64Array(count);
    }
    if (this.rowGeometryLength !== count) {
      this.rowTopsView = this.rowTopsScratch.subarray(0, count);
      this.rowHeightsView = this.rowHeightsScratch.subarray(0, count);
      this.rowGeometryLength = count;
    }

    let top = this.rowIndex.offsetOf(window.start);
    for (let index = 0; index < count; index++) {
      const height = this.rowIndex.heightOf(window.start + index);
      this.rowTopsScratch[index] = top;
      this.rowHeightsScratch[index] = height;
      top += height;
    }
    return { rowTops: this.rowTopsView, rowHeights: this.rowHeightsView };
  }

  frozenRowGeometry(count: number): {
    rowTops: Float64Array;
    rowHeights: Float64Array;
  } | null {
    if (count <= 0 || (this.previewRow === -1 && !this.options.sheet().rowHeights?.size)) {
      return null;
    }
    assertGeometryDimensions(count, 0);
    let rowTops: Float64Array;
    let rowHeights: Float64Array;
    try {
      rowTops = new Float64Array(count);
      rowHeights = new Float64Array(count);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new SnapshotResourceError(
        "maxRowsPerSheet",
        DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet,
        count,
        { cause: error },
      );
    }
    let top = 0;
    for (let index = 0; index < count; index++) {
      const height = this.rowIndex.heightOf(index);
      rowTops[index] = top;
      rowHeights[index] = height;
      top += height;
    }
    return { rowTops, rowHeights };
  }

  rebuildRows(
    rowCount = this.options.loadable?.viewRowCount(this.options.activeSheet()) ??
      this.options.sheet().rowCount,
  ): void {
    const sheet = this.options.sheet();
    assertGeometryDimensions(rowCount, sheet.columns.length);
    this.rowIndex = this.createRowIndex(sheet, rowCount);
  }

  /** Apply the committed heights of `dataRows` to the row index without rebuilding it. */
  updateRowHeights(dataRows: readonly number[]): void {
    if (dataRows.length === 1) {
      const viewRow = this.toViewRow(dataRows[0] ?? -1);
      if (viewRow !== null) this.rowIndex.setHeight(viewRow, this.committedRowHeight(viewRow));
      return;
    }
    const rowHeights = this.options.sheet().rowHeights;
    const { rows, heights } = this.committedHeights(
      dataRows.map((dataRow) => [dataRow, rowHeights?.get(dataRow)] as const),
      dataRows.length,
      this.rowIndex.count,
    );
    this.rowIndex.setHeights(rows, heights);
  }

  rebuildColumns(): void {
    const sheet = this.options.sheet();
    assertGeometryDimensions(sheet.rowCount, sheet.columns.length);
    this.visibleColumnIndices = visibleColumns(sheet);
    const widths = new Float64Array(this.visibleColumnIndices.length);
    for (let i = 0; i < this.visibleColumnIndices.length; i++) {
      const column = this.visibleColumnIndices[i];
      if (column !== undefined) widths[i] = this.columnWidth(column) * this.options.zoom();
    }
    this.columnIndex = new ColumnIndex(this.visibleColumnIndices, widths);
  }

  layoutSize(viewportHeight: number): { width: number; height: number } {
    const theme = this.options.theme();
    this.scrollScale.update(
      this.rowIndex.totalHeight + theme.headerHeight,
      viewportHeight,
      this.options.maxElementHeight(),
    );
    return {
      width: this.columnIndex.totalWidth + theme.rowHeaderWidth,
      height: this.scrollScale.sizerHeight,
    };
  }

  private createRowIndex(sheet: Sheet, rowCount: number): OffsetIndex {
    const index = new OffsetIndex(rowCount, this.options.theme().rowHeight);
    const rowHeights = sheet.rowHeights;
    if (rowHeights && rowHeights.size > 0) {
      const { rows, heights } = this.committedHeights(rowHeights, rowHeights.size, rowCount);
      index.load(rows, heights);
    }
    return index;
  }

  /**
   * View rows, ascending and distinct, and zoomed heights of the committed
   * `[dataRow, height]` pairs whose view rows fall below `rowCount`. `size`
   * bounds how many pairs there are. Pairs that arrive in view order, as a
   * loaded sheet's do without a view, skip the sort.
   */
  private committedHeights(
    entries: Iterable<readonly [dataRow: number, height: number | undefined]>,
    size: number,
    rowCount: number,
  ): { rows: Int32Array<ArrayBuffer>; heights: Float64Array<ArrayBuffer> } {
    const zoom = this.options.zoom();
    const defaultHeight = this.options.theme().rowHeight;
    const viewRows = new Int32Array(size);
    const heights = new Float64Array(size);
    let count = 0;
    let ascending = true;
    for (const [dataRow, height] of entries) {
      const viewRow = this.toViewRow(dataRow);
      if (viewRow === null || viewRow >= rowCount) continue;
      if (count > 0 && viewRow <= (viewRows[count - 1] ?? -1)) ascending = false;
      viewRows[count] = viewRow;
      heights[count] = height === undefined ? defaultHeight : height * zoom;
      count++;
    }
    if (ascending)
      return { rows: viewRows.subarray(0, count), heights: heights.subarray(0, count) };
    // A view row comes from one data row, so equal view rows carry equal heights.
    const order = Uint32Array.from({ length: count }, (_, position) => position).sort(
      (a, b) => (viewRows[a] ?? 0) - (viewRows[b] ?? 0),
    );
    const sortedRows = new Int32Array(count);
    const sortedHeights = new Float64Array(count);
    let unique = 0;
    for (const position of order) {
      const viewRow = viewRows[position] ?? 0;
      if (unique > 0 && sortedRows[unique - 1] === viewRow) continue;
      sortedRows[unique] = viewRow;
      sortedHeights[unique] = heights[position] ?? defaultHeight;
      unique++;
    }
    return { rows: sortedRows.subarray(0, unique), heights: sortedHeights.subarray(0, unique) };
  }

  /** Committed height of view row `row` at the current zoom. */
  private committedRowHeight(row: number): number {
    const height = this.options.sheet().rowHeights?.get(this.toDataRow(row));
    return height === undefined ? this.options.theme().rowHeight : height * this.options.zoom();
  }
}

function buildColumnIndex(
  sheet: Sheet,
  columnIndices: readonly number[],
  zoom: number,
): ColumnIndex {
  const widths = new Array<number>(columnIndices.length);
  for (let index = 0; index < columnIndices.length; index++) {
    const column = columnIndices[index]!;
    widths[index] = (sheet.columns[column]?.width ?? 0) * zoom;
  }
  return new ColumnIndex(columnIndices, widths);
}
