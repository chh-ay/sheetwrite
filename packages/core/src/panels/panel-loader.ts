// The part of the chart and pivot panels that every spreadsheet grid carries:
// cheap event listeners that decide WHEN a panel is needed. The panels
// themselves (panel-controller.ts and what it imports) load as their own
// chunk on first use: an Insert command, Enter on a chart, or a cell selected
// in a pivot's output. A grid that never does any of these never fetches it.

import { Scope } from "../scope.js";
import { storeEngine } from "../store/engine-registry.js";
import type { ChartRef } from "../types/chart.js";
import type { Selection, SheetId } from "../types/coordinates.js";
import type { Grid, IconOverrides } from "../types/grid.js";
import type {
  attachPanels,
  followChart,
  insertChart,
  insertPivot,
  openChartPanel,
  openExplainPanel,
  openPivotPanel,
  syncPivotPanel,
} from "./panel-controller.js";

interface PanelController {
  attachPanels: typeof attachPanels;
  followChart: typeof followChart;
  insertChart: typeof insertChart;
  insertPivot: typeof insertPivot;
  openChartPanel: typeof openChartPanel;
  openExplainPanel: typeof openExplainPanel;
  openPivotPanel: typeof openPivotPanel;
  syncPivotPanel: typeof syncPivotPanel;
}

/** A pivot whose output holds the focus cell. */
interface PivotHit {
  readonly sheet: SheetId;
  readonly id: string;
}

interface LoaderState {
  icons: IconOverrides | undefined;
  controller: PanelController | null;
  loading: Promise<PanelController> | null;
  /** The latest panel a trigger asked for while the chunk loads; older asks are dropped. */
  pending: ((controller: PanelController) => void) | null;
  /** The triggers and the attached controller; a chunk that loads after it closes does nothing. */
  lifetime: Scope;
}

const STATES = new WeakMap<Grid, LoaderState>();

function stateOf(grid: Grid): LoaderState {
  let state = STATES.get(grid);
  if (state === undefined) {
    state = {
      icons: undefined,
      controller: null,
      loading: null,
      pending: null,
      lifetime: new Scope(),
    };
    STATES.set(grid, state);
  }
  return state;
}

/**
 * Whether the loaded engine computes pivots; a custom store without an engine
 * does not. Insert › PivotTable reads this on every refresh, so it must not
 * need the panel chunk.
 */
export function pivotsAvailable(grid: Grid): boolean {
  return storeEngine(grid.store)?.computesPivots === true;
}

/**
 * The panel controller, loaded once per page and attached once per grid. A
 * failed load is not cached, so the next use tries again.
 */
export function loadPanels(grid: Grid): Promise<PanelController> {
  const state = stateOf(grid);
  state.loading ??= import("./panel-controller.js").then(
    (controller) => {
      if (state.controller === null && !state.lifetime.closed) {
        state.lifetime.add(controller.attachPanels(grid, state.icons));
        state.controller = controller;
      }
      return controller;
    },
    (error: unknown) => {
      state.loading = null;
      throw error;
    },
  );
  return state.loading;
}

/**
 * Run `open` with the controller: now when it is loaded, else once it loads.
 * Asks that arrive during the load replace each other, so a burst of
 * triggers opens one panel, the latest.
 */
function requestPanel(grid: Grid, open: (controller: PanelController) => void): void {
  const state = stateOf(grid);
  if (state.controller !== null) {
    open(state.controller);
    return;
  }

  state.pending = open;
  // Like the ribbon's optional chunk, a failed load remains a rejected
  // promise, so the host can observe it through its unhandled-rejection path.
  // After the grid is destroyed, the load result no longer matters.
  void loadPanels(grid).then(
    (controller) => {
      const run = state.pending;
      state.pending = null;
      if (run !== null && !state.lifetime.closed) run(controller);
    },
    (error: unknown) => {
      if (!state.lifetime.closed) throw error;
    },
  );
}

/** Formulas › Explain Formula: open its panel, loading the panels on first use. */
export function showFormulaExplanation(grid: Grid): void {
  requestPanel(grid, (controller) => controller.openExplainPanel(grid));
}

/** The focus cell of a selection; whole rows and columns are never inside a pivot. */
function focusCell(
  selection: Selection | null,
): { sheet: SheetId; row: number; col: number } | null {
  if (selection === null) return null;
  switch (selection.kind) {
    case "cell":
      return selection.addr;
    case "range":
      return {
        sheet: selection.range.sheet,
        row: Math.min(selection.range.start.row, selection.range.end.row),
        col: Math.min(selection.range.start.col, selection.range.end.col),
      };
    case "multi": {
      const first = selection.ranges[0];
      if (first === undefined) return null;
      return {
        sheet: first.sheet,
        row: Math.min(first.start.row, first.end.row),
        col: Math.min(first.start.col, first.end.col),
      };
    }
    case "row":
    case "column":
      return null;
  }
}

/** Output cells of one pivot; an empty or failed pivot covers its anchor. */
interface OutputRect {
  readonly id: string;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

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

/** The pivot whose output rectangle holds `row, col`, among `rects` of one sheet. */
function hitIn(rects: readonly OutputRect[], row: number, col: number): OutputRect | undefined {
  return rects.find(
    (rect) => row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right,
  );
}

/** The pivot whose output holds `cell`, or null. The context menu asks once per opening. */
export function pivotAt(
  grid: Grid,
  cell: { sheet: SheetId; row: number; col: number },
): PivotHit | null {
  const hit = hitIn(pivotOutputs(grid, cell.sheet), cell.row, cell.col);
  return hit === undefined ? null : { sheet: cell.sheet, id: hit.id };
}

/**
 * Open the field list of the pivot under the focus cell, loading the panels on
 * first use. Does nothing when the focus cell is outside every pivot's output.
 */
export function showPivotFields(grid: Grid): void {
  const cell = focusCell(grid.getSelection());
  const hit = cell === null ? null : pivotAt(grid, cell);
  if (hit === null) return;

  requestPanel(grid, (controller) => controller.openPivotPanel(grid, hit.sheet, hit.id));
}

/**
 * Listen for the triggers that need a panel, on one grid. Returns the
 * disposer, which also detaches the controller when it has loaded.
 */
export function attachPanelTriggers(grid: Grid, icons?: IconOverrides): () => void {
  const state = stateOf(grid);
  state.icons = icons;

  // Output rectangles, cached until the next change: selection moves on every arrow key.
  const outputs = new Map<SheetId, OutputRect[]>();
  const pivotHit = (): PivotHit | null => {
    const cell = focusCell(grid.getSelection());
    if (cell === null) return null;
    let rects = outputs.get(cell.sheet);
    if (rects === undefined) {
      rects = pivotOutputs(grid, cell.sheet);
      outputs.set(cell.sheet, rects);
    }
    const hit = hitIn(rects, cell.row, cell.col);
    return hit === undefined ? null : { sheet: cell.sheet, id: hit.id };
  };

  state.lifetime.add(
    grid.on("chart-activate", (ref: ChartRef) =>
      requestPanel(grid, (controller) => controller.openChartPanel(grid, ref)),
    ),
  );
  state.lifetime.add(grid.on("chart-select", (ref) => state.controller?.followChart(grid, ref)));
  state.lifetime.add(grid.on("change", () => outputs.clear()));
  state.lifetime.add(
    grid.on("selection", () => {
      const hit = pivotHit();
      // Without the controller no panel is open, so only a hit needs it.
      if (state.controller !== null) state.controller.syncPivotPanel(grid, hit);
      else if (hit !== null) {
        requestPanel(grid, (controller) => controller.syncPivotPanel(grid, pivotHit()));
      }
    }),
  );
  return () => {
    state.pending = null;
    STATES.delete(grid);
    state.lifetime.close();
  };
}
