import { functionCount } from "@docs/generated/formula-summary.json";
import { pageMeta } from "@docs/lib/seo.js";
import { FORMULA_PANELS, ORDER_ROWS, PLAYGROUND } from "@docs/showcases/scenarios/formulas.js";
import FormulasSetupSnippet from "@docs/showcases/snippets/formulas-setup.mdx";
import FormulasSetupSnippetSource from "@docs/showcases/snippets/formulas-setup.mdx?source";
import { cellA1 } from "@sheetwrite/core";
import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { EngineApiDiagram } from "../showcases/art/explain-diagrams.js";
import { FormulasStage } from "../showcases/formulas/FormulasStage.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";

import artStylesheet from "../showcases/art/art.css?url";
import stylesheet from "../styles/showcases/formulas.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

const description =
  "Thirteen live formulas over 20,000 orders: GROUPBY, PIVOTBY, statistics, LINEST, NPV, LAMBDA and spills. Change the data and every answer recalculates.";

export const Route = createFileRoute("/showcases/formulas")({
  head: () => ({
    meta: pageMeta("Formula analysis with the full engine — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: FormulasShowcase,
});

/** Each panel's anchor in A1 notation, for the recipe list. */
const ADDRESSES = Object.fromEntries(
  FORMULA_PANELS.map((panel) => [panel.id, cellA1(panel.row, panel.col)]),
);
const FAMILIES = [...new Set(FORMULA_PANELS.flatMap((panel) => panel.families))];

function FormulasShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="formulas-engines"
            figure={<EngineApiDiagram />}
            title="Two engines, one API"
          >
            <p>
              <code>@sheetwrite/wasm</code> is the default engine. <code>@sheetwrite/formulas</code>{" "}
              is the same engine with the full function set. Select it once, before you create a
              grid. The function families 0.7.0 adds are on the{" "}
              <a href="/showcases/functions/">functions showcase</a>.
            </p>
            <ul aria-label="Families on this page" class="sw-fx-families">
              <For each={FAMILIES}>{(family) => <li>{family}</li>}</For>
            </ul>
          </ShowcaseSection>
        }
        code={{
          title: "Select the full engine",
          Snippet: FormulasSetupSnippet,
          source: FormulasSetupSnippetSource,
        }}
        eyebrow="Formulas"
        facts={[
          { label: "Function names", value: functionCount.toLocaleString("en") },
          { label: "Orders", value: ORDER_ROWS.toLocaleString("en") },
          { label: "Live formulas", value: FORMULA_PANELS.length.toLocaleString("en") },
        ]}
        guide={{
          href: "/docs/reference/formula-functions/",
          label: "See every supported function",
        }}
        id="formulas"
        stage={
          <Island
            component={FormulasStage}
            name="showcase-formulas"
            props={{
              addresses: ADDRESSES,
              playgroundAddress: cellA1(PLAYGROUND.row, PLAYGROUND.col),
            }}
          />
        }
        task={
          <>
            {FORMULA_PANELS.length} live formulas summarize {ORDER_ROWS.toLocaleString("en")}{" "}
            orders: grouping, statistics, a regression, finance, a database query, LAMBDA helpers
            and regex. Change the data and every answer recalculates.
          </>
        }
        title="Ask the data. Watch the answer spill."
      ></ShowcasePage>
    </NoHydration>
  );
}
