import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

import { expressiveCodeAssets } from "../docs/vite.config.ts";

const DOCS_SOURCE = new URL("../docs/src/", import.meta.url).pathname;
const SKIPPED_STYLESHEET = "\0docs-solid-islands-skipped-stylesheet";

/** The site build linked every style in the head already; the islands bundle loads none again. */
function skipStylesheets(): Plugin {
  return {
    name: "docs-solid:islands-skip-stylesheets",
    enforce: "pre",
    resolveId(source) {
      return /\.css(?:\?|$)/.test(source) ? SKIPPED_STYLESHEET : undefined;
    },
    load(id) {
      return id === SKIPPED_STYLESHEET ? "export {};" : undefined;
    },
  };
}

/** The script of static pages (src/islands/client.tsx), built into the site's client output. */
export default defineConfig({
  define: { "import.meta.env.DOCS_SOLID_ISLANDS": "true" },
  resolve: { alias: [{ find: /^@docs\//, replacement: DOCS_SOURCE }] },
  publicDir: false,
  worker: { format: "es" },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    manifest: "islands-manifest.json",
    rollupOptions: { input: { islands: "src/islands/client.tsx" } },
  },
  // `ssr: true` compiles hydratable templates: islands claim the server's nodes instead of recreating them.
  plugins: [skipStylesheets(), expressiveCodeAssets(), solid({ ssr: true })],
});
