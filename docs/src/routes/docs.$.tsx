import { createFileRoute, Link, notFound, useLocation } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import { FormulaReference } from "../components/FormulaReference.js";
import { PackageCommand } from "../components/PackageCommand.js";
import {
  type DocumentComponents,
  documentComponentForSplat,
  normalizeDocumentHref,
} from "../lib/content.js";
import { forwardedHeading, MOVED_PAGES, movedPageTarget } from "../lib/moved-pages.js";
import { breadcrumbsFor } from "../lib/navigation.js";
import { revealAnchoredMember } from "../lib/reveal-anchor.ts";
import { documentStructuredData, pageMeta, pageTitle } from "../lib/seo.js";

/** Documentation content renders its site links through the router. */
const DOCUMENT_COMPONENTS: DocumentComponents = {
  a: ContentLink,
  FormulaReference,
  PackageCommand,
};

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const href = normalizeDocumentHref(params._splat);
    const moved = MOVED_PAGES[href];
    if (moved !== undefined) {
      return {
        title: "Page moved",
        description: "This page has a new address.",
        moved: href,
        href,
      };
    }
    // Dynamic import: the docs page index ships with docs routes, not every page.
    const { documentForSplat } = await import("../lib/content.js");
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return { title: document.title, description: document.description, moved: undefined, href };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? "Documentation";
    const description = loaderData?.description ?? "Sheetwrite documentation.";

    // An old address must not compete with its new page in search results.
    if (loaderData === undefined || loaderData.moved !== undefined) {
      return {
        meta: [
          ...pageMeta(pageTitle(title), description),
          { name: "robots", content: "noindex, follow" },
        ],
      };
    }

    const structuredData = documentStructuredData({
      title,
      description,
      href: loaderData.href,
      trail: breadcrumbsFor(loaderData.href, title),
    });
    return {
      meta: [
        ...pageMeta(pageTitle(title), description),
        { property: "og:type", content: "article" },
      ],
      scripts: [{ type: "application/ld+json", children: structuredData }],
    };
  },
  component: DocumentRoute,
  notFoundComponent: DocumentNotFound,
});

/**
 * Deployed servers answer an old address with a 308 redirect (see
 * scripts/prepare-docs-deployment.ts). The dev server and client-side
 * navigation reach this route instead: it forwards the old address and its
 * fragment to the page that holds that heading now. The page has no
 * `data-pagefind-body`, so search never lists it.
 */
function MovedDocument({ from }: Readonly<{ from: string }>) {
  const target = MOVED_PAGES[from]?.to ?? "/docs/";
  useEffect(() => {
    window.location.replace(movedPageTarget(from, window.location.hash) ?? target);
  }, [from, target]);
  return (
    <main className="sw-document" id="main-content">
      <h1>Page moved</h1>
      <p>
        This page has a new address: <a href={target}>{target}</a>.
      </p>
      <DocumentReady />
    </main>
  );
}

/**
 * Marks the docs page ready for interaction. In an article it runs inside the
 * content boundary, so it fires after the lazy MDX controls hydrate.
 */
function DocumentReady() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  return null;
}

function DocumentRoute() {
  const params = Route.useParams();
  const activeHref = normalizeDocumentHref(params._splat);
  // SPA navigations (pushState) never fire hashchange; reveal per location.
  const href = useLocation({ select: (location) => location.href });
  useEffect(() => {
    void href;
    // An old URL redirects here with its old #fragment; send that heading on.
    const forwarded = forwardedHeading(activeHref, window.location.hash);
    if (forwarded !== undefined) {
      window.location.replace(forwarded);
      return;
    }
    revealAnchoredMember();
  }, [href, activeHref]);
  const metadata = Route.useLoaderData();
  const Content = documentComponentForSplat(params._splat);
  if (metadata.moved !== undefined) return <MovedDocument from={metadata.moved} />;
  if (Content === undefined) return <DocumentNotFound />;

  return (
    <DocsShell
      activeHref={activeHref}
      description={metadata.description}
      reserveOutline
      title={metadata.title}
    >
      {/* Prerendered HTML can still hold this placeholder; search must not quote it. */}
      <Suspense
        fallback={
          <p className="sw-document-loading" data-pagefind-ignore="">
            Loading documentation…
          </p>
        }
      >
        <Content components={DOCUMENT_COMPONENTS} />
        <DocumentReady key={activeHref} />
      </Suspense>
    </DocsShell>
  );
}

function DocumentNotFound() {
  return (
    <DocsShell
      activeHref=""
      description="The requested documentation page does not exist."
      title="Page not found"
    >
      <p>
        Return to{" "}
        <Link to="/docs/$/" params={{ _splat: "start/installation" }}>
          installation
        </Link>{" "}
        or search the documentation.
      </p>
      <DocumentReady />
    </DocsShell>
  );
}
