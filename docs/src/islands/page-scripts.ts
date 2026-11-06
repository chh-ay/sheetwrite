/**
 * Build step after the islands build: every prerendered page with islands
 * drops the router app's scripts and links the islands client instead, with
 * module preloads for its entry and for the content islands that page holds.
 *
 *   bun src/islands/page-scripts.ts
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ISLANDS_ENTRY, ISLANDS_MANIFEST } from "./build.ts";
import { type IslandName, ON_DEMAND_ISLANDS } from "./names.ts";

const CLIENT_OUTPUT = new URL("../../dist/client/", import.meta.url).pathname;

interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
}

type Manifest = Readonly<Record<string, ManifestChunk>>;

/** The router app's tags: its module entry, preloads, stream and scroll-restoration scripts. */
const ROUTER_TAGS = [
  /<link rel="modulepreload"[^>]*>/g,
  /<script type="module"[^>]*><\/script>/g,
  /<script data-tsr-stream-part="">.*?<\/script>/gs,
  /<script>(?:(?!<\/script>).)*?(?:\$tsr-stream-boundary|__TSR_key)(?:(?!<\/script>).)*?<\/script>/gs,
];

const ISLAND_MARKER = /data-island="([^"]+)"/g;

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
  const onDemandSources = new Set(
    Array.from(html.matchAll(ISLAND_MARKER), ([, name]) => name ?? "")
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

const manifestPath = join(CLIENT_OUTPUT, ISLANDS_MANIFEST);
const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let rewrittenPages = 0;
for await (const page of new Bun.Glob("**/*.html").scan(CLIENT_OUTPUT)) {
  const path = join(CLIENT_OUTPUT, page);
  const html = await readFile(path, "utf8");
  if (!html.includes('data-island="')) continue;
  const withoutRouter = ROUTER_TAGS.reduce((markup, tag) => markup.replace(tag, ""), html);
  await writeFile(path, withoutRouter.replace("</head>", `${pageScripts(manifest, html)}</head>`));
  rewrittenPages += 1;
}
// The manifest is a build input, not a page asset.
await rm(manifestPath);
console.info(`Islands: ${rewrittenPages} static docs pages link the islands client.`);
