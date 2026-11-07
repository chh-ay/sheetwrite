/**
 * Build step after the islands build: every prerendered page drops the
 * router app's scripts and links the islands client instead, with module
 * preloads for its entry and for the content islands that page holds.
 *
 *   bun src/islands/page-scripts.ts
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IslandName } from "./Island.tsx";

const ISLANDS_ENTRY = "src/islands/client.tsx";
const ISLANDS_MANIFEST = "islands-manifest.json";

/** The module each island loads on demand (islands/client.tsx imports the same paths). */
const ON_DEMAND_ISLANDS: Readonly<Record<IslandName, string>> = {
  "package-command": "src/components/PackageCommand.tsx",
  "formula-reference": "src/components/FormulaReference.tsx",
  "live-grid": "src/components/LiveGrid.tsx",
  tabs: "src/islands/StaticMarkup.tsx",
  "runnable-code": "src/islands/StaticMarkup.tsx",
};

const CLIENT_OUTPUT = new URL("../../dist/client/", import.meta.url).pathname;

interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
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

/** A chunk's file and the files of every chunk it imports, in load order. */
function chunkFiles(manifest: Manifest, key: string, seen = new Set<string>()): string[] {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined) throw new Error(`${key} is missing from ${ISLANDS_MANIFEST}`);
  return [
    chunk.file,
    ...(chunk.imports ?? []).flatMap((imported) => chunkFiles(manifest, imported, seen)),
  ];
}

function isOnDemandIsland(name: string): name is IslandName {
  return Object.hasOwn(ON_DEMAND_ISLANDS, name);
}

/** The islands client's script tag and preloads for one page. */
function pageScripts(manifest: Manifest, html: string): string {
  const entry = manifest[ISLANDS_ENTRY];
  if (entry === undefined) throw new Error(`${ISLANDS_ENTRY} is missing from ${ISLANDS_MANIFEST}`);
  // Islands that hydrate on interaction fetch their code later (islands/client.tsx);
  // preloading it would cost every visit.
  const onDemandSources = new Set(
    Array.from(html.matchAll(ISLAND_MARKER))
      .filter(([tag]) => !ON_INTERACTION.test(tag))
      .map(([, name]) => name ?? "")
      .filter(isOnDemandIsland)
      .map((name) => ON_DEMAND_ISLANDS[name])
      .filter((source) => source !== undefined),
  );
  const preloads = new Set([
    ...chunkFiles(manifest, ISLANDS_ENTRY),
    ...Array.from(onDemandSources).flatMap((source) => chunkFiles(manifest, source)),
  ]);
  // The script tag loads the entry itself.
  preloads.delete(entry.file);
  return [
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
  await writeFile(path, withIslandCode(manifest, withScripts));
  rewrittenPages += 1;
}
// The manifest is a build input, not a page asset.
await rm(manifestPath);
console.info(`Islands: ${rewrittenPages} static docs pages link the islands client.`);
