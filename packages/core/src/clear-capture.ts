import type { DocumentOp } from "./types/document.js";

/**
 * Applied `clearRange` operations whose changed cells the store reported one by
 * one in the change event. The row bridge projects only those cells for a
 * clear in this set. Any other clear may have changed every cell of its range.
 * Weak, so an operation is released with its transaction.
 */
export const capturedClearOperations = new WeakSet<DocumentOp>();
