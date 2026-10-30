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
  width: number;
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
/** Category labels of a bar chart take at most this share of the width. */
const CATEGORY_LABEL_MAX_SHARE = 0.3;

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
function seriesColor(index: number): string {
  return `var(--sheetwrite-chart-${(index % CHART_COLOR_COUNT) + 1})`;
}

function textWidth(text: string, fontSize = FONT_SIZE): number {
  return text.length * fontSize * GLYPH_WIDTH_RATIO;
}

/** Shortens `text` with an ellipsis so its estimated width fits `maxWidth`. */
function fitText(text: string, maxWidth: number, fontSize = FONT_SIZE): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;

  const characters = Math.floor(maxWidth / (fontSize * GLYPH_WIDTH_RATIO)) - 1;
  return characters < 1 ? "" : `${text.slice(0, characters)}${ELLIPSIS}`;
}

function axisPixel(axis: Axis, value: number): number {
  const span = axis.scale.max - axis.scale.min;
  return axis.start + ((value - axis.scale.min) / span) * (axis.end - axis.start);
}

function formatValue(value: number, format: string | null, locale: string | null): string {
  return formatNumber(value, format ?? undefined, locale ?? undefined);
}

function categoryText(
  category: string | number | boolean | null | undefined,
  format: string | null,
  locale: string | null,
): string {
  if (category === null || category === undefined) return "";
  if (typeof category === "number") return formatValue(category, format, locale);
  if (typeof category === "boolean") return category ? "TRUE" : "FALSE";
  return category;
}

function pointCount(series: readonly ChartSeriesView[]): number {
  return series.reduce((count, entry) => Math.max(count, entry.values.length), 0);
}

/** Labels for the category axis, from the first series that has categories; 1, 2, 3… otherwise, as in Excel. */
function categoryLabels(series: readonly ChartSeriesView[], count: number): string[] {
  const source = series.find((entry) => entry.categories.length > 0);
  const labels: string[] = [];

  for (let index = 0; index < count; index += 1) {
    labels.push(
      source && index < source.categories.length
        ? categoryText(
            source.categories[index],
            source.categoryFormats[index] ?? null,
            source.numberLocale,
          )
        : String(index + 1),
    );
  }

  return labels;
}

/** The first value format of the series, which the value axis uses, as Excel's "linked to source" does. */
function valueAxisFormat(series: readonly ChartSeriesView[]): {
  format: string | null;
  locale: string | null;
} {
  for (const entry of series) {
    const format = entry.numberFormats.find((code) => code !== null);
    if (format !== undefined) return { format, locale: entry.numberLocale };
  }

  return { format: null, locale: series[0]?.numberLocale ?? null };
}

function valueRange(series: readonly ChartSeriesView[]): { min: number; max: number } {
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
function maxTickCount(length: number, spacing: number): number {
  return Math.max(1, Math.floor(length / spacing));
}

function chartName(view: ChartView): string {
  const kind = `${KIND_NAMES[view.chart.kind]} chart`;
  return view.chart.title ? `${view.chart.title} (${kind})` : kind;
}

function chartDescription(view: ChartView): string {
  if (view.series.length === 0) return "No series.";

  const parts = view.series.map((entry) => {
    const unit = entry.values.length === 1 ? "point" : "points";
    return `${entry.name} (${entry.values.length} ${unit})`;
  });
  return `Series: ${parts.join(", ")}.`;
}

function chartNotes(view: ChartView): string[] {
  const notes: string[] = [];
  if (view.series.some((entry) => entry.truncated)) notes.push(TRUNCATED_NOTE);
  if (view.series.some((entry) => entry.referenceError)) notes.push(REFERENCE_ERROR_NOTE);
  return notes;
}

function isRound(kind: ChartKind): boolean {
  return kind === "pie" || kind === "doughnut";
}

function legendEntries(view: ChartView): LegendEntry[] {
  if (!isRound(view.chart.kind)) {
    return view.series.map((entry, index) => ({ label: entry.name, color: seriesColor(index) }));
  }

  // A pie shows one series, so its legend names the slices.
  const first = view.series[0];
  if (!first) return [];
  const labels = categoryLabels([first], first.values.length);
  return labels.map((label, index) => ({ label, color: seriesColor(index) }));
}

function drawTitle(context: DrawContext, box: Box): Box {
  const title = context.view.chart.title;
  if (!title) return box;

  const width = box.right - box.left;
  context.svg.text(
    fitText(title, width, TITLE_FONT_SIZE),
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

function drawNotes(context: DrawContext, box: Box): Box {
  const notes = chartNotes(context.view);
  let bottom = box.bottom;

  // The last note sits at the bottom edge, so draw upward from it.
  for (const note of notes.toReversed()) {
    context.svg.text(
      fitText(note, box.right - box.left),
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

function drawLegendItem(
  context: DrawContext,
  parent: Element,
  entry: LegendEntry,
  x: number,
  centerY: number,
  maxWidth: number,
): void {
  const item = context.svg.element("g", { class: "sheetwrite-chart-legend-item" }, parent);
  context.svg.element(
    "rect",
    {
      x,
      y: centerY - LEGEND_SWATCH_SIZE / 2,
      width: LEGEND_SWATCH_SIZE,
      height: LEGEND_SWATCH_SIZE,
      fill: entry.color,
    },
    item,
  );
  context.svg.text(
    fitText(entry.label, maxWidth - LEGEND_SWATCH_SIZE - LEGEND_SWATCH_GAP),
    {
      x: x + LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP,
      y: centerY,
      "dominant-baseline": "central",
      "font-size": FONT_SIZE,
    },
    item,
  );
}

function legendItemWidth(entry: LegendEntry): number {
  return LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP + textWidth(entry.label);
}

function drawSideLegend(
  context: DrawContext,
  entries: readonly LegendEntry[],
  side: "left" | "right",
  box: Box,
): Box {
  const width = Math.min(
    Math.max(...entries.map(legendItemWidth)),
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
    drawLegendItem(context, legend, entry, x, top + (index + 0.5) * LINE_HEIGHT, width);
  });

  return side === "right"
    ? { ...box, right: x - LEGEND_ITEM_GAP }
    : { ...box, left: x + width + LEGEND_ITEM_GAP };
}

function drawRowLegend(
  context: DrawContext,
  entries: readonly LegendEntry[],
  side: "top" | "bottom",
  box: Box,
): Box {
  const available = box.right - box.left;
  const rows: Array<{ entries: LegendEntry[]; width: number }> = [];

  // Wrap entries into centered rows; entries past the last row are left out, as Excel does.
  for (const entry of entries) {
    const width = Math.min(legendItemWidth(entry), available);
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

  rows.forEach((row, rowIndex) => {
    let x = box.left + (available - row.width) / 2;
    const centerY = top + (rowIndex + 0.5) * LINE_HEIGHT;
    for (const entry of row.entries) {
      const width = Math.min(legendItemWidth(entry), available);
      drawLegendItem(context, legend, entry, x, centerY, width);
      x += width + LEGEND_ITEM_GAP;
    }
  });

  return side === "top"
    ? { ...box, top: box.top + height + AXIS_LABEL_GAP }
    : { ...box, bottom: box.bottom - height - AXIS_LABEL_GAP };
}

function drawLegend(context: DrawContext, box: Box): Box {
  const placement = context.view.chart.legend ?? DEFAULT_LEGEND;
  const entries = legendEntries(context.view);
  if (placement === "none" || entries.length === 0) return box;

  return placement === "left" || placement === "right"
    ? drawSideLegend(context, entries, placement, box)
    : drawRowLegend(context, entries, placement, box);
}

/** Draws the axis titles and returns the box that is left for tick labels and the plot. */
function drawAxisTitles(context: DrawContext, box: Box): Box {
  const axes = context.view.chart.axes;
  const region = { ...box };

  if (axes?.xTitle) {
    context.svg.text(
      fitText(axes.xTitle, region.right - region.left),
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
    const centerX = region.left + FONT_SIZE;
    const centerY = (region.top + region.bottom) / 2;
    context.svg.text(
      fitText(axes.yTitle, region.bottom - region.top),
      {
        class: "sheetwrite-chart-axis-title",
        "data-axis": "y",
        x: centerX,
        y: centerY,
        "text-anchor": "middle",
        transform: `rotate(-90 ${centerX} ${centerY})`,
        "font-size": FONT_SIZE,
      },
      context.root,
    );
    region.left += LINE_HEIGHT;
  }

  return region;
}

/** Value labels plus a grid line at each tick; `vertical` axes run from bottom to top. */
function drawValueAxis(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  vertical: boolean,
  labels: readonly string[],
): void {
  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-value-axis", "font-size": FONT_SIZE },
    context.root,
  );

  axis.scale.ticks.forEach((tick, index) => {
    const pixel = axisPixel(axis, tick);
    const label = labels[index] ?? "";
    if (vertical) {
      context.svg.element(
        "line",
        { x1: plot.left, x2: plot.right, y1: pixel, y2: pixel, stroke: GRID_LINE_COLOR },
        group,
      );
      context.svg.text(
        label,
        {
          x: plot.left - AXIS_LABEL_GAP,
          y: pixel,
          "text-anchor": "end",
          "dominant-baseline": "central",
        },
        group,
      );
    } else {
      context.svg.element(
        "line",
        { x1: pixel, x2: pixel, y1: plot.top, y2: plot.bottom, stroke: GRID_LINE_COLOR },
        group,
      );
      context.svg.text(
        label,
        { x: pixel, y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE, "text-anchor": "middle" },
        group,
      );
    }
  });
}

/**
 * Category labels on one axis. When labels would overlap, only every n-th label
 * is drawn, so the visible labels keep their full text where they fit.
 * `labelWidth` is the room left of a vertical axis; horizontal labels fit their band.
 */
function drawCategoryLabels(
  context: DrawContext,
  labels: readonly string[],
  plot: Box,
  vertical: boolean,
  labelWidth: number,
): void {
  if (labels.length === 0) return;

  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-axis", "font-size": FONT_SIZE },
    context.root,
  );
  const length = vertical ? plot.bottom - plot.top : plot.right - plot.left;
  const band = length / labels.length;
  const labelExtent = vertical
    ? LINE_HEIGHT
    : Math.max(...labels.map((label) => textWidth(label))) + AXIS_LABEL_GAP;
  const stride = Math.max(1, Math.ceil(labelExtent / band));

  for (let index = 0; index < labels.length; index += stride) {
    const label = labels[index] ?? "";
    const center = (index + 0.5) * band;
    if (vertical) {
      context.svg.text(
        fitText(label, labelWidth),
        {
          x: plot.left - AXIS_LABEL_GAP,
          y: plot.top + center,
          "text-anchor": "end",
          "dominant-baseline": "central",
        },
        group,
      );
    } else {
      context.svg.text(
        fitText(label, band * stride - AXIS_LABEL_GAP),
        {
          x: plot.left + center,
          y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE,
          "text-anchor": "middle",
        },
        group,
      );
    }
  }
}

/** The pixel of value zero, or of the nearest axis end when zero is outside the axis. */
function baselinePixel(axis: Axis): number {
  const zero = Math.min(Math.max(0, axis.scale.min), axis.scale.max);
  return axisPixel(axis, zero);
}

function drawBars(context: DrawContext, axis: Axis, plot: Box, horizontal: boolean): void {
  const series = context.view.series;
  const count = pointCount(series);
  if (count === 0 || series.length === 0) return;

  const length = horizontal ? plot.bottom - plot.top : plot.right - plot.left;
  const band = length / count;
  const barSize = (band * BAR_GROUP_SHARE) / series.length;
  const groupOffset = (band * (1 - BAR_GROUP_SHARE)) / 2;
  const baseline = baselinePixel(axis);

  series.forEach((entry, seriesIndex) => {
    const group = context.svg.element(
      "g",
      { class: "sheetwrite-chart-series", fill: seriesColor(seriesIndex) },
      context.root,
    );

    entry.values.forEach((value, index) => {
      if (value === null) return;

      const valuePixel = axisPixel(axis, value);
      const along = index * band + groupOffset + seriesIndex * barSize;
      const low = Math.min(valuePixel, baseline);
      const extent = Math.abs(valuePixel - baseline);
      const rect = horizontal
        ? { x: low, y: plot.top + along, width: extent, height: barSize }
        : { x: plot.left + along, y: low, width: barSize, height: extent };
      context.svg.element("rect", { class: "sheetwrite-chart-bar", ...rect }, group);
    });
  });
}

interface PlottedSeries {
  /** Horizontal pixel of each point; `NaN` when the point has no x. */
  xs: number[];
  values: ReadonlyArray<number | null>;
}

/** Indices to draw: every point when the series fits the plot width, the per-pixel extremes otherwise. */
function drawnIndices(points: PlottedSeries, plotWidth: number): number[] {
  if (points.values.length <= plotWidth) return points.values.map((_, index) => index);
  return thinToPixels(points.xs, points.values);
}

/** Runs of consecutive drawable points; a `null` value or a missing x ends a run. */
function pointRuns(
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
    current.push([x, axisPixel(axis, value)]);
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

function pathData(run: ReadonlyArray<readonly [number, number]>): string {
  return run.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join("");
}

function drawLines(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  plotted: readonly PlottedSeries[],
  filled: boolean,
): void {
  const baseline = baselinePixel(axis);

  plotted.forEach((points, seriesIndex) => {
    const color = seriesColor(seriesIndex);
    const group = context.svg.element("g", { class: "sheetwrite-chart-series" }, context.root);
    const runs = pointRuns(points, drawnIndices(points, plot.right - plot.left), axis);

    for (const run of runs) {
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) continue;

      if (filled) {
        context.svg.element(
          "path",
          {
            class: "sheetwrite-chart-area",
            d: `${pathData(run)}L${last[0]} ${baseline}L${first[0]} ${baseline}Z`,
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
            d: pathData(run),
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

function drawPoints(
  context: DrawContext,
  axis: Axis,
  plot: Box,
  plotted: readonly PlottedSeries[],
): void {
  plotted.forEach((points, seriesIndex) => {
    const group = context.svg.element(
      "g",
      { class: "sheetwrite-chart-series", fill: seriesColor(seriesIndex) },
      context.root,
    );

    for (const index of drawnIndices(points, plot.right - plot.left)) {
      const value = points.values[index] ?? null;
      const x = points.xs[index] ?? Number.NaN;
      if (value === null || !Number.isFinite(x)) continue;

      context.svg.element(
        "circle",
        { class: "sheetwrite-chart-point", cx: x, cy: axisPixel(axis, value), r: POINT_RADIUS },
        group,
      );
    }
  });
}

/** Scatter x values: the categories when they are all numbers, otherwise 1, 2, 3… as in Excel. */
function scatterXs(entry: ChartSeriesView): Array<number | null> {
  const present = entry.categories.filter((category) => category !== null);
  const isNumeric = present.length > 0 && present.every((category) => typeof category === "number");

  return entry.values.map((_, index) => {
    if (!isNumeric) return index + 1;
    const category = entry.categories[index];
    return typeof category === "number" ? category : null;
  });
}

function scatterXFormat(series: readonly ChartSeriesView[]): string | null {
  for (const entry of series) {
    const format = entry.categoryFormats.find((code) => code !== null);
    if (format !== undefined) return format;
  }
  return null;
}

function drawCartesian(context: DrawContext, box: Box): void {
  const { series, chart } = context.view;
  const kind = chart.kind;
  const horizontal = kind === "bar";
  const region = drawAxisTitles(context, box);

  // Bars and areas grow from zero, so their axis always contains it.
  const range = valueRange(series);
  const fromZero = kind === "column" || kind === "bar" || kind === "area";
  const valueMin = fromZero ? Math.min(0, range.min) : range.min;
  const valueMax = fromZero ? Math.max(0, range.max) : range.max;
  const valueLength = horizontal ? region.right - region.left : region.bottom - region.top;
  const valueSpacing = horizontal ? HORIZONTAL_TICK_SPACING : VERTICAL_TICK_SPACING;
  const valueScale = tickScale(valueMin, valueMax, maxTickCount(valueLength, valueSpacing), true);
  const { format, locale } = valueAxisFormat(series);
  const valueLabels = valueScale.ticks.map((tick) => formatValue(tick, format, locale));
  const widestValueLabel = Math.max(...valueLabels.map((label) => textWidth(label)));

  const count = pointCount(series);
  const labels = kind === "scatter" ? [] : categoryLabels(series, count);

  if (horizontal) {
    const categoryWidth = Math.min(
      Math.max(0, ...labels.map((label) => textWidth(label))),
      (region.right - region.left) * CATEGORY_LABEL_MAX_SHARE,
    );
    const plot = {
      left: region.left + categoryWidth + AXIS_LABEL_GAP,
      right: region.right - widestValueLabel / 2,
      top: region.top,
      bottom: region.bottom - LINE_HEIGHT - AXIS_LABEL_GAP,
    };
    if (plot.right - plot.left < MIN_PLOT_SIZE || plot.bottom - plot.top < MIN_PLOT_SIZE) return;

    const axis = { scale: valueScale, start: plot.left, end: plot.right };
    drawValueAxis(context, axis, plot, false, valueLabels);
    drawBars(context, axis, plot, true);
    drawBaseline(context, plot, baselinePixel(axis), true);
    drawCategoryLabels(context, labels, plot, true, categoryWidth);
    return;
  }

  const plot = {
    left: region.left + widestValueLabel + AXIS_LABEL_GAP,
    right: region.right - (kind === "scatter" ? HORIZONTAL_TICK_SPACING / 2 : 0),
    top: region.top + FONT_SIZE / 2,
    bottom: region.bottom - LINE_HEIGHT - AXIS_LABEL_GAP,
  };
  if (plot.right - plot.left < MIN_PLOT_SIZE || plot.bottom - plot.top < MIN_PLOT_SIZE) return;

  const axis = { scale: valueScale, start: plot.bottom, end: plot.top };
  drawValueAxis(context, axis, plot, true, valueLabels);

  if (kind === "column") {
    drawBars(context, axis, plot, false);
  } else if (kind === "scatter") {
    drawScatter(context, axis, plot);
  } else {
    const band = (plot.right - plot.left) / Math.max(1, count);
    const plotted = series.map((entry) => ({
      xs: entry.values.map((_, index) => plot.left + (index + 0.5) * band),
      values: entry.values,
    }));
    drawLines(context, axis, plot, plotted, kind === "area");
  }

  drawBaseline(context, plot, baselinePixel(axis), false);
  drawCategoryLabels(context, labels, plot, false, 0);
}

function drawScatter(context: DrawContext, axis: Axis, plot: Box): void {
  const series = context.view.series;
  const xValues = series.map(scatterXs);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of xValues.flat()) {
    if (value === null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const xScale = tickScale(
    min,
    max,
    maxTickCount(plot.right - plot.left, HORIZONTAL_TICK_SPACING),
    true,
  );
  const xAxis = { scale: xScale, start: plot.left, end: plot.right };
  const xFormat = scatterXFormat(series);
  const xLabels = xScale.ticks.map((tick) =>
    formatValue(tick, xFormat, series[0]?.numberLocale ?? null),
  );
  const group = context.svg.element(
    "g",
    { class: "sheetwrite-chart-category-axis", "font-size": FONT_SIZE },
    context.root,
  );
  xScale.ticks.forEach((tick, index) => {
    context.svg.text(
      xLabels[index] ?? "",
      {
        x: axisPixel(xAxis, tick),
        y: plot.bottom + AXIS_LABEL_GAP + FONT_SIZE,
        "text-anchor": "middle",
      },
      group,
    );
  });

  const plotted = series.map((entry, seriesIndex) => ({
    xs: (xValues[seriesIndex] ?? []).map((value) =>
      value === null ? Number.NaN : axisPixel(xAxis, value),
    ),
    values: entry.values,
  }));
  drawPoints(context, axis, plot, plotted);
}

/** The category axis line, drawn at value zero so negative values fall below it. */
function drawBaseline(context: DrawContext, plot: Box, pixel: number, vertical: boolean): void {
  const ends = vertical
    ? { x1: pixel, x2: pixel, y1: plot.top, y2: plot.bottom }
    : { x1: plot.left, x2: plot.right, y1: pixel, y2: pixel };
  context.svg.element(
    "line",
    { class: "sheetwrite-chart-baseline", ...ends, stroke: TEXT_COLOR },
    context.root,
  );
}

function polar(centerX: number, centerY: number, radius: number, angle: number): [number, number] {
  return [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)];
}

/** Path of one slice from `start` to `end` (radians, clockwise from 12 o'clock); `inner > 0` cuts a doughnut hole. */
function slicePath(
  centerX: number,
  centerY: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const [outerStartX, outerStartY] = polar(centerX, centerY, outer, start);
  const [outerEndX, outerEndY] = polar(centerX, centerY, outer, end);
  const outerArc = `M${outerStartX} ${outerStartY}A${outer} ${outer} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`;

  if (inner <= 0) return `${outerArc}L${centerX} ${centerY}Z`;

  const [innerEndX, innerEndY] = polar(centerX, centerY, inner, end);
  const [innerStartX, innerStartY] = polar(centerX, centerY, inner, start);
  return `${outerArc}L${innerEndX} ${innerEndY}A${inner} ${inner} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}Z`;
}

/** A full ring: an arc cannot start and end at one point, so a single slice is two circles. */
function ringPath(centerX: number, centerY: number, outer: number, inner: number): string {
  const circle = (radius: number) =>
    `M${centerX - radius} ${centerY}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
  return inner > 0 ? `${circle(outer)}${circle(inner)}` : circle(outer);
}

function drawPie(context: DrawContext, box: Box): void {
  const first = context.view.series[0];
  if (!first) return;

  const radius = Math.min(box.right - box.left, box.bottom - box.top) / 2;
  if (radius * 2 < MIN_PLOT_SIZE) return;

  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  const inner = context.view.chart.kind === "doughnut" ? radius * DOUGHNUT_HOLE_SHARE : 0;
  const labels = categoryLabels([first], first.values.length);
  const showsNames = context.view.chart.legend === "none";

  // Excel draws a negative slice by its size, so the sign does not remove it.
  const magnitudes = first.values.map((value) => (value === null ? 0 : Math.abs(value)));
  const total = magnitudes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;

  const group = context.svg.element("g", { class: "sheetwrite-chart-series" }, context.root);
  const labelGroup = context.svg.element(
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
    const isWhole = magnitude === total;
    context.svg.element(
      "path",
      {
        class: "sheetwrite-chart-slice",
        d: isWhole
          ? ringPath(centerX, centerY, radius, inner)
          : slicePath(centerX, centerY, radius, inner, angle, angle + sweep),
        fill: seriesColor(index),
        "fill-rule": "evenodd",
        stroke: BACKGROUND_COLOR,
      },
      group,
    );

    if (sweep >= MIN_LABELED_SLICE_ANGLE) {
      const labelRadius = inner > 0 ? (radius + inner) / 2 : radius * PIE_LABEL_RADIUS_SHARE;
      const [x, y] = isWhole
        ? [centerX, centerY - labelRadius]
        : polar(centerX, centerY, labelRadius, angle + sweep / 2);
      const percent = formatNumber(magnitude / total, PERCENT_FORMAT);
      const name = labels[index] ?? "";
      context.svg.text(showsNames && name ? `${name} ${percent}` : percent, { x, y }, labelGroup);
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

  svg.element("title", {}, root).textContent = chartName(view);
  svg.element("desc", {}, root).textContent = chartDescription(view);

  const context: DrawContext = { svg, root, view };
  let box: Box = {
    left: OUTER_PADDING,
    top: OUTER_PADDING,
    right: width - OUTER_PADDING,
    bottom: height - OUTER_PADDING,
  };
  box = drawTitle(context, box);
  box = drawNotes(context, box);
  box = drawLegend(context, box);

  if (isRound(view.chart.kind)) drawPie(context, box);
  else drawCartesian(context, box);

  return root;
}
