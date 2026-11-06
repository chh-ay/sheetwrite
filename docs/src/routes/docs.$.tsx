import { createFileRoute, Link, notFound, useLocation } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import { FormulaReference } from "../components/FormulaReference.js";
import { PackageCommand } from "../components/PackageCommand.js";
import * as IslandContent from "../islands/content.js";
import { IslandsContext } from "../islands/Island.js";
import {
  type DocumentComponents,
  documentComponentForSplat,
  loadedDocumentComponent,
  normalizeDocumentHref,
} from "../lib/content.js";
import { forwardedHeading } from "../lib/moved-headings.js";
import { MOVED_PAGES, movedPageTarget } from "../lib/moved-pages.js";
import { breadcrumbsFor } from "../lib/navigation.js";
import { revealAnchoredMember } from "../lib/reveal-anchor.ts";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "../lib/seo.js";

/**
 * Production docs pages ship as static HTML: the islands client
 * (islands/client.tsx) hydrates the interactive parts and nothing else, and
 * links between pages load the next document. The dev server keeps hydrating
 * the whole page with the router.
 */
const STATIC_DOCS = import.meta.env.PROD;

/** Documentation content renders its site links through the router. */
const DOCUMENT_COMPONENTS: DocumentComponents = {
  a: ContentLink,
  FormulaReference,
  PackageCommand,
};

/** On a static page the browser navigates, and the widgets are islands. */
const STATIC_DOCUMENT_COMPONENTS: DocumentComponents = {
  a: IslandContent.StaticLink,
  FormulaReference: IslandContent.FormulaReference,
  PackageCommand: IslandContent.PackageCommand,
};

/**
 * Prefetch a docs page when a reader hovers or presses its link, so the
 * document load that replaced client-side navigation starts early.
 */
const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: "/docs/*" }, eagerness: "moderate" }],
});

export const Route = createFileRoute("/docs/$")({
  // A static page has no router: a client-side navigation from a router page
  // (the landing page, the docs overview) loads the document instead.
  beforeLoad: ({ location, preload }) => {
    if (!STATIC_DOCS || preload || typeof window === "undefined") return;
    window.location.assign(location.href);
    // The browser is leaving; the route never renders here.
    return Promise.withResolvers<never>().promise;
  },
  loader: async ({ params }) => {
    const href = normalizeDocumentHref(params._splat);
    const moved = MOVED_PAGES[href];
    if (moved !== undefined) {
      return {
        title: "Page moved",
        description: "This page has a new address.",
        kind: undefined,
        outline: [],
        stylesheets: [],
        moved: href,
        href,
      };
    }
    // Dynamic import: the docs page index ships with docs routes, not every page.
    const { documentForSplat } = await import("../lib/content.js");
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return {
      title: document.title,
      description: document.description,
      kind: document.kind,
      outline: document.outline ?? [],
      stylesheets: document.stylesheets,
      moved: undefined,
      href,
    };
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
        ...pageImageMeta(loaderData.href, title),
      ],
      links: loaderData.stylesheets.map((href) => ({ rel: "stylesheet", href })),
      scripts: [
        { type: "application/ld+json", children: structuredData },
        ...(STATIC_DOCS ? [{ type: "speculationrules", children: SPECULATION_RULES }] : []),
      ],
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
  if (metadata.moved !== undefined) return <MovedDocument from={metadata.moved} />;
  if (STATIC_DOCS) return <StaticDocument activeHref={activeHref} splat={params._splat} />;
  const Content = documentComponentForSplat(params._splat);
  if (Content === undefined) return <DocumentNotFound />;
  return (
    <DocsShell
      activeHref={activeHref}
      description={metadata.description}
      kind={metadata.kind}
      outline={metadata.outline}
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

/**
 * The production page: the article and the shell are static HTML, each
 * widget an island. The article renders synchronously from the module the
 * loader loaded, because an island renders as its own root and cannot wait
 * for a lazy article.
 */
function StaticDocument({ activeHref, splat }: Readonly<{ activeHref: string; splat?: string }>) {
  const metadata = Route.useLoaderData();
  const Content = loadedDocumentComponent(splat);
  if (Content === undefined) return <DocumentNotFound />;
  return (
    <IslandsContext value>
      <DocsShell
        activeHref={activeHref}
        description={metadata.description}
        kind={metadata.kind}
        outline={metadata.outline}
        reserveOutline
        title={metadata.title}
      >
        <Content components={STATIC_DOCUMENT_COMPONENTS} />
      </DocsShell>
    </IslandsContext>
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
