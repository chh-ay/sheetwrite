import { describe, expect, it } from "bun:test";

import { RELEASES } from "../docs/src/lib/releases.js";
import { SITE_URL } from "../docs/src/lib/seo.js";
import {
  CHANGELOG_FEED_HREF,
  changelogFeed,
  expectedChangelogFeed,
  type FeedRelease,
} from "./docs-feed.js";

/** Channel elements RSS 2.0 defines; the feed may also hold its `atom:link` self reference. */
const CHANNEL_ELEMENTS = new Set([
  "title",
  "link",
  "description",
  "language",
  "copyright",
  "managingEditor",
  "webMaster",
  "pubDate",
  "lastBuildDate",
  "category",
  "generator",
  "docs",
  "cloud",
  "ttl",
  "image",
  "rating",
  "textInput",
  "skipHours",
  "skipDays",
  "item",
  "atom:link",
]);
const ITEM_ELEMENTS = new Set([
  "title",
  "link",
  "description",
  "author",
  "category",
  "comments",
  "enclosure",
  "guid",
  "pubDate",
  "source",
]);
/** RFC 822 date-time with a four-digit year, as RSS 2.0 recommends. */
const RFC_822 =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName === name);
}

function text(element: Element, name: string): string {
  return children(element, name)[0]?.textContent ?? "";
}

/** Every RSS 2.0 rule the feed must meet, as a list of broken rules. */
function rssIssues(xml: string): string[] {
  const issues: string[] = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'))
    issues.push("no XML declaration");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) return ["not well-formed XML"];
  const rss = document.documentElement;
  if (rss.tagName !== "rss" || rss.getAttribute("version") !== "2.0")
    issues.push('root is not <rss version="2.0">');
  const channels = children(rss, "channel");
  if (channels.length !== 1) return [...issues, "rss must hold exactly one channel"];
  const channel = channels[0] as Element;
  for (const child of Array.from(channel.children)) {
    if (!CHANNEL_ELEMENTS.has(child.tagName))
      issues.push(`unknown channel element ${child.tagName}`);
  }
  for (const required of ["title", "link", "description"]) {
    if (children(channel, required).length !== 1 || text(channel, required).trim() === "") {
      issues.push(`channel needs one non-empty <${required}>`);
    }
  }
  if (!text(channel, "link").startsWith("https://")) issues.push("channel link is not absolute");
  for (const date of ["pubDate", "lastBuildDate"]) {
    const value = text(channel, date);
    if (value !== "" && !RFC_822.test(value))
      issues.push(`channel ${date} is not RFC 822: ${value}`);
  }
  const self = children(channel, "atom:link")[0];
  if (self?.getAttribute("rel") !== "self" || self.getAttribute("type") !== "application/rss+xml") {
    issues.push("channel has no atom:link self reference");
  }
  const guids = new Set<string>();
  for (const item of children(channel, "item")) {
    for (const child of Array.from(item.children)) {
      if (!ITEM_ELEMENTS.has(child.tagName)) issues.push(`unknown item element ${child.tagName}`);
    }
    if (text(item, "title") === "" && text(item, "description") === "") {
      issues.push("item needs a title or a description");
    }
    if (!text(item, "link").startsWith("https://")) issues.push("item link is not absolute");
    if (!RFC_822.test(text(item, "pubDate")))
      issues.push(`item pubDate is not RFC 822: ${text(item, "pubDate")}`);
    const guid = children(item, "guid")[0];
    const id = guid?.textContent ?? "";
    if (id === "" || guids.has(id)) issues.push(`item guid is missing or repeated: ${id}`);
    guids.add(id);
    if (guid?.getAttribute("isPermaLink") === "true" && !id.startsWith("https://")) {
      issues.push("a permalink guid is not a URL");
    }
  }
  return issues;
}

const RELEASE_FIXTURES: readonly FeedRelease[] = [
  {
    version: "0.6.1",
    date: "2026-10-30",
    summary: "Fixes <four> slowdowns & one crash.",
    highlights: ["Edits as fast as 0.5.4", "Paged scrolling"],
  },
  { version: "0.6.0", date: "2026-10-30", summary: "Charts and pivot tables." },
];

describe("changelog feed", () => {
  it("meets the RSS 2.0 rules", () => {
    expect(rssIssues(changelogFeed(RELEASE_FIXTURES))).toEqual([]);
    expect(rssIssues(expectedChangelogFeed().content)).toEqual([]);
  });

  it("lists each release newest first, with its page, date and notes", () => {
    const document = new DOMParser().parseFromString(
      changelogFeed(RELEASE_FIXTURES),
      "application/xml",
    );
    const items = Array.from(document.getElementsByTagName("item"));
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
    const document = new DOMParser().parseFromString(feed.content, "application/xml");
    expect(document.getElementsByTagName("item")).toHaveLength(published.length);
    expect(feed.content).toContain(
      `<atom:link href="${SITE_URL}${CHANGELOG_FEED_HREF}" rel="self"`,
    );
  });
});
