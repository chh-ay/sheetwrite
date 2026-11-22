import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { MOVED_PAGES, MOVED_SHOWCASES, REMOVED_API_PAGES } from "../docs/src/lib/moved-pages.js";
import { prepareDocsDeployment } from "./prepare-docs-deployment.js";

const fixture_roots: string[] = [];
const built_files = {
  "index.html": "<h1>Home</h1>",
  "404.html": "<h1>Page not found</h1>",
  "docs/index.html": "<h1>Docs</h1>",
  "docs/start/installation/index.html": "<h1>Install</h1>",
  "sitemap.xml": "<urlset />",
  "pagefind/pagefind-entry.json": '{"version":"1.4.0"}',
  "pagefind/fragment/en_020da39.pf_fragment": "fragment",
  "pagefind/pagefind.en_6e131784e9.pf_meta": "meta",
  "assets/client.wasm": Buffer.from([0, 97, 115, 109, 255]),
};

async function put(root: string, path: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-docs-deployment-"));
  fixture_roots.push(root);
  for (const [path, contents] of Object.entries(built_files)) {
    await put(root, `docs/dist/client/${path}`, contents);
  }
  await put(root, ".vercel/output/static/old.html", "previous deployment");
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixture_roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

type OutputRoute =
  | { handle: "filesystem" }
  | { src: string; dest: string; status?: number }
  | { src: string; headers: Record<string, string>; continue: true }
  | { src: string; status: 308; headers: { Location: string } };

interface PackagedResponse {
  body: Buffer;
  headers: Record<string, string>;
  status: number;
}

async function request_packaged_file(
  root: string,
  pathname: string,
): Promise<PackagedResponse | null> {
  const output_root = join(root, ".vercel/output");
  const config: { routes: OutputRoute[] } = JSON.parse(
    await readFile(join(output_root, "config.json"), "utf8"),
  );
  const read_static = async (path: string): Promise<Buffer | null> => {
    const file = Bun.file(join(output_root, "static", path));
    return (await file.exists()) ? Buffer.from(await file.arrayBuffer()) : null;
  };
  const headers: Record<string, string> = {};
  // Exercise route matching against the emitted files, not just the JSON shape.
  for (const route of config.routes) {
    if ("handle" in route) {
      const contents = await read_static(pathname);
      if (contents !== null) return { body: contents, headers, status: 200 };
    } else if ("headers" in route && !("continue" in route)) {
      const match = new RegExp(route.src).exec(pathname);
      if (match !== null) {
        const location = route.headers.Location.replace(
          /\$(\d)/g,
          (_, group: string) => match[Number(group)] ?? "",
        );
        return {
          body: Buffer.alloc(0),
          headers: { ...headers, Location: location },
          status: route.status,
        };
      }
    } else if ("headers" in route) {
      if (new RegExp(route.src).test(pathname)) Object.assign(headers, route.headers);
    } else {
      const pattern = new RegExp(route.src);
      if (pattern.test(pathname)) {
        const contents = await read_static(pathname.replace(pattern, route.dest));
        return contents === null ? null : { body: contents, headers, status: route.status ?? 200 };
      }
    }
  }
  return null;
}

describe("prebuilt docs deployment", () => {
  it("replaces stale deployment files and functions without touching metadata or copying outside files", async () => {
    const root = await fixture();
    await put(root, ".vercel/output/functions/stale.func/index.js", "old function");
    await put(root, ".vercel/output/config.json", '{"version":3,"stale":true}');
    await put(root, ".vercel/project.json", '{"projectId":"keep-me"}');
    await put(root, ".vercel/.env.production.local", "keep this metadata");
    await put(root, "docs/dist/server/private.js", "server only");
    await put(root, "outside.txt", "outside source");

    await prepareDocsDeployment(root);

    const output_root = join(root, ".vercel/output");
    expect((await readdir(output_root)).sort()).toEqual(["config.json", "static"]);
    expect((await readdir(join(output_root, "static"), { recursive: true })).sort()).toEqual(
      [
        ...Object.keys(built_files),
        "assets",
        "docs",
        "docs/start",
        "docs/start/installation",
        "pagefind",
        "pagefind/fragment",
      ].sort(),
    );
    for (const [path, contents] of Object.entries(built_files)) {
      expect(await readFile(join(output_root, "static", path))).toEqual(Buffer.from(contents));
    }
    expect(await readFile(join(root, ".vercel/project.json"), "utf8")).toBe(
      '{"projectId":"keep-me"}',
    );
    expect(await readFile(join(root, ".vercel/.env.production.local"), "utf8")).toBe(
      "keep this metadata",
    );
  });

  it.each(["pagefind/pagefind-entry.json", "404.html"])(
    "preserves the previous deployment when %s is missing",
    async (path) => {
      const root = await fixture();
      await rm(join(root, "docs/dist/client", path));
      await expect(prepareDocsDeployment(root)).rejects.toThrow("Docs build is incomplete");
      expect(await readFile(join(root, ".vercel/output/static/old.html"), "utf8")).toBe(
        "previous deployment",
      );
    },
  );

  it.each(["file", "directory"])(
    "rejects an outside %s symlink without replacing output",
    async (kind) => {
      const root = await fixture();
      await put(root, "outside/private.txt", "must not deploy");
      await symlink(
        join(root, kind === "file" ? "outside/private.txt" : "outside"),
        join(root, "docs/dist/client/linked"),
      );
      await expect(prepareDocsDeployment(root)).rejects.toThrow("symlink or special file");
      expect(await readFile(join(root, ".vercel/output/static/old.html"), "utf8")).toBe(
        "previous deployment",
      );
      expect(await readFile(join(root, "outside/private.txt"), "utf8")).toBe("must not deploy");
    },
  );

  it("serves pages, assets and the RSS feed with cache headers, redirects and a 404 fallback", async () => {
    const root = await fixture();
    await put(root, "docs/dist/client/changelog/rss.xml", '<rss version="2.0" />');
    await prepareDocsDeployment(root);
    for (const [url, contents] of [
      ["/", built_files["index.html"]],
      ["/docs/", built_files["docs/index.html"]],
      ["/docs/start/installation/", built_files["docs/start/installation/index.html"]],
      ["/docs/index.html", built_files["docs/index.html"]],
      ["/assets/client.wasm", built_files["assets/client.wasm"]],
      ["/sitemap.xml", built_files["sitemap.xml"]],
      ["/pagefind/pagefind-entry.json", built_files["pagefind/pagefind-entry.json"]],
    ] as const) {
      const response = await request_packaged_file(root, url);
      expect(response?.body).toEqual(Buffer.from(contents));
      // Stable URLs must revalidate, or a deployment would serve stale pages and search entries.
      const hashed = url === "/assets/client.wasm";
      expect(response?.headers["cache-control"]).toBe(
        hashed ? "public, max-age=31536000, immutable" : undefined,
      );
      expect(response?.headers["content-type"]).toBeUndefined();
    }
    for (const url of [
      "/pagefind/fragment/en_020da39.pf_fragment",
      "/pagefind/pagefind.en_6e131784e9.pf_meta",
    ]) {
      expect((await request_packaged_file(root, url))?.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );
    }
    const feed = await request_packaged_file(root, "/changelog/rss.xml");
    expect(feed?.body).toEqual(Buffer.from('<rss version="2.0" />'));
    expect(feed?.headers["content-type"]).toBe("application/rss+xml; charset=utf-8");
    for (const url of ["/docs", "/docs/start/installation"]) {
      const response = await request_packaged_file(root, url);
      expect(response?.status).toBe(308);
      expect(response?.headers.Location).toBe(`${url}/`);
    }
    for (const url of ["/missing", "/docs/missing/", "/assets/missing.js"]) {
      const response = await request_packaged_file(root, url);
      expect(response?.body).toEqual(Buffer.from(built_files["404.html"]));
      expect(response?.status).toBe(404);
    }
    // Every old page, merged showcase and removed API page, with or without its trailing slash.
    for (const redirects of [
      Object.entries(MOVED_PAGES).map(([from, page]) => [from, page.to] as const),
      Object.entries(MOVED_SHOWCASES),
      Object.entries(REMOVED_API_PAGES),
    ]) {
      expect(redirects.length).toBeGreaterThan(0);
      for (const [from, to] of redirects) {
        for (const pathname of [from, from.slice(0, -1)]) {
          const response = await request_packaged_file(root, pathname);
          expect(response?.status).toBe(308);
          expect(response?.headers.Location).toBe(to);
        }
      }
    }
  });
});
