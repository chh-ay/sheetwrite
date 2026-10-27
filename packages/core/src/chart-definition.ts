import { SheetwriteError } from "./errors.js";
import {
  dataProperties,
  hasControlCharacters,
  NUL_CHARACTER,
  sanitizeRange,
} from "./plain-data.js";
import { moveIndex, remapSpan } from "./store/ranges.js";
import type {
  ChartAnchor,
  ChartDefinition,
  ChartKind,
  ChartRange,
  ChartSeries,
} from "./types/chart.js";
import type { Range, SheetId } from "./types/coordinates.js";

/** Charts one worksheet may own. */
export const MAX_CHARTS_PER_SHEET = 100;
/** Series one chart may plot. */
export const MAX_CHART_SERIES = 32;
/** Stable chart identifier ceiling. */
const MAX_CHART_ID_LENGTH = 128;
/** Title, axis-title, and series-name ceiling; Excel's chart text limit. */
const MAX_CHART_TEXT_LENGTH = 255;
/** Anchor offset and size ceiling in CSS pixels; the largest canvas edge browsers allocate. */
const MAX_CHART_PIXELS = 32_767;

const CHART_KINDS: ReadonlySet<unknown> = new Set<ChartKind>([
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
]);
const LEGEND_POSITIONS: ReadonlySet<unknown> = new Set(["none", "top", "right", "bottom", "left"]);
const CHART_KEYS = new Set(["id", "kind", "title", "axes", "legend", "anchor", "series"]);
const AXES_KEYS = new Set(["xTitle", "yTitle"]);
const ANCHOR_KEYS = new Set(["row", "col", "offsetX", "offsetY", "width", "height"]);
const SERIES_KEYS = new Set(["name", "nameRange", "values", "categories"]);

/** The worksheet dimensions a chart is checked against. */
export interface ChartSheetBounds {
  readonly id: SheetId;
  readonly rowCount: number;
  readonly columns: { readonly length: number };
}

function isChartKind(value: unknown): value is ChartKind {
  return CHART_KINDS.has(value);
}

function isLegendPosition(value: unknown): value is NonNullable<ChartDefinition["legend"]> {
  return LEGEND_POSITIONS.has(value);
}

function validChartId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CHART_ID_LENGTH &&
    value === value.trim() &&
    !hasControlCharacters(value)
  );
}

function validChartText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_CHART_TEXT_LENGTH &&
    !value.includes(NUL_CHARACTER)
  );
}

function pixels(value: unknown, positive: boolean): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (positive ? value > 0 : value >= 0) &&
    value <= MAX_CHART_PIXELS
  );
}

function sanitizeChartRange(value: unknown): ChartRange | null {
  return value === "#REF!" ? value : sanitizeRange(value);
}

function sanitizeAnchor(value: unknown): ChartAnchor | null {
  const anchor = dataProperties(value, ANCHOR_KEYS);
  if (
    !anchor ||
    typeof anchor.row !== "number" ||
    !Number.isSafeInteger(anchor.row) ||
    anchor.row < 0 ||
    typeof anchor.col !== "number" ||
    !Number.isSafeInteger(anchor.col) ||
    anchor.col < 0 ||
    !pixels(anchor.offsetX, false) ||
    !pixels(anchor.offsetY, false) ||
    !pixels(anchor.width, true) ||
    !pixels(anchor.height, true)
  ) {
    return null;
  }

  return {
    row: anchor.row,
    col: anchor.col,
    offsetX: anchor.offsetX,
    offsetY: anchor.offsetY,
    width: anchor.width,
    height: anchor.height,
  };
}

function sanitizeSeries(value: unknown): ChartSeries | null {
  const series = dataProperties(value, SERIES_KEYS);
  if (!series) return null;

  const values = sanitizeChartRange(series.values);
  const nameRange =
    series.nameRange === undefined ? undefined : sanitizeChartRange(series.nameRange);
  const categories =
    series.categories === undefined ? undefined : sanitizeChartRange(series.categories);
  if (
    !values ||
    nameRange === null ||
    categories === null ||
    (series.name !== undefined && !validChartText(series.name))
  ) {
    return null;
  }

  return {
    ...(series.name !== undefined ? { name: series.name } : {}),
    ...(nameRange !== undefined ? { nameRange } : {}),
    values,
    ...(categories !== undefined ? { categories } : {}),
  };
}

function sanitizeAxes(value: unknown): ChartDefinition["axes"] | null {
  const axes = dataProperties(value, AXES_KEYS);
  if (
    !axes ||
    (axes.xTitle !== undefined && !validChartText(axes.xTitle)) ||
    (axes.yTitle !== undefined && !validChartText(axes.yTitle))
  ) {
    return null;
  }

  return {
    ...(axes.xTitle !== undefined ? { xTitle: axes.xTitle } : {}),
    ...(axes.yTitle !== undefined ? { yTitle: axes.yTitle } : {}),
  };
}

/**
 * Validate one untrusted chart definition and return an independent plain copy,
 * or null when any field is missing, unknown, mistyped, or above its bound.
 * Range-to-workbook bounds are checked separately by `chartFitsSheets`.
 */
export function sanitizeChartDefinition(value: unknown): ChartDefinition | null {
  try {
    const chart = dataProperties(value, CHART_KEYS);
    if (
      !chart ||
      !validChartId(chart.id) ||
      !isChartKind(chart.kind) ||
      (chart.title !== undefined && !validChartText(chart.title)) ||
      (chart.legend !== undefined && !isLegendPosition(chart.legend)) ||
      !Array.isArray(chart.series) ||
      chart.series.length > MAX_CHART_SERIES
    ) {
      return null;
    }

    const anchor = sanitizeAnchor(chart.anchor);
    const axes = chart.axes === undefined ? undefined : sanitizeAxes(chart.axes);
    if (!anchor || axes === null) return null;

    const series: ChartSeries[] = [];
    for (const entry of chart.series) {
      const sanitized = sanitizeSeries(entry);
      if (!sanitized) return null;
      series.push(sanitized);
    }

    return {
      id: chart.id,
      kind: chart.kind,
      ...(chart.title !== undefined ? { title: chart.title } : {}),
      ...(axes !== undefined ? { axes } : {}),
      ...(chart.legend !== undefined ? { legend: chart.legend } : {}),
      anchor,
      series,
    };
  } catch {
    // Hostile series arrays, including proxies and custom iterators, can throw during iteration.
    return null;
  }
}

/** Clone one validated chart into an independent plain-data value. */
export function cloneChartDefinition(chart: ChartDefinition): ChartDefinition {
  const cloned = sanitizeChartDefinition(chart);
  if (!cloned) throw new TypeError("Invalid ChartDefinition");
  return cloned;
}

/** Every live source rectangle of a chart; `#REF!` sources are skipped. */
export function chartSourceRanges(chart: ChartDefinition): Range[] {
  const ranges: Range[] = [];
  const add = (range: ChartRange | undefined): void => {
    if (range !== undefined && range !== "#REF!") ranges.push(range);
  };
  for (const series of chart.series) {
    add(series.nameRange);
    add(series.values);
    add(series.categories);
  }
  return ranges;
}

/** Whether a chart sits inside its owner and every live source lies inside an existing sheet. */
export function chartFitsSheets(
  chart: ChartDefinition,
  owner: ChartSheetBounds,
  sheets: readonly ChartSheetBounds[],
): boolean {
  // A sheet emptied by row deletion keeps its charts pinned at the origin.
  if (
    chart.anchor.row >= Math.max(1, owner.rowCount) ||
    chart.anchor.col >= Math.max(1, owner.columns.length)
  ) {
    return false;
  }

  return chartSourceRanges(chart).every((range) => {
    const sheet = sheets.find((candidate) => candidate.id === range.sheet);
    return (
      sheet !== undefined &&
      Math.max(range.start.row, range.end.row) < sheet.rowCount &&
      Math.max(range.start.col, range.end.col) < sheet.columns.length
    );
  });
}

/** Whether already-sanitized sheet charts are uniquely identified, within limits, and in bounds. */
export function sheetChartsFit(
  charts: readonly ChartDefinition[],
  owner: ChartSheetBounds,
  sheets: readonly ChartSheetBounds[],
): boolean {
  if (charts.length > MAX_CHARTS_PER_SHEET) return false;

  const ids = new Set<string>();
  for (const chart of charts) {
    if (ids.has(chart.id) || !chartFitsSheets(chart, owner, sheets)) return false;
    ids.add(chart.id);
  }
  return true;
}

/** Whether one sheet's untrusted charts are valid, uniquely identified, within limits, and in bounds. */
export function validSheetCharts(
  charts: readonly ChartDefinition[],
  owner: ChartSheetBounds,
  sheets: readonly ChartSheetBounds[],
): boolean {
  if (charts.length > MAX_CHARTS_PER_SHEET) return false;

  const sanitized: ChartDefinition[] = [];
  for (const chart of charts) {
    const copy = sanitizeChartDefinition(chart);
    if (!copy) return false;
    sanitized.push(copy);
  }
  return sheetChartsFit(sanitized, owner, sheets);
}

/** Reject a live workbook whose charts are invalid before a store adopts it. */
export function assertWorkbookCharts(
  sheets: readonly (ChartSheetBounds & { readonly charts?: readonly ChartDefinition[] })[],
): void {
  for (const sheet of sheets) {
    const charts = sheet.charts;
    if (!charts) continue;

    if (!validSheetCharts(charts, sheet, sheets)) {
      throw new SheetwriteError(
        "invalid-snapshot",
        "snapshot-allocate",
        `Sheetwrite: invalid chart on sheet ${sheet.id}`,
        { context: { sheet: sheet.id } },
      );
    }
  }
}

/** Whether a chart is anchored on, or reads from, a sheet. */
export function chartTouchesSheet(chart: ChartDefinition, owner: SheetId, sheet: SheetId): boolean {
  return owner === sheet || chartSourceRanges(chart).some((range) => range.sheet === sheet);
}

/** Apply `map` to every live source; unchanged charts keep their identity. */
function mapChartSources(
  chart: ChartDefinition,
  map: (range: Range) => ChartRange,
): ChartDefinition {
  let changed = false;
  const mapRange = (range: ChartRange): ChartRange => {
    if (range === "#REF!") return range;
    const next = map(range);
    if (next !== range) changed = true;
    return next;
  };

  const series = chart.series.map((entry) => {
    const next: ChartSeries = { ...entry, values: mapRange(entry.values) };
    if (entry.nameRange !== undefined) next.nameRange = mapRange(entry.nameRange);
    if (entry.categories !== undefined) next.categories = mapRange(entry.categories);
    return next;
  });
  return changed ? { ...chart, series } : chart;
}

/**
 * One row or column edit on one sheet. `remaining` is the axis length after a
 * delete; a chart whose anchor cell was deleted pins to the first surviving
 * index at the deletion position.
 */
export type ChartAxisEdit =
  | {
      readonly kind: "insert";
      readonly sheet: SheetId;
      readonly axis: "row" | "column";
      readonly at: number;
      readonly count: number;
    }
  | {
      readonly kind: "delete";
      readonly sheet: SheetId;
      readonly axis: "row" | "column";
      readonly at: number;
      readonly count: number;
      readonly remaining: number;
    }
  | {
      readonly kind: "move";
      readonly sheet: SheetId;
      readonly axis: "row" | "column";
      readonly from: number;
      readonly count: number;
      readonly to: number;
    };

/**
 * The new inclusive span of `[start, end]`, or null when every index was deleted.
 * Insert and delete are O(1) from the edit; only moves walk the endpoints.
 */
function rebaseSpan(start: number, end: number, edit: ChartAxisEdit): [number, number] | null {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  if (edit.kind === "insert") {
    return [low >= edit.at ? low + edit.count : low, high >= edit.at ? high + edit.count : high];
  }

  if (edit.kind === "delete") {
    const after = edit.at + edit.count;
    if (low >= edit.at && high < after) return null;

    // A deleted endpoint clamps to the nearest surviving index inside the span.
    const nextLow = low < edit.at ? low : low < after ? edit.at : low - edit.count;
    const nextHigh = high < edit.at ? high : high < after ? edit.at - 1 : high - edit.count;
    return [nextLow, nextHigh];
  }

  return remapSpan(low, high, (index) => moveIndex(index, edit.from, edit.count, edit.to));
}

function rebaseAnchorIndex(index: number, edit: ChartAxisEdit): number {
  if (edit.kind === "insert") return index >= edit.at ? index + edit.count : index;
  if (edit.kind === "move") return moveIndex(index, edit.from, edit.count, edit.to);
  if (index < edit.at) return index;
  if (index >= edit.at + edit.count) return index - edit.count;
  return Math.max(0, Math.min(edit.at, edit.remaining - 1));
}

/**
 * Rewrite a chart owned by `owner` after one row or column edit. Fully deleted
 * sources become `#REF!`; unchanged charts keep their identity.
 */
export function rebaseChartAxis(
  chart: ChartDefinition,
  owner: SheetId,
  edit: ChartAxisEdit,
): ChartDefinition {
  if (!chartTouchesSheet(chart, owner, edit.sheet)) return chart;

  const rows = edit.axis === "row";
  const rebased = mapChartSources(chart, (range) => {
    if (range.sheet !== edit.sheet) return range;

    const start = rows ? range.start.row : range.start.col;
    const end = rows ? range.end.row : range.end.col;
    const span = rebaseSpan(start, end, edit);
    if (!span) return "#REF!";
    if (span[0] === Math.min(start, end) && span[1] === Math.max(start, end)) return range;

    return rows
      ? {
          sheet: range.sheet,
          start: { row: span[0], col: range.start.col },
          end: { row: span[1], col: range.end.col },
        }
      : {
          sheet: range.sheet,
          start: { row: range.start.row, col: span[0] },
          end: { row: range.end.row, col: span[1] },
        };
  });
  if (owner !== edit.sheet) return rebased;

  const index = rows ? chart.anchor.row : chart.anchor.col;
  const mapped = rebaseAnchorIndex(index, edit);
  if (mapped === index) return rebased;

  return {
    ...rebased,
    anchor: rows ? { ...chart.anchor, row: mapped } : { ...chart.anchor, col: mapped },
  };
}

/** Rewrite every source on a removed sheet to `#REF!`. */
export function invalidateChartSheet(chart: ChartDefinition, removed: SheetId): ChartDefinition {
  return mapChartSources(chart, (range) => (range.sheet === removed ? "#REF!" : range));
}
