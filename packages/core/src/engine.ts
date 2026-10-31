import * as defaultEngine from "@sheetwrite/wasm";

import { SheetwriteError } from "./errors.js";
import { forgetLiveStoreEngines } from "./store/engine-registry.js";

/** A complete engine module from `@sheetwrite/wasm` or `@sheetwrite/formulas`. */
export interface SheetwriteEngine {
  CellStore: defaultEngine.EngineInstance["CellStore"];
  load: typeof defaultEngine.load;
  isLoaded: typeof defaultEngine.isLoaded;
  createEngine: typeof defaultEngine.createEngine;
  /** The optional full engine reports its accepted function names. */
  functionNames?: () => string[];
}

let selectedEngine: SheetwriteEngine = defaultEngine;
let pendingEngine: SheetwriteEngine | undefined;
let engineInstance: defaultEngine.EngineInstance | undefined;
let initialization: Promise<void> | undefined;
let selectedSource: Parameters<SheetwriteEngine["load"]>[0];

/**
 * Counts engine stops. A store or grid keeps the value from its construction;
 * a different current value means its instance is dead. Memory release moves
 * every live store to the new instance, so it does not change the value.
 */
let generation = 0;

/** Compiled module of a stopped instance; the restart instantiates it again without a fetch. */
let stoppedModule: WebAssembly.Module | undefined;

const failureListeners = new Set<(failure: SheetwriteError) => void>();

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
  if (!engineInstance) {
    if (stoppedModule) throw engineFailedError();

    throw new SheetwriteError(
      "initialization-required",
      "engine",
      `Sheetwrite: await initSheetwrite() first. ${ENGINE_LOAD_HINT}`,
    );
  }

  return engineInstance;
}

export function isEngineLoaded(): boolean {
  return engineInstance !== undefined;
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
  if (owner !== generation || !engineInstance) return failure;

  stoppedModule = engineInstance.getModule();
  engineInstance = undefined;
  generation += 1;
  forgetLiveStoreEngines();

  for (const listener of [...failureListeners]) {
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
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export async function loadEngine(
  source: Parameters<SheetwriteEngine["load"]>[0],
  engine?: SheetwriteEngine,
): Promise<void> {
  const requested = engine ?? pendingEngine ?? selectedEngine;
  const selected = engineInstance !== undefined || stoppedModule !== undefined;
  if (
    (pendingEngine && pendingEngine !== requested) ||
    (selected && selectedEngine !== requested)
  ) {
    throw new SheetwriteError(
      "initialization-failed",
      "initialize",
      "Sheetwrite: select one engine before initialization; the engine cannot change.",
    );
  }

  if (initialization) {
    if (source !== undefined && source !== selectedSource) {
      throw new SheetwriteError(
        "initialization-failed",
        "initialize",
        "Sheetwrite: concurrent load() with a different source while initialization is in flight",
      );
    }

    return initialization;
  }

  if (selected && source !== undefined && source !== selectedSource) {
    console.warn(
      "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
    );
  }

  if (engineInstance) return;

  const restart = stoppedModule;
  pendingEngine = requested;
  if (!restart) selectedSource = source;
  initialization = (async () => {
    try {
      const instance = await requested.createEngine(restart ?? source);
      selectedEngine = requested;
      engineInstance = instance;
      stoppedModule = undefined;
      engineFunctionNames = instance.functionNames?.();
    } finally {
      pendingEngine = undefined;
      initialization = undefined;
    }
  })();

  return initialization;
}

/** Prepare without changing the live engine or retaining the old linear memory. */
export function prepareEngineInstance(): Promise<defaultEngine.EngineInstance> {
  return selectedEngine.createEngine(getEngine().getModule());
}

/** Called only after every live store has successfully prepared its replacement. */
export function replaceEngineInstance(instance: defaultEngine.EngineInstance): void {
  engineInstance = instance;
}
