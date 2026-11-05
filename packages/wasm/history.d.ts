export { DiffKernel } from "./pkg-history/sheetwrite_history.js";

/**
 * Instantiate the history-only diff kernel once. It is a separate WASM module
 * with no formula engine; `@sheetwrite/core/history` loads it the first time a
 * diff runs. `source` overrides where the WASM comes from, for example a URL
 * that a bundler emitted for `@sheetwrite/wasm/history/wasm`. A failed load
 * can be retried.
 */
export function loadHistoryKernel(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>;
