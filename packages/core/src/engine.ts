import * as defaultEngine from "@sheetwrite/wasm";

import { SheetwriteError } from "./errors.js";

/** A complete engine module from `@sheetwrite/wasm` or `@sheetwrite/formulas`. */
export interface SheetwriteEngine {
  /** The engine's cell store class. */
  CellStore: defaultEngine.EngineInstance["CellStore"];
  /** Loads and starts the engine's WASM, from the given source or the bundled file. */
  load: typeof defaultEngine.load;
  /** Whether `load` has finished. */
  isLoaded: typeof defaultEngine.isLoaded;
  /** Creates a separate engine instance with its own WASM memory. */
  createEngine: typeof defaultEngine.createEngine;
  /** The optional full engine reports its accepted function names. */
  functionNames?: () => string[];
}

let selected_engine: SheetwriteEngine = defaultEngine;
let pending_engine: SheetwriteEngine | undefined;
let engine_instance: defaultEngine.EngineInstance | undefined;
let initialization: Promise<void> | undefined;
let selected_source: Parameters<SheetwriteEngine["load"]>[0];

/**
 * Counts engine stops. A store or grid keeps the value from its construction;
 * a different current value means its instance is dead. Memory release moves
 * every live store to the new instance, so it does not change the value.
 */
let generation = 0;

/** Compiled module of a stopped instance; the restart instantiates it again without a fetch. */
let stopped_module: WebAssembly.Module | undefined;

const failure_listeners = new Set<(failure: SheetwriteError) => void>();

export let engineFunctionNames: readonly string[] | undefined;

export const ENGINE_LOAD_HINT =
  "Calling load() from @sheetwrite/wasm or @sheetwrite/formulas does not initialize core.";

/** The one `engine-failed` shape: the first trap is its `cause`; later refusals have none. */
export function engineFailedError(cause?: unknown): SheetwriteError {
  return new SheetwriteError(
    "engine-failed",
    "engine",
    "Sheetwrite: the engine stopped after an internal failure. Call initSheetwrite() again and recreate the grid from a saved document.",
    cause === undefined ? undefined : { cause },
  );
}

/** How deep `hasCause` follows `cause`: engine layers wrap a failure at most twice. */
const CAUSE_DEPTH = 3;

export function getEngine(): defaultEngine.EngineInstance {
  if (!engine_instance) {
    if (stopped_module) throw engineFailedError();

    throw new SheetwriteError(
      "initialization-required",
      "engine",
      `Sheetwrite: await initSheetwrite() first. ${ENGINE_LOAD_HINT}`,
    );
  }

  return engine_instance;
}

/**
 * Run `use` with an engine instance for formula text work that needs no
 * store. Codecs can run before grid initialization without selecting its
 * engine: an initialized document lends its engine; otherwise a temporary
 * instance releases its memory when `use` returns.
 */
export async function lendEngine<T>(use: (engine: defaultEngine.EngineInstance) => T): Promise<T> {
  const engine = engine_instance ?? (await defaultEngine.createEngine());
  const temporary = engine !== engine_instance;
  try {
    return use(engine);
  } finally {
    if (temporary) engine.retire();
  }
}

export function isEngineLoaded(): boolean {
  return engine_instance !== undefined;
}

export function engineGeneration(): number {
  return generation;
}

/** Whether `error` or one of the causes it wraps (engine layers wrap with `cause`) passes `test`. */
export function hasCause(error: unknown, test: (cause: Error) => boolean): boolean {
  let current = error;

  for (let depth = 0; depth < CAUSE_DEPTH && current instanceof Error; depth++) {
    if (test(current)) return true;
    current = current.cause;
  }

  return false;
}

/**
 * A WASM trap (`unreachable` after a Rust panic, out-of-bounds access) stops
 * the call with its Rust state half-written: borrow flags stay set and
 * partial writes stay in linear memory. No later call into that instance can
 * be trusted, so a trap is never retried.
 */
export function isEngineTrap(error: unknown): boolean {
  return hasCause(error, (cause) => cause instanceof WebAssembly.RuntimeError);
}

/**
 * Stop the instance of `owner` (a value from `engineGeneration()`) after a
 * trap and return the `engine-failed` error to throw. Stores and grids of that
 * instance refuse work from now on; `initSheetwrite()` starts a fresh instance.
 * A trap from an instance that already stopped changes nothing.
 */
export function stopEngine(cause: unknown, owner: number): SheetwriteError {
  const failure = engineFailedError(cause);
  if (owner !== generation || !engine_instance) return failure;

  stopped_module = engine_instance.getModule();
  engine_instance = undefined;
  generation += 1;

  for (const listener of [...failure_listeners]) {
    try {
      listener(failure);
    } catch (error) {
      // One broken listener must not skip the others or replace `failure`
      // for the caller; report it as an uncaught error instead.
      queueMicrotask(() => {
        throw error;
      });
    }
  }

  return failure;
}

/** Called synchronously inside `stopEngine`; a listener must not call the engine. */
export function onEngineFailure(listener: (failure: SheetwriteError) => void): () => void {
  failure_listeners.add(listener);
  return () => failure_listeners.delete(listener);
}

export async function loadEngine(
  source: Parameters<SheetwriteEngine["load"]>[0],
  engine?: SheetwriteEngine,
): Promise<void> {
  const requested = engine ?? pending_engine ?? selected_engine;
  const selected = engine_instance !== undefined || stopped_module !== undefined;
  if (
    (pending_engine && pending_engine !== requested) ||
    (selected && selected_engine !== requested)
  ) {
    throw new SheetwriteError(
      "initialization-failed",
      "initialize",
      "Sheetwrite: select one engine before initialization; the engine cannot change.",
    );
  }

  if (initialization) {
    if (source !== undefined && source !== selected_source) {
      throw new SheetwriteError(
        "initialization-failed",
        "initialize",
        "Sheetwrite: concurrent load() with a different source while initialization is in flight",
      );
    }

    return initialization;
  }

  if (selected && source !== undefined && source !== selected_source) {
    console.warn(
      "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
    );
  }

  if (engine_instance) return;

  const restart = stopped_module;
  pending_engine = requested;
  if (!restart) selected_source = source;
  initialization = (async () => {
    try {
      const instance = await requested.createEngine(restart ?? source);
      selected_engine = requested;
      engine_instance = instance;
      stopped_module = undefined;
      engineFunctionNames = instance.functionNames?.();
    } finally {
      pending_engine = undefined;
      initialization = undefined;
    }
  })();

  return initialization;
}

/** Prepare without changing the live engine or retaining the old linear memory. */
export function prepareEngineInstance(): Promise<defaultEngine.EngineInstance> {
  return selected_engine.createEngine(getEngine().getModule());
}

/** Called only after every live store has successfully prepared its replacement. */
export function replaceEngineInstance(instance: defaultEngine.EngineInstance): void {
  engine_instance = instance;
}

/**
 * Construct engine objects on a private `instance`, for example a disposable
 * replay store. Its cell store then lives in that instance's linear memory, so
 * retiring the instance returns the memory; the document engine does not grow.
 * `build` must be synchronous: the document engine is selected again on return.
 */
export function buildOnEngineInstance<T>(
  instance: defaultEngine.EngineInstance,
  build: () => T,
): T {
  const document_instance = getEngine();
  engine_instance = instance;
  try {
    return build();
  } finally {
    // A trap inside `build` stops the engine; do not revive a stopped generation.
    if (engine_instance === instance) engine_instance = document_instance;
  }
}
