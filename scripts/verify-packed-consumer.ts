import { access, cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { optionValue } from "../bench/src/cli-options.js";
import { assertPublishedDeclarations } from "./package-dist.js";
import { packageTargets } from "./package-targets.js";
import {
  assertPublishedFilePolicy,
  packBuiltPackages,
  readReleaseManifestDigest,
  REQUIRED_PACKAGE_FILES,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";
import { captureProcess, readJson } from "./script-io.js";

interface PackageManifest {
  name: string;
  version: string;
  license?: unknown;
  files?: string[];
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: ReadonlyArray<{ readonly path: string }>;
}

interface PackageSpec {
  directory: string;
  /** Files these consumer tests need beyond the release's required files. */
  extraFiles?: string[];
  forbiddenFiles?: string[];
}

const repository_root = resolve(import.meta.dir, "..");
const fixture_root = join(repository_root, "test/consumer");
const mit_compatible_licenses: Record<string, true> = {
  "0BSD": true,
  "Apache-2.0": true,
  "BSD-2-Clause": true,
  "BSD-3-Clause": true,
  "BlueOak-1.0.0": true,
  "CC0-1.0": true,
  ISC: true,
  MIT: true,
  "MIT/X11": true,
  Unlicense: true,
  Zlib: true,
};
// The 0.1.1 tarball predates its package.json license field. Debian records the
// upstream MIT grant and source commit: https://sources.debian.org/copyright/license/node-buffers/0.1.1-2/
const audited_license_overrides: Record<string, string> = {
  "buffers@0.1.1": "MIT",
};
/** Optional packages that core and the framework adapters must install and run without. */
const OPTIONAL_PACKAGES = [
  "@sheetwrite/xlsx",
  "@sheetwrite/charts",
  "@sheetwrite/formula-assist",
  "@sheetwrite/queries",
] as const;
/** Packages that ship compiled output, never their source or tests. */
const DIST_ONLY_PACKAGES: Readonly<Record<string, true>> = {
  "@sheetwrite/xlsx": true,
  "@sheetwrite/charts": true,
  "@sheetwrite/formula-assist": true,
  "@sheetwrite/queries": true,
};
const package_specs: PackageSpec[] = [
  {
    directory: "packages/core",
    extraFiles: [
      "dist/adapter.d.ts",
      "dist/adapter.js",
      "dist/types/cell.d.ts",
      "dist/types/coordinates.d.ts",
      "dist/types/data.d.ts",
      "dist/types/document.d.ts",
      "dist/types/grid.d.ts",
      "dist/types/render.d.ts",
      "dist/types/store.d.ts",
      "dist/types/transaction.d.ts",
      "dist/shell.d.ts",
      "dist/shell.js",
    ],
    forbiddenFiles: [
      "dist/types/cell.js",
      "dist/types/cell.js.map",
      "dist/types/coordinates.js",
      "dist/types/coordinates.js.map",
      "dist/types/data.js",
      "dist/types/data.js.map",
      "dist/types/document.js",
      "dist/types/document.js.map",
      "dist/types/grid.js",
      "dist/types/grid.js.map",
      "dist/types/render.js",
      "dist/types/render.js.map",
      "dist/types/store.js",
      "dist/types/store.js.map",
      "dist/types/transaction.js",
      "dist/types/transaction.js.map",
    ],
  },
  { directory: "packages/wasm" },
  { directory: "packages/formulas" },
  {
    directory: "packages/queries",
    extraFiles: ["dist/types.d.ts"],
    forbiddenFiles: ["dist/types.js", "dist/types.js.map"],
  },
  {
    directory: "packages/xlsx",
    extraFiles: [
      "dist/addon.d.ts",
      "dist/addon.js",
      "dist/codec.js",
      "dist/table-export.d.ts",
      "dist/table-export.js",
      "dist/table-import.d.ts",
      "dist/table-import.js",
      "dist/workbook.d.ts",
      "dist/workbook.js",
    ],
  },
  {
    directory: "packages/charts",
    extraFiles: ["dist/addon.d.ts", "dist/addon.js", "dist/view-cache.d.ts", "dist/view-cache.js"],
  },
  {
    directory: "packages/formula-assist",
    extraFiles: ["dist/predictor.js"],
  },
  { directory: "packages/react" },
  { directory: "packages/vue" },
  { directory: "packages/svelte" },
];

async function run(command: string[], cwd: string): Promise<string> {
  return captureProcess(command, {
    cwd,
    env: { ...process.env, CI: "1" },
    failure: ({ stdout, stderr }) =>
      `${command.join(" ")} failed in ${cwd}\n${stdout.trim()}\n${stderr.trim()}`,
  });
}

async function assert_worker_bundle(
  package_root: string,
  manifest: PackageManifest,
): Promise<void> {
  if (manifest.name !== "@sheetwrite/core") return;

  const result = await Bun.build({
    entrypoints: [join(package_root, "dist/worker.js")],
    format: "esm",
    target: "browser",
  });
  if (!result.success || result.outputs.length === 0) {
    const diagnostics = result.logs.map((log) => log.message).join("\n");
    throw new Error(
      `${manifest.name} packed Worker entry has an unresolvable module graph\n${diagnostics}`,
    );
  }
}

async function assert_tarball(
  spec: PackageSpec,
  manifest: PackageManifest,
  result: PackResult,
  tarball_path: string,
  extract_root: string,
): Promise<void> {
  const packed_files = new Set(result.files.map((file) => file.path));
  assertPublishedFilePolicy(manifest.name, [...packed_files]);
  const required_files = [
    ...(REQUIRED_PACKAGE_FILES[manifest.name] ?? []),
    ...(spec.extraFiles ?? []),
  ];
  for (const required_file of required_files) {
    if (!packed_files.has(required_file)) {
      throw new Error(`${manifest.name} tarball is missing ${required_file}`);
    }
  }
  for (const forbidden_file of spec.forbiddenFiles ?? []) {
    if (packed_files.has(forbidden_file)) {
      throw new Error(
        `${manifest.name} tarball contains unreachable runtime type module ${forbidden_file}`,
      );
    }
  }

  if (Object.hasOwn(DIST_ONLY_PACKAGES, manifest.name)) {
    for (const path of packed_files) {
      if (path.startsWith("src/") || path.startsWith("test/") || path.startsWith("node_modules/")) {
        throw new Error(`${manifest.name} tarball contains forbidden path ${path}`);
      }
    }
  }
  if (
    manifest.name === "@sheetwrite/core" &&
    [...packed_files].some((path) => path.includes("xlsx-backend"))
  ) {
    throw new Error("@sheetwrite/core tarball still contains the removed XLSX backend");
  }

  await mkdir(extract_root, { recursive: true });
  await run(["tar", "-xzf", tarball_path, "-C", extract_root], repository_root);
  const package_root = join(extract_root, "package");
  const packed_manifest = await readJson<PackageManifest>(join(package_root, "package.json"));
  const metadata = JSON.stringify(packed_manifest);
  if (metadata.includes("workspace:")) {
    throw new Error(`${manifest.name} contains an unpublished workspace dependency range`);
  }

  for (const target of packageTargets(packed_manifest)) {
    await access(join(package_root, target));
  }
  await assertPublishedDeclarations(package_root, [...packed_files]);

  await assert_worker_bundle(package_root, packed_manifest);
  if (manifest.name === "@sheetwrite/formulas") {
    await run(
      [
        "node",
        "--input-type=module",
        "-e",
        `import { strict as assert } from "node:assert";
         const engine = await import(${JSON.stringify(pathToFileURL(join(package_root, "loader-node.mjs")).href)});
         await engine.load();
         assert.equal(engine.isLoaded(), true);
         const store = new engine.CellStore();
         try {
           const sheet = store.addSheet(1, 1);
           store.setFormula(sheet, 0, 0, "=NORM.DIST(0,0,1,TRUE)", 0);
           store.recompute(sheet);
           const cell = store.getCell(sheet, 0, 0);
           try { assert.ok(Math.abs(cell.num - 0.5) < 1e-12); }
           finally { cell.free(); }
         } finally { store.free(); }`,
      ],
      package_root,
    );
  }
}

async function path_exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function verify_no_optional_package_closure(
  name: string,
  package_name: string,
  tarballs: ReadonlyMap<string, string>,
  temporary_root: string,
): Promise<void> {
  const root = join(temporary_root, `without-optional-${name}`);
  await cp(join(repository_root, "test/release-locks", name), root, { recursive: true });
  const artifact_root = join(root, "artifacts");
  await mkdir(artifact_root, { recursive: true });
  const local_tarballs = new Map<string, string>();
  for (const local_package of new Set([package_name, "@sheetwrite/core", "@sheetwrite/wasm"])) {
    const tarball = tarballs.get(local_package);
    if (tarball === undefined) throw new Error(`Missing tarball for ${local_package}`);
    local_tarballs.set(local_package, tarball);
    await cp(tarball, join(artifact_root, basename(tarball)));
  }
  await bindCanonicalTarballIntegrities(join(root, "package-lock.json"), local_tarballs);
  await run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], root);

  // Core and the adapters must install and run without the optional packages.
  const lock = await readFile(join(root, "package-lock.json"), "utf8");
  for (const optional_package of OPTIONAL_PACKAGES) {
    if (lock.includes(`node_modules/${optional_package}`)) {
      throw new Error(`${package_name} package-lock unexpectedly contains ${optional_package}`);
    }
    if (await path_exists(join(root, "node_modules", ...optional_package.split("/")))) {
      throw new Error(`${package_name} node_modules unexpectedly contains ${optional_package}`);
    }
  }

  const adapter_probe =
    package_name === "@sheetwrite/svelte"
      ? "const Entry = Core;"
      : `// Dynamic import intentionally checks the selected packed adapter entry.
         const Entry = await import(${JSON.stringify(package_name)});`;
  const runtime = `
    import * as Core from "@sheetwrite/core";
    ${adapter_probe}
    if (typeof Core.createGrid !== "function" || Object.keys(Entry).length === 0) {
      throw new Error("packed core or adapter entry failed to load");
    }
  `;
  await run(["node", "--input-type=module", "--eval", runtime], root);
}

async function verify_adapter_stylesheets(consumer_root: string): Promise<void> {
  // Each stylesheet is the only import in its bundle. A combined framework
  // bundle could hide a dropped adapter import behind another copy of core CSS.
  await run(
    [
      "node",
      "--input-type=module",
      "--eval",
      `import { build } from "esbuild";
       for (const framework of ["react", "vue", "svelte"]) {
         const result = await build({
           stdin: {
             contents: 'import "@sheetwrite/' + framework + '/styles.css";',
             resolveDir: process.cwd(),
             sourcefile: framework + ".js",
           },
           bundle: true,
           treeShaking: true,
           write: false,
           outdir: "stylesheet-probe",
           // icons.css loads the icon sheet as a file; esbuild needs a loader for it.
           loader: { ".svg": "file" },
         });
         const css = result.outputFiles.filter(file => file.path.endsWith(".css"));
         if (!css.some(file => file.text.includes(".sheetwrite"))) {
           throw new Error(framework + " packed stylesheet was removed by tree shaking");
         }
         if (!result.outputFiles.some(file => file.path.endsWith(".svg"))) {
           throw new Error(framework + " packed stylesheet did not emit the icon sheet");
         }
       }`,
    ],
    consumer_root,
  );
}

async function resolve_runtime_dependency(
  name: string,
  package_root: string,
  consumer_root: string,
): Promise<string> {
  let current = package_root;
  while (current.startsWith(consumer_root)) {
    const candidate = join(current, "node_modules", ...name.split("/"));
    if (await path_exists(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to resolve runtime dependency ${name} from ${package_root}`);
}

async function audit_runtime_licenses(consumer_root: string): Promise<number> {
  const queue = [join(consumer_root, "node_modules", "@sheetwrite", "xlsx")];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const package_root = queue.pop()!;
    if (visited.has(package_root)) continue;
    visited.add(package_root);
    const manifest = await readJson<PackageManifest>(join(package_root, "package.json"));
    const declared_license =
      typeof manifest.license === "string"
        ? manifest.license
        : manifest.license &&
            typeof manifest.license === "object" &&
            "type" in manifest.license &&
            typeof manifest.license.type === "string"
          ? manifest.license.type
          : "";
    const raw_license =
      declared_license || audited_license_overrides[`${manifest.name}@${manifest.version}`] || "";
    const alternatives = raw_license.replace(/[()]/g, "").split(/\s+OR\s+/);
    const compatible = alternatives.some((alternative) =>
      alternative
        .split(/\s+AND\s+/)
        .every((license) => mit_compatible_licenses[license.trim()] === true),
    );
    if (!compatible) {
      throw new Error(
        `${manifest.name} has unresolved or incompatible license ${raw_license || "<missing>"}`,
      );
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push(await resolve_runtime_dependency(dependency, package_root, consumer_root));
    }
  }
  return visited.size;
}

async function verify_mounted_framework_consumers(consumer_root: string): Promise<void> {
  const require_from_consumer = createRequire(join(consumer_root, "package.json"));
  const vite_entry = require_from_consumer.resolve("vite");
  // Vite is intentionally resolved from the freshly installed tarball consumer,
  // not the repository dependency graph, so this module path is runtime-selected.
  const { preview } = await import(pathToFileURL(vite_entry).href);
  const server = await preview({
    root: consumer_root,
    configFile: join(consumer_root, "vite.config.ts"),
    preview: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    await server.close();
    throw new Error("Packed consumer preview did not publish a TCP port");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const framework of ["react", "vue", "svelte"] as const) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      const path = framework === "svelte" ? "/" : `/${framework}.html`;
      await page.goto(`http://127.0.0.1:${address.port}${path}`, {
        waitUntil: "domcontentloaded",
      });
      try {
        await page.waitForFunction(
          () => document.documentElement.dataset.sheetwriteLifecycle === "passed",
          undefined,
          { timeout: 15_000 },
        );
      } catch (error) {
        const body = await page.locator("body").innerText();
        throw new Error(
          `${framework} packed consumer did not complete\n${errors.join("\n")}\nbody: ${body}`,
          { cause: error },
        );
      }
      const marker = await page.locator(`[data-packed-status="${framework}"]`).textContent();
      if (marker !== `${framework} ready/edit/reset/unmount passed`) {
        throw new Error(`${framework} packed consumer published an invalid lifecycle marker`);
      }
      if (errors.length > 0) {
        throw new Error(`${framework} packed consumer browser errors:\n${errors.join("\n")}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv.includes("--help")) {
  process.stdout.write("Usage: bun scripts/verify-packed-consumer.ts [--artifacts <directory>]\n");
  process.exit(0);
}

const artifact_directory = optionValue(process.argv, "--artifacts");
const required_artifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifact_directory === undefined) {
  throw new Error("Artifact-only packed verification requires --artifacts");
}
if (
  required_artifacts !== undefined &&
  (artifact_directory === undefined || resolve(artifact_directory) !== resolve(required_artifacts))
) {
  throw new Error("Packed verification artifact input differs from the canonical artifact set");
}

const temporary_root = await mkdtemp(join(tmpdir(), "sheetwrite-packed-consumer-"));
try {
  const tarball_root = join(temporary_root, "tarballs");
  const extract_root = join(temporary_root, "extracted");
  const consumer_root = join(temporary_root, "consumer");
  await mkdir(extract_root, { recursive: true });

  const source_manifests = await Promise.all(
    package_specs.map((spec) =>
      readJson<PackageManifest>(join(repository_root, spec.directory, "package.json")),
    ),
  );
  const tarballs = new Map<string, string>();
  const package_sizes = new Map<string, { packed: number; unpacked: number }>();
  let artifact_manifest_digest: string | undefined;

  if (artifact_directory === undefined) {
    const packages = await packBuiltPackages(tarball_root);
    const by_name = new Map(packages.map((packed) => [packed.artifact.name, packed]));
    for (const [index, spec] of package_specs.entries()) {
      const manifest = source_manifests[index];
      if (manifest === undefined) throw new Error(`Missing source manifest for ${spec.directory}`);
      const packed = by_name.get(manifest.name);
      if (packed === undefined) throw new Error(`Missing packed package ${manifest.name}`);
      await assert_tarball(
        spec,
        manifest,
        packed.pack,
        packed.tarballPath,
        join(extract_root, basename(spec.directory)),
      );
      tarballs.set(manifest.name, packed.tarballPath);
      package_sizes.set(manifest.name, {
        packed: packed.pack.size,
        unpacked: packed.pack.unpackedSize,
      });
    }
  } else {
    const release = await verifyReleaseArtifacts(resolve(artifact_directory));
    artifact_manifest_digest = await readReleaseManifestDigest(resolve(artifact_directory));
    const artifacts = new Map(release.packages.map((artifact) => [artifact.name, artifact]));
    for (const [index, spec] of package_specs.entries()) {
      const manifest = source_manifests[index];
      if (manifest === undefined) throw new Error(`Missing source manifest for ${spec.directory}`);
      const artifact = artifacts.get(manifest.name);
      if (artifact === undefined)
        throw new Error(`Missing canonical artifact for ${manifest.name}`);
      const tarball_path = join(resolve(artifact_directory), artifact.path);
      const result: PackResult = {
        filename: artifact.path,
        size: artifact.bytes,
        unpackedSize: artifact.unpackedBytes,
        files: artifact.files.map((path) => ({ path })),
      };
      await assert_tarball(
        spec,
        manifest,
        result,
        tarball_path,
        join(extract_root, basename(spec.directory)),
      );
      tarballs.set(manifest.name, tarball_path);
      package_sizes.set(manifest.name, {
        packed: artifact.bytes,
        unpacked: artifact.unpackedBytes,
      });
    }
  }

  await Promise.all([
    verify_no_optional_package_closure("core", "@sheetwrite/core", tarballs, temporary_root),
    verify_no_optional_package_closure("react", "@sheetwrite/react", tarballs, temporary_root),
    verify_no_optional_package_closure("vue", "@sheetwrite/vue", tarballs, temporary_root),
    verify_no_optional_package_closure("svelte", "@sheetwrite/svelte", tarballs, temporary_root),
  ]);

  await cp(fixture_root, consumer_root, { recursive: true });
  const consumer_artifacts = join(consumer_root, "artifacts");
  await mkdir(consumer_artifacts, { recursive: true });
  for (const tarball of tarballs.values()) {
    await cp(tarball, join(consumer_artifacts, basename(tarball)));
  }
  await bindCanonicalTarballIntegrities(join(consumer_root, "package-lock.json"), tarballs);
  await run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], consumer_root);
  await run(
    [
      "npm",
      "ls",
      "@sheetwrite/core",
      "@sheetwrite/wasm",
      "@sheetwrite/formulas",
      "react",
      "svelte",
      "vue",
    ],
    consumer_root,
  );
  const audited_license_count = await audit_runtime_licenses(consumer_root);
  await run(["npm", "run", "typecheck"], consumer_root);
  await verify_adapter_stylesheets(consumer_root);
  await run(["npm", "run", "bundle"], consumer_root);
  await run(["npm", "run", "bundle:frameworks"], consumer_root);
  await verify_mounted_framework_consumers(consumer_root);
  await run(["npm", "run", "runtime"], consumer_root);
  await run(["npm", "run", "runtime:formulas"], consumer_root);
  await run(["npm", "run", "runtime:queries"], consumer_root);

  // The Vite build must have compiled the packed Svelte adapter and retained
  // its operational-event wiring, in addition to the mounted browser proof.
  const vite_assets = join(consumer_root, "dist-vite/assets");
  const asset_files = await readdir(vite_assets);
  let adapter_compiled = false;
  for (const name of asset_files) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(vite_assets, name), "utf8");
    if (content.includes("onMutationRejected")) adapter_compiled = true;
  }
  if (!adapter_compiled) {
    throw new Error("Vite consumer bundle does not contain packed adapter event wiring");
  }

  for (const [name, size] of package_sizes) {
    console.log(`${name}: packed=${size.packed}B unpacked=${size.unpacked}B`);
  }
  console.log(`Audited ${audited_license_count} MIT-compatible XLSX runtime package licenses`);
  if (artifact_manifest_digest !== undefined) {
    console.log(`Artifact manifest SHA-512: ${artifact_manifest_digest}`);
  }
  console.log("Packed tarball consumer verification passed");
} finally {
  await rm(temporary_root, { force: true, recursive: true });
}
