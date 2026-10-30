import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-formatting.css?url";

const FormattingShowcase = lazy(() => import("../showcases/FormattingShowcase.js"));

export const Route = createFileRoute("/showcases/formatting")({
  head: () => ({
    meta: pageMeta(
      "Formatting & number formats — Sheetwrite showcases",
      "Style a live operating budget: typography, alignment, borders, conditional formatting, mixed per-cell number formats, and an executable XLSX round-trip proof.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: FormattingRoute,
});

function FormattingRoute() {
  return (
    <Suspense
      fallback={
        <main id="main-content">
          <p>Loading the formatting studio…</p>
        </main>
      }
    >
      <FormattingShowcase />
    </Suspense>
  );
}
