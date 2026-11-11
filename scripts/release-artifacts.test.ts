import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertOutputDirectoryEmpty,
  RELEASE_ARTIFACT_MANIFEST,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  RELEASE_BUILD_COMMAND,
  REQUIRED_PACKAGE_FILES,
  type ReleaseArtifactManifest,
  releaseModeDirty,
  releaseTreeStatus,
  packBuiltPackages,
  serializeReleaseManifest,
  validateReleaseManifest,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
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

type PackageArtifact = ReleaseArtifactManifest["packages"][number];

// Fixture tarballs must carry the workspace's own version; verification rejects any other.
const { version: TEST_RELEASE_VERSION } = JSON.parse(
  readFileSync(join(import.meta.dir, "../packages/core/package.json"), "utf8"),
) as { version: string };

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-artifact-test-"));
  temporaryRoots.push(root);
  return root;
}

function tarballName(name: string): string {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${TEST_RELEASE_VERSION}.tgz`;
}

function manifest(packages?: PackageArtifact[]): ReleaseArtifactManifest {
  return {
    schemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    sourceCommit: "a".repeat(40),
    dirty: false,
    toolchain: {
      bun: BUN_VERSION,
      node: NODE_VERSION,
      npm: NPM_VERSION,
      rust: RUST_VERSION,
      wasmTarget: WASM_TARGET,
      wasmPack: WASM_PACK_VERSION,
      cargoAudit: CARGO_AUDIT_VERSION,
      cargoLlvmCov: CARGO_LLVM_COV_VERSION,
    },
    buildCommand: RELEASE_BUILD_COMMAND,
    packages:
      packages ??
      PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
        name,
        version: TEST_RELEASE_VERSION,
        path: tarballName(name),
        bytes: 1,
        unpackedBytes: 1,
        fileCount: 1,
        files: ["package.json"],
        shasum: "b".repeat(40),
        integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
        sha512: "c".repeat(128),
        internalDependencies: {},
      })),
  };
}

interface TarballOptions {
  readonly packedName?: string;
  readonly manifest?: Record<string, unknown>;
  readonly maliciousPath?: boolean;
}

async function writeTarball(
  root: string,
  artifactName: string,
  options: TarballOptions = {},
): Promise<PackageArtifact> {
  const stageRoot = join(root, `stage-${artifactName.replaceAll("/", "-")}`);
  const packageRoot = join(stageRoot, "package");
  await mkdir(packageRoot, { recursive: true });
  const packedManifestValue: Record<string, unknown> = {
    name: options.packedName ?? artifactName,
    version: TEST_RELEASE_VERSION,
    ...options.manifest,
  };
  const packedManifest = `${JSON.stringify(packedManifestValue)}\n`;
  await writeFile(join(packageRoot, "package.json"), packedManifest);
  const contentFiles = REQUIRED_PACKAGE_FILES[artifactName] ?? [];
  for (const file of contentFiles) {
    await mkdir(join(packageRoot, file, ".."), { recursive: true });
    await writeFile(join(packageRoot, file), `${file}\n`);
  }
  const files = ["package.json", ...contentFiles].sort();

  const path = tarballName(artifactName);
  const packed = Bun.spawnSync(
    [
      "tar",
      "-czf",
      join(root, path),
      ...(options.maliciousPath ? ["--transform=s#^package/README.md$#../escape#"] : []),
      "-C",
      stageRoot,
      ...files.map((file) => `package/${file}`),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  await rm(stageRoot, { force: true, recursive: true });
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const bytes = new Uint8Array(await readFile(join(root, path)));
  const dependencies = (packedManifestValue.dependencies ?? {}) as Record<string, string>;
  return {
    name: artifactName,
    version: TEST_RELEASE_VERSION,
    path,
    bytes: bytes.byteLength,
    unpackedBytes:
      Buffer.byteLength(packedManifest) +
      contentFiles.reduce((sum, file) => sum + Buffer.byteLength(`${file}\n`), 0),
    fileCount: files.length,
    files,
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    sha512: createHash("sha512").update(bytes).digest("hex"),
    internalDependencies: Object.fromEntries(
      Object.entries(dependencies).filter(([name]) =>
        (PUBLISHABLE_PACKAGE_ORDER as readonly string[]).includes(name),
      ),
    ),
  };
}

/** Writes every publishable tarball, the first one with `first` options, and the manifest. */
async function writeRelease(first: TarballOptions = {}): Promise<{
  root: string;
  packages: PackageArtifact[];
}> {
  const root = await temporaryDirectory();
  const packages = await Promise.all(
    PUBLISHABLE_PACKAGE_ORDER.map((name, index) =>
      writeTarball(root, name, index === 0 ? first : {}),
    ),
  );
  await writeFile(join(root, RELEASE_ARTIFACT_MANIFEST), serializeReleaseManifest(manifest(packages)));
  return { root, packages };
}

describe("canonical release artifacts", () => {
  it("rejects source maps in every published package", () => {
    for (const name of PUBLISHABLE_PACKAGE_ORDER) {
      for (const path of ["dist/index.js.map", "dist/index.d.ts.map"]) {
        const base = manifest();
        const files = [path, "package.json"];
        const packages = base.packages.map((artifact) =>
          artifact.name === name ? { ...artifact, fileCount: files.length, files } : artifact,
        );
        expect(() => validateReleaseManifest({ ...base, packages }), `${name} ${path}`).toThrow(
          `${name} published files must exclude source maps`,
        );
      }
    }
  });

  it("assembles built outputs into a real tarball using release manifest policy", async () => {
    const root = await temporaryDirectory();
    const source = join(root, "source");
    await mkdir(join(source, "dist"), { recursive: true });
    const sourceManifest = {
      name: "@sheetwrite/core",
      version: "1.2.3",
      files: ["dist/*.js"],
      dependencies: { "@sheetwrite/core": "workspace:*", registry: "^9.0.0" },
      devDependencies: { "@sheetwrite/core": "workspace:^" },
      peerDependencies: { "@sheetwrite/core": "workspace:~" },
      scripts: { prepublishOnly: "exit 1", check: "exit 0" },
    };
    await writeFile(join(source, "package.json"), JSON.stringify(sourceManifest));
    await writeFile(join(source, "dist/index.js"), "export const answer = 42;\n");
    await writeFile(join(source, "dist/private.txt"), "not published");
    await writeFile(join(source, "README.md"), "Fixture readme\n");
    await writeFile(join(source, "LICENSE"), "Fixture package license\n");
    const [packed] = await packBuiltPackages(join(root, "packed"), [source]);
    if (packed === undefined) throw new Error("Expected the fixture tarball");
    expect(packed.artifact.path).toBe("sheetwrite-core-1.2.3.tgz");
    expect(packed.artifact.files).toEqual(["LICENSE", "README.md", "dist/index.js", "package.json"]);
    const extract = (path: string): string => {
      const result = Bun.spawnSync(["tar", "-xOzf", packed.tarballPath, `package/${path}`]);
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString();
    };
    expect(JSON.parse(extract("package.json"))).toEqual({
      ...sourceManifest,
      dependencies: { "@sheetwrite/core": "1.2.3", registry: "^9.0.0" },
      devDependencies: { "@sheetwrite/core": "1.2.3" },
      peerDependencies: { "@sheetwrite/core": "1.2.3" },
      scripts: { check: "exit 0" },
    });
    expect(extract("dist/index.js")).toBe("export const answer = 42;\n");

    await writeFile(
      join(source, "package.json"),
      JSON.stringify({ ...sourceManifest, dependencies: { "@sheetwrite/missing": "workspace:*" } }),
    );
    await expect(packBuiltPackages(join(root, "missing"), [source])).rejects.toThrow(
      "No release version found for @sheetwrite/missing",
    );
  });

  it("enforces release cleanliness, including untracked sources, and empty output", async () => {
    expect(releaseModeDirty("verification", "")).toBe(false);
    expect(releaseModeDirty("verification", " M package.json\n")).toBe(true);
    expect(() => releaseModeDirty("release", "")).not.toThrow();
    expect(() => releaseModeDirty("release", " M package.json\n")).toThrow("Release tree is dirty");
    expect(() => assertOutputDirectoryEmpty([])).not.toThrow();
    expect(() => assertOutputDirectoryEmpty(["stale.tgz"])).toThrow("not empty");

    const root = await temporaryDirectory();
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", ...args], { cwd: root });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    };
    git("init", "--quiet");
    await writeFile(join(root, ".gitignore"), "dist/\n");
    git("add", ".gitignore");
    git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "init");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/index.js"), "");
    expect(await releaseTreeStatus(root)).toBe("");

    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/extra.ts"), "export const extra = 1;\n");
    const status = await releaseTreeStatus(root);
    expect(() => releaseModeDirty("release", status)).toThrow("Release tree is dirty");
  });

  it("rejects duplicate, unknown, and out-of-order package identities", () => {
    const [first, second] = manifest().packages;
    if (first === undefined || second === undefined) throw new Error("manifest has no packages");
    for (const [packages, message] of [
      [[first, { ...second, name: first.name }], "Duplicate release package"],
      [[{ ...first, name: "@sheetwrite/unknown" }], "Unknown release package @sheetwrite/unknown"],
      [[second, first], "dependency order"],
    ] as const) {
      expect(() => validateReleaseManifest(manifest([...packages]))).toThrow(message);
    }
  });

  it("rejects an absent package dependency at the wrong source version", async () => {
    const root = await temporaryDirectory();
    const react = await writeTarball(root, "@sheetwrite/react", {
      manifest: { dependencies: { "@sheetwrite/core": "0.1.0" } },
    });
    await writeFile(join(root, RELEASE_ARTIFACT_MANIFEST), serializeReleaseManifest(manifest([react])));
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      `@sheetwrite/react internal dependency @sheetwrite/core must be ${TEST_RELEASE_VERSION}`,
    );
  });

  it("round-trips tarballs and detects checksum and packed-identity tampering", async () => {
    const { root, packages } = await writeRelease();
    expect(await verifyReleaseArtifacts(root)).toEqual(manifest(packages));

    const [first, ...rest] = packages;
    if (first === undefined) throw new Error("release has no packages");
    const tarballPath = join(root, first.path);
    const originalBytes = new Uint8Array(await readFile(tarballPath));
    const tamperedBytes = originalBytes.slice();
    tamperedBytes[tamperedBytes.length - 1] = (tamperedBytes.at(-1) ?? 0) ^ 1;
    await writeFile(tarballPath, tamperedBytes);
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(`${first.name} shasum changed`);

    const wrongIdentity = await writeTarball(root, first.name, { packedName: "@sheetwrite/tampered" });
    await writeFile(
      join(root, RELEASE_ARTIFACT_MANIFEST),
      serializeReleaseManifest(manifest([wrongIdentity, ...rest])),
    );
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      `${first.name} packed manifest identity changed`,
    );
  });

  it.each<[string, TarballOptions, string]>([
    ["a lifecycle script", { manifest: { scripts: { prepublishOnly: "exit 1" } } }, "retains prepublishOnly"],
    ["a missing export target", { manifest: { exports: "./Missing.js" } }, "package target does not exist with exact case"],
    // README.md is packed; a target that differs only by case must not resolve to it.
    ["an export target of another case", { manifest: { exports: "./readme.md" } }, "package target does not exist with exact case"],
    ["a malicious archive path", { maliciousPath: true }, "malicious archive path"],
  ])("rejects a tarball with %s", async (_label, first, message) => {
    const { root } = await writeRelease(first);
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(message);
  });

  it("rejects a manifest whose canonical tarballs are missing", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, RELEASE_ARTIFACT_MANIFEST), serializeReleaseManifest(manifest()));
    await expect(verifyReleaseArtifacts(root)).rejects.toThrow(
      "Release artifact directory must contain exactly",
    );
  });
});
