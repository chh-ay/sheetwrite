/**
 * Formula family tables are static HTML. The generator writes each family's
 * table to `src/generated/formula-tables/<family>.html`, apart from the
 * family's page, so the page's script carries no table rows.
 *
 * `virtual:formula-tables` resolves per build: the server render gets every
 * table's markup to inline into the prerendered page; the browser gets only
 * each table's URL, a static asset fetched after a client-side navigation.
 */
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:formula-tables";
const SERVER_SOURCE = fileURLToPath(new URL("./formula-table-source.server.ts", import.meta.url));
const BROWSER_SOURCE = fileURLToPath(new URL("./formula-table-source.browser.ts", import.meta.url));

/** Resolves `virtual:formula-tables` to the server or the browser table source. */
export function formulaTables(): Plugin {
  return {
    name: "sheetwrite:formula-tables",
    resolveId(id) {
      if (id !== VIRTUAL_ID) return undefined;
      return this.environment.config.consumer === "server" ? SERVER_SOURCE : BROWSER_SOURCE;
    },
  };
}
