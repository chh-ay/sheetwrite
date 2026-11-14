import { pageMeta } from "@docs/lib/seo.js";
import {
  SALES_ROWS,
  salesOperations,
  salesWorkbook,
} from "@docs/showcases/scenarios/spreadsheet.js";
import SpreadsheetSetupSnippet from "@docs/showcases/snippets/spreadsheet-setup.mdx";
import SpreadsheetSetupSnippetSource from "@docs/showcases/snippets/spreadsheet-setup.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { CommandModelDiagram } from "../art/diagrams.js";
import { Island } from "../islands/Island.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import { SpreadsheetStage } from "../showcases/spreadsheet/SpreadsheetStage.js";

import artStylesheet from "../art/art.css?url";
import stylesheet from "../styles/showcases/spreadsheet.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/spreadsheet")({
  head: () => ({
    meta: pageMeta(
      "Spreadsheet app — Sheetwrite showcases",
      "A full spreadsheet app in the browser: an Excel-style ribbon, name box, formula bar, sheet tabs and a two-sheet sales workbook with cross-sheet formulas.",
    ),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: SpreadsheetShowcase,
});

/** The workbook's sheets and cross-sheet formulas, counted from the workbook the page loads. */
const SHEET_COUNT = salesWorkbook().sheets.length;
const FORMULA_COUNT = salesOperations().filter(
  (operation) => operation.op === "set" && operation.value.kind === "formula",
).length;

function SpreadsheetShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="spreadsheet-commands"
            figure={<CommandModelDiagram />}
            title="One command model"
          >
            <p>
              Every ribbon command calls <code>grid.actions</code>, so your own toolbar can call the
              same methods. The Targets sheet is a saved query that Data › Refresh All reloads; the{" "}
              <a href="/showcases/queries/">queries showcase</a> shows saved queries in depth.
            </p>
          </ShowcaseSection>
        }
        code={{
          title: "How it is built",
          Snippet: SpreadsheetSetupSnippet,
          source: SpreadsheetSetupSnippetSource,
        }}
        eyebrow="Spreadsheet app"
        facts={[
          { label: "Sheets", value: SHEET_COUNT.toLocaleString("en") },
          { label: "Orders", value: SALES_ROWS.toLocaleString("en") },
          { label: "Formulas", value: FORMULA_COUNT.toLocaleString("en") },
        ]}
        guide={{
          href: "/docs/tutorials/spreadsheet-app-with-ribbon/",
          label: "Build it step by step",
        }}
        id="spreadsheet"
        stage={
          <Island
            component={SpreadsheetStage}
            name="showcase-spreadsheet"
            props={{ salesLastRow: SALES_ROWS + 1 }}
          />
        }
        task="The composable shell puts an Excel-style ribbon, name box, formula bar and sheet tabs around one grid. Try the ribbon on a sales workbook, then narrow the window."
        title="A spreadsheet app, not just a grid"
      ></ShowcasePage>
    </NoHydration>
  );
}
