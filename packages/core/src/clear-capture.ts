import type { CellAddress } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";

/**
 * Applied `clearRange` operations whose changed cells the store reported one by
 * one, mapped to those cells in the order of their change entries. The row
 * bridge projects exactly these cells for the clear, so a later write in the
 * same transaction keeps its own change. Any other clear may have changed every
 * cell of its range. Weak, so an entry is released with its transaction.
 */
export const capturedClearCells = new WeakMap<DocumentOp, readonly CellAddress[]>();
