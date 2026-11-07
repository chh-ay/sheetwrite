import { createFileRoute } from "@tanstack/react-router";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import { DocumentReady } from "../components/DocumentReady.js";
import Overview, { frontmatter, stylesheets } from "../content/docs/index.mdx";
import { breadcrumbsFor } from "../lib/navigation.js";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "../lib/seo.js";

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
