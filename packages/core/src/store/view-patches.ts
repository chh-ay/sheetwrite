/**
 * Patch builders for the view operations that both the store and the grid
 * expose, so the two apply the same rules: sort keys and filters are copied,
 * and a request that changes nothing builds no patch.
 */
import { cloneJsonValue } from "../plain-data.js";
import type { SheetId } from "../types/coordinates.js";
import type { ColumnFilter, DocumentOp, Sheet, SortKey } from "../types/document.js";

/** The patch that sets the view sort of `sheet`; empty `keys` clear it. */
export function viewSortPatch(sheet: SheetId, keys: readonly SortKey[]): DocumentOp {
  return {
    op: "setSheetMeta",
    sheet,
    patch: { sortKeys: keys.map((key) => ({ ...key })) },
  };
}

/**
 * The patch that sets or, for a null `filter`, removes the filter of `col`;
 * null when there is no filter to remove.
 */
export function columnFilterPatch(
  meta: Sheet,
  col: number,
  filter: ColumnFilter | null,
): DocumentOp | null {
  const filters = new Map(meta.filters ?? []);
  if (filter === null) {
    if (!filters.delete(col)) return null;
  } else {
    filters.set(col, cloneJsonValue(filter));
  }

  return { op: "setSheetMeta", sheet: meta.id, patch: { filters: [...filters] } };
}

/**
 * Patches that hide or show each listed row once. Rows that are not whole
 * numbers inside the sheet are skipped; heights are kept.
 */
export function rowVisibilityPatches(
  meta: Sheet,
  rows: readonly number[],
  hidden: boolean,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  for (const row of new Set(rows)) {
    if (!Number.isInteger(row) || row < 0 || row >= meta.rowCount) continue;

    patches.push({
      op: "setRowMeta",
      sheet: meta.id,
      row,
      meta: { height: meta.rowHeights?.get(row), hidden },
    });
  }
  return patches;
}

/** The patch that clears the view sort and filters of `meta`; null when it has neither. */
export function clearViewPatch(meta: Sheet): DocumentOp | null {
  if ((meta.sortKeys?.length ?? 0) === 0 && (meta.filters?.length ?? 0) === 0) return null;

  return { op: "setSheetMeta", sheet: meta.id, patch: { sortKeys: [], filters: [] } };
}
