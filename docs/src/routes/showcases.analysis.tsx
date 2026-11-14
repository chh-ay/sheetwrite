import { pageMeta } from "@docs/lib/seo.js";
import {
  DIP_REGION,
  LAUNCH_MONTH,
  LAUNCH_PRODUCT,
  PRICE_CHANGE_MONTH,
  PRICE_CHANGE_RATE,
  STORY_MONTHS,
  STORY_ORDER_ROWS,
} from "@docs/showcases/scenarios/orders-story.js";
import AnalysisSetupSnippet from "@docs/showcases/snippets/analysis-setup.mdx";
import AnalysisSetupSnippetSource from "@docs/showcases/snippets/analysis-setup.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { ChartReadsCellsDiagram } from "../art/explain-diagrams.js";
import { Island } from "../islands/Island.js";
import { AnalysisStage } from "../showcases/analysis/AnalysisStage.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import { ANALYSIS_WORKBOOK_TITLE } from "../showcases/scenarios/analysis.js";

import artStylesheet from "../art/art.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/analysis")({
  head: () => ({
    meta: pageMeta(
      "Pivot tables and charts — Sheetwrite showcases",
      "A pivot table and a live chart over two years of orders. Edit an order and both update in place; rearrange the pivot from its field list.",
    ),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
    ],
  }),
  component: AnalysisShowcase,
});

/** `2026-03` as "March 2026", for the story text. */
function monthName(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (index ?? 1) - 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function AnalysisShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="analysis-chart"
            figure={<ChartReadsCellsDiagram />}
            title="The chart reads cells"
          >
            <p>
              The chart reads cells, not the pivot: point it at any range, and it redraws when those
              cells change. Pivots over related tables and measures live on the{" "}
              <a href="/showcases/data-model/">data model showcase</a>.
            </p>
          </ShowcaseSection>
        }
        code={{
          title: "How it is built",
          Snippet: AnalysisSetupSnippet,
          source: AnalysisSetupSnippetSource,
        }}
        eyebrow="Analysis"
        facts={[
          { label: "Orders", value: STORY_ORDER_ROWS.toLocaleString("en") },
          { label: "Months", value: String(STORY_MONTHS) },
          { label: "Pivot", value: "Revenue by month and region" },
        ]}
        guide={{
          href: "/docs/features/analysis/pivot-tables/",
          label: "Read the pivot table guide",
        }}
        id="analysis"
        stage={
          <Island
            component={AnalysisStage}
            name="showcase-analysis"
            props={{
              workbookTitle: ANALYSIS_WORKBOOK_TITLE,
              dipRegion: DIP_REGION,
              priceChangeMonth: monthName(PRICE_CHANGE_MONTH),
              priceChangePercent: Math.round(PRICE_CHANGE_RATE * 100),
              launchProduct: LAUNCH_PRODUCT,
              launchMonth: monthName(LAUNCH_MONTH),
            }}
          />
        }
        task="A pivot table and a live chart over two years of orders. Edit any order and both update in place; rearrange the pivot from its field list."
        title="Pivot it, chart it, then change the data"
      ></ShowcasePage>
    </NoHydration>
  );
}
