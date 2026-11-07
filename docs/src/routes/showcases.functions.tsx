import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const FunctionsShowcase = lazy(() => import("../showcases/FunctionsShowcase.js"));

export const Route = createFileRoute("/showcases/functions")({
  head: () => ({
    meta: pageMeta(
      "New Excel functions — Sheetwrite showcases",
      "Engineering, financial, statistics, information, LOOKUP, TRIMRANGE, GETPIVOTDATA and REGEX functions, calculated live as you change their inputs.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the function sheets…</main>}>
      <FunctionsShowcase />
    </Suspense>
  ),
});
