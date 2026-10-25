import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-data-tools.css?url";

const DataToolsShowcase = lazy(() => import("../showcases/DataToolsShowcase.js"));

export const Route = createFileRoute("/showcases/data-tools")({
  head: () => ({
    meta: pageMeta(
      "Data tools — Sheetwrite",
      "Sort, filter and organize 4,800 dispatch orders. Exercise validation, protected ranges, row grouping and visibility with live Grid event receipts.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: () => (
    <Suspense
      fallback={
        <main>
          <p>Loading dispatch operations…</p>
        </main>
      }
    >
      <DataToolsShowcase />
    </Suspense>
  ),
});
