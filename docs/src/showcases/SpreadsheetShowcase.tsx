import type { Grid } from "@sheetwrite/core";
import { useEffect, useRef, useState } from "react";

import { Icon } from "../components/Icon.js";
import { errorText } from "../lib/errors.js";
import { ActionError } from "../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseKeys,
  ShowcaseLayout,
  ShowcaseSection,
  type ShowcaseStep,
  ShowcaseSteps,
} from "./layout/ShowcaseLayout.js";
import {
  createSpreadsheetScenario,
  SALES_ROWS,
  salesOperations,
  salesWorkbook,
} from "./scenarios/spreadsheet.js";
import SpreadsheetSetupSnippet from "./snippets/spreadsheet-setup.mdx";
import { DemoButton } from "./ui/DemoButton.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

/** Widths for the fold demo: Excel's ribbon at a laptop width, then a narrow window. */
const WIDTHS = [
  { id: "wide", label: "Wide", width: null },
  { id: "narrow", label: "Narrow", width: 640 },
] as const;
type WidthId = (typeof WIDTHS)[number]["id"];

/** The workbook's sheets and cross-sheet formulas, counted from the workbook the page loads. */
const SHEET_COUNT = salesWorkbook().sheets.length;
const FORMULA_COUNT = salesOperations().filter(
  (operation) => operation.op === "set" && operation.value.kind === "formula",
).length;

/** The ribbon's keyboard model, as the shell implements it. */
const KEYS = [
  { keys: ["Tab"], does: "Reach the ribbon tabs" },
  { keys: ["←", "→"], does: "Move between tabs" },
  { keys: ["Esc"], does: "Return to the grid" },
] as const;

/** The walkthrough; the last step gets its fold control at render. */
function spreadsheetSteps(foldRibbon: ShowcaseStep["control"]): ShowcaseStep[] {
  return [
    {
      action: "Total a column",
      how: `Select Sales!G2:G${SALES_ROWS + 1}, then Home › Editing › AutoSum.`,
      result: "A SUM lands under the last row.",
    },
    {
      action: "Format a region",
      how: "Pick a region cell, then Fill Color, Borders or Merge & Center.",
      result: "The format is stored on the cells and survives XLSX export.",
    },
    {
      action: "Change a price",
      how: "Edit a unit price on the Sales sheet.",
      result: "Summary recalculates across sheets.",
    },
    {
      action: "Read a note",
      how: "Point at the amber corner on Sales!G3 to read it. Select the cell and press Shift+F2 to edit.",
      result: "The note opens beside the cell. Clear the note to delete it.",
    },
    {
      action: "Use the right-click menu",
      how: "Right-click a cell, then Insert › Row above.",
      result: "Undo removes the new row.",
    },
    {
      action: "Narrow the window",
      how: "Switch between a wide and a narrow window.",
      result:
        "The ribbon turns compact, one row like Excel's simplified ribbon, and groups fold into dropdowns.",
      control: foldRibbon,
    },
  ];
}

export default function SpreadsheetShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState<WidthId>("wide");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scenario = createSpreadsheetScenario(host);
    let disposed = false;
    scenario.ready
      .then(() => {
        if (disposed) return;
        const grid = scenario.grid();
        if (grid) window.__sheetwriteSpreadsheetGrid = grid;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(errorText(cause));
      });
    return () => {
      disposed = true;
      scenario.dispose();
      delete window.__sheetwriteSpreadsheetGrid;
    };
  }, []);

  const frameWidth = WIDTHS.find((option) => option.id === width)?.width ?? null;

  return (
    <ShowcaseLayout
      code={{ title: "How it is built", Snippet: SpreadsheetSetupSnippet }}
      controls={
        <>
          <ShowcaseControlGroup title="Try it">
            <ShowcaseSteps
              steps={spreadsheetSteps(
                <DemoButton
                  disabled={!ready}
                  onClick={() => setWidth(width === "narrow" ? "wide" : "narrow")}
                >
                  <Icon name={width === "narrow" ? "monitor" : "laptop"} />
                  {width === "narrow" ? "Unfold the ribbon" : "Fold the ribbon"}
                </DemoButton>,
              )}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title="Keyboard"
            description="Double-click a tab to hide or show the panel."
          >
            <ShowcaseKeys keys={KEYS} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <div
            className="sw-spreadsheet-window"
            data-testid="spreadsheet-window"
            style={frameWidth === null ? undefined : { maxWidth: `${frameWidth}px` }}
          >
            <div className="sw-showcase__grid" ref={hostRef} />
          </div>
          <ActionError error={error} />
        </>
      }
      demoActions={
        <div aria-label="Window width" className="sw-spreadsheet-widths" role="group">
          {WIDTHS.map((option) => (
            <DemoButton
              aria-pressed={width === option.id}
              data-size="sm"
              disabled={!ready}
              key={option.id}
              onClick={() => setWidth(option.id)}
              variant="quiet"
            >
              {option.label}
            </DemoButton>
          ))}
        </div>
      }
      demoLabel="Live spreadsheet"
      demoTitle="Northwind / 2026 sales.xlsx"
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
      task="The composable shell puts an Excel-style ribbon, name box, formula bar and sheet tabs around one grid. Try the ribbon on a sales workbook, then narrow the window."
      title="A spreadsheet app, not just a grid"
    >
      <ShowcaseSection id="spreadsheet-commands" title="One command model">
        <p>
          Every ribbon command calls <code>grid.actions</code>, so your own toolbar can call the
          same methods. The Targets sheet is a saved query that Data › Refresh All reloads; the{" "}
          <a href="/showcases/queries/">queries showcase</a> shows saved queries in depth.
        </p>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
