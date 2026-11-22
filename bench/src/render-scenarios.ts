import { OffsetIndex } from "../../packages/core/src/fenwick.js";
import type { ColumnarDataset } from "./dataset.js";
import { COL, COLUMNS, logicalValueChecksum } from "./dataset.js";
import {
  ALL_RENDER_SCENARIOS,
  createWindowTransferMetrics,
  type FailedScenario,
  type MeasuredSample,
  type MemoryDelta,
  type MergeIndexResourceMetrics,
  type RenderResourceMetrics,
  type ScenarioId,
  type ScenarioIdentity,
  type ScenarioResult,
  scenarioDataValidity,
  scenarioGroup,
  type ValidationObservation,
  WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
  WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
  type WindowTransferMetrics,
} from "./render-protocol.js";
import { summarizeFinite } from "./stats.js";

const SCROLL_STEP = 50;
const EDIT_VALUE = "Benchmark edit";
const ALTER_COUNT = 5;
const FRACTIONAL_SCROLL_STEP = 1;
const LONG_SCROLL_STEP_PX = 448;
const LONG_SCROLL_ROW_STRIDE = 16;
const LONG_SCROLL_MAX_STEPS = 1_100;
/** Sheetwrite's default row height, shared with the unscaled million-row geometry. */
const ROW_HEIGHT_PX = 28;
const HSCROLL_SMALL_STEP_PX = 8;
const HSCROLL_SMALL_STEPS = 16;
const FROZEN_SCROLL_ROWS = 200;
const FROZEN_ROW_COUNT = 1;
const FROZEN_COLUMN_COUNT = 1;
/** Corner, pinned row, pinned column, and body panes. */
const FROZEN_PANE_COUNT = 4;
/** Wrapped body text length installed by `wrap-heavy.scroll`. */
export const WRAP_HEAVY_TEXT_LENGTH = 200;
/** Marker prefix of the wrapped body text installed by `wrap-heavy.scroll`. */
export const WRAP_HEAVY_TEXT_PREFIX = "diagnostic-wrap-";
/** One grapheme of two code units (a letter and a combining accent), repeated by `wrap-unicode.paint.*`. */
const WRAP_UNICODE_GRAPHEME = "e\u0301";
/** Grapheme count of the one wrapped cell each `wrap-unicode.paint.*` scenario paints. */
const WRAP_UNICODE_GRAPHEMES: Partial<Record<ScenarioId, number>> = {
  "wrap-unicode.paint.200": 200,
  "wrap-unicode.paint.2000": 2_000,
  "wrap-unicode.paint.20000": 20_000,
};
/** Body cell that holds the wrapped text: visible at the top-left of the first frame. */
export const WRAP_UNICODE_CELL = { row: 1, col: 2 } as const;
/** Marker prefix of the searchable body text installed by `search-many.scroll`. */
export const SEARCH_MATCH_PREFIX = "diagnostic-search-";
/** Amount that separates the two conditional-format style rules. */
export const CONDITIONAL_AMOUNT_THRESHOLD = 1_000;
export const CONDITIONAL_HIGH_BACKGROUND = "#fde9d9";
export const CONDITIONAL_LOW_COLOR = "#b45309";
/** Currency format installed on the amount column by `number-format.hscroll`. */
export const CURRENCY_NUMBER_FORMAT = "$#,##0.00";

export interface CellSelection {
  readonly row: number;
  readonly col: number;
}

export interface ScrollObservation {
  readonly top: number;
  readonly left: number;
  readonly maximumTop: number;
  readonly maximumLeft: number;
  readonly firstVisibleRow: number;
  readonly devicePixelRatio: number;
}
export interface GeometryObservation {
  readonly count: number;
  readonly backingStoreBytes: number;
  readonly totalHeight: number;
  readonly middleRow: number;
  readonly middleTop: number;
  readonly lastRow: number;
  readonly lastTop: number;
}
/**
 * Uniform geometry builds timed as one action. One build takes about 0.1 µs,
 * far below the browser clock (coarsened to 100 µs without cross-origin
 * isolation), so timing builds one by one measures clock noise and a fast
 * machine cannot reach the aggregate minimum within the action cap.
 */
export const GEOMETRY_BUILDS_PER_ACTION = 10_000;

export function measureUnresizedMillionRowGeometry(): GeometryObservation {
  const index = new OffsetIndex(1_000_000, 28);
  const middle = index.rowAtOffset(14_000_005);
  const last = index.rowAtOffset(index.totalHeight - 1);
  return {
    count: index.count,
    backingStoreBytes: index.backingStoreBytes,
    totalHeight: index.totalHeight,
    middleRow: middle.row,
    middleTop: middle.top,
    lastRow: last.row,
    lastTop: last.top,
  };
}

export type WindowReadDiagnosticMode = "baseline" | "reuse-decoded-view-upper-bound";

export interface WindowTransferCounters {
  readonly logicalFrames: number;
  readonly windowReadRequests: number;
  readonly logicalWindowReads: number;
  readonly copiedBytes: number;
  readonly outputAllocationEvents: number;
}

/** Repository-owned structural surface shared by both browser engines. */
export interface RenderBenchAdapter {
  readonly id: "sheetwrite" | "handsontable";
  readonly initialRowCount: number;
  readonly colCount: number;
  mount(host: HTMLElement): void;
  isMountedAndAccessible(): boolean;
  rowCount(): number;
  cellValue(row: number, col: number): unknown;
  setCellValue(row: number, col: number, value: string | number | null): void;
  selection(): CellSelection | null;
  editorOpen(): boolean;
  prepareScroll(axis: "top" | "left", startMiddle: boolean): void;
  scrollBy(axis: "top" | "left", pixels: number): void;
  scrollObservation(): ScrollObservation;
  selectAndReveal(row: number, col: number): void;
  openEditor(): void;
  closeEditor(): void;
  editCommit(value: string): void;
  moveSelection(direction: "down" | "right"): void;
  insertRows(at: number, count: number): void;
  removeRows(at: number, count: number): void;
  resetFormatResources(): void;
  repaint(): void;
  formattedSentinels(): readonly [string, string];
  formatResources(): RenderResourceMetrics;
  installFormulaDense(): void;
  clearFormulaDense(): void;
  installTextHeavy(rowCount: number): void;
  clearTextHeavy(): void;
  measureUnresizedMillionRowGeometry(): GeometryObservation;
  installMergeHeavy(): void;
  clearMergeHeavy(): void;
  resetMergeResources(): void;
  mergeResources(): MergeIndexResourceMetrics;
  setWindowReadDiagnosticMode(mode: WindowReadDiagnosticMode): void;
  resetWindowTransferCounters(): void;
  windowTransferCounters(): WindowTransferCounters;
  destroy(): void;
}

/** Style evidence the engine resolves for one cell before painting it. */
export interface ResolvedStyleProbe {
  readonly wrap: boolean;
  readonly underline: boolean;
  readonly background: string | null;
  readonly color: string | null;
}

/** Find state reported after a diagnostic search scan. */
export interface SearchProbe {
  readonly query: string;
  readonly matches: number;
  readonly active: number;
  readonly first: string | null;
  readonly last: string | null;
}

/** Frozen-pane paint recorded from the most recent pane frame. */
export interface FrozenPaneProbe {
  readonly paneFrames: number;
  readonly paneCount: number;
  readonly pinnedRows: { readonly start: number; readonly end: number } | null;
  readonly pinnedColumns: readonly number[];
  readonly pinnedScrollTop: number | null;
  readonly bodyRows: { readonly start: number; readonly end: number } | null;
  readonly bodyScrollTop: number | null;
  readonly bodyScrollLeft: number | null;
}

/**
 * Sheetwrite-only surface for diagnostic scenarios that install their own
 * fixture data and read back what the engine resolved for a frame. The gate
 * scenario set never calls these members.
 */
export interface RenderBenchDiagnosticAdapter extends RenderBenchAdapter {
  installWrapHeavy(rowCount: number): void;
  clearWrapHeavy(): void;
  /** Writes `text` with wrapping into {@link WRAP_UNICODE_CELL}. */
  installWrapUnicode(text: string): void;
  clearWrapUnicode(): void;
  installSearchMatches(rowCount: number): void;
  clearSearchMatches(): void;
  beginSearch(query: string): void;
  searchState(): SearchProbe;
  endSearch(): void;
  installFrozenPanes(rows: number, cols: number): void;
  clearFrozenPanes(): void;
  armFrozenPaneProbe(): void;
  frozenPaneProbe(): FrozenPaneProbe;
  installConditionalFormats(rowCount: number): void;
  clearConditionalFormats(): void;
  installCurrencyFormat(): void;
  clearCurrencyFormat(): void;
  resolvedStyle(row: number, col: number): ResolvedStyleProbe;
  formattedText(row: number, col: number): string;
}

function diagnostic_adapter(adapter: RenderBenchAdapter): RenderBenchDiagnosticAdapter {
  if (adapter.id !== "sheetwrite") {
    throw new ScenarioValidationError(
      `${adapter.id} does not implement the diagnostic scenario surface`,
    );
  }
  return adapter as RenderBenchDiagnosticAdapter;
}

export interface ScenarioRunOptions {
  readonly runId: string;
  readonly round: number;
  readonly warmupSamples: number;
  readonly measuredSamples: number;
  readonly minimumSampleDurationMs: number;
  readonly onStage?: (stage: "warmup" | "measure" | "validate") => void;
}

export class ScenarioValidationError extends Error {
  override readonly name = "ScenarioValidationError";
}

interface ScenarioActions {
  readonly setup?: () => void;
  readonly measureWindowTransfer?: boolean;
  /** Operations one timed `action` call performs; defaults to one. */
  readonly operationsPerAction?: number;
  readonly prepare: () => void;
  readonly action: () => void;
  readonly cleanup: () => void;
  readonly validateEffect: (observations: ValidationObservation[]) => void;
}

/** A value read back for an untimed restore; scenario writes take only scalars. */
function restorable_value(value: unknown, cell: string): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new ScenarioValidationError(`${cell} holds a ${typeof value} that cannot be restored`);
}

/**
 * Room for the altering rows to insert `ALTER_COUNT` rows. A sheet at the
 * row or dense-cell limit refuses an insert, so `make` removes `ALTER_COUNT`
 * rows just above the last one (untimed, once per scenario) and `restore`
 * puts them back with their values. Rows near the top, the middle sentinel
 * and the last row stay where they are.
 */
function row_headroom(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): { make: () => void; restore: () => void } {
  const start = dataset.rowCount - 1 - ALTER_COUNT;
  const saved: (string | number | null)[] = [];
  return {
    make: () => {
      saved.length = 0;
      for (let row = start; row < start + ALTER_COUNT; row++) {
        for (let col = 0; col < adapter.colCount; col++) {
          saved.push(restorable_value(adapter.cellValue(row, col), `row ${row} column ${col}`));
        }
      }
      adapter.removeRows(start, ALTER_COUNT);
    },
    restore: () => {
      adapter.insertRows(start, ALTER_COUNT);
      let index = 0;
      for (let row = start; row < start + ALTER_COUNT; row++) {
        for (let col = 0; col < adapter.colCount; col++) {
          adapter.setCellValue(row, col, saved[index++] ?? null);
        }
      }
    },
  };
}

function used_js_heap_bytes(): number | null {
  const candidate: unknown = performance;
  if (candidate !== null && typeof candidate === "object" && "memory" in candidate) {
    const memory = candidate.memory;
    if (
      memory !== null &&
      typeof memory === "object" &&
      "usedJSHeapSize" in memory &&
      typeof memory.usedJSHeapSize === "number" &&
      Number.isFinite(memory.usedJSHeapSize)
    ) {
      return memory.usedJSHeapSize;
    }
  }
  return null;
}

function memory_delta(before_bytes: number | null, after_bytes: number | null): MemoryDelta {
  if (before_bytes === null || after_bytes === null) {
    return { beforeBytes: null, afterBytes: null, deltaBytes: null };
  }
  return {
    beforeBytes: before_bytes,
    afterBytes: after_bytes,
    deltaBytes: after_bytes - before_bytes,
  };
}

function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return JSON.stringify(value) ?? String(value);
}

function checkpoint(
  observations: ValidationObservation[],
  name: string,
  expected: unknown,
  observed: unknown,
  passed: boolean = Object.is(expected, observed),
): void {
  observations.push({
    checkpoint: name,
    expected: display(expected),
    observed: display(observed),
    passed,
  });
  if (!passed) {
    throw new ScenarioValidationError(
      `${name}: expected ${display(expected)}, observed ${display(observed)}`,
    );
  }
}

function expected_sentinels(dataset: ColumnarDataset): readonly unknown[] {
  const middle = Math.floor(dataset.rowCount / 2);
  const last = dataset.rowCount - 1;
  return [dataset.id[0], dataset.customer[0], dataset.city[middle], dataset.amount[last]];
}

function observed_sentinels(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): readonly unknown[] {
  const middle = Math.floor(dataset.rowCount / 2);
  const last = dataset.rowCount - 1;
  return [
    adapter.cellValue(0, 0),
    adapter.cellValue(0, 2),
    adapter.cellValue(middle, 3),
    adapter.cellValue(last, 4),
  ];
}

function validate_canonical_state(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
  observations: ValidationObservation[],
): void {
  checkpoint(
    observations,
    "grid remains mounted and accessibility-labelled",
    true,
    adapter.isMountedAndAccessible(),
  );
  checkpoint(observations, "canonical row count", dataset.rowCount, adapter.rowCount());
  checkpoint(
    observations,
    "canonical sentinel checksum",
    logicalValueChecksum(expected_sentinels(dataset)),
    logicalValueChecksum(observed_sentinels(adapter, dataset)),
  );
}

function validate_selection(
  adapter: RenderBenchAdapter,
  observations: ValidationObservation[],
  row: number,
  col: number,
  checkpoint_name: string,
): void {
  const selection = adapter.selection();
  checkpoint(
    observations,
    checkpoint_name,
    `${row},${col}`,
    selection ? `${selection.row},${selection.col}` : "none",
  );
}

function with_effect_cleanup(action: () => void, cleanup: () => void, validate: () => void): void {
  action();
  try {
    validate();
  } finally {
    cleanup();
  }
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Reach of the long-scroll action, matching `text-heavy.long-scroll`. */
function long_scroll_steps(dataset: ColumnarDataset): number {
  return Math.min(
    LONG_SCROLL_MAX_STEPS,
    Math.max(1, Math.floor(dataset.rowCount / LONG_SCROLL_ROW_STRIDE) - 1),
  );
}

function scenario_actions(
  scenario_id: ScenarioId,
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): ScenarioActions {
  const middle_row = Math.floor(dataset.rowCount / 2);
  const middle_col = Math.floor(adapter.colCount / 2);
  const last_row = dataset.rowCount - 1;
  const last_col = adapter.colCount - 1;

  if (
    scenario_id === WINDOW_TRANSFER_BASELINE_SCENARIO_ID ||
    scenario_id === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID
  ) {
    const upper_bound = scenario_id === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID;
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => adapter.scrollBy("top", SCROLL_STEP);
    return {
      setup: () => {
        adapter.setWindowReadDiagnosticMode("baseline");
        prepare();
        adapter.setWindowReadDiagnosticMode(
          upper_bound ? "reuse-decoded-view-upper-bound" : "baseline",
        );
      },
      measureWindowTransfer: true,
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          adapter.resetWindowTransferCounters();
          action();
          const counters = adapter.windowTransferCounters();
          checkpoint(
            observations,
            `${scenario_id} completes one coordinator paint`,
            1,
            counters.logicalFrames,
          );
          checkpoint(
            observations,
            `${scenario_id} requests one visible window`,
            1,
            counters.windowReadRequests,
          );
          if (upper_bound) {
            checkpoint(
              observations,
              `${scenario_id} deliberately reuses pixel-data-invalid decoded data`,
              JSON.stringify({
                logicalWindowReads: 0,
                copiedBytes: 0,
                outputAllocationEvents: 0,
              }),
              JSON.stringify({
                logicalWindowReads: counters.logicalWindowReads,
                copiedBytes: counters.copiedBytes,
                outputAllocationEvents: counters.outputAllocationEvents,
              }),
            );
          } else {
            checkpoint(
              observations,
              `${scenario_id} accounts for a fresh decoded window`,
              true,
              counters.logicalWindowReads === 1 &&
                counters.copiedBytes > 0 &&
                counters.outputAllocationEvents > 0,
            );
          }
        } finally {
          adapter.setWindowReadDiagnosticMode("baseline");
        }
      },
    };
  }

  if (scenario_id === "formula-dense.paint") {
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => adapter.repaint();
    return {
      setup: () => adapter.installFormulaDense(),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          action();
          checkpoint(
            observations,
            "formula-dense.paint resolves first visible formula",
            Number(dataset.id[1]) + 1,
            adapter.cellValue(1, 1),
          );
          checkpoint(
            observations,
            "formula-dense.paint resolves last visible formula column",
            Number(dataset.id[1]) + 4,
            adapter.cellValue(1, 4),
          );
        } finally {
          adapter.clearFormulaDense();
        }
      },
    };
  }

  if (scenario_id === "text-heavy.long-scroll") {
    const steps = Math.min(
      LONG_SCROLL_MAX_STEPS,
      Math.max(1, Math.floor(dataset.rowCount / LONG_SCROLL_ROW_STRIDE) - 1),
    );
    const installed_rows = Math.min(dataset.rowCount - 1, steps * LONG_SCROLL_ROW_STRIDE + 64);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => adapter.installTextHeavy(installed_rows),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          checkpoint(
            observations,
            "text-heavy.long-scroll advances through multiple row windows",
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
          const observed_row = Math.min(installed_rows, Math.max(1, after.firstVisibleRow));
          checkpoint(
            observations,
            "text-heavy.long-scroll retains unique long text",
            true,
            String(adapter.cellValue(observed_row, 2)).startsWith("diagnostic-long-"),
          );
        } finally {
          adapter.clearTextHeavy();
        }
      },
    };
  }

  if (scenario_id === "wrap-heavy.scroll") {
    const steps = long_scroll_steps(dataset);
    const installed_rows = Math.min(dataset.rowCount - 1, steps * LONG_SCROLL_ROW_STRIDE + 64);
    const diagnostics = diagnostic_adapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => diagnostics.installWrapHeavy(installed_rows),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        let observed_row = 0;
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          checkpoint(
            observations,
            "wrap-heavy.scroll advances through multiple row windows",
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
          observed_row = Math.min(installed_rows, Math.max(1, after.firstVisibleRow));
          const text = adapter.cellValue(observed_row, 2);
          checkpoint(
            observations,
            "wrap-heavy.scroll keeps full-length body text",
            true,
            typeof text === "string" &&
              text.length === WRAP_HEAVY_TEXT_LENGTH &&
              text.startsWith(WRAP_HEAVY_TEXT_PREFIX),
          );
          checkpoint(
            observations,
            "wrap-heavy.scroll keeps the wrap flag on painted cells",
            true,
            diagnostics.resolvedStyle(observed_row, 2).wrap,
          );
        } finally {
          diagnostics.clearWrapHeavy();
        }
        checkpoint(
          observations,
          "wrap-heavy.scroll restores unwrapped body cells",
          false,
          diagnostics.resolvedStyle(observed_row, 2).wrap,
        );
      },
    };
  }

  const wrap_unicode_graphemes = WRAP_UNICODE_GRAPHEMES[scenario_id];
  if (wrap_unicode_graphemes !== undefined) {
    const diagnostics = diagnostic_adapter(adapter);
    const text = WRAP_UNICODE_GRAPHEME.repeat(wrap_unicode_graphemes);
    const { row, col } = WRAP_UNICODE_CELL;
    const action = (): void => adapter.repaint();
    return {
      setup: () => {
        adapter.prepareScroll("top", false);
        diagnostics.installWrapUnicode(text);
      },
      prepare: () => {},
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          action();
          checkpoint(
            observations,
            `${scenario_id} paints the whole wrapped text`,
            true,
            adapter.cellValue(row, col) === text,
          );
          checkpoint(
            observations,
            `${scenario_id} keeps the wrap flag on the painted cell`,
            true,
            diagnostics.resolvedStyle(row, col).wrap,
          );
        } finally {
          diagnostics.clearWrapUnicode();
        }
        checkpoint(
          observations,
          `${scenario_id} restores the unwrapped body cell`,
          false,
          diagnostics.resolvedStyle(row, col).wrap,
        );
      },
    };
  }

  if (scenario_id === "search-many.scroll") {
    const steps = long_scroll_steps(dataset);
    const matched_rows = dataset.rowCount - 1;
    const diagnostics = diagnostic_adapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => {
        diagnostics.installSearchMatches(matched_rows);
        diagnostics.beginSearch(SEARCH_MATCH_PREFIX);
      },
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          checkpoint(
            observations,
            "search-many.scroll advances through multiple row windows",
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
          const search = diagnostics.searchState();
          checkpoint(
            observations,
            "search-many.scroll keeps the query active",
            SEARCH_MATCH_PREFIX,
            search.query,
          );
          checkpoint(
            observations,
            "search-many.scroll keeps every body match",
            matched_rows,
            search.matches,
          );
          checkpoint(
            observations,
            "search-many.scroll keeps the contiguous match run",
            `1,${COL.customer}..${matched_rows},${COL.customer}`,
            `${search.first ?? "none"}..${search.last ?? "none"}`,
          );
          checkpoint(
            observations,
            "search-many.scroll keeps an active match",
            true,
            search.active >= 0 && search.active < search.matches,
          );
        } finally {
          diagnostics.endSearch();
          diagnostics.clearSearchMatches();
        }
      },
    };
  }

  if (scenario_id === "frozen.scroll") {
    const diagnostics = diagnostic_adapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < FROZEN_SCROLL_ROWS; step++) {
        adapter.scrollBy("top", ROW_HEIGHT_PX);
      }
    };
    return {
      setup: () => {
        diagnostics.installFrozenPanes(FROZEN_ROW_COUNT, FROZEN_COLUMN_COUNT);
        diagnostics.armFrozenPaneProbe();
      },
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          const panes = diagnostics.frozenPaneProbe();
          checkpoint(
            observations,
            "frozen.scroll advances the scrolling band",
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
          checkpoint(
            observations,
            "frozen.scroll paints the four clipped panes",
            true,
            panes.paneFrames > 0 && panes.paneCount === FROZEN_PANE_COUNT,
          );
          checkpoint(
            observations,
            "frozen.scroll pins the leading row and column",
            JSON.stringify({
              rows: { start: 0, end: FROZEN_ROW_COUNT },
              columns: [0],
              scrollTop: 0,
            }),
            JSON.stringify({
              rows: panes.pinnedRows,
              columns: panes.pinnedColumns,
              scrollTop: panes.pinnedScrollTop,
            }),
          );
          checkpoint(
            observations,
            "frozen.scroll scrolls the body pane",
            JSON.stringify({ scrollTop: after.top, scrollLeft: after.left }),
            JSON.stringify({ scrollTop: panes.bodyScrollTop, scrollLeft: panes.bodyScrollLeft }),
          );
          checkpoint(
            observations,
            "frozen.scroll moves the body window past the pinned band",
            true,
            (panes.bodyRows?.start ?? 0) > FROZEN_ROW_COUNT,
          );
        } finally {
          diagnostics.clearFrozenPanes();
        }
      },
    };
  }

  if (scenario_id === "hscroll-small") {
    const prepare = (): void => adapter.prepareScroll("left", false);
    const action = (): void => {
      for (let step = 0; step < HSCROLL_SMALL_STEPS; step++) {
        adapter.scrollBy("left", HSCROLL_SMALL_STEP_PX);
      }
    };
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        const before = adapter.scrollObservation();
        action();
        const after = adapter.scrollObservation();
        checkpoint(
          observations,
          "hscroll-small has a scrollable column range",
          true,
          before.maximumLeft > 0,
        );
        checkpoint(
          observations,
          "hscroll-small moves eight pixels per step",
          Math.min(before.maximumLeft, before.left + HSCROLL_SMALL_STEPS * HSCROLL_SMALL_STEP_PX),
          after.left,
        );
        checkpoint(
          observations,
          "hscroll-small keeps the logical row window",
          before.firstVisibleRow,
          after.firstVisibleRow,
        );
        checkpoint(
          observations,
          "hscroll-small preserves painted-value sentinels",
          JSON.stringify([dataset.id[0], dataset.customer[0]]),
          JSON.stringify([adapter.cellValue(0, 0), adapter.cellValue(0, 2)]),
        );
      },
    };
  }

  if (scenario_id === "cond-format.scroll") {
    const steps = long_scroll_steps(dataset);
    const diagnostics = diagnostic_adapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => diagnostics.installConditionalFormats(dataset.rowCount - 1),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          checkpoint(
            observations,
            "cond-format.scroll advances through multiple row windows",
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
          const observed_row = Math.max(1, Math.min(dataset.rowCount - 1, after.firstVisibleRow));
          const observed_amount = dataset.amount[observed_row];
          const style = diagnostics.resolvedStyle(observed_row, COL.amount);
          checkpoint(
            observations,
            "cond-format.scroll applies the amount threshold rule",
            observed_amount === undefined
              ? "missing-amount"
              : observed_amount > CONDITIONAL_AMOUNT_THRESHOLD
                ? CONDITIONAL_HIGH_BACKGROUND
                : null,
            style.background,
          );
          checkpoint(
            observations,
            "cond-format.scroll applies the complementary amount rule",
            observed_amount === undefined
              ? "missing-amount"
              : observed_amount <= CONDITIONAL_AMOUNT_THRESHOLD
                ? CONDITIONAL_LOW_COLOR
                : null,
            style.color,
          );
          checkpoint(
            observations,
            "cond-format.scroll applies the whole-body formula rule",
            true,
            style.underline,
          );
          const outside_rules = diagnostics.resolvedStyle(0, 0);
          checkpoint(
            observations,
            "cond-format.scroll leaves rows outside the rule range unstyled",
            JSON.stringify({ background: null, color: null, underline: false }),
            JSON.stringify({
              background: outside_rules.background,
              color: outside_rules.color,
              underline: outside_rules.underline,
            }),
          );
        } finally {
          diagnostics.clearConditionalFormats();
        }
      },
    };
  }

  if (scenario_id === "number-format.hscroll") {
    const diagnostics = diagnostic_adapter(adapter);
    const column_steps = COLUMNS.slice(0, COLUMNS.length - 1).map((column) => column.width);
    const total_step_px = column_steps.reduce((total, width) => total + width, 0);
    const prepare = (): void => adapter.prepareScroll("left", false);
    const action = (): void => {
      for (const width of column_steps) adapter.scrollBy("left", width);
    };
    return {
      setup: () => diagnostics.installCurrencyFormat(),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          const before = adapter.scrollObservation();
          action();
          const after = adapter.scrollObservation();
          checkpoint(
            observations,
            "number-format.hscroll has a scrollable column range",
            true,
            before.maximumLeft > 0,
          );
          checkpoint(
            observations,
            "number-format.hscroll advances one column per step",
            Math.min(before.maximumLeft, before.left + total_step_px),
            after.left,
          );
          const observed_row = Math.max(1, Math.min(dataset.rowCount - 1, after.firstVisibleRow));
          const observed_amount = dataset.amount[observed_row];
          checkpoint(
            observations,
            "number-format.hscroll keeps the currency column formatted",
            observed_amount === undefined
              ? "missing-amount"
              : CURRENCY_FORMATTER.format(observed_amount),
            diagnostics.formattedText(observed_row, COL.amount),
          );
          const observed_date = dataset.date[observed_row];
          checkpoint(
            observations,
            "number-format.hscroll keeps the date column formatted",
            typeof observed_date === "string"
              ? DATE_FORMATTER.format(new Date(`${observed_date}T00:00:00Z`))
              : "missing-date",
            diagnostics.formattedText(observed_row, COL.date),
          );
        } finally {
          diagnostics.clearCurrencyFormat();
        }
      },
    };
  }

  if (scenario_id === "scroll-fractional.same-window") {
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => adapter.scrollBy("top", FRACTIONAL_SCROLL_STEP);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        const before = adapter.scrollObservation();
        action();
        const after = adapter.scrollObservation();
        const device_delta = (after.top - before.top) * after.devicePixelRatio;
        checkpoint(
          observations,
          "scroll-fractional.same-window uses a fractional device-pixel delta",
          true,
          after.top === Math.min(before.maximumTop, before.top + FRACTIONAL_SCROLL_STEP) &&
            !Number.isInteger(device_delta),
        );
        checkpoint(
          observations,
          "scroll-fractional.same-window keeps the logical row window",
          before.firstVisibleRow,
          after.firstVisibleRow,
        );
      },
    };
  }

  if (scenario_id === "geometry-unresized.1m") {
    let observed: GeometryObservation | undefined;
    const action = (): void => {
      for (let build = 0; build < GEOMETRY_BUILDS_PER_ACTION; build++) {
        observed = adapter.measureUnresizedMillionRowGeometry();
      }
    };
    return {
      operationsPerAction: GEOMETRY_BUILDS_PER_ACTION,
      prepare: () => {},
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        action();
        checkpoint(
          observations,
          "geometry-unresized.1m builds exact uniform geometry",
          JSON.stringify({
            count: 1_000_000,
            backingStoreBytes: 0,
            totalHeight: 28_000_000,
            middleRow: 500_000,
            middleTop: 14_000_000,
            lastRow: 999_999,
            lastTop: 27_999_972,
          }),
          JSON.stringify(observed),
        );
      },
    };
  }

  if (scenario_id === "formatted-paint.top-left") {
    // Restore what the cells held, not dataset text: Sheetwrite ingests the
    // date column's ISO text as serials, and writing the text back would leave
    // later scenarios a document that differs from a freshly loaded one.
    let original_date: string | number | null = null;
    let original_amount: string | number | null = null;
    adapter.resetFormatResources();
    const prepare = (): void => {
      adapter.setCellValue(0, 1, 45_351);
      adapter.setCellValue(0, 4, 1_234.5);
    };
    const action = (): void => adapter.repaint();
    const cleanup = (): void => {
      adapter.setCellValue(0, 1, original_date);
      adapter.setCellValue(0, 4, original_amount);
    };
    return {
      setup: () => {
        original_date = restorable_value(adapter.cellValue(0, 1), "A1 date cell");
        original_amount = restorable_value(adapter.cellValue(0, 4), "A1 amount cell");
      },
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        try {
          action();
          checkpoint(
            observations,
            "formatted-paint retains numeric amount input",
            1_234.5,
            adapter.cellValue(0, 4),
          );
          checkpoint(
            observations,
            "formatted-paint retains numeric date serial",
            45_351,
            adapter.cellValue(0, 1),
          );
          checkpoint(
            observations,
            "formatted-paint exact fixed-decimal and named-date sentinels",
            '["1,234.50","Feb 29, 2024"]',
            JSON.stringify(adapter.formattedSentinels()),
          );
          if (adapter.id === "sheetwrite") {
            const resources = adapter.formatResources();
            checkpoint(
              observations,
              "formatted-paint compiles two format codes",
              2,
              resources.compiledFormats,
            );
            checkpoint(
              observations,
              "formatted-paint constructs formatters by unique descriptor",
              1,
              resources.numberFormatters,
            );
            checkpoint(
              observations,
              "formatted-paint constructs one named-date formatter",
              1,
              resources.dateTimeFormatters,
            );
          }
        } finally {
          cleanup();
        }
      },
    };
  }

  if (scenario_id === "merge-heavy.paint") {
    // Compare against the value before merging, not dataset text: the loaded
    // date cell holds the ingested serial, so a fixed text expectation passes
    // only after another scenario has rewritten the cell.
    const covered_before_merge = adapter.cellValue(0, 1);
    adapter.installMergeHeavy();
    adapter.resetMergeResources();
    const action = (): void => adapter.repaint();
    return {
      prepare: () => {},
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          action();
          checkpoint(
            observations,
            "merge-heavy.paint preserves anchor and covered-cell values",
            JSON.stringify([
              dataset.id[0],
              adapter.id === "sheetwrite" ? covered_before_merge : null,
            ]),
            JSON.stringify([adapter.cellValue(0, 0), adapter.cellValue(0, 1)]),
          );
          if (adapter.id === "sheetwrite") {
            const resources = adapter.mergeResources();
            checkpoint(
              observations,
              "merge-heavy.paint prepares one revision index",
              1,
              resources.indexConstructions,
            );
            checkpoint(
              observations,
              "merge-heavy.paint examines visible merge candidates",
              true,
              resources.candidatesExamined > 0,
            );
          }
        } finally {
          adapter.clearMergeHeavy();
        }
      },
    };
  }

  if (scenario_id === "scroll-smooth.same-window") {
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => adapter.scrollBy("top", 1);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        const before = adapter.scrollObservation();
        action();
        const after = adapter.scrollObservation();
        checkpoint(
          observations,
          "scroll-smooth.same-window moves exactly one pixel",
          Math.min(before.maximumTop, before.top + 1),
          after.top,
        );
        checkpoint(
          observations,
          "scroll-smooth.same-window keeps the logical row window",
          before.firstVisibleRow,
          after.firstVisibleRow,
        );
        checkpoint(
          observations,
          "scroll-smooth.same-window preserves painted-value sentinels",
          JSON.stringify([dataset.id[0], dataset.amount[0]]),
          JSON.stringify([adapter.cellValue(0, 0), adapter.cellValue(0, 4)]),
        );
      },
    };
  }

  if (
    scenario_id === "scroll-down.top-left" ||
    scenario_id === "scroll-down.middle" ||
    scenario_id === "scroll-right.top-left"
  ) {
    const axis = scenario_id === "scroll-right.top-left" ? "left" : "top";
    const start_middle = scenario_id === "scroll-down.middle";
    const prepare = (): void => adapter.prepareScroll(axis, start_middle);
    const action = (): void => adapter.scrollBy(axis, SCROLL_STEP);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        const before = adapter.scrollObservation();
        action();
        const after = adapter.scrollObservation();
        const maximum = axis === "top" ? before.maximumTop : before.maximumLeft;
        const start = axis === "top" ? before.top : before.left;
        const end = axis === "top" ? after.top : after.left;
        checkpoint(observations, `${scenario_id} has scrollable range`, true, maximum > 0);
        checkpoint(
          observations,
          `${scenario_id} reaches expected scroll offset`,
          Math.min(maximum, start + SCROLL_STEP),
          end,
        );
        if (axis === "top") {
          checkpoint(
            observations,
            `${scenario_id} advances the logical top row`,
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
        }
      },
    };
  }

  if (scenario_id.startsWith("edit-open.")) {
    const [row, col] =
      scenario_id === "edit-open.top-left"
        ? [2, 2]
        : scenario_id === "edit-open.middle"
          ? [middle_row, middle_col]
          : [last_row, last_col];
    const prepare = (): void => {
      adapter.closeEditor();
      adapter.selectAndReveal(row, col);
    };
    const action = (): void => adapter.openEditor();
    const cleanup = (): void => adapter.closeEditor();
    return {
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        with_effect_cleanup(action, cleanup, () => {
          validate_selection(adapter, observations, row, col, `${scenario_id} intended selection`);
          checkpoint(observations, `${scenario_id} editor opened`, true, adapter.editorOpen());
        });
      },
    };
  }

  if (scenario_id === "edit-commit.middle") {
    const row = middle_row;
    const col = middle_col;
    const original = dataset.customer[row]!;
    const prepare = (): void => {
      adapter.setCellValue(row, col, original);
      adapter.selectAndReveal(row, col);
    };
    const action = (): void => adapter.editCommit(EDIT_VALUE);
    const cleanup = (): void => adapter.setCellValue(row, col, original);
    return {
      prepare,
      action,
      cleanup,
      validateEffect: (observations) => {
        prepare();
        with_effect_cleanup(action, cleanup, () => {
          checkpoint(
            observations,
            "edit-commit.middle changes the intended cell",
            EDIT_VALUE,
            adapter.cellValue(row, col),
          );
        });
      },
    };
  }

  if (scenario_id === "altering.insert-5-rows-top") {
    const headroom = row_headroom(adapter, dataset);
    const action = (): void => adapter.insertRows(1, ALTER_COUNT);
    const cleanup = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      setup: headroom.make,
      prepare: () => {},
      action,
      cleanup,
      validateEffect: (observations) => {
        try {
          with_effect_cleanup(action, cleanup, () => {
            checkpoint(
              observations,
              "insert increases row count",
              dataset.rowCount,
              adapter.rowCount(),
            );
            checkpoint(
              observations,
              "insert preserves preceding sentinel",
              dataset.id[0],
              adapter.cellValue(0, 0),
            );
            checkpoint(
              observations,
              "insert shifts following sentinel",
              dataset.id[1],
              adapter.cellValue(6, 0),
            );
          });
        } finally {
          headroom.restore();
        }
      },
    };
  }

  if (scenario_id === "altering.remove-5-rows-top") {
    const headroom = row_headroom(adapter, dataset);
    const prepare = (): void => adapter.insertRows(1, ALTER_COUNT);
    const action = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      setup: headroom.make,
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        try {
          prepare();
          action();
          checkpoint(
            observations,
            "remove restores row count",
            dataset.rowCount - ALTER_COUNT,
            adapter.rowCount(),
          );
          checkpoint(
            observations,
            "remove preserves preceding sentinel",
            dataset.id[0],
            adapter.cellValue(0, 0),
          );
          checkpoint(
            observations,
            "remove restores following sentinel",
            dataset.id[1],
            adapter.cellValue(1, 0),
          );
        } finally {
          headroom.restore();
        }
      },
    };
  }

  const is_down = scenario_id === "arrow-down.top-left";
  const row = is_down ? 25 : middle_row;
  const col = is_down ? 0 : middle_col;
  const expected_row = is_down ? row + 1 : row;
  const expected_col = is_down ? col : col + 1;
  const prepare = (): void => adapter.selectAndReveal(row, col);
  const action = (): void => adapter.moveSelection(is_down ? "down" : "right");
  return {
    prepare,
    action,
    cleanup: () => {},
    validateEffect: (observations) => {
      prepare();
      action();
      validate_selection(
        adapter,
        observations,
        expected_row,
        expected_col,
        `${scenario_id} moves one logical cell`,
      );
    },
  };
}

/** Which part of one logical operation raised: the timed action or its untimed bracket. */
type ScenarioStep = "prepare" | "action" | "counters" | "cleanup";

/**
 * Keep the failing step and the original error class visible. A recorded
 * failure that says only "Maximum call stack size exceeded" hides whether the
 * measured action or its untimed cleanup produced it; the same error in a
 * prepare step means the sample never started.
 */
function step_failure(step: ScenarioStep, error: unknown): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  const message = `${step} step failed: ${cause.message}`;
  const wrapped = cause instanceof RangeError ? new RangeError(message) : new Error(message);
  wrapped.cause = cause;
  return wrapped;
}

/** Guards against an action that never accumulates measurable time. */
const MAXIMUM_ACTIONS_PER_SAMPLE = 1_000_000;

function aggregate_sample(
  adapter: RenderBenchAdapter,
  actions: ScenarioActions,
  minimum_duration_ms: number,
): MeasuredSample {
  let duration_ms = 0;
  let operation_count = 0;
  let action_count = 0;
  const operations_per_action = actions.operationsPerAction ?? 1;
  const transfer_counters = {
    logicalFrames: 0,
    windowReadRequests: 0,
    logicalWindowReads: 0,
    copiedBytes: 0,
    outputAllocationEvents: 0,
  };
  do {
    try {
      actions.prepare();
    } catch (error) {
      throw step_failure("prepare", error);
    }
    if (actions.measureWindowTransfer) adapter.resetWindowTransferCounters();
    const started = performance.now();
    let failure: { step: ScenarioStep; error: unknown } | undefined;
    try {
      actions.action();
    } catch (error) {
      failure = { step: "action", error };
    }
    const elapsed = performance.now() - started;
    if (actions.measureWindowTransfer && failure === undefined) {
      try {
        const observed = adapter.windowTransferCounters();
        transfer_counters.logicalFrames += observed.logicalFrames;
        transfer_counters.windowReadRequests += observed.windowReadRequests;
        transfer_counters.logicalWindowReads += observed.logicalWindowReads;
        transfer_counters.copiedBytes += observed.copiedBytes;
        transfer_counters.outputAllocationEvents += observed.outputAllocationEvents;
      } catch (error) {
        failure = { step: "counters", error };
      }
    }
    try {
      actions.cleanup();
    } catch (error) {
      // A failing action decides the sample; a failing cleanup only surfaces
      // when the measured action itself succeeded.
      failure ??= { step: "cleanup", error };
    }
    if (failure !== undefined) throw step_failure(failure.step, failure.error);
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new RangeError(`invalid operation duration: ${elapsed}`);
    }
    duration_ms += elapsed;
    operation_count += operations_per_action;
    action_count++;
    if (action_count > MAXIMUM_ACTIONS_PER_SAMPLE) {
      throw new RangeError(
        `aggregate did not reach ${minimum_duration_ms} ms within ${MAXIMUM_ACTIONS_PER_SAMPLE.toLocaleString("en-US")} actions`,
      );
    }
  } while (duration_ms < minimum_duration_ms);

  return {
    index: 0,
    durationMs: duration_ms,
    operationCount: operation_count,
    perOperationMs: duration_ms / operation_count,
    ...(actions.measureWindowTransfer
      ? { windowTransfer: createWindowTransferMetrics(transfer_counters) }
      : {}),
  };
}

function failed_scenario(
  identity: ScenarioIdentity,
  stage: FailedScenario["stage"],
  error: unknown,
  partial_samples: readonly MeasuredSample[],
  validation: readonly ValidationObservation[],
  memory: MemoryDelta,
): FailedScenario {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    ...identity,
    status: "failed",
    stage,
    errorClass: normalized.name || "Error",
    message: normalized.message || String(error),
    timeout: false,
    crash: false,
    consoleErrors: [],
    pageErrors: [],
    partialSamples: partial_samples,
    validation,
    memory,
  };
}

export function runRenderScenario(
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
  scenarioId: ScenarioId,
  options: ScenarioRunOptions,
): ScenarioResult {
  if (!ALL_RENDER_SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
    throw new RangeError(`unknown render scenario: ${scenarioId}`);
  }
  const data_validity = scenarioDataValidity(scenarioId);
  const identity: ScenarioIdentity = {
    runId: options.runId,
    round: options.round,
    engine: adapter.id,
    rows: dataset.rowCount,
    scenarioId,
    group: scenarioGroup(scenarioId),
    ...(data_validity === undefined ? {} : { dataValidity: data_validity }),
  };
  const actions = scenario_actions(scenarioId, adapter, dataset);
  const validation: ValidationObservation[] = [];
  const raw_samples: MeasuredSample[] = [];
  const before_bytes = used_js_heap_bytes();
  let stage: FailedScenario["stage"] = "validate";

  try {
    options.onStage?.("validate");
    validate_canonical_state(adapter, dataset, validation);
    actions.setup?.();
    stage = "warmup";
    options.onStage?.("warmup");
    for (let index = 0; index < options.warmupSamples; index++) {
      aggregate_sample(adapter, actions, options.minimumSampleDurationMs);
    }
    stage = "measure";
    options.onStage?.("measure");
    for (let index = 0; index < options.measuredSamples; index++) {
      raw_samples.push({
        ...aggregate_sample(adapter, actions, options.minimumSampleDurationMs),
        index,
      });
    }
    stage = "validate";
    options.onStage?.("validate");
    actions.validateEffect(validation);
    validate_canonical_state(adapter, dataset, validation);
    const after_bytes = used_js_heap_bytes();
    const summary = summarizeFinite(raw_samples.map((sample) => sample.perOperationMs));
    let window_transfer: WindowTransferMetrics | undefined;
    if (actions.measureWindowTransfer) {
      const metrics = raw_samples.map((sample) => {
        if (!sample.windowTransfer) {
          throw new ScenarioValidationError("window-transfer sample counters are missing");
        }
        return sample.windowTransfer;
      });
      window_transfer = createWindowTransferMetrics({
        logicalFrames: metrics.reduce((sum, entry) => sum + entry.logicalFrames, 0),
        windowReadRequests: metrics.reduce((sum, entry) => sum + entry.windowReadRequests, 0),
        logicalWindowReads: metrics.reduce((sum, entry) => sum + entry.logicalWindowReads, 0),
        copiedBytes: metrics.reduce((sum, entry) => sum + entry.copiedBytes, 0),
        outputAllocationEvents: metrics.reduce(
          (sum, entry) => sum + entry.outputAllocationEvents,
          0,
        ),
      });
    }
    return {
      ...identity,
      status: "success",
      operationCount: raw_samples.reduce((total, sample) => total + sample.operationCount, 0),
      rawSamples: raw_samples,
      medianMs: summary.median,
      p95Ms: summary.p95,
      madMs: summary.mad,
      validation,
      memory: memory_delta(before_bytes, after_bytes),
      resources: adapter.formatResources(),
      mergeResources: adapter.mergeResources(),
      ...(window_transfer === undefined ? {} : { windowTransfer: window_transfer }),
    };
  } catch (error) {
    return failed_scenario(
      identity,
      stage,
      error,
      raw_samples,
      validation,
      memory_delta(before_bytes, used_js_heap_bytes()),
    );
  }
}
