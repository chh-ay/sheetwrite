import { readFileSync } from "node:fs";

import { createLoader } from "./loader-state.mjs";
import init, { initSync } from "./pkg/sheetwrite_wasm.js";
import { adoptPublishedModule, createInstance } from "./pkg/sheetwrite_wasm_factory.js";

export * from "./pkg/sheetwrite_wasm.js";

/**
 * The bundled engine's bytes. The read is synchronous: compiling the bytes
 * blocks the thread far longer, and an asynchronous read waits on the thread
 * pool for each of its open, size, read and close steps, which takes longer
 * than the read itself.
 */
function read_bundled_engine() {
  return readFileSync(new URL("./pkg/sheetwrite_wasm_bg.wasm", import.meta.url));
}

const loader = createLoader(async (source) => {
  if (source !== undefined) {
    await init({ module_or_path: source });
    return;
  }

  initSync({ module: read_bundled_engine() });
});

export const { load, isLoaded } = loader;

/** Create an independently collectible engine, optionally reusing compiled code. */
export async function createEngine(source) {
  const engine = createInstance();

  if (source === undefined) {
    engine.initSync({ module: read_bundled_engine() });
  } else {
    await engine.init({ module_or_path: source });
  }

  await loader.adopt(source, () => adoptPublishedModule(engine.getModule()));

  return engine;
}
