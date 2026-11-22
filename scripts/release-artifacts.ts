import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { requiredOption } from "../bench/src/cli-options.js";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import { packageTargets } from "./package-targets.js";
import { captureProcess, readJson } from "./script-io.js";
import {
  BUN_VERSION,
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  PUBLISHABLE_PACKAGE_ORDER,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

export const RELEASE_ARTIFACT_SCHEMA_VERSION = 2;
export const RELEASE_ARTIFACT_MANIFEST = "release-artifacts.json";
export const RELEASE_BUILD_COMMAND = "bun run build:packages";

export function assertPublishedFilePolicy(packageName: string, files: readonly string[]): void {
  const source_map = files.find((path) => path.toLowerCase().endsWith(".map"));
  if (source_map !== undefined) {
    throw new Error(`${packageName} published files must exclude source maps; found ${source_map}`);
  }
}

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
  readonly types?: unknown;
  readonly main?: unknown;
  readonly module?: unknown;
  readonly browser?: unknown;
  readonly svelte?: unknown;
  readonly [key: string]: unknown;
}

interface NpmPackResult {
  readonly name: string;
  readonly version: string;
  readonly filename: string;
  readonly size: number;
  readonly unpackedSize: number;
  readonly shasum: string;
  readonly integrity: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly size: number }>;
}

export interface ReleaseToolchain {
  readonly bun: string;
  readonly node: string;
  readonly npm: string;
  readonly rust: string;
  readonly wasmTarget: string;
  readonly wasmPack: string;
  readonly cargoAudit: string;
  readonly cargoLlvmCov: string;
}

export interface ReleasePackageArtifact {
  readonly name: string;
  readonly version: string;
  readonly path: string;
  readonly bytes: number;
  readonly unpackedBytes: number;
  readonly fileCount: number;
  readonly files: readonly string[];
  readonly shasum: string;
  readonly integrity: string;
  readonly sha512: string;
  readonly internalDependencies: Readonly<Record<string, string>>;
}

export interface PackedWorkspacePackage {
  readonly tarballPath: string;
  readonly artifact: ReleasePackageArtifact;
  readonly pack: NpmPackResult;
}

export interface ReleaseArtifactManifest {
  readonly schemaVersion: number;
  readonly sourceCommit: string;
  readonly dirty: boolean;
  readonly toolchain: ReleaseToolchain;
  readonly buildCommand: typeof RELEASE_BUILD_COMMAND;
  readonly packages: readonly ReleasePackageArtifact[];
}

const repository_root = resolve(import.meta.dir, "..");
const PUBLISHABLE_PACKAGE_INDEXES: Readonly<Record<string, number>> = Object.fromEntries(
  PUBLISHABLE_PACKAGE_ORDER.map((name, index) => [name, index]),
);

async function run(
  command: readonly [string, ...string[]],
  cwd = repository_root,
): Promise<string> {
  const stdout = await captureProcess(command, {
    cwd,
    failure: ({ stdout, stderr, exitCode: exit_code }) =>
      `${command.join(" ")} failed with exit code ${exit_code}\n${stdout.trim()}\n${stderr.trim()}`,
  });
  return stdout.trim();
}

async function path_exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function assertReleaseTreeClean(status: string): void {
  if (status.trim() !== "") {
    throw new Error(`Release tree is dirty:\n${status.trim()}`);
  }
}

/**
 * The tree status a release build checks. Untracked files count: the package
 * builds compile every file under `src`, so an untracked source file would ship
 * in a tarball that its manifest calls clean. Ignored build output does not count.
 */
export async function releaseTreeStatus(root = repository_root): Promise<string> {
  return run(["git", "status", "--porcelain", "--untracked-files=all"], root);
}

export function releaseModeDirty(mode: ReleaseArtifactMode, status: string): boolean {
  if (mode === "release") assertReleaseTreeClean(status);
  return status.trim().length > 0;
}

export function assertOutputDirectoryEmpty(entries: readonly string[]): void {
  if (entries.length > 0) {
    throw new Error(
      `Release artifact output directory is not empty: ${[...entries].sort().join(", ")}`,
    );
  }
}

function rewrite_workspace_ranges(
  dependencies: Readonly<Record<string, string>> | undefined,
  versions: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith("workspace:")) return [name, range];
      const version = versions.get(name);
      if (version === undefined) throw new Error(`No release version found for ${name}`);
      return [name, version];
    }),
  );
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;

function collect_internal_dependencies(
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): Record<string, string> {
  const internal = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (PUBLISHABLE_PACKAGE_INDEXES[name] === undefined) continue;
      const expected = versions.get(name);
      if (expected !== undefined && version !== expected) {
        throw new Error(`${manifest.name} internal dependency ${name} must be ${expected}`);
      }
      internal.set(name, version);
    }
  }
  return Object.fromEntries([...internal].sort(([left], [right]) => left.localeCompare(right)));
}

function assert_stable_release_version(version: string, label: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`${label} must be an exact stable semantic version`);
  }
}

function expected_tarball_name(name: string, version: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export function expectedArtifactFiles(
  packages: readonly Pick<ReleasePackageArtifact, "name" | "version">[],
): readonly string[] {
  return [
    RELEASE_ARTIFACT_MANIFEST,
    ...packages.map(({ name, version }) => expected_tarball_name(name, version)),
  ].sort();
}

export function serializeReleaseManifest(manifest: ReleaseArtifactManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
export function releaseManifestDigest(bytes: Uint8Array): string {
  return `sha512-${digest(bytes, "sha512", "base64")}`;
}

export async function readReleaseManifestDigest(artifactDirectory: string): Promise<string> {
  return releaseManifestDigest(
    new Uint8Array(await readFile(join(resolve(artifactDirectory), RELEASE_ARTIFACT_MANIFEST))),
  );
}

function assert_string(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
}

function assert_integer(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
function assert_exact_keys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} schema drift: expected ${wanted.join(", ")}`);
  }
}

export function validateReleaseManifest(manifest: ReleaseArtifactManifest): void {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("Release manifest must be an object");
  }
  assert_exact_keys(
    manifest,
    ["schemaVersion", "sourceCommit", "dirty", "toolchain", "buildCommand", "packages"],
    "Release manifest",
  );
  if (manifest.schemaVersion !== RELEASE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported release artifact schema ${String(manifest.schemaVersion)}`);
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) {
    throw new Error("Release source commit must be a full Git SHA");
  }
  if (typeof manifest.dirty !== "boolean") throw new Error("Release dirty flag must be boolean");
  if (manifest.buildCommand !== RELEASE_BUILD_COMMAND) {
    throw new Error(`Release build command must be ${RELEASE_BUILD_COMMAND}`);
  }
  const expected_toolchain: ReleaseToolchain = {
    bun: BUN_VERSION,
    node: NODE_VERSION,
    npm: NPM_VERSION,
    rust: RUST_VERSION,
    wasmTarget: WASM_TARGET,
    wasmPack: WASM_PACK_VERSION,
    cargoAudit: CARGO_AUDIT_VERSION,
    cargoLlvmCov: CARGO_LLVM_COV_VERSION,
  };
  if (typeof manifest.toolchain !== "object" || manifest.toolchain === null) {
    throw new Error("Release toolchain must be an object");
  }
  assert_exact_keys(manifest.toolchain, Object.keys(expected_toolchain), "Release toolchain");
  for (const [name, expected] of Object.entries(expected_toolchain)) {
    if (manifest.toolchain[name as keyof ReleaseToolchain] !== expected) {
      throw new Error(`Release toolchain ${name} must be ${expected}`);
    }
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error("Release packages must be a non-empty array");
  }
  const seen = new Set<string>();
  const package_versions = new Map<string, string>();
  let previous_package_index = -1;
  for (const [index, artifact] of manifest.packages.entries()) {
    if (typeof artifact !== "object" || artifact === null) {
      throw new Error(`Release package ${index} must be an object`);
    }
    assert_exact_keys(
      artifact,
      [
        "name",
        "version",
        "path",
        "bytes",
        "unpackedBytes",
        "fileCount",
        "files",
        "shasum",
        "integrity",
        "sha512",
        "internalDependencies",
      ],
      `Release package ${index}`,
    );
    assert_string(artifact.name, `Release package ${index} name`);
    if (seen.has(artifact.name)) throw new Error(`Duplicate release package ${artifact.name}`);
    const package_index = PUBLISHABLE_PACKAGE_INDEXES[artifact.name];
    if (package_index === undefined) throw new Error(`Unknown release package ${artifact.name}`);
    if (package_index <= previous_package_index) {
      throw new Error("Release packages must follow dependency order");
    }
    previous_package_index = package_index;
    seen.add(artifact.name);
    assert_string(artifact.version, `${artifact.name} version`);
    assert_stable_release_version(artifact.version, `${artifact.name} version`);
    package_versions.set(artifact.name, artifact.version);
    const expected_path = expected_tarball_name(artifact.name, artifact.version);
    if (artifact.path !== expected_path || basename(artifact.path) !== artifact.path) {
      throw new Error(`${artifact.name} must use canonical tarball path ${expected_path}`);
    }
    assert_integer(artifact.bytes, `${artifact.name} bytes`);
    assert_integer(artifact.unpackedBytes, `${artifact.name} unpackedBytes`);
    assert_integer(artifact.fileCount, `${artifact.name} fileCount`);
    if (!Array.isArray(artifact.files) || artifact.files.length !== artifact.fileCount) {
      throw new Error(`${artifact.name} packed file list does not match fileCount`);
    }
    if (new Set(artifact.files).size !== artifact.files.length) {
      throw new Error(`${artifact.name} packed file list contains duplicates`);
    }
    if (
      [...artifact.files].sort().some((path, file_index) => path !== artifact.files[file_index])
    ) {
      throw new Error(`${artifact.name} packed file list must be sorted`);
    }
    assertPublishedFilePolicy(artifact.name, artifact.files);
    assert_string(artifact.shasum, `${artifact.name} shasum`);
    if (!/^[0-9a-f]{40}$/.test(artifact.shasum)) {
      throw new Error(`${artifact.name} shasum must be SHA-1 hex`);
    }
    assert_string(artifact.integrity, `${artifact.name} integrity`);
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(artifact.integrity)) {
      throw new Error(`${artifact.name} integrity must be SHA-512 SRI`);
    }
    if (!/^[0-9a-f]{128}$/.test(artifact.sha512)) {
      throw new Error(`${artifact.name} sha512 must be SHA-512 hex`);
    }
    if (
      typeof artifact.internalDependencies !== "object" ||
      artifact.internalDependencies === null
    ) {
      throw new Error(`${artifact.name} internalDependencies must be an object`);
    }
  }
  for (const artifact of manifest.packages) {
    for (const [name, version] of Object.entries(artifact.internalDependencies)) {
      if (PUBLISHABLE_PACKAGE_INDEXES[name] === undefined) {
        throw new Error(`${artifact.name} has unknown internal dependency ${name}`);
      }
      assert_string(version, `${artifact.name} internal dependency ${name}`);
      assert_stable_release_version(version, `${artifact.name} internal dependency ${name}`);
      const packaged_version = package_versions.get(name);
      if (packaged_version !== undefined && version !== packaged_version) {
        throw new Error(`${artifact.name} internal dependency ${name} must be ${packaged_version}`);
      }
    }
  }
}

/** Files every published tarball of a package must contain; consumer checks start from this list. */
export const REQUIRED_PACKAGE_FILES: Readonly<Record<string, readonly string[]>> = {
  "@sheetwrite/wasm": [
    "README.md",
    "LICENSE",
    "loader.d.ts",
    "loader.mjs",
    "loader-browser.mjs",
    "loader-node.mjs",
    "pkg/sheetwrite_wasm.d.ts",
    "pkg/sheetwrite_wasm.js",
    "pkg/sheetwrite_wasm_bg.wasm",
    "history.d.ts",
    "history.mjs",
    "history-node.mjs",
    "pkg-history/sheetwrite_history.d.ts",
    "pkg-history/sheetwrite_history.js",
    "pkg-history/sheetwrite_history_bg.wasm",
  ],
  "@sheetwrite/formulas": [
    "README.md",
    "LICENSE",
    "loader.d.ts",
    "loader.mjs",
    "loader-browser.mjs",
    "loader-node.mjs",
    "loader-state.mjs",
    "pkg/sheetwrite_wasm.d.ts",
    "pkg/sheetwrite_wasm.js",
    "pkg/sheetwrite_wasm_bg.wasm",
  ],
  "@sheetwrite/queries": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/node.d.ts",
    "dist/node.js",
    "pkg/sheetwrite_queries.js",
    "pkg/sheetwrite_queries_bg.wasm",
  ],
  "@sheetwrite/core": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/worker.d.ts",
    "dist/worker.js",
    "styles.css",
    "styles/grid.css",
    "styles/icons.svg",
    "shell.css",
  ],
  "@sheetwrite/xlsx": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js"],
  "@sheetwrite/charts": ["README.md", "LICENSE", "dist/index.d.ts", "dist/index.js"],
  "@sheetwrite/formula-assist": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/predictor.js",
  ],
  "@sheetwrite/react": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "styles.css",
    "styles/grid.css",
  ],
  "@sheetwrite/vue": [
    "README.md",
    "LICENSE",
    "dist/index.d.ts",
    "dist/index.js",
    "styles.css",
    "styles/grid.css",
  ],
  "@sheetwrite/svelte": [
    "README.md",
    "LICENSE",
    "src/Grid.svelte",
    "src/index.ts",
    "styles.css",
    "styles/grid.css",
  ],
};

function manifest_entry_exists(entry: string, files: readonly string[]): boolean {
  const path = entry.replace(/^\.\//, "").replace(/\/$/, "");
  if (/[*?[\]{}]/u.test(path)) {
    const glob = new Bun.Glob(path);
    return files.some((file) => glob.match(file));
  }
  return files.includes(path) || files.some((file) => file.startsWith(`${path}/`));
}

function validate_packed_manifest(
  artifact: ReleasePackageArtifact,
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): void {
  if (manifest.name !== artifact.name || manifest.version !== artifact.version) {
    throw new Error(`${artifact.name} packed manifest identity changed`);
  }
  if (manifest.scripts?.prepublishOnly !== undefined) {
    throw new Error(`${artifact.name} packed manifest retains prepublishOnly`);
  }
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (version.includes("workspace:")) {
        throw new Error(`${artifact.name} contains an unpublished workspace range`);
      }
      const expected = versions.get(name);
      if (expected !== undefined && version !== expected) {
        throw new Error(`${artifact.name} internal dependency ${name} must be ${expected}`);
      }
    }
  }
  const internal_dependencies = collect_internal_dependencies(manifest, versions);
  if (JSON.stringify(internal_dependencies) !== JSON.stringify(artifact.internalDependencies)) {
    throw new Error(`${artifact.name} internal dependency map changed`);
  }
  const files = new Set(artifact.files);
  for (const required of REQUIRED_PACKAGE_FILES[artifact.name] ?? []) {
    if (!files.has(required))
      throw new Error(`${artifact.name} is missing required file ${required}`);
  }
  for (const target of packageTargets(manifest)) {
    if (!files.has(target) && !artifact.files.some((file) => file.startsWith(`${target}/`))) {
      throw new Error(`${artifact.name} package target does not exist with exact case: ${target}`);
    }
  }
  for (const declared of manifest.files ?? []) {
    if (!manifest_entry_exists(declared, artifact.files)) {
      throw new Error(
        `${artifact.name} declared file target does not exist with exact case: ${declared}`,
      );
    }
  }
  const forbidden = artifact.files.find(
    (path) =>
      (/^(?:src)\//.test(path) && artifact.name !== "@sheetwrite/svelte") ||
      /^(?:test|tests|coverage|node_modules|\.cache|tmp|temp)\//.test(path) ||
      /(?:^|\/)(?:\.DS_Store|Thumbs\.db|[^/]+\.tmp)$/.test(path) ||
      (path.endsWith(".ts") && !path.endsWith(".d.ts") && artifact.name !== "@sheetwrite/svelte"),
  );
  if (forbidden !== undefined)
    throw new Error(`${artifact.name} contains forbidden file ${forbidden}`);
}

function digest(bytes: Uint8Array, algorithm: "sha1" | "sha512", encoding: "hex" | "base64") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

async function assert_toolchain(): Promise<ReleaseToolchain> {
  const toolchain: ReleaseToolchain = {
    bun: Bun.version,
    node: (await run(["node", "--version"])).replace(/^v/, ""),
    npm: await run(["npm", "--version"]),
    rust: (await run(["rustc", "--version"])).match(/^rustc\s+([^\s]+)/)?.[1] ?? "missing",
    wasmTarget: WASM_TARGET,
    wasmPack:
      (await run(["wasm-pack", "--version"])).match(/^wasm-pack\s+([^\s]+)/)?.[1] ?? "missing",
    cargoAudit:
      (await run(["cargo", "audit", "--version"])).match(
        /^cargo-audit(?:-audit)?\s+([^\s]+)/,
      )?.[1] ?? "missing",
    cargoLlvmCov:
      (await run(["cargo", "llvm-cov", "--version"])).match(/^cargo-llvm-cov\s+([^\s]+)/)?.[1] ??
      "missing",
  };
  validateReleaseManifest({
    schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    sourceCommit: "0".repeat(40),
    dirty: false,
    toolchain,
    buildCommand: RELEASE_BUILD_COMMAND,
    packages: PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
      name,
      version: "0.0.0",
      path: expected_tarball_name(name, "0.0.0"),
      bytes: 0,
      unpackedBytes: 0,
      fileCount: 0,
      files: [],
      shasum: "0".repeat(40),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
      sha512: "0".repeat(128),
      internalDependencies: {},
    })),
  });
  return toolchain;
}

function parse_pack_result(output: string, expected_name: string): NpmPackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Malformed npm pack JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack must return exactly one artifact");
  }
  const result = parsed[0] as Partial<NpmPackResult> | null;
  if (
    result === null ||
    typeof result !== "object" ||
    result.name !== expected_name ||
    typeof result.version !== "string" ||
    typeof result.filename !== "string" ||
    !Number.isInteger(result.size) ||
    !Number.isInteger(result.unpackedSize) ||
    Number(result.size) < 0 ||
    Number(result.unpackedSize) < 0 ||
    typeof result.shasum !== "string" ||
    typeof result.integrity !== "string" ||
    !Array.isArray(result.files)
  ) {
    throw new Error(`Malformed npm pack result for ${expected_name}`);
  }
  const paths = new Set<string>();
  for (const file of result.files ?? []) {
    if (
      file === null ||
      typeof file !== "object" ||
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      !Number.isInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error(`Malformed npm pack file for ${expected_name}`);
    }
    if (paths.has(file.path)) {
      throw new Error(`${expected_name} npm pack contains duplicate file ${file.path}`);
    }
    paths.add(file.path);
  }
  return result as NpmPackResult;
}

async function load_source_packages(): Promise<
  ReadonlyArray<{ readonly directory: string; readonly manifest: PackageManifest }>
> {
  const package_directories = await readdir(join(repository_root, "packages"), {
    withFileTypes: true,
  });
  const by_name = new Map<string, { directory: string; manifest: PackageManifest }>();
  for (const entry of package_directories) {
    if (!entry.isDirectory()) continue;
    const directory = join(repository_root, "packages", entry.name);
    const manifest_path = join(directory, "package.json");
    if (!(await path_exists(manifest_path))) continue;
    const manifest = await readJson<PackageManifest>(manifest_path);
    if (PUBLISHABLE_PACKAGE_INDEXES[manifest.name] === undefined) continue;
    if (by_name.has(manifest.name)) {
      throw new Error(`Duplicate publishable workspace package ${manifest.name}`);
    }
    assert_stable_release_version(manifest.version, `${manifest.name} version`);
    by_name.set(manifest.name, { directory, manifest });
  }
  const sources = [...by_name.values()].sort(
    (left, right) =>
      PUBLISHABLE_PACKAGE_INDEXES[left.manifest.name]! -
      PUBLISHABLE_PACKAGE_INDEXES[right.manifest.name]!,
  );
  if (sources.length === 0) throw new Error("No publishable workspace packages found");
  return sources;
}

interface StagedPackage {
  readonly root: string;
  readonly internalDependencies: Readonly<Record<string, string>>;
}

async function copy_manifest_entry(
  source_root: string,
  package_root: string,
  entry: string,
): Promise<void> {
  if (!/[*?[\]{}]/u.test(entry)) {
    await cp(join(source_root, entry), join(package_root, entry), { recursive: true });
    return;
  }
  const matches = Array.from(
    new Bun.Glob(entry).scanSync({
      cwd: source_root,
      dot: true,
      onlyFiles: true,
      followSymlinks: false,
    }),
  );
  if (matches.length === 0) throw new Error(`Package file pattern matched nothing: ${entry}`);
  for (const path of matches) {
    const target = join(package_root, path);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(source_root, path), target);
  }
}

async function stage_package(
  source: { readonly directory: string; readonly manifest: PackageManifest },
  stage_root: string,
  versions: ReadonlyMap<string, string>,
): Promise<StagedPackage> {
  const target = join(stage_root, basename(source.directory));
  await mkdir(target, { recursive: true });
  const paths = new Set([...(source.manifest.files ?? []), "LICENSE", "README.md"]);
  for (const path of paths) {
    await copy_manifest_entry(source.directory, target, path);
  }
  const scripts = { ...source.manifest.scripts };
  delete scripts.prepublishOnly;
  const staged_manifest: PackageManifest = {
    ...source.manifest,
    dependencies: rewrite_workspace_ranges(source.manifest.dependencies, versions),
    devDependencies: rewrite_workspace_ranges(source.manifest.devDependencies, versions),
    peerDependencies: rewrite_workspace_ranges(source.manifest.peerDependencies, versions),
    scripts: Object.keys(scripts).length === 0 ? undefined : scripts,
  };
  const internal_dependencies = collect_internal_dependencies(staged_manifest, versions);
  await writeFile(join(target, "package.json"), `${JSON.stringify(staged_manifest, null, 2)}\n`);
  return { root: target, internalDependencies: internal_dependencies };
}

export async function verifyReleaseArtifacts(
  artifactDirectory: string,
): Promise<ReleaseArtifactManifest> {
  const root = resolve(artifactDirectory);
  const manifest_path = join(root, RELEASE_ARTIFACT_MANIFEST);
  if (!(await path_exists(manifest_path))) {
    throw new Error(`Release artifact directory is missing ${RELEASE_ARTIFACT_MANIFEST}`);
  }
  const manifest = await readJson<ReleaseArtifactManifest>(manifest_path);
  validateReleaseManifest(manifest);
  const entries = (await readdir(root)).sort();
  const expected_entries = [...expectedArtifactFiles(manifest.packages)];
  if (
    entries.length !== expected_entries.length ||
    entries.some((entry, index) => entry !== expected_entries[index])
  ) {
    throw new Error(
      `Release artifact directory must contain exactly: ${expected_entries.join(", ")}`,
    );
  }
  const source_packages = await load_source_packages();
  const source_versions = new Map(
    source_packages.map(({ manifest: source }) => [source.name, source.version] as const),
  );
  for (const artifact of manifest.packages) {
    const source_version = source_versions.get(artifact.name);
    if (source_version === undefined) {
      throw new Error(`Missing publishable workspace package ${artifact.name}`);
    }
    if (source_version !== artifact.version) {
      throw new Error(`${artifact.name} source version changed`);
    }
  }
  for (const artifact of manifest.packages) {
    const tarball_path = join(root, artifact.path);
    if (!(await path_exists(tarball_path))) {
      throw new Error(`Missing release tarball ${artifact.path}`);
    }
    const bytes = new Uint8Array(await readFile(tarball_path));
    if (bytes.byteLength !== artifact.bytes) throw new Error(`${artifact.name} byte size changed`);
    if (digest(bytes, "sha1", "hex") !== artifact.shasum) {
      throw new Error(`${artifact.name} shasum changed`);
    }
    if (`sha512-${digest(bytes, "sha512", "base64")}` !== artifact.integrity) {
      throw new Error(`${artifact.name} integrity changed`);
    }
    if (digest(bytes, "sha512", "hex") !== artifact.sha512) {
      throw new Error(`${artifact.name} sha512 changed`);
    }
    const archive_entries = (await run(["tar", "-tzf", tarball_path])).split("\n").filter(Boolean);
    const tar_files: string[] = [];
    for (const entry of archive_entries) {
      if (entry === "package" || entry === "package/") continue;
      if (!entry.startsWith("package/") || entry.includes("\\") || entry.includes("\0")) {
        throw new Error(`${artifact.name} contains malicious archive path ${entry}`);
      }
      const path = entry.slice("package/".length).replace(/\/$/, "");
      if (
        path.length === 0 ||
        path.startsWith("/") ||
        path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        throw new Error(`${artifact.name} contains malicious archive path ${entry}`);
      }
      tar_files.push(path);
    }
    tar_files.sort();
    if (new Set(tar_files).size !== tar_files.length) {
      throw new Error(`${artifact.name} archive contains duplicate paths`);
    }
    if (JSON.stringify(tar_files) !== JSON.stringify(artifact.files)) {
      throw new Error(`${artifact.name} packed file list changed`);
    }
    const verbose_entries = await run(["tar", "-tvzf", tarball_path]);
    if (verbose_entries.split("\n").some((line) => /^[lh]/.test(line))) {
      throw new Error(`${artifact.name} archive contains a link entry`);
    }
    const packed_manifest_text = await run(["tar", "-xOzf", tarball_path, "package/package.json"]);
    const packed_manifest = JSON.parse(packed_manifest_text) as PackageManifest;
    validate_packed_manifest(artifact, packed_manifest, source_versions);
  }
  return manifest;
}

async function ensure_empty_output(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  assertOutputDirectoryEmpty(await readdir(root));
}

/**
 * Packs already-built outputs using the release manifest and file policy.
 * Source directories default to the publishable workspace packages.
 */
export async function packBuiltPackages(
  artifactDirectory: string,
  sourceDirectories?: readonly string[],
): Promise<readonly PackedWorkspacePackage[]> {
  const output_root = resolve(artifactDirectory);
  await ensure_empty_output(output_root);
  const sources =
    sourceDirectories === undefined
      ? await load_source_packages()
      : await Promise.all(
          sourceDirectories.map(async (directory) => ({
            directory: resolve(directory),
            manifest: await readJson<PackageManifest>(join(directory, "package.json")),
          })),
        );
  const temporary_root = await mkdtemp(join(tmpdir(), "sheetwrite-package-assembly-"));
  try {
    const stage_root = join(temporary_root, "stage");
    const tarball_root = join(temporary_root, "tarballs");
    await Promise.all([mkdir(stage_root), mkdir(tarball_root)]);
    const versions = new Map(
      sources.map(({ manifest }) => [manifest.name, manifest.version] as const),
    );
    const packages: PackedWorkspacePackage[] = [];
    for (const source of sources) {
      const staged = await stage_package(source, stage_root, versions);
      const result = parse_pack_result(
        await run(
          ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", tarball_root],
          staged.root,
        ),
        source.manifest.name,
      );
      if (result.version !== source.manifest.version) {
        throw new Error(
          `${result.name} npm pack version changed to ${result.version}, expected ${source.manifest.version}`,
        );
      }
      const expected_filename = expected_tarball_name(result.name, result.version);
      if (result.filename !== expected_filename) {
        throw new Error(`${result.name} npm pack filename must be ${expected_filename}`);
      }
      const tarball_path = join(tarball_root, result.filename);
      const tarball_bytes = new Uint8Array(await readFile(tarball_path));
      const files = result.files.map((file) => file.path).sort();
      const artifact: ReleasePackageArtifact = {
        name: result.name,
        version: result.version,
        path: result.filename,
        bytes: result.size,
        unpackedBytes: result.unpackedSize,
        fileCount: files.length,
        files,
        shasum: result.shasum,
        integrity: result.integrity,
        sha512: digest(tarball_bytes, "sha512", "hex"),
        internalDependencies: staged.internalDependencies,
      };
      if (
        tarball_bytes.byteLength !== artifact.bytes ||
        digest(tarball_bytes, "sha1", "hex") !== artifact.shasum ||
        `sha512-${digest(tarball_bytes, "sha512", "base64")}` !== artifact.integrity
      ) {
        throw new Error(`${artifact.name} npm pack digest metadata does not match its tarball`);
      }
      const output_path = join(output_root, artifact.path);
      await cp(tarball_path, output_path);
      packages.push({ tarballPath: output_path, artifact, pack: result });
    }
    return packages;
  } catch (error) {
    await rm(output_root, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(temporary_root, { force: true, recursive: true });
  }
}

export type ReleaseArtifactMode = "verification" | "release";

export async function buildReleaseArtifacts(
  artifactDirectory: string,
  mode: ReleaseArtifactMode = "verification",
): Promise<ReleaseArtifactManifest> {
  const output_root = resolve(artifactDirectory);
  const status = await releaseTreeStatus();
  const dirty = releaseModeDirty(mode, status);
  await ensure_empty_output(output_root);
  const [source_commit, toolchain] = await Promise.all([
    run(["git", "rev-parse", "HEAD"]),
    assert_toolchain(),
  ]);
  await run(["bun", "run", "build:packages"]);

  const temporary_root = await mkdtemp(join(tmpdir(), "sheetwrite-release-artifacts-"));
  try {
    const packed = await packBuiltPackages(join(temporary_root, "tarballs"));
    const packages = packed.map(({ artifact }) => artifact);
    const manifest: ReleaseArtifactManifest = {
      schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      sourceCommit: source_commit,
      dirty,
      toolchain,
      buildCommand: RELEASE_BUILD_COMMAND,
      packages,
    };
    validateReleaseManifest(manifest);
    for (const { artifact, tarballPath: tarball_path } of packed) {
      await cp(tarball_path, join(output_root, artifact.path));
    }
    await writeFile(
      join(output_root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(manifest),
    );
    await verifyReleaseArtifacts(output_root);
    return manifest;
  } catch (error) {
    await rm(output_root, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(temporary_root, { force: true, recursive: true });
  }
}

async function cli(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "pack") {
    await packBuiltPackages(requiredOption(args, "--output"));
    return;
  }
  if (command === "prepare") {
    const mode = requiredOption(args, "--mode");
    if (mode !== "verification" && mode !== "release") {
      throw new Error("--mode must be verification or release");
    }
    const output = requiredOption(args, "--output");
    const manifest = await buildReleaseArtifacts(output, mode);
    console.log(
      `Prepared ${manifest.packages.length} canonical release tarballs in ${resolve(output)} (${mode})`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(output)}`);
    return;
  }
  if (command === "verify-input") {
    const artifacts = requiredOption(args, "--input");
    const manifest = await verifyReleaseArtifacts(artifacts);
    console.log(
      `Verified ${manifest.packages.length} canonical release tarballs from ${manifest.sourceCommit}`,
    );
    console.log(`Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifacts)}`);
    return;
  }
  throw new Error(
    "Usage: bun scripts/release-artifacts.ts pack --output <directory> | prepare --mode <verification|release> --output <directory> | verify-input --input <directory>",
  );
}

if (import.meta.main) await cli();
