import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ApiIssue, PublicApiManifest } from "./public-api.js";

export function validateManifest(value: unknown): ApiIssue[] {
  const malformed = (message: string): ApiIssue[] => [
    { code: "malformed-report", message: `Malformed public API report: ${message}` },
  ];
  if (value === null || typeof value !== "object") return malformed("root is not an object");
  const report = value as Partial<PublicApiManifest>;
  if (report.formatVersion !== 2) return malformed("formatVersion is not 2");
  if (!Array.isArray(report.packages) || report.packages.length === 0) {
    return malformed("packages is missing or empty");
  }
  for (const pkg of report.packages) {
    if (typeof pkg?.name !== "string" || pkg.name.length === 0)
      return malformed("package name missing");
    if (!Array.isArray(pkg.entryPoints) || pkg.entryPoints.length === 0) {
      return malformed(`${pkg.name} entryPoints is missing or empty`);
    }
    for (const entry of pkg.entryPoints) {
      if (typeof entry.subpath !== "string" || !Array.isArray(entry.exports)) {
        return malformed(`${pkg.name} contains a partial entry point`);
      }
      if (
        entry.classification !== "supported" &&
        entry.classification !== "internal" &&
        entry.classification !== "asset" &&
        entry.classification !== "test-only"
      ) {
        return malformed(`${pkg.name} ${entry.subpath} has no valid classification`);
      }
      const names = new Set<string>();
      for (const apiExport of entry.exports) {
        if (
          typeof apiExport?.name !== "string" ||
          typeof apiExport.kind !== "string" ||
          typeof apiExport.signature !== "string" ||
          !Array.isArray(apiExport.owners) ||
          typeof apiExport.source !== "string" ||
          !Array.isArray(apiExport.jsDocTags) ||
          typeof apiExport.documentation !== "string" ||
          !Array.isArray(apiExport.memberDocs) ||
          apiExport.memberDocs.some(
            (member) =>
              typeof member?.name !== "string" || typeof member.documentation !== "string",
          )
        ) {
          return malformed(`${pkg.name} ${entry.subpath} contains a partial export`);
        }
        if (names.has(apiExport.name))
          return malformed(`${pkg.name} ${entry.subpath} repeats ${apiExport.name}`);
        names.add(apiExport.name);
      }
    }
  }
  return [];
}
export interface PublicApiBaselineEntry {
  package: string;
  entryPoint: string;
  exports: string[];
}

export interface PublicApiBaseline {
  schemaVersion: 2;
  manifestFormatVersion: PublicApiManifest["formatVersion"];
  sha256: string;
  /** Reviewed public intent; baseline refreshes preserve this list rather than accepting new exports. */
  intentionalExports: PublicApiBaselineEntry[];
}

const PUBLIC_API_BASELINE_PATH = "scripts/public-api-baseline.json";
export const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|svelte|vue)$/;
export const IGNORED_SOURCE_DIRECTORIES: Readonly<Record<string, true>> = {
  ".astro": true,
  ".git": true,
  ".vercel": true,
  coverage: true,
  dist: true,
  node_modules: true,
  pkg: true,
  target: true,
};

export function publicApiEntryKey(packageName: string, entryPoint: string): string {
  return `${packageName}\0${entryPoint}`;
}

export function publicApiDigest(manifest: PublicApiManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export function parsePublicApiBaseline(value: unknown): PublicApiBaseline {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 2 ||
    !("manifestFormatVersion" in value) ||
    value.manifestFormatVersion !== 2 ||
    !("sha256" in value) ||
    typeof value.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    !("intentionalExports" in value) ||
    !Array.isArray(value.intentionalExports)
  ) {
    throw new TypeError("Invalid public API baseline artifact");
  }
  const entries: PublicApiBaselineEntry[] = [];
  for (const entry of value.intentionalExports) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("package" in entry) ||
      typeof entry.package !== "string" ||
      !("entryPoint" in entry) ||
      typeof entry.entryPoint !== "string" ||
      !("exports" in entry) ||
      !Array.isArray(entry.exports) ||
      entry.exports.some((name: unknown) => typeof name !== "string")
    ) {
      throw new TypeError("Invalid public API baseline artifact");
    }
    const names = entry.exports as string[];
    if (new Set(names).size !== names.length || names.join("\0") !== [...names].sort().join("\0")) {
      throw new TypeError("Invalid public API baseline artifact");
    }
    entries.push({ package: entry.package, entryPoint: entry.entryPoint, exports: [...names] });
  }
  const keys = entries.map((entry) => publicApiEntryKey(entry.package, entry.entryPoint));
  if (new Set(keys).size !== keys.length || keys.join("\0") !== [...keys].sort().join("\0")) {
    throw new TypeError("Invalid public API baseline artifact");
  }
  return {
    schemaVersion: 2,
    manifestFormatVersion: 2,
    sha256: value.sha256,
    intentionalExports: entries,
  };
}

export async function readPublicApiBaseline(repositoryRoot: string): Promise<PublicApiBaseline> {
  const path = join(repositoryRoot, PUBLIC_API_BASELINE_PATH);
  return parsePublicApiBaseline(JSON.parse(await readFile(path, "utf8")));
}

export async function writePublicApiBaseline(
  repositoryRoot: string,
  manifest: PublicApiManifest,
): Promise<PublicApiBaseline> {
  const previous = await readPublicApiBaseline(repositoryRoot);
  const baseline: PublicApiBaseline = {
    ...previous,
    manifestFormatVersion: manifest.formatVersion,
    sha256: publicApiDigest(manifest),
  };
  const path = join(repositoryRoot, PUBLIC_API_BASELINE_PATH);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(baseline, null, 2)}\n`);
  await rename(temporaryPath, path);
  return baseline;
}

export function checkManifestBaseline(manifest: PublicApiManifest, expected: string): ApiIssue[] {
  const actual = publicApiDigest(manifest);
  return actual === expected
    ? []
    : [
        {
          code: "manifest-drift",
          message: `Public API manifest digest changed: expected ${expected}, received ${actual}`,
        },
      ];
}
