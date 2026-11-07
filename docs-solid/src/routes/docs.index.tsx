import { createFileRoute, notFound } from "@tanstack/solid-router";

import { DocumentRoute, documentHead } from "../components/DocumentRoute.js";
import { documentForSplat } from "../lib/content.js";

/** The documentation overview (content/docs/index.mdx); the splat route never matches `/docs/`. */
export const Route = createFileRoute("/docs/")({
  loader: async () => {
    const document = await documentForSplat(undefined);
    if (document === undefined) throw notFound();
    return { ...document, href: "/docs/" };
  },
  head: ({ loaderData }) => (loaderData === undefined ? {} : documentHead(loaderData)),
  component: () => <DocumentRoute metadata={Route.useLoaderData()()} />,
});
