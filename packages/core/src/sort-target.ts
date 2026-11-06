// Excel's guesses for a sort that the user starts without naming a range:
// the current region around a cell and whether its first row is a header.
// The quick sort commands and the Sort panel share them.

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

  let differs = false;
  for (let col = range.start.col; col <= range.end.col; col++) {
    const first = store.getCell({ sheet: range.sheet, row: range.start.row, col }).resolved;
    if (first !== null && typeof first !== "string") return false;
    if (first === null) continue;

    const second = store.getCell({ sheet: range.sheet, row: range.start.row + 1, col }).resolved;
    if (typeof second !== "string") differs = true;
  }
  return differs;
}
