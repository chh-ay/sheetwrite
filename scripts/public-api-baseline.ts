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

function invalidBaseline(reason: string): TypeError {
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
    throw invalidBaseline("expected schemaVersion 4, manifestFormatVersion 2 and exports");
  }
  const exports: Record<string, string> = {};
  for (const [key, digest] of Object.entries(value.exports)) {
    if (
      key.split("#").length !== 3 ||
      typeof digest !== "string" ||
      !SIGNATURE_DIGEST.test(digest)
    ) {
      throw invalidBaseline(`${key} needs a package#entryPoint#name key and a signature digest`);
    }
    exports[key] = digest;
  }
  const keys = Object.keys(exports);
  if (keys.join("\0") !== [...keys].sort().join("\0")) {
    throw invalidBaseline("exports are not sorted by key");
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
    throw invalidBaseline(`not one export per line; run \`${BASELINE_COMMAND}\``);
  }
  return baseline;
}

/** The baseline that accepts the manifest's exports and signatures as they are. */
export function baselineFromManifest(manifest: PublicApiManifest): PublicApiBaseline {
  const entries: [string, string][] = [];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      if (entry.kind !== "typescript") continue;
      for (const apiExport of entry.exports) {
        entries.push([
          publicApiExportKey(pkg.name, entry.subpath, apiExport.name),
          signatureDigest(apiExport),
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
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, renderPublicApiBaseline(baseline));
  await rename(temporaryPath, path);
  return baseline;
}

function baselineIssue(code: ApiIssue["code"], key: string, problem: string): ApiIssue {
  const [packageName = "", entryPoint = "", symbol = ""] = key.split("#");
  return {
    code,
    message: `${packageName} ${entryPoint} ${symbol} ${problem}; review it, then run \`${BASELINE_COMMAND}\``,
    package: packageName,
    entryPoint,
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
        baselineIssue(
          "unlisted-export",
          key,
          `is exported but ${PUBLIC_API_BASELINE_PATH} does not list it`,
        ),
      );
    } else if (reviewed !== digest) {
      issues.push(
        baselineIssue(
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
        baselineIssue(
          "removed-export",
          key,
          `is listed in ${PUBLIC_API_BASELINE_PATH} but no longer exported`,
        ),
      );
    }
  }
  return issues;
}
