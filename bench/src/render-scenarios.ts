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
  installDateSerials(rowCount: number): void;
  clearDateSerials(): void;
  resolvedStyle(row: number, col: number): ResolvedStyleProbe;
  formattedText(row: number, col: number): string;
}

function diagnosticAdapter(adapter: RenderBenchAdapter): RenderBenchDiagnosticAdapter {
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
  readonly prepare: () => void;
  readonly action: () => void;
  readonly cleanup: () => void;
  readonly validateEffect: (observations: ValidationObservation[]) => void;
}

function usedJsHeapBytes(): number | null {
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

function memoryDelta(beforeBytes: number | null, afterBytes: number | null): MemoryDelta {
  if (beforeBytes === null || afterBytes === null) {
    return { beforeBytes: null, afterBytes: null, deltaBytes: null };
  }
  return { beforeBytes, afterBytes, deltaBytes: afterBytes - beforeBytes };
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

function expectedSentinels(dataset: ColumnarDataset): readonly unknown[] {
  const middle = Math.floor(dataset.rowCount / 2);
  const last = dataset.rowCount - 1;
  return [dataset.id[0], dataset.customer[0], dataset.city[middle], dataset.amount[last]];
}

function observedSentinels(
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

function validateCanonicalState(
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
    logicalValueChecksum(expectedSentinels(dataset)),
    logicalValueChecksum(observedSentinels(adapter, dataset)),
  );
}

function validateSelection(
  adapter: RenderBenchAdapter,
  observations: ValidationObservation[],
  row: number,
  col: number,
  checkpointName: string,
): void {
  const selection = adapter.selection();
  checkpoint(
    observations,
    checkpointName,
    `${row},${col}`,
    selection ? `${selection.row},${selection.col}` : "none",
  );
}

function withEffectCleanup(action: () => void, cleanup: () => void, validate: () => void): void {
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
function longScrollSteps(dataset: ColumnarDataset): number {
  return Math.min(
    LONG_SCROLL_MAX_STEPS,
    Math.max(1, Math.floor(dataset.rowCount / LONG_SCROLL_ROW_STRIDE) - 1),
  );
}

function scenarioActions(
  scenarioId: ScenarioId,
  adapter: RenderBenchAdapter,
  dataset: ColumnarDataset,
): ScenarioActions {
  const middleRow = Math.floor(dataset.rowCount / 2);
  const middleCol = Math.floor(adapter.colCount / 2);
  const lastRow = dataset.rowCount - 1;
  const lastCol = adapter.colCount - 1;

  if (
    scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID ||
    scenarioId === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID
  ) {
    const upperBound = scenarioId === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID;
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => adapter.scrollBy("top", SCROLL_STEP);
    return {
      setup: () => {
        adapter.setWindowReadDiagnosticMode("baseline");
        prepare();
        adapter.setWindowReadDiagnosticMode(
          upperBound ? "reuse-decoded-view-upper-bound" : "baseline",
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
            `${scenarioId} completes one coordinator paint`,
            1,
            counters.logicalFrames,
          );
          checkpoint(
            observations,
            `${scenarioId} requests one visible window`,
            1,
            counters.windowReadRequests,
          );
          if (upperBound) {
            checkpoint(
              observations,
              `${scenarioId} deliberately reuses pixel-data-invalid decoded data`,
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
              `${scenarioId} accounts for a fresh decoded window`,
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

  if (scenarioId === "formula-dense.paint") {
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

  if (scenarioId === "text-heavy.long-scroll") {
    const steps = Math.min(
      LONG_SCROLL_MAX_STEPS,
      Math.max(1, Math.floor(dataset.rowCount / LONG_SCROLL_ROW_STRIDE) - 1),
    );
    const installedRows = Math.min(dataset.rowCount - 1, steps * LONG_SCROLL_ROW_STRIDE + 64);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => adapter.installTextHeavy(installedRows),
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
          const observedRow = Math.min(installedRows, Math.max(1, after.firstVisibleRow));
          checkpoint(
            observations,
            "text-heavy.long-scroll retains unique long text",
            true,
            String(adapter.cellValue(observedRow, 2)).startsWith("diagnostic-long-"),
          );
        } finally {
          adapter.clearTextHeavy();
        }
      },
    };
  }

  if (scenarioId === "wrap-heavy.scroll") {
    const steps = longScrollSteps(dataset);
    const installedRows = Math.min(dataset.rowCount - 1, steps * LONG_SCROLL_ROW_STRIDE + 64);
    const diagnostics = diagnosticAdapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => diagnostics.installWrapHeavy(installedRows),
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        let observedRow = 0;
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
          observedRow = Math.min(installedRows, Math.max(1, after.firstVisibleRow));
          const text = adapter.cellValue(observedRow, 2);
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
            diagnostics.resolvedStyle(observedRow, 2).wrap,
          );
        } finally {
          diagnostics.clearWrapHeavy();
        }
        checkpoint(
          observations,
          "wrap-heavy.scroll restores unwrapped body cells",
          false,
          diagnostics.resolvedStyle(observedRow, 2).wrap,
        );
      },
    };
  }

  if (scenarioId === "search-many.scroll") {
    const steps = longScrollSteps(dataset);
    const matchedRows = dataset.rowCount - 1;
    const diagnostics = diagnosticAdapter(adapter);
    const prepare = (): void => adapter.prepareScroll("top", false);
    const action = (): void => {
      for (let step = 0; step < steps; step++) {
        adapter.scrollBy("top", LONG_SCROLL_STEP_PX);
      }
    };
    return {
      setup: () => {
        diagnostics.installSearchMatches(matchedRows);
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
            matchedRows,
            search.matches,
          );
          checkpoint(
            observations,
            "search-many.scroll keeps the contiguous match run",
            `1,${COL.customer}..${matchedRows},${COL.customer}`,
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

  if (scenarioId === "frozen.scroll") {
    const diagnostics = diagnosticAdapter(adapter);
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

  if (scenarioId === "hscroll-small") {
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

  if (scenarioId === "cond-format.scroll") {
    const steps = longScrollSteps(dataset);
    const diagnostics = diagnosticAdapter(adapter);
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
          const observedRow = Math.max(1, Math.min(dataset.rowCount - 1, after.firstVisibleRow));
          const observedAmount = dataset.amount[observedRow];
          const style = diagnostics.resolvedStyle(observedRow, COL.amount);
          checkpoint(
            observations,
            "cond-format.scroll applies the amount threshold rule",
            observedAmount === undefined
              ? "missing-amount"
              : observedAmount > CONDITIONAL_AMOUNT_THRESHOLD
                ? CONDITIONAL_HIGH_BACKGROUND
                : null,
            style.background,
          );
          checkpoint(
            observations,
            "cond-format.scroll applies the complementary amount rule",
            observedAmount === undefined
              ? "missing-amount"
              : observedAmount <= CONDITIONAL_AMOUNT_THRESHOLD
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
          const outsideRules = diagnostics.resolvedStyle(0, 0);
          checkpoint(
            observations,
            "cond-format.scroll leaves rows outside the rule range unstyled",
            JSON.stringify({ background: null, color: null, underline: false }),
            JSON.stringify({
              background: outsideRules.background,
              color: outsideRules.color,
              underline: outsideRules.underline,
            }),
          );
        } finally {
          diagnostics.clearConditionalFormats();
        }
      },
    };
  }

  if (scenarioId === "number-format.hscroll") {
    const diagnostics = diagnosticAdapter(adapter);
    const columnSteps = COLUMNS.slice(0, COLUMNS.length - 1).map((column) => column.width);
    const totalStepPx = columnSteps.reduce((total, width) => total + width, 0);
    const prepare = (): void => adapter.prepareScroll("left", false);
    const action = (): void => {
      for (const width of columnSteps) adapter.scrollBy("left", width);
    };
    return {
      setup: () => {
        diagnostics.installCurrencyFormat();
        diagnostics.installDateSerials(dataset.rowCount - 1);
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
            "number-format.hscroll has a scrollable column range",
            true,
            before.maximumLeft > 0,
          );
          checkpoint(
            observations,
            "number-format.hscroll advances one column per step",
            Math.min(before.maximumLeft, before.left + totalStepPx),
            after.left,
          );
          const observedRow = Math.max(1, Math.min(dataset.rowCount - 1, after.firstVisibleRow));
          const observedAmount = dataset.amount[observedRow];
          checkpoint(
            observations,
            "number-format.hscroll keeps the currency column formatted",
            observedAmount === undefined
              ? "missing-amount"
              : CURRENCY_FORMATTER.format(observedAmount),
            diagnostics.formattedText(observedRow, COL.amount),
          );
          const observedDate = dataset.date[observedRow];
          checkpoint(
            observations,
            "number-format.hscroll keeps the date column formatted",
            typeof observedDate === "string"
              ? DATE_FORMATTER.format(new Date(`${observedDate}T00:00:00Z`))
              : "missing-date",
            diagnostics.formattedText(observedRow, COL.date),
          );
        } finally {
          diagnostics.clearCurrencyFormat();
          diagnostics.clearDateSerials();
        }
      },
    };
  }

  if (scenarioId === "scroll-fractional.same-window") {
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
        const deviceDelta = (after.top - before.top) * after.devicePixelRatio;
        checkpoint(
          observations,
          "scroll-fractional.same-window uses a fractional device-pixel delta",
          true,
          after.top === Math.min(before.maximumTop, before.top + FRACTIONAL_SCROLL_STEP) &&
            !Number.isInteger(deviceDelta),
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

  if (scenarioId === "geometry-unresized.1m") {
    let observed: GeometryObservation | undefined;
    const action = (): void => {
      observed = adapter.measureUnresizedMillionRowGeometry();
    };
    return {
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

  if (scenarioId === "formatted-paint.top-left") {
    const originalDate = dataset.date[0]!;
    const originalAmount = dataset.amount[0]!;
    adapter.resetFormatResources();
    const prepare = (): void => {
      adapter.setCellValue(0, 1, 45_351);
      adapter.setCellValue(0, 4, 1_234.5);
    };
    const action = (): void => adapter.repaint();
    const cleanup = (): void => {
      adapter.setCellValue(0, 1, originalDate);
      adapter.setCellValue(0, 4, originalAmount);
    };
    return {
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

  if (scenarioId === "merge-heavy.paint") {
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
            JSON.stringify([dataset.id[0], adapter.id === "sheetwrite" ? dataset.date[0] : null]),
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

  if (scenarioId === "scroll-smooth.same-window") {
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
    scenarioId === "scroll-down.top-left" ||
    scenarioId === "scroll-down.middle" ||
    scenarioId === "scroll-right.top-left"
  ) {
    const axis = scenarioId === "scroll-right.top-left" ? "left" : "top";
    const startMiddle = scenarioId === "scroll-down.middle";
    const prepare = (): void => adapter.prepareScroll(axis, startMiddle);
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
        checkpoint(observations, `${scenarioId} has scrollable range`, true, maximum > 0);
        checkpoint(
          observations,
          `${scenarioId} reaches expected scroll offset`,
          Math.min(maximum, start + SCROLL_STEP),
          end,
        );
        if (axis === "top") {
          checkpoint(
            observations,
            `${scenarioId} advances the logical top row`,
            true,
            after.firstVisibleRow > before.firstVisibleRow,
          );
        }
      },
    };
  }

  if (scenarioId.startsWith("edit-open.")) {
    const [row, col] =
      scenarioId === "edit-open.top-left"
        ? [2, 2]
        : scenarioId === "edit-open.middle"
          ? [middleRow, middleCol]
          : [lastRow, lastCol];
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
        withEffectCleanup(action, cleanup, () => {
          validateSelection(adapter, observations, row, col, `${scenarioId} intended selection`);
          checkpoint(observations, `${scenarioId} editor opened`, true, adapter.editorOpen());
        });
      },
    };
  }

  if (scenarioId === "edit-commit.middle") {
    const row = middleRow;
    const col = middleCol;
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
        withEffectCleanup(action, cleanup, () => {
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

  if (scenarioId === "altering.insert-5-rows-top") {
    const action = (): void => adapter.insertRows(1, ALTER_COUNT);
    const cleanup = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      prepare: () => {},
      action,
      cleanup,
      validateEffect: (observations) => {
        withEffectCleanup(action, cleanup, () => {
          checkpoint(
            observations,
            "insert increases row count",
            dataset.rowCount + ALTER_COUNT,
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
      },
    };
  }

  if (scenarioId === "altering.remove-5-rows-top") {
    const prepare = (): void => adapter.insertRows(1, ALTER_COUNT);
    const action = (): void => adapter.removeRows(1, ALTER_COUNT);
    return {
      prepare,
      action,
      cleanup: () => {},
      validateEffect: (observations) => {
        prepare();
        action();
        checkpoint(observations, "remove restores row count", dataset.rowCount, adapter.rowCount());
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
      },
    };
  }

  const isDown = scenarioId === "arrow-down.top-left";
  const row = isDown ? 25 : middleRow;
  const col = isDown ? 0 : middleCol;
  const expectedRow = isDown ? row + 1 : row;
  const expectedCol = isDown ? col : col + 1;
  const prepare = (): void => adapter.selectAndReveal(row, col);
  const action = (): void => adapter.moveSelection(isDown ? "down" : "right");
  return {
    prepare,
    action,
    cleanup: () => {},
    validateEffect: (observations) => {
      prepare();
      action();
      validateSelection(
        adapter,
        observations,
        expectedRow,
        expectedCol,
        `${scenarioId} moves one logical cell`,
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
function stepFailure(step: ScenarioStep, error: unknown): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  const message = `${step} step failed: ${cause.message}`;
  const wrapped = cause instanceof RangeError ? new RangeError(message) : new Error(message);
  wrapped.cause = cause;
  return wrapped;
}

function aggregateSample(
  adapter: RenderBenchAdapter,
  actions: ScenarioActions,
  minimumDurationMs: number,
): MeasuredSample {
  let durationMs = 0;
  let operationCount = 0;
  const transferCounters = {
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
      throw stepFailure("prepare", error);
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
        transferCounters.logicalFrames += observed.logicalFrames;
        transferCounters.windowReadRequests += observed.windowReadRequests;
        transferCounters.logicalWindowReads += observed.logicalWindowReads;
        transferCounters.copiedBytes += observed.copiedBytes;
        transferCounters.outputAllocationEvents += observed.outputAllocationEvents;
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
    if (failure !== undefined) throw stepFailure(failure.step, failure.error);
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new RangeError(`invalid operation duration: ${elapsed}`);
    }
    durationMs += elapsed;
    operationCount++;
    if (operationCount > 1_000_000) {
      throw new RangeError(
        `aggregate did not reach ${minimumDurationMs} ms within 1,000,000 operations`,
      );
    }
  } while (durationMs < minimumDurationMs);

  return {
    index: 0,
    durationMs,
    operationCount,
    perOperationMs: durationMs / operationCount,
    ...(actions.measureWindowTransfer
      ? { windowTransfer: createWindowTransferMetrics(transferCounters) }
      : {}),
  };
}

function failedScenario(
  identity: ScenarioIdentity,
  stage: FailedScenario["stage"],
  error: unknown,
  partialSamples: readonly MeasuredSample[],
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
    partialSamples,
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
  const dataValidity = scenarioDataValidity(scenarioId);
  const identity: ScenarioIdentity = {
    runId: options.runId,
    round: options.round,
    engine: adapter.id,
    rows: dataset.rowCount,
    scenarioId,
    group: scenarioGroup(scenarioId),
    ...(dataValidity === undefined ? {} : { dataValidity }),
  };
  const actions = scenarioActions(scenarioId, adapter, dataset);
  const validation: ValidationObservation[] = [];
  const rawSamples: MeasuredSample[] = [];
  const beforeBytes = usedJsHeapBytes();
  let stage: FailedScenario["stage"] = "validate";

  try {
    options.onStage?.("validate");
    validateCanonicalState(adapter, dataset, validation);
    actions.setup?.();
    stage = "warmup";
    options.onStage?.("warmup");
    for (let index = 0; index < options.warmupSamples; index++) {
      aggregateSample(adapter, actions, options.minimumSampleDurationMs);
    }
    stage = "measure";
    options.onStage?.("measure");
    for (let index = 0; index < options.measuredSamples; index++) {
      rawSamples.push({
        ...aggregateSample(adapter, actions, options.minimumSampleDurationMs),
        index,
      });
    }
    stage = "validate";
    options.onStage?.("validate");
    actions.validateEffect(validation);
    validateCanonicalState(adapter, dataset, validation);
    const afterBytes = usedJsHeapBytes();
    const summary = summarizeFinite(rawSamples.map((sample) => sample.perOperationMs));
    let windowTransfer: WindowTransferMetrics | undefined;
    if (actions.measureWindowTransfer) {
      const metrics = rawSamples.map((sample) => {
        if (!sample.windowTransfer) {
          throw new ScenarioValidationError("window-transfer sample counters are missing");
        }
        return sample.windowTransfer;
      });
      windowTransfer = createWindowTransferMetrics({
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
      operationCount: rawSamples.reduce((total, sample) => total + sample.operationCount, 0),
      rawSamples,
      medianMs: summary.median,
      p95Ms: summary.p95,
      madMs: summary.mad,
      validation,
      memory: memoryDelta(beforeBytes, afterBytes),
      resources: adapter.formatResources(),
      mergeResources: adapter.mergeResources(),
      ...(windowTransfer === undefined ? {} : { windowTransfer }),
    };
  } catch (error) {
    return failedScenario(
      identity,
      stage,
      error,
      rawSamples,
      validation,
      memoryDelta(beforeBytes, usedJsHeapBytes()),
    );
  }
}
