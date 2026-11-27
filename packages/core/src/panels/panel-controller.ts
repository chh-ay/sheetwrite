// Opens the side panels (Chart, PivotTable Fields, Explain Formula, Name
// Manager, Measures, Data Model, Insert Slicers, Insert KPI Card) and runs
// the Insert › Chart, Insert › PivotChart and Insert › PivotTable commands.
// This module is the panel chunk: panel-loader.ts loads it on first use and
// attaches it once per grid. The Sort, Queries & Connections, Edit Links and
// Version History panels are chunks of their own (`open_lazy_panel`).
// Everything goes through the public Grid API.

import { MAX_CHART_POINTS } from "../chart-definition.js";
import { isDashboard } from "../dashboard.js";
import { firstFreeBox } from "../dashboard/dashboard-layout.js";
import { readRowValues, scanColumnValues } from "../data-window-reads.js";
import { newSheetShape, nextSheetName } from "../sheet-commands.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartKind, ChartRef } from "../types/chart.js";
import type { CellAddress, Range, SheetId } from "../types/coordinates.js";
import type { DashboardItem } from "../types/dashboard.js";
import type { SheetSnapshot } from "../types/document.js";
import type { Grid, GridPanel, IconOverrides } from "../types/grid.js";
import type { PivotDefinition } from "../types/pivot.js";
import {
  chartFromRange,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  nextChartId,
  selectionRange,
} from "./chart-model.js";
import { chartPanel } from "./chart-panel.js";
import { explainPanel } from "./explain-panel.js";
import { kpiPanel } from "./kpi-panel.js";
import { measurePanel } from "./measure-panel.js";
import { namePanel } from "./name-panel.js";
import { rejectionMessage } from "./panel-dom.js";
import { nextPivotIdentity, pivotSourceFor } from "./pivot-model.js";
import { pivotPanel } from "./pivot-panel.js";
import { parseRangeText } from "./range-text.js";
import { relationshipPanel } from "./relationship-panel.js";
import { selectedPivot } from "./selected-pivot.js";
import { slicerPanel } from "./slicer-panel.js";

/** What the open panel shows, so selection changes can switch or close it. */
type OpenPanel =
  | { readonly kind: "chart" | "pivot"; readonly sheet: SheetId; readonly id: string }
  | {
      readonly kind:
        | "explain"
        | "names"
        | "queries"
        | "links"
        | "sort"
        | "dataModel"
        | "measures"
        | "history"
        | "slicer"
        | "kpi";
    };

interface PanelState {
  icons: IconOverrides | undefined;
  open: OpenPanel | null;
  /** The latest lazy panel request; an older one that finishes loading later opens nothing. */
  lazyRequest: symbol | null;
}

const STATES = new WeakMap<Grid, PanelState>();

function state_of(grid: Grid): PanelState {
  let state = STATES.get(grid);
  if (state === undefined) {
    state = { icons: undefined, open: null, lazyRequest: null };
    STATES.set(grid, state);
  }
  return state;
}

/** Where Excel puts a pivot on a new sheet: A3, which leaves room for filters above it. */
const NEW_SHEET_ANCHOR = { row: 2, col: 0 };

const PIVOT_LOCATION_ERROR = "Enter a cell for the pivot table, for example Sheet1!H2.";
const NO_SELECTION = "Select the source data first.";

/** Show the Chart panel for `ref`; with `focus` false the panel does not take the focus. */
export function openChartPanel(grid: Grid, ref: ChartRef, focus = true): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "chart", sheet: ref.sheet, id: ref.id };
  const panel = chartPanel(grid, ref, state.icons);
  grid.openPanel({
    title: panel.title,
    focus,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

/** Show the field list of pivot `id`; with `focus` false the panel does not take the focus. */
export function openPivotPanel(grid: Grid, sheet: SheetId, id: string, focus = true): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "pivot", sheet, id };
  const panel = pivotPanel(grid, sheet, id, focus);
  grid.openPanel({
    ...panel,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

/** Show Formulas › Explain Formula for the focus cell; the panel follows the selection. */
export function openExplainPanel(grid: Grid): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "explain" };
  const panel = explainPanel(grid);
  grid.openPanel({
    ...panel,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

export function openNamePanel(grid: Grid, define = false): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "names" };
  const panel = namePanel(grid, define);
  grid.openPanel({
    ...panel,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

/** Data › Measures. */
export function openMeasurePanel(grid: Grid): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "measures" };
  const panel = measurePanel(grid);
  grid.openPanel({
    ...panel,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

/** Data › Data Model and Data › Relationships open the data model panel. */
export function openDataModelPanel(grid: Grid): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "dataModel" };
  const panel = relationshipPanel(grid);
  grid.openPanel({
    ...panel,
    render: (body) => track_open(state, open, panel.render(body)),
  });
}

/** Insert › Filters › Slicer: the Insert Slicers list for the active dashboard. */
export function openSlicerPanel(grid: Grid): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "slicer" };
  const panel = slicerPanel(grid, grid.getActiveSheet());
  grid.openPanel({ ...panel, render: (body) => track_open(state, open, panel.render(body)) });
}

/** Insert › Dashboard › KPI Card: the measure picker for the active dashboard. */
export function openKpiPanel(grid: Grid): void {
  const state = state_of(grid);
  const open: OpenPanel = { kind: "kpi" };
  const panel = kpiPanel(grid, grid.getActiveSheet());
  grid.openPanel({ ...panel, render: (body) => track_open(state, open, panel.render(body)) });
}

/** Data › Custom Sort. */
export function openSortPanel(grid: Grid): void {
  // A dynamic import, so bundlers emit the Sort panel as its own chunk that
  // loads on first open instead of with every grid.
  open_lazy_panel(grid, { kind: "sort" }, async () => (await import("./sort-panel.js")).sortPanel);
}

/** Data › Queries & Connections, or Get Data with the new-query form open. */
export function openQueryPanel(grid: Grid, create: boolean): void {
  // Only grids with a query session load this chunk.
  open_lazy_panel(grid, { kind: "queries" }, async () => {
    const { queryPanel: query_panel } = await import("./query-panel.js");
    return (target) => query_panel(target, create);
  });
}

/** Data › Queries & Connections › Edit Links. */
export function openEditLinksPanel(grid: Grid): void {
  open_lazy_panel(grid, { kind: "links" }, async () => {
    const { editLinksPanel: edit_links_panel } = await import("./edit-links-panel.js");
    return edit_links_panel;
  });
}

/** Open the opted-in history panel; `load` imports its chunk and returns its builder. */
export function openHistoryPanel(grid: Grid, load: () => Promise<(grid: Grid) => GridPanel>): void {
  open_lazy_panel(grid, { kind: "history" }, load);
}

/**
 * Open a panel whose code is a chunk of its own, loaded on first open. The
 * panel opens once the chunk is ready; until then the grid stays as it is.
 * The latest request wins, so a second command during the load opens only
 * its own panel. A failed load is not cached: the next open tries again, and
 * the failure stays a rejected promise that the host's unhandled-rejection
 * path observes.
 */
function open_lazy_panel(
  grid: Grid,
  open: OpenPanel,
  load: () => Promise<(grid: Grid) => GridPanel>,
): void {
  const state = state_of(grid);
  const request = Symbol(open.kind);
  state.lazyRequest = request;

  void load().then((build) => {
    if (state.lazyRequest !== request) return;

    state.lazyRequest = null;
    const panel = build(grid);
    grid.openPanel({
      ...panel,
      render: (body) => track_open(state, open, panel.render(body)),
    });
  });
}

/** Record the open panel until its cleanup runs, whoever closes it. */
function track_open(state: PanelState, open: OpenPanel, cleanup: () => void): () => void {
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
  const open = state_of(grid).open;
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
  const open = state_of(grid).open;
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
    chart_source_reader(grid, range),
    nextChartId(grid.getCharts(range.sheet)),
    owner.columns.length,
    kind,
  );
  if (grid.setChart(chart, range.sheet).status !== "applied") return false;

  grid.selectChart(chart.id, range.sheet);
  openChartPanel(grid, { sheet: range.sheet, id: chart.id });
  return true;
}

/** Width and height, in dashboard cells, of a new PivotChart. */
const PIVOT_CHART_BOX = { w: 6, h: 8 } as const;

/**
 * Insert › Charts › PivotChart: a chart of `kind` over a pivot, as Excel
 * inserts a PivotChart for the PivotTable that holds the active cell. On a
 * worksheet the chart floats right of the pivot's output; it is selected and
 * its panel opens. False when no pivot is in reach or the store refuses the
 * change.
 */
export function insertPivotChart(grid: Grid, kind: ChartKind = "column"): boolean {
  const sheet = grid.getActiveSheet();
  const owner = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
  if (!isDashboard(owner)) return insert_worksheet_pivot_chart(grid, kind);

  const items = owner?.dashboard?.items ?? [];
  const pivots = items.filter((item) => item.kind === "pivot");
  const focused = document.activeElement?.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
  const source = pivots.find((item) => item.id === focused) ?? pivots[0];
  if (source === undefined || source.kind !== "pivot") return false;

  const id = nextChartId(grid.getCharts(sheet));
  const box = firstFreeBox(items, PIVOT_CHART_BOX.w, PIVOT_CHART_BOX.h);
  const title = grid.getPivots(sheet).find((pivot) => pivot.id === source.pivot)?.name;
  // A dashboard places the chart through its item box, so the anchor stays at the origin.
  const anchor = {
    row: 0,
    col: 0,
    offsetX: 0,
    offsetY: 0,
    width: DEFAULT_CHART_WIDTH,
    height: DEFAULT_CHART_HEIGHT,
  };
  const result = grid.applyTransaction({
    patches: [
      {
        op: "setChart",
        sheet,
        chart: {
          id,
          kind,
          ...(title === undefined ? {} : { title }),
          anchor,
          series: [],
          pivot: source.pivot,
        },
      },
      { op: "setDashboardItem", sheet, item: { id: `chart-${id}`, box, kind: "chart", chart: id } },
    ],
  });
  return result.status === "applied";
}

/** {@link insertPivotChart} on a worksheet. */
function insert_worksheet_pivot_chart(grid: Grid, kind: ChartKind): boolean {
  const hit = selectedPivot(grid);
  const sheet = hit?.range.sheet;
  const owner = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
  if (hit === null || sheet === undefined || owner === undefined) return false;

  const id = nextChartId(grid.getCharts(sheet));
  const title = grid.getPivots(sheet).find((pivot) => pivot.id === hit.id)?.name;
  const anchor = {
    row: hit.range.start.row,
    col: Math.min(hit.range.end.col + 1, owner.columns.length - 1),
    offsetX: 0,
    offsetY: 0,
    width: DEFAULT_CHART_WIDTH,
    height: DEFAULT_CHART_HEIGHT,
  };
  const chart = {
    id,
    kind,
    ...(title === undefined ? {} : { title }),
    anchor,
    series: [],
    pivot: hit.id,
  };
  if (grid.setChart(chart, sheet).status !== "applied") return false;

  grid.selectChart(id, sheet);
  openChartPanel(grid, { sheet, id });
  return true;
}

/**
 * Reader over the cells that chart inference inspects: the first row and the
 * first column up to `MAX_CHART_POINTS` rows below it, each read in bulk.
 */
function chart_source_reader(grid: Grid, range: Range): (row: number, col: number) => CellScalar {
  const { sheet, start, end } = range;
  const header = readRowValues(grid.store, {
    sheet,
    row: start.row,
    startCol: start.col,
    endCol: end.col,
  });

  const categories: CellScalar[] = [];
  const category_span = {
    sheet,
    col: start.col,
    startRow: start.row + 1,
    endRow: Math.min(end.row, start.row + MAX_CHART_POINTS),
  };
  scanColumnValues(grid.store, category_span, (value) => {
    categories.push(value);
    return true;
  });

  return (row, col) =>
    row === start.row
      ? (header[col - start.col] ?? null)
      : (categories[row - category_span.startRow] ?? null);
}

/** Where Insert › PivotTable puts the new pivot. */
export type PivotDestination =
  | { readonly kind: "new-sheet" }
  | { readonly kind: "cell"; readonly text: string }
  /** A free box on the active dashboard, for a pivot over the table `table`. */
  | { readonly kind: "dashboard"; readonly table: string };

/**
 * Insert › PivotTable: a pivot with no fields over the selection, or over the
 * table that holds it, at `destination`, in one undo step: a new sheet and
 * its pivot are one transaction, so a rejected pivot leaves no sheet behind.
 * The pivot's anchor is selected and the field list opens. Returns an error
 * message for the form, or null.
 */
export function insertPivot(grid: Grid, destination: PivotDestination): string | null {
  if (destination.kind === "dashboard") return insert_dashboard_pivot(grid, destination.table);
  const workbook = grid.store.getWorkbook();
  const range = selectionRange(grid.getSelection(), workbook.sheets);
  if (range === null) return NO_SELECTION;

  let anchor: CellAddress;
  let new_sheet: SheetSnapshot | null = null;
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
    new_sheet = pivot_sheet(workbook.sheets);
    anchor = { sheet: new_sheet.id, ...NEW_SHEET_ANCHOR };
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
    new_sheet === null
      ? grid.setPivot(pivot, anchor.sheet)
      : grid.applyTransaction({
          patches: [
            { op: "addSheet", sheet: new_sheet },
            { op: "setPivot", sheet: new_sheet.id, pivot },
          ],
        });
  const message = rejectionMessage(result);
  if (message !== null) return message;

  if (grid.getActiveSheet() !== anchor.sheet) grid.setActiveSheet(anchor.sheet);
  grid.setSelection({ kind: "cell", addr: anchor });
  openPivotPanel(grid, anchor.sheet, pivot.id);
  return null;
}

/** Width and height, in dashboard cells, of a new pivot item. */
const NEW_PIVOT_BOX = { w: 6, h: 8 } as const;

/**
 * Insert › PivotTable on a dashboard: a pivot with no fields over `table`
 * and an item that shows it in the first free box, in one undo step. The
 * field list opens.
 */
function insert_dashboard_pivot(grid: Grid, table: string): string | null {
  const sheet = grid.getActiveSheet();
  const items =
    grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard?.items ??
    [];
  const pivot: PivotDefinition = {
    ...nextPivotIdentity(grid.getPivots()),
    source: { table },
    anchor: { row: 0, col: 0 },
    rows: [],
    columns: [],
    values: [],
  };
  const item: DashboardItem = {
    id: pivot.id,
    box: firstFreeBox(items, NEW_PIVOT_BOX.w, NEW_PIVOT_BOX.h),
    kind: "pivot",
    pivot: pivot.id,
  };
  const message = rejectionMessage(
    grid.applyTransaction({
      patches: [
        { op: "setPivot", sheet, pivot },
        { op: "setDashboardItem", sheet, item },
      ],
    }),
  );
  if (message !== null) return message;
  openPivotPanel(grid, sheet, pivot.id);
  return null;
}

/** An empty sheet for a new pivot, with Excel's next free `SheetN` name and a free ID. */
function pivot_sheet(
  sheets: readonly { readonly id: SheetId; readonly name: string }[],
): SheetSnapshot {
  const ids = new Set(sheets.map((sheet) => sheet.id));
  let suffix = sheets.length + 1;
  while (ids.has(`sheet-${suffix}`)) suffix += 1;

  return {
    id: `sheet-${suffix}`,
    name: nextSheetName(sheets),
    order: sheets.length,
    ...newSheetShape(),
    cells: [],
  };
}

/** Attach the loaded panels to one grid. Returns the disposer. */
export function attachPanels(grid: Grid, icons?: IconOverrides): () => void {
  const state = state_of(grid);
  state.icons = icons;
  return () => {
    // A lazy panel whose chunk loads after the grid is destroyed opens nothing.
    state.lazyRequest = null;
    STATES.delete(grid);
  };
}
