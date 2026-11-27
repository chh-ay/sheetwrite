import { EMPTY_STYLE } from "./cell-style-fields.js";
import { automaticTextColor } from "./color-contrast.js";
import { formatGeneral, GENERAL_WIDTH, isGeneralCode } from "./general-format.js";
import { formatNumber, numberFormatColor } from "./number-format.js";
import type {
  CellAlign,
  CellBorder,
  CellFormat,
  CellScalar,
  CellStyle,
  CellVerticalAlign,
} from "./types/cell.js";
import type { CellRenderer, RenderLayout, Theme, Viewport } from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

/** Space between a cell's text and its left and right gridlines, in CSS pixels at zoom 1. */
const CELL_PAD = 6;

/**
 * Space between a cell's text and its gridlines at `zoom`. Like the text, it
 * scales with the sheet's zoom, as in Excel.
 */
export function cellPadding(zoom: number): number {
  return CELL_PAD * zoom;
}

/** Edge of an AutoFilter header cell's filter button, in CSS pixels at zoom 1. */
const FILTER_BUTTON_SIZE = 16;

/**
 * Room between an AutoFilter header cell's filter button and the cell's
 * right gridline: the text's left padding, so the header has the same room on
 * both sides. In CSS pixels at zoom 1.
 */
const FILTER_BUTTON_INSET = CELL_PAD;

/** Room between the end of a header cell's text and its filter button: the text's left padding again. */
const FILTER_TEXT_GAP = CELL_PAD;

/** Room above and below the filter button in a row too short for its full size, at zoom 1. */
const FILTER_BUTTON_MARGIN = 2;

/** The least width of the area a pointer opens the filter dropdown in, in screen pixels, for touch. */
const FILTER_BUTTON_HIT_WIDTH = 24;

type CellBox = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/**
 * Where an AutoFilter header cell's filter button sits at `zoom`: a square
 * `FILTER_BUTTON_INSET` from the cell's right gridline, centred in the row, as
 * in Excel. Its size, inset and gap scale with the zoom, as the text does.
 * `cell` and the result share a coordinate space.
 */
export function filterButtonRect(cell: CellBox, zoom: number): CellBox {
  const inset = FILTER_BUTTON_INSET * zoom;
  const size = Math.max(
    0,
    Math.min(
      FILTER_BUTTON_SIZE * zoom,
      cell.h - 2 * FILTER_BUTTON_MARGIN * zoom,
      cell.w - 2 * inset,
    ),
  );
  return { x: cell.x + cell.w - inset - size, y: cell.y + (cell.h - size) / 2, w: size, h: size };
}

/**
 * Where a pointer opens the filter dropdown: the button and the inset to the
 * gridline, and at any zoom at least `FILTER_BUTTON_HIT_WIDTH` wide and as
 * tall, within the cell.
 */
export function filterButtonHitRect(cell: CellBox, zoom: number): CellBox {
  const button = filterButtonRect(cell, zoom);
  const right = cell.x + cell.w;
  const left = Math.max(cell.x, Math.min(button.x, right - FILTER_BUTTON_HIT_WIDTH));
  const middle = button.y + button.h / 2;
  const half = Math.max(FILTER_BUTTON_HIT_WIDTH, button.h) / 2;
  const top = Math.max(cell.y, middle - half);
  const bottom = Math.min(cell.y + cell.h, middle + half);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Where an AutoFilter header cell's text box ends at `zoom`:
 * `FILTER_TEXT_GAP` before the filter button, as Excel keeps header text clear
 * of the button. Text of every alignment lays out and clips in the box from
 * the cell's left edge to here, and the cell editor ends here too.
 */
export function filterTextRight(cell: CellBox, zoom: number): number {
  return filterButtonRect(cell, zoom).x - FILTER_TEXT_GAP * zoom;
}

const FONT_PX_RE = /(\d+(?:\.\d+)?)px/;
const FONT_WEIGHT_TOKEN_RE = /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/;
const FONT_STYLE_TOKEN_RE = /^(?:normal|italic|oblique)$/;
const FONT_ANGLE_TOKEN_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn)$/;

/** Gap between a top- or bottom-aligned text block and the cell edge, unzoomed. */
const VERTICAL_TEXT_PAD = 2;

// Border dash patterns, hoisted so paint_borders allocates no array per cell.
const SOLID_DASH: number[] = [];
const DASHED_DASH: number[] = [4, 2];
const DOTTED_DASH: number[] = [1, 2];

/** Composite key stride for the per-frame merge map; column indices are < 2^20. */
export const MERGE_KEY_STRIDE = 0x100000;

/** Works against a main-thread or worker (OffscreenCanvas) 2D context. */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Build the per-frame merge lookup. Every covered cell of every merge that
 * intersects the painted window maps to its `MergeRect`, keyed
 * `row * MERGE_KEY_STRIDE + col`. Populating only the window bounds the map to
 * `merges × visible-cells`, so each painted cell finds its merge with one
 * `Map.get`. Returns `undefined` when there is nothing to cover (the fast path).
 */
function build_merge_map(
  merges: ReadonlyArray<MergeRect>,
  row_start: number,
  row_end: number,
  cols: readonly number[],
): Map<number, MergeRect> | undefined {
  if (merges.length === 0 || cols.length === 0) return undefined;

  const map = new Map<number, MergeRect>();
  for (const m of merges) {
    const r0 = Math.max(m.r0, row_start);
    const r1 = Math.min(m.r1, row_end - 1);
    if (r0 > r1) continue;

    for (let r = r0; r <= r1; r++) {
      const base = r * MERGE_KEY_STRIDE;
      for (const c of cols) {
        if (c >= m.c0 && c <= m.c1) map.set(base + c, m);
      }
    }
  }
  return map.size === 0 ? undefined : map;
}

/**
 * Total pixel height of a merged region's vertical span. With per-row geometry
 * the heights of the spanned rows are summed (rows outside the painted window
 * fall back to the uniform height); without geometry it is the uniform height
 * times the spanned row count.
 */
function merge_row_span_height(
  merge: MergeRect,
  window_start: number,
  window_row_count: number,
  row_heights: Float64Array | undefined,
  row_height: number,
): number {
  if (row_heights === undefined) {
    return (merge.r1 - merge.r0 + 1) * row_height;
  }

  let total = 0;
  for (let row = merge.r0; row <= merge.r1; row++) {
    const index = row - window_start;
    const inside_window = index >= 0 && index < window_row_count;
    total += inside_window ? row_heights[index]! : row_height;
  }
  return total;
}

/** Cached cumulative edges keyed by columns-array identity (see `column_edges`). */
const column_edges_cache = new WeakMap<RenderLayout["columns"], number[]>();

/** Cumulative left edges per visible column; `colX[c+1] - colX[c]` is its width. */
function column_edges(layout: RenderLayout): number[] {
  const columns = layout.columns;
  const cached = column_edges_cache.get(columns);
  if (cached !== undefined) return cached;

  const col_x: number[] = new Array(columns.length + 1);
  col_x[0] = 0;
  for (let c = 0; c < columns.length; c++) {
    col_x[c + 1] = col_x[c]! + columns[c]!.width;
  }
  column_edges_cache.set(columns, col_x);
  return col_x;
}

/**
 * Put `family` in front of the font string's family list. The theme families
 * stay as fallbacks, so a family the browser lacks renders in the theme font.
 * `family` is validated (see cell-style-fields.ts) to need only quoting.
 */
function with_font_family(font: string, family: string): string {
  const size_match = FONT_PX_RE.exec(font);
  if (!size_match || size_match.index === undefined) return font;
  const from_size = font.slice(size_match.index);
  const size_token = /^\S+/.exec(from_size)?.[0] ?? from_size;
  const theme_families = from_size.slice(size_token.length).trim();
  const families = theme_families ? `"${family}", ${theme_families}` : `"${family}"`;
  return `${font.slice(0, size_match.index)}${size_token} ${families}`;
}

/**
 * Where a cell's text sits: its own alignment, else Excel's General rule,
 * which centres logical values and right-aligns numbers (and every value of
 * a number or currency column).
 */
export function cellAlign(
  style: Pick<CellStyle, "align">,
  value: CellScalar,
  type: CellFormat | undefined,
): CellAlign {
  if (style.align !== undefined) return style.align;
  if (typeof value === "boolean") return "center";
  return type === "number" ||
    type === "currency" ||
    (type === "general" && typeof value === "number")
    ? "right"
    : "left";
}

/** Resolve the canvas font from the theme and cell style. */
export function fontFor(
  theme: Theme,
  style: Pick<CellStyle, "bold" | "italic" | "fontSize" | "fontFamily">,
  zoom = 1,
  cache?: Map<string, string>,
): string {
  if (
    !style.bold &&
    !style.italic &&
    style.fontSize === undefined &&
    style.fontFamily === undefined
  ) {
    return theme.font;
  }

  const size = style.fontSize === undefined ? undefined : style.fontSize * zoom;
  const key = `${style.italic ? 1 : 0}:${style.bold ? 1 : 0}:${size ?? ""}:${style.fontFamily ?? ""}`;
  const cached = cache?.get(key);
  if (cached !== undefined) return cached;

  const sized = size === undefined ? theme.font : theme.font.replace(FONT_PX_RE, `${size}px`);
  const base = style.fontFamily === undefined ? sized : with_font_family(sized, style.fontFamily);
  const size_match = FONT_PX_RE.exec(base);
  if (!size_match || size_match.index === undefined) return base;

  const prefix = base.slice(0, size_match.index).trim().split(/\s+/).filter(Boolean);
  const theme_weight = prefix.find(
    (token) => FONT_WEIGHT_TOKEN_RE.test(token) && token !== "normal",
  );
  const theme_style = prefix.find((token) => FONT_STYLE_TOKEN_RE.test(token) && token !== "normal");
  const theme_style_index = theme_style === undefined ? -1 : prefix.indexOf(theme_style);
  const retained_prefix = prefix.filter(
    (token, index) =>
      !FONT_WEIGHT_TOKEN_RE.test(token) &&
      !FONT_STYLE_TOKEN_RE.test(token) &&
      !(
        style.italic &&
        theme_style === "oblique" &&
        index === theme_style_index + 1 &&
        FONT_ANGLE_TOKEN_RE.test(token)
      ),
  );

  const font = [
    ...(style.italic ? ["italic"] : theme_style ? [theme_style] : []),
    ...retained_prefix,
    ...(style.bold ? ["bold"] : theme_weight && theme_weight !== "normal" ? [theme_weight] : []),
    base.slice(size_match.index),
  ].join(" ");
  cache?.set(key, font);
  return font;
}

/** First probe length for a paragraph's first line; later lines start from the previous line's length. */
const FIRST_LINE_GUESS = 16;
const WHITESPACE = /\s/;
/**
 * Below U+0300 every code unit is a whole grapheme. From there on, combining
 * marks, surrogate pairs, ZWJ sequences and Indic clusters span several.
 */
const MAY_HAVE_CLUSTERS = /[\u0300-\uffff]/;
let grapheme_segmenter: Intl.Segmenter | undefined;

/**
 * Break units of one paragraph: graphemes, or plain code units when they
 * coincide (no segmentation, no allocation). Graphemes are segmented only as
 * far as the layout has asked, plus one, so a cell that draws a few lines of a
 * long paragraph never segments the rest of it.
 */
class BreakUnits {
  /** End offset of each grapheme segmented so far; unused for plain code units. */
  private readonly ends: number[] = [];
  private segments: Iterator<Intl.SegmentData> | undefined;
  private is_clustered = false;
  /** Units known to exist. Exact once `segments` is undefined. */
  private known = 0;

  /** Starts on `paragraph`, reusing the offset buffer of the previous one. */
  reset(paragraph: string): void {
    this.ends.length = 0;
    this.is_clustered = MAY_HAVE_CLUSTERS.test(paragraph);
    if (this.is_clustered) {
      grapheme_segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
      this.segments = grapheme_segmenter.segment(paragraph)[Symbol.iterator]();
      this.known = 0;
    } else {
      this.segments = undefined;
      this.known = paragraph.length;
    }
  }

  /**
   * `unit`, or the last unit when the paragraph has fewer. Segments one unit
   * past it, so {@link isLast} is exact for the result.
   */
  clamp(unit: number): number {
    while (this.segments !== undefined && this.known <= unit + 1) {
      const next = this.segments.next();
      if (next.done === true) {
        this.segments = undefined;
        break;
      }
      this.ends.push(next.value.index + next.value.segment.length);
      this.known += 1;
    }
    return Math.min(unit, this.known - 1);
  }

  /** Whether the paragraph has `unit`; segments up to it. */
  has(unit: number): boolean {
    return this.clamp(unit) === unit;
  }

  /** Whether `unit`, already returned by {@link clamp}, ends the paragraph. */
  isLast(unit: number): boolean {
    return this.segments === undefined && unit === this.known - 1;
  }

  /** End offset of `unit`, already returned by {@link clamp}. */
  endOf(unit: number): number {
    return this.is_clustered ? (this.ends[unit] ?? 0) : unit + 1;
  }
}

/**
 * Wrapped-only line layout; the ordinary single-line path never calls this.
 * `max_lines` bounds the work for cells whose block cannot fit: the caller only
 * draws lines that fit the cell height, so generating more than
 * `floor(height / lineHeight) + 1` lines cannot change the pixels. A result
 * whose length reaches `max_lines` therefore means "more lines exist".
 *
 * Lines break between graphemes, never inside an emoji or a cluster. Inside
 * a cluster a prefix can be wider than the whole (a half-built ZWJ sequence),
 * but across graphemes width grows with length, so each break is found by
 * search instead of measuring every prefix, which would cost L measurements
 * of growing strings for a line of L characters. Joining scripts such as Arabic can
 * shrink slightly when a letter takes its final form; there the search may
 * pick a different break than a scan would, but every line it picks fits.
 * The search gallops forward from the previous line's length, then bisects,
 * so measured text stays close to one line long however long the paragraph is.
 */
function layout_text_lines_into(
  ctx: Ctx,
  text: string,
  width: number,
  max_lines: number,
  lines: string[],
): string[] {
  const limit = Math.max(1, max_lines);
  const units = new BreakUnits();

  for (const paragraph of text.split("\n")) {
    if (lines.length >= limit) break;
    if (paragraph === "") {
      lines.push("");
      continue;
    }

    units.reset(paragraph);
    let first = 0;
    let start = 0;
    let guess = FIRST_LINE_GUESS;
    const overflows = (unit: number): boolean =>
      ctx.measureText(paragraph.slice(start, units.endOf(unit))).width > width;

    while (lines.length < limit && units.has(first)) {
      // Gallop: grow the probe until it overflows or the paragraph ends.
      let fits = first - 1;
      let over = -1;
      for (let step = guess; ; step *= 2) {
        const probe = units.clamp(fits + step);
        if (overflows(probe)) {
          over = probe;
          break;
        }
        fits = probe;
        if (units.isLast(probe)) break;
      }
      if (over === -1) {
        lines.push(paragraph.slice(start));
        break;
      }

      // Bisect for the first unit that does not fit.
      let low = fits + 1;
      let high = over;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (overflows(mid)) high = mid;
        else low = mid + 1;
      }
      const overflow_unit = low;

      // A first unit too wide for the cell still gets a line of its own.
      // Otherwise break after the last whitespace up to the overflowing unit
      // (it may be that whitespace), or mid-word just before it.
      let last = first;
      if (overflow_unit > first) {
        last = overflow_unit - 1;
        for (let unit = overflow_unit; unit >= first; unit--) {
          if (WHITESPACE.test(paragraph[units.endOf(unit) - 1] ?? "")) {
            last = unit;
            break;
          }
        }
      }

      const end = units.endOf(last);
      lines.push(paragraph.slice(start, end));
      guess = last - first + 1;
      first = last + 1;
      start = end;
    }
  }
  return lines;
}

/** Full wrapped layout for callers that need every line, such as auto row height. */
export function layoutTextLines(ctx: Ctx, text: string, width: number): string[] {
  return layout_text_lines_into(ctx, text, width, Number.POSITIVE_INFINITY, []);
}

/**
 * Top edge of a text block `block_height` tall inside a cell at `y` of height
 * `h`. A block taller than the cell is top-anchored whatever the alignment, so
 * its first lines stay readable.
 */
function text_block_top(
  vertical_align: CellVerticalAlign | undefined,
  y: number,
  h: number,
  block_height: number,
  zoom: number,
): number {
  const free = h - block_height;
  if (free <= 0) return y;
  const pad = Math.min(VERTICAL_TEXT_PAD * zoom, free / 2);
  if (vertical_align === "top") return y + pad;
  if (vertical_align === "bottom") return y + free - pad;
  return y + free / 2;
}

/**
 * Draw horizontally-aligned text inside a cell or header rect. `cy` is the
 * vertical center (baseline is "middle"). Deliberately omit Canvas's
 * `maxWidth`: browsers satisfy it by horizontally distorting glyphs.
 */
function fill_aligned_text(
  ctx: Ctx,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
  pad: number,
): void {
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + w - pad, cy);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, cy);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + pad, cy);
  }
}

/**
 * Draw underline and/or strikethrough for a drawn text run. Called only when the
 * resolved style requests a decoration, so the `measureText` and regex cost stay
 * off the undecorated hot path. Each line is a 1px filled rect spanning the glyph
 * run and reuses the current fill (already set to the text color by the caller).
 */
function paint_text_decoration(
  ctx: Ctx,
  style: CellStyle,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
  font_px: number,
  pad: number,
): void {
  const run_width = ctx.measureText(text).width;
  if (run_width <= 0) return;

  let left: number;
  if (align === "right") left = x + w - pad - run_width;
  else if (align === "center") left = x + w / 2 - run_width / 2;
  else left = x + pad;

  const effective_font_px = font_px || 12;

  if (style.underline) {
    // Just under the baseline, which sits ~0.4em below the "middle" text origin.
    ctx.fillRect(left, Math.round(cy + effective_font_px * 0.4), run_width, 1);
  }

  if (style.strikethrough) {
    // Through the run's visual middle (≈ the "middle" baseline origin at `cy`).
    ctx.fillRect(left, Math.round(cy), run_width, 1);
  }
}

/**
 * Per-frame guard state: `ctx.font`/`ctx.fillStyle` writes are surprisingly
 * costly on canvas backends, so paint routines assign only when the string
 * actually changes and record the last applied value here.
 */
interface PaintState {
  lastFont: string;
  lastFill: string;
  measuredFont: string;
  digitWidth: number;
  hashWidth: number;
  fontCache: Map<string, string>;
  /** Automatic text colour per explicit cell fill, for this frame's theme. */
  cellTextOnFill: Map<string, string>;
  /** Automatic text colour per explicit header fill, for this frame's theme. */
  headerTextOnFill: Map<string, string>;
}

function apply_font(ctx: Ctx, state: PaintState, font: string): void {
  if (state.lastFont !== font) {
    ctx.font = font;
    state.lastFont = font;
  }
}

function apply_fill(ctx: Ctx, state: PaintState, fill: string): void {
  if (state.lastFill !== fill) {
    ctx.fillStyle = fill;
    state.lastFill = fill;
  }
}

/**
 * Automatic text colour on an explicit fill, chosen by contrast against it and
 * computed once per distinct fill a frame paints. Resolving a named colour
 * goes through `ctx.fillStyle`, so the applied fill is forgotten afterwards.
 */
function text_on_fill(
  ctx: Ctx,
  state: PaintState,
  cache: Map<string, string>,
  fill: string,
  foreground: string,
  background: string,
): string {
  let color = cache.get(fill);
  if (color === undefined) {
    color = automaticTextColor(fill, foreground, background, ctx);
    state.lastFill = "";
    cache.set(fill, color);
  }
  return color;
}

export interface PaintDamage {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether `value` is an empty cell, through which text spills. */
function empty_value(value: CellScalar | undefined): boolean {
  return value === null || value === "" || value === undefined;
}

/**
 * Whether a frame of `view` can be shifted sideways and still match a full
 * repaint. Text spills only through the empty cells of the painted window, so
 * a text cell beside an empty one may paint differently once the window has
 * moved; and a cell border is a stroke across the cell edge, which a shift can
 * leave a pixel apart from a fresh stroke. Such frames repaint in full.
 */
export function sidewaysBlitSafe(view: VisibleWindowView, layout: RenderLayout): boolean {
  for (const style of view.styles) if (style.border) return false;
  for (const col of view.cols) if (layout.columns[col]?.cellStyle?.border) return false;
  const n_cols = view.cols.length;
  for (let index = 0; index < view.values.length; index++) {
    const value = view.values[index];
    if (typeof value !== "string" || value === "") continue;
    const cj = index % n_cols;
    const col = view.cols[cj] ?? -1;
    const left_spill =
      cj > 0 && view.cols[cj - 1] === col - 1 && empty_value(view.values[index - 1]);
    const right_spill =
      cj < n_cols - 1 && view.cols[cj + 1] === col + 1 && empty_value(view.values[index + 1]);
    if (left_spill || right_spill) return false;
  }
  return true;
}

/**
 * Shift the last frame's pixels by a scroll along one axis and return the
 * strip the scroll exposed, which is all the frame then has to paint. A
 * vertical scroll moves the body below the header; a sideways scroll moves
 * the header and the body right of the row gutter, and only when
 * `sidewaysSafe` ({@link sidewaysBlitSafe}) holds for both frames.
 * `undefined` when nothing can be reused: the first frame, changed content or
 * size, a scroll on both axes, or a shift of a fraction of a device pixel.
 */
export function blitScroll(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  prev: Viewport | null,
  viewport: Viewport,
  dpr: number,
  lastDpr: number,
  sidewaysSafe: boolean,
): PaintDamage | undefined {
  if (!prev) return undefined;
  if (prev.contentRevision === undefined || viewport.contentRevision === undefined)
    return undefined;
  if (prev.contentRevision !== viewport.contentRevision) return undefined;
  if (prev.width !== viewport.width || prev.height !== viewport.height) return undefined;
  if (lastDpr !== dpr) return undefined;
  const rows_moved = prev.scrollTop !== viewport.scrollTop;
  const columns_moved = prev.scrollLeft !== viewport.scrollLeft;
  if (rows_moved === columns_moved) return undefined;
  if (columns_moved && !sidewaysSafe) return undefined;

  // Blit only exact device-pixel shifts. A fractional shift would copy pixels
  // rounded to the nearest device pixel while the exposed strip repaints at
  // the true offset - each touchpad scroll then strands sub-pixel-shifted
  // stale glyph slices that accumulate into visible ghosting.
  const delta_device = rows_moved
    ? (viewport.scrollTop - prev.scrollTop) * dpr
    : (viewport.scrollLeft - prev.scrollLeft) * dpr;
  const delta_px = Math.round(delta_device);
  if (Math.abs(delta_device - delta_px) > 0.001) return undefined;
  const shift = { deltaPx: delta_px, dpr };
  return rows_moved
    ? blit_rows(ctx, canvas, theme, viewport, shift)
    : blit_columns(ctx, canvas, theme, viewport, shift);
}

/** A whole device-pixel scroll shift, and the canvas's device pixel ratio. */
interface PixelShift {
  deltaPx: number;
  dpr: number;
}

/** {@link blitScroll} along the rows: the body below the header moves. */
function blit_rows(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  viewport: Viewport,
  { deltaPx: delta_px, dpr }: PixelShift,
): PaintDamage | undefined {
  const body_top = theme.headerHeight;
  if (viewport.height - body_top <= 0) return undefined;
  const body_top_px = Math.round(body_top * dpr);
  const height_px = Math.round(viewport.height * dpr);
  const width_px = Math.round(viewport.width * dpr);
  const body_h_px = height_px - body_top_px;
  const shift_px = Math.abs(delta_px);
  if (shift_px === 0 || shift_px >= body_h_px) return undefined;

  const copy_h = body_h_px - shift_px;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (delta_px > 0) {
    ctx.drawImage(
      canvas,
      0,
      body_top_px + shift_px,
      width_px,
      copy_h,
      0,
      body_top_px,
      width_px,
      copy_h,
    );
    return {
      x: 0,
      y: viewport.height - shift_px / dpr,
      w: viewport.width,
      h: shift_px / dpr,
    };
  }

  ctx.drawImage(
    canvas,
    0,
    body_top_px,
    width_px,
    copy_h,
    0,
    body_top_px + shift_px,
    width_px,
    copy_h,
  );
  return { x: 0, y: body_top, w: viewport.width, h: shift_px / dpr };
}

/** {@link blitScroll} along the columns: the header and body right of the gutter move. */
function blit_columns(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  viewport: Viewport,
  { deltaPx: delta_px, dpr }: PixelShift,
): PaintDamage | undefined {
  const gutter = theme.rowHeaderWidth;
  if (viewport.width - gutter <= 0) return undefined;
  const gutter_px = Math.round(gutter * dpr);
  const height_px = Math.round(viewport.height * dpr);
  const width_px = Math.round(viewport.width * dpr);
  const body_w_px = width_px - gutter_px;
  const shift_px = Math.abs(delta_px);
  if (shift_px === 0 || shift_px >= body_w_px) return undefined;

  const copy_w = body_w_px - shift_px;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (delta_px > 0) {
    ctx.drawImage(
      canvas,
      gutter_px + shift_px,
      0,
      copy_w,
      height_px,
      gutter_px,
      0,
      copy_w,
      height_px,
    );
    return {
      x: viewport.width - shift_px / dpr,
      y: 0,
      w: shift_px / dpr,
      h: viewport.height,
    };
  }

  ctx.drawImage(
    canvas,
    gutter_px,
    0,
    copy_w,
    height_px,
    gutter_px + shift_px,
    0,
    copy_w,
    height_px,
  );
  return { x: gutter, y: 0, w: shift_px / dpr, h: viewport.height };
}

/** Solid lines on the freeze boundaries, drawn over the pane seams (Sheets-style). */
export function paintFreezeDivider(
  ctx: Ctx,
  theme: Theme,
  viewport: { width: number; height: number },
  dpr: number,
  divider: { x: number | null; y: number | null },
): void {
  if (divider.x === null && divider.y === null) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = theme.headerFg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (divider.y !== null) {
    ctx.moveTo(0, divider.y);
    ctx.lineTo(viewport.width, divider.y);
  }
  if (divider.x !== null) {
    ctx.moveTo(divider.x, 0);
    ctx.lineTo(divider.x, viewport.height);
  }
  ctx.stroke();
}

/**
 * Paint one visible window. Shared by the main-thread `CanvasRenderer` and the
 * worker backend. `renderers` is empty in the worker (custom cell renderers are
 * functions and cannot cross the worker boundary).
 *
 * `pane` clips the whole pass to one frozen-pane rectangle: the same code path
 * paints the corner/top/left/body panes of a frozen sheet, each with its own
 * scroll offsets in `viewport`, and the clip discards everything outside its
 * slice (including the header band/gutter segments other panes own).
 */
export function paintFrame(
  ctx: Ctx,
  view: VisibleWindowView,
  layout: RenderLayout,
  theme: Theme,
  viewport: Viewport,
  dpr: number,
  renderers: ReadonlyMap<string, CellRenderer>,
  damage?: PaintDamage,
  pane?: PaintDamage,
): void {
  const {
    width,
    height,
    scrollTop: scroll_top,
    scrollLeft: scroll_left,
    rowTops: row_tops,
    rowHeights: row_heights,
    rowNumbers: row_numbers,
    filteredRows: filtered_rows,
    filterHeader: filter_header,
  } = viewport;
  const { rowHeight: row_height, headerHeight: header_height } = theme;
  const col_x = column_edges(layout);
  const g = theme.rowHeaderWidth;

  const state: PaintState = {
    lastFont: "",
    lastFill: "",
    measuredFont: "",
    digitWidth: 0,
    hashWidth: 0,
    fontCache: new Map(),
    cellTextOnFill: new Map(),
    headerTextOnFill: new Map(),
  };

  const style_cache = new Map<number, CellStyle>();
  const style_stride = view.styles.length || 1;
  const merges = layout.merges;
  const merge_index = merges === undefined ? undefined : prepareMergeIndex(merges);
  const visible_merges =
    merge_index === undefined
      ? undefined
      : intersectingMerges(merge_index, view.rows.start, view.rows.end, view.cols);
  let minimum_visible_column = view.cols[0] ?? 0;
  let maximum_visible_column = view.cols[0] ?? -1;
  for (let index = 1; index < view.cols.length; index++) {
    minimum_visible_column = Math.min(minimum_visible_column, view.cols[index]!);
    maximum_visible_column = Math.max(maximum_visible_column, view.cols[index]!);
  }

  const merge_map =
    visible_merges === undefined
      ? undefined
      : build_merge_map(visible_merges, view.rows.start, view.rows.end, view.cols);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  if (pane) {
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
  }

  if (damage) {
    ctx.beginPath();
    ctx.rect(damage.x, damage.y, damage.w, damage.h);
    ctx.clip();
  }

  ctx.textBaseline = "middle";
  apply_font(ctx, state, theme.font);

  apply_fill(ctx, state, theme.bg);
  if (damage) ctx.fillRect(damage.x, damage.y, damage.w, damage.h);
  else if (pane) ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  else ctx.fillRect(0, 0, width, height);

  const n_cols = view.cols.length;
  const n_rows = view.rows.end - view.rows.start;
  const clip_top = Math.max(damage ? damage.y : 0, pane ? pane.y : 0);
  const clip_bottom = Math.min(
    damage ? damage.y + damage.h : height,
    pane ? pane.y + pane.h : height,
  );
  const paint_top = Math.max(header_height, clip_top);
  const paint_bottom = Math.min(height, clip_bottom);
  // A sideways blit leaves a strip of columns to paint; cells, headers and the
  // row gutter outside it are skipped, not painted under the clip.
  const paint_left = Math.max(damage ? damage.x : 0, pane ? pane.x : 0);
  const paint_right = Math.min(
    damage ? damage.x + damage.w : width,
    pane ? pane.x + pane.w : width,
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(g, header_height, Math.max(0, width - g), Math.max(0, height - header_height));
  ctx.clip();
  for (let ri = 0; ri < n_rows; ri++) {
    const row = view.rows.start + ri;
    const row_top = row_tops !== undefined ? row_tops[ri]! : row * row_height;
    const row_h = row_heights !== undefined ? row_heights[ri]! : row_height;
    const y = header_height + row_top - scroll_top;
    if (y + row_h <= paint_top || y >= paint_bottom) continue;
    for (let cj = 0; cj < n_cols; cj++) {
      const col = view.cols[cj]!;
      const x = col_x[col]! - scroll_left + g;
      const w = col_x[col + 1]! - col_x[col]!;
      if (x + w <= g || x >= width) continue;
      const merge =
        merge_map !== undefined ? merge_map.get(row * MERGE_KEY_STRIDE + col) : undefined;
      if (merge && (merge.r0 !== row || merge.c0 !== col)) continue; // covered by a merge
      const cw = merge ? col_x[merge.c1 + 1]! - col_x[merge.c0]! : w;
      const ch = merge
        ? merge_row_span_height(merge, view.rows.start, n_rows, row_heights, row_height)
        : row_h;
      const i = ri * n_cols + cj;
      const value = view.values[i] ?? null;
      const style_id = view.styleIds[i]!;
      const style = view.styles[style_id] ?? EMPTY_STYLE;
      const style_key = col * style_stride + style_id;
      // An AutoFilter header cell lays out its text in a box that ends a gap
      // before its filter button, for every alignment, as in Excel.
      const text_right =
        filter_header !== undefined &&
        row === filter_header.row &&
        col >= filter_header.start &&
        col <= filter_header.end
          ? filterTextRight({ x, y, w: cw, h: ch }, layout.zoom ?? 1)
          : undefined;

      // Sheets lets text spill through adjacent empty cells, but never through
      // occupied cells. Compute the contiguous empty run around this cell; the
      // painter chooses the relevant side after resolving alignment. Numbers
      // and custom renderers deliberately keep their own cell bounds, and a
      // filter header cell keeps its text in its box.
      let spill_x = x;
      let spill_right = x + cw;
      if (!merge && text_right === undefined && typeof value === "string" && value !== "") {
        for (let k = cj - 1; k >= 0; k--) {
          const adjacent = view.cols[k]! + 1 === view.cols[k + 1]!;
          const neighbour = view.values[ri * n_cols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spill_x = col_x[view.cols[k]!]! - scroll_left + g;
        }

        for (let k = cj + 1; k < n_cols; k++) {
          const adjacent = view.cols[k - 1]! + 1 === view.cols[k]!;
          const neighbour = view.values[ri * n_cols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spill_right = col_x[view.cols[k]! + 1]! - scroll_left + g;
        }
      }
      if (Math.max(x + cw, spill_right) <= paint_left || Math.min(x, spill_x) >= paint_right)
        continue;

      paint_cell(
        ctx,
        theme,
        layout,
        col,
        value,
        style,
        x,
        y,
        cw,
        ch,
        text_right,
        spill_x,
        spill_right - spill_x,
        renderers,
        state,
        style_key,
        style_cache,
      );
    }
  }

  // Gridlines are filled one-pixel rectangles, not stroked lines: a long
  // stroked line is not rasterized the same at every offset, so a line copied
  // by a scroll blit could differ by a pixel from the line a full repaint draws.
  ctx.fillStyle = theme.gridLine;
  for (let ri = 0; ri < n_rows; ri++) {
    const row = view.rows.start + ri;
    const row_bottom =
      row_tops !== undefined && row_heights !== undefined
        ? row_tops[ri]! + row_heights[ri]!
        : (row + 1) * row_height;
    const line_y = Math.round(header_height + row_bottom - scroll_top) - 0.5;
    if (line_y < paint_top || line_y > paint_bottom) continue;
    let cursor_x = g;
    const merges_by_column =
      merge_index === undefined
        ? undefined
        : horizontal_merge_gaps(merge_index, row, minimum_visible_column, maximum_visible_column);
    if (merges_by_column) {
      for (const merge of merges_by_column) {
        if (merge.r0 > row || row >= merge.r1) continue;
        const gap_start = Math.max(g, col_x[merge.c0]! - scroll_left + g);
        const gap_end = Math.min(width, col_x[merge.c1 + 1]! - scroll_left + g);
        if (gap_end <= cursor_x || gap_start >= width) continue;
        if (gap_start > cursor_x) ctx.fillRect(cursor_x, line_y - 0.5, gap_start - cursor_x, 1);

        cursor_x = Math.max(cursor_x, gap_end);
      }
    }

    if (cursor_x < width) ctx.fillRect(cursor_x, line_y - 0.5, width - cursor_x, 1);
  }

  ctx.restore();
  state.lastFont = theme.font;

  ctx.fillStyle = theme.gridLine;
  state.lastFill = theme.gridLine;
  const append_vertical_gridline = (c: number, line_x: number): void => {
    if (line_x < g || line_x > width) return;
    const merges_by_row =
      merge_index === undefined
        ? undefined
        : vertical_merge_gaps(merge_index, c, view.rows.start, view.rows.end - 1);
    let cursor_y = 0;
    if (merges_by_row) {
      for (const merge of merges_by_row) {
        if (merge.c0 >= c || c > merge.c1) continue;
        const merge_index = merge.r0 - view.rows.start;
        const merge_content_top =
          row_tops !== undefined && merge_index >= 0 && merge_index < n_rows
            ? row_tops[merge_index]!
            : merge.r0 * row_height;
        const merge_top = header_height + merge_content_top - scroll_top;
        const gap_start = Math.max(0, merge_top);
        const gap_end = Math.min(
          height,
          merge_top +
            merge_row_span_height(merge, view.rows.start, n_rows, row_heights, row_height),
        );
        if (gap_end <= cursor_y || gap_start >= height) continue;
        if (gap_start > cursor_y) ctx.fillRect(line_x - 0.5, cursor_y, 1, gap_start - cursor_y);

        cursor_y = Math.max(cursor_y, gap_end);
      }
    }

    if (cursor_y < height) ctx.fillRect(line_x - 0.5, cursor_y, 1, height - cursor_y);
  };

  for (let cj = 0; cj < n_cols; cj++) {
    const c = view.cols[cj]!;
    append_vertical_gridline(c, Math.round(col_x[c]! - scroll_left + g) - 0.5);
  }

  if (n_cols > 0) {
    const c = view.cols[n_cols - 1]! + 1;
    append_vertical_gridline(c, Math.round(col_x[c]! - scroll_left + g) - 0.5);
  }

  if (clip_top < header_height) {
    const strip = { width, left: paint_left, right: paint_right };
    paint_header(ctx, theme, layout, col_x, view.cols, strip, scroll_left, g, state);
  }

  if (g > 0 && paint_left < g) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, g, height);
    ctx.clip();
    apply_fill(ctx, state, theme.headerBg);
    ctx.fillRect(0, 0, g, height);

    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g - 0.5, 0);
    ctx.lineTo(g - 0.5, height);
    ctx.stroke();

    // Row numbers stay below the column header, like the cell body: a row
    // scrolled half under the header must not paint its number in the corner.
    ctx.beginPath();
    ctx.rect(0, header_height, g, Math.max(0, height - header_height));
    ctx.clip();
    apply_font(ctx, state, theme.font);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let ri = 0; ri < n_rows; ri++) {
      const row = view.rows.start + ri;
      const band_top =
        row_tops !== undefined
          ? header_height + row_tops[ri]! - scroll_top
          : header_height + row * row_height - scroll_top;
      const band_height = row_heights !== undefined ? row_heights[ri]! : row_height;
      // Cull by row band, not center: a damage strip can cover half a row's
      // glyphs while the center sits outside it - skipping the row would let
      // the strip's background erase that half and slice the digits.
      if (band_top + band_height < paint_top || band_top > paint_bottom) continue;
      const cy = band_top + band_height / 2;
      const number = row_numbers?.[ri] ?? row + 1;
      const listed =
        filtered_rows !== undefined &&
        number - 1 >= filtered_rows.start &&
        number - 1 <= filtered_rows.end;
      apply_fill(ctx, state, listed ? theme.selectionBorder : theme.headerFg);
      ctx.fillText(String(number), g / 2, cy);
    }

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Clip cell content without using fillText's `maxWidth`, which scales and
 * visibly squeezes glyphs. Text may receive a wider Sheets-style spill rect;
 * its height always remains locked to the owning row.
 */
function clip_cell(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
  ctx.clip();
}

/**
 * The text a cell shows before it is fitted to its width: TRUE or FALSE, a
 * number in its format (General when it has none), or the text itself. The
 * canvas paints it and the screen-reader mirror reads it, so both say the
 * same. Numbers come from the formatted-text cache.
 *
 * @param value - The cell's resolved value.
 * @param format - The cell's number-format code, from its style or its column.
 * @param locale - The column's number locale.
 */
export function cellDisplayText(
  value: string | number | boolean,
  format: string | undefined,
  locale: string | undefined,
): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return typeof value === "number" ? formatNumber(value, format, locale) : value;
}

/**
 * A General number narrowed to fit `available` pixels, as Excel narrows it in
 * a narrow column: fewer decimals, then scientific notation. Null when the
 * format is not General or no form fits, where Excel shows `####`. Only a
 * number that overflows its cell gets here.
 */
function narrow_general(
  ctx: Ctx,
  value: number,
  format: string | undefined,
  locale: string | undefined,
  available: number,
): string | null {
  if (!isGeneralCode(format)) return null;
  for (let width = GENERAL_WIDTH - 1; width > 0; width--) {
    const text = formatGeneral(value, width, locale);
    if (text === null) return null;
    if (ctx.measureText(text).width <= available) return text;
  }
  return null;
}

function paint_cell(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  col: number,
  value: CellScalar,
  style: CellStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  /** Where a filter header's text box ends, before its button; undefined for other cells. */
  text_right: number | undefined,
  spill_x: number,
  spill_w: number,
  renderers: ReadonlyMap<string, CellRenderer>,
  state: PaintState,
  style_key: number,
  style_cache: Map<number, CellStyle>,
): void {
  const column = layout.columns[col];

  // The column's `cellStyle` is the base layer and the per-cell style wins on any
  // shared property. Skip the merge (and its allocation) when no column style
  // exists; otherwise reuse a merge cached per (column, view-local style id).
  const column_style = column?.cellStyle;
  let effective: CellStyle;
  if (column_style === undefined) {
    effective = style;
  } else {
    const cached = style_cache.get(style_key);
    if (cached !== undefined) {
      effective = cached;
    } else {
      effective = { ...column_style, ...style };
      style_cache.set(style_key, effective);
    }
  }

  if (effective.backgroundColor) {
    apply_fill(ctx, state, effective.backgroundColor);
    ctx.fillRect(x, y, w, h);
  }

  paint_borders(ctx, effective, x, y, w, h);

  const custom = column?.renderer ? renderers.get(column.renderer) : undefined;
  if (custom?.dom || layout.domRendererColumns?.[col] === 1) return;
  if (custom?.canvas) {
    ctx.save();
    clip_cell(ctx, x, y, w, h);
    custom.canvas(ctx as CanvasRenderingContext2D, { value, x, y, w, h, theme, style: effective });
    ctx.restore();
    return;
  }

  if (value === null || value === "") return;

  const effective_font = fontFor(theme, effective, layout.zoom ?? 1, state.fontCache);
  apply_font(ctx, state, effective_font);
  const numeric = typeof value === "number";
  const number_format = effective.numberFormat ?? column?.numberFormat;
  // Excel paints a number in its format section's color, such as `[Red]`, over the font color.
  const format_color =
    numeric && number_format !== undefined ? numberFormatColor(value, number_format) : undefined;
  apply_fill(
    ctx,
    state,
    format_color ??
      effective.color ??
      (effective.backgroundColor
        ? text_on_fill(
            ctx,
            state,
            state.cellTextOnFill,
            effective.backgroundColor,
            theme.fg,
            theme.bg,
          )
        : theme.fg),
  );

  const align = cellAlign(effective, value, column?.type);
  let text = cellDisplayText(value, number_format, column?.numberLocale);
  // A filter header's text pads on the left as usual and ends at its text box.
  const pad = cellPadding(layout.zoom ?? 1);
  const text_w = text_right === undefined ? w : text_right + pad - x;
  const available_text_width = Math.max(0, text_w - pad * 2);
  if (numeric) {
    if (state.measuredFont !== state.lastFont) {
      state.measuredFont = state.lastFont;
      state.digitWidth = ctx.measureText("0").width;
      state.hashWidth = ctx.measureText("#").width || 1;
    }

    // Most numeric cells are comfortably wider than their formatted value.
    // Only pay for exact measurement when a cached digit-width estimate says
    // the run is close enough to the edge to plausibly overflow.
    const may_overflow = text.length * state.digitWidth > available_text_width * 0.8;
    const exact_width = may_overflow ? ctx.measureText(text).width : 0;
    if (exact_width > available_text_width) {
      text =
        narrow_general(ctx, value, number_format, column?.numberLocale, available_text_width) ??
        "#".repeat(Math.max(1, Math.floor(available_text_width / state.hashWidth)));
    }
  }

  const font_px =
    effective.fontSize === undefined
      ? Number.parseFloat(FONT_PX_RE.exec(theme.font)?.[1] ?? "") || 12
      : effective.fontSize * (layout.zoom ?? 1);
  const zoom = layout.zoom ?? 1;
  const line_height = font_px * 1.2;

  ctx.save();
  if (effective.wrap && !numeric) {
    clip_cell(ctx, x, y, (text_right ?? x + w) - x, h);

    // The draw loop below never paints a line whose band starts past the cell,
    // and a block taller than the cell is top-anchored either way, so laying
    // out one line past the last drawable one changes no pixel.
    const max_lines = Math.floor(h / line_height) + 1;
    const lines = layout_text_lines_into(ctx, text, available_text_width, max_lines, []);
    const block_height = lines.length * line_height;
    const first_cy =
      text_block_top(effective.verticalAlign, y, h, block_height, zoom) + line_height / 2;

    for (let line = 0; line < lines.length; line++) {
      const cy = first_cy + line * line_height;
      if (cy - line_height / 2 >= y + h) break;
      const line_text = lines[line]!;
      fill_aligned_text(ctx, line_text, align, x, text_w, cy, pad);
      if (effective.underline || effective.strikethrough) {
        paint_text_decoration(ctx, effective, line_text, align, x, text_w, cy, font_px, pad);
      }
    }
  } else {
    // Left-aligned strings spill right, right-aligned strings spill left, and
    // centered strings can use both sides. Numeric output never spills.
    let text_clip_x = x;
    let text_clip_w = text_w;
    if (!numeric) {
      if (align === "left") text_clip_w = spill_x + spill_w - x;
      else if (align === "right") {
        text_clip_x = spill_x;
        text_clip_w = x + text_w - spill_x;
      } else {
        text_clip_x = spill_x;
        text_clip_w = spill_w;
      }
    }

    // Unset or "middle" puts the line on the cell's exact middle; top and bottom
    // place it as a one-line block, as wrapped text does.
    const cy =
      effective.verticalAlign === undefined || effective.verticalAlign === "middle"
        ? y + h / 2
        : text_block_top(effective.verticalAlign, y, h, line_height, zoom) + line_height / 2;
    // A filter header's text clips at its text box, the gap before the button.
    if (text_right !== undefined) text_clip_w = Math.min(text_clip_w, text_right - text_clip_x);
    clip_cell(ctx, text_clip_x, y, text_clip_w, h);
    fill_aligned_text(ctx, text, align, x, text_w, cy, pad);
    if (effective.underline || effective.strikethrough) {
      paint_text_decoration(ctx, effective, text, align, x, text_w, cy, font_px, pad);
    }
  }

  ctx.restore();
}

function paint_borders(
  ctx: Ctx,
  style: CellStyle,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const b = style.border;
  if (!b) return;
  const sides: Array<[CellBorder | undefined, number, number, number, number]> = [
    [b.top ?? b.all, x, y, x + w, y],
    [b.bottom ?? b.all, x, y + h, x + w, y + h],
    [b.left ?? b.all, x, y, x, y + h],
    [b.right ?? b.all, x + w, y, x + w, y + h],
  ];
  for (const [side, x0, y0, x1, y1] of sides) {
    if (!side) continue;
    ctx.strokeStyle = side.color ?? "#000000";
    ctx.lineWidth = side.width ?? 1;
    if (side.style === "dashed") ctx.setLineDash(DASHED_DASH);
    else if (side.style === "dotted") ctx.setLineDash(DOTTED_DASH);
    else ctx.setLineDash(SOLID_DASH);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.setLineDash(SOLID_DASH);
}

/** The canvas width, and the band from `left` to `right` that a frame paints. */
interface PaintStrip {
  width: number;
  left: number;
  right: number;
}

function paint_header(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  col_x: number[],
  cols: readonly number[],
  strip: PaintStrip,
  scroll_left: number,
  g: number,
  state: PaintState,
): void {
  const h = theme.headerHeight;

  // Default header bar; any per-column `headerStyle` background paints over it.
  apply_fill(ctx, state, theme.headerBg);
  ctx.fillRect(0, 0, strip.width, h);

  const cy = h / 2;
  const left = Math.max(g, strip.left);
  const right = Math.min(strip.width, strip.right);
  for (const c of cols) {
    const column = layout.columns[c]!;
    const x = col_x[c]! - scroll_left + g;
    const w = col_x[c + 1]! - col_x[c]!;
    if (x + w <= left || x >= right) continue;

    const header_style = column.headerStyle;

    if (header_style?.backgroundColor) {
      apply_fill(ctx, state, header_style.backgroundColor);
      ctx.fillRect(x, 0, w, h);
    }

    // Theme header defaults are bold and centered; `header_style` overrides where set.
    const bold = header_style?.bold ?? true;
    apply_font(
      ctx,
      state,
      fontFor(
        theme,
        { bold, italic: header_style?.italic, fontSize: header_style?.fontSize },
        layout.zoom ?? 1,
        state.fontCache,
      ),
    );
    apply_fill(
      ctx,
      state,
      header_style?.color ??
        (header_style?.backgroundColor
          ? text_on_fill(
              ctx,
              state,
              state.headerTextOnFill,
              header_style.backgroundColor,
              theme.headerFg,
              theme.headerBg,
            )
          : theme.headerFg),
    );

    const align = header_style?.align ?? "center";
    ctx.save();
    clip_cell(ctx, x, 0, w, h);
    fill_aligned_text(ctx, column.header, align, x, w, cy, cellPadding(layout.zoom ?? 1));
    ctx.restore();
  }

  apply_fill(ctx, state, theme.gridLine);
  ctx.fillRect(0, h - 1, strip.width, 1);
}

export interface MergeRect {
  readonly r0: number;
  readonly c0: number;
  readonly r1: number;
  readonly c1: number;
}

type MergeAxisIndex = readonly [
  entries: readonly MergeRect[],
  prefixMaxEnd: readonly number[],
  rows: boolean,
];

export interface MergeIndexResourceStats {
  readonly indexConstructions: number;
  readonly candidatesExamined: number;
}

let merge_resource_stats: [indexConstructions: number, candidatesExamined: number] | undefined;
const merge_index_cache = new WeakMap<ReadonlyArray<MergeRect>, PreparedMergeIndex>();
const axis_start = (merge: MergeRect, rows: boolean): number => (rows ? merge.r0 : merge.c0);
const axis_end = (merge: MergeRect, rows: boolean): number => (rows ? merge.r1 : merge.c1);

function build_merge_axis(merges: ReadonlyArray<MergeRect>, rows: boolean): MergeAxisIndex {
  const entries = [...merges].sort(
    (a, b) => axis_start(a, rows) - axis_start(b, rows) || axis_end(a, rows) - axis_end(b, rows),
  );
  const prefix_max_end = new Array<number>(entries.length);
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < entries.length; index++) {
    maximum = Math.max(maximum, axis_end(entries[index]!, rows));
    prefix_max_end[index] = maximum;
  }
  return [entries, prefix_max_end, rows];
}

function merge_candidate_range(
  index: MergeAxisIndex,
  minimum: number,
  maximum: number,
): readonly [number, number] {
  let first = 0;
  let last = index[0].length;
  while (first < last) {
    const middle = (first + last) >>> 1;
    if (index[1][middle]! < minimum) first = middle + 1;
    else last = middle;
  }
  let end = first;
  last = index[0].length;
  while (end < last) {
    const middle = (end + last) >>> 1;
    if (axis_start(index[0][middle]!, index[2]) <= maximum) end = middle + 1;
    else last = middle;
  }
  return [first, end];
}

/** Prepared interval projections shared by interaction, clipboard, and paint paths. */
export type PreparedMergeIndex = readonly [rows: MergeAxisIndex, columns: MergeAxisIndex];

function query_merges(
  prepared: PreparedMergeIndex,
  row_minimum: number,
  row_maximum: number,
  column_minimum: number,
  column_maximum: number,
): MergeRect[] {
  const row_range = merge_candidate_range(prepared[0], row_minimum, row_maximum);
  const column_range = merge_candidate_range(prepared[1], column_minimum, column_maximum);
  const rows = row_range[1] - row_range[0] <= column_range[1] - column_range[0];
  const index = prepared[rows ? 0 : 1];
  const range = rows ? row_range : column_range;
  const minimum = rows ? row_minimum : column_minimum;
  const matches: MergeRect[] = [];
  for (let position = range[0]; position < range[1]; position++) {
    const merge = index[0][position]!;
    if (merge_resource_stats) merge_resource_stats[1] += 1;
    if (
      axis_end(merge, index[2]) >= minimum &&
      (rows
        ? merge.c1 >= column_minimum && merge.c0 <= column_maximum
        : merge.r1 >= row_minimum && merge.r0 <= row_maximum)
    ) {
      matches.push(merge);
    }
  }
  return matches;
}

export function mergeAnchorAt(
  prepared: PreparedMergeIndex,
  row: number,
  column: number,
): MergeRect | null {
  return query_merges(prepared, row, row, column, column)[0] ?? null;
}

export function intersectingMerges(
  prepared: PreparedMergeIndex,
  rowStart: number,
  rowEnd: number,
  columns: readonly number[],
): readonly MergeRect[] {
  if (rowStart >= rowEnd || columns.length === 0) return [];
  let minimum_column = columns[0]!;
  let maximum_column = minimum_column;
  for (let index = 1; index < columns.length; index++) {
    minimum_column = Math.min(minimum_column, columns[index]!);
    maximum_column = Math.max(maximum_column, columns[index]!);
  }
  return query_merges(prepared, rowStart, rowEnd - 1, minimum_column, maximum_column);
}

function horizontal_merge_gaps(
  prepared: PreparedMergeIndex,
  row: number,
  column_minimum = Number.NEGATIVE_INFINITY,
  column_maximum = Number.POSITIVE_INFINITY,
): readonly MergeRect[] {
  return query_merges(prepared, row, row, column_minimum, column_maximum)
    .filter((merge) => row < merge.r1)
    .sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1);
}

function vertical_merge_gaps(
  prepared: PreparedMergeIndex,
  column: number,
  row_minimum = Number.NEGATIVE_INFINITY,
  row_maximum = Number.POSITIVE_INFINITY,
): readonly MergeRect[] {
  return query_merges(prepared, row_minimum, row_maximum, column, column)
    .filter((merge) => merge.c0 < column)
    .sort((a, b) => a.r0 - b.r0 || a.r1 - b.r1);
}

export function prepareMergeIndex(merges: ReadonlyArray<MergeRect>): PreparedMergeIndex {
  let prepared = merge_index_cache.get(merges);
  if (!prepared) {
    prepared = [build_merge_axis(merges, true), build_merge_axis(merges, false)];
    merge_index_cache.set(merges, prepared);
    if (merge_resource_stats) merge_resource_stats[0] += 1;
  }
  return prepared;
}

export function getMergeIndexResourceStatsForTest(): MergeIndexResourceStats {
  return {
    indexConstructions: merge_resource_stats?.[0] ?? 0,
    candidatesExamined: merge_resource_stats?.[1] ?? 0,
  };
}

export function resetMergeIndexResourceStatsForTest(): void {
  merge_resource_stats = [0, 0];
}
