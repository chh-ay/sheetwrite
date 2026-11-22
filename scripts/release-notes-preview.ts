import { writeFile } from "node:fs/promises";

import {
  type CommandRunner,
  readPackageChangelog,
  readReleaseChangelogs,
  releaseNotesLinks,
  runCommand,
} from "./release-github.js";
import {
  type ChangelogEntry,
  GITHUB_REPOSITORY,
  type PackageChangelog,
  renderReleaseNotes,
} from "./release-notes.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

/**
 * Writes the `v<version>` GitHub release body for a version that is already
 * published, so a maintainer can review it. This script only reads GitHub.
 *
 *   bun scripts/release-notes-preview.ts 0.5.4 [output.md]
 *
 * CHANGELOG entries from before `@changesets/changelog-github` name only a
 * commit. The squash-merge subject gives the pull request, and the GitHub
 * commit API gives the author login.
 */

const SQUASH_MERGE_PULL = /\(#(\d+)\)\s*$/;

async function command_output(
  runner: CommandRunner,
  command: readonly [string, ...string[]],
): Promise<string | undefined> {
  const result = await runner(command);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

async function with_pull_and_author(
  entry: ChangelogEntry,
  runner: CommandRunner,
): Promise<ChangelogEntry> {
  if (entry.commit === undefined || entry.pull !== undefined) return entry;

  const subject = await command_output(runner, ["git", "log", "-1", "--format=%s", entry.commit]);
  const pull = subject === undefined ? undefined : SQUASH_MERGE_PULL.exec(subject)?.[1];
  const author = await command_output(runner, [
    "gh",
    "api",
    `repos/${GITHUB_REPOSITORY}/commits/${entry.commit}`,
    "--jq",
    ".author.login",
  ]);
  return {
    ...entry,
    ...(pull === undefined ? {} : { pull: Number(pull) }),
    authors: author === undefined || author === "" ? entry.authors : [author],
  };
}

async function main(): Promise<void> {
  const [version, output_path] = process.argv.slice(2);
  if (version === undefined) {
    throw new Error("Usage: bun scripts/release-notes-preview.ts <version> [output.md]");
  }

  const packages = PUBLISHABLE_PACKAGE_ORDER.map((name) => ({ name, version }));
  const changelogs = await readReleaseChangelogs(packages, version, readPackageChangelog);
  const resolved: PackageChangelog[] = [];
  for (const changelog of changelogs) {
    const groups = [];
    for (const group of changelog.section.groups) {
      const entries = [];
      for (const entry of group.entries)
        entries.push(await with_pull_and_author(entry, runCommand));
      groups.push({ ...group, entries });
    }
    resolved.push({ ...changelog, section: { ...changelog.section, groups } });
  }

  const notes = renderReleaseNotes(
    resolved,
    await releaseNotesLinks(resolved, version, runCommand),
  );
  if (output_path === undefined) {
    process.stdout.write(notes);
    return;
  }
  await writeFile(output_path, notes);
}

if (import.meta.main) await main();
