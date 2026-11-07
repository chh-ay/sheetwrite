import { breadcrumbsFor } from "@docs/lib/navigation.js";
import { documentStructuredData, pageImageMeta, pageMeta, pageTitle } from "@docs/lib/seo.js";
import { NoHydration } from "solid-js/web";

import { FormulaReference, PackageCommand } from "../islands/content.js";
import {
  type DocumentComponents,
  type DocumentRecord,
  loadedDocumentComponent,
} from "../lib/content.js";
import { DocsShell } from "./DocsShell.js";
import PerfFigure from "./PerfFigure.js";

/*
 * A documentation page, for the docs routes (routes/docs.$.tsx and the
 * overview, routes/docs.index.tsx): its head and its static body.
 */

/** Build-inserted components; the interactive ones are islands. */
const DOCUMENT_COMPONENTS: DocumentComponents = { FormulaReference, PackageCommand, PerfFigure };

/** Prefetch a docs page when a reader hovers or presses its link: pages navigate by document. */
const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: "/docs/*" }, eagerness: "moderate" }],
});

export type DocumentMetadata = DocumentRecord & { readonly href: string };

export function documentHead(metadata: DocumentMetadata) {
  const { title, description, href } = metadata;
  return {
    meta: [
      ...pageMeta(pageTitle(title), description),
      { property: "og:type", content: "article" },
      ...pageImageMeta(href, title),
    ],
    links: metadata.stylesheets.map((stylesheet) => ({ rel: "stylesheet", href: stylesheet })),
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
}

/** A static page: only its islands carry hydration keys (islands/Island.tsx). */
export function DocumentRoute(props: { readonly metadata: DocumentMetadata }) {
  const metadata = props.metadata;
  // The loaders keyed the loaded module by splat: the address below /docs/.
  const Content = loadedDocumentComponent(metadata.href.replace(/^\/docs\//, ""));
  if (Content === undefined) throw new Error(`${metadata.href} has no loaded module`);
  return (
    <NoHydration>
      <DocsShell
        activeHref={metadata.href}
        description={metadata.description}
        kind={metadata.kind}
        outline={metadata.outline}
        reserveOutline
        sourcePath={metadata.sourcePath}
        symbolCount={metadata.symbols}
        title={metadata.title}
      >
        <Content components={DOCUMENT_COMPONENTS} />
      </DocsShell>
    </NoHydration>
  );
}
