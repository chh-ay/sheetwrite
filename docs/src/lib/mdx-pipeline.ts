import type { ExpressiveCodeTheme } from "@expressive-code/core";
import { nodeTypes } from "@mdx-js/mdx";
import type { Options as MdxOptions } from "@mdx-js/rollup";
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
import type { Plugin } from "vite";

import { inlineIcon } from "../icons/inline-icon.ts";
import { codeHangingIndent } from "./code-indent.ts";
import { FORMULA_LANGUAGE, siteCodeThemes, tsMemberLanguage } from "./code-theme.ts";
import { CALLOUTS, callout, contentComponents } from "./content-components.ts";
import { dedupeCodePopovers } from "./dedupe-code-popovers.ts";
import { scopeCopyButtonStates } from "./expressive-code-styles.ts";
import { markGeneratedPages } from "./generated-content.ts";
import { renderGridResults } from "./grid-result.ts";
import { SHORT_CODE_CLASS, SHORT_CODE_LENGTH } from "./inline-code.ts";
import { exportOutline } from "./outline.ts";
import { renderPerfBars } from "./perf-bars.ts";
import { isPerfCompare, parsePerfCompare } from "./perf-compare.ts";
import { rovingCodeFocus } from "./roving-code-focus.ts";
import { runnableCodeBlocks } from "./runnable-code.ts";
import { renderSectionCards } from "./section-cards.ts";
import { sheetwriteCodeHovers } from "./sheetwrite-code-hovers.ts";

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
          // A CodeGroup already spells out each package manager.
          if (!isCodeGroup(child)) visit(child);
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

/** A `<CodeGroup>`, which contentComponents has already turned into code tabs. */
function isCodeGroup(node: HastNode): boolean {
  return (
    node.name === "Tabs" &&
    node.attributes?.some(
      (attribute) => attribute.name === "variant" && attribute.value === "code",
    ) === true
  );
}

/** GitHub alert markers and the callout component each becomes. */
const ALERT_CALLOUTS = {
  NOTE: CALLOUTS.Note,
  IMPORTANT: CALLOUTS.Info,
  TIP: CALLOUTS.Tip,
  WARNING: CALLOUTS.Warning,
  CAUTION: CALLOUTS.Danger,
} as const;
const ALERT_MARKER = /^\s*\[!(NOTE|IMPORTANT|TIP|WARNING|CAUTION)\]\s*/;

/**
 * A Markdown alert (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`)
 * becomes the same static callout as `<Note>`, `<Tip>`, `<Warning>` and
 * `<Danger>`, so `.md` pages have callouts too and add no JavaScript.
 */
function markdownAlertsAsCallouts() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const found = child.tagName === "blockquote" ? alertCallout(child) : undefined;
        visit(found ?? child);
        return found ?? child;
      });
    };
    visit(tree);
  };
}

function alertCallout(blockquote: HastNode): HastNode | undefined {
  const children = blockquote.children ?? [];
  const firstParagraph = children.find((child) => child.type === "element");
  const firstText = firstParagraph?.tagName === "p" ? firstParagraph.children?.[0] : undefined;
  const marker = firstText?.type === "text" ? ALERT_MARKER.exec(firstText.value ?? "") : null;
  const tone =
    marker?.[1] === undefined
      ? undefined
      : ALERT_CALLOUTS[marker[1] as keyof typeof ALERT_CALLOUTS];
  if (firstParagraph === undefined || firstText === undefined || tone === undefined) {
    return undefined;
  }
  firstText.value = (firstText.value ?? "").slice(marker?.[0].length ?? 0);
  const body =
    textOf(firstParagraph).trim().length === 0
      ? children.filter((child) => child !== firstParagraph)
      : children;
  return callout(tone, body);
}

/**
 * A family page's `<FormulaReference family>` becomes the filter component;
 * the family's table is static HTML outside the page (see formula-tables.ts).
 */
function hydrateFormulaReference() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.tagName === "formulareference") {
        node.type = "mdxJsxFlowElement";
        node.name = "FormulaReference";
        node.attributes = [
          { type: "mdxJsxAttribute", name: "family", value: String(node.properties?.family ?? "") },
        ];
        delete node.tagName;
        delete node.properties;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * A Performance page's `<PerfFigure name>` becomes the figure component; the
 * figure is static HTML outside the page (see perf-figure-markup.ts).
 */
function hydratePerfFigure() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.tagName === "perffigure") {
        node.type = "mdxJsxFlowElement";
        node.name = "PerfFigure";
        node.attributes = [
          { type: "mdxJsxAttribute", name: "name", value: String(node.properties?.name ?? "") },
        ];
        delete node.tagName;
        delete node.properties;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * A checked radio or checkbox in Markdown HTML starts checked but stays the
 * reader's to change: React would treat `checked` as a controlled value and
 * undo every click, so the markup's `checked` becomes `defaultChecked`.
 */
function uncontrolledCheckedInputs() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.tagName === "input" && node.properties?.checked === true) {
        const { checked: _checked, ...properties } = node.properties;
        node.properties = { ...properties, defaultChecked: true };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * Release-note comparisons (`<perf-compare>` blocks) become the shared
 * performance bars before raw HTML is parsed, so release notes and the
 * Performance pages draw the same figure.
 */
function renderPerfCompares() {
  return (tree: HastNode): void => {
    let figures = 0;
    const visit = (node: HastNode): void => {
      for (const child of node.children ?? []) {
        if (child.type === "raw" && isPerfCompare(child.value ?? "")) {
          figures += 1;
          child.value = renderPerfBars(
            parsePerfCompare(child.value ?? "", `perf-compare-${figures}`),
            (name) => inlineIcon(name),
          );
        } else {
          visit(child);
        }
      }
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

/** Gives short inline code a class, so an identifier reads as one token. */
function markShortInlineCode() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      for (const child of node.children ?? []) {
        if (child.tagName === "pre") continue;
        if (child.tagName === "code" && textOf(child).length <= SHORT_CODE_LENGTH) {
          const className = [child.properties?.className ?? []].flat().map(String);
          child.properties = { ...child.properties, className: [...className, SHORT_CODE_CLASS] };
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/**
 * A link that is a list item's or paragraph's whole content ("See also" and
 * next-step lists, "Read the notes") is a control of its own, not a link in
 * running text; the class gives it a 44 px row on phones.
 */
function markLinkRows() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      for (const child of node.children ?? []) {
        if (child.tagName === "pre") continue;
        if (child.tagName === "li" || child.tagName === "p") {
          const content = (child.children ?? []).filter(
            (part) => part.type !== "text" || (part.value ?? "").trim() !== "",
          );
          const link = content[0];
          if (content.length === 1 && link?.tagName === "a") {
            const className = [link.properties?.className ?? []].flat().map(String);
            link.properties = { ...link.properties, className: [...className, "sw-link-row"] };
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
  // One frame style for every fence: shell commands use the same code frame as
  // other languages. Long lines wrap, so no line is cut at the frame edge on
  // any width; codeHangingIndent hangs each continuation under its own line's
  // indent with a class, where `preserveIndent` would add an inline style to
  // every line of the page JavaScript.
  defaultProps: { wrap: true, preserveIndent: false, frame: "code" },
  themes: siteCodeThemes(),
  // The token colours are measured against AA in tokens.css; keep them exact.
  minSyntaxHighlightingColorContrast: 0,
  shiki: { langs: [FORMULA_LANGUAGE, tsMemberLanguage()] },
  styleOverrides: {
    codeFontFamily: "var(--sw-font-mono)",
    codeFontSize: "var(--sw-text-code)",
    codeLineHeight: "var(--sw-leading-code)",
    codePaddingBlock: "var(--sw-space-4)",
    codePaddingInline: "var(--sw-space-5)",
    uiFontFamily: "var(--sw-font-body)",
    uiFontSize: "var(--sw-text-caption)",
    uiFontWeight: "var(--sw-weight-semibold)",
    borderRadius: "var(--sw-radius-lg)",
    borderColor: "var(--sw-border)",
    focusBorder: "var(--sw-accent)",
    scrollbarThumbColor: "var(--sw-border-strong)",
    scrollbarThumbHoverColor: "var(--sw-field-edge)",
    frames: {
      shadowColor: "transparent",
      editorActiveTabBackground: "var(--sw-code-bg)",
      editorActiveTabForeground: "var(--sw-fg-strong)",
      editorActiveTabIndicatorTopColor: "var(--sw-accent)",
      editorActiveTabIndicatorBottomColor: "transparent",
      editorTabBarBackground: "var(--sw-surface-2)",
      editorTabBarBorderBottomColor: "var(--sw-border)",
      terminalTitlebarBackground: "var(--sw-surface-2)",
      terminalTitlebarForeground: "var(--sw-fg-muted)",
      terminalTitlebarBorderBottomColor: "var(--sw-border)",
      terminalTitlebarDotsForeground: "var(--sw-border-strong)",
      terminalTitlebarDotsOpacity: "1",
      terminalBackground: "var(--sw-code-bg)",
      inlineButtonForeground: "var(--sw-fg-muted)",
      inlineButtonBorder: "var(--sw-border-strong)",
      inlineButtonBackground: "var(--sw-surface-1)",
      tooltipSuccessBackground: "var(--sw-accent)",
      tooltipSuccessForeground: "var(--sw-accent-ink)",
    },
    textMarkers: {
      markBackground: "var(--sw-code-line-highlight)",
      markBorderColor: "var(--sw-code-line-marker)",
    },
  },
  useDarkModeMediaQuery: false,
  themeCssSelector: (theme: ExpressiveCodeTheme) => `[data-theme='${theme.type}']`,
  plugins: [
    codeHangingIndent(),
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
 * - The stylesheet, so it is downloaded once and cached across the site,
 *   with the copy button's state rules scoped to the button.
 * - The scripts (the copy button), as a function the root runs after
 *   hydration. A `<script>` in page content is inert when React renders it
 *   on a client-side navigation, and React reports it as an error. The
 *   modules observe the document, so one run serves every later page.
 */
export function expressiveCodeAssets(): Plugin {
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
        return `${scopeCopyButtonStates(baseStyles)}\n${themeStyles}`;
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

/** The docs Markdown pipeline: vite.config.ts compiles every page with it. */
export const DOCS_MDX_OPTIONS = {
  remarkPlugins: [
    remarkFrontmatter,
    [markGeneratedPages, { contentRoot: new URL("../content/docs/", import.meta.url).pathname }],
    remarkMdxFrontmatter,
    remarkGfm,
  ],
  rehypePlugins: [
    // First: Steps, Cards, callouts and the figures become static HTML, and
    // CodeGroup becomes Tabs, before fences are highlighted.
    contentComponents,
    installCommandsAsTerminals,
    markdownAlertsAsCallouts,
    runnableCodeBlocks,
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
    renderPerfCompares,
    // Raw HTML re-parse must run after Expressive Code: it drops fence `data.meta`.
    [rehypeRaw, { passThrough: nodeTypes }],
    uncontrolledCheckedInputs,
    renderGridResults,
    [renderSectionCards, { contentRoot: new URL("../content/docs/", import.meta.url).pathname }],
    hydrateFormulaReference,
    hydratePerfFigure,
    dedupeCodePopovers,
    rovingCodeFocus,
    // Prerendered heading ids: fragment links must resolve before hydration.
    rehypeSlug,
    // After the ids exist: the server render shows the outline from these.
    exportOutline,
    markResponsiveCodeBlocks,
    wrapProseTables,
    markShortInlineCode,
    markLinkRows,
  ],
} satisfies MdxOptions;
