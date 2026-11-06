import { type Grid, SheetwriteError, type SheetwriteAddon } from "@sheetwrite/core";

import type { SyncInitInput } from "../pkg/sheetwrite_queries.js";
import type { QueryFetchSource, QuerySession } from "./session.js";
import type { QueryEngine, QueryLimits } from "./types.js";

/** Hosts can provide the compiled artifact instead of using browser artifact loading. */
export interface QueryEngineOptions {
 /** Compiled module or artifact bytes, as accepted by the generated bindings. */
  readonly wasm?: SyncInitInput;
}

/** Options of the queries add-on, at init or for one grid. */
export interface QueriesAddonOptions extends QueryEngineOptions {
 /** Loads the bytes or rows of a saved query's source; a grid without it has no query commands. */
 readonly fetchSource?: QueryFetchSource;
 /** Engine limits for each refresh. */
 readonly limits?: Partial<QueryLimits>;
}

/** The session of each grid the queries add-on applies to, while it loads and after. */
const SESSIONS = new WeakMap<Grid, Promise<QuerySession>>();

/**
 * The queries add-on for one way of loading the engine; the browser and Node
 * entry points differ only in that.
 */
export function createQueriesAddon(
 loadEngine: (options: QueryEngineOptions) => Promise<QueryEngine>,
 options: QueriesAddonOptions,
): SheetwriteAddon<QueriesAddonOptions> {
 return {
  name: "queries",
  grid({ grid, settings, queryCommands }) {
   const merged: QueriesAddonOptions = { ...options, ...settings };
   const fetchSource = merged.fetchSource;
   if (fetchSource === undefined) return;

   let session: QuerySession | undefined;
   let isDestroyed = false;

   // The session module loads with the engine, never with the package entry.
   const pending = Promise.all([loadEngine(merged), import("./session.js")]).then(
    ([engine, { createSessionWithEngine }]) => {
     session = createSessionWithEngine(
      grid,
      engine,
      { fetchSource, limits: merged.limits },
      queryCommands,
     );
     if (isDestroyed) session.dispose();

     return session;
    },
   );
   SESSIONS.set(grid, pending);

   return () => {
    isDestroyed = true;
    session?.dispose();
    SESSIONS.delete(grid);
   };
  },
 };
}

/**
 * The query session of `grid`. The queries add-on starts loading the engine
 * when the grid is created, so this resolves once it is ready. Rejects with
 * code `optional-backend-unavailable` when the add-on does not apply to the
 * grid: it is not installed, the grid is destroyed, or no `fetchSource` was
 * given.
 *
 * @example
 * ```ts
 * import type { Grid } from "@sheetwrite/core";
 * import { querySession } from "@sheetwrite/queries";
 *
 * async function refreshSales(grid: Grid) {
 *   const session = await querySession(grid);
 *   return session.refreshAll();
 * }
 * ```
 */
export function querySession(grid: Grid): Promise<QuerySession> {
 const pending = SESSIONS.get(grid);
 if (pending !== undefined) return pending;

 return Promise.reject(
  new SheetwriteError(
   "optional-backend-unavailable",
   "query",
   "Sheetwrite: this grid has no query session. Install queriesAddon({ fetchSource }) through initSheetwrite before creating the grid.",
   { context: { backend: "queries" }, retryable: false },
  ),
 );
}
