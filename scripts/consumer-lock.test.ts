import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { installCanonicalTarballs, versionFreeTarballName } from "./release-lock-integrity.mjs";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const repository_root = resolve(import.meta.dir, "..");
const registry_version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const fixture_directories = [
  "test/consumer/package-lock.json",
  "test/release-locks/*/package-lock.json",
  "test/bundler-fixtures/*/package-lock.json",
].flatMap((pattern) => [...new Bun.Glob(pattern).scanSync(repository_root)].map(dirname));

/** The only references a fixture may use for a Sheetwrite package: a version-free tarball. */
function is_version_free_tarball(name: string, reference: string | undefined): boolean {
  const file = versionFreeTarballName(name);
  return reference === `file:artifacts/${file}` || reference === `file:../.packed/${file}`;
}

interface FixtureManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface LockedPackage {
  readonly version?: string;
  readonly resolved?: string;
  readonly integrity?: string;
  readonly license?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface FixtureLock {
  readonly lockfileVersion?: number;
  readonly packages?: Readonly<Record<string, LockedPackage>>;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repository_root, path), "utf8")) as T;
}

function dependencies(manifest: FixtureManifest): Readonly<Record<string, string>> {
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

describe("release consumer fixtures", () => {
  it("name Sheetwrite tarballs without a version, so a release never changes them", () => {
    expect(fixture_directories.length).toBeGreaterThan(0);
    const installed = new Set<string>();
    for (const directory of fixture_directories) {
      const manifest = json<FixtureManifest>(`${directory}/package.json`);
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      expect(lock.lockfileVersion).toBe(3);
      expect(lock.packages?.[""]?.dependencies ?? {}).toEqual(manifest.dependencies ?? {});
      expect(lock.packages?.[""]?.devDependencies ?? {}).toEqual(manifest.devDependencies ?? {});
      for (const [name, range] of Object.entries(dependencies(manifest))) {
        if (!name.startsWith("@sheetwrite/")) {
          expect(range, `${directory} ${name}`).toMatch(registry_version);
          continue;
        }
        expect(is_version_free_tarball(name, range), `${directory} ${name} ${range}`).toBe(true);
        // A placeholder: CI fills the version, integrity and dependencies from the tarball.
        expect(lock.packages?.[`node_modules/${name}`], `${directory} ${name}`).toEqual({
          resolved: range,
        });
        installed.add(name);
      }
      for (const path of Object.keys(lock.packages ?? {})) {
        if (path.includes("node_modules/@sheetwrite/")) {
          expect(path.startsWith("node_modules/@sheetwrite/"), `${directory} ${path}`).toBe(true);
        }
      }
    }
    // Every published package is installed from its canonical tarball by some consumer.
    expect([...installed].sort()).toEqual([...PUBLISHABLE_PACKAGE_ORDER].sort());
  });

  it("pin each third-party package with one registry version and integrity", () => {
    const integrities = new Map<string, string>();
    for (const directory of fixture_directories) {
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      for (const [path, entry] of Object.entries(lock.packages ?? {})) {
        if (path === "" || path.startsWith("node_modules/@sheetwrite/")) continue;
        const label = `${directory} ${path}`;
        expect(entry.version, label).toMatch(registry_version);
        for (const field of [entry.dependencies, entry.peerDependencies]) {
          for (const name of Object.keys(field ?? {})) {
            expect(name.startsWith("@sheetwrite/"), `${label} ${name}`).toBe(false);
          }
        }
        if (!entry.resolved?.startsWith("https://")) continue;
        expect(entry.integrity, label).toMatch(/^sha512-/);
        const key = `${path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)}@${entry.version}`;
        const existing = integrities.get(key);
        if (existing === undefined) integrities.set(key, entry.integrity!);
        else expect(entry.integrity, `${label} ${key}`).toBe(existing);
      }
    }
    expect(integrities.size).toBeGreaterThan(0);
  });

  it("fills a placeholder from its canonical tarball, peer ranges included", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-lock-"));
    try {
      const manifest = {
        name: "@sheetwrite/formula-assist",
        version: "0.2.0",
        license: "MIT",
        peerDependencies: { "@sheetwrite/core": "0.2.0" },
      };
      const tarball_path = join(root, "sheetwrite-formula-assist-0.2.0.tgz");
      await mkdir(join(root, "source/package"), { recursive: true });
      await writeFile(join(root, "source/package/package.json"), JSON.stringify(manifest));
      const tar = Bun.spawnSync([
        "tar",
        "-czf",
        tarball_path,
        "-C",
        join(root, "source"),
        "package",
      ]);
      expect(tar.exitCode).toBe(0);
      const registry_entry = {
        version: "19.1.0",
        resolved: "https://registry.npmjs.org/react/-/react-19.1.0.tgz",
        integrity: "sha512-registry",
      };
      const reference = "file:artifacts/sheetwrite-formula-assist.tgz";
      const lock_path = join(root, "fixture/package-lock.json");
      await mkdir(dirname(lock_path), { recursive: true });
      await writeFile(
        lock_path,
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { dependencies: { "@sheetwrite/formula-assist": reference, react: "19.1.0" } },
            "node_modules/@sheetwrite/formula-assist": { resolved: reference },
            "node_modules/react": registry_entry,
          },
        }),
      );

      const installed = await installCanonicalTarballs(
        lock_path,
        new Map([["@sheetwrite/formula-assist", tarball_path]]),
      );

      expect(installed).toEqual(["@sheetwrite/formula-assist"]);
      const bytes = await readFile(tarball_path);
      expect(await readFile(join(root, "fixture/artifacts/sheetwrite-formula-assist.tgz"))).toEqual(
        bytes,
      );
      const bound = JSON.parse(await readFile(lock_path, "utf8")) as FixtureLock;
      expect(bound.packages?.["node_modules/@sheetwrite/formula-assist"]).toEqual({
        version: "0.2.0",
        resolved: reference,
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
        license: "MIT",
        peerDependencies: { "@sheetwrite/core": "0.2.0" },
      });
      expect(bound.packages?.["node_modules/react"]).toEqual(registry_entry);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
