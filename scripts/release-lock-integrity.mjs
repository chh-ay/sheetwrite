import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SHEETWRITE_ENTRY = "node_modules/@sheetwrite/";
/** Manifest fields npm copies from a package into its lockfile entry. */
const LOCKED_MANIFEST_FIELDS = [
  "license",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bin",
  "engines",
  "os",
  "cpu",
];

/**
 * The file name a release consumer fixture installs a package from, such as
 * `sheetwrite-core.tgz`. It has no version, so the fixtures never change
 * between releases.
 *
 * @param {string} packageName
 */
export function versionFreeTarballName(packageName) {
  return `${packageName.replace(/^@/, "").replaceAll("/", "-")}.tgz`;
}

/**
 * Installs canonical tarballs into a copied release consumer fixture.
 *
 * A committed fixture lock pins only third-party packages. Each Sheetwrite
 * package has a placeholder entry with only `resolved`, a version-free
 * `file:` path. For every placeholder, this copies the canonical tarball to
 * that path and fills the entry from the tarball: version, integrity, and the
 * manifest fields npm locks (dependencies and peer ranges included).
 *
 * @param {string} lockPath
 * @param {ReadonlyMap<string, string>} tarballs package name to canonical tarball path
 * @returns {Promise<string[]>} the installed package names
 */
export async function installCanonicalTarballs(lockPath, tarballs) {
  const fixtureRoot = dirname(lockPath);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (lock === null || typeof lock !== "object" || typeof lock.packages !== "object") {
    throw new Error(`${lockPath} has no npm package graph`);
  }
  const installed = [];
  for (const [packagePath, placeholder] of Object.entries(lock.packages)) {
    if (!packagePath.startsWith(SHEETWRITE_ENTRY)) continue;
    const packageName = packagePath.slice("node_modules/".length);
    const tarballPath = tarballs.get(packageName);
    if (tarballPath === undefined) {
      throw new Error(`${lockPath} installs ${packageName}, which has no canonical tarball`);
    }
    const resolved = placeholder?.resolved;
    if (
      Object.keys(placeholder).join() !== "resolved" ||
      typeof resolved !== "string" ||
      !resolved.startsWith("file:") ||
      !resolved.endsWith(`/${versionFreeTarballName(packageName)}`)
    ) {
      throw new Error(
        `${lockPath} ${packagePath} must be a placeholder with only a version-free resolved path`,
      );
    }
    const target = join(fixtureRoot, resolved.slice("file:".length));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(tarballPath, target);
    const [bytes, { stdout }] = await Promise.all([
      readFile(tarballPath),
      run("tar", ["-xOzf", tarballPath, "package/package.json"], { maxBuffer: 1 << 20 }),
    ]);
    const manifest = JSON.parse(stdout);
    if (manifest.name !== packageName) {
      throw new Error(`${tarballPath} holds ${manifest.name}, expected ${packageName}`);
    }
    const entry = {
      version: manifest.version,
      resolved,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
    for (const field of LOCKED_MANIFEST_FIELDS) {
      if (manifest[field] !== undefined) entry[field] = manifest[field];
    }
    lock.packages[packagePath] = entry;
    installed.push(packageName);
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return installed;
}
