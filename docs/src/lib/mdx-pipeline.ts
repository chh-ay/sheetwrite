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
import { codeWords, SHORT_CODE_CLASS, SHORT_CODE_LENGTH } from "./inline-code.ts";
import { exportOutline } from "./outline.ts";
import { renderPerfBars } from "./perf-bars.ts";
import { isPerfCompare, parsePerfCompare } from "./perf-compare.ts";
import { parseReleaseLanes, renderReleaseLanes } from "./release-lanes.ts";
import { rovingCodeFocus } from "./roving-code-focus.ts";
import { runnableCodeBlocks } from "./runnable-code.ts";
import { renderSectionCards } from "./section-cards.ts";
import { sheetwriteCodeHovers } from "./sheetwrite-code-hovers.ts";
import { isVersionCompare, renderVersionCompare } from "./version-bars.ts";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  name?: string;
  attributes?: Array<{ type: string; name: string; value: string }>;
  /** A fence's info string after its language, on its `code` element. */
  data?: { meta?: string | null };
}

/** One install command on one line, in any package manager's spelling. */
const INSTALL_COMMAND = /^(?:npm install|npm i|pnpm add|yarn add|bun add)\s+((?:[@\w./-]+\s*)+)$/;

/**
 * A one-line install fence becomes a `PackageCommand` terminal, so every page
 * offers npm, pnpm, Yarn, and Bun from the same Markdown. Runs before
 * Expressive Code, which would otherwise render the fence as plain code.
 */
function install_commands_as_terminals() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      // Text nodes have no children key; writing one breaks later plugins.
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const code = child.tagName === "pre" ? child.children?.[0] : undefined;
        const language = [code?.properties?.className ?? []].flat().map(String);
        const match =
          code?.tagName === "code" && language.includes("language-sh")
            ? INSTALL_COMMAND.exec(text_of(code).trim())
            : null;
        if (match?.[1] === undefined) {
          // A CodeGroup already spells out each package manager.
          if (!is_code_group(child)) visit(child);
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

/**
 * A `perf-lanes` fence becomes its performance lanes (release-lanes.ts) as
 * static HTML, before Expressive Code would render it as plain code. The raw
 * HTML is parsed with the page's other raw HTML.
 */
function release_lane_fences() {
  return (tree: HastNode): void => {
    let figures = 0;
    const visit = (node: HastNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const code = child.tagName === "pre" ? child.children?.[0] : undefined;
        const language = [code?.properties?.className ?? []].flat().map(String);
        if (code?.tagName !== "code" || !language.includes("language-perf-lanes")) {
          visit(child);
          return child;
        }
        figures += 1;
        const figure = parseReleaseLanes(
          code.data?.meta ?? "",
          text_of(code),
          `perf-lanes-${figures}`,
        );
        return { type: "raw", value: renderReleaseLanes(figure, (name) => inlineIcon(name)) };
      });
    };
    visit(tree);
  };
}

/** A `<CodeGroup>`, which contentComponents has already turned into code tabs. */
function is_code_group(node: HastNode): boolean {
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
function markdown_alerts_as_callouts() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const found = child.tagName === "blockquote" ? alert_callout(child) : undefined;
        visit(found ?? child);
        return found ?? child;
      });
    };
    visit(tree);
  };
}

function alert_callout(blockquote: HastNode): HastNode | undefined {
  const children = blockquote.children ?? [];
  const first_paragraph = children.find((child) => child.type === "element");
  const first_text = first_paragraph?.tagName === "p" ? first_paragraph.children?.[0] : undefined;
  const marker = first_text?.type === "text" ? ALERT_MARKER.exec(first_text.value ?? "") : null;
  const tone =
    marker?.[1] === undefined
      ? undefined
      : ALERT_CALLOUTS[marker[1] as keyof typeof ALERT_CALLOUTS];
  if (first_paragraph === undefined || first_text === undefined || tone === undefined) {
    return undefined;
  }
  first_text.value = (first_text.value ?? "").slice(marker?.[0].length ?? 0);
  const body =
    text_of(first_paragraph).trim().length === 0
      ? children.filter((child) => child !== first_paragraph)
      : children;
  return callout(tone, body);
}

/**
 * A family page's `<FormulaReference family>` becomes the filter component;
 * the family's table is static HTML outside the page (see formula-tables.ts).
 */
function hydrate_formula_reference() {
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
function hydrate_perf_figure() {
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
 * Release-note comparisons become figures before raw HTML is parsed:
 * `<perf-compare>` blocks the shared performance bars, so release notes and
 * the Performance pages draw the same figure, and `<version-compare>` the
 * release comparison drawn from the committed version-comparison reports.
 */
function render_perf_compares() {
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
        } else if (child.type === "raw" && isVersionCompare(child.value ?? "")) {
          figures += 1;
          child.value = renderVersionCompare(`version-compare-${figures}`, (name) =>
            inlineIcon(name),
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
function mark_responsive_code_blocks() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode, inside_api_signature = false): void => {
      const classes = String(node.properties?.className ?? "").split(/[ ,]+/);
      const api_signature =
        inside_api_signature ||
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
              api_signature &&
              String(child.properties?.className ?? "")
                .split(/[ ,]+/)
                .includes("copy")
            ),
        );
        for (const child of node.children) visit(child, api_signature);
      }
    };
    visit(tree);
  };
}

/** Visible text of a hast subtree. */
function text_of(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(text_of).join("");
}

/** Cells shorter than this read as one token (a name, value or range). */
const SHORT_CELL_LENGTH = 28;

/** Gives short table cells a class, so a value never breaks over lines. */
function mark_short_cells(node: HastNode): void {
  for (const child of node.children ?? []) {
    if (
      (child.tagName === "td" || child.tagName === "th") &&
      text_of(child).trim().length < SHORT_CELL_LENGTH
    ) {
      child.properties = { ...child.properties, className: ["sw-cell-short"] };
    }
    mark_short_cells(child);
  }
}

/** The children of `node` that are `tag_name` elements. */
function child_elements(node: HastNode | undefined, tag_name: string): HastNode[] {
  return (node?.children ?? []).filter((child) => child.tagName === tag_name);
}

/** The rows of a table, its heading row first. */
function table_rows(table: HastNode): HastNode[] {
  return ["thead", "tbody"].flatMap((part) =>
    child_elements(table, part).flatMap((section) => child_elements(section, "tr")),
  );
}

/** The characters a phone row holds side by side, at the table's text size, without scrolling. */
const PHONE_ROW_CHARACTERS = 36;

/**
 * Whether a phone stacks the table's rows, each cell under its column's
 * heading, and labels each body cell with that heading when it does. A
 * two-column table always stacks, so its second column (the replacement, the
 * step to take) is never out of view. A three-column table stacks when its
 * longest cells, side by side, would not fit a phone row; a short one, such as
 * a few rows of data, stays a grid.
 */
function stack_on_phones(table: HastNode): boolean {
  const [heading, ...body] = table_rows(table);
  const labels = child_elements(heading, "th").map((cell) => text_of(cell).trim());
  const widest = labels.map((label, column) =>
    Math.max(
      label.length,
      ...body.map(
        (row) => text_of(child_elements(row, "td")[column] ?? { type: "text" }).trim().length,
      ),
    ),
  );
  const fits = widest.reduce((sum, length) => sum + length, 0) <= PHONE_ROW_CHARACTERS;
  if (labels.length < 2 || labels.length > 3 || (labels.length === 3 && fits)) return false;
  for (const row of body) {
    for (const [index, cell] of child_elements(row, "td").entries()) {
      cell.properties = { ...cell.properties, dataLabel: labels[index] };
    }
  }
  return true;
}

/**
 * Markdown tables get a scroll frame: a wide table scrolls inside the column
 * instead of widening the page, so short cells can stay on one line.
 * Two-column tables, and three-column ones too wide for a phone, stack their
 * rows on a phone instead, so no column is out of view.
 * Tables with their own class are designed layouts and keep their markup.
 */
function wrap_prose_tables() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (!node.children) return;
      // Tables never nest tables in this content, so a table is not visited again.
      for (const child of node.children) if (child.tagName !== "table") visit(child);
      node.children = node.children.map((child) => {
        if (child.tagName !== "table" || child.properties?.className) return child;
        mark_short_cells(child);
        break_code_at_words(child);
        const class_name = ["sw-table-frame"];
        if (stack_on_phones(child)) class_name.push("sw-table-frame--stack");
        return {
          type: "element",
          tagName: "div",
          properties: { className: class_name, tabIndex: 0 },
          children: [child],
        };
      });
    };
    visit(tree);
  };
}

/**
 * Cuts the inline code of a table into words that never break inside, with a
 * `<wbr>` between the words of a name, so a long name in a narrow column
 * breaks between its words (`Storage|Error`) or at a space, and nowhere else.
 */
function break_code_at_words(node: HastNode, in_code = false): void {
  if (!node.children) return;
  node.children = node.children.flatMap((child): HastNode[] => {
    if (in_code && child.type === "text") return code_word_nodes(child.value ?? "");
    if (child.tagName !== "pre") break_code_at_words(child, in_code || child.tagName === "code");
    return [child];
  });
}

/** Code text as unbreakable words with a `<wbr>` between the words of a name; spaces stay text. */
function code_word_nodes(text: string): HastNode[] {
  return text.split(/(\s+)/).flatMap((run): HastNode[] => {
    if (run === "") return [];
    if (/^\s/.test(run)) return [{ type: "text", value: run }];
    return codeWords(run).flatMap((word, index) => [
      ...(index === 0 ? [] : [{ type: "element", tagName: "wbr", properties: {}, children: [] }]),
      {
        type: "element",
        tagName: "span",
        properties: { className: ["sw-code-word"] },
        children: [{ type: "text", value: word }],
      },
    ]);
  });
}

/** Gives short inline code a class, so an identifier reads as one token. */
function mark_short_inline_code() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      for (const child of node.children ?? []) {
        if (child.tagName === "pre") continue;
        if (child.tagName === "code" && text_of(child).length <= SHORT_CODE_LENGTH) {
          const class_name = [child.properties?.className ?? []].flat().map(String);
          child.properties = { ...child.properties, className: [...class_name, SHORT_CODE_CLASS] };
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
function mark_link_rows() {
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
            const class_name = [link.properties?.className ?? []].flat().map(String);
            link.properties = { ...link.properties, className: [...class_name, "sw-link-row"] };
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

const expressive_code_options: RehypeExpressiveCodeOptions = {
  // One frame style for every fence: shell commands use the same code frame as
  // other languages. Long lines wrap on wide screens, so no line is cut at the
  // frame edge; below 48rem the code panel scrolls instead (base.css), so no
  // name breaks across lines. codeHangingIndent hangs each continuation under
  // its own line's indent with a class, where `preserveIndent` would add an
  // inline style to every line of the page JavaScript.
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
      // The docs package: the samples resolve its packages and its tsconfig.
      cwd: new URL("../..", import.meta.url).pathname,
      shouldTransform: (code_block) => !/\bgenerated\b/.test(code_block.meta),
    }),
  ],
};

let expressive_code_renderer: Promise<RehypeExpressiveCodeRenderer> | undefined;
function shared_expressive_code_renderer(): Promise<RehypeExpressiveCodeRenderer> {
  expressive_code_renderer ??= createRenderer(expressive_code_options);
  return expressive_code_renderer;
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
        const { baseStyles: base_styles, themeStyles: theme_styles } =
          await shared_expressive_code_renderer();
        return `${scopeCopyButtonStates(base_styles)}\n${theme_styles}`;
      }
      if (id !== RESOLVED_EXPRESSIVE_CODE_SCRIPTS_ID) return undefined;
      const { jsModules: js_modules } = await shared_expressive_code_renderer();
      const modules = js_modules.filter((code) => !code.includes(OWNED_BY_SITE_MODULE));
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
    install_commands_as_terminals,
    release_lane_fences,
    markdown_alerts_as_callouts,
    runnableCodeBlocks,
    [
      rehypeExpressiveCode,
      {
        ...expressive_code_options,
        customCreateRenderer: async () => ({
          ...(await shared_expressive_code_renderer()),
          baseStyles: "",
          themeStyles: "",
          jsModules: [],
        }),
      },
    ],
    render_perf_compares,
    // Raw HTML re-parse must run after Expressive Code: it drops fence `data.meta`.
    [rehypeRaw, { passThrough: nodeTypes }],
    renderGridResults,
    [renderSectionCards, { contentRoot: new URL("../content/docs/", import.meta.url).pathname }],
    hydrate_formula_reference,
    hydrate_perf_figure,
    dedupeCodePopovers,
    rovingCodeFocus,
    // Prerendered heading ids: fragment links must resolve before hydration.
    rehypeSlug,
    // After the ids exist: the server render shows the outline from these.
    exportOutline,
    mark_responsive_code_blocks,
    wrap_prose_tables,
    mark_short_inline_code,
    mark_link_rows,
  ],
} satisfies MdxOptions;
