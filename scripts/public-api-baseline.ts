import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ApiExport, ApiIssue, PublicApiManifest } from "./public-api.js";

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
      for (const api_export of entry.exports) {
        if (
          typeof api_export?.name !== "string" ||
          typeof api_export.kind !== "string" ||
          typeof api_export.signature !== "string" ||
          !Array.isArray(api_export.owners) ||
          typeof api_export.source !== "string" ||
          !Array.isArray(api_export.jsDocTags) ||
          typeof api_export.documentation !== "string" ||
          !Array.isArray(api_export.memberDocs) ||
          api_export.memberDocs.some(
            (member) =>
              typeof member?.name !== "string" || typeof member.documentation !== "string",
          )
        ) {
          return malformed(`${pkg.name} ${entry.subpath} contains a partial export`);
        }
        if (names.has(api_export.name))
          return malformed(`${pkg.name} ${entry.subpath} repeats ${api_export.name}`);
        names.add(api_export.name);
      }
    }
  }
  return [];
}
/**
 * The reviewed public surface: every export of every TypeScript entry point,
 * keyed `package#entryPoint#name`, with a short digest of its kind and
 * declaration text. The file holds one export per line, sorted by key, so
 * pull requests that add or change different exports change different lines
 * and merge cleanly, and a changed signature shows as its own changed line.
 */
export interface PublicApiBaseline {
  schemaVersion: 4;
  manifestFormatVersion: PublicApiManifest["formatVersion"];
  exports: Record<string, string>;
}

const PUBLIC_API_BASELINE_PATH = "scripts/public-api-baseline.json";
const BASELINE_COMMAND = "bun run api:baseline";
const SIGNATURE_DIGEST_LENGTH = 12;
const SIGNATURE_DIGEST = new RegExp(`^[0-9a-f]{${SIGNATURE_DIGEST_LENGTH}}$`);

function invalid_baseline(reason: string): TypeError {
  return new TypeError(`Invalid public API baseline artifact: ${reason}`);
}

/** The baseline key of one export: `package#entryPoint#name`. */
export function publicApiExportKey(packageName: string, entryPoint: string, name: string): string {
  return `${packageName}#${entryPoint}#${name}`;
}

/** Short digest of an export's kind and declaration text; documentation does not count. */
export function signatureDigest(apiExport: Pick<ApiExport, "kind" | "signature">): string {
  return createHash("sha256")
    .update(`${apiExport.kind}\n${apiExport.signature}`)
    .digest("hex")
    .slice(0, SIGNATURE_DIGEST_LENGTH);
}

export function parsePublicApiBaseline(value: unknown): PublicApiBaseline {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 4 ||
    !("manifestFormatVersion" in value) ||
    value.manifestFormatVersion !== 2 ||
    !("exports" in value) ||
    typeof value.exports !== "object" ||
    value.exports === null ||
    Array.isArray(value.exports)
  ) {
    throw invalid_baseline("expected schemaVersion 4, manifestFormatVersion 2 and exports");
  }
  const exports: Record<string, string> = {};
  for (const [key, digest] of Object.entries(value.exports)) {
    if (
      key.split("#").length !== 3 ||
      typeof digest !== "string" ||
      !SIGNATURE_DIGEST.test(digest)
    ) {
      throw invalid_baseline(`${key} needs a package#entryPoint#name key and a signature digest`);
    }
    exports[key] = digest;
  }
  const keys = Object.keys(exports);
  if (keys.join("\0") !== [...keys].sort().join("\0")) {
    throw invalid_baseline("exports are not sorted by key");
  }
  return { schemaVersion: 4, manifestFormatVersion: 2, exports };
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
    throw invalid_baseline(`not one export per line; run \`${BASELINE_COMMAND}\``);
  }
  return baseline;
}

/** The baseline that accepts the manifest's exports and signatures as they are. */
export function baselineFromManifest(manifest: PublicApiManifest): PublicApiBaseline {
  const entries: [string, string][] = [];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      if (entry.kind !== "typescript") continue;
      for (const api_export of entry.exports) {
        entries.push([
          publicApiExportKey(pkg.name, entry.subpath, api_export.name),
          signatureDigest(api_export),
        ]);
      }
    }
  }
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return {
    schemaVersion: 4,
    manifestFormatVersion: manifest.formatVersion,
    exports: Object.fromEntries(entries),
  };
}

export async function writePublicApiBaseline(
  repositoryRoot: string,
  manifest: PublicApiManifest,
): Promise<PublicApiBaseline> {
  const baseline = baselineFromManifest(manifest);
  const path = join(repositoryRoot, PUBLIC_API_BASELINE_PATH);
  const temporary_path = `${path}.tmp`;
  await writeFile(temporary_path, renderPublicApiBaseline(baseline));
  await rename(temporary_path, path);
  return baseline;
}

function baseline_issue(code: ApiIssue["code"], key: string, problem: string): ApiIssue {
  const [package_name = "", entry_point = "", symbol = ""] = key.split("#");
  return {
    code,
    message: `${package_name} ${entry_point} ${symbol} ${problem}; review it, then run \`${BASELINE_COMMAND}\``,
    package: package_name,
    entryPoint: entry_point,
    symbol,
  };
}

/**
 * Compares the built API with the reviewed baseline: an export the baseline
 * does not list, a listed export the packages no longer have, and an export
 * whose declaration changed are all issues until the baseline is updated in
 * the same change.
 */
export function checkPublicApiBaseline(
  manifest: PublicApiManifest,
  baseline: PublicApiBaseline,
): ApiIssue[] {
  const built = baselineFromManifest(manifest).exports;
  const issues: ApiIssue[] = [];
  for (const [key, digest] of Object.entries(built)) {
    const reviewed = baseline.exports[key];
    if (reviewed === undefined) {
      issues.push(
        baseline_issue(
          "unlisted-export",
          key,
          `is exported but ${PUBLIC_API_BASELINE_PATH} does not list it`,
        ),
      );
    } else if (reviewed !== digest) {
      issues.push(
        baseline_issue(
          "changed-signature",
          key,
          `changed its declaration (${reviewed} -> ${digest})`,
        ),
      );
    }
  }
  for (const key of Object.keys(baseline.exports)) {
    if (built[key] === undefined) {
      issues.push(
        baseline_issue(
          "removed-export",
          key,
          `is listed in ${PUBLIC_API_BASELINE_PATH} but no longer exported`,
        ),
      );
    }
  }
  return issues;
}
