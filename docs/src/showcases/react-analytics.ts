/**
 * React adapter for the analytics scenario: one hook that binds the shared
 * dataset/workbook/KPI contract from `scenarios/analytics.ts` to controlled
 * React state. Every workbench interaction — filters, search/replace, formula
 * entry, undo/redo, import/export, dataset reloads, renderer choice — flows
 * through this state, and grid resets reconcile back into it via `onReady`.
 */

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
import { downloadBytes, fromCsv, parseCellInput, toCsv } from "@sheetwrite/core";
import type { GridReadyEvent, GridReadyReason } from "@sheetwrite/core/adapter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function describeSelection(selection: Selection | null): string {
  if (!selection) return "No selection";
  if (selection.kind === "cell") {
    return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  }
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

export interface KpiValues {
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

function readSummaryNumber(grid: Grid, row: number): number | null {
  const cell = grid.store.getCell({ sheet: ANALYTICS_SUMMARY_SHEET_ID, row, col: 1 });
  return typeof cell.resolved === "number" ? cell.resolved : null;
}

function columnFormat(col: number): CellFormat {
  const workbookColumn = createAnalyticsWorkbook().sheets.find(
    (sheet) => sheet.id === ANALYTICS_SHEET_ID,
  )?.columns?.[col];
  return workbookColumn?.type ?? "text";
}

/** Minimum row-number gutter and label metrics the Grid allocates for it. */
const ROW_GUTTER_MIN = 48;
const ROW_LABEL_FONT_PX = 13;

/** Row-number gutter width the Grid paints for a sheet of `rowCount` rows. */
function rowGutterWidth(rowCount: number): number {
  const digits = String(Math.max(1, rowCount)).length;
  return Math.max(ROW_GUTTER_MIN, Math.ceil(digits * ROW_LABEL_FONT_PX * 0.6 + 12));
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
  workbook.sheets.forEach((sheet, sheetIndex) => {
    const natural = NATURAL_WIDTHS[sheetIndex];
    if (!natural) return;
    const total = natural.reduce((sum, width) => sum + width, 0);
    const scale = total > 0 ? target / total : 1;
    if (scale < MIN_COLUMN_SCALE) return; // keep scenario widths; grid scrolls
    const widths = natural.map((width) => Math.floor(width * scale));
    let spare = scale === 1 ? 0 : target - widths.reduce((sum, width) => sum + width, 0);
    // Rounding pixels go to the widest columns so the total lands on the host
    // edge exactly instead of short (padding columns) or long (clipping).
    const byWidth = widths
      .map((width, index) => ({ width, index }))
      .sort((a, b) => b.width - a.width);
    for (const entry of byWidth) {
      if (spare <= 0) break;
      widths[entry.index] = entry.width + 1;
      spare -= 1;
    }
    sheet.columns.forEach((column, index) => {
      column.width = widths[index] ?? column.width;
    });
  });
}

/** Host width the workbench fits its columns to; 0 until the stage is measured. */
export interface AnalyticsWorkbenchOptions {
  gridHostWidth?: number;
}

/** Controlled-analytics workbench state machine over the shared scenario. */
export function useAnalyticsWorkbench(options: AnalyticsWorkbenchOptions = {}) {
  const { gridHostWidth = 0 } = options;
  const gridRef = useRef<Grid>(null);
  const activityId = useRef(0);
  const rendererCleanup = useRef<() => void>(() => {});
  const formulaDirty = useRef(false);

  // The measured host width is a workbook input: the Grid must be constructed
  // with fitted widths, so the workbook is rebuilt once the stage reports its
  // width and the Grid mounts on that render instead of before it.
  const workbook = useMemo(() => {
    const next = createAnalyticsWorkbook();
    fitColumnsToHost(next, gridHostWidth);
    return next;
  }, [gridHostWidth]);

  /**
   * Re-fit the columns after the stage changes width. The workbook object is
   * the one the Grid's store reads, so writing widths is enough for the next
   * layout pass — no reset, no new generation, no undo entry. `refresh()` only
   * repaints and the documented geometry setters commit history, so the theme
   * is re-derived to rebuild the column index and layout from the store.
   */
  const fitGridColumns = useCallback(
    (hostWidth: number): void => {
      const grid = gridRef.current;
      if (!grid || hostWidth <= 0) return;
      const before = workbook.sheets.map((sheet) => sheet.columns.map((column) => column.width));
      fitColumnsToHost(workbook, hostWidth);
      const changed = workbook.sheets.some((sheet, index) =>
        sheet.columns.some((column, col) => column.width !== before[index]?.[col]),
      );
      if (changed) grid.replaceTheme(ANALYTICS_THEME);
    },
    [workbook],
  );
  const [dataset, setDataset] = useState<ColumnarData>(() => buildAnalyticsData());

  // Controlled query/view state — the single source of truth the grid is
  // reconciled against after every reset.
  const [market, setMarket] = useState("all");
  const [segment, setSegment] = useState("all");
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [ranked, setRanked] = useState(false);
  const [matches, setMatches] = useState<SearchResult | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // Grid-derived state.
  const [visibleRows, setVisibleRows] = useState(ANALYTICS_ROWS);
  const [kpis, setKpis] = useState<KpiValues>(EMPTY_KPIS);
  const [selection, setSelection] = useState("No selection");
  const [formulaAddress, setFormulaAddress] = useState<CellAddress | null>(null);
  const [formulaDraft, setFormulaDraft] = useState("");
  const [generation, setGeneration] = useState(0);
  const [readyReason, setReadyReason] = useState<GridReadyReason>("initial");
  const [renderer, setRenderer] = useState<"canvas" | "worker">("canvas");
  const [activeRenderer, setActiveRenderer] = useState<"canvas" | "worker">("canvas");
  const [rendererFallback, setRendererFallback] = useState<{
    count: number;
    reason: string;
  } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 0, message: "Workbench initialized" },
  ]);

  useEffect(() => () => rendererCleanup.current(), []);

  const record = useCallback((message: string): void => {
    const id = ++activityId.current;
    setActivity((items) => [{ id, message }, ...items].slice(0, 3));
  }, []);

  const refreshKpis = useCallback((grid: Grid, focusedMarket: string): void => {
    const total = readSummaryNumber(grid, KPI_ROW.total);
    const marketIndex = ANALYTICS_MARKETS.indexOf(
      focusedMarket as (typeof ANALYTICS_MARKETS)[number],
    );
    setKpis({
      total,
      average: readSummaryNumber(grid, KPI_ROW.average),
      largest: readSummaryNumber(grid, KPI_ROW.largest),
      market: marketIndex >= 0 ? readSummaryNumber(grid, MARKET_KPI_START + marketIndex) : total,
    });
    setVisibleRows(grid.store.viewRowCount(ANALYTICS_SHEET_ID));
  }, []);

  const marketFilter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.market,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  const segmentFilter = useCallback((grid: Grid, value: string): void => {
    grid.setColumnFilter(
      ANALYTICS_COLUMNS.segment,
      value === "all" ? null : { kind: "values", values: [value] },
    );
  }, []);

  /** Push every piece of controlled view state onto a (possibly fresh) grid. */
  const reconcileView = useCallback(
    (grid: Grid): void => {
      marketFilter(grid, market);
      segmentFilter(grid, segment);
      if (ranked) grid.sortBy(ANALYTICS_COLUMNS.arr, false);
      if (query.trim().length > 0) {
        const result = grid.search(query.trim());
        setMatches(result);
        if (result.matches.length > 0) grid.findNext();
      } else {
        setMatches(null);
      }
    },
    [market, marketFilter, query, ranked, segment, segmentFilter],
  );

  const onReady = useCallback(
    ({ grid, generation: nextGeneration, reason }: GridReadyEvent): void => {
      grid.setFrozen(0, 1);
      grid.store.applyTransaction({ patches: analyticsSummarySeedOps() });

      rendererCleanup.current();
      setActiveRenderer(grid.rendererKind());
      rendererCleanup.current = grid.on("renderer-fallback", ({ error }) => {
        setActiveRenderer("canvas");
        setRendererFallback((current) => ({
          count: (current?.count ?? 0) + 1,
          reason: error instanceof Error ? error.message : String(error),
        }));
      });

      setGeneration(nextGeneration);
      setReadyReason(reason);
      setFormulaAddress(null);
      setFormulaDraft("");
      formulaDirty.current = false;

      if (nextGeneration > 1) {
        // Controlled reconciliation: the new grid instance adopts the React
        // state that outlived its predecessor.
        reconcileView(grid);
        record(`Grid rebuilt (${reason}) · view reconciled from React state`);
      } else {
        record(`Grid ready · ${ANALYTICS_ROWS.toLocaleString()} rows ingested`);
      }
      refreshKpis(grid, market);
    },
    [market, reconcileView, record, refreshKpis],
  );

  const onGridChange = useCallback(
    ({ transaction, commitReason }: ChangeEvent): void => {
      const grid = gridRef.current;
      const ops = transaction.patches.length;
      record(
        `${ops} op${ops === 1 ? "" : "s"} committed (${commitReason}) · formulas recalculated`,
      );
      if (grid) refreshKpis(grid, market);
    },
    [market, record, refreshKpis],
  );

  const onSelectionChange = useCallback((value: Selection | null): void => {
    setSelection(describeSelection(value));
    const grid = gridRef.current;
    if (!grid) return;
    if (value?.kind !== "cell" || value.addr.sheet !== ANALYTICS_SHEET_ID) {
      if (!formulaDirty.current) {
        setFormulaAddress(null);
        setFormulaDraft("");
      }
      return;
    }
    // Controlled-input reconciliation: grid selection refreshes the draft
    // unless the user is mid-edit in the formula input.
    setFormulaAddress(value.addr);
    if (!formulaDirty.current) {
      const formula = grid.store.getFormula(value.addr);
      if (formula !== null) {
        setFormulaDraft(formula);
      } else {
        const { resolved } = grid.store.getCell(value.addr);
        setFormulaDraft(resolved === null ? "" : String(resolved));
      }
    }
  }, []);

  const editFormulaDraft = useCallback((text: string): void => {
    formulaDirty.current = true;
    setFormulaDraft(text);
  }, []);

  const commitFormulaDraft = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || !formulaAddress || readOnly) return;
    const value = parseCellInput(formulaDraft, columnFormat(formulaAddress.col));
    grid.applyTransaction({ patches: [{ op: "set", addr: formulaAddress, value }] });
    formulaDirty.current = false;
    record(
      value.kind === "formula"
        ? `Formula ${formulaDraft} committed at R${formulaAddress.row + 1}`
        : `Cell R${formulaAddress.row + 1} C${formulaAddress.col + 1} set`,
    );
  }, [formulaAddress, formulaDraft, readOnly, record]);

  const chooseMarket = useCallback(
    (next: string): void => {
      setMarket(next);
      const grid = gridRef.current;
      if (!grid) return;
      marketFilter(grid, next);
      refreshKpis(grid, next);
      record(next === "all" ? "Showing all markets" : `Filtered to ${next}`);
    },
    [marketFilter, record, refreshKpis],
  );

  const chooseSegment = useCallback(
    (next: string): void => {
      setSegment(next);
      const grid = gridRef.current;
      if (!grid) return;
      segmentFilter(grid, next);
      refreshKpis(grid, market);
      record(next === "all" ? "Showing all segments" : `Filtered to ${next} segment`);
    },
    [market, record, refreshKpis, segmentFilter],
  );

  const runSearch = useCallback(
    (nextQuery: string): void => {
      const grid = gridRef.current;
      if (!grid) return;
      setQuery(nextQuery);
      if (nextQuery.trim().length === 0) {
        grid.clearSearch();
        setMatches(null);
        record("Search cleared");
        return;
      }
      const result = grid.search(nextQuery.trim());
      setMatches(result);
      if (result.matches.length > 0) grid.findNext();
      record(`${result.matches.length.toLocaleString()} search matches`);
    },
    [record],
  );

  const findNext = useCallback((): void => {
    const grid = gridRef.current;
    if (grid) setMatches(grid.findNext());
  }, []);

  const findPrev = useCallback((): void => {
    const grid = gridRef.current;
    if (grid) setMatches(grid.findPrev());
  }, []);

  const replaceCurrent = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || readOnly) return;
    setMatches(grid.replaceCurrent(replacement));
    record("Replaced active match");
  }, [readOnly, record, replacement]);

  const replaceAll = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid || readOnly) return;
    const { replaced, result } = grid.replaceAll(replacement);
    setMatches(result);
    record(`Replaced ${replaced.toLocaleString()} cell${replaced === 1 ? "" : "s"}`);
  }, [readOnly, record, replacement]);

  const rankByArr = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.sortBy(ANALYTICS_COLUMNS.arr, false);
    setRanked(true);
    refreshKpis(grid, market);
    record("Ranked by ARR, high to low");
  }, [market, record, refreshKpis]);

  const undo = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    if (grid.getCommandState("undo").disabled) {
      record("Nothing to undo");
      return;
    }
    grid.undo();
    record("Undo");
  }, [record]);

  const redo = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    if (grid.getCommandState("redo").disabled) {
      record("Nothing to redo");
      return;
    }
    grid.redo();
    record("Redo");
  }, [record]);

  /** Clear the controlled view (filters/sort/search) without touching data. */
  const resetView = useCallback((): void => {
    setMarket("all");
    setSegment("all");
    setQuery("");
    setRanked(false);
    setMatches(null);
    const grid = gridRef.current;
    if (!grid) return;
    grid.clearView();
    grid.clearSearch();
    refreshKpis(grid, "all");
    record("View reset · filters, sort, and search cleared");
  }, [record, refreshKpis]);

  /**
   * Input-reset lifecycle: a fresh dataset object replaces the `data` prop, the
   * adapter rebuilds the grid, and `onReady` reconciles the surviving React
   * view state onto the new instance.
   */
  const reloadDataset = useCallback((): void => {
    setDataset(buildAnalyticsData());
    record("Reloading pristine dataset · local edits discarded");
  }, [record]);

  const toggleReadOnly = useCallback((): void => {
    setReadOnly((current) => {
      record(current ? "Editing enabled" : "Workbench is read-only");
      return !current;
    });
  }, [record]);

  const exportCsv = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    const sheet = grid.store.getWorkbook().sheets.find((entry) => entry.id === ANALYTICS_SHEET_ID);
    if (!sheet) return;
    try {
      // `grid.exportCsv` counts the viewport's presentation-padding columns
      // against the default 1M-cell ceiling (100k rows × ~14 padded columns),
      // so the workbench drives the same public codec with an explicit ceiling
      // sized to the padded sheet width.
      const csv = toCsv(sheet, grid.store, {
        resourceLimits: { maxCells: (sheet.rowCount + 1) * sheet.columns.length },
      });
      downloadBytes(csv, "analytics-pipeline.csv", "text/csv;charset=utf-8");
      record("CSV export prepared · current view order");
    } catch (error) {
      record(`CSV export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [record]);

  const exportXlsx = useCallback(async (): Promise<void> => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      // Dynamic on purpose: the XLSX backend is an optional package boundary
      // this workbench demonstrates — a static import would bundle it into the
      // route chunk and defeat the isolation story.
      await import("@sheetwrite/xlsx/register");
      await grid.exportXlsx("analytics-pipeline.xlsx");
      record("XLSX export prepared");
    } catch (error) {
      record(`XLSX export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [record]);

  /**
   * CSV workflow entry point: parse with the shared core codec and overlay the
   * parsed rows onto the top of the pipeline as ONE undoable commit.
   */
  const importCsv = useCallback(
    async (file: File): Promise<void> => {
      const grid = gridRef.current;
      if (!grid || readOnly) return;
      try {
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
              value: { kind: "literal", value: typeof value === "number" ? value : String(value) },
            });
          }
        });
        grid.applyTransaction({ patches });
        record(
          `Imported ${rows.toLocaleString()} row${rows === 1 ? "" : "s"} from ${file.name} · one undoable commit`,
        );
      } catch (error) {
        record(`CSV import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [readOnly, record, workbook],
  );

  const chooseRenderer = useCallback((mode: "canvas" | "worker"): void => {
    setRenderer(mode);
    setRendererFallback(null);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(ANALYTICS_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return {
    // Grid inputs.
    gridRef,
    workbook,
    dataset,
    readOnly,
    renderer,
    // Adapter events.
    onReady,
    onGridChange,
    onSelectionChange,
    // Controlled state and derived summaries.
    market,
    segment,
    query,
    setQuery,
    replacement,
    setReplacement,
    matches,
    visibleRows,
    kpis,
    selection,
    formulaAddress,
    formulaDraft,
    generation,
    readyReason,
    activeRenderer,
    rendererFallback,
    activity,
    // Actions.
    fitGridColumns,
    editFormulaDraft,
    commitFormulaDraft,
    chooseMarket,
    chooseSegment,
    runSearch,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAll,
    rankByArr,
    undo,
    redo,
    resetView,
    reloadDataset,
    toggleReadOnly,
    exportCsv,
    exportXlsx,
    importCsv,
    chooseRenderer,
  };
}
