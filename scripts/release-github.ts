import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  byReleaseNotesOrder,
  changelogSection,
  compareUrl,
  docsReleaseUrl,
  type PackageChangelog,
  type ReleaseNotesLinks,
  renderReleaseNotes,
} from "./release-notes.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

export interface PackageReleaseIdentity {
  readonly name: string;
  readonly version: string;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (command: readonly [string, ...string[]]) => Promise<CommandResult>;
export type ProvenanceQuery = (identity: PackageReleaseIdentity) => Promise<string>;

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parsePackageReleaseIdentities(
  value: string,
  label = "VERIFIED_PACKAGES",
  allowEmpty = false,
): readonly PackageReleaseIdentity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON`, { cause: error });
  }
  if (!Array.isArray(parsed) || (!allowEmpty && parsed.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an array" : "a non-empty array"}`);
  }
  const seen = new Set<string>();
  let previousIndex = -1;
  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "name" || keys[1] !== "version") {
      throw new Error(`${label}[${index}] must contain only name and version`);
    }
    const { name, version } = entry as Record<string, unknown>;
    const packageIndex = PUBLISHABLE_PACKAGE_ORDER.indexOf(name as never);
    if (packageIndex === -1) throw new Error(`Unknown publishable package ${String(name)}`);
    if (packageIndex <= previousIndex) throw new Error(`${label} must preserve dependency order`);
    if (typeof version !== "string" || !STABLE_VERSION.test(version)) {
      throw new Error(`${String(name)} has no stable version`);
    }
    if (seen.has(name as string)) throw new Error(`Duplicate package ${String(name)}`);
    seen.add(name as string);
    previousIndex = packageIndex;
    return { name: name as string, version };
  });
}

export function packageReleaseTag(identity: PackageReleaseIdentity): string {
  return `${identity.name}@${identity.version}`;
}

export function provenanceCommitFromAttestations(value: unknown): string {
  if (value === null || typeof value !== "object" || !("attestations" in value)) {
    throw new Error("npm provenance response has no attestations");
  }
  const attestations = (value as { readonly attestations?: unknown }).attestations;
  if (!Array.isArray(attestations)) throw new Error("npm provenance attestations must be an array");
  for (const attestation of attestations) {
    if (
      attestation === null ||
      typeof attestation !== "object" ||
      !("predicateType" in attestation) ||
      attestation.predicateType !== "https://slsa.dev/provenance/v1" ||
      !("bundle" in attestation)
    ) {
      continue;
    }
    const bundle = attestation.bundle as {
      readonly dsseEnvelope?: { readonly payload?: unknown };
    };
    if (typeof bundle.dsseEnvelope?.payload !== "string") continue;
    const statement = JSON.parse(
      Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"),
    ) as {
      readonly predicate?: {
        readonly buildDefinition?: {
          readonly resolvedDependencies?: ReadonlyArray<{
            readonly digest?: { readonly gitCommit?: unknown };
          }>;
        };
      };
    };
    for (const dependency of statement.predicate?.buildDefinition?.resolvedDependencies ?? []) {
      const commit = dependency.digest?.gitCommit;
      if (typeof commit === "string" && /^[0-9a-f]{40}$/.test(commit)) return commit;
    }
  }
  throw new Error("npm provenance has no source commit");
}

async function queryPackageProvenance(identity: PackageReleaseIdentity): Promise<string> {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(identity.name)}/${identity.version}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const metadataResponse = await fetch(metadataUrl);
      if (!metadataResponse.ok) throw new Error(`npm metadata returned ${metadataResponse.status}`);
      const metadata = (await metadataResponse.json()) as {
        readonly dist?: { readonly attestations?: { readonly url?: unknown } };
      };
      const attestationsUrl = metadata.dist?.attestations?.url;
      if (typeof attestationsUrl !== "string")
        throw new Error("npm metadata has no attestations URL");
      const attestationsResponse = await fetch(attestationsUrl);
      if (!attestationsResponse.ok) {
        throw new Error(`npm attestations returned ${attestationsResponse.status}`);
      }
      return provenanceCommitFromAttestations(await attestationsResponse.json());
    } catch (error) {
      lastError = error;
      if (attempt < 12) await Bun.sleep(5_000);
    }
  }
  throw new Error(`${packageReleaseTag(identity)} provenance did not propagate`, {
    cause: lastError,
  });
}

export async function runCommand(command: readonly [string, ...string[]]): Promise<CommandResult> {
  const child = Bun.spawn([...command], { env: process.env, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function requireSuccess(
  runner: CommandRunner,
  command: readonly [string, ...string[]],
): Promise<string> {
  const result = await runner(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

export type ChangelogReader = (packageName: string) => Promise<string>;

export interface ReleaseServices {
  readonly runner: CommandRunner;
  readonly provenance: ProvenanceQuery;
  readonly readChangelog: ChangelogReader;
}

const repositoryRoot = resolve(import.meta.dir, "..");

export async function readPackageChangelog(packageName: string): Promise<string> {
  const directories = await readdir(join(repositoryRoot, "packages"), { withFileTypes: true });
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const packageRoot = join(repositoryRoot, "packages", directory.name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      readonly name?: unknown;
    };
    if (manifest.name === packageName) return readFile(join(packageRoot, "CHANGELOG.md"), "utf8");
  }
  throw new Error(`No workspace package is named ${packageName}`);
}

const DEFAULT_SERVICES: ReleaseServices = {
  runner: runCommand,
  provenance: queryPackageProvenance,
  readChangelog: readPackageChangelog,
};

export function versionReleaseTag(version: string): string {
  return `v${version}`;
}

async function tagCommit(runner: CommandRunner, tag: string): Promise<string | undefined> {
  const result = await runner(["git", "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

/** Creates the tag at `commit`, or fails when an existing tag points elsewhere. */
async function ensureTag(runner: CommandRunner, tag: string, commit: string): Promise<void> {
  const existing = await tagCommit(runner, tag);
  if (existing !== undefined) {
    if (existing !== commit) throw new Error(`${tag} targets ${existing}, expected ${commit}`);
    return;
  }

  await requireSuccess(runner, ["git", "tag", tag, commit]);
  await requireSuccess(runner, ["git", "push", "origin", `refs/tags/${tag}`]);
}

/** Each package's CHANGELOG section for `version`, in release notes order. */
export async function readReleaseChangelogs(
  packages: readonly PackageReleaseIdentity[],
  version: string,
  readChangelog: ChangelogReader,
): Promise<PackageChangelog[]> {
  const changelogs: PackageChangelog[] = [];
  for (const identity of [...packages].sort(byReleaseNotesOrder)) {
    const changelog = await readChangelog(identity.name);
    try {
      changelogs.push({ name: identity.name, section: changelogSection(changelog, version) });
    } catch (error) {
      throw new Error(`${packageReleaseTag(identity)} release notes failed`, { cause: error });
    }
  }
  return changelogs;
}

/**
 * The docs post and the comparison with the previous version. The comparison
 * starts at the previous `v<version>` tag; versions before 0.6.0 have only
 * package tags, so it falls back to the lead package's tag.
 */
export async function releaseNotesLinks(
  changelogs: readonly PackageChangelog[],
  version: string,
  runner: CommandRunner,
): Promise<ReleaseNotesLinks> {
  const docs = docsReleaseUrl(version);
  const [lead] = changelogs;
  const previousVersion = lead?.section.previousVersion;
  if (lead === undefined || previousVersion === undefined)
    return docs === undefined ? {} : { docs };

  const previousVersionTag = versionReleaseTag(previousVersion);
  const baseTag =
    (await tagCommit(runner, previousVersionTag)) === undefined
      ? packageReleaseTag({ name: lead.name, version: previousVersion })
      : previousVersionTag;
  return {
    ...(docs === undefined ? {} : { docs }),
    previous: {
      version: previousVersion,
      compareUrl: compareUrl(baseTag, versionReleaseTag(version)),
    },
  };
}

function compareStableVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * `--latest` only when no `v<version>` tag is higher. Without the explicit
 * `--latest=false`, GitHub can pick Latest by date, so a rerun for an older
 * version would take Latest from a newer release.
 */
async function latestFlag(runner: CommandRunner, version: string): Promise<string> {
  const parts = (value: string) => value.split(".").map(Number);
  const versionTags = await requireSuccess(runner, ["git", "tag", "--list", "v*"]);
  const isHighest = versionTags
    .split("\n")
    .map((tag) => STABLE_VERSION.exec(tag.trim().slice(1))?.[0])
    .every(
      (other) => other === undefined || compareStableVersions(parts(other), parts(version)) <= 0,
    );
  return isHighest ? "--latest" : "--latest=false";
}

async function ensureVersionGithubRelease(
  runner: CommandRunner,
  version: string,
  commit: string,
  notes: string,
): Promise<void> {
  const tag = versionReleaseTag(version);
  await ensureTag(runner, tag, commit);

  const title = `Sheetwrite ${version}`;
  const latest = await latestFlag(runner, version);
  const releaseResult = await runner([
    "gh",
    "release",
    "view",
    tag,
    "--json",
    "tagName,isDraft,isPrerelease",
  ]);
  if (releaseResult.exitCode !== 0) {
    await requireSuccess(runner, [
      "gh",
      "release",
      "create",
      tag,
      "--verify-tag",
      "--target",
      commit,
      "--title",
      title,
      "--notes",
      notes,
      latest,
    ]);
    return;
  }

  const release = JSON.parse(releaseResult.stdout) as {
    readonly tagName?: unknown;
    readonly isDraft?: unknown;
    readonly isPrerelease?: unknown;
  };
  if (release.tagName !== tag || release.isDraft !== false || release.isPrerelease !== false) {
    throw new Error(`${tag} has an invalid GitHub release state`);
  }

  // A rerun refreshes the notes, for example after a CHANGELOG correction.
  await requireSuccess(runner, [
    "gh",
    "release",
    "edit",
    tag,
    "--title",
    title,
    "--notes",
    notes,
    latest,
  ]);
}

/**
 * Tags every verified package at its attested commit, then publishes one
 * `v<version>` GitHub release for the packages published from
 * `expectedCommit`. Returns that tag, or `undefined` when this commit
 * published nothing. Releases of earlier versions are not changed.
 */
export async function ensureVersionRelease(
  packages: readonly PackageReleaseIdentity[],
  publishedPackages: readonly PackageReleaseIdentity[],
  expectedCommit: string,
  services: Partial<ReleaseServices> = {},
): Promise<string | undefined> {
  const { runner, provenance, readChangelog } = { ...DEFAULT_SERVICES, ...services };
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const verified = new Set(packages.map((identity) => packageReleaseTag(identity)));
  const published = new Set<string>();
  for (const identity of publishedPackages) {
    const tag = packageReleaseTag(identity);
    if (!verified.has(tag)) throw new Error(`${tag} was published but not verified`);
    published.add(tag);
  }

  // npm provenance and consumers address packages by these per-package tags.
  const releasedFromCommit: PackageReleaseIdentity[] = [];
  for (const identity of packages) {
    const tag = packageReleaseTag(identity);
    const attestedCommit = await provenance(identity);
    if (!/^[0-9a-f]{40}$/.test(attestedCommit)) {
      throw new Error(`${tag} provenance has invalid source commit ${attestedCommit}`);
    }
    if (published.has(tag) && attestedCommit !== expectedCommit) {
      throw new Error(`${tag} provenance targets ${attestedCommit}, expected ${expectedCommit}`);
    }

    await ensureTag(runner, tag, attestedCommit);
    if (attestedCommit === expectedCommit) releasedFromCommit.push(identity);
  }

  if (releasedFromCommit.length === 0) return undefined;

  // The changeset fixed group keeps every package on one version.
  const versions = [...new Set(releasedFromCommit.map((identity) => identity.version))];
  const [version] = versions;
  if (version === undefined || versions.length !== 1) {
    throw new Error(
      `Packages published from ${expectedCommit} have different versions: ${releasedFromCommit.map(packageReleaseTag).join(", ")}`,
    );
  }

  const changelogs = await readReleaseChangelogs(releasedFromCommit, version, readChangelog);
  const links = await releaseNotesLinks(changelogs, version, runner);
  const notes = renderReleaseNotes(changelogs, links);
  await ensureVersionGithubRelease(runner, version, expectedCommit, notes);
  return versionReleaseTag(version);
}

async function main(): Promise<void> {
  const rawPackages = process.env.VERIFIED_PACKAGES;
  if (!rawPackages) throw new Error("VERIFIED_PACKAGES is required");
  const rawPublished = process.env.PUBLISHED_PACKAGES;
  if (rawPublished === undefined) throw new Error("PUBLISHED_PACKAGES is required");
  const expectedCommit = process.env.EXPECTED_SHA;
  if (!expectedCommit) throw new Error("EXPECTED_SHA is required");
  const packages = parsePackageReleaseIdentities(rawPackages);
  const publishedPackages = parsePackageReleaseIdentities(rawPublished, "PUBLISHED_PACKAGES", true);
  const releaseTag = await ensureVersionRelease(packages, publishedPackages, expectedCommit);
  console.log(
    releaseTag === undefined
      ? `Verified ${packages.length} package tags; no package was published from ${expectedCommit}`
      : `Verified ${packages.length} package tags and the ${releaseTag} GitHub release`,
  );
}

if (import.meta.main) await main();
