import { createEffect, createSignal, createUniqueId, Show } from "solid-js";
import { isServer } from "solid-js/web";

import { Icon } from "./Icon.js";

/*
 * Filter over the generated exported-symbol cards of an entry-point page. An
 * island that hydrates on first use. The cards are filtered in place rather
 * than re-rendered: the article's anchors, the outline and the Pagefind index
 * keep pointing at the same elements.
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

function collect_groups(): readonly SymbolGroup[] {
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

function status_for(query: string, matches: number, total: number): string {
  if (query.length === 0) return `${total} exported symbols.`;
  if (matches === 0) return `No exported symbol matches "${query}".`;
  return `${matches} of ${total} exported symbols match "${query}".`;
}

export function ApiSymbolFilter(props: {
  /** The page's exported symbol count from its frontmatter, so the server renders the filter. */
  readonly symbolCount: number;
}) {
  const input_id = createUniqueId();
  const status_id = createUniqueId();
  // The page is static, so its cards are all there when the island hydrates.
  const groups = collect_groups();
  // The reader may have typed into the server-rendered field before it hydrated.
  const typed = isServer
    ? ""
    : ((document.getElementById(input_id) as HTMLInputElement | null)?.value ?? "");
  const [query, set_query] = createSignal(typed);
  const [match_count, set_match_count] = createSignal(props.symbolCount);
  const trimmed = () => query().trim();

  createEffect(() => {
    const needle = trimmed().toLowerCase();
    let matches = 0;
    for (const group of groups) {
      let group_matches = 0;
      for (const card of group.cards) {
        const visible = needle.length === 0 || card.text.includes(needle);
        card.element.hidden = !visible;
        if (visible) group_matches += 1;
      }
      matches += group_matches;
      group.grid.hidden = group_matches === 0;
      group.heading?.toggleAttribute("hidden", group_matches === 0);
    }
    if (groups.length > 0) set_match_count(matches);
  });

  return (
    <search aria-label="Filter exported symbols" class="sw-symbol-filter">
      {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- `for` names the input; the rule knows only React's `htmlFor`. */}
      <label class="sw-symbol-filter__label" for={input_id}>
        Filter exported symbols
      </label>
      <div class="sw-symbol-filter__field">
        <Icon name="search" />
        <input
          aria-describedby={status_id}
          autocomplete="off"
          id={input_id}
          onInput={(event) => set_query(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") set_query("");
          }}
          placeholder="incremental, camelCase, or a word from the summary"
          type="search"
          value={query()}
        />
        <Show when={query().length > 0}>
          <button class="sw-symbol-filter__clear" onClick={() => set_query("")} type="button">
            Clear
          </button>
        </Show>
      </div>
      <p aria-live="polite" class="sw-symbol-filter__status" id={status_id}>
        {status_for(trimmed(), match_count(), props.symbolCount)}
      </p>
    </search>
  );
}
