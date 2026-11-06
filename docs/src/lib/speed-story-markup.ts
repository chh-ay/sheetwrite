/**
 * The speed story on the landing page and the performance showcase is static
 * HTML, built by the docs generator into `src/generated/landing-story.html`
 * from the committed captures, so no page script carries it.
 *
 * `virtual:speed-story` resolves per build, as `virtual:formula-tables` does
 * (formula-tables.ts): the server render gets the markup to inline into the
 * prerendered page; the browser gets only its URL, a static asset fetched
 * after a client-side navigation.
 */
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:speed-story";
const SERVER_SOURCE = fileURLToPath(new URL("./speed-story-source.server.ts", import.meta.url));
const BROWSER_SOURCE = fileURLToPath(new URL("./speed-story-source.browser.ts", import.meta.url));

/** Resolves `virtual:speed-story` to the server or the browser source. */
export function speedStoryMarkup(): Plugin {
  return {
    name: "sheetwrite:speed-story",
    resolveId(id) {
      if (id !== VIRTUAL_ID) return undefined;
      return this.environment.config.consumer === "server" ? SERVER_SOURCE : BROWSER_SOURCE;
    },
  };
}
