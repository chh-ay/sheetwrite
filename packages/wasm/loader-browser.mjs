import { createLoader } from "./loader-state.mjs";
import init from "./pkg/sheetwrite_wasm.js";
import { createInstance } from "./pkg/sheetwrite_wasm_factory.js";

export * from "./pkg/sheetwrite_wasm.js";

const loader = createLoader(async (source) => {
  if (source === undefined) {
    await init();
    return;
  }
  await init({ module_or_path: source });
});

export const { load, isLoaded } = loader;

/** Create an independently collectible engine, optionally reusing compiled code. */
export async function createEngine(source) {
  const engine = createInstance();
  await engine.init(source === undefined ? undefined : { module_or_path: source });
  loader.adopt(source);
  return engine;
}
