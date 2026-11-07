/**
 * The docs page address of a `/docs/$` splat, with one trailing slash. Its own
 * module, because the docs route's loader runs in the router entry: importing
 * it from lib/content.ts would put every page's import map on every page.
 */
export function normalizeDocumentHref(splat: string | undefined): string {
  const path = splat?.replace(/^\/+|\/+$/g, "") ?? "";
  return `/docs/${path}${path.length === 0 ? "" : "/"}`;
}
