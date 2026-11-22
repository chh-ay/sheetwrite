import { filterButtonRect, intersectingMerges, prepareMergeIndex } from "./canvas-paint.js";
import { contrastRatio, relativeLuminance } from "./color-contrast.js";
import type { EditRect } from "./editor.js";
import type { FillTip } from "./fill-controller.js";
import { iconNode } from "./icons/resolve.js";
import type { SearchMatchSet } from "./search-controller.js";
import type { SelectionModel, SelRect } from "./selection.js";
import { checkStylePart } from "./style-parts.js";
import type { HighlightRange, PresenceOverlay, Range, SheetId } from "./types/coordinates.js";
import type { AutoFilter, CellNote, DataValidationRule, Sheet } from "./types/document.js";
import type { IconOverrides } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { hasInputMessage, hasListDropdown } from "./validation-rule.js";

const PRESENCE_LABEL_HEIGHT = 18;
const PRESENCE_LABEL_MAX_WIDTH = 160;
const PRESENCE_LABEL_MAX_CHARS = 80;
const PRESENCE_MARKER_SIZE = 8;
const NOTE_INDICATOR_SIZE = 8;
const NOTE_INDICATOR_COLOR = "#f59e0b";

/** Gap between a selected cell and its validation input message. */
const INPUT_MESSAGE_GAP = 4;

/** Edge of the dropdown arrow beside a selected list cell, in CSS pixels at zoom 1. */
const LIST_BUTTON_SIZE = 18;

/**
 * Where the dropdown arrow of a selected list cell sits at `zoom`: a square
 * just right of the cell, on its bottom edge, as in Excel. It scales with the
 * zoom, as the cell does. `cell` and the result share a coordinate space.
 */
export function listButtonRect(
  cell: { x: number; y: number; w: number; h: number },
  zoom: number,
): { x: number; y: number; w: number; h: number } {
  const size = Math.max(0, Math.min(LIST_BUTTON_SIZE * zoom, cell.h));
  return { x: cell.x + cell.w, y: cell.y + cell.h - size, w: size, h: size };
}

const EMPTY_VIEW_ROWS = new Int32Array(0);
const EMPTY_VIEW_ITEMS = new Uint32Array(0);

/** Sort the accepted prefix of `items` by `rows`, keeping equal rows in item order. */
function sort_by_view_row(rows: Int32Array, items: Uint32Array, length: number): void {
  const order = new Uint32Array(length);
  for (let position = 0; position < length; position++) order[position] = position;
  order.sort((left, right) => (rows[left] ?? 0) - (rows[right] ?? 0) || left - right);

  const rows_in_order = new Int32Array(length);
  const items_in_order = new Uint32Array(length);
  for (let position = 0; position < length; position++) {
    const source = order[position] ?? 0;
    rows_in_order[position] = rows[source] ?? 0;
    items_in_order[position] = items[source] ?? 0;
  }
  rows.set(rows_in_order);
  items.set(items_in_order);
}

/**
 * Ascending view-row index over a list of items (search matches, notes). A
 * repaint only needs the rows inside the painted band, so it binary-searches
 * this index instead of mapping every item on each frame. Items whose data row
 * the current view filters out are dropped, exactly as the inline mapping did.
 */
class ViewRowIndex {
  private rows = EMPTY_VIEW_ROWS;
  private items = EMPTY_VIEW_ITEMS;
  private length = 0;
  private is_view_row_ordered = true;

  get count(): number {
    return this.length;
  }

  /** True when the accepted items were already in ascending view-row order. */
  get isOrdered(): boolean {
    return this.is_view_row_ordered;
  }

  rowAt(position: number): number {
    return this.rows[position] ?? 0;
  }

  itemAt(position: number): number {
    return this.items[position] ?? 0;
  }

  /** Rebuild from a search match set; `toViewRow` maps rows to the current view. */
  buildFromMatches(matches: SearchMatchSet, toViewRow: (dataRow: number) => number | null): void {
    if (this.rows.length < matches.length) {
      this.rows = new Int32Array(matches.length);
      this.items = new Uint32Array(matches.length);
    }
    const rows = this.rows;
    const items = this.items;
    let accepted = 0;
    let is_ordered = true;
    for (let item = 0; item < matches.length; item++) {
      const view_row = toViewRow(matches.rowAt(item));
      if (view_row === null) continue;
      if (accepted > 0 && view_row < (rows[accepted - 1] ?? 0)) is_ordered = false;
      rows[accepted] = view_row;
      items[accepted] = item;
      accepted += 1;
    }
    this.commit(accepted, is_ordered);
  }

  /** Rebuild from a sheet's notes; `toViewRow` maps rows to the current view. */
  buildFromNotes(notes: readonly CellNote[], toViewRow: (dataRow: number) => number | null): void {
    if (this.rows.length < notes.length) {
      this.rows = new Int32Array(notes.length);
      this.items = new Uint32Array(notes.length);
    }
    const rows = this.rows;
    const items = this.items;
    let accepted = 0;
    let is_ordered = true;
    for (let item = 0; item < notes.length; item++) {
      const note = notes[item];
      const view_row = note ? toViewRow(note.addr.row) : null;
      if (view_row === null) continue;
      if (accepted > 0 && view_row < (rows[accepted - 1] ?? 0)) is_ordered = false;
      rows[accepted] = view_row;
      items[accepted] = item;
      accepted += 1;
    }
    this.commit(accepted, is_ordered);
  }

  /** Accept the filled prefix, sorting it when the source was out of order. */
  private commit(accepted: number, is_ordered: boolean): void {
    if (!is_ordered) sort_by_view_row(this.rows, this.items, accepted);
    this.length = accepted;
    this.is_view_row_ordered = is_ordered;
    if (accepted === 0 && this.rows.length > 0) {
      this.rows = EMPTY_VIEW_ROWS;
      this.items = EMPTY_VIEW_ITEMS;
    }
  }

  /** First position whose view row is not below `viewRow`. */
  lowerBoundRow(viewRow: number): number {
    const rows = this.rows;
    let low = 0;
    let high = this.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((rows[mid] ?? 0) < viewRow) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  /** First position whose content offset reaches `contentOffset` (offsets ascend). */
  lowerBoundOffset(contentOffset: number, offsetOf: (viewRow: number) => number): number {
    const rows = this.rows;
    let low = 0;
    let high = this.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsetOf(rows[mid] ?? 0) < contentOffset) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  /**
   * First position whose row can still be visible at `contentOffset`: the
   * first item of the row that starts before the offset (that row may be
   * partly visible), so every item on it is kept, not only the last one.
   */
  bandStart(contentOffset: number, offsetOf: (viewRow: number) => number): number {
    const reached = this.lowerBoundOffset(contentOffset, offsetOf);
    return reached === 0 ? 0 : this.lowerBoundRow(this.rowAt(reached - 1));
  }
}

interface PresenceColor {
  readonly css: string;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

interface NormalizedPresenceOverlay {
  readonly actorId: string;
  readonly activeSheet: SheetId;
  readonly ranges: PresenceOverlay["ranges"];
  readonly identity: string;
  readonly label: string;
  readonly color: PresenceColor;
  readonly tint: string;
  readonly border: string;
  readonly foreground: "#000000" | "#ffffff";
}

function presence_color(value: string, resolver?: CanvasRenderingContext2D | null): PresenceColor {
  const input = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(input);
  if (hex) {
    const digits = hex[1]!;
    const expanded =
      digits.length === 3
        ? `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
        : digits;
    return {
      css: `#${expanded}`,
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(input);
  if (rgb) {
    const red = Math.min(255, Number(rgb[1]));
    const green = Math.min(255, Number(rgb[2]));
    const blue = Math.min(255, Number(rgb[3]));
    return { css: `rgb(${red}, ${green}, ${blue})`, red, green, blue };
  }

  if (resolver && input) {
    const sentinel = "#010203";
    resolver.fillStyle = sentinel;
    resolver.fillStyle = input;
    const resolved = String(resolver.fillStyle);
    if (resolved !== sentinel || input.toLowerCase() === sentinel) {
      const parsed = presence_color(resolved);
      return { ...parsed, css: input };
    }
  }

  return { css: input || "#475569", red: 71, green: 85, blue: 105 };
}

function readable_presence_foreground(color: PresenceColor): "#000000" | "#ffffff" {
  const luminance = relativeLuminance({ ...color, alpha: 1 });
  return contrastRatio(luminance, 0) >= contrastRatio(luminance, 1) ? "#000000" : "#ffffff";
}

export interface OverlayPainterDeps {
  theme: () => Theme;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  selection: () => SelectionModel;
  rowOffsetOf: (row: number) => number;
  colLeftOf: (col: number) => number;
  screenRect: (row: number, col: number, contentTop: number, scrollLeft: number) => EditRect;
  toViewRow: (dataRow: number) => number | null;
  isEditing: () => boolean;
  fillTarget: () => SelRect | null;
  fillHandleScreen: (contentTop: number, scrollLeft: number) => { x: number; y: number } | null;
  /** The value tip beside the fill handle while it is dragged. */
  fillTip: () => FillTip | null;
  /** The new cells of the dragged fill handle's fill, which show their values in place. */
  fillValuesArea: () => SelRect | null;
  /** What a cell of `fillValuesArea` will show; null for a formula. */
  fillValueAt: (row: number, col: number) => { text: string; right: boolean } | null;
  /** The view row at a content offset, to start the painted rows at the first one on screen. */
  rowAtOffset: (contentY: number) => number;
  /** The cells of the last fill, whose Auto Fill Options button shows at their bottom-right. */
  autoFillTarget: () => SelRect | null;
  /** Open Auto Fill Options at a viewport point, below its button. */
  openAutoFillOptions: (clientX: number, clientY: number) => void;
  /** The host's icon overrides. */
  icons: () => IconOverrides | undefined;
  searchMatches: () => SearchMatchSet;
  searchActive: () => number;
  searchVersion: () => number;
  /**
   * Bumped whenever cell geometry moves under the overlay (column widths, row
   * heights, structural row/col edits). Without it a resize leaves selection,
   * search, and highlight rects at stale positions over the repainted canvas.
   */
  geometryVersion: () => number;
  /**
   * Frozen-pane geometry for freeze-aware rect mapping: `fr` pinned view rows
   * of total height `frozenH`; columns before `firstBodyCol` are pinned within
   * `frozenW`. All zeros when nothing is frozen.
   */
  freeze: () => { fr: number; frozenH: number; frozenW: number; firstBodyCol: number };
  /** Content zoom factor (column base widths scale by it). */
  zoom: () => number;
  /** The validation rule over the cell at view `row`, `col`, if any. */
  validationRuleAt: (row: number, col: number) => DataValidationRule | undefined;
  scheduleRender: () => void;
}

/** Where the four dash strips of a cut mark start, and where one step of their run ends. */
const CUT_DASHES_FROM = "0 0, 0 100%, 0 0, 100% 0";
const CUT_DASHES_TO = "8px 0, -8px 100%, 0 -8px, 100% 8px";

/** Stop the dashes of a pooled div that marked a cut, so it can serve another rect. */
function end_cut_dashes(el: HTMLDivElement): void {
  el.removeAttribute("data-sheetwrite-cut");
  for (const animation of el.getAnimations?.() ?? []) animation.cancel();
}

/**
 * Owns Layer 2 DOM: selection rectangles, fill affordances, search matches, and
 * manual cell highlights painted over the renderer output.
 */
export class OverlayPainter {
  private readonly overlay: HTMLDivElement;
  private readonly deps: OverlayPainterDeps;
  private manual_highlights: { ranges: readonly HighlightRange[]; color: string } | null = null;
  private presence_overlays: readonly NormalizedPresenceOverlay[] = [];
  /** The cells of a cut that waits for a paste, in data rows. */
  private cut_mark: Range | null = null;
  /** The cells an undo or redo changed, in data rows, shown for a moment. */
  private flash: readonly Range[] = [];

  // Reusable rect divs. `cursor` resets to 0 at the top of every paint pass;
  // `acquire_rect` hands out `pool[cursor++]`, creating and appending a fresh
  // div only when the pool runs short. Surplus divs are hidden with
  // `display:none`, never removed, so subsequent passes can reclaim them.
  private readonly pool: HTMLDivElement[] = [];
  private cursor = 0;
  private readonly presence_label_pool: HTMLDivElement[] = [];
  private readonly presence_label_bounds = new Float64Array(32 * 8 * 4);
  private presence_label_cursor = 0;
  private presence_label_bounds_count = 0;
  private presence_color_context: CanvasRenderingContext2D | null | undefined;
  /** The active cell's validation input message; built when one first shows. */
  private input_message: HTMLDivElement | null = null;

  // Threaded into the `forEachRect` selection callback, which cannot take args.
  private paint_content_top = 0;
  private paint_scroll_left = 0;
  private paint_client_w = 0;
  private paint_client_h = 0;
  private paint_theme: Theme | null = null;
  private paint_sheet: Sheet | null = null;

  private highlight_version = 0;
  private presence_version = 0;
  private cut_version = 0;
  private flash_version = 0;

  // Repaints look up only the rows in the painted band. Each index rebuilds
  // when its items or the view order change, never on scroll.
  private readonly match_index = new ViewRowIndex();
  private match_index_set: SearchMatchSet | null = null;
  private match_index_sheet: SheetId | null = null;
  private match_index_version = -1;
  private match_index_geometry = -1;
  /** Match indices of the painted band, kept in match order. */
  private readonly match_paint_order: number[] = [];
  private readonly note_index = new ViewRowIndex();
  private note_index_notes: readonly CellNote[] | null = null;
  private note_index_geometry = -1;
  /** Note indices of the painted band, kept in note order. */
  private readonly note_paint_order: number[] = [];

  // `paint` skips when every field below is unchanged and the theme identity
  // still matches.
  private last_paint_theme: Theme | null = null;
  private last_content_top = 0;
  private last_scroll_left = 0;
  private last_client_w = 0;
  private last_client_h = 0;
  private last_active_sheet: SheetId = "";
  private last_sel_version = -1;
  private last_highlight_version = -1;
  private last_presence_version = -1;
  private last_cut_version = -1;
  private last_flash_version = -1;
  private last_search_version = -1;
  private last_geometry_version = -1;
  private last_paint_notes: readonly CellNote[] | undefined;
  private last_auto_filter: AutoFilter | undefined;
  private last_validation_rules: Sheet["validationRules"];
  private last_filters: Sheet["filters"];
  private last_search_active = -1;
  private last_editing = false;
  private last_fill_present = false;
  private last_fill_r0 = 0;
  private last_fill_c0 = 0;
  private last_fill_r1 = 0;
  private last_fill_c1 = 0;
  private last_fill_tip: FillTip | null = null;
  private last_auto_fill_target: SelRect | null = null;
  /** Excel's tip beside the dragged fill handle; made on the first drag. */
  private tip_element: HTMLDivElement | null = null;
  /** The Auto Fill Options button; made after the first fill. */
  private auto_fill_button: HTMLButtonElement | null = null;
  /** The values a dragged fill will write, drawn faintly in their cells; made on the first drag. */
  private fill_values: HTMLCanvasElement | null = null;

  constructor(parent: HTMLElement, deps: OverlayPainterDeps) {
    this.deps = deps;

    const overlay = document.createElement("div");
    overlay.className = "sheetwrite-overlay";
    overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    parent.appendChild(overlay);
    this.overlay = overlay;
  }

  get element(): HTMLDivElement {
    return this.overlay;
  }

  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void {
    this.manual_highlights =
      ranges && ranges.length > 0 ? { ranges, color: color ?? this.deps.theme().highlight } : null;
    this.highlight_version += 1;
    this.deps.scheduleRender();
  }

  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void {
    if (!overlays) {
      this.presence_overlays = [];
    } else {
      const count = Math.min(overlays.length, 32);
      const normalized = new Array<NormalizedPresenceOverlay>(count);
      const color_resolver = this.get_presence_color_context();
      for (let index = 0; index < count; index++) {
        const overlay = overlays[index]!;
        const identity = overlay.displayName?.trim() || overlay.actorId;
        const color = presence_color(overlay.color, color_resolver);
        normalized[index] = {
          actorId: overlay.actorId,
          activeSheet: overlay.activeSheet,
          ranges: overlay.ranges,
          identity,
          label: identity.slice(0, PRESENCE_LABEL_MAX_CHARS),
          color,
          foreground: readable_presence_foreground(color),
          tint: `color-mix(in srgb, ${color.css} 12%, transparent)`,
          border: `color-mix(in srgb, ${color.css} 72%, #000000 28%)`,
        };
      }
      this.presence_overlays = normalized;
    }
    this.presence_version += 1;
    this.deps.scheduleRender();
  }

  /** Mark the cells of a cut with a moving dashed border, as Excel does, or remove the mark. */
  setCutMark(range: Range | null): void {
    this.cut_mark = range;
    this.cut_version += 1;
    this.deps.scheduleRender();
  }

  /** Tint the cells an undo or redo changed, so the user sees them; `[]` removes the tint. */
  setFlash(ranges: readonly Range[]): void {
    this.flash = ranges;
    this.flash_version += 1;
    this.deps.scheduleRender();
  }

  private get_presence_color_context(): CanvasRenderingContext2D | null {
    if (this.presence_color_context !== undefined) return this.presence_color_context;
    this.presence_color_context = document.createElement("canvas").getContext("2d");
    return this.presence_color_context;
  }

  paint(contentTop: number, scrollLeft: number, clientW: number, clientH: number): void {
    const theme = this.deps.theme();
    if (this.same_paint_state(contentTop, scrollLeft, clientW, clientH, theme)) return;

    const sheet = this.deps.sheet();
    this.cursor = 0;
    this.presence_label_cursor = 0;
    this.presence_label_bounds_count = 0;
    this.paint_highlights(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paint_flash(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paint_presence(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paint_notes(theme, sheet, contentTop, scrollLeft, clientW, clientH);

    const selection = this.deps.selection();
    if (!selection.isEmpty) {
      this.paint_content_top = contentTop;
      this.paint_scroll_left = scrollLeft;
      this.paint_client_w = clientW;
      this.paint_client_h = clientH;
      this.paint_theme = theme;
      this.paint_sheet = sheet;
      selection.forEachRect(this.append_selection_rect);
      this.paint_theme = null;
      this.paint_sheet = null;

      this.paint_focus(theme, contentTop, scrollLeft, clientW, clientH);
      this.paint_fill_preview(theme, sheet, contentTop, scrollLeft);
      this.paint_fill_handle(theme, contentTop, scrollLeft);
    }

    this.paint_fill_values(theme, contentTop, scrollLeft, clientW, clientH);
    this.paint_fill_tip();
    this.paint_auto_fill_button(theme, contentTop, scrollLeft, clientW, clientH);
    // As in Excel, the moving border of a cut shows over the selection.
    this.paint_cut_mark(theme, sheet, contentTop, scrollLeft, clientW, clientH);
    this.paint_filter_buttons(sheet, contentTop, scrollLeft, clientW, clientH);
    this.paint_validation(theme, contentTop, scrollLeft, clientW, clientH);
    this.hide_surplus();
    this.hide_surplus_presence_labels();
  }

  /**
   * Remove the hidden pool divs past the last pass and the color-parsing
   * context. The divs that the last pass shows stay, so the overlay does not
   * change; a later busier pass creates divs again.
   */
  trimMemory(): void {
    for (let index = this.cursor; index < this.pool.length; index++) this.pool[index]?.remove();
    this.pool.length = this.cursor;

    for (let index = this.presence_label_cursor; index < this.presence_label_pool.length; index++) {
      this.presence_label_pool[index]?.remove();
    }
    this.presence_label_pool.length = this.presence_label_cursor;
    this.presence_color_context = undefined;
  }

  destroy(): void {
    this.overlay.remove();
  }

  /**
   * True when the current paint inputs match the previous pass exactly. Reads
   * each dependency once and compares against cached fields; caches are updated
   * (and `false` returned) only when something differs, matching the old
   * signature-plus-theme-identity skip.
   */
  private same_paint_state(
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
    theme: Theme,
  ): boolean {
    const selection = this.deps.selection();
    const fill = this.deps.fillTarget();
    const active_sheet = this.deps.activeSheet();
    const sel_version = selection.version;
    const search_version = this.deps.searchVersion();
    const geometry_version = this.deps.geometryVersion();
    const sheet = this.deps.sheet();
    const notes = sheet.notes;
    const auto_filter = sheet.autoFilter;
    const filters = sheet.filters;
    const validation_rules = sheet.validationRules;
    const search_active = this.deps.searchActive();
    const editing = this.deps.isEditing();
    const fill_present = fill !== null;
    const fill_r0 = fill ? fill.r0 : 0;
    const fill_c0 = fill ? fill.c0 : 0;
    const fill_r1 = fill ? fill.r1 : 0;
    const fill_c1 = fill ? fill.c1 : 0;
    const fill_tip = this.deps.fillTip();
    const auto_fill_target = this.deps.autoFillTarget();

    if (
      theme === this.last_paint_theme &&
      content_top === this.last_content_top &&
      scroll_left === this.last_scroll_left &&
      client_w === this.last_client_w &&
      client_h === this.last_client_h &&
      active_sheet === this.last_active_sheet &&
      sel_version === this.last_sel_version &&
      this.highlight_version === this.last_highlight_version &&
      this.presence_version === this.last_presence_version &&
      this.cut_version === this.last_cut_version &&
      this.flash_version === this.last_flash_version &&
      search_version === this.last_search_version &&
      geometry_version === this.last_geometry_version &&
      notes === this.last_paint_notes &&
      auto_filter === this.last_auto_filter &&
      validation_rules === this.last_validation_rules &&
      filters === this.last_filters &&
      search_active === this.last_search_active &&
      editing === this.last_editing &&
      fill_present === this.last_fill_present &&
      fill_r0 === this.last_fill_r0 &&
      fill_c0 === this.last_fill_c0 &&
      fill_r1 === this.last_fill_r1 &&
      fill_c1 === this.last_fill_c1 &&
      fill_tip === this.last_fill_tip &&
      auto_fill_target === this.last_auto_fill_target
    ) {
      return true;
    }

    this.last_paint_theme = theme;
    this.last_content_top = content_top;
    this.last_scroll_left = scroll_left;
    this.last_client_w = client_w;
    this.last_client_h = client_h;
    this.last_active_sheet = active_sheet;
    this.last_sel_version = sel_version;
    this.last_highlight_version = this.highlight_version;
    this.last_presence_version = this.presence_version;
    this.last_cut_version = this.cut_version;
    this.last_flash_version = this.flash_version;
    this.last_search_version = search_version;
    this.last_geometry_version = geometry_version;
    this.last_paint_notes = notes;
    this.last_auto_filter = auto_filter;
    this.last_validation_rules = validation_rules;
    this.last_filters = filters;
    this.last_search_active = search_active;
    this.last_editing = editing;
    this.last_fill_present = fill_present;
    this.last_fill_r0 = fill_r0;
    this.last_fill_c0 = fill_c0;
    this.last_fill_r1 = fill_r1;
    this.last_fill_c1 = fill_c1;
    this.last_fill_tip = fill_tip;
    this.last_auto_fill_target = auto_fill_target;
    return false;
  }

  private paint_highlights(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const active_sheet = this.deps.activeSheet();

    const manual_highlights = this.manual_highlights;
    if (manual_highlights) {
      for (const range of manual_highlights.ranges) {
        if (range.sheet !== active_sheet) continue;
        this.append_range(
          Math.min(range.start.row, range.end.row),
          Math.min(range.start.col, range.end.col),
          Math.max(range.start.row, range.end.row),
          Math.max(range.start.col, range.end.col),
          range.color ?? manual_highlights.color,
          "transparent",
          theme,
          sheet,
          content_top,
          scroll_left,
          client_w,
          client_h,
        );
      }
    }

    const search_matches = this.deps.searchMatches();
    if (search_matches.sheet !== active_sheet) return;
    this.ensure_match_index(search_matches, active_sheet);
    this.paint_search_matches(
      search_matches,
      theme,
      sheet,
      content_top,
      scroll_left,
      client_w,
      client_h,
    );
  }

  /**
   * Rebuild the match row index when the match set or the view order changed.
   * The mapping is one `toViewRow` per match, the same work a single repaint
   * used to do, but it now runs only on search, sort, filter and geometry
   * changes instead of on every scroll step.
   */
  private ensure_match_index(matches: SearchMatchSet, sheet: SheetId): void {
    const search_version = this.deps.searchVersion();
    const geometry_version = this.deps.geometryVersion();
    if (
      this.match_index_set === matches &&
      this.match_index_sheet === sheet &&
      this.match_index_version === search_version &&
      this.match_index_geometry === geometry_version
    ) {
      return;
    }
    this.match_index.buildFromMatches(matches, this.deps.toViewRow);
    this.match_index_set = matches;
    this.match_index_sheet = sheet;
    this.match_index_version = search_version;
    this.match_index_geometry = geometry_version;
  }

  /**
   * Append the match rects the painted band covers: every match in a frozen row
   * plus the body rows between the freeze boundary and the viewport bottom. The
   * band lookup is two binary searches, and the rects keep match order so a
   * sorted view paints the same DOM order a full scan produced.
   */
  private paint_search_matches(
    matches: SearchMatchSet,
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const index = this.match_index;
    if (index.count === 0) return;

    const active = this.deps.searchActive();
    const { fr, frozenH: frozen_h } = this.deps.freeze();
    const offset_of = this.deps.rowOffsetOf;
    const frozen_end = fr > 0 ? index.lowerBoundRow(fr) : 0;
    const body_start = Math.max(frozen_end, index.bandStart(content_top + frozen_h, offset_of));
    const body_end = index.lowerBoundOffset(content_top + client_h - theme.headerHeight, offset_of);

    if (index.isOrdered) {
      for (let position = 0; position < frozen_end; position++) {
        this.append_search_match(
          matches,
          position,
          active,
          theme,
          sheet,
          content_top,
          scroll_left,
          client_w,
          client_h,
        );
      }
      for (let position = body_start; position < body_end; position++) {
        this.append_search_match(
          matches,
          position,
          active,
          theme,
          sheet,
          content_top,
          scroll_left,
          client_w,
          client_h,
        );
      }
      return;
    }

    const order = this.match_paint_order;
    order.length = 0;
    for (let position = 0; position < frozen_end; position++) order.push(position);
    for (let position = body_start; position < body_end; position++) order.push(position);
    order.sort((left, right) => index.itemAt(left) - index.itemAt(right));
    for (const position of order) {
      this.append_search_match(
        matches,
        position,
        active,
        theme,
        sheet,
        content_top,
        scroll_left,
        client_w,
        client_h,
      );
    }
  }

  private append_search_match(
    matches: SearchMatchSet,
    position: number,
    active: number,
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const view_row = this.match_index.rowAt(position);
    const match_index = this.match_index.itemAt(position);
    const col = matches.colAt(match_index);
    const border = match_index === active ? theme.searchActiveMatch : "transparent";
    this.append_range(
      view_row,
      col,
      view_row,
      col,
      theme.searchMatch,
      border,
      theme,
      sheet,
      content_top,
      scroll_left,
      client_w,
      client_h,
    );
  }

  private append_range(
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    fill: string,
    border: string,
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    this.append_clamped_range(
      r0,
      c0,
      r1,
      c1,
      fill,
      border,
      theme,
      sheet,
      content_top,
      scroll_left,
      client_w,
      client_h,
    );
  }

  /**
   * Map a cell range to screen rects, splitting at the freeze boundaries: a
   * range spanning pinned and scrolling zones becomes up to four pieces, each
   * positioned with its zone's scroll offsets and clamped to its zone so
   * scrolled body content never bleeds into a pinned band.
   */
  private append_clamped_range(
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    fill: string,
    border: string,
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const {
      fr,
      frozenH: frozen_h,
      frozenW: frozen_w,
      firstBodyCol: first_body_col,
    } = this.deps.freeze();
    const g = theme.rowHeaderWidth;
    const hh = theme.headerHeight;

    const row_segs: Array<{ r0: number; r1: number; frozen: boolean }> = [];
    if (fr > 0 && r0 < fr) row_segs.push({ r0, r1: Math.min(r1, fr - 1), frozen: true });
    if (r1 >= fr) row_segs.push({ r0: Math.max(r0, fr), r1, frozen: false });

    const has_frozen_cols = frozen_w > 0;
    const col_segs: Array<{ c0: number; c1: number; frozen: boolean }> = [];
    if (has_frozen_cols && c0 < first_body_col) {
      col_segs.push({ c0, c1: Math.min(c1, first_body_col - 1), frozen: true });
    }
    if (!has_frozen_cols || c1 >= first_body_col) {
      col_segs.push({ c0: has_frozen_cols ? Math.max(c0, first_body_col) : c0, c1, frozen: false });
    }

    for (const rs of row_segs) {
      const row_scroll = rs.frozen ? 0 : content_top;
      const top = hh + this.deps.rowOffsetOf(rs.r0) - row_scroll;
      const bottom = hh + this.deps.rowOffsetOf(rs.r1 + 1) - row_scroll;
      // Pinned bands clamp hard on both edges; the body clamps only against
      // the band (the viewport edge is handled by overlay overflow).
      const clip_top = rs.frozen ? hh : hh + frozen_h;
      const clip_bottom = rs.frozen ? hh + frozen_h : Number.POSITIVE_INFINITY;
      const c_top = Math.max(clip_top, top);
      const c_bottom = Math.min(clip_bottom, bottom);
      if (c_bottom <= c_top || top >= client_h) continue;

      for (const cs of col_segs) {
        const col_scroll = cs.frozen ? 0 : scroll_left;
        const left = g + this.deps.colLeftOf(cs.c0) - col_scroll;
        const right = g + this.col_right(cs.c1, sheet) - col_scroll;
        const clip_left = cs.frozen ? g : g + frozen_w;
        const clip_right = cs.frozen ? g + frozen_w : Number.POSITIVE_INFINITY;
        const c_left = Math.max(clip_left, left);
        const c_right = Math.min(clip_right, right);
        if (c_right <= c_left || left >= client_w) continue;

        this.acquire_rect(c_left, c_top, c_right - c_left, c_bottom - c_top, fill, border);
      }
    }
  }

  private paint_presence(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    if (sheet.rowCount <= 0 || sheet.columns.length <= 0) return;
    const active_sheet = this.deps.activeSheet();
    const max_row = sheet.rowCount - 1;
    const max_col = sheet.columns.length - 1;

    for (const presence of this.presence_overlays) {
      if (presence.activeSheet !== active_sheet) continue;
      const range_count = Math.min(presence.ranges.length, 8);
      let label_painted = false;
      for (let range_index = 0; range_index < range_count; range_index++) {
        const range = presence.ranges[range_index]!;
        if (range.sheet !== active_sheet) continue;

        const data_r0 = Math.max(0, Math.min(max_row, Math.min(range.start.row, range.end.row)));
        const data_r1 = Math.max(0, Math.min(max_row, Math.max(range.start.row, range.end.row)));
        const view_r0 = this.deps.toViewRow(data_r0);
        const view_r1 = this.deps.toViewRow(data_r1);
        if (view_r0 === null || view_r1 === null) continue;
        const c0 = Math.max(0, Math.min(max_col, Math.min(range.start.col, range.end.col)));
        const c1 = Math.max(0, Math.min(max_col, Math.max(range.start.col, range.end.col)));

        const before = this.cursor;
        this.append_clamped_range(
          Math.min(view_r0, view_r1),
          c0,
          Math.max(view_r0, view_r1),
          c1,
          presence.tint,
          presence.color.css,
          theme,
          sheet,
          content_top,
          scroll_left,
          client_w,
          client_h,
        );

        for (let index = before; index < this.cursor; index++) {
          const rect = this.pool[index]!;
          rect.dataset.sheetwritePresence = presence.actorId;
          rect.dataset.sheetwritePresenceRange = "";
          rect.setAttribute("aria-hidden", "true");
          rect.style.outlineWidth = "2px";
        }

        const first_visible_segment = this.pool[before];
        if (!label_painted && first_visible_segment) {
          label_painted = this.paint_presence_label(
            presence,
            first_visible_segment,
            theme,
            client_w,
            client_h,
          );
        }
      }
    }
  }

  private paint_presence_label(
    presence: NormalizedPresenceOverlay,
    segment: HTMLDivElement,
    theme: Theme,
    client_w: number,
    client_h: number,
  ): boolean {
    const segment_left = Number.parseFloat(segment.style.left);
    const segment_top = Number.parseFloat(segment.style.top);
    const segment_width = Number.parseFloat(segment.style.width);
    const min_left = theme.rowHeaderWidth;
    const min_top = theme.headerHeight;
    const available_width = Math.max(0, client_w - min_left);
    const label_width = Math.min(
      PRESENCE_LABEL_MAX_WIDTH,
      available_width,
      Math.max(28, Math.ceil(presence.label.length * 6.6) + 14),
    );
    const max_label_left = Math.max(min_left, client_w - label_width);
    const preferred_left = Math.min(Math.max(segment_left, min_left), max_label_left);
    const label_top = segment_top - PRESENCE_LABEL_HEIGHT - 2;
    if (label_width >= 28 && label_top >= 0 && label_top + PRESENCE_LABEL_HEIGHT <= min_top) {
      if (
        this.reserve_presence_label(preferred_left, label_top, label_width, PRESENCE_LABEL_HEIGHT)
      ) {
        this.acquire_presence_label(
          presence,
          theme,
          "chip",
          preferred_left,
          label_top,
          label_width,
          PRESENCE_LABEL_HEIGHT,
        );
        return true;
      }

      for (let candidate_left = min_left; candidate_left <= max_label_left; candidate_left += 4) {
        if (
          !this.reserve_presence_label(
            candidate_left,
            label_top,
            label_width,
            PRESENCE_LABEL_HEIGHT,
          )
        ) {
          continue;
        }

        this.acquire_presence_label(
          presence,
          theme,
          "chip",
          candidate_left,
          label_top,
          label_width,
          PRESENCE_LABEL_HEIGHT,
        );
        return true;
      }
    }

    const marker_top = Math.min(
      Math.max(segment_top + 1, min_top),
      Math.max(min_top, client_h - PRESENCE_MARKER_SIZE),
    );
    const marker_min_left = Math.min(
      Math.max(segment_left + 2, min_left),
      Math.max(min_left, client_w - PRESENCE_MARKER_SIZE),
    );
    const marker_max_left = Math.min(
      Math.max(segment_left + segment_width - PRESENCE_MARKER_SIZE - 2, marker_min_left),
      Math.max(min_left, client_w - PRESENCE_MARKER_SIZE),
    );
    for (
      let marker_left = marker_max_left;
      marker_left >= marker_min_left;
      marker_left -= PRESENCE_MARKER_SIZE
    ) {
      if (
        !this.reserve_presence_label(
          marker_left,
          marker_top,
          PRESENCE_MARKER_SIZE,
          PRESENCE_MARKER_SIZE,
        )
      ) {
        continue;
      }

      this.acquire_presence_label(
        presence,
        theme,
        "marker",
        marker_left,
        marker_top,
        PRESENCE_MARKER_SIZE,
        PRESENCE_MARKER_SIZE,
      );
      return true;
    }

    if (theme.headerHeight < PRESENCE_MARKER_SIZE) return false;
    const rail_marker_top = Math.max(0, (theme.headerHeight - PRESENCE_MARKER_SIZE) / 2);
    const max_rail_marker_left = Math.max(min_left, client_w - PRESENCE_MARKER_SIZE);
    for (
      let marker_left = min_left;
      marker_left <= max_rail_marker_left;
      marker_left += PRESENCE_MARKER_SIZE
    ) {
      if (
        !this.reserve_presence_label(
          marker_left,
          rail_marker_top,
          PRESENCE_MARKER_SIZE,
          PRESENCE_MARKER_SIZE,
        )
      ) {
        continue;
      }

      this.acquire_presence_label(
        presence,
        theme,
        "marker",
        marker_left,
        rail_marker_top,
        PRESENCE_MARKER_SIZE,
        PRESENCE_MARKER_SIZE,
      );
      return true;
    }

    return false;
  }

  private reserve_presence_label(
    left: number,
    top: number,
    width: number,
    height: number,
  ): boolean {
    const right = left + width;
    const bottom = top + height;
    for (let index = 0; index < this.presence_label_bounds_count; index++) {
      const offset = index * 4;
      if (
        right > this.presence_label_bounds[offset]! &&
        left < this.presence_label_bounds[offset + 2]! &&
        bottom > this.presence_label_bounds[offset + 1]! &&
        top < this.presence_label_bounds[offset + 3]!
      ) {
        return false;
      }
    }
    const offset = this.presence_label_bounds_count * 4;
    this.presence_label_bounds[offset] = left;
    this.presence_label_bounds[offset + 1] = top;
    this.presence_label_bounds[offset + 2] = right;
    this.presence_label_bounds[offset + 3] = bottom;
    this.presence_label_bounds_count += 1;
    return true;
  }

  private acquire_presence_label(
    presence: NormalizedPresenceOverlay,
    theme: Theme,
    kind: "chip" | "marker",
    left: number,
    top: number,
    width: number,
    height: number,
  ): void {
    let label = this.presence_label_pool[this.presence_label_cursor];
    if (!label) {
      label = document.createElement("div");
      label.className = "sheetwrite-presence-label";
      label.setAttribute("role", "img");
      label.style.position = "absolute";
      label.style.pointerEvents = "none";
      label.style.boxSizing = "border-box";
      label.style.zIndex = "3";
      this.presence_label_pool[this.presence_label_cursor] = label;
      this.overlay.appendChild(label);
    } else if (label.style.display === "none") {
      label.style.display = "";
    }
    this.presence_label_cursor += 1;

    label.dataset.sheetwritePresenceLabel = presence.actorId;
    label.dataset.presenceKind = kind;
    label.title = presence.identity;
    label.setAttribute("aria-label", `Remote selection: ${presence.identity}`);
    label.textContent = kind === "chip" ? presence.label : "";
    label.style.left = `${left}px`;
    label.style.top = `${top}px`;
    label.style.width = `${width}px`;
    label.style.height = `${height}px`;
    label.style.background = presence.color.css;
    label.style.border = `1px solid ${presence.border}`;
    label.style.borderRadius = kind === "chip" ? "4px" : "999px";
    label.style.color = presence.foreground;
    label.style.font = `600 11px ${theme.font}`;
    label.style.lineHeight = kind === "chip" ? "16px" : "0";
    label.style.overflow = "hidden";
    label.style.padding = kind === "chip" ? "0 6px" : "0";
    label.style.textOverflow = "ellipsis";
    label.style.whiteSpace = "nowrap";
  }

  /**
   * Note indicators for the rows the viewport reaches. The note index rebuilds
   * when the note list or the view order changes, never on scroll, and the band
   * lookup keeps the indicators in note order.
   */
  private paint_notes(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const notes = sheet.notes;
    if (!notes || notes.length === 0) return;

    const geometry_version = this.deps.geometryVersion();
    if (this.note_index_notes !== notes || this.note_index_geometry !== geometry_version) {
      this.note_index.buildFromNotes(notes, this.deps.toViewRow);
      this.note_index_notes = notes;
      this.note_index_geometry = geometry_version;
    }

    const index = this.note_index;
    if (index.count === 0) return;

    // Notes in pinned rows stay at their pinned position, so they are always in
    // the painted band; body notes are found by their scrolled content offset.
    const { fr } = this.deps.freeze();
    const offset_of = this.deps.rowOffsetOf;
    const frozen_end = fr > 0 ? index.lowerBoundRow(fr) : 0;
    // Indicators draw over the header band, so the upper edge of the searched
    // range sits one header height above the scroll offset.
    const start = Math.max(
      frozen_end,
      index.bandStart(content_top - theme.headerHeight, offset_of),
    );
    const end = index.lowerBoundOffset(content_top + client_h - theme.headerHeight, offset_of);

    if (index.isOrdered) {
      for (let position = 0; position < frozen_end; position++) {
        this.append_note_indicator(notes, position, content_top, scroll_left, client_w, client_h);
      }
      for (let position = start; position < end; position++) {
        this.append_note_indicator(notes, position, content_top, scroll_left, client_w, client_h);
      }
      return;
    }

    const order = this.note_paint_order;
    order.length = 0;
    for (let position = 0; position < frozen_end; position++) order.push(position);
    for (let position = start; position < end; position++) order.push(position);
    order.sort((left, right) => index.itemAt(left) - index.itemAt(right));
    for (const position of order) {
      this.append_note_indicator(notes, position, content_top, scroll_left, client_w, client_h);
    }
  }

  private append_note_indicator(
    notes: readonly CellNote[],
    position: number,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const note = notes[this.note_index.itemAt(position)];
    if (!note) return;
    const rect = this.deps.screenRect(
      this.note_index.rowAt(position),
      note.addr.col,
      content_top,
      scroll_left,
    );
    if (rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= client_w || rect.y >= client_h) {
      return;
    }
    // The marker scales with the zoom, as the cell does.
    const size = Math.min(NOTE_INDICATOR_SIZE * this.deps.zoom(), rect.w, rect.h);
    const indicator = this.acquire_rect(
      rect.x + rect.w - size,
      rect.y,
      size,
      size,
      NOTE_INDICATOR_COLOR,
      "transparent",
    );
    indicator.style.clipPath = "polygon(0 0, 100% 0, 100% 100%)";
  }

  private readonly append_selection_rect = (rect: SelRect): void => {
    const theme = this.paint_theme;
    const sheet = this.paint_sheet;
    if (!theme || !sheet) return;

    let { r0, c0, r1, c1 } = rect;
    const merges = sheet.merges;
    if (merges) {
      const merge_index = prepareMergeIndex(merges);
      let expanded: boolean;
      do {
        expanded = false;
        for (const merge of intersectingMerges(merge_index, r0, r1 + 1, [c0, c1])) {
          if (merge.r1 < r0 || merge.r0 > r1 || merge.c1 < c0 || merge.c0 > c1) continue;
          const next_r0 = Math.min(r0, merge.r0);
          const next_c0 = Math.min(c0, merge.c0);
          const next_r1 = Math.max(r1, merge.r1);
          const next_c1 = Math.max(c1, merge.c1);
          if (next_r0 === r0 && next_c0 === c0 && next_r1 === r1 && next_c1 === c1) continue;
          r0 = next_r0;
          c0 = next_c0;
          r1 = next_r1;
          c1 = next_c1;
          expanded = true;
        }
      } while (expanded);
    }

    this.append_clamped_range(
      r0,
      c0,
      r1,
      c1,
      theme.selection,
      theme.selectionBorder,
      theme,
      sheet,
      this.paint_content_top,
      this.paint_scroll_left,
      this.paint_client_w,
      this.paint_client_h,
    );
  };

  private paint_focus(
    theme: Theme,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const focus = this.deps.selection().focusCell;
    if (!focus || this.deps.isEditing()) return;

    const {
      fr,
      frozenH: frozen_h,
      frozenW: frozen_w,
      firstBodyCol: first_body_col,
    } = this.deps.freeze();
    const r = this.deps.screenRect(focus.row, focus.col, content_top, scroll_left);
    // A body-zone focus cell scrolled under a pinned band is hidden, not
    // clamped onto the band.
    const clamp_top =
      fr > 0 && focus.row >= fr ? theme.headerHeight + frozen_h : theme.headerHeight;
    const clamp_left =
      frozen_w > 0 && focus.col >= first_body_col
        ? theme.rowHeaderWidth + frozen_w
        : theme.rowHeaderWidth;
    if (r.y + r.h <= clamp_top || r.y >= client_h || r.x + r.w <= clamp_left || r.x >= client_w) {
      return;
    }

    const ring = this.acquire_rect(
      Math.max(clamp_left, r.x),
      Math.max(clamp_top, r.y),
      r.w - Math.max(0, clamp_left - r.x),
      r.h - Math.max(0, clamp_top - r.y),
      "transparent",
      theme.selectionBorder,
    );
    ring.style.outlineWidth = "2px";
  }

  private paint_fill_preview(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
  ): void {
    const fill_target = this.deps.fillTarget();
    if (!fill_target) return;

    const before = this.cursor;
    this.append_clamped_range(
      fill_target.r0,
      fill_target.c0,
      fill_target.r1,
      fill_target.c1,
      "transparent",
      theme.selectionBorder,
      theme,
      sheet,
      content_top,
      scroll_left,
      this.paint_client_w,
      this.paint_client_h,
    );
    for (let i = before; i < this.cursor; i++) {
      const el = this.pool[i];
      if (el) el.style.outlineStyle = "dashed";
    }
  }

  private paint_fill_handle(theme: Theme, content_top: number, scroll_left: number): void {
    const fill_handle = this.deps.fillHandleScreen(content_top, scroll_left);
    if (!fill_handle || this.deps.isEditing()) return;

    const sq = this.acquire_rect(
      fill_handle.x - 3,
      fill_handle.y - 3,
      6,
      6,
      theme.selectionBorder,
      theme.selectionBorder,
    );
    sq.style.cursor = "crosshair";
  }

  /**
   * The value each new cell of a dragged fill will get, drawn faintly in the
   * cell, so the whole series shows before the release. Only the cells on
   * screen are drawn, on one canvas: the cost follows the viewport, not the
   * size of the fill.
   */
  private paint_fill_values(
    theme: Theme,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const area = this.deps.fillValuesArea();
    let canvas = this.fill_values;
    if (!area) {
      if (canvas) canvas.hidden = true;
      return;
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "sheetwrite-fill-values";
      canvas.setAttribute("aria-hidden", "true");
      this.overlay.prepend(canvas);
      this.fill_values = canvas;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.ceil(client_w * ratio);
    const height = Math.ceil(client_h * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${client_w}px`;
      canvas.style.height = `${client_h}px`;
    }
    canvas.hidden = false;
    const zoom = this.deps.zoom();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, client_w, client_h);
    context.font = theme.font;
    context.fillStyle = theme.fg;
    context.globalAlpha = 0.45;
    context.textBaseline = "middle";

    const { fr, frozenH: frozen_h } = this.deps.freeze();
    const top = theme.headerHeight;
    // Pinned rows first, then the body rows from the first one on screen.
    const body_start = Math.max(area.r0, fr, this.deps.rowAtOffset(content_top));
    const rows: number[] = [];
    for (let row = area.r0; row <= Math.min(area.r1, fr - 1); row++) rows.push(row);
    for (let row = body_start; row <= area.r1; row++) {
      if (this.deps.screenRect(row, area.c0, content_top, scroll_left).y >= client_h) break;
      rows.push(row);
    }
    for (const row of rows) {
      const clip = row < fr ? top : top + frozen_h;
      for (let col = area.c0; col <= area.c1; col++) {
        const rect = this.deps.screenRect(row, col, content_top, scroll_left);
        if (rect.x >= client_w) break;
        if (rect.w <= 0 || rect.x + rect.w <= theme.rowHeaderWidth || rect.y + rect.h <= clip)
          continue;
        const value = this.deps.fillValueAt(row, col);
        if (!value) continue;
        context.save();
        context.beginPath();
        context.rect(rect.x, Math.max(rect.y, clip), rect.w, rect.h);
        context.clip();
        const x = value.right ? rect.x + rect.w - 4 * zoom : rect.x + 4 * zoom;
        context.textAlign = value.right ? "right" : "left";
        // The canvas draws text at the zoom the cells use.
        context.setTransform(ratio * zoom, 0, 0, ratio * zoom, 0, 0);
        context.fillText(value.text, x / zoom, (rect.y + rect.h / 2) / zoom);
        context.restore();
      }
    }
  }

  /** Excel's tip beside the dragged fill handle: the value the last cell will get. */
  private paint_fill_tip(): void {
    const tip = this.deps.fillTip();
    if (!tip) {
      if (this.tip_element) this.tip_element.hidden = true;
      return;
    }
    let element = this.tip_element;
    if (!element) {
      element = document.createElement("div");
      element.className = "sheetwrite-fill-tip";
      element.setAttribute("role", "tooltip");
      this.overlay.appendChild(element);
      this.tip_element = element;
    }
    element.hidden = false;
    element.textContent = tip.text;
    // Below and right of the pointer, clear of the crosshair.
    element.style.transform = `translate(${tip.x + 12}px, ${tip.y + 16}px)`;
  }

  /** The Auto Fill Options button just outside the bottom-right corner of the last fill. */
  private paint_auto_fill_button(
    theme: Theme,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const target = this.deps.autoFillTarget();
    const corner = target
      ? this.deps.screenRect(target.r1, target.c1, content_top, scroll_left)
      : null;
    const x = corner ? corner.x + corner.w + 1 : 0;
    const y = corner ? corner.y + corner.h + 1 : 0;
    if (
      !corner ||
      this.deps.isEditing() ||
      x < theme.rowHeaderWidth ||
      y < theme.headerHeight ||
      x >= client_w ||
      y >= client_h
    ) {
      if (this.auto_fill_button) this.auto_fill_button.hidden = true;
      return;
    }
    let button = this.auto_fill_button;
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "sheetwrite-auto-fill-options";
      button.title = "Auto Fill Options";
      button.setAttribute("aria-label", "Auto Fill Options");
      button.setAttribute("aria-haspopup", "menu");
      button.tabIndex = -1;
      button.append(iconNode("autoFillOptions", this.deps.icons()));
      // The grid keeps the focus, so the menu's choice acts on the filled cells.
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const box = button?.getBoundingClientRect();
        if (box) this.deps.openAutoFillOptions(box.left, box.bottom);
      });
      this.overlay.appendChild(button);
      this.auto_fill_button = button;
    }
    button.hidden = false;
    button.style.transform = `translate(${x}px, ${y}px)`;
  }

  private paint_flash(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const active_sheet = this.deps.activeSheet();
    const tint = `color-mix(in srgb, ${theme.searchActiveMatch} 45%, transparent)`;
    for (const range of this.flash) {
      if (range.sheet !== active_sheet) continue;
      const first = this.deps.toViewRow(range.start.row);
      const last = this.deps.toViewRow(range.end.row);
      if (first === null || last === null) continue;
      const before = this.cursor;
      this.append_clamped_range(
        Math.min(first, last),
        Math.min(range.start.col, range.end.col),
        Math.max(first, last),
        Math.max(range.start.col, range.end.col),
        tint,
        "transparent",
        theme,
        sheet,
        content_top,
        scroll_left,
        client_w,
        client_h,
      );
      for (let index = before; index < this.cursor; index++) {
        this.pool[index]?.setAttribute("data-sheetwrite-flash", "");
      }
    }
  }

  /**
   * Draw the cut mark as dashes that run clockwise around the cells, the
   * "marching ants" of Excel; still dashes when the user asks for reduced
   * motion. Every piece runs on the document timeline, so a repaint while
   * scrolling does not restart the dashes.
   */
  private paint_cut_mark(
    theme: Theme,
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const mark = this.cut_mark;
    if (!mark || mark.sheet !== this.deps.activeSheet()) return;
    const first = this.deps.toViewRow(mark.start.row);
    const last = this.deps.toViewRow(mark.end.row);
    if (first === null || last === null) return;

    const before = this.cursor;
    this.append_clamped_range(
      Math.min(first, last),
      mark.start.col,
      Math.max(first, last),
      mark.end.col,
      "transparent",
      "transparent",
      theme,
      sheet,
      content_top,
      scroll_left,
      client_w,
      client_h,
    );
    const color = theme.selectionBorder;
    const across = `linear-gradient(90deg, ${color} 50%, transparent 50%)`;
    const down = `linear-gradient(0deg, ${color} 50%, transparent 50%)`;
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (let index = before; index < this.cursor; index++) {
      const el = this.pool[index];
      if (!el) continue;
      el.setAttribute("data-sheetwrite-cut", "");
      el.style.outlineStyle = "none";
      el.style.backgroundImage = `${across}, ${across}, ${down}, ${down}`;
      el.style.backgroundRepeat = "repeat-x, repeat-x, repeat-y, repeat-y";
      el.style.backgroundSize = "8px 2px, 8px 2px, 2px 8px, 2px 8px";
      el.style.backgroundPosition = CUT_DASHES_FROM;
      if (still || typeof el.animate !== "function") continue;
      const dashes = el.animate(
        [{ backgroundPosition: CUT_DASHES_FROM }, { backgroundPosition: CUT_DASHES_TO }],
        { duration: 400, iterations: Number.POSITIVE_INFINITY },
      );
      dashes.startTime = 0;
    }
  }

  private col_right(col: number, sheet: Sheet): number {
    // Column widths persist in base units; display geometry is zoomed.
    return this.deps.colLeftOf(col) + (sheet.columns[col]?.width ?? 0) * this.deps.zoom();
  }

  /**
   * The filter button of each AutoFilter header cell in view, at the cell's
   * right edge, and its glyph from the icon sheet: `filterArrow`, or
   * `filterActive` when its column is filtered.
   */
  private paint_filter_buttons(
    sheet: Sheet,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const range = sheet.autoFilter?.range;
    if (!range) return;
    const row = this.deps.toViewRow(range.start.row);
    if (row === null) return;

    const filtered = new Set(sheet.filters?.map(([col]) => col));
    for (let col = range.start.col; col <= range.end.col; col++) {
      const cell = this.deps.screenRect(row, col, content_top, scroll_left);
      if (cell.w <= 0 || cell.x >= client_w || cell.y >= client_h) continue;
      // A header row scrolled under the column headers shows no button.
      if (cell.x + cell.w <= 0 || cell.y < this.deps.theme().headerHeight) continue;
      const button = filterButtonRect(cell, this.deps.zoom());
      const el = this.acquire_rect(button.x, button.y, button.w, button.h, "", "transparent");
      el.className = "sheetwrite-autofilter-button";
      el.style.outlineStyle = "none";
      el.dataset.filtered = String(filtered.has(col));
      const glyph = this.acquire_rect(button.x, button.y, button.w, button.h, "", "transparent");
      glyph.className = "sheetwrite-icon sheetwrite-autofilter-glyph";
      glyph.style.outlineStyle = "none";
      glyph.style.setProperty("--sheetwrite-icon-size", `${button.w}px`);
      glyph.dataset.icon = filtered.has(col) ? "filterActive" : "filterArrow";
      checkStylePart(glyph, "icons", "The filter buttons");
    }
  }

  /**
   * What Excel shows beside the active cell of a validation rule: the
   * dropdown arrow of a list rule, and the input message in a box below the
   * cell, starting at its middle. Screen readers hear the input message as
   * the cell's description (`aria-mirror.ts`).
   */
  private paint_validation(
    theme: Theme,
    content_top: number,
    scroll_left: number,
    client_w: number,
    client_h: number,
  ): void {
    const focus = this.deps.selection().focusCell;
    const rule = focus ? this.deps.validationRuleAt(focus.row, focus.col) : undefined;
    const cell =
      focus && rule ? this.deps.screenRect(focus.row, focus.col, content_top, scroll_left) : null;
    if (
      !rule ||
      !cell ||
      cell.y + cell.h <= theme.headerHeight ||
      cell.y >= client_h ||
      cell.x + cell.w <= theme.rowHeaderWidth ||
      cell.x >= client_w
    ) {
      this.input_message?.remove();
      return;
    }

    if (hasListDropdown(rule)) {
      const button = listButtonRect(cell, this.deps.zoom());
      const el = this.acquire_rect(button.x, button.y, button.w, button.h, "", "transparent");
      el.className = "sheetwrite-list-button";
      el.style.outlineStyle = "none";
      const glyph = this.acquire_rect(button.x, button.y, button.w, button.h, "", "transparent");
      glyph.className = "sheetwrite-icon sheetwrite-list-glyph";
      glyph.style.outlineStyle = "none";
      glyph.style.setProperty("--sheetwrite-icon-size", `${button.w}px`);
      glyph.dataset.icon = "filterArrow";
    }
    if (!hasInputMessage(rule)) {
      this.input_message?.remove();
      return;
    }

    let card = this.input_message;
    if (!card) {
      card = document.createElement("div");
      card.className = "sheetwrite-input-message";
      card.setAttribute("aria-hidden", "true");
      card.style.position = "absolute";
      card.style.pointerEvents = "none";
      this.input_message = card;
    }
    const title = document.createElement("strong");
    title.textContent = rule.inputTitle ?? "";
    title.hidden = !rule.inputTitle;
    const message = document.createElement("span");
    message.textContent = rule.inputMessage ?? "";
    card.replaceChildren(title, message);
    card.style.left = `${Math.round(cell.x + cell.w / 2)}px`;
    card.style.top = `${Math.round(cell.y + cell.h + INPUT_MESSAGE_GAP)}px`;
    if (!card.isConnected) this.overlay.appendChild(card);
  }

  /**
   * Hand out the next pooled rect div, applying the mutable style fields. Static
   * setup (position, pointer-events, outline-offset, box-sizing) is written once
   * at creation. Outline width/style are rewritten to their defaults each time
   * so a div previously used as a focus ring (2px) or fill preview (dashed)
   * comes back clean; a hidden div is re-shown and any leftover cursor cleared.
   */
  private acquire_rect(
    left: number,
    top: number,
    width: number,
    height: number,
    background: string,
    border: string,
  ): HTMLDivElement {
    let el = this.pool[this.cursor];
    if (!el) {
      el = document.createElement("div");
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.outlineOffset = "-1px";
      el.style.boxSizing = "border-box";
      this.pool[this.cursor] = el;
      this.overlay.appendChild(el);
    } else if (el.style.display === "none") {
      el.style.display = "";
    }
    this.cursor++;
    if (el.hasAttribute("data-sheetwrite-cut")) end_cut_dashes(el);

    el.style.clipPath = "";
    if (el.className) el.className = "";
    el.removeAttribute("data-filtered");
    el.removeAttribute("data-icon");
    el.style.removeProperty("--sheetwrite-icon-size");
    el.textContent = "";
    el.removeAttribute("data-sheetwrite-presence");
    el.removeAttribute("data-sheetwrite-flash");
    el.removeAttribute("data-sheetwrite-presence-range");
    el.removeAttribute("aria-hidden");
    el.removeAttribute("title");
    el.style.color = "";
    el.style.font = "";
    el.style.lineHeight = "";
    el.style.paddingLeft = "";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.max(0, width)}px`;
    el.style.height = `${Math.max(0, height)}px`;
    el.style.background = background;
    el.style.outlineColor = border;
    el.style.outlineWidth = "1.5px";
    el.style.outlineStyle = "solid";
    if (el.style.cursor) el.style.cursor = "";
    return el;
  }

  /** Hide pool divs left over past `cursor` from earlier, busier passes. */
  private hide_surplus(): void {
    for (let i = this.cursor; i < this.pool.length; i++) {
      const el = this.pool[i]!;
      if (el.hasAttribute("data-sheetwrite-cut")) end_cut_dashes(el);
      el.removeAttribute("data-sheetwrite-presence");
      el.removeAttribute("data-sheetwrite-flash");
      // A hidden filter button must not stay one, for queries and styles alike.
      if (el.className) el.className = "";
      el.removeAttribute("data-filtered");
      el.removeAttribute("data-icon");
      el.removeAttribute("data-sheetwrite-presence-range");
      el.removeAttribute("aria-hidden");
      el.removeAttribute("title");
      el.textContent = "";
      if (el.style.display !== "none") el.style.display = "none";
    }
  }

  private hide_surplus_presence_labels(): void {
    for (let index = this.presence_label_cursor; index < this.presence_label_pool.length; index++) {
      const label = this.presence_label_pool[index]!;
      label.removeAttribute("data-sheetwrite-presence-label");
      label.removeAttribute("data-presence-kind");
      label.removeAttribute("title");
      label.removeAttribute("aria-label");
      label.textContent = "";
      if (label.style.display !== "none") label.style.display = "none";
    }
  }
}
