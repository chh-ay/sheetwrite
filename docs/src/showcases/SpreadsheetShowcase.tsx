import type { Grid } from "@sheetwrite/core";
import { useEffect, useRef, useState } from "react";

import { SiteTopbar } from "../components/SiteTopbar.js";
import { errorText } from "../lib/errors.js";
import { ActionError } from "../lib/use-action.js";
import { CapabilityHero } from "./CapabilityHero.js";
import { createSpreadsheetScenario } from "./scenarios/spreadsheet.js";

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

/** Each step: what to do, how, and what the grid shows back. */
const TRIES = [
  {
    action: "Total a column",
    how: "Select Sales!G2:G49, then Home › Editing › AutoSum.",
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
    how: "Right-click a cell, then Insert › Row above. The arrow keys work too.",
    result: "Undo removes the new row.",
  },
  {
    action: "Narrow the window",
    how: "Use the button to switch between a wide and narrow window.",
    result: "Groups shrink, then fold into dropdowns, as in Excel.",
    control: "fold-ribbon",
  },
] as const;

/** The ribbon's keyboard model, as the shell implements it. */
const KEYS = [
  { keys: ["Tab"], does: "Reach the ribbon tabs" },
  { keys: ["←", "→"], does: "Move between tabs" },
  { keys: ["Esc"], does: "Return to the grid" },
] as const;

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
    <div className="sw-spreadsheet-frame">
      <SiteTopbar active="spreadsheet" />
      <main className="sw-spreadsheet" id="main-content">
        <CapabilityHero
          eyebrow="CAPABILITY / SPREADSHEET APP"
          title="A spreadsheet app, not just a grid"
          description="The composable shell puts an Excel-style ribbon, name box, formula bar and sheet tabs around one grid. Everything here is the public API."
          facts={[
            { label: "Chrome", value: "Ribbon, formula bar, tabs" },
            { label: "Workbook", value: "2 sheets, cross-sheet SUMIF" },
            { label: "Setup", value: "createSpreadsheetShell({ ribbon: true })" },
          ]}
        />
        <section aria-label="Live spreadsheet" className="sw-spreadsheet-workspace">
          <div className="sw-spreadsheet-bar">
            <strong>Northwind / 2026 sales.xlsx</strong>
            <div aria-label="Window width" className="sw-spreadsheet-widths" role="group">
              {WIDTHS.map((option) => (
                <button
                  aria-pressed={width === option.id}
                  disabled={!ready}
                  key={option.id}
                  onClick={() => setWidth(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="sw-spreadsheet-window"
            data-testid="spreadsheet-window"
            style={frameWidth === null ? undefined : { maxWidth: `${frameWidth}px` }}
          >
            <div className="sw-spreadsheet-host" ref={hostRef} />
          </div>
          <ActionError error={error} />
        </section>
        <section aria-labelledby="spreadsheet-try" className="sw-spreadsheet-notes">
          <div>
            <h2 id="spreadsheet-try">Try it</h2>
            <ol className="sw-spreadsheet-steps">
              {TRIES.map((step) => (
                <li key={step.action}>
                  <strong>{step.action}</strong>
                  <span>{step.how}</span>
                  {"control" in step && step.control === "fold-ribbon" && (
                    <button
                      disabled={!ready}
                      onClick={() => setWidth(width === "narrow" ? "wide" : "narrow")}
                      type="button"
                    >
                      {width === "narrow" ? "Unfold the ribbon" : "Fold the ribbon"}
                    </button>
                  )}
                  <span className="sw-spreadsheet-steps__result">{step.result}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2>How it is built</h2>
            <pre className="sw-spreadsheet-code">
              <code>
                {"// The full app: ribbon, name box, formula bar, tabs\n"}
                {"createSpreadsheetShell(host, { ribbon: true, grid });\n\n"}
                {"// The same ribbon on a grid of its own\n"}
                {"config: { ribbon: true }"}
              </code>
            </pre>
            <p>
              Every ribbon command calls <code>grid.actions</code>, so your own toolbar can call the
              same methods.
            </p>
            <h3>Keyboard</h3>
            <dl className="sw-spreadsheet-keys">
              {KEYS.map((entry) => (
                <div key={entry.does}>
                  <dt>
                    {entry.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{entry.does}</dd>
                </div>
              ))}
            </dl>
            <p>Hide or show the panel (double-click a tab).</p>
          </div>
        </section>
      </main>
    </div>
  );
}
