import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const distRoot = resolve(import.meta.dir, "../docs/dist/client");
const defaultPages = [
  "index.html",
  "react/index.html",
  "svelte/index.html",
  "vanilla/index.html",
  "vue/index.html",
  "test/collaboration/index.html",
  "test/framework-lifecycle/react/index.html",
  "test/framework-lifecycle/svelte/index.html",
  "test/framework-lifecycle/vue/index.html",
];
const xlsxMarker = "sheetwrite-workbook-metadata-v1";
const moduleScanner = new Bun.Transpiler({ loader: "js" });

/**
 * The relative specifiers a built module imports, statically or lazily. The
 * module is parsed, so import-like text in comments and strings (Svelte's doc
 * comment for `mount()` shows `import App from './App.svelte'`) is not followed.
 */
export function relativeImports(
  content: string,
  kind: "import-statement" | "dynamic-import",
): string[] {
  return moduleScanner
    .scanImports(content)
    .filter((entry) => entry.kind === kind && entry.path.startsWith("."))
    .map((entry) => entry.path);
}

export async function collectStaticGraph(
  entrypoints: readonly string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const queue = [...entrypoints];
  for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
    if (files.has(path)) continue;
    const content = await readFile(path, "utf8");
    files.set(path, content);
    const directory = dirname(path);
    for (const specifier of relativeImports(content, "import-statement")) {
      queue.push(resolve(directory, specifier));
    }
  }
  return files;
}

async function entrypointsFromHtml(relativePath: string): Promise<string[]> {
  const html = await readFile(join(distRoot, relativePath), "utf8");
  const entrypoints: string[] = [];
  for (const match of html.matchAll(
    /(?:src|component-url|renderer-url|href)=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) entrypoints.push(join(distRoot, match[1]));
  }
  return entrypoints;
}

async function main(): Promise<void> {
  const defaultEntrypoints = (
    await Promise.all(defaultPages.map((page) => entrypointsFromHtml(page)))
  ).flat();
  const defaultGraph = await collectStaticGraph(defaultEntrypoints);
  for (const [path, content] of defaultGraph) {
    if (content.includes(xlsxMarker)) {
      throw new Error(`Default example graph eagerly includes the XLSX backend through ${path}`);
    }
  }

  const reactGraph = await collectStaticGraph(await entrypointsFromHtml("react/index.html"));
  const lazyEntrypoints: string[] = [];
  for (const [path, content] of reactGraph) {
    for (const specifier of relativeImports(content, "dynamic-import")) {
      lazyEntrypoints.push(resolve(dirname(path), specifier));
    }
    // Vite 8's preload helper hoists dynamic-import dependencies into
    // __vite__mapDeps as dist-root-relative asset strings.
    for (const match of content.matchAll(/["']assets\/([^"']+\.js)["']/g)) {
      if (match[1] !== undefined) lazyEntrypoints.push(join(distRoot, "assets", match[1]));
    }
  }
  const lazyGraph = await collectStaticGraph(lazyEntrypoints);
  if (![...lazyGraph.values()].some((content) => content.includes(xlsxMarker))) {
    throw new Error("React workbook XLSX action cannot reach the backend through a lazy import");
  }

  const xlsxEntrypoints = await entrypointsFromHtml("test/xlsx/index.html");
  const xlsxGraph = await collectStaticGraph(xlsxEntrypoints);
  if (![...xlsxGraph.values()].some((content) => content.includes(xlsxMarker))) {
    throw new Error("Dedicated XLSX route does not contain the concrete workbook backend");
  }

  console.log(
    `Example XLSX isolation passed (${defaultGraph.size} default chunks, ${xlsxGraph.size} XLSX chunks)`,
  );
}

if (import.meta.main) await main();
