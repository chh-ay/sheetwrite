import { createFileRoute } from "@tanstack/react-router";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import { DocumentReady } from "../components/DocumentReady.js";
import type { DocumentModule } from "../lib/content.js";
import { breadcrumbsFor } from "../lib/navigation.js";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "../lib/seo.js";

/**
 * The overview page module, bundled with this route. An eager glob rather than
 * a named import: a page that uses no rare component has no `stylesheets` export.
 */
const overview = Object.values(
  import.meta.glob<DocumentModule>("../content/docs/index.mdx", { eager: true }),
)[0]!;
const Overview = overview.default;
if (overview.frontmatter === undefined) throw new Error("content/docs/index.mdx has no frontmatter");
const frontmatter = overview.frontmatter;
const stylesheets = overview.stylesheets ?? [];

const OVERVIEW_HREF = "/docs/";
const OVERVIEW_SOURCE = "docs/src/content/docs/index.mdx";

/**
 * The documentation overview. Its own route imports the one page it shows, so
 * the index of every documentation page does not load with it.
 */
export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      ...pageMeta(pageTitle(frontmatter.title), frontmatter.description),
      { property: "og:type", content: "article" },
      ...pageImageMeta(OVERVIEW_HREF, frontmatter.title),
    ],
    links: stylesheets.map((href) => ({ rel: "stylesheet", href })),
    scripts: [
      {
        type: "application/ld+json",
        children: documentStructuredData({
          title: frontmatter.title,
          description: frontmatter.description,
          href: OVERVIEW_HREF,
          trail: breadcrumbsFor(OVERVIEW_HREF, frontmatter.title),
        }),
      },
    ],
  }),
  component: DocsOverview,
});

function DocsOverview() {
  return (
    <DocsShell
      activeHref={OVERVIEW_HREF}
      description={frontmatter.description}
      outline={frontmatter.outline}
      reserveOutline
      sourcePath={OVERVIEW_SOURCE}
      title={frontmatter.title}
    >
      <Overview components={{ a: ContentLink }} />
      <DocumentReady />
    </DocsShell>
  );
}
