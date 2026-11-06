import { createGridFromSnapshot, initSheetwrite, type Grid, type Theme } from "@sheetwrite/core";
import { createFormulaBar, createNameBox, type ShellPiece } from "@sheetwrite/core/shell";
import { useEffect, useRef, useState } from "react";

import { errorText } from "../lib/errors.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { ActionError, pendingProps, useAction } from "../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseLayout, ShowcaseSection } from "./layout/ShowcaseLayout.js";
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
import FormattingSnippet from "./snippets/formatting.mdx";
import { DemoButton } from "./ui/DemoButton.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

declare global {
  interface Window {
    __sheetwriteFormattingGrid?: Grid;
  }
}

/** A family no browser has, to show the fallback to the theme font. */
const UNAVAILABLE_FONT = "Northstar Unavailable Font";
const FONT_FAMILIES = ["Arial", "Georgia", "Courier New", UNAVAILABLE_FONT] as const;
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

  const disabled = !ready || action.pending;
  const styleButtons = (
    <div className="sw-formatting-buttons">
      {STYLE_COMMANDS.map((command) => (
        <DemoButton
          data-size="sm"
          disabled={disabled}
          key={command}
          onClick={() =>
            run((grid) => {
              applyStyleCommand(grid, command);
              setStatus(`${command} applied · B3:C3`);
            })
          }
        >
          {command}
        </DemoButton>
      ))}
    </div>
  );

  return (
    <ShowcaseLayout
      code={{ title: "How it is built", Snippet: FormattingSnippet }}
      controls={
        <>
          <ShowcaseControlGroup
            title="Emphasis and decoration"
            description={
              <>
                Controls style the revenue pair <strong>B3:C3</strong>; other cells stay a reference
                palette.
              </>
            }
          >
            {styleButtons}
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title="Number format"
            description="General opts out of the column's currency format. Column G shows every format at once."
          >
            <div className="sw-formatting-buttons">
              {FORMAT_OPTIONS.map((option) => (
                <DemoButton
                  aria-pressed={format === option.code}
                  data-size="sm"
                  disabled={disabled}
                  key={option.label}
                  onClick={() =>
                    run((grid) => {
                      applyNumberFormat(grid, option.code);
                      setFormat(option.code);
                      setStatus(`${option.label} applied · B3:C3`);
                    })
                  }
                >
                  {option.label}
                </DemoButton>
              ))}
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Font family">
            <div className="sw-formatting-buttons">
              {FONT_FAMILIES.map((family) => (
                <DemoButton
                  data-size="sm"
                  disabled={disabled}
                  key={family}
                  onClick={() =>
                    run((grid) => {
                      grid.styleRange(FORMATTING_TARGET, { fontFamily: family });
                      setStatus(`${family} applied · B3:C3`);
                    })
                  }
                >
                  {family === UNAVAILABLE_FONT ? "Theme fallback" : family}
                </DemoButton>
              ))}
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Placement and size">
            <div className="sw-formatting-buttons">
              {(["left", "center", "right"] as const).map((align) => (
                <DemoButton
                  data-size="sm"
                  disabled={disabled}
                  key={align}
                  onClick={() => run((grid) => grid.styleRange(FORMATTING_TARGET, { align }))}
                >
                  Align {align}
                </DemoButton>
              ))}
              {(["top", "middle", "bottom"] as const).map((verticalAlign) => (
                <DemoButton
                  data-size="sm"
                  disabled={disabled}
                  key={verticalAlign}
                  onClick={() =>
                    run((grid) => grid.styleRange(FORMATTING_TARGET, { verticalAlign }))
                  }
                >
                  {verticalAlign}
                </DemoButton>
              ))}
              <DemoButton
                data-size="sm"
                disabled={disabled}
                onClick={() => run((grid) => grid.styleRange(FORMATTING_TARGET, { fontSize: 18 }))}
              >
                18 px
              </DemoButton>
              <DemoButton
                data-size="sm"
                disabled={disabled}
                onClick={() => run((grid) => grid.styleRange(FORMATTING_TARGET, { wrap: true }))}
              >
                Wrap
              </DemoButton>
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title="Prove it in XLSX"
            description="Export the current edits, decode them with @sheetwrite/xlsx and compare styles, column defaults and conditional rules."
          >
            <DemoButton
              disabled={disabled}
              {...pendingProps(action.pending)}
              onClick={() =>
                run(async (grid) => {
                  const result = await roundTripFormatting(grid);
                  setReport(result);
                })
              }
              variant="primary"
            >
              Export, then re-import XLSX
            </DemoButton>
            <output
              aria-live="polite"
              className="sw-formatting-report"
              data-testid="formatting-roundtrip"
            >
              {report
                ? `${report.differences.length === 0 ? "Verified" : "Mismatch"} · ${report.checkedCells} cells compared · ${report.byteLength.toLocaleString("en-US")} XLSX bytes · ${report.differences.length} differences · ${report.warnings.length} warnings`
                : "Not run yet. The proof uses your current workbook, including live edits."}
            </output>
            <ActionError error={bootError ?? action.error} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <div className="sw-formatting-formula" ref={formulaRef} />
          <div aria-label="Operating budget" className="sw-formatting-grid" ref={hostRef} />
          <p className="sw-formatting-caption">
            Negative variance is highlighted by a live conditional rule. Edit the actuals to change
            it.
          </p>
        </>
      }
      demoActions={
        <span className="sw-formatting-status" data-testid="formatting-status" role="status">
          {status}
        </span>
      }
      demoLabel="Live budget"
      demoTitle="Northstar / Finance"
      eyebrow="Formatting"
      facts={[
        { label: "Number formats", value: FORMAT_OPTIONS.length.toLocaleString("en") },
        { label: "Style commands", value: STYLE_COMMANDS.length.toLocaleString("en") },
        { label: "Fonts", value: FONT_FAMILIES.length.toLocaleString("en") },
      ]}
      guide={{ href: "/docs/features/formatting/styles/", label: "Read the styling guide" }}
      id="formatting"
      task="Shape the type of an operating budget, make its numbers legible, then prove the workbook keeps its formatting through XLSX."
      title="Formatting and number formats"
    >
      {report && (
        <ShowcaseSection id="formatting-imported" title="The re-imported workbook">
          <div
            aria-label="Re-imported operating budget"
            className="sw-formatting-imported"
            ref={importedHostRef}
          />
          {report.differences.length > 0 && <p>{report.differences.join(", ")}</p>}
          {report.warnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{warning.message}</p>
          ))}
        </ShowcaseSection>
      )}
      <ShowcaseSection id="formatting-notes" title="How formatting behaves">
        <ul>
          <li>
            Georgia, Arial and Courier New coexist with the theme font, and an unavailable family
            falls back to it. The ledger also shows bold, italic, underline, strike, wrap, three
            alignments and independently styled border sides.
          </li>
          <li>
            Number formats change the display, not the stored numbers. G3 opts out of a currency
            column with General; G15 inherits the column default. Negative variances keep a minus
            sign as well as their conditional fill.
          </li>
          <li>
            The controls are host UI calling <code>grid.styleRange</code>. For independent file
            fixtures and fidelity boundaries, open{" "}
            <a href="/showcases/interoperability/">spreadsheet interoperability</a>.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
