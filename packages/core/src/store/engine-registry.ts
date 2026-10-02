import type { StoreDataEngine } from "./data-engine.js";

/**
 * Engines keyed by the store facade that owns them.
 *
 * Internal controllers need store capabilities that the published
 * `SheetwriteStore` surface does not carry (the API report pins that surface),
 * so the facade registers its engine here and internal callers look it up by
 * store. The map holds no strong references, so a store stays collectable.
 */
const ENGINES = new WeakMap<object, StoreDataEngine>();

/** Record the engine behind a store facade. Called once per constructed store. */
export function registerStoreEngine(store: object, engine: StoreDataEngine): void {
  ENGINES.set(store, engine);
}

/**
 * Engine behind a store facade, or `null` for an object that only claims the
 * store type. Every `SheetwriteStore` registers on construction; a `null` result
 * tells a caller to fall back to the store's public surface.
 */
export function storeEngine(store: object): StoreDataEngine | null {
  return ENGINES.get(store) ?? null;
}
