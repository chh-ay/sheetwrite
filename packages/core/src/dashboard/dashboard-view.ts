// The dashboard view: the items of the active dashboard sheet on a grid of
// 12 columns, drawn over the cells. Items move and resize with the mouse
// (drag the header, drag the corner) and with the keyboard (the item menu,
// then arrow keys). Each drop or arrow step is ONE `setDashboardItem`, so it
// is one undo step. This module loads as its own chunk (#231).

import { cellScalarToText } from "../cell-input.js";
import { createChartRenderer } from "../chart-backend.js";
import { formatNumber } from "../number-format.js";
import { pivotsAvailable } from "../panels/panel-loader.js";
import { menuButton, type PanelMenuItem } from "../panels/panel-menu.js";
import { scalarLabel } from "../panels/pivot-model.js";
import { Scope } from "../scope.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartRenderer, MountedChart } from "../types/chart.js";
import type { SheetId } from "../types/coordinates.js";
import type {
  DashboardBox,
  DashboardItem,
  DashboardKpiItem,
  DashboardPivotItem,
  DashboardSlicerItem,
} from "../types/dashboard.js";
import type { DocumentOp } from "../types/document.js";
import type { Grid } from "../types/grid.js";
import type { PivotResultView } from "../types/pivot.js";
import type { PivotOutputRead } from "./dashboard-chart.js";
import {
  applyDashboardPayload,
  chartOf,
  dashboardItemTitle,
  dashboardPivotOutputOf,
  dashboardsOf,
  hiddenPivotIndex,
  slicerOverridesOf,
  slicerValuesOf,
} from "./dashboard-engine.js";
import {
  boxIsFree,
  DASHBOARD_COLUMNS,
  DASHBOARD_ROW_HEIGHT,
  movedBox,
  resizedBox,
} from "./dashboard-layout.js";
import { slicerSelection } from "./dashboard-payload.js";

const NEEDS_FULL_ENGINE =
  "This item needs the full engine. Load @sheetwrite/formulas to compute it.";
const NEEDS_CHARTS =
  "Charts need @sheetwrite/charts. Install chartsAddon() through initSheetwrite to draw them.";
const TAKEN = "Another item is in that place.";
const MOVE_HINT = "Arrow keys move the item. Enter or Escape ends.";
const RESIZE_HINT = "Arrow keys resize the item. Enter or Escape ends.";
/** The slicer settings for values with no data, in Excel's words; `dim` is the default. */
const NO_DATA_SETTINGS: readonly (readonly ["dim" | "hide" | "show", string])[] = [
  ["dim", "Dim Items with No Data"],
  ["hide", "Hide Items with No Data"],
  ["show", "Show Items with No Data"],
];

/** The view of one grid; the hook shows it for a dashboard and hides it otherwise. */
export interface DashboardView {
  show(sheet: SheetId | null, readOnly: boolean): void;
  dispose(): void;
}

/** A keyboard move or resize in progress on one item. */
interface KeyboardMode {
  readonly id: string;
  readonly kind: "move" | "resize";
}

/** A mouse move or resize in progress: the item, the start point and the preview box. */
interface Drag {
  readonly item: DashboardItem;
  readonly kind: "move" | "resize";
  readonly startX: number;
  readonly startY: number;
  box: DashboardBox;
}

/** Mount the view into `viewport`, hidden until `show` names a dashboard. */
export function mountDashboardView(grid: Grid, viewport: HTMLElement): DashboardView {
  const lifetime = new Scope();
  const root = document.createElement("div");
  root.className = "sheetwrite-dashboard";
  root.hidden = true;
  viewport.appendChild(root);

  let sheet: SheetId | null = null;
  let readOnly = false;
  let mode: KeyboardMode | null = null;
  let message: string | null = null;
  let rendered = "";
  // A read-only viewer's slicer selections: they filter this view only, not the document.
  const overrides = slicerOverridesOf(grid.store);
  // Slicers filter the dashboard pivots that the engine computes; the saved definitions keep theirs.
  const filterPivots = (dashboards: readonly SheetId[]): void =>
    applyDashboardPayload(grid.store, dashboards);
  const hiddenIndex = (owner: SheetId, itemId: string): number =>
    hiddenPivotIndex(grid.store, owner, itemId);

  // Charts mount after each build, when their boxes have a size; a rebuild mounts them again.
  let mountedCharts = new Map<Element, MountedChart>();
  let chartRenderer: ChartRenderer | null = null;
  // The grid columns stretch with the viewport, so a chart follows its box size.
  const chartSizes =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            mountedCharts.get(entry.target)?.resize(width, height);
          }
        });
  const unmountCharts = (): void => {
    chartSizes?.disconnect();
    for (const mounted of mountedCharts.values()) mounted.dispose();
    mountedCharts = new Map();
    chartRenderer?.dispose();
    chartRenderer = null;
  };
  const mountCharts = (): void => {
    unmountCharts();
    if (sheet === null) return;
    const hosts = root.querySelectorAll<HTMLElement>("[data-chart-id]");
    if (hosts.length === 0) return;
    chartRenderer = createChartRenderer(grid.store);
    for (const host of hosts) {
      const id = host.dataset.chartId ?? "";
      if (chartRenderer === null) {
        host.appendChild(note(NEEDS_CHARTS));
        continue;
      }
      const size = { width: host.clientWidth, height: host.clientHeight };
      mountedCharts.set(host, chartRenderer.mount(host, { sheet, id }, size));
      chartSizes?.observe(host);
    }
  };
  filterPivots(dashboardsOf(grid.store));

  /**
   * A slicer's new selection: a saved, synced change in an editable grid,
   * as Excel saves slicer state, or this view's own filter when read-only.
   */
  const chooseSlicer = (item: DashboardSlicerItem, next: CellScalar[] | undefined): void => {
    if (!readOnly) {
      const changed: DashboardSlicerItem = { ...item };
      if (next === undefined) delete changed.selected;
      else changed.selected = next;
      commit(changed);
      return;
    }
    overrides.set(item.id, next ?? null);
    if (sheet !== null) filterPivots([sheet]);
    refresh(true);
  };

  const items = (): DashboardItem[] =>
    grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard?.items ??
    [];

  /** Commit `item`; a refused change leaves the dashboard as it was and says why. */
  const commit = (item: DashboardItem): boolean => {
    if (sheet === null) return false;
    const result = grid.applyTransaction({ patches: [{ op: "setDashboardItem", sheet, item }] });
    message = result.status === "applied" ? null : TAKEN;
    refresh(true);
    return result.status === "applied";
  };

  const remove = (item: DashboardItem): void => {
    if (sheet === null) return;
    // A chart item owns its chart, as deleting an Excel PivotChart deletes the chart.
    const patches: DocumentOp[] = [{ op: "removeDashboardItem", sheet, id: item.id }];
    if (item.kind === "chart") patches.push({ op: "removeChart", sheet, id: item.chart });
    grid.applyTransaction({ patches });
  };

  /** One arrow step of the keyboard mode on `item`. */
  const step = (item: DashboardItem, kind: KeyboardMode["kind"], dx: number, dy: number): void => {
    const box = kind === "move" ? movedBox(item.box, dx, dy) : resizedBox(item.box, dx, dy);
    if (!boxIsFree(items(), box, item.id)) {
      message = TAKEN;
      refresh(true);
      focusItem(item.id);
      return;
    }
    commit({ ...item, box });
    focusItem(item.id);
  };

  const focusItem = (id: string): void => {
    root.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.focus();
  };

  const startMode = (item: DashboardItem, kind: KeyboardMode["kind"]): void => {
    mode = { id: item.id, kind };
    message = kind === "move" ? MOVE_HINT : RESIZE_HINT;
    refresh(true);
    focusItem(item.id);
  };

  const onItemKey = (event: KeyboardEvent, item: DashboardItem): void => {
    if (mode?.id !== item.id) return;
    const arrows: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = arrows[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      step(item, mode.kind, delta[0], delta[1]);
    } else if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      mode = null;
      message = null;
      refresh(true);
      focusItem(item.id);
    }
  };

  /** Cell size of the grid in pixels, read when a drag starts; columns stretch with the view. */
  const cellSize = (container: HTMLElement): { width: number; height: number } => ({
    // A view that is not laid out has no width; one pixel a column keeps the arithmetic finite.
    width: Math.max(container.clientWidth / DASHBOARD_COLUMNS, 1),
    height: DASHBOARD_ROW_HEIGHT,
  });

  const startDrag = (event: PointerEvent, item: DashboardItem, kind: Drag["kind"]): void => {
    if (event.button !== 0 || readOnly) return;
    event.preventDefault();
    const container = root.querySelector<HTMLElement>(".sheetwrite-dashboard-grid");
    const element = event.currentTarget;
    if (container === null || !(element instanceof HTMLElement)) return;

    const size = cellSize(container);
    const drag: Drag = { item, kind, startX: event.clientX, startY: event.clientY, box: item.box };
    const preview = document.createElement("div");
    preview.className = "sheetwrite-dashboard-preview";
    placeBox(preview, item.box);
    container.appendChild(preview);
    element.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent): void => {
      const dx = Math.round((move.clientX - drag.startX) / size.width);
      const dy = Math.round((move.clientY - drag.startY) / size.height);
      drag.box = kind === "move" ? movedBox(item.box, dx, dy) : resizedBox(item.box, dx, dy);
      placeBox(preview, drag.box);
      preview.dataset.taken = boxIsFree(items(), drag.box, item.id) ? "false" : "true";
    };
    const onUp = (): void => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      preview.remove();
      const box = drag.box;
      const moved = box.x !== item.box.x || box.y !== item.box.y;
      const resized = box.w !== item.box.w || box.h !== item.box.h;
      if (moved || resized) commit({ ...item, box });
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
  };

  /** Excel's slicer settings for values with no data, one saved change each. */
  const noDataSettings = (item: DashboardSlicerItem): PanelMenuItem[] =>
    NO_DATA_SETTINGS.map(([setting, label]) => ({
      label,
      disabled: (item.itemsWithNoData ?? "dim") === setting,
      run: () => {
        const changed: DashboardSlicerItem = { ...item };
        if (setting === "dim") delete changed.itemsWithNoData;
        else changed.itemsWithNoData = setting;
        commit(changed);
      },
    }));

  const itemMenu = (item: DashboardItem): HTMLElement =>
    menuButton(
      `${itemTitle(grid, item)} item actions`,
      `item-${item.id}-menu`,
      (): readonly PanelMenuItem[] => [
        { label: "Move", run: () => startMode(item, "move") },
        { label: "Resize", run: () => startMode(item, "resize") },
        ...(item.kind === "slicer" ? noDataSettings(item) : []),
        { label: "Remove", run: () => remove(item) },
      ],
      lifetime.signal,
    );

  const renderItem = (item: DashboardItem): HTMLElement => {
    const element = document.createElement("section");
    element.className = "sheetwrite-dashboard-item";
    element.tabIndex = 0;
    element.dataset.itemId = item.id;
    element.setAttribute("aria-label", itemTitle(grid, item));
    if (mode?.id === item.id) element.dataset.mode = mode.kind;
    placeBox(element, item.box);
    element.addEventListener("keydown", (event) => onItemKey(event, item));

    const header = document.createElement("header");
    header.className = "sheetwrite-dashboard-item-header";
    const title = document.createElement("span");
    title.className = "sheetwrite-dashboard-item-title";
    title.textContent = itemTitle(grid, item);
    header.appendChild(title);
    element.appendChild(header);

    const body = document.createElement("div");
    body.className = "sheetwrite-dashboard-item-body";
    const owner = sheet ?? grid.getActiveSheet();
    if (item.kind === "pivot") renderPivot(body, grid, owner, item);
    else if (item.kind === "chart") {
      // The chart renderer draws into this box once the build is in the page.
      body.dataset.chartId = item.chart;
      body.classList.add("sheetwrite-dashboard-chart");
    } else if (item.kind === "kpi") {
      const output = dashboardPivotOutputOf(grid.store, owner, hiddenIndex(owner, item.id));
      body.appendChild(output === null ? note(NEEDS_FULL_ENGINE) : kpiValue(item, output));
    } else {
      const kept = readOnly ? slicerSelection(item, overrides) : item.selected;
      const withData = slicerValuesWithData(
        item,
        dashboardPivotOutputOf(grid.store, owner, hiddenIndex(owner, item.id)),
      );
      renderSlicer(body, grid, item, kept, withData, (next) => chooseSlicer(item, next));
    }
    element.appendChild(body);

    if (!readOnly) {
      header.appendChild(itemMenu(item));
      header.addEventListener("pointerdown", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        startDrag(event, item, "move");
      });
      const handle = document.createElement("div");
      handle.className = "sheetwrite-dashboard-resize";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => startDrag(event, item, "resize"));
      element.appendChild(handle);
    }
    return element;
  };

  const build = (): void => {
    root.replaceChildren();
    const status = document.createElement("p");
    status.className = "sheetwrite-dashboard-status";
    status.setAttribute("role", "status");
    status.textContent = message ?? "";
    root.appendChild(status);

    const container = document.createElement("div");
    container.className = "sheetwrite-dashboard-grid";
    container.style.gridAutoRows = `${DASHBOARD_ROW_HEIGHT}px`;
    const list = items();
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sheetwrite-dashboard-empty";
      empty.textContent = "This dashboard is empty. Use Insert › PivotTable to add a pivot.";
      root.appendChild(empty);
    }
    for (const item of list) container.appendChild(renderItem(item));
    root.appendChild(container);
  };

  /** Rebuild when the items, their results, editability or the message changed. */
  const refresh = (force = false): void => {
    const owner = sheet;
    if (owner === null) return;
    const list = items();
    const results = list.map((item) => {
      if (item.kind === "pivot") return dashboardPivotResult(grid, owner, item.pivot);
      const output = dashboardPivotOutputOf(grid.store, owner, hiddenIndex(owner, item.id));
      if (item.kind === "chart") return [chartOf(grid.store, owner, item.chart), output];
      if (item.kind === "kpi") return output;
      return [slicerValuesOf(grid.store, item), output];
    });
    const signature = JSON.stringify([list, results, readOnly, mode, message, [...overrides]]);
    if (!force && signature === rendered) return;
    rendered = signature;

    // Keep the focus on the same item through the rebuild.
    const focused = document.activeElement?.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    build();
    mountCharts();
    if (focused !== undefined && root.contains(document.activeElement) === false)
      focusItem(focused);
  };

  lifetime.add(grid.on("change", () => refresh()));
  lifetime.add(() => root.remove());

  return {
    show(next, nextReadOnly) {
      if (next !== sheet) {
        mode = null;
        message = null;
      }
      sheet = next;
      readOnly = nextReadOnly;
      root.hidden = next === null;
      if (next !== null) refresh();
    },
    dispose() {
      unmountCharts();
      lifetime.close();
    },
  };
}

/** Grid placement of a box: CSS grid lines are 1-based. */
function placeBox(element: HTMLElement, box: DashboardBox): void {
  element.style.gridColumn = `${box.x + 1} / span ${box.w}`;
  element.style.gridRow = `${box.y + 1} / span ${box.h}`;
}

/** The caption of an item on the active sheet. */
function itemTitle(grid: Grid, item: DashboardItem): string {
  return dashboardItemTitle(grid.store, grid.getActiveSheet(), item);
}

function note(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "sheetwrite-dashboard-note";
  element.textContent = text;
  return element;
}

/** The pivot's result as a table: header rows and label columns are header cells. */
function renderPivot(
  body: HTMLElement,
  grid: Grid,
  sheet: SheetId,
  item: DashboardPivotItem,
): void {
  if (!pivotsAvailable(grid)) {
    body.appendChild(note(NEEDS_FULL_ENGINE));
    return;
  }

  const result = dashboardPivotResult(grid, sheet, item.pivot);
  if (result === null || result.status !== "ok") {
    body.appendChild(note(result?.error ?? "#REF!"));
    return;
  }
  const formats = grid
    .getPivots(sheet)
    .find((pivot) => pivot.id === item.pivot)
    ?.values.map((value) => value.numberFormat);
  body.appendChild(pivotTable(result, formats ?? []));
}

/**
 * The pivot's result with its cells read from the engine: a dashboard pivot
 * places no output, so `getPivotResult` has its size but no cells.
 */
export function dashboardPivotResult(
  grid: Grid,
  sheet: SheetId,
  id: string,
): PivotResultView | null {
  const result = grid.getPivotResult(sheet, id);
  const index = grid.getPivots(sheet).findIndex((pivot) => pivot.id === id);
  const output = dashboardPivotOutputOf(grid.store, sheet, index);
  if (result === null || result.status !== "ok" || output === null) return result;
  return { ...result, cells: output.cells };
}

/**
 * The result as a table. A value cell shows its value field's number
 * format; value fields repeat across each column group, as on a sheet.
 */
function pivotTable(
  result: PivotResultView,
  formats: readonly (string | undefined)[],
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "sheetwrite-dashboard-pivot";
  for (let row = 0; row < result.rows; row++) {
    const tr = document.createElement("tr");
    for (let col = 0; col < result.cols; col++) {
      const header = row < result.headerRows || col < result.labelCols;
      const cell = document.createElement(header ? "th" : "td");
      if (header) cell.scope = row < result.headerRows ? "col" : "row";
      const value = result.cells[row * result.cols + col] ?? null;
      const format = header ? undefined : formats[(col - result.labelCols) % formats.length];
      cell.textContent =
        format !== undefined && typeof value === "number"
          ? formatNumber(value, format)
          : cellScalarToText(value);
      tr.appendChild(cell);
    }
    table.appendChild(tr);
  }
  return table;
}

/**
 * The value of a KPI card, large, in its number format. The hidden pivot has
 * no rows or columns, so its last cell is the measure's value.
 */
function kpiValue(item: DashboardKpiItem, output: PivotOutputRead): HTMLElement {
  const value = output.cells.at(-1) ?? null;
  const element = document.createElement("p");
  element.className = "sheetwrite-dashboard-kpi";
  element.textContent =
    item.numberFormat !== undefined && typeof value === "number"
      ? formatNumber(value, item.numberFormat)
      : cellScalarToText(value);
  return element;
}

/**
 * The values of a slicer as toggle buttons. A click keeps one value;
 * Ctrl or Cmd with a click adds or removes one; Clear keeps every value.
 * `choose` receives the new selection: undefined keeps every value.
 */
function renderSlicer(
  body: HTMLElement,
  grid: Grid,
  item: DashboardSlicerItem,
  kept: readonly CellScalar[] | undefined,
  withData: readonly CellScalar[] | null,
  choose: (next: CellScalar[] | undefined) => void,
): void {
  const values = slicerValuesOf(grid.store, item);
  if (values === null) {
    body.appendChild(note("#REF!"));
    return;
  }

  // Every value kept is no selection; a slicer always keeps at least one value, as in Excel.
  const select = (next: CellScalar[] | undefined): void => {
    if (next !== undefined && next.length === 0) return;
    choose(next === undefined || next.length === values.length ? undefined : next);
  };

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "sheetwrite-dashboard-slicer-clear";
  clear.textContent = "Clear";
  clear.disabled = kept === undefined;
  clear.addEventListener("click", () => select(undefined));
  body.appendChild(clear);

  const list = document.createElement("div");
  list.className = "sheetwrite-dashboard-slicer";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", `${itemTitle(grid, item)} values`);
  for (const value of values) {
    const noData = withData !== null && !withData.some((entry) => sameScalar(entry, value));
    if (noData && item.itemsWithNoData === "hide") continue;
    const button = document.createElement("button");
    // Excel dims a value that no row has under the other slicers; it stays selectable.
    if (noData) button.dataset.noData = "";
    button.type = "button";
    button.className = "sheetwrite-dashboard-slicer-value";
    button.textContent = scalarLabel(value);
    const on = kept === undefined || kept.includes(value);
    button.setAttribute("aria-pressed", String(on));
    button.addEventListener("click", (event) => {
      if (!(event.ctrlKey || event.metaKey)) {
        select([value]);
        return;
      }
      const current = kept ?? values;
      select(on ? current.filter((entry) => entry !== value) : [...current, value]);
    });
    list.appendChild(button);
  }
  body.appendChild(list);
}

/** Blank labels are null or empty text, depending on where they come from. */
function sameScalar(left: CellScalar, right: CellScalar): boolean {
  const blank = (value: CellScalar) => value === null || value === "";
  return blank(left) ? blank(right) : left === right;
}

/**
 * The values of `item` that some row has under the other slicers, from its
 * hidden pivot: one header cell, then one label per value with data. Null when
 * the item shows every value or the engine has no output for it.
 */
function slicerValuesWithData(
  item: DashboardSlicerItem,
  output: PivotOutputRead | null,
): CellScalar[] | null {
  if (item.itemsWithNoData === "show" || output === null || output.cells.length === 0) return null;
  // A pivot with no value fields and no totals is one label column under its header.
  return output.cells.slice(1);
}
