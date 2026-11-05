/**
 * The row order of a `permuteRows` operation: base64 of one little-endian
 * `u32` per row of the range, so that the operation stays JSON-safe. Text is
 * the sync and history format only; the engine checks, inverts and applies
 * the decoded values.
 */
import type { DocumentOp } from "./types/document.js";

/** An operation that moves the rows of a range by a permutation. */
export type PermuteRowsOperation = Extract<DocumentOp, { op: "permuteRows" }>;

/** The only encoding of a row order. */
export const ROW_ORDER_ENCODING = "u32le-base64-v1";

const BYTES_PER_ROW = 4;
/** Characters passed to `String.fromCharCode` at once, below engine argument limits. */
const CHARACTER_CHUNK = 8192;

// Typed arrays use the platform byte order, which is little-endian on every
// platform that runs WebAssembly, so the bytes of a `Uint32Array` are the wire bytes.

/** Base64 text of a row order. */
export function encodeRowOrder(order: Uint32Array): string {
  const bytes = new Uint8Array(order.buffer, order.byteOffset, order.byteLength);
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHARACTER_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHARACTER_CHUNK));
  }
  return btoa(binary);
}

/**
 * The row order of an operation, or `null` when its text is not base64 of one
 * value per row of the range. The engine checks that it is a permutation.
 */
export function decodeRowOrder(operation: PermuteRowsOperation): Uint32Array | null {
  const rows = Math.abs(operation.range.end.row - operation.range.start.row) + 1;
  let binary: string;
  try {
    binary = atob(operation.order);
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
  if (operation.encoding !== ROW_ORDER_ENCODING || binary.length !== rows * BYTES_PER_ROW) {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Uint32Array(bytes.buffer);
}
