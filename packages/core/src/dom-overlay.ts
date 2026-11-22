import {
  intersectingMerges,
  MERGE_KEY_STRIDE,
  type MergeRect,
  type PreparedMergeIndex,
  prepareMergeIndex,
} from "./canvas-paint.js";
import { EMPTY_STYLE } from "./cell-style-fields.js";
import { SheetwriteError } from "./errors.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import { FirstFailure } from "./scope.js";
import type { CellScalar, CellStyle } from "./types/cell.js";
import type {
  CellPaintContext,
  CellRenderer,
  PanePaint,
  RenderLayout,
  Theme,
  Viewport,
} from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

const INTERACTIVE_SELECTOR =
  "button,input,select,textarea,a[href],[contenteditable]:not([contenteditable='false']),[tabindex]:not([tabindex='-1'])";
const ACCESSIBLE_SELECTOR = `${INTERACTIVE_SELECTOR},[role],[aria-label],[aria-labelledby],[aria-description],[aria-describedby]`;
const EMPTY_ANCHOR_REQUESTS: readonly DomMergeAnchorRequest[] = [];
const EMPTY_WINDOW_VIEWS: readonly VisibleWindowView[] = [];

interface DomEntry {
  readonly key: string;
  readonly rendererName: string;
  readonly renderer: CellRenderer;
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly clip: HTMLDivElement;
  readonly bounds: HTMLDivElement;
  readonly context: CellPaintContext;
  node: HTMLElement;
  sourceStyle: CellStyle;
  frame: number;
}

export interface DomOverlayOptions {
  readonly host: HTMLElement;
  readonly geometry: GeometryLayoutController;
}

/** One sparse row-window read containing only off-window DOM merge anchors. */
export interface DomMergeAnchorRequest {
  readonly sheet: string;
  readonly row: number;
  readonly cols: readonly number[];
}

/** Retains custom DOM-renderer nodes for the bounded paint window. */
export class DomOverlay {
  readonly element: HTMLDivElement;

  private readonly host: HTMLElement;
  private readonly geometry: GeometryLayoutController;
  private readonly entries = new Map<string, DomEntry>();
  private readonly renderer_ids = new WeakMap<CellRenderer, number>();
  private readonly owned_nodes = new WeakSet<HTMLElement>();
  private readonly merge_map = new Map<number, MergeRect>();
  private readonly style_caches: Array<Map<number, CellStyle>> = [];
  private readonly style_tables: Array<VisibleWindowView["styles"]> = [];
  private renderers: ReadonlyMap<string, CellRenderer> = new Map();
  private layout: RenderLayout | null = null;
  private theme: Theme | null = null;
  private merge_index: PreparedMergeIndex | null = null;
  private frame = 0;
  private frame_style_table_count = 0;
  private frame_view: VisibleWindowView | null = null;
  private frame_panes: readonly PanePaint[] | null = null;
  private frame_anchor_views: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS;
  private next_renderer_id = 1;
  private destroyed = false;

  constructor(parent: HTMLElement, options: DomOverlayOptions) {
    this.host = options.host;
    this.geometry = options.geometry;

    const element = document.createElement("div");
    element.className = "sheetwrite-dom-overlay";
    element.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
    element.addEventListener("keydown", this.on_key_down);
    parent.appendChild(element);
    this.element = element;
  }

  setLayout(layout: RenderLayout): void {
    this.layout = layout;
    this.merge_index = layout.merges?.length ? prepareMergeIndex(layout.merges) : null;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void {
    this.renderers = renderers;
    const failures = new FirstFailure();
    for (const entry of this.entries.values()) {
      if (renderers.get(entry.rendererName) === entry.renderer) continue;
      failures.run(() => this.remove_entry(entry, true));
    }
    failures.rethrow();
  }

  paint(
    view: VisibleWindowView,
    viewport: Viewport,
    anchorViews: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS,
  ): void {
    if (!this.begin_frame()) return;
    this.frame_view = view;
    this.frame_panes = null;
    this.frame_anchor_views = anchorViews;
    const failures = new FirstFailure();
    failures.run(() => {
      this.populate_merge_map(view);
      this.paint_view(view, {
        x: 0,
        y: 0,
        w: viewport.width,
        h: viewport.height,
        scrollTop: viewport.scrollTop,
        scrollLeft: viewport.scrollLeft,
      });
    });
    this.finish_frame(failures);
  }

  paintPanes(
    panes: readonly PanePaint[],
    anchorViews: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS,
  ): void {
    if (!this.begin_frame()) return;
    this.frame_view = null;
    this.frame_panes = panes;
    this.frame_anchor_views = anchorViews;
    const failures = new FirstFailure();
    failures.run(() => {
      for (const pane of panes) this.populate_merge_map(pane.view);
      for (const pane of panes) {
        this.paint_view(pane.view, {
          ...pane.clip,
          scrollTop: pane.scrollTop,
          scrollLeft: pane.scrollLeft,
        });
      }
    });
    this.finish_frame(failures);
  }

  reset(): void {
    this.remove_all_entries(true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const failures = new FirstFailure();
    failures.run(() => this.remove_all_entries(false));
    this.entries.clear();
    this.clear_frame_sources();
    this.style_tables.length = 0;
    for (const cache of this.style_caches) cache.clear();
    this.element.removeEventListener("keydown", this.on_key_down);
    this.element.remove();
    failures.rethrow();
  }

  private begin_frame(): boolean {
    if (this.destroyed || this.layout === null || this.theme === null) return false;
    this.frame += 1;
    this.merge_map.clear();
    for (let slot = 0; slot < this.frame_style_table_count; slot++) {
      this.style_caches[slot]!.clear();
    }
    this.style_tables.length = 0;
    this.frame_style_table_count = 0;
    return true;
  }

  private end_frame(remove_current_entries: boolean): void {
    const failures = new FirstFailure();
    for (const entry of this.entries.values()) {
      if (!remove_current_entries && entry.frame === this.frame) continue;
      failures.run(() => this.remove_entry(entry, true));
    }
    failures.rethrow();
  }

  private populate_merge_map(view: VisibleWindowView): void {
    if (this.merge_index === null || view.cols.length === 0) return;
    const merges = intersectingMerges(this.merge_index, view.rows.start, view.rows.end, view.cols);
    for (const merge of merges) {
      const row_start = Math.max(view.rows.start, merge.r0);
      const row_end = Math.min(view.rows.end - 1, merge.r1);
      for (let row = row_start; row <= row_end; row++) {
        const base = row * MERGE_KEY_STRIDE;
        for (const col of view.cols) {
          if (col >= merge.c0 && col <= merge.c1) this.merge_map.set(base + col, merge);
        }
      }
    }
  }

  mergeAnchorRequests(views: readonly VisibleWindowView[]): readonly DomMergeAnchorRequest[] {
    if (this.merge_index === null || this.layout === null || views.length === 0) {
      return EMPTY_ANCHOR_REQUESTS;
    }

    const grouped = new Map<string, { sheet: string; row: number; cols: number[] }>();
    for (const view of views) {
      const merges = intersectingMerges(
        this.merge_index,
        view.rows.start,
        view.rows.end,
        view.cols,
      );
      for (const merge of merges) {
        const renderer_name = this.layout.columns[merge.c0]?.renderer;
        const renderer =
          renderer_name === undefined ? undefined : this.renderers.get(renderer_name);
        if (renderer?.dom === undefined) continue;

        let intersects_column = false;
        for (const col of view.cols) {
          if (col >= merge.c0 && col <= merge.c1) {
            intersects_column = true;
            break;
          }
        }
        if (
          !intersects_column ||
          this.find_view_containing(views, view.sheet, merge.r0, merge.c0) !== null
        ) {
          continue;
        }

        const key = `${view.sheet}\u0000${merge.r0}`;
        let request = grouped.get(key);
        if (request === undefined) {
          request = { sheet: view.sheet, row: merge.r0, cols: [] };
          grouped.set(key, request);
        }
        if (!request.cols.includes(merge.c0)) request.cols.push(merge.c0);
      }
    }
    if (grouped.size === 0) return EMPTY_ANCHOR_REQUESTS;

    const requests: DomMergeAnchorRequest[] = [];
    for (const request of grouped.values()) {
      request.cols.sort((left, right) => left - right);
      requests.push(request);
    }
    requests.sort((left, right) => left.sheet.localeCompare(right.sheet) || left.row - right.row);
    return requests;
  }

  private paint_view(
    view: VisibleWindowView,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
  ): void {
    const { layout, theme } = this;
    // begin_frame already refused a frame without both.
    if (layout === null || theme === null) return;

    const n_cols = view.cols.length;
    const n_rows = view.rows.end - view.rows.start;
    const style_stride = view.styles.length || 1;
    const style_cache = this.style_cache_for(view.styles);

    for (let row_offset = 0; row_offset < n_rows; row_offset++) {
      const row = view.rows.start + row_offset;
      for (let col_offset = 0; col_offset < n_cols; col_offset++) {
        const col = view.cols[col_offset]!;
        const merge = this.merge_map.get(row * MERGE_KEY_STRIDE + col);
        if (merge && (merge.r0 !== row || merge.c0 !== col)) {
          this.retain_covered_merge(view, merge, pane, layout, theme);
          continue;
        }

        const column = layout.columns[col];
        const renderer_name = column?.renderer;
        const renderer =
          renderer_name === undefined ? undefined : this.renderers.get(renderer_name);
        if (renderer?.dom === undefined || renderer_name === undefined) continue;

        const renderer_id = this.renderer_id(renderer);
        const key = `${view.sheet}\u0000${row}\u0000${col}\u0000${renderer_id}`;
        let entry = this.entries.get(key);
        const index = row_offset * n_cols + col_offset;
        const has_fresh_style = index < view.styleIds.length;
        const style_id = has_fresh_style ? view.styleIds[index]! : 0;
        const source_style = has_fresh_style
          ? (view.styles[style_id] ?? EMPTY_STYLE)
          : (entry?.sourceStyle ?? EMPTY_STYLE);
        const style =
          !has_fresh_style && entry
            ? entry.context.style
            : this.effective_style(layout, style_cache, col, style_id, style_stride, source_style);
        const value = view.values[index] ?? null;
        const row_end = merge?.r1 ?? row;
        const col_end = merge?.c1 ?? col;
        const x = this.geometry.screenColumnLeft(col, pane.scrollLeft);
        const y = this.geometry.screenRowTop(row, pane.scrollTop);
        const w = this.geometry.columnLeft(col_end + 1) - this.geometry.columnLeft(col);
        const h = this.geometry.rowOffset(row_end + 1) - this.geometry.rowOffset(row);

        if (entry === undefined) {
          const context: CellPaintContext = { value, x, y, w, h, theme, style };
          entry = this.create_entry(
            key,
            renderer_name,
            renderer,
            context,
            source_style,
            row,
            col,
            view.sheet,
          );
          this.entries.set(key, entry);
        } else {
          this.update_entry(entry, value, x, y, w, h, theme, style, source_style);
        }
        entry.frame = this.frame;
        this.position_entry(entry, x, y, w, h, pane, theme);
      }
    }
  }

  private retain_covered_merge(
    current_view: VisibleWindowView,
    merge: MergeRect,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
    layout: RenderLayout,
    theme: Theme,
  ): void {
    const renderer_name = layout.columns[merge.c0]?.renderer;
    const renderer = renderer_name === undefined ? undefined : this.renderers.get(renderer_name);
    if (renderer?.dom === undefined || renderer_name === undefined) return;
    const key = `${current_view.sheet}\u0000${merge.r0}\u0000${merge.c0}\u0000${this.renderer_id(renderer)}`;
    let entry = this.entries.get(key);
    if (entry?.frame === this.frame) return;

    const anchor_view = this.find_anchor_view(current_view, current_view.sheet, merge.r0, merge.c0);
    if (anchor_view === null) return;
    const index = this.view_cell_index(anchor_view, current_view.sheet, merge.r0, merge.c0);
    if (index < 0) return;
    const has_fresh_style = index < anchor_view.styleIds.length;
    const style_id = has_fresh_style ? anchor_view.styleIds[index]! : 0;
    const source_style = has_fresh_style
      ? (anchor_view.styles[style_id] ?? EMPTY_STYLE)
      : (entry?.sourceStyle ?? EMPTY_STYLE);
    const style =
      !has_fresh_style && entry
        ? entry.context.style
        : this.effective_style(
            layout,
            this.style_cache_for(anchor_view.styles),
            merge.c0,
            style_id,
            anchor_view.styles.length || 1,
            source_style,
          );
    const value = anchor_view.values[index] ?? null;
    const x = this.geometry.screenColumnLeft(merge.c0, pane.scrollLeft);
    const y = this.geometry.screenRowTop(merge.r0, pane.scrollTop);
    const w = this.geometry.columnLeft(merge.c1 + 1) - this.geometry.columnLeft(merge.c0);
    const h = this.geometry.rowOffset(merge.r1 + 1) - this.geometry.rowOffset(merge.r0);

    if (entry === undefined) {
      const context: CellPaintContext = { value, x, y, w, h, theme, style };
      entry = this.create_entry(
        key,
        renderer_name,
        renderer,
        context,
        source_style,
        merge.r0,
        merge.c0,
        current_view.sheet,
      );
      this.entries.set(key, entry);
    } else {
      this.update_entry(entry, value, x, y, w, h, theme, style, source_style);
    }
    entry.frame = this.frame;
    this.position_entry(entry, x, y, w, h, pane, theme);
  }

  private effective_style(
    layout: RenderLayout,
    cache: Map<number, CellStyle>,
    col: number,
    style_id: number,
    style_stride: number,
    source_style: CellStyle,
  ): CellStyle {
    const column_style = layout.columns[col]?.cellStyle;
    if (column_style === undefined) return source_style;
    const key = col * style_stride + style_id;
    let style = cache.get(key);
    if (style === undefined) {
      style = { ...column_style, ...source_style };
      cache.set(key, style);
    }
    return style;
  }

  private style_cache_for(styles: VisibleWindowView["styles"]): Map<number, CellStyle> {
    for (let slot = 0; slot < this.frame_style_table_count; slot++) {
      if (this.style_tables[slot] === styles) return this.style_caches[slot]!;
    }
    const slot = this.frame_style_table_count++;
    this.style_tables[slot] = styles;
    let cache = this.style_caches[slot];
    if (cache === undefined) {
      cache = new Map();
      this.style_caches[slot] = cache;
    }
    return cache;
  }

  private find_anchor_view(
    current_view: VisibleWindowView,
    sheet: string,
    row: number,
    col: number,
  ): VisibleWindowView | null {
    if (this.view_cell_index(current_view, sheet, row, col) >= 0) return current_view;
    if (
      this.frame_view !== null &&
      this.frame_view !== current_view &&
      this.view_cell_index(this.frame_view, sheet, row, col) >= 0
    ) {
      return this.frame_view;
    }
    if (this.frame_panes !== null) {
      for (const pane of this.frame_panes) {
        if (pane.view !== current_view && this.view_cell_index(pane.view, sheet, row, col) >= 0) {
          return pane.view;
        }
      }
    }
    return this.find_view_containing(this.frame_anchor_views, sheet, row, col);
  }

  private find_view_containing(
    views: readonly VisibleWindowView[],
    sheet: string,
    row: number,
    col: number,
  ): VisibleWindowView | null {
    for (const view of views) {
      if (this.view_cell_index(view, sheet, row, col) >= 0) return view;
    }
    return null;
  }

  private view_cell_index(
    view: VisibleWindowView,
    sheet: string,
    row: number,
    col: number,
  ): number {
    if (view.sheet !== sheet || row < view.rows.start || row >= view.rows.end) return -1;
    for (let col_offset = 0; col_offset < view.cols.length; col_offset++) {
      if (view.cols[col_offset] === col) {
        return (row - view.rows.start) * view.cols.length + col_offset;
      }
    }
    return -1;
  }

  /** End the frame; a failed paint also removes the entries it placed. */
  private finish_frame(failures: FirstFailure): void {
    const paint_failed = failures.hasFailed;
    failures.run(() => this.end_frame(paint_failed));
    this.clear_frame_sources();
    failures.rethrow();
  }

  private clear_frame_sources(): void {
    this.frame_view = null;
    this.frame_panes = null;
    this.frame_anchor_views = EMPTY_WINDOW_VIEWS;
  }

  private create_entry(
    key: string,
    renderer_name: string,
    renderer: CellRenderer,
    context: CellPaintContext,
    source_style: CellStyle,
    row: number,
    col: number,
    sheet: string,
  ): DomEntry {
    const node = renderer.dom!(context);
    if (!(node instanceof HTMLElement)) {
      throw new SheetwriteError(
        "invalid-argument",
        "render",
        "Sheetwrite: CellRenderer.dom() must return an HTMLElement",
      );
    }
    this.claim_renderer_node(node);

    const clip = document.createElement("div");
    clip.className = "sheetwrite-dom-cell";
    clip.dataset.sheet = sheet;
    clip.dataset.row = String(row);
    clip.dataset.col = String(col);
    clip.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
    const bounds = document.createElement("div");
    bounds.className = "sheetwrite-dom-cell-bounds";
    bounds.style.cssText = "position:absolute;pointer-events:none;";
    const entry: DomEntry = {
      key,
      rendererName: renderer_name,
      sheet,
      row,
      col,
      renderer,
      clip,
      bounds,
      context,
      node,
      sourceStyle: source_style,
      frame: this.frame,
    };

    try {
      bounds.appendChild(node);
      clip.appendChild(bounds);
      this.element.appendChild(clip);
      this.sync_semantics(entry);
      return entry;
    } catch (error) {
      try {
        this.remove_entry(entry, false);
      } catch {
        // Preserve the creation failure after completing structural cleanup.
      }
      throw error;
    }
  }

  private update_entry(
    entry: DomEntry,
    value: CellScalar,
    x: number,
    y: number,
    w: number,
    h: number,
    theme: Theme,
    style: CellStyle,
    source_style: CellStyle,
  ): void {
    const context = entry.context;
    const needs_legacy_refresh =
      context.value !== value ||
      context.w !== w ||
      context.h !== h ||
      context.theme !== theme ||
      context.style !== style;
    context.value = value;
    context.x = x;
    context.y = y;
    context.w = w;
    context.h = h;
    context.theme = theme;
    context.style = style;
    entry.sourceStyle = source_style;

    if (entry.renderer.update) {
      entry.renderer.update(entry.node, context);
      this.sync_semantics(entry);
    } else if (needs_legacy_refresh) {
      const next = entry.renderer.dom!(context);
      if (!(next instanceof HTMLElement)) {
        throw new SheetwriteError(
          "invalid-argument",
          "render",
          "Sheetwrite: CellRenderer.dom() must return an HTMLElement",
        );
      }
      this.claim_renderer_node(next);
      const previous = entry.node;
      const had_focus = previous.contains(document.activeElement);
      const failures = new FirstFailure();
      failures.run(() => entry.renderer.destroy?.(previous));
      this.owned_nodes.delete(previous);
      entry.bounds.replaceChildren(next);
      entry.node = next;
      if (had_focus) failures.run(() => this.focus_host());
      failures.rethrow();
      this.sync_semantics(entry);
    }
    // A legacy renderer whose node was not rebuilt keeps the semantics the last
    // rebuild or creation installed: only the position moved.
  }

  private position_entry(
    entry: DomEntry,
    x: number,
    y: number,
    w: number,
    h: number,
    pane: { x: number; y: number; w: number; h: number },
    theme: Theme,
  ): void {
    const left = Math.max(0, theme.rowHeaderWidth, pane.x, x);
    const top = Math.max(0, theme.headerHeight, pane.y, y);
    const right = Math.min(pane.x + pane.w, x + w);
    const bottom = Math.min(pane.y + pane.h, y + h);
    if (right <= left || bottom <= top) {
      entry.clip.style.display = "none";
      return;
    }

    const clip_style = entry.clip.style;
    clip_style.display = "block";
    clip_style.left = `${left}px`;
    clip_style.top = `${top}px`;
    clip_style.width = `${right - left}px`;
    clip_style.height = `${bottom - top}px`;
    const bounds_style = entry.bounds.style;
    bounds_style.left = `${x - left}px`;
    bounds_style.top = `${y - top}px`;
    bounds_style.width = `${w}px`;
    bounds_style.height = `${h}px`;
  }

  private sync_semantics(entry: DomEntry): void {
    const accessible =
      entry.node.matches(ACCESSIBLE_SELECTOR) || entry.node.querySelector(ACCESSIBLE_SELECTOR);
    if (accessible) entry.clip.removeAttribute("aria-hidden");
    else entry.clip.setAttribute("aria-hidden", "true");

    const interactive =
      entry.node.matches(INTERACTIVE_SELECTOR) ||
      entry.node.querySelector(INTERACTIVE_SELECTOR) !== null;
    entry.clip.dataset.interactive = interactive ? "true" : "false";
    entry.clip.style.pointerEvents = interactive ? "auto" : "none";
  }

  private remove_entry(entry: DomEntry, restore_focus: boolean): void {
    const had_focus = entry.node.contains(document.activeElement);
    const failures = new FirstFailure();
    failures.run(() => entry.renderer.destroy?.(entry.node));
    this.owned_nodes.delete(entry.node);
    entry.node.remove();
    entry.clip.remove();
    this.entries.delete(entry.key);
    if (restore_focus && had_focus) failures.run(() => this.focus_host());
    failures.rethrow();
  }

  private remove_all_entries(restore_focus: boolean): void {
    const failures = new FirstFailure();
    for (const entry of this.entries.values()) {
      failures.run(() => this.remove_entry(entry, restore_focus));
    }
    failures.rethrow();
  }

  private claim_renderer_node(node: HTMLElement): void {
    if (this.owned_nodes.has(node)) {
      throw new SheetwriteError(
        "invalid-argument",
        "render",
        "Sheetwrite: CellRenderer.dom() must return a unique HTMLElement for each cell",
      );
    }
    if (node.parentNode !== null || node.isConnected) {
      throw new SheetwriteError(
        "invalid-argument",
        "render",
        "Sheetwrite: CellRenderer.dom() must return a fresh detached HTMLElement",
      );
    }
    this.owned_nodes.add(node);
  }

  private focus_host(): void {
    this.host.focus({ preventScroll: true });
  }

  private renderer_id(renderer: CellRenderer): number {
    let id = this.renderer_ids.get(renderer);
    if (id === undefined) {
      id = this.next_renderer_id++;
      this.renderer_ids.set(renderer, id);
    }
    return id;
  }

  private readonly on_key_down = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>(".sheetwrite-dom-cell");
    if (cell?.dataset.interactive === "true") event.stopPropagation();
  };
}
