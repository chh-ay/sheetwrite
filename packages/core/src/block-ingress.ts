import { SheetwriteError } from "./errors.js";
import { markOwnedArray } from "./json-bytes.js";
import type { DocumentOp } from "./types/document.js";

/**
 * Copy of a plain object's own enumerable data fields, read through
 * descriptors so no getter runs. Undefined when `value` is anything else; the
 * caller then keeps the original and validation reports the exact issue.
 */
function copyDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  if (Object.getOwnPropertySymbols(value).length > 0) return undefined;
  const copy: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined;
    copy[key] = descriptor.value;
  }
  return copy;
}

/**
 * Entries of a plain array, each read once by index into a new dense array.
 * A getter on an entry runs here, once. Undefined when `value` is not a plain
 * array or an entry reads as `undefined` (a hole); validation then reports it
 * on the original.
 */
function readEntriesOnce(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  const length = value.length;
  const entries: unknown[] = [];
  let index = 0;
  try {
    for (; index < length; index++) {
      const entry: unknown = value[index];
      if (entry === undefined) return undefined;
      entries.push(entry);
    }
  } catch (error) {
    throw new SheetwriteError(
      "invalid-argument",
      "transaction",
      `setBlock array entry ${index} could not be read`,
      { cause: error, context: { index } },
    );
  }
  markOwnedArray(entries);
  return entries;
}

/**
 * The caller's operations, with the `values` and `styleIds` arrays of each
 * `setBlock` replaced by private copies read once. Validation, measurement,
 * the store, history, sync and the change event all use the copies, so an
 * entry cannot change between the check and the write, and the caller's
 * arrays are never read again. Any other operation, and a `setBlock` whose
 * fields are not plain data, is returned as it is for validation to judge.
 */
export function readBlockArraysOnce(operations: readonly DocumentOp[]): DocumentOp[] {
  return operations.map((operation) => {
    const copy = copyDataRecord(operation);
    if (copy?.op !== "setBlock") return operation;
    const block = copyDataRecord(copy.block);
    if (!block) return operation;
    const values = readEntriesOnce(block.values);
    if (!values) return operation;
    block.values = values;
    if (block.styleIds !== undefined) {
      const styleIds = readEntriesOnce(block.styleIds);
      if (!styleIds) return operation;
      block.styleIds = styleIds;
    }
    copy.block = block;
    // The copy has exactly the caller's fields; validation judges it as it would the original.
    const copied = copy as unknown as DocumentOp;
    return copied;
  });
}
