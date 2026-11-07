import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { ReactWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import demoSelectStylesheet from "@docs/styles/demo-select.css?url";
import reactWorkbenchStylesheet from "@docs/styles/react-workbench.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Filter 100,000 pipeline accounts or edit a formula. React controls the query, while the grid calculates workbook KPIs and records edit history.";

export const Route = createFileRoute("/react")({
  head: () => ({
    meta: pageMeta("React analytics workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      // The workbench's Base UI selects (docs/src/showcases/ui/DemoSelect.tsx).
      { rel: "stylesheet", href: demoSelectStylesheet },
      { rel: "stylesheet", href: reactWorkbenchStylesheet },
    ],
  }),
  component: ReactRoute,
});

function ReactRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        description={description}
        eyebrow="REACT / CONTROLLED ANALYTICS"
        framework="react"
        guide="/docs/frameworks/react/"
        packageName="@sheetwrite/react"
        prompt="Filter a market, then select an ARR cell and enter a value or formula. Workbook totals include every account; the market KPI reports the selected market. Open Secondary tools for search, CSV import, exports, and renderer controls."
        proof={[
          {
            title: "Controlled queries",
            detail: "Market and segment filters, ranking, and search flow from React state.",
          },
          {
            title: "Formulas and KPIs",
            detail:
              "Summary cards read real engine formulas (SUM over a named range, AVG, SUMIF per market) and recalculate on every edit.",
          },
          {
            title: "Reset reconciliation",
            detail:
              "Dataset reloads and renderer swaps rebuild the grid; the surviving React state re-applies itself on ready.",
          },
          {
            title: "Data workflows",
            detail:
              "CSV import lands as one undoable commit; CSV/XLSX exports hand off to the interoperability proofs.",
          },
        ]}
        sourcePath="docs/src/showcases/ReactWorkbench.tsx"
        title="React-controlled pipeline analytics."
      >
        <Island component={ReactWorkbenchIsland} name="workbench-react" props={{}} />
      </FrameworkPage>
    </NoHydration>
  );
}
