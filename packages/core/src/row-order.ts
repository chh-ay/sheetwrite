/**
 * The row order of a `permuteRows` operation: base64 of one little-endian
 * `u32` per row of the range, so that the operation stays JSON-safe. The
 * engine builds, checks, decodes and inverts it; core only carries the text.
 */
import type { DocumentOp } from "./types/document.js";

/** An operation that moves the rows of a range by a permutation. */
export type PermuteRowsOperation = Extract<DocumentOp, { op: "permuteRows" }>;

/** The only encoding of a row order. */
export const ROW_ORDER_ENCODING = "u32le-base64-v1";
