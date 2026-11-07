/** Server side of `virtual:perf-figures` (see perf-figure-markup.ts): every figure's markup. */
const FIGURES = import.meta.glob<string>("../generated/perf-figures/*.html", {
  eager: true,
  import: "default",
  query: "?raw",
});

/** The figure's markup to inline into the server render. */
export function perfFigureHtml(name: string): string | null {
  return FIGURES[`../generated/perf-figures/${name}.html`] ?? null;
}

/** The server render never fetches a figure. */
export function perfFigureUrl(_name: string): string | null {
  return null;
}
