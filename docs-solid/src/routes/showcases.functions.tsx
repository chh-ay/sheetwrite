import { pageMeta } from "@docs/lib/seo.js";
import { FAMILIES, FUNCTION_NAMES } from "@docs/showcases/scenarios/functions.js";
import FunctionsSnippet from "@docs/showcases/snippets/functions.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { FunctionsStage } from "../showcases/functions/FunctionsStage.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";

import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/functions")({
  head: () => ({
    meta: pageMeta(
      "New Excel functions — Sheetwrite showcases",
      "Engineering, financial, statistics, information, LOOKUP, TRIMRANGE, GETPIVOTDATA and REGEX functions, calculated live as you change their inputs.",
    ),
    links: [
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: FunctionsShowcase,
});

function FunctionsShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: FunctionsSnippet }}
        eyebrow="Formulas"
        facts={[
          { label: "Families", value: FAMILIES.length.toLocaleString("en") },
          { label: "Functions shown", value: FUNCTION_NAMES.length.toLocaleString("en") },
          { label: "Engine", value: "@sheetwrite/formulas", code: true },
        ]}
        guide={{ href: "/docs/reference/formula-functions/", label: "Browse every function" }}
        id="functions"
        stage={<Island component={FunctionsStage} name="showcase-functions" props={{}} />}
        task={
          <>
            Pick a family of Excel functions that 0.7.0 adds, change an input, and watch each result
            recalculate. Column F reads every formula back with <code>FORMULATEXT</code>.
          </>
        }
        title="New Excel functions, calculated live"
      >
        <ShowcaseSection id="functions-notes" title="Where they run">
          <ul>
            <li>
              Engineering, financial, the Excel 2007 statistics names, byte text and{" "}
              <code>GETPIVOTDATA</code> run in the full engine, <code>@sheetwrite/formulas</code>.
            </li>
            <li>
              <code>LOOKUP</code>, <code>TRIMRANGE</code>, the information functions and the new
              math functions run in both engines.
            </li>
            <li>
              A reference to another workbook keeps its text, moves when you fill it, and shows{" "}
              <code>#REF!</code> until the workbook has values for the link.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
