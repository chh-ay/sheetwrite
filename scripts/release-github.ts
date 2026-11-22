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
import { publishableIndex } from "./workspace-tooling.js";

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
  let previous_index = -1;
  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "name" || keys[1] !== "version") {
      throw new Error(`${label}[${index}] must contain only name and version`);
    }
    const { name, version } = entry as Record<string, unknown>;
    const package_index = publishableIndex(name);
    if (package_index === -1) throw new Error(`Unknown publishable package ${String(name)}`);
    if (package_index <= previous_index) throw new Error(`${label} must preserve dependency order`);
    if (typeof version !== "string" || !STABLE_VERSION.test(version)) {
      throw new Error(`${String(name)} has no stable version`);
    }
    if (seen.has(name as string)) throw new Error(`Duplicate package ${String(name)}`);
    seen.add(name as string);
    previous_index = package_index;
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

async function query_package_provenance(identity: PackageReleaseIdentity): Promise<string> {
  const metadata_url = `https://registry.npmjs.org/${encodeURIComponent(identity.name)}/${identity.version}`;
  let last_error: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const metadata_response = await fetch(metadata_url);
      if (!metadata_response.ok)
        throw new Error(`npm metadata returned ${metadata_response.status}`);
      const metadata = (await metadata_response.json()) as {
        readonly dist?: { readonly attestations?: { readonly url?: unknown } };
      };
      const attestations_url = metadata.dist?.attestations?.url;
      if (typeof attestations_url !== "string")
        throw new Error("npm metadata has no attestations URL");
      const attestations_response = await fetch(attestations_url);
      if (!attestations_response.ok) {
        throw new Error(`npm attestations returned ${attestations_response.status}`);
      }
      return provenanceCommitFromAttestations(await attestations_response.json());
    } catch (error) {
      last_error = error;
      if (attempt < 12) await Bun.sleep(5_000);
    }
  }
  throw new Error(`${packageReleaseTag(identity)} provenance did not propagate`, {
    cause: last_error,
  });
}

export async function runCommand(command: readonly [string, ...string[]]): Promise<CommandResult> {
  const child = Bun.spawn([...command], { env: process.env, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode: exit_code, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function require_success(
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

const repository_root = resolve(import.meta.dir, "..");

export async function readPackageChangelog(packageName: string): Promise<string> {
  const directories = await readdir(join(repository_root, "packages"), { withFileTypes: true });
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const package_root = join(repository_root, "packages", directory.name);
    const manifest = JSON.parse(await readFile(join(package_root, "package.json"), "utf8")) as {
      readonly name?: unknown;
    };
    if (manifest.name === packageName) return readFile(join(package_root, "CHANGELOG.md"), "utf8");
  }
  throw new Error(`No workspace package is named ${packageName}`);
}

const DEFAULT_SERVICES: ReleaseServices = {
  runner: runCommand,
  provenance: query_package_provenance,
  readChangelog: readPackageChangelog,
};

export function versionReleaseTag(version: string): string {
  return `v${version}`;
}

async function tag_commit(runner: CommandRunner, tag: string): Promise<string | undefined> {
  const result = await runner(["git", "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

/** Creates the tag at `commit`, or fails when an existing tag points elsewhere. */
async function ensure_tag(runner: CommandRunner, tag: string, commit: string): Promise<void> {
  const existing = await tag_commit(runner, tag);
  if (existing !== undefined) {
    if (existing !== commit) throw new Error(`${tag} targets ${existing}, expected ${commit}`);
    return;
  }

  await require_success(runner, ["git", "tag", tag, commit]);
  await require_success(runner, ["git", "push", "origin", `refs/tags/${tag}`]);
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
  const previous_version = lead?.section.previousVersion;
  if (lead === undefined || previous_version === undefined)
    return docs === undefined ? {} : { docs };

  const previous_version_tag = versionReleaseTag(previous_version);
  const base_tag =
    (await tag_commit(runner, previous_version_tag)) === undefined
      ? packageReleaseTag({ name: lead.name, version: previous_version })
      : previous_version_tag;
  return {
    ...(docs === undefined ? {} : { docs }),
    previous: {
      version: previous_version,
      compareUrl: compareUrl(base_tag, versionReleaseTag(version)),
    },
  };
}

function compare_stable_versions(left: readonly number[], right: readonly number[]): number {
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
async function latest_flag(runner: CommandRunner, version: string): Promise<string> {
  const parts = (value: string) => value.split(".").map(Number);
  const version_tags = await require_success(runner, ["git", "tag", "--list", "v*"]);
  const is_highest = version_tags
    .split("\n")
    .map((tag) => STABLE_VERSION.exec(tag.trim().slice(1))?.[0])
    .every(
      (other) => other === undefined || compare_stable_versions(parts(other), parts(version)) <= 0,
    );
  return is_highest ? "--latest" : "--latest=false";
}

async function ensure_version_github_release(
  runner: CommandRunner,
  version: string,
  commit: string,
  notes: string,
): Promise<void> {
  const tag = versionReleaseTag(version);
  await ensure_tag(runner, tag, commit);

  const title = `Sheetwrite ${version}`;
  const latest = await latest_flag(runner, version);
  const release_result = await runner([
    "gh",
    "release",
    "view",
    tag,
    "--json",
    "tagName,isDraft,isPrerelease",
  ]);
  if (release_result.exitCode !== 0) {
    await require_success(runner, [
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

  const release = JSON.parse(release_result.stdout) as {
    readonly tagName?: unknown;
    readonly isDraft?: unknown;
    readonly isPrerelease?: unknown;
  };
  if (release.tagName !== tag || release.isDraft !== false || release.isPrerelease !== false) {
    throw new Error(`${tag} has an invalid GitHub release state`);
  }

  // A rerun refreshes the notes, for example after a CHANGELOG correction.
  await require_success(runner, [
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
  const {
    runner,
    provenance,
    readChangelog: read_changelog,
  } = { ...DEFAULT_SERVICES, ...services };
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
  const released_from_commit: PackageReleaseIdentity[] = [];
  for (const identity of packages) {
    const tag = packageReleaseTag(identity);
    const attested_commit = await provenance(identity);
    if (!/^[0-9a-f]{40}$/.test(attested_commit)) {
      throw new Error(`${tag} provenance has invalid source commit ${attested_commit}`);
    }
    if (published.has(tag) && attested_commit !== expectedCommit) {
      throw new Error(`${tag} provenance targets ${attested_commit}, expected ${expectedCommit}`);
    }

    await ensure_tag(runner, tag, attested_commit);
    if (attested_commit === expectedCommit) released_from_commit.push(identity);
  }

  if (released_from_commit.length === 0) return undefined;

  // The changeset fixed group keeps every package on one version.
  const versions = [...new Set(released_from_commit.map((identity) => identity.version))];
  const [version] = versions;
  if (version === undefined || versions.length !== 1) {
    throw new Error(
      `Packages published from ${expectedCommit} have different versions: ${released_from_commit.map(packageReleaseTag).join(", ")}`,
    );
  }

  const changelogs = await readReleaseChangelogs(released_from_commit, version, read_changelog);
  const links = await releaseNotesLinks(changelogs, version, runner);
  const notes = renderReleaseNotes(changelogs, links);
  await ensure_version_github_release(runner, version, expectedCommit, notes);
  return versionReleaseTag(version);
}

async function main(): Promise<void> {
  const raw_packages = process.env.VERIFIED_PACKAGES;
  if (!raw_packages) throw new Error("VERIFIED_PACKAGES is required");
  const raw_published = process.env.PUBLISHED_PACKAGES;
  if (raw_published === undefined) throw new Error("PUBLISHED_PACKAGES is required");
  const expected_commit = process.env.EXPECTED_SHA;
  if (!expected_commit) throw new Error("EXPECTED_SHA is required");
  const packages = parsePackageReleaseIdentities(raw_packages);
  const published_packages = parsePackageReleaseIdentities(
    raw_published,
    "PUBLISHED_PACKAGES",
    true,
  );
  const release_tag = await ensureVersionRelease(packages, published_packages, expected_commit);
  console.log(
    release_tag === undefined
      ? `Verified ${packages.length} package tags; no package was published from ${expected_commit}`
      : `Verified ${packages.length} package tags and the ${release_tag} GitHub release`,
  );
}

if (import.meta.main) await main();
