import { createGridFromSnapshot, initSheetwrite, type Grid, type Theme } from "@sheetwrite/core";
import { createFormulaBar, createNameBox, type ShellPiece } from "@sheetwrite/core/shell";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { SiteTopbar } from "../components/SiteTopbar.js";
import { errorText } from "../lib/errors.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { ActionError, pendingProps, useAction } from "../lib/use-action.js";
import { CapabilityHero } from "./CapabilityHero.js";
import {
  applyNumberFormat,
  applyStyleCommand,
  createFormattingSnapshot,
  FORMAT_OPTIONS,
  FORMATTING_TARGET,
  roundTripFormatting,
  STYLE_COMMANDS,
} from "./scenarios/formatting.js";
import { siteGridTheme } from "./site-grid-theme.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

declare global {
  interface Window {
    __sheetwriteFormattingGrid?: Grid;
  }
}

const ROW_HEIGHT = 42;
const theme = (): Partial<Theme> => ({ ...siteGridTheme(), rowHeight: ROW_HEIGHT });
type RoundTrip = Awaited<ReturnType<typeof roundTripFormatting>>;

export default function FormattingShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const formulaRef = useRef<HTMLDivElement>(null);
  const importedHostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const importedRef = useRef<Grid | null>(null);
  const [status, setStatus] = useState("Loading the budget…");
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [format, setFormat] = useState<string>("$#,##0.00");
  const [report, setReport] = useState<RoundTrip | null>(null);
  const action = useAction();

  useEffect(() => {
    const host = hostRef.current;
    const formulaHost = formulaRef.current;
    if (!host || !formulaHost) return;

    let disposed = false;
    const pieces: ShellPiece[] = [];
    void initSheetwrite()
      .then(() => {
        if (disposed) return;
        const grid = createGridFromSnapshot(host, createFormattingSnapshot(), {
          theme: theme(),
          config: { toolbar: false },
        });
        grid.setSelection({ kind: "range", range: FORMATTING_TARGET });
        pieces.push(createNameBox(formulaHost, grid), createFormulaBar(formulaHost, grid));
        gridRef.current = grid;
        window.__sheetwriteFormattingGrid = grid;
        setStatus("Ready · editing B3:C3");
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!disposed) setBootError(errorText(error));
      });

    const stopTheme = observeSiteTheme(() => {
      gridRef.current?.replaceTheme(theme());
      importedRef.current?.replaceTheme(theme());
    });

    return () => {
      disposed = true;
      stopTheme();
      for (const piece of pieces) piece.destroy();
      gridRef.current?.destroy();
      gridRef.current = null;
      importedRef.current = null;
      delete window.__sheetwriteFormattingGrid;
    };
  }, []);

  useEffect(() => {
    const host = importedHostRef.current;
    if (!host || !report) return;
    const imported = createGridFromSnapshot(host, report.snapshot, {
      theme: theme(),
      config: { toolbar: false },
    });
    importedRef.current = imported;

    return () => {
      imported.destroy();
      importedRef.current = null;
    };
  }, [report]);

  const run = (command: (grid: Grid) => unknown) => {
    void action.run(
      () => {
        const grid = gridRef.current;
        if (!grid) throw new Error("The budget is not ready yet");
        setReport(null);
        return command(grid);
      },
      (cause) => `Formatting action failed: ${errorText(cause)}`,
    );
  };

  return (
    <div className="sw-formatting-frame">
      <SiteTopbar active="formatting" />
      <main className="sw-formatting" id="main-content">
        <CapabilityHero
          eyebrow="Formatting studio / real workbook"
          title="Formatting & number formats"
          description="An operating budget with a point of view. Shape the type, make the numbers legible, then prove the workbook keeps its formatting through XLSX."
          facts={[
            { label: "Workbook", value: "Q1 operating budget" },
            { label: "Number formats", value: "7 · mixed in one column" },
            { label: "Proof", value: "Export → decode → compare" },
          ]}
        />
        <section
          aria-label="Live budget and formatting controls"
          className="sw-formatting-workspace"
        >
          <div className="sw-formatting-ledger">
            <div className="sw-formatting-toolbar">
              <strong>Northstar / Finance</strong>
              <span role="status" data-testid="formatting-status">
                {status}
              </span>
            </div>
            <div className="sw-formatting-formula" ref={formulaRef} />
            <div aria-label="Operating budget" className="sw-formatting-grid" ref={hostRef} />
            <div className="sw-formatting-caption">
              Negative variance is highlighted by a live conditional rule. Edit the actuals to
              change it.
            </div>
          </div>
          <aside className="sw-formatting-controls" aria-label="Formatting inspector">
            <div>
              <h2>Make it yours</h2>
              <p>
                Controls style the revenue pair <strong>B3:C3</strong>. Other cells remain a
                reference palette.
              </p>
            </div>
            <fieldset disabled={!ready || action.pending}>
              <legend>Emphasis & decoration</legend>
              <div className="sw-formatting-buttons">
                {STYLE_COMMANDS.map((command) => (
                  <button
                    key={command}
                    onClick={() =>
                      run((grid) => {
                        applyStyleCommand(grid, command);
                        setStatus(`${command} applied · B3:C3`);
                      })
                    }
                    type="button"
                  >
                    {command}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={!ready || action.pending}>
              <legend>Number format</legend>
              <div className="sw-formatting-buttons">
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    aria-pressed={format === option.code}
                    key={option.label}
                    onClick={() =>
                      run((grid) => {
                        applyNumberFormat(grid, option.code);
                        setFormat(option.code);
                        setStatus(`${option.label} applied · B3:C3`);
                      })
                    }
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={!ready || action.pending}>
              <legend>Font family</legend>
              <div className="sw-formatting-buttons">
                {["Arial", "Georgia", "Courier New", "Northstar Unavailable Font"].map((family) => (
                  <button
                    key={family}
                    onClick={() =>
                      run((grid) => {
                        grid.styleRange(FORMATTING_TARGET, { fontFamily: family });
                        setStatus(`${family} applied · B3:C3`);
                      })
                    }
                    type="button"
                  >
                    {family === "Northstar Unavailable Font" ? "Theme fallback" : family}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={!ready || action.pending}>
              <legend>Placement & size</legend>
              <div className="sw-formatting-buttons">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() => run((grid) => grid.styleRange(FORMATTING_TARGET, { align }))}
                    type="button"
                  >
                    Align {align}
                  </button>
                ))}
                {(["top", "middle", "bottom"] as const).map((verticalAlign) => (
                  <button
                    key={verticalAlign}
                    onClick={() =>
                      run((grid) => grid.styleRange(FORMATTING_TARGET, { verticalAlign }))
                    }
                    type="button"
                  >
                    {verticalAlign}
                  </button>
                ))}
                <button
                  onClick={() =>
                    run((grid) => grid.styleRange(FORMATTING_TARGET, { fontSize: 18 }))
                  }
                  type="button"
                >
                  18 px
                </button>
                <button
                  onClick={() => run((grid) => grid.styleRange(FORMATTING_TARGET, { wrap: true }))}
                  type="button"
                >
                  Wrap
                </button>
              </div>
            </fieldset>
            <p>
              General explicitly opts out of the column’s currency format. Column G demonstrates all
              seven formats at once.
            </p>
            <ActionError error={bootError ?? action.error} />
          </aside>
        </section>
        <section aria-labelledby="formatting-proof-title" className="sw-formatting-proof">
          <header>
            <div>
              <h2 id="formatting-proof-title">Not just a screenshot. A workbook.</h2>
              <p>
                Export the current edits to XLSX bytes, decode them with @sheetwrite/xlsx, compare
                effective cell styles, column defaults and conditional rules, then mount the
                imported workbook below.
              </p>
            </div>
            <button
              disabled={!ready || action.pending}
              {...pendingProps(action.pending)}
              onClick={() =>
                run(async (grid) => {
                  const result = await roundTripFormatting(grid);
                  setReport(result);
                })
              }
              type="button"
            >
              Export → re-import XLSX
            </button>
          </header>
          <output aria-live="polite" data-testid="formatting-roundtrip">
            {report
              ? `${report.differences.length === 0 ? "Verified" : "Mismatch"} · ${report.checkedCells} cells compared · ${report.byteLength.toLocaleString("en-US")} XLSX bytes · ${report.differences.length} differences · ${report.warnings.length} warnings`
              : "Not run — the proof uses your current workbook, including live edits."}
          </output>
          {report && (
            <>
              <div
                aria-label="Re-imported operating budget"
                className="sw-formatting-imported"
                ref={importedHostRef}
              />
              {report.differences.length > 0 && <p>{report.differences.join(", ")}</p>}
              {report.warnings.map((warning, index) => (
                <p key={`${warning.code}-${index}`}>{warning.message}</p>
              ))}
            </>
          )}
        </section>
        <section aria-label="Formatting behavior and boundaries" className="sw-formatting-notes">
          <article>
            <h2>Typography, with a safety net</h2>
            <p>
              Georgia, Arial and Courier New coexist with the theme font. A deliberately unavailable
              family demonstrates fallback. The ledger includes bold, italic, underline, strike,
              wrap, three alignments and independently styled border sides.
            </p>
          </article>
          <article>
            <h2>Values stay values</h2>
            <p>
              General, Number, Currency, Accounting, Percentage, Date and Scientific change display,
              not stored numbers. G3 opts out of a currency column with General; G15 inherits the
              column default. Negative variances retain a minus sign as well as their conditional
              fill.
            </p>
          </article>
          <article>
            <h2>Host-owned presentation</h2>
            <p>
              The controls are host UI calling GridActions and styleRange. Font availability remains
              a browser concern. For independent file fixtures and broader fidelity boundaries, open{" "}
              <Link to="/showcases/interoperability/">spreadsheet interoperability</Link> or the{" "}
              <a href="/docs/guides/styling/">styling guide</a>.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
