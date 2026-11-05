import { encodeType, packStrings } from "./encoding.js";
import type { QueryAggregate, QueryPredicate, QueryStep } from "./types.js";

// Codes mirror `plan_wire.rs`; Rust validates every code, so this file only lays out lanes.
const STEP_CODES: Readonly<Record<QueryStep["kind"], number>> = {
  filter: 1,
  select: 2,
  rename: 3,
  changeType: 4,
  join: 5,
  group: 6,
  unpivot: 7,
};
const PREDICATE_CODES: Readonly<Record<QueryPredicate["kind"], number>> = {
  compare: 1,
  isNull: 2,
  contains: 3,
  and: 4,
  or: 5,
  not: 6,
};
const LITERAL_NULL = 0;
const LITERAL_FALSE = 1;
const LITERAL_TRUE = 2;
const LITERAL_NUMBER = 3;
const LITERAL_TEXT = 4;
export const NO_COLUMN = 0xffff_ffff;

/** Rust rejects this code, so unknown runtime values become a `definition` diagnostic there. */
const INVALID_CODE = 0xffff_fffe;

// Operator codes are one-based positions in the matching Rust tables.
const COMPARE_CODES: Readonly<Record<string, number>> = {
  eq: 1,
  neq: 2,
  lt: 3,
  lte: 4,
  gt: 5,
  gte: 6,
};
const ERROR_POLICY_CODES: Readonly<Record<string, number>> = { error: 1, null: 2 };
const JOIN_CODES: Readonly<Record<string, number>> = {
  inner: 1,
  left: 2,
  right: 3,
  full: 4,
  leftSemi: 5,
  rightSemi: 6,
  leftAnti: 7,
  rightAnti: 8,
};
const AGGREGATE_CODES: Readonly<Record<string, number>> = {
  countRows: 1,
  count: 2,
  sum: 3,
  average: 4,
  min: 5,
  max: 6,
};

/** Typed plan lanes: `u32` codes, `f64` literals and one packed UTF-8 string table. */
export interface PlanWire {
  readonly codes: Uint32Array;
  readonly numbers: Float64Array;
  readonly text: Uint8Array;
  readonly offsets: Uint32Array;
}

/** Appends typed lanes in the order `plan_wire.rs` reads them. */
export class PlanWriter {
  readonly codes: number[] = [];
  readonly numbers: number[] = [];
  readonly table: string[] = [];
  readonly stringIndexes = new Map<string, number>();

  code(table: Readonly<Record<string, number>>, key: string): void {
    this.codes.push(table[key] ?? INVALID_CODE);
  }

  string(value: string): void {
    let index = this.stringIndexes.get(value);
    if (index === undefined) {
      index = this.table.length;
      this.table.push(value);
      this.stringIndexes.set(value, index);
    }

    this.codes.push(index);
  }

  stringList(values: readonly string[]): void {
    this.codes.push(values.length);
    for (const value of values) this.string(value);
  }

  pairs(values: readonly (readonly [string, string])[]): void {
    this.codes.push(values.length);
    for (const [left, right] of values) {
      this.string(left);
      this.string(right);
    }
  }

  literal(value: unknown): void {
    if (value === null) {
      this.codes.push(LITERAL_NULL);
    } else if (typeof value === "boolean") {
      this.codes.push(value ? LITERAL_TRUE : LITERAL_FALSE);
    } else if (typeof value === "number") {
      this.codes.push(LITERAL_NUMBER, this.numbers.length);
      this.numbers.push(value);
    } else if (typeof value === "string") {
      this.codes.push(LITERAL_TEXT);
      this.string(value);
    } else {
      this.codes.push(INVALID_CODE);
    }
  }

  predicate(predicate: QueryPredicate): void {
    this.code(PREDICATE_CODES, predicate.kind);

    switch (predicate.kind) {
      case "compare":
        this.string(predicate.column);
        this.code(COMPARE_CODES, predicate.op);
        this.literal(predicate.value);
        break;
      case "isNull":
        this.string(predicate.column);
        break;
      case "contains":
        this.string(predicate.column);
        this.string(predicate.text);
        break;
      case "and":
      case "or":
        this.codes.push(predicate.predicates.length);
        for (const child of predicate.predicates) this.predicate(child);
        break;
      case "not":
        this.predicate(predicate.predicate);
        break;
    }
  }

  aggregate(aggregate: QueryAggregate): void {
    this.string(aggregate.id);
    this.string(aggregate.name);
    this.code(AGGREGATE_CODES, aggregate.op);

    if (aggregate.column === undefined) {
      this.codes.push(NO_COLUMN);
    } else {
      this.string(aggregate.column);
    }
  }

  optionalString(value: string | undefined): void {
    if (value === undefined) this.codes.push(NO_COLUMN);
    else this.string(value);
  }

  steps(steps: readonly QueryStep[]): void {
    this.codes.push(steps.length);
    for (const step of steps) this.step(step);
  }

  finish(): PlanWire {
    const strings = packStrings(this.table);

    return {
      codes: Uint32Array.from(this.codes),
      numbers: Float64Array.from(this.numbers),
      text: strings.bytes,
      offsets: strings.offsets,
    };
  }

  step(step: QueryStep): void {
    this.code(STEP_CODES, step.kind);

    switch (step.kind) {
      case "filter":
        this.predicate(step.predicate);
        break;
      case "select":
        this.stringList(step.columns);
        break;
      case "rename":
        this.pairs(step.columns);
        break;
      case "changeType":
        this.string(step.column);
        this.codes.push(encodeType(step.type));
        this.code(ERROR_POLICY_CODES, step.onError);
        break;
      case "join":
        this.string(step.input);
        this.code(JOIN_CODES, step.join);
        this.pairs(step.keys);
        break;
      case "group":
        this.stringList(step.keys);
        this.codes.push(step.aggregates.length);
        for (const aggregate of step.aggregates) this.aggregate(aggregate);
        break;
      case "unpivot":
        this.stringList(step.columns);
        this.string(step.attribute.id);
        this.string(step.attribute.name);
        this.string(step.value.id);
        this.string(step.value.name);
        break;
    }
  }
}

/** Lays a saved step list out as typed lanes; Rust decodes and validates it. */
export function encodePlan(steps: readonly QueryStep[]): PlanWire {
  const writer = new PlanWriter();
  writer.steps(steps);

  return writer.finish();
}
