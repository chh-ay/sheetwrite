import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "../lib/seo.js";
import { InteroperabilityShowcase } from "../showcases/InteroperabilityShowcase.js";

import stylesheet from "../styles/showcase-interoperability.css?url";

const description =
  "XLSX round-trips, independent fixture files, CSV/TSV, fidelity warnings and resource limits, all running Sheetwrite's published APIs in your browser.";

// The page lives in its own module: the router entry keeps only this file's
// options, so the engine the page imports loads with the page.
export const Route = createFileRoute("/showcases/interoperability")({
  head: () => ({
    meta: pageMeta("Spreadsheet interoperability — Sheetwrite showcases", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  // `?compatibility=<record id>` opens one compatibility record.
  validateSearch: (search: Record<string, unknown>): { compatibility?: string } =>
    typeof search.compatibility === "string" ? { compatibility: search.compatibility } : {},
  component: InteroperabilityShowcase,
});
