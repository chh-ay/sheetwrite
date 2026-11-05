// Data model contracts: relationships between workbook tables.
// No runtime values live here.

import type { WorkbookTableId } from "./table.js";

/** One column of a workbook table, by stable IDs that survive renames and moves. */
export interface TableColumnRef {
  /** Stable `WorkbookTable.id`. */
  table: WorkbookTableId;
  /** Stable `WorkbookTableColumn.id`. */
  column: string;
}

/**
 * One-to-many link between two workbook tables with a single key column on
 * each side. Each `from` row matches at most one `to` row.
 *
 * The names follow `x15:modelRelationship`: `from` is the foreign-key (many)
 * side and `to` is the primary-key (one) side. A relationship whose table or
 * column was removed stays saved, so undoing the removal restores it.
 */
export interface TableRelationship {
  /** Stable identity, unique in the workbook. */
  id: string;
  /** Many side: the foreign-key column. */
  from: TableColumnRef;
  /** One side: the key column, whose non-blank values must be unique. */
  to: TableColumnRef;
}

/** The workbook's data model. Every workbook table is a model table. */
export interface DataModel {
  /** Relationships; at most one joins a pair of tables, and they form no cycle. */
  relationships: TableRelationship[];
}
