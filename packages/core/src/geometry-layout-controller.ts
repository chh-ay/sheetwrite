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

function assert_geometry_dimensions(row_count: number, column_count: number): void {
  // Snapshot row ceilings govern admission, not growth of an already-admitted sheet.
  if (!Number.isSafeInteger(row_count) || row_count < 0) {
    throw new SnapshotResourceError(
      "maxRowsPerSheet",
      DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxRowsPerSheet,
      row_count,
    );
  }
  if (column_count > DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxColumnsPerSheet) {
    throw new SnapshotResourceError(
      "maxColumnsPerSheet",
      DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxColumnsPerSheet,
      column_count,
    );
  }
}

/** Owns row/column indexes, scaled scrolling, viewport windows, and frozen-pane mapping. */
export class GeometryLayoutController {
  private row_index: OffsetIndex;
  private column_index: ColumnIndex;
  private visible_column_indices: number[];
  private scroll_scale: ScaledScroll;
  private row_tops_scratch = new Float64Array(0);
  private row_heights_scratch = new Float64Array(0);
  private row_tops_view = this.row_tops_scratch;
  private row_heights_view = this.row_heights_scratch;
  private row_geometry_length = 0;
  private preview_column = -1;
  private preview_width = 0;
  /** View row whose height a resize drag previews, or -1. */
  private preview_row = -1;

  previewColumnWidth(column: number, width: number): void {
    this.preview_column = column;
    this.preview_width = width;
    this.column_index.setWidth(column, width * this.options.zoom());
  }

  columnWidth(column: number): number {
    return this.preview_column === column
      ? this.preview_width
      : (this.options.sheet().columns[column]?.width ?? 0);
  }

  previewRowHeight(row: number, height: number): void {
    if (this.preview_row !== -1 && this.preview_row !== row) {
      this.row_index.setHeight(this.preview_row, this.committed_row_height(this.preview_row));
    }
    this.preview_row = row;
    this.row_index.setHeight(row, height * this.options.zoom());
  }

  clearResizePreview(): void {
    if (this.preview_column !== -1) {
      const column = this.preview_column;
      this.preview_column = -1;
      this.column_index.setWidth(column, this.columnWidth(column) * this.options.zoom());
    }
    if (this.preview_row !== -1) {
      const row = this.preview_row;
      this.preview_row = -1;
      this.row_index.setHeight(row, this.committed_row_height(row));
    }
  }

  constructor(
    private readonly options: GeometryLayoutOptions,
    viewportHeight: number,
  ) {
    const sheet = options.sheet();
    assert_geometry_dimensions(sheet.rowCount, sheet.columns.length);
    this.visible_column_indices = visibleColumns(sheet);
    this.column_index = build_column_index(sheet, this.visible_column_indices, options.zoom());
    this.row_index = this.create_row_index(
      sheet,
      options.loadable?.viewRowCount(options.activeSheet()) ?? sheet.rowCount,
    );
    this.scroll_scale = new ScaledScroll(
      this.row_index.totalHeight + options.theme().headerHeight,
      viewportHeight,
      options.maxElementHeight(),
    );
  }

  get columnIndices(): number[] {
    return this.visible_column_indices;
  }

  get rowCount(): number {
    return this.row_index.count;
  }

  firstColumn(): number {
    return this.visible_column_indices[0] ?? 0;
  }

  lastColumn(): number {
    return this.visible_column_indices[this.visible_column_indices.length - 1] ?? 0;
  }

  columnLeft(column: number): number {
    return this.column_index.leftOf(column);
  }

  columnAtX(contentX: number): number {
    return this.column_index.columnAtX(contentX);
  }

  nextVisibleColumn(column: number, direction: 1 | -1): number {
    const position = this.column_index.positionOf(column);
    if (position === -1) return column;
    const next = position + direction;
    if (next < 0 || next >= this.visible_column_indices.length) return column;
    return this.visible_column_indices[next]!;
  }

  /** Visible column before `column`, or -1 when it is hidden or the first one. */
  previousVisibleColumn(column: number): number {
    const position = this.column_index.positionOf(column);
    if (position <= 0) return -1;
    return this.visible_column_indices[position - 1] ?? -1;
  }

  rowAtOffset(contentY: number): number {
    return this.row_index.rowAtOffset(contentY).row;
  }

  rowOffset(row: number): number {
    return this.row_index.offsetOf(row);
  }

  rowHeight(row: number): number {
    return this.row_index.heightOf(row);
  }

  toContent(scrollTop: number): number {
    return this.scroll_scale.toContent(scrollTop);
  }

  toScroll(contentTop: number): number {
    return this.scroll_scale.toScroll(contentTop);
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
    return Math.max(0, Math.min(frozen, Math.max(0, this.row_index.count - 1)));
  }

  frozenColumnCount(): number {
    const frozen = this.options.sheet().frozenCols ?? 0;
    return Math.max(0, Math.min(frozen, Math.max(0, this.visible_column_indices.length - 1)));
  }

  frozenHeight(): number {
    const frozen = this.frozenRowCount();
    return frozen > 0 ? this.row_index.offsetOf(frozen) : 0;
  }

  frozenWidth(): number {
    const frozen = this.frozenColumnCount();
    if (frozen <= 0) return 0;
    const first_body_column = this.visible_column_indices[frozen];
    return first_body_column === undefined
      ? this.column_index.totalWidth
      : this.column_index.leftOf(first_body_column);
  }

  firstBodyColumn(): number {
    const frozen = this.frozenColumnCount();
    return frozen > 0 ? (this.visible_column_indices[frozen] ?? Number.MAX_SAFE_INTEGER) : 0;
  }

  screenRowTop(row: number, contentTop: number): number {
    const scroll = row < this.frozenRowCount() ? 0 : contentTop;
    return this.options.theme().headerHeight + this.row_index.offsetOf(row) - scroll;
  }

  screenColumnLeft(column: number, scrollLeft: number): number {
    const scroll = column < this.firstBodyColumn() ? 0 : scrollLeft;
    return this.options.theme().rowHeaderWidth + this.column_index.leftOf(column) - scroll;
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
      w: this.column_index.leftOf(range.end.col + 1) - this.column_index.leftOf(range.start.col),
      h: this.row_index.offsetOf(range.end.row + 1) - this.row_index.offsetOf(range.start.row),
    };
  }

  pointerContentY(screenY: number, scrollTop: number): number {
    const body_y = Math.max(0, screenY - this.options.theme().headerHeight);
    const in_frozen_band = this.frozenRowCount() > 0 && body_y < this.frozenHeight();
    return in_frozen_band ? body_y : body_y + this.scroll_scale.toContent(scrollTop);
  }

  paintWindow(
    contentTop: number,
    scrollLeft: number,
    bodyHeight: number,
    cellViewportWidth: number,
    overscan: number,
  ): GeometryPaintWindow {
    const frozen_rows = this.frozenRowCount();
    const frozen_columns = this.frozenColumnCount();
    const frozen_height = this.frozenHeight();
    const frozen_width = this.frozenWidth();
    const raw_rows = computeWindow(
      this.row_index,
      contentTop + frozen_height,
      Math.max(0, bodyHeight - frozen_height),
      overscan,
    );
    const columns = this.columnWindow(scrollLeft, cellViewportWidth, overscan);
    return {
      rows:
        frozen_rows > 0
          ? {
              start: Math.max(raw_rows.start, frozen_rows),
              end: Math.max(raw_rows.end, frozen_rows),
            }
          : raw_rows,
      columns,
      frozenRows: frozen_rows,
      frozenColumns: frozen_columns,
      frozenHeight: frozen_height,
      frozenWidth: frozen_width,
    };
  }

  columnWindow(
    scrollLeft: number,
    cellViewportWidth: number,
    overscan: number,
  ): { start: number; end: number } {
    const frozen_columns = this.frozenColumnCount();
    const frozen_width = this.frozenWidth();
    const raw_columns = computeColumnWindow(
      this.column_index,
      scrollLeft + frozen_width,
      Math.max(0, cellViewportWidth - frozen_width),
      overscan,
    );
    return frozen_columns > 0
      ? {
          start: Math.max(raw_columns.start, frozen_columns),
          end: Math.max(raw_columns.end, frozen_columns),
        }
      : raw_columns;
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
      this.row_index,
      contentTop,
      Math.max(0, viewportHeight - this.options.theme().headerHeight),
      overscan,
    );
  }

  viewportAnchor(contentTop: number, scrollLeft: number): { row: number; col: number } {
    return {
      row: this.row_index.rowAtOffset(contentTop + this.frozenHeight()).row,
      col: this.column_index.columnAtX(scrollLeft + this.frozenWidth()),
    };
  }

  rowGeometry(window: { start: number; end: number }): {
    rowTops: Float64Array;
    rowHeights: Float64Array;
  } | null {
    const sheet = this.options.sheet();
    if (this.preview_row === -1 && (!sheet.rowHeights || sheet.rowHeights.size === 0)) return null;

    const count = Math.max(0, window.end - window.start);
    if (this.row_tops_scratch.length < count) {
      this.row_tops_scratch = new Float64Array(count);
      this.row_heights_scratch = new Float64Array(count);
    }
    if (this.row_geometry_length !== count) {
      this.row_tops_view = this.row_tops_scratch.subarray(0, count);
      this.row_heights_view = this.row_heights_scratch.subarray(0, count);
      this.row_geometry_length = count;
    }

    let top = this.row_index.offsetOf(window.start);
    for (let index = 0; index < count; index++) {
      const height = this.row_index.heightOf(window.start + index);
      this.row_tops_scratch[index] = top;
      this.row_heights_scratch[index] = height;
      top += height;
    }
    return { rowTops: this.row_tops_view, rowHeights: this.row_heights_view };
  }

  frozenRowGeometry(count: number): {
    rowTops: Float64Array;
    rowHeights: Float64Array;
  } | null {
    if (count <= 0 || (this.preview_row === -1 && !this.options.sheet().rowHeights?.size)) {
      return null;
    }
    assert_geometry_dimensions(count, 0);
    let row_tops: Float64Array;
    let row_heights: Float64Array;
    try {
      row_tops = new Float64Array(count);
      row_heights = new Float64Array(count);
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
      const height = this.row_index.heightOf(index);
      row_tops[index] = top;
      row_heights[index] = height;
      top += height;
    }
    return { rowTops: row_tops, rowHeights: row_heights };
  }

  rebuildRows(
    rowCount = this.options.loadable?.viewRowCount(this.options.activeSheet()) ??
      this.options.sheet().rowCount,
  ): void {
    const sheet = this.options.sheet();
    assert_geometry_dimensions(rowCount, sheet.columns.length);
    this.row_index = this.create_row_index(sheet, rowCount);
  }

  /** Apply the committed heights of `dataRows` to the row index without rebuilding it. */
  updateRowHeights(dataRows: readonly number[]): void {
    if (dataRows.length === 1) {
      const view_row = this.toViewRow(dataRows[0] ?? -1);
      if (view_row !== null)
        this.row_index.setHeight(view_row, this.committed_row_height(view_row));
      return;
    }
    const row_heights = this.options.sheet().rowHeights;
    const { rows, heights } = this.committed_heights(
      dataRows.map((data_row) => [data_row, row_heights?.get(data_row)] as const),
      dataRows.length,
      this.row_index.count,
    );
    this.row_index.setHeights(rows, heights);
  }

  rebuildColumns(): void {
    const sheet = this.options.sheet();
    assert_geometry_dimensions(sheet.rowCount, sheet.columns.length);
    this.visible_column_indices = visibleColumns(sheet);
    const widths = new Float64Array(this.visible_column_indices.length);
    for (let i = 0; i < this.visible_column_indices.length; i++) {
      const column = this.visible_column_indices[i];
      if (column !== undefined) widths[i] = this.columnWidth(column) * this.options.zoom();
    }
    this.column_index = new ColumnIndex(this.visible_column_indices, widths);
  }

  /** Content offset of the first row that starts at or below `contentY`. */
  rowStartFrom(contentY: number): number {
    const row = this.row_index.rowAtOffset(contentY).row;
    const top = this.row_index.offsetOf(row);
    return top >= contentY ? top : this.row_index.offsetOf(row + 1);
  }

  /**
   * Content offset of the first visible column that starts at or right of
   * `contentX`; the last visible column's left when none does.
   */
  columnStartFrom(contentX: number): number {
    const column = this.column_index.columnAtX(contentX);
    const left = this.column_index.leftOf(column);
    if (left >= contentX) return left;
    const next = this.nextVisibleColumn(column, 1);
    return next === column ? left : this.column_index.leftOf(next);
  }

  /**
   * The scroller's content size, for a viewport `viewportHeight` tall whose
   * scroller shows `clientWidth` × `clientHeight`. A scroll into view stops
   * on a column and row boundary, so past the last column and row the extent
   * keeps the room that takes: less than one column and one row.
   */
  layoutSize(
    viewportHeight: number,
    clientWidth: number,
    clientHeight: number,
  ): { width: number; height: number } {
    const theme = this.options.theme();
    const total_width = this.column_index.totalWidth;
    const total_height = this.row_index.totalHeight;
    const frozen_width = this.frozenWidth();
    const frozen_height = this.frozenHeight();
    // Where the scrolling body starts when the last column or row ends at the
    // scroller's edge, and the boundary at or past it a scroll into view uses.
    const last_left = total_width - Math.max(0, clientWidth - theme.rowHeaderWidth - frozen_width);
    const last_top = total_height - Math.max(0, clientHeight - theme.headerHeight - frozen_height);
    const width_room =
      last_left > frozen_width ? Math.max(0, this.columnStartFrom(last_left) - last_left) : 0;
    const height_room =
      last_top > frozen_height ? Math.max(0, this.rowStartFrom(last_top) - last_top) : 0;
    this.scroll_scale.update(
      total_height + theme.headerHeight + height_room,
      viewportHeight,
      this.options.maxElementHeight(),
    );
    return {
      width: total_width + theme.rowHeaderWidth + width_room,
      height: this.scroll_scale.sizerHeight,
    };
  }

  private create_row_index(sheet: Sheet, row_count: number): OffsetIndex {
    const index = new OffsetIndex(row_count, this.options.theme().rowHeight);
    const row_heights = sheet.rowHeights;
    if (row_heights && row_heights.size > 0) {
      const { rows, heights } = this.committed_heights(row_heights, row_heights.size, row_count);
      index.load(rows, heights);
    }
    return index;
  }

  /**
   * View rows, ascending and distinct, and zoomed heights of the committed
   * `[dataRow, height]` pairs whose view rows fall below `row_count`. `size`
   * bounds how many pairs there are. Pairs that arrive in view order, as a
   * loaded sheet's do without a view, skip the sort.
   */
  private committed_heights(
    entries: Iterable<readonly [dataRow: number, height: number | undefined]>,
    size: number,
    row_count: number,
  ): { rows: Int32Array<ArrayBuffer>; heights: Float64Array<ArrayBuffer> } {
    const zoom = this.options.zoom();
    const default_height = this.options.theme().rowHeight;
    const view_rows = new Int32Array(size);
    const heights = new Float64Array(size);
    let count = 0;
    let ascending = true;
    for (const [data_row, height] of entries) {
      const view_row = this.toViewRow(data_row);
      if (view_row === null || view_row >= row_count) continue;
      if (count > 0 && view_row <= (view_rows[count - 1] ?? -1)) ascending = false;
      view_rows[count] = view_row;
      heights[count] = height === undefined ? default_height : height * zoom;
      count++;
    }
    if (ascending)
      return { rows: view_rows.subarray(0, count), heights: heights.subarray(0, count) };
    // A view row comes from one data row, so equal view rows carry equal heights.
    const order = Uint32Array.from({ length: count }, (_, position) => position).sort(
      (a, b) => (view_rows[a] ?? 0) - (view_rows[b] ?? 0),
    );
    const sorted_rows = new Int32Array(count);
    const sorted_heights = new Float64Array(count);
    let unique = 0;
    for (const position of order) {
      const view_row = view_rows[position] ?? 0;
      if (unique > 0 && sorted_rows[unique - 1] === view_row) continue;
      sorted_rows[unique] = view_row;
      sorted_heights[unique] = heights[position] ?? default_height;
      unique++;
    }
    return { rows: sorted_rows.subarray(0, unique), heights: sorted_heights.subarray(0, unique) };
  }

  /** Committed height of view row `row` at the current zoom. */
  private committed_row_height(row: number): number {
    const height = this.options.sheet().rowHeights?.get(this.toDataRow(row));
    return height === undefined ? this.options.theme().rowHeight : height * this.options.zoom();
  }
}

function build_column_index(
  sheet: Sheet,
  column_indices: readonly number[],
  zoom: number,
): ColumnIndex {
  const widths = new Array<number>(column_indices.length);
  for (let index = 0; index < column_indices.length; index++) {
    const column = column_indices[index]!;
    widths[index] = (sheet.columns[column]?.width ?? 0) * zoom;
  }
  return new ColumnIndex(column_indices, widths);
}
