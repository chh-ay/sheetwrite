import { cp, lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  assertPublishedFilePolicy,
  packBuiltPackages,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";
import { captureProcess, readJson } from "./script-io.js";
import {
  type ClosureReport,
  type PackageReport,
  type PackedCategory,
  type PackResult,
  repositoryRoot,
} from "./size-report.js";

interface PackedPackage {
  name: string;
  tarballPath: string;
  report: PackageReport;
}

/**
 * Optional packages that core and the framework adapters must not install.
 * Only the closure named here may contain the package; `metric` names its isolation count.
 */
export const OPTIONAL_PACKAGE_CLOSURES = [
  { packageName: "@sheetwrite/xlsx", closure: "core-xlsx", metric: "xlsxPackageCount" },
  { packageName: "@sheetwrite/charts", closure: "core-charts", metric: "chartsPackageCount" },
  { packageName: "@sheetwrite/queries", closure: "core-queries", metric: "queriesPackageCount" },
] as const;
/**
 * Opt-in static files a host fetches or reads by URL: the icon sheet for
 * strict-CSP pages and its layout manifest for replacement sheets. The JSON is
 * listed by name so that any other JSON in a package still fails closed.
 */
const STATIC_ASSET_PATHS = new Set(["dist/icons.json"]);

export function classifyPackedPath(path: string): PackedCategory {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wasm")) return "wasm";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".svg") || STATIC_ASSET_PATHS.has(lower)) return "assets";
  if (lower.endsWith(".map")) return "maps";
  if (/\.d\.(?:c|m)?ts$/.test(lower)) return "declarations";
  if (/\.(?:c|m)?js$/.test(lower)) return "runtime-js";
  if (/\.(?:svelte|ts|tsx|jsx)$/.test(lower)) return "runtime-source";
  if (
    /(?:^|\/)(?:package\.json|license(?:\.[^/]*)?|readme(?:\.[^/]*)?|notice(?:\.[^/]*)?)$/i.test(
      path,
    )
  ) {
    return "metadata";
  }
  throw new Error(`Unclassified packed artifact: ${path}`);
}

export function summarizePack(name: string, result: PackResult): PackageReport {
  assertPublishedFilePolicy(
    name,
    result.files.map((file) => file.path),
  );
  const categories: Record<PackedCategory, number> = {
    assets: 0,
    css: 0,
    declarations: 0,
    maps: 0,
    metadata: 0,
    "runtime-js": 0,
    "runtime-source": 0,
    wasm: 0,
  };
  let file_bytes = 0;
  for (const file of result.files) {
    categories[classifyPackedPath(file.path)] += file.size;
    file_bytes += file.size;
  }
  if (file_bytes !== result.unpackedSize) {
    throw new Error(
      `${name} npm pack file bytes ${file_bytes} do not equal unpackedSize ${result.unpackedSize}`,
    );
  }
  return {
    name,
    tarballBytes: result.size,
    unpackedBytes: result.unpackedSize,
    fileCount: result.files.length,
    categories,
  };
}

export async function walkLogicalBytes(root: string): Promise<{ bytes: number; files: number }> {
  const visited_directories = new Set<string>();
  const visited_files = new Set<string>();
  let bytes = 0;
  let files = 0;

  async function visit(path: string): Promise<void> {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      await visit(target);
      return;
    }
    if (entry.isDirectory()) {
      const canonical = await realpath(path);
      if (visited_directories.has(canonical)) return;
      visited_directories.add(canonical);
      const entries = await readdir(path);
      entries.sort();
      for (const name of entries) await visit(join(path, name));
      return;
    }
    if (!entry.isFile()) return;
    const canonical = await realpath(path);
    if (visited_files.has(canonical)) return;
    visited_files.add(canonical);
    bytes += entry.size;
    files += 1;
  }

  await visit(root);
  return { bytes, files };
}

export async function runCommand(command: string[], cwd = repositoryRoot): Promise<string> {
  return captureProcess(command, {
    cwd,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    failure: ({ stdout, stderr, exitCode: exit_code }) =>
      `${command.join(" ")} failed with exit code ${exit_code}\n${stdout.trim()}\n${stderr.trim()}`,
  });
}

export async function packPackages(temporaryRoot: string): Promise<PackedPackage[]> {
  const packages = await packBuiltPackages(join(temporaryRoot, "tarballs"));
  return packages.map(({ artifact, tarballPath: tarball_path, pack }) => ({
    name: artifact.name,
    tarballPath: tarball_path,
    report: summarizePack(artifact.name, pack),
  }));
}

export async function loadPackedArtifacts(
  artifactDirectory: string,
  temporaryRoot: string,
): Promise<PackedPackage[]> {
  const artifact_root = resolve(artifactDirectory);
  const release = await verifyReleaseArtifacts(artifact_root);
  const extract_root = join(temporaryRoot, "artifact-packages");
  await mkdir(extract_root, { recursive: true });
  const packed: PackedPackage[] = [];
  for (const artifact of release.packages) {
    const package_root = join(extract_root, artifact.name.replaceAll("/", "-"));
    await mkdir(package_root, { recursive: true });
    const tarball_path = join(artifact_root, artifact.path);
    await runCommand(["tar", "-xzf", tarball_path, "-C", package_root]);
    const files = await Promise.all(
      artifact.files.map(async (path) => ({
        path,
        size: (await stat(join(package_root, "package", path))).size,
      })),
    );
    packed.push({
      name: artifact.name,
      tarballPath: tarball_path,
      report: summarizePack(artifact.name, {
        filename: artifact.path,
        size: artifact.bytes,
        unpackedSize: artifact.unpackedBytes,
        files,
      }),
    });
  }
  return packed;
}

async function sum_package_files(package_root: string): Promise<number> {
  let bytes = 0;
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) bytes += (await stat(path)).size;
    }
  }
  await visit(package_root);
  return bytes;
}

export async function measureClosure(
  name: string,
  dependencyNames: readonly string[],
  packed: ReadonlyMap<string, string>,
  temporaryRoot: string,
  sequence: number,
): Promise<ClosureReport> {
  const consumer_root = join(temporaryRoot, `closure-${name}-${sequence}`);
  await cp(join(repositoryRoot, "test/release-locks", name), consumer_root, { recursive: true });
  const artifact_root = join(consumer_root, "artifacts");
  await mkdir(artifact_root, { recursive: true });

  const closure_tarballs = new Map<string, string>();
  for (const package_name of dependencyNames) {
    const tarball = packed.get(package_name);
    if (tarball === undefined) throw new Error(`No packed tarball for ${package_name}`);
    closure_tarballs.set(package_name, tarball);
    await cp(tarball, join(artifact_root, basename(tarball)));
  }

  await bindCanonicalTarballIntegrities(join(consumer_root, "package-lock.json"), closure_tarballs);
  await runCommand(
    ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"],
    consumer_root,
  );

  const lock = await readJson<{ packages?: Record<string, unknown> }>(
    join(consumer_root, "package-lock.json"),
  );
  if (lock.packages === undefined)
    throw new Error(`${name} committed lockfile has no package graph`);

  const package_paths = Object.keys(lock.packages)
    .filter((path) => /(?:^|\/)node_modules\//.test(path))
    .sort();

  const seen = new Set<string>();
  const package_names: string[] = [];
  let logical_bytes = 0;
  for (const lock_path of package_paths) {
    const package_root = join(consumer_root, lock_path);
    const canonical = await realpath(package_root);
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    const manifest = await readJson<{ name?: unknown; version?: unknown }>(
      join(package_root, "package.json"),
    );
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`${name} installed package at ${lock_path} has malformed identity`);
    }
    package_names.push(`${manifest.name}@${manifest.version}`);
    logical_bytes += await sum_package_files(package_root);
  }

  package_names.sort();

  for (const optional of OPTIONAL_PACKAGE_CLOSURES) {
    if (name === optional.closure) continue;

    const leaked = package_names.filter((identity) =>
      identity.startsWith(`${optional.packageName}@`),
    );
    if (leaked.length > 0) throw new Error(`${name} runtime closure contains ${leaked.join(", ")}`);
  }

  return {
    name,
    packageCount: package_names.length,
    logicalBytes: logical_bytes,
    packages: package_names,
  };
}
