import init from "./pkg-history/sheetwrite_history.js";

export { DiffKernel } from "./pkg-history/sheetwrite_history.js";

/** @type {Promise<void> | undefined} */
let loading;

/**
 * Instantiate the history diff kernel once. A failed load can be retried.
 *
 * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
 */
export function loadHistoryKernel(source) {
  loading ??= init(source === undefined ? undefined : { module_or_path: source }).then(
    () => undefined,
    (error) => {
      loading = undefined;
      throw error;
    },
  );

  return loading;
}
