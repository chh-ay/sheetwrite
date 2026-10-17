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
}

const RELEASES: readonly [Release, ...Release[]] = [
  { version: "0.5.1", date: "2026-10-18" },
  { version: "0.5.0", date: "2026-10-17" },
];

const LATEST_RELEASE = RELEASES[0];

const RELEASES_HREF: string = "/docs/releases/";

function releaseHref(version: string): string {
  return `${RELEASES_HREF}${version}/`;
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
  LATEST_RELEASE,
  RELEASES,
  RELEASES_HREF,
  releaseContext,
  releaseHref,
  type Release,
  type ReleaseContext,
};
