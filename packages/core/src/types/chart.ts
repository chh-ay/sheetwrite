import type { Range, SheetId } from "./coordinates.js";

/** Chart families that the document model supports. */
export type ChartKind = "column" | "bar" | "line" | "area" | "pie" | "doughnut" | "scatter";

/** A deleted source remains explicit instead of silently reading another cell. */
export type ChartRange = Range | "#REF!";

/** Position in worksheet coordinates; dimensions and offsets use CSS pixels. */
export interface ChartAnchor {
  /** 0-based row of the cell that holds the top-left corner. */
  row: number;
  /** 0-based column of the cell that holds the top-left corner. */
  col: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Sources are read in row-major order. */
export interface ChartSeries {
  name?: string;
  nameRange?: ChartRange;
  values: ChartRange;
  categories?: ChartRange;
}

/** Persisted chart definition; IDs are unique within the owning sheet. */
export interface ChartDefinition {
  id: string;
  kind: ChartKind;
  /** Text above the chart; `undefined` shows no title. */
  title?: string;
  /**
   * Axis titles and the category label layout; `undefined` shows no axis
   * titles and one row of labels per category level.
   */
  axes?: {
    xTitle?: string;
    yTitle?: string;
    /**
     * `false` draws all category levels in one row, each label the texts of
     * its levels from the outside in, as Excel does when Format Axis ›
     * Multi-level Category Labels is cleared. Absent or `true` draws one row
     * of labels per level.
     */
    multiLevelLabels?: boolean;
  };
  /** Legend position; `undefined` lets the renderer use its default position. */
  legend?: "none" | "top" | "right" | "bottom" | "left";
  anchor: ChartAnchor;
  series: ChartSeries[];
  /**
   * The ID of a pivot on the same sheet whose result the chart shows, as an
   * Excel PivotChart does: the leaf row items are the categories, the outer
   * row items are the outer category levels, and each value field (for each
   * column item) is a series. Subtotals and grand totals are never points.
   * `series` is empty then.
   */
  pivot?: string;
  /**
   * The value fields of the pivot that the chart plots, by position in the
   * pivot's `values`, as the Field List picks a PivotChart's values in
   * Excel. Absent plots every value field. Only valid with `pivot`.
   */
  pivotValues?: number[];
}

/**
 * One outer level of multi-level category labels, as Excel reads a category
 * range of several columns (or rows) or the outer row fields of a PivotChart.
 */
export interface ChartCategoryLevel {
  /**
   * One entry per category. A label starts a group that runs to the next
   * label on this level or to the next group on an outer level; `null`
   * continues the group, as a blank cell does in Excel.
   */
  labels: Array<string | number | boolean | null>;
  /** Format code per label, as `categoryFormats`. */
  formats: Array<string | null>;
}

/** Resolved plain data; the renderer does not read cells. Arrays follow source cells in row-major order. */
export interface ChartSeriesView {
  name: string;
  /** Numeric cells; text, booleans, errors and empty cells are `null` (a gap). */
  values: Array<number | null>;
  /** The label of each category: the innermost level when the categories have levels. */
  categories: Array<string | number | boolean | null>;
  /** The outer levels of the categories, outermost first; empty when the categories have one level. */
  categoryLevels: ChartCategoryLevel[];
  /** Excel format code per value, as the grid paints it: cell style, then column style, then column format. */
  numberFormats: Array<string | null>;
  /** Format code per category; date categories are serial numbers and need it to show as dates. */
  categoryFormats: Array<string | null>;
  /** BCP 47 locale of the first value column, for separators; `null` keeps the default. */
  numberLocale: string | null;
  /** A source had more than `MAX_CHART_POINTS` cells and its tail was dropped. */
  truncated: boolean;
  /** A source was deleted; that source reads as empty. */
  referenceError: boolean;
}

/** One immutable-by-convention rendering input, refreshed on chart-change events. */
export interface ChartView {
  chart: ChartDefinition;
  series: ChartSeriesView[];
}

/** Stable identity of one chart: the sheet that owns it and its ID on that sheet. */
export interface ChartRef {
  readonly sheet: SheetId;
  readonly id: string;
}

/**
 * Charts whose `ChartView` may differ after one store commit. Emitted at most
 * once per commit, only when `charts` is not empty; each chart appears once.
 * A chart that no longer exists resolves to `null`.
 */
export interface ChartChangeEvent {
  /**
   * Store epoch after the commit. `undefined` when the store sent its change
   * event without an epoch, which a custom `Store` can do, or when the pivot
   * views that charts over pivots read were computed again without a commit.
   */
  readonly epoch: number | undefined;
  /** Charts to resolve again, in commit order of the edits that touched them. */
  readonly charts: readonly ChartRef[];
}

/** Listener for `subscribeChartChanges` and `ChartViewProvider.subscribe`. */
export type ChartChangeListener = (event: ChartChangeEvent) => void;

/** Cached chart views supplied by the optional charts package; renderers do not read cells. */
export interface ChartViewProvider {
  /** Resolve on first access; later accesses use the cached committed view. */
  get(chart: ChartRef): ChartView | null;
  /** Observe invalidation after cached views have been removed. */
  subscribe(listener: ChartChangeListener): () => void;
  /** Stop observing the store and release cached views. */
  dispose(): void;
}

/** Draws one chart into a box that core places and sizes. */
export interface MountedChart {
  /** Core calls this after it changes the box size in CSS pixels. */
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Draws charts into host elements that the grid's object layer owns. */
export interface ChartRenderer {
  /** `host` is an empty element that core owns, positions and clips. */
  mount(host: HTMLElement, chart: ChartRef, size: { width: number; height: number }): MountedChart;
  dispose(): void;
}
