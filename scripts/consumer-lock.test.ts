import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const packageVersions = new Map<string, string>(
  PUBLISHABLE_PACKAGE_ORDER.map((name) => {
    const directory = name.slice("@sheetwrite/".length);
    const { version } = JSON.parse(
      readFileSync(resolve(repositoryRoot, "packages", directory, "package.json"), "utf8"),
    ) as { version: string };
    return [name, version];
  }),
);
/** The canonical tarball reference for one workspace package at its own version. */
function isCanonicalTarball(name: string, reference: string | undefined): boolean {
  const version = packageVersions.get(name);
  if (version === undefined || reference === undefined) return false;
  const file = `sheetwrite-${name.slice("@sheetwrite/".length)}-${version}.tgz`;
  return reference === `file:artifacts/${file}` || reference === `file:../.packed/${file}`;
}
const registryVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const fixtureDirectories = [
  "test/consumer/package-lock.json",
  "test/release-locks/*/package-lock.json",
  "test/bundler-fixtures/*/package-lock.json",
].flatMap((pattern) => [...new Bun.Glob(pattern).scanSync(repositoryRoot)].map(dirname));

interface FixtureManifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface LockedPackage {
  readonly version?: string;
  readonly resolved?: string;
  readonly integrity?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface FixtureLock {
  readonly lockfileVersion?: number;
  readonly packages?: Readonly<Record<string, LockedPackage>>;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as T;
}

function dependencies(manifest: FixtureManifest): Readonly<Record<string, string>> {
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

describe("immutable release consumer locks", () => {
  it("commits a lockfile matching every release consumer manifest", () => {
    expect(fixtureDirectories.length).toBeGreaterThan(0);
    for (const directory of fixtureDirectories) {
      const manifest = json<FixtureManifest>(`${directory}/package.json`);
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      expect(lock.lockfileVersion).toBe(3);
      expect(lock.packages?.[""]?.dependencies ?? {}).toEqual(manifest.dependencies ?? {});
      expect(lock.packages?.[""]?.devDependencies ?? {}).toEqual(manifest.devDependencies ?? {});
      for (const [name, range] of Object.entries(dependencies(manifest))) {
        if (name.startsWith("@sheetwrite/")) {
          expect(isCanonicalTarball(name, range), `${directory} ${name}`).toBe(true);
        } else {
          expect(range, `${directory} ${name}`).toMatch(registryVersion);
        }
      }
    }
  });

  it("locks registry and canonical tarball bytes with integrity hashes", () => {
    const internalIntegrities = new Map<string, string>();
    for (const directory of fixtureDirectories) {
      const manifest = json<FixtureManifest>(`${directory}/package.json`);
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      for (const name of Object.keys(dependencies(manifest))) {
        if (name.startsWith("@sheetwrite/")) {
          expect(lock.packages?.[`node_modules/${name}`], `${directory} ${name}`).toBeDefined();
        }
      }
      for (const [path, entry] of Object.entries(lock.packages ?? {})) {
        if (path === "") continue;
        expect(entry.version).toMatch(registryVersion);
        if (entry.resolved?.startsWith("https://")) expect(entry.integrity).toMatch(/^sha512-/);
        if (!path.startsWith("node_modules/@sheetwrite/")) continue;
        const packageName = path.slice("node_modules/".length);
        expect(isCanonicalTarball(packageName, entry.resolved), `${directory} ${path}`).toBe(true);
        expect(entry.integrity).toMatch(/^sha512-/);
        const existing = internalIntegrities.get(packageName);
        if (existing === undefined) internalIntegrities.set(packageName, entry.integrity!);
        else expect(entry.integrity, `${directory} ${path}`).toBe(existing);
      }
    }
    // Every published package is installed from its canonical tarball by some consumer.
    expect([...internalIntegrities.keys()].sort()).toEqual([...PUBLISHABLE_PACKAGE_ORDER].sort());
  });

  it("rebinds copied canonical tarballs without changing registry entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-lock-"));
    try {
      const registryEntry = {
        version: "19.1.0",
        resolved: "https://registry.npmjs.org/react/-/react-19.1.0.tgz",
        integrity: "sha512-registry",
      };
      const lockPath = join(root, "package-lock.json");
      const tarballPath = join(root, "sheetwrite-core-0.2.0.tgz");
      await writeFile(tarballPath, "canonical bytes");
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({
          dependencies: {
            "@sheetwrite/core": "file:artifacts/sheetwrite-core-0.1.0.tgz",
            react: "19.1.0",
          },
        })}\n`,
      );
      await writeFile(
        lockPath,
        `${JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": {
              dependencies: {
                "@sheetwrite/core": "file:artifacts/sheetwrite-core-0.1.0.tgz",
                react: "19.1.0",
              },
            },
            "node_modules/@sheetwrite/core": {
              version: "0.1.0",
              resolved: "file:artifacts/sheetwrite-core-0.1.0.tgz",
              integrity: "sha512-stale",
            },
            "node_modules/react": registryEntry,
          },
        })}\n`,
      );
      await bindCanonicalTarballIntegrities(lockPath, new Map([["@sheetwrite/core", tarballPath]]));
      const rebound = JSON.parse(await readFile(lockPath, "utf8")) as FixtureLock;
      const reboundManifest = JSON.parse(
        await readFile(join(root, "package.json"), "utf8"),
      ) as FixtureManifest;
      const expectedIntegrity = `sha512-${createHash("sha512").update("canonical bytes").digest("base64")}`;
      expect(reboundManifest.dependencies?.["@sheetwrite/core"]).toEndWith(
        "sheetwrite-core-0.2.0.tgz",
      );
      expect(rebound.packages?.[""]?.dependencies?.["@sheetwrite/core"]).toEndWith(
        "sheetwrite-core-0.2.0.tgz",
      );
      expect(rebound.packages?.["node_modules/@sheetwrite/core"]).toMatchObject({
        version: "0.2.0",
        integrity: expectedIntegrity,
      });
      expect(rebound.packages?.["node_modules/@sheetwrite/core"]?.resolved).toEndWith(
        "sheetwrite-core-0.2.0.tgz",
      );
      expect(rebound.packages?.["node_modules/react"]).toEqual(registryEntry);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
