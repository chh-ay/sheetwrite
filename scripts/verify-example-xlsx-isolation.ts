import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const distRoot = resolve(import.meta.dir, "../docs-solid/dist/client");
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

/**
 * The modules a page loads only later: everything its lazy imports reach,
 * including the lazy imports of lazily loaded modules (the XLSX add-on loads
 * its codec on first use). Lazy imports in `routers` are not followed: they
 * are the other pages of the site, which every page can reach.
 */
export async function collectLazyGraph(
  staticGraph: ReadonlyMap<string, string>,
  routers: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const lazy = new Map<string, string>();
  const known = (path: string): boolean => staticGraph.has(path) || lazy.has(path);
  let frontier: [string, string][] = [...staticGraph];
  while (frontier.length > 0) {
    const entrypoints: string[] = [];
    for (const [path, content] of frontier) {
      if (routers.has(path)) continue;
      for (const specifier of relativeImports(content, "dynamic-import")) {
        const target = resolve(dirname(path), specifier);
        if (!known(target)) entrypoints.push(target);
      }
    }
    frontier = [...(await collectStaticGraph(entrypoints))].filter(([path]) => !known(path));
    for (const [path, content] of frontier) lazy.set(path, content);
  }
  return lazy;
}

interface Page {
  /** Every module the page references. */
  readonly modules: readonly string[];
  /** The page's entry scripts, whose lazy imports are the site's routes. */
  readonly routers: ReadonlySet<string>;
}

async function readPage(relativePath: string): Promise<Page> {
  const html = await readFile(join(distRoot, relativePath), "utf8");
  const modules: string[] = [];
  for (const match of html.matchAll(
    /(?:src|component-url|renderer-url|href)=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) modules.push(join(distRoot, match[1]));
  }
  const routers = new Set<string>();
  for (const match of html.matchAll(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) routers.add(join(distRoot, match[1]));
  }
  if (routers.size === 0) throw new Error(`${relativePath} has no entry script`);
  return { modules, routers };
}

function includesBackend(graph: ReadonlyMap<string, string>): boolean {
  return [...graph.values()].some((content) => content.includes(xlsxMarker));
}

async function main(): Promise<void> {
  const defaultEntrypoints = (
    await Promise.all(defaultPages.map(async (page) => (await readPage(page)).modules))
  ).flat();
  const defaultGraph = await collectStaticGraph(defaultEntrypoints);
  for (const [path, content] of defaultGraph) {
    if (content.includes(xlsxMarker)) {
      throw new Error(`Default example graph eagerly includes the XLSX backend through ${path}`);
    }
  }

  const reactPage = await readPage("react/index.html");
  const reactGraph = await collectStaticGraph(reactPage.modules);
  if (!includesBackend(await collectLazyGraph(reactGraph, reactPage.routers))) {
    throw new Error("React workbook XLSX action cannot reach the backend through a lazy import");
  }

  const xlsxPage = await readPage("test/xlsx/index.html");
  const xlsxGraph = await collectStaticGraph(xlsxPage.modules);
  const xlsxLazyGraph = await collectLazyGraph(xlsxGraph, xlsxPage.routers);
  if (!includesBackend(xlsxGraph) && !includesBackend(xlsxLazyGraph)) {
    throw new Error("Dedicated XLSX route cannot load the concrete workbook backend");
  }

  console.log(
    `Example XLSX isolation passed (${defaultGraph.size} default chunks, ${xlsxGraph.size + xlsxLazyGraph.size} XLSX chunks)`,
  );
}

if (import.meta.main) await main();
