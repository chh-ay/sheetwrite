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

/**
 * The reviewed public surface: every export of every TypeScript entry point,
 * by name. The file holds one export per line, sorted by package, entry point
 * and name, so pull requests that add different exports change different
 * lines and merge cleanly.
 */
export interface PublicApiBaseline {
  schemaVersion: 3;
  manifestFormatVersion: PublicApiManifest["formatVersion"];
  intentionalExports: PublicApiBaselineEntry[];
}

const PUBLIC_API_BASELINE_PATH = "scripts/public-api-baseline.json";
const BASELINE_COMMAND = "bun run api:baseline";

export function publicApiEntryKey(packageName: string, entryPoint: string): string {
  return `${packageName}\0${entryPoint}`;
}

function invalidBaseline(reason: string): TypeError {
  return new TypeError(`Invalid public API baseline artifact: ${reason}`);
}

function parseBaselineEntry(entry: unknown): PublicApiBaselineEntry {
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
    throw invalidBaseline("an entry needs a package, an entry point and export names");
  }
  const names = entry.exports as string[];
  if (new Set(names).size !== names.length || names.join("\0") !== [...names].sort().join("\0")) {
    throw invalidBaseline(`${entry.package} ${entry.entryPoint} exports are not sorted and unique`);
  }
  return { package: entry.package, entryPoint: entry.entryPoint, exports: [...names] };
}

export function parsePublicApiBaseline(value: unknown): PublicApiBaseline {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 3 ||
    !("manifestFormatVersion" in value) ||
    value.manifestFormatVersion !== 2 ||
    !("intentionalExports" in value) ||
    !Array.isArray(value.intentionalExports)
  ) {
    throw invalidBaseline(
      "expected schemaVersion 3, manifestFormatVersion 2 and intentionalExports",
    );
  }
  const entries = value.intentionalExports.map(parseBaselineEntry);
  const keys = entries.map((entry) => publicApiEntryKey(entry.package, entry.entryPoint));
  if (new Set(keys).size !== keys.length || keys.join("\0") !== [...keys].sort().join("\0")) {
    throw invalidBaseline("entries are not sorted and unique by package and entry point");
  }
  return { schemaVersion: 3, manifestFormatVersion: 2, intentionalExports: entries };
}

/** The file text: two-space JSON, which puts every export on its own line. */
export function renderPublicApiBaseline(baseline: PublicApiBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/** Reads the baseline and rejects a file that is not in the one-export-per-line form. */
export async function readPublicApiBaseline(repositoryRoot: string): Promise<PublicApiBaseline> {
  const text = await readFile(join(repositoryRoot, PUBLIC_API_BASELINE_PATH), "utf8");
  const baseline = parsePublicApiBaseline(JSON.parse(text));
  if (renderPublicApiBaseline(baseline) !== text) {
    throw invalidBaseline(`not one export per line; run \`${BASELINE_COMMAND}\``);
  }
  return baseline;
}

/** The baseline that accepts the manifest's exports as they are. */
export function baselineFromManifest(manifest: PublicApiManifest): PublicApiBaseline {
  const entries = manifest.packages.flatMap((pkg) =>
    pkg.entryPoints
      .filter((entry) => entry.kind === "typescript" && entry.exports.length > 0)
      .map((entry) => ({
        package: pkg.name,
        entryPoint: entry.subpath,
        exports: entry.exports.map((apiExport) => apiExport.name).sort(),
      })),
  );
  entries.sort((left, right) =>
    publicApiEntryKey(left.package, left.entryPoint) <
    publicApiEntryKey(right.package, right.entryPoint)
      ? -1
      : 1,
  );
  return {
    schemaVersion: 3,
    manifestFormatVersion: manifest.formatVersion,
    intentionalExports: entries,
  };
}

export async function writePublicApiBaseline(
  repositoryRoot: string,
  manifest: PublicApiManifest,
): Promise<PublicApiBaseline> {
  const baseline = baselineFromManifest(manifest);
  const path = join(repositoryRoot, PUBLIC_API_BASELINE_PATH);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, renderPublicApiBaseline(baseline));
  await rename(temporaryPath, path);
  return baseline;
}

/**
 * Compares the built API with the reviewed list, by name: an export the list
 * does not hold, and a listed export the packages no longer have, are both
 * issues until the list is updated in the same change.
 */
export function checkIntentionalExports(
  manifest: PublicApiManifest,
  baseline: PublicApiBaseline,
): ApiIssue[] {
  const listed = new Map(
    baseline.intentionalExports.map((entry) => [
      publicApiEntryKey(entry.package, entry.entryPoint),
      entry,
    ]),
  );
  const built = baselineFromManifest(manifest).intentionalExports;
  const issues: ApiIssue[] = [];
  for (const entry of built) {
    const key = publicApiEntryKey(entry.package, entry.entryPoint);
    const reviewed = new Set(listed.get(key)?.exports ?? []);
    listed.delete(key);
    for (const name of entry.exports) {
      if (reviewed.delete(name)) continue;
      issues.push({
        code: "unlisted-export",
        message: `${entry.package} ${entry.entryPoint} exports ${name}, which ${PUBLIC_API_BASELINE_PATH} does not list; review it, then run \`${BASELINE_COMMAND}\``,
        package: entry.package,
        entryPoint: entry.entryPoint,
        symbol: name,
      });
    }
    for (const name of reviewed)
      issues.push(removedExportIssue(entry.package, entry.entryPoint, name));
  }
  for (const entry of listed.values()) {
    for (const name of entry.exports) {
      issues.push(removedExportIssue(entry.package, entry.entryPoint, name));
    }
  }
  return issues;
}

function removedExportIssue(packageName: string, entryPoint: string, name: string): ApiIssue {
  return {
    code: "removed-export",
    message: `${PUBLIC_API_BASELINE_PATH} lists ${packageName} ${entryPoint} ${name}, which the package no longer exports; review it, then run \`${BASELINE_COMMAND}\``,
    package: packageName,
    entryPoint,
    symbol: name,
  };
}
