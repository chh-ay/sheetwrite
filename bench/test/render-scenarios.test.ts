import { expect, test } from "bun:test";

import { makeColumnar, toAoA } from "../src/dataset.js";
import {
  type ScenarioId,
  WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
  WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
} from "../src/render-protocol.js";
import {
  type CellSelection,
  type RenderBenchAdapter,
  runRenderScenario,
  type ScrollObservation,
} from "../src/render-scenarios.js";

const ROWS = 200;
const ROW_HEIGHT = 25;
const MAXIMUM_TOP = 1_000;
const MAXIMUM_LEFT = 500;
const BYTES_PER_WINDOW_READ = 1_024;
const ALLOCATIONS_PER_WINDOW_READ = 7;

interface FakeFaults {
  readonly corruptNavigation?: boolean;
  /** Mirrors a competitor whose row removal overflows the stack above some size. */
  readonly failRowRemoval?: boolean;
  readonly formattedSentinels?: readonly [string, string];
  readonly indexConstructions?: number;
  readonly candidatesExamined?: number;
}

/**
 * An in-memory grid for the scenarios below. The diagnostic-only scenarios
 * (formula-dense, text-heavy, geometry) never run here, so their hooks are inert.
 */
function fakeAdapter(faults: FakeFaults = {}): RenderBenchAdapter {
  const values: unknown[][] = toAoA(makeColumnar(ROWS));
  let selected: CellSelection | null = null;
  let editing = false;
  let top = 0;
  let left = 0;
  let isBaselineRead = true;
  const transfer = {
    logicalFrames: 0,
    windowReadRequests: 0,
    logicalWindowReads: 0,
    copiedBytes: 0,
    outputAllocationEvents: 0,
  };
  const inert = () => {};
  const setCellValue = (row: number, col: number, value: string | number | null) => {
    const target = values[row];
    if (!target) throw new RangeError(`missing row ${row}`);
    target[col] = value;
  };
  const selection = () => {
    if (!selected) throw new Error("no selection");
    return selected;
  };
  return {
    id: "sheetwrite",
    initialRowCount: ROWS,
    colCount: 5,
    mount: inert,
    isMountedAndAccessible: () => true,
    rowCount: () => values.length,
    cellValue: (row, col) => values[row]?.[col],
    setCellValue,
    selection: () => selected,
    editorOpen: () => editing,
    prepareScroll: (axis, startMiddle) => {
      top = axis === "top" && startMiddle ? MAXIMUM_TOP / 2 : 0;
      left = axis === "left" && startMiddle ? MAXIMUM_LEFT / 2 : 0;
    },
    scrollBy: (axis, pixels) => {
      if (axis === "top") top = Math.min(MAXIMUM_TOP, top + pixels);
      else left = Math.min(MAXIMUM_LEFT, left + pixels);
      transfer.logicalFrames++;
      transfer.windowReadRequests++;
      if (!isBaselineRead) return;
      transfer.logicalWindowReads++;
      transfer.copiedBytes += BYTES_PER_WINDOW_READ;
      transfer.outputAllocationEvents += ALLOCATIONS_PER_WINDOW_READ;
    },
    scrollObservation: (): ScrollObservation => ({
      top,
      left,
      maximumTop: MAXIMUM_TOP,
      maximumLeft: MAXIMUM_LEFT,
      firstVisibleRow: Math.floor(top / ROW_HEIGHT),
      devicePixelRatio: 1.25,
    }),
    selectAndReveal: (row, col) => (selected = { row, col }),
    openEditor: () => (editing = true),
    closeEditor: () => (editing = false),
    editCommit: (value) => {
      setCellValue(selection().row, selection().col, value);
      editing = false;
    },
    moveSelection: (direction) => {
      const { row, col } = selection();
      if (faults.corruptNavigation) return;
      selected = direction === "down" ? { row: row + 1, col } : { row, col: col + 1 };
    },
    insertRows: (at, count) =>
      values.splice(at, 0, ...Array.from({ length: count }, () => Array(5).fill(null))),
    removeRows: (at, count) => {
      if (faults.failRowRemoval) throw new RangeError("Maximum call stack size exceeded");
      values.splice(at, count);
    },
    resetFormatResources: inert,
    repaint: inert,
    formattedSentinels: () => faults.formattedSentinels ?? ["1,234.50", "Feb 29, 2024"],
    formatResources: () => ({
      compiledFormats: 2,
      numberFormatters: 1,
      dateTimeFormatters: 1,
      formatCacheEntries: 2,
      numberFormatterCacheEntries: 1,
      dateTimeFormatterCacheEntries: 1,
    }),
    installFormulaDense: inert,
    clearFormulaDense: inert,
    installTextHeavy: inert,
    clearTextHeavy: inert,
    measureUnresizedMillionRowGeometry: () => {
      throw new Error("geometry scenarios are not exercised by this fake");
    },
    installMergeHeavy: inert,
    clearMergeHeavy: inert,
    resetMergeResources: inert,
    mergeResources: () => ({
      indexConstructions: faults.indexConstructions ?? 1,
      candidatesExamined: faults.candidatesExamined ?? 4,
    }),
    setWindowReadDiagnosticMode: (mode) => (isBaselineRead = mode === "baseline"),
    resetWindowTransferCounters: () => {
      for (const key of Object.keys(transfer) as (keyof typeof transfer)[]) transfer[key] = 0;
    },
    windowTransferCounters: () => ({ ...transfer }),
    destroy: inert,
  };
}

const dataset = makeColumnar(ROWS);
const options = {
  runId: "scenario-fixture",
  round: 1,
  warmupSamples: 0,
  measuredSamples: 1,
  minimumSampleDurationMs: 0.01,
} as const;

function run(scenarioId: ScenarioId, adapter = fakeAdapter()) {
  return runRenderScenario(adapter, dataset, scenarioId, options);
}

test("fails validation for a corrupt action or corrupt formatter or merge evidence, never a fast success", () => {
  for (const [scenarioId, faults, checkpoint] of [
    ["arrow-down.top-left", { corruptNavigation: true }, "moves one logical cell"],
    ["formatted-paint.top-left", { formattedSentinels: ["wrong", "Feb 29, 2024"] }, "sentinels"],
    ["merge-heavy.paint", { candidatesExamined: 0 }, "candidate"],
  ] as const) {
    const result = run(scenarioId, fakeAdapter(faults));
    if (result.status !== "failed") throw new Error(`${scenarioId} did not fail`);
    expect(result.stage).toBe("validate");
    expect(result.message).toContain(checkpoint);
  }
});

test("names the cleanup step when a successful action cannot be undone", () => {
  // The insert succeeded; only the untimed cleanup overflowed the stack.
  const result = run("altering.insert-5-rows-top", fakeAdapter({ failRowRemoval: true }));
  expect(result).toMatchObject({
    status: "failed",
    stage: "measure",
    errorClass: "RangeError",
    message: "cleanup step failed: Maximum call stack size exceeded",
  });
});

test("keeps one-pixel smooth scrolling inside the same logical window", () => {
  const result = run("scroll-smooth.same-window");
  if (result.status !== "success") throw new Error(result.message);
  expect(result.validation).toContainEqual(
    expect.objectContaining({
      checkpoint: "scroll-smooth.same-window keeps the logical row window",
      passed: true,
    }),
  );
});

test("separates exact transfer counters from the pixel-data-invalid upper bound", () => {
  const baseline = run(WINDOW_TRANSFER_BASELINE_SCENARIO_ID);
  const upperBound = run(WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID);
  if (baseline.status !== "success" || upperBound.status !== "success") {
    throw new Error("expected a successful transfer diagnostic pair");
  }
  expect(baseline.dataValidity).toBe("product-valid");
  expect(baseline.windowTransfer).toMatchObject({
    copiedBytesPerLogicalFrame: BYTES_PER_WINDOW_READ,
    outputAllocationEventsPerLogicalFrame: ALLOCATIONS_PER_WINDOW_READ,
    copiedBytesPerLogicalRead: BYTES_PER_WINDOW_READ,
    outputAllocationEventsPerLogicalRead: ALLOCATIONS_PER_WINDOW_READ,
  });
  expect(upperBound.dataValidity).toBe("pixel-data-invalid");
  expect(upperBound.windowTransfer).toMatchObject({
    logicalFrames: upperBound.operationCount,
    windowReadRequests: upperBound.operationCount,
    logicalWindowReads: 0,
    copiedBytes: 0,
    outputAllocationEvents: 0,
    copiedBytesPerLogicalRead: null,
    outputAllocationEventsPerLogicalRead: null,
  });
});
