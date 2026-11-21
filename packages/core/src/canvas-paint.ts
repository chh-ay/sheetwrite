import { EMPTY_STYLE } from "./cell-style-fields.js";
import { automaticTextColor } from "./color-contrast.js";
import { formatGeneral, GENERAL_WIDTH, isGeneralCode } from "./general-format.js";
import { formatNumber, numberFormatColor } from "./number-format.js";
import type {
  CellAlign,
  CellBorder,
  CellScalar,
  CellStyle,
  CellVerticalAlign,
} from "./types/cell.js";
import type { CellRenderer, RenderLayout, Theme, Viewport } from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

const CELL_PAD = 6;

/** Edge of an AutoFilter header cell's filter button, in CSS pixels. */
const FILTER_BUTTON_SIZE = 16;

/**
 * Room between an AutoFilter header cell's filter button and the cell's
 * right gridline: the text's left padding, so the header has the same room on
 * both sides. In CSS pixels.
 */
const FILTER_BUTTON_INSET = CELL_PAD;

/** Room between the end of a header cell's text and its filter button: the text's left padding again. */
const FILTER_TEXT_GAP = CELL_PAD;

/** The least width of the area a pointer opens the filter dropdown in, for touch. */
const FILTER_BUTTON_HIT_WIDTH = 24;

type CellBox = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/**
 * Where an AutoFilter header cell's filter button sits: a square
 * `FILTER_BUTTON_INSET` from the cell's right gridline, centred in the row, as
 * in Excel. `cell` and the result share a coordinate space.
 */
export function filterButtonRect(cell: CellBox): CellBox {
  const size = Math.max(
    0,
    Math.min(FILTER_BUTTON_SIZE, cell.h - 4, cell.w - 2 * FILTER_BUTTON_INSET),
  );
  return {
    x: cell.x + cell.w - FILTER_BUTTON_INSET - size,
    y: cell.y + (cell.h - size) / 2,
    w: size,
    h: size,
  };
}

/**
 * Where a pointer opens the filter dropdown: the button, widened to
 * `FILTER_BUTTON_HIT_WIDTH` towards the text and over the inset, and as tall,
 * within the cell.
 */
export function filterButtonHitRect(cell: CellBox): CellBox {
  const button = filterButtonRect(cell);
  const right = cell.x + cell.w;
  const left = Math.max(cell.x, Math.min(button.x, right - FILTER_BUTTON_HIT_WIDTH));
  const middle = button.y + button.h / 2;
  const top = Math.max(cell.y, middle - FILTER_BUTTON_HIT_WIDTH / 2);
  const bottom = Math.min(cell.y + cell.h, middle + FILTER_BUTTON_HIT_WIDTH / 2);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Where an AutoFilter header cell's text box ends: `FILTER_TEXT_GAP` before
 * the filter button, as Excel keeps header text clear of the button. Text of
 * every alignment lays out and clips in the box from the cell's left edge to
 * here, and the cell editor ends here too.
 */
export function filterTextRight(cell: CellBox): number {
  return filterButtonRect(cell).x - FILTER_TEXT_GAP;
}

const FONT_PX_RE = /(\d+(?:\.\d+)?)px/;
const FONT_WEIGHT_TOKEN_RE = /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/;
const FONT_STYLE_TOKEN_RE = /^(?:normal|italic|oblique)$/;
const FONT_ANGLE_TOKEN_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn)$/;

/** Gap between a top- or bottom-aligned text block and the cell edge, unzoomed. */
const VERTICAL_TEXT_PAD = 2;

// Border dash patterns, hoisted so paintBorders allocates no array per cell.
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
function buildMergeMap(
  merges: ReadonlyArray<MergeRect>,
  rowStart: number,
  rowEnd: number,
  cols: readonly number[],
): Map<number, MergeRect> | undefined {
  if (merges.length === 0 || cols.length === 0) return undefined;

  const map = new Map<number, MergeRect>();
  for (const m of merges) {
    const r0 = Math.max(m.r0, rowStart);
    const r1 = Math.min(m.r1, rowEnd - 1);
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
function mergeRowSpanHeight(
  merge: MergeRect,
  windowStart: number,
  windowRowCount: number,
  rowHeights: Float64Array | undefined,
  rowHeight: number,
): number {
  if (rowHeights === undefined) {
    return (merge.r1 - merge.r0 + 1) * rowHeight;
  }

  let total = 0;
  for (let row = merge.r0; row <= merge.r1; row++) {
    const index = row - windowStart;
    const insideWindow = index >= 0 && index < windowRowCount;
    total += insideWindow ? rowHeights[index]! : rowHeight;
  }
  return total;
}

/** Cached cumulative edges keyed by columns-array identity (see `columnEdges`). */
const columnEdgesCache = new WeakMap<RenderLayout["columns"], number[]>();

/** Cumulative left edges per visible column; `colX[c+1] - colX[c]` is its width. */
function columnEdges(layout: RenderLayout): number[] {
  const columns = layout.columns;
  const cached = columnEdgesCache.get(columns);
  if (cached !== undefined) return cached;

  const colX: number[] = new Array(columns.length + 1);
  colX[0] = 0;
  for (let c = 0; c < columns.length; c++) {
    colX[c + 1] = colX[c]! + columns[c]!.width;
  }
  columnEdgesCache.set(columns, colX);
  return colX;
}

/**
 * Put `family` in front of the font string's family list. The theme families
 * stay as fallbacks, so a family the browser lacks renders in the theme font.
 * `family` is validated (see cell-style-fields.ts) to need only quoting.
 */
function withFontFamily(font: string, family: string): string {
  const sizeMatch = FONT_PX_RE.exec(font);
  if (!sizeMatch || sizeMatch.index === undefined) return font;
  const fromSize = font.slice(sizeMatch.index);
  const sizeToken = /^\S+/.exec(fromSize)?.[0] ?? fromSize;
  const themeFamilies = fromSize.slice(sizeToken.length).trim();
  const families = themeFamilies ? `"${family}", ${themeFamilies}` : `"${family}"`;
  return `${font.slice(0, sizeMatch.index)}${sizeToken} ${families}`;
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
  const base = style.fontFamily === undefined ? sized : withFontFamily(sized, style.fontFamily);
  const sizeMatch = FONT_PX_RE.exec(base);
  if (!sizeMatch || sizeMatch.index === undefined) return base;

  const prefix = base.slice(0, sizeMatch.index).trim().split(/\s+/).filter(Boolean);
  const themeWeight = prefix.find(
    (token) => FONT_WEIGHT_TOKEN_RE.test(token) && token !== "normal",
  );
  const themeStyle = prefix.find((token) => FONT_STYLE_TOKEN_RE.test(token) && token !== "normal");
  const themeStyleIndex = themeStyle === undefined ? -1 : prefix.indexOf(themeStyle);
  const retainedPrefix = prefix.filter(
    (token, index) =>
      !FONT_WEIGHT_TOKEN_RE.test(token) &&
      !FONT_STYLE_TOKEN_RE.test(token) &&
      !(
        style.italic &&
        themeStyle === "oblique" &&
        index === themeStyleIndex + 1 &&
        FONT_ANGLE_TOKEN_RE.test(token)
      ),
  );

  const font = [
    ...(style.italic ? ["italic"] : themeStyle ? [themeStyle] : []),
    ...retainedPrefix,
    ...(style.bold ? ["bold"] : themeWeight && themeWeight !== "normal" ? [themeWeight] : []),
    base.slice(sizeMatch.index),
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
let graphemeSegmenter: Intl.Segmenter | undefined;

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
  private isClustered = false;
  /** Units known to exist. Exact once `segments` is undefined. */
  private known = 0;

  /** Starts on `paragraph`, reusing the offset buffer of the previous one. */
  reset(paragraph: string): void {
    this.ends.length = 0;
    this.isClustered = MAY_HAVE_CLUSTERS.test(paragraph);
    if (this.isClustered) {
      graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
      this.segments = graphemeSegmenter.segment(paragraph)[Symbol.iterator]();
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
    return this.isClustered ? (this.ends[unit] ?? 0) : unit + 1;
  }
}

/**
 * Wrapped-only line layout; the ordinary single-line path never calls this.
 * `maxLines` bounds the work for cells whose block cannot fit: the caller only
 * draws lines that fit the cell height, so generating more than
 * `floor(height / lineHeight) + 1` lines cannot change the pixels. A result
 * whose length reaches `maxLines` therefore means "more lines exist".
 *
 * Lines break between graphemes, never inside an emoji or a cluster. Inside
 * a cluster a prefix can be wider than the whole (a half-built ZWJ sequence),
 * but across graphemes width grows with length, so each break is found by
 * search instead of measuring every prefix, which made a line of L characters
 * cost L measurements of growing strings. Joining scripts such as Arabic can
 * shrink slightly when a letter takes its final form; there the search may
 * pick a different break than a scan would, but every line it picks fits.
 * The search gallops forward from the previous line's length, then bisects,
 * so measured text stays close to one line long however long the paragraph is.
 */
function layoutTextLinesInto(
  ctx: Ctx,
  text: string,
  width: number,
  maxLines: number,
  lines: string[],
): string[] {
  const limit = Math.max(1, maxLines);
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
      const overflowUnit = low;

      // A first unit too wide for the cell still gets a line of its own.
      // Otherwise break after the last whitespace up to the overflowing unit
      // (it may be that whitespace), or mid-word just before it.
      let last = first;
      if (overflowUnit > first) {
        last = overflowUnit - 1;
        for (let unit = overflowUnit; unit >= first; unit--) {
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
  return layoutTextLinesInto(ctx, text, width, Number.POSITIVE_INFINITY, []);
}

/**
 * Top edge of a text block `blockHeight` tall inside a cell at `y` of height
 * `h`. A block taller than the cell is top-anchored whatever the alignment, so
 * its first lines stay readable.
 */
function textBlockTop(
  verticalAlign: CellVerticalAlign | undefined,
  y: number,
  h: number,
  blockHeight: number,
  zoom: number,
): number {
  const free = h - blockHeight;
  if (free <= 0) return y;
  const pad = Math.min(VERTICAL_TEXT_PAD * zoom, free / 2);
  if (verticalAlign === "top") return y + pad;
  if (verticalAlign === "bottom") return y + free - pad;
  return y + free / 2;
}

/**
 * Draw horizontally-aligned text inside a cell or header rect. `cy` is the
 * vertical center (baseline is "middle"). Deliberately omit Canvas's
 * `maxWidth`: browsers satisfy it by horizontally distorting glyphs.
 */
function fillAlignedText(
  ctx: Ctx,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
): void {
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + w - CELL_PAD, cy);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, cy);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + CELL_PAD, cy);
  }
}

/**
 * Draw underline and/or strikethrough for a drawn text run. Called only when the
 * resolved style requests a decoration, so the `measureText` and regex cost stay
 * off the undecorated hot path. Each line is a 1px filled rect spanning the glyph
 * run and reuses the current fill (already set to the text color by the caller).
 */
function paintTextDecoration(
  ctx: Ctx,
  style: CellStyle,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
  fontPx: number,
): void {
  const runWidth = ctx.measureText(text).width;
  if (runWidth <= 0) return;

  let left: number;
  if (align === "right") left = x + w - CELL_PAD - runWidth;
  else if (align === "center") left = x + w / 2 - runWidth / 2;
  else left = x + CELL_PAD;

  const effectiveFontPx = fontPx || 12;

  if (style.underline) {
    // Just under the baseline, which sits ~0.4em below the "middle" text origin.
    ctx.fillRect(left, Math.round(cy + effectiveFontPx * 0.4), runWidth, 1);
  }

  if (style.strikethrough) {
    // Through the run's visual middle (≈ the "middle" baseline origin at `cy`).
    ctx.fillRect(left, Math.round(cy), runWidth, 1);
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

function applyFont(ctx: Ctx, state: PaintState, font: string): void {
  if (state.lastFont !== font) {
    ctx.font = font;
    state.lastFont = font;
  }
}

function applyFill(ctx: Ctx, state: PaintState, fill: string): void {
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
function textOnFill(
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
function emptyValue(value: CellScalar | undefined): boolean {
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
  const nCols = view.cols.length;
  for (let index = 0; index < view.values.length; index++) {
    const value = view.values[index];
    if (typeof value !== "string" || value === "") continue;
    const cj = index % nCols;
    const col = view.cols[cj] ?? -1;
    const leftSpill = cj > 0 && view.cols[cj - 1] === col - 1 && emptyValue(view.values[index - 1]);
    const rightSpill =
      cj < nCols - 1 && view.cols[cj + 1] === col + 1 && emptyValue(view.values[index + 1]);
    if (leftSpill || rightSpill) return false;
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
  const rowsMoved = prev.scrollTop !== viewport.scrollTop;
  const columnsMoved = prev.scrollLeft !== viewport.scrollLeft;
  if (rowsMoved === columnsMoved) return undefined;
  if (columnsMoved && !sidewaysSafe) return undefined;

  // Blit only exact device-pixel shifts. A fractional shift would copy pixels
  // rounded to the nearest device pixel while the exposed strip repaints at
  // the true offset - each touchpad scroll then strands sub-pixel-shifted
  // stale glyph slices that accumulate into visible ghosting.
  const deltaDevice = rowsMoved
    ? (viewport.scrollTop - prev.scrollTop) * dpr
    : (viewport.scrollLeft - prev.scrollLeft) * dpr;
  const deltaPx = Math.round(deltaDevice);
  if (Math.abs(deltaDevice - deltaPx) > 0.001) return undefined;
  const shift = { deltaPx, dpr };
  return rowsMoved
    ? blitRows(ctx, canvas, theme, viewport, shift)
    : blitColumns(ctx, canvas, theme, viewport, shift);
}

/** A whole device-pixel scroll shift, and the canvas's device pixel ratio. */
interface PixelShift {
  deltaPx: number;
  dpr: number;
}

/** {@link blitScroll} along the rows: the body below the header moves. */
function blitRows(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  viewport: Viewport,
  { deltaPx, dpr }: PixelShift,
): PaintDamage | undefined {
  const bodyTop = theme.headerHeight;
  if (viewport.height - bodyTop <= 0) return undefined;
  const bodyTopPx = Math.round(bodyTop * dpr);
  const heightPx = Math.round(viewport.height * dpr);
  const widthPx = Math.round(viewport.width * dpr);
  const bodyHPx = heightPx - bodyTopPx;
  const shiftPx = Math.abs(deltaPx);
  if (shiftPx === 0 || shiftPx >= bodyHPx) return undefined;

  const copyH = bodyHPx - shiftPx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (deltaPx > 0) {
    ctx.drawImage(canvas, 0, bodyTopPx + shiftPx, widthPx, copyH, 0, bodyTopPx, widthPx, copyH);
    return {
      x: 0,
      y: viewport.height - shiftPx / dpr,
      w: viewport.width,
      h: shiftPx / dpr,
    };
  }

  ctx.drawImage(canvas, 0, bodyTopPx, widthPx, copyH, 0, bodyTopPx + shiftPx, widthPx, copyH);
  return { x: 0, y: bodyTop, w: viewport.width, h: shiftPx / dpr };
}

/** {@link blitScroll} along the columns: the header and body right of the gutter move. */
function blitColumns(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  viewport: Viewport,
  { deltaPx, dpr }: PixelShift,
): PaintDamage | undefined {
  const gutter = theme.rowHeaderWidth;
  if (viewport.width - gutter <= 0) return undefined;
  const gutterPx = Math.round(gutter * dpr);
  const heightPx = Math.round(viewport.height * dpr);
  const widthPx = Math.round(viewport.width * dpr);
  const bodyWPx = widthPx - gutterPx;
  const shiftPx = Math.abs(deltaPx);
  if (shiftPx === 0 || shiftPx >= bodyWPx) return undefined;

  const copyW = bodyWPx - shiftPx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (deltaPx > 0) {
    ctx.drawImage(canvas, gutterPx + shiftPx, 0, copyW, heightPx, gutterPx, 0, copyW, heightPx);
    return {
      x: viewport.width - shiftPx / dpr,
      y: 0,
      w: shiftPx / dpr,
      h: viewport.height,
    };
  }

  ctx.drawImage(canvas, gutterPx, 0, copyW, heightPx, gutterPx + shiftPx, 0, copyW, heightPx);
  return { x: gutter, y: 0, w: shiftPx / dpr, h: viewport.height };
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
    scrollTop,
    scrollLeft,
    rowTops,
    rowHeights,
    rowNumbers,
    filteredRows,
    filterHeader,
  } = viewport;
  const { rowHeight, headerHeight } = theme;
  const colX = columnEdges(layout);
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

  const styleCache = new Map<number, CellStyle>();
  const styleStride = view.styles.length || 1;
  const merges = layout.merges;
  const mergeIndex = merges === undefined ? undefined : prepareMergeIndex(merges);
  const visibleMerges =
    mergeIndex === undefined
      ? undefined
      : intersectingMerges(mergeIndex, view.rows.start, view.rows.end, view.cols);
  let minimumVisibleColumn = view.cols[0] ?? 0;
  let maximumVisibleColumn = view.cols[0] ?? -1;
  for (let index = 1; index < view.cols.length; index++) {
    minimumVisibleColumn = Math.min(minimumVisibleColumn, view.cols[index]!);
    maximumVisibleColumn = Math.max(maximumVisibleColumn, view.cols[index]!);
  }

  const mergeMap =
    visibleMerges === undefined
      ? undefined
      : buildMergeMap(visibleMerges, view.rows.start, view.rows.end, view.cols);

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
  applyFont(ctx, state, theme.font);

  applyFill(ctx, state, theme.bg);
  if (damage) ctx.fillRect(damage.x, damage.y, damage.w, damage.h);
  else if (pane) ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  else ctx.fillRect(0, 0, width, height);

  const nCols = view.cols.length;
  const nRows = view.rows.end - view.rows.start;
  const clipTop = Math.max(damage ? damage.y : 0, pane ? pane.y : 0);
  const clipBottom = Math.min(
    damage ? damage.y + damage.h : height,
    pane ? pane.y + pane.h : height,
  );
  const paintTop = Math.max(headerHeight, clipTop);
  const paintBottom = Math.min(height, clipBottom);
  // A sideways blit leaves a strip of columns to paint; cells, headers and the
  // row gutter outside it are skipped, not painted under the clip.
  const paintLeft = Math.max(damage ? damage.x : 0, pane ? pane.x : 0);
  const paintRight = Math.min(damage ? damage.x + damage.w : width, pane ? pane.x + pane.w : width);

  ctx.save();
  ctx.beginPath();
  ctx.rect(g, headerHeight, Math.max(0, width - g), Math.max(0, height - headerHeight));
  ctx.clip();
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const rowTop = rowTops !== undefined ? rowTops[ri]! : row * rowHeight;
    const rowH = rowHeights !== undefined ? rowHeights[ri]! : rowHeight;
    const y = headerHeight + rowTop - scrollTop;
    if (y + rowH <= paintTop || y >= paintBottom) continue;
    for (let cj = 0; cj < nCols; cj++) {
      const col = view.cols[cj]!;
      const x = colX[col]! - scrollLeft + g;
      const w = colX[col + 1]! - colX[col]!;
      if (x + w <= g || x >= width) continue;
      const merge = mergeMap !== undefined ? mergeMap.get(row * MERGE_KEY_STRIDE + col) : undefined;
      if (merge && (merge.r0 !== row || merge.c0 !== col)) continue; // covered by a merge
      const cw = merge ? colX[merge.c1 + 1]! - colX[merge.c0]! : w;
      const ch = merge
        ? mergeRowSpanHeight(merge, view.rows.start, nRows, rowHeights, rowHeight)
        : rowH;
      const i = ri * nCols + cj;
      const value = view.values[i] ?? null;
      const styleId = view.styleIds[i]!;
      const style = view.styles[styleId] ?? EMPTY_STYLE;
      const styleKey = col * styleStride + styleId;
      // An AutoFilter header cell lays out its text in a box that ends a gap
      // before its filter button, for every alignment, as in Excel.
      const textRight =
        filterHeader !== undefined &&
        row === filterHeader.row &&
        col >= filterHeader.start &&
        col <= filterHeader.end
          ? filterTextRight({ x, y, w: cw, h: ch })
          : undefined;

      // Sheets lets text spill through adjacent empty cells, but never through
      // occupied cells. Compute the contiguous empty run around this cell; the
      // painter chooses the relevant side after resolving alignment. Numbers
      // and custom renderers deliberately keep their own cell bounds, and a
      // filter header cell keeps its text in its box.
      let spillX = x;
      let spillRight = x + cw;
      if (!merge && textRight === undefined && typeof value === "string" && value !== "") {
        for (let k = cj - 1; k >= 0; k--) {
          const adjacent = view.cols[k]! + 1 === view.cols[k + 1]!;
          const neighbour = view.values[ri * nCols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spillX = colX[view.cols[k]!]! - scrollLeft + g;
        }

        for (let k = cj + 1; k < nCols; k++) {
          const adjacent = view.cols[k - 1]! + 1 === view.cols[k]!;
          const neighbour = view.values[ri * nCols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spillRight = colX[view.cols[k]! + 1]! - scrollLeft + g;
        }
      }
      if (Math.max(x + cw, spillRight) <= paintLeft || Math.min(x, spillX) >= paintRight) continue;

      paintCell(
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
        textRight,
        spillX,
        spillRight - spillX,
        renderers,
        state,
        styleKey,
        styleCache,
      );
    }
  }

  // Gridlines are filled one-pixel rectangles, not stroked lines: a long
  // stroked line is not rasterized the same at every offset, so a line copied
  // by a scroll blit could differ by a pixel from the line a full repaint draws.
  ctx.fillStyle = theme.gridLine;
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const rowBottom =
      rowTops !== undefined && rowHeights !== undefined
        ? rowTops[ri]! + rowHeights[ri]!
        : (row + 1) * rowHeight;
    const lineY = Math.round(headerHeight + rowBottom - scrollTop) - 0.5;
    if (lineY < paintTop || lineY > paintBottom) continue;
    let cursorX = g;
    const mergesByColumn =
      mergeIndex === undefined
        ? undefined
        : horizontalMergeGaps(mergeIndex, row, minimumVisibleColumn, maximumVisibleColumn);
    if (mergesByColumn) {
      for (const merge of mergesByColumn) {
        if (merge.r0 > row || row >= merge.r1) continue;
        const gapStart = Math.max(g, colX[merge.c0]! - scrollLeft + g);
        const gapEnd = Math.min(width, colX[merge.c1 + 1]! - scrollLeft + g);
        if (gapEnd <= cursorX || gapStart >= width) continue;
        if (gapStart > cursorX) ctx.fillRect(cursorX, lineY - 0.5, gapStart - cursorX, 1);

        cursorX = Math.max(cursorX, gapEnd);
      }
    }

    if (cursorX < width) ctx.fillRect(cursorX, lineY - 0.5, width - cursorX, 1);
  }

  ctx.restore();
  state.lastFont = theme.font;

  ctx.fillStyle = theme.gridLine;
  state.lastFill = theme.gridLine;
  const appendVerticalGridline = (c: number, lineX: number): void => {
    if (lineX < g || lineX > width) return;
    const mergesByRow =
      mergeIndex === undefined
        ? undefined
        : verticalMergeGaps(mergeIndex, c, view.rows.start, view.rows.end - 1);
    let cursorY = 0;
    if (mergesByRow) {
      for (const merge of mergesByRow) {
        if (merge.c0 >= c || c > merge.c1) continue;
        const mergeIndex = merge.r0 - view.rows.start;
        const mergeContentTop =
          rowTops !== undefined && mergeIndex >= 0 && mergeIndex < nRows
            ? rowTops[mergeIndex]!
            : merge.r0 * rowHeight;
        const mergeTop = headerHeight + mergeContentTop - scrollTop;
        const gapStart = Math.max(0, mergeTop);
        const gapEnd = Math.min(
          height,
          mergeTop + mergeRowSpanHeight(merge, view.rows.start, nRows, rowHeights, rowHeight),
        );
        if (gapEnd <= cursorY || gapStart >= height) continue;
        if (gapStart > cursorY) ctx.fillRect(lineX - 0.5, cursorY, 1, gapStart - cursorY);

        cursorY = Math.max(cursorY, gapEnd);
      }
    }

    if (cursorY < height) ctx.fillRect(lineX - 0.5, cursorY, 1, height - cursorY);
  };

  for (let cj = 0; cj < nCols; cj++) {
    const c = view.cols[cj]!;
    appendVerticalGridline(c, Math.round(colX[c]! - scrollLeft + g) - 0.5);
  }

  if (nCols > 0) {
    const c = view.cols[nCols - 1]! + 1;
    appendVerticalGridline(c, Math.round(colX[c]! - scrollLeft + g) - 0.5);
  }

  if (clipTop < headerHeight) {
    const strip = { width, left: paintLeft, right: paintRight };
    paintHeader(ctx, theme, layout, colX, view.cols, strip, scrollLeft, g, state);
  }

  if (g > 0 && paintLeft < g) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, g, height);
    ctx.clip();
    applyFill(ctx, state, theme.headerBg);
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
    ctx.rect(0, headerHeight, g, Math.max(0, height - headerHeight));
    ctx.clip();
    applyFont(ctx, state, theme.font);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const bandTop =
        rowTops !== undefined
          ? headerHeight + rowTops[ri]! - scrollTop
          : headerHeight + row * rowHeight - scrollTop;
      const bandHeight = rowHeights !== undefined ? rowHeights[ri]! : rowHeight;
      // Cull by row band, not center: a damage strip can cover half a row's
      // glyphs while the center sits outside it - skipping the row would let
      // the strip's background erase that half and slice the digits.
      if (bandTop + bandHeight < paintTop || bandTop > paintBottom) continue;
      const cy = bandTop + bandHeight / 2;
      const number = rowNumbers?.[ri] ?? row + 1;
      const listed =
        filteredRows !== undefined &&
        number - 1 >= filteredRows.start &&
        number - 1 <= filteredRows.end;
      applyFill(ctx, state, listed ? theme.selectionBorder : theme.headerFg);
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
function clipCell(ctx: Ctx, x: number, y: number, w: number, h: number): void {
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
function narrowGeneral(
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

function paintCell(
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
  textRight: number | undefined,
  spillX: number,
  spillW: number,
  renderers: ReadonlyMap<string, CellRenderer>,
  state: PaintState,
  styleKey: number,
  styleCache: Map<number, CellStyle>,
): void {
  const column = layout.columns[col];

  // The column's `cellStyle` is the base layer and the per-cell style wins on any
  // shared property. Skip the merge (and its allocation) when no column style
  // exists; otherwise reuse a merge cached per (column, view-local style id).
  const columnStyle = column?.cellStyle;
  let effective: CellStyle;
  if (columnStyle === undefined) {
    effective = style;
  } else {
    const cached = styleCache.get(styleKey);
    if (cached !== undefined) {
      effective = cached;
    } else {
      effective = { ...columnStyle, ...style };
      styleCache.set(styleKey, effective);
    }
  }

  if (effective.backgroundColor) {
    applyFill(ctx, state, effective.backgroundColor);
    ctx.fillRect(x, y, w, h);
  }

  paintBorders(ctx, effective, x, y, w, h);

  const custom = column?.renderer ? renderers.get(column.renderer) : undefined;
  if (custom?.dom || layout.domRendererColumns?.[col] === 1) return;
  if (custom?.canvas) {
    ctx.save();
    clipCell(ctx, x, y, w, h);
    custom.canvas(ctx as CanvasRenderingContext2D, { value, x, y, w, h, theme, style: effective });
    ctx.restore();
    return;
  }

  if (value === null || value === "") return;

  const effectiveFont = fontFor(theme, effective, layout.zoom ?? 1, state.fontCache);
  applyFont(ctx, state, effectiveFont);
  const numeric = typeof value === "number";
  const numberFormat = effective.numberFormat ?? column?.numberFormat;
  // Excel paints a number in its format section's color, such as `[Red]`, over the font color.
  const formatColor =
    numeric && numberFormat !== undefined ? numberFormatColor(value, numberFormat) : undefined;
  applyFill(
    ctx,
    state,
    formatColor ??
      effective.color ??
      (effective.backgroundColor
        ? textOnFill(
            ctx,
            state,
            state.cellTextOnFill,
            effective.backgroundColor,
            theme.fg,
            theme.bg,
          )
        : theme.fg),
  );

  const align =
    effective.align ??
    (typeof value === "boolean"
      ? "center"
      : column?.type === "number" ||
          column?.type === "currency" ||
          (column?.type === "general" && typeof value === "number")
        ? "right"
        : "left");
  let text = cellDisplayText(value, numberFormat, column?.numberLocale);
  // A filter header's text pads on the left as usual and ends at its text box.
  const textW = textRight === undefined ? w : textRight + CELL_PAD - x;
  const availableTextWidth = Math.max(0, textW - CELL_PAD * 2);
  if (numeric) {
    if (state.measuredFont !== state.lastFont) {
      state.measuredFont = state.lastFont;
      state.digitWidth = ctx.measureText("0").width;
      state.hashWidth = ctx.measureText("#").width || 1;
    }

    // Most numeric cells are comfortably wider than their formatted value.
    // Only pay for exact measurement when a cached digit-width estimate says
    // the run is close enough to the edge to plausibly overflow.
    const mayOverflow = text.length * state.digitWidth > availableTextWidth * 0.8;
    const exactWidth = mayOverflow ? ctx.measureText(text).width : 0;
    if (exactWidth > availableTextWidth) {
      text =
        narrowGeneral(ctx, value, numberFormat, column?.numberLocale, availableTextWidth) ??
        "#".repeat(Math.max(1, Math.floor(availableTextWidth / state.hashWidth)));
    }
  }

  const fontPx =
    effective.fontSize === undefined
      ? Number.parseFloat(FONT_PX_RE.exec(theme.font)?.[1] ?? "") || 12
      : effective.fontSize * (layout.zoom ?? 1);
  const zoom = layout.zoom ?? 1;
  const lineHeight = fontPx * 1.2;

  ctx.save();
  if (effective.wrap && !numeric) {
    clipCell(ctx, x, y, (textRight ?? x + w) - x, h);

    // The draw loop below never paints a line whose band starts past the cell,
    // and a block taller than the cell is top-anchored either way, so laying
    // out one line past the last drawable one changes no pixel.
    const maxLines = Math.floor(h / lineHeight) + 1;
    const lines = layoutTextLinesInto(ctx, text, availableTextWidth, maxLines, []);
    const blockHeight = lines.length * lineHeight;
    const firstCy = textBlockTop(effective.verticalAlign, y, h, blockHeight, zoom) + lineHeight / 2;

    for (let line = 0; line < lines.length; line++) {
      const cy = firstCy + line * lineHeight;
      if (cy - lineHeight / 2 >= y + h) break;
      const lineText = lines[line]!;
      fillAlignedText(ctx, lineText, align, x, textW, cy);
      if (effective.underline || effective.strikethrough) {
        paintTextDecoration(ctx, effective, lineText, align, x, textW, cy, fontPx);
      }
    }
  } else {
    // Left-aligned strings spill right, right-aligned strings spill left, and
    // centered strings can use both sides. Numeric output never spills.
    let textClipX = x;
    let textClipW = textW;
    if (!numeric) {
      if (align === "left") textClipW = spillX + spillW - x;
      else if (align === "right") {
        textClipX = spillX;
        textClipW = x + textW - spillX;
      } else {
        textClipX = spillX;
        textClipW = spillW;
      }
    }

    // Unset or "middle" keeps the exact centered baseline for existing sheets.
    const cy =
      effective.verticalAlign === undefined || effective.verticalAlign === "middle"
        ? y + h / 2
        : textBlockTop(effective.verticalAlign, y, h, lineHeight, zoom) + lineHeight / 2;
    // A filter header's text clips at its text box, the gap before the button.
    if (textRight !== undefined) textClipW = Math.min(textClipW, textRight - textClipX);
    clipCell(ctx, textClipX, y, textClipW, h);
    fillAlignedText(ctx, text, align, x, textW, cy);
    if (effective.underline || effective.strikethrough) {
      paintTextDecoration(ctx, effective, text, align, x, textW, cy, fontPx);
    }
  }

  ctx.restore();
}

function paintBorders(
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

function paintHeader(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  colX: number[],
  cols: readonly number[],
  strip: PaintStrip,
  scrollLeft: number,
  g: number,
  state: PaintState,
): void {
  const h = theme.headerHeight;

  // Default header bar; any per-column `headerStyle` background paints over it.
  applyFill(ctx, state, theme.headerBg);
  ctx.fillRect(0, 0, strip.width, h);

  const cy = h / 2;
  const left = Math.max(g, strip.left);
  const right = Math.min(strip.width, strip.right);
  for (const c of cols) {
    const column = layout.columns[c]!;
    const x = colX[c]! - scrollLeft + g;
    const w = colX[c + 1]! - colX[c]!;
    if (x + w <= left || x >= right) continue;

    const headerStyle = column.headerStyle;

    if (headerStyle?.backgroundColor) {
      applyFill(ctx, state, headerStyle.backgroundColor);
      ctx.fillRect(x, 0, w, h);
    }

    // Theme header defaults are bold and centered; `headerStyle` overrides where set.
    const bold = headerStyle?.bold ?? true;
    applyFont(
      ctx,
      state,
      fontFor(
        theme,
        { bold, italic: headerStyle?.italic, fontSize: headerStyle?.fontSize },
        layout.zoom ?? 1,
        state.fontCache,
      ),
    );
    applyFill(
      ctx,
      state,
      headerStyle?.color ??
        (headerStyle?.backgroundColor
          ? textOnFill(
              ctx,
              state,
              state.headerTextOnFill,
              headerStyle.backgroundColor,
              theme.headerFg,
              theme.headerBg,
            )
          : theme.headerFg),
    );

    const align = headerStyle?.align ?? "center";
    ctx.save();
    clipCell(ctx, x, 0, w, h);
    fillAlignedText(ctx, column.header, align, x, w, cy);
    ctx.restore();
  }

  applyFill(ctx, state, theme.gridLine);
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

let mergeResourceStats: [indexConstructions: number, candidatesExamined: number] | undefined;
const mergeIndexCache = new WeakMap<ReadonlyArray<MergeRect>, PreparedMergeIndex>();
const axisStart = (merge: MergeRect, rows: boolean): number => (rows ? merge.r0 : merge.c0);
const axisEnd = (merge: MergeRect, rows: boolean): number => (rows ? merge.r1 : merge.c1);

function buildMergeAxis(merges: ReadonlyArray<MergeRect>, rows: boolean): MergeAxisIndex {
  const entries = [...merges].sort(
    (a, b) => axisStart(a, rows) - axisStart(b, rows) || axisEnd(a, rows) - axisEnd(b, rows),
  );
  const prefixMaxEnd = new Array<number>(entries.length);
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < entries.length; index++) {
    maximum = Math.max(maximum, axisEnd(entries[index]!, rows));
    prefixMaxEnd[index] = maximum;
  }
  return [entries, prefixMaxEnd, rows];
}

function mergeCandidateRange(
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
    if (axisStart(index[0][middle]!, index[2]) <= maximum) end = middle + 1;
    else last = middle;
  }
  return [first, end];
}

/** Prepared interval projections shared by interaction, clipboard, and paint paths. */
export type PreparedMergeIndex = readonly [rows: MergeAxisIndex, columns: MergeAxisIndex];

function queryMerges(
  prepared: PreparedMergeIndex,
  rowMinimum: number,
  rowMaximum: number,
  columnMinimum: number,
  columnMaximum: number,
): MergeRect[] {
  const rowRange = mergeCandidateRange(prepared[0], rowMinimum, rowMaximum);
  const columnRange = mergeCandidateRange(prepared[1], columnMinimum, columnMaximum);
  const rows = rowRange[1] - rowRange[0] <= columnRange[1] - columnRange[0];
  const index = prepared[rows ? 0 : 1];
  const range = rows ? rowRange : columnRange;
  const minimum = rows ? rowMinimum : columnMinimum;
  const matches: MergeRect[] = [];
  for (let position = range[0]; position < range[1]; position++) {
    const merge = index[0][position]!;
    if (mergeResourceStats) mergeResourceStats[1] += 1;
    if (
      axisEnd(merge, index[2]) >= minimum &&
      (rows
        ? merge.c1 >= columnMinimum && merge.c0 <= columnMaximum
        : merge.r1 >= rowMinimum && merge.r0 <= rowMaximum)
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
  return queryMerges(prepared, row, row, column, column)[0] ?? null;
}

export function intersectingMerges(
  prepared: PreparedMergeIndex,
  rowStart: number,
  rowEnd: number,
  columns: readonly number[],
): readonly MergeRect[] {
  if (rowStart >= rowEnd || columns.length === 0) return [];
  let minimumColumn = columns[0]!;
  let maximumColumn = minimumColumn;
  for (let index = 1; index < columns.length; index++) {
    minimumColumn = Math.min(minimumColumn, columns[index]!);
    maximumColumn = Math.max(maximumColumn, columns[index]!);
  }
  return queryMerges(prepared, rowStart, rowEnd - 1, minimumColumn, maximumColumn);
}

function horizontalMergeGaps(
  prepared: PreparedMergeIndex,
  row: number,
  columnMinimum = Number.NEGATIVE_INFINITY,
  columnMaximum = Number.POSITIVE_INFINITY,
): readonly MergeRect[] {
  return queryMerges(prepared, row, row, columnMinimum, columnMaximum)
    .filter((merge) => row < merge.r1)
    .sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1);
}

function verticalMergeGaps(
  prepared: PreparedMergeIndex,
  column: number,
  rowMinimum = Number.NEGATIVE_INFINITY,
  rowMaximum = Number.POSITIVE_INFINITY,
): readonly MergeRect[] {
  return queryMerges(prepared, rowMinimum, rowMaximum, column, column)
    .filter((merge) => merge.c0 < column)
    .sort((a, b) => a.r0 - b.r0 || a.r1 - b.r1);
}

export function prepareMergeIndex(merges: ReadonlyArray<MergeRect>): PreparedMergeIndex {
  let prepared = mergeIndexCache.get(merges);
  if (!prepared) {
    prepared = [buildMergeAxis(merges, true), buildMergeAxis(merges, false)];
    mergeIndexCache.set(merges, prepared);
    if (mergeResourceStats) mergeResourceStats[0] += 1;
  }
  return prepared;
}

export function getMergeIndexResourceStatsForTest(): MergeIndexResourceStats {
  return {
    indexConstructions: mergeResourceStats?.[0] ?? 0,
    candidatesExamined: mergeResourceStats?.[1] ?? 0,
  };
}

export function resetMergeIndexResourceStatsForTest(): void {
  mergeResourceStats = [0, 0];
}
