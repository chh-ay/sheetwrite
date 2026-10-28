import type { ExpressiveCodeTheme } from "@expressive-code/core";
import { nodeTypes } from "@mdx-js/mdx";
import mdx from "@mdx-js/rollup";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import rehypeExpressiveCode, {
  createRenderer,
  type RehypeExpressiveCodeOptions,
  type RehypeExpressiveCodeRenderer,
} from "rehype-expressive-code";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig, type Plugin } from "vite";

import { dedupeCodePopovers } from "./src/lib/dedupe-code-popovers.ts";
import { renderGridResults } from "./src/lib/grid-result.ts";
import { renderSectionCards } from "./src/lib/section-cards.ts";
import { SITE_URL } from "./src/lib/seo.ts";
import { sheetwriteCodeHovers } from "./src/lib/sheetwrite-code-hovers.ts";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  name?: string;
  attributes?: Array<{ type: string; name: string; value: string }>;
}

/** One install command on one line, in any package manager's spelling. */
const INSTALL_COMMAND = /^(?:npm install|npm i|pnpm add|yarn add|bun add)\s+((?:[@\w./-]+\s*)+)$/;

/**
 * A one-line install fence becomes a `PackageCommand` terminal, so every page
 * offers npm, pnpm, Yarn, and Bun from the same Markdown. Runs before
 * Expressive Code, which would otherwise render the fence as plain code.
 */
function installCommandsAsTerminals() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      // Text nodes have no children key; writing one breaks later plugins.
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const code = child.tagName === "pre" ? child.children?.[0] : undefined;
        const language = [code?.properties?.className ?? []].flat().map(String);
        const match =
          code?.tagName === "code" && language.includes("language-sh")
            ? INSTALL_COMMAND.exec(textOf(code).trim())
            : null;
        if (match?.[1] === undefined) {
          visit(child);
          return child;
        }
        return {
          type: "mdxJsxFlowElement",
          name: "PackageCommand",
          attributes: [{ type: "mdxJsxAttribute", name: "packages", value: match[1].trim() }],
          children: [],
        };
      });
    };
    visit(tree);
  };
}

/** Generated Markdown keeps its content static; only the filter needs hydration. */
function hydrateFormulaReference() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.tagName === "formulareference") {
        node.type = "mdxJsxFlowElement";
        node.name = "FormulaReference";
        node.attributes = [];
        delete node.tagName;
        delete node.properties;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Draw release reductions from the displayed value, so labels and bars cannot drift. */
function visualizeReleaseResults() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      const delta =
        node.tagName === "li"
          ? node.children?.find((child) =>
              String(child.properties?.className ?? "")
                .split(/[ ,]+/)
                .includes("sw-results__delta"),
            )
          : undefined;
      if (delta !== undefined) {
        const label = textOf(delta).trim();
        const percent = /^(\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))?% (?:faster|less)$/.exec(label);
        const ratio = /^([\d,]+(?:\.\d+)?)× faster$/.exec(label);
        const low = percent
          ? Number(percent[1])
          : ratio
            ? (1 - 1 / Number(ratio[1]?.replaceAll(",", ""))) * 100
            : undefined;
        const high = percent ? Number(percent[2] ?? percent[1]) : low;
        if (low !== undefined && high !== undefined) {
          node.children?.push({
            type: "element",
            tagName: "span",
            properties: {
              className: ["sw-results__bar"],
              ariaHidden: "true",
              style: `--result-min:${low}%;--result-max:${high}%`,
            },
            children: [],
          });
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Removes copy controls from API signatures and lets code keep hydration-safe markup. */
function markResponsiveCodeBlocks() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode, insideApiSignature = false): void => {
      const classes = String(node.properties?.className ?? "").split(/[ ,]+/);
      const apiSignature =
        insideApiSignature ||
        classes.some((name) =>
          ["api-member", "api-declaration", "api-declaration-open", "api-variant"].includes(name),
        );
      if (node.tagName === "pre") {
        node.properties = {
          ...node.properties,
          suppressHydrationWarning: true,
        };
      }
      if (node.children) {
        node.children = node.children.filter(
          (child) =>
            !(
              apiSignature &&
              String(child.properties?.className ?? "")
                .split(/[ ,]+/)
                .includes("copy")
            ),
        );
        for (const child of node.children) visit(child, apiSignature);
      }
    };
    visit(tree);
  };
}

/** Visible text of a hast subtree. */
function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/** Cells shorter than this read as one token (a name, value or range). */
const SHORT_CELL_LENGTH = 28;

/** Gives short table cells a class, so a value never breaks over lines. */
function markShortCells(node: HastNode): void {
  for (const child of node.children ?? []) {
    if (
      (child.tagName === "td" || child.tagName === "th") &&
      textOf(child).trim().length < SHORT_CELL_LENGTH
    ) {
      child.properties = { ...child.properties, className: ["sw-cell-short"] };
    }
    markShortCells(child);
  }
}

/**
 * Markdown tables get a scroll frame: a wide table scrolls inside the column
 * instead of widening the page, so short cells can stay on one line.
 * Tables with their own class are designed layouts and keep their markup.
 */
function wrapProseTables() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (!node.children) return;
      // Tables never nest tables in this content, so a table is not visited again.
      for (const child of node.children) if (child.tagName !== "table") visit(child);
      node.children = node.children.map((child) => {
        if (child.tagName !== "table" || child.properties?.className) return child;
        markShortCells(child);
        return {
          type: "element",
          tagName: "div",
          properties: { className: ["sw-table-frame"], tabIndex: 0 },
          children: [child],
        };
      });
    };
    visit(tree);
  };
}

/**
 * Inline code shorter than this fits a phone line, so it never needs to break
 * at a hyphen or quote; longer code keeps wrapping to avoid sideways scroll.
 */
const SHORT_CODE_LENGTH = 32;

/** Gives short inline code a class, so an identifier reads as one token. */
function markShortInlineCode() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      for (const child of node.children ?? []) {
        if (child.tagName === "pre") continue;
        if (child.tagName === "code" && textOf(child).length <= SHORT_CODE_LENGTH) {
          const className = [child.properties?.className ?? []].flat().map(String);
          child.properties = { ...child.properties, className: [...className, "sw-code-token"] };
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
  defaultProps: { wrap: false },
  styleOverrides: {
    codeFontFamily: "var(--sw-font-mono)",
    uiFontFamily: "var(--sw-font-body)",
  },
  useDarkModeMediaQuery: false,
  themeCssSelector: (theme: ExpressiveCodeTheme) => `[data-theme='${theme.type}']`,
  plugins: [
    sheetwriteCodeHovers({
      cwd: new URL(".", import.meta.url).pathname,
      shouldTransform: (codeBlock) => !/\bgenerated\b/.test(codeBlock.meta),
    }),
  ],
};

let expressiveCodeRenderer: Promise<RehypeExpressiveCodeRenderer> | undefined;
function sharedExpressiveCodeRenderer(): Promise<RehypeExpressiveCodeRenderer> {
  expressiveCodeRenderer ??= createRenderer(expressiveCodeOptions);
  return expressiveCodeRenderer;
}

const EXPRESSIVE_CODE_STYLES_ID = "virtual:expressive-code.css";
const RESOLVED_EXPRESSIVE_CODE_STYLES_ID = "/__sheetwrite-expressive-code.css";
const EXPRESSIVE_CODE_SCRIPTS_ID = "virtual:expressive-code-scripts";
const RESOLVED_EXPRESSIVE_CODE_SCRIPTS_ID = "\0sheetwrite-expressive-code-scripts.js";
/** The tabindex module would make code focusable; the site owns code focus. */
const OWNED_BY_SITE_MODULE = "tabindex-js-module";

/**
 * Expressive Code would inline the same page assets into the first code block
 * of every page, in its HTML and its hydration chunk. Pages render code
 * without them; the root loads them once instead:
 *
 * - The stylesheet, so it is downloaded once and cached across the site.
 * - The scripts (the copy button), as a function the root runs after
 *   hydration. A `<script>` in page content is inert when React renders it
 *   on a client-side navigation, and React reports it as an error. The
 *   modules observe the document, so one run serves every later page.
 */
function expressiveCodeAssets(): Plugin {
  return {
    name: "sheetwrite:expressive-code-assets",
    resolveId(id) {
      if (id === EXPRESSIVE_CODE_STYLES_ID) return RESOLVED_EXPRESSIVE_CODE_STYLES_ID;
      if (id === EXPRESSIVE_CODE_SCRIPTS_ID) return RESOLVED_EXPRESSIVE_CODE_SCRIPTS_ID;
      return undefined;
    },
    async load(id) {
      if (id === RESOLVED_EXPRESSIVE_CODE_STYLES_ID) {
        const { baseStyles, themeStyles } = await sharedExpressiveCodeRenderer();
        return `${baseStyles}\n${themeStyles}`;
      }
      if (id !== RESOLVED_EXPRESSIVE_CODE_SCRIPTS_ID) return undefined;
      const { jsModules } = await sharedExpressiveCodeRenderer();
      const modules = jsModules.filter((code) => !code.includes(OWNED_BY_SITE_MODULE));
      return [
        "let installed = false;",
        "export function installExpressiveCodeScripts() {",
        "  if (installed) return;",
        "  installed = true;",
        ...modules,
        "}",
      ].join("\n");
    },
  };
}

export default defineConfig({
  // Keep one document-wide stylesheet. TanStack route transitions otherwise
  // swap route CSS links after the next route has painted, producing a visible
  // half-styled frame on showcase navigation.
  build: {
    cssCodeSplit: false,
  },
  plugins: [
    {
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
        rehypePlugins: [
          installCommandsAsTerminals,
          [
            rehypeExpressiveCode,
            {
              ...expressiveCodeOptions,
              customCreateRenderer: async () => ({
                ...(await sharedExpressiveCodeRenderer()),
                baseStyles: "",
                themeStyles: "",
                jsModules: [],
              }),
            },
          ],
          // Raw HTML re-parse must run after Expressive Code: it drops fence `data.meta`.
          [rehypeRaw, { passThrough: nodeTypes }],
          renderGridResults,
          [
            renderSectionCards,
            { contentRoot: new URL("./src/content/docs/", import.meta.url).pathname },
          ],
          hydrateFormulaReference,
          visualizeReleaseResults,
          dedupeCodePopovers,
          // Prerendered heading ids: fragment links must resolve before hydration.
          rehypeSlug,
          markResponsiveCodeBlocks,
          wrapProseTables,
          markShortInlineCode,
        ],
      }),
      enforce: "pre",
    },
    expressiveCodeAssets(),
    tailwindcss(),
    tanstackStart({
      pages: [
        { path: "/" },
        { path: "/docs/" },
        // The capability hub and its proofs are build gates: prerendering them
        // must not depend on crawl reachability from the landing page.
        { path: "/showcases/" },
        { path: "/showcases/database/" },
        { path: "/showcases/interoperability/" },
        { path: "/showcases/performance/" },
        { path: "/showcases/collaboration/" },
        // The explicit route renders successfully during prerender; the
        // deployment fallback supplies the 404 status for unknown URLs.
        {
          path: "/404/",
          prerender: { enabled: true, outputPath: "/404.html" },
          sitemap: { exclude: true },
        },
        // Test fixtures stay reachable for Playwright but out of search surfaces.
        { path: "/test/xlsx/", sitemap: { exclude: true } },
        { path: "/test/collaboration/", sitemap: { exclude: true } },
        { path: "/test/formulas-engine/", sitemap: { exclude: true } },
        {
          path: "/test/framework-lifecycle/react/",
          sitemap: { exclude: true },
        },
        { path: "/test/framework-lifecycle/vue/", sitemap: { exclude: true } },
        {
          path: "/test/framework-lifecycle/svelte/",
          sitemap: { exclude: true },
        },
      ],
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
        autoSubfolderIndex: true,
      },
      sitemap: {
        enabled: true,
        host: SITE_URL,
      },
    }),
    vue(),
    svelte(),
    viteReact({ include: /\.(?:js|jsx|ts|tsx|md|mdx)$/ }),
  ],
});
