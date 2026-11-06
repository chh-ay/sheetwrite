// Excel's guesses for a sort that the user starts without naming a range:
// the current region around a cell and whether its first row is a header.
// The quick sort commands and the Sort panel share them.

import { readRowValues } from "./data-window-reads.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellAddress, Range } from "./types/coordinates.js";
import type { Store } from "./types/store.js";

/** Excel's current region around `addr`, or `null` for a store without an engine. */
export function currentRegion(store: Store, addr: CellAddress): Range | null {
  return storeEngine(store)?.currentRegion(addr) ?? null;
}

/**
 * Excel guesses whether a range has a header row. Here the first row is a
 * header when every filled cell in it is text and the second row holds a
 * number, logical value or blank in a column where the first row has text.
 */
export function looksLikeHeader(store: Store, range: Range): boolean {
  if (range.end.row <= range.start.row) return false;

  const columns = { sheet: range.sheet, startCol: range.start.col, endCol: range.end.col };
  const firstRow = readRowValues(store, { ...columns, row: range.start.row });
  if (firstRow.some((value) => value !== null && typeof value !== "string")) return false;

  const secondRow = readRowValues(store, { ...columns, row: range.start.row + 1 });
  return firstRow.some((value, offset) => value !== null && typeof secondRow[offset] !== "string");
}
