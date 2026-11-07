import { createEffect, createSignal, createUniqueId, Show } from "solid-js";
import { isServer } from "solid-js/web";

import { Icon } from "./Icon.js";

/*
 * Filter over the generated exported-symbol cards of an entry-point page,
 * ported from docs/src/components/ApiSymbolFilter.tsx. An island that hydrates
 * on first use. The cards are filtered in place rather than re-rendered: the
 * article's anchors, the outline and the Pagefind index keep pointing at the
 * same elements.
 */

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

/** Below this many cards a filter costs more clicks than it saves. */
export const MINIMUM_FILTERABLE_CARDS = 12;

function collectGroups(): readonly SymbolGroup[] {
  if (isServer) return [];
  const article = document.querySelector<HTMLElement>("#main-content article.sw-prose");
  const groups: SymbolGroup[] = [];
  for (const grid of article?.querySelectorAll<HTMLElement>(".api-symbol-grid") ?? []) {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".api-symbol-card"), (element) => ({
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

export function ApiSymbolFilter(props: {
  /** The page's exported symbol count from its frontmatter, so the server renders the filter. */
  readonly symbolCount: number;
}) {
  const inputId = createUniqueId();
  const statusId = createUniqueId();
  // The page is static, so its cards are all there when the island hydrates.
  const groups = collectGroups();
  // The reader may have typed into the server-rendered field before it hydrated.
  const typed = isServer
    ? ""
    : ((document.getElementById(inputId) as HTMLInputElement | null)?.value ?? "");
  const [query, setQuery] = createSignal(typed);
  const [matchCount, setMatchCount] = createSignal(props.symbolCount);
  const trimmed = () => query().trim();

  createEffect(() => {
    const needle = trimmed().toLowerCase();
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
    if (groups.length > 0) setMatchCount(matches);
  });

  return (
    <search aria-label="Filter exported symbols" class="sw-symbol-filter">
      <label class="sw-symbol-filter__label" for={inputId}>
        Filter exported symbols
      </label>
      <div class="sw-symbol-filter__field">
        <Icon name="search" />
        <input
          aria-describedby={statusId}
          autocomplete="off"
          id={inputId}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="incremental, camelCase, or a word from the summary"
          type="search"
          value={query()}
        />
        <Show when={query().length > 0}>
          <button class="sw-symbol-filter__clear" onClick={() => setQuery("")} type="button">
            Clear
          </button>
        </Show>
      </div>
      <p aria-live="polite" class="sw-symbol-filter__status" id={statusId}>
        {statusFor(trimmed(), matchCount(), props.symbolCount)}
      </p>
    </search>
  );
}
