import { builtInFunctions, HostFunctionRegistry, invalidFunction } from "./functions/registry.js";
import type { FormulaFunction, FormulaFunctionMetadata } from "./functions/types.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { Store } from "./types/store.js";

export type {
  FormulaArgument,
  FormulaArgumentMetadata,
  FormulaFunction,
  FormulaFunctionMetadata,
  FormulaScalar,
} from "./functions/types.js";

/** Registries by engine, so a store that never registers a function holds none. */
const registries = new WeakMap<StoreDataEngine, HostFunctionRegistry>();

function engineOf(store: Store): StoreDataEngine {
  const engine = storeEngine(store);
  if (engine === null) {
    throw invalidFunction("Host functions need a SheetwriteStore", "");
  }

  return engine;
}

function registryOf(engine: StoreDataEngine): HostFunctionRegistry | undefined {
  const registry = registries.get(engine);
  registry?.assertIdle();

  return registry;
}

/**
 * Registers a synchronous JavaScript function that formulas in `store` can
 * call, then recalculates every formula. Registering a name again replaces the
 * function. The function receives each argument as a scalar, or as row arrays
 * for a block of more than one cell, and returns a number, text, boolean, or
 * `null` for an empty result. A thrown error or any other result shows
 * `#VALUE!`. The function must not read calculated cells or change the store:
 * calls that need the engine throw a `blocked` error. Snapshots keep only
 * formula text, so register the function after loading.
 *
 * @throws {SheetwriteError} `invalid-function` when the store is not a
 * `SheetwriteStore`, when the name is a built-in function, a cell reference, or
 * not a function name, or when the metadata is malformed; `blocked` when a
 * host function calls it; `optional-backend-unavailable` on the default
 * engine, because only the full engine (`@sheetwrite/formulas`) has host
 * functions.
 * @example
 * ```ts
 * import type { Store } from "@sheetwrite/core";
 * import { registerFunction } from "@sheetwrite/core/functions";
 *
 * function addTaxRate(store: Store) {
 *   registerFunction(
 *     store,
 *     {
 *       name: "TAXRATE",
 *       description: "Sales tax rate of a region.",
 *       arguments: [{ name: "region", types: ["text"] }],
 *       returnKind: "number",
 *     },
 *     (region) => (region === "EU" ? 0.2 : 0.07),
 *   );
 * }
 * ```
 * @see /docs/features/formulas/custom-functions/
 */
export function registerFunction(
  store: Store,
  metadata: FormulaFunctionMetadata,
  implementation: FormulaFunction,
): void {
  const engine = engineOf(store);
  let registry = registryOf(engine);
  if (registry === undefined) {
    registry = new HostFunctionRegistry();
    engine.installHostFunctions(registry);
    registries.set(engine, registry);
  }

  registry.register(metadata, implementation);

  // The engine already recalculated every formula. This public call sends the
  // change event that a grid repaints on; it also refreshes volatile values.
  store.recalculateVolatile();
}

/**
 * Removes a host function from `store`. Formulas that call it show `#NAME?`.
 * Returns whether the function existed.
 *
 * @throws {SheetwriteError} `blocked` when a host function calls it.
 */
export function unregisterFunction(store: Store, name: string): boolean {
  const removed = registryOf(engineOf(store))?.unregister(name) === true;
  if (removed) store.recalculateVolatile();

  return removed;
}

/**
 * Metadata of every function that formulas in `store` can call: the built-in
 * functions of the active engine, then the host functions of `store` in
 * registration order. Formula help reads this one list. The built-in table
 * loads on the first call, so the result is a promise.
 */
export async function listFunctions(store: Store): Promise<readonly FormulaFunctionMetadata[]> {
  const hostFunctions = registries.get(engineOf(store))?.metadata() ?? [];

  return [...(await builtInFunctions()), ...hostFunctions];
}
