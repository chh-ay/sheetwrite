import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "../lib/seo.js";
import { PerformanceShowcase } from "../showcases/PerformanceShowcase.js";

import stylesheet from "../styles/showcase-performance.css?url";

const description =
  "A live grid over 1,000,000 rows by 1,000 columns: windowed loading, a bounded cache, sparse edits and measured runtime evidence, in your browser.";

// The page lives in its own module: the router entry keeps only this file's
// options, so the engine the page imports loads with the page.
export const Route = createFileRoute("/showcases/performance")({
  head: () => ({
    meta: pageMeta("One-billion-address Grid — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: PerformanceShowcase,
});
