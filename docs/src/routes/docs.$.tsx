import { normalizeDocumentHref } from "@docs/lib/document-href.js";
import { createFileRoute, notFound } from "@tanstack/solid-router";

import { DocumentRoute, documentHead } from "../components/DocumentRoute.js";
import { documentForSplat } from "../lib/content.js";

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return { ...document, href: normalizeDocumentHref(params._splat) };
  },
  head: ({ loaderData }) => (loaderData === undefined ? {} : documentHead(loaderData)),
  component: () => <DocumentRoute metadata={Route.useLoaderData()()} />,
});
