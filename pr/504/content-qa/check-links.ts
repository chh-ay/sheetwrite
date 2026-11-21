/**
 * QA script: crawls every sitemap page of a docs preview, then checks each
 * internal link (path and anchor) and each external link.
 *
 *   bun check-links.ts <preview-origin> <output-directory>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [origin = "", outputDirectory = ""] = process.argv.slice(2);
if (origin === "" || outputDirectory === "") {
  throw new Error("Usage: bun check-links.ts <preview-origin> <output-directory>");
}
mkdirSync(outputDirectory, { recursive: true });
const SITE_ORIGIN = "https://www.sheetwrite.dev";
const PAGE_CONCURRENCY = 8;
const EXTERNAL_CONCURRENCY = 4;
const EXTERNAL_TIMEOUT_MS = 20_000;

interface PageScan {
  readonly status: number;
  readonly ids: ReadonlySet<string>;
  readonly links: readonly string[];
}

async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

function decodeEntities(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

async function scanPage(path: string): Promise<PageScan> {
  const response = await fetch(new URL(path, origin));
  const html = response.ok ? await response.text() : "";
  // Only the document body: head links (canonical, preload) are not reader links.
  const body = html.slice(Math.max(0, html.indexOf("<body")));
  const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((match) => decodeEntities(match[1] ?? "")));
  const links = [...body.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((match) =>
    decodeEntities(match[1] ?? ""),
  );
  return { status: response.status, ids, links };
}

const sitemap = await (await fetch(new URL("/sitemap.xml", origin))).text();
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
  (match[1] ?? "").replace(SITE_ORIGIN, ""),
);
const scans = new Map<string, PageScan>();
await inBatches(pages, PAGE_CONCURRENCY, async (page) => {
  scans.set(page, await scanPage(page));
});

const brokenInternal: string[] = [];
const external = new Map<string, Set<string>>();
const extraTargets = new Map<string, PageScan>();
async function targetScan(path: string): Promise<PageScan> {
  const known = scans.get(path) ?? extraTargets.get(path);
  if (known !== undefined) return known;
  const scan = await scanPage(path);
  extraTargets.set(path, scan);
  return scan;
}

for (const [page, scan] of scans) {
  if (scan.status !== 200) brokenInternal.push(`${page}: page returns ${scan.status}`);
  for (const link of scan.links) {
    if (/^(mailto:|tel:|javascript:)/.test(link)) continue;
    const resolved = new URL(link, new URL(page, SITE_ORIGIN));
    if (resolved.origin !== SITE_ORIGIN) {
      const pagesLinking = external.get(resolved.href) ?? new Set<string>();
      pagesLinking.add(page);
      external.set(resolved.href, pagesLinking);
      continue;
    }
    const target = await targetScan(resolved.pathname);
    if (target.status !== 200) {
      brokenInternal.push(`${page} -> ${link}: target returns ${target.status}`);
      continue;
    }
    const anchor = decodeURIComponent(resolved.hash.slice(1));
    if (anchor !== "" && !target.ids.has(anchor)) {
      brokenInternal.push(`${page} -> ${link}: no element with id "${anchor}"`);
    }
  }
}

async function externalStatus(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) sheetwrite-docs-link-check" },
    });
    await response.body?.cancel();
    return `${response.status}${response.redirected ? ` (redirected to ${response.url})` : ""}`;
  } catch (error) {
    return `request failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const externalResults = await inBatches([...external.keys()], EXTERNAL_CONCURRENCY, async (url) => ({
  url,
  status: await externalStatus(url),
  pages: [...(external.get(url) ?? [])].sort(),
}));
writeFileSync(join(outputDirectory, "internal-broken.txt"), `${[...new Set(brokenInternal)].sort().join("\n")}\n`);
writeFileSync(join(outputDirectory, "external.json"), JSON.stringify(externalResults, null, 2));
const externalFailures = externalResults.filter((result) => !result.status.startsWith("200"));
process.stdout.write(
  `pages: ${pages.length}, broken internal links: ${new Set(brokenInternal).size}, external URLs: ${externalResults.length}, external not 200: ${externalFailures.length}\n`,
);
for (const failure of externalFailures) {
  process.stdout.write(`${failure.status}  ${failure.url}  (${failure.pages.slice(0, 3).join(", ")})\n`);
}
