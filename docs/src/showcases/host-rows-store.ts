import type {
  CellValue,
  RowBridgeCell,
  RowBridgeDelta,
  RowBridgeProjection,
} from "@sheetwrite/core";

/** One account record that the host app owns. */
export interface HostEntity extends Record<string, string | number | boolean | null> {
  id: string;
  name: string;
  amount: number;
  region: string;
  owner: string;
  stage: string;
}

/** The record the host creates for a row inserted in the Grid. */
function new_account(id: string): HostEntity {
  return {
    id,
    name: "New account",
    amount: 0,
    region: "North",
    owner: "Ada Chen",
    stage: "Qualification",
  };
}

/** The cells of a delta that carry row values, whatever edit produced them. */
function delta_cells(delta: RowBridgeDelta<string>): readonly RowBridgeCell<string>[] {
  switch (delta.kind) {
    case "cell":
      return [delta.cell];
    case "range":
    case "clear":
    case "paste":
    case "fill":
      return delta.cells;
    default:
      return [];
  }
}

function is_text_field(column_key: string): column_key is "name" | "region" | "owner" | "stage" {
  return (
    column_key === "name" ||
    column_key === "region" ||
    column_key === "owner" ||
    column_key === "stage"
  );
}

/**
 * Return the record with one changed cell applied, or `null` when the host keeps
 * its stored value. A cleared cell is a `null` literal. A cell without a next
 * value (a format-only clear) or with a formula gives the host no value, and the
 * ARR total holds only numbers, so these values do not change the record.
 */
function with_cell(
  row: HostEntity,
  column_key: string,
  value: CellValue | undefined,
): HostEntity | null {
  if (value?.kind !== "literal") return null;

  const scalar = value.value;
  if (column_key === "amount") {
    if (scalar === null) return { ...row, amount: 0 };
    return typeof scalar === "number" ? { ...row, amount: scalar } : null;
  }
  if (is_text_field(column_key)) {
    return { ...row, [column_key]: scalar === null ? "" : String(scalar) };
  }
  return null;
}

/**
 * Apply a row-bridge projection to the host account store. Every delta that
 * carries cells updates the matching records, so typed edits, pastes, fills,
 * range writes and clears all reach the store.
 */
export function applyHostProjection(
  current: ReadonlyMap<string, HostEntity>,
  projection: RowBridgeProjection<string>,
): Map<string, HostEntity> {
  const next = new Map(current);

  for (const delta of projection.deltas) {
    if (delta.kind === "row-structure") {
      if (delta.action === "insert") {
        for (const row_id of delta.inserted)
          if (row_id !== null) next.set(row_id, new_account(row_id));
      } else if (delta.action === "delete") {
        for (const row_id of delta.removed) if (row_id !== null) next.delete(row_id);
      }
      continue;
    }

    for (const cell of delta_cells(delta)) {
      const row = cell.rowId === null ? undefined : next.get(cell.rowId);
      if (!row || cell.columnKey === null) continue;

      const updated = with_cell(row, cell.columnKey, cell.next);
      if (updated) next.set(row.id, updated);
    }
  }

  return next;
}
