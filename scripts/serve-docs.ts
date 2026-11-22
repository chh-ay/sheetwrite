import { resolve, sep } from "node:path";

import { MOVED_PAGES, MOVED_SHOWCASES, REMOVED_API_PAGES } from "../docs/src/lib/moved-pages.js";

const repository_root = resolve(import.meta.dir, "..");
const output_root = resolve(repository_root, process.env.DOCS_OUTPUT_DIR ?? "docs/dist/client");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const LOCAL_VERCEL_SCRIPTS = new Set([
  "/_vercel/insights/script.js",
  "/_vercel/speed-insights/script.js",
]);

function output_path(pathname: string): string | null {
  const relative = pathname.replace(/^\/+/, "");
  const candidate = resolve(output_root, relative.endsWith("/") ? relative : relative || ".");
  if (candidate !== output_root && !candidate.startsWith(`${output_root}${sep}`)) return null;
  return relative === "" || relative.endsWith("/") ? resolve(candidate, "index.html") : candidate;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (LOCAL_VERCEL_SCRIPTS.has(pathname)) {
      return new Response("", {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      });
    }
    const route = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const moved = MOVED_PAGES[route]?.to ?? MOVED_SHOWCASES[route] ?? REMOVED_API_PAGES[route];
    // Same permanent redirect as the deployment config.
    if (moved !== undefined) {
      return new Response(null, { status: 308, headers: { location: moved } });
    }
    // Same trailing-slash redirect as the deployment config.
    const page = pathname.endsWith("/") ? null : output_path(route);
    if (page !== null && (await Bun.file(page).exists())) {
      return new Response(null, {
        status: 308,
        headers: { location: `${url.pathname}/${url.search}` },
      });
    }
    const candidate = output_path(pathname);
    if (candidate !== null) {
      const file = Bun.file(candidate);
      if (await file.exists()) return new Response(file);
    }
    const not_found = Bun.file(resolve(output_root, "404.html"));
    return new Response((await not_found.exists()) ? await not_found.arrayBuffer() : "Not found", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

process.stdout.write(`Sheetwrite docs available at ${server.url}\n`);
