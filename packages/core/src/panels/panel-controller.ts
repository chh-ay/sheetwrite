// Opens the Chart panel and the pivot field list, and runs the Insert ›
// Chart and Insert › PivotTable commands. This module is the panel chunk:
// panel-loader.ts loads it on first use and attaches it once per grid.
// Everything goes through the public Grid API.

import { colToA1 } from "../a1.js";
import { sheetNameKey } from "../sheet-name.js";
import type { ChartKind, ChartRef } from "../types/chart.js";
import type { CellAddress, SheetId } from "../types/coordinates.js";
import type { SheetSnapshot } from "../types/document.js";
import type { Grid, IconOverrides } from "../types/grid.js";
import type { PivotDefinition } from "../types/pivot.js";
import { chartFromRange, nextChartId, selectionRange } from "./chart-model.js";
import { chartPanel } from "./chart-panel.js";
import { rejectionMessage } from "./panel-dom.js";
import { nextPivotIdentity, pivotSourceFor } from "./pivot-model.js";
import { pivotPanel } from "./pivot-panel.js";
import { parseRangeText } from "./range-text.js";

/** What the open panel shows, so selection changes can switch or close it. */
interface OpenPanel {
  readonly kind: "chart" | "pivot";
  readonly sheet: SheetId;
  readonly id: string;
}

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

/** Where Excel puts a pivot on a new sheet: A3, which leaves room for filters above it. */
const NEW_SHEET_ANCHOR = { row: 2, col: 0 };
/** Size of a new pivot sheet: enough room for a typical summary to spill. */
const NEW_SHEET_ROWS = 1000;
const NEW_SHEET_COLUMNS = 26;
const NEW_SHEET_COLUMN_WIDTH = 100;

const PIVOT_LOCATION_ERROR = "Enter a cell for the pivot table, for example Sheet1!H2.";
const NO_SELECTION = "Select the source data first.";

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
 * The field list follows the cell selection: a cell in a pivot's output shows
 * that pivot's list without taking focus from the cells, and leaving every
 * output closes it, as Excel hides it.
 */
export function syncPivotPanel(
  grid: Grid,
  hit: { readonly sheet: SheetId; readonly id: string } | null,
): void {
  const open = stateOf(grid).open;
  if (hit === null) {
    if (open?.kind === "pivot") grid.openPanel(null);
    return;
  }
  if (open?.kind !== "pivot" || open.sheet !== hit.sheet || open.id !== hit.id) {
    openPivotPanel(grid, hit.sheet, hit.id, false);
  }
}

/** An open Chart panel follows the selected chart; a selection alone never opens it. */
export function followChart(grid: Grid, ref: ChartRef | null): void {
  const open = stateOf(grid).open;
  if (ref === null || open?.kind !== "chart") return;
  if (open.sheet !== ref.sheet || open.id !== ref.id) openChartPanel(grid, ref, false);
}

/**
 * Insert › Chart: a chart of the selection (a column chart unless the ribbon
 * menu picked another kind), in one undo step. The chart is selected and its
 * panel opens. Returns false when nothing was inserted.
 */
export function insertChart(grid: Grid, kind: ChartKind = "column"): boolean {
  const sheets = grid.store.getWorkbook().sheets;
  const range = selectionRange(grid.getSelection(), sheets);
  const owner = sheets.find((sheet) => sheet.id === range?.sheet);
  if (range === null || owner === undefined) return false;

  const chart = chartFromRange(
    range,
    (row, col) => grid.store.getCell({ sheet: range.sheet, row, col }).resolved,
    nextChartId(grid.getCharts(range.sheet)),
    owner.columns.length,
    kind,
  );
  if (grid.setChart(chart, range.sheet).status !== "applied") return false;

  grid.selectChart(chart.id, range.sheet);
  openChartPanel(grid, { sheet: range.sheet, id: chart.id });
  return true;
}

/** Where Insert › PivotTable puts the new pivot. */
export type PivotDestination =
  | { readonly kind: "new-sheet" }
  | { readonly kind: "cell"; readonly text: string };

/**
 * Insert › PivotTable: a pivot with no fields over the selection, or over the
 * table that holds it, at `destination`, in one undo step: a new sheet and
 * its pivot are one transaction, so a rejected pivot leaves no sheet behind.
 * The pivot's anchor is selected and the field list opens. Returns an error
 * message for the form, or null.
 */
export function insertPivot(grid: Grid, destination: PivotDestination): string | null {
  const workbook = grid.store.getWorkbook();
  const range = selectionRange(grid.getSelection(), workbook.sheets);
  if (range === null) return NO_SELECTION;

  let anchor: CellAddress;
  let newSheet: SheetSnapshot | null = null;
  if (destination.kind === "cell") {
    const parsed = parseRangeText(destination.text, workbook.sheets, grid.getActiveSheet());
    if ("error" in parsed) {
      return destination.text.trim() === "" ? PIVOT_LOCATION_ERROR : parsed.error;
    }
    if (
      parsed.range.start.row !== parsed.range.end.row ||
      parsed.range.start.col !== parsed.range.end.col
    ) {
      return PIVOT_LOCATION_ERROR;
    }
    anchor = { sheet: parsed.range.sheet, ...parsed.range.start };
  } else {
    newSheet = pivotSheet(workbook.sheets);
    anchor = { sheet: newSheet.id, ...NEW_SHEET_ANCHOR };
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
  const result =
    newSheet === null
      ? grid.setPivot(pivot, anchor.sheet)
      : grid.applyTransaction({
          patches: [
            { op: "addSheet", sheet: newSheet },
            { op: "setPivot", sheet: newSheet.id, pivot },
          ],
        });
  const message = rejectionMessage(result);
  if (message !== null) return message;

  if (grid.getActiveSheet() !== anchor.sheet) grid.setActiveSheet(anchor.sheet);
  grid.setSelection({ kind: "cell", addr: anchor });
  openPivotPanel(grid, anchor.sheet, pivot.id);
  return null;
}

/** An empty sheet for a new pivot, with Excel's next free `Sheet N` name and a free ID. */
function pivotSheet(
  sheets: readonly { readonly id: SheetId; readonly name: string }[],
): SheetSnapshot {
  const names = new Set(sheets.map((sheet) => sheetNameKey(sheet.name)));
  let number = sheets.length + 1;
  while (names.has(sheetNameKey(`Sheet ${number}`))) number += 1;

  const ids = new Set(sheets.map((sheet) => sheet.id));
  let suffix = sheets.length + 1;
  while (ids.has(`sheet-${suffix}`)) suffix += 1;

  return {
    id: `sheet-${suffix}`,
    name: `Sheet ${number}`,
    order: sheets.length,
    rowCount: NEW_SHEET_ROWS,
    columns: Array.from({ length: NEW_SHEET_COLUMNS }, (_, col) => ({
      key: colToA1(col),
      header: colToA1(col),
      width: NEW_SHEET_COLUMN_WIDTH,
      type: "text" as const,
    })),
    cells: [],
  };
}

/** Attach the loaded panels to one grid. Returns the disposer. */
export function attachPanels(grid: Grid, icons?: IconOverrides): () => void {
  stateOf(grid).icons = icons;
  return () => {
    STATES.delete(grid);
  };
}
