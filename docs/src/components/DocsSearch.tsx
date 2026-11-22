import {
  type PagefindResultData,
  RANKED_PAGES,
  rankEntries,
  type SearchEntry,
  searchTerms,
} from "@docs/lib/search-ranking.js";
import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js";
import { isServer } from "solid-js/web";

import { Icon } from "./Icon.js";

/*
 * Documentation search. An island whose code loads on first use;
 * lib/search-opener.ts opens its dialog and focuses the field from the
 * button, ⌘K, Ctrl K and "/" before then, so nothing typed is lost while the
 * island's code loads.
 */

interface PagefindResponse {
  results: { data(): Promise<PagefindResultData> }[];
}

interface PagefindModule {
  options(options: { noWorker: boolean }): Promise<void>;
  search(query: string): Promise<PagefindResponse>;
}

let pagefind_module: Promise<PagefindModule> | undefined;

/**
 * Loads Pagefind once and keeps it on the main thread. Its worker resolves
 * the index at a root-relative URL, which fails when a browser or an extension
 * runs workers from `blob:` URLs; the docs index is small, so main-thread
 * search costs little and works everywhere.
 */
function load_pagefind(): Promise<PagefindModule> {
  pagefind_module ??= (async () => {
    // Pagefind writes this module after the site build, so no static import exists.
    const pagefind_path = "/pagefind/pagefind.js";
    const pagefind = (await import(/* @vite-ignore */ pagefind_path)) as PagefindModule;
    await pagefind.options({ noWorker: true });
    return pagefind;
  })();
  // A failed load (offline, index not built) may succeed on the next query.
  pagefind_module.catch(() => {
    pagefind_module = undefined;
  });
  return pagefind_module;
}

/** The key cap: lib/search-opener.ts writes the platform's shortcut into the page. */
function shortcut_label(): string {
  if (isServer) return "⌘K";
  return document.querySelector(".sw-search-button kbd")?.textContent ?? "⌘K";
}

export function DocsSearch() {
  let dialog: HTMLDialogElement | undefined;
  let field: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;
  const list_id = createUniqueId();
  const option_id = (index: number): string => `${list_id}-${index}`;
  const [query, set_query] = createSignal("");
  const [results, set_results] = createSignal<SearchEntry[]>([]);
  const [active, set_active] = createSignal(0);
  const [status, set_status] = createSignal("");
  const [error, set_error] = createSignal("");

  createEffect(() => {
    const current = query();
    set_error("");
    if (current.trim().length < 2) {
      set_results([]);
      set_status("");
      return;
    }
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const search = async (): Promise<void> => {
      try {
        set_status("Searching…");
        const pagefind = await load_pagefind();
        const response = await pagefind.search(searchTerms(current));
        const pages = await Promise.all(
          response.results.slice(0, RANKED_PAGES).map((result) => result.data()),
        );
        if (controller.signal.aborted) return;
        const entries = rankEntries(pages, current);
        set_results(entries);
        set_active(0);
        set_status(entries.length === 0 ? `No results for “${current.trim()}”.` : "");
      } catch (search_error) {
        if (controller.signal.aborted) return;
        console.error("Documentation search failed", search_error);
        set_results([]);
        set_status("");
        try {
          const index = await fetch("/pagefind/pagefind-entry.json", {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (index.status === 404) {
            set_status("Search becomes available after the static index is built.");
            return;
          }
        } catch (index_error) {
          if (controller.signal.aborted) return;
          console.error("Cannot check the documentation search index", index_error);
        }
        set_error("Search failed; check your connection and change the query to try again.");
      }
    };
    void search();
  });

  // The highlighted result stays in view as the arrow keys move through a long list.
  createEffect(() => {
    list?.children[active()]?.scrollIntoView({ block: "nearest" });
  });

  const on_field_key_down = (event: KeyboardEvent): void => {
    const count = results().length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (count === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      set_active((index) => (index + step + count) % count);
    } else if (event.key === "Enter" && !event.isComposing) {
      // The form closes the dialog on submit; Enter opens a result instead.
      event.preventDefault();
      const entry = results()[active()];
      if (entry === undefined) return;
      dialog?.close();
      window.location.assign(entry.url);
    }
  };

  return (
    <>
      {/* lib/search-opener.ts opens the dialog from the page's markup; this opens
          it when a click came before that module loaded and was held until the
          island hydrated. */}
      <button
        class="sw-search-button"
        data-search-open=""
        onClick={() => {
          if (dialog !== undefined && !dialog.open) dialog.showModal();
          field?.focus();
        }}
        type="button"
      >
        <Icon name="search" />
        <span>Search docs</span>
        <kbd>{shortcut_label()}</kbd>
      </button>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- only a backdrop click closes the dialog; Escape is the keyboard path. */}
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
        ref={(element) => {
          dialog = element;
        }}
      >
        <form method="dialog">
          <label>
            <span class="sw-visually-hidden">Search documentation</span>
            <Icon name="search" size="md" />
            <input
              aria-activedescendant={results().length > 0 ? option_id(active()) : undefined}
              aria-autocomplete="list"
              aria-controls={list_id}
              aria-expanded={results().length > 0}
              autocomplete="off"
              onInput={(event) => set_query(event.currentTarget.value)}
              onKeyDown={on_field_key_down}
              placeholder="Search APIs, guides, and examples"
              ref={(element) => {
                field = element;
                // Text typed before the island hydrated: lib/search-opener.ts
                // opened the dialog and focused this field at once.
                if (element.value !== "") set_query(element.value);
              }}
              role="combobox"
              type="search"
            />
          </label>
          <button aria-label="Close search" type="submit">
            Esc
          </button>
        </form>
        <p data-action-error="" hidden={error().length === 0} role="alert">
          {error()}
        </p>
        <p class="sw-search-status" hidden={status().length === 0} role="status">
          {status()}
        </p>
        <div
          aria-label="Search results"
          class="sw-search-results"
          id={list_id}
          ref={(element) => {
            list = element;
          }}
          role="listbox"
        >
          <For each={results()}>
            {(result, index) => (
              <a
                aria-selected={index() === active()}
                href={result.url}
                id={option_id(index())}
                onPointerMove={() => set_active(index())}
                role="option"
              >
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
