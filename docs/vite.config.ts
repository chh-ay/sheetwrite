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
import { sheetwriteCodeHovers } from "./src/lib/sheetwrite-code-hovers.ts";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Keeps code focus client-owned and removes copy controls from API signatures. */
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
        node.properties = { ...node.properties, suppressHydrationWarning: true };
      }
      if (node.children) {
        node.children = node.children.filter(
          (child) =>
            !(
              (apiSignature &&
                String(child.properties?.className ?? "")
                  .split(/[ ,]+/)
                  .includes("copy")) ||
              (child.tagName === "script" &&
                child.children?.some(
                  (content) =>
                    content.type === "text" && content.value?.includes("tabindex-js-module"),
                ))
            ),
        );
        for (const child of node.children) visit(child, apiSignature);
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

/**
 * Expressive Code would inline the same base and theme stylesheet into the
 * first code block of every page, in its HTML and its hydration chunk. Pages
 * render code with empty page styles instead; the root links this module once,
 * so the stylesheet is downloaded once and cached across the site.
 */
function expressiveCodeStyles(): Plugin {
  return {
    name: "sheetwrite:expressive-code-styles",
    resolveId(id) {
      return id === EXPRESSIVE_CODE_STYLES_ID ? RESOLVED_EXPRESSIVE_CODE_STYLES_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_EXPRESSIVE_CODE_STYLES_ID) return undefined;
      const { baseStyles, themeStyles } = await sharedExpressiveCodeRenderer();
      return `${baseStyles}\n${themeStyles}`;
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
          [
            rehypeExpressiveCode,
            {
              ...expressiveCodeOptions,
              customCreateRenderer: async () => ({
                ...(await sharedExpressiveCodeRenderer()),
                baseStyles: "",
                themeStyles: "",
              }),
            },
          ],
          // Raw HTML re-parse must run after Expressive Code: it drops fence `data.meta`.
          [rehypeRaw, { passThrough: nodeTypes }],
          dedupeCodePopovers,
          // Prerendered heading ids: fragment links must resolve before hydration.
          rehypeSlug,
          markResponsiveCodeBlocks,
        ],
      }),
      enforce: "pre",
    },
    expressiveCodeStyles(),
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
        { path: "/docs/proof/", sitemap: { exclude: true } },
        // Test fixtures stay reachable for Playwright but out of search surfaces.
        { path: "/test/xlsx/", sitemap: { exclude: true } },
        { path: "/test/collaboration/", sitemap: { exclude: true } },
        { path: "/test/formulas-engine/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/react/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/vue/", sitemap: { exclude: true } },
        { path: "/test/framework-lifecycle/svelte/", sitemap: { exclude: true } },
      ],
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
        autoSubfolderIndex: true,
      },
      sitemap: {
        enabled: true,
        host: "https://sheetwrite.vercel.app",
      },
    }),
    vue(),
    svelte(),
    viteReact({ include: /\.(?:js|jsx|ts|tsx|md|mdx)$/ }),
  ],
});
