import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MIN_OUTLINE_ENTRIES, type OutlineItem } from "../lib/outline.js";
import { Icon } from "./Icon.js";

/** The outline before the page says otherwise; one constant, so effects see a stable value. */
const NO_ENTRIES: readonly OutlineItem[] = [];

/**
 * Outline of the rendered document: h2/h3 headings (ids come from rehype-slug
 * in the prerendered HTML) plus, on pages without their own member index,
 * generated API member rows. Read from the DOM because that is the one source
 * the shell and the generator cannot disagree about - the ids the reader can
 * click are exactly the ids the article has.
 *
 * `initial` is the outline the build collected from the same headings (see
 * lib/outline.ts), so the server render and the first client render already
 * show it; the DOM read then keeps it current (the symbol filter hides groups).
 */
export function useDocumentOutline(
  initial: readonly OutlineItem[] = NO_ENTRIES,
): readonly OutlineItem[] {
  const [items, setItems] = useState<readonly OutlineItem[]>(initial);
  // Client-side navigations swap the article without remounting the shell.
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    setItems(initial);
    // Scope to the prose article: the outline itself lives inside <main>, and
    // observing our own renders would loop scan -> setItems -> scan.
    const article = document.querySelector<HTMLElement>("#main-content article.sw-prose");
    if (article === null) return;
    // Seeding with the route key also makes the rescan trigger explicit.
    let signature = `route:${pathname}`;

    const scan = (): void => {
      const collected: OutlineItem[] = [];
      // Generated member lists carry their own anchor index at the top, so the
      // rail lists headings instead of repeating every member a second time.
      const memberTargets =
        article.querySelector(".api-member-index") === null
          ? "h2[id], h3[id], details.api-member[id]"
          : "h2[id], h3[id]";
      for (const node of article.querySelectorAll<HTMLElement>(memberTargets)) {
        // Search-target anchors are invisible duplicates of the member rows.
        if (node.classList.contains("api-search-anchor")) continue;
        // A filtered-out group hides its heading; a link to it would go nowhere.
        if (node.hidden) continue;
        const isMember = node.tagName === "DETAILS";
        // A member's own "Examples" and "See also" sit inside its collapsed
        // row; listed bare they repeat dozens of times without their member.
        if (!isMember && node.parentElement?.closest("details.api-member") != null) continue;
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
      setItems(collected.length >= MIN_OUTLINE_ENTRIES ? collected : []);
    };

    scan();
    // Suspense resolves the article after this effect on client navigations;
    // rescan when its children actually arrive. Of the attributes, only
    // `hidden` changes the outline (the exported-symbol filter sets it).
    const mutations = new MutationObserver(scan);
    mutations.observe(article, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
    return () => mutations.disconnect();
  }, [pathname, initial]);

  return items;
}

/**
 * Where a section counts as being read: just below the sticky header. The
 * current entry is the last one whose heading is above this line.
 */
const READING_LINE_PX = 96;

/** Distance from the page end that counts as scrolled to the end. */
const PAGE_END_SLACK_PX = 2;

/**
 * The id of the last outline target above the reading line, or the first one.
 * Scrolled to the end of the page, the last heading on screen: short closing
 * sections can never reach the reading line.
 */
function currentSectionId(targets: readonly HTMLElement[]): string {
  const { scrollHeight } = document.documentElement;
  const atEnd = window.scrollY + window.innerHeight >= scrollHeight - PAGE_END_SLACK_PX;
  const line = atEnd ? window.innerHeight : READING_LINE_PX;
  let current = targets[0]?.id ?? "";
  for (const target of targets) {
    if (target.getBoundingClientRect().top > line) break;
    current = target.id;
  }
  return current;
}

/**
 * The entry the reader is inside. Read from scroll position once per frame,
 * so a long section keeps its entry marked while its heading is far above.
 */
function useActiveHeading(items: readonly OutlineItem[]): string {
  const [active, setActive] = useState("");

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((target) => target !== null);
    setActive(currentSectionId(targets));
    if (targets.length === 0) return;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      setActive(currentSectionId(targets));
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
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

/**
 * Right-rail outline for guide and API pages on wide screens. Smaller
 * viewports use the disclosure above the article instead.
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
 */
export function InlineTableOfContents({ items }: Readonly<{ items: readonly OutlineItem[] }>) {
  return (
    <details className="sw-toc-inline" data-pagefind-ignore>
      <summary>
        <span className="sw-toc__label">On this page</span>
        <Icon className="sw-disclosure-icon" name="chevron-right" />
      </summary>
      {items.length < MIN_OUTLINE_ENTRIES ? null : <OutlineLinks items={items} />}
    </details>
  );
}
