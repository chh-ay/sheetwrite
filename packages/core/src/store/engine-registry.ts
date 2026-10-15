import type { StoreDataEngine } from "./data-engine.js";

// Internal controllers need capabilities outside the published store surface;
// weak references keep stores collectible.
const ENGINES = new WeakMap<object, StoreDataEngine>();

const LIVE_ENGINES = new Set<WeakRef<StoreDataEngine>>();

const finalized = new FinalizationRegistry<WeakRef<StoreDataEngine>>((ref) => {
  LIVE_ENGINES.delete(ref);
});

/** Record the engine behind a store facade. Called once per constructed store. */
export function registerStoreEngine(store: object, engine: StoreDataEngine): void {
  ENGINES.set(store, engine);

  const ref = new WeakRef(engine);
  LIVE_ENGINES.add(ref);
  finalized.register(engine, ref);
}

/** Return the registered engine, or `null` to use the store's public surface. */
export function storeEngine(store: object): StoreDataEngine | null {
  return ENGINES.get(store) ?? null;
}

/** Pin every currently live store for the duration of an atomic instance cutover. */
export function liveStoreEngines(): StoreDataEngine[] {
  const engines: StoreDataEngine[] = [];

  for (const ref of LIVE_ENGINES) {
    const engine = ref.deref();
    if (engine) engines.push(engine);
    else LIVE_ENGINES.delete(ref);
  }

  return engines;
}
