import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { isServer } from "solid-js/web";

import { Icon } from "./Icon.js";

/*
 * Documentation search, ported from docs/src/components/DocsSearch.tsx. An
 * island that hydrates on first use; lib/shell.ts opens it from ⌘K, Ctrl K
 * and "/" before then.
 */

interface PagefindSubResult {
  url: string;
  title: string;
  excerpt: string;
}

interface PagefindResultData {
  url: string;
  meta: { title?: string; package?: string };
  excerpt: string;
  sub_results?: PagefindSubResult[];
}

interface PagefindResponse {
  results: { data(): Promise<PagefindResultData> }[];
}

interface PagefindModule {
  options(options: { noWorker: boolean }): Promise<void>;
  search(query: string): Promise<PagefindResponse>;
}

/** One rendered hit: pages plus their anchored members and headings. */
interface SearchEntry {
  url: string;
  title: string;
  package?: string;
  excerpt: string;
}

// Structural section headings; a sub-result named "Declaration" tells the
// reader nothing about WHICH declaration matched.
const GENERIC_SECTIONS = new Set(["Members", "Declaration", "Variants", "Exported symbols"]);

function entriesFor(data: PagefindResultData): SearchEntry[] {
  const page: SearchEntry = {
    url: data.url,
    title: data.meta.title ?? data.url,
    package: data.meta.package,
    excerpt: data.excerpt,
  };
  const anchored = (data.sub_results ?? [])
    .filter((sub) => sub.url.includes("#") && !GENERIC_SECTIONS.has(sub.title.trim()))
    .slice(0, 3)
    .map((sub) => ({ url: sub.url, title: sub.title, excerpt: sub.excerpt }));
  return [page, ...anchored];
}

let pagefindModule: Promise<PagefindModule> | undefined;

/**
 * Loads Pagefind once and keeps it on the main thread. Its worker resolves
 * the index at a root-relative URL, which fails when a browser or an extension
 * runs workers from `blob:` URLs; the docs index is small, so main-thread
 * search costs little and works everywhere.
 */
function loadPagefind(): Promise<PagefindModule> {
  pagefindModule ??= (async () => {
    // Pagefind writes this module after the site build, so no static import exists.
    const pagefindPath = "/pagefind/pagefind.js";
    const pagefind = (await import(/* @vite-ignore */ pagefindPath)) as PagefindModule;
    await pagefind.options({ noWorker: true });
    return pagefind;
  })();
  // A failed load (offline, index not built) may succeed on the next query.
  pagefindModule.catch(() => {
    pagefindModule = undefined;
  });
  return pagefindModule;
}

/** The key cap: lib/shell.ts writes the platform's shortcut into the page before this hydrates. */
function shortcutLabel(): string {
  if (isServer) return "⌘K";
  return document.querySelector(".sw-search-button kbd")?.textContent ?? "⌘K";
}

export function DocsSearch() {
  let dialog: HTMLDialogElement | undefined;
  let input: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchEntry[]>([]);
  const [status, setStatus] = createSignal("");
  const [error, setError] = createSignal("");

  const open = (): void => {
    dialog?.showModal();
    requestAnimationFrame(() => input?.focus());
  };

  createEffect(() => {
    const current = query();
    setError("");
    if (current.trim().length < 2) {
      setResults([]);
      setStatus("");
      return;
    }
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const search = async (): Promise<void> => {
      try {
        setStatus("Searching…");
        const pagefind = await loadPagefind();
        const response = await pagefind.search(current);
        const pages = await Promise.all(
          response.results.slice(0, 8).map((result) => result.data()),
        );
        const seen = new Set<string>();
        const data: SearchEntry[] = [];
        for (const page of pages) {
          for (const entry of entriesFor(page)) {
            if (seen.has(entry.url)) continue;
            seen.add(entry.url);
            data.push(entry);
          }
        }
        if (controller.signal.aborted) return;
        setResults(data);
        setStatus(data.length === 0 ? "No matching pages." : "");
      } catch (searchError) {
        if (controller.signal.aborted) return;
        console.error("Documentation search failed", searchError);
        setResults([]);
        setStatus("");
        try {
          const index = await fetch("/pagefind/pagefind-entry.json", {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (index.status === 404) {
            setStatus("Search becomes available after the static index is built.");
            return;
          }
        } catch (indexError) {
          if (controller.signal.aborted) return;
          console.error("Cannot check the documentation search index", indexError);
        }
        setError("Search failed; check your connection and change the query to try again.");
      }
    };
    void search();
  });

  return (
    <>
      <button class="sw-search-button" data-search-open="" onClick={open} type="button">
        <Icon name="search" />
        <span>Search docs</span>
        <kbd>{shortcutLabel()}</kbd>
      </button>
      <dialog
        aria-label="Search documentation"
        class="sw-search-dialog"
        onClick={(event) => {
          // Clicks on children land on the form; only the backdrop hits the
          // dialog element itself (it has no padding).
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.close();
        }}
        ref={dialog}
      >
        <form method="dialog">
          <label>
            <span class="sw-visually-hidden">Search documentation</span>
            <Icon name="search" size="md" />
            <input
              autocomplete="off"
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search APIs, guides, and examples"
              ref={input}
              type="search"
              value={query()}
            />
          </label>
          <button aria-label="Close search" type="submit">
            Esc
          </button>
        </form>
        <p data-action-error="" hidden={error().length === 0} role="alert">
          {error()}
        </p>
        <div aria-live="polite" class="sw-search-results">
          <Show when={status().length > 0}>
            <p>{status()}</p>
          </Show>
          <For each={results()}>
            {(result) => (
              <a href={result.url}>
                <strong>
                  {result.title}
                  <Show when={result.package}>
                    <code>{result.package}</code>
                  </Show>
                </strong>
                {/* Pagefind excerpts are our own indexed text with <mark> highlights. */}
                <span innerHTML={result.excerpt} />
              </a>
            )}
          </For>
        </div>
      </dialog>
    </>
  );
}
