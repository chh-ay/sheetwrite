import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import ReactWorkbench from "../showcases/ReactWorkbench.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import reactWorkbenchStylesheet from "../styles/react-workbench.css?url";

const description =
  "Filter 100,000 pipeline accounts or edit a formula. React controls the query, while the grid calculates workbook KPIs and records edit history.";

export const Route = createFileRoute("/react")({
  head: () => ({
    meta: pageMeta("React analytics workbench — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: reactWorkbenchStylesheet }],
  }),
  component: ReactWorkbenchRoute,
});

function ReactWorkbenchRoute() {
  return (
    <ShowcasePage
      active="react"
      description={description}
      eyebrow="REACT / CONTROLLED ANALYTICS"
      guide="/docs/frameworks/react/"
      packageName="@sheetwrite/react"
      proof={[
        {
          title: "Controlled queries",
          detail: "Market and segment filters, ranking, and search flow from React state.",
        },
        {
          title: "Formulas and KPIs",
          detail:
            "Summary cards read real engine formulas — SUM over a named range, AVG, SUMIF per market — and recalculate on every edit.",
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
      prompt="Filter a market, then select an ARR cell and enter a value or formula. Workbook totals include every account; the market KPI reports the selected market. Open Secondary tools for search, CSV import, exports, and renderer controls."
      sourcePath="docs/src/showcases/ReactWorkbench.tsx"
      title="React-controlled pipeline analytics."
    >
      <ReactWorkbench />
    </ShowcasePage>
  );
}
