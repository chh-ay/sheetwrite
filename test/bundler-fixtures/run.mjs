import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { installCanonicalTarballs } from "../../scripts/release-lock-integrity.mjs";

const fixtures_root = fileURLToPath(new URL(".", import.meta.url));
const repository_root = resolve(fixtures_root, "../..");
const tarball_root = join(fixtures_root, ".packed");
const package_directories = [
  "packages/wasm",
  "packages/core",
  "packages/xlsx",
  "packages/charts",
  "packages/queries",
  "packages/react",
  "packages/vue",
  "packages/svelte",
];
// The fixtures use every release package except @sheetwrite/formulas and @sheetwrite/formula-assist.
const RELEASE_PACKAGE_COUNT = package_directories.length + 2;
const source_manifests = await Promise.all(
  package_directories.map(async (directory) =>
    JSON.parse(await readFile(join(repository_root, directory, "package.json"), "utf8")),
  ),
);

function option_value(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const artifact_directory = option_value("--artifacts");
const required_artifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifact_directory === undefined) {
  throw new Error("Artifact-only bundler verification requires --artifacts");
}
if (
  required_artifacts !== undefined &&
  (artifact_directory === undefined ||
    resolve(repository_root, artifact_directory) !== resolve(required_artifacts))
) {
  throw new Error("Bundler artifact input differs from the canonical artifact set");
}

function run(command, args, cwd) {
  return new Promise((resolve_run, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve_run();
      else
        reject(
          new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`),
        );
    });
  });
}

async function with_static_server(root, run_with_origin) {
  const server = createServer(async (request, response) => {
    try {
      const request_url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(request_url.pathname);
      const relative_path = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = resolve(root, `.${relative_path}`);
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      const content_type =
        extname(file) === ".html"
          ? "text/html; charset=utf-8"
          : extname(file) === ".js"
            ? "text/javascript; charset=utf-8"
            : extname(file) === ".css"
              ? "text/css; charset=utf-8"
              : extname(file) === ".wasm"
                ? "application/wasm"
                : extname(file) === ".svg"
                  ? "image/svg+xml"
                  : "application/octet-stream";
      response.writeHead(200, { "content-type": content_type }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  const listening = Promise.withResolvers();
  server.once("error", listening.reject);
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Fixture static server did not publish a TCP port");
  }
  try {
    await run_with_origin(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = Promise.withResolvers();
    server.close(closed.resolve);
    await closed.promise;
  }
}

async function assert_lifecycle_pages(browser, root, pages) {
  await with_static_server(root, async (origin) => {
    for (const [path, expected] of pages) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(
          () => document.documentElement.dataset.sheetwriteLifecycle === "passed",
          undefined,
          { timeout: 20_000 },
        );
      } catch (error) {
        throw new Error(
          `${path} did not complete mounted lifecycle\n${errors.join("\n")}\nbody: ${await page.locator("body").innerText()}`,
          { cause: error },
        );
      }
      const body = await page.locator("body").innerText();
      if (!body.includes(expected)) {
        throw new Error(`${path} did not publish expected lifecycle marker ${expected}`);
      }
      if (errors.length > 0) {
        throw new Error(`${path} emitted browser errors:\n${errors.join("\n")}`);
      }
      await page.close();
    }
  });
}

async function assert_query_page(browser, root) {
  await with_static_server(root, async (origin) => {
    const page = await browser.newPage();
    const errors = [];
    const wasm_requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(".wasm")) wasm_requests.push(request.url());
    });

    try {
      await page.goto(`${origin}/queries.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.querySelector("#load-queries")?.getAttribute("data-ready") === "false",
      );
      if (wasm_requests.length !== 0) throw new Error("Unused query page fetched WASM");

      const button = page.locator("#load-queries");
      await button.click();
      await page.waitForFunction(
        () => document.querySelector("#load-queries")?.getAttribute("data-ready") === "true",
        undefined,
        { timeout: 20_000 },
      );
      if (
        (await button.getAttribute("data-result")) !== "3" ||
        (await button.getAttribute("data-rows")) !== "1"
      ) {
        throw new Error("The bundled query did not return one row with total 3");
      }

      if (wasm_requests.length !== 1)
        throw new Error("Query initialization did not fetch WASM once");
      if (errors.length > 0) throw new Error(`Query browser errors:\n${errors.join("\n")}`);
    } catch (error) {
      throw new Error(`Query browser contract failed:\n${errors.join("\n")}`, { cause: error });
    } finally {
      await page.close();
    }
  });
}

await rm(tarball_root, { recursive: true, force: true });
await rm(join(repository_root, "test-results/bundlers"), {
  recursive: true,
  force: true,
});
await mkdir(tarball_root, { recursive: true });
let artifact_manifest_digest;
const canonical_tarballs = new Map();
if (artifact_directory === undefined) {
  await run(
    "bun",
    ["scripts/release-artifacts.ts", "pack", "--output", tarball_root],
    repository_root,
  );
  for (const manifest of source_manifests) {
    const filename = `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
    canonical_tarballs.set(manifest.name, join(tarball_root, filename));
  }
} else {
  const artifact_root = resolve(repository_root, artifact_directory);
  const release_manifest_bytes = await readFile(join(artifact_root, "release-artifacts.json"));
  const release_manifest = JSON.parse(release_manifest_bytes.toString("utf8"));
  artifact_manifest_digest = `sha512-${createHash("sha512").update(release_manifest_bytes).digest("base64")}`;
  if (
    !Array.isArray(release_manifest.packages) ||
    release_manifest.packages.length !== RELEASE_PACKAGE_COUNT
  ) {
    throw new Error(
      `Canonical release manifest must contain exactly ${RELEASE_PACKAGE_COUNT} packages`,
    );
  }
  for (const source_manifest of source_manifests) {
    const artifact = release_manifest.packages.find((entry) => entry.name === source_manifest.name);
    if (artifact === undefined || artifact.version !== source_manifest.version) {
      throw new Error(`Missing canonical artifact for ${source_manifest.name}`);
    }
    await cp(join(artifact_root, artifact.path), join(tarball_root, artifact.path));
    canonical_tarballs.set(source_manifest.name, join(tarball_root, artifact.path));
  }
}

for (const fixture of ["vite", "webpack", "next"]) {
  const cwd = join(fixtures_root, fixture);
  const lock_path = join(cwd, "package-lock.json");
  const original_lock = await readFile(lock_path, "utf8");
  await rm(join(cwd, "node_modules"), { recursive: true, force: true });
  console.log(`\n=== ${fixture} bundler fixture ===`);
  try {
    // Copies each tarball to its version-free name in `.packed` and fills the lock.
    await installCanonicalTarballs(lock_path, canonical_tarballs);
    await run("npm", ["run", "build"], cwd);
  } finally {
    await writeFile(lock_path, original_lock);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await assert_lifecycle_pages(browser, join(fixtures_root, "vite/dist"), [
    ["/react.html", "react ready/edit/reset/unmount passed"],
    ["/vue.html", "vue ready/edit/reset/unmount passed"],
    ["/svelte.html", "svelte ready/edit/reset/unmount passed"],
  ]);
  await assert_query_page(browser, join(fixtures_root, "vite/dist"));
  await assert_lifecycle_pages(browser, join(fixtures_root, "next/out"), [
    ["/", "next ready/edit/reset/unmount passed"],
  ]);
} finally {
  await browser.close();
}

if (artifact_manifest_digest !== undefined) {
  console.log(`\nArtifact manifest SHA-512: ${artifact_manifest_digest}`);
}
console.log("\nAll bundler fixtures passed");
