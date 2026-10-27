// Pivot-table definition, field-list and result-view contracts.
// No runtime values live here.

import type { CellScalar } from "./cell.js";
import type { CellAddress, Range } from "./coordinates.js";
import type { WorkbookTableId } from "./table.js";

/** Aggregation applied to one value field. Semantics match PIVOTBY's aggregations. */
export type PivotAggregation =
  | "SUM"
  | "COUNT"
  | "AVERAGE"
  | "MIN"
  | "MAX"
  | "COUNTA"
  | "DISTINCTCOUNT";

/**
 * Data a pivot summarizes.
 *
 * - A range source includes its header row: the first range row names the
 *   fields, and field `i` is the column `range.start.col + i`.
 * - A table source names a workbook table by its stable `WorkbookTable.id`.
 *   Field `i` is table column `i`; header and totals rows are excluded.
 *
 * When the source disappears (its sheet, its table, or every source row or
 * column is deleted), core sets `invalid: true` and keeps the reference
 * unchanged. The engine then shows `#REF!` at the anchor.
 */
export type PivotSource =
  | { range: Range; invalid?: true }
  | { table: WorkbookTableId; invalid?: true };

/** One aggregated value field. `name` replaces the default caption. */
export interface PivotValueField {
  field: number;
  aggregation: PivotAggregation;
  name?: string;
}

/** Keep-list filter: only source rows whose `field` value is in `values` contribute. */
export interface PivotFilter {
  field: number;
  values: CellScalar[];
}

/** Sort of one axis field by its labels. Fields without a sort key sort ascending. */
export interface PivotSort {
  axis: "rows" | "columns";
  field: number;
  descending: boolean;
}

/** Layout of row labels: one indented label column, or one label column per row field. */
export type PivotLayout = "compact" | "tabular";

/**
 * Serializable pivot-table definition, owned by the sheet that holds its
 * anchor. The output starts at `anchor` and spills right and down.
 */
export interface PivotDefinition {
  /** Stable identity, unique in the workbook. */
  id: string;
  /** User-facing caption. */
  name: string;
  source: PivotSource;
  /**
   * Top-left output cell on the owning sheet. Deleting the anchor's row or
   * column keeps the pivot and moves the anchor to the first surviving cell
   * at the deletion position.
   */
  anchor: { row: number; col: number };
  /** Source field indices that group the output rows, outermost first. */
  rows: number[];
  /** Source field indices that group the output columns, outermost first. */
  columns: number[];
  values: PivotValueField[];
  filters?: PivotFilter[];
  sort?: PivotSort[];
  /**
   * Grand-total row at the bottom (PIVOTBY `row_total_depth`; OOXML
   * `colGrandTotals`). Default `true`.
   */
  rowTotals?: boolean;
  /**
   * Grand-total column at the right (PIVOTBY `col_total_depth`; OOXML
   * `rowGrandTotals`). Default `true`.
   */
  columnTotals?: boolean;
  /** Subtotal rows and columns for each outer group of a multi-field axis. Default `true`. */
  subtotals?: boolean;
  /** Default `"compact"`. */
  layout?: PivotLayout;
  /**
   * Output cells a file saved for this pivot, row-major from `anchor`: for
   * example the cells Excel rendered. At most 1,000,000 cells, and
   * `cells.length` is `rows * cols`.
   *
   * - The default engine computes no pivots, so it shows these values from
   *   the anchor. Formulas read them, and local writes into them are refused.
   *   A source cell, formula or spill in the rectangle shows `#SPILL!` at
   *   the anchor until it is cleared.
   * - The full engine ignores these values and recalculates the output.
   * - `setPivot` on the Grid or store removes them, because the saved
   *   values no longer match a changed definition. A row or column edit
   *   keeps them only when the output rectangle moves without a change;
   *   an edit inside the rectangle removes them.
   * - Snapshots, sync and XLSX export keep them on every engine.
   */
  savedOutput?: { rows: number; cols: number; cells: CellScalar[] };
}

/** Inferred type of one source field from its data rows. */
export type PivotFieldType = "number" | "text" | "boolean" | "mixed" | "blank";

/** One source field offered by the field list. */
export interface PivotSourceField {
  index: number;
  header: string;
  type: PivotFieldType;
}

/**
 * Plain-JSON view of one pivot's output, for the field list and other UI.
 *
 * - `ok`: the output occupies `rows` x `cols` cells from `anchor`; `cells`
 *   holds their values row-major. The first `headerRows` rows hold column
 *   labels and the first `labelCols` columns hold row labels.
 * - `error`: the anchor shows `error` (for example `#SPILL!` or `#REF!`)
 *   and `cells` is empty.
 * - `unavailable`: the loaded engine computes no pivots (the default
 *   engine) and the pivot has no saved output. The definition is still
 *   kept, saved and synchronized.
 * - `saved`: the default engine shows `savedOutput`, which a file saved;
 *   `cells` holds those values and `headerRows`/`labelCols` are 0.
 */
export interface PivotResultView {
  status: "ok" | "error" | "unavailable" | "saved";
  error?: string;
  anchor: CellAddress;
  rows: number;
  cols: number;
  headerRows: number;
  labelCols: number;
  cells: CellScalar[];
}
