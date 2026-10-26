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

const TRIES = [
  "Select Sales!G2:G49, then Home › Editing › AutoSum under the last row.",
  "Pick a region cell and use Fill Color, Borders or Merge & Center.",
  "Change a unit price and watch Summary recalculate across sheets.",
  "Switch to Narrow: groups shrink, then fold into dropdowns, as in Excel.",
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
          eyebrow="Spreadsheet app / Excel-style ribbon"
          title="A spreadsheet app, not just a grid"
          description="The composable shell puts an Excel-style ribbon, name box, formula bar and sheet tabs around one grid. Everything here is the public API."
          facts={[
            { label: "Chrome", value: "Ribbon · formula bar · tabs" },
            { label: "Workbook", value: "2 sheets · cross-sheet SUMIF" },
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
            <ol>
              {TRIES.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <h2>How it is built</h2>
            <p>
              <code>createSpreadsheetShell(host, {"{ ribbon: true, grid }"})</code> mounts every
              piece. A grid on its own gets the same ribbon with{" "}
              <code>{"config: { ribbon: true }"}</code>. Each ribbon command calls{" "}
              <code>grid.actions</code>, so host chrome can call the same methods.
            </p>
            <p>
              Keyboard: Tab reaches the tabs, arrows move between them, Escape returns to the grid.
              Double-click a tab to hide the panel.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
