// The dashboard view: the items of the active dashboard sheet on a grid of
// 12 columns, drawn over the cells. Items move and resize with the mouse
// (drag the header, drag the corner) and with the keyboard (the item menu,
// then arrow keys). Each drop or arrow step is ONE `setDashboardItem`, so it
// is one undo step. This module loads as its own chunk (#231).

import { cellScalarToText } from "../cell-input.js";
import { menuButton, type PanelMenuItem } from "../panels/panel-menu.js";
import { pivotsAvailable } from "../panels/panel-loader.js";
import { compareScalars, scalarLabel, sourceDataRange } from "../panels/pivot-model.js";
import { Scope } from "../scope.js";
import type { CellScalar } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type {
  DashboardBox,
  DashboardItem,
  DashboardPivotItem,
  DashboardSlicerItem,
} from "../types/dashboard.js";
import type { Grid } from "../types/grid.js";
import type { PivotResultView } from "../types/pivot.js";
import {
  boxIsFree,
  DASHBOARD_COLUMNS,
  DASHBOARD_ROW_HEIGHT,
  movedBox,
  resizedBox,
} from "./dashboard-layout.js";

const NEEDS_FULL_ENGINE = "This item needs the full engine. Load @sheetwrite/formulas to compute it.";
const TAKEN = "Another item is in that place.";
const MOVE_HINT = "Arrow keys move the item. Enter or Escape ends.";
const RESIZE_HINT = "Arrow keys resize the item. Enter or Escape ends.";
/** Most values one slicer lists; more would not fit a box and would read every row. */
const MAX_SLICER_VALUES = 1_000;

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
  // The grid's own keys (typing, arrows, copy) must not act on the hidden cells.
  root.addEventListener("keydown", (event) => event.stopPropagation());
  viewport.appendChild(root);

  let sheet: SheetId | null = null;
  let readOnly = false;
  let mode: KeyboardMode | null = null;
  let message: string | null = null;
  let rendered = "";

  const items = (): DashboardItem[] =>
    grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard
      ?.items ?? [];

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
    grid.applyTransaction({ patches: [{ op: "removeDashboardItem", sheet, id: item.id }] });
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

  const itemMenu = (item: DashboardItem): HTMLElement =>
    menuButton(
      `${itemTitle(grid, item)} item actions`,
      `item-${item.id}-menu`,
      (): readonly PanelMenuItem[] => [
        { label: "Move", run: () => startMode(item, "move") },
        { label: "Resize", run: () => startMode(item, "resize") },
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
    if (item.kind === "pivot") renderPivot(body, grid, sheet ?? grid.getActiveSheet(), item);
    else renderSlicer(body, grid, item, readOnly, commit);
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
    const results = list.map((item) =>
      item.kind === "pivot" ? grid.getPivotResult(owner, item.pivot) : slicerValues(grid, item),
    );
    const signature = JSON.stringify([list, results, readOnly, mode, message]);
    if (!force && signature === rendered) return;
    rendered = signature;

    // Keep the focus on the same item through the rebuild.
    const focused = document.activeElement?.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    build();
    if (focused !== undefined && root.contains(document.activeElement) === false) focusItem(focused);
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
      lifetime.close();
    },
  };
}

/** Grid placement of a box: CSS grid lines are 1-based. */
function placeBox(element: HTMLElement, box: DashboardBox): void {
  element.style.gridColumn = `${box.x + 1} / span ${box.w}`;
  element.style.gridRow = `${box.y + 1} / span ${box.h}`;
}

/** The caption of an item: the pivot name, or the slicer title or column name. */
function itemTitle(grid: Grid, item: DashboardItem): string {
  if (item.kind === "pivot") {
    return grid.getPivots().find((pivot) => pivot.id === item.pivot)?.name ?? item.pivot;
  }
  if (item.title !== undefined) return item.title;
  const table = grid.store
    .getWorkbook()
    .sheets.flatMap((sheet) => sheet.tables ?? [])
    .find((candidate) => candidate.id === item.field.table);
  return table?.columns.find((column) => column.id === item.field.column)?.name ?? "#REF!";
}

function note(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "sheetwrite-dashboard-note";
  element.textContent = text;
  return element;
}

/** The pivot's result as a table: header rows and label columns are header cells. */
function renderPivot(body: HTMLElement, grid: Grid, sheet: SheetId, item: DashboardPivotItem): void {
  if (!pivotsAvailable(grid)) {
    body.appendChild(note(NEEDS_FULL_ENGINE));
    return;
  }

  const result = grid.getPivotResult(sheet, item.pivot);
  if (result === null || result.status !== "ok") {
    body.appendChild(note(result?.error ?? "#REF!"));
    return;
  }
  body.appendChild(pivotTable(result));
}

function pivotTable(result: PivotResultView): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "sheetwrite-dashboard-pivot";
  for (let row = 0; row < result.rows; row++) {
    const tr = document.createElement("tr");
    for (let col = 0; col < result.cols; col++) {
      const header = row < result.headerRows || col < result.labelCols;
      const cell = document.createElement(header ? "th" : "td");
      if (header) cell.scope = row < result.headerRows ? "col" : "row";
      cell.textContent = cellScalarToText(result.cells[row * result.cols + col] ?? null);
      tr.appendChild(cell);
    }
    table.appendChild(tr);
  }
  return table;
}

/** Distinct values of the slicer's column, sorted as filter lists are; null when it is missing. */
function slicerValues(grid: Grid, item: DashboardSlicerItem): CellScalar[] | null {
  const tables = grid.store.getWorkbook().sheets.flatMap((sheet) => sheet.tables ?? []);
  const table = tables.find((candidate) => candidate.id === item.field.table);
  const offset = table?.columns.findIndex((column) => column.id === item.field.column) ?? -1;
  if (table === undefined || offset < 0) return null;

  const range = sourceDataRange({ table: table.id }, tables);
  const seen = new Set<CellScalar>();
  for (let row = range?.start.row ?? 1; range !== null && row <= range.end.row; row++) {
    const address = { sheet: range.sheet, row, col: range.start.col + offset };
    const value = grid.store.getCell(address).resolved;
    seen.add(value === "" ? null : value);
    if (seen.size >= MAX_SLICER_VALUES) break;
  }
  return [...seen].sort(compareScalars);
}

/**
 * The values of a slicer as toggle buttons. A click keeps one value;
 * Ctrl or Cmd with a click adds or removes one; Clear keeps every value.
 */
function renderSlicer(
  body: HTMLElement,
  grid: Grid,
  item: DashboardSlicerItem,
  readOnly: boolean,
  commit: (item: DashboardItem) => boolean,
): void {
  const values = slicerValues(grid, item);
  if (values === null) {
    body.appendChild(note("#REF!"));
    return;
  }

  const kept = item.selected;
  // Every value kept is no selection; a slicer always keeps at least one value, as in Excel.
  const select = (next: CellScalar[] | undefined): void => {
    if (next !== undefined && next.length === 0) return;
    const all = next === undefined || next.length === values.length;
    const changed: DashboardSlicerItem = { ...item };
    if (all) delete changed.selected;
    else changed.selected = next;
    commit(changed);
  };

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "sheetwrite-dashboard-slicer-clear";
  clear.textContent = "Clear";
  clear.disabled = readOnly || kept === undefined;
  clear.addEventListener("click", () => select(undefined));
  body.appendChild(clear);

  const list = document.createElement("div");
  list.className = "sheetwrite-dashboard-slicer";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", `${itemTitle(grid, item)} values`);
  for (const value of values) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-dashboard-slicer-value";
    button.textContent = scalarLabel(value);
    const on = kept === undefined || kept.includes(value);
    button.setAttribute("aria-pressed", String(on));
    button.disabled = readOnly;
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
