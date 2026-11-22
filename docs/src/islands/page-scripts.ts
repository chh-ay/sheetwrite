/**
 * Build step after the islands build. Every prerendered page:
 * - drops the router app's scripts and links the islands client instead, with
 *   module preloads for its entry and for the content islands that page holds;
 * - links the stylesheets of the islands it holds (their markup is in the page);
 * - keeps a feature stylesheet (`data-feature`, routes/__root.tsx) only if one
 *   of its selectors names only classes the page's markup uses;
 * - on the landing, inlines every stylesheet (INLINED_STYLESHEET_PAGES).
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

/**
 * The search opener: lib/shell.ts imports it on pages with a search button,
 * which preload it so the button and shortcuts work as soon as the page runs.
 */
const SEARCH_OPENER = "src/lib/search-opener.ts";
const SEARCH_BUTTON = /\bdata-search-open\b/;

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

/** An island's opening tag (islands/Island.tsx), its name, and when it hydrates. */
const ISLAND_MARKER = /<div\b[^>]*\bdata-island="([^"]+)"[^>]*>/g;
const ON_INTERACTION = /\bdata-island-hydrate="interaction"/;
/** Islands that hydrate after load (on interaction or when visible). */
const DEFERRED = /\bdata-island-hydrate="/;

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const FEATURE_ATTRIBUTE = /\sdata-feature(?:="")?/;
const HREF = /\bhref="([^"]+)"/;
const CLASS_ATTRIBUTE = /\bclass="([^"]*)"/g;

/** A chunk and every chunk it imports, in load order. */
function chunk_closure(manifest: Manifest, key: string, seen = new Set<string>()): ManifestChunk[] {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined) throw new Error(`${key} is missing from ${ISLANDS_MANIFEST}`);
  return [
    chunk,
    ...(chunk.imports ?? []).flatMap((imported) => chunk_closure(manifest, imported, seen)),
  ];
}

function chunk_files(manifest: Manifest, key: string): string[] {
  return chunk_closure(manifest, key).map((chunk) => chunk.file);
}

function chunk_stylesheets(manifest: Manifest, key: string): string[] {
  return chunk_closure(manifest, key).flatMap((chunk) => chunk.css ?? []);
}

function is_on_demand_island(name: string): name is IslandName {
  return Object.hasOwn(ON_DEMAND_ISLANDS, name);
}

/** The islands client's script tag, preloads and island stylesheets for one page. */
function page_scripts(manifest: Manifest, html: string): string {
  const entry = manifest[ISLANDS_ENTRY];
  if (entry === undefined) throw new Error(`${ISLANDS_ENTRY} is missing from ${ISLANDS_MANIFEST}`);
  const islands = Array.from(html.matchAll(ISLAND_MARKER)).flatMap(([tag, name]) =>
    name !== undefined && is_on_demand_island(name)
      ? [{ source: ON_DEMAND_ISLANDS[name], deferred: DEFERRED.test(tag) }]
      : [],
  );
  // Islands that hydrate on interaction or when visible fetch their code later
  // (islands/client.tsx); preloading it would cost every visit. Their markup is
  // in the page, so their stylesheets are linked like every other island's.
  const preloads = new Set([
    ...chunk_files(manifest, ISLANDS_ENTRY),
    ...(SEARCH_BUTTON.test(html) ? chunk_files(manifest, SEARCH_OPENER) : []),
    ...islands
      .filter((island) => !island.deferred)
      .flatMap((island) => chunk_files(manifest, island.source)),
  ]);
  // The script tag loads the entry itself.
  preloads.delete(entry.file);
  const stylesheets = new Set([
    ...chunk_stylesheets(manifest, ISLANDS_ENTRY),
    ...islands.flatMap((island) => chunk_stylesheets(manifest, island.source)),
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
function with_island_code(manifest: Manifest, html: string): string {
  const entry_files = new Set(chunk_files(manifest, ISLANDS_ENTRY));
  return html.replace(ISLAND_MARKER, (tag: string, name: string) => {
    if (!ON_INTERACTION.test(tag) || !is_on_demand_island(name)) return tag;
    const code = chunk_files(manifest, ON_DEMAND_ISLANDS[name])
      .filter((file) => !entry_files.has(file))
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
function selector_class_sets(css: string): string[][] {
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

const selector_cache = new Map<string, string[][]>();
async function selectors_of(href: string): Promise<string[][]> {
  let sets = selector_cache.get(href);
  if (sets === undefined) {
    sets = selector_class_sets(await readFile(join(CLIENT_OUTPUT, href), "utf8"));
    selector_cache.set(href, sets);
  }
  return sets;
}

/**
 * Drops the feature stylesheets a page does not use. A feature sheet stays
 * when one of its selectors names only classes the page's markup uses (or
 * when it has no selector that names a class).
 */
async function with_used_feature_stylesheets(html: string): Promise<string> {
  const used = new Set(
    Array.from(html.matchAll(CLASS_ATTRIBUTE), ([, value]) => (value ?? "").split(/\s+/)).flat(),
  );
  let result = html;
  for (const [tag] of html.matchAll(STYLESHEET_LINK)) {
    if (!FEATURE_ATTRIBUTE.test(tag)) continue;
    const sets = await selectors_of(HREF.exec(tag)?.[1] ?? "");
    const keep = sets.length === 0 || sets.some((set) => set.every((name) => used.has(name)));
    result = result.replace(tag, keep ? tag.replace(FEATURE_ATTRIBUTE, "") : "");
  }
  return result;
}

/**
 * Pages whose stylesheets are inlined in one `<style>`, in cascade order. The
 * landing is the main first visit; without stylesheet requests it paints a
 * round trip sooner. Every rule is there from the first paint, so nothing is
 * added to the cascade later: a stylesheet switched on after the first paint
 * makes Chromium re-resolve fonts and take a web font that arrived too late
 * for `font-display: optional`, which moves the text (#504).
 */
const INLINED_STYLESHEET_PAGES = new Set(["index.html"]);

async function with_inlined_stylesheets(html: string): Promise<string> {
  const head_end = html.indexOf("</head>");
  const head = html.slice(0, head_end);
  const links = Array.from(head.matchAll(STYLESHEET_LINK), ([tag]) => tag);
  const [first] = links;
  if (first === undefined) return html;
  let css = "";
  for (const tag of links) {
    const href = HREF.exec(tag)?.[1];
    if (href === undefined) throw new Error(`A stylesheet link without href: ${tag}`);
    css += await readFile(join(CLIENT_OUTPUT, href), "utf8");
  }
  if (css.includes("</style")) throw new Error("A stylesheet would close its style element");
  const inlined = links.reduce(
    (markup, tag) => markup.replace(tag, tag === first ? `<style>${css}</style>` : ""),
    head,
  );
  return `${inlined}${html.slice(head_end)}`;
}

const manifest_path = join(CLIENT_OUTPUT, ISLANDS_MANIFEST);
const manifest: Manifest = JSON.parse(await readFile(manifest_path, "utf8"));
let rewritten_pages = 0;
for await (const page of new Bun.Glob("**/*.html").scan(CLIENT_OUTPUT)) {
  const path = join(CLIENT_OUTPUT, page);
  const html = await readFile(path, "utf8");
  // Pages without content islands still load the client: it runs the page-wide
  // enhancements (code copy and popovers) and marks the page hydrated.
  const without_router = ROUTER_TAGS.reduce((markup, tag) => markup.replace(tag, ""), html);
  const with_scripts = without_router.replace("</head>", `${page_scripts(manifest, html)}</head>`);
  const styled = await with_used_feature_stylesheets(with_island_code(manifest, with_scripts));
  await writeFile(
    path,
    INLINED_STYLESHEET_PAGES.has(page) ? await with_inlined_stylesheets(styled) : styled,
  );
  rewritten_pages += 1;
}
// The manifest is a build input, not a page asset.
await rm(manifest_path);
console.info(`Islands: ${rewritten_pages} static docs pages link the islands client.`);
