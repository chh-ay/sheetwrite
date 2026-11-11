import { pageMeta } from "@docs/lib/seo.js";
import { ORDER_ROWS, REGIONS } from "@docs/showcases/scenarios/dashboards.js";
import DashboardsSnippet from "@docs/showcases/snippets/dashboards.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { DashboardsStage } from "../showcases/dashboards/DashboardsStage.js";
import { ItemCountFact } from "../showcases/dashboards/ItemCountFact.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";

import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/dashboards")({
  head: () => ({
    meta: pageMeta(
      "Dashboards — Sheetwrite showcases",
      "A dashboard sheet of pivots and slicers: move and resize items with the mouse or the keyboard, add a pivot, pick slicer values, and undo each change.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: DashboardsShowcase,
});

function DashboardsShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: DashboardsSnippet }}
        eyebrow="Analysis"
        facts={[
          { label: "Orders", value: ORDER_ROWS.toLocaleString("en") },
          {
            label: "Items",
            value: <Island component={ItemCountFact} name="showcase-dashboards-items" props={{}} />,
          },
          { label: "Layout", value: "Twelve-column grid" },
        ]}
        guide={{ href: "/docs/features/analysis/dashboards/", label: "Read the dashboards guide" }}
        id="dashboards"
        stage={
          <Island
            component={DashboardsStage}
            name="showcase-dashboards"
            props={{
              firstRegion: REGIONS[0],
            }}
          />
        }
        task={
          <>
            Filter a dashboard of KPI cards, a PivotChart and a pivot with its slicers, then move,
            resize and add items. Undo takes back each change.
          </>
        }
        title="A dashboard that filters together"
      >
        <ShowcaseSection id="dashboards-rules" title="How a dashboard works">
          <ul>
            <li>
              A dashboard is a sheet with <code>kind: "dashboard"</code>. Its pivots compute from
              the Orders table without writing output cells.
            </li>
            <li>
              A slicer filters every pivot, PivotChart and KPI card whose table reaches its column,
              as an Excel slicer filters its connected PivotTables. Its selection is saved and
              undone.
            </li>
            <li>
              A KPI card shows a data model measure in the slicers' filter context. Items never
              overlap: a move or resize into another item's place is refused, and the view says so.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
