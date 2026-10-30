/**
 * Published releases with a release post, newest first. The release pull
 * request adds one entry together with its `releases/<version>.md` post; the
 * header version link, the sidebar and the version strip on each post read
 * this list, so a new version shows everywhere at once.
 */
interface Release {
  readonly version: string;
  /** Publication date on npm, `YYYY-MM-DD`. */
  readonly date: string;
  /** One line for the sidebar card and the release list. */
  readonly summary: string;
  /** The changes a minor release leads with; the landing lists the newest set. */
  readonly highlights?: readonly string[];
}

const RELEASES: readonly [Release, ...Release[]] = [
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
function releaseDate(release: Release): string {
  return new Date(`${release.date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const LATEST_RELEASE = RELEASES[0];

/**
 * The newest release that lists highlights. Patch releases have none, so the
 * landing keeps naming the minor release until the next one ships.
 */
const LATEST_HIGHLIGHTED_RELEASE = RELEASES.find(
  (release): release is Release & { highlights: readonly string[] } =>
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
  type Release,
  type ReleaseContext,
};
