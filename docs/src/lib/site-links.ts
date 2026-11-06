/**
 * Site-wide links that pages outside the documentation use, kept apart from
 * the documentation's navigation tree so those pages never load it.
 */

/** A labelled link to a site page. */
export interface SiteLink {
  readonly label: string;
  readonly href: string;
}

/**
 * Framework workbench deep links. The global topbar links to /showcases/
 * instead; these power in-page cross-links (ShowcasePage next/prev) and the
 * landing/hub link graphs. Every href here is a preserved public URL.
 */
export const SHOWCASE_NAVIGATION: readonly [SiteLink, ...SiteLink[]] = [
  { label: "Vanilla", href: "/vanilla/" },
  { label: "React", href: "/react/" },
  { label: "Vue", href: "/vue/" },
  { label: "Svelte", href: "/svelte/" },
];

/**
 * Pages that select the full formula engine. A page can select its engine only
 * before the first engine loads, so links to these pages always open a fresh
 * document instead of a client-side navigation.
 */
const FULL_ENGINE_PATHS: readonly string[] = ["/showcases/formulas/", "/test/formulas-engine/"];

export function opensFreshDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return FULL_ENGINE_PATHS.includes(path.endsWith("/") ? path : `${path}/`);
}
