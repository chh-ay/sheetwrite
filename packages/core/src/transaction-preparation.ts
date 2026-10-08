import { decodeRestoreBlockPayload } from "./restore-block-codec.js";
import type { DocumentOp, PackedCellBlock } from "./types/document.js";

type Restore = Extract<DocumentOp, { op: "restoreBlock" }>;

interface PreparedRestore {
  stamp: readonly unknown[];
  block: PackedCellBlock;
  errors?: readonly unknown[];
  requiredSheets: readonly string[];
  containsFormula: boolean;
}

// Sidecars are visible only while their owning synchronous application is live.
// Nested applications restore the previous owner rather than sharing its lifetime.
const owners = new WeakMap<Restore, TransactionPreparation>();

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
    requiredSheets: [],
    containsFormula: false,
  };
}

export class TransactionPreparation {
  private readonly entries = new Map<Restore, PreparedRestore>();
  private readonly previous = new Map<Restore, TransactionPreparation | undefined>();

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

  seed(operation: Restore, block: PackedCellBlock): void {
    this.bind([operation]);
    this.entries.set(operation, prepare(operation, stamp(operation), block));
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
    for (const [operation, previous] of this.previous) {
      if (previous) owners.set(operation, previous);
      else owners.delete(operation);
    }
    this.entries.clear();
    this.previous.clear();
  }
}

export function preparedRestore<E>(
  operation: Restore,
  validate: (value: unknown) => readonly E[],
): Omit<PreparedRestore, "errors"> & { errors: readonly E[] } {
  const prepared = owners.get(operation)?.restore(operation) ?? prepare(operation);
  if (!prepared.errors) {
    prepared.errors = validate({ op: "setBlock", range: operation.range, block: prepared.block });
    if (prepared.errors.length === 0) {
      prepared.requiredSheets = [
        ...new Set((prepared.block.refs ?? []).map(([, target]) => target.sheet)),
      ];
      prepared.containsFormula = (prepared.block.formulas?.length ?? 0) > 0;
    }
  }
  return prepared as Omit<PreparedRestore, "errors"> & { errors: readonly E[] };
}
