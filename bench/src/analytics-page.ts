import { createGrid, type Grid, initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

import "@sheetwrite/core/styles.css";

import { chartsAddon } from "../../packages/charts/src/index.js";
import {
  CHART_DATA_SHEET,
  CHART_EDIT,
  chartWorkbook,
  DASHBOARD_SHEET,
  MODEL_ROWS,
  modelWorkbook,
  ORDERS_SHEET,
  orderOperations,
  REGIONS,
  REVENUE_COL,
  SCROLL_ROWS,
  scrollWorkbook,
  SHOWCASE_ROWS,
  showcaseOperations,
  showcaseWorkbook,
} from "./analytics-fixtures.js";

// The page of analytics-bench.ts. The driver opens it with a scenario in the
// query string, clicks the run button and reads the result from the status
// element. Each sample times the work the browser does for one action: the
// action itself, then the callbacks of the frames after it up to a forced
// layout (see `timeAction`). Idle time between frames is not counted.

const status = requiredElement("#bench-status", HTMLOutputElement);
const runButton = requiredElement("#bench-run", HTMLButtonElement);
const host = requiredElement("#grid-host", HTMLDivElement);
const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") ?? "";
const samples = positiveInteger("samples", 30);
const warmups = positiveInteger("warmups", 10);
/** Charts on the scroll sheet; `charts=0` is the control. */
const scrollChartCount = Number(params.get("charts") ?? "10");
/** Orders of the model workbook. */
const modelRowCount = Number(params.get("rows") ?? MODEL_ROWS);
/** Most frames an action may take before its sample fails. */
const MAX_FRAMES = 120;
/** Pixels one scroll step moves. */
const SCROLL_STEP_PX = 120;
/** Default row height of the grid, in pixels. */
const ROW_HEIGHT_PX = 20;
const SHOWCASE_KPIS = 2;
const MODEL_KPIS = 3;

function requiredElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`The benchmark page has no ${selector}.`);
  return element;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(params.get(name) ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}: ${value}`);
  return value;
}

function setStatus(next: string): void {
  status.dataset.status = next;
  status.textContent = next;
}

function nextFrame(): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  return promise;
}

/** Style and layout of the whole page, as the next paint needs them. */
function forceLayout(): void {
  void document.body.offsetHeight;
}

/** One timed action: busy milliseconds, and the frames it took after the action. */
interface ActionSample {
  readonly ms: number;
  readonly frames: number;
}

/**
 * Time `action`, started in a frame callback, plus the callbacks of the
 * frames after it until `isDone` holds, each up to a forced layout. A
 * callback registered before the action runs first in the next frame and
 * marks where that frame's work starts; one registered after the action runs
 * after the work the action scheduled.
 */
async function timeAction(action: () => void, isDone: () => boolean): Promise<ActionSample> {
  await nextFrame();
  const { promise, resolve, reject } = Promise.withResolvers<ActionSample>();
  let busy = 0;
  let frameStart = 0;
  let frames = 0;
  const markFrameStart = (): void => {
    frameStart = performance.now();
  };
  const onFrame = (): void => {
    forceLayout();
    busy += performance.now() - frameStart;
    frames += 1;
    if (isDone()) {
      resolve({ ms: busy, frames });
      return;
    }
    if (frames >= MAX_FRAMES) {
      reject(new Error(`${scenario}: the action did not finish in ${MAX_FRAMES} frames`));
      return;
    }
    requestAnimationFrame(markFrameStart);
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(markFrameStart);
    const start = performance.now();
    try {
      action();
    } catch (error) {
      reject(error);
      return;
    }
    busy += performance.now() - start;
    requestAnimationFrame(onFrame);
  });
  return promise;
}

/** Times of the measured samples, after `warmups` untimed ones. */
interface ScenarioResult {
  readonly samples: number[];
  /** Frames each sample took after its action. */
  readonly frames: number[];
  readonly extra?: Record<string, number>;
}

/** Run `sample` for the warm-ups, then for the measured samples. */
async function collect(sample: (index: number) => Promise<ActionSample>): Promise<ScenarioResult> {
  const times: number[] = [];
  const frames: number[] = [];
  for (let index = -warmups; index < samples; index++) {
    const result = await sample(index);
    if (index < 0) continue;
    times.push(result.ms);
    frames.push(result.frames);
  }
  return { samples: times, frames };
}

function svgOf(chartHost: Element | null): SVGSVGElement | null {
  const svg = chartHost?.querySelector("svg");
  return svg instanceof SVGSVGElement ? svg : null;
}

function worksheetChart(id: string): HTMLElement {
  const frame = host.querySelector<HTMLElement>(`.sheetwrite-object[data-chart-id="${id}"]`);
  if (frame === null) throw new Error(`Chart ${id} has no frame on the sheet`);
  return frame;
}

function requireApplied(result: { status: string }): void {
  if (result.status !== "applied") throw new Error(`An operation was refused: ${result.status}`);
}

/** Edit one source cell of a chart; the chart draws a new SVG with the value. */
async function chartEdit(kind: "line" | "column", seriesCount: number): Promise<ScenarioResult> {
  const { workbook, data } = chartWorkbook(kind, seriesCount);
  const grid = createGrid(host, { workbook, data });
  try {
    const chart = worksheetChart("chart");
    await waitFor(() => svgOf(chart) !== null);
    return await collect((index) => {
      const before = svgOf(chart);
      return timeAction(
        () =>
          requireApplied(
            grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: CHART_DATA_SHEET, ...CHART_EDIT },
                  value: { kind: "literal", value: 2_000 + index },
                },
              ],
            }),
          ),
        () => svgOf(chart) !== before,
      );
    });
  } finally {
    grid.destroy();
  }
}

/**
 * Filter the chart's source column and clear the filter again. A chart
 * reads data rows, so its drawing must stay the same node.
 */
async function chartFilter(kind: "line" | "column", seriesCount: number): Promise<ScenarioResult> {
  const { workbook, data } = chartWorkbook(kind, seriesCount);
  const grid = createGrid(host, { workbook, data });
  try {
    const chart = worksheetChart("chart");
    await waitFor(() => svgOf(chart) !== null);
    const drawn = svgOf(chart);
    const result = await collect((index) =>
      timeAction(
        () =>
          grid.setColumnFilter(
            CHART_EDIT.col,
            index % 2 === 0 ? { kind: "compare", op: "gt", value: 1_000 } : null,
          ),
        () => true,
      ),
    );
    return { ...result, extra: { redrawn: svgOf(chart) === drawn ? 0 : 1 } };
  } finally {
    grid.destroy();
  }
}

/**
 * One scroll step: from the scroll event to a forced layout after the
 * grid's frame callbacks. This listener is added after the grid's, so its
 * frame callback runs after the grid's paint.
 */
function timeScroll(scroller: HTMLElement, top: number): Promise<ActionSample> {
  const { promise, resolve } = Promise.withResolvers<ActionSample>();
  scroller.addEventListener(
    "scroll",
    (event) => {
      requestAnimationFrame(() => {
        forceLayout();
        resolve({ ms: performance.now() - event.timeStamp, frames: 1 });
      });
    },
    { once: true },
  );
  scroller.scrollTop = top;
  return promise;
}

/** Scroll down a sheet with charts; no chart may draw again. */
async function scrollCharts(): Promise<ScenarioResult> {
  const { workbook, data } = scrollWorkbook(scrollChartCount);
  const grid = createGrid(host, { workbook, data });
  try {
    const charts = [...host.querySelectorAll<HTMLElement>(".sheetwrite-object")];
    await waitFor(() => charts.every((chart) => svgOf(chart) !== null));
    const drawings = charts.map((chart) => svgOf(chart));
    const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (scroller === null) throw new Error("The grid has no scroller");
    // Down through the charts, then back to the top.
    const lastTop = (SCROLL_ROWS / 2) * ROW_HEIGHT_PX;
    const result = await collect(() => {
      const below = scroller.scrollTop + SCROLL_STEP_PX;
      return timeScroll(scroller, below > lastTop ? 0 : below);
    });
    const redrawn = charts.filter((chart, index) => svgOf(chart) !== drawings[index]).length;
    return { ...result, extra: { charts: charts.length, redrawn } };
  } finally {
    grid.destroy();
  }
}

function dashboardRoot(): HTMLElement | null {
  return host.querySelector<HTMLElement>(".sheetwrite-dashboard");
}

/** Every item of the dashboard shows its content: KPI values, chart bars, pivot cells, slicer buttons. */
function isDashboardDrawn(kpis: number): boolean {
  const root = dashboardRoot();
  if (root === null || root.hidden) return false;
  const chart = svgOf(root.querySelector("[data-chart-id]"));
  return (
    root.querySelectorAll(".sheetwrite-dashboard-kpi").length === kpis &&
    chart?.querySelector(".sheetwrite-chart-bar") != null &&
    root.querySelector(".sheetwrite-dashboard-pivot td") !== null &&
    root.querySelector(".sheetwrite-dashboard-slicer-value") !== null
  );
}

/**
 * Time creating a grid in `create`, and destroy every grid it created
 * after the sample.
 */
async function timeCreate(create: () => Grid, isDone: () => boolean): Promise<ActionSample> {
  const created: Grid[] = [];
  try {
    return await timeAction(() => created.push(create()), isDone);
  } finally {
    for (const grid of created) grid.destroy();
  }
}

/** Start the showcase as its page does: the grid, then the orders and pivots as operations. */
function showcaseFirst(): Promise<ScenarioResult> {
  return collect(() =>
    timeCreate(
      () => {
        const grid = createGrid(host, { workbook: showcaseWorkbook() });
        requireApplied(grid.applyRemoteOperations(orderOperations(SHOWCASE_ROWS)));
        requireApplied(grid.applyRemoteOperations(showcaseOperations()));
        return grid;
      },
      () => isDashboardDrawn(SHOWCASE_KPIS),
    ),
  );
}

/**
 * Create the grid of the model workbook with its orders and open its
 * dashboard, as one action. The control row creates the grid of the orders
 * sheet alone, without the dashboard or the measures.
 */
async function modelFirst(): Promise<ScenarioResult> {
  const controls: number[] = [];
  const result = await collect(async (index) => {
    const control = modelWorkbook(modelRowCount);
    control.workbook.sheets = control.workbook.sheets.filter((sheet) => sheet.id === ORDERS_SHEET);
    delete control.workbook.dataModel;
    const loaded = await timeCreate(
      () => createGrid(host, control),
      () => true,
    );
    if (index >= 0) controls.push(loaded.ms);

    const { workbook, data } = modelWorkbook(modelRowCount);
    return timeCreate(
      () => {
        const grid = createGrid(host, { workbook, data });
        grid.setActiveSheet(DASHBOARD_SHEET);
        return grid;
      },
      () => isDashboardDrawn(MODEL_KPIS),
    );
  });
  return { ...result, extra: { ordersOnlyMedianMs: median(controls) } };
}

function kpiTexts(): string {
  const values = dashboardRoot()?.querySelectorAll(".sheetwrite-dashboard-kpi") ?? [];
  return [...values].map((element) => element.textContent).join("|");
}

/** The model dashboard, open and drawn. */
async function openModelDashboard(): Promise<Grid> {
  const { workbook, data } = modelWorkbook(modelRowCount);
  const grid = createGrid(host, { workbook, data });
  grid.setActiveSheet(DASHBOARD_SHEET);
  await waitFor(() => isDashboardDrawn(MODEL_KPIS));
  return grid;
}

/** Edit one order's revenue on the orders sheet; the KPI cards, chart and pivot update. */
async function modelEdit(): Promise<ScenarioResult> {
  const grid = await openModelDashboard();
  try {
    return await collect((index) => {
      const before = kpiTexts();
      return timeAction(
        () =>
          requireApplied(
            grid.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: ORDERS_SHEET, row: 2, col: REVENUE_COL },
                  value: { kind: "literal", value: 100_000 + index },
                },
              ],
            }),
          ),
        () => isDashboardDrawn(MODEL_KPIS) && kpiTexts() !== before,
      );
    });
  } finally {
    grid.destroy();
  }
}

function slicerButton(label: string): HTMLButtonElement {
  const buttons =
    dashboardRoot()?.querySelectorAll<HTMLButtonElement>(".sheetwrite-dashboard-slicer-value") ??
    [];
  const button = [...buttons].find((candidate) => candidate.textContent === label);
  if (button === undefined) throw new Error(`The slicer has no ${label} button`);
  return button;
}

/** Click a region on the slicer, a different one each sample; every item updates. */
async function modelSlicer(): Promise<ScenarioResult> {
  const grid = await openModelDashboard();
  try {
    return await collect((index) => {
      const region = REGIONS[(index + warmups) % REGIONS.length] ?? REGIONS[0];
      const before = kpiTexts();
      return timeAction(
        () => slicerButton(region).click(),
        () =>
          isDashboardDrawn(MODEL_KPIS) &&
          kpiTexts() !== before &&
          slicerButton(region).getAttribute("aria-pressed") === "true",
      );
    });
  } finally {
    grid.destroy();
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (condition()) return;
    await nextFrame();
  }
  throw new Error(`${scenario}: the page did not reach its start state`);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? Number.NaN) + upper) / 2;
}

const SCENARIOS: Readonly<Record<string, () => Promise<ScenarioResult>>> = {
  "chart-edit-line": () => chartEdit("line", 4),
  "chart-edit-column": () => chartEdit("column", 3),
  "chart-filter-line": () => chartFilter("line", 4),
  "scroll-charts": scrollCharts,
  "dashboard-showcase-first": showcaseFirst,
  "dashboard-model-first": modelFirst,
  "dashboard-model-edit": modelEdit,
  "dashboard-model-slicer": modelSlicer,
};

/**
 * The driver's binding that receives each status change and the result. The
 * driver waits on it instead of polling the page, which would add its own
 * work and frame callbacks to the timed frames.
 */
function report(next: string, result = ""): void {
  setStatus(next);
  const binding: unknown = Reflect.get(globalThis, "analyticsReport");
  if (typeof binding === "function") binding(next, result);
}

async function start(): Promise<void> {
  const run = SCENARIOS[scenario];
  if (run === undefined) throw new Error(`Unknown scenario: ${scenario}`);
  await initSheetwrite({ engine: formulas, source: "/formulas.wasm", addons: [chartsAddon()] });
  runButton.addEventListener("click", () => {
    runButton.disabled = true;
    setStatus("running");
    run().then(
      (result) => report("done", JSON.stringify(result)),
      (error: unknown) => {
        console.error(`The ${scenario} scenario failed.`, error);
        report("error");
      },
    );
  });
  runButton.disabled = false;
  report("idle");
}

start().catch((error: unknown) => {
  console.error("The analytics benchmark page could not start.", error);
  report("error");
});
