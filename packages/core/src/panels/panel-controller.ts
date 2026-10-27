// Opens the Chart panel and the pivot field list, and runs the Insert ›
// Chart and Insert › Pivot table commands. The grid attaches one controller
// per grid; the ribbon calls the commands. Everything goes through the
// public Grid API, plus one engine fact: whether pivots are computed.

import { colToA1 } from "../a1.js";
import { sheetNameKey } from "../sheet-name.js";
import { storeEngine } from "../store/engine-registry.js";
import type { ChartRef } from "../types/chart.js";
import type { CellAddress, SheetId } from "../types/coordinates.js";
import type { Grid, IconOverrides } from "../types/grid.js";
import type { PivotDefinition } from "../types/pivot.js";
import { chartFromRange, nextChartId, selectionRange } from "./chart-model.js";
import { chartPanel } from "./chart-panel.js";
import { nextPivotIdentity, pivotSourceFor } from "./pivot-model.js";
import { pivotPanel } from "./pivot-panel.js";
import { parseRangeText } from "./range-text.js";

/** What the open panel shows, so selection changes can switch or close it. */
type OpenPanel =
  | { readonly kind: "chart"; readonly sheet: SheetId; readonly id: string }
  | { readonly kind: "pivot"; readonly sheet: SheetId; readonly id: string };

interface PanelState {
  icons: IconOverrides | undefined;
  open: OpenPanel | null;
}

const STATES = new WeakMap<Grid, PanelState>();

function stateOf(grid: Grid): PanelState {
  let state = STATES.get(grid);
  if (state === undefined) {
    state = { icons: undefined, open: null };
    STATES.set(grid, state);
  }
  return state;
}

/** Pivot output cells, cached until the next change: selection moves on every arrow key. */
interface OutputRect {
  readonly id: string;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** Where Excel puts a pivot on a new sheet: A3, which leaves room for filters above it. */
const NEW_SHEET_ANCHOR = { row: 2, col: 0 };
/** Size of a new pivot sheet: enough room for a typical summary to spill. */
const NEW_SHEET_ROWS = 1000;
const NEW_SHEET_COLUMNS = 26;
const NEW_SHEET_COLUMN_WIDTH = 100;

const PIVOT_LOCATION_ERROR = "Enter a cell for the pivot table, for example Sheet1!H2.";
const PIVOT_REJECTED = "The pivot table could not be created there.";
const NO_SELECTION = "Select the source data first.";

/** Whether the loaded engine computes pivots; a custom store without an engine does not. */
export function pivotsAvailable(grid: Grid): boolean {
  return storeEngine(grid.store)?.computesPivots === true;
}

/** Show the Chart panel for `ref`. */
export function openChartPanel(grid: Grid, ref: ChartRef, focus = true): void {
  const state = stateOf(grid);
  const open: OpenPanel = { kind: "chart", sheet: ref.sheet, id: ref.id };
  const panel = chartPanel(grid, ref, state.icons);
  grid.openPanel({
    title: panel.title,
    focus,
    render: (body) => trackOpen(state, open, panel.render(body)),
  });
}

/** Show the field list of the pivot `id` on `sheet`. */
export function openPivotPanel(grid: Grid, sheet: SheetId, id: string, focus = true): void {
  const state = stateOf(grid);
  const open: OpenPanel = { kind: "pivot", sheet, id };
  const panel = pivotPanel(grid, sheet, id, focus);
  grid.openPanel({
    ...panel,
    render: (body) => trackOpen(state, open, panel.render(body)),
  });
}

/** Record the open panel until its cleanup runs, whoever closes it. */
function trackOpen(state: PanelState, open: OpenPanel, cleanup: () => void): () => void {
  state.open = open;
  return () => {
    cleanup();
    if (state.open === open) state.open = null;
  };
}

/**
 * Insert › Chart: a column chart of the selection, in one undo step. The chart
 * is selected and its panel opens. Returns false when nothing was inserted.
 */
export function insertChart(grid: Grid): boolean {
  const sheets = grid.store.getWorkbook().sheets;
  const range = selectionRange(grid.getSelection(), sheets);
  const owner = sheets.find((sheet) => sheet.id === range?.sheet);
  if (range === null || owner === undefined) return false;

  const chart = chartFromRange(
    range,
    (row, col) => grid.store.getCell({ sheet: range.sheet, row, col }).resolved,
    nextChartId(grid.getCharts(range.sheet)),
    owner.columns.length,
  );
  if (!grid.setChart(range.sheet, chart)) return false;

  grid.selectChart(range.sheet, chart.id);
  openChartPanel(grid, { sheet: range.sheet, id: chart.id });
  return true;
}

/** Where Insert › Pivot table puts the new pivot. */
export type PivotDestination =
  | { readonly kind: "new-sheet" }
  | { readonly kind: "cell"; readonly text: string };

/**
 * Insert › Pivot table: a pivot with no fields over the selection, or over the
 * table that holds it, at `destination`. The pivot's anchor is selected and the
 * field list opens. Returns an error message for the form, or null.
 */
export function insertPivot(grid: Grid, destination: PivotDestination): string | null {
  const workbook = grid.store.getWorkbook();
  const range = selectionRange(grid.getSelection(), workbook.sheets);
  if (range === null) return NO_SELECTION;

  let anchor: CellAddress;
  if (destination.kind === "cell") {
    const parsed = parseRangeText(destination.text, workbook.sheets, grid.getActiveSheet());
    if ("error" in parsed)
      return destination.text.trim() === "" ? PIVOT_LOCATION_ERROR : parsed.error;
    anchor = { sheet: parsed.range.sheet, ...parsed.range.start };
  } else {
    const added = grid.addSheet({
      name: nextSheetName(workbook.sheets.map((sheet) => sheet.name)),
      rowCount: NEW_SHEET_ROWS,
      columns: Array.from({ length: NEW_SHEET_COLUMNS }, (_, col) => ({
        key: colToA1(col),
        header: colToA1(col),
        width: NEW_SHEET_COLUMN_WIDTH,
        type: "text" as const,
      })),
    });
    if (added.status !== "applied") return PIVOT_REJECTED;
    anchor = { sheet: added.sheet, ...NEW_SHEET_ANCHOR };
  }

  const tables = workbook.sheets.flatMap((sheet) => sheet.tables ?? []);
  const pivot: PivotDefinition = {
    ...nextPivotIdentity(grid.getPivots()),
    source: pivotSourceFor(range, tables),
    anchor: { row: anchor.row, col: anchor.col },
    rows: [],
    columns: [],
    values: [],
  };
  if (grid.setPivot(pivot, anchor.sheet).status !== "applied") {
    // The new sheet exists only for this pivot; do not leave it behind empty.
    if (destination.kind === "new-sheet") grid.removeSheet(anchor.sheet);
    return PIVOT_REJECTED;
  }

  if (grid.getActiveSheet() !== anchor.sheet) grid.setActiveSheet(anchor.sheet);
  grid.setSelection({ kind: "cell", addr: anchor });
  openPivotPanel(grid, anchor.sheet, pivot.id);
  return null;
}

/** Excel's name for a new sheet: the first free `Sheet N`. */
function nextSheetName(names: readonly string[]): string {
  const used = new Set(names.map(sheetNameKey));
  let number = names.length + 1;
  while (used.has(sheetNameKey(`Sheet ${number}`))) number += 1;
  return `Sheet ${number}`;
}

/** The output rectangles of the pivots on `sheet`; an empty or failed pivot covers its anchor. */
function pivotOutputs(grid: Grid, sheet: SheetId): OutputRect[] {
  return grid.getPivots(sheet).map((pivot) => {
    const result = grid.getPivotResult(sheet, pivot.id);
    const top = result?.anchor.row ?? pivot.anchor.row;
    const left = result?.anchor.col ?? pivot.anchor.col;
    const rows = Math.max(1, result?.rows ?? 0);
    const cols = Math.max(1, result?.cols ?? 0);
    return { id: pivot.id, top, left, bottom: top + rows - 1, right: left + cols - 1 };
  });
}

/**
 * Wire the panels to one grid: Enter on a chart opens its Chart panel, and a
 * cell selected inside a pivot's output opens that pivot's field list without
 * taking focus from the cells. Leaving the output closes the field list, as
 * Excel hides it. Returns the disposer.
 */
export function attachPanels(grid: Grid, icons?: IconOverrides): () => void {
  const state = stateOf(grid);
  state.icons = icons;
  const outputs = new Map<SheetId, OutputRect[]>();

  const onSelection = (): void => {
    const range = selectionRange(grid.getSelection(), grid.store.getWorkbook().sheets);
    if (range === null) return;
    let rects = outputs.get(range.sheet);
    if (rects === undefined) {
      rects = pivotOutputs(grid, range.sheet);
      outputs.set(range.sheet, rects);
    }
    const { row, col } = range.start;
    const hit = rects.find(
      (rect) => row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right,
    );

    const open = state.open;
    if (hit !== undefined) {
      if (open?.kind !== "pivot" || open.sheet !== range.sheet || open.id !== hit.id) {
        openPivotPanel(grid, range.sheet, hit.id, false);
      }
    } else if (open?.kind === "pivot") {
      grid.openPanel(null);
    }
  };

  const disposers = [
    grid.on("chart-activate", (ref) => openChartPanel(grid, ref)),
    grid.on("chart-select", (ref) => {
      // An open Chart panel follows the selected chart; it never opens on a click alone.
      const open = state.open;
      if (ref === null || open?.kind !== "chart") return;
      if (open.sheet !== ref.sheet || open.id !== ref.id) openChartPanel(grid, ref, false);
    }),
    grid.on("change", () => outputs.clear()),
    grid.on("selection", onSelection),
  ];
  return () => {
    for (const dispose of disposers) dispose();
    STATES.delete(grid);
  };
}
