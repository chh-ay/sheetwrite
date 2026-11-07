import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const RecalculationShowcase = lazy(() => import("../showcases/RecalculationShowcase.js"));

export const Route = createFileRoute("/showcases/recalculation")({
  head: () => ({
    meta: pageMeta(
      "Live recalculation — Sheetwrite showcases",
      "Edit a cell under 100,000 formulas and move 1,000 lookups over 100,000 rows; the page times each recalculation and paint in your browser.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the model…</main>}>
      <RecalculationShowcase />
    </Suspense>
  ),
});
