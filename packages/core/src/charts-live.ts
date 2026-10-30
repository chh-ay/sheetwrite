// Live chart data: resolves chart definitions to plain `ChartView` data with
// bulk window reads, and maps committed edits to the charts they touch.
//
// Nothing here runs for a store until a caller resolves or subscribes, so
// workbooks without charts pay nothing.

import { chartSourceRanges } from "./chart-definition.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type {
  ChartChangeEvent,
  ChartChangeListener,
  ChartDefinition,
  ChartRange,
  ChartRef,
  ChartSeries,
  ChartView,
} from "./types/chart.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet } from "./types/document.js";
import type { Store } from "./types/store.js";
import type { ChangeEvent } from "./types/transaction.js";

/**
 * Most points resolved per series range. Cells are read in row-major order and
 * cells past this count are dropped; the series view reports `truncated`.
 */
export const MAX_CHART_POINTS = 10_000;

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
}

const EMPTY_READ: RangeRead = Object.freeze({
  values: [],
  formats: [],
  locale: null,
  truncated: false,
});

/** Clip a range to its sheet and to the rows that hold the first `MAX_CHART_POINTS` cells. */
function readRect(sheets: ReadonlyMap<SheetId, Sheet>, range: ChartRange): ReadRect | null {
  if (range === "#REF!") return null;

  const sheet = sheets.get(range.sheet);
  if (!sheet) return null;

  const r0 = Math.min(range.start.row, range.end.row);
  const c0 = Math.min(range.start.col, range.end.col);
  const lastRow = Math.min(Math.max(range.start.row, range.end.row), sheet.rowCount - 1);
  const lastCol = Math.min(Math.max(range.start.col, range.end.col), sheet.columns.length - 1);
  const c1 = Math.min(lastCol, c0 + MAX_CHART_POINTS - 1);
  if (r0 > lastRow || c0 > c1) return null;

  // Row-major truncation keeps whole leading rows plus a partial last row.
  const width = c1 - c0 + 1;
  const rowsNeeded = Math.ceil(MAX_CHART_POINTS / width);
  const r1 = Math.min(lastRow, r0 + rowsNeeded - 1);
  const truncated = (lastRow - r0 + 1) * (lastCol - c0 + 1) > MAX_CHART_POINTS;
  return { sheet, r0, r1, c0, c1, truncated };
}

function sheetMap(store: Store): Map<SheetId, Sheet> {
  const sheets = new Map<SheetId, Sheet>();
  for (const sheet of store.getWorkbook().sheets) sheets.set(sheet.id, sheet);
  return sheets;
}

/** One bulk window read per range; never one read per cell. */
function readRange(
  store: Store,
  sheets: ReadonlyMap<SheetId, Sheet>,
  range: ChartRange,
): RangeRead {
  const rect = readRect(sheets, range);
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
  return { values, formats, locale, truncated: rect.truncated };
}

function seriesName(
  store: Store,
  sheets: ReadonlyMap<SheetId, Sheet>,
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
    const name = readRange(store, sheets, {
      sheet: series.nameRange.sheet,
      start: first,
      end: first,
    }).values[0];
    if (name !== null && name !== undefined) return String(name);
  }
  return `Series ${index + 1}`;
}

/**
 * Resolve one chart to plain data the renderer draws without reading cells.
 * Values that are not numbers (text, booleans, errors, empty cells) become
 * `null`. Each series range costs one bulk window read of at most
 * `MAX_CHART_POINTS` cells. Returns `null` when the chart does not exist.
 *
 * Call it after a {@link subscribeChartChanges} event names the chart, not per frame.
 */
export function resolveChartView(store: Store, sheet: SheetId, id: string): ChartView | null {
  const sheets = sheetMap(store);
  const chart = sheets.get(sheet)?.charts?.find((candidate) => candidate.id === id);
  if (!chart) return null;

  const series = chart.series.map((source, index) => {
    const values = readRange(store, sheets, source.values);
    const categories = source.categories ? readRange(store, sheets, source.categories) : EMPTY_READ;

    return {
      name: seriesName(store, sheets, source, index),
      values: values.values.map((value) => (typeof value === "number" ? value : null)),
      categories: categories.values,
      numberFormats: values.formats,
      categoryFormats: categories.formats,
      numberLocale: values.locale,
      truncated: values.truncated || categories.truncated,
      referenceError:
        source.values === "#REF!" || source.categories === "#REF!" || source.nameRange === "#REF!",
    };
  });

  // The view is handed to UI code; a copy keeps it from mutating the document.
  return { chart: structuredClone(chart), series };
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
  private readonly blockMaxEnd: Int32Array;

  constructor(private readonly entries: SourceEntry[]) {
    entries.sort((left, right) => left.rect.r0 - right.rect.r0);
    this.blockMaxEnd = new Int32Array(Math.ceil(entries.length / SOURCE_BLOCK));
    for (let index = 0; index < entries.length; index++) {
      const block = (index / SOURCE_BLOCK) | 0;
      this.blockMaxEnd[block] = Math.max(
        this.blockMaxEnd[block] ?? 0,
        entries[index]?.rect.r1 ?? 0,
      );
    }
  }

  query(range: Range, hit: (chart: number) => void): void {
    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);

    // First entry whose start row is past the edit; nothing from there on can overlap.
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.entries[middle]?.rect.r0 ?? 0) <= r1) low = middle + 1;
      else high = middle;
    }

    for (let block = 0; block * SOURCE_BLOCK < low; block++) {
      if ((this.blockMaxEnd[block] ?? -1) < r0) continue;

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
  /** Charts that read a formula, reference or spill result; any value change may move them. */
  readonly computed: number[] = [];

  constructor(store: Store) {
    const sheets = sheetMap(store);
    const engine = storeEngine(store);
    const entries = new Map<SheetId, SourceEntry[]>();

    for (const sheet of sheets.values()) {
      for (const definition of sheet.charts ?? []) {
        const chart = this.charts.length;
        this.charts.push({ sheet: sheet.id, id: definition.id });

        const owned = this.owned.get(sheet.id);
        if (owned) owned.push(chart);
        else this.owned.set(sheet.id, [chart]);

        if (this.addSources(definition, chart, sheets, entries, engine)) this.computed.push(chart);
      }
    }

    for (const [sheet, list] of entries) this.sources.set(sheet, new SheetSources(list));
  }

  /** Returns whether the chart reads a computed cell. Custom stores cannot tell, so they always do. */
  private addSources(
    definition: ChartDefinition,
    chart: number,
    sheets: ReadonlyMap<SheetId, Sheet>,
    entries: Map<SheetId, SourceEntry[]>,
    engine: StoreDataEngine | null,
  ): boolean {
    let computed = false;

    for (const range of chartSourceRanges(definition)) {
      const rect = readRect(sheets, range);
      if (!rect) continue;

      const list = entries.get(rect.sheet.id);
      if (list) list.push({ rect, chart });
      else entries.set(rect.sheet.id, [{ rect, chart }]);

      // One bulk source capture per range, only while no earlier range answered.
      computed ||=
        engine === null ||
        engine.chartSourcesComputed({
          sheet: rect.sheet.id,
          start: { row: rect.r0, col: rect.c0 },
          end: { row: rect.r1, col: rect.c1 },
        });
    }

    return computed;
  }
}

/** Upper bound for open-ended index queries; larger than any row or column index. */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/** Whether a direct cell edit may add a formula, reference or spill to its rectangle. */
function mayAddComputedSource(patch: DocumentOp): boolean {
  switch (patch.op) {
    case "set":
      return patch.value.kind !== "literal";
    case "setRange":
      return patch.cells.some((cell) => cell.value.kind !== "literal");
    case "setBlock":
      return (patch.block.formulas?.length ?? 0) > 0 || (patch.block.refs?.length ?? 0) > 0;
    case "restoreBlock":
      return true;
    default:
      return false;
  }
}

interface PatchContext {
  readonly index: ChartIndex;
  readonly hits: Set<number>;
  readonly direct: ChartRef[];
  valuesChanged: boolean;
  rebuild: boolean;
}

/** Classify committed patches against the old index before rebuilding rewritten sources. */
function classifyPatch(patch: DocumentOp, context: PatchContext): void {
  const { index, hits, direct } = context;
  const hit = (chart: number) => hits.add(chart);
  const sheetWide = (sheet: SheetId) => index.sources.get(sheet)?.all(hit);

  switch (patch.op) {
    case "set":
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "clearRange": {
      const range =
        patch.op === "set"
          ? { sheet: patch.addr.sheet, start: patch.addr, end: patch.addr }
          : patch.range;
      const sources = index.sources.get(range.sheet);
      sources?.query(range, hit);
      context.valuesChanged = true;

      // Spills grow down and right and can reach a source outside the edited rectangle.
      if (mayAddComputedSource(patch)) {
        const start = {
          row: Math.min(range.start.row, range.end.row),
          col: Math.min(range.start.col, range.end.col),
        };
        sources?.query(
          { sheet: range.sheet, start, end: { row: UNBOUNDED, col: UNBOUNDED } },
          (chart) => {
            hits.add(chart);
            context.rebuild = true;
          },
        );
      }
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
      sheetWide(patch.sheet);
      for (const chart of index.owned.get(patch.sheet) ?? []) hits.add(chart);
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
    case "addTable":
    case "updateTable":
    case "removeTable":
      // Table edits can write header and total cells.
      sheetWide(patch.op === "addTable" ? patch.table.range.sheet : patch.sheet);
      context.valuesChanged = true;
      return;
    case "renameSheet":
    case "moveSheet":
    case "setNamedRange":
    case "removeNamedRange":
    case "setCalculation":
      // Formula results can depend on names, calculation settings and sheet identity/order.
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
  private readonly detach: () => void;

  constructor(private readonly store: Store) {
    this.index = new ChartIndex(store);
    this.detach = store.on("change", (event) => this.onChange(event));
  }

  dispose(): void {
    this.detach();
  }

  private onChange(event: ChangeEvent): void {
    const index = this.index;
    const context: PatchContext = {
      index,
      hits: new Set<number>(),
      direct: [],
      // Volatile recalculation commits no patches but can change values.
      valuesChanged: event.transaction.patches.length === 0,
      rebuild: false,
    };
    for (const patch of event.transaction.patches) classifyPatch(patch, context);

    const { hits, direct, valuesChanged, rebuild } = context;
    if (valuesChanged) for (const chart of index.computed) hits.add(chart);

    if (rebuild) this.index = new ChartIndex(this.store);

    if (hits.size === 0 && direct.length === 0) return;

    const seen = new Map<SheetId, Set<string>>();
    const charts: ChartRef[] = [];
    const push = (ref: ChartRef) => {
      let ids = seen.get(ref.sheet);
      if (!ids) {
        ids = new Set<string>();
        seen.set(ref.sheet, ids);
      }
      if (ids.has(ref.id)) return;
      ids.add(ref.id);
      charts.push(ref);
    };
    for (const chart of hits) {
      const ref = index.charts[chart];
      if (ref) push(ref);
    }
    for (const ref of direct) push(ref);

    const changeEvent: ChartChangeEvent = { epoch: event.epoch, charts };
    for (const listener of this.listeners) listener(changeEvent);
  }
}

const TRACKERS = new WeakMap<Store, ChartTracker>();

/**
 * Listen for commits that change any chart's `ChartView`. Edited rectangles are
 * matched against an index of series ranges, so edits outside every series
 * range cost no chart work. Charts that read formulas, references or spills
 * also change on any commit that changes cell values. Returns an unsubscribe
 * function; the index is dropped with the last listener.
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
