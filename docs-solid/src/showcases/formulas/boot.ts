// The formulas demo's engine: the full formula engine, the orders ledger and
// the dashboard's formulas, loaded once the grid comes near the viewport
// (FormulasStage.tsx).
import "@sheetwrite/core/styles.css";
import { initFullEngine, whenStylesReady } from "@docs/lib/full-engine.js";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  ANALYSIS_SHEET_ID,
  apacPromotionOps,
  buildOrdersLedger,
  createFormulasWorkbook,
  FORMULA_PANELS,
  formulaDashboardOps,
  ORDER_ROWS,
  PLAYGROUND,
} from "@docs/showcases/scenarios/formulas.js";
import { createGrid, type DocumentOp, type Grid } from "@sheetwrite/core";

declare global {
  interface Window {
    __sheetwriteFormulasGrid?: Grid;
  }
}

/** One timed recalculation, as the panel reports it. */
export interface Recalc {
  readonly label: string;
  readonly cells: number;
  readonly ms: number;
}

export interface FormulasWorkbook {
  readonly grid: Grid;
  /** The first calculation of the dashboard, timed. */
  readonly firstRecalc: Recalc;
  /** The first value of the formula anchored at `row`, `col` on the Analysis sheet. */
  describeResult(row: number, col: number): string;
  /**
   * Runs the APAC promotion, or puts back the cells it changed. The page holds
   * those writes, not Grid history, because a later edit (such as a playground
   * formula) would otherwise be the one that `grid.undo()` removes.
   */
  togglePromotion(): Recalc | null;
  readonly promoted: () => boolean;
  /** Writes the playground formula and returns its first value, timed. */
  runDraft(draft: string): { result: string; ms: number };
  dispose(): void;
}

interface FormulasHandlers {
  /** "Follow this formula" from the context menu, on a dashboard panel. */
  readonly onFollow: (panelId: string) => void;
  readonly onActiveSheet: (sheet: string) => void;
  readonly onChange: () => void;
}

/** Starts the full engine and the formula workbook in `host`; null when the page left first. */
export async function startFormulasWorkbook(
  host: HTMLElement,
  handlers: FormulasHandlers,
  isDisposed: () => boolean,
): Promise<FormulasWorkbook | null> {
  if (!(await initFullEngine()) || isDisposed()) return null;
  await whenStylesReady();
  if (isDisposed()) return null;
  const ledger = buildOrdersLedger();
  let gridRef: Grid | null = null;
  const grid = createGrid(host, {
    workbook: createFormulasWorkbook(),
    data: ledger.data,
    presentation: "data-grid",
    config: {
      toolbar: false,
      contextMenu: (context) => [
        { action: "copy", label: "Copy result" },
        {
          label: "Follow this formula",
          visible: context.cell !== null && Boolean(gridRef?.store.getFormula(context.cell)),
          onClick(instance, cell) {
            if (!cell) return;
            const panel = FORMULA_PANELS.find(
              (candidate) =>
                cell.sheet === ANALYSIS_SHEET_ID &&
                candidate.row === cell.row &&
                candidate.col === cell.col,
            );
            if (panel) handlers.onFollow(panel.id);
            instance.beginEdit(cell.row, cell.col);
          },
        },
        { action: "separator" },
        { action: "exportXlsx", label: "Export formula workbook" },
      ],
    },
  });
  gridRef = grid;
  window.__sheetwriteFormulasGrid = grid;
  const started = performance.now();
  grid.store.applyTransaction({ patches: formulaDashboardOps() });
  const firstRecalc: Recalc = {
    label: "First calculation of the dashboard",
    cells: ORDER_ROWS * 8,
    ms: performance.now() - started,
  };
  grid.setActiveSheet(ANALYSIS_SHEET_ID);
  const first = FORMULA_PANELS[0];
  grid.setSelection({
    kind: "cell",
    addr: { sheet: ANALYSIS_SHEET_ID, row: first.row, col: first.col },
  });
  const unsubscribes = [
    grid.on("active-sheet", ({ sheet }) => handlers.onActiveSheet(sheet)),
    grid.on("change", () => handlers.onChange()),
    observeSiteTheme(() => grid.replaceTheme({})),
  ];
  // Canvas text is measured with the web font; repaint once it has loaded.
  void document.fonts.ready.then(() => {
    if (!isDisposed()) grid.replaceTheme({});
  });

  const describeResult = (row: number, col: number): string => {
    const value = grid.store.getCell({ sheet: ANALYSIS_SHEET_ID, row, col }).resolved;
    if (value === null || value === undefined || value === "") return "Empty";
    return typeof value === "number" ? value.toLocaleString("en-US") : String(value);
  };

  let restore: DocumentOp[] | null = null;
  return {
    grid,
    firstRecalc,
    describeResult,
    promoted: () => restore !== null,
    togglePromotion() {
      const started = performance.now();
      if (restore) {
        const patches = restore;
        if (grid.applyTransaction({ patches }).status !== "applied") return null;
        restore = null;
        return {
          label: "Undo: the promotion is gone and every panel follows",
          cells: patches.length,
          ms: performance.now() - started,
        };
      }
      const patches = apacPromotionOps(ledger);
      const recorded: DocumentOp[] = [];
      const stopRecording = grid.on("change", ({ changes }) => {
        for (const change of changes) {
          recorded.push({ op: "set", addr: change.addr, value: change.oldValue });
        }
      });
      let applied = false;
      try {
        applied = grid.applyTransaction({ patches }).status === "applied";
      } finally {
        stopRecording();
      }
      if (!applied) return null;
      restore = recorded;
      return {
        label: "APAC promotion: +20% units on every APAC order",
        cells: patches.length,
        ms: performance.now() - started,
      };
    },
    runDraft(draft) {
      const source = draft.trim().startsWith("=") ? draft.trim() : `=${draft.trim()}`;
      const addr = { sheet: ANALYSIS_SHEET_ID, row: PLAYGROUND.row, col: PLAYGROUND.col };
      const started = performance.now();
      grid.applyTransaction({
        patches: [{ op: "set", addr, value: { kind: "formula", src: source } }],
      });
      const result = {
        result: describeResult(PLAYGROUND.row, PLAYGROUND.col),
        ms: performance.now() - started,
      };
      grid.setActiveSheet(ANALYSIS_SHEET_ID);
      grid.setSelection({ kind: "cell", addr });
      grid.scrollToCell(addr);
      return result;
    },
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (window.__sheetwriteFormulasGrid === grid) delete window.__sheetwriteFormulasGrid;
      grid.destroy();
    },
  };
}
