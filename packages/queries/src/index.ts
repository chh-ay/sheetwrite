import type { PowerQueryCodec, SheetwriteAddon } from "@sheetwrite/core";

import { createQueriesAddon, type QueriesAddonOptions, type QueryEngineOptions } from "./addon.js";
import type { QueryEngine } from "./types.js";

export { type QueriesAddonOptions, type QueryEngineOptions, querySessionOf } from "./addon.js";

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
 * The queries add-on. Each grid with a `fetchSource`, from `options` or from
 * `createGrid(host, { addons: { queries: { ... } } })`, gets a query session:
 * its Get Data, Refresh All and Queries & Connections commands, bound to the
 * host's `fetchSource`. The engine and its WASM load in the background when
 * such a grid is created; pages without the add-on load no query code. Get
 * the session with `querySessionOf(grid)`.
 *
 * @example
 * ```ts
 * import { initSheetwrite } from "@sheetwrite/core";
 * import { queriesAddon } from "@sheetwrite/queries";
 *
 * await initSheetwrite({
 *   addons: [
 *     queriesAddon({
 *       fetchSource: async (request, { signal }) => {
 *         const response = await fetch(`/sources/${request.sourceId}`, { signal });
 *         return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()) };
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function queriesAddon(
  options: QueriesAddonOptions = {},
): SheetwriteAddon<QueriesAddonOptions> {
  return createQueriesAddon(loadQueryEngine, options);
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
  const [wasm, { createPowerQueryCodec }] = await Promise.all([
    import("../pkg/sheetwrite_queries.js"),
    import("./power-query.js"),
  ]);
  await wasm.default(options.wasm === undefined ? undefined : { module_or_path: options.wasm });

  return createPowerQueryCodec(wasm);
}
