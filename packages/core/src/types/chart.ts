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
  /** Axis titles; `undefined` shows no axis titles. */
  axes?: { xTitle?: string; yTitle?: string };
  /** Legend position; `undefined` lets the renderer use its default position. */
  legend?: "none" | "top" | "right" | "bottom" | "left";
  anchor: ChartAnchor;
  series: ChartSeries[];
}

/** Resolved plain data; the renderer does not read cells. Arrays follow source cells in row-major order. */
export interface ChartSeriesView {
  name: string;
  /** Numeric cells; text, booleans, errors and empty cells are `null` (a gap). */
  values: Array<number | null>;
  categories: Array<string | number | boolean | null>;
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
   * event without an epoch, which a custom `Store` can do.
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
