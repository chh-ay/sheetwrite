import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const VersionHistoryShowcase = lazy(() => import("../showcases/VersionHistoryShowcase.js"));

export const Route = createFileRoute("/showcases/version-history")({
  head: () => ({
    meta: pageMeta(
      "Version history — Sheetwrite showcases",
      "Edit a shared budget with a teammate, save named versions, compare a version with the current document by author, and restore a range or a sheet.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the budget…</main>}>
      <VersionHistoryShowcase />
    </Suspense>
  ),
});
