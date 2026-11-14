import { isAtomicBatch, markAtomicBatch } from "./atomic-batch.js";
import { SheetwriteError } from "./errors.js";
import { isOwnedArray, markOwnedArray } from "./json-bytes.js";
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

/** A field read through its descriptor, so no getter runs. */
function ownDataField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * `operation` with the `values` and `styleIds` of its block replaced by
 * private copies, or `operation` itself when it is not a `setBlock`, its
 * arrays are already private copies, or any field it is made of is not plain
 * data (validation then judges the original exactly as before).
 */
function withOwnedBlockArrays(operation: DocumentOp): DocumentOp {
  if (ownDataField(operation, "op") !== "setBlock") return operation;
  const sourceBlock = ownDataField(operation, "block");
  const sourceStyleIds = ownDataField(sourceBlock, "styleIds");
  if (
    isOwnedArray(ownDataField(sourceBlock, "values")) &&
    (sourceStyleIds === undefined || isOwnedArray(sourceStyleIds))
  ) {
    return operation;
  }

  const copy = copyDataRecord(operation);
  const block = copyDataRecord(copy?.block);
  if (!copy || !block) return operation;
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
}

/**
 * The operations with the `values` and `styleIds` arrays of each `setBlock`
 * replaced by private copies read once by index. Every entry point that
 * accepts operations (grid, remote, store) passes them through here first,
 * so validation, measurement, the store, history, sync and the change event
 * all use the copies: an entry cannot change between the check and the
 * write, and the caller's arrays are never read again. Only those two arrays
 * are read this way; every other operation and field keeps the full
 * descriptor validation. Undefined when nothing was copied, so the caller
 * keeps its operations and any measurement recorded for them.
 */
export function readBlockArraysOnce(operations: readonly DocumentOp[]): DocumentOp[] | undefined {
  const owned = operations.map(withOwnedBlockArrays);
  if (owned.every((operation, index) => operation === operations[index])) return undefined;
  return isAtomicBatch(operations) ? markAtomicBatch(owned) : owned;
}
