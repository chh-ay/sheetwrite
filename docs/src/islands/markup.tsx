/*
 * Static markup inside an island. The server renders the content once into a
 * `display: contents` holder; the client reads the holder's markup back
 * before hydrating, so the content never ships as script.
 */

/** Holds markup the island shows but never renders itself. */
export function Markup(props: { html: string }) {
  return <div data-island-html="" innerHTML={props.html} style={{ display: "contents" }} />;
}

/** Every markup holder of a server-rendered static-markup island, in order. */
export function markupOf(island: HTMLElement): string[] {
  return Array.from(island.querySelectorAll("[data-island-html]"), (holder) => holder.innerHTML);
}
