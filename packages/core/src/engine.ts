import * as defaultEngine from "@sheetwrite/wasm";

/** A complete engine module from `@sheetwrite/wasm` or `@sheetwrite/formulas`. */
export interface SheetwriteEngine {
  CellStore: typeof defaultEngine.CellStore;
  load: typeof defaultEngine.load;
  isLoaded: typeof defaultEngine.isLoaded;
  /** The optional full engine reports its accepted function names. */
  functionNames?: () => string[];
}

let selectedEngine: SheetwriteEngine = defaultEngine;
let pendingEngine: SheetwriteEngine | undefined;
export let engineFunctionNames: readonly string[] | undefined;

export function getEngine(): SheetwriteEngine {
  return selectedEngine;
}

export function isEngineLoaded(): boolean {
  return selectedEngine.isLoaded();
}

export async function loadEngine(
  source: Parameters<SheetwriteEngine["load"]>[0],
  engine?: SheetwriteEngine,
): Promise<void> {
  const requested = engine ?? pendingEngine ?? selectedEngine;
  if (
    (pendingEngine && pendingEngine !== requested) ||
    (selectedEngine.isLoaded() && selectedEngine !== requested)
  ) {
    throw new Error(
      "Sheetwrite: select one engine before initialization; the engine cannot change.",
    );
  }
  pendingEngine = requested;
  try {
    await requested.load(source);
    selectedEngine = requested;
    engineFunctionNames = requested.functionNames?.();
  } finally {
    if (pendingEngine === requested) pendingEngine = undefined;
  }
}
