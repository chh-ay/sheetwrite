import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import stylesheet from "../styles/showcase-host-rows.css?url";

const HostRowsShowcase = lazy(() => import("../showcases/HostRowsShowcase.js"));

export const Route = createFileRoute("/showcases/host-rows")({
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Sort and filter host-owned CRM accounts, import 10,000 leads through the row bridge, and watch the live ID-check and cell-load time.",
      },
      { title: "Host-owned rows — Sheetwrite" },
    ],
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
