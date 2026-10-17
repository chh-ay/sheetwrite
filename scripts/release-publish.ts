import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  type ReleaseArtifactManifest,
  type ReleasePackageArtifact,
  verifyReleaseArtifacts,
} from "./release-artifacts.js";

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

function registryAttempts(): number {
  const attempts = Number(process.env.NPM_VERIFY_ATTEMPTS ?? DEFAULT_REGISTRY_ATTEMPTS);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_REGISTRY_ATTEMPTS) {
    throw new Error(`NPM_VERIFY_ATTEMPTS must be an integer from 1 to ${MAX_REGISTRY_ATTEMPTS}`);
  }
  return attempts;
}

function processEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function command(command: readonly [string, ...string[]]): Promise<string> {
  const child = Bun.spawn([...command], {
    env: processEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
  }
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

async function queryRegistry(identity: PackageIdentity): Promise<RegistryPackage> {
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

async function queryExistingRegistry(
  identity: PackageIdentity,
): Promise<RegistryPackage | "pending" | undefined> {
  try {
    return await queryRegistry(identity);
  } catch (error) {
    if (!String(error).includes("E404")) throw error;
  }

  try {
    const publicationTimes = JSON.parse(
      await command(["npm", "view", identity.name, "time", "--json"]),
    ) as Record<string, unknown> | null;
    if (typeof publicationTimes?.[identity.version] === "string") return "pending";
    return undefined;
  } catch (error) {
    if (String(error).includes("E404")) return undefined;
    throw error;
  }
}

async function queryLatest(name: string): Promise<string> {
  const value = JSON.parse(
    await command(["npm", "view", name, "dist-tags.latest", "--json"]),
  ) as unknown;
  if (typeof value !== "string") throw new Error(`${name} has no string latest dist-tag`);
  return value;
}

function assertRegistryIdentity(identity: PackageIdentity, registry: RegistryPackage): void {
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
  assertRegistryIdentity(artifact, registry);
  if (registry.dist?.integrity !== artifact.integrity) {
    throw new Error(
      `${artifact.name}@${artifact.version} registry integrity does not match the canonical tarball`,
    );
  }
}

export async function publishArtifactsIdempotently(
  artifactRoot: string,
  artifacts: readonly ReleasePackageArtifact[],
  existing: ExistingQuery = queryExistingRegistry,
  publish: PublishArtifact = publishArtifact,
): Promise<PublicationResult> {
  const packagedNames = new Set<string>();
  for (const artifact of artifacts) packagedNames.add(artifact.name);
  const verifiedIndependentDependencies = new Set<string>();
  for (const artifact of artifacts) {
    for (const [name, version] of Object.entries(artifact.internalDependencies)) {
      if (packagedNames.has(name)) continue;
      const dependencyKey = `${name}@${version}`;
      if (verifiedIndependentDependencies.has(dependencyKey)) continue;
      const identity = { name, version };
      const registry = await existing(identity);
      if (registry === undefined || registry === "pending") {
        throw new Error(
          `${artifact.name}@${artifact.version} requires unpublished internal dependency ${dependencyKey}`,
        );
      }
      assertRegistryIdentity(identity, registry);
      verifiedIndependentDependencies.add(dependencyKey);
    }
  }

  const verifiedPackages: PublishedPackage[] = [];
  const newlyPublishedPackages: PublishedPackage[] = [];
  for (const artifact of artifacts) {
    const registry = await existing(artifact);
    if (registry !== undefined && registry !== "pending") {
      assertRegistryArtifact(artifact, registry);
      verifiedPackages.push({
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
      verifiedPackages.push(identity);
      continue;
    }

    try {
      const published = await publish(artifactRoot, artifact);
      verifiedPackages.push(published);
      newlyPublishedPackages.push(published);
    } catch (error) {
      // npm can hide accepted versions from both version reads and publication times.
      const message = String(error);
      const isPublishConflict =
        /EPUBLISHCONFLICT/.test(message) ||
        (/E403/.test(message) &&
          /(?:cannot publish over|previously published|pre-existing version)/i.test(message));
      if (!isPublishConflict) throw error;
      verifiedPackages.push(identity);
    }
  }
  return { verifiedPackages, newlyPublishedPackages };
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
  query: RegistryQuery = queryRegistry,
  latest: LatestQuery = queryLatest,
  attempts = registryAttempts(),
  pause: (milliseconds: number) => Promise<unknown> = Bun.sleep,
  accepted: readonly PackageIdentity[] = [],
): Promise<"verified" | "pending"> {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_REGISTRY_ATTEMPTS) {
    throw new Error(`Registry attempts must be an integer from 1 to ${MAX_REGISTRY_ATTEMPTS}`);
  }

  const acceptedVersions = new Set(accepted.map(({ name, version }) => `${name}@${version}`));
  // A long validation wait polls many times; confirmed packages are not read again.
  const confirmedVersions = new Set<string>();
  let lastError: unknown;
  let pendingVersions: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    pendingVersions = [];
    let hasUnconfirmedFailure = false;
    for (const artifact of artifacts) {
      const identity = `${artifact.name}@${artifact.version}`;
      if (confirmedVersions.has(identity)) continue;
      let registry: RegistryPackage;
      try {
        registry = await query(artifact);
      } catch (error) {
        lastError = error;
        if (String(error).includes("E404") && acceptedVersions.has(identity)) {
          pendingVersions.push(identity);
        } else {
          hasUnconfirmedFailure = true;
        }
        continue;
      }

      assertRegistryArtifact(artifact, registry);
      try {
        const registryLatest = await latest(artifact.name);
        if (registryLatest !== artifact.version) {
          throw new Error(
            `${artifact.name} latest is ${registryLatest}, expected ${artifact.version}`,
          );
        }
        confirmedVersions.add(identity);
      } catch (error) {
        lastError = error;
        hasUnconfirmedFailure = true;
      }
    }

    if (!hasUnconfirmedFailure && pendingVersions.length === 0) return "verified";
    if (attempt < attempts) await pause(REGISTRY_POLL_INTERVAL_MS);
    else if (!hasUnconfirmedFailure && pendingVersions.length > 0) {
      console.warn(
        `::warning::${pendingVersions.join(", ")} still validating on npm after ${attempts} checks. Rerun this release job after validation finishes.`,
      );
      return "pending";
    }
  }
  throw new Error(
    `Published package registry verification failed after ${attempts} checks (${((attempts - 1) * REGISTRY_POLL_INTERVAL_MS) / 1_000}s wait): ${String(lastError)}. Check npm publication status and rerun the release job.`,
    { cause: lastError },
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
    queryRegistry,
    queryLatest,
    registryAttempts(),
    Bun.sleep,
    result.verifiedPackages,
  );
  const pendingValidation = verification === "pending";
  return {
    ...result,
    verifiedPackages: pendingValidation ? [] : result.verifiedPackages,
    pendingValidation,
  };
}

if (import.meta.main) {
  const artifactRoot = resolve(process.argv[2] ?? "test-results/release-artifacts");
  const expectedCommit = process.env.EXPECTED_SHA;
  if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }
  const result = await publishCanonicalArtifacts(artifactRoot, expectedCommit);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const verified = result.verifiedPackages.map(({ name, version }) => ({
      name,
      version,
    }));
    const published = result.newlyPublishedPackages.map(({ name, version }) => ({
      name,
      version,
    }));
    await appendFile(
      outputPath,
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
