import { createLoader } from "./loader-state.mjs";
import init from "./pkg/sheetwrite_wasm.js";
import {
  adoptPublishedModule,
  createInstance,
  createPublishedInstance,
} from "./pkg/sheetwrite_wasm_factory.js";

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
  await loader.adopt(source, () => adoptPublishedModule(engine.getModule()));
  return engine;
}

/** Create a fresh engine synchronously from the module the loader already compiled. */
export function createLoadedEngine() {
  if (!loader.isLoaded()) throw new Error("Sheetwrite: await load() first");

  return createPublishedInstance();
}
