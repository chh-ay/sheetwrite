import type { CellScalar } from "./cell.js";
import type { TableColumnRef } from "./data-model.js";

/** The kind of a sheet: cells, or a dashboard of items. Absent means `"worksheet"`. */
export type SheetKind = "worksheet" | "dashboard";

/**
 * Position and size of a dashboard item in grid units. The grid has 12
 * columns; rows grow downward. Items do not overlap.
 */
export interface DashboardBox {
  /** First column, 0-based; `x + w` is at most 12. */
  x: number;
  /** First row, 0-based. */
  y: number;
  /** Width in columns, 1 to 12. */
  w: number;
  /** Height in rows, 1 to 64. */
  h: number;
}

/** A pivot of the dashboard sheet, shown in a box. */
export interface DashboardPivotItem {
  /** Stable ID, unique on the dashboard. */
  id: string;
  box: DashboardBox;
  kind: "pivot";
  /** `PivotDefinition.id` of a pivot on the same dashboard sheet. */
  pivot: string;
}

/**
 * A slicer: the distinct values of one table column, of which `selected`
 * pass. Every slicer of a dashboard filters every item that reads its table
 * through relationships.
 */
export interface DashboardSlicerItem {
  /** Stable ID, unique on the dashboard. */
  id: string;
  box: DashboardBox;
  kind: "slicer";
  /** The table column whose values the slicer lists. */
  field: TableColumnRef;
  /** Values that pass; absent means every value passes. */
  selected?: CellScalar[];
  /** Caption; absent shows the column name. */
  title?: string;
  /**
   * Values that no row has under the other slicers, as Excel's slicer
   * settings: `"dim"` (Visually indicate items with no data, the default),
   * `"hide"` (Hide items with no data) or `"show"` (neither).
   */
  itemsWithNoData?: "dim" | "hide" | "show";
}

/** One item of a dashboard. */
export type DashboardItem = DashboardPivotItem | DashboardSlicerItem;

/** The layout of a dashboard sheet. */
export interface Dashboard {
  /** Items in reading order: by `box.y`, then by `box.x`. */
  items: DashboardItem[];
}
