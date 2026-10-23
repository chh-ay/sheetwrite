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
import { revealAnchoredMember } from "../lib/reveal-anchor.ts";
import { pageMeta } from "../lib/seo.js";

/** Documentation content renders its site links through the router. */
const DOCUMENT_COMPONENTS: DocumentComponents = {
  a: ContentLink,
  FormulaReference,
  PackageCommand,
};

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    // Dynamic import: the docs page index ships with docs routes, not every page.
    const { documentForSplat } = await import("../lib/content.js");
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return { title: document.title, description: document.description };
  },
  head: ({ loaderData }) => ({
    meta: pageMeta(
      `${loaderData?.title ?? "Documentation"} — Sheetwrite`,
      loaderData?.description ?? "Sheetwrite documentation.",
    ),
  }),
  component: DocumentRoute,
  notFoundComponent: DocumentNotFound,
});

function DocumentRoute() {
  const params = Route.useParams();
  // SPA navigations (pushState) never fire hashchange; reveal per location.
  const href = useLocation({ select: (location) => location.href });
  useEffect(() => {
    void href;
    revealAnchoredMember();
  }, [href]);
  const metadata = Route.useLoaderData();
  const Content = documentComponentForSplat(params._splat);
  if (Content === undefined) return <DocumentNotFound />;

  return (
    <DocsShell
      activeHref={normalizeDocumentHref(params._splat)}
      description={metadata.description}
      reserveOutline
      title={metadata.title}
    >
      <Suspense fallback={<p className="sw-document-loading">Loading documentation…</p>}>
        <Content components={DOCUMENT_COMPONENTS} />
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
    </DocsShell>
  );
}
