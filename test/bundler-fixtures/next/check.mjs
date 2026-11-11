import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { assertIconSheetEmitted } from "../icon-sheet.mjs";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repositoryRoot = resolve("../../..");
const nextRoot = resolve(".next");
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(directory, entry.name))
          : [resolve(directory, entry.name)],
      ),
    )
  ).flat();
}

const emitted = await walk(nextRoot);
const staticAssets = emitted.filter(
  (path) => path.includes("/.next/static/") && /\.(?:css|js|wasm)$/.test(path),
);
const wasm = staticAssets.filter((path) => path.endsWith(".wasm"));
if (wasm.length !== 1)
  throw new Error(`Expected one browser Next.js WASM asset, got ${wasm.length}`);
const selected = [...new Set(staticAssets)].sort();
function initialUrls(html) {
  return new Set(
    [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|wasm)(?:\?[^"]*)?)"/g)].map((match) =>
      match[1].split("?")[0].replace(/^\/_next\//, ""),
    ),
  );
}

const lifecycleInitialUrls = initialUrls(await readFile(resolve("out/index.html"), "utf8"));
const attributionHtml = await readFile(resolve("out/attribution.html"), "utf8").catch(() =>
  readFile(resolve("out/attribution/index.html"), "utf8"),
);
const attributionInitialUrls = initialUrls(attributionHtml);
const assets = selected.map((path) => {
  const nextRelative = relative(nextRoot, path).replaceAll("\\", "/");
  const kind = path.endsWith(".js") ? "javascript" : path.endsWith(".css") ? "css" : "wasm";
  const roles = [];
  if (kind === "wasm" || lifecycleInitialUrls.has(nextRelative)) roles.push("core-initial");
  if (attributionInitialUrls.has(nextRelative)) roles.push("core-attribution-initial");
  if (roles.length === 0) roles.push("next-async");
  return {
    path: relative(repositoryRoot, path).replaceAll("\\", "/"),
    kind,
    owner: roles.length === 1 ? roles[0] : `shared:${roles.join("+")}`,
    roles,
  };
});
if (!assets.some((asset) => asset.kind === "javascript" && asset.roles.includes("core-initial"))) {
  throw new Error("Next.js manifest identified no initial browser JavaScript");
}

// The Sort panel is a chunk of its own, apart from the other side panels and
// from every initial chunk, so it loads only when it opens. Minifiers keep the
// panel text.
const SORT_PANEL_MARKER = "My data has headers";
const PANEL_MARKER = "sheetwrite-panel-section";
const sortPanelChunks = [];
for (const path of selected.filter((file) => file.endsWith(".js"))) {
  const code = await readFile(path, "utf8");
  if (code.includes(SORT_PANEL_MARKER)) sortPanelChunks.push({ path, code });
}
if (sortPanelChunks.length !== 1) {
  throw new Error(`Expected one lazy Next.js Sort panel chunk, got ${sortPanelChunks.length}`);
}
const [sortPanelChunk] = sortPanelChunks;
const sortPanelUrl = relative(nextRoot, sortPanelChunk.path).replaceAll("\\", "/");
if (lifecycleInitialUrls.has(sortPanelUrl) || attributionInitialUrls.has(sortPanelUrl)) {
  throw new Error(`The Sort panel is in the initial Next.js chunk ${sortPanelUrl}`);
}
if (sortPanelChunk.code.includes(PANEL_MARKER)) {
  throw new Error("The Sort panel shares a Next.js chunk with the other side panels");
}
// The Queries & Connections panel is a separate lazy chunk in the same way.
const QUERY_PANEL_MARKER = "Kept from the file";
const queryPanelChunks = [];
for (const path of selected.filter((file) => file.endsWith(".js"))) {
  if ((await readFile(path, "utf8")).includes(QUERY_PANEL_MARKER)) queryPanelChunks.push(path);
}
if (queryPanelChunks.length !== 1) {
  throw new Error(`Expected one lazy Next.js query panel chunk, got ${queryPanelChunks.length}`);
}
const queryPanelUrl = relative(nextRoot, queryPanelChunks[0]).replaceAll("\\", "/");
if (lifecycleInitialUrls.has(queryPanelUrl) || attributionInitialUrls.has(queryPanelUrl)) {
  throw new Error(`The query panel is in the initial Next.js chunk ${queryPanelUrl}`);
}

await assertIconSheetEmitted({
  bundler: "Next.js",
  stylesheets: await Promise.all(
    selected
      .filter((path) => path.endsWith(".css"))
      .map(async (path) => ({ path, text: await readFile(path, "utf8") })),
  ),
  resolveUrl: (url, path) =>
    url.startsWith("/_next/")
      ? resolve(nextRoot, url.slice("/_next/".length))
      : resolve(path, "..", url),
  packagedSheet: resolve("node_modules/@sheetwrite/core/styles/icons.svg"),
});

const attributionAssetFiles = selected
  .map((path) => relative(nextRoot, path).replaceAll("\\", "/"))
  .filter((path) => path.endsWith(".js") && attributionInitialUrls.has(path));
const attribution = [
  await attributeEntry({
    assetFiles: attributionAssetFiles,
    bundler: "next",
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    entry: "app/attribution/page.tsx",
    name: "core-first-paint",
    opaqueAssetFiles: attributionAssetFiles.filter((path) =>
      /(?:^|\/)polyfills-[^/]+\.js$/.test(path),
    ),
    repositoryRoot,
    root: nextRoot,
  }),
];
const evidence = {
  schemaVersion: 2,
  bundler: "next",
  version: packageManifest.dependencies.next,
  assets,
  provenance: attributionProvenance({
    minifier: "next-swc",
    version: packageManifest.dependencies.next,
  }),
  attribution,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/next.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Next.js size manifest:", relative(process.cwd(), evidencePath));
