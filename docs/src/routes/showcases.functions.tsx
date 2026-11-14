import { pageMeta } from "@docs/lib/seo.js";
import { FAMILIES, FAMILY_ROWS_USED, FUNCTION_NAMES } from "@docs/showcases/scenarios/functions.js";
import FunctionsSnippet from "@docs/showcases/snippets/functions.mdx";
import FunctionsSnippetSource from "@docs/showcases/snippets/functions.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { FunctionEnginesDiagram } from "../art/explain-diagrams.js";
import { Island } from "../islands/Island.js";
import { FunctionsStage } from "../showcases/functions/FunctionsStage.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";

import artStylesheet from "../art/art.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/functions")({
  head: () => ({
    meta: pageMeta(
      "New Excel functions — Sheetwrite showcases",
      "Engineering, financial, statistics, information, LOOKUP, TRIMRANGE, GETPIVOTDATA and REGEX functions, calculated live as you change their inputs.",
    ),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: FunctionsShowcase,
});

/** What the panel shows of a family. */
function familyChoice(family: (typeof FAMILIES)[number]) {
  return {
    id: family.id,
    label: family.label,
    summary: family.summary,
    firstInput: family.inputs[0],
    formulaNames: family.formulas.map((formula) => formula.name),
  };
}

function FunctionsShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="functions-notes"
            figure={<FunctionEnginesDiagram />}
            title="Where they run"
          >
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
        }
        code={{
          title: "The code behind it",
          Snippet: FunctionsSnippet,
          source: FunctionsSnippetSource,
        }}
        eyebrow="Formulas"
        facts={[
          { label: "Families", value: FAMILIES.length.toLocaleString("en") },
          { label: "Functions shown", value: FUNCTION_NAMES.length.toLocaleString("en") },
          { label: "Engine", value: "@sheetwrite/formulas", code: true },
        ]}
        guide={{ href: "/docs/reference/formula-functions/", label: "Browse every function" }}
        id="functions"
        stage={
          <Island
            component={FunctionsStage}
            name="showcase-functions"
            props={{
              families: FAMILIES.map(familyChoice),
              firstFamily: familyChoice(FAMILIES[0]),
              rowsUsed: FAMILY_ROWS_USED,
            }}
          />
        }
        task={
          <>
            Pick a family of Excel functions that 0.7.0 adds, change an input, and watch each result
            recalculate. Column F reads every formula back with <code>FORMULATEXT</code>.
          </>
        }
        title="New Excel functions, calculated live"
      ></ShowcasePage>
    </NoHydration>
  );
}
