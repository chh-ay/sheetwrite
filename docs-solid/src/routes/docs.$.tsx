import { normalizeDocumentHref } from "@docs/lib/document-href.js";
import { forwardedHeading } from "@docs/lib/moved-headings.js";
import { breadcrumbsFor } from "@docs/lib/navigation.js";
import { revealAnchoredMember } from "@docs/lib/reveal-anchor.ts";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "@docs/lib/seo.js";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { createEffect, type JSX, onCleanup, Show, Suspense } from "solid-js";
import { NoHydration } from "solid-js/web";

import { ContentLink } from "../components/ContentLink.js";
import { DocsShell } from "../components/DocsShell.js";
import PerfFigure from "../components/PerfFigure.js";
import { PackageCommand } from "../islands/content.js";
import { ISLANDS } from "../islands/Island.js";
import {
  type DocumentComponents,
  documentComponentForSplat,
  documentForSplat,
  loadedDocumentComponent,
} from "../lib/content.js";

const DOCUMENT_COMPONENTS: DocumentComponents = { a: ContentLink, PackageCommand, PerfFigure };

/** Prefetch a docs page when a reader hovers or presses its link (static pages navigate by document). */
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
        ...(ISLANDS ? [{ type: "speculationrules", children: SPECULATION_RULES }] : []),
      ],
    };
  },
  component: DocumentRoute,
});

/** Marks the page ready once the article has hydrated; an old #fragment goes to its heading's new page. */
function DocumentReady() {
  createEffect(() => {
    const forwarded = forwardedHeading(window.location.pathname, window.location.hash);
    if (forwarded !== undefined) {
      window.location.replace(forwarded);
      return;
    }
    document.documentElement.dataset.hydrated = "true";
    revealAnchoredMember();
    onCleanup(() => delete document.documentElement.dataset.hydrated);
  });
  return null;
}

/** The shell around this route's page; children stay lazy, so they hydrate in document order. */
function Page(props: { children: JSX.Element }) {
  const metadata = Route.useLoaderData();
  return (
    <DocsShell
      activeHref={metadata().href}
      description={metadata().description}
      kind={metadata().kind}
      outline={metadata().outline}
      sourcePath={metadata().sourcePath}
      title={metadata().title}
    >
      {props.children}
    </DocsShell>
  );
}

function DocumentRoute() {
  const params = Route.useParams();
  if (ISLANDS) {
    // Static page: only islands carry hydration keys (islands/Island.tsx).
    const Content = loadedDocumentComponent(params()._splat);
    return (
      <NoHydration>
        <Page>{Content === undefined ? null : <Content components={DOCUMENT_COMPONENTS} />}</Page>
      </NoHydration>
    );
  }
  return (
    <Page>
      <Suspense fallback={<p class="sw-document-loading">Loading documentation…</p>}>
        <Show keyed when={documentComponentForSplat(params()._splat)}>
          {(Content) => (
            <>
              <Content components={DOCUMENT_COMPONENTS} />
              <DocumentReady />
            </>
          )}
        </Show>
      </Suspense>
    </Page>
  );
}
