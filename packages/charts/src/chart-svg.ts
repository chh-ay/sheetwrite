import {
  type ChartKind,
  type ChartSeriesView,
  type ChartView,
  formatNumber,
} from "@sheetwrite/core";

import { SvgBuilder } from "./svg-dom.js";
import { thinToPixels } from "./thin.js";
import { type TickScale, tickScale } from "./ticks.js";

/** Box size in CSS pixels. */
export interface ChartSize {
  /** Width in CSS pixels; a negative width draws as `0`. */
  width: number;
  /** Height in CSS pixels; a negative height draws as `0`. */
  height: number;
}

/** Options for `renderChartSvg`. */
export interface ChartSvgOptions {
  /** Document that owns the new elements; the global `document` by default. */
  document?: Document;
}

/** Number of `--sheetwrite-chart-N` color variables; series colors repeat after the last one. */
const CHART_COLOR_COUNT = 8;

const TEXT_COLOR = "var(--sheetwrite-fg)";
const BACKGROUND_COLOR = "var(--sheetwrite-bg)";
const GRID_LINE_COLOR = "var(--sheetwrite-grid-line)";

const FONT_SIZE = 11;
const TITLE_FONT_SIZE = 14;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.4);
const TITLE_LINE_HEIGHT = Math.round(TITLE_FONT_SIZE * 1.4);
/** Average glyph width as a share of the font size. The SVG is often detached, so text cannot be measured. */
const GLYPH_WIDTH_RATIO = 0.6;
const ELLIPSIS = "…";

const OUTER_PADDING = 8;
const AXIS_LABEL_GAP = 4;
/** Smallest pixel distance between value ticks on a vertical axis. */
const VERTICAL_TICK_SPACING = 32;
/** Smallest pixel distance between value ticks on a horizontal axis. */
const HORIZONTAL_TICK_SPACING = 64;
/** Below this plot size in pixels, axes and marks cannot be read, so they are not drawn. */
const MIN_PLOT_SIZE = 8;
/** Category labels of a bar chart take at most this share of the width; rotated labels, of the height. */
const CATEGORY_LABEL_MAX_SHARE = 0.3;
/** Lines an outer category label wraps onto before it ends with an ellipsis. */
const MAX_GROUP_LABEL_LINES = 3;

/** Share of each category band that the column or bar group fills; the rest is the gap between groups. */
const BAR_GROUP_SHARE = 0.7;
const AREA_FILL_OPACITY = 0.45;
const LINE_WIDTH = 2;
const POINT_RADIUS = 3;
/** Inner radius of a doughnut as a share of its outer radius. */
const DOUGHNUT_HOLE_SHARE = 0.5;
/** Pie labels sit at this share of the radius. */
const PIE_LABEL_RADIUS_SHARE = 0.65;
/** A slice narrower than this angle in radians gets no label, because the label would not fit. */
const MIN_LABELED_SLICE_ANGLE = 0.3;
const LABEL_HALO_WIDTH = 3;
const PERCENT_FORMAT = "0%";

const LEGEND_SWATCH_SIZE = 10;
const LEGEND_SWATCH_GAP = 4;
const LEGEND_ITEM_GAP = 12;
const LEGEND_MAX_SHARE = 0.35;
const MAX_LEGEND_ROWS = 3;
const DEFAULT_LEGEND = "bottom";

const TRUNCATED_NOTE = "Not all points are shown: a source has more cells than a chart can draw.";
const REFERENCE_ERROR_NOTE = "#REF!: a source range was deleted.";

const KIND_NAMES: Readonly<Record<ChartKind, string>> = {
  column: "Column",
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  doughnut: "Doughnut",
  scatter: "Scatter",
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LegendEntry {
  label: string;
  color: string;
}

interface DrawContext {
  svg: SvgBuilder;
  root: SVGSVGElement;
  view: ChartView;
}

/** One numeric axis mapped onto a pixel interval; `start` is the pixel of `scale.min`. */
interface Axis {
  scale: TickScale;
  start: number;
  end: number;
}

/** CSS color of series (or pie slice) `index`. */
function series_color(index: number): string {
  return `var(--sheetwrite-chart-${(index % CHART_COLOR_COUNT) + 1})`;
}

function text_width(text: string, font_size = FONT_SIZE): number {
  return text.length * font_size * GLYPH_WIDTH_RATIO;
}

/** Shortens `text` with an ellipsis so its estimated width fits `max_width`. */
function fit_text(text: string, max_width: number, font_size = FONT_SIZE): string {
  if (text_width(text, font_size) <= max_width) return text;

  const characters = Math.floor(max_width / (font_size * GLYPH_WIDTH_RATIO)) - 1;
  return characters < 1 ? "" : `${text.slice(0, characters)}${ELLIPSIS}`;
}

function axis_pixel(axis: Axis, value: number): number {
  const span = axis.scale.max - axis.scale.min;
  return axis.start + ((value - axis.scale.min) / span) * (axis.end - axis.start);
}

function format_value(value: number, format: string | null, locale: string | null): string {
  return formatNumber(value, format ?? undefined, locale ?? undefined);
}

function category_text(
  category: string | number | boolean | null | undefined,
  format: string | null,
  locale: string | null,
): string {
  if (category === null || category === undefined) return "";
  if (typeof category === "number") return format_value(category, format, locale);
  if (typeof category === "boolean") return category ? "TRUE" : "FALSE";
  return category;
}

function point_count(series: readonly ChartSeriesView[]): number {
  return series.reduce((count, entry) => Math.max(count, entry.values.length), 0);
}

/**
 * One label for each category, from the first series that has categories;
 * 1, 2, 3… otherwise, as in Excel. With category levels, each label is the
 * text of its levels from the outside in, joined by spaces: an outer label
 * shows at the first category of its group, as Excel's one-row labels do.
 */
function category_labels(series: readonly ChartSeriesView[], count: number): string[] {
  const source = series.find((entry) => entry.categories.length > 0);
  const labels: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (!source || index >= source.categories.length) {
      labels.push(String(index + 1));
      continue;
    }

    const locale = source.numberLocale;
    let label = "";
    for (const level of source.categoryLevels) {
      const text = category_text(level.labels[index], level.formats[index] ?? null, locale);
      if (text !== "") label += `${text} `;
    }
    labels.push(
      label +
        category_text(source.categories[index], source.categoryFormats[index] ?? null, locale),
    );
  }

  return labels;
}

/**
 * The value axis format: the first series' format, as Excel's "linked to
 * source" axis uses the first series. A General first series keeps General
 * ticks even when a later series has a format.
 */
function value_axis_format(series: readonly ChartSeriesView[]): {
  format: string | null;
  locale: string | null;
} {
  const first = series[0];
  return {
    format: first?.numberFormats.find((code) => code !== null) ?? null,
    locale: first?.numberLocale ?? null,
  };
}

function value_range(series: readonly ChartSeriesView[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const entry of series) {
    for (const value of entry.values) {
      if (value === null || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return { min, max };
}

/** The tick count that keeps ticks at least `spacing` pixels apart. */
function max_tick_count(length: number, spacing: number): number {
  return Math.max(1, Math.floor(length / spacing));
}

/** The tick scale of a value axis with the label of each tick. */
interface ValueTicks {
  scale: TickScale;
  labels: string[];
  /** Estimated width of the widest label. */
  widest: number;
}

function value_ticks(scale: TickScale, label: (tick: number) => string): ValueTicks {
  const labels = scale.ticks.map(label);
  return { scale, labels, widest: Math.max(0, ...labels.map((text) => text_width(text))) };
}

/**
 * Ticks for a horizontal value axis. Its labels sit side by side, centered
 * on their ticks, so they need as much room as the widest label, not one
 * fixed spacing: the tick count starts at one per `HORIZONTAL_TICK_SPACING`
 * and drops until the widest label fits between neighbouring ticks.
 * `axis_length` is the length of the axis once the widest label is known,
 * because an end label can need room past the plot.
 */
function horizontal_value_ticks(
  min: number,
  max: number,
  label: (tick: number) => string,
  axis_length: (widest: number) => number,
): ValueTicks {
  let max_ticks = max_tick_count(axis_length(0), HORIZONTAL_TICK_SPACING);
  for (;;) {
    const ticks = value_ticks(tickScale(min, max, max_ticks, true), label);
    const steps = ticks.scale.ticks.length - 1;
    const pitch = axis_length(ticks.widest) / Math.max(1, steps);
    if (max_ticks <= 1 || steps <= 1 || pitch >= ticks.widest + AXIS_LABEL_GAP) return ticks;
    // Fewer steps than this scale has, so the step grows and the loop ends.
    max_ticks = Math.min(max_ticks, steps) - 1;
  }
}

/**
 * Draw every n-th tick label so labels that take `extent` pixels along the
 * axis do not overlap; 1 when all fit. Ticks are evenly spaced.
 */
function label_stride(axis: Axis, extent: number): number {
  const steps = axis.scale.ticks.length - 1;
  if (steps < 1) return 1;
  const pitch = Math.abs(axis.end - axis.start) / steps;
  return Math.max(1, Math.ceil(extent / pitch));
}

function chart_name(view: ChartView): string {
  const kind = `${KIND_NAMES[view.chart.kind]} chart`;
  return view.chart.title ? `${view.chart.title} (${kind})` : kind;
}

function chart_description(view: ChartView): string {
  if (view.series.length === 0) return "No series.";

  const parts = view.series.map((entry) => {
    const unit = entry.values.length === 1 ? "point" : "points";
    return `${entry.name} (${entry.values.length} ${unit})`;
  });
  return `Series: ${parts.join(", ")}.`;
}

function chart_notes(view: ChartView): string[] {
  const notes: string[] = [];
  if (view.series.some((entry) => entry.truncated)) notes.push(TRUNCATED_NOTE);
  if (view.series.some((entry) => entry.referenceError)) notes.push(REFERENCE_ERROR_NOTE);
  return notes;
}

function is_round(kind: ChartKind): boolean {
  return kind === "pie" || kind === "doughnut";
}

function legend_entries(view: ChartView): LegendEntry[] {
  if (!is_round(view.chart.kind)) {
    return view.series.map((entry, index) => ({ label: entry.name, color: series_color(index) }));
  }

  // A pie shows one series, so its legend names the slices.
  const first = view.series[0];
  if (!first) return [];
  const labels = category_labels([first], first.values.length);
  return labels.map((label, index) => ({ label, color: series_color(index) }));
}

function draw_title(context: DrawContext, box: Box): Box {
  const title = context.view.chart.title;
  if (!title) return box;

  const width = box.right - box.left;
  context.svg.text(
    fit_text(title, width, TITLE_FONT_SIZE),
    {
      class: "sheetwrite-chart-title",
      x: box.left + width / 2,
      y: box.top + TITLE_FONT_SIZE,
      "text-anchor": "middle",
      "font-size": TITLE_FONT_SIZE,
      "font-weight": 600,
    },
    context.root,
  );
  return { ...box, top: box.top + TITLE_LINE_HEIGHT };
}

function draw_notes(context: DrawContext, box: Box): Box {
  const notes = chart_notes(context.view);
  let bottom = box.bottom;

  // The last note sits at the bottom edge, so draw upward from it.
  for (const note of notes.toReversed()) {
    context.svg.text(
      fit_text(note, box.right - box.left),
      {
        class: "sheetwrite-chart-note",
        x: box.left,
        y: bottom - AXIS_LABEL_GAP,
        "font-size": FONT_SIZE,
        "font-style": "italic",
      },
      context.root,
    );
    bottom -= LINE_HEIGHT;
  }

  return { ...box, bottom };
}

function draw_legend_item(
  context: DrawContext,
  parent: Element,
  entry: LegendEntry,
  x: number,
  center_y: number,
  max_width: number,
): void {
  const item = context.svg.element("g", { class: "sheetwrite-chart-legend-item" }, parent);
  context.svg.element(
    "rect",
    {
      x,
      y: center_y - LEGEND_SWATCH_SIZE / 2,
      width: LEGEND_SWATCH_SIZE,
      height: LEGEND_SWATCH_SIZE,
      fill: entry.color,
    },
    item,
  );
  context.svg.text(
    fit_text(entry.label, max_width - LEGEND_SWATCH_SIZE - LEGEND_SWATCH_GAP),
    {
      x: x + LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP,
      y: center_y,
      "dominant-baseline": "central",
      "font-size": FONT_SIZE,
    },
    item,
  );
}

function legend_item_width(entry: LegendEntry): number {
  return LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP + text_width(entry.label);
}

function draw_side_legend(
  context: DrawContext,
  entries: readonly LegendEntry[],
  side: "left" | "right",
  box: Box,
): Box {
  const width = Math.min(
    Math.max(...entries.map(legend_item_width)),
    (box.right - box.left) * LEGEND_MAX_SHARE,
  );
  const fitting = entries.slice(0, Math.max(1, Math.floor((box.bottom - box.top) / LINE_HEIGHT)));
  const legend = context.svg.element(
    "g",
    { class: "sheetwrite-chart-legend", "data-placement": side },
    context.root,
  );
  const x = side === "right" ? box.right - width : box.left;
  const top = (box.top + box.bottom - fitting.length * LINE_HEIGHT) / 2;

  fitting.forEach((entry, index) => {
    draw_legend_item(context, legend, entry, x, top + (index + 0.5) * LINE_HEIGHT, width);
  });

  return side === "right"
    ? { ...box, right: x - LEGEND_ITEM_GAP }
    : { ...box, left: x + width + LEGEND_ITEM_GAP };
}

function draw_row_legend(
  context: DrawContext,
  entries: readonly LegendEntry[],
  side: "top" | "bottom",
  box: Box,
): Box {
  const available = box.right - box.left;
  const rows: Array<{ entries: LegendEntry[]; width: number }> = [];

  // Wrap entries into centered rows; entries past the last row are left out, as Excel does.
  for (const entry of entries) {
    const width = Math.min(legend_item_width(entry), available);
    const row = rows[rows.length - 1];
    if (row && row.width + LEGEND_ITEM_GAP + width <= available) {
      row.entries.push(entry);
      row.width += LEGEND_ITEM_GAP + width;
    } else if (rows.length < MAX_LEGEND_ROWS) {
      rows.push({ entries: [entry], width });
    } else {
      break;
    }
  }

  const legend = context.svg.element(
    "g",
    { class: "sheetwrite-chart-legend", "data-placement": side },
    context.root,
  );
  const height = rows.length * LINE_HEIGHT;
  const top = side === "top" ? box.top : box.bottom - height;

  rows.forEach((row, row_index) => {
    let x = box.left + (available - row.width) / 2;
    const center_y = top + (row_index + 0.5) * LINE_HEIGHT;
    for (const entry of row.entries) {
      const width = Math.min(legend_item_width(entry), available);
      draw_legend_item(context, legend, entry, x, center_y, width);
      x += width + LEGEND_ITEM_GAP;
    }
  });

  return side === "top"
    ? { ...box, top: box.top + height + AXIS_LABEL_GAP }
    : { ...box, bottom: box.bottom - height - AXIS_LABEL_GAP };
}

function draw_legend(context: DrawContext, box: Box): Box {
  const placement = context.view.chart.legend ?? DEFAULT_LEGEND;
  const entries = legend_entries(context.view);
  if (placement === "none" || entries.length === 0) return box;

  return placement === "left" || placement === "right"
    ? draw_side_legend(context, entries, placement, box)
    : draw_row_legend(context, entries, placement, box);
}

/** Draws the axis titles and returns the box that is left for tick labels and the plot. */
function draw_axis_titles(context: DrawContext, box: Box): Box {
  const axes = context.view.chart.axes;
  const region = { ...box };

  if (axes?.xTitle) {
    context.svg.text(
      fit_text(axes.xTitle, region.right - region.left),
      {
        class: "sheetwrite-chart-axis-title",
        "data-axis": "x",
        x: (region.left + region.right) / 2,
        y: region.bottom - AXIS_LABEL_GAP,
        "text-anchor": "middle",
        "font-size": FONT_SIZE,
      },
      context.root,
    );
    region.bottom -= LINE_HEIGHT;
  }

  if (axes?.yTitle) {
    const center_x = region.left + FONT_SIZE;
    const center_y = (region.top + region.bottom) / 2;
    context.svg.text(
      fit_text(axes.yTitle, region.bottom - region.top),
      {
        class: "sheetwrite-chart-axis-title",
        "data-axis": "y",
        x: center_x,
        y: center_y,
        "text-anchor": "middle",
        transform: `rotate(-90 ${center_x} ${center_y})`,
        "font-size": FONT_SIZE,
      },
      context.root,
    );
    region.left += LINE_HEIGHT;
  }

  return region;
}

/**
 * Value labels plus a grid line at each tick; `vertical` axes run from bottom
 * to top. Each label takes `label_extent` pixels along the axis; on an axis
 * too short for all of them, every n-th label is drawn, as on category axes.
 */
function draw_value_axis(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  vertical: boolean,
  labels: readonly string[],
  label_extent: number,
): void {
  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-value-axis", "font-size": FONT_SIZE },
    context.root,
  );
  const stride = label_stride(axis, label_extent);

  axis.scale.ticks.forEach((tick, index) => {
    const pixel = axis_pixel(axis, tick);
    context.svg.element(
      "line",
      vertical
        ? { x1: plot.left, x2: plot.right, y1: pixel, y2: pixel, stroke: GRID_LINE_COLOR }
        : { x1: pixel, x2: pixel, y1: plot.top, y2: plot.bottom, stroke: GRID_LINE_COLOR },
      group,
    );
    if (index % stride !== 0) return;

    const label = labels[index] ?? "";
    context.svg.text(
      label,
      vertical
        ? {
            x: plot.left - AXIS_LABEL_GAP,
            y: pixel,
            "text-anchor": "end",
            "dominant-baseline": "central",
          }
        : { x: pixel, y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE, "text-anchor": "middle" },
      group,
    );
  });
}

/**
 * Category labels on one axis. When labels would overlap, only every n-th label
 * is drawn, so the visible labels keep their full text where they fit.
 * `label_width` is the room left of a vertical axis; horizontal labels fit their band.
 */
function draw_category_labels(
  context: DrawContext,
  labels: readonly string[],
  plot: Box,
  vertical: boolean,
  label_width: number,
): void {
  if (labels.length === 0) return;

  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-axis", "font-size": FONT_SIZE },
    context.root,
  );
  const length = vertical ? plot.bottom - plot.top : plot.right - plot.left;
  const band = length / labels.length;
  const label_extent = vertical
    ? LINE_HEIGHT
    : Math.max(...labels.map((label) => text_width(label))) + AXIS_LABEL_GAP;
  const fit_stride = Math.max(1, Math.ceil(label_extent / band));
  // A horizontal label wider than its band moves right, by up to half the
  // difference, to stay over the plot (below). The stride leaves room for
  // that move, so the labels keep one spacing along the axis.
  const widest = label_extent - AXIS_LABEL_GAP;
  const stride =
    vertical || widest <= band
      ? fit_stride
      : Math.max(fit_stride, Math.ceil((1.5 * widest + AXIS_LABEL_GAP) / band - 0.5));

  // The right edge of the last horizontal label drawn.
  let drawn_right = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < labels.length; index += stride) {
    const label = labels[index] ?? "";
    const center = (index + 0.5) * band;
    if (vertical) {
      context.svg.text(
        fit_text(label, label_width),
        {
          x: plot.left - AXIS_LABEL_GAP,
          y: plot.top + center,
          "text-anchor": "end",
          "dominant-baseline": "central",
        },
        group,
      );
    } else {
      const text = fit_text(label, band * stride - AXIS_LABEL_GAP);
      // A label wider than its band stays over the plot: past the plot's left
      // edge, the first one ran into the value axis's lowest label ($0). A
      // label that would still reach the one before it is left out.
      const half = text_width(text) / 2;
      const x = Math.min(Math.max(plot.left + center, plot.left + half), plot.right - half);
      if (x - half < drawn_right + AXIS_LABEL_GAP) continue;
      drawn_right = x + half;
      context.svg.text(
        text,
        { x, y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE, "text-anchor": "middle" },
        group,
      );
    }
  }
}

/** One group of an outer category level: the categories `start` to `end - 1`. */
interface CategoryGroup {
  start: number;
  end: number;
  label: string;
}

/**
 * Multi-level category labels. Rows run from the axis outward: the inner
 * labels first, then each outer level from the innermost to the outermost.
 */
interface CategoryTiers {
  /** The label of each category. */
  inner: string[];
  /** The groups of each outer level, from the axis outward. */
  outer: CategoryGroup[][];
  /** For each boundary between categories, 0 to the count, the label rows its divider crosses. */
  depths: Int32Array;
}

/**
 * The tiers of the first `count` categories of `source`, grouped as Excel
 * groups multi-level labels: a group starts at a label on its level or where
 * a group of an outer level starts, and a blank label continues it.
 */
function category_tiers(source: ChartSeriesView, count: number): CategoryTiers {
  const locale = source.numberLocale;
  const inner: string[] = [];
  for (let index = 0; index < count; index += 1) {
    inner.push(
      category_text(source.categories[index], source.categoryFormats[index] ?? null, locale),
    );
  }

  const starts = new Uint8Array(count + 1);
  starts[0] = 1;
  starts[count] = 1;
  const depths = new Int32Array(count + 1).fill(1);
  const outer: CategoryGroup[][] = [];

  // From the outermost level in, so each level knows where the outer groups start.
  for (const level of source.categoryLevels) {
    for (let index = 0; index < count; index += 1) {
      if ((level.labels[index] ?? null) !== null) starts[index] = 1;
    }

    const groups: CategoryGroup[] = [];
    let start = 0;
    for (let index = 1; index <= count; index += 1) {
      if (starts[index] === 0) continue;
      const label = category_text(level.labels[start], level.formats[start] ?? null, locale);
      groups.push({ start, end: index, label });
      start = index;
    }

    for (let index = 0; index <= count; index += 1) {
      depths[index] = (depths[index] ?? 1) + (starts[index] ?? 0);
    }
    outer.unshift(groups);
  }

  return { inner, outer, depths };
}

/**
 * `text` wrapped at spaces onto lines of at most `max_width`, as Excel wraps
 * the labels of outer category levels. The last line ends with an ellipsis
 * when text is left over.
 */
function wrap_text(text: string, max_width: number): string[] {
  const characters = Math.floor(max_width / (FONT_SIZE * GLYPH_WIDTH_RATIO));
  const lines: string[] = [];
  let rest = text;

  while (lines.length < MAX_GROUP_LABEL_LINES - 1 && rest.length > characters) {
    const space = rest.lastIndexOf(" ", characters);
    if (space <= 0) break;
    lines.push(rest.slice(0, space));
    rest = rest.slice(space + 1);
  }

  lines.push(fit_text(rest, max_width));
  return lines;
}

/** How the rows of multi-level category labels are drawn. */
interface TierLayout {
  /** The inner labels turn to read upward, as Excel turns labels that do not fit their band. */
  rotated: boolean;
  /** Every `stride`-th inner label is drawn, so drawn labels do not overlap. */
  stride: number;
  /** The extent of each row across the axis, from the axis outward. */
  sizes: number[];
  /** The text lines of each outer group, by row. */
  lines: string[][][];
}

/**
 * The layout of `tiers` over category bands of `band` pixels. On a vertical
 * axis the inner labels take `inner_size` and each outer label reads upward,
 * because Excel has no horizontal outer labels in bar charts. On a horizontal
 * axis inner labels that do not fit turn upward and take at most
 * `inner_size`, and outer labels wrap within their group.
 */
function tier_layout(
  tiers: CategoryTiers,
  band: number,
  vertical: boolean,
  inner_size: number,
): TierLayout {
  const widest = Math.max(0, ...tiers.inner.map((label) => text_width(label)));
  const rotated = !vertical && widest + AXIS_LABEL_GAP > band;
  const stride = vertical || rotated ? Math.max(1, Math.ceil(LINE_HEIGHT / band)) : 1;
  const sizes = [vertical ? inner_size : rotated ? Math.min(widest, inner_size) : LINE_HEIGHT];

  const lines = tiers.outer.map((groups) => {
    const row = groups.map((group) => {
      const span = (group.end - group.start) * band - AXIS_LABEL_GAP;
      return vertical ? [fit_text(group.label, span)] : wrap_text(group.label, span);
    });
    sizes.push(Math.max(1, ...row.map((group_lines) => group_lines.length)) * LINE_HEIGHT);
    return row;
  });

  return { rotated, stride, sizes, lines };
}

/** The distance from the axis to the far edge of all label rows. */
function tier_extent(layout: TierLayout): number {
  return layout.sizes.reduce((total, size) => total + AXIS_LABEL_GAP + size, 0);
}

/**
 * Multi-level category labels with dividers, as Excel draws them: a row of
 * labels per level, each outer label once and centered on its group. A
 * divider between two categories crosses the inner row and every outer row
 * where a group ends there.
 */
function draw_category_tiers(
  context: DrawContext,
  tiers: CategoryTiers,
  layout: TierLayout,
  plot: Box,
  vertical: boolean,
): void {
  const count = tiers.inner.length;
  const start = vertical ? plot.top : plot.left;
  const band = ((vertical ? plot.bottom : plot.right) - start) / count;
  const edges: number[] = [];
  let edge = 0;
  for (const size of layout.sizes) {
    edge += AXIS_LABEL_GAP + size;
    edges.push(edge);
  }

  // With skipped inner labels, only the dividers between groups are drawn.
  const dividers = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-dividers", stroke: GRID_LINE_COLOR },
    context.root,
  );
  for (let index = 0; index <= count; index += 1) {
    const depth = tiers.depths[index] ?? 1;
    if (depth === 1 && layout.stride > 1) continue;

    const along = start + index * band;
    const across = edges[depth - 1] ?? edge;
    const ends = vertical
      ? { x1: plot.left, x2: plot.left - across, y1: along, y2: along }
      : { x1: along, x2: along, y1: plot.bottom, y2: plot.bottom + across };
    context.svg.element("line", ends, dividers);
  }

  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-axis", "font-size": FONT_SIZE },
    context.root,
  );
  const inner_size = layout.sizes[0] ?? 0;
  for (let index = 0; index < count; index += layout.stride) {
    const label = tiers.inner[index] ?? "";
    const center = start + (index + 0.5) * band;
    const y = plot.bottom + AXIS_LABEL_GAP;
    const attributes: Record<string, string | number> = vertical
      ? {
          x: plot.left - AXIS_LABEL_GAP,
          y: center,
          "text-anchor": "end",
          "dominant-baseline": "central",
        }
      : layout.rotated
        ? {
            x: center,
            y,
            "text-anchor": "end",
            "dominant-baseline": "central",
            transform: `rotate(-90 ${center} ${y})`,
          }
        : { x: center, y: y + FONT_SIZE, "text-anchor": "middle" };
    const fitted = fit_text(label, vertical || layout.rotated ? inner_size : band - AXIS_LABEL_GAP);
    context.svg.text(fitted, { ...attributes, "data-level": 0 }, group);
  }

  layout.lines.forEach((row, row_index) => {
    const near = (edges[row_index] ?? 0) + AXIS_LABEL_GAP;
    const groups = tiers.outer[row_index] ?? [];

    groups.forEach((entry, group_index) => {
      const center = start + ((entry.start + entry.end) / 2) * band;
      (row[group_index] ?? []).forEach((line, line_index) => {
        if (line === "") return;

        const x = plot.left - near - LINE_HEIGHT / 2;
        const attributes: Record<string, string | number> = vertical
          ? {
              x,
              y: center,
              "text-anchor": "middle",
              "dominant-baseline": "central",
              transform: `rotate(-90 ${x} ${center})`,
            }
          : {
              x: center,
              y: plot.bottom + near + FONT_SIZE + line_index * LINE_HEIGHT,
              "text-anchor": "middle",
            };
        context.svg.text(line, { ...attributes, "data-level": row_index + 1 }, group);
      });
    });
  });
}

/** The pixel of value zero, or of the nearest axis end when zero is outside the axis. */
function baseline_pixel(axis: Axis): number {
  const zero = Math.min(Math.max(0, axis.scale.min), axis.scale.max);
  return axis_pixel(axis, zero);
}

/**
 * One rect per bar; with more categories than pixels along the category
 * axis, each series draws its bars as the subpaths of one path instead, with
 * the same geometry. A 10,000-point series then adds one element, not 10,000.
 */
function draw_bars(context: DrawContext, axis: Axis, plot: Box, horizontal: boolean): void {
  const series = context.view.series;
  const count = point_count(series);
  if (count === 0 || series.length === 0) return;

  const length = horizontal ? plot.bottom - plot.top : plot.right - plot.left;
  const is_dense = count > length;
  const band = length / count;
  const bar_size = (band * BAR_GROUP_SHARE) / series.length;
  const group_offset = (band * (1 - BAR_GROUP_SHARE)) / 2;
  const baseline = baseline_pixel(axis);

  series.forEach((entry, series_index) => {
    const group = context.svg.element(
      "g",
      { class: "sheetwrite-chart-series", fill: series_color(series_index) },
      context.root,
    );
    let path = "";

    entry.values.forEach((value, index) => {
      if (value === null) return;

      const value_pixel = axis_pixel(axis, value);
      const along = index * band + group_offset + series_index * bar_size;
      const low = Math.min(value_pixel, baseline);
      const extent = Math.abs(value_pixel - baseline);
      const rect = horizontal
        ? { x: low, y: plot.top + along, width: extent, height: bar_size }
        : { x: plot.left + along, y: low, width: bar_size, height: extent };
      if (is_dense) {
        path += `M${rect.x} ${rect.y}h${rect.width}v${rect.height}h${-rect.width}Z`;
      } else {
        context.svg.element("rect", { class: "sheetwrite-chart-bar", ...rect }, group);
      }
    });
    if (path !== "") {
      context.svg.element("path", { class: "sheetwrite-chart-bars", d: path }, group);
    }
  });
}

interface PlottedSeries {
  /** Horizontal pixel of each point; `NaN` when the point has no x. */
  xs: number[];
  values: ReadonlyArray<number | null>;
}

/** Indices to draw: every point when the series fits the plot width, the per-pixel extremes otherwise. */
function drawn_indices(points: PlottedSeries, plot_width: number): number[] {
  if (points.values.length <= plot_width) return points.values.map((_, index) => index);
  return thinToPixels(points.xs, points.values);
}

/** Runs of consecutive drawable points; a `null` value or a missing x ends a run. */
function point_runs(
  points: PlottedSeries,
  indices: readonly number[],
  axis: Axis,
): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];

  for (const index of indices) {
    const value = points.values[index] ?? null;
    const x = points.xs[index] ?? Number.NaN;
    if (value === null || !Number.isFinite(x)) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    current.push([x, axis_pixel(axis, value)]);
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

function path_data(run: ReadonlyArray<readonly [number, number]>): string {
  return run.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join("");
}

function draw_lines(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  plotted: readonly PlottedSeries[],
  filled: boolean,
): void {
  const baseline = baseline_pixel(axis);

  plotted.forEach((points, series_index) => {
    const color = series_color(series_index);
    const group = context.svg.element("g", { class: "sheetwrite-chart-series" }, context.root);
    const runs = point_runs(points, drawn_indices(points, plot.right - plot.left), axis);

    for (const run of runs) {
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) continue;

      if (filled) {
        context.svg.element(
          "path",
          {
            class: "sheetwrite-chart-area",
            d: `${path_data(run)}L${last[0]} ${baseline}L${first[0]} ${baseline}Z`,
            fill: color,
            "fill-opacity": AREA_FILL_OPACITY,
            stroke: color,
          },
          group,
        );
      } else if (run.length > 1) {
        context.svg.element(
          "path",
          {
            class: "sheetwrite-chart-line",
            d: path_data(run),
            fill: "none",
            stroke: color,
            "stroke-width": LINE_WIDTH,
            "stroke-linejoin": "round",
          },
          group,
        );
      } else {
        // A point between two gaps has no segment, so it gets a marker to stay visible.
        context.svg.element(
          "circle",
          {
            class: "sheetwrite-chart-point",
            cx: first[0],
            cy: first[1],
            r: POINT_RADIUS,
            fill: color,
          },
          group,
        );
      }
    }
  });
}

function draw_points(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  plotted: readonly PlottedSeries[],
): void {
  plotted.forEach((points, series_index) => {
    const group = context.svg.element(
      "g",
      { class: "sheetwrite-chart-series", fill: series_color(series_index) },
      context.root,
    );

    for (const index of drawn_indices(points, plot.right - plot.left)) {
      const value = points.values[index] ?? null;
      const x = points.xs[index] ?? Number.NaN;
      if (value === null || !Number.isFinite(x)) continue;

      context.svg.element(
        "circle",
        { class: "sheetwrite-chart-point", cx: x, cy: axis_pixel(axis, value), r: POINT_RADIUS },
        group,
      );
    }
  });
}

/** Scatter x values: the categories when they are all numbers, otherwise 1, 2, 3… as in Excel. */
function scatter_xs(entry: ChartSeriesView): Array<number | null> {
  const present = entry.categories.filter((category) => category !== null);
  const is_numeric =
    present.length > 0 && present.every((category) => typeof category === "number");

  return entry.values.map((_, index) => {
    if (!is_numeric) return index + 1;
    const category = entry.categories[index];
    return typeof category === "number" ? category : null;
  });
}

function scatter_x_format(series: readonly ChartSeriesView[]): string | null {
  for (const entry of series) {
    const format = entry.categoryFormats.find((code) => code !== null);
    if (format !== undefined) return format;
  }
  return null;
}

function draw_cartesian(context: DrawContext, box: Box): void {
  const { series, chart } = context.view;
  const kind = chart.kind;
  const horizontal = kind === "bar";
  const region = draw_axis_titles(context, box);

  // Bars and areas grow from zero, so their axis always contains it.
  const range = value_range(series);
  const from_zero = kind === "column" || kind === "bar" || kind === "area";
  const value_min = from_zero ? Math.min(0, range.min) : range.min;
  const value_max = from_zero ? Math.max(0, range.max) : range.max;
  const { format, locale } = value_axis_format(series);
  const value_label = (tick: number) => format_value(tick, format, locale);

  const count = point_count(series);
  const labels = kind === "scatter" ? [] : category_labels(series, count);
  const level_source = series.find((entry) => entry.categories.length > 0);
  const has_tiers =
    kind !== "scatter" &&
    count > 0 &&
    level_source !== undefined &&
    level_source.categoryLevels.length > 0 &&
    chart.axes?.multiLevelLabels !== false;
  const tiers = has_tiers ? category_tiers(level_source, count) : null;

  if (horizontal) {
    const category_width = Math.min(
      Math.max(0, ...(tiers?.inner ?? labels).map((label) => text_width(label))),
      (region.right - region.left) * CATEGORY_LABEL_MAX_SHARE,
    );
    const outer_width = (tiers?.outer.length ?? 0) * (LINE_HEIGHT + AXIS_LABEL_GAP);
    const left = region.left + outer_width + category_width + AXIS_LABEL_GAP;
    // The last label is centered on the plot's right edge, so half of it is past the plot.
    const value = horizontal_value_ticks(
      value_min,
      value_max,
      value_label,
      (widest) => region.right - widest / 2 - left,
    );
    const plot = {
      left,
      right: region.right - value.widest / 2,
      top: region.top,
      bottom: region.bottom - LINE_HEIGHT - AXIS_LABEL_GAP,
    };
    if (plot.right - plot.left < MIN_PLOT_SIZE || plot.bottom - plot.top < MIN_PLOT_SIZE) return;

    const axis = { scale: value.scale, start: plot.left, end: plot.right };
    draw_value_axis(context, axis, plot, false, value.labels, value.widest + AXIS_LABEL_GAP);
    draw_bars(context, axis, plot, true);
    draw_baseline(context, plot, baseline_pixel(axis), true);
    if (tiers) {
      const layout = tier_layout(tiers, (plot.bottom - plot.top) / count, true, category_width);
      draw_category_tiers(context, tiers, layout, plot, true);
    } else {
      draw_category_labels(context, labels, plot, true, category_width);
    }
    return;
  }

  const value_count = max_tick_count(region.bottom - region.top, VERTICAL_TICK_SPACING);
  const value = value_ticks(tickScale(value_min, value_max, value_count, true), value_label);
  const left = region.left + value.widest + AXIS_LABEL_GAP;
  // A scatter chart's x axis is a value axis too: its last label is centered on the plot's right edge.
  const scatter = kind === "scatter" ? scatter_x_ticks(series, region.right, left) : null;
  const right = region.right - (scatter ? scatter.ticks.widest / 2 : 0);
  const max_rotated = (region.bottom - region.top) * CATEGORY_LABEL_MAX_SHARE;
  const layout = tiers ? tier_layout(tiers, (right - left) / count, false, max_rotated) : null;
  const plot = {
    left,
    right,
    top: region.top + FONT_SIZE / 2,
    bottom: region.bottom - (layout ? tier_extent(layout) : LINE_HEIGHT + AXIS_LABEL_GAP),
  };
  if (plot.right - plot.left < MIN_PLOT_SIZE || plot.bottom - plot.top < MIN_PLOT_SIZE) return;

  const axis = { scale: value.scale, start: plot.bottom, end: plot.top };
  draw_value_axis(context, axis, plot, true, value.labels, LINE_HEIGHT);

  if (kind === "column") {
    draw_bars(context, axis, plot, false);
  } else if (scatter) {
    draw_scatter(context, axis, plot, scatter);
  } else {
    const band = (plot.right - plot.left) / Math.max(1, count);
    const plotted = series.map((entry) => ({
      xs: entry.values.map((_, index) => plot.left + (index + 0.5) * band),
      values: entry.values,
    }));
    draw_lines(context, axis, plot, plotted, kind === "area");
  }

  draw_baseline(context, plot, baseline_pixel(axis), false);
  if (tiers && layout) draw_category_tiers(context, tiers, layout, plot, false);
  else draw_category_labels(context, labels, plot, false, 0);
}

/** The x values of a scatter chart and the ticks of its horizontal value axis. */
interface ScatterX {
  values: Array<Array<number | null>>;
  ticks: ValueTicks;
}

/** Scatter x ticks for a plot that starts at `left` and leaves half the last label before `right`. */
function scatter_x_ticks(
  series: readonly ChartSeriesView[],
  right: number,
  left: number,
): ScatterX {
  const values = series.map(scatter_xs);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values.flat()) {
    if (value === null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const format = scatter_x_format(series);
  const locale = series[0]?.numberLocale ?? null;
  const ticks = horizontal_value_ticks(
    min,
    max,
    (tick) => format_value(tick, format, locale),
    (widest) => right - widest / 2 - left,
  );
  return { values, ticks };
}

function draw_scatter(context: DrawContext, axis: Axis, plot: Box, x: ScatterX): void {
  const x_axis = { scale: x.ticks.scale, start: plot.left, end: plot.right };
  const stride = label_stride(x_axis, x.ticks.widest + AXIS_LABEL_GAP);
  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-axis", "font-size": FONT_SIZE },
    context.root,
  );
  // The lowest y label ends AXIS_LABEL_GAP left of the plot at its bottom
  // edge, so a first x label centered on that corner would run into it. As
  // other chart libraries do, the first x label starts at the plot's left
  // edge instead, and is left out when that would reach the next x label.
  const ticks = x_axis.scale.ticks;
  const next_tick = ticks[stride];
  const next_left =
    next_tick === undefined
      ? Number.POSITIVE_INFINITY
      : axis_pixel(x_axis, next_tick) - text_width(x.ticks.labels[stride] ?? "") / 2;
  const first_fits = plot.left + text_width(x.ticks.labels[0] ?? "") + AXIS_LABEL_GAP <= next_left;
  ticks.forEach((tick, index) => {
    if (index % stride !== 0 || (index === 0 && !first_fits)) return;
    context.svg.text(
      x.ticks.labels[index] ?? "",
      {
        x: index === 0 ? plot.left : axis_pixel(x_axis, tick),
        y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE,
        "text-anchor": index === 0 ? "start" : "middle",
      },
      group,
    );
  });

  const plotted = context.view.series.map((entry, series_index) => ({
    xs: (x.values[series_index] ?? []).map((value) =>
      value === null ? Number.NaN : axis_pixel(x_axis, value),
    ),
    values: entry.values,
  }));
  draw_points(context, axis, plot, plotted);
}

/** The category axis line, drawn at value zero so negative values fall below it. */
function draw_baseline(context: DrawContext, plot: Box, pixel: number, vertical: boolean): void {
  const ends = vertical
    ? { x1: pixel, x2: pixel, y1: plot.top, y2: plot.bottom }
    : { x1: plot.left, x2: plot.right, y1: pixel, y2: pixel };
  context.svg.element(
    "line",
    { class: "sheetwrite-chart-baseline", ...ends, stroke: TEXT_COLOR },
    context.root,
  );
}

function polar(
  center_x: number,
  center_y: number,
  radius: number,
  angle: number,
): [number, number] {
  return [center_x + radius * Math.cos(angle), center_y + radius * Math.sin(angle)];
}

/** Path of one slice from `start` to `end` (radians, clockwise from 12 o'clock); `inner > 0` cuts a doughnut hole. */
function slice_path(
  center_x: number,
  center_y: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const large_arc = end - start > Math.PI ? 1 : 0;
  const [outer_start_x, outer_start_y] = polar(center_x, center_y, outer, start);
  const [outer_end_x, outer_end_y] = polar(center_x, center_y, outer, end);
  const outer_arc = `M${outer_start_x} ${outer_start_y}A${outer} ${outer} 0 ${large_arc} 1 ${outer_end_x} ${outer_end_y}`;

  if (inner <= 0) return `${outer_arc}L${center_x} ${center_y}Z`;

  const [inner_end_x, inner_end_y] = polar(center_x, center_y, inner, end);
  const [inner_start_x, inner_start_y] = polar(center_x, center_y, inner, start);
  return `${outer_arc}L${inner_end_x} ${inner_end_y}A${inner} ${inner} 0 ${large_arc} 0 ${inner_start_x} ${inner_start_y}Z`;
}

/** A full ring: an arc cannot start and end at one point, so a single slice is two circles. */
function ring_path(center_x: number, center_y: number, outer: number, inner: number): string {
  const circle = (radius: number) =>
    `M${center_x - radius} ${center_y}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
  return inner > 0 ? `${circle(outer)}${circle(inner)}` : circle(outer);
}

function draw_pie(context: DrawContext, box: Box): void {
  const first = context.view.series[0];
  if (!first) return;

  const radius = Math.min(box.right - box.left, box.bottom - box.top) / 2;
  if (radius * 2 < MIN_PLOT_SIZE) return;

  const center_x = (box.left + box.right) / 2;
  const center_y = (box.top + box.bottom) / 2;
  const inner = context.view.chart.kind === "doughnut" ? radius * DOUGHNUT_HOLE_SHARE : 0;
  const labels = category_labels([first], first.values.length);
  const shows_names = context.view.chart.legend === "none";

  // Excel draws a negative slice by its size, so the sign does not remove it.
  const magnitudes = first.values.map((value) => (value === null ? 0 : Math.abs(value)));
  const total = magnitudes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;

  const group = context.svg.element("g", { class: "sheetwrite-chart-series" }, context.root);
  const label_group = context.svg.element(
    "g",
    {
      class: "sheetwrite-chart-slice-labels",
      "font-size": FONT_SIZE,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      stroke: BACKGROUND_COLOR,
      "stroke-width": LABEL_HALO_WIDTH,
      "paint-order": "stroke",
    },
    context.root,
  );
  let angle = -Math.PI / 2;

  magnitudes.forEach((magnitude, index) => {
    if (magnitude === 0) return;

    const sweep = (magnitude / total) * Math.PI * 2;
    const is_whole = magnitude === total;
    context.svg.element(
      "path",
      {
        class: "sheetwrite-chart-slice",
        d: is_whole
          ? ring_path(center_x, center_y, radius, inner)
          : slice_path(center_x, center_y, radius, inner, angle, angle + sweep),
        fill: series_color(index),
        "fill-rule": "evenodd",
        stroke: BACKGROUND_COLOR,
      },
      group,
    );

    if (sweep >= MIN_LABELED_SLICE_ANGLE) {
      const label_radius = inner > 0 ? (radius + inner) / 2 : radius * PIE_LABEL_RADIUS_SHARE;
      const [x, y] = is_whole
        ? [center_x, center_y - label_radius]
        : polar(center_x, center_y, label_radius, angle + sweep / 2);
      const percent = formatNumber(magnitude / total, PERCENT_FORMAT);
      const name = labels[index] ?? "";
      context.svg.text(shows_names && name ? `${name} ${percent}` : percent, { x, y }, label_group);
    }

    angle += sweep;
  });
}

/**
 * Draws a chart view as a standalone SVG element of `size` CSS pixels.
 *
 * Series colors read `--sheetwrite-chart-1` to `--sheetwrite-chart-8`, and text
 * reads the grid theme variables, so the chart follows the host theme. The
 * function reads no cells and keeps no state.
 *
 * @example
 * ```ts
 * import { renderChartSvg, type ChartView } from "@sheetwrite/charts";
 *
 * function showChart(host: HTMLElement, view: ChartView) {
 *   host.replaceChildren(renderChartSvg(view, { width: 320, height: 200 }));
 * }
 * ```
 *
 * @returns A new `<svg>` element with a `<title>` and `<desc>` naming the chart,
 *   not yet attached to any document.
 */
export function renderChartSvg(
  view: ChartView,
  size: ChartSize,
  options: ChartSvgOptions = {},
): SVGSVGElement {
  const svg = new SvgBuilder(options.document ?? document);
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const root = svg.element("svg", {
    class: "sheetwrite-chart",
    "data-kind": view.chart.kind,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    fill: TEXT_COLOR,
    style: "font: var(--sheetwrite-font); overflow: hidden",
  });

  svg.element("title", {}, root).textContent = chart_name(view);
  svg.element("desc", {}, root).textContent = chart_description(view);

  const context: DrawContext = { svg, root, view };
  let box: Box = {
    left: OUTER_PADDING,
    top: OUTER_PADDING,
    right: width - OUTER_PADDING,
    bottom: height - OUTER_PADDING,
  };
  box = draw_title(context, box);
  box = draw_notes(context, box);
  box = draw_legend(context, box);

  if (is_round(view.chart.kind)) draw_pie(context, box);
  else draw_cartesian(context, box);

  return root;
}
