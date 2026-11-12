import headingFont from "@docs/fonts/bricolage-grotesque-latin-650-opsz.woff2?url";
import { SITE_URL } from "@docs/lib/seo.js";
import bodyFont from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import { createRootRoute, HeadContent, Outlet, ScriptOnce } from "@tanstack/solid-router";
import type { JSX } from "solid-js";

import corePackage from "../../../packages/core/package.json" with { type: "json" };
import { IconSprite } from "../components/IconSprite.js";

import performanceStylesheet from "../styles/performance.css?url";
import siteCoreStylesheet from "../styles/site-core.css?url";
import siteMidStylesheet from "../styles/site-mid.css?url";
import siteTailStylesheet from "../styles/site-tail.css?url";
import docsFiguresStylesheet from "@docs/styles/docs-figures.css?url";
import showcaseStylesheet from "@docs/styles/showcase.css?url";
import apiReferenceStylesheet from "@docs/styles/site/api-reference.css?url";
import formulaReferenceStylesheet from "@docs/styles/site/formula-reference.css?url";
import playgroundStylesheet from "@docs/styles/site/playground.css?url";
import upgradeGuideStylesheet from "@docs/styles/site/upgrade-guide.css?url";
// Expressive Code base and theme styles, shared by every page with code.
import "virtual:expressive-code.css";

// Blocked storage throws a DOMException; the saved theme is optional, so the
// script then follows the system color scheme.
const THEME_SCRIPT =
  '{let saved=null;try{saved=localStorage.getItem("sheetwrite-theme")}catch(error){if(!(error instanceof DOMException))throw error}document.documentElement.dataset.theme=saved??(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}';

// Kept short: search results cut long titles by pixel width, and Bing warns past about 70 characters.
const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV";
const SITE_DESCRIPTION =
  "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.";
const SOCIAL_IMAGE_ALT =
  "Sheetwrite multi-sheet workbook with selected formula cell and sheet tabs";
const STRUCTURED_DATA = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Sheetwrite",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}/#source`,
      name: "Sheetwrite",
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      codeRepository: "https://github.com/chh-ay/sheetwrite",
      license: "https://opensource.org/license/mit",
      programmingLanguage: ["TypeScript", "Rust"],
      runtimePlatform: ["Web", "WebAssembly"],
      version: corePackage.version,
    },
  ],
});

/** Fonts first in the head, so they load with the stylesheets and are ready for the first paint. */
const FONT_PRELOAD = {
  rel: "preload",
  as: "font",
  type: "font/woff2",
  crossOrigin: "anonymous",
  fetchPriority: "high",
} as const;

const stylesheet = (href: string) => ({ rel: "stylesheet", href });
/**
 * A stylesheet only some pages use. `data-feature` marks it for the page
 * script (islands/page-scripts.ts), which keeps it only where the page's
 * markup uses its classes.
 */
const featureStylesheet = (href: string) => ({ rel: "stylesheet", href, "data-feature": "" });

export const Route = createRootRoute({
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "/";
    const canonical = new URL(pathname.endsWith("/") ? pathname : `${pathname}/`, SITE_URL).href;
    return {
      links: [
        { ...FONT_PRELOAD, href: headingFont },
        { ...FONT_PRELOAD, href: bodyFont },
        // Head links are render-blocking; link order is the cascade (site.css's order).
        stylesheet(siteCoreStylesheet),
        featureStylesheet(apiReferenceStylesheet),
        featureStylesheet(performanceStylesheet),
        featureStylesheet(upgradeGuideStylesheet),
        featureStylesheet(formulaReferenceStylesheet),
        stylesheet(siteMidStylesheet),
        featureStylesheet(playgroundStylesheet),
        stylesheet(siteTailStylesheet),
        // The site chrome outside the docs (the 404 page).
        featureStylesheet(showcaseStylesheet),
        featureStylesheet(docsFiguresStylesheet),
        { rel: "canonical", href: canonical },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        // The changelog feed, written by the docs build (scripts/docs-feed.ts).
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "Sheetwrite changelog",
          href: "/changelog/rss.xml",
        },
      ],
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "robots", content: "index, follow" },
        { name: "theme-color", content: "#080b12" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Sheetwrite" },
        { property: "og:locale", content: "en_US" },
        { property: "og:title", content: SITE_TITLE },
        { property: "og:description", content: SITE_DESCRIPTION },
        { property: "og:url", content: canonical },
        { property: "og:image", content: `${SITE_URL}/og-sheetwrite.webp` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: SOCIAL_IMAGE_ALT },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: SITE_TITLE },
        { name: "twitter:description", content: SITE_DESCRIPTION },
        { name: "twitter:image", content: `${SITE_URL}/og-sheetwrite.webp` },
        { name: "twitter:image:alt", content: SOCIAL_IMAGE_ALT },
        { title: SITE_TITLE },
      ],
      scripts: [{ type: "application/ld+json", children: STRUCTURED_DATA }],
    };
  },
  shellComponent: RootDocument,
  component: Outlet,
});

/**
 * The `<html>` document around every page. Pages are static: the islands
 * client (islands/client.tsx) is their only script, linked by the build's
 * page-scripts step, so the router's scripts are not rendered.
 */
function RootDocument(props: { children?: JSX.Element }) {
  return (
    <html data-theme="dark" lang="en">
      <head>
        <HeadContent />
        {/* Sets the theme before first paint. */}
        <ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
      </head>
      <body>
        <IconSprite />
        {props.children}
      </body>
    </html>
  );
}
