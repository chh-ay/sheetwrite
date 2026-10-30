import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { DOCS_NAVIGATION, type NavigationItem, navigationBadge } from "./navigation.js";
import { LATEST_RELEASE } from "./releases.js";

/**
 * Group overview pages. `<div class="sw-section-cards"></div>` on the page of
 * a sidebar group becomes one card per page in that group, with the page's
 * description and its New/Updated badge, all read at build time from the
 * sidebar tree and each page's frontmatter. The sidebar stays the only list.
 */
const CARDS_TAG = "sw-section-cards";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** The pages listed directly under the sidebar group whose own page is `href`. */
export function sectionPages(href: string): Array<NavigationItem & { href: string }> {
  const find = (items: readonly NavigationItem[]): NavigationItem | undefined => {
    for (const item of items) {
      if (item.href === href && item.items !== undefined) return item;
      const nested = find(item.items ?? []);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  const group = find(DOCS_NAVIGATION.flatMap((section) => section.items));
  if (group === undefined) throw new Error(`${href} is not the page of a sidebar group`);
  return (group.items ?? []).flatMap((item) => {
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

function element(tagName: string, children: HastNode[], properties: Record<string, unknown> = {}) {
  return { type: "element", tagName, properties, children } satisfies HastNode;
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
        const cards = sectionPages(routeOf(options.contentRoot, file.path)).map((page) => {
          const badge = navigationBadge(page, LATEST_RELEASE.version);
          return element(
            "a",
            [
              ...(badge === undefined
                ? []
                : [
                    element(
                      "span",
                      [{ type: "text", value: badge === "new" ? "New" : "Updated" }],
                      {
                        className: ["sw-nav-badge"],
                        dataBadge: badge,
                      },
                    ),
                  ]),
              element("strong", [{ type: "text", value: page.label }]),
              element("p", [{ type: "text", value: description(options.contentRoot, page.href) }]),
            ],
            { href: page.href },
          );
        });
        children[index] = element("div", cards, {
          className: ["sw-next-links", "sw-section-cards"],
        });
      }
    };
    visit(tree);
  };
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
