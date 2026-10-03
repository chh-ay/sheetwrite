import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import ReactWorkbench from "../showcases/ReactWorkbench.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import reactWorkbenchStylesheet from "../styles/react-workbench.css?url";

const description =
  "Filter the live 100,000-row pipeline or commit a formula. React keeps controlled rows, query state, KPI formulas, and Grid history in lockstep.";

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
      prompt="Use the named column headers to find an account or ARR value. Filter a market, then edit an ARR cell. The KPI rail and Grid history update together."
      sourcePath="docs/src/showcases/ReactWorkbench.tsx"
      title="Controlled analytics, without a shadow copy."
    >
      <ReactWorkbench />
    </ShowcasePage>
  );
}
