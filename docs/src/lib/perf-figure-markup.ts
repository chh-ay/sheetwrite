/**
 * Performance page figures are static HTML. The generator writes each figure
 * to `src/generated/perf-figures/<page>--<figure>.html`, apart from its page,
 * so the page's script carries a `<PerfFigure>` placeholder and not the figure.
 *
 * `virtual:perf-figures` resolves per build, as `virtual:formula-tables` does
 * (formula-tables.ts): the server render gets every figure's markup to inline
 * into the prerendered page; the browser gets only each figure's URL, a static
 * asset fetched after a client-side navigation.
 */
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:perf-figures";
const SERVER_SOURCE = fileURLToPath(new URL("./perf-figure-source.server.ts", import.meta.url));
const BROWSER_SOURCE = fileURLToPath(new URL("./perf-figure-source.browser.ts", import.meta.url));

/** Resolves `virtual:perf-figures` to the server or the browser source. */
export function perfFigureMarkup(): Plugin {
  return {
    name: "sheetwrite:perf-figures",
    resolveId(id) {
      if (id !== VIRTUAL_ID) return undefined;
      return this.environment.config.consumer === "server" ? SERVER_SOURCE : BROWSER_SOURCE;
    },
  };
}
