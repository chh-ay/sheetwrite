// Live chart data: resolves chart definitions to plain `ChartView` data with
// bulk window reads, and maps committed edits to the charts they touch.
//
// Nothing here runs for a store until a caller resolves or subscribes, so
// workbooks without charts pay nothing.

import { MAX_CHART_POINTS } from "./chart-definition.js";
import { isDevelopmentBuild } from "./development-build.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type {
  ChartCategoryLevel,
  ChartChangeEvent,
  ChartChangeListener,
  ChartDefinition,
  ChartKind,
  ChartRange,
  ChartRef,
  ChartSeries,
  ChartSeriesView,
  ChartView,
} from "./types/chart.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet } from "./types/document.js";
import type { Store } from "./types/store.js";
import type { ChangeEvent } from "./types/transaction.js";

/** Inclusive rectangle actually read for one series range, after bounds and point limits. */
interface ReadRect {
  readonly sheet: Sheet;
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
  readonly truncated: boolean;
}

interface RangeRead {
  readonly values: CellScalar[];
  readonly formats: Array<string | null>;
  readonly locale: string | null;
  readonly truncated: boolean;
  /** Columns per row of `values`. */
  readonly width: number;
}

const EMPTY_READ: RangeRead = Object.freeze({
  values: [],
  formats: [],
  locale: null,
  truncated: false,
  width: 0,
});

/** How a category range holds its levels: one per column or one per row. */
type CategoryLevelLayout = "columns" | "rows";

/**
 * How the categories of `series` hold levels, or null when they have one
 * level. As in Excel, a category range of several rows and several columns
 * holds one level per column when the values run down a column, and one
 * level per row when the values run along a row. Scatter charts read X
 * values, which have no levels.
 */
function category_level_layout(kind: ChartKind, series: ChartSeries): CategoryLevelLayout | null {
  const { categories, values } = series;
  if (kind === "scatter" || categories === undefined || categories === "#REF!") return null;
  if (categories.start.row === categories.end.row || categories.start.col === categories.end.col) {
    return null;
  }

  const along_row =
    values !== "#REF!" &&
    values.start.row === values.end.row &&
    values.start.col !== values.end.col;
  return along_row ? "rows" : "columns";
}

/**
 * Clip a range to its sheet and to the rows that hold the first
 * `MAX_CHART_POINTS` cells. With `all_rows`, the columns are clipped first so
 * that every row fits, because each row is one category level.
 */
function read_rect(sheets: SheetLookup, range: ChartRange, all_rows = false): ReadRect | null {
  if (range === "#REF!") return null;

  const sheet = sheets(range.sheet);
  if (!sheet) return null;

  const r0 = Math.min(range.start.row, range.end.row);
  const c0 = Math.min(range.start.col, range.end.col);
  const last_row = Math.min(Math.max(range.start.row, range.end.row), sheet.rowCount - 1);
  const last_col = Math.min(Math.max(range.start.col, range.end.col), sheet.columns.length - 1);
  const row_count = last_row - r0 + 1;
  const max_width = all_rows
    ? Math.max(1, Math.floor(MAX_CHART_POINTS / row_count))
    : MAX_CHART_POINTS;
  const c1 = Math.min(last_col, c0 + max_width - 1);
  if (r0 > last_row || c0 > c1) return null;

  // Row-major truncation keeps whole leading rows plus a partial last row.
  const width = c1 - c0 + 1;
  const rows_needed = Math.ceil(MAX_CHART_POINTS / width);
  const r1 = Math.min(last_row, r0 + rows_needed - 1);
  const truncated = row_count * (last_col - c0 + 1) > MAX_CHART_POINTS;
  return { sheet, r0, r1, c0, c1, truncated };
}

type SheetLookup = (id: SheetId) => Sheet | undefined;

/**
 * The engine's index of sheets by ID. Only a custom store, which has no
 * engine, gets a map built for the one call.
 */
function sheet_lookup(store: Store): SheetLookup {
  const engine = storeEngine(store);
  if (engine) return (id) => engine.sheets.find(id);

  const sheets = new Map<SheetId, Sheet>();
  for (const sheet of store.getWorkbook().sheets) sheets.set(sheet.id, sheet);
  return (id) => sheets.get(id);
}

/**
 * One bulk window read per range; never one read per cell. `all_rows` reads
 * every row of the range, as `read_rect` does.
 */
function read_range(
  store: Store,
  sheets: SheetLookup,
  range: ChartRange,
  all_rows = false,
): RangeRead {
  const rect = read_rect(sheets, range, all_rows);
  if (!rect) return EMPTY_READ;

  const sheet = rect.sheet;

  const cols: number[] = [];
  for (let col = rect.c0; col <= rect.c1; col++) cols.push(col);

  // Data rows, not view rows: sorting or filtering the sheet must not reorder a series.
  const rows = { start: rect.r0, end: rect.r1 + 1 };
  const window = store.getDataWindow
    ? store.getDataWindow(sheet.id, rows, cols)
    : store.getVisibleWindow(sheet.id, rows, cols);

  const count = Math.min(window.values.length, MAX_CHART_POINTS);
  const values = new Array<CellScalar>(count);
  const formats = new Array<string | null>(count);
  const width = cols.length;
  for (let index = 0; index < count; index++) {
    values[index] = window.values[index] ?? null;

    // The same precedence the grid paints with, so axis labels match the cells.
    const style = window.styles[window.styleIds[index] ?? 0];
    const column = sheet.columns[rect.c0 + (index % width)];
    formats[index] =
      style?.numberFormat ?? column?.cellStyle?.numberFormat ?? column?.numberFormat ?? null;
  }

  const locale = sheet.columns[rect.c0]?.numberLocale ?? null;
  return { values, formats, locale, truncated: rect.truncated, width };
}

/** The categories of a series view: the innermost level and the outer levels. */
type CategoryView = Pick<ChartSeriesView, "categories" | "categoryFormats" | "categoryLevels">;

/**
 * Split a category read into levels, one per column or one per row of the
 * read. The last column (or row) is the innermost level and labels each
 * point. A partial last row of a truncated read is dropped.
 */
function category_levels(read: RangeRead, layout: CategoryLevelLayout): CategoryView {
  const width = read.width;
  const rows = Math.floor(read.values.length / Math.max(1, width));
  const level_count = layout === "columns" ? width : rows;
  const points = layout === "columns" ? rows : width;
  const levels: ChartCategoryLevel[] = [];

  for (let level = 0; level < level_count; level++) {
    const labels = new Array<CellScalar>(points);
    const formats = new Array<string | null>(points);
    for (let point = 0; point < points; point++) {
      const cell = layout === "columns" ? point * width + level : level * width + point;
      labels[point] = read.values[cell] ?? null;
      formats[point] = read.formats[cell] ?? null;
    }
    levels.push({ labels, formats });
  }

  const inner = levels.pop();
  return {
    categories: inner?.labels ?? [],
    categoryFormats: inner?.formats ?? [],
    categoryLevels: levels,
  };
}

/** The categories of `source` in a chart of `kind`, with their levels. */
function read_categories(
  store: Store,
  sheets: SheetLookup,
  kind: ChartKind,
  source: ChartSeries,
): CategoryView & { truncated: boolean } {
  if (source.categories === undefined) {
    return { categories: [], categoryFormats: [], categoryLevels: [], truncated: false };
  }

  const layout = category_level_layout(kind, source);
  const read = read_range(store, sheets, source.categories, layout === "rows");
  if (layout === null) {
    return {
      categories: read.values,
      categoryFormats: read.formats,
      categoryLevels: [],
      truncated: read.truncated,
    };
  }
  return { ...category_levels(read, layout), truncated: read.truncated };
}

/** What decides the categories `read_categories` returns for `source`: its range and level layout. */
function category_key(kind: ChartKind, source: ChartSeries): string {
  const { categories } = source;
  if (categories === undefined || categories === "#REF!") return String(categories);

  const layout = category_level_layout(kind, source);
  return JSON.stringify([layout, categories.sheet, categories.start, categories.end]);
}

function series_name(
  store: Store,
  sheets: SheetLookup,
  series: ChartSeries,
  index: number,
): string {
  if (series.name !== undefined) return series.name;
  if (series.nameRange === "#REF!") return "#REF!";
  if (series.nameRange) {
    // Only the leading cell names the series; do not read the rest of a large label range.
    // Backwards ranges from custom stores still start at their top-left cell.
    const { start, end } = series.nameRange;
    const first = { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) };
    const name = read_range(store, sheets, {
      sheet: series.nameRange.sheet,
      start: first,
      end: first,
    }).values[0];
    if (name !== null && name !== undefined) return String(name);
  }
  return `Series ${index + 1}`;
}

/** Freeze `value` and everything it holds; frozen parts are not visited again. */
function deep_freeze(value: object): void {
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deep_freeze(child);
  }
}

/** Builds the view of a chart over a pivot; set by the pivot view chunk when it loads. */
let pivot_charts: ((store: Store, sheet: SheetId, chart: ChartDefinition) => ChartView) | null =
  null;

/** Engines whose pivot views are computed or loading, so each asks for them once. */
const pivot_engines = new WeakSet<StoreDataEngine>();

/**
 * Set how charts over pivots resolve, after the engine of `store` computed
 * its pivot views. The listeners of `store` hear that its charts over pivots
 * changed. The pivot view chunk calls it.
 */
export function setPivotChartViews(
  store: Store,
  views: (store: Store, sheet: SheetId, chart: ChartDefinition) => ChartView,
): void {
  pivot_charts = views;
  TRACKERS.get(store)?.pivotViewsChanged();
}

/**
 * Load the pivot view chunk and let the engine of `store` compute the pivot
 * views, once per engine. A failed load tries again at the next request. A
 * store disposed while the chunk loads is not called again.
 */
function request_pivot_views(store: Store): void {
  const engine = storeEngine(store);
  if (engine === null || pivot_engines.has(engine)) return;

  pivot_engines.add(engine);
  void import("./dashboard/dashboard-engine.js").then(
    (module) => {
      if (engine.isDisposed) return;
      module.applyPivotViews(store, []);
      setPivotChartViews(store, module.pivotChartViewOf);
    },
    (error: unknown) => {
      pivot_engines.delete(engine);
      throw error;
    },
  );
}

/**
 * Resolve one chart to plain data the renderer draws without reading cells.
 * Values that are not numbers (text, booleans, errors, empty cells) become
 * `null`. Each series range costs one bulk window read of at most
 * `MAX_CHART_POINTS` cells. Returns `null` when the chart does not exist.
 *
 * A chart over a pivot reads the pivot's leaf items from a pivot view. The
 * first such chart loads the code for it; until then the chart has no
 * series, and a change event names it when it loads.
 *
 * Call it after a {@link subscribeChartChanges} event names the chart, not per frame.
 *
 * @param store - The store that holds the workbook, such as `grid.store`.
 * @param sheet - Stable ID of the sheet that holds the chart.
 * @param id - The chart's `id`, unique on its sheet.
 * @returns The chart's resolved series, labels and settings, or `null`.
 */
export function resolveChartView(store: Store, sheet: SheetId, id: string): ChartView | null {
  const sheets = sheet_lookup(store);
  const chart = sheets(sheet)?.charts?.find((candidate) => candidate.id === id);
  if (!chart) return null;
  // The view shares the store's definition; a development build catches a write into it.
  if (isDevelopmentBuild()) deep_freeze(chart);
  if (chart.pivot !== undefined) {
    request_pivot_views(store);
    return pivot_charts?.(store, sheet, chart) ?? { chart, series: [] };
  }

  // The series of a chart usually share one category range. It is read once,
  // and those series share its arrays, as the view shares the definition.
  const category_reads = new Map<string, ReturnType<typeof read_categories>>();
  const series = chart.series.map((source, index): ChartSeriesView => {
    const values = read_range(store, sheets, source.values);
    const key = category_key(chart.kind, source);
    let categories = category_reads.get(key);
    if (categories === undefined) {
      categories = read_categories(store, sheets, chart.kind, source);
      category_reads.set(key, categories);
    }

    return {
      name: series_name(store, sheets, source, index),
      values: values.values.map((value) => (typeof value === "number" ? value : null)),
      categories: categories.categories,
      categoryLevels: categories.categoryLevels,
      numberFormats: values.formats,
      categoryFormats: categories.categoryFormats,
      numberLocale: values.locale,
      truncated: values.truncated || categories.truncated,
      referenceError:
        source.values === "#REF!" || source.categories === "#REF!" || source.nameRange === "#REF!",
    };
  });

  // The store replaces a chart definition when it changes and never writes
  // into one, so the view shares it; see `ChartView.chart`.
  return { chart, series };
}

/** Index entries per source sheet are grouped in blocks; each block keeps its widest row end. */
const SOURCE_BLOCK = 32;

interface SourceEntry {
  readonly rect: ReadRect;
  readonly chart: number;
}

/**
 * Source rectangles of one sheet, sorted by first row. A query binary-searches
 * the last entry that can start inside the edit, then skips whole blocks that
 * end above it, so an edit costs O(log n + n / 32 + hits) instead of a scan of
 * every chart.
 */
class SheetSources {
  private readonly block_max_end: Int32Array;

  constructor(private readonly entries: SourceEntry[]) {
    entries.sort((left, right) => left.rect.r0 - right.rect.r0);
    this.block_max_end = new Int32Array(Math.ceil(entries.length / SOURCE_BLOCK));
    for (let index = 0; index < entries.length; index++) {
      const block = (index / SOURCE_BLOCK) | 0;
      this.block_max_end[block] = Math.max(
        this.block_max_end[block] ?? 0,
        entries[index]?.rect.r1 ?? 0,
      );
    }
  }

  query(range: Range, hit: (chart: number) => void): void {
    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);

    this.queryBounds(r0, r1, c0, c1, hit);
  }

  /** Inclusive primitive bounds avoid building a Range per engine rectangle. */
  queryBounds(r0: number, r1: number, c0: number, c1: number, hit: (chart: number) => void): void {
    // First entry whose start row is past the edit; nothing from there on can overlap.
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.entries[middle]?.rect.r0 ?? 0) <= r1) low = middle + 1;
      else high = middle;
    }

    for (let block = 0; block * SOURCE_BLOCK < low; block++) {
      if ((this.block_max_end[block] ?? -1) < r0) continue;

      const end = Math.min(low, (block + 1) * SOURCE_BLOCK);
      for (let index = block * SOURCE_BLOCK; index < end; index++) {
        const entry = this.entries[index];
        if (!entry) continue;
        const rect = entry.rect;
        if (rect.r1 >= r0 && rect.c0 <= c1 && rect.c1 >= c0) hit(entry.chart);
      }
    }
  }

  all(hit: (chart: number) => void): void {
    for (const entry of this.entries) hit(entry.chart);
  }
}

/** Immutable index over the chart definitions of one workbook state. */
class ChartIndex {
  readonly charts: ChartRef[] = [];
  readonly sources = new Map<SheetId, SheetSources>();
  readonly owned = new Map<SheetId, number[]>();
  /** Charts over pivots have no cell-source rectangle to query. */
  readonly pivotIndices: number[] = [];
  /** Charts over pivots; they also change when the pivot views are computed again. */
  readonly pivots: ChartRef[] = [];

  constructor(store: Store) {
    const sheets = sheet_lookup(store);
    const entries = new Map<SheetId, SourceEntry[]>();

    for (const sheet of store.getWorkbook().sheets) {
      for (const definition of sheet.charts ?? []) {
        const chart = this.charts.length;
        const ref = { sheet: sheet.id, id: definition.id };
        this.charts.push(ref);

        const owned = this.owned.get(sheet.id);
        if (owned) owned.push(chart);
        else this.owned.set(sheet.id, [chart]);

        if (definition.pivot !== undefined) {
          // A chart over a pivot reads the pivot's result.
          this.pivots.push(ref);
          this.pivotIndices.push(chart);
        } else {
          this.add_sources(definition, chart, sheets, entries);
        }
      }
    }

    for (const [sheet, list] of entries) this.sources.set(sheet, new SheetSources(list));
  }

  /** Position of `ref` in {@link charts}, or undefined when this index does not hold it. */
  find(ref: ChartRef): number | undefined {
    return this.owned.get(ref.sheet)?.find((chart) => this.charts[chart]?.id === ref.id);
  }

  /** Index each source rectangle once, independent of the cells it currently holds. */
  private add_sources(
    definition: ChartDefinition,
    chart: number,
    sheets: SheetLookup,
    entries: Map<SheetId, SourceEntry[]>,
  ): void {
    for (const series of definition.series) {
      // Category levels in rows are read with every row, so the index covers the same cells.
      const level_rows = category_level_layout(definition.kind, series) === "rows";
      for (const range of [series.nameRange, series.values, series.categories]) {
        if (range === undefined) continue;
        const rect = read_rect(sheets, range, level_rows && range === series.categories);
        if (!rect) continue;

        const list = entries.get(rect.sheet.id);
        if (list) list.push({ rect, chart });
        else entries.set(rect.sheet.id, [{ rect, chart }]);
      }
    }
  }
}

/** Values per engine recalculation rectangle: sheet handle, row start/end, column start/end. */
const RECALCULATION_RECT_WIDTH = 5;
/** A handle no sheet has; `sheetIdOfHandle` returns undefined for it. */
const NO_SHEET_HANDLE = -1;

/** Upper bound for open-ended index queries; larger than any row or column index. */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/**
 * The indexed charts one commit names, each once, in the order first named.
 * A chart is marked by writing the commit's stamp at its position, so a
 * commit allocates nothing per chart and clears nothing.
 */
class ChartHits {
  private stamps = new Uint32Array(0);
  private stamp = 0;
  readonly charts: number[] = [];

  /** Start a commit over an index of `count` charts. */
  reset(count: number): void {
    if (this.stamps.length < count) this.stamps = new Uint32Array(count);
    if (this.stamp === 0xffff_ffff) {
      this.stamps.fill(0);
      this.stamp = 0;
    }
    this.stamp += 1;
    this.charts.length = 0;
  }

  has(chart: number): boolean {
    return this.stamps[chart] === this.stamp;
  }

  add(chart: number): void {
    if (this.stamps[chart] === this.stamp) return;
    this.stamps[chart] = this.stamp;
    this.charts.push(chart);
  }
}

interface PatchContext {
  readonly index: ChartIndex;
  readonly hits: ChartHits;
  readonly direct: ChartRef[];
  valuesChanged: boolean;
  rebuild: boolean;
}

/** Classify committed patches against the old index before rebuilding rewritten sources. */
function classify_patch(patch: DocumentOp, context: PatchContext): void {
  const { index, hits, direct } = context;
  const hit = (chart: number) => hits.add(chart);
  const sheet_wide = (sheet: SheetId) => index.sources.get(sheet)?.all(hit);

  switch (patch.op) {
    case "set":
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "permuteRows":
    case "clearRange": {
      const range =
        patch.op === "set"
          ? { sheet: patch.addr.sheet, start: patch.addr, end: patch.addr }
          : patch.range;
      const sources = index.sources.get(range.sheet);
      sources?.query(range, hit);
      context.valuesChanged = true;

      return;
    }

    case "setRangeStyle":
      // The view carries number formats, not other cell styling.
      if (patch.style === null || patch.style.numberFormat !== undefined)
        index.sources.get(patch.range.sheet)?.query(patch.range, hit);
      return;

    case "setColumn": {
      const changed = patch.patch;
      if (
        changed.numberFormat !== undefined ||
        changed.numberLocale !== undefined ||
        changed.cellStyle !== undefined
      ) {
        index.sources.get(patch.sheet)?.query(
          {
            sheet: patch.sheet,
            start: { row: 0, col: patch.col },
            end: { row: UNBOUNDED, col: patch.col },
          },
          hit,
        );
      }

      return;
    }

    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
    case "removeSheet":
      // Structural edits rewrite both sources and owned anchors.
      sheet_wide(patch.sheet);
      for (const chart of index.owned.get(patch.sheet) ?? []) hits.add(chart);
      context.valuesChanged = true;
      context.rebuild = true;
      return;

    case "moveCells":
      // The moved cells take their sources along, and both blocks change.
      sheet_wide(patch.range.sheet);
      sheet_wide(patch.to.sheet);
      context.valuesChanged = true;
      context.rebuild = true;
      return;

    case "addSheet":
      for (const chart of patch.sheet.charts ?? []) {
        direct.push({ sheet: patch.sheet.id, id: chart.id });
      }

      context.valuesChanged = true;
      context.rebuild = true;
      return;

    case "setChart":
      direct.push({ sheet: patch.sheet, id: patch.chart.id });
      context.rebuild = true;
      return;

    case "removeChart":
      direct.push({ sheet: patch.sheet, id: patch.id });
      context.rebuild = true;
      return;

    case "setPivot":
    case "removePivot":
      // Output cells on the anchor sheet appear, move or clear with no cell op on them,
      // and a source can start or stop reading pivot output.
      sheet_wide(patch.sheet);
      context.valuesChanged = true;
      context.rebuild = true;
      return;

    case "addTable":
    case "updateTable":
    case "removeTable":
      // Table edits can write header and total cells.
      sheet_wide(patch.op === "addTable" ? patch.table.range.sheet : patch.sheet);
      context.valuesChanged = true;
      return;

    case "renameSheet":
    case "moveSheet":
    case "setNamedRange":
    case "removeNamedRange":
    case "setCalculation":
    case "setExternalLinks":
      // Formula results can depend on names, calculation settings, linked values and sheet identity/order.
      context.valuesChanged = true;
      return;

    case "setNote":
    case "setHyperlink":
    case "removeHyperlink":
    case "setValidationRule":
    case "removeValidationRule":
    case "setProtectedRange":
    case "removeProtectedRange":
    case "setRowMeta":
    case "addMerge":
    case "removeMerge":
    case "setSheetMeta":
    case "setSheetVisibility":
      // Presentation metadata does not change canonical source values.
      return;

    case "setRelationship":
    case "removeRelationship":
    case "setMeasure":
    case "removeMeasure":
      // A model change can change pivot output read by a chart.
      context.valuesChanged = true;
      return;

    case "setQuery":
    case "removeQuery":
      // A definition writes no cell; a refresh writes cells through ordinary range ops.
      return;

    case "setDashboardItem":
    case "removeDashboardItem":
      // A dashboard has no cells for a chart to read.
      return;

    default: {
      const unhandled: never = patch;
      return unhandled;
    }
  }
}

/** Per-store subscription state; exists only while at least one listener is attached. */
class ChartTracker {
  readonly listeners = new Set<ChartChangeListener>();
  private index: ChartIndex;
  private readonly hits = new ChartHits();
  /** One bound callback for every index query, so a commit allocates none. */
  private readonly add_hit = (chart: number): void => this.hits.add(chart);
  private readonly engine: StoreDataEngine | null;
  private readonly detach: () => void;

  constructor(private readonly store: Store) {
    this.index = new ChartIndex(store);
    this.engine = storeEngine(store);
    this.engine?.trackChartRecalculation(true);
    this.detach = store.on("change", (event) => this.on_change(event));
  }

  dispose(): void {
    this.detach();
    this.engine?.trackChartRecalculation(false);
  }

  /**
   * Name every chart over a pivot: the pivot views they read were computed
   * again with no commit, so the event has no epoch.
   */
  pivotViewsChanged(): void {
    const charts = this.index.pivots;
    if (charts.length === 0) return;

    const event: ChartChangeEvent = { epoch: undefined, charts: [...charts] };
    for (const listener of this.listeners) listener(event);
  }

  /**
   * Name the indexed charts whose sources meet a rectangle the engine
   * recalculated in commit `epoch`. False when the engine cannot tell, so
   * the caller names every chart.
   */
  private query_recalculated(epoch: number | undefined, index: ChartIndex): boolean {
    const engine = this.engine;
    const rects = engine?.recalculatedRects(epoch);
    if (!engine || !rects) return false;
    for (
      let offset = 0;
      offset + RECALCULATION_RECT_WIDTH <= rects.length;
      offset += RECALCULATION_RECT_WIDTH
    ) {
      const sheet = engine.sheetIdOfHandle(rects[offset] ?? NO_SHEET_HANDLE);
      const sources = sheet === undefined ? undefined : index.sources.get(sheet);
      sources?.queryBounds(
        rects[offset + 1] ?? 0,
        (rects[offset + 2] ?? 0) - 1,
        rects[offset + 3] ?? 0,
        (rects[offset + 4] ?? 0) - 1,
        this.add_hit,
      );
    }
    return true;
  }

  private on_change(event: ChangeEvent): void {
    const index = this.index;
    const hits = this.hits;
    hits.reset(index.charts.length);
    const context: PatchContext = {
      index,
      hits,
      direct: [],
      // Volatile recalculation commits no patches but can change values.
      valuesChanged: event.transaction.patches.length === 0,
      rebuild: false,
    };
    for (const patch of event.transaction.patches) classify_patch(patch, context);

    const { direct, valuesChanged: values_changed, rebuild } = context;
    const precise = this.query_recalculated(event.epoch, index);
    if (values_changed) {
      if (precise) {
        // Pivot views have no worksheet source rectangle; their asynchronous
        // refresh also names them through pivotViewsChanged().
        for (const chart of index.pivotIndices) hits.add(chart);
      } else {
        // Without precise rectangles (a custom store, or an engine report that
        // overflowed its bound), any chart may have changed.
        for (let chart = 0; chart < index.charts.length; chart++) hits.add(chart);
      }
    }

    if (rebuild) this.index = new ChartIndex(this.store);

    if (hits.charts.length === 0 && direct.length === 0) return;

    const charts: ChartRef[] = [];
    for (const chart of hits.charts) {
      const ref = index.charts[chart];
      if (ref) charts.push(ref);
    }

    // Direct refs are few: chart edits and new sheets. A chart the old index
    // lacks (a new one) is deduplicated by its key.
    let unindexed: Set<string> | undefined;
    for (const ref of direct) {
      const chart = index.find(ref);
      if (chart !== undefined) {
        if (hits.has(chart)) continue;
        hits.add(chart);
      } else {
        unindexed ??= new Set();
        const key = `${ref.sheet}\u0000${ref.id}`;
        if (unindexed.has(key)) continue;
        unindexed.add(key);
      }
      charts.push(ref);
    }

    const change_event: ChartChangeEvent = { epoch: event.epoch, charts };
    for (const listener of this.listeners) listener(change_event);
  }
}

const TRACKERS = new WeakMap<Store, ChartTracker>();

/**
 * Listen for commits that change any chart's `ChartView`. Edited rectangles are
 * matched against an index of series ranges, so edits outside every series
 * range cost no chart work. Recomputed formulas and changed spill/pivot cells
 * query the same index. Custom stores, and commits whose engine report of
 * recalculated rectangles overflowed, name every chart. The index is dropped
 * with the last listener.
 *
 * @returns A function that removes `listener`.
 */
export function subscribeChartChanges(store: Store, listener: ChartChangeListener): () => void {
  let tracker = TRACKERS.get(store);
  if (!tracker) {
    tracker = new ChartTracker(store);
    TRACKERS.set(store, tracker);
  }
  tracker.listeners.add(listener);

  const owner = tracker;
  return () => {
    owner.listeners.delete(listener);
    if (owner.listeners.size > 0 || TRACKERS.get(store) !== owner) return;
    owner.dispose();
    TRACKERS.delete(store);
  };
}
