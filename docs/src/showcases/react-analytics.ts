import type {
  CellAddress,
  CellFormat,
  ChangeEvent,
  ColumnarData,
  DocumentOp,
  Grid,
  SearchResult,
  Selection,
  Workbook,
} from "@sheetwrite/core";
/**
 * React adapter for the analytics scenario: one hook that binds the shared
 * dataset/workbook/KPI contract from `scenarios/analytics.ts` to controlled
 * React state. Every workbench interaction — filters, search/replace, formula
 * entry, undo/redo, import/export, dataset reloads, renderer choice — flows
 * through this state, and grid resets reconcile back into it via `onReady`.
 */
import { downloadBytes, fromCsv, parseCellInput, toCsv } from "@sheetwrite/core";
import type { GridReadyEvent, GridReadyReason } from "@sheetwrite/core/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { installXlsx } from "../lib/addons.js";
import { errorText } from "../lib/errors.js";
import { selectionLabel } from "../lib/selection-label.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { fitColumnPixels, rowGutterWidth } from "./column-fit.js";
import {
  ANALYTICS_COLUMNS,
  ANALYTICS_MARKETS,
  ANALYTICS_ROWS,
  ANALYTICS_SHEET_ID,
  ANALYTICS_SUMMARY_SHEET_ID,
  ANALYTICS_THEME,
  analyticsSummarySeedOps,
  buildAnalyticsData,
  createAnalyticsWorkbook,
} from "./scenarios/analytics.js";
import type { RenderingMode } from "./ui/rendering-mode.js";
import { useAction } from "./ui/use-action.js";

/** Summary-sheet row indexes of the global KPI formulas. */
const KPI_ROW = { total: 0, average: 1, largest: 2 } as const;
/** Per-market SUMIF rows start after the five global KPI rows. */
const MARKET_KPI_START = 5;
/** Import overlays are a workflow entry point, not a bulk-ingest path. */
const MAX_IMPORT_ROWS = 2_000;

export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface KpiValues {
  total: number | null;
  average: number | null;
  largest: number | null;
  /** Focused market's SUMIF value, or the grand total when no market filter is active. */
  market: number | null;
}

interface ActivityEntry {
  id: number;
  message: string;
}

const EMPTY_KPIS: KpiValues = { total: null, average: null, largest: null, market: null };

function read_summary_number(grid: Grid, row: number): number | null {
  const cell = grid.store.getCell({ sheet: ANALYTICS_SUMMARY_SHEET_ID, row, col: 1 });
  return typeof cell.resolved === "number" ? cell.resolved : null;
}

function column_format(col: number): CellFormat {
  const workbook_column = createAnalyticsWorkbook().sheets.find(
    (sheet) => sheet.id === ANALYTICS_SHEET_ID,
  )?.columns?.[col];
  return workbook_column?.type ?? "text";
}

/** Scenario widths, captured once so repeated fits never compound a scale. */
const NATURAL_WIDTHS: readonly (readonly number[])[] = createAnalyticsWorkbook().sheets.map(
  (sheet) => sheet.columns.map((column) => column.width),
);

/**
 * Below this share of a sheet's scenario width the columns stop shrinking and
 * the grid scrolls sideways instead: narrower cells cut the money values.
 */
const MIN_COLUMN_SCALE = 0.85;

/**
 * Fit each sheet's named columns to the measured grid host. Past the declared
 * schema the Grid pads the host with empty letter columns of its own width, so
 * the declared widths must end exactly at the host edge: a shorter total leaves
 * empty letter columns on show, a longer one clips the last named column.
 * Hosts far too narrow for the columns keep the scenario widths and scroll.
 */
export function fitColumnsToHost(workbook: Workbook, hostWidth: number): void {
  const target = Math.floor(hostWidth) - rowGutterWidth(ANALYTICS_ROWS);
  if (target <= 0) return;
  workbook.sheets.forEach((sheet, sheet_index) => {
    const natural = NATURAL_WIDTHS[sheet_index];
    if (!natural) return;
    const widths = fitColumnPixels(natural, target, {
      minimumScale: MIN_COLUMN_SCALE,
      belowMinimum: "keep",
      rounding: "widest",
    });
    if (widths === undefined) return;
    sheet.columns.forEach((column, index) => {
      column.width = widths[index] ?? column.width;
    });
  });
}

/** Host width the workbench fits its columns to; 0 until the stage is measured. */
interface AnalyticsWorkbenchOptions {
  gridHostWidth?: number;
}

/** Controlled-analytics workbench state machine over the shared scenario. */
export function useAnalyticsWorkbench(options: AnalyticsWorkbenchOptions = {}) {
  const { gridHostWidth: grid_host_width = 0 } = options;
  const grid_ref = useRef<Grid>(null);
  const csv_action = useAction();
  const xlsx_action = useAction();
  const import_action = useAction();
  const { run: run_csv } = csv_action;
  const { run: run_xlsx } = xlsx_action;
  const { run: run_import } = import_action;
  const [initialization_error, set_initialization_error] = useState<string | null>(null);
  const activity_id = useRef(0);
  const renderer_cleanup = useRef<() => void>(() => {});
  const formula_dirty = useRef(false);

  // The measured host width is a workbook input: the Grid must be constructed
  // with fitted widths, so the workbook is rebuilt once the stage reports its
  // width and the Grid mounts on that render instead of before it.
  const workbook = useMemo(() => {
    const next = createAnalyticsWorkbook();
    fitColumnsToHost(next, grid_host_width);
    return next;
  }, [grid_host_width]);

  /**
   * Re-fit the columns after the stage changes width. The workbook object is
   * the one the Grid's store reads, so writing widths is enough for the next
   * layout pass — no reset, no new generation, no undo entry. `refresh()` only
   * repaints and the documented geometry setters commit history, so the theme
   * is re-derived to rebuild the column index and layout from the store.
   */
  const fit_grid_columns = useCallback(
    (host_width: number): void => {
      const grid = grid_ref.current;
      if (!grid || host_width <= 0) return;
      const before = workbook.sheets.map((sheet) => sheet.columns.map((column) => column.width));
      fitColumnsToHost(workbook, host_width);
      const changed = workbook.sheets.some((sheet, index) =>
        sheet.columns.some((column, col) => column.width !== before[index]?.[col]),
      );
      if (changed) grid.replaceTheme(ANALYTICS_THEME);
    },
    [workbook],
  );
  const [dataset, set_dataset] = useState<ColumnarData>(() => buildAnalyticsData());

  // Controlled query/view state — the single source of truth the grid is
  // reconciled against after every reset.
  const [market, set_market] = useState("all");
  const [segment, set_segment] = useState("all");
  const [query, set_query] = useState("");
  const [replacement, set_replacement] = useState("");
  const [ranked, set_ranked] = useState(false);
  const [matches, set_matches] = useState<SearchResult | null>(null);
  const [read_only, set_read_only] = useState(false);

  // Grid-derived state.
  const [visible_rows, set_visible_rows] = useState(ANALYTICS_ROWS);
  const [kpis, set_kpis] = useState<KpiValues>(EMPTY_KPIS);
  const [selection, set_selection] = useState("No selection");
  const [formula_address, set_formula_address] = useState<CellAddress | null>(null);
  const [formula_draft, set_formula_draft] = useState("");
  const [generation, set_generation] = useState(0);
  const [ready_reason, set_ready_reason] = useState<GridReadyReason>("initial");
  const [renderer, set_renderer] = useState<RenderingMode>("canvas");
  const [active_renderer, set_active_renderer] = useState<RenderingMode>("canvas");
  const [renderer_fallback, set_renderer_fallback] = useState<{
    count: number;
    reason: string;
  } | null>(null);
  const [activity, set_activity] = useState<ActivityEntry[]>([
    { id: 0, message: "Workbench initialized" },
  ]);

  useEffect(() => () => renderer_cleanup.current(), []);

  const record = useCallback((message: string): void => {
    const id = ++activity_id.current;
    set_activity((items) => [{ id, message }, ...items].slice(0, 3));
  }, []);

  const refresh_kpis = useCallback((grid: Grid, focused_market: string): void => {
    const total = read_summary_number(grid, KPI_ROW.total);
    const market_index = ANALYTICS_MARKETS.indexOf(
      focused_market as (typeof ANALYTICS_MARKETS)[number],
    );
    set_kpis({
      total,
      average: read_summary_number(grid, KPI_ROW.average),
      largest: read_summary_number(grid, KPI_ROW.largest),
      market:
        market_index >= 0 ? read_summary_number(grid, MARKET_KPI_START + market_index) : total,
    });
    set_visible_rows(grid.store.viewRowCount(ANALYTICS_SHEET_ID));
  }, []);

  const market_filter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.market,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  const segment_filter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.segment,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  /** Push every piece of controlled view state onto a (possibly fresh) grid. */
  const reconcile_view = useCallback(
    (grid: Grid): void => {
      market_filter(grid, market);
      segment_filter(grid, segment);
      if (ranked) grid.setViewSort([{ col: ANALYTICS_COLUMNS.arr, ascending: false }]);
      if (query.trim().length > 0) {
        const result = grid.search(query.trim());
        set_matches(result);
        if (result.matches.length > 0) grid.findNext();
      } else {
        set_matches(null);
      }
    },
    [market, market_filter, query, ranked, segment, segment_filter],
  );

  const on_ready = useCallback(
    ({ grid, generation: next_generation, reason }: GridReadyEvent): void => {
      set_initialization_error(null);
      grid.setFrozen(0, 1);
      grid.store.applyTransaction({ patches: analyticsSummarySeedOps() });

      renderer_cleanup.current();
      set_active_renderer(grid.rendererKind());
      renderer_cleanup.current = grid.on("renderer-fallback", ({ error }) => {
        set_active_renderer("canvas");
        set_renderer_fallback((current) => ({
          count: (current?.count ?? 0) + 1,
          reason: errorText(error),
        }));
      });

      set_generation(next_generation);
      set_ready_reason(reason);
      set_formula_address(null);
      set_formula_draft("");
      formula_dirty.current = false;

      if (next_generation > 1) {
        // Controlled reconciliation: the new grid instance adopts the React
        // state that outlived its predecessor.
        reconcile_view(grid);
        record(`Grid rebuilt (${reason}) · view reconciled from React state`);
      } else {
        record(`Grid ready · ${ANALYTICS_ROWS.toLocaleString()} rows ingested`);
      }
      refresh_kpis(grid, market);
    },
    [market, reconcile_view, record, refresh_kpis],
  );

  const on_grid_change = useCallback(
    ({ transaction, commitReason: commit_reason }: ChangeEvent): void => {
      const grid = grid_ref.current;
      const ops = transaction.patches.length;
      record(
        `${ops} op${ops === 1 ? "" : "s"} committed (${commit_reason}) · formulas recalculated`,
      );
      if (grid) refresh_kpis(grid, market);
    },
    [market, record, refresh_kpis],
  );

  const on_selection_change = useCallback((value: Selection | null): void => {
    set_selection(selectionLabel(value, "No selection"));
    const grid = grid_ref.current;
    if (!grid) return;
    if (value?.kind !== "cell" || value.addr.sheet !== ANALYTICS_SHEET_ID) {
      if (!formula_dirty.current) {
        set_formula_address(null);
        set_formula_draft("");
      }
      return;
    }
    // Controlled-input reconciliation: grid selection refreshes the draft
    // unless the user is mid-edit in the formula input.
    set_formula_address(value.addr);
    if (!formula_dirty.current) {
      const formula = grid.store.getFormula(value.addr);
      if (formula !== null) {
        set_formula_draft(formula);
      } else {
        const { resolved } = grid.store.getCell(value.addr);
        set_formula_draft(resolved === null ? "" : String(resolved));
      }
    }
  }, []);

  const edit_formula_draft = useCallback((text: string): void => {
    formula_dirty.current = true;
    set_formula_draft(text);
  }, []);

  const commit_formula_draft = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid || !formula_address || read_only) return;
    const value = parseCellInput(formula_draft, column_format(formula_address.col));
    grid.applyTransaction({ patches: [{ op: "set", addr: formula_address, value }] });
    formula_dirty.current = false;
    record(
      value.kind === "formula"
        ? `Formula ${formula_draft} committed at R${formula_address.row + 1}`
        : `Cell R${formula_address.row + 1} C${formula_address.col + 1} set`,
    );
  }, [formula_address, formula_draft, read_only, record]);

  const choose_market = useCallback(
    (next: string): void => {
      set_market(next);
      const grid = grid_ref.current;
      if (!grid) return;
      market_filter(grid, next);
      refresh_kpis(grid, next);
      record(next === "all" ? "Showing all markets" : `Filtered to ${next}`);
    },
    [market_filter, record, refresh_kpis],
  );

  const choose_segment = useCallback(
    (next: string): void => {
      set_segment(next);
      const grid = grid_ref.current;
      if (!grid) return;
      segment_filter(grid, next);
      refresh_kpis(grid, market);
      record(next === "all" ? "Showing all segments" : `Filtered to ${next} segment`);
    },
    [market, record, refresh_kpis, segment_filter],
  );

  const run_search = useCallback(
    (next_query: string): void => {
      const grid = grid_ref.current;
      if (!grid) return;
      set_query(next_query);
      if (next_query.trim().length === 0) {
        grid.clearSearch();
        set_matches(null);
        record("Search cleared");
        return;
      }
      const result = grid.search(next_query.trim());
      set_matches(result);
      if (result.matches.length > 0) grid.findNext();
      record(`${result.matches.length.toLocaleString()} search matches`);
    },
    [record],
  );

  const find_next = useCallback((): void => {
    const grid = grid_ref.current;
    if (grid) set_matches(grid.findNext());
  }, []);

  const find_prev = useCallback((): void => {
    const grid = grid_ref.current;
    if (grid) set_matches(grid.findPrev());
  }, []);

  const replace_current = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid || read_only) return;
    set_matches(grid.replaceCurrent(replacement));
    record("Replaced active match");
  }, [read_only, record, replacement]);

  const replace_all = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid || read_only) return;
    const { replaced, result } = grid.replaceAll(replacement);
    set_matches(result);
    record(`Replaced ${replaced.toLocaleString()} cell${replaced === 1 ? "" : "s"}`);
  }, [read_only, record, replacement]);

  const rank_by_arr = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid) return;
    grid.setViewSort([{ col: ANALYTICS_COLUMNS.arr, ascending: false }]);
    set_ranked(true);
    refresh_kpis(grid, market);
    record("Ranked by ARR, high to low");
  }, [market, record, refresh_kpis]);

  const undo = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid) return;
    if (grid.getCommandState("undo").disabled) {
      record("Nothing to undo");
      return;
    }
    grid.undo();
    record("Undo");
  }, [record]);

  const redo = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid) return;
    if (grid.getCommandState("redo").disabled) {
      record("Nothing to redo");
      return;
    }
    grid.redo();
    record("Redo");
  }, [record]);

  /** Clear the controlled view (filters/sort/search) without touching data. */
  const reset_view = useCallback((): void => {
    set_market("all");
    set_segment("all");
    set_query("");
    set_ranked(false);
    set_matches(null);
    const grid = grid_ref.current;
    if (!grid) return;
    grid.clearView();
    grid.clearSearch();
    refresh_kpis(grid, "all");
    record("View reset · filters, sort, and search cleared");
  }, [record, refresh_kpis]);

  /**
   * Input-reset lifecycle: a fresh dataset object replaces the `data` prop, the
   * adapter rebuilds the grid, and `on_ready` reconciles the surviving React
   * view state onto the new instance.
   */
  const reload_dataset = useCallback((): void => {
    set_dataset(buildAnalyticsData());
    record("Reloading pristine dataset · local edits discarded");
  }, [record]);

  const toggle_read_only = useCallback((): void => {
    set_read_only((current) => {
      record(current ? "Editing enabled" : "Workbench is read-only");
      return !current;
    });
  }, [record]);

  const export_csv = useCallback((): void => {
    const grid = grid_ref.current;
    if (!grid) return;
    const sheet = grid.store.getWorkbook().sheets.find((entry) => entry.id === ANALYTICS_SHEET_ID);
    if (!sheet) return;
    void run_csv(
      () => {
        // `grid.exportCsv` counts the viewport's presentation-padding columns
        // against the default 1M-cell ceiling (100k rows × ~14 padded columns),
        // so the workbench drives the same public codec with an explicit ceiling
        // sized to the padded sheet width.
        const csv = toCsv(sheet, grid.store, {
          resourceLimits: { maxCells: (sheet.rowCount + 1) * sheet.columns.length },
        });
        downloadBytes(csv, "analytics-pipeline.csv", "text/csv;charset=utf-8");
        record("CSV export prepared · current view order");
      },
      (error) => `Cannot export CSV: ${String(error)}. Try again.`,
    );
  }, [record, run_csv]);

  const export_xlsx = useCallback(async (): Promise<void> => {
    const grid = grid_ref.current;
    if (!grid) return;
    await run_xlsx(
      async () => {
        await installXlsx();
        await grid.exportXlsx("analytics-pipeline.xlsx");
        record("XLSX export prepared");
      },
      (error) => `Cannot export XLSX: ${String(error)}. Try again.`,
    );
  }, [record, run_xlsx]);

  /**
   * CSV workflow entry point: parse with the shared core codec and overlay the
   * parsed rows onto the top of the pipeline as ONE undoable commit.
   */
  const import_csv = useCallback(
    async (file: File): Promise<void> => {
      const grid = grid_ref.current;
      if (!grid || read_only) return;
      await run_import(
        async () => {
          const columns = workbook.sheets[0]?.columns ?? [];
          const parsed = fromCsv(await file.text(), columns);
          const rows = Math.min(parsed.rowCount, MAX_IMPORT_ROWS);
          if (rows === 0) {
            record(`${file.name}: no data rows found`);
            return;
          }
          const patches: DocumentOp[] = [];
          columns.forEach((column, col) => {
            const values = parsed.columns[column.key];
            if (!values) return;
            for (let row = 0; row < rows; row++) {
              const value = values[row];
              if (value === null || value === undefined) continue;
              patches.push({
                op: "set",
                addr: { sheet: ANALYTICS_SHEET_ID, row, col },
                value: {
                  kind: "literal",
                  value: typeof value === "number" ? value : String(value),
                },
              });
            }
          });
          grid.applyTransaction({ patches });
          record(
            `Imported ${rows.toLocaleString()} row${rows === 1 ? "" : "s"} from ${file.name} · one undoable commit`,
          );
        },
        (error) => `Cannot import CSV: ${String(error)}. Check the file and try again.`,
      );
    },
    [read_only, record, workbook, run_import],
  );

  const choose_renderer = useCallback((mode: RenderingMode): void => {
    set_renderer(mode);
    set_renderer_fallback(null);
  }, []);

  useEffect(() => observeSiteTheme(() => grid_ref.current?.replaceTheme(ANALYTICS_THEME)), []);

  return {
    csvAction: csv_action,
    xlsxAction: xlsx_action,
    importAction: import_action,
    initializationError: initialization_error,
    onInitializationError: (error: unknown) =>
      set_initialization_error(`Cannot load the workbook: ${String(error)}`),
    // Grid inputs.
    gridRef: grid_ref,
    workbook,
    dataset,
    readOnly: read_only,
    renderer,
    // Adapter events.
    onReady: on_ready,
    onGridChange: on_grid_change,
    onSelectionChange: on_selection_change,
    // Controlled state and derived summaries.
    market,
    segment,
    query,
    setQuery: set_query,
    replacement,
    setReplacement: set_replacement,
    matches,
    visibleRows: visible_rows,
    kpis,
    selection,
    formulaAddress: formula_address,
    formulaDraft: formula_draft,
    generation,
    readyReason: ready_reason,
    activeRenderer: active_renderer,
    rendererFallback: renderer_fallback,
    activity,
    // Actions.
    fitGridColumns: fit_grid_columns,
    editFormulaDraft: edit_formula_draft,
    commitFormulaDraft: commit_formula_draft,
    chooseMarket: choose_market,
    chooseSegment: choose_segment,
    runSearch: run_search,
    findNext: find_next,
    findPrev: find_prev,
    replaceCurrent: replace_current,
    replaceAll: replace_all,
    rankByArr: rank_by_arr,
    undo,
    redo,
    resetView: reset_view,
    reloadDataset: reload_dataset,
    toggleReadOnly: toggle_read_only,
    exportCsv: export_csv,
    exportXlsx: export_xlsx,
    importCsv: import_csv,
    chooseRenderer: choose_renderer,
  };
}
