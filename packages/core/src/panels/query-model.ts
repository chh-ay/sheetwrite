// Text forms for the query panel's step editor. Each supported step is one
// short line that names columns as the user sees them; this module maps the
// names to the stable column IDs that saved steps use, and back. It holds no
// DOM, so the panel and its tests share one parser.

import type {
  QueryAggregate,
  QueryColumnSpec,
  QueryColumnType,
  QueryJoinKind,
  QueryPredicate,
  QueryStep,
  SavedQuery,
} from "../types/query.js";

/** A column as the step editor sees it at one point in the step list. */
export interface ModelColumn {
  readonly id: string;
  readonly name: string;
}

export type StepKind = QueryStep["kind"];

/** A parsed value, or the message the panel shows under the field. */
export type Parsed<T> = { readonly value: T } | { readonly error: string };

export const STEP_KINDS: readonly (readonly [StepKind, string, string])[] = [
  ["filter", "Filter rows", 'Total >= 100, Region is null, Region contains "North"'],
  ["select", "Choose columns", "Region, Total"],
  ["rename", "Rename columns", "Total -> Amount"],
  ["changeType", "Change type", "Total: number, or Total: number or null"],
  ["join", "Merge queries", "Regions (left) on Region = Code"],
  ["group", "Group by", "Region: Total = sum(Amount), Rows = countRows()"],
  ["unpivot", "Unpivot columns", "Jan, Feb -> Month, Value"],
];

const COLUMN_TYPES: readonly QueryColumnType[] = [
  "number",
  "logical",
  "text",
  "date",
  "dateTime",
  "mixed",
];

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

const AGGREGATE_OPS: readonly QueryAggregate["op"][] = [
  "countRows",
  "count",
  "sum",
  "average",
  "min",
  "max",
];

const COMPARE_OPS: Readonly<Record<string, Extract<QueryPredicate, { kind: "compare" }>["op"]>> = {
  "=": "eq",
  "<>": "neq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
};

/** Saved joins can chain; the panel stops following them past this depth. */
const MAX_JOIN_DEPTH = 32;

// --- Tokens ------------------------------------------------------------------

type Token =
  | { readonly kind: "name"; readonly text: string; readonly quoted: boolean }
  | { readonly kind: "symbol"; readonly text: string };

const SYMBOLS = ["->", ">=", "<=", "<>", ",", ":", "=", "(", ")", "<", ">"] as const;
const NAME_STOP = /[\s,:=()<>"]/u;

/** Names are bare words or `"quoted text"` with `""` for a quote. */
function tokens(text: string): Parsed<Token[]> {
  const output: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    const symbol = SYMBOLS.find((candidate) => text.startsWith(candidate, index));
    if (symbol !== undefined) {
      output.push({ kind: "symbol", text: symbol });
      index += symbol.length;
      continue;
    }

    if (character === '"') {
      let value = "";
      index += 1;
      for (;;) {
        if (index >= text.length) return { error: "A quoted name has no closing quote." };
        const next = text.charAt(index);
        if (next === '"' && text.charAt(index + 1) === '"') {
          value += '"';
          index += 2;
        } else if (next === '"') {
          index += 1;
          break;
        } else {
          value += next;
          index += 1;
        }
      }
      output.push({ kind: "name", text: value, quoted: true });
      continue;
    }

    // A word may hold hyphens, but `->` always ends it.
    let end = index + 1;
    while (end < text.length && !NAME_STOP.test(text.charAt(end)) && !text.startsWith("->", end)) {
      end += 1;
    }
    output.push({ kind: "name", text: text.slice(index, end), quoted: false });
    index = end;
  }
  return { value: output };
}

/** A cursor over tokens with the small grammar each step line uses. */
class Reader {
  private position = 0;

  constructor(private readonly list: readonly Token[]) {}

  done(): boolean {
    return this.position >= this.list.length;
  }

  peekSymbol(text: string): boolean {
    const token = this.list[this.position];
    return token?.kind === "symbol" && token.text === text;
  }

  takeSymbol(text: string): boolean {
    if (!this.peekSymbol(text)) return false;
    this.position += 1;
    return true;
  }

  peekWord(word: string): boolean {
    const token = this.list[this.position];
    return token?.kind === "name" && !token.quoted && token.text.toLowerCase() === word;
  }

  takeWord(word: string): boolean {
    if (!this.peekWord(word)) return false;
    this.position += 1;
    return true;
  }

  name(): Token | undefined {
    const token = this.list[this.position];
    if (token?.kind !== "name") return undefined;
    this.position += 1;
    return token;
  }

  /** Comma-separated names up to `stop` or the end. */
  names(stop?: string): string[] | undefined {
    const output: string[] = [];
    if (this.done() || (stop !== undefined && this.peekSymbol(stop))) return output;
    for (;;) {
      const token = this.name();
      if (token === undefined) return undefined;
      output.push(token.text);
      if (!this.takeSymbol(",")) return output;
    }
  }
}

// --- Names -------------------------------------------------------------------

function nameKey(name: string): string {
  return name.toLowerCase();
}

/** Exact name first, then ASCII letter case ignored, as table headers match. */
function findColumn(columns: readonly ModelColumn[], name: string): ModelColumn | undefined {
  return (
    columns.find((column) => column.name === name) ??
    columns.find((column) => nameKey(column.name) === nameKey(name))
  );
}

function resolve(columns: readonly ModelColumn[], name: string): Parsed<string> {
  const column = findColumn(columns, name);
  return column === undefined ? { error: `No column is named ${name}.` } : { value: column.id };
}

function resolveAll(columns: readonly ModelColumn[], names: readonly string[]): Parsed<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const id = resolve(columns, name);
    if ("error" in id) return id;
    ids.push(id.value);
  }
  return { value: ids };
}

/** A new stable ID from a display name; IDs never change when columns are renamed. */
export function freshId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "column";
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

const PLAIN_NAME = /^[^\s,:=()<>"-]+$/u;

function quote(name: string): string {
  return PLAIN_NAME.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
}

function nameOf(columns: readonly ModelColumn[], id: string): string {
  return quote(columns.find((column) => column.id === id)?.name ?? id);
}

// --- Source columns ----------------------------------------------------------

/** One `Name: type` per line; the order is the source schema order. */
export function parseSourceColumns(
  text: string,
  previous: readonly QueryColumnSpec[] = [],
): Parsed<QueryColumnSpec[]> {
  const output: QueryColumnSpec[] = [];
  const taken = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    const separator = line.lastIndexOf(":");
    const name = (separator < 0 ? line : line.slice(0, separator)).trim();
    const type = separator < 0 ? "text" : line.slice(separator + 1).trim();
    if (name === "") return { error: "Each column line needs a name." };
    const columnType = COLUMN_TYPES.find((candidate) => candidate === type);
    if (columnType === undefined) {
      return { error: `Column ${name} has no type ${type}; use ${COLUMN_TYPES.join(", ")}.` };
    }
    if (output.some((column) => nameKey(column.name) === nameKey(name))) {
      return { error: `Two columns are named ${name}.` };
    }

    // Editing keeps the IDs that later steps already refer to.
    const kept = previous.find((column) => column.name === name && !taken.has(column.id));
    const id = kept?.id ?? freshId(name, new Set([...taken, ...previous.map((c) => c.id)]));
    taken.add(id);
    output.push({ id, name, type: columnType });
  }
  if (output.length === 0) return { error: "Add at least one column." };
  return { value: output };
}

export function sourceColumnsText(columns: readonly QueryColumnSpec[]): string {
  return columns.map((column) => `${column.name}: ${column.type}`).join("\n");
}

// --- Schema ------------------------------------------------------------------

/** The columns after `steps`, as the engine names them; joins follow saved queries. */
export function columnsAfter(
  query: SavedQuery,
  queries: readonly SavedQuery[],
  count = query.steps.length,
  depth = 0,
): ModelColumn[] {
  let columns: ModelColumn[] = query.source.columns.map(({ id, name }) => ({ id, name }));
  for (const step of query.steps.slice(0, count))
    columns = columnsAfterStep(columns, step, queries, depth);
  return columns;
}

export function columnsAfterStep(
  columns: readonly ModelColumn[],
  step: QueryStep,
  queries: readonly SavedQuery[],
  depth = 0,
): ModelColumn[] {
  switch (step.kind) {
    case "filter":
    case "changeType":
      return [...columns];
    case "select":
      return step.columns.flatMap((id) => columns.filter((column) => column.id === id));
    case "rename":
      return columns.map((column) => {
        const renamed = step.columns.find(([id]) => id === column.id);
        return renamed === undefined ? column : { id: column.id, name: renamed[1] };
      });
    case "join": {
      const right = queries.find((candidate) => candidate.id === step.input);
      if (right === undefined || depth >= MAX_JOIN_DEPTH) return [...columns];
      const semi = step.join.endsWith("Semi") || step.join.endsWith("Anti");
      const rightColumns = columnsAfter(right, queries, right.steps.length, depth + 1);
      if (!semi) return [...columns, ...rightColumns];
      return step.join.startsWith("right") ? rightColumns : [...columns];
    }
    case "group":
      return [
        ...step.keys.flatMap((id) => columns.filter((column) => column.id === id)),
        ...step.aggregates.map(({ id, name }) => ({ id, name })),
      ];
    case "unpivot":
      return [
        ...columns.filter((column) => !step.columns.includes(column.id)),
        step.attribute,
        step.value,
      ];
  }
}

// --- Step text ---------------------------------------------------------------

function literalText(value: string | number | boolean | null): string {
  if (typeof value === "string") return `"${value.replaceAll('"', '""')}"`;
  return String(value);
}

function predicateText(columns: readonly ModelColumn[], predicate: QueryPredicate): string {
  switch (predicate.kind) {
    case "compare": {
      const op = Object.entries(COMPARE_OPS).find(([, code]) => code === predicate.op)?.[0] ?? "=";
      return `${nameOf(columns, predicate.column)} ${op} ${literalText(predicate.value)}`;
    }
    case "isNull":
      return `${nameOf(columns, predicate.column)} is null`;
    case "contains":
      return `${nameOf(columns, predicate.column)} contains ${literalText(predicate.text)}`;
    case "not":
      return `not ${predicateText(columns, predicate.predicate)}`;
    case "and":
    case "or":
      return predicate.predicates
        .map((child) => predicateText(columns, child))
        .join(` ${predicate.kind} `);
  }
}

/** The editor line for `step`, naming columns as they are before it runs. */
export function stepText(
  step: QueryStep,
  columns: readonly ModelColumn[],
  queries: readonly SavedQuery[],
): string {
  switch (step.kind) {
    case "filter":
      return predicateText(columns, step.predicate);
    case "select":
      return step.columns.map((id) => nameOf(columns, id)).join(", ");
    case "rename":
      return step.columns
        .map(([id, name]) => `${nameOf(columns, id)} -> ${quote(name)}`)
        .join(", ");
    case "changeType":
      return `${nameOf(columns, step.column)}: ${step.type}${step.onError === "null" ? " or null" : ""}`;
    case "join": {
      const right = queries.find((candidate) => candidate.id === step.input);
      const rightColumns = right === undefined ? [] : columnsAfter(right, queries);
      const keys = step.keys
        .map(([left, key]) => `${nameOf(columns, left)} = ${nameOf(rightColumns, key)}`)
        .join(", ");
      return `${quote(right?.name ?? step.input)} (${step.join}) on ${keys}`;
    }
    case "group": {
      const keys = step.keys.map((id) => nameOf(columns, id)).join(", ");
      const aggregates = step.aggregates
        .map(
          (aggregate) =>
            `${quote(aggregate.name)} = ${aggregate.op}(${aggregate.column === undefined ? "" : nameOf(columns, aggregate.column)})`,
        )
        .join(", ");
      return `${keys}: ${aggregates}`;
    }
    case "unpivot":
      return `${step.columns.map((id) => nameOf(columns, id)).join(", ")} -> ${quote(step.attribute.name)}, ${quote(step.value.name)}`;
  }
}

// --- Step parsing ------------------------------------------------------------

function literal(token: Token): string | number | boolean | null {
  if (token.kind === "name" && token.quoted) return token.text;
  const text = token.text.toLowerCase();
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  const number = Number(token.text);
  return token.text.trim() !== "" && Number.isFinite(number) ? number : token.text;
}

function filterStep(reader: Reader, columns: readonly ModelColumn[]): Parsed<QueryPredicate> {
  const negated = reader.takeWord("not");
  const name = reader.name();
  if (name === undefined) return { error: "Start with a column name." };
  const column = resolve(columns, name.text);
  if ("error" in column) return column;

  let predicate: QueryPredicate;
  if (reader.takeWord("is")) {
    if (!reader.takeWord("null")) return { error: "Use is null." };
    predicate = { kind: "isNull", column: column.value };
  } else if (reader.takeWord("contains")) {
    const text = reader.name();
    if (text === undefined) return { error: "Give the text to look for." };
    predicate = { kind: "contains", column: column.value, text: text.text };
  } else {
    const op = Object.keys(COMPARE_OPS).find((symbol) => reader.takeSymbol(symbol));
    const value = reader.name();
    const code = op === undefined ? undefined : COMPARE_OPS[op];
    if (code === undefined || value === undefined) {
      return { error: "Compare with =, <>, <, <=, > or >=, then a value." };
    }
    predicate = { kind: "compare", column: column.value, op: code, value: literal(value) };
  }

  return { value: negated ? { kind: "not", predicate } : predicate };
}

function taken(columns: readonly ModelColumn[]): Set<string> {
  return new Set(columns.map((column) => column.id));
}

/**
 * Parses one editor line into a step. Column names refer to `columns`, the
 * schema before the step; new columns get fresh stable IDs.
 */
export function parseStep(
  kind: StepKind,
  text: string,
  columns: readonly ModelColumn[],
  queries: readonly SavedQuery[],
  self: string,
): Parsed<QueryStep> {
  const list = tokens(text);
  if ("error" in list) return list;
  const reader = new Reader(list.value);
  const parsed = parseKind(kind, reader, columns, queries, self);
  if ("error" in parsed) return parsed;
  if (!reader.done()) return { error: "Unexpected text at the end of the step." };
  return parsed;
}

function parseKind(
  kind: StepKind,
  reader: Reader,
  columns: readonly ModelColumn[],
  queries: readonly SavedQuery[],
  self: string,
): Parsed<QueryStep> {
  switch (kind) {
    case "filter": {
      const predicate = filterStep(reader, columns);
      return "error" in predicate ? predicate : { value: { kind, predicate: predicate.value } };
    }
    case "select": {
      const names = reader.names();
      if (names === undefined || names.length === 0) return { error: "List the columns to keep." };
      const ids = resolveAll(columns, names);
      return "error" in ids ? ids : { value: { kind, columns: ids.value } };
    }
    case "rename": {
      const pairs: (readonly [string, string])[] = [];
      do {
        const from = reader.name();
        const arrow = reader.takeSymbol("->");
        const to = reader.name();
        if (from === undefined || !arrow || to === undefined) return { error: "Use Old -> New." };
        const id = resolve(columns, from.text);
        if ("error" in id) return id;
        pairs.push([id.value, to.text]);
      } while (reader.takeSymbol(","));
      return { value: { kind, columns: pairs } };
    }
    case "changeType": {
      const name = reader.name();
      const colon = reader.takeSymbol(":");
      const type = reader.name();
      if (name === undefined || !colon || type === undefined) return { error: "Use Column: type." };
      const id = resolve(columns, name.text);
      if ("error" in id) return id;
      const columnType = COLUMN_TYPES.find((candidate) => candidate === type.text);
      if (columnType === undefined) return { error: `Use one of ${COLUMN_TYPES.join(", ")}.` };
      const onError = reader.takeWord("or") && reader.takeWord("null") ? "null" : "error";
      return { value: { kind, column: id.value, type: columnType, onError } };
    }
    case "join": {
      const name = reader.name();
      const right = queries.find(
        (candidate) => name !== undefined && nameKey(candidate.name) === nameKey(name.text),
      );
      if (right === undefined || right.id === self) return { error: "Name another saved query." };
      let join: QueryJoinKind = "inner";
      if (reader.takeSymbol("(")) {
        const kindName = reader.name();
        const found = JOIN_KINDS.find((candidate) => candidate === kindName?.text);
        if (found === undefined || !reader.takeSymbol(")")) {
          return { error: `Use one of ${JOIN_KINDS.join(", ")} in parentheses.` };
        }
        join = found;
      }
      if (!reader.takeWord("on")) return { error: "Use on Left = Right after the query." };
      const rightColumns = columnsAfter(right, queries);
      const keys: (readonly [string, string])[] = [];
      do {
        const left = reader.name();
        const equals = reader.takeSymbol("=");
        const key = reader.name();
        if (left === undefined || !equals || key === undefined)
          return { error: "Use Left = Right." };
        const leftId = resolve(columns, left.text);
        if ("error" in leftId) return leftId;
        const rightId = resolve(rightColumns, key.text);
        if ("error" in rightId) return { error: `${right.name} has no column named ${key.text}.` };
        keys.push([leftId.value, rightId.value]);
      } while (reader.takeSymbol(","));
      return { value: { kind, input: right.id, keys, join } };
    }
    case "group": {
      const keyNames = reader.names(":");
      if (keyNames === undefined || !reader.takeSymbol(":")) {
        return { error: "Use Keys: Name = op(Column)." };
      }
      const keys = resolveAll(columns, keyNames);
      if ("error" in keys) return keys;
      const ids = new Set(keys.value);
      const aggregates: QueryAggregate[] = [];
      do {
        const name = reader.name();
        const equals = reader.takeSymbol("=");
        const op = reader.name();
        const open = reader.takeSymbol("(");
        const source = reader.peekSymbol(")") ? undefined : reader.name();
        if (name === undefined || !equals || op === undefined || !open || !reader.takeSymbol(")")) {
          return { error: "Use Name = op(Column), for example Total = sum(Amount)." };
        }
        const aggregateOp = AGGREGATE_OPS.find((candidate) => candidate === op.text);
        if (aggregateOp === undefined) return { error: `Use one of ${AGGREGATE_OPS.join(", ")}.` };
        const id = freshId(name.text, ids);
        ids.add(id);
        if (source === undefined) {
          if (aggregateOp !== "countRows") return { error: `${aggregateOp} needs a column.` };
          aggregates.push({ id, name: name.text, op: aggregateOp });
          continue;
        }
        const column = resolve(columns, source.text);
        if ("error" in column) return column;
        aggregates.push({ id, name: name.text, op: aggregateOp, column: column.value });
      } while (reader.takeSymbol(","));
      return { value: { kind, keys: keys.value, aggregates } };
    }
    case "unpivot": {
      const names = reader.names("->");
      if (names === undefined || names.length === 0 || !reader.takeSymbol("->")) {
        return { error: "Use Columns -> Attribute, Value." };
      }
      const ids = resolveAll(columns, names);
      if ("error" in ids) return ids;
      const attribute = reader.name();
      const comma = reader.takeSymbol(",");
      const value = reader.name();
      if (attribute === undefined || !comma || value === undefined) {
        return { error: "Name the attribute and value columns." };
      }
      const used = taken(columns);
      const attributeId = freshId(attribute.text, used);
      used.add(attributeId);
      return {
        value: {
          kind,
          columns: ids.value,
          attribute: { id: attributeId, name: attribute.text },
          value: { id: freshId(value.text, used), name: value.text },
        },
      };
    }
  }
}
