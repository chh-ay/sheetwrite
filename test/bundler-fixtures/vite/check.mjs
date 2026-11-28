import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { assertIconSheetEmitted } from "../icon-sheet.mjs";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repository_root = resolve("../../..");
const root = resolve("dist");
const manifest = JSON.parse(await readFile(resolve(root, ".vite/manifest.json"), "utf8"));
const package_manifest = JSON.parse(await readFile("package.json", "utf8"));
const package_lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const roles_by_file = new Map();
const kind_by_file = new Map();
const initial_roles = [
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

function add_file(file, role) {
  const kind = file.endsWith(".js")
    ? "javascript"
    : file.endsWith(".css")
      ? "css"
      : file.endsWith(".wasm")
        ? "wasm"
        : undefined;
  if (!kind) return;
  const previous_kind = kind_by_file.get(file);
  if (previous_kind && previous_kind !== kind) throw new Error(`Vite asset ${file} changed kind`);
  kind_by_file.set(file, kind);
  const roles = roles_by_file.get(file) ?? new Set();
  roles.add(role);
  roles_by_file.set(file, roles);
}

function find_entry(html) {
  const matches = Object.entries(manifest).filter(
    ([key, chunk]) =>
      chunk.isEntry && (key === html || chunk.src === html || key.endsWith(`/${html}`)),
  );
  if (matches.length !== 1)
    throw new Error(`Expected one Vite manifest entry for ${html}, got ${matches.length}`);
  return matches[0][0];
}

function static_graph(root_key) {
  const visited = new Set();
  const pending = [root_key];
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

function add_chunk(key, role) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
  add_file(chunk.file, role);
  for (const file of chunk.css ?? []) add_file(file, role);
  for (const file of chunk.assets ?? []) {
    if (file.endsWith(".js") && !/(?:^|\/)worker-[^/]*\.js$/.test(file)) {
      throw new Error(`Unclassified Vite JavaScript URL asset: ${file}`);
    }
    add_file(file, file.endsWith(".js") ? "worker-async" : role);
  }
}

const entry_roles = {
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
const default_initial_chunks = new Set();
const static_graphs_by_html = new Map();
for (const [html, role] of Object.entries(entry_roles)) {
  const graph = static_graph(find_entry(html));
  static_graphs_by_html.set(html, graph);
  for (const key of graph) {
    add_chunk(key, role);
    if (initial_roles.includes(role)) default_initial_chunks.add(key);
  }
}

/**
 * Classify every chunk reachable through the dynamic imports of one lazy-loader
 * entry. The walk stops at core's initial chunks: what they load lazily is
 * core's own chrome, which the chrome walk below classifies.
 */
function classify_lazy_chunks(html, role) {
  const pending = [];
  for (const key of static_graph(find_entry(html)))
    pending.push(...(manifest[key].dynamicImports ?? []));
  const visited = new Set();
  while (pending.length > 0) {
    const root_key = pending.pop();
    for (const key of static_graph(root_key)) {
      if (visited.has(key) || default_initial_chunks.has(key)) continue;
      visited.add(key);
      add_chunk(key, role);
      pending.push(...(manifest[key].dynamicImports ?? []));
    }
  }
  return visited;
}

const xlsx_chunks = classify_lazy_chunks("xlsx.html", "xlsx-async");
if (xlsx_chunks.size === 0) throw new Error("Vite emitted no lazy XLSX chunk");
const charts_chunks = classify_lazy_chunks("charts.html", "charts-async");
if (charts_chunks.size === 0) throw new Error("Vite emitted no lazy charts chunk");
const query_chunks = classify_lazy_chunks("queries.html", "queries-async");
if (query_chunks.size === 0) throw new Error("Vite emitted no lazy query chunk");
classify_lazy_chunks("addons.html", "addons-async");
// Chunks already classified as optional-package code; the chrome walk below skips them.
const optional_package_chunks = new Set([...xlsx_chunks, ...charts_chunks, ...query_chunks]);

// Minifiers rename `createChartViewCache`, but keep this error text from the
// charts view cache. It must be in the lazy charts chunk and in no initial chunk.
const CHARTS_CODE_MARKER = "chart view cache was disposed";
const chunk_source = (key) => readFile(resolve(root, manifest[key].file), "utf8");
const charts_sources = await Promise.all([...charts_chunks].map(chunk_source));
if (!charts_sources.some((source) => source.includes(CHARTS_CODE_MARKER))) {
  throw new Error("The lazy charts chunk does not contain the charts view cache");
}
for (const key of default_initial_chunks) {
  if ((await chunk_source(key)).includes(CHARTS_CODE_MARKER)) {
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
for (const key of static_graphs_by_html.get("addons.html") ?? []) {
  const code = await chunk_source(key);
  for (const [name, marker] of Object.entries(LAZY_ADDON_MARKERS)) {
    if (code.includes(marker)) {
      throw new Error(`The ${name} is in the add-on page's initial chunk ${manifest[key].file}`);
    }
  }
}

// Opt-in chrome (the ribbon, the toolbar and the command model they share)
// loads lazily from the default entries, the composable shell included. It
// must never join an initial graph, or every app would download it again.
const chrome_pending = [];
for (const key of default_initial_chunks)
  chrome_pending.push(...(manifest[key].dynamicImports ?? []));
const chrome_visited = new Set();
while (chrome_pending.length > 0) {
  for (const key of static_graph(chrome_pending.pop())) {
    if (
      chrome_visited.has(key) ||
      optional_package_chunks.has(key) ||
      default_initial_chunks.has(key)
    )
      continue;
    chrome_visited.add(key);
    add_chunk(key, "chrome-async");
    chrome_pending.push(...(manifest[key].dynamicImports ?? []));
  }
}
// Class names only the command chrome renders; minifiers keep strings.
const CHROME_MARKERS = ["sheetwrite-ribbon-", "sheetwrite-command-toolbar"];
for (const key of default_initial_chunks) {
  const code = await chunk_source(key);
  const marker = CHROME_MARKERS.find((candidate) => code.includes(candidate));
  if (marker !== undefined) {
    throw new Error(`Command chrome (${marker}) is in the initial chunk ${manifest[key].file}`);
  }
}
for (const marker of CHROME_MARKERS) {
  const sources = await Promise.all([...chrome_visited].map(chunk_source));
  if (!sources.some((code) => code.includes(marker))) {
    throw new Error(`Vite emitted no lazy chrome chunk containing ${marker}`);
  }
}

// The Sort panel is a dynamic entry of its own, apart from the other side
// panels, so it loads only when it opens. Minifiers keep this panel text.
const SORT_PANEL_MARKER = "My data has headers";
const sort_panel_keys = Object.keys(manifest).filter(
  (key) => manifest[key].isDynamicEntry && manifest[key].src?.endsWith("panels/sort-panel.js"),
);
if (sort_panel_keys.length !== 1) {
  throw new Error(`Expected one lazy Vite Sort panel chunk, got ${sort_panel_keys.length}`);
}
if (!(await chunk_source(sort_panel_keys[0])).includes(SORT_PANEL_MARKER)) {
  throw new Error("The lazy Vite Sort panel chunk does not contain the Sort panel");
}
for (const key of [...default_initial_chunks, ...chrome_visited]) {
  if (key !== sort_panel_keys[0] && (await chunk_source(key)).includes(SORT_PANEL_MARKER)) {
    throw new Error(`The Sort panel is also in ${manifest[key].file}`);
  }
}

// The Queries & Connections panel is a dynamic entry of its own as well.
const QUERY_PANEL_MARKER = "Kept from the file";
const query_panel_keys = Object.keys(manifest).filter(
  (key) => manifest[key].isDynamicEntry && manifest[key].src?.endsWith("panels/query-panel.js"),
);
if (query_panel_keys.length !== 1) {
  throw new Error(`Expected one lazy Vite query panel chunk, got ${query_panel_keys.length}`);
}
if (!(await chunk_source(query_panel_keys[0])).includes(QUERY_PANEL_MARKER)) {
  throw new Error("The lazy Vite query panel chunk does not contain the query panel");
}
for (const key of [...default_initial_chunks, ...chrome_visited]) {
  if (key !== query_panel_keys[0] && (await chunk_source(key)).includes(QUERY_PANEL_MARKER)) {
    throw new Error(`The query panel is also in ${manifest[key].file}`);
  }
}

const emitted = await walk(root);
const public_files = emitted
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const worker_files = public_files.filter((path) => /(?:^|\/)recipe-worker-[^/]*\.js$/.test(path));
if (worker_files.length !== 1)
  throw new Error(`Expected one Vite Worker chunk, got ${worker_files.length}`);
add_file(worker_files[0], "worker-async");

// Core's own default worker (`renderer: "worker"` with no `workerUrl`) must be
// bundled, not copied: a copied worker keeps relative imports that do not
// exist beside it, so it fails to load and the grid falls back.
const default_workers = public_files.filter((path) =>
  /(?:^|\/)assets\/worker-[^/]*\.js$/.test(path),
);
if (default_workers.length !== 1) {
  throw new Error(`Expected one bundled core default worker, got ${default_workers.length}`);
}
const default_worker = await readFile(resolve(root, default_workers[0]), "utf8");
if (/\bfrom\s*["']\.{1,2}\/|\bimport\s*\(\s*["']\.{1,2}\//.test(default_worker)) {
  throw new Error(`Core default worker ${default_workers[0]} was copied, not bundled`);
}
const wasm_files = public_files.filter((path) => path.endsWith(".wasm"));
const query_wasm_files = wasm_files.filter((file) => roles_by_file.get(file)?.has("queries-async"));
if (query_wasm_files.length !== 1) {
  throw new Error(`Expected one lazy query WASM asset, got ${query_wasm_files.length}`);
}

// The add-ons page imports `@sheetwrite/core/history`, whose diff kernel has
// its own WASM that loads on the first version diff.
const history_wasm_files = wasm_files.filter((file) =>
  /(?:^|\/)sheetwrite_history_bg-[^/]*\.wasm$/.test(file),
);
if (history_wasm_files.length !== 1) {
  throw new Error(`Expected one lazy history kernel WASM asset, got ${history_wasm_files.length}`);
}
for (const file of history_wasm_files) {
  if (!roles_by_file.has(file)) add_file(file, "addons-async");
}

const default_wasm_files = wasm_files.filter(
  (file) => !query_wasm_files.includes(file) && !history_wasm_files.includes(file),
);
if (default_wasm_files.length !== 1) {
  throw new Error(`Expected one default Vite WASM asset, got ${default_wasm_files.length}`);
}

if (!roles_by_file.has(default_wasm_files[0])) {
  for (const role of initial_roles) add_file(default_wasm_files[0], role);
}
for (const file of public_files) {
  if (!roles_by_file.has(file)) throw new Error(`Unclassified Vite emitted asset: ${file}`);
}
for (const file of roles_by_file.keys()) {
  if (!public_files.includes(file))
    throw new Error(`Vite manifest asset is missing from output: ${file}`);
}

const stylesheets = await Promise.all(
  public_files
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
const javascript = public_files.filter((path) => path.endsWith(".js"));
const browser_graph = (
  await Promise.all(javascript.map((path) => readFile(resolve(root, path), "utf8")))
).join("\n");
if (/node:fs(?:\/promises)?|fs\/promises/.test(browser_graph)) {
  throw new Error("Vite browser graph contains a Node filesystem import");
}

const assets = public_files.map((file) => {
  const roles = [...roles_by_file.get(file)].sort();
  const owner =
    roles.length === 1
      ? roles[0]
      : roles.every((role) => initial_roles.includes(role))
        ? "shared-initial"
        : `shared:${roles.join("+")}`;
  return {
    path: relative(repository_root, resolve(root, file)).replaceAll("\\", "/"),
    kind: kind_by_file.get(file),
    owner,
    roles,
  };
});
const core_graph = static_graphs_by_html.get("index.html");
if (core_graph === undefined) throw new Error("Vite core entry graph was not recorded");
const attribution = [
  await attributeEntry({
    assetFiles: [...core_graph]
      .map((key) => manifest[key]?.file)
      .filter((file) => typeof file === "string" && file.endsWith(".js")),
    bundler: "vite",
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    entry: "index.html",
    name: "core-first-paint",
    repositoryRoot: repository_root,
    root,
  }),
];
const esbuild_version = package_lock.packages?.["node_modules/esbuild"]?.version;
if (typeof esbuild_version !== "string") throw new Error("Vite fixture lock is missing esbuild");
const evidence = {
  schemaVersion: 2,
  bundler: "vite",
  version: package_manifest.dependencies.vite,
  assets,
  provenance: attributionProvenance({ minifier: "esbuild", version: esbuild_version }),
  attribution,
};
const evidence_path = resolve(repository_root, "test-results/bundlers/vite.json");
await mkdir(resolve(evidence_path, ".."), { recursive: true });
await writeFile(evidence_path, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Vite size manifest:", relative(process.cwd(), evidence_path));
