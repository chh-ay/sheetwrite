import { pageMeta } from "@docs/lib/seo.js";
import ReactSnippet from "@docs/showcases/snippets/react-workbench.mdx";
import ReactSnippetSource from "@docs/showcases/snippets/react-workbench.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { FRAMEWORK_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { ReactWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { type FrameworkPanel, FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import demoSelectStylesheet from "@docs/styles/demo-select.css?url";
import reactWorkbenchStylesheet from "@docs/styles/react-workbench.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Filter 100,000 pipeline accounts or edit a formula. React controls the query, while the grid calculates workbook KPIs and records edit history.";

/** The workbench's panels, in the page's static HTML (the workbench renders in the browser). */
const panels: readonly FrameworkPanel[] = [
  {
    title: "Pipeline analytics",
    detail:
      "The command bar holds the query that React state owns. Each control re-applies the query to the grid, and the readout counts the accounts in view.",
    controls: [
      "Market",
      "Segment",
      "Rank by ARR",
      "Reset view",
      "Focus Tokyo accounts",
      "accounts in the controlled view",
    ],
  },
  {
    title: "Change selected cell",
    detail:
      "Select a cell, type a value or a formula such as =SUM(F2:F20), and apply it. The change is one undoable transaction.",
    controls: ["Formula or value", "Apply change"],
  },
  {
    title: "Controlled output",
    detail:
      "The query and its summary values: the rows in view and four KPIs that engine formulas compute. Totals include every account; the market KPI reports the selected market.",
    controls: ["Rows", "Query", "Total ARR", "Average deal", "Largest deal", "All-market ARR"],
  },
  {
    title: "Grid history",
    detail:
      "Undo and redo step through the grid's own history. The line below names the last action and the grid generation.",
    controls: ["Undo", "Redo"],
  },
  {
    title: "Find & replace",
    detail: "Search the accounts, step through the matches, and replace one match or all of them.",
    controls: [
      "Search accounts",
      "Find",
      "Previous",
      "Next",
      "Replacement text",
      "Replace",
      "Replace all",
      "Matches",
    ],
  },
  {
    title: "Native editing",
    detail:
      "Use Ctrl/⌘ C and Ctrl/⌘ V in the grid. Drag the selection handle to fill; both flows land in the same undo history.",
    controls: ["Ctrl/⌘ C", "Ctrl/⌘ V", "the selection handle"],
  },
  {
    title: "Data exchange",
    detail: "Export the workbook as CSV or XLSX, or import a CSV file as one undoable commit.",
    controls: ["Export CSV", "Export XLSX", "Import CSV"],
    link: { href: "/showcases/interoperability/", label: "Fidelity proofs" },
  },
  {
    title: "Runtime",
    detail:
      "Reload the dataset, make the grid read-only, or draw it in a Web Worker. The line below shows the requested and the active renderer.",
    controls: ["Reload dataset", "Read-only", "Rendering thread: Main thread or Web Worker"],
  },
];

const code = {
  title: "The code behind it",
  Snippet: ReactSnippet,
  source: ReactSnippetSource,
};

export const Route = createFileRoute("/react")({
  head: () => ({
    meta: pageMeta("React analytics workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      // The workbench's Base UI selects (docs/src/showcases/ui/DemoSelect.tsx).
      { rel: "stylesheet", href: demoSelectStylesheet },
      { rel: "stylesheet", href: reactWorkbenchStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: ReactRoute,
});

function ReactRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        code={code}
        proofArt={FRAMEWORK_PROOF_ART}
        description={description}
        eyebrow="REACT / CONTROLLED ANALYTICS"
        framework="react"
        guide="/docs/frameworks/react/"
        packageName="@sheetwrite/react"
        panels={panels}
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
