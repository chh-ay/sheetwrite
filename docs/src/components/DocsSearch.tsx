import { useEffect, useRef, useState } from "react";

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

interface PagefindResult {
  data(): Promise<PagefindResultData>;
}

interface PagefindResponse {
  results: PagefindResult[];
}

/** One rendered hit: pages plus their anchored members/headings. */
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

interface PagefindModule {
  options(options: { noWorker: boolean }): Promise<void>;
  search(query: string): Promise<PagefindResponse>;
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
    // Pagefind creates this browser module after Vite finishes, so no static import exists.
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

export function DocsSearch() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!commandK && !slash) return;
      const target = event.target;
      // "/" must keep typing semantics inside fields; Ctrl+K may not.
      if (slash && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      event.preventDefault();
      dialog.current?.showModal();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setError("");
    if (query.trim().length < 2) {
      setResults([]);
      setStatus("");
      return;
    }

    const controller = new AbortController();
    const search = async () => {
      try {
        setStatus("Searching…");
        const pagefind = await loadPagefind();
        const response = await pagefind.search(query);
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
        if (!controller.signal.aborted) {
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
      }
    };
    void search();
    return () => controller.abort();
  }, [query]);

  return (
    <>
      <button
        className="sw-search-button"
        onClick={() => {
          dialog.current?.showModal();
          requestAnimationFrame(() => input.current?.focus());
        }}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 5 5" />
        </svg>
        <span>Search docs</span>
        <kbd>Ctrl K</kbd>
      </button>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- only a backdrop click closes the dialog; Escape is the keyboard path. */}
      <dialog
        aria-label="Search documentation"
        className="sw-search-dialog"
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
            <span className="sw-visually-hidden">Search documentation</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 5 5" />
            </svg>
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search APIs, guides, and examples"
              ref={input}
              type="search"
              value={query}
            />
          </label>
          <button aria-label="Close search" type="submit">
            Esc
          </button>
        </form>
        <p role="alert" data-action-error hidden={error.length === 0}>
          {error}
        </p>
        <div aria-live="polite" className="sw-search-results">
          {status.length > 0 ? <p>{status}</p> : null}
          {results.map((result) => (
            <a href={result.url} key={result.url}>
              <strong>
                {result.title}
                {result.package ? <code>{result.package}</code> : null}
              </strong>
              {/* Pagefind excerpts are our own indexed text with <mark> highlights. */}
              <span dangerouslySetInnerHTML={{ __html: result.excerpt }} />
            </a>
          ))}
        </div>
      </dialog>
    </>
  );
}
