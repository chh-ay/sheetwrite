import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

const DashboardsShowcase = lazy(() => import("../showcases/DashboardsShowcase.js"));

export const Route = createFileRoute("/showcases/dashboards")({
  head: () => ({
    meta: pageMeta(
      "Dashboards — Sheetwrite showcases",
      "A dashboard sheet of pivots and slicers: move and resize items with the mouse or the keyboard, add a pivot, pick slicer values, and undo each change.",
    ),
  }),
  component: () => (
    <Suspense fallback={<main id="main-content">Loading the dashboard…</main>}>
      <DashboardsShowcase />
    </Suspense>
  ),
});
