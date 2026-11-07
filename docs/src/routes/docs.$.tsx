import { createFileRoute, Link, notFound, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, use, useEffect } from "react";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import { PackageCommand } from "../components/PackageCommand.js";
import { type DocumentComponents, hasDocument, useDocumentComponent } from "../lib/content.js";
import { normalizeDocumentHref } from "../lib/document-href.js";
import {
  FORMULA_FAMILY_PAGE,
  loadedFormulaReference,
  loadFormulaReference,
} from "../lib/formula-reference-module.js";
import { breadcrumbsFor } from "../lib/navigation.js";
import { revealAnchoredMember } from "../lib/reveal-anchor.ts";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "../lib/seo.js";

/** The formula reference, from its module once loaded (see lib/formula-reference-module.ts). */
function FormulaReference(props: Readonly<{ family: string }>) {
  const { FormulaReference: Reference } = loadedFormulaReference() ?? use(loadFormulaReference());
  return <Reference {...props} />;
}

/** Figures appear on Performance pages only, so their component loads with them. */
const PerfFigure = lazy(() => import("../components/PerfFigure.js"));

/** Documentation content renders its site links through the router. */
const DOCUMENT_COMPONENTS: DocumentComponents = {
  a: ContentLink,
  FormulaReference,
  PackageCommand,
  PerfFigure,
};

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const href = normalizeDocumentHref(params._splat);
    // The moved-page table loads with the loader, not with every page's script.
    const { MOVED_PAGES } = await import("../lib/moved-pages.js");
    const moved = MOVED_PAGES[href];
    if (moved !== undefined) {
      return {
        title: "Page moved",
        description: "This page has a new address.",
        kind: undefined,
        outline: [],
        symbols: undefined,
        sourcePath: undefined,
        stylesheets: [],
        moved: href,
        movedTo: moved.to,
        href,
      };
    }
    if (FORMULA_FAMILY_PAGE.test(href)) await loadFormulaReference();
    // Dynamic import: the docs page index ships with docs routes, not every page.
    const { documentForSplat } = await import("../lib/content.js");
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return {
      title: document.title,
      description: document.description,
      kind: document.kind,
      outline: document.outline ?? [],
      symbols: document.symbols,
      sourcePath: document.sourcePath,
      stylesheets: document.stylesheets,
      moved: undefined,
      movedTo: undefined,
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
function MovedDocument({ from, target }: Readonly<{ from: string; target: string }>) {
  useEffect(() => {
    const hash = window.location.hash;
    void import("../lib/moved-pages.js").then(({ movedPageTarget }) => {
      window.location.replace(movedPageTarget(from, hash) ?? target);
    });
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
    const hash = window.location.hash;
    if (hash === "") return;
    // An old URL redirects here with its old #fragment; send that heading on.
    // The table of moved headings loads only for a URL with a fragment.
    let current = true;
    void import("../lib/moved-headings.js").then(({ forwardedHeading }) => {
      if (!current) return;
      const forwarded = forwardedHeading(activeHref, hash);
      if (forwarded !== undefined) window.location.replace(forwarded);
      else revealAnchoredMember();
    });
    return () => {
      current = false;
    };
  }, [href, activeHref]);
  const metadata = Route.useLoaderData();
  if (metadata.moved !== undefined) {
    return <MovedDocument from={metadata.moved} target={metadata.movedTo ?? "/docs/"} />;
  }
  if (!hasDocument(params._splat)) return <DocumentNotFound />;

  return (
    <DocsShell
      activeHref={activeHref}
      description={metadata.description}
      kind={metadata.kind}
      outline={metadata.outline}
      reserveOutline
      symbolCount={metadata.symbols}
      sourcePath={metadata.sourcePath}
      title={metadata.title}
    >
      {/* The loader has loaded the article, so the server renders it in full;
          hydration keeps that article on screen while the module loads. */}
      <Suspense fallback={null}>
        <DocumentArticle splat={params._splat} />
        <DocumentReady key={activeHref} />
      </Suspense>
    </DocsShell>
  );
}

/** The page's article: its compiled document with the site's components. */
function DocumentArticle({ splat }: Readonly<{ splat: string | undefined }>) {
  const Content = useDocumentComponent(splat);
  return Content === undefined ? null : <Content components={DOCUMENT_COMPONENTS} />;
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
