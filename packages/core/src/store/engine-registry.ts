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

/**
 * Engine behind a store facade, or `null` for an object that only claims the
 * store type. Every `SheetwriteStore` registers on construction; a `null` result
 * tells a caller to fall back to the store's public surface.
 */
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

/**
 * Drop every store from the live set after the engine stops. Those stores keep
 * their dead instance, so `releaseEngineMemory()` must never migrate them. A
 * later finalizer callback for a dropped entry deletes nothing.
 */
export function forgetLiveStoreEngines(): void {
  LIVE_ENGINES.clear();
}
