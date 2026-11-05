import type { Grid, PowerQueryCodec } from "@sheetwrite/core";

import type { SyncInitInput as PowerQuerySyncInitInput } from "../pkg-power-query/sheetwrite_power_query.js";
import type { SyncInitInput } from "../pkg/sheetwrite_queries.js";
import { connect } from "./connect.js";
import type { QuerySession, QuerySessionOptions } from "./session.js";
import type { QueryEngine } from "./types.js";

export { QueryError } from "./errors.js";
export type {
  QueryDefinitionResult,
  QueryFetchContext,
  QueryFetchRequest,
  QueryFetchResult,
  QueryFetchSource,
  QueryOutputBlock,
  QueryRefreshOptions,
  QueryRefreshResult,
  QuerySession,
  QuerySessionOptions,
} from "./session.js";
export type {
  QueryAggregate,
  QueryBatch,
  QueryColumn,
  QueryColumnSpec,
  QueryColumnType,
  QueryDiagnostic,
  QueryEngine,
  QueryInput,
  QueryJoinKind,
  QueryLimits,
  QueryMixedLanes,
  QueryPredicate,
  QuerySource,
  QueryStep,
} from "./types.js";

/** Hosts can provide the compiled codec artifact, `@sheetwrite/queries/power-query-wasm`. */
export interface PowerQueryCodecOptions {
  /** Compiled module or artifact bytes, as accepted by the generated bindings. */
  readonly wasm?: PowerQuerySyncInitInput;
}

/** Hosts can provide the compiled artifact instead of using browser artifact loading. */
export interface QueryEngineOptions {
  /** Compiled module or artifact bytes, as accepted by the generated bindings. */
  readonly wasm?: SyncInitInput;
}

/**
 * Importing this package loads no WASM; only this explicit call loads query execution.
 *
 * @example
 * ```ts
 * import { loadQueryEngine } from "@sheetwrite/queries";
 *
 * async function selectLargeTotals() {
 *   const engine = await loadQueryEngine();
 *   const source = engine.parse(
 *     new TextEncoder().encode('[{"Total":120},{"Total":75}]'),
 *     { format: "json", columns: [{ id: "total", name: "Total", type: "number" }] },
 *   );
 *
 *   return engine.execute(source, [
 *     { kind: "filter", predicate: { kind: "compare", column: "total", op: "gte", value: 100 } },
 *   ]);
 * }
 * ```
 */
export async function loadQueryEngine(options: QueryEngineOptions = {}): Promise<QueryEngine> {
  // The bridge also stays lazy: unused queries must not allocate text codecs.
  const [wasm, { createEngine }] = await Promise.all([
    import("../pkg/sheetwrite_queries.js"),
    import("./bridge.js"),
  ]);
  await wasm.default(options.wasm === undefined ? undefined : { module_or_path: options.wasm });

  return createEngine(wasm);
}

/**
 * The one registration call for workbook queries: loads the engine and binds
 * saved queries of `grid` to the host's `fetchSource`. Workbooks that never
 * call it load no query code or WASM.
 *
 * @example
 * ```ts
 * import type { Grid, PowerQueryCodec } from "@sheetwrite/core";
 * import { createQuerySession } from "@sheetwrite/queries";
 *
 * async function refreshSales(grid: Grid) {
 *   const session = await createQuerySession(grid, {
 *     fetchSource: async (request, { signal }) => {
 *       const response = await fetch(`/sources/${request.sourceId}`, { signal });
 *       return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()) };
 *     },
 *   });
 *
 *   return session.refreshAll();
 * }
 * ```
 */
export async function createQuerySession(
  grid: Grid,
  options: QuerySessionOptions & QueryEngineOptions,
): Promise<QuerySession> {
  return connect(grid, options, await loadQueryEngine(options));
}

/**
 * Loads the Power Query codec for XLSX import and export. It translates saved
 * queries to M and reads imported M as text; it never evaluates M.
 *
 * @example
 * ```ts
 * import type { WorkbookSnapshot } from "@sheetwrite/core";
 * import { loadPowerQueryCodec } from "@sheetwrite/queries";
 *
 * async function exportedM(snapshot: WorkbookSnapshot) {
 *   const codec = await loadPowerQueryCodec();
 *   return codec.encode(snapshot.workbook.queries ?? []).section;
 * }
 * ```
 */
export async function loadPowerQueryCodec(
  options: QueryEngineOptions = {},
): Promise<PowerQueryCodec> {
  // The codec is its own artifact, so workbooks that only run queries never load it.
  const [wasm, { createPowerQueryCodec }] = await Promise.all([
    import("../pkg-power-query/sheetwrite_power_query.js"),
    import("./power-query.js"),
  ]);
  await wasm.default(options.wasm === undefined ? undefined : { module_or_path: options.wasm });

  return createPowerQueryCodec(wasm);
}
