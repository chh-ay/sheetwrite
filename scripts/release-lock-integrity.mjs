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
  const fixture_root = dirname(lockPath);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (lock === null || typeof lock !== "object" || typeof lock.packages !== "object") {
    throw new Error(`${lockPath} has no npm package graph`);
  }
  const installed = [];
  for (const [package_path, placeholder] of Object.entries(lock.packages)) {
    if (!package_path.startsWith(SHEETWRITE_ENTRY)) continue;
    const package_name = package_path.slice("node_modules/".length);
    const tarball_path = tarballs.get(package_name);
    if (tarball_path === undefined) {
      throw new Error(`${lockPath} installs ${package_name}, which has no canonical tarball`);
    }
    const resolved = placeholder?.resolved;
    if (
      Object.keys(placeholder).join() !== "resolved" ||
      typeof resolved !== "string" ||
      !resolved.startsWith("file:") ||
      !resolved.endsWith(`/${versionFreeTarballName(package_name)}`)
    ) {
      throw new Error(
        `${lockPath} ${package_path} must be a placeholder with only a version-free resolved path`,
      );
    }
    const target = join(fixture_root, resolved.slice("file:".length));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(tarball_path, target);
    const [bytes, { stdout }] = await Promise.all([
      readFile(tarball_path),
      run("tar", ["-xOzf", tarball_path, "package/package.json"], { maxBuffer: 1 << 20 }),
    ]);
    const manifest = JSON.parse(stdout);
    if (manifest.name !== package_name) {
      throw new Error(`${tarball_path} holds ${manifest.name}, expected ${package_name}`);
    }
    const entry = {
      version: manifest.version,
      resolved,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
    for (const field of LOCKED_MANIFEST_FIELDS) {
      if (manifest[field] !== undefined) entry[field] = manifest[field];
    }
    lock.packages[package_path] = entry;
    installed.push(package_name);
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return installed;
}
