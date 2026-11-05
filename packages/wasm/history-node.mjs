import { readFile } from "node:fs/promises";

import init from "./pkg-history/sheetwrite_history.js";

export { DiffKernel } from "./pkg-history/sheetwrite_history.js";

/** @type {Promise<void> | undefined} */
let loading;

/**
 * Instantiate the history diff kernel once, reading its WASM from this
 * package unless `source` is given. A failed load can be retried.
 *
 * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
 */
export function loadHistoryKernel(source) {
  loading ??= (async () => {
    const module_or_path =
      source ??
      (await readFile(new URL("./pkg-history/sheetwrite_history_bg.wasm", import.meta.url)));

    await init({ module_or_path });
  })().catch((error) => {
    loading = undefined;
    throw error;
  });

  return loading;
}
