import { pageMeta } from "@docs/lib/seo.js";
import { FORMULA_COUNT, ORDER_COUNT, SORTS, type SortId } from "@docs/showcases/scenarios/sort.js";
import SortSnippet from "@docs/showcases/snippets/sort.mdx";
import SortSnippetSource from "@docs/showcases/snippets/sort.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { SortModesDiagram } from "../art/explain-diagrams.js";
import { Island } from "../islands/Island.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import { SortStage } from "../showcases/sort/SortStage.js";

import artStylesheet from "../art/art.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/sort")({
  head: () => ({
    meta: pageMeta(
      "Sort in place — Sheetwrite showcases",
      "Sort orders in place as Excel does, or sort only the view, and see which formulas follow. Includes the Sort panel and undo.",
    ),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: SortShowcase,
});

const SORT_IDS = Object.keys(SORTS) as SortId[];

function SortShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="sort-rules"
            figure={<SortModesDiagram />}
            title="How the sort treats the workbook"
          >
            <ul>
              <li>
                Values, formulas, styles and notes move with their row. A formula that reads its own
                row, like <code>=D1*E1</code>, keeps reading it.
              </li>
              <li>Formulas outside the range keep their references, so they read the new order.</li>
              <li>
                Text sorts without case in Excel's order, and blank cells are last in both
                directions.
              </li>
              <li>
                Collaborators receive an in-place sort as one transaction. A view sort is saved with
                the sheet and exports to Excel as its sort state.
              </li>
            </ul>
          </ShowcaseSection>
        }
        code={{ title: "The code behind it", Snippet: SortSnippet, source: SortSnippetSource }}
        eyebrow="Data"
        facts={[
          { label: "Orders", value: ORDER_COUNT.toLocaleString("en") },
          { label: "Formulas", value: FORMULA_COUNT.toLocaleString("en") },
          { label: "Engine", value: "@sheetwrite/formulas", code: true },
        ]}
        guide={{
          href: "/docs/features/data/data-operations/#sort-cells-in-place",
          label: "Read the sort guide",
        }}
        id="sort"
        stage={
          <Island
            component={SortStage}
            name="showcase-sort"
            props={{
              sorts: SORT_IDS.map((id) => ({ id, label: SORTS[id].label })),
              orderCount: ORDER_COUNT,
            }}
          />
        }
        task={
          <>
            Sort {ORDER_COUNT} orders in place, as Excel does, or for the view only. Then check what
            the formulas on the Watch sheet read.
          </>
        }
        title="Sort the cells, or just the view"
      ></ShowcasePage>
    </NoHydration>
  );
}
