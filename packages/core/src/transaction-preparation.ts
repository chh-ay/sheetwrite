import { boundedJsonByteLength, jsonNumberLength } from "./json-bytes.js";
import { decodeRestoreBlockPayload } from "./restore-block-codec.js";
import { normalizedRange } from "./store/ranges.js";
import type { Range } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";

type Restore = Extract<DocumentOp, { op: "restoreBlock" }>;

export interface PreparedRestore {
  stamp: readonly unknown[];
  block: PackedCellBlock;
  range: Range;
  errors?: readonly unknown[];
  requiredSheets: readonly string[];
  containsFormula: boolean;
  containsReference: boolean;
}

// Sidecars are visible only while their owning synchronous application is live.
// Nested applications restore the previous owner rather than sharing its lifetime.
const owners = new WeakMap<Restore, TransactionPreparation>();

interface HistoryBlock {
  readonly blockBytes: number;
  readonly operationBytes: number;
  readonly restore: (range: Range) => boolean;
}

const history_blocks = new WeakMap<PackedCellBlock, HistoryBlock>();

/** Available only during the synchronous history application that owns the block. */
export function preparedHistoryBlock(block: PackedCellBlock): HistoryBlock | undefined {
  return history_blocks.get(block);
}

/**
 * Exact JSON bytes of an engine-built scalar array, or undefined when a value
 * is not JSON-safe; the caller then leaves the block to the full validating walk.
 */
function scalar_array_bytes(
  values: readonly (string | number | boolean | null)[],
): number | undefined {
  let bytes = 2 + Math.max(0, values.length - 1);
  // Restored ranges repeat text in runs, so one cached measurement covers each run.
  let previous_text: string | undefined;
  let previous_text_bytes = 0;

  for (const value of values) {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return undefined;
      bytes += jsonNumberLength(value);
    } else if (typeof value === "string") {
      if (value !== previous_text) {
        previous_text = value;
        previous_text_bytes = boundedJsonByteLength(value, Number.MAX_SAFE_INTEGER);
      }
      bytes += previous_text_bytes;
    } else bytes += value === null ? 4 : value ? 4 : 5;
  }
  return bytes;
}

function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function stamp(operation: Restore): readonly unknown[] {
  const range = own(operation, "range");
  const start = own(range, "start");
  const end = own(range, "end");
  return [
    own(operation, "encoding"),
    own(operation, "decodedBytes"),
    own(operation, "data"),
    own(range, "sheet"),
    own(start, "row"),
    own(start, "col"),
    own(end, "row"),
    own(end, "col"),
  ];
}

function prepare(
  operation: Restore,
  revision = stamp(operation),
  block = decodeRestoreBlockPayload(operation),
): PreparedRestore {
  return {
    stamp: revision,
    block,
    range: normalizedRange(operation.range),
    requiredSheets: [],
    containsFormula: false,
    containsReference: false,
  };
}

export class TransactionPreparation {
  private readonly entries = new Map<Restore, PreparedRestore>();
  private readonly previous = new Map<Restore, TransactionPreparation | undefined>();
  private readonly history_blocks = new Set<PackedCellBlock>();

  /**
   * The engine built these plain arrays from a validated snapshot. Measure
   * scalar payloads without the descriptor/cycle checks required at ingress.
   */
  seedHistory(
    operation: Extract<DocumentOp, { op: "setBlock" }>,
    restore: (range: Range) => boolean,
  ): void {
    const block = operation.block;
    const value_bytes = scalar_array_bytes(block.values);
    const style_bytes = block.styleIds === undefined ? 0 : scalar_array_bytes(block.styleIds);
    if (value_bytes === undefined || style_bytes === undefined) return;

    // Measure the small envelope once with empty arrays, then add the exact
    // array contents minus the two `[]` bytes each empty array already counted.
    const empty_block = {
      ...block,
      values: [],
      ...(block.styleIds === undefined ? {} : { styleIds: [] }),
    };
    const array_bytes = value_bytes - 2 + (block.styleIds === undefined ? 0 : style_bytes - 2);
    const options = { omitUndefinedProperties: true };
    const block_bytes =
      boundedJsonByteLength(empty_block, Number.MAX_SAFE_INTEGER, options) + array_bytes;
    const operation_bytes =
      boundedJsonByteLength(
        { ...operation, block: empty_block },
        Number.MAX_SAFE_INTEGER,
        options,
      ) + array_bytes;
    history_blocks.set(block, {
      blockBytes: block_bytes,
      operationBytes: operation_bytes,
      restore,
    });
    this.history_blocks.add(block);
  }

  measure(operations: readonly DocumentOp[]): number {
    let bytes = 2 + Math.max(0, operations.length - 1);
    for (const operation of operations) {
      const history = operation.op === "setBlock" ? history_blocks.get(operation.block) : undefined;
      bytes +=
        history?.operationBytes ??
        boundedJsonByteLength(operation, Number.MAX_SAFE_INTEGER, {
          omitUndefinedProperties: true,
        });
    }
    return bytes;
  }

  constructor(operations: readonly DocumentOp[] = []) {
    this.bind(operations);
  }

  bind(operations: readonly DocumentOp[]): void {
    for (const operation of operations) {
      if (own(operation, "op") !== "restoreBlock" || this.previous.has(operation as Restore))
        continue;
      const restore = operation as Restore;
      this.previous.set(restore, owners.get(restore));
      owners.set(restore, this);
    }
  }

  /**
   * The engine built `block` from validated store state for a history restore,
   * so its shape is not checked again when the store applies `operation`.
   */
  seed(operation: Restore, block: PackedCellBlock): void {
    this.bind([operation]);
    const prepared = prepare(operation, stamp(operation), block);
    prepared.errors = [];
    record_block_facts(prepared);
    this.entries.set(operation, prepared);
  }

  restore(operation: Restore): PreparedRestore {
    const revision = stamp(operation);
    const entry = this.entries.get(operation);
    if (entry && revision.every((value, index) => Object.is(value, entry.stamp[index])))
      return entry;
    const prepared =
      this.previous.get(operation)?.restore(operation) ?? prepare(operation, revision);
    this.entries.set(operation, prepared);
    return prepared;
  }

  dispose(): void {
    for (const block of this.history_blocks) history_blocks.delete(block);
    this.history_blocks.clear();
    for (const [operation, previous] of this.previous) {
      if (previous) owners.set(operation, previous);
      else owners.delete(operation);
    }
    this.entries.clear();
    this.previous.clear();
  }
}

function record_block_facts(prepared: PreparedRestore): void {
  prepared.requiredSheets = [
    ...new Set((prepared.block.refs ?? []).map(([, target]) => target.sheet)),
  ];
  prepared.containsFormula = (prepared.block.formulas?.length ?? 0) > 0;
  prepared.containsReference = (prepared.block.refs?.length ?? 0) > 0;
}

export function preparedRestore<E>(
  operation: Restore,
  validate: (value: unknown) => readonly E[],
): Omit<PreparedRestore, "errors"> & { errors: readonly E[] } {
  const prepared = owners.get(operation)?.restore(operation) ?? prepare(operation);
  if (!prepared.errors) {
    prepared.errors = validate({ op: "setBlock", range: operation.range, block: prepared.block });
    if (prepared.errors.length === 0) record_block_facts(prepared);
  }
  return prepared as Omit<PreparedRestore, "errors"> & { errors: readonly E[] };
}
