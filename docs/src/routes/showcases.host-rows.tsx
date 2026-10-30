import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-host-rows.css?url";

const HostRowsShowcase = lazy(() => import("../showcases/HostRowsShowcase.js"));

export const Route = createFileRoute("/showcases/host-rows")({
  head: () => ({
    meta: pageMeta(
      "Host-owned rows — Sheetwrite",
      "Sort and filter host-owned CRM accounts, import 10,000 leads through the row bridge, and watch the live ID-check and cell-load time.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: HostRowsRoute,
});

function HostRowsRoute() {
  return (
    <Suspense fallback={<main>Loading host rows…</main>}>
      <HostRowsShowcase />
    </Suspense>
  );
}
