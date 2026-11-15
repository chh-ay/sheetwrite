/** Browser side of `virtual:perf-figures` (see perf-figure-markup.ts): each figure's asset URL. */
const URLS = import.meta.glob<string>("../generated/perf-figures/*.html", {
  eager: true,
  import: "default",
  query: "?url",
});

/** The browser reads a prerendered figure from the page, never from its script. */
export function perfFigureHtml(_name: string): string | null {
  return null;
}

/** Where the browser fetches the figure after a client-side navigation. */
export function perfFigureUrl(name: string): string | null {
  return URLS[`../generated/perf-figures/${name}.html`] ?? null;
}
