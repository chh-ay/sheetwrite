import { createChartRenderer } from "./chart-backend.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
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

/** Name of each chart kind, as screen readers and the plain frame say it. */
const KIND_LABELS: Readonly<Record<ChartKind, string>> = {
  column: "Column chart",
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  pie: "Pie chart",
  doughnut: "Doughnut chart",
  scatter: "Scatter chart",
};

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
function chartObjectLabel(chart: ChartDefinition): string {
  const title = chart.title?.trim();
  return title ? `${title}, ${KIND_LABELS[chart.kind].toLowerCase()}` : KIND_LABELS[chart.kind];
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
  private selectedId: string | null = null;
  private drag: DragSession | null = null;
  private lastContentTop = 0;
  private lastScrollLeft = 0;
  private isReadOnlyShown: boolean | null = null;
  private destroyed = false;

  constructor(private readonly options: ObjectLayerOptions) {
    const root = document.createElement("div");
    root.className = "sheetwrite-object-layer";
    root.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    this.panes = {
      "top-left": createPane("top-left"),
      "top-right": createPane("top-right"),
      "bottom-left": createPane("bottom-left"),
      "bottom-right": createPane("bottom-right"),
    };
    for (const name of PANE_NAMES) root.appendChild(this.panes[name]);
    this.root = root;
    root.addEventListener("wheel", this.onWheel, { passive: false });
    options.viewport.appendChild(root);

    // A press on a cell belongs to the grid and ends object selection.
    options.scroller.addEventListener("pointerdown", this.onGridPointerDown);
  }

  get selected(): ChartRef | null {
    return this.selectedId === null || this.sheet === null
      ? null
      : { sheet: this.sheet, id: this.selectedId };
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
    this.lastContentTop = contentTop;
    this.lastScrollLeft = scrollLeft;
    const readOnly = this.options.readOnly();
    if (readOnly !== this.isReadOnlyShown) {
      this.isReadOnlyShown = readOnly;
      this.root.dataset.readonly = String(readOnly);
    }
    if (this.entries.size === 0) return;

    this.placePanes();
    for (const entry of this.entries.values()) this.placeEntry(entry, contentTop, scrollLeft);
  }

  /** Select `id` on the active sheet, or deselect with `null`. */
  select(id: string | null, focus = false): void {
    const entry = id === null ? undefined : this.entries.get(id);
    const nextId = entry ? entry.chart.id : null;
    if (nextId !== this.selectedId) {
      const previous = this.selectedId === null ? undefined : this.entries.get(this.selectedId);
      if (previous) showSelected(previous, false);
      this.selectedId = nextId;
      if (entry) showSelected(entry, true);
      this.options.onSelect(this.selected);
    }
    if (focus && entry) entry.frame.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelDrag();
    this.options.scroller.removeEventListener("pointerdown", this.onGridPointerDown);
    for (const entry of this.entries.values()) disposeEntry(entry);
    this.entries.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.root.remove();
  }

  private clear(): void {
    this.cancelDrag();
    if (this.selectedId !== null) {
      this.selectedId = null;
      this.options.onSelect(null);
    }
    for (const entry of this.entries.values()) disposeEntry(entry);
    this.entries.clear();
  }

  private mount(chart: ChartDefinition, sheet: SheetId): ObjectEntry {
    const frame = document.createElement("div");
    frame.className = "sheetwrite-object";
    frame.tabIndex = -1;
    frame.setAttribute("role", "img");
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

    const zoom = this.options.zoom();
    const size = { width: chart.anchor.width * zoom, height: chart.anchor.height * zoom };
    // Resolved on each mount, so a renderer registered after the grid was made still draws.
    this.renderer ??= createChartRenderer(this.options.store);
    let mounted: MountedChart | null = null;
    let fallbackTitle: HTMLElement | null = null;
    if (this.renderer) {
      mounted = this.renderer.mount(host, { sheet, id: chart.id }, size);
    } else {
      fallbackTitle = document.createElement("div");
      fallbackTitle.className = "sheetwrite-object-fallback";
      host.appendChild(fallbackTitle);
    }

    const entry: ObjectEntry = {
      chart,
      frame,
      mounted,
      fallbackTitle,
      label: "",
      box: null,
      preview: null,
    };
    this.update(entry, chart);
    frame.addEventListener("pointerdown", (event) => this.onObjectPointerDown(event, entry));
    frame.addEventListener("keydown", (event) => this.onObjectKeyDown(event, entry));
    return entry;
  }

  private update(entry: ObjectEntry, chart: ChartDefinition): void {
    entry.chart = chart;
    const label = chartObjectLabel(chart);
    if (label !== entry.label) {
      entry.label = label;
      entry.frame.setAttribute("aria-label", label);
    }
    // Without a renderer the frame shows the title, else the kind, so a chart is never blank.
    const text = chart.title?.trim() || KIND_LABELS[chart.kind];
    if (entry.fallbackTitle && entry.fallbackTitle.textContent !== text) {
      entry.fallbackTitle.textContent = text;
    }
  }

  private unmount(entry: ObjectEntry): void {
    if (this.drag?.entry === entry) this.cancelDrag();
    const hadFocus = entry.frame.contains(document.activeElement);
    disposeEntry(entry);
    this.entries.delete(entry.chart.id);
    if (this.selectedId === entry.chart.id) {
      this.selectedId = null;
      this.options.onSelect(null);
    }

    // Focus would fall to the document body; keep keyboard users in the grid.
    if (hadFocus) this.options.focusGrid();
  }

  private placePanes(): void {
    const { geometry } = this.options;
    const theme = this.options.theme();
    const left = theme.rowHeaderWidth;
    const top = theme.headerHeight;
    // The scroller's client box leaves out its scroll bars, which objects must not cover.
    const right = Math.max(left, this.options.scroller.clientWidth);
    const bottom = Math.max(top, this.options.scroller.clientHeight);
    const splitX = Math.min(right, left + geometry.frozenWidth());
    const splitY = Math.min(bottom, top + geometry.frozenHeight());
    writePane(this.panes["top-left"], left, top, splitX, splitY);
    writePane(this.panes["top-right"], splitX, top, right, splitY);
    writePane(this.panes["bottom-left"], left, splitY, splitX, bottom);
    writePane(this.panes["bottom-right"], splitX, splitY, right, bottom);
  }

  private paneOrigin(name: PaneName): { left: number; top: number } {
    const { geometry } = this.options;
    const theme = this.options.theme();
    const isRightPane = name === "top-right" || name === "bottom-right";
    const isBottomPane = name === "bottom-left" || name === "bottom-right";
    return {
      left: theme.rowHeaderWidth + (isRightPane ? geometry.frozenWidth() : 0),
      top: theme.headerHeight + (isBottomPane ? geometry.frozenHeight() : 0),
    };
  }

  private placeEntry(entry: ObjectEntry, contentTop: number, scrollLeft: number): void {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const anchor = entry.chart.anchor;
    const resolved = this.resolveAnchor(anchor);
    const isTopPane = resolved.viewRow < geometry.frozenRowCount();
    const isLeftPane = resolved.col < geometry.firstBodyColumn();
    const pane: PaneName = isTopPane
      ? isLeftPane
        ? "top-left"
        : "top-right"
      : isLeftPane
        ? "bottom-left"
        : "bottom-right";

    // The same screen geometry that places the cell editor and the note card.
    const cellX = geometry.screenColumnLeft(resolved.col, scrollLeft);
    const cellY = geometry.screenRowTop(resolved.viewRow, contentTop);
    const origin = this.paneOrigin(pane);
    const box: PlacedBox = {
      pane,
      x: cellX + (resolved.isColCollapsed ? 0 : anchor.offsetX * zoom) - origin.left,
      y: cellY + (resolved.isRowCollapsed ? 0 : anchor.offsetY * zoom) - origin.top,
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
    this.writeBox(entry, box);
  }

  private writeBox(entry: ObjectEntry, box: PlacedBox): void {
    const previous = entry.box;
    const { frame } = entry;
    if (previous?.pane !== box.pane) {
      const hadFocus = frame.contains(document.activeElement);
      this.panes[box.pane].appendChild(frame);
      // Moving a node to another parent drops its focus.
      if (hadFocus) frame.focus();
    }
    if (previous?.x !== box.x || previous.y !== box.y) {
      frame.style.transform = `translate(${box.x}px, ${box.y}px)`;
    }
    const isResized = previous?.width !== box.width || previous.height !== box.height;
    if (isResized) {
      frame.style.width = `${box.width}px`;
      frame.style.height = `${box.height}px`;
    }
    entry.box = box;

    // The first placement uses the size that `mount` received.
    if (isResized && previous) entry.mounted?.resize(box.width, box.height);
  }

  /** The view row and visible column of an anchor; hidden rows and columns collapse forward. */
  private resolveAnchor(anchor: ChartAnchor): ResolvedAnchor {
    const { geometry } = this.options;
    const rowCount = geometry.rowCount;
    let viewRow: number | null = null;
    let isRowCollapsed = false;
    for (let walked = 0; walked < HIDDEN_ROW_WALK_LIMIT; walked++) {
      viewRow = geometry.toViewRow(anchor.row + walked);
      if (viewRow !== null) {
        isRowCollapsed = walked > 0;
        break;
      }
    }
    if (viewRow === null) {
      viewRow = rowCount;
      isRowCollapsed = true;
    }

    const columns = geometry.columnIndices;
    const col = columns[lowerBound(columns, anchor.col)];
    return {
      viewRow: Math.min(viewRow, rowCount),
      isRowCollapsed,
      // Past the last visible column, the object sits at the right edge of the cells.
      col: col ?? anchor.col,
      isColCollapsed: col !== anchor.col,
    };
  }

  /** Top-left of an object in content space, in zoomed pixels. */
  private contentOrigin(anchor: ChartAnchor): ContentPoint {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const resolved = this.resolveAnchor(anchor);
    const offsetX = resolved.isColCollapsed ? 0 : anchor.offsetX * zoom;
    const offsetY = resolved.isRowCollapsed ? 0 : anchor.offsetY * zoom;
    return {
      x: geometry.columnLeft(resolved.col) + offsetX,
      y: geometry.rowOffset(resolved.viewRow) + offsetY,
    };
  }

  /** The cell and offsets of a content point; the inverse of `contentOrigin`. */
  private anchorAt(point: ContentPoint, size: { width: number; height: number }): ChartAnchor {
    const { geometry } = this.options;
    const zoom = this.options.zoom();
    const columns = geometry.columnIndices;
    const x = Math.max(0, point.x);
    const y = Math.max(0, point.y);

    const hitColumn = geometry.columnAtX(x);
    const col = hitColumn === -1 ? (columns[columns.length - 1] ?? 0) : hitColumn;
    const lastRow = Math.max(0, geometry.rowCount - 1);
    const viewRow = Math.min(geometry.rowAtOffset(y), lastRow);
    return {
      row: geometry.toDataRow(viewRow),
      col,
      offsetX: Math.max(0, Math.round((x - geometry.columnLeft(col)) / zoom)),
      offsetY: Math.max(0, Math.round((y - geometry.rowOffset(viewRow)) / zoom)),
      width: Math.round(size.width),
      height: Math.round(size.height),
    };
  }

  private commitAnchor(entry: ObjectEntry, anchor: ChartAnchor): void {
    const current = entry.chart.anchor;
    const isSame =
      anchor.row === current.row &&
      anchor.col === current.col &&
      anchor.offsetX === current.offsetX &&
      anchor.offsetY === current.offsetY &&
      anchor.width === current.width &&
      anchor.height === current.height;
    if (isSame) return;
    this.options.setChart({ ...structuredClone(entry.chart), anchor });
  }

  private readonly onGridPointerDown = (): void => {
    this.select(null);
  };

  private readonly onWheel = (event: WheelEvent): void => {
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

  private onObjectPointerDown(event: PointerEvent, entry: ObjectEntry): void {
    if (event.button !== 0 || this.drag) return;
    // Keep the press away from text selection and from the grid's own pointer handling.
    event.preventDefault();
    event.stopPropagation();
    this.select(entry.chart.id, true);
    if (this.options.readOnly()) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    const handleName = target?.dataset.handle;
    this.drag = {
      entry,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      handle: HANDLES.find((candidate) => candidate.name === handleName) ?? null,
      isActive: false,
    };
    // Document listeners follow the pointer outside the object; pointer capture
    // is not needed and fails for synthetic pointers.
    document.addEventListener("pointermove", this.onDragMove);
    document.addEventListener("pointerup", this.onDragEnd);
    document.addEventListener("pointercancel", this.onDragCancel);
  }

  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.isActive && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.isActive = true;
    event.preventDefault();
    drag.entry.preview = previewFor(drag.handle, dx, dy);
    this.placeAgain(drag.entry);
  };

  private readonly onDragEnd = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const preview = previewFor(
      drag.handle,
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    const isActive = drag.isActive;
    this.endDrag();
    if (isActive) this.commitPreview(drag.entry, preview);
    // A no-op commit leaves the box at its preview position.
    this.placeAgain(drag.entry);
  };

  private readonly onDragCancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.cancelDrag();
  };

  private cancelDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.endDrag();
    this.placeAgain(drag.entry);
  }

  private endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.entry.preview = null;
    document.removeEventListener("pointermove", this.onDragMove);
    document.removeEventListener("pointerup", this.onDragEnd);
    document.removeEventListener("pointercancel", this.onDragCancel);
  }

  /** Place one object at once for the last frame's scroll position. */
  private placeAgain(entry: ObjectEntry): void {
    if (this.destroyed || this.entries.get(entry.chart.id) !== entry) return;
    this.placeEntry(entry, this.lastContentTop, this.lastScrollLeft);
  }

  /** Turn a screen-pixel preview into one anchor change. */
  private commitPreview(entry: ObjectEntry, preview: DragPreview): void {
    const zoom = this.options.zoom();
    const anchor = entry.chart.anchor;
    const origin = this.contentOrigin(anchor);
    const width = Math.max(MIN_OBJECT_SIZE, anchor.width + preview.dw / zoom);
    const height = Math.max(MIN_OBJECT_SIZE, anchor.height + preview.dh / zoom);
    const next = this.anchorAt(
      { x: origin.x + preview.dx, y: origin.y + preview.dy },
      { width, height },
    );
    this.commitAnchor(entry, next);
  }

  private onObjectKeyDown(event: KeyboardEvent, entry: ObjectEntry): void {
    // Undo and redo belong to the grid. Other keys must not reach it: it would
    // move the cell cursor, start an edit, or cut and paste the cells behind.
    if (this.options.isHistoryShortcut(event)) return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const isReadOnly = this.options.readOnly();
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
        if (!isReadOnly) this.options.removeChart(entry.chart.id);
        return;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        if (!isReadOnly) this.nudge(entry, event.key, event.shiftKey);
        return;
      default:
        return;
    }
  }

  /** Move by one document pixel, or by one cell with `byCell`; one commit per press. */
  private nudge(entry: ObjectEntry, key: ArrowKey, byCell: boolean): void {
    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const anchor = entry.chart.anchor;
    if (!byCell) {
      const zoom = this.options.zoom();
      const origin = this.contentOrigin(anchor);
      const moved = { x: origin.x + dx * zoom, y: origin.y + dy * zoom };
      this.commitAnchor(entry, this.anchorAt(moved, anchor));
      return;
    }

    const { geometry } = this.options;
    const resolved = this.resolveAnchor(anchor);
    const lastRow = Math.max(0, geometry.rowCount - 1);
    const viewRow = Math.min(lastRow, Math.max(0, resolved.viewRow + dy));
    this.commitAnchor(entry, {
      ...anchor,
      row: dy === 0 ? anchor.row : geometry.toDataRow(viewRow),
      col: dx === 0 ? anchor.col : geometry.nextVisibleColumn(resolved.col, dx === 1 ? 1 : -1),
    });
  }
}

function createPane(name: PaneName): HTMLDivElement {
  const pane = document.createElement("div");
  pane.className = "sheetwrite-object-pane";
  pane.dataset.pane = name;
  pane.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
  return pane;
}

function writePane(
  pane: HTMLDivElement,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  writeStyle(pane.style, "left", `${left}px`);
  writeStyle(pane.style, "top", `${top}px`);
  writeStyle(pane.style, "width", `${Math.max(0, right - left)}px`);
  writeStyle(pane.style, "height", `${Math.max(0, bottom - top)}px`);
}

/** Write only changed values: this runs on every scroll frame. */
function writeStyle(
  style: CSSStyleDeclaration,
  property: "left" | "top" | "width" | "height",
  value: string,
): void {
  if (style[property] !== value) style[property] = value;
}

function showSelected(entry: ObjectEntry, isSelected: boolean): void {
  entry.frame.classList.toggle("sheetwrite-object-selected", isSelected);
  entry.frame.setAttribute("aria-current", String(isSelected));
  entry.frame.tabIndex = isSelected ? 0 : -1;
}

function disposeEntry(entry: ObjectEntry): void {
  entry.mounted?.dispose();
  entry.frame.remove();
}

/** Screen-pixel change of position and size for a move (`handle` null) or a resize. */
function previewFor(handle: HandleDirection | null, dx: number, dy: number): DragPreview {
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
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
