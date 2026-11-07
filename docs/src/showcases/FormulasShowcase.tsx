import { cellA1, createGrid, type DocumentOp, type Grid } from "@sheetwrite/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { HighlightedCode } from "../components/HighlightedCode.js";
import { Icon } from "../components/Icon.js";
import { functionCount } from "../generated/formula-summary.json";
import { errorText } from "../lib/errors.js";
import { initFullEngine, whenStylesReady } from "../lib/full-engine.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { ShowcaseControlGroup, ShowcaseLayout, ShowcaseSection } from "./layout/ShowcaseLayout.js";
import {
  ANALYSIS_SHEET_ID,
  apacPromotionOps,
  buildOrdersLedger,
  createFormulasWorkbook,
  FORMULA_PANELS,
  type FormulaPanel,
  formulaDashboardOps,
  ORDER_ROWS,
  ORDERS_SHEET_ID,
  type OrdersLedger,
  PLAYGROUND,
  PLAYGROUND_EXAMPLE,
} from "./scenarios/formulas.js";
import FormulasSetupSnippet from "./snippets/formulas-setup.mdx";
import { DemoButton } from "./ui/DemoButton.js";

import "@sheetwrite/core/styles.css";

declare global {
  interface Window {
    __sheetwriteFormulasGrid?: Grid;
  }
}

type GridState = "loading" | "ready" | "error";

interface Recalc {
  label: string;
  cells: number;
  ms: number;
}

function describeResult(grid: Grid, row: number, col: number): string {
  const value = grid.store.getCell({ sheet: ANALYSIS_SHEET_ID, row, col }).resolved;
  if (value === null || value === undefined || value === "") return "Empty";
  return typeof value === "number" ? value.toLocaleString("en-US") : String(value);
}

export default function FormulasShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const ledgerRef = useRef<OrdersLedger | null>(null);
  const [state, setState] = useState<GridState>("loading");
  const [error, setError] = useState("");
  const [activeSheet, setActiveSheet] = useState<string>(ANALYSIS_SHEET_ID);
  const [selected, setSelected] = useState<FormulaPanel["id"]>(FORMULA_PANELS[0].id);
  // The writes that put back the cells the promotion changed. The page holds
  // them, not Grid history, because a later edit (such as a playground formula)
  // would otherwise be the one that `grid.undo()` removes.
  const [promotionRestore, setPromotionRestore] = useState<DocumentOp[] | null>(null);
  const [recalc, setRecalc] = useState<Recalc | null>(null);
  const [draft, setDraft] = useState(PLAYGROUND_EXAMPLE);
  const [playground, setPlayground] = useState<{ result: string; ms: number } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let grid: Grid | null = null;
    const unsubscribes: Array<() => void> = [];

    void (async () => {
      if (!(await initFullEngine())) return;
      if (disposed) return;
      await whenStylesReady();
      if (disposed) return;
      const ledger = buildOrdersLedger();
      ledgerRef.current = ledger;
      grid = createGrid(host, {
        workbook: createFormulasWorkbook(),
        data: ledger.data,
        presentation: "data-grid",
        config: {
          toolbar: false,
          contextMenu: (context) => [
            { action: "copy", label: "Copy result" },
            {
              label: "Follow this formula",
              visible:
                context.cell !== null && Boolean(gridRef.current?.store.getFormula(context.cell)),
              onClick(instance, cell) {
                if (!cell) return;
                const panel = FORMULA_PANELS.find(
                  (candidate) =>
                    cell.sheet === ANALYSIS_SHEET_ID &&
                    candidate.row === cell.row &&
                    candidate.col === cell.col,
                );
                if (panel) setSelected(panel.id);
                instance.beginEdit(cell.row, cell.col);
              },
            },
            { action: "separator" },
            { action: "exportXlsx", label: "Export formula workbook" },
          ],
        },
      });
      gridRef.current = grid;
      window.__sheetwriteFormulasGrid = grid;
      const started = performance.now();
      grid.store.applyTransaction({ patches: formulaDashboardOps() });
      setRecalc({
        label: "First calculation of the dashboard",
        cells: ORDER_ROWS * 8,
        ms: performance.now() - started,
      });
      grid.setActiveSheet(ANALYSIS_SHEET_ID);
      const first = FORMULA_PANELS[0];
      grid.setSelection({
        kind: "cell",
        addr: { sheet: ANALYSIS_SHEET_ID, row: first.row, col: first.col },
      });
      unsubscribes.push(
        grid.on("active-sheet", ({ sheet }) => setActiveSheet(sheet)),
        grid.on("change", () => setRevision((value) => value + 1)),
      );
      setState("ready");
      // Canvas text is measured with the web font; repaint once it has loaded.
      void document.fonts.ready.then(() => {
        if (!disposed) gridRef.current?.replaceTheme({});
      });
    })().catch((cause: unknown) => {
      if (disposed) return;
      setState("error");
      setError(errorText(cause));
    });

    return () => {
      disposed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (gridRef.current === grid) {
        gridRef.current = null;
        delete window.__sheetwriteFormulasGrid;
      }
      grid?.destroy();
    };
  }, []);

  useEffect(() => observeSiteTheme(() => gridRef.current?.replaceTheme({})), []);

  const showPanel = (panel: FormulaPanel) => {
    const grid = gridRef.current;
    setSelected(panel.id);
    if (!grid) return;
    grid.setActiveSheet(ANALYSIS_SHEET_ID);
    const addr = { sheet: ANALYSIS_SHEET_ID, row: panel.row, col: panel.col };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
  };

  const togglePromotion = () => {
    const grid = gridRef.current;
    const ledger = ledgerRef.current;
    if (!grid || !ledger) return;

    const started = performance.now();
    if (promotionRestore) {
      const result = grid.applyTransaction({ patches: promotionRestore });
      if (result.status !== "applied") return;

      setRecalc({
        label: "Undo: the promotion is gone and every panel follows",
        cells: promotionRestore.length,
        ms: performance.now() - started,
      });
      setPromotionRestore(null);
      return;
    }

    const patches = apacPromotionOps(ledger);
    const restore: DocumentOp[] = [];
    const stopRecording = grid.on("change", ({ changes }) => {
      for (const change of changes) {
        restore.push({ op: "set", addr: change.addr, value: change.oldValue });
      }
    });
    let applied = false;
    try {
      applied = grid.applyTransaction({ patches }).status === "applied";
    } finally {
      stopRecording();
    }
    if (!applied) return;

    setRecalc({
      label: "APAC promotion: +20% units on every APAC order",
      cells: patches.length,
      ms: performance.now() - started,
    });
    setPromotionRestore(restore);
  };

  const runDraft = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const source = draft.trim().startsWith("=") ? draft.trim() : `=${draft.trim()}`;
    const addr = { sheet: ANALYSIS_SHEET_ID, row: PLAYGROUND.row, col: PLAYGROUND.col };
    const started = performance.now();
    grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "formula", src: source } }],
    });
    setPlayground({
      result: describeResult(grid, PLAYGROUND.row, PLAYGROUND.col),
      ms: performance.now() - started,
    });
    grid.setActiveSheet(ANALYSIS_SHEET_ID);
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
  };

  const switchSheet = (sheet: string) => {
    gridRef.current?.setActiveSheet(sheet);
    setActiveSheet(sheet);
  };

  const panel = FORMULA_PANELS.find((candidate) => candidate.id === selected) ?? FORMULA_PANELS[0];
  const families = useMemo(
    () => [...new Set(FORMULA_PANELS.flatMap((candidate) => candidate.families))],
    [],
  );
  // `revision` re-reads the selected panel's first value after every change.
  void revision;
  const panelValue =
    state === "ready" && gridRef.current
      ? describeResult(gridRef.current, panel.row, panel.col)
      : "—";

  const ready = state === "ready";
  const sheets = [
    { id: ANALYSIS_SHEET_ID, label: "Analysis" },
    { id: ORDERS_SHEET_ID, label: `Orders · ${ORDER_ROWS.toLocaleString()} rows` },
  ];

  return (
    <ShowcaseLayout
      code={{ title: "Select the full engine", Snippet: FormulasSetupSnippet }}
      controls={
        <>
          <ShowcaseControlGroup
            title="Change the data"
            description="One transaction rewrites every APAC order; every answer follows."
          >
            <DemoButton
              aria-pressed={promotionRestore !== null}
              data-testid="formulas-promotion"
              disabled={!ready}
              onClick={togglePromotion}
              variant="primary"
            >
              <Icon name={promotionRestore ? "undo" : "bolt"} />
              {promotionRestore ? "Undo the APAC promotion" : "Run an APAC promotion: +20% units"}
            </DemoButton>
            <output aria-live="polite" className="sw-fx-recalc" data-testid="formulas-recalc">
              {state === "error" ? (
                <span>The engine did not start: {error}</span>
              ) : recalc ? (
                <>
                  <strong>{recalc.ms.toFixed(0)} ms</strong>
                  <span>
                    {recalc.label}
                    {recalc.cells > 0 ? ` · ${recalc.cells.toLocaleString()} cells` : ""}
                  </span>
                </>
              ) : (
                <span>Loading the full formula engine…</span>
              )}
            </output>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title="Formula recipes"
            description="Jump to a formula and read it."
          >
            <ol aria-label="Formula recipes" className="sw-fx-recipes">
              {FORMULA_PANELS.map((candidate) => (
                <li key={candidate.id}>
                  <DemoButton
                    aria-pressed={candidate.id === selected}
                    data-size="sm"
                    data-testid={`formulas-recipe-${candidate.id}`}
                    disabled={!ready}
                    onClick={() => showPanel(candidate)}
                    variant="quiet"
                  >
                    <code>{cellA1(candidate.row, candidate.col)}</code>
                    {candidate.title}
                  </DemoButton>
                </li>
              ))}
            </ol>
            <article className="sw-fx-detail" data-testid="formulas-detail">
              <p className="sw-fx-detail__kicker">
                {cellA1(panel.row, panel.col)} · {panel.families.join(" · ")} · first value{" "}
                <span data-testid="formulas-detail-value">{panelValue}</span>
              </p>
              <h3>{panel.title}</h3>
              <p>{panel.explanation}</p>
              <HighlightedCode code={panel.formula} language="formula" />
            </article>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title={`Try your own formula in ${cellA1(PLAYGROUND.row, PLAYGROUND.col)}`}
          >
            <form
              className="sw-fx-try"
              onSubmit={(event) => {
                event.preventDefault();
                runDraft();
              }}
            >
              <input
                aria-label="Formula"
                autoComplete="off"
                data-testid="formulas-draft"
                onChange={(event) => setDraft(event.currentTarget.value)}
                spellCheck={false}
                value={draft}
              />
              <DemoButton data-testid="formulas-run" disabled={!ready} type="submit">
                <Icon name="function" />
                Calculate
              </DemoButton>
              <output aria-live="polite" data-testid="formulas-draft-result">
                {playground
                  ? `${playground.result} · ${playground.ms.toFixed(1)} ms`
                  : "Orders columns A–H: month, region, product, channel, units, price, revenue, order code."}
              </output>
            </form>
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <div
          aria-label="Sales analysis workbook"
          className="sw-showcase__grid"
          data-state={state}
          data-testid="formulas-grid"
          ref={hostRef}
          role="grid"
        />
      }
      demoActions={
        <div aria-label="Sheet" className="sw-fx-sheets" role="group">
          {sheets.map((sheet) => (
            <DemoButton
              aria-pressed={activeSheet === sheet.id}
              data-size="sm"
              disabled={!ready}
              key={sheet.id}
              onClick={() => switchSheet(sheet.id)}
              variant="quiet"
            >
              {sheet.label}
            </DemoButton>
          ))}
        </div>
      }
      demoLabel="Live formula workbook"
      demoTitle="Sales analysis.xlsx"
      eyebrow="Formulas"
      facts={[
        { label: "Function names", value: functionCount.toLocaleString() },
        { label: "Orders", value: ORDER_ROWS.toLocaleString() },
        { label: "Live formulas", value: FORMULA_PANELS.length.toLocaleString() },
      ]}
      guide={{ href: "/docs/reference/formula-functions/", label: "See every supported function" }}
      id="formulas"
      task={
        <>
          {FORMULA_PANELS.length} live formulas summarize {ORDER_ROWS.toLocaleString()} orders:
          grouping, statistics, a regression, finance, a database query, LAMBDA helpers and regex.
          Change the data and every answer recalculates.
        </>
      }
      title="Ask the data. Watch the answer spill."
    >
      <ShowcaseSection id="formulas-engines" title="Two engines, one API">
        <p>
          <code>@sheetwrite/wasm</code> is the default engine. <code>@sheetwrite/formulas</code> is
          the same engine with the full function set. Select it once, before you create a grid. The
          function families 0.7.0 adds are on the{" "}
          <a href="/showcases/functions/">functions showcase</a>.
        </p>
        <ul aria-label="Families on this page" className="sw-fx-families">
          {families.map((family) => (
            <li key={family}>{family}</li>
          ))}
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
