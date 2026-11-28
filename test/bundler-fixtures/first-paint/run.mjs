import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";

import { deferredModule, installFixtureOnlyCandidate } from "./candidate-package.mjs";

const fixture_root = resolve(import.meta.dirname, "..");
const repository_root = resolve(fixture_root, "../..");
const output_root = resolve(repository_root, "test-results/bundlers/first-paint");
const vite_dependency_root = resolve(fixture_root, "vite");
const next_dependency_root = resolve(fixture_root, "next");
const vite_fixture_root = resolve(import.meta.dirname, "vite");
const next_fixture_root = resolve(import.meta.dirname, "next");
const rounds = 10;

function run(command, args, cwd, environment = {}) {
  return new Promise((resolve_run, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve_run();
      else reject(new Error(`${command} ${args.join(" ")} failed (${code ?? signal})`));
    });
  });
}

async function replace_node_modules_link(target, source) {
  await rm(target, { recursive: true, force: true });
  await symlink(source, target, "dir");
}

async function build_vite(variant, core_package_root) {
  const output = resolve(output_root, "vite", variant);
  await rm(output, { recursive: true, force: true });
  await run(
    resolve(vite_dependency_root, "node_modules/.bin/vite"),
    ["build", "--config", resolve(vite_fixture_root, "vite.config.ts")],
    vite_fixture_root,
    {
      SHEETWRITE_FIRST_PAINT_CORE: core_package_root,
      SHEETWRITE_FIRST_PAINT_OUTPUT: output,
    },
  );
}

async function build_next(variant, core_package_root) {
  await rm(resolve(next_fixture_root, ".next"), { recursive: true, force: true });
  await rm(resolve(next_fixture_root, "out"), { recursive: true, force: true });
  await run(resolve(next_dependency_root, "node_modules/.bin/next"), ["build"], next_fixture_root, {
    SHEETWRITE_FIRST_PAINT_CORE: core_package_root,
  });
  const output = resolve(output_root, "next", variant);
  await rm(output, { recursive: true, force: true });
  await cp(resolve(next_fixture_root, "out"), output, { recursive: true });
}

/**
 * Link each runtime dependency of the copied core package from the fixture's
 * `node_modules`. The copy lives outside that tree, so its imports (the WASM
 * package, `fflate`, and any later dependency) resolve only through these links.
 */
async function link_runtime_dependencies(package_root, dependency_root) {
  const manifest = JSON.parse(await readFile(resolve(package_root, "package.json"), "utf8"));
  const dependencies = Object.keys(manifest.dependencies ?? {});

  for (const dependency of dependencies) {
    const link = resolve(package_root, "node_modules", dependency);
    await mkdir(resolve(link, ".."), { recursive: true });
    await symlink(resolve(dependency_root, "node_modules", dependency), link, "dir");
  }
}

async function build_pair(name, dependency_root, build) {
  const baseline_core = resolve(dependency_root, "node_modules/@sheetwrite/core");
  const candidate_core = resolve(output_root, ".candidate-core", name.toLowerCase());
  await mkdir(resolve(output_root, ".candidate-core"), { recursive: true });
  await rm(candidate_core, { recursive: true, force: true });
  await cp(baseline_core, candidate_core, { recursive: true });
  await link_runtime_dependencies(candidate_core, dependency_root);
  await installFixtureOnlyCandidate(candidate_core);
  await build("baseline", baseline_core);
  await build("candidate", candidate_core);
  console.log(`${name} first-paint baseline/candidate built`);
}

async function with_server(root, callback) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = resolve(root, `.${requested}`);
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
  if (address === null || typeof address === "string") throw new Error("Static server has no port");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = Promise.withResolvers();
    server.close(closed.resolve);
    await closed.promise;
  }
}

function summarize_bytes(chunks) {
  const totals = { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 };
  for (const chunk of chunks) {
    totals.rawBytes += chunk.byteLength;
    totals.gzipBytes += gzipSync(chunk, { level: 9, mtime: 0 }).byteLength;
    totals.brotliBytes += brotliCompressSync(chunk, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength;
  }
  return totals;
}

async function capture_page(browser, root, path = "/") {
  return with_server(root, async (origin) => {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: 500, width: 800 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined, undefined, {
      timeout: 20_000,
    });
    const state = await page.evaluate(() => ({
      readyMs: window.__sheetwriteFirstPaint.readyMs,
      surface: window.__sheetwriteFirstPaint.surface,
      scripts: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith(".js")),
    }));
    if (JSON.stringify(state.surface) !== JSON.stringify(["createGrid", "initSheetwrite"])) {
      throw new Error("Fixture did not preserve the createGrid/initSheetwrite surface");
    }
    const host = page.locator("[data-sheetwrite-first-paint-host]");
    const screenshot = await host.screenshot({ animations: "disabled" });
    const checksum = createHash("sha256").update(screenshot).digest("hex");
    if (errors.length > 0) throw new Error(`First-paint fixture failed:\n${errors.join("\n")}`);
    await page.close();
    const scripts = await Promise.all(
      state.scripts.map((url) => readFile(resolve(root, `.${new URL(url).pathname}`))),
    );
    return { checksum, initialJavaScript: summarize_bytes(scripts), readyMs: state.readyMs };
  });
}

async function interaction_evidence(browser, root, path = "/") {
  return with_server(root, async (origin) => {
    const page = await browser.newPage();
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined);
    const before = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name),
    );
    const success = await page.evaluate(async () => {
      const events = [];
      globalThis.addEventListener("sheetwrite:first-interaction-module", (event) =>
        events.push(event.detail),
      );
      let rejected = false;
      let outcome;
      try {
        outcome = await window.__sheetwriteFirstPaint.grid.actions.copy();
      } catch {
        rejected = true;
      }
      return { events, outcome, rejected };
    });
    const after = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name),
    );
    const deferred_url = after.find(
      (url) => !before.includes(url) && new URL(url).pathname.endsWith(".js"),
    );
    if (
      deferred_url === undefined ||
      success.outcome !== "empty" ||
      success.rejected ||
      !success.events.some((event) => event.module === deferredModule && event.state === "loaded")
    ) {
      throw new Error("Candidate did not load the named clipboard module on first interaction");
    }
    await page.close();

    const error_page = await browser.newPage();
    await error_page.route(deferred_url, (route) => route.abort("failed"));
    await error_page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await error_page.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined);
    const failure = await error_page.evaluate(async () => {
      const events = [];
      globalThis.addEventListener("sheetwrite:first-interaction-module", (event) =>
        events.push(event.detail),
      );
      let rejected = false;
      let outcome;
      try {
        outcome = await window.__sheetwriteFirstPaint.grid.actions.copy();
      } catch {
        rejected = true;
      }
      return { events, outcome, rejected };
    });
    await error_page.close();
    if (
      failure.outcome !== "unsupported" ||
      failure.rejected ||
      !failure.events.some((event) => event.module === deferredModule && event.state === "error")
    ) {
      throw new Error("Candidate did not fail closed when its interaction chunk was unavailable");
    }
    return {
      deferredChunk: new URL(deferred_url).pathname,
      interaction: {
        module: deferredModule,
        loaded: true,
        successOutcome: success.outcome,
        errorOutcome: failure.outcome,
        rejected: failure.rejected,
      },
    };
  });
}

function timing(samples_ms) {
  const sorted = [...samples_ms].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    samplesMs: samples_ms,
    medianMs: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

async function capture_fixture(browser, bundler, version, provenance, path) {
  const roots = {
    baseline: resolve(output_root, bundler, "baseline"),
    candidate: resolve(output_root, bundler, "candidate"),
  };
  const observations = { baseline: [], candidate: [] };
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const variant of order) {
      observations[variant].push(await capture_page(browser, roots[variant], path));
    }
  }
  const baseline = observations.baseline[0];
  const candidate = observations.candidate[0];
  if (observations.baseline.some((entry) => entry.checksum !== baseline.checksum)) {
    throw new Error(`${bundler} baseline first-paint checksum was unstable`);
  }
  if (observations.candidate.some((entry) => entry.checksum !== candidate.checksum)) {
    throw new Error(`${bundler} candidate first-paint checksum was unstable`);
  }
  const interaction = await interaction_evidence(browser, roots.candidate, path);
  const delta = {
    rawBytes: baseline.initialJavaScript.rawBytes - candidate.initialJavaScript.rawBytes,
    gzipBytes: baseline.initialJavaScript.gzipBytes - candidate.initialJavaScript.gzipBytes,
    brotliBytes: baseline.initialJavaScript.brotliBytes - candidate.initialJavaScript.brotliBytes,
  };
  return {
    bundler,
    version,
    provenance,
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    baseline: {
      initialJavaScript: baseline.initialJavaScript,
      timing: timing(observations.baseline.map((entry) => entry.readyMs)),
      checksum: baseline.checksum,
    },
    candidate: {
      initialJavaScript: candidate.initialJavaScript,
      timing: timing(observations.candidate.map((entry) => entry.readyMs)),
      checksum: candidate.checksum,
      ...interaction,
    },
    delta: {
      ...delta,
      brotliPercent: (delta.brotliBytes / baseline.initialJavaScript.brotliBytes) * 100,
    },
  };
}

for (const [fixture, dependency] of [
  [vite_fixture_root, vite_dependency_root],
  [next_fixture_root, next_dependency_root],
]) {
  await replace_node_modules_link(
    resolve(fixture, "node_modules"),
    resolve(dependency, "node_modules"),
  );
}
await rm(output_root, { recursive: true, force: true });
await mkdir(output_root, { recursive: true });
await build_pair("Vite", vite_dependency_root, build_vite);
await build_pair("Next.js", next_dependency_root, build_next);

const vite_package = JSON.parse(
  await readFile(resolve(vite_dependency_root, "package.json"), "utf8"),
);
const next_package = JSON.parse(
  await readFile(resolve(next_dependency_root, "package.json"), "utf8"),
);
const browser = await chromium.launch({ headless: true });
let fixtures;
try {
  fixtures = [
    await capture_fixture(
      browser,
      "next",
      next_package.dependencies.next,
      {
        buildMode: "production",
        minified: true,
        minifier: { name: "next-swc", version: next_package.dependencies.next },
        externals: [],
        target: "browser",
        sourceMaps: "hidden-external",
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      "/",
    ),
    await capture_fixture(
      browser,
      "vite",
      vite_package.dependencies.vite,
      {
        buildMode: "production",
        minified: true,
        minifier: { name: "esbuild", version: "0.25.12" },
        externals: [],
        target: "browser",
        sourceMaps: "hidden-external",
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      "/",
    ),
  ];
} finally {
  await browser.close();
}

const evidence = {
  schemaVersion: 2,
  kind: "first-paint-counterfactual",
  candidate: {
    fixtureOnly: true,
    shipping: false,
    deferredModules: [deferredModule],
  },
  thresholds: {
    brotliBytes: 7_680,
    percent: 10,
    timing: "median-and-p95-no-slower",
  },
  fixtures,
};
const evidence_path = resolve(repository_root, "test-results/bundlers/first-paint.json");
await writeFile(evidence_path, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`First-paint evidence: ${relative(repository_root, evidence_path)}`);
