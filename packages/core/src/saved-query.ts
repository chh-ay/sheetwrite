// Pure saved-query rules shared by the protocol, the store and the history:
// shape checks, structural checks and copies. Step semantics (column
// references, types, predicate trees) are checked by the Rust query engine
// when `@sheetwrite/queries` defines or refreshes a query (#227).

import { isPlainRecord, ownValue, type PlainRecord } from "./plain-data.js";
import type { SavedQuery, SavedQuerySource } from "./types/query.js";

/** Most saved queries one workbook may hold. */
const MAX_QUERIES = 1_024;
/** Longest query, source, table or column identity. */
const MAX_ID_LENGTH = 255;
/** Longest public locator, such as an `https` URL. */
const MAX_LOCATOR_LENGTH = 8_192;
/** Matches the query engine's step bound. */
const MAX_STEPS = 256;
/** Widest declared source schema. */
const MAX_SOURCE_COLUMNS = 16_384;
/** Deepest JSON record path. */
const MAX_PATH_LENGTH = 64;
/** Delimiters are single ASCII bytes other than NUL. */
const MAX_ASCII = 0x7f;

const SOURCE_KINDS: Readonly<Record<string, true>> = { csv: true, json: true, host: true };
const COLUMN_TYPES: Readonly<Record<string, true>> = {
  number: true,
  logical: true,
  text: true,
  date: true,
  dateTime: true,
  mixed: true,
};
const STEP_KINDS: Readonly<Record<string, true>> = {
  filter: true,
  select: true,
  rename: true,
  changeType: true,
  join: true,
  group: true,
  unpivot: true,
};

/** Path-qualified saved-query problem; structurally a `DocumentValidationError`. */
export interface SavedQueryIssue {
  path: string;
  code: "invalid-value" | "duplicate-id" | "missing-reference" | "resource-limit";
  message: string;
}

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface SavedQueryIssueSink {
  push(...issues: SavedQueryIssue[]): number;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function invalid(issues: SavedQueryIssueSink, path: string, message: string): void {
  issues.push({ path, code: "invalid-value", message });
}

function requireId(
  record: PlainRecord,
  key: string,
  path: string,
  issues: SavedQueryIssueSink,
): void {
  if (!isBoundedString(ownValue(record, key), MAX_ID_LENGTH)) {
    invalid(
      issues,
      `${path}.${key}`,
      `${key} must be a non-empty string of at most ${MAX_ID_LENGTH}`,
    );
  }
}

function optionalBoolean(
  record: PlainRecord,
  key: string,
  path: string,
  issues: SavedQueryIssueSink,
): void {
  const value = ownValue(record, key);
  if (value !== undefined && typeof value !== "boolean") {
    invalid(issues, `${path}.${key}`, `${key} must be a boolean`);
  }
}

/**
 * A locator is public: a URL with a user name or password is rejected, so a
 * credential cannot be saved by mistake in the workbook.
 */
function validateLocator(value: unknown, path: string, issues: SavedQueryIssueSink): void {
  if (value === undefined) return;

  if (!isBoundedString(value, MAX_LOCATOR_LENGTH)) {
    invalid(issues, path, `locator must be a non-empty string of at most ${MAX_LOCATOR_LENGTH}`);
    return;
  }

  if (URL.canParse(value)) {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") {
      invalid(issues, path, "locator must not contain a user name or password");
    }
  }
}

function validateColumns(value: unknown, path: string, issues: SavedQueryIssueSink): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(issues, path, "columns must be a non-empty array");
    return;
  }

  if (value.length > MAX_SOURCE_COLUMNS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Source column limit ${MAX_SOURCE_COLUMNS} exceeded`,
    });
    return;
  }

  value.forEach((column: unknown, index) => {
    const columnPath = `${path}[${index}]`;
    if (!isPlainRecord(column)) {
      invalid(issues, columnPath, "column must be an object");
      return;
    }

    requireId(column, "id", columnPath, issues);
    requireId(column, "name", columnPath, issues);

    const type = ownValue(column, "type");
    if (typeof type !== "string" || COLUMN_TYPES[type] !== true) {
      invalid(issues, `${columnPath}.type`, "type must be a query column type");
    }
  });
}

function validateSourceShape(value: unknown, path: string, issues: SavedQueryIssueSink): void {
  if (!isPlainRecord(value)) {
    invalid(issues, path, "source must be an object");
    return;
  }

  const kind = ownValue(value, "kind");
  if (typeof kind !== "string" || SOURCE_KINDS[kind] !== true) {
    invalid(issues, `${path}.kind`, "kind must be csv, json or host");
    return;
  }

  requireId(value, "sourceId", path, issues);
  validateColumns(ownValue(value, "columns"), `${path}.columns`, issues);

  if (kind === "host") return;

  validateLocator(ownValue(value, "locator"), `${path}.locator`, issues);

  if (kind === "csv") {
    const delimiter = ownValue(value, "delimiter");
    if (
      delimiter !== undefined &&
      (!isIndex(delimiter) || delimiter === 0 || delimiter > MAX_ASCII)
    ) {
      invalid(issues, `${path}.delimiter`, "delimiter must be an ASCII byte other than NUL");
    }

    optionalBoolean(value, "headers", path, issues);
    optionalBoolean(value, "emptyIsNull", path, issues);
    return;
  }

  const recordPath = ownValue(value, "path");
  if (
    recordPath !== undefined &&
    (!Array.isArray(recordPath) ||
      recordPath.length > MAX_PATH_LENGTH ||
      !recordPath.every((field: unknown) => typeof field === "string"))
  ) {
    invalid(issues, `${path}.path`, `path must be at most ${MAX_PATH_LENGTH} member names`);
  }
}

function validateStepsShape(value: unknown, path: string, issues: SavedQueryIssueSink): void {
  if (!Array.isArray(value)) {
    invalid(issues, path, "steps must be an array");
    return;
  }

  if (value.length > MAX_STEPS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Query step limit ${MAX_STEPS} exceeded`,
    });
    return;
  }

  value.forEach((step: unknown, index) => {
    const stepPath = `${path}[${index}]`;
    if (!isPlainRecord(step)) {
      invalid(issues, stepPath, "step must be an object");
      return;
    }

    const kind = ownValue(step, "kind");
    if (typeof kind !== "string" || STEP_KINDS[kind] !== true) {
      invalid(issues, `${stepPath}.kind`, "kind must be a query step kind");
      return;
    }

    // Dependencies are checked here; the rest of each step is checked by the engine.
    if (kind === "join") requireId(step, "input", stepPath, issues);
  });
}

function validateOutputShape(value: unknown, path: string, issues: SavedQueryIssueSink): void {
  if (value === undefined) return;

  if (!isPlainRecord(value)) {
    invalid(issues, path, "output must be an object");
    return;
  }

  requireId(value, "table", path, issues);
  requireId(value, "tableName", path, issues);

  const anchor = ownValue(value, "anchor");
  if (
    !isPlainRecord(anchor) ||
    !isBoundedString(ownValue(anchor, "sheet"), MAX_ID_LENGTH) ||
    !isIndex(ownValue(anchor, "row")) ||
    !isIndex(ownValue(anchor, "col"))
  ) {
    invalid(issues, `${path}.anchor`, "anchor must be a cell address");
  }
}

/** Shape checks for one untrusted saved query. */
export function validateSavedQueryShape(
  value: unknown,
  path: string,
  issues: SavedQueryIssueSink,
): void {
  if (!isPlainRecord(value)) {
    invalid(issues, path, "Query must be an object");
    return;
  }

  requireId(value, "id", path, issues);
  requireId(value, "name", path, issues);
  validateSourceShape(ownValue(value, "source"), `${path}.source`, issues);
  validateStepsShape(ownValue(value, "steps"), `${path}.steps`, issues);
  validateOutputShape(ownValue(value, "output"), `${path}.output`, issues);
}

/** IDs of the saved queries that `query` joins, in step order. */
function queryDependencies(query: SavedQuery): string[] {
  const inputs: string[] = [];
  for (const step of query.steps) {
    if (step.kind === "join") inputs.push(step.input);
  }

  return inputs;
}

/**
 * Structural checks for shape-valid queries: unique IDs, unique names when
 * ASCII letter case is ignored, joins that name another existing query, no
 * join cycle, and at most one query per output table.
 */
function validateQueryStructure(
  queries: readonly SavedQuery[],
  path: string,
  issues: SavedQueryIssueSink,
): void {
  if (queries.length > MAX_QUERIES) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Workbook query limit ${MAX_QUERIES} exceeded`,
    });
    return;
  }

  const indexes = new Map<string, number>();
  const names = new Set<string>();
  const tables = new Set<string>();

  queries.forEach((query, index) => {
    const itemPath = `${path}[${index}]`;
    if (indexes.has(query.id)) {
      issues.push({
        path: `${itemPath}.id`,
        code: "duplicate-id",
        message: "Query IDs must be unique in the workbook",
      });
    }
    indexes.set(query.id, index);

    const name = query.name.toLowerCase();
    if (names.has(name)) {
      issues.push({
        path: `${itemPath}.name`,
        code: "duplicate-id",
        message: "Query names must be unique when letter case is ignored",
      });
    }
    names.add(name);

    if (query.output) {
      if (tables.has(query.output.table)) {
        issues.push({
          path: `${itemPath}.output.table`,
          code: "duplicate-id",
          message: "At most one query may own an output table",
        });
      }
      tables.add(query.output.table);
    }
  });

  queries.forEach((query, index) => {
    for (const input of queryDependencies(query)) {
      if (!indexes.has(input)) {
        issues.push({
          path: `${path}[${index}].steps`,
          code: "missing-reference",
          message: "A join must name another saved query",
        });
      }
    }
  });

  if (hasDependencyCycle(queries, indexes)) {
    issues.push({ path, code: "invalid-value", message: "Query joins must not form a cycle" });
  }
}

/** Iterative three-colour depth-first search, so a long chain cannot overflow the stack. */
function hasDependencyCycle(
  queries: readonly SavedQuery[],
  indexes: ReadonlyMap<string, number>,
): boolean {
  const VISITING = 1;
  const DONE = 2;
  const states = new Uint8Array(queries.length);
  const dependencies = queries.map((query) =>
    queryDependencies(query).flatMap((input) => {
      const index = indexes.get(input);
      return index === undefined ? [] : [index];
    }),
  );

  for (let root = 0; root < queries.length; root += 1) {
    if (states[root] !== 0) continue;

    const stack: Array<[node: number, next: number]> = [[root, 0]];
    states[root] = VISITING;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame === undefined) break;

      const [node, next] = frame;
      const child = dependencies[node]?.[next];
      if (child === undefined) {
        states[node] = DONE;
        stack.pop();
        continue;
      }

      frame[1] = next + 1;
      if (states[child] === VISITING) return true;
      if (states[child] === 0) {
        states[child] = VISITING;
        stack.push([child, 0]);
      }
    }
  }

  return false;
}

/** Shape and structural checks for an untrusted saved query list. */
export function validateSavedQueriesShape(
  value: unknown,
  path: string,
  issues: SavedQueryIssueSink,
): void {
  if (!Array.isArray(value)) {
    invalid(issues, path, "queries must be an array");
    return;
  }

  if (value.length > MAX_QUERIES) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Workbook query limit ${MAX_QUERIES} exceeded`,
    });
    return;
  }

  const shapeIssues: SavedQueryIssue[] = [];
  value.forEach((entry, index) => {
    validateSavedQueryShape(entry, `${path}[${index}]`, shapeIssues);
  });
  if (shapeIssues.length > 0) {
    issues.push(...shapeIssues);
    return;
  }

  // The shape checks above prove every entry is a saved query.
  validateQueryStructure(value as SavedQuery[], path, issues);
}

/** Admission checks for a shape-valid query that replaces the one with its ID. */
export function validateQueryAdmission(
  query: SavedQuery,
  queries: readonly SavedQuery[] | undefined,
  issues: SavedQueryIssueSink,
): void {
  validateQueryStructure(withQuery(queries, query) ?? [], "queries", issues);
}

/**
 * Admission checks for removing `id`: no remaining query may join it, so a
 * saved definition never names a missing input.
 */
export function validateQueryRemoval(
  id: string,
  queries: readonly SavedQuery[] | undefined,
  issues: SavedQueryIssueSink,
): void {
  if (!findQuery(queries, id)) {
    issues.push({ path: "id", code: "missing-reference", message: "No saved query has this ID" });
    return;
  }

  validateQueryStructure(withoutQuery(queries, id) ?? [], "queries", issues);
}

function cloneSource(source: SavedQuerySource): SavedQuerySource {
  // Sources are plain JSON data, so a structured clone keeps every defined field.
  return structuredClone(source);
}

/** Deep copy of one saved query. */
export function cloneQuery(query: SavedQuery): SavedQuery {
  return {
    id: query.id,
    name: query.name,
    source: cloneSource(query.source),
    steps: structuredClone(query.steps),
    ...(query.output
      ? {
          output: {
            table: query.output.table,
            tableName: query.output.tableName,
            anchor: { ...query.output.anchor },
          },
        }
      : {}),
  };
}

/** Deep copies of `queries`, or none. */
function cloneQueries(queries: readonly SavedQuery[] | undefined): SavedQuery[] {
  return (queries ?? []).map(cloneQuery);
}

/**
 * A copy of `queries` with `query` inserted, or replacing the one with its
 * ID. Order is insertion order, so a replaced query keeps its position.
 */
export function withQuery(
  queries: readonly SavedQuery[] | undefined,
  query: SavedQuery,
): SavedQuery[] {
  const next = cloneQueries(queries);
  const index = next.findIndex((candidate) => candidate.id === query.id);
  if (index < 0) next.push(cloneQuery(query));
  else next[index] = cloneQuery(query);
  return next;
}

/** A copy of `queries` without `id`; an empty list is `undefined`, meaning no queries. */
export function withoutQuery(
  queries: readonly SavedQuery[] | undefined,
  id: string,
): SavedQuery[] | undefined {
  const next = cloneQueries(queries).filter((candidate) => candidate.id !== id);
  return next.length > 0 ? next : undefined;
}

/** The saved query with `id`, if there is one. */
export function findQuery(
  queries: readonly SavedQuery[] | undefined,
  id: string,
): SavedQuery | undefined {
  return queries?.find((candidate) => candidate.id === id);
}
