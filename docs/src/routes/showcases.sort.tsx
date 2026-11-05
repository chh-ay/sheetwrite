import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const SortShowcase = lazy(() => import("../showcases/SortShowcase.js"));

export const Route = createFileRoute("/showcases/sort")({
  head: () => ({
    meta: pageMeta(
      "Sort in place — Sheetwrite showcases",
      "Sort orders in place as Excel does, or sort only the view, and see which formulas follow. Includes the Sort panel and undo.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the order list…</main>}>
      <SortShowcase />
    </Suspense>
  ),
});
