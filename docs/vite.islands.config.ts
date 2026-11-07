import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { ISLANDS_ENTRY, ISLANDS_MANIFEST } from "./src/islands/build.ts";
import { formulaTables } from "./src/lib/formula-tables.ts";
import { expressiveCodeAssets } from "./vite.config.ts";

const SKIPPED_STYLESHEET = "\0sheetwrite-islands-skipped-stylesheet";

/**
 * The site build already linked one stylesheet with every style in the head
 * (`cssCodeSplit: false`), islands' styles included; the islands bundle must
 * not load them a second time. `?url` imports stay: Try it's runtime hands
 * the engine's stylesheet URL to its frame.
 */
function skipStylesheets(): Plugin {
  return {
    name: "sheetwrite:islands-skip-stylesheets",
    enforce: "pre",
    resolveId(source) {
      return /\.css$/.test(source) ? SKIPPED_STYLESHEET : undefined;
    },
    load(id) {
      return id === SKIPPED_STYLESHEET ? "export {};" : undefined;
    },
  };
}

/**
 * The script of static docs pages (src/islands/client.tsx), built after the
 * site into the same client output. islands/page-scripts.ts then links it
 * from every docs page in place of the router app.
 */
export default defineConfig({
  // The site build already copied public/.
  publicDir: false,
  // As the site build: Try it's runtime is an ES worker bundle that loads packages as chunks.
  worker: { format: "es" },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    manifest: ISLANDS_MANIFEST,
    rollupOptions: { input: { islands: ISLANDS_ENTRY } },
  },
  plugins: [skipStylesheets(), expressiveCodeAssets(), formulaTables(), viteReact()],
});
