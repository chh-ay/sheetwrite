import { createGrid, type Grid, initSheetwrite } from "@sheetwrite/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { CapabilityHero } from "./CapabilityHero.js";
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
import "@sheetwrite/core/styles.css";

declare global {
  interface Window {
    __sheetwriteFormulasGrid?: Grid;
  }
}

/** One full-page reload is allowed when an earlier page already selected the default engine. */
const ENGINE_RELOAD_KEY = "sheetwrite:formulas-engine-reload";

/** Core's one engine-selection conflict; wrapped errors keep the original as `cause`. */
function isEngineConflict(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes("the engine cannot change")) return true;
  }
  return false;
}

type GridState = "loading" | "ready" | "error";

interface Recalc {
  label: string;
  cells: number;
  ms: number;
}

function cellLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/**
 * The route stylesheet can land after this page mounts, and the engine reads
 * its theme — and seeds the palette of its menus and find bar — from the host's
 * CSS variables at construction. Resolve once every pending stylesheet has
 * applied, so the first paint uses the site palette instead of engine defaults.
 */
function whenStylesReady(): Promise<void> {
  const pending = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ).filter((link) => link.sheet === null);
  if (pending.length === 0) return Promise.resolve();
  const applied = Promise.all(
    pending.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet !== null) {
            resolve();
            return;
          }
          const done = () => resolve();
          link.addEventListener("load", done, { once: true });
          link.addEventListener("error", done, { once: true });
        }),
    ),
  ).then(() => undefined);
  // A stylesheet that never settles must not hold the Grid back.
  const cap = new Promise<void>((resolve) => window.setTimeout(resolve, 3_000));
  return Promise.race([applied, cap]);
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
  const [functionCount, setFunctionCount] = useState<number | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>(ANALYSIS_SHEET_ID);
  const [selected, setSelected] = useState<FormulaPanel["id"]>(FORMULA_PANELS[0]!.id);
  const [promotion, setPromotion] = useState(false);
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
      const formulas = await import("@sheetwrite/formulas");
      try {
        await initSheetwrite(undefined, formulas);
      } catch (cause) {
        // Each page selects one engine. After client navigation from a page
        // that loaded the default engine, start this page fresh, one time.
        // Other failures (a missing WASM file, for example) are shown as errors.
        if (isEngineConflict(cause) && !sessionStorage.getItem(ENGINE_RELOAD_KEY)) {
          sessionStorage.setItem(ENGINE_RELOAD_KEY, "1");
          location.reload();
          return;
        }
        throw cause;
      }
      sessionStorage.removeItem(ENGINE_RELOAD_KEY);
      if (disposed) return;
      await whenStylesReady();
      if (disposed) return;
      setFunctionCount(formulas.functionNames().length);
      const ledger = buildOrdersLedger();
      ledgerRef.current = ledger;
      grid = createGrid(host, {
        workbook: createFormulasWorkbook(),
        data: ledger.data,
        presentation: "data-grid",
        config: { toolbar: false },
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
      const first = FORMULA_PANELS[0]!;
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
      setError(cause instanceof Error ? cause.message : String(cause));
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

  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme({}));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

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
    if (promotion) {
      grid.undo();
      setRecalc({
        label: "Undo: the promotion is gone and every panel follows",
        cells: 0,
        ms: performance.now() - started,
      });
      setPromotion(false);
      return;
    }
    const patches = apacPromotionOps(ledger);
    const result = grid.applyTransaction({ patches });
    if (result.status !== "applied") return;
    setRecalc({
      label: "APAC promotion: +20% units on every APAC order",
      cells: patches.length,
      ms: performance.now() - started,
    });
    setPromotion(true);
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

  const panel = FORMULA_PANELS.find((candidate) => candidate.id === selected) ?? FORMULA_PANELS[0]!;
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

  return (
    <div className="sw-fx-frame">
      <SiteTopbar active="formulas" />
      <main className="sw-fx-page" id="main-content">
        <CapabilityHero
          description={
            <>
              {FORMULA_PANELS.length} live formulas summarize {ORDER_ROWS.toLocaleString()} orders:
              group and pivot tables, statistics and distributions, a regression, finance and
              working days, a database query, LAMBDA helpers, and regex. Change the data and every
              answer recalculates.
            </>
          }
          eyebrow="CAPABILITY / FORMULAS"
          facts={[
            {
              label: "Function names",
              value: functionCount === null ? "Full engine" : functionCount.toLocaleString(),
            },
            { label: "Orders", value: ORDER_ROWS.toLocaleString() },
            { label: "Live panels", value: `${FORMULA_PANELS.length} formulas` },
            { label: "Engine", value: "@sheetwrite/formulas" },
          ]}
          title="Ask the data. Watch the answer spill."
        />

        <section aria-label="Live formula workbook" className="sw-fx-stage" data-state={state}>
          <header className="sw-fx-bar">
            <div className="sw-fx-bar__title">
              <p>Live analysis workbook</p>
              <h2>One edit. Every answer follows.</h2>
            </div>
            <div className="sw-fx-bar__actions">
              <button
                aria-pressed={promotion}
                data-testid="formulas-promotion"
                disabled={state !== "ready"}
                onClick={togglePromotion}
                type="button"
              >
                {promotion ? "Undo the APAC promotion" : "Run an APAC promotion: +20% units"}
              </button>
              <fieldset className="sw-fx-sheets" aria-label="Sheet">
                {[
                  { id: ANALYSIS_SHEET_ID, label: "Analysis" },
                  { id: ORDERS_SHEET_ID, label: `Orders · ${ORDER_ROWS.toLocaleString()} rows` },
                ].map((sheet) => (
                  <button
                    aria-pressed={activeSheet === sheet.id}
                    disabled={state !== "ready"}
                    key={sheet.id}
                    onClick={() => switchSheet(sheet.id)}
                    type="button"
                  >
                    {sheet.label}
                  </button>
                ))}
              </fieldset>
            </div>
            <output aria-live="polite" className="sw-fx-bar__recalc" data-testid="formulas-recalc">
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
          </header>

          <nav aria-label="Formula recipes" className="sw-fx-recipes">
            <ol>
              {FORMULA_PANELS.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    aria-pressed={candidate.id === selected}
                    data-testid={`formulas-recipe-${candidate.id}`}
                    disabled={state !== "ready"}
                    onClick={() => showPanel(candidate)}
                    type="button"
                  >
                    <span>{cellLabel(candidate.row, candidate.col)}</span>
                    {candidate.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {/* biome-ignore lint/a11y/useSemanticElements: Sheetwrite upgrades this host into an ARIA grid. */}
          <div
            aria-label="Sales analysis workbook"
            className="sw-fx-grid"
            data-testid="formulas-grid"
            ref={hostRef}
            role="grid"
          />

          <div className="sw-fx-footer">
            <article className="sw-fx-detail" data-testid="formulas-detail">
              <p className="sw-fx-detail__kicker">
                {cellLabel(panel.row, panel.col)} · {panel.families.join(" · ")} · first value{" "}
                <span data-testid="formulas-detail-value">{panelValue}</span>
              </p>
              <h3>{panel.title}</h3>
              <p>{panel.explanation}</p>
              <code>{panel.formula}</code>
            </article>

            <form
              className="sw-fx-try"
              onSubmit={(event) => {
                event.preventDefault();
                runDraft();
              }}
            >
              <label htmlFor="formulas-draft">
                Try your own formula in {cellLabel(PLAYGROUND.row, PLAYGROUND.col)}
              </label>
              <div>
                <input
                  autoComplete="off"
                  data-testid="formulas-draft"
                  id="formulas-draft"
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  spellCheck={false}
                  value={draft}
                />
                <button data-testid="formulas-run" disabled={state !== "ready"} type="submit">
                  Calculate
                </button>
              </div>
              <output aria-live="polite" data-testid="formulas-draft-result">
                {playground
                  ? `${playground.result} · ${playground.ms.toFixed(1)} ms`
                  : "Orders columns A–H: month, region, product, channel, units, price, revenue, order code."}
              </output>
            </form>
          </div>
        </section>

        <section aria-labelledby="formulas-engine-title" className="sw-fx-engine">
          <div>
            <p className="sw-fx-engine__kicker">Two engines, one API</p>
            <h2 id="formulas-engine-title">Choose the formula engine your app needs.</h2>
            <p>
              <code>@sheetwrite/wasm</code> is the default engine. <code>@sheetwrite/formulas</code>{" "}
              is the same engine with the full function set. Select it once, before you create a
              Grid. Everything else stays the same.
            </p>
            <a href="/docs/reference/formula-functions/">See every supported function →</a>
          </div>
          <div className="sw-fx-engine__code">
            <FormulasSetupSnippet />
          </div>
          <ul aria-label="Families on this page" className="sw-fx-engine__families">
            {families.map((family) => (
              <li key={family}>{family}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
