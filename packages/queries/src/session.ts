import type {
  ApplyTransactionResult,
  DocumentOp,
  Grid,
  Range,
  SavedQuery,
  SavedQueryOutput,
  SavedQuerySource,
  Sheet,
  Workbook,
  WorkbookTable,
} from "@sheetwrite/core";
import { registerQueryCommands } from "@sheetwrite/core";

import { sessionCommands } from "./commands.js";
import { QueryError } from "./errors.js";
import { packOutput } from "./materialize.js";
import type {
  QueryBatch,
  QueryColumn,
  QueryColumnSpec,
  QueryDiagnostic,
  QueryEngine,
  QueryInput,
  QueryLimits,
  QuerySource,
} from "./types.js";

/** What the host must load for one saved query. It never carries credentials. */
export interface QueryFetchRequest {
  readonly queryId: string;
  /** Host-defined source identity; the host maps it to its own credentials and policy. */
  readonly sourceId: string;
  readonly kind: SavedQuerySource["kind"];
  /** Public, credential-free locator from the saved definition, if any. */
  readonly locator?: string;
}

/** CSV and JSON sources return bytes; host sources return typed batches. */
export type QueryFetchResult =
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "batch"; readonly batch: QueryBatch };

/** The signal aborts when the refresh is cancelled or the session is disposed. */
export interface QueryFetchContext {
  readonly signal: AbortSignal;
}

/** The only path to source data; the session never calls a global `fetch`. */
export type QueryFetchSource = (
  request: QueryFetchRequest,
  context: QueryFetchContext,
) => Promise<QueryFetchResult>;

/** Host I/O for a session; the engine limits apply to every parse and execution. */
export interface QuerySessionOptions {
  readonly fetchSource: QueryFetchSource;
  readonly limits?: Partial<QueryLimits>;
}

/** Why an output table could not be written without touching unrelated cells. */
export type QueryOutputBlock = "missing-sheet" | "too-wide" | "occupied";

/** A definition the engine rejects, or the store's transaction result. */
export type QueryDefinitionResult =
  | { readonly status: "invalid"; readonly diagnostic: QueryDiagnostic }
  | ApplyTransactionResult;

/** One refresh commits every requested output in one transaction, or none. */
export type QueryRefreshResult =
  | { readonly status: "applied"; readonly transaction: ApplyTransactionResult }
  | { readonly status: "failed"; readonly queryId: string; readonly diagnostic: QueryDiagnostic }
  | { readonly status: "blocked"; readonly queryId: string; readonly reason: QueryOutputBlock }
  | { readonly status: "missing"; readonly queryId: string }
  /** A definition or output table changed while sources loaded; nothing was written. */
  | { readonly status: "stale" }
  | { readonly status: "aborted" }
  | { readonly status: "rejected"; readonly transaction: ApplyTransactionResult };

/** The signal cancels a pending refresh before it writes anything. */
export interface QueryRefreshOptions {
  readonly signal?: AbortSignal;
}

/** Defines, removes and refreshes the saved queries of one grid. */
export interface QuerySession {
  /** Checks the plan in the engine, then saves it as one undoable change. */
  define(query: SavedQuery): QueryDefinitionResult;
  /** Removes a saved query; its output table and values stay. */
  remove(id: string): ApplyTransactionResult;
  /** Refreshes one query and the queries it joins, as one undoable change. */
  refresh(id: string, options?: QueryRefreshOptions): Promise<QueryRefreshResult>;
  /** Refreshes every query with an output table, as one undoable change. */
  refreshAll(options?: QueryRefreshOptions): Promise<QueryRefreshResult>;
  /** Aborts pending refreshes; later calls are rejected. */
  dispose(): void;
}

const DEFAULT_CSV_DELIMITER = 44;

function emptyColumn(spec: QueryColumnSpec): QueryColumn {
  const state = {
    id: spec.id,
    name: spec.name,
    validity: new Uint8Array(),
    errorRows: new Uint32Array(),
    errorCodes: new Uint32Array(),
    errorPool: [],
  };

  switch (spec.type) {
    case "number":
      return { ...state, type: "number", values: new Float64Array() };
    case "logical":
      return { ...state, type: "logical", values: new Uint8Array() };
    case "text":
      return { ...state, type: "text", bytes: new Uint8Array(), offsets: Uint32Array.of(0) };
    case "date":
      return { ...state, type: "date", values: new Int32Array() };
    case "dateTime":
      return { ...state, type: "dateTime", values: new BigInt64Array() };
    case "mixed":
      return {
        ...state,
        type: "mixed",
        tags: new Uint8Array(),
        indexes: new Uint32Array(),
        numbers: new Float64Array(),
        logical: new Uint8Array(),
        text: new Uint8Array(),
        offsets: Uint32Array.of(0),
        dates: new Int32Array(),
        dateTimes: new BigInt64Array(),
      };
  }
}

/** A zero-row batch with the source schema, used to check plans without data. */
function emptyBatch(source: SavedQuerySource): QueryBatch {
  return { rowCount: 0, columns: source.columns.map(emptyColumn) };
}

function parseSpec(source: Exclude<SavedQuerySource, { kind: "host" }>): QuerySource {
  if (source.kind === "json") {
    return {
      format: "json",
      columns: source.columns,
      ...(source.path ? { path: source.path } : {}),
    };
  }

  return {
    format: "csv",
    columns: source.columns,
    delimiter: source.delimiter ?? DEFAULT_CSV_DELIMITER,
    ...(source.headers === undefined ? {} : { headers: source.headers }),
    ...(source.emptyIsNull === undefined ? {} : { emptyIsNull: source.emptyIsNull }),
  };
}

function diagnosticOf(error: unknown): QueryDiagnostic | undefined {
  return error instanceof QueryError ? error.diagnostic : undefined;
}

/** Saved queries in an order where every joined query comes before the query that reads it. */
function dependencyOrder(
  queries: readonly SavedQuery[],
  roots: readonly string[],
): SavedQuery[] | { missing: string } {
  const byId = new Map(queries.map((query) => [query.id, query]));
  const ordered: SavedQuery[] = [];
  const visited = new Set<string>();

  // Saved definitions have no cycle (core admission), so a post-order walk terminates.
  const visit = (id: string): string | undefined => {
    if (visited.has(id)) return undefined;

    const query = byId.get(id);
    if (!query) return id;

    visited.add(id);
    for (const step of query.steps) {
      if (step.kind !== "join") continue;

      const missing = visit(step.input);
      if (missing !== undefined) return missing;
    }

    ordered.push(query);
    return undefined;
  };

  for (const root of roots) {
    const missing = visit(root);
    if (missing !== undefined) return { missing };
  }

  return ordered;
}

function joinInputs(query: SavedQuery, results: ReadonlyMap<string, QueryBatch>): QueryInput[] {
  const inputs: QueryInput[] = [];

  for (const step of query.steps) {
    if (step.kind !== "join") continue;

    const batch = results.get(step.input);
    if (batch && !inputs.some((input) => input.id === step.input)) {
      inputs.push({ id: step.input, batch });
    }
  }

  return inputs;
}

function findTable(workbook: Workbook, id: string): WorkbookTable | undefined {
  for (const sheet of workbook.sheets) {
    const table = sheet.tables?.find((candidate) => candidate.id === id);
    if (table) return table;
  }

  return undefined;
}

function intersects(left: Range, right: Range): boolean {
  return (
    left.sheet === right.sheet &&
    left.start.row <= right.end.row &&
    right.start.row <= left.end.row &&
    left.start.col <= right.end.col &&
    right.start.col <= left.end.col
  );
}

function contains(range: Range | undefined, row: number, col: number): boolean {
  return (
    range !== undefined &&
    range.start.row <= row &&
    row <= range.end.row &&
    range.start.col <= col &&
    col <= range.end.col
  );
}

/** The state a refresh read; any change before commit makes the staged result stale. */
function fingerprint(workbook: Workbook, ids: readonly string[]): string {
  return JSON.stringify(
    ids.map((id) => {
      const query = workbook.queries?.find((candidate) => candidate.id === id);
      const table = query?.output ? findTable(workbook, query.output.table) : undefined;

      return [query ?? null, table ?? null];
    }),
  );
}

interface PlannedOutput {
  readonly range: Range;
  readonly patches: DocumentOp[];
}

/**
 * Writes `batch` into the query's output table. The table keeps its position
 * after structural edits; it is created at the saved anchor when absent.
 * Cells the table did not hold before must be empty and outside other
 * tables, so growth never overwrites unrelated data.
 */
function planOutput(
  grid: Grid,
  workbook: Workbook,
  output: SavedQueryOutput,
  batch: QueryBatch,
  planned: readonly Range[],
): PlannedOutput | QueryOutputBlock {
  const existing = findTable(workbook, output.table);
  const anchor = existing
    ? { sheet: existing.range.sheet, row: existing.range.start.row, col: existing.range.start.col }
    : output.anchor;
  const sheet: Sheet | undefined = workbook.sheets.find(
    (candidate) => candidate.id === anchor.sheet,
  );
  if (!sheet) return "missing-sheet";

  const block = packOutput(batch);
  const range: Range = {
    sheet: sheet.id,
    start: { row: anchor.row, col: anchor.col },
    end: { row: anchor.row + block.rowCount - 1, col: anchor.col + block.colCount - 1 },
  };
  if (range.end.col >= sheet.columns.length) return "too-wide";

  const others = (sheet.tables ?? []).filter((table) => table.id !== output.table);
  if (others.some((table) => intersects(table.range, range))) return "occupied";
  if (planned.some((other) => intersects(other, range))) return "occupied";

  const lastRow = Math.min(range.end.row, sheet.rowCount - 1);
  for (let row = range.start.row; row <= lastRow; row += 1) {
    for (let col = range.start.col; col <= range.end.col; col += 1) {
      if (contains(existing?.range, row, col)) continue;

      const address = { sheet: sheet.id, row, col };
      if (
        grid.store.getCell(address).resolved !== null ||
        grid.store.getFormula(address) !== null
      ) {
        return "occupied";
      }
    }
  }

  const patches: DocumentOp[] = [];
  if (range.end.row >= sheet.rowCount) {
    patches.push({
      op: "addRows",
      sheet: sheet.id,
      at: sheet.rowCount,
      count: range.end.row + 1 - sheet.rowCount,
    });
  }

  if (existing)
    patches.push({ op: "clearRange", range: existing.range, contents: true, style: true });
  patches.push({ op: "setBlock", range, block });

  const columns = batch.columns.map((column) => ({ id: column.id, name: column.name }));
  patches.push(
    existing
      ? { op: "updateTable", sheet: sheet.id, tableId: existing.id, patch: { range, columns } }
      : {
          op: "addTable",
          table: {
            id: output.table,
            name: output.tableName,
            range,
            columns,
            headerRow: true,
            totalsRow: false,
          },
        },
  );

  return { range, patches };
}

/** Builds a session over an already loaded engine; the package entry points load it. */
export function createSessionWithEngine(
  grid: Grid,
  engine: QueryEngine,
  options: QuerySessionOptions,
): QuerySession {
  const lifetime = new AbortController();

  const savedQueries = (): SavedQuery[] => structuredClone(grid.store.getWorkbook().queries ?? []);

  /** Runs each plan on zero-row inputs, so the engine checks columns, types and joins. */
  const check = (
    query: SavedQuery,
    queries: readonly SavedQuery[],
  ): QueryDiagnostic | undefined => {
    const order = dependencyOrder(
      [...queries.filter((candidate) => candidate.id !== query.id), query],
      [query.id],
    );
    if (!Array.isArray(order)) {
      return { code: "input", step: null, row: null, column: null };
    }

    const results = new Map<string, QueryBatch>();
    try {
      for (const entry of order) {
        results.set(
          entry.id,
          engine.execute(
            emptyBatch(entry.source),
            entry.steps,
            joinInputs(entry, results),
            options.limits,
          ),
        );
      }
    } catch (error) {
      const diagnostic = diagnosticOf(error);
      if (diagnostic) return diagnostic;

      throw error;
    }

    return undefined;
  };

  const load = async (query: SavedQuery, signal: AbortSignal): Promise<QueryBatch> => {
    const { source } = query;
    const fetched = await options.fetchSource(
      {
        queryId: query.id,
        sourceId: source.sourceId,
        kind: source.kind,
        ...(source.kind !== "host" && source.locator !== undefined
          ? { locator: source.locator }
          : {}),
      },
      { signal },
    );

    if (source.kind === "host") {
      if (fetched.kind !== "batch") {
        throw new QueryError({ code: "source-kind", step: null, row: null, column: null });
      }

      return fetched.batch;
    }

    if (fetched.kind !== "bytes") {
      throw new QueryError({ code: "source-kind", step: null, row: null, column: null });
    }

    return engine.parse(fetched.bytes, parseSpec(source), options.limits);
  };

  const run = async (
    roots: readonly string[],
    refreshOptions: QueryRefreshOptions | undefined,
  ): Promise<QueryRefreshResult> => {
    if (lifetime.signal.aborted || refreshOptions?.signal?.aborted) return { status: "aborted" };

    const signal = refreshOptions?.signal
      ? AbortSignal.any([lifetime.signal, refreshOptions.signal])
      : lifetime.signal;
    const queries = savedQueries();
    const order = dependencyOrder(queries, roots);
    if (!Array.isArray(order)) return { status: "missing", queryId: order.missing };

    const ids = order.map((query) => query.id);
    const before = fingerprint(grid.store.getWorkbook(), ids);
    const results = new Map<string, QueryBatch>();

    // Sources load in dependency order; staged results stay private until commit.
    for (const query of order) {
      let batch: QueryBatch;
      try {
        const source = await load(query, signal);
        if (signal.aborted) return { status: "aborted" };

        batch = engine.execute(source, query.steps, joinInputs(query, results), options.limits);
      } catch (error) {
        if (signal.aborted) return { status: "aborted" };

        const diagnostic = diagnosticOf(error);
        if (!diagnostic) throw error;

        return { status: "failed", queryId: query.id, diagnostic };
      }

      results.set(query.id, batch);
    }

    const workbook = grid.store.getWorkbook();
    if (fingerprint(workbook, ids) !== before) return { status: "stale" };

    const patches: DocumentOp[] = [];
    const planned: Range[] = [];
    for (const query of order) {
      const batch = results.get(query.id);
      if (!query.output || !batch || !roots.includes(query.id)) continue;

      const plan = planOutput(grid, workbook, query.output, batch, planned);
      if (typeof plan === "string") return { status: "blocked", queryId: query.id, reason: plan };

      planned.push(plan.range);
      patches.push(...plan.patches);
    }

    const transaction = grid.applyTransaction({ patches });
    return transaction.status === "applied"
      ? { status: "applied", transaction }
      : { status: "rejected", transaction };
  };

  const session: QuerySession = {
    define(query) {
      const diagnostic = check(query, savedQueries());
      if (diagnostic) return { status: "invalid", diagnostic };

      return grid.applyTransaction({ patches: [{ op: "setQuery", query }] });
    },

    remove(id) {
      return grid.applyTransaction({ patches: [{ op: "removeQuery", id }] });
    },

    refresh(id, refreshOptions) {
      return run([id], refreshOptions);
    },

    refreshAll(refreshOptions) {
      const roots = savedQueries()
        .filter((query) => query.output !== undefined)
        .map((query) => query.id);

      return run(roots, refreshOptions);
    },

    dispose() {
      lifetime.abort();
      unregister();
    },
  };

  // The grid's Get Data, Refresh All and Queries & Connections commands appear
  // while this session is alive.
  const unregister = registerQueryCommands(grid, sessionCommands(session));

  return session;
}
