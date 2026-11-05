import type { SyncInitInput } from "../pkg/sheetwrite_queries.js";
import type { QueryEngine } from "./types.js";

export { QueryError } from "./errors.js";
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
