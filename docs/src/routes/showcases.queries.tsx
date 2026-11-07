import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const QueriesShowcase = lazy(() => import("../showcases/QueriesShowcase.js"));

export const Route = createFileRoute("/showcases/queries")({
  head: () => ({
    meta: pageMeta(
      "Saved queries — Sheetwrite showcases",
      "Saved queries shape a CSV order feed and a JSON region list into workbook tables. Refresh them, change a step, and open Queries & Connections.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the report…</main>}>
      <QueriesShowcase />
    </Suspense>
  ),
});
