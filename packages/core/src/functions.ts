import { HostFunctionRegistry, invalidFunction, storeFunctions } from "./functions/registry.js";
import type { FormulaFunction, FormulaFunctionMetadata } from "./functions/types.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { SheetwriteAddon } from "./types/addon.js";
import type { Store } from "./types/store.js";

export {
  analyzeFormula,
  type FormulaAnalysis,
  type FormulaCall,
  type FormulaCellPosition,
  type FormulaCompletion,
  type FormulaDiagnostic,
  type FormulaReference,
  type FormulaToken,
  type FormulaTokenKind,
} from "./formula-analysis.js";

export {
  previewFormula,
  type FormulaPreview,
  type FormulaPreviewUnavailable,
  type FormulaPreviewValue,
} from "./formula-preview.js";

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

/** One host function: its metadata and the JavaScript that computes it. */
export interface FormulaFunctionDefinition {
  readonly metadata: FormulaFunctionMetadata;
  readonly implementation: FormulaFunction;
}

/** Register `functions` on the store of a new grid, then recalculate once. */
function registerFunctions(store: Store, functions: readonly FormulaFunctionDefinition[]): void {
  if (functions.length === 0) return;

  const engine = engineOf(store);
  let registry = registryOf(engine);
  if (registry === undefined) {
    registry = new HostFunctionRegistry();
    engine.installHostFunctions(registry);
    registries.set(engine, registry);
  }

  for (const { metadata, implementation } of functions) registry.register(metadata, implementation);

  // The engine already recalculated every formula. This public call sends the
  // change event that a grid repaints on; it also refreshes volatile values.
  store.recalculateVolatile();
}

/**
 * The custom functions add-on. Each function is a synchronous JavaScript
 * function that formulas can call. `functions` apply to every grid created
 * after `initSheetwrite`; grid-specific functions go in
 * `createGrid(host, { addons: { functions: [...] } })` and apply to that grid
 * only. A grid-specific function replaces an init function with the same name
 * in that grid. Functions register when the grid is created; there is no
 * later add or remove.
 *
 * A function receives each argument as a scalar, or as row arrays for a block
 * of more than one cell, and returns a number, text, boolean, or `null` for an
 * empty result. A thrown error or any other result shows `#VALUE!`. The
 * function must not read calculated cells or change the store: calls that
 * need the engine throw a `blocked` error. Snapshots keep only formula text.
 *
 * `createGrid` throws a `SheetwriteError` with code `invalid-function` when a
 * name is a built-in function, a cell reference or not a function name, or the
 * metadata is malformed, and `optional-backend-unavailable` on the default
 * engine, because only the full engine (`@sheetwrite/formulas`) has host
 * functions.
 *
 * @example
 * ```ts
 * import { initSheetwrite } from "@sheetwrite/core";
 * import { functionsAddon } from "@sheetwrite/core/functions";
 * import * as formulas from "@sheetwrite/formulas";
 *
 * await initSheetwrite({
 *   engine: formulas,
 *   addons: [
 *     functionsAddon([
 *       {
 *         metadata: {
 *           name: "TAXRATE",
 *           description: "Sales tax rate of a region.",
 *           arguments: [{ name: "region", types: ["text"] }],
 *           returnKind: "number",
 *         },
 *         implementation: (region) => (region === "EU" ? 0.2 : 0.07),
 *       },
 *     ]),
 *   ],
 * });
 * ```
 * @see /docs/features/formulas/custom-functions/
 */
export function functionsAddon(
  functions: readonly FormulaFunctionDefinition[] = [],
): SheetwriteAddon<readonly FormulaFunctionDefinition[]> {
  return {
    name: "functions",
    grid({ grid, settings }) {
      registerFunctions(grid.store, [...functions, ...(settings ?? [])]);
    },
  };
}

/**
 * Metadata of every function that formulas in `store` can call: the built-in
 * functions of the active engine, then the host functions of `store` in
 * registration order. Formula help reads this one list. The built-in table
 * loads on the first call, so the result is a promise.
 */
export async function listFunctions(store: Store): Promise<readonly FormulaFunctionMetadata[]> {
  // Only a SheetwriteStore has an engine; for any other store this throws.
  engineOf(store);

  return storeFunctions(store);
}
