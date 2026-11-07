import mdx from "@mdx-js/rollup";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { globSync } from "tinyglobby";
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

import { formulaTables } from "../docs/src/lib/formula-tables.ts";
import { perfFigureMarkup } from "../docs/src/lib/perf-figure-markup.ts";
import { DOCS_MDX_OPTIONS, expressiveCodeAssets } from "../docs/vite.config.ts";
import { SOLID_MDX_OPTIONS } from "./src/lib/recma-solid-elements.ts";

const DOCS_SOURCE = new URL("../docs/src/", import.meta.url).pathname;
const CONTENT_ROOT = `${DOCS_SOURCE}content/docs/`;

/** Every docs page, by address: the build prerenders each one (lib/content.ts reads the same files). */
const PAGES = globSync("**/*.{md,mdx}", { cwd: CONTENT_ROOT }).map((source) => {
  const page = source.replace(/\.(?:md|mdx)$/, "").replace(/(?:^|\/)index$/, "");
  return page.length === 0 ? "/docs/" : `/docs/${page}/`;
});

/**
 * The browsers the site's CSS is compiled for (Lightning CSS prefixes and
 * lowers only what these need): Vite's default build target,
 * "baseline-widely-available", which the islands' JavaScript is built for.
 */
const version = (major: number, minor = 0): number => (major << 16) | (minor << 8);
export const CSS_TARGETS = {
  chrome: version(111),
  edge: version(111),
  firefox: version(114),
  safari: version(16, 4),
  ios_saf: version(16, 4),
};

/** Lightning CSS compiles every stylesheet (vite.islands.config.ts uses the same). */
export const CSS_OPTIONS = {
  transformer: "lightningcss",
  lightningcss: { targets: CSS_TARGETS },
} as const;

type PageOutput = { code: string; map?: unknown } | undefined;

/**
 * Compiles every docs page once for both build environments. Pages render on
 * the server only (under NoHydration), and the islands build ships all client
 * code, so the router app's client build gets a stub per page: the stylesheet
 * URL imports, whose files the client build emits, and the page's metadata.
 * Compiling (and running Solid's compiler on) each page's markup there too
 * would double the build for output no page loads.
 */
function docsPages(): Plugin {
  const pages = mdx({ ...DOCS_MDX_OPTIONS, ...SOLID_MDX_OPTIONS });
  const compile = pages.transform as (source: string, id: string) => Promise<PageOutput>;
  // Each page is compiled by whichever environment builds first and taken by the other.
  const pending = new Map<string, { source: string; output: Promise<PageOutput> }>();

  return {
    ...pages,
    name: "docs-solid:pages",
    enforce: "pre",
    async transform(source, id) {
      let entry = pending.get(id);
      if (entry === undefined || entry.source !== source) {
        entry = { source, output: compile.call(this, source, id) };
        pending.set(id, entry);
      } else {
        pending.delete(id);
      }
      const output = await entry.output;
      if (output === undefined || this.environment.name !== "client") return output;

      const kept = this.parse(output.code, { lang: "jsx" }).body.filter(
        (node) =>
          (node.type === "ImportDeclaration" && String(node.source.value).endsWith("?url")) ||
          (node.type === "ExportNamedDeclaration" &&
            node.declaration?.type === "VariableDeclaration" &&
            node.declaration.declarations.some(
              (declaration) =>
                declaration.id.type === "Identifier" &&
                (declaration.id.name === "frontmatter" || declaration.id.name === "stylesheets"),
            )),
      );
      return {
        code: [
          ...kept.map((node) => output.code.slice(node.start, node.end)),
          "export default function MDXContent() { return null; }",
        ].join("\n"),
        map: null,
      };
    },
  };
}

export default defineConfig({
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
      // Two pages import these diagrams by relative path; here they are Solid components.
      {
        find: /^(?:\.\.\/)+components\/(RuntimeArchitecture|CollaborationFlow)$/,
        replacement: `${new URL("./src/components/", import.meta.url).pathname}$1.tsx`,
      },
      // Font files the root route preloads come from the docs site's packages.
      {
        find: /^@fontsource-variable\//,
        replacement: new URL("../docs/node_modules/@fontsource-variable/", import.meta.url)
          .pathname,
      },
    ],
  },
  css: CSS_OPTIONS,
  // Pages link their stylesheets from `?url` imports (routes/__root.tsx); the
  // page script (src/islands/page-scripts.ts) drops those a page does not use.
  build: { cssCodeSplit: false, cssMinify: "lightningcss" },
  worker: { format: "es" },
  // The docs site's static files: favicon, llms.txt, the changelog feed, figures.
  publicDir: new URL("../docs/public/", import.meta.url).pathname,
  plugins: [
    docsPages(),
    expressiveCodeAssets(),
    formulaTables(),
    perfFigureMarkup(),
    tanstackStart({
      pages: [
        { path: "/" },
        ...PAGES.map((path) => ({ path })),
        // Static hosts serve /404.html for every URL without a page; the
        // deployment fallback supplies the 404 status for unknown URLs.
        { path: "/404/", prerender: { enabled: true, outputPath: "/404.html" } },
      ],
      prerender: {
        enabled: true,
        crawlLinks: false,
        failOnError: true,
        autoSubfolderIndex: true,
      },
    }),
    solid({ ssr: true, extensions: [".md", ".mdx"] }),
  ],
});
