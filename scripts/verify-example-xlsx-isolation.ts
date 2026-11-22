import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const dist_root = resolve(import.meta.dir, "../docs/dist/client");
const default_pages = [
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
const xlsx_marker = "sheetwrite-workbook-metadata-v1";
const module_scanner = new Bun.Transpiler({ loader: "js" });

/**
 * The relative specifiers a built module imports, statically or lazily. The
 * module is parsed, so import-like text in comments and strings (Svelte's doc
 * comment for `mount()` shows `import App from './App.svelte'`) is not followed.
 */
export function relativeImports(
  content: string,
  kind: "import-statement" | "dynamic-import",
): string[] {
  return module_scanner
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

async function read_page(relative_path: string): Promise<Page> {
  const html = await readFile(join(dist_root, relative_path), "utf8");
  const modules: string[] = [];
  for (const match of html.matchAll(
    /(?:src|component-url|renderer-url|href)=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) modules.push(join(dist_root, match[1]));
  }
  const routers = new Set<string>();
  for (const match of html.matchAll(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*?(assets\/[^"']+\.js)["']/g,
  )) {
    if (match[1] !== undefined) routers.add(join(dist_root, match[1]));
  }
  if (routers.size === 0) throw new Error(`${relative_path} has no entry script`);
  return { modules, routers };
}

function includes_backend(graph: ReadonlyMap<string, string>): boolean {
  return [...graph.values()].some((content) => content.includes(xlsx_marker));
}

async function main(): Promise<void> {
  const default_entrypoints = (
    await Promise.all(default_pages.map(async (page) => (await read_page(page)).modules))
  ).flat();
  const default_graph = await collectStaticGraph(default_entrypoints);
  for (const [path, content] of default_graph) {
    if (content.includes(xlsx_marker)) {
      throw new Error(`Default example graph eagerly includes the XLSX backend through ${path}`);
    }
  }

  const react_page = await read_page("react/index.html");
  const react_graph = await collectStaticGraph(react_page.modules);
  if (!includes_backend(await collectLazyGraph(react_graph, react_page.routers))) {
    throw new Error("React workbook XLSX action cannot reach the backend through a lazy import");
  }

  const xlsx_page = await read_page("test/xlsx/index.html");
  const xlsx_graph = await collectStaticGraph(xlsx_page.modules);
  const xlsx_lazy_graph = await collectLazyGraph(xlsx_graph, xlsx_page.routers);
  if (!includes_backend(xlsx_graph) && !includes_backend(xlsx_lazy_graph)) {
    throw new Error("Dedicated XLSX route cannot load the concrete workbook backend");
  }

  console.log(
    `Example XLSX isolation passed (${default_graph.size} default chunks, ${xlsx_graph.size + xlsx_lazy_graph.size} XLSX chunks)`,
  );
}

if (import.meta.main) await main();
