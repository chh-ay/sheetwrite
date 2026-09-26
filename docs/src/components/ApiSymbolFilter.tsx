import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

interface SymbolCard {
  element: HTMLElement;
  /** Lower-cased name plus summary, so one query matches either. */
  text: string;
}

/**
 * Exported-symbol cards grouped as the generator grouped them, so a group
 * emptied by a query takes its heading with it instead of leaving a named
 * void in the page.
 */
interface SymbolGroup {
  cards: readonly SymbolCard[];
  grid: HTMLElement;
  heading: HTMLElement | null;
}

/** Only entry-point pages list exported symbols. */
const ENTRY_POINT_PATH = /^\/docs\/api\/[^/]+\/$/;

/** Below this many cards a filter costs more clicks than it saves. */
const MINIMUM_FILTERABLE_CARDS = 12;

const PROSE_SELECTOR = "#main-content article.sw-prose";

function collectGroups(article: HTMLElement): readonly SymbolGroup[] {
  const groups: SymbolGroup[] = [];
  for (const grid of article.querySelectorAll<HTMLElement>(".api-symbol-grid")) {
    const cards = [...grid.querySelectorAll<HTMLElement>(".api-symbol-card")].map((element) => ({
      element,
      text: (element.textContent ?? "").toLowerCase(),
    }));
    if (cards.length === 0) continue;
    const sibling = grid.previousElementSibling;
    groups.push({
      cards,
      grid,
      heading: sibling instanceof HTMLElement && sibling.matches("h3") ? sibling : null,
    });
  }
  return groups;
}

function statusFor(query: string, matches: number, total: number): string {
  if (query.length === 0) return `${total} exported symbols.`;
  if (matches === 0) return `No exported symbol matches "${query}".`;
  return `${matches} of ${total} exported symbols match "${query}".`;
}

/**
 * Filter over the generated exported-symbol cards of an entry-point page.
 *
 * The cards are filtered in place rather than re-rendered: the article's own
 * anchors, the outline, and the Pagefind index keep pointing at the same
 * elements, and the disclosure rows below stay the generator's markup.
 */
export function ApiSymbolFilter(): ReactNode {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [groups, setGroups] = useState<readonly SymbolGroup[]>([]);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const inputId = useId();
  const statusId = useId();
  const collectedSignature = useRef("");

  // Markdown for a route mounts after hydration, so collect the cards on every
  // child-list change instead of once on mount.
  useEffect(() => {
    setQuery("");
    setGroups([]);
    collectedSignature.current = "";
    if (!ENTRY_POINT_PATH.test(pathname)) return;
    const article = document.querySelector<HTMLElement>(PROSE_SELECTOR);
    if (article === null) return;
    const scan = () => {
      const collected = collectGroups(article);
      const signature = collected.map((group) => group.cards.length).join("|");
      if (signature === collectedSignature.current) return;
      collectedSignature.current = signature;
      setGroups(collected);
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(article, { childList: true, subtree: true });
    return () => mutations.disconnect();
  }, [pathname]);

  const total = groups.reduce((count, group) => count + group.cards.length, 0);
  const filterable = total >= MINIMUM_FILTERABLE_CARDS;
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!filterable) return;
    const needle = trimmedQuery.toLowerCase();
    let matches = 0;
    for (const group of groups) {
      let groupMatches = 0;
      for (const card of group.cards) {
        const visible = needle.length === 0 || card.text.includes(needle);
        card.element.hidden = !visible;
        if (visible) groupMatches += 1;
      }
      matches += groupMatches;
      group.grid.hidden = groupMatches === 0;
      group.heading?.toggleAttribute("hidden", groupMatches === 0);
    }
    setMatchCount(matches);
  }, [filterable, groups, trimmedQuery]);

  if (!filterable) return null;

  return (
    <search aria-label="Filter exported symbols" className="sw-symbol-filter">
      <label className="sw-symbol-filter__label" htmlFor={inputId}>
        Filter exported symbols
      </label>
      <div className="sw-symbol-filter__field">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          aria-describedby={statusId}
          autoComplete="off"
          id={inputId}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="incremental, camelCase, or a word from the summary"
          type="search"
          value={query}
        />
        {query.length === 0 ? null : (
          <button className="sw-symbol-filter__clear" onClick={() => setQuery("")} type="button">
            Clear
          </button>
        )}
      </div>
      <p aria-live="polite" className="sw-symbol-filter__status" id={statusId}>
        {statusFor(trimmedQuery, matchCount, total)}
      </p>
    </search>
  );
}
