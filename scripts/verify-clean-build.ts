import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { packageTargets } from "./package-targets.js";
import { publishableIndex, validateWorkspaceGraph } from "./workspace-tooling.js";

interface PackageManifest {
  readonly name?: string;
  readonly exports?: unknown;
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
  readonly browser?: unknown;
  readonly svelte?: string;
}

const GENERATED_OUTPUTS = [
  "packages/wasm/pkg",
  "packages/wasm/target",
  "packages/wasm/pkg-history",
  "packages/wasm/history/target",
  "packages/formulas/pkg",
  "packages/formulas/loader.mjs",
  "packages/formulas/loader-browser.mjs",
  "packages/formulas/loader-node.mjs",
  "packages/formulas/loader-state.mjs",
  "packages/queries/pkg",
  "packages/queries/engine/target",
  "packages/queries/dist",
  "packages/core/dist",
  "packages/xlsx/dist",
  "packages/charts/dist",
  "packages/formula-assist/dist",
  "packages/react/dist",
  "packages/vue/dist",
  "packages/core/src/generated",
  "docs/dist",
  "docs/.tanstack",
  "docs/src/generated",
  "docs/public/llms.txt",
  "docs/public/llms-full.txt",
  "docs/src/content/docs/api",
  "docs/src/content/docs/performance",
  "docs/src/content/docs/reference/formula-functions",
  "docs/src/content/docs/reference/compatibility-results.md",
  "docs/src/content/docs/reference/excel-function-coverage.md",
  "docs/src/content/docs/reference/formula-functions.md",
  "docs/src/content/docs/reference/moved-guides.md",
  "docs/src/content/docs/reference/package-entry-points.md",
] as const;

const RUNTIME_ENTRY_PATHS = [
  "./packages/wasm/loader-node.mjs",
  "./packages/formulas/loader-node.mjs",
  "./packages/core/dist/index.js",
  "./packages/xlsx/dist/index.js",
  "./packages/charts/dist/index.js",
  "./packages/formula-assist/dist/index.js",
  "./packages/queries/dist/node.js",
  "./packages/react/dist/index.js",
  "./packages/vue/dist/index.js",
] as const;

function package_directories(root: string): readonly string[] {
  return readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, "packages", entry.name));
}

export function assertGeneratedOutputsAbsent(root: string): void {
  const present = GENERATED_OUTPUTS.filter((path) => existsSync(resolve(root, path)));
  if (present.length > 0) {
    throw new Error(
      `Clean-build verification requires absent generated output: ${present.join(", ")}`,
    );
  }
}

export function validateExportTargets(root: string): readonly string[] {
  const checked: string[] = [];
  const missing: string[] = [];
  for (const package_root of package_directories(root)) {
    const manifest = JSON.parse(
      readFileSync(resolve(package_root, "package.json"), "utf8"),
    ) as PackageManifest;
    if (!manifest.name || publishableIndex(manifest.name) === -1) continue;
    for (const target of packageTargets(manifest)) {
      checked.push(`${manifest.name}:./${target}`);
      if (!existsSync(resolve(package_root, target))) missing.push(`${manifest.name}:./${target}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Declared package export targets are missing: ${missing.join(", ")}`);
  }
  return checked.sort();
}

async function run(
  root: string,
  command: readonly [string, ...string[]],
  capture = false,
): Promise<string> {
  console.log(`::clean-build::${command.join(" ")}`);
  const child = Bun.spawn([...command], {
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdin: "ignore",
    stdout: capture ? "pipe" : "inherit",
    stderr: capture ? "pipe" : "inherit",
  });
  if (capture) {
    const [stdout, stderr, exit_code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exit_code !== 0) throw new Error(`${command.join(" ")} failed: ${stderr.trim()}`);
    return stdout;
  }
  const exit_code = await child.exited;
  if (exit_code !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exit_code}`);
  return "";
}

async function export_workspace(source_root: string, destination_root: string): Promise<void> {
  const output = await run(
    source_root,
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    true,
  );
  const paths = output.split("\0").filter(Boolean);
  if (paths.length === 0) throw new Error("Git returned no source files for the clean export");
  for (const relative_path of paths) {
    const source = resolve(source_root, relative_path);
    const destination = resolve(destination_root, relative_path);
    const source_stat = await lstat(source);
    if (!source_stat.isFile() && !source_stat.isSymbolicLink()) {
      throw new Error(`Clean export encountered unsupported source entry: ${relative_path}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { dereference: false });
  }
}

async function verify_runtime_imports(root: string): Promise<void> {
  const smoke_path = resolve(root, ".sheetwrite-runtime-import-smoke.ts");
  await writeFile(
    smoke_path,
    `const entries = ${JSON.stringify(RUNTIME_ENTRY_PATHS)};\n` +
      "for (const entry of entries) {\n" +
      "  // Runtime-selected entry URLs intentionally exercise built module loading boundaries.\n" +
      "  await import(new URL(entry, import.meta.url).href);\n" +
      "}\n",
  );
  try {
    await run(root, ["bun", smoke_path]);
  } finally {
    await rm(smoke_path, { force: true });
  }
}

export async function validateBuiltWorkspace(root: string): Promise<void> {
  validateWorkspaceGraph(root);
  const checked = validateExportTargets(root);
  await verify_runtime_imports(root);
  console.log(
    `Validated ${checked.length} declared export target(s) and ${RUNTIME_ENTRY_PATHS.length} runtime entry import(s)`,
  );
}

export async function verifyCleanBuild(sourceRoot = resolve(import.meta.dir, "..")): Promise<void> {
  const temporary_root = await mkdtemp(join(tmpdir(), "sheetwrite-clean-build-"));
  console.log(`Clean-build export: ${temporary_root}`);
  try {
    await export_workspace(sourceRoot, temporary_root);
    assertGeneratedOutputsAbsent(temporary_root);
    const lock_before = await readFile(resolve(temporary_root, "bun.lock"));
    await run(temporary_root, ["bun", "install", "--frozen-lockfile"]);
    const lock_after = await readFile(resolve(temporary_root, "bun.lock"));
    if (!lock_before.equals(lock_after)) throw new Error("Frozen install changed bun.lock");
    await run(temporary_root, ["bun", "run", "build:packages"]);
    await run(temporary_root, ["bun", "run", "typecheck:packages"]);
    await validateBuiltWorkspace(temporary_root);
  } finally {
    await rm(temporary_root, { recursive: true, force: true });
  }
}

async function main(args: readonly string[]): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  if (args.includes("--assert-absent")) {
    assertGeneratedOutputsAbsent(root);
    console.log("Generated package, WASM, and example outputs are absent");
    return;
  }
  if (args.includes("--validate-current")) {
    await validateBuiltWorkspace(root);
    return;
  }
  await verifyCleanBuild(root);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
