/**
 * QA helper: serves a built docs folder over HTTP, mapping `/path/` to
 * `/path/index.html`, for the link crawl and browser checks.
 *
 *   bun serve-static.ts <directory> <port>
 */
import { join, normalize } from "node:path";

const [directory = "", portText = ""] = process.argv.slice(2);
if (directory === "" || portText === "") throw new Error("Usage: bun serve-static.ts <directory> <port>");
const root = normalize(directory);

Bun.serve({
  port: Number(portText),
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const target = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!target.startsWith(root)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(target);
    if (await file.exists()) return new Response(file);
    const page = Bun.file(join(target, "index.html"));
    if (await page.exists()) return new Response(page);
    return new Response("Not found", { status: 404 });
  },
});
process.stdout.write(`serving ${root} on http://127.0.0.1:${portText}\n`);
