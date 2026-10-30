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
function newAccount(id: string): HostEntity {
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
function deltaCells(delta: RowBridgeDelta<string>): readonly RowBridgeCell<string>[] {
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

function isTextField(columnKey: string): columnKey is "name" | "region" | "owner" | "stage" {
  return (
    columnKey === "name" || columnKey === "region" || columnKey === "owner" || columnKey === "stage"
  );
}

/**
 * Return the record with one changed cell applied, or `null` when the host keeps
 * its stored value. A cleared cell is a `null` literal. A cell without a next
 * value (a format-only clear) or with a formula gives the host no value, and the
 * ARR total holds only numbers, so these values do not change the record.
 */
function withCell(
  row: HostEntity,
  columnKey: string,
  value: CellValue | undefined,
): HostEntity | null {
  if (value?.kind !== "literal") return null;

  const scalar = value.value;
  if (columnKey === "amount") {
    if (scalar === null) return { ...row, amount: 0 };
    return typeof scalar === "number" ? { ...row, amount: scalar } : null;
  }
  if (isTextField(columnKey)) {
    return { ...row, [columnKey]: scalar === null ? "" : String(scalar) };
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
        for (const rowId of delta.inserted) if (rowId !== null) next.set(rowId, newAccount(rowId));
      } else if (delta.action === "delete") {
        for (const rowId of delta.removed) if (rowId !== null) next.delete(rowId);
      }
      continue;
    }

    for (const cell of deltaCells(delta)) {
      const row = cell.rowId === null ? undefined : next.get(cell.rowId);
      if (!row || cell.columnKey === null) continue;

      const updated = withCell(row, cell.columnKey, cell.next);
      if (updated) next.set(row.id, updated);
    }
  }

  return next;
}
