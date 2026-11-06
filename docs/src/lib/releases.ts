/**
 * Releases with a release post, newest first. The release pull request adds
 * one entry together with its `releases/<version>.md` post; the header
 * version link, the sidebar and the version strip on each post read this
 * list, so a new version shows everywhere at once. The next release may be
 * listed ahead of its publication with `unreleased: true`: its post and the
 * release list show it as "(next)", while the header, the latest-release card
 * and the landing keep the newest published release.
 */
interface PublishedRelease {
  readonly version: string;
  readonly unreleased?: false;
  /** Publication date on npm, `YYYY-MM-DD`. */
  readonly date: string;
  /** One line for the sidebar card and the release list. */
  readonly summary: string;
  /** The changes a minor release leads with; the landing lists the newest set. */
  readonly highlights?: readonly string[];
}

/** The next release, before the release pull request dates it. */
interface UnreleasedRelease {
  readonly version: string;
  readonly unreleased: true;
  readonly summary: string;
  readonly highlights?: readonly string[];
}

type Release = PublishedRelease | UnreleasedRelease;

const RELEASES: readonly Release[] = [
  {
    version: "0.7.0",
    unreleased: true,
    summary:
      "Dashboards, a data model with measures, in-place sort, linked workbooks and version history.",
  },
  {
    version: "0.6.1",
    date: "2026-10-30",
    summary: "Faster data-grid edits, paged scrolling, text lookups and XLSX rejects.",
  },
  {
    version: "0.6.0",
    date: "2026-10-30",
    summary:
      "Charts, pivot tables, reference operators, iterative calculation and an Excel-style ribbon.",
    highlights: [
      "Charts that follow their cells, with an optional SVG renderer",
      "Pivot tables that the full engine updates after each edit",
      "Reference operators, OFFSET and INDIRECT, and iterative calculation",
      "An Excel-style ribbon, and XLSX files that keep the parts Sheetwrite does not model",
    ],
  },
  {
    version: "0.5.4",
    date: "2026-10-24",
    summary: "No more references to unpublished source maps.",
  },
  {
    version: "0.5.3",
    date: "2026-10-24",
    summary: "Readable published JavaScript and package READMEs for every package manager.",
  },
  {
    version: "0.5.2",
    date: "2026-10-23",
    summary: "Smaller packages, lower CSV import memory and shifted shortcuts.",
  },
  {
    version: "0.5.1",
    date: "2026-10-18",
    summary: "Typed shortcuts, command feedback and faster column sums.",
  },
  {
    version: "0.5.0",
    date: "2026-10-17",
    summary: "Full formula engine, spill references, large undo and conflict recovery.",
    highlights: [
      "Array arithmetic and spill references in both engines",
      "Large undo through compressed restores and atomic sync batches",
      "Host-owned rows with stable IDs and per-record deltas",
      "Faster formula kernels, bulk loading, and streamed CSV and XLSX imports",
    ],
  },
];

/** Dates read as "Oct 18, 2026"; the registry keeps ISO dates for `<time>`. */
function releaseDate(release: PublishedRelease): string {
  return new Date(`${release.date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A release's name in lists: its date when published, "(next)" before. */
function releaseLabel(release: Release): string {
  return release.unreleased === true
    ? `${release.version} (next)`
    : `${release.version} · ${releaseDate(release)}`;
}

const PUBLISHED_RELEASES = RELEASES.filter(
  (release): release is PublishedRelease => release.unreleased !== true,
);

/** The newest published release: the header, the release card and the landing name it. */
const LATEST_RELEASE = PUBLISHED_RELEASES[0] as PublishedRelease;

/**
 * The newest published release that lists highlights. Patch releases have
 * none, so the landing keeps naming the minor release until the next one ships.
 */
const LATEST_HIGHLIGHTED_RELEASE = PUBLISHED_RELEASES.find(
  (release): release is PublishedRelease & { highlights: readonly string[] } =>
    release.highlights !== undefined,
);

const RELEASES_HREF: string = "/docs/releases/";

function releaseHref(version: string): string {
  return `${RELEASES_HREF}${version}/`;
}

/** The major and minor version; patch releases share the same feature set. */
function minorVersion(version: string): string {
  return version.replace(/\.\d+$/, "");
}

interface ReleaseContext {
  readonly release: Release;
  readonly newer?: Release;
  readonly older?: Release;
}

/** The release a docs path belongs to, with its neighbours in time. */
function releaseContext(activeHref: string | undefined): ReleaseContext | undefined {
  const index = RELEASES.findIndex((release) => releaseHref(release.version) === activeHref);
  if (index === -1) return undefined;
  return {
    release: RELEASES[index] as Release,
    newer: RELEASES[index - 1],
    older: RELEASES[index + 1],
  };
}

export {
  LATEST_HIGHLIGHTED_RELEASE,
  LATEST_RELEASE,
  RELEASES,
  RELEASES_HREF,
  minorVersion,
  releaseContext,
  releaseDate,
  releaseHref,
  releaseLabel,
  type PublishedRelease,
  type Release,
  type ReleaseContext,
};
