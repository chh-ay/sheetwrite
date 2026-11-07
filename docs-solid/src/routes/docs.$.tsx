import { normalizeDocumentHref } from "@docs/lib/document-href.js";
import { breadcrumbsFor } from "@docs/lib/navigation.js";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "@docs/lib/seo.js";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { DocumentPage } from "../components/DocumentPage.js";
import PerfFigure from "../components/PerfFigure.js";
import { FormulaReference, PackageCommand } from "../islands/content.js";
import {
  type DocumentComponents,
  documentForSplat,
  loadedDocumentComponent,
} from "../lib/content.js";

/** Build-inserted components; the interactive ones are islands. */
const DOCUMENT_COMPONENTS: DocumentComponents = { FormulaReference, PackageCommand, PerfFigure };

/** Prefetch a docs page when a reader hovers or presses its link: pages navigate by document. */
const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: "/docs/*" }, eagerness: "moderate" }],
});

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return { ...document, href: normalizeDocumentHref(params._splat) };
  },
  head: ({ loaderData }) => {
    if (loaderData === undefined) return {};
    const { title, description, href } = loaderData;
    return {
      meta: [
        ...pageMeta(pageTitle(title), description),
        { property: "og:type", content: "article" },
        ...pageImageMeta(href, title),
      ],
      links: loaderData.stylesheets.map((stylesheet) => ({ rel: "stylesheet", href: stylesheet })),
      scripts: [
        {
          type: "application/ld+json",
          children: documentStructuredData({
            title,
            description,
            href,
            trail: breadcrumbsFor(href, title),
          }),
        },
        { type: "speculationrules", children: SPECULATION_RULES },
      ],
    };
  },
  component: DocumentRoute,
});

/** A static page: only its islands carry hydration keys (islands/Island.tsx). */
function DocumentRoute() {
  const params = Route.useParams();
  const metadata = Route.useLoaderData();
  const Content = loadedDocumentComponent(params()._splat);
  if (Content === undefined) throw new Error(`${metadata().href} has no loaded module`);
  return (
    <NoHydration>
      <DocumentPage
        description={metadata().description}
        href={metadata().href}
        kind={metadata().kind}
        sourcePath={metadata().sourcePath}
        title={metadata().title}
      >
        <Content components={DOCUMENT_COMPONENTS} />
      </DocumentPage>
    </NoHydration>
  );
}
