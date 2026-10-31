import type { StoreDataEngine } from "./data-engine.js";

/**
 * Engines keyed by the store facade that owns them.
 *
 * Internal controllers need store capabilities that the published
 * `SheetwriteStore` surface does not carry (the API report pins that surface),
 * so the facade registers its engine here and internal callers look it up by
 * store. The map holds no strong references to its keys, so a store stays collectable.
 */
const ENGINES = new WeakMap<object, StoreDataEngine>();

/** Engine generation (see `engineGeneration`) of the instance each store was built on. */
const GENERATIONS = new WeakMap<object, number>();

/** Live engines and the engine generation each was built on. */
const LIVE_ENGINES = new Map<WeakRef<StoreDataEngine>, number>();

const finalized = new FinalizationRegistry<WeakRef<StoreDataEngine>>((ref) => {
  LIVE_ENGINES.delete(ref);
});

/** Record the engine behind a store facade. Called once per constructed store. */
export function registerStoreEngine(
  store: object,
  engine: StoreDataEngine,
  generation: number,
): void {
  ENGINES.set(store, engine);
  GENERATIONS.set(store, generation);

  const ref = new WeakRef(engine);
  LIVE_ENGINES.set(ref, generation);
  finalized.register(engine, ref);
}

/** Engine generation of a registered store; `undefined` for any other object. */
export function storeGeneration(store: object): number | undefined {
  return GENERATIONS.get(store);
}

/**
 * Engine behind a store facade, or `null` for an object that only claims the
 * store type. Every `SheetwriteStore` registers on construction; a `null` result
 * tells a caller to fall back to the store's public surface. Grid code reaches
 * the engine here instead of through the store, so the host function check
 * runs here too.
 */
export function storeEngine(store: object): StoreDataEngine | null {
  const engine = ENGINES.get(store);
  engine?.hostFunctions?.assertIdle();

  return engine ?? null;
}

/**
 * Pin every currently live store of the running engine (`generation`) for the
 * duration of an atomic instance cutover. Stores of a stopped engine keep
 * their dead instance, so they leave the live set and are never migrated.
 */
export function liveStoreEngines(generation: number): StoreDataEngine[] {
  const engines: StoreDataEngine[] = [];

  for (const [ref, built] of LIVE_ENGINES) {
    const engine = ref.deref();
    if (engine && built === generation) engines.push(engine);
    else LIVE_ENGINES.delete(ref);
  }

  return engines;
}

/** Drop one store whose cell store can no longer answer, so memory release skips it. */
export function forgetLiveStoreEngine(store: object): void {
  const engine = ENGINES.get(store);

  for (const ref of LIVE_ENGINES.keys()) {
    if (ref.deref() === engine) LIVE_ENGINES.delete(ref);
  }
}
