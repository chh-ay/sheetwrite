import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { element, type HastNode } from "./build-hast.js";
import { docCard } from "./content-components.js";
import { DOCS_NAVIGATION, type NavigationItem, navigationBadge } from "./navigation.js";
import { RELEASES } from "./releases.js";

/**
 * Group overview pages. `<div class="sw-section-cards"></div>` on the page of
 * a sidebar group becomes one card per page in that group, with the page's
 * description and, for a page added in the current release, a New badge, all read at build time from the
 * sidebar tree and each page's frontmatter. The sidebar stays the only list.
 */
const CARDS_TAG = "sw-section-cards";

/** The newest release, the next one included: its added pages carry New. */
const CURRENT_RELEASE = RELEASES[0]?.version ?? "";

/**
 * The illustration (public/figures/illustrations) on the card of each page
 * that has one. Other cards show the page's sidebar icon.
 */
const SECTION_ILLUSTRATIONS: Readonly<Record<string, string>> = {
  "/docs/features/grid/": "grid",
  "/docs/features/formatting/": "formatting",
  "/docs/features/data/": "data",
  "/docs/features/formulas/": "formula-references",
  "/docs/features/analysis/": "analysis",
  "/docs/features/collaboration/": "collaboration",
  "/docs/features/worker-rendering/": "worker-rendering",
  "/docs/features/accessibility/": "accessibility",
  "/docs/frameworks/vanilla/": "vanilla",
  "/docs/frameworks/react/": "react",
  "/docs/frameworks/vue/": "vue",
  "/docs/frameworks/svelte/": "svelte",
  "/docs/frameworks/lifecycle/": "lifecycle",
  "/docs/tutorials/excel-in-javascript/": "excel-in-javascript",
  "/docs/tutorials/excel-in-react/": "excel-in-react",
  "/docs/tutorials/excel-in-vue/": "excel-in-vue",
  "/docs/tutorials/excel-in-svelte/": "excel-in-svelte",
  "/docs/tutorials/excel-in-nodejs/": "excel-in-nodejs",
  "/docs/tutorials/spreadsheet-app-with-ribbon/": "ribbon-app",
};

/**
 * The pages listed directly under the sidebar section or group whose own page
 * is `href`.
 */
export function sectionPages(href: string): Array<NavigationItem & { href: string }> {
  const find = (items: readonly NavigationItem[]): NavigationItem | undefined => {
    for (const item of items) {
      if (item.href === href && item.items !== undefined) return item;
      const nested = find(item.items ?? []);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  const children =
    DOCS_NAVIGATION.find((section) => section.href === href)?.items ??
    find(DOCS_NAVIGATION.flatMap((section) => section.items))?.items;
  if (children === undefined)
    throw new Error(`${href} is not the page of a sidebar section or group`);
  return children.flatMap((item) => {
    // A child group is shown through its own page.
    const page = item.href ?? item.items?.find((child) => child.href !== undefined)?.href;
    return page === undefined ? [] : [{ ...item, href: page }];
  });
}

function description(contentRoot: string, href: string): string {
  const base = join(contentRoot, href.replace(/^\/docs\//, "").replace(/\/$/, ""));
  for (const path of [
    `${base}.md`,
    `${base}.mdx`,
    join(base, "index.md"),
    join(base, "index.mdx"),
  ]) {
    let source: string;
    try {
      source = readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const match = /^description:\s*(.+)$/m.exec(source);
    if (match?.[1] === undefined) throw new Error(`${path} has no description`);
    return match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  throw new Error(`no docs page for ${href}`);
}

function routeOf(contentRoot: string, path: string): string {
  const relativePath = relative(contentRoot, path)
    .split(sep)
    .join("/")
    .replace(/\.mdx?$/, "");
  return `/docs/${relativePath.replace(/(^|\/)index$/, "")}/`.replace(/\/+/g, "/");
}

/** Rehype plugin; `contentRoot` is docs/src/content/docs. */
export function renderSectionCards(options: { contentRoot: string }) {
  return (tree: HastNode, file: { path?: string }): void => {
    const visit = (node: HastNode): void => {
      const children = node.children ?? [];
      for (const [index, child] of children.entries()) {
        const classes = child.properties?.className;
        if (child.tagName !== "div" || !Array.isArray(classes) || !classes.includes(CARDS_TAG)) {
          visit(child);
          continue;
        }
        if (file.path === undefined) throw new Error(`${CARDS_TAG} needs a source file`);
        const pages = sectionPages(routeOf(options.contentRoot, file.path));
        const cards = pages.map((page) => {
          // The current release is the newest one, the next release included.
          const isNew = navigationBadge(page, CURRENT_RELEASE) === "new";
          const illustration = SECTION_ILLUSTRATIONS[page.href];
          return docCard({
            title: page.label,
            href: page.href,
            body: [{ type: "text", value: description(options.contentRoot, page.href) }],
            illustration,
            icon: illustration === undefined ? sidebarIcon(page) : undefined,
            badge: isNew
              ? element("span", [{ type: "text", value: "New" }], {
                  className: ["sw-nav-badge"],
                  dataBadge: "new",
                })
              : undefined,
          });
        });
        children[index] = element("div", cards, {
          className: ["sw-card-group", CARDS_TAG],
          dataCols: "2",
        });
      }
    };
    visit(tree);
  };
}

/** The page's sidebar icon, when the sidebar gives it one. */
function sidebarIcon(page: NavigationItem): string | undefined {
  return "icon" in page && typeof page.icon === "string" ? page.icon : undefined;
}

/** The same cards as a Markdown list, for plain-text outputs. */
export function sectionCardsMarkdown(
  route: string,
  describe: (href: string) => string | undefined,
  absolute: (href: string) => string,
): string {
  return sectionPages(route)
    .map((page) => {
      const text = describe(page.href);
      return `- [${page.label}](${absolute(page.href)})${text === undefined ? "" : `: ${text}`}`;
    })
    .join("\n");
}
