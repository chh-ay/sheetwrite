import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { captureProcess } from "./script-io.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const PACKAGE_SIZE_HISTORY_PREFIX = "automation/package-size-history-";
const RELEASE_VERSION_PREFIX = "release/version-";
const REQUIRED_PACKAGE_SIZE_HISTORY_FILES = new Set(["scripts/size-history.json"]);
const ALLOWED_PACKAGE_SIZE_HISTORY_FILES = new Set([
  ...REQUIRED_PACKAGE_SIZE_HISTORY_FILES,
  // The release's measured size report; the docs build renders the landing data from it.
  "scripts/size-report.json",
]);
/**
 * Paths inside a published package that never reach a user: tests, test
 * fixtures, benchmarks, Rust test modules (`tests.rs`, `*_tests.rs`) and
 * Markdown. Each package's tarball ships a README, but a README change ships
 * with the next release whatever it bumps.
 */
const UNPUBLISHED_PACKAGE_PATH =
  /(?:^|\/)(?:test|tests|bench|fixtures)\/|\.(?:test|spec)\.[^/]+$|(?:^|\/)(?:[^/]+_)?tests\.rs$|\.md$/;

export interface ChangesetComparison {
  readonly baseRef: string;
  readonly diffRange: string;
  readonly sinceArgument: string;
}

export function changesetComparisonFromBaseRef(
  githubBaseRef: string | undefined,
): ChangesetComparison {
  const base_ref = `origin/${githubBaseRef?.trim() || "develop"}`;
  return {
    baseRef: base_ref,
    diffRange: `${base_ref}...HEAD`,
    sinceArgument: `--since=${base_ref}`,
  };
}

export function releaseVersionFromHeadRef(headRef: string | undefined): string | undefined {
  if (headRef === undefined) return undefined;
  const candidate = headRef.startsWith(RELEASE_VERSION_PREFIX)
    ? headRef.slice(RELEASE_VERSION_PREFIX.length)
    : headRef;
  return STABLE_VERSION.test(candidate) ? candidate : undefined;
}
export function packageSizeHistoryVersionFromHeadRef(
  headRef: string | undefined,
): string | undefined {
  if (headRef === undefined || !headRef.startsWith(PACKAGE_SIZE_HISTORY_PREFIX)) return undefined;
  const version = headRef.slice(PACKAGE_SIZE_HISTORY_PREFIX.length);
  return STABLE_VERSION.test(version) ? version : undefined;
}
export function isGeneratedPackageSizeHistoryChange(paths: readonly string[]): boolean {
  const unique_paths = new Set(paths);
  return (
    unique_paths.size === paths.length &&
    [...REQUIRED_PACKAGE_SIZE_HISTORY_FILES].every((path) => unique_paths.has(path)) &&
    paths.every((path) => ALLOWED_PACKAGE_SIZE_HISTORY_FILES.has(path))
  );
}

/**
 * Whether a pull request changing `paths` needs a changeset: only when it
 * changes the shipped source of a published package. Changes to tests, test
 * fixtures, benchmarks, scripts, docs or CI need none, so they leave no empty
 * changeset behind.
 */
export function changesetRequired(
  paths: readonly string[],
  publishable: readonly string[] = PUBLISHABLE_PACKAGE_ORDER,
): boolean {
  const package_roots = publishable.map((name) => `packages/${name.slice("@sheetwrite/".length)}/`);
  return paths.some((path) => {
    const root = package_roots.find((candidate) => path.startsWith(candidate));
    return root !== undefined && !UNPUBLISHED_PACKAGE_PATH.test(path.slice(root.length));
  });
}

async function changed_files_since(comparison: ChangesetComparison): Promise<string[]> {
  // Without renames, a file moved out of a package's source lists its old path too.
  const stdout = await captureProcess(
    ["git", "diff", "--name-only", "--no-renames", comparison.diffRange],
    {
      cwd: REPOSITORY_ROOT,
      failure: ({ stderr }) =>
        `Unable to list the files changed since ${comparison.baseRef}: ${stderr}`,
    },
  );
  return stdout
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export function validateReleasePackageVersions(version: string, root = REPOSITORY_ROOT): void {
  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const directory = name.slice("@sheetwrite/".length);
    const manifest = JSON.parse(
      readFileSync(resolve(root, "packages", directory, "package.json"), "utf8"),
    ) as { readonly name?: unknown; readonly version?: unknown };
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(
        `Release branch ${version} requires ${name}@${version}, observed ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }
  }
}

const CHANGESET_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const CHANGESET_RELEASE = /^\s*["']?([^"':\s]+)["']?\s*:\s*(?:major|minor|patch|none)\s*$/;

/**
 * The packages a changeset names that are not published. Changesets never
 * versions a private package, so such a changeset stays in `.changeset/`
 * after every release.
 */
export function unpublishedChangesetPackages(
  changeset: string,
  publishable: readonly string[] = PUBLISHABLE_PACKAGE_ORDER,
): string[] {
  const frontmatter = CHANGESET_FRONTMATTER.exec(changeset)?.[1] ?? "";
  return frontmatter.split(/\r?\n/).flatMap((line) => {
    const name = CHANGESET_RELEASE.exec(line)?.[1];
    return name === undefined || publishable.includes(name) ? [] : [name];
  });
}

function assert_changesets_name_published_packages(root = REPOSITORY_ROOT): void {
  const directory = resolve(root, ".changeset");
  const problems = readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .flatMap((file) =>
      unpublishedChangesetPackages(readFileSync(resolve(directory, file), "utf8")).map(
        (name) => `${file} names ${name}`,
      ),
    );
  if (problems.length === 0) return;
  throw new Error(
    `A changeset may name only published packages, because a changeset for a private package is never used up: ${problems.join("; ")}`,
  );
}

async function main(): Promise<void> {
  const release_version = releaseVersionFromHeadRef(process.env.GITHUB_HEAD_REF);
  if (release_version !== undefined) {
    validateReleasePackageVersions(release_version);
    console.log(`Release package versions match branch ${release_version}`);
    return;
  }
  assert_changesets_name_published_packages();
  const comparison = changesetComparisonFromBaseRef(process.env.GITHUB_BASE_REF);
  const changed_files = await changed_files_since(comparison);
  const package_size_history_version = packageSizeHistoryVersionFromHeadRef(
    process.env.GITHUB_HEAD_REF,
  );
  if (package_size_history_version !== undefined) {
    validateReleasePackageVersions(package_size_history_version);
    if (isGeneratedPackageSizeHistoryChange(changed_files)) {
      console.log(`Package size history versions match branch ${package_size_history_version}`);
      return;
    }
    console.log(
      "Package size history branch contains non-generated changes; requiring a changeset",
    );
  }
  if (!changesetRequired(changed_files)) {
    console.log(
      `No published package source changed since ${comparison.baseRef}; no changeset needed`,
    );
    return;
  }
  const child = Bun.spawn(["bun", "run", "changeset:status", "--", comparison.sinceArgument], {
    cwd: REPOSITORY_ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

if (import.meta.main) await main();
