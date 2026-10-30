import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

// The analysis page is a shell app like the spreadsheet showcase, so it shares that layout.
import stylesheet from "../styles/showcase-spreadsheet.css?url";

const AnalysisShowcase = lazy(() => import("../showcases/AnalysisShowcase.js"));

export const Route = createFileRoute("/showcases/analysis")({
  head: () => ({
    meta: pageMeta(
      "Pivot tables and charts — Sheetwrite showcases",
      "A pivot table and a live chart over two years of orders. Edit an order and both update in place; rearrange the pivot from its field list.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: () => (
    <Suspense
      fallback={
        <main id="main-content">
          <p>Loading the analysis workbook…</p>
        </main>
      }
    >
      <AnalysisShowcase />
    </Suspense>
  ),
});
