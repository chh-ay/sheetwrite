import { copyFile, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { MOVED_PAGES, MOVED_SHOWCASES, REMOVED_API_PAGES } from "../docs/src/lib/moved-pages.js";

const repository_root = resolve(import.meta.dir, "..");
const required_files = [
  "index.html",
  "404.html",
  "docs/index.html",
  "sitemap.xml",
  "pagefind/pagefind-entry.json",
];

/**
 * Content-hashed outputs never change under one URL, so browsers may keep
 * them for a year without revalidating. Everything else (HTML, sitemap,
 * Pagefind's stable entry files) keeps Vercel's revalidating default so a new
 * deployment is visible immediately.
 */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
/**
 * Files whose type the static host cannot tell from the extension. The
 * changelog feed is RSS, which feed readers expect as `application/rss+xml`,
 * not the `application/xml` an `.xml` file gets.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  "^/changelog/rss\\.xml$": "application/rss+xml; charset=utf-8",
};
const IMMUTABLE_PATHS = [
  // Vite emits every bundled script, stylesheet, font, and WASM file here with a content hash.
  "^/assets/.+$",
  // Pagefind names its shards and metadata after their content.
  "^/pagefind/(?:fragment|index)/.+$",
  "^/pagefind/pagefind\\.[^/]+\\.pf_meta$",
];
/**
 * Longest `src` pattern of one trailing-slash redirect route. Vercel allows
 * 2,048 routes per deployment and the site has about 1,000 pages, so one
 * route per page and form would not fit; each route names many pages.
 */
const REDIRECT_PATTERN_LENGTH = 4000;

const escape_reg_exp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function require_directory(path: string): Promise<void> {
  if (!(await lstat(path)).isDirectory()) {
    throw new Error(`Expected a real directory, not a symlink or special file: ${path}`);
  }
}

async function collect_files(source_root: string, directory = ""): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  for (const entry of await readdir(join(source_root, directory))) {
    const relative_path = directory ? `${directory}/${entry}` : entry;
    const source_path = join(source_root, relative_path);
    const stats = await lstat(source_path);
    if (stats.isDirectory()) {
      for (const [path, size] of await collect_files(source_root, relative_path)) {
        files.set(path, size);
      }
    } else if (stats.isFile()) {
      files.set(relative_path, stats.size);
    } else {
      throw new Error(`Cannot package a symlink or special file: ${source_path}`);
    }
  }
  return files;
}

/**
 * Permanent redirects from each page's address without its trailing slash to
 * the canonical address with it, so a page has one URL.
 */
function trailing_slash_redirects(pages: readonly string[]): object[] {
  const routes: object[] = [];
  let alternatives: string[] = [];
  let length = 0;
  const flush = (): void => {
    if (alternatives.length === 0) return;
    routes.push({
      src: `^(/(?:${alternatives.join("|")}))$`,
      status: 308,
      headers: { Location: "$1/" },
    });
    alternatives = [];
    length = 0;
  };
  for (const page of pages) {
    const pattern = escape_reg_exp(page);
    if (length + pattern.length + 1 > REDIRECT_PATTERN_LENGTH) flush();
    alternatives.push(pattern);
    length += pattern.length + 1;
  }
  flush();
  return routes;
}

export async function prepareDocsDeployment(root = repository_root): Promise<void> {
  const source_root = join(root, "docs/dist/client");
  for (const directory of ["docs", "docs/dist", "docs/dist/client"]) {
    await require_directory(join(root, directory));
  }
  const files = await collect_files(source_root);
  for (const required of required_files) {
    if (!files.has(required) || files.get(required) === 0) {
      throw new Error(`Docs build is incomplete: missing or empty ${join(source_root, required)}`);
    }
  }
  const pages = [...files.keys()]
    .filter((path) => path.endsWith("/index.html"))
    .map((path) => path.slice(0, -"/index.html".length));

  const vercel_root = join(root, ".vercel");
  await mkdir(vercel_root, { recursive: true });
  await require_directory(vercel_root);
  const output_root = join(vercel_root, "output");
  // Validate the complete source before discarding the previous deployment.
  await rm(output_root, { recursive: true, force: true });
  const static_root = join(output_root, "static");
  await mkdir(static_root, { recursive: true });
  for (const path of files.keys()) {
    const destination = join(static_root, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(source_root, path), destination);
  }
  await writeFile(
    join(output_root, "config.json"),
    `${JSON.stringify(
      {
        version: 3,
        routes: [
          ...IMMUTABLE_PATHS.map((src) => ({
            src,
            headers: { "cache-control": IMMUTABLE_CACHE },
            continue: true,
          })),
          ...Object.entries(CONTENT_TYPES).map(([src, type]) => ({
            src,
            headers: { "content-type": type },
            continue: true,
          })),
          // Moved docs pages, merged showcases and removed API pages answer
          // with a permanent redirect; a new docs page forwards an old
          // #fragment itself, because a server never sees it.
          ...[
            ...Object.entries(MOVED_PAGES).map(([from, page]) => [from, page.to] as const),
            ...Object.entries(MOVED_SHOWCASES),
            ...Object.entries(REMOVED_API_PAGES),
          ].map(([from, to]) => ({
            src: `^${escape_reg_exp(from).replace(/\/$/, "")}/?$`,
            status: 308,
            headers: { Location: to },
          })),
          ...trailing_slash_redirects(pages),
          { src: "^/$", dest: "/index.html" },
          ...pages.map((page) => ({
            src: `^/${escape_reg_exp(page)}/$`,
            dest: `/${page}/index.html`,
          })),
          { handle: "filesystem" },
          { src: "^/.*$", dest: "/404.html", status: 404 },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.main) {
  await prepareDocsDeployment();
}
