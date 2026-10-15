import * as defaultEngine from "@sheetwrite/wasm";

/** A complete engine module from `@sheetwrite/wasm` or `@sheetwrite/formulas`. */
export interface SheetwriteEngine {
  CellStore: typeof defaultEngine.CellStore;
  load: typeof defaultEngine.load;
  isLoaded: typeof defaultEngine.isLoaded;
  createEngine: typeof defaultEngine.createEngine;
  createLoadedEngine: typeof defaultEngine.createLoadedEngine;
  /** The optional full engine reports its accepted function names. */
  functionNames?: () => string[];
}

let selectedEngine: SheetwriteEngine = defaultEngine;
let pendingEngine: SheetwriteEngine | undefined;
let engineInstance: defaultEngine.EngineInstance | undefined;
let initialization: Promise<void> | undefined;
let selectedSource: Parameters<SheetwriteEngine["load"]>[0];

export let engineFunctionNames: readonly string[] | undefined;

export function getEngine(): defaultEngine.EngineInstance {
  if (!engineInstance) adoptLoadedEngine();
  if (!engineInstance) throw new Error("Sheetwrite: await initSheetwrite() first");
  return engineInstance;
}

export function isEngineLoaded(): boolean {
  return engineInstance !== undefined || (!initialization && selectedEngine.isLoaded());
}

// An app that awaited the engine package's own load() gets a core instance from that module.
function adoptLoadedEngine(): void {
  if (initialization || !selectedEngine.isLoaded()) return;

  engineInstance = selectedEngine.createLoadedEngine();
  engineFunctionNames = engineInstance.functionNames?.();
}

export async function loadEngine(
  source: Parameters<SheetwriteEngine["load"]>[0],
  engine?: SheetwriteEngine,
): Promise<void> {
  const requested = engine ?? pendingEngine ?? selectedEngine;
  if (
    (pendingEngine && pendingEngine !== requested) ||
    (engineInstance && selectedEngine !== requested)
  ) {
    throw new Error(
      "Sheetwrite: select one engine before initialization; the engine cannot change.",
    );
  }

  if (initialization) {
    if (source !== undefined && source !== selectedSource) {
      throw new Error(
        "Sheetwrite: concurrent load() with a different source while initialization is in flight",
      );
    }

    return initialization;
  }

  if (engineInstance) {
    if (source !== undefined && source !== selectedSource) {
      console.warn(
        "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
      );
    }

    return;
  }

  pendingEngine = requested;
  selectedSource = source;
  initialization = (async () => {
    try {
      const instance = await requested.createEngine(source);
      selectedEngine = requested;
      engineInstance = instance;
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
