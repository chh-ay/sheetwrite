/**
 * Build step after the islands build. Every prerendered page:
 * - drops the router app's scripts and links the islands client instead, with
 *   module preloads for its entry and for the content islands that page holds;
 * - links the stylesheets of the islands it holds (their markup is in the page);
 * - keeps a feature stylesheet (`data-feature`, routes/__root.tsx) only if one
 *   of its selectors names only classes the page's markup uses.
 *
 *   bun src/islands/page-scripts.ts
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SHOWCASE_ISLANDS, type ShowcaseIsland } from "../showcases/islands.ts";
import { TEST_FIXTURE_ISLANDS } from "../test-fixtures/islands.ts";
import type { IslandName } from "./Island.tsx";

const ISLANDS_ENTRY = "src/islands/client.tsx";
const ISLANDS_MANIFEST = "islands-manifest.json";

/** The module each island loads on demand (islands/client.tsx imports the same paths). */
const ON_DEMAND_ISLANDS: Readonly<Record<IslandName, string>> = {
  "activation-fixture": "src/islands/ActivationFixture.tsx",
  "package-command": "src/components/PackageCommand.tsx",
  "formula-reference": "src/components/FormulaReference.tsx",
  "live-grid": "src/components/LiveGrid.tsx",
  tabs: "src/islands/StaticMarkup.tsx",
  "runnable-code": "src/islands/StaticMarkup.tsx",
  search: "src/components/DocsSearch.tsx",
  "api-symbol-filter": "src/components/ApiSymbolFilter.tsx",
  "landing-hero": "src/components/landing/HeroApp.tsx",
  "landing-architecture": "src/components/landing/ArchitectureScene.tsx",
  "landing-stories": "src/components/landing/StoryReel.tsx",
  "landing-code": "src/components/landing/CodeTabs.tsx",
  ...(Object.fromEntries(
    Object.entries<ShowcaseIsland>(SHOWCASE_ISLANDS).map(([name, island]) => [name, island.source]),
  ) as Record<keyof typeof SHOWCASE_ISLANDS, string>),
  ...(Object.fromEntries(
    Object.entries<ShowcaseIsland>(TEST_FIXTURE_ISLANDS).map(([name, island]) => [
      name,
      island.source,
    ]),
  ) as Record<keyof typeof TEST_FIXTURE_ISLANDS, string>),
};

const CLIENT_OUTPUT = new URL("../../dist/client/", import.meta.url).pathname;

interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
  readonly css?: readonly string[];
}

type Manifest = Readonly<Record<string, ManifestChunk>>;

/** The router app's tags: its module entry, preloads, stream and scroll-restoration scripts. */
const ROUTER_TAGS = [
  // Solid's head writes other attributes before `rel` and `type`.
  /<link\b[^>]*\brel="modulepreload"[^>]*>/g,
  /<script\b[^>]*\btype="module"[^>]*><\/script>/g,
  /<script\b[^>]*\bdata-tsr-stream-part[^>]*>.*?<\/script>/gs,
  /<script\b[^>]*>(?:(?!<\/script>).)*?(?:\$tsr-stream-boundary|__TSR_key|\$_TSR)(?:(?!<\/script>).)*?<\/script>/gs,
];

/** An island's opening tag (islands/Island.tsx), its name, and whether it hydrates on interaction. */
const ISLAND_MARKER = /<div\b[^>]*\bdata-island="([^"]+)"[^>]*>/g;
const ON_INTERACTION = /\bdata-island-hydrate="interaction"/;

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const FEATURE_ATTRIBUTE = /\sdata-feature(?:="")?/;
const HREF = /\bhref="([^"]+)"/;
const CLASS_ATTRIBUTE = /\bclass="([^"]*)"/g;

/** A chunk and every chunk it imports, in load order. */
function chunkClosure(manifest: Manifest, key: string, seen = new Set<string>()): ManifestChunk[] {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined) throw new Error(`${key} is missing from ${ISLANDS_MANIFEST}`);
  return [
    chunk,
    ...(chunk.imports ?? []).flatMap((imported) => chunkClosure(manifest, imported, seen)),
  ];
}

function chunkFiles(manifest: Manifest, key: string): string[] {
  return chunkClosure(manifest, key).map((chunk) => chunk.file);
}

function chunkStylesheets(manifest: Manifest, key: string): string[] {
  return chunkClosure(manifest, key).flatMap((chunk) => chunk.css ?? []);
}

function isOnDemandIsland(name: string): name is IslandName {
  return Object.hasOwn(ON_DEMAND_ISLANDS, name);
}

/** The islands client's script tag, preloads and island stylesheets for one page. */
function pageScripts(manifest: Manifest, html: string): string {
  const entry = manifest[ISLANDS_ENTRY];
  if (entry === undefined) throw new Error(`${ISLANDS_ENTRY} is missing from ${ISLANDS_MANIFEST}`);
  const islands = Array.from(html.matchAll(ISLAND_MARKER)).flatMap(([tag, name]) =>
    name !== undefined && isOnDemandIsland(name)
      ? [{ source: ON_DEMAND_ISLANDS[name], onInteraction: ON_INTERACTION.test(tag) }]
      : [],
  );
  // Islands that hydrate on interaction fetch their code later (islands/client.tsx);
  // preloading it would cost every visit. Their markup is in the page, so their
  // stylesheets are linked like every other island's.
  const preloads = new Set([
    ...chunkFiles(manifest, ISLANDS_ENTRY),
    ...islands
      .filter((island) => !island.onInteraction)
      .flatMap((island) => chunkFiles(manifest, island.source)),
  ]);
  // The script tag loads the entry itself.
  preloads.delete(entry.file);
  const stylesheets = new Set([
    ...chunkStylesheets(manifest, ISLANDS_ENTRY),
    ...islands.flatMap((island) => chunkStylesheets(manifest, island.source)),
  ]);
  return [
    ...Array.from(stylesheets, (file) => `<link rel="stylesheet" href="/${file}"/>`),
    ...Array.from(preloads, (file) => `<link rel="modulepreload" href="/${file}"/>`),
    `<script type="module" src="/${entry.file}"></script>`,
  ].join("");
}

/**
 * Each interaction island's tag lists its code's files (`data-island-code`),
 * minus what the entry already loads, so the client can fetch them at low
 * priority once the island is on screen and the page is idle.
 */
function withIslandCode(manifest: Manifest, html: string): string {
  const entryFiles = new Set(chunkFiles(manifest, ISLANDS_ENTRY));
  return html.replace(ISLAND_MARKER, (tag: string, name: string) => {
    if (!ON_INTERACTION.test(tag) || !isOnDemandIsland(name)) return tag;
    const code = chunkFiles(manifest, ON_DEMAND_ISLANDS[name])
      .filter((file) => !entryFiles.has(file))
      .map((file) => `/${file}`)
      .join(" ");
    return tag.replace(/>$/, ` data-island-code="${code}">`);
  });
}

/**
 * A stylesheet's selectors, each as the classes it needs. Classes inside
 * functional pseudo-classes (`:not()`, `:is()`, `:where()`, `:has()`) are left
 * out: they are conditions, not requirements. Selectors naming no class are
 * left out too.
 */
function selectorClassSets(css: string): string[][] {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\([^)]*\)/g, "")
    .replace(/"[^"]*"|'[^']*'/g, "");
  const sets: string[][] = [];
  for (const [, prelude] of text.matchAll(/([^{}]+)\{/g)) {
    if (prelude === undefined || prelude.trimStart().startsWith("@")) continue;
    for (const selector of prelude.split(",")) {
      let plain = selector;
      while (/\([^()]*\)/.test(plain)) plain = plain.replace(/\([^()]*\)/g, "");
      const classes = Array.from(
        plain.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g),
        ([, name]) => name ?? "",
      );
      if (classes.length > 0) sets.push(classes);
    }
  }
  return sets;
}

const selectorCache = new Map<string, string[][]>();
async function selectorsOf(href: string): Promise<string[][]> {
  let sets = selectorCache.get(href);
  if (sets === undefined) {
    sets = selectorClassSets(await readFile(join(CLIENT_OUTPUT, href), "utf8"));
    selectorCache.set(href, sets);
  }
  return sets;
}

/**
 * Drops the feature stylesheets a page does not use. A feature sheet stays
 * when one of its selectors names only classes the page's markup uses (or
 * when it has no selector that names a class).
 */
async function withUsedFeatureStylesheets(html: string): Promise<string> {
  const used = new Set(
    Array.from(html.matchAll(CLASS_ATTRIBUTE), ([, value]) => (value ?? "").split(/\s+/)).flat(),
  );
  let result = html;
  for (const [tag] of html.matchAll(STYLESHEET_LINK)) {
    if (!FEATURE_ATTRIBUTE.test(tag)) continue;
    const sets = await selectorsOf(HREF.exec(tag)?.[1] ?? "");
    const keep = sets.length === 0 || sets.some((set) => set.every((name) => used.has(name)));
    result = result.replace(tag, keep ? tag.replace(FEATURE_ATTRIBUTE, "") : "");
  }
  return result;
}

const manifestPath = join(CLIENT_OUTPUT, ISLANDS_MANIFEST);
const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let rewrittenPages = 0;
for await (const page of new Bun.Glob("**/*.html").scan(CLIENT_OUTPUT)) {
  const path = join(CLIENT_OUTPUT, page);
  const html = await readFile(path, "utf8");
  // Pages without content islands still load the client: it runs the page-wide
  // enhancements (code copy and popovers) and marks the page hydrated.
  const withoutRouter = ROUTER_TAGS.reduce((markup, tag) => markup.replace(tag, ""), html);
  const withScripts = withoutRouter.replace("</head>", `${pageScripts(manifest, html)}</head>`);
  await writeFile(path, await withUsedFeatureStylesheets(withIslandCode(manifest, withScripts)));
  rewrittenPages += 1;
}
// The manifest is a build input, not a page asset.
await rm(manifestPath);
console.info(`Islands: ${rewrittenPages} static docs pages link the islands client.`);
