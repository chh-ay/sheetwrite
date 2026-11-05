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

/**
 * Whether the keys of a relationship resolve, checked from the current cell
 * values. Rows are data-row offsets in their table, header row excluded.
 *
 * - `ok`: every non-blank one-side key is unique; `unmatched` counts the
 *   non-blank many-side keys that match no one-side row.
 * - `missingTable`, `missingColumn`: a table or column was removed.
 * - `typeMismatch`: the key at `row` on `side` is a boolean, an error on the
 *   one side, or not the same kind (number or text) as the other keys.
 * - `duplicateKey`: two one-side rows hold equal keys (text without case).
 * - `unavailable`: the loaded engine does not check keys (the default
 *   engine), or no relationship has this ID.
 */
export type RelationshipStatus =
  | { status: "ok"; unmatched: number }
  | { status: "missingTable" }
  | { status: "missingColumn" }
  | { status: "typeMismatch"; side: "from" | "to"; row: number }
  | { status: "duplicateKey"; rows: [number, number] }
  | { status: "unavailable" };
