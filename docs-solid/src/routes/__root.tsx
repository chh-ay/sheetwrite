import { installFigureTips } from "@docs/components/figures/figure-tips.ts";
import headingFont from "@docs/fonts/bricolage-grotesque-latin-650-opsz.woff2?url";
import { initializeCodeEnhancements } from "@docs/lib/code-enhancements.ts";
import { installGridScrollHints } from "@docs/lib/grid-scroll-hint.ts";
import { installAnchorReveal } from "@docs/lib/reveal-anchor.ts";
import { SITE_URL } from "@docs/lib/seo.js";
import bodyFont from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import { createRootRoute, HeadContent, Outlet, Scripts, ScriptOnce } from "@tanstack/solid-router";
import { inject as injectAnalytics } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { type JSX, onCleanup, onMount } from "solid-js";
import { HydrationScript } from "solid-js/web";
import { installExpressiveCodeScripts } from "virtual:expressive-code-scripts";

import { IconSprite } from "../components/IconSprite.js";
import { ISLANDS } from "../islands/Island.js";

import demoSelectStylesheet from "@docs/styles/demo-select.css?url";
import docsFiguresStylesheet from "@docs/styles/docs-figures.css?url";
import siteShellStylesheet from "@docs/styles/site-shell.css?url";
import siteStylesheet from "@docs/styles/site.css?url";
import tokensStylesheet from "@docs/styles/tokens.css?url";
// Expressive Code base and theme styles, shared by every page with code.
import "virtual:expressive-code.css";

// Blocked storage throws a DOMException; the saved theme is optional.
const THEME_SCRIPT =
  '{let saved=null;try{saved=localStorage.getItem("sheetwrite-theme")}catch(error){if(!(error instanceof DOMException))throw error}document.documentElement.dataset.theme=saved??(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}';

const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV";
const SITE_DESCRIPTION =
  "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.";

/** Fonts first in the head, so they load with the stylesheets (the React site preloads them the same way). */
const FONT_PRELOAD = {
  rel: "preload",
  as: "font",
  type: "font/woff2",
  crossOrigin: "anonymous",
  fetchPriority: "high",
} as const;

export const Route = createRootRoute({
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "/";
    const canonical = new URL(pathname.endsWith("/") ? pathname : `${pathname}/`, SITE_URL).href;
    return {
      links: [
        { ...FONT_PRELOAD, href: headingFont },
        { ...FONT_PRELOAD, href: bodyFont },
        { rel: "stylesheet", href: tokensStylesheet },
        { rel: "stylesheet", href: siteStylesheet },
        { rel: "stylesheet", href: siteShellStylesheet },
        { rel: "stylesheet", href: demoSelectStylesheet },
        { rel: "stylesheet", href: docsFiguresStylesheet },
        { rel: "canonical", href: canonical },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "theme-color", content: "#080b12" },
        { title: SITE_TITLE },
      ],
    };
  },
  shellComponent: RootDocument,
  component: RootComponent,
});

/** With full hydration, the page-wide behaviour the islands client installs on static pages. */
function RootComponent() {
  onMount(() => {
    const cleanup = initializeCodeEnhancements();
    installExpressiveCodeScripts();
    const uninstallReveal = installAnchorReveal();
    const uninstallScrollHints = installGridScrollHints();
    const uninstallFigureTips = installFigureTips();
    injectAnalytics({ framework: "solid" });
    injectSpeedInsights({ framework: "solid" });
    onCleanup(() => {
      cleanup();
      uninstallFigureTips();
      uninstallReveal();
      uninstallScrollHints();
    });
  });
  return <Outlet />;
}

/** The `<html>` document, rendered on the server around every page. */
function RootDocument(props: { children?: JSX.Element }) {
  return (
    <html data-theme="dark" lang="en">
      <head>
        {/* Static pages hydrate islands without replaying early events; islands/client.tsx
            sets up the hydration registry the capture script would. */}
        {ISLANDS ? null : <HydrationScript />}
        <HeadContent />
        <ScriptOnce children={THEME_SCRIPT} />
      </head>
      <body>
        <IconSprite />
        {props.children}
        {ISLANDS ? null : <Scripts />}
      </body>
    </html>
  );
}
