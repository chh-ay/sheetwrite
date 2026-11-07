import mdx from "@mdx-js/rollup";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

import { perfFigureMarkup } from "../docs/src/lib/perf-figure-markup.ts";
import { DOCS_MDX_OPTIONS, expressiveCodeAssets } from "../docs/vite.config.ts";
import { recmaSolidElements } from "./src/lib/recma-solid-elements.ts";

const DOCS_SOURCE = new URL("../docs/src/", import.meta.url).pathname;

/** Static pages with islands (`build:islands`) or full Solid hydration (`build:full`). */
const ISLANDS = process.env.DOCS_SOLID_ISLANDS === "1";

/** The three measured pages and the installation guide (Tabs); links to other pages stay plain links. */
const PAGES = [
  "/docs/start/first-grid/",
  "/docs/api/core/",
  "/docs/performance/render/",
  "/docs/start/installation/",
];

export default defineConfig({
  define: { "import.meta.env.DOCS_SOLID_ISLANDS": JSON.stringify(ISLANDS) },
  resolve: {
    alias: [
      { find: /^@docs\//, replacement: DOCS_SOURCE },
      // Page stylesheets the content pipeline adds (lib/content-components.ts) are the docs site's.
      { find: /^\/src\/styles\//, replacement: `${DOCS_SOURCE}styles/` },
      // The content pipeline imports Tabs, LiveGrid and RunnableCode into pages; here they are islands.
      {
        find: /^\/src\/components\/(?:Tabs|LiveGrid|RunnableCode)\.tsx$/,
        replacement: new URL("./src/islands/content.tsx", import.meta.url).pathname,
      },
      // The body font file the root route preloads is the docs site's package.
      {
        find: /^@fontsource-variable\//,
        replacement: new URL("../docs/node_modules/@fontsource-variable/", import.meta.url)
          .pathname,
      },
    ],
  },
  build: { cssCodeSplit: false },
  worker: { format: "es" },
  plugins: [
    {
      ...mdx({
        ...DOCS_MDX_OPTIONS,
        // Solid's compiler turns the page's JSX into DOM templates.
        jsx: true,
        elementAttributeNameCase: "html",
        stylePropertyNameCase: "css",
        recmaPlugins: [recmaSolidElements],
      }),
      enforce: "pre",
    },
    expressiveCodeAssets(),
    perfFigureMarkup(),
    tanstackStart({
      pages: PAGES.map((path) => ({ path })),
      prerender: {
        enabled: true,
        crawlLinks: false,
        failOnError: true,
        autoSubfolderIndex: true,
        filter: (page) => PAGES.includes(page.path),
      },
    }),
    solid({ ssr: true, extensions: [".md", ".mdx"] }),
  ],
});
