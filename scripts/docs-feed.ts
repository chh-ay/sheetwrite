import { join } from "node:path";

import {
  type PublishedRelease,
  RELEASES,
  RELEASES_HREF,
  releaseHref,
} from "../docs/src/lib/releases.js";
import { SITE_URL } from "../docs/src/lib/seo.js";
import { repositoryRoot } from "./docs-shared.js";

/**
 * The changelog as an RSS 2.0 feed, written to `docs/public` and served at
 * `/changelog/rss.xml`. Each published release is one item, read from the
 * release registry (docs/src/lib/releases.ts) that the changelog page's
 * Update entries also read, so the feed and the page list the same releases.
 * A release listed ahead of its publication is left out until it ships.
 */

/** One release as the feed shows it. */
export interface FeedRelease {
  readonly version: string;
  /** Publication date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly summary: string;
  readonly highlights?: readonly string[];
}

/** The feed's address; every page names it in its head, and the Releases page links it. */
export const CHANGELOG_FEED_HREF = "/changelog/rss.xml";
const CHANGELOG_FEED_TITLE = "Sheetwrite changelog";
const FEED_DESCRIPTION =
  "New features, changes, fixes and performance results in each Sheetwrite release.";

/** Text for an XML element or attribute value. */
function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** RFC 822 date-time, as RSS 2.0 requires: `Fri, 30 Oct 2026 00:00:00 GMT`. */
export function rfc822Date(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

/** The item description: the summary, then the highlights as a list, as escaped HTML. */
function itemDescription(release: FeedRelease): string {
  const highlights = release.highlights ?? [];
  const list =
    highlights.length === 0
      ? ""
      : `<ul>${highlights.map((highlight) => `<li>${escapeXml(highlight)}</li>`).join("")}</ul>`;
  return escapeXml(`<p>${escapeXml(release.summary)}</p>${list}`);
}

/** The feed document for `releases`, newest first. */
export function changelogFeed(releases: readonly FeedRelease[]): string {
  const channelLink = `${SITE_URL}${RELEASES_HREF}`;
  const feedUrl = `${SITE_URL}${CHANGELOG_FEED_HREF}`;
  const newest = releases[0];
  const items = releases.map((release) => {
    const link = `${SITE_URL}${releaseHref(release.version)}`;
    return [
      "    <item>",
      `      <title>Sheetwrite ${escapeXml(release.version)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <pubDate>${rfc822Date(release.date)}</pubDate>`,
      `      <description>${itemDescription(release)}</description>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(CHANGELOG_FEED_TITLE)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${FEED_DESCRIPTION}</description>`,
    "    <language>en</language>",
    // The newest release date, not the build time, so a rebuild writes the same bytes.
    ...(newest === undefined
      ? []
      : [`    <lastBuildDate>${rfc822Date(newest.date)}</lastBuildDate>`]),
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** The feed file the docs pipeline writes, with every published release. */
export function expectedChangelogFeed(): { path: string; content: string } {
  const published = RELEASES.filter(
    (release): release is PublishedRelease => release.unreleased !== true,
  );
  return {
    path: join(repositoryRoot, "docs/public", CHANGELOG_FEED_HREF),
    content: changelogFeed(published),
  };
}
