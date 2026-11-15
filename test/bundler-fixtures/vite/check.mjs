import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { assertIconSheetEmitted } from "../icon-sheet.mjs";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repositoryRoot = resolve("../../..");
const root = resolve("dist");
const manifest = JSON.parse(await readFile(resolve(root, ".vite/manifest.json"), "utf8"));
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const rolesByFile = new Map();
const kindByFile = new Map();
const initialRoles = [
  "core-initial",
  "react-initial",
  "svelte-initial",
  "vue-initial",
  "shell-initial",
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
    ),
  );
  return nested.flat();
}

function addFile(file, role) {
  const kind = file.endsWith(".js")
    ? "javascript"
    : file.endsWith(".css")
      ? "css"
      : file.endsWith(".wasm")
        ? "wasm"
        : undefined;
  if (!kind) return;
  const previousKind = kindByFile.get(file);
  if (previousKind && previousKind !== kind) throw new Error(`Vite asset ${file} changed kind`);
  kindByFile.set(file, kind);
  const roles = rolesByFile.get(file) ?? new Set();
  roles.add(role);
  rolesByFile.set(file, roles);
}

function findEntry(html) {
  const matches = Object.entries(manifest).filter(
    ([key, chunk]) =>
      chunk.isEntry && (key === html || chunk.src === html || key.endsWith(`/${html}`)),
  );
  if (matches.length !== 1)
    throw new Error(`Expected one Vite manifest entry for ${html}, got ${matches.length}`);
  return matches[0][0];
}

function staticGraph(rootKey) {
  const visited = new Set();
  const pending = [rootKey];
  while (pending.length > 0) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
    visited.add(key);
    for (const imported of chunk.imports ?? []) pending.push(imported);
  }
  return visited;
}

function addChunk(key, role) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
  addFile(chunk.file, role);
  for (const file of chunk.css ?? []) addFile(file, role);
  for (const file of chunk.assets ?? []) {
    if (file.endsWith(".js") && !/(?:^|\/)worker-[^/]*\.js$/.test(file)) {
      throw new Error(`Unclassified Vite JavaScript URL asset: ${file}`);
    }
    addFile(file, file.endsWith(".js") ? "worker-async" : role);
  }
}

const entryRoles = {
  "index.html": "core-initial",
  "react.html": "react-initial",
  "svelte.html": "svelte-initial",
  "vue.html": "vue-initial",
  "worker.html": "worker-loader-initial",
  "xlsx.html": "xlsx-loader-initial",
  "charts.html": "charts-loader-initial",
  "queries.html": "queries-loader-initial",
  "shell.html": "shell-initial",
  "addons.html": "addons-initial",
};
const defaultInitialChunks = new Set();
const staticGraphsByHtml = new Map();
for (const [html, role] of Object.entries(entryRoles)) {
  const graph = staticGraph(findEntry(html));
  staticGraphsByHtml.set(html, graph);
  for (const key of graph) {
    addChunk(key, role);
    if (initialRoles.includes(role)) defaultInitialChunks.add(key);
  }
}

/**
 * Classify every chunk reachable through the dynamic imports of one lazy-loader
 * entry. The walk stops at core's initial chunks: what they load lazily is
 * core's own chrome, which the chrome walk below classifies.
 */
function classifyLazyChunks(html, role) {
  const pending = [];
  for (const key of staticGraph(findEntry(html)))
    pending.push(...(manifest[key].dynamicImports ?? []));
  const visited = new Set();
  while (pending.length > 0) {
    const rootKey = pending.pop();
    for (const key of staticGraph(rootKey)) {
      if (visited.has(key) || defaultInitialChunks.has(key)) continue;
      visited.add(key);
      addChunk(key, role);
      pending.push(...(manifest[key].dynamicImports ?? []));
    }
  }
  return visited;
}

const xlsxChunks = classifyLazyChunks("xlsx.html", "xlsx-async");
if (xlsxChunks.size === 0) throw new Error("Vite emitted no lazy XLSX chunk");
const chartsChunks = classifyLazyChunks("charts.html", "charts-async");
if (chartsChunks.size === 0) throw new Error("Vite emitted no lazy charts chunk");
const queryChunks = classifyLazyChunks("queries.html", "queries-async");
if (queryChunks.size === 0) throw new Error("Vite emitted no lazy query chunk");
classifyLazyChunks("addons.html", "addons-async");
// Chunks already classified as optional-package code; the chrome walk below skips them.
const optionalPackageChunks = new Set([...xlsxChunks, ...chartsChunks, ...queryChunks]);

// Minifiers rename `createChartViewCache`, but keep this error text from the
// charts view cache. It must be in the lazy charts chunk and in no initial chunk.
const CHARTS_CODE_MARKER = "chart view cache was disposed";
const chunkSource = (key) => readFile(resolve(root, manifest[key].file), "utf8");
const chartsSources = await Promise.all([...chartsChunks].map(chunkSource));
if (!chartsSources.some((source) => source.includes(CHARTS_CODE_MARKER))) {
  throw new Error("The lazy charts chunk does not contain the charts view cache");
}
for (const key of defaultInitialChunks) {
  if ((await chunkSource(key)).includes(CHARTS_CODE_MARKER)) {
    throw new Error(`Charts code is in the initial chunk ${manifest[key].file}`);
  }
}

// A page that installs every add-on with static imports keeps each add-on's
// heavy code out of its initial graph. Minifiers keep these strings.
const LAZY_ADDON_MARKERS = {
  "chart drawing": "sheetwrite-chart-legend",
  "XLSX codec": "xl/workbook.xml",
  "query engine": "Query engine returned incomplete column metadata",
  "history panel": ".sheetwrite-history",
};
for (const key of staticGraphsByHtml.get("addons.html") ?? []) {
  const code = await chunkSource(key);
  for (const [name, marker] of Object.entries(LAZY_ADDON_MARKERS)) {
    if (code.includes(marker)) {
      throw new Error(`The ${name} is in the add-on page's initial chunk ${manifest[key].file}`);
    }
  }
}

// Opt-in chrome (the ribbon, the toolbar and the command model they share)
// loads lazily from the default entries, the composable shell included. It
// must never join an initial graph, or every app would download it again.
const chromePending = [];
for (const key of defaultInitialChunks) chromePending.push(...(manifest[key].dynamicImports ?? []));
const chromeVisited = new Set();
while (chromePending.length > 0) {
  for (const key of staticGraph(chromePending.pop())) {
    if (chromeVisited.has(key) || optionalPackageChunks.has(key) || defaultInitialChunks.has(key))
      continue;
    chromeVisited.add(key);
    addChunk(key, "chrome-async");
    chromePending.push(...(manifest[key].dynamicImports ?? []));
  }
}
// Class names only the command chrome renders; minifiers keep strings.
const CHROME_MARKERS = ["sheetwrite-ribbon-", "sheetwrite-command-toolbar"];
for (const key of defaultInitialChunks) {
  const code = await chunkSource(key);
  const marker = CHROME_MARKERS.find((candidate) => code.includes(candidate));
  if (marker !== undefined) {
    throw new Error(`Command chrome (${marker}) is in the initial chunk ${manifest[key].file}`);
  }
}
for (const marker of CHROME_MARKERS) {
  const sources = await Promise.all([...chromeVisited].map(chunkSource));
  if (!sources.some((code) => code.includes(marker))) {
    throw new Error(`Vite emitted no lazy chrome chunk containing ${marker}`);
  }
}

// The Sort panel is a dynamic entry of its own, apart from the other side
// panels, so it loads only when it opens. Minifiers keep this panel text.
const SORT_PANEL_MARKER = "My data has headers";
const sortPanelKeys = Object.keys(manifest).filter(
  (key) => manifest[key].isDynamicEntry && manifest[key].src?.endsWith("panels/sort-panel.js"),
);
if (sortPanelKeys.length !== 1) {
  throw new Error(`Expected one lazy Vite Sort panel chunk, got ${sortPanelKeys.length}`);
}
if (!(await chunkSource(sortPanelKeys[0])).includes(SORT_PANEL_MARKER)) {
  throw new Error("The lazy Vite Sort panel chunk does not contain the Sort panel");
}
for (const key of [...defaultInitialChunks, ...chromeVisited]) {
  if (key !== sortPanelKeys[0] && (await chunkSource(key)).includes(SORT_PANEL_MARKER)) {
    throw new Error(`The Sort panel is also in ${manifest[key].file}`);
  }
}

// The Queries & Connections panel is a dynamic entry of its own as well.
const QUERY_PANEL_MARKER = "Kept from the file";
const queryPanelKeys = Object.keys(manifest).filter(
  (key) => manifest[key].isDynamicEntry && manifest[key].src?.endsWith("panels/query-panel.js"),
);
if (queryPanelKeys.length !== 1) {
  throw new Error(`Expected one lazy Vite query panel chunk, got ${queryPanelKeys.length}`);
}
if (!(await chunkSource(queryPanelKeys[0])).includes(QUERY_PANEL_MARKER)) {
  throw new Error("The lazy Vite query panel chunk does not contain the query panel");
}
for (const key of [...defaultInitialChunks, ...chromeVisited]) {
  if (key !== queryPanelKeys[0] && (await chunkSource(key)).includes(QUERY_PANEL_MARKER)) {
    throw new Error(`The query panel is also in ${manifest[key].file}`);
  }
}

const emitted = await walk(root);
const publicFiles = emitted
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const workerFiles = publicFiles.filter((path) => /(?:^|\/)recipe-worker-[^/]*\.js$/.test(path));
if (workerFiles.length !== 1)
  throw new Error(`Expected one Vite Worker chunk, got ${workerFiles.length}`);
addFile(workerFiles[0], "worker-async");

// Core's own default worker (`renderer: "worker"` with no `workerUrl`) must be
// bundled, not copied: a copied worker keeps relative imports that do not
// exist beside it, so it fails to load and the grid falls back.
const defaultWorkers = publicFiles.filter((path) => /(?:^|\/)assets\/worker-[^/]*\.js$/.test(path));
if (defaultWorkers.length !== 1) {
  throw new Error(`Expected one bundled core default worker, got ${defaultWorkers.length}`);
}
const defaultWorker = await readFile(resolve(root, defaultWorkers[0]), "utf8");
if (/\bfrom\s*["']\.{1,2}\/|\bimport\s*\(\s*["']\.{1,2}\//.test(defaultWorker)) {
  throw new Error(`Core default worker ${defaultWorkers[0]} was copied, not bundled`);
}
const wasmFiles = publicFiles.filter((path) => path.endsWith(".wasm"));
const queryWasmFiles = wasmFiles.filter((file) => rolesByFile.get(file)?.has("queries-async"));
if (queryWasmFiles.length !== 1) {
  throw new Error(`Expected one lazy query WASM asset, got ${queryWasmFiles.length}`);
}

// The add-ons page imports `@sheetwrite/core/history`, whose diff kernel has
// its own WASM that loads on the first version diff.
const historyWasmFiles = wasmFiles.filter((file) =>
  /(?:^|\/)sheetwrite_history_bg-[^/]*\.wasm$/.test(file),
);
if (historyWasmFiles.length !== 1) {
  throw new Error(`Expected one lazy history kernel WASM asset, got ${historyWasmFiles.length}`);
}
for (const file of historyWasmFiles) {
  if (!rolesByFile.has(file)) addFile(file, "addons-async");
}

const defaultWasmFiles = wasmFiles.filter(
  (file) => !queryWasmFiles.includes(file) && !historyWasmFiles.includes(file),
);
if (defaultWasmFiles.length !== 1) {
  throw new Error(`Expected one default Vite WASM asset, got ${defaultWasmFiles.length}`);
}

if (!rolesByFile.has(defaultWasmFiles[0])) {
  for (const role of initialRoles) addFile(defaultWasmFiles[0], role);
}
for (const file of publicFiles) {
  if (!rolesByFile.has(file)) throw new Error(`Unclassified Vite emitted asset: ${file}`);
}
for (const file of rolesByFile.keys()) {
  if (!publicFiles.includes(file))
    throw new Error(`Vite manifest asset is missing from output: ${file}`);
}

const stylesheets = await Promise.all(
  publicFiles
    .filter((path) => path.endsWith(".css"))
    .map(async (path) => ({ path, text: await readFile(resolve(root, path), "utf8") })),
);
if (!stylesheets.some(({ text }) => text.includes(".sheetwrite"))) {
  throw new Error("Packed adapter stylesheets did not resolve canonical core CSS");
}
await assertIconSheetEmitted({
  bundler: "Vite",
  stylesheets,
  resolveUrl: (url, path) =>
    url.startsWith("/") ? resolve(root, `.${url}`) : resolve(root, dirname(path), url),
  packagedSheet: resolve("node_modules/@sheetwrite/core/styles/icons.svg"),
});
const javascript = publicFiles.filter((path) => path.endsWith(".js"));
const browserGraph = (
  await Promise.all(javascript.map((path) => readFile(resolve(root, path), "utf8")))
).join("\n");
if (/node:fs(?:\/promises)?|fs\/promises/.test(browserGraph)) {
  throw new Error("Vite browser graph contains a Node filesystem import");
}

const assets = publicFiles.map((file) => {
  const roles = [...rolesByFile.get(file)].sort();
  const owner =
    roles.length === 1
      ? roles[0]
      : roles.every((role) => initialRoles.includes(role))
        ? "shared-initial"
        : `shared:${roles.join("+")}`;
  return {
    path: relative(repositoryRoot, resolve(root, file)).replaceAll("\\", "/"),
    kind: kindByFile.get(file),
    owner,
    roles,
  };
});
const coreGraph = staticGraphsByHtml.get("index.html");
if (coreGraph === undefined) throw new Error("Vite core entry graph was not recorded");
const attribution = [
  await attributeEntry({
    assetFiles: [...coreGraph]
      .map((key) => manifest[key]?.file)
      .filter((file) => typeof file === "string" && file.endsWith(".js")),
    bundler: "vite",
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    entry: "index.html",
    name: "core-first-paint",
    repositoryRoot,
    root,
  }),
];
const esbuildVersion = packageLock.packages?.["node_modules/esbuild"]?.version;
if (typeof esbuildVersion !== "string") throw new Error("Vite fixture lock is missing esbuild");
const evidence = {
  schemaVersion: 2,
  bundler: "vite",
  version: packageManifest.dependencies.vite,
  assets,
  provenance: attributionProvenance({ minifier: "esbuild", version: esbuildVersion }),
  attribution,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/vite.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Vite size manifest:", relative(process.cwd(), evidencePath));
