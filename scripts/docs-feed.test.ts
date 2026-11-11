import { describe, expect, it } from "bun:test";

import { RELEASES } from "../docs/src/lib/releases.js";
import { SITE_URL } from "../docs/src/lib/seo.js";
import {
  CHANGELOG_FEED_HREF,
  changelogFeed,
  expectedChangelogFeed,
  type FeedRelease,
} from "./docs-feed.js";

/** RFC 822 date-time with a four-digit year, as RSS 2.0 recommends. */
const RFC_822 =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

const RELEASE_FIXTURES: readonly FeedRelease[] = [
  {
    version: "0.6.1",
    date: "2026-10-30",
    summary: "Fixes <four> slowdowns & one crash.",
    highlights: ["Edits as fast as 0.5.4", "Paged scrolling"],
  },
  { version: "0.6.0", date: "2026-10-30", summary: "Charts and pivot tables." },
];

function text(element: Element, name: string): string {
  return Array.from(element.children).find((child) => child.tagName === name)?.textContent ?? "";
}

/** The feed's items, after checking the RSS 2.0 envelope every reader relies on. */
function rssItems(xml: string): Element[] {
  expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>\n');
  const document = new DOMParser().parseFromString(xml, "application/xml");
  expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
  const rss = document.documentElement;
  expect([rss.tagName, rss.getAttribute("version")]).toEqual(["rss", "2.0"]);
  const channels = Array.from(rss.children).filter((child) => child.tagName === "channel");
  expect(channels).toHaveLength(1);
  const [channel] = channels;
  if (channel === undefined) throw new Error("The feed has no channel");
  expect(text(channel, "title")).not.toBe("");
  expect(text(channel, "description")).not.toBe("");
  expect(text(channel, "link")).toStartWith("https://");
  const items = Array.from(channel.children).filter((child) => child.tagName === "item");
  for (const item of items) {
    expect(text(item, "link")).toStartWith("https://");
    expect(text(item, "pubDate")).toMatch(RFC_822);
  }
  const guids = items.map((item) => text(item, "guid"));
  expect(new Set(guids).size).toBe(guids.length);
  return items;
}

describe("changelog feed", () => {
  it("lists each release newest first, with its page, date and notes", () => {
    const items = rssItems(changelogFeed(RELEASE_FIXTURES));
    expect(items.map((item) => text(item, "title"))).toEqual([
      "Sheetwrite 0.6.1",
      "Sheetwrite 0.6.0",
    ]);
    const [first] = items;
    if (first === undefined) throw new Error("The feed has no items");
    expect(text(first, "link")).toBe(`${SITE_URL}/docs/releases/0.6.1/`);
    expect(text(first, "guid")).toBe(`${SITE_URL}/docs/releases/0.6.1/`);
    expect(text(first, "pubDate")).toBe("Fri, 30 Oct 2026 00:00:00 GMT");
    // The description is HTML; markup in the summary stays text.
    expect(text(first, "description")).toBe(
      "<p>Fixes &lt;four&gt; slowdowns &amp; one crash.</p><ul><li>Edits as fast as 0.5.4</li><li>Paged scrolling</li></ul>",
    );
  });

  it("is served at the address the pages link, with every published release", () => {
    const feed = expectedChangelogFeed();
    expect(feed.path.endsWith(`docs/public${CHANGELOG_FEED_HREF}`)).toBeTrue();
    const published = RELEASES.filter(
      (release) => !("unreleased" in release && release.unreleased === true),
    );
    expect(rssItems(feed.content)).toHaveLength(published.length);
    expect(feed.content).toContain(
      `<atom:link href="${SITE_URL}${CHANGELOG_FEED_HREF}" rel="self"`,
    );
  });
});
