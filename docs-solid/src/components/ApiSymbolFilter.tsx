import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  Show,
} from "solid-js";

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

/** Whether the page at `pathname` is an entry-point page, the only kind that lists exported symbols. */
export function listsExportedSymbols(pathname: string): boolean {
  return ENTRY_POINT_PATH.test(pathname);
}

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
 * `pathname` is the current route.
 */
export function ApiSymbolFilter(props: Readonly<{ pathname: string }>) {
  const [groups, setGroups] = createSignal<readonly SymbolGroup[]>([]);
  const [query, setQuery] = createSignal("");
  const [matchCount, setMatchCount] = createSignal(0);
  const inputId = createUniqueId();
  const statusId = createUniqueId();
  let collectedSignature = "";

  // Markdown for a route may mount after hydration, so collect the cards on
  // every child-list change instead of once on mount.
  createEffect(
    on(
      () => props.pathname,
      (pathname) => {
        setQuery("");
        setGroups([]);
        collectedSignature = "";
        if (!listsExportedSymbols(pathname)) return;
        const article = document.querySelector<HTMLElement>(PROSE_SELECTOR);
        if (article === null) return;
        const scan = () => {
          const collected = collectGroups(article);
          const signature = collected.map((group) => group.cards.length).join("|");
          if (signature === collectedSignature) return;
          collectedSignature = signature;
          setGroups(collected);
        };
        scan();
        const mutations = new MutationObserver(scan);
        mutations.observe(article, { childList: true, subtree: true });
        onCleanup(() => mutations.disconnect());
      },
    ),
  );

  const total = createMemo(() => groups().reduce((count, group) => count + group.cards.length, 0));
  const filterable = createMemo(() => total() >= MINIMUM_FILTERABLE_CARDS);
  const trimmedQuery = createMemo(() => query().trim());

  createEffect(() => {
    if (!filterable()) return;
    const needle = trimmedQuery().toLowerCase();
    let matches = 0;
    for (const group of groups()) {
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
  });

  return (
    <Show when={filterable()}>
      <search aria-label="Filter exported symbols" class="sw-symbol-filter">
        <label class="sw-symbol-filter__label" for={inputId}>
          Filter exported symbols
        </label>
        <div class="sw-symbol-filter__field">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 5 5" />
          </svg>
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
          {statusFor(trimmedQuery(), matchCount(), total())}
        </p>
      </search>
    </Show>
  );
}
