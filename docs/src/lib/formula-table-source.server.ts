/** Server side of `virtual:formula-tables` (see formula-tables.ts): every table's markup. */
const TABLES = import.meta.glob<string>("../generated/formula-tables/*.html", {
  eager: true,
  import: "default",
  query: "?raw",
});

/** The family table's markup to inline into the server render. */
export function formulaTableHtml(family: string): string | null {
  return TABLES[`../generated/formula-tables/${family}.html`] ?? null;
}

/** The server render never fetches a table. */
export function formulaTableUrl(_family: string): string | null {
  return null;
}
