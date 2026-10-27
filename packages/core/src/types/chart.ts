import type { Range } from "./coordinates.js";

/** Chart families supported by the 0.6 document model. */
export type ChartKind = "column" | "bar" | "line" | "area" | "pie" | "doughnut" | "scatter";

/** A deleted source remains explicit instead of silently reading another cell. */
export type ChartRange = Range | "#REF!";

/** Position in worksheet coordinates; dimensions and offsets use CSS pixels. */
export interface ChartAnchor {
  row: number;
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
  title?: string;
  axes?: { xTitle?: string; yTitle?: string };
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
