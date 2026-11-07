import headingFont from "@docs/fonts/bricolage-grotesque-latin-650-opsz.woff2?url";
import { SITE_URL } from "@docs/lib/seo.js";
import bodyFont from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import { createRootRoute, HeadContent, Outlet, ScriptOnce } from "@tanstack/solid-router";
import type { JSX } from "solid-js";

import { IconSprite } from "../components/IconSprite.js";

import selectStylesheet from "../styles/select.css?url";
import docsFiguresStylesheet from "@docs/styles/docs-figures.css?url";
import siteShellStylesheet from "@docs/styles/site-shell.css?url";
import siteStylesheet from "@docs/styles/site.css?url";
import tokensStylesheet from "@docs/styles/tokens.css?url";
// Expressive Code base and theme styles, shared by every page with code.
import "virtual:expressive-code.css";

// Blocked storage throws a DOMException; the saved theme is optional, so the
// script then follows the system color scheme.
const THEME_SCRIPT =
  '{let saved=null;try{saved=localStorage.getItem("sheetwrite-theme")}catch(error){if(!(error instanceof DOMException))throw error}document.documentElement.dataset.theme=saved??(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}';

const SITE_TITLE = "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV";
const SITE_DESCRIPTION =
  "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.";

/** Fonts first in the head, so they load with the stylesheets and are ready for the first paint. */
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
        // Head links are render-blocking; link order is the cascade.
        { rel: "stylesheet", href: tokensStylesheet },
        { rel: "stylesheet", href: siteStylesheet },
        { rel: "stylesheet", href: siteShellStylesheet },
        { rel: "stylesheet", href: selectStylesheet },
        { rel: "stylesheet", href: docsFiguresStylesheet },
        { rel: "canonical", href: canonical },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "robots", content: "index, follow" },
        { name: "theme-color", content: "#080b12" },
        { title: SITE_TITLE },
      ],
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
        <ScriptOnce children={THEME_SCRIPT} />
      </head>
      <body>
        <IconSprite />
        {props.children}
      </body>
    </html>
  );
}
