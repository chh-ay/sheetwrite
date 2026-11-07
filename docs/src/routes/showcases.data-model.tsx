import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const DataModelShowcase = lazy(() => import("../showcases/DataModelShowcase.js"));

export const Route = createFileRoute("/showcases/data-model")({
  head: () => ({
    meta: pageMeta(
      "Data model — Sheetwrite showcases",
      "Relate orders to products and regions, pivot by fields of the related tables with a measure, and see what a broken key does.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the data model…</main>}>
      <DataModelShowcase />
    </Suspense>
  ),
});
