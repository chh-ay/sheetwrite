// Serves the showcase art review page (index.html here); not part of the site build.
// From docs/: node node_modules/vite/bin/vite.js --config src/art/preview/vite.config.ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const REPO = new URL("../../../../", import.meta.url).pathname;

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [solid()],
  resolve: { alias: { "@docs": `${REPO}docs/src` } },
  server: { fs: { allow: [REPO] } },
});
