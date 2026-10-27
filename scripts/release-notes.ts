import { RELEASES, releaseHref } from "../docs/src/lib/releases.js";
import { LLMS_SITE_BASE } from "./docs-llms.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

/**
 * GitHub release notes for one Sheetwrite version, built from the CHANGELOG
 * sections that changesets writes for each package. The release groups the
 * entries by package; the docs release post stays the long-form record.
 */

export const GITHUB_REPOSITORY = "chh-ay/sheetwrite";
const REPOSITORY_URL = `https://github.com/${GITHUB_REPOSITORY}`;
const SHORT_COMMIT_LENGTH = 7;

/** Readers look for the core package first, then the engine, then the adapters. */
const RELEASE_NOTES_PACKAGE_ORDER: readonly string[] = [
  "@sheetwrite/core",
  "@sheetwrite/wasm",
  "@sheetwrite/formulas",
  "@sheetwrite/xlsx",
  "@sheetwrite/react",
  "@sheetwrite/vue",
  "@sheetwrite/svelte",
];

const VERSION_HEADING = /^## (\d+\.\d+\.\d+)\s*$/;
const GROUP_HEADING = /^### (.+?)\s*$/;
const ENTRY_START = "- ";
const ENTRY_CONTINUATION = "  ";

/**
 * Changesets repeats a dependency bump in every dependent package. The change
 * itself is already listed under the package that changed.
 */
const DEPENDENCY_UPDATE_ENTRY = /^- Updated dependencies\b/;

/** `@changesets/changelog-github`: `- [#12](…) [`abc1234`](…) Thanks [@user](…)! - Summary`. */
const GITHUB_ENTRY =
  /^- (?:\[#(?<pull>\d+)\]\([^)]*\) ?)?(?:\[`(?<commit>[0-9a-f]+)`\]\([^)]*\) ?)?(?:Thanks (?<authors>.+?)! )?- (?<summary>.*)$/;
const GITHUB_AUTHOR = /\[@([^\]]+)\]/g;

/** `@changesets/cli/changelog`, used before 0.6.0: `- abc1234: Summary`. */
const COMMIT_ENTRY = /^- (?<commit>[0-9a-f]{7,40}): (?<summary>.*)$/;

export interface ChangelogEntry {
  readonly summary: string;
  /** Lines after the summary, without the list indentation. */
  readonly details: readonly string[];
  readonly pull?: number;
  readonly commit?: string;
  readonly authors: readonly string[];
}

export interface ChangelogGroup {
  /** The changesets heading, such as `Minor Changes`. */
  readonly heading: string;
  readonly entries: readonly ChangelogEntry[];
}

export interface ChangelogSection {
  readonly groups: readonly ChangelogGroup[];
  /** The version of the next older section, if the changelog has one. */
  readonly previousVersion?: string;
}

export interface PackageChangelog {
  readonly name: string;
  readonly section: ChangelogSection;
}

export interface ReleaseNotesLinks {
  /** The docs release post. */
  readonly docs?: string;
  /** The previous version and the GitHub comparison from it to this release. */
  readonly previous?: { readonly version: string; readonly compareUrl: string };
}

function parseEntry(lines: readonly string[]): ChangelogEntry {
  const [firstLine = "", ...rest] = lines;
  const details = rest.map((line) =>
    line.startsWith(ENTRY_CONTINUATION) ? line.slice(ENTRY_CONTINUATION.length) : line.trim(),
  );
  while (details.length > 0 && details.at(-1) === "") details.pop();

  const github = GITHUB_ENTRY.exec(firstLine)?.groups;
  if (github?.summary !== undefined) {
    return {
      summary: github.summary,
      details,
      ...(github.pull === undefined ? {} : { pull: Number(github.pull) }),
      ...(github.commit === undefined ? {} : { commit: github.commit }),
      authors: [...(github.authors ?? "").matchAll(GITHUB_AUTHOR)].map((match) => match[1] ?? ""),
    };
  }

  const legacy = COMMIT_ENTRY.exec(firstLine)?.groups;
  if (legacy?.summary !== undefined && legacy.commit !== undefined) {
    return { summary: legacy.summary, details, commit: legacy.commit, authors: [] };
  }

  return { summary: firstLine.slice(ENTRY_START.length), details, authors: [] };
}

/** Splits a group body into entries; each entry starts at a top-level list item. */
function parseEntries(lines: readonly string[]): ChangelogEntry[] {
  const entries: string[][] = [];
  for (const line of lines) {
    if (line.startsWith(ENTRY_START)) {
      entries.push([line]);
      continue;
    }
    entries.at(-1)?.push(line);
  }

  return entries
    .filter(([firstLine = ""]) => !DEPENDENCY_UPDATE_ENTRY.test(firstLine))
    .map(parseEntry);
}

/**
 * Reads the `## <version>` section of a changesets CHANGELOG. Dependency bump
 * entries are removed, and groups that are empty after that are dropped.
 */
export function changelogSection(changelog: string, version: string): ChangelogSection {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => VERSION_HEADING.exec(line)?.[1] === version);
  if (start === -1) throw new Error(`CHANGELOG has no section for ${version}`);

  const nextIndex = lines.findIndex((line, index) => index > start && VERSION_HEADING.test(line));
  const end = nextIndex === -1 ? lines.length : nextIndex;
  const previousVersion =
    nextIndex === -1 ? undefined : VERSION_HEADING.exec(lines[nextIndex] ?? "")?.[1];

  const groups: ChangelogGroup[] = [];
  let heading: string | undefined;
  let body: string[] = [];
  const closeGroup = () => {
    if (heading === undefined) return;
    const entries = parseEntries(body);
    if (entries.length > 0) groups.push({ heading, entries });
  };
  for (const line of lines.slice(start + 1, end)) {
    const groupHeading = GROUP_HEADING.exec(line)?.[1];
    if (groupHeading === undefined) {
      body.push(line);
      continue;
    }
    closeGroup();
    heading = groupHeading;
    body = [];
  }
  closeGroup();

  return { groups, ...(previousVersion === undefined ? {} : { previousVersion }) };
}

function releaseNotesRank(name: string): number {
  const preferred = RELEASE_NOTES_PACKAGE_ORDER.indexOf(name);
  if (preferred !== -1) return preferred;

  // A new package goes after the known ones, in publication order.
  const published = PUBLISHABLE_PACKAGE_ORDER.indexOf(name as never);
  return (
    RELEASE_NOTES_PACKAGE_ORDER.length +
    (published === -1 ? PUBLISHABLE_PACKAGE_ORDER.length : published)
  );
}

/** Sorts packages into the order the release notes list them. */
export function byReleaseNotesOrder(
  left: { readonly name: string },
  right: { readonly name: string },
): number {
  return releaseNotesRank(left.name) - releaseNotesRank(right.name);
}

function entryReference(entry: ChangelogEntry): string {
  const source =
    entry.pull !== undefined
      ? `#${entry.pull}`
      : entry.commit !== undefined
        ? `[${entry.commit.slice(0, SHORT_COMMIT_LENGTH)}](${REPOSITORY_URL}/commit/${entry.commit})`
        : undefined;
  const authors =
    entry.authors.length > 0
      ? `by ${entry.authors.map((author) => `@${author}`).join(", ")}`
      : undefined;
  const reference = [source, authors].filter((part) => part !== undefined).join(" ");
  return reference === "" ? "" : ` (${reference})`;
}

function renderEntry(entry: ChangelogEntry): string {
  const details = entry.details.map((line) => (line === "" ? "" : `${ENTRY_CONTINUATION}${line}`));
  return [`${ENTRY_START}${entry.summary}${entryReference(entry)}`, ...details].join("\n");
}

/** Markdown body for the `v<version>` GitHub release. */
export function renderReleaseNotes(
  packages: readonly PackageChangelog[],
  links: ReleaseNotesLinks,
): string {
  const blocks: string[] = [];
  const ordered = [...packages].sort(byReleaseNotesOrder);
  for (const { name, section } of ordered) {
    if (section.groups.length === 0) continue;
    blocks.push(`## ${name}`);
    for (const group of section.groups) {
      blocks.push(`### ${group.heading}`, group.entries.map(renderEntry).join("\n"));
    }
  }

  const footer: string[] = [];
  if (links.docs !== undefined) footer.push(`**Release notes:** ${links.docs}`);
  if (links.previous !== undefined) {
    footer.push(`**Changes since ${links.previous.version}:** ${links.previous.compareUrl}`);
  }
  if (footer.length > 0) blocks.push("---", ...footer);

  return `${blocks.join("\n\n")}\n`;
}

/** The docs post URL, only when the docs site has a post for this version. */
export function docsReleaseUrl(version: string): string | undefined {
  if (!RELEASES.some((release) => release.version === version)) return undefined;
  return `${LLMS_SITE_BASE}${releaseHref(version)}`;
}

export function compareUrl(baseTag: string, headTag: string): string {
  return `${REPOSITORY_URL}/compare/${baseTag}...${headTag}`;
}
