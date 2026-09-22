import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export interface OutlineItem {
  id: string;
  label: string;
  depth: number;
}

/**
 * Outline of the rendered document: h2/h3 headings (ids come from rehype-slug
 * in the prerendered HTML) plus generated API member rows. Read from the DOM
 * because that is the one source the shell and the generator cannot disagree
 * about - the ids the reader can click are exactly the ids the article has.
 */
export function useDocumentOutline(): readonly OutlineItem[] {
  const [items, setItems] = useState<readonly OutlineItem[]>([]);
  // Client-side navigations swap the article without remounting the shell.
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    setItems([]);
    // Scope to the prose article: the outline itself lives inside <main>, and
    // observing our own renders would loop scan -> setItems -> scan.
    const article = document.querySelector<HTMLElement>("#main-content article.sw-prose");
    if (article === null) return;
    // Seeding with the route key also makes the rescan trigger explicit.
    let signature = `route:${pathname}`;

    const scan = (): void => {
      const collected: OutlineItem[] = [];
      for (const node of article.querySelectorAll<HTMLElement>(
        "h2[id], h3[id], details.api-member[id]",
      )) {
        const isMember = node.tagName === "DETAILS";
        // Member rows: only the name code, never the trailing doc summary.
        // Headings: own text minus decorations like the .api-count chip.
        const label = (
          isMember
            ? node.querySelector(":scope > summary > code")?.textContent
            : Array.from(node.childNodes)
                .filter(
                  (child) => !(child instanceof Element && child.classList.contains("api-count")),
                )
                .map((child) => child.textContent)
                .join("")
        )?.trim();
        if (!label) continue;
        // Search anchors repeat the member row they point at, and overload rows
        // repeat the member name; one entry each.
        const previous = collected.at(-1);
        if (previous !== undefined && previous.label === label && previous.depth === 1) continue;
        collected.push({
          id: node.id,
          label,
          depth: isMember || node.tagName === "H3" ? 1 : 0,
        });
      }
      const next = collected.map((item) => `${item.depth}:${item.id}`).join("|");
      if (next === signature) return;
      signature = next;
      setItems(collected.length >= 2 ? collected : []);
    };

    scan();
    // Suspense resolves the article after this effect on client navigations;
    // rescan when its children actually arrive (attribute churn is ignored).
    const mutations = new MutationObserver(scan);
    mutations.observe(article, { childList: true, subtree: true });
    return () => mutations.disconnect();
  }, [pathname]);

  return items;
}

/** Highlight for the entry the reader is currently inside. */
function useActiveHeading(items: readonly OutlineItem[]): string {
  const [active, setActive] = useState("");

  useEffect(() => {
    setActive("");
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -66%" },
    );
    for (const item of items) {
      const target = document.getElementById(item.id);
      if (target !== null) observer.observe(target);
    }
    return () => observer.disconnect();
  }, [items]);

  return active;
}

function OutlineLinks({
  items,
  active,
}: Readonly<{ items: readonly OutlineItem[]; active?: string }>) {
  return (
    <ul>
      {items.map((item) => (
        <li data-depth={item.depth} key={item.id}>
          <a aria-current={active === item.id ? "location" : undefined} href={`#${item.id}`}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Fewer than two entries is not an outline worth a navigation surface. */
const MIN_OUTLINE_ENTRIES = 2;

/**
 * Right-rail outline for wide viewports, where site.css lays the document out
 * as a two-column grid. Hidden below 88rem, where the disclosure above the
 * article carries the same links.
 */
export function TableOfContents({ items }: Readonly<{ items: readonly OutlineItem[] }>) {
  const active = useActiveHeading(items);
  if (items.length < MIN_OUTLINE_ENTRIES) return null;
  return (
    <nav aria-label="On this page" className="sw-toc" data-pagefind-ignore>
      <span className="sw-toc__label">On this page</span>
      <OutlineLinks active={active} items={items} />
    </nav>
  );
}

/**
 * The same outline as a disclosure under the page title: a long guide needs an
 * outline on a laptop and a phone too, not only in the rail's 88rem-and-up
 * window. Native `<details>`, so opening it needs no script.
 *
 * The collapsed summary renders on every page, empty or not, so the outline
 * cannot push the article down when it arrives; site-shell.css keeps an empty
 * slot invisible rather than offering a disclosure that opens onto nothing.
 */
export function InlineTableOfContents({ items }: Readonly<{ items: readonly OutlineItem[] }>) {
  return (
    <details className="sw-toc-inline" data-pagefind-ignore>
      <summary>
        <span className="sw-toc__label">On this page</span>
      </summary>
      {items.length < MIN_OUTLINE_ENTRIES ? null : <OutlineLinks items={items} />}
    </details>
  );
}
