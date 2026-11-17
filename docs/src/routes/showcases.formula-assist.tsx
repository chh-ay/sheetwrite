import { pageMeta } from "@docs/lib/seo.js";
import {
  DEPARTMENTS,
  FORMULA_COUNT,
  OPEN_CELLS,
} from "@docs/showcases/scenarios/formula-assist.js";
import FormulaAssistSnippet from "@docs/showcases/snippets/formula-assist.mdx";
import FormulaAssistSnippetSource from "@docs/showcases/snippets/formula-assist.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { DemoVideo, type DemoTake } from "../showcases/formula-assist/DemoVideo.js";
import { FormulaAssistStage } from "../showcases/formula-assist/FormulaAssistStage.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";

import demoStylesheet from "../styles/showcases/demo-video.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/formula-assist")({
  head: () => ({
    meta: pageMeta(
      "Formula assist — Sheetwrite showcases",
      "The formula bar predicts the rest of the formula from its neighbours and shows it as ghost text; Tab takes it. Try it on a budget and watch the recorded demo.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
      { rel: "stylesheet", href: demoStylesheet },
    ],
  }),
  component: FormulaAssistShowcase,
});

const MEDIA = "/media/formula-assist";

function take(name: "wide" | "narrow", width: number, height: number): DemoTake {
  return {
    width,
    height,
    poster: `${MEDIA}/${name}-poster.webp`,
    loop: { mp4: `${MEDIA}/${name}-loop.mp4`, webm: `${MEDIA}/${name}-loop.webm` },
    full: { mp4: `${MEDIA}/${name}-demo.mp4`, webm: `${MEDIA}/${name}-demo.webm` },
  };
}

/** Recorded by docs/src/figures/record-formula-assist.ts at 60 fps. */
const WIDE = take("wide", 1280, 720);
const NARROW = take("narrow", 390, 700);
const DEMO_LENGTH = "1:01";

function FormulaAssistShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{
          title: "The code behind it",
          Snippet: FormulaAssistSnippet,
          source: FormulaAssistSnippetSource,
        }}
        explain={
          <>
            <ShowcaseSection id="formula-assist-demo" title="Watch it">
              <Island
                component={DemoVideo}
                hydrate="visible"
                name="showcase-formula-assist-video"
                props={{
                  wide: WIDE,
                  narrow: NARROW,
                  label:
                    "A recorded session: totals, a share and a lookup typed in the formula bar",
                  duration: DEMO_LENGTH,
                }}
              />
            </ShowcaseSection>
            <ShowcaseSection id="formula-assist-how" title="How it predicts">
              <ul>
                <li>
                  The formulas above and below the cell, or left and right of it, moved to it as a
                  fill would move them. When both sides agree on one, the cell almost surely
                  continues it; a formula only one side gives is not suggested.
                </li>
                <li>
                  The one function or sheet name the typed letters can start, and the brackets that
                  close calls with all their arguments.
                </li>
                <li>
                  A suggestion shows only when the benchmark measured it right at least 90% of the
                  time, from the workbook alone: no network, no AI.
                </li>
              </ul>
            </ShowcaseSection>
          </>
        }
        eyebrow="Formulas"
        facts={[
          { label: "Departments", value: String(DEPARTMENTS.length) },
          { label: "Formulas", value: String(FORMULA_COUNT) },
          { label: "Add-on", value: "@sheetwrite/formula-assist", code: true },
        ]}
        guide={{
          href: "/docs/features/formulas/formula-assist/",
          label: "Read the formula assist guide",
        }}
        id="formula-assist"
        stage={
          <Island
            component={FormulaAssistStage}
            name="showcase-formula-assist"
            props={{ openCells: Object.keys(OPEN_CELLS).length }}
          />
        }
        task={
          <>
            Pick an empty total and type <code>=</code> in the formula bar. The rest of the formula
            appears as ghost text; Tab takes it.
          </>
        }
        title="Type less, check more"
      />
    </NoHydration>
  );
}
