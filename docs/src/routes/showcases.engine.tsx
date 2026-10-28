import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-engine.css?url";

const EngineShowcase = lazy(() => import("../showcases/EngineShowcase.js"));

export const Route = createFileRoute("/showcases/engine")({
  head: () => ({
    meta: pageMeta(
      "Live financial grid and engine events — Sheetwrite",
      "Edit a live 50,000-row forecast and watch the page request, recalculation, paint and host acknowledgement arrive in order.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: EngineRoute,
});

function EngineRoute() {
  return (
    <Suspense
      fallback={
        <main className="sw-engine-loading" data-testid="engine-route-loading">
          <p>Loading the live engine view…</p>
        </main>
      }
    >
      <EngineShowcase />
    </Suspense>
  );
}
