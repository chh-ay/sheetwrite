/** Browser side of `virtual:formula-tables` (see formula-tables.ts): each table's asset URL. */
const URLS = import.meta.glob<string>("../generated/formula-tables/*.html", {
  eager: true,
  import: "default",
  query: "?url",
});

/** The browser reads a prerendered table from the page, never from its script. */
export function formulaTableHtml(_family: string): string | null {
  return null;
}

/** Where the browser fetches the family table after a client-side navigation. */
export function formulaTableUrl(family: string): string | null {
  return URLS[`../generated/formula-tables/${family}.html`] ?? null;
}
