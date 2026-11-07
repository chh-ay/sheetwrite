import { pageMeta } from "@docs/lib/seo.js";
import { FORMULA_COUNT, LOOKUPS, ROWS } from "@docs/showcases/scenarios/recalculation.js";
import RecalculationSnippet from "@docs/showcases/snippets/recalculation.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { FirstCalculationFact } from "../showcases/recalculation/FirstCalculationFact.js";
import { RecalculationStage } from "../showcases/recalculation/RecalculationStage.js";

import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/recalculation")({
  head: () => ({
    meta: pageMeta(
      "Live recalculation — Sheetwrite showcases",
      "Edit a cell under 100,000 formulas and move 1,000 lookups over 100,000 rows; the page times each recalculation and paint in your browser.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: RecalculationShowcase,
});

function RecalculationShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: RecalculationSnippet }}
        eyebrow="Performance"
        facts={[
          { label: "Rows", value: ROWS.toLocaleString("en") },
          { label: "Formulas", value: FORMULA_COUNT.toLocaleString("en") },
          {
            label: "Load and first calculation",
            value: (
              <Island
                component={FirstCalculationFact}
                name="showcase-recalculation-fact"
                props={{}}
              />
            ),
          },
        ]}
        guide={{
          href: "/docs/concepts/calculation-engine/",
          label: "How the engine recalculates",
        }}
        id="recalculation"
        stage={<Island component={RecalculationStage} name="showcase-recalculation" props={{}} />}
        task={
          <>
            Change one cell that {ROWS.toLocaleString("en")} formulas read, or move{" "}
            {LOOKUPS.toLocaleString("en")} lookups. The page times each recalculation and paint in
            your browser.
          </>
        }
        title={`Recalculate ${ROWS.toLocaleString("en")} formulas, live`}
      >
        <ShowcaseSection id="recalculation-notes" title="What the timings include">
          <ul>
            <li>
              Last recalculation runs from the edit call until a dependent total is readable: the
              engine marks the formulas that read the cell and calculates each once.
            </li>
            <li>
              Frame painted adds the next frame the browser draws. Your device, browser and other
              tabs change every number on this page.
            </li>
            <li>
              The release benchmarks measure the same work on fixed machines; see the performance
              pages for their results.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
