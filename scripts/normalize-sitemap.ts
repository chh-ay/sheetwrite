/**
 * Normalizes the crawler-generated sitemap after `vite build`.
 *
 * The TanStack Start crawler records every discovered link verbatim, which
 * leaves entries a sitemap must not contain: fragment URLs
 * (`/docs/api/core/grid/#grid-set-zoom`), query variants of one page, files
 * such as `llms.txt`, slash/non-slash duplicates of the same page, and routes
 * that deliberately carry `noindex` (test fixtures, the MDX proof page, and the
 * 404 page). Canonical URLs on every page use the trailing-slash form, so the
 * sitemap does too.
 *
 * The crawler stamps every URL with the build date. Search engines trust a
 * `<lastmod>` only while it tracks real changes, so each page gets the date of
 * the last commit to its sources instead.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const NOINDEX_ROUTES = [/^\/test\//, /^\/docs\/proof\/$/, /^\/404\/$/];
/** A last path segment with an extension (`llms.txt`) is a file, not an HTML page. */
const FILE_PATH = /\.[a-z0-9]+$/i;
const repositoryRoot = resolve(import.meta.dir, "..");
/** A page's "Edit this page" or "Source" link names the file it renders. */
const SOURCE_LINK =
  /href="https:\/\/github\.com\/chh-ay\/sheetwrite\/(?:blob|edit)\/develop\/([^"#?]+)/g;
/** The formula reference pages render the formula contract and the reference data. */
const FORMULA_SOURCES = [
  "test/conformance/formula-contract.inventory.json",
  "scripts/formula-reference.json",
];

export function normalizeSitemap(xml: string): { xml: string; kept: number; dropped: number } {
  const entries = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  const seen = new Set<string>();
  const kept: string[] = [];
  let dropped = 0;
  for (const entry of entries) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (loc === undefined) {
      dropped++;
      continue;
    }
    const url = new URL(loc);
    if (url.hash !== "" || loc.includes("#")) {
      dropped++;
      continue;
    }
    // A query variant's page names the plain URL as canonical, so listing it
    // would contradict the canonical and spend crawl budget on a duplicate.
    if (url.search !== "" || FILE_PATH.test(url.pathname)) {
      dropped++;
      continue;
    }
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    if (NOINDEX_ROUTES.some((route) => route.test(url.pathname))) {
      dropped++;
      continue;
    }
    if (seen.has(url.href)) {
      dropped++;
      continue;
    }
    seen.add(url.href);
    kept.push(entry.replace(/<loc>[^<]+<\/loc>/, `<loc>${url.href}</loc>`));
  }
  const header = xml.slice(0, xml.indexOf("<url>"));
  const footer = "</urlset>\n";
  return { xml: `${header}${kept.join("\n")}\n${footer}`, kept: kept.length, dropped };
}

/**
 * The repository files a page renders: the files its HTML links as its source,
 * else the formula data for a formula reference page, else its route module
 * (`/showcases/sort/` is `docs/src/routes/showcases.sort.tsx`).
 */
export function pageSources(pathname: string, html: string): string[] {
  const linked = [
    ...new Set([...html.matchAll(SOURCE_LINK)].map((match) => decodeURIComponent(match[1] ?? ""))),
  ];
  if (linked.length > 0) return linked;
  if (pathname.startsWith("/docs/reference/formula-functions/")) return FORMULA_SOURCES;
  const module = pathname.split("/").filter(Boolean).join(".") || "index";
  return [`docs/src/routes/${module}.tsx`, `docs/src/routes/${module}.index.tsx`];
}

/** Sets each entry's `<lastmod>` to the date `lastmodOf` returns for its path. */
export function setLastmods(xml: string, lastmodOf: (pathname: string) => string): string {
  return xml.replace(/<url>[\s\S]*?<\/url>/g, (entry) => {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
    const lastmod = `<lastmod>${lastmodOf(new URL(loc).pathname)}</lastmod>`;
    return /<lastmod>[^<]*<\/lastmod>/.test(entry)
      ? entry.replace(/<lastmod>[^<]*<\/lastmod>/, lastmod)
      : entry.replace(/<\/loc>/, `</loc>\n    ${lastmod}`);
  });
}

const commitDates = new Map<string, string>();

/** The date (YYYY-MM-DD) of the last commit to `path`, or of HEAD for no path. */
function commitDate(path?: string): string {
  const key = path ?? "";
  const known = commitDates.get(key);
  if (known !== undefined) return known;
  const result = Bun.spawnSync(
    ["git", "log", "-1", "--format=%cs", ...(path === undefined ? [] : ["--", path])],
    {
      cwd: repositoryRoot,
    },
  );
  if (!result.success) throw new Error(`git log failed for ${key}: ${result.stderr.toString()}`);
  const date = result.stdout.toString().trim();
  commitDates.set(key, date);
  return date;
}

/** The newest commit date of a page's existing sources; HEAD's date when it has none. */
function pageLastmod(clientDirectory: string, pathname: string): string {
  const html = readFileSync(join(clientDirectory, pathname, "index.html"), "utf8");
  const dates = pageSources(pathname, html)
    .filter((path) => existsSync(join(repositoryRoot, path)))
    .map((path) => commitDate(path))
    .filter((date) => date.length > 0);
  return dates.length === 0
    ? commitDate()
    : dates.reduce((newest, date) => (date > newest ? date : newest));
}

if (import.meta.main) {
  const [clientDirectory] = process.argv.slice(2);
  if (clientDirectory === undefined) {
    throw new Error("usage: bun scripts/normalize-sitemap.ts <built client directory>");
  }
  const path = resolve(clientDirectory, "sitemap.xml");
  const { xml, kept, dropped } = normalizeSitemap(readFileSync(path, "utf8"));
  if (kept === 0) throw new Error("sitemap normalization produced zero URLs");
  writeFileSync(
    path,
    setLastmods(xml, (pathname) => pageLastmod(clientDirectory, pathname)),
  );
  console.log(`sitemap normalized: ${kept} urls kept, ${dropped} dropped`);
}
