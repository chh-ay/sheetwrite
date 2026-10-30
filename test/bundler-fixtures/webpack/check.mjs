import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repositoryRoot = resolve("../../..");
const root = resolve("dist");
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));

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

const publicFiles = (await walk(root))
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const wasm = publicFiles.filter((path) => path.endsWith(".wasm"));
const lazyChunks = publicFiles.filter((path) => /(?:^|\/)worker-[^/]*\.js$/.test(path));
if (wasm.length !== 1) throw new Error(`Expected one webpack WASM asset, got ${wasm.length}`);
if (!publicFiles.includes("main.js")) throw new Error("webpack emitted no initial main.js");

// `chunkFilename` names every lazy chunk `worker-*`, so tell the opt-in ribbon
// apart by content. It must stay out of main.js, or every app downloads it.
const RIBBON_MARKER = "sheetwrite-ribbon-tabs";
const ribbonChunks = [];
const workers = [];
for (const file of lazyChunks) {
  const code = await readFile(resolve(root, file), "utf8");
  (code.includes(RIBBON_MARKER) ? ribbonChunks : workers).push(file);
}
if (workers.length !== 1)
  throw new Error(`Expected one webpack Worker chunk, got ${workers.length}`);
if (ribbonChunks.length !== 1)
  throw new Error(`Expected one lazy webpack ribbon chunk, got ${ribbonChunks.length}`);
if ((await readFile(resolve(root, "main.js"), "utf8")).includes(RIBBON_MARKER)) {
  throw new Error("The ribbon is in webpack's main.js; it must load lazily");
}

const assets = publicFiles.map((file) => {
  const kind = file.endsWith(".js") ? "javascript" : file.endsWith(".css") ? "css" : "wasm";
  let owner;
  let roles;
  if (file === "main.js" || file === wasm[0]) {
    owner = "core-initial";
    roles = ["core-initial"];
  } else if (workers.includes(file)) {
    owner = "worker-async";
    roles = ["worker-async"];
  } else if (ribbonChunks.includes(file)) {
    owner = "chrome-async";
    roles = ["chrome-async"];
  } else {
    throw new Error(`Unclassified webpack emitted asset: ${file}`);
  }
  return {
    path: relative(repositoryRoot, resolve(root, file)).replaceAll("\\", "/"),
    kind,
    owner,
    roles,
  };
});
const attribution = [
  await attributeEntry({
    assetFiles: ["main.js"],
    bundler: "webpack",
    eagerImports: ["@sheetwrite/core#initSheetwrite"],
    entry: "src/main.js",
    name: "core-first-paint",
    repositoryRoot,
    root,
  }),
];
const terserVersion = packageLock.packages?.["node_modules/terser-webpack-plugin"]?.version;
if (typeof terserVersion !== "string") {
  throw new Error("webpack fixture lock is missing terser-webpack-plugin");
}
const evidence = {
  schemaVersion: 2,
  bundler: "webpack",
  version: packageManifest.dependencies.webpack,
  assets,
  provenance: attributionProvenance({
    minifier: "terser-webpack-plugin",
    version: terserVersion,
  }),
  attribution,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/webpack.json");
await mkdir(resolve(evidencePath, ".."), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("webpack size manifest:", relative(process.cwd(), evidencePath));
