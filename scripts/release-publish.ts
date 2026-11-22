import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  type ReleaseArtifactManifest,
  type ReleasePackageArtifact,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";
import { captureProcess } from "./script-io.js";

export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
}

export interface PublishedPackage extends PackageIdentity {
  readonly integrity: string;
}

export interface PublicationResult {
  readonly verifiedPackages: readonly PublishedPackage[];
  readonly newlyPublishedPackages: readonly PublishedPackage[];
}

export interface RegistryPackage {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dist?: { readonly integrity?: unknown };
}

type PublishArtifact = (
  artifactRoot: string,
  artifact: ReleasePackageArtifact,
) => Promise<PublishedPackage>;

type RegistryQuery = (artifact: ReleasePackageArtifact) => Promise<RegistryPackage>;
type LatestQuery = (name: string) => Promise<string>;
type ExistingQuery = (
  identity: PackageIdentity,
) => Promise<RegistryPackage | "pending" | undefined>;

const REGISTRY_POLL_INTERVAL_MS = 5_000;
const DEFAULT_REGISTRY_ATTEMPTS = 181;
const MAX_REGISTRY_ATTEMPTS = 721;

function registry_attempts(): number {
  const attempts = Number(process.env.NPM_VERIFY_ATTEMPTS ?? DEFAULT_REGISTRY_ATTEMPTS);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_REGISTRY_ATTEMPTS) {
    throw new Error(`NPM_VERIFY_ATTEMPTS must be an integer from 1 to ${MAX_REGISTRY_ATTEMPTS}`);
  }
  return attempts;
}

async function command(command: readonly [string, ...string[]]): Promise<string> {
  const stdout = await captureProcess(command, {
    failure: ({ stdout, stderr, exitCode: exit_code }) =>
      `${command.join(" ")} failed (${exit_code}): ${stderr || stdout}`,
  });
  return stdout.trim();
}

export function publishedPackageFrom(value: unknown): Omit<PublishedPackage, "integrity"> {
  const candidates = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object"
      ? [value, ...Object.values(value)]
      : [value];
  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.name === "string" && typeof record.version === "string") {
      return { name: record.name, version: record.version };
    }
  }
  throw new Error("npm publish did not return an explicit package name and version");
}

export async function publishArtifact(
  artifactRoot: string,
  artifact: ReleasePackageArtifact,
): Promise<PublishedPackage> {
  const stdout = await command([
    "npm",
    "publish",
    join(artifactRoot, artifact.path),
    "--access",
    "public",
    "--tag",
    "latest",
    "--provenance",
    "--ignore-scripts",
    "--json",
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`npm publish did not return JSON: ${stdout}`);
  }
  const published = publishedPackageFrom(parsed);
  if (published.name !== artifact.name || published.version !== artifact.version) {
    throw new Error(
      `npm published ${published.name}@${published.version}, expected ${artifact.name}@${artifact.version}`,
    );
  }
  return { ...published, integrity: artifact.integrity };
}

async function query_registry(identity: PackageIdentity): Promise<RegistryPackage> {
  return JSON.parse(
    await command([
      "npm",
      "view",
      `${identity.name}@${identity.version}`,
      "name",
      "version",
      "dist",
      "--json",
    ]),
  ) as RegistryPackage;
}

async function query_existing_registry(
  identity: PackageIdentity,
): Promise<RegistryPackage | "pending" | undefined> {
  try {
    return await query_registry(identity);
  } catch (error) {
    if (!String(error).includes("E404")) throw error;
  }

  try {
    const publication_times = JSON.parse(
      await command(["npm", "view", identity.name, "time", "--json"]),
    ) as Record<string, unknown> | null;
    if (typeof publication_times?.[identity.version] === "string") return "pending";
    return undefined;
  } catch (error) {
    if (String(error).includes("E404")) return undefined;
    throw error;
  }
}

async function query_latest(name: string): Promise<string> {
  const value = JSON.parse(
    await command(["npm", "view", name, "dist-tags.latest", "--json"]),
  ) as unknown;
  if (typeof value !== "string") throw new Error(`${name} has no string latest dist-tag`);
  return value;
}

function assert_registry_identity(identity: PackageIdentity, registry: RegistryPackage): void {
  if (registry.name !== identity.name || registry.version !== identity.version) {
    throw new Error(
      `Registry returned ${String(registry.name)}@${String(registry.version)}, expected ${identity.name}@${identity.version}`,
    );
  }
}

export function assertRegistryArtifact(
  artifact: ReleasePackageArtifact,
  registry: RegistryPackage,
): void {
  assert_registry_identity(artifact, registry);
  if (registry.dist?.integrity !== artifact.integrity) {
    throw new Error(
      `${artifact.name}@${artifact.version} registry integrity does not match the canonical tarball`,
    );
  }
}

export async function publishArtifactsIdempotently(
  artifactRoot: string,
  artifacts: readonly ReleasePackageArtifact[],
  existing: ExistingQuery = query_existing_registry,
  publish: PublishArtifact = publishArtifact,
): Promise<PublicationResult> {
  const packaged_names = new Set<string>();
  for (const artifact of artifacts) packaged_names.add(artifact.name);
  const verified_independent_dependencies = new Set<string>();
  for (const artifact of artifacts) {
    for (const [name, version] of Object.entries(artifact.internalDependencies)) {
      if (packaged_names.has(name)) continue;
      const dependency_key = `${name}@${version}`;
      if (verified_independent_dependencies.has(dependency_key)) continue;
      const identity = { name, version };
      const registry = await existing(identity);
      if (registry === undefined || registry === "pending") {
        throw new Error(
          `${artifact.name}@${artifact.version} requires unpublished internal dependency ${dependency_key}`,
        );
      }
      assert_registry_identity(identity, registry);
      verified_independent_dependencies.add(dependency_key);
    }
  }

  const verified_packages: PublishedPackage[] = [];
  const newly_published_packages: PublishedPackage[] = [];
  for (const artifact of artifacts) {
    const registry = await existing(artifact);
    if (registry !== undefined && registry !== "pending") {
      assertRegistryArtifact(artifact, registry);
      verified_packages.push({
        name: artifact.name,
        version: artifact.version,
        integrity: artifact.integrity,
      });
      continue;
    }
    const identity = {
      name: artifact.name,
      version: artifact.version,
      integrity: artifact.integrity,
    };
    if (registry === "pending") {
      verified_packages.push(identity);
      continue;
    }

    try {
      const published = await publish(artifactRoot, artifact);
      verified_packages.push(published);
      newly_published_packages.push(published);
    } catch (error) {
      // npm can hide accepted versions from both version reads and publication times.
      const message = String(error);
      const is_publish_conflict =
        /EPUBLISHCONFLICT/.test(message) ||
        (/E403/.test(message) &&
          /(?:cannot publish over|previously published|pre-existing version)/i.test(message));
      if (!is_publish_conflict) throw error;
      verified_packages.push(identity);
    }
  }
  return { verifiedPackages: verified_packages, newlyPublishedPackages: newly_published_packages };
}

export function assertRegistryPackage(
  artifact: ReleasePackageArtifact,
  registry: RegistryPackage,
  latest: string,
): void {
  assertRegistryArtifact(artifact, registry);
  if (latest !== artifact.version) {
    throw new Error(`${artifact.name} latest is ${latest}, expected ${artifact.version}`);
  }
}

export async function verifyPublishedArtifacts(
  artifacts: readonly ReleasePackageArtifact[],
  query: RegistryQuery = query_registry,
  latest: LatestQuery = query_latest,
  attempts = registry_attempts(),
  pause: (milliseconds: number) => Promise<unknown> = Bun.sleep,
  accepted: readonly PackageIdentity[] = [],
): Promise<"verified" | "pending"> {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_REGISTRY_ATTEMPTS) {
    throw new Error(`Registry attempts must be an integer from 1 to ${MAX_REGISTRY_ATTEMPTS}`);
  }

  const accepted_versions = new Set(accepted.map(({ name, version }) => `${name}@${version}`));
  // A long validation wait polls many times; confirmed packages are not read again.
  const confirmed_versions = new Set<string>();
  let last_error: unknown;
  let pending_versions: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    pending_versions = [];
    let has_unconfirmed_failure = false;
    for (const artifact of artifacts) {
      const identity = `${artifact.name}@${artifact.version}`;
      if (confirmed_versions.has(identity)) continue;
      let registry: RegistryPackage;
      try {
        registry = await query(artifact);
      } catch (error) {
        last_error = error;
        if (String(error).includes("E404") && accepted_versions.has(identity)) {
          pending_versions.push(identity);
        } else {
          has_unconfirmed_failure = true;
        }
        continue;
      }

      assertRegistryArtifact(artifact, registry);
      try {
        const registry_latest = await latest(artifact.name);
        if (registry_latest !== artifact.version) {
          throw new Error(
            `${artifact.name} latest is ${registry_latest}, expected ${artifact.version}`,
          );
        }
        confirmed_versions.add(identity);
      } catch (error) {
        last_error = error;
        has_unconfirmed_failure = true;
      }
    }

    if (!has_unconfirmed_failure && pending_versions.length === 0) return "verified";
    if (attempt < attempts) await pause(REGISTRY_POLL_INTERVAL_MS);
    else if (!has_unconfirmed_failure && pending_versions.length > 0) {
      console.warn(
        `::warning::${pending_versions.join(", ")} still validating on npm after ${attempts} checks. Rerun this release job after validation finishes.`,
      );
      return "pending";
    }
  }
  throw new Error(
    `Published package registry verification failed after ${attempts} checks (${((attempts - 1) * REGISTRY_POLL_INTERVAL_MS) / 1_000}s wait): ${String(last_error)}. Check npm publication status and rerun the release job.`,
    { cause: last_error },
  );
}

export function assertCanonicalReleaseIdentity(
  manifest: Pick<ReleaseArtifactManifest, "sourceCommit" | "packages">,
  expectedCommit: string,
): void {
  if (manifest.sourceCommit !== expectedCommit) {
    throw new Error(
      `Canonical artifacts came from ${manifest.sourceCommit}, expected ${expectedCommit}`,
    );
  }
}

export async function publishCanonicalArtifacts(
  artifactRoot: string,
  expectedCommit: string,
): Promise<PublicationResult & { readonly pendingValidation: boolean }> {
  const manifest = await verifyReleaseArtifacts(artifactRoot);
  assertCanonicalReleaseIdentity(manifest, expectedCommit);
  const result = await publishArtifactsIdempotently(artifactRoot, manifest.packages);
  const verification = await verifyPublishedArtifacts(
    manifest.packages,
    query_registry,
    query_latest,
    registry_attempts(),
    Bun.sleep,
    result.verifiedPackages,
  );
  const pending_validation = verification === "pending";
  return {
    ...result,
    verifiedPackages: pending_validation ? [] : result.verifiedPackages,
    pendingValidation: pending_validation,
  };
}

if (import.meta.main) {
  const artifact_root = resolve(process.argv[2] ?? "test-results/release-artifacts");
  const expected_commit = process.env.EXPECTED_SHA;
  if (!expected_commit || !/^[0-9a-f]{40}$/.test(expected_commit)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const result = await publishCanonicalArtifacts(artifact_root, expected_commit);
  const output_path = process.env.GITHUB_OUTPUT;
  if (output_path) {
    const verified = result.verifiedPackages.map(({ name, version }) => ({
      name,
      version,
    }));
    const published = result.newlyPublishedPackages.map(({ name, version }) => ({
      name,
      version,
    }));
    await appendFile(
      output_path,
      `verified=${JSON.stringify(verified)}\n` +
        `published=${JSON.stringify(published)}\n` +
        `pending=${result.pendingValidation}\n`,
      "utf8",
    );
  }
  console.log(
    `Published ${result.newlyPublishedPackages.length} and verified ${result.verifiedPackages.length} canonical packages`,
  );
}
