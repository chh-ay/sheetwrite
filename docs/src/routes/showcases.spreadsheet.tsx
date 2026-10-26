import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-spreadsheet.css?url";

const SpreadsheetShowcase = lazy(() => import("../showcases/SpreadsheetShowcase.js"));

export const Route = createFileRoute("/showcases/spreadsheet")({
  head: () => ({
    meta: pageMeta(
      "Spreadsheet app — Sheetwrite showcases",
      "A full spreadsheet app in the browser: an Excel-style ribbon, name box, formula bar, sheet tabs and a two-sheet sales workbook with cross-sheet formulas.",
    ),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: () => (
    <Suspense
      fallback={
        <main id="main-content">
          <p>Loading the spreadsheet…</p>
        </main>
      }
    >
      <SpreadsheetShowcase />
    </Suspense>
  ),
});
