// The dashboard view: the items of the active dashboard sheet on a grid of
// 12 columns, drawn over the cells. Items move and resize with the mouse
// (drag the header, drag the corner) and with the keyboard (the item menu,
// then arrow keys). Each drop or arrow step is ONE `setDashboardItem`, so it
// is one undo step. This module loads as its own chunk (#231).

import { cellScalarToText } from "../cell-input.js";
import { createChartRenderer } from "../chart-backend.js";
import { setPivotChartViews } from "../charts-live.js";
import { formatNumber } from "../number-format.js";
import { pivotsAvailable } from "../panels/panel-loader.js";
import { menuButton, type PanelMenuItem } from "../panels/panel-menu.js";
import { scalarLabel } from "../panels/pivot-model.js";
import { Scope } from "../scope.js";
import { checkStylePart } from "../style-parts.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartDefinition, ChartRenderer, MountedChart } from "../types/chart.js";
import type { SheetId } from "../types/coordinates.js";
import type {
  DashboardBox,
  DashboardChartItem,
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
  applyPivotViews,
  chartOf,
  dashboardItemTitle,
  dashboardsOf,
  hiddenPivotIndex,
  pivotChartViewOf,
  pivotOutputOf,
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

/**
 * An item with what it shows, read from the engine once per refresh: the
 * refresh compares it with the last one and builds the item from it.
 */
type ItemView =
  | {
      readonly kind: "pivot";
      readonly item: DashboardPivotItem;
      readonly result: PivotResultView | null;
    }
  | {
      readonly kind: "chart";
      readonly item: DashboardChartItem;
      readonly chart: ChartDefinition | undefined;
      readonly output: PivotOutputRead | null;
    }
  | {
      readonly kind: "kpi";
      readonly item: DashboardKpiItem;
      readonly output: PivotOutputRead | null;
    }
  | {
      readonly kind: "slicer";
      readonly item: DashboardSlicerItem;
      /** The slicer column's distinct values; null when the column is missing. */
      readonly values: CellScalar[] | null;
      readonly output: PivotOutputRead | null;
    };

/** Mount the view into `viewport`, hidden until `show` names a dashboard. */
export function mountDashboardView(grid: Grid, viewport: HTMLElement): DashboardView {
  const lifetime = new Scope();
  const root = document.createElement("div");
  root.className = "sheetwrite-dashboard";
  root.hidden = true;
  viewport.appendChild(root);
  checkStylePart(root, "dashboard", "The dashboard");

  let sheet: SheetId | null = null;
  let read_only = false;
  let mode: KeyboardMode | null = null;
  let message: string | null = null;
  let rendered = "";
  // A read-only viewer's slicer selections: they filter this view only, not the document.
  const overrides = slicerOverridesOf(grid.store);
  // Slicers filter the dashboard pivots that the engine computes; the saved definitions keep theirs.
  const filter_pivots = (dashboards: readonly SheetId[]): void => {
    applyPivotViews(grid.store, dashboards);
    setPivotChartViews(grid.store, pivotChartViewOf);
  };
  const hidden_index = (owner: SheetId, item_id: string): number =>
    hiddenPivotIndex(grid.store, owner, item_id);

  // Charts mount after each build, when their boxes have a size; a rebuild mounts them again.
  let mounted_charts = new Map<Element, MountedChart>();
  let chart_renderer: ChartRenderer | null = null;
  // The grid columns stretch with the viewport, so a chart follows its box size.
  const chart_sizes =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            mounted_charts.get(entry.target)?.resize(width, height);
          }
        });
  const unmount_charts = (): void => {
    chart_sizes?.disconnect();
    for (const mounted of mounted_charts.values()) mounted.dispose();
    mounted_charts = new Map();
    chart_renderer?.dispose();
    chart_renderer = null;
  };
  const mount_charts = (): void => {
    unmount_charts();
    if (sheet === null) return;
    const hosts = root.querySelectorAll<HTMLElement>("[data-chart-id]");
    if (hosts.length === 0) return;
    chart_renderer = createChartRenderer(grid.store);
    if (chart_renderer !== null) checkStylePart(root, "charts", "The dashboard's charts");
    for (const host of hosts) {
      const id = host.dataset.chartId ?? "";
      if (chart_renderer === null) {
        host.appendChild(note(NEEDS_CHARTS));
        continue;
      }
      const size = { width: host.clientWidth, height: host.clientHeight };
      mounted_charts.set(host, chart_renderer.mount(host, { sheet, id }, size));
      chart_sizes?.observe(host);
    }
  };
  filter_pivots(dashboardsOf(grid.store));

  /**
   * A slicer's new selection: a saved, synced change in an editable grid,
   * as Excel saves slicer state, or this view's own filter when read-only.
   */
  const choose_slicer = (item: DashboardSlicerItem, next: CellScalar[] | undefined): void => {
    if (!read_only) {
      const changed: DashboardSlicerItem = { ...item };
      if (next === undefined) delete changed.selected;
      else changed.selected = next;
      commit(changed);
      return;
    }
    overrides.set(item.id, next ?? null);
    if (sheet !== null) filter_pivots([sheet]);
    refresh(true);
  };

  const items = (): DashboardItem[] =>
    grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard?.items ??
    [];

  /** Commit `item`; a refused change leaves the dashboard as it was and says why. */
  const commit = (item: DashboardItem): boolean => {
    if (sheet === null) return false;
    const result = grid.applyTransaction({ patches: [{ op: "setDashboardItem", sheet, item }] });
    const shown = message;
    message = result.status === "applied" ? null : TAKEN;
    // An applied change refreshed the view in its change event, so only a new
    // message needs another build.
    if (message !== shown) refresh(true);
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
      focus_item(item.id);
      return;
    }
    commit({ ...item, box });
    focus_item(item.id);
  };

  const focus_item = (id: string): void => {
    root.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.focus();
  };

  const start_mode = (item: DashboardItem, kind: KeyboardMode["kind"]): void => {
    mode = { id: item.id, kind };
    message = kind === "move" ? MOVE_HINT : RESIZE_HINT;
    refresh(true);
    focus_item(item.id);
  };

  const on_item_key = (event: KeyboardEvent, item: DashboardItem): void => {
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
      focus_item(item.id);
    }
  };

  /** Cell size of the grid in pixels, read when a drag starts; columns stretch with the view. */
  const cell_size = (container: HTMLElement): { width: number; height: number } => ({
    // A view that is not laid out has no width; one pixel a column keeps the arithmetic finite.
    width: Math.max(container.clientWidth / DASHBOARD_COLUMNS, 1),
    height: DASHBOARD_ROW_HEIGHT,
  });

  const start_drag = (event: PointerEvent, item: DashboardItem, kind: Drag["kind"]): void => {
    if (event.button !== 0 || read_only) return;
    event.preventDefault();
    const container = root.querySelector<HTMLElement>(".sheetwrite-dashboard-grid");
    const element = event.currentTarget;
    if (container === null || !(element instanceof HTMLElement)) return;

    const size = cell_size(container);
    const drag: Drag = { item, kind, startX: event.clientX, startY: event.clientY, box: item.box };
    const preview = document.createElement("div");
    preview.className = "sheetwrite-dashboard-preview";
    place_box(preview, item.box);
    container.appendChild(preview);
    element.setPointerCapture(event.pointerId);

    const on_move = (move: PointerEvent): void => {
      const dx = Math.round((move.clientX - drag.startX) / size.width);
      const dy = Math.round((move.clientY - drag.startY) / size.height);
      drag.box = kind === "move" ? movedBox(item.box, dx, dy) : resizedBox(item.box, dx, dy);
      place_box(preview, drag.box);
      preview.dataset.taken = boxIsFree(items(), drag.box, item.id) ? "false" : "true";
    };
    const on_up = (): void => {
      element.removeEventListener("pointermove", on_move);
      element.removeEventListener("pointerup", on_up);
      element.removeEventListener("pointercancel", on_up);
      preview.remove();
      const box = drag.box;
      const moved = box.x !== item.box.x || box.y !== item.box.y;
      const resized = box.w !== item.box.w || box.h !== item.box.h;
      if (moved || resized) commit({ ...item, box });
    };
    element.addEventListener("pointermove", on_move);
    element.addEventListener("pointerup", on_up);
    element.addEventListener("pointercancel", on_up);
  };

  /** Excel's slicer settings for values with no data, one saved change each. */
  const no_data_settings = (item: DashboardSlicerItem): PanelMenuItem[] =>
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

  const item_menu = (item: DashboardItem): HTMLElement =>
    menuButton(
      `${item_title(grid, item)} item actions`,
      `item-${item.id}-menu`,
      (): readonly PanelMenuItem[] => [
        { label: "Move", run: () => start_mode(item, "move") },
        { label: "Resize", run: () => start_mode(item, "resize") },
        ...(item.kind === "slicer" ? no_data_settings(item) : []),
        { label: "Remove", run: () => remove(item) },
      ],
      lifetime.signal,
    );

  const render_item = (view: ItemView): HTMLElement => {
    const { item } = view;
    const element = document.createElement("section");
    element.className = "sheetwrite-dashboard-item";
    element.tabIndex = 0;
    element.dataset.itemId = item.id;
    element.setAttribute("aria-label", item_title(grid, item));
    if (mode?.id === item.id) element.dataset.mode = mode.kind;
    place_box(element, item.box);
    element.addEventListener("keydown", (event) => on_item_key(event, item));

    const header = document.createElement("header");
    header.className = "sheetwrite-dashboard-item-header";
    const title = document.createElement("span");
    title.className = "sheetwrite-dashboard-item-title";
    title.textContent = item_title(grid, item);
    header.appendChild(title);
    element.appendChild(header);

    const body = document.createElement("div");
    body.className = "sheetwrite-dashboard-item-body";
    const owner = sheet ?? grid.getActiveSheet();
    if (view.kind === "pivot") render_pivot(body, grid, owner, view);
    else if (view.kind === "chart") {
      // The chart renderer draws into this box once the build is in the page.
      body.dataset.chartId = view.item.chart;
      body.classList.add("sheetwrite-dashboard-chart");
    } else if (view.kind === "kpi") {
      body.appendChild(
        view.output === null ? note(NEEDS_FULL_ENGINE) : kpi_value(view.item, view.output),
      );
    } else {
      const kept = read_only ? slicerSelection(view.item, overrides) : view.item.selected;
      render_slicer(body, grid, view, kept, (next) => choose_slicer(view.item, next));
    }
    element.appendChild(body);

    if (!read_only) {
      header.appendChild(item_menu(item));
      header.addEventListener("pointerdown", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        start_drag(event, item, "move");
      });
      const handle = document.createElement("div");
      handle.className = "sheetwrite-dashboard-resize";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => start_drag(event, item, "resize"));
      element.appendChild(handle);
    }
    return element;
  };

  const build = (views: readonly ItemView[]): void => {
    root.replaceChildren();
    const status = document.createElement("p");
    status.className = "sheetwrite-dashboard-status";
    status.setAttribute("role", "status");
    status.textContent = message ?? "";
    root.appendChild(status);

    const container = document.createElement("div");
    container.className = "sheetwrite-dashboard-grid";
    container.style.gridAutoRows = `${DASHBOARD_ROW_HEIGHT}px`;
    if (views.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sheetwrite-dashboard-empty";
      empty.textContent = "This dashboard is empty. Use Insert › PivotTable to add a pivot.";
      root.appendChild(empty);
    }
    for (const view of views) container.appendChild(render_item(view));
    root.appendChild(container);
  };

  /** The item with what it shows now; each item reads its pivot output once. */
  const view_of = (owner: SheetId, item: DashboardItem): ItemView => {
    if (item.kind === "pivot") {
      return { kind: "pivot", item, result: dashboardPivotResult(grid, owner, item.pivot) };
    }
    const output = pivotOutputOf(grid.store, owner, hidden_index(owner, item.id));
    if (item.kind === "chart") {
      return { kind: "chart", item, chart: chartOf(grid.store, owner, item.chart), output };
    }
    if (item.kind === "kpi") return { kind: "kpi", item, output };
    return { kind: "slicer", item, values: slicerValuesOf(grid.store, item), output };
  };

  /** Rebuild when the items, their results, editability or the message changed. */
  const refresh = (force = false): void => {
    const owner = sheet;
    if (owner === null) return;
    const views = items().map((item) => view_of(owner, item));
    const signature = JSON.stringify([views, read_only, mode, message, [...overrides]]);
    if (!force && signature === rendered) return;
    rendered = signature;

    // Keep the focus on the same item through the rebuild.
    const focused = document.activeElement?.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    build(views);
    mount_charts();
    if (focused !== undefined && root.contains(document.activeElement) === false)
      focus_item(focused);
  };

  lifetime.add(grid.on("change", () => refresh()));
  lifetime.add(() => root.remove());

  return {
    show(next, next_read_only) {
      if (next !== sheet) {
        mode = null;
        message = null;
      }
      sheet = next;
      read_only = next_read_only;
      root.hidden = next === null;
      if (next !== null) refresh();
    },
    dispose() {
      unmount_charts();
      lifetime.close();
    },
  };
}

/** Grid placement of a box: CSS grid lines are 1-based. */
function place_box(element: HTMLElement, box: DashboardBox): void {
  element.style.gridColumn = `${box.x + 1} / span ${box.w}`;
  element.style.gridRow = `${box.y + 1} / span ${box.h}`;
}

/** The caption of an item on the active sheet. */
function item_title(grid: Grid, item: DashboardItem): string {
  return dashboardItemTitle(grid.store, grid.getActiveSheet(), item);
}

function note(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "sheetwrite-dashboard-note";
  element.textContent = text;
  return element;
}

/** The pivot's result as a table: header rows and label columns are header cells. */
function render_pivot(
  body: HTMLElement,
  grid: Grid,
  sheet: SheetId,
  { item, result }: ItemView & { kind: "pivot" },
): void {
  if (!pivotsAvailable(grid)) {
    body.appendChild(note(NEEDS_FULL_ENGINE));
    return;
  }

  if (result === null || result.status !== "ok") {
    body.appendChild(note(result?.error ?? "#REF!"));
    return;
  }
  const formats = grid
    .getPivots(sheet)
    .find((pivot) => pivot.id === item.pivot)
    ?.values.map((value) => value.numberFormat);
  body.appendChild(pivot_table(result, formats ?? []));
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
  const output = pivotOutputOf(grid.store, sheet, index);
  if (result === null || result.status !== "ok" || output === null) return result;
  return { ...result, cells: output.cells };
}

/**
 * The result as a table. A value cell shows its value field's number
 * format; value fields repeat across each column group, as on a sheet.
 */
function pivot_table(
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
function kpi_value(item: DashboardKpiItem, output: PivotOutputRead): HTMLElement {
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
function render_slicer(
  body: HTMLElement,
  grid: Grid,
  { item, values, output }: ItemView & { kind: "slicer" },
  kept: readonly CellScalar[] | undefined,
  choose: (next: CellScalar[] | undefined) => void,
): void {
  if (values === null) {
    body.appendChild(note("#REF!"));
    return;
  }
  const with_data = slicer_values_with_data(item, output);

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
  list.setAttribute("aria-label", `${item_title(grid, item)} values`);
  for (const value of values) {
    const no_data = with_data !== null && !with_data.some((entry) => same_scalar(entry, value));
    if (no_data && item.itemsWithNoData === "hide") continue;
    const button = document.createElement("button");
    // Excel dims a value that no row has under the other slicers; it stays selectable.
    if (no_data) button.dataset.noData = "";
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
function same_scalar(left: CellScalar, right: CellScalar): boolean {
  const blank = (value: CellScalar) => value === null || value === "";
  return blank(left) ? blank(right) : left === right;
}

/**
 * The values of `item` that some row has under the other slicers, from its
 * hidden pivot: one header cell, then one label per value with data. Null when
 * the item shows every value or the engine has no output for it.
 */
function slicer_values_with_data(
  item: DashboardSlicerItem,
  output: PivotOutputRead | null,
): CellScalar[] | null {
  if (item.itemsWithNoData === "show" || output === null || output.cells.length === 0) return null;
  // A pivot with no value fields and no totals is one label column under its header.
  return output.cells.slice(1);
}
