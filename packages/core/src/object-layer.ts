import { createChartRenderer } from "./chart-backend.js";
import { CHART_KIND_LABELS } from "./chart-definition.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import { checkStylePart } from "./style-parts.js";
import type {
  ChartAnchor,
  ChartDefinition,
  ChartKind,
  ChartRef,
  ChartRenderer,
  MountedChart,
} from "./types/chart.js";
import type { SheetId } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

/** Smallest box, in document pixels, that a resize can make. */
const MIN_OBJECT_SIZE = 16;
/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
/** Hidden data rows walked forward to find where a hidden anchor row collapses to. */
const HIDDEN_ROW_WALK_LIMIT = 4_096;
/** Pixels that one wheel "line" scrolls when the browser reports line deltas. */
const WHEEL_LINE_PX = 16;
/** Pixels that one wheel "page" scrolls when the browser reports page deltas. */
const WHEEL_PAGE_PX = 400;

/** Name of a chart kind as screen readers and the plain frame say it, such as "Column chart". */
function chart_name(kind: ChartKind): string {
  return `${CHART_KIND_LABELS[kind]} chart`;
}

/** Resize handle directions: the sign of each axis the handle moves. */
const HANDLES = [
  { name: "nw", x: -1, y: -1 },
  { name: "n", x: 0, y: -1 },
  { name: "ne", x: 1, y: -1 },
  { name: "e", x: 1, y: 0 },
  { name: "se", x: 1, y: 1 },
  { name: "s", x: 0, y: 1 },
  { name: "sw", x: -1, y: 1 },
  { name: "w", x: -1, y: 0 },
] as const;

type HandleDirection = (typeof HANDLES)[number];

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Frozen panes: an object lives in the pane of its anchor cell. */
type PaneName = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const PANE_NAMES: readonly PaneName[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export interface ObjectLayerOptions {
  viewport: HTMLElement;
  scroller: HTMLElement;
  store: Store;
  geometry: GeometryLayoutController;
  activeSheet: () => SheetId;
  /** Charts on the active sheet, in drawing order. */
  charts: () => readonly ChartDefinition[];
  theme: () => Theme;
  zoom: () => number;
  readOnly: () => boolean;
  /** Commit one `setChart` on the active sheet; one undo step. */
  setChart: (chart: ChartDefinition) => void;
  /** Commit one `removeChart` on the active sheet; one undo step. */
  removeChart: (id: string) => void;
  focusGrid: () => void;
  onSelect: (chart: ChartRef | null) => void;
  onActivate: (chart: ChartRef) => void;
  /** Open the chart's own context menu at a client point. */
  onContextMenu: (chart: ChartRef, clientX: number, clientY: number) => void;
  /** Whether a key press is the grid's undo or redo shortcut, which works with an object focused. */
  isHistoryShortcut: (event: KeyboardEvent) => boolean;
}

/** Live preview of a drag, in screen pixels, applied on top of the committed anchor. */
interface DragPreview {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

interface PlacedBox {
  pane: PaneName;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ObjectEntry {
  chart: ChartDefinition;
  readonly frame: HTMLDivElement;
  readonly mounted: MountedChart | null;
  readonly fallbackTitle: HTMLElement | null;
  label: string;
  /** Last box written to the DOM; `null` until the first placement. */
  box: PlacedBox | null;
  preview: DragPreview | null;
}

interface DragSession {
  readonly entry: ObjectEntry;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** `null` moves the object; a direction resizes it from that handle. */
  readonly handle: HandleDirection | null;
  isActive: boolean;
}

/** A content position, in zoomed pixels from the top-left of the cell area. */
interface ContentPoint {
  x: number;
  y: number;
}

/** The view row and visible column an anchor resolves to, and whether either collapsed. */
interface ResolvedAnchor {
  viewRow: number;
  col: number;
  isRowCollapsed: boolean;
  isColCollapsed: boolean;
}

/** Accessible name of a chart object: its title and its kind. */
function chart_object_label(chart: ChartDefinition): string {
  const title = chart.title?.trim();
  return title ? `${title}, ${chart_name(chart.kind).toLowerCase()}` : chart_name(chart.kind);
}

/**
 * Floating objects inside the grid viewport. Mounts one host element per chart
 * on the active sheet, places it from its anchor on every render frame and owns
 * object selection, move, resize, nudge and delete. Content comes from the
 * registered `ChartRenderer`; without one, a plain frame shows the title.
 */
export class ObjectLayer {
  private readonly root: HTMLDivElement;
  private readonly panes: Record<PaneName, HTMLDivElement>;
  private readonly entries = new Map<string, ObjectEntry>();
  private renderer: ChartRenderer | null = null;
  private sheet: SheetId | null = null;
  private selected_id: string | null = null;
  private drag: DragSession | null = null;
  private last_content_top = 0;
  private last_scroll_left = 0;
  private is_read_only_shown: boolean | null = null;
  private destroyed = false;

  constructor(private readonly options: ObjectLayerOptions) {
    const root = document.createElement("div");
    root.className = "sheetwrite-object-layer";
    root.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    this.panes = {
      "top-left": create_pane("top-left"),
      "top-right": create_pane("top-right"),
      "bottom-left": create_pane("bottom-left"),
      "bottom-right": create_pane("bottom-right"),
    };
    for (const name of PANE_NAMES) root.appendChild(this.panes[name]);
    this.root = root;
    this.setTheme(options.theme());
    root.addEventListener("wheel", this.on_wheel, { passive: false });
    options.viewport.appendChild(root);

    // A press on a cell belongs to the grid and ends object selection.
    options.scroller.addEventListener("pointerdown", this.on_grid_pointer_down);
  }

  get selected(): ChartRef | null {
    return this.selected_id === null || this.sheet === null
      ? null
      : { sheet: this.sheet, id: this.selected_id };
  }

  /** Mount and unmount hosts to match the charts on the active sheet. */
  sync(): void {
    if (this.destroyed) return;
    const sheet = this.options.activeSheet();
    if (sheet !== this.sheet) {
      this.clear();
      this.sheet = sheet;
    }

    const present = new Set<string>();
    for (const chart of this.options.charts()) {
      present.add(chart.id);
      const entry = this.entries.get(chart.id);
      if (entry) this.update(entry, chart);
      else this.entries.set(chart.id, this.mount(chart, sheet));
    }

    for (const [id, entry] of this.entries) {
      if (!present.has(id)) this.unmount(entry);
    }
  }

  /** Place every host for the current scroll position; the grid calls this each render frame. */
  place(contentTop: number, scrollLeft: number): void {
    if (this.destroyed) return;
    this.last_content_top = contentTop;
    this.last_scroll_left = scrollLeft;
    const read_only = this.options.readOnly();
    if (read_only !== this.is_read_only_shown) {
      this.is_read_only_shown = read_only;
      this.root.dataset.readonly = String(read_only);
    }
    if (this.entries.size === 0) return;

    this.place_panes();
    for (const entry of this.entries.values()) this.place_entry(entry, contentTop, scrollLeft);
  }

  /** Select `id` on the active sheet, or deselect with `null`. */
  select(id: string | null, focus = false): void {
    const entry = id === null ? undefined : this.entries.get(id);
    const next_id = entry ? entry.chart.id : null;
    if (next_id !== this.selected_id) {
      const previous = this.selected_id === null ? undefined : this.entries.get(this.selected_id);
      if (previous) show_selected(previous, false);
      this.selected_id = next_id;
      if (entry) show_selected(entry, true);
      this.options.onSelect(this.selected);
    }
    // Placement follows the grid's scroll, so focus must not scroll the pane.
    if (focus && entry) entry.frame.focus({ preventScroll: true });
  }

  /**
   * Copy the grid's theme into the custom properties charts paint with, so a
   * `theme` option or `setTheme` reaches the charts as it does the cells. They
   * are set on the layer, an ancestor of every chart, so a host rule on
   * `.sheetwrite-object` still overrides them.
   */
  setTheme(theme: Theme): void {
    const style = this.root.style;
    style.setProperty("--sheetwrite-bg", theme.bg);
    style.setProperty("--sheetwrite-fg", theme.fg);
    style.setProperty("--sheetwrite-grid-line", theme.gridLine);
    style.setProperty("--sheetwrite-selection-border", theme.selectionBorder);
    style.setProperty("--sheetwrite-font", theme.font);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel_drag();
    this.options.scroller.removeEventListener("pointerdown", this.on_grid_pointer_down);
    for (const entry of this.entries.values()) dispose_entry(entry);
    this.entries.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.root.remove();
  }

  private clear(): void {
    this.cancel_drag();
    if (this.selected_id !== null) {
      this.selected_id = null;
      this.options.onSelect(null);
    }
    for (const entry of this.entries.values()) dispose_entry(entry);
    this.entries.clear();
  }

  private mount(chart: ChartDefinition, sheet: SheetId): ObjectEntry {
    const frame = document.createElement("div");
    frame.className = "sheetwrite-object";
    frame.tabIndex = -1;
    // A group, not an image: the renderer's SVG is the image and carries the
    // series description. Children of an image are hidden from screen readers.
    frame.setAttribute("role", "group");
    frame.setAttribute("aria-roledescription", "chart");
    frame.setAttribute("aria-current", "false");
    frame.dataset.chartId = chart.id;
    frame.style.cssText = "position:absolute;left:0;top:0;pointer-events:auto;";

    const host = document.createElement("div");
    host.className = "sheetwrite-object-host";
    frame.appendChild(host);

    for (const handle of HANDLES) {
      const element = document.createElement("div");
      element.className = "sheetwrite-object-handle";
      element.dataset.handle = handle.name;
      element.setAttribute("aria-hidden", "true");
      frame.appendChild(element);
    }

    // Charts paint in document order, so a later chart covers an earlier one.
    this.panes["bottom-right"].appendChild(frame);
    checkStylePart(frame, "charts", "The chart");

    const zoom = this.options.zoom();
    const size = { width: chart.anchor.width * zoom, height: chart.anchor.height * zoom };
    // Resolved on each mount, so a renderer registered after the grid was made still draws.
    this.renderer ??= createChartRenderer(this.options.store);
    let mounted: MountedChart | null = null;
    let fallback_title: HTMLElement | null = null;
    if (this.renderer) {
      mounted = this.renderer.mount(host, { sheet, id: chart.id }, size);
    } else {
      fallback_title = document.createElement("div");
      fallback_title.className = "sheetwrite-object-fallback";
      host.appendChild(fallback_title);
    }

    const entry: ObjectEntry = {
      chart,
      frame,
      mounted,
      fallbackTitle: fallback_title,
      label: "",
      box: null,
      preview: null,
    };
    this.update(entry, chart);
    frame.addEventListener("pointerdown", (event) => this.on_object_pointer_down(event, entry));
    frame.addEventListener("keydown", (event) => this.on_object_key_down(event, entry));
    frame.addEventListener("contextmenu", (event) => {
      // Ours replaces the browser's menu, and the grid's cell menu must not open too.
      event.preventDefault();
      event.stopPropagation();
      this.open_menu(entry, event.clientX, event.clientY);
    });
    return entry;
  }

  private update(entry: ObjectEntry, chart: ChartDefinition): void {
    entry.chart = chart;
    const label = chart_object_label(chart);
    if (label !== entry.label) {
      entry.label = label;
      entry.frame.setAttribute("aria-label", label);
    }
    // Without a renderer the frame shows the title, else the kind, so a chart is never blank.
    const text = chart.title?.trim() || chart_name(chart.kind);
    if (entry.fallbackTitle && entry.fallbackTitle.textContent !== text) {
      entry.fallbackTitle.textContent = text;
    }
  }

  private unmount(entry: ObjectEntry): void {
    if (this.drag?.entry === entry) this.cancel_drag();
    const had_focus = entry.frame.contains(document.activeElement);
    dispose_entry(entry);
    this.entries.delete(entry.chart.id);
    if (this.selected_id === entry.chart.id) {
      this.selected_id = null;
      this.options.onSelect(null);
    }

    // Focus would fall to the document body; keep keyboard users in the grid.
    if (had_focus) this.options.focusGrid();
  }

  private place_panes(): void {
    const { geometry } = this.options;
    const theme = this.options.theme();
    const left = theme.rowHeaderWidth;
    const top = theme.headerHeight;
    // The scroller's client box leaves out its scroll bars, which objects must not cover.
    const right = Math.max(left, this.options.scroller.clientWidth);
    const bottom = Math.max(top, this.options.scroller.clientHeight);
    const split_x = Math.min(right, left + geometry.frozenWidth());
    const split_y = Math.min(bottom, top + geometry.frozenHeight());
    write_pane(this.panes["top-left"], left, top, split_x, split_y);
    write_pane(this.panes["top-right"], split_x, top, right, split_y);
    write_pane(this.panes["bottom-left"], left, split_y, split_x, bottom);
    write_pane(this.panes["bottom-right"], split_x, split_y, right, bottom);
  }

  private pane_origin(name: PaneName): { left: number; top: number } {
    const { geometry } = this.options;
    const theme = this.options.theme();
    const is_right_pane = name === "top-right" || name === "bottom-right";
    const is_bottom_pane = name === "bottom-left" || name === "bottom-right";
    return {
      left: theme.rowHeaderWidth + (is_right_pane ? geometry.frozenWidth() : 0),
      top: theme.headerHeight + (is_bottom_pane ? geometry.frozenHeight() : 0),
    };
  }

  private place_entry(entry: ObjectEntry, content_top: number, scroll_left: number): void {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const anchor = entry.chart.anchor;
    const resolved = this.resolve_anchor(anchor);
    const is_top_pane = resolved.viewRow < geometry.frozenRowCount();
    const is_left_pane = resolved.col < geometry.firstBodyColumn();
    const pane: PaneName = is_top_pane
      ? is_left_pane
        ? "top-left"
        : "top-right"
      : is_left_pane
        ? "bottom-left"
        : "bottom-right";

    // The same screen geometry that places the cell editor and the note card.
    const cell_x = geometry.screenColumnLeft(resolved.col, scroll_left);
    const cell_y = geometry.screenRowTop(resolved.viewRow, content_top);
    const origin = this.pane_origin(pane);
    const box: PlacedBox = {
      pane,
      x: cell_x + (resolved.isColCollapsed ? 0 : anchor.offsetX * zoom) - origin.left,
      y: cell_y + (resolved.isRowCollapsed ? 0 : anchor.offsetY * zoom) - origin.top,
      width: anchor.width * zoom,
      height: anchor.height * zoom,
    };
    const preview = entry.preview;
    if (preview) {
      box.x += preview.dx;
      box.y += preview.dy;
      box.width = Math.max(MIN_OBJECT_SIZE * zoom, box.width + preview.dw);
      box.height = Math.max(MIN_OBJECT_SIZE * zoom, box.height + preview.dh);
    }
    this.write_box(entry, box);
  }

  private write_box(entry: ObjectEntry, box: PlacedBox): void {
    const previous = entry.box;
    const { frame } = entry;
    if (previous?.pane !== box.pane) {
      const had_focus = frame.contains(document.activeElement);
      this.panes[box.pane].appendChild(frame);
      // Moving a node to another parent drops its focus.
      if (had_focus) frame.focus({ preventScroll: true });
    }
    if (previous?.x !== box.x || previous.y !== box.y) {
      frame.style.transform = `translate(${box.x}px, ${box.y}px)`;
    }
    const is_resized = previous?.width !== box.width || previous.height !== box.height;
    if (is_resized) {
      frame.style.width = `${box.width}px`;
      frame.style.height = `${box.height}px`;
    }
    entry.box = box;

    // The first placement uses the size that `mount` received.
    if (is_resized && previous) entry.mounted?.resize(box.width, box.height);
  }

  /** The view row and visible column of an anchor; hidden rows and columns collapse forward. */
  private resolve_anchor(anchor: ChartAnchor): ResolvedAnchor {
    const { geometry } = this.options;
    const row_count = geometry.rowCount;
    let view_row: number | null = null;
    let is_row_collapsed = false;
    for (let walked = 0; walked < HIDDEN_ROW_WALK_LIMIT; walked++) {
      view_row = geometry.toViewRow(anchor.row + walked);
      if (view_row !== null) {
        is_row_collapsed = walked > 0;
        break;
      }
    }
    if (view_row === null) {
      view_row = row_count;
      is_row_collapsed = true;
    }

    const columns = geometry.columnIndices;
    const col = columns[lower_bound(columns, anchor.col)];
    return {
      viewRow: Math.min(view_row, row_count),
      isRowCollapsed: is_row_collapsed,
      // Past the last visible column, the object sits at the right edge of the cells.
      col: col ?? anchor.col,
      isColCollapsed: col !== anchor.col,
    };
  }

  /** Top-left of an object in content space, in zoomed pixels. */
  private content_origin(anchor: ChartAnchor): ContentPoint {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const resolved = this.resolve_anchor(anchor);
    const offset_x = resolved.isColCollapsed ? 0 : anchor.offsetX * zoom;
    const offset_y = resolved.isRowCollapsed ? 0 : anchor.offsetY * zoom;
    return {
      x: geometry.columnLeft(resolved.col) + offset_x,
      y: geometry.rowOffset(resolved.viewRow) + offset_y,
    };
  }

  /** The cell and offsets of a content point; the inverse of `content_origin`. */
  private anchor_at(point: ContentPoint, size: { width: number; height: number }): ChartAnchor {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const columns = geometry.columnIndices;
    const x = Math.max(0, point.x);
    const y = Math.max(0, point.y);

    const hit_column = geometry.columnAtX(x);
    const col = hit_column === -1 ? (columns[columns.length - 1] ?? 0) : hit_column;
    const last_row = Math.max(0, geometry.rowCount - 1);
    const view_row = Math.min(geometry.rowAtOffset(y), last_row);
    return {
      row: geometry.toDataRow(view_row),
      col,
      offsetX: Math.max(0, Math.round((x - geometry.columnLeft(col)) / zoom)),
      offsetY: Math.max(0, Math.round((y - geometry.rowOffset(view_row)) / zoom)),
      width: Math.round(size.width),
      height: Math.round(size.height),
    };
  }

  private commit_anchor(entry: ObjectEntry, anchor: ChartAnchor): void {
    const current = entry.chart.anchor;
    const is_same =
      anchor.row === current.row &&
      anchor.col === current.col &&
      anchor.offsetX === current.offsetX &&
      anchor.offsetY === current.offsetY &&
      anchor.width === current.width &&
      anchor.height === current.height;
    if (is_same) return;
    this.options.setChart({ ...structuredClone(entry.chart), anchor });
  }

  private readonly on_grid_pointer_down = (): void => {
    this.select(null);
  };

  private readonly on_wheel = (event: WheelEvent): void => {
    // Objects sit outside the scroller, so a wheel over one would not scroll the cells.
    if (!(event.target instanceof Element) || !event.target.closest(".sheetwrite-object")) return;
    const scale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? WHEEL_LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? WHEEL_PAGE_PX
          : 1;
    event.preventDefault();
    this.options.scroller.scrollTop += event.deltaY * scale;
    this.options.scroller.scrollLeft += event.deltaX * scale;
  };

  private on_object_pointer_down(event: PointerEvent, entry: ObjectEntry): void {
    if (event.button !== 0 || this.drag) return;
    // Keep the press away from text selection and from the grid's own pointer handling.
    event.preventDefault();
    event.stopPropagation();
    this.select(entry.chart.id, true);
    if (this.options.readOnly()) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    const handle_name = target?.dataset.handle;
    this.drag = {
      entry,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      handle: HANDLES.find((candidate) => candidate.name === handle_name) ?? null,
      isActive: false,
    };
    // Document listeners follow the pointer outside the object; pointer capture
    // is not needed and fails for synthetic pointers.
    document.addEventListener("pointermove", this.on_drag_move);
    document.addEventListener("pointerup", this.on_drag_end);
    document.addEventListener("pointercancel", this.on_drag_cancel);
  }

  private readonly on_drag_move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.isActive && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.isActive = true;
    event.preventDefault();
    drag.entry.preview = preview_for(drag.handle, dx, dy);
    this.place_again(drag.entry);
  };

  private readonly on_drag_end = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const preview = preview_for(
      drag.handle,
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    const is_active = drag.isActive;
    this.end_drag();
    if (is_active) this.commit_preview(drag.entry, preview);
    // A no-op commit leaves the box at its preview position.
    this.place_again(drag.entry);
  };

  private readonly on_drag_cancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.cancel_drag();
  };

  private cancel_drag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.end_drag();
    this.place_again(drag.entry);
  }

  private end_drag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.entry.preview = null;
    document.removeEventListener("pointermove", this.on_drag_move);
    document.removeEventListener("pointerup", this.on_drag_end);
    document.removeEventListener("pointercancel", this.on_drag_cancel);
  }

  /** Place one object at once for the last frame's scroll position. */
  private place_again(entry: ObjectEntry): void {
    if (this.destroyed || this.entries.get(entry.chart.id) !== entry) return;
    this.place_entry(entry, this.last_content_top, this.last_scroll_left);
  }

  /** Turn a screen-pixel preview into one anchor change. */
  private commit_preview(entry: ObjectEntry, preview: DragPreview): void {
    const zoom = this.options.zoom();
    const anchor = entry.chart.anchor;
    const origin = this.content_origin(anchor);
    const width = Math.max(MIN_OBJECT_SIZE, anchor.width + preview.dw / zoom);
    const height = Math.max(MIN_OBJECT_SIZE, anchor.height + preview.dh / zoom);
    const next = this.anchor_at(
      { x: origin.x + preview.dx, y: origin.y + preview.dy },
      { width, height },
    );
    this.commit_anchor(entry, next);
  }

  private on_object_key_down(event: KeyboardEvent, entry: ObjectEntry): void {
    // Undo and redo belong to the grid. Other keys must not reach it: it would
    // move the cell cursor, start an edit, or cut and paste the cells behind.
    if (this.options.isHistoryShortcut(event)) return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Shift+F10 and the ContextMenu key open the menu at the chart, as on a cell.
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const box = entry.frame.getBoundingClientRect();
      this.open_menu(entry, box.left, box.top);
      return;
    }

    const is_read_only = this.options.readOnly();
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        this.select(null);
        this.options.focusGrid();
        return;
      case "Enter":
        event.preventDefault();
        this.select(entry.chart.id);
        this.options.onActivate({
          sheet: this.sheet ?? this.options.activeSheet(),
          id: entry.chart.id,
        });
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        if (!is_read_only) this.options.removeChart(entry.chart.id);
        return;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        if (!is_read_only) this.nudge(entry, event.key, event.shiftKey);
        return;
      default:
        return;
    }
  }

  /** Select the chart, then ask the grid for its menu; Escape gives focus back to it. */
  private open_menu(entry: ObjectEntry, client_x: number, client_y: number): void {
    this.select(entry.chart.id, true);
    this.options.onContextMenu(
      { sheet: this.sheet ?? this.options.activeSheet(), id: entry.chart.id },
      client_x,
      client_y,
    );
  }

  /** Move by one document pixel, or by one cell with `by_cell`; one commit per press. */
  private nudge(entry: ObjectEntry, key: ArrowKey, by_cell: boolean): void {
    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const anchor = entry.chart.anchor;
    if (!by_cell) {
      const zoom = this.options.zoom();
      const origin = this.content_origin(anchor);
      const moved = { x: origin.x + dx * zoom, y: origin.y + dy * zoom };
      this.commit_anchor(entry, this.anchor_at(moved, anchor));
      return;
    }

    const { geometry } = this.options;
    const resolved = this.resolve_anchor(anchor);
    const last_row = Math.max(0, geometry.rowCount - 1);
    const view_row = Math.min(last_row, Math.max(0, resolved.viewRow + dy));
    this.commit_anchor(entry, {
      ...anchor,
      row: dy === 0 ? anchor.row : geometry.toDataRow(view_row),
      col: dx === 0 ? anchor.col : geometry.nextVisibleColumn(resolved.col, dx === 1 ? 1 : -1),
    });
  }
}

function create_pane(name: PaneName): HTMLDivElement {
  const pane = document.createElement("div");
  pane.className = "sheetwrite-object-pane";
  pane.dataset.pane = name;
  // `clip`, not `hidden`: a hidden overflow still scrolls when a chart gets
  // focus or scrollIntoView, which would slide every chart off its cells.
  pane.style.cssText = "position:absolute;overflow:clip;pointer-events:none;";
  return pane;
}

function write_pane(
  pane: HTMLDivElement,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  write_style(pane.style, "left", `${left}px`);
  write_style(pane.style, "top", `${top}px`);
  write_style(pane.style, "width", `${Math.max(0, right - left)}px`);
  write_style(pane.style, "height", `${Math.max(0, bottom - top)}px`);
}

/** Write only changed values: this runs on every scroll frame. */
function write_style(
  style: CSSStyleDeclaration,
  property: "left" | "top" | "width" | "height",
  value: string,
): void {
  if (style[property] !== value) style[property] = value;
}

function show_selected(entry: ObjectEntry, is_selected: boolean): void {
  entry.frame.classList.toggle("sheetwrite-object-selected", is_selected);
  entry.frame.setAttribute("aria-current", String(is_selected));
  entry.frame.tabIndex = is_selected ? 0 : -1;
}

function dispose_entry(entry: ObjectEntry): void {
  entry.mounted?.dispose();
  entry.frame.remove();
}

/** Screen-pixel change of position and size for a move (`handle` null) or a resize. */
function preview_for(handle: HandleDirection | null, dx: number, dy: number): DragPreview {
  if (handle === null) return { dx, dy, dw: 0, dh: 0 };
  return {
    // A left or top handle moves that edge: the box moves and shrinks by the same amount.
    dx: handle.x === -1 ? dx : 0,
    dy: handle.y === -1 ? dy : 0,
    dw: handle.x * dx,
    dh: handle.y * dy,
  };
}

/** First index in ascending `values` whose value is at least `target`. */
function lower_bound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
