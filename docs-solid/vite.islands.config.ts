import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

import { expressiveCodeAssets } from "../docs/vite.config.ts";
import { CSS_OPTIONS, frameworkWorkbenches, REACT_WORKBENCH_FILES } from "./vite.config.ts";

const DOCS_SOURCE = new URL("../docs/src/", import.meta.url).pathname;

/**
 * The script of static pages (src/islands/client.tsx), built into the site's
 * client output. Each island's stylesheets travel with its chunk: page-scripts.ts
 * links those of the islands a page holds, and code loaded later (LiveGrid's
 * grid, the Try it playground) brings its own when it loads.
 */
export default defineConfig({
  resolve: { alias: [{ find: /^@docs\//, replacement: DOCS_SOURCE }] },
  publicDir: false,
  worker: { format: "es" },
  css: CSS_OPTIONS,
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    manifest: "islands-manifest.json",
    cssCodeSplit: true,
    cssMinify: "lightningcss",
    rollupOptions: { input: { islands: "src/islands/client.tsx" } },
  },
  // `ssr: true` compiles hydratable templates: islands claim the server's nodes instead of recreating them.
  plugins: [
    expressiveCodeAssets(),
    solid({ ssr: true, exclude: REACT_WORKBENCH_FILES }),
    ...frameworkWorkbenches(),
  ],
});
