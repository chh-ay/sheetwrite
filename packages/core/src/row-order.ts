/**
 * The row permutation of a `permuteRows` operation. The operation holds it as
 * base64 of little-endian `u32` values so that it stays JSON-safe; this module
 * converts it to and from a `Uint32Array` once per operation.
 */
import type { DocumentOp } from "./types/document.js";

/** An operation that moves the rows of a range by a permutation. */
export type PermuteRowsOperation = Extract<DocumentOp, { op: "permuteRows" }>;

/** The only encoding of a row order. */
export const ROW_ORDER_ENCODING = "u32le-base64-v1";

const BYTES_PER_ROW = 4;
/** Characters passed to `String.fromCharCode` at once, below engine argument limits. */
const CHARACTER_CHUNK = 8192;

const decodedOrders = new WeakMap<PermuteRowsOperation, Uint32Array>();

/** Encode a row order for a `permuteRows` operation. */
export function encodeRowOrder(order: Uint32Array): string {
  const bytes = new Uint8Array(order.length * BYTES_PER_ROW);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < order.length; index++) {
    view.setUint32(index * BYTES_PER_ROW, order[index] ?? 0, true);
  }

  let binary = "";
  for (let at = 0; at < bytes.length; at += CHARACTER_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHARACTER_CHUNK));
  }
  return btoa(binary);
}

/**
 * The row order of an operation, or `null` when its text is not base64 of
 * one `u32` per row of the range. The result is shared; callers must not
 * change it.
 */
export function decodeRowOrder(operation: PermuteRowsOperation): Uint32Array | null {
  const cached = decodedOrders.get(operation);
  if (cached) return cached;

  const rows = Math.abs(operation.range.end.row - operation.range.start.row) + 1;
  if (operation.encoding !== ROW_ORDER_ENCODING || !Number.isSafeInteger(rows)) return null;

  let binary: string;
  try {
    binary = atob(operation.order);
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
  if (binary.length !== rows * BYTES_PER_ROW) return null;

  const order = new Uint32Array(rows);
  for (let index = 0; index < rows; index++) {
    const at = index * BYTES_PER_ROW;
    order[index] =
      (binary.charCodeAt(at) |
        (binary.charCodeAt(at + 1) << 8) |
        (binary.charCodeAt(at + 2) << 16) |
        (binary.charCodeAt(at + 3) << 24)) >>>
      0;
  }

  decodedOrders.set(operation, order);
  return order;
}

/** Rows marked in one word of the seen-row bitset. */
const BITS_PER_MARK_WORD = 32;

/** Whether `order` holds each of `0..order.length` exactly once. */
export function isRowPermutation(order: Uint32Array): boolean {
  const seen = new Uint32Array(Math.ceil(order.length / BITS_PER_MARK_WORD));
  for (const row of order) {
    if (row >= order.length) return false;
    const word = Math.floor(row / BITS_PER_MARK_WORD);
    const bit = 1 << (row % BITS_PER_MARK_WORD);
    const marks = seen[word] ?? 0;
    if ((marks & bit) !== 0) return false;
    seen[word] = marks | bit;
  }
  return true;
}

/** The order that moves every row back: `inverse[order[i]] = i`. */
export function invertRowOrder(order: Uint32Array): Uint32Array {
  const inverse = new Uint32Array(order.length);
  for (const [target, source] of order.entries()) {
    inverse[source] = target;
  }
  return inverse;
}
