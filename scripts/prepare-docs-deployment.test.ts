import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { prepareDocsDeployment } from "./prepare-docs-deployment.js";

const fixtureRoots: string[] = [];
const builtFiles = {
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
  fixtureRoots.push(root);
  for (const [path, contents] of Object.entries(builtFiles)) {
    await put(root, `docs/dist/client/${path}`, contents);
  }
  await put(root, ".vercel/output/static/old.html", "previous deployment");
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
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

async function requestPackagedFile(
  root: string,
  pathname: string,
): Promise<PackagedResponse | null> {
  const outputRoot = join(root, ".vercel/output");
  const config: { routes: OutputRoute[] } = JSON.parse(
    await readFile(join(outputRoot, "config.json"), "utf8"),
  );
  const readStatic = async (path: string): Promise<Buffer | null> => {
    const file = Bun.file(join(outputRoot, "static", path));
    return (await file.exists()) ? Buffer.from(await file.arrayBuffer()) : null;
  };
  const headers: Record<string, string> = {};
  // Exercise route matching against the emitted files, not just the JSON shape.
  for (const route of config.routes) {
    if ("handle" in route) {
      const contents = await readStatic(pathname);
      if (contents !== null) return { body: contents, headers, status: 200 };
    } else if ("headers" in route && !("continue" in route)) {
      if (new RegExp(route.src).test(pathname)) {
        return {
          body: Buffer.alloc(0),
          headers: { ...headers, ...route.headers },
          status: route.status,
        };
      }
    } else if ("headers" in route) {
      if (new RegExp(route.src).test(pathname)) Object.assign(headers, route.headers);
    } else {
      const pattern = new RegExp(route.src);
      if (pattern.test(pathname)) {
        const contents = await readStatic(pathname.replace(pattern, route.dest));
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

    const outputRoot = join(root, ".vercel/output");
    expect((await readdir(outputRoot)).sort()).toEqual(["config.json", "static"]);
    expect((await readdir(join(outputRoot, "static"), { recursive: true })).sort()).toEqual(
      [
        ...Object.keys(builtFiles),
        "assets",
        "docs",
        "docs/start",
        "docs/start/installation",
        "pagefind",
        "pagefind/fragment",
      ].sort(),
    );
    for (const [path, contents] of Object.entries(builtFiles)) {
      expect(await readFile(join(outputRoot, "static", path))).toEqual(Buffer.from(contents));
    }
    expect(await readFile(join(root, ".vercel/project.json"), "utf8")).toBe(
      '{"projectId":"keep-me"}',
    );
    expect(await readFile(join(root, ".vercel/.env.production.local"), "utf8")).toBe(
      "keep this metadata",
    );
  });

  it.each(["pagefind/pagefind-entry.json"])(
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
});

describe("routing", () => {
  it("serves the changelog feed as RSS", async () => {
    const root = await fixture();
    await put(root, "docs/dist/client/changelog/rss.xml", '<rss version="2.0" />');
    await prepareDocsDeployment(root);
    const response = await requestPackagedFile(root, "/changelog/rss.xml");
    expect(response?.body).toEqual(Buffer.from('<rss version="2.0" />'));
    expect(response?.headers["content-type"]).toBe("application/rss+xml; charset=utf-8");
    expect(
      (await requestPackagedFile(root, "/sitemap.xml"))?.headers["content-type"],
    ).toBeUndefined();
  });
});
