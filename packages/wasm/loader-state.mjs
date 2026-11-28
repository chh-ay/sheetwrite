const DIFFERENT_SOURCE_IN_FLIGHT =
  "Sheetwrite: concurrent load() with a different source while initialization is in flight";
const DIFFERENT_SOURCE_AFTER_INIT =
  "Sheetwrite: load() called with a different source after initialization; keeping the first module.";

/**
 * Own the environment-neutral initialization lifecycle.
 *
 * @param {(source: BufferSource | URL | string | Request | WebAssembly.Module | undefined) => Promise<void>} initialize
 */
export function createLoader(initialize) {
  let ready = false;
  /** @type {Promise<void> | null} */
  let in_flight = null;
  /** @type {unknown} */
  let selected_source;

  /**
   * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
   */
  async function load(source) {
    if (ready) {
      if (source !== undefined && source !== selected_source) {
        console.warn(DIFFERENT_SOURCE_AFTER_INIT);
      }

      return;
    }

    if (in_flight) {
      if (source !== undefined && source !== selected_source) {
        throw new Error(DIFFERENT_SOURCE_IN_FLIGHT);
      }

      return in_flight;
    }

    selected_source = source;
    in_flight = initialize(source);

    try {
      await in_flight;
      ready = true;
    } catch (error) {
      in_flight = null;
      selected_source = undefined;
      throw error;
    }
  }

  function is_loaded() {
    return ready;
  }

  /**
   * Mark the published exports ready from an engine instance that already compiled the module.
   * A load() in flight wins; `publish` runs only when this call makes the loader ready.
   *
   * @param {BufferSource | URL | string | Request | WebAssembly.Module | undefined} source
   * @param {() => void} publish
   */
  async function adopt(source, publish) {
    if (in_flight) {
      try {
        await in_flight;
      } catch {
        // A failed load() leaves the loader free for this instance to adopt.
      }
    }

    if (ready) return;

    publish();
    selected_source = source;
    ready = true;
  }

  return { load, isLoaded: is_loaded, adopt };
}
