import type {
  QueryAggregate,
  QueryColumnSpec,
  QueryJoinKind,
  QueryPredicate,
  QueryStep,
  SavedQuery,
  SavedQuerySource,
} from "@sheetwrite/core";

import { decodeType, encodeType, unpackStrings } from "./encoding.js";
import { NO_COLUMN, type PlanWire, PlanWriter } from "./plan-wire.js";

// Layout of one query, as `m/mod.rs` reads and writes it: id, name, source kind,
// source id, locator, columns, kind options, output table name, steps.
const SOURCE_CSV = 1;
const SOURCE_JSON = 2;
const SOURCE_HOST = 3;
const DEFAULT_CSV_DELIMITER = 44;

function sourceCode(kind: SavedQuerySource["kind"]): number {
  switch (kind) {
    case "csv":
      return SOURCE_CSV;
    case "json":
      return SOURCE_JSON;
    case "host":
      return SOURCE_HOST;
  }
}

// Reverse tables of the one-based operator codes in `plan-wire.ts`.
const COMPARE_OPS = ["eq", "neq", "lt", "lte", "gt", "gte"] as const;
const POLICIES = ["error", "null"] as const;
const JOIN_KINDS: readonly QueryJoinKind[] = [
  "inner",
  "left",
  "right",
  "full",
  "leftSemi",
  "rightSemi",
  "leftAnti",
  "rightAnti",
];
const AGGREGATE_OPS = ["countRows", "count", "sum", "average", "min", "max"] as const;
const STEP_KINDS = [
  "filter",
  "select",
  "rename",
  "changeType",
  "join",
  "group",
  "unpivot",
] as const;
const PREDICATE_KINDS = ["compare", "isNull", "contains", "and", "or", "not"] as const;
const LITERAL_NULL = 0;
const LITERAL_FALSE = 1;
const LITERAL_TRUE = 2;
const LITERAL_NUMBER = 3;
const LITERAL_TEXT = 4;

/** Lays saved queries out as the lanes the Rust codec reads. */
export function encodeQueries(queries: readonly SavedQuery[]): PlanWire {
  const writer = new PlanWriter();
  writer.codes.push(queries.length);

  for (const query of queries) {
    const { source } = query;
    writer.string(query.id);
    writer.string(query.name);
    writer.codes.push(sourceCode(source.kind));
    writer.string(source.sourceId);
    writer.optionalString(source.kind === "host" ? undefined : source.locator);
    writer.codes.push(source.columns.length);
    for (const column of source.columns) {
      writer.string(column.id);
      writer.string(column.name);
      writer.codes.push(encodeType(column.type));
    }

    if (source.kind === "csv") {
      writer.codes.push(
        source.delimiter ?? DEFAULT_CSV_DELIMITER,
        source.headers === false ? 0 : 1,
        source.emptyIsNull === false ? 0 : 1,
      );
    } else if (source.kind === "json") {
      writer.stringList(source.path ?? []);
    }

    writer.optionalString(query.output?.tableName);
    writer.steps(query.steps);
  }

  return writer.finish();
}

class Reader {
  position = 0;
  readonly table: string[];

  constructor(readonly wire: PlanWire) {
    this.table = unpackStrings(wire.text, wire.offsets);
  }

  code(): number {
    const code = this.wire.codes[this.position];
    if (code === undefined) throw new Error("Query codec returned truncated lanes");

    this.position += 1;
    return code;
  }

  string(): string {
    return this.at(this.code());
  }

  at(index: number): string {
    const value = this.table[index];
    if (value === undefined) throw new Error("Query codec returned an invalid string index");

    return value;
  }

  optionalString(): string | undefined {
    const index = this.code();
    return index === NO_COLUMN ? undefined : this.at(index);
  }

  strings(): string[] {
    return Array.from({ length: this.code() }, () => this.string());
  }

  pairs(): [string, string][] {
    return Array.from({ length: this.code() }, () => [this.string(), this.string()]);
  }

  /** One-based codes select an entry; any other code is a codec defect. */
  pick<T>(table: readonly T[]): T {
    const value = table[this.code() - 1];
    if (value === undefined) throw new Error("Query codec returned an invalid code");

    return value;
  }

  literal(): string | number | boolean | null {
    switch (this.code()) {
      case LITERAL_NULL:
        return null;
      case LITERAL_FALSE:
        return false;
      case LITERAL_TRUE:
        return true;
      case LITERAL_NUMBER: {
        const value = this.wire.numbers[this.code()];
        if (value === undefined) throw new Error("Query codec returned an invalid number index");

        return value;
      }
      case LITERAL_TEXT:
        return this.string();
      default:
        throw new Error("Query codec returned an invalid literal code");
    }
  }

  predicate(): QueryPredicate {
    const kind = this.pick(PREDICATE_KINDS);
    switch (kind) {
      case "compare":
        return { kind, column: this.string(), op: this.pick(COMPARE_OPS), value: this.literal() };
      case "isNull":
        return { kind, column: this.string() };
      case "contains":
        return { kind, column: this.string(), text: this.string() };
      case "and":
      case "or":
        return { kind, predicates: Array.from({ length: this.code() }, () => this.predicate()) };
      case "not":
        return { kind, predicate: this.predicate() };
    }
  }

  aggregate(): QueryAggregate {
    const id = this.string();
    const name = this.string();
    const op = this.pick(AGGREGATE_OPS);
    const column = this.optionalString();

    return column === undefined ? { id, name, op } : { id, name, op, column };
  }

  step(): QueryStep {
    const kind = this.pick(STEP_KINDS);
    switch (kind) {
      case "filter":
        return { kind, predicate: this.predicate() };
      case "select":
        return { kind, columns: this.strings() };
      case "rename":
        return { kind, columns: this.pairs() };
      case "changeType":
        return {
          kind,
          column: this.string(),
          type: decodeType(this.code()),
          onError: this.pick(POLICIES),
        };
      case "join": {
        const input = this.string();
        const join = this.pick(JOIN_KINDS);
        return { kind, input, join, keys: this.pairs() };
      }
      case "group":
        return {
          kind,
          keys: this.strings(),
          aggregates: Array.from({ length: this.code() }, () => this.aggregate()),
        };
      case "unpivot":
        return {
          kind,
          columns: this.strings(),
          attribute: { id: this.string(), name: this.string() },
          value: { id: this.string(), name: this.string() },
        };
    }
  }

  columns(): QueryColumnSpec[] {
    return Array.from({ length: this.code() }, () => ({
      id: this.string(),
      name: this.string(),
      type: decodeType(this.code()),
    }));
  }

  query(): SavedQuery {
    const id = this.string();
    const name = this.string();
    const kind = this.code();
    const sourceId = this.string();
    const locator = this.optionalString();
    const columns = this.columns();
    const located = locator === undefined ? {} : { locator };
    let source: SavedQuerySource;

    if (kind === SOURCE_CSV) {
      source = {
        kind: "csv",
        sourceId,
        ...located,
        columns,
        delimiter: this.code(),
        headers: this.code() === 1,
        emptyIsNull: this.code() === 1,
      };
    } else if (kind === SOURCE_JSON) {
      const path = this.strings();
      source = { kind: "json", sourceId, ...located, columns, ...(path.length ? { path } : {}) };
    } else if (kind === SOURCE_HOST) {
      source = { kind: "host", sourceId, columns };
    } else {
      throw new Error("Query codec returned an invalid source kind");
    }

    // Imported queries have no output; the XLSX reader binds output tables.
    this.optionalString();
    const steps = Array.from({ length: this.code() }, () => this.step());

    return { id, name, source, steps };
  }
}

/** Reads the lanes the Rust codec writes for imported queries. */
export function decodeQueries(wire: PlanWire): SavedQuery[] {
  const reader = new Reader(wire);
  const queries = Array.from({ length: reader.code() }, () => reader.query());
  if (reader.position !== wire.codes.length) throw new Error("Query codec returned padded lanes");

  return queries;
}
