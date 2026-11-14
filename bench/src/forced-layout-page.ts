import {
  type Column,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";
import { createFormulaBar } from "@sheetwrite/core/shell";

import "@sheetwrite/core/styles.css";
import { COL, COLUMNS, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import {
  FORCED_LAYOUT_ROWS,
  type ForcedLayoutAction,
  isForcedLayoutAction,
  stepMarkName,
  SYNCHRONOUS_ACTIONS,
  TYPING_ACTIONS,
} from "./forced-layout-actions.js";

// The page of forced-layout-bench.ts. The driver opens it with `action`,
// `warmups` and `steps` parameters, clicks the button once and waits for the
// status. User Timing marks bracket the measured steps for the driver's trace.
const SHEET = "bench";
/** Three default rows: every scroll step moves the painted window. */
const SCROLL_STEP_PX = 84;
const START_ROW = FORCED_LAYOUT_ROWS / 2;

const status = requiredElement("#bench-status", HTMLOutputElement);
const runButton = requiredElement("#bench-run", HTMLButtonElement);
const host = requiredElement("#grid-host", HTMLDivElement);
const formulaHost = requiredElement("#formula-host", HTMLDivElement);

function requiredElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`The benchmark page has no ${selector}.`);

  return element;
}

function positiveIntegerParameter(params: URLSearchParams, name: string): number {
  const value = Number(params.get(name));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name} parameter.`);

  return value;
}

function workbook(): Workbook {
  const columns: Column[] = COLUMNS.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
    type: column.key === "date" ? "date" : column.type,
    numberFormat:
      column.key === "amount" ? "#,##0.00" : column.key === "date" ? "mmm d, yyyy" : undefined,
    numberLocale: "en-US",
  }));
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Bench", rowCount: FORCED_LAYOUT_ROWS, columns }],
  };
}

function dispatchKey(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Resolves after the next frame has painted, before any later frame. */
function afterFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** Two frames: input that schedules its paint from a frame callback still lands inside. */
async function settle(): Promise<void> {
  await afterFrame();
  await afterFrame();
}

function scroller(): HTMLElement {
  const element = host.querySelector<HTMLElement>(".sheetwrite-scroller");
  if (!element) throw new Error("The grid scroller is not mounted.");

  return element;
}

function editor(): HTMLTextAreaElement {
  const element = host.querySelector<HTMLTextAreaElement>(".sheetwrite-editor");
  if (!element) throw new Error("The cell editor is not open.");

  return element;
}

function openEditor(): void {
  host.focus();
  dispatchKey(host, "Enter");
  editor();
}

function formulaBar(): HTMLTextAreaElement {
  const element = formulaHost.querySelector<HTMLTextAreaElement>("textarea");
  if (!element) throw new Error("The formula bar is not mounted.");

  return element;
}

/** One typed character at the end of `field`, as a keystroke delivers it. */
function typeCharacter(field: HTMLTextAreaElement): void {
  const end = field.value.length;
  field.setRangeText("x", end, end, "end");
  field.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }),
  );
}

function commitEdit(step: number): void {
  openEditor();
  const field = editor();
  field.value = `Edited ${step}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  dispatchKey(field, "Enter");
}

/** The measured input of one step. */
function performStep(grid: Grid, action: ForcedLayoutAction, step: number): void {
  switch (action) {
    case "scroll":
    case "editor-scroll":
      scroller().scrollTop += SCROLL_STEP_PX;
      break;
    case "scroll-refresh":
      scroller().scrollTop += SCROLL_STEP_PX;
      grid.refresh();
      break;
    case "arrow-down":
      dispatchKey(host, "ArrowDown");
      break;
    case "arrow-down-refresh":
      dispatchKey(host, "ArrowDown");
      grid.refresh();
      break;
    case "edit-type":
      typeCharacter(editor());
      break;
    case "bar-type":
      typeCharacter(formulaBar());
      break;
    case "edit-open":
      openEditor();
      break;
    case "edit-commit":
    case "edit-commit-refresh":
      commitEdit(step);
      break;
  }
}

function selectStartCell(grid: Grid): void {
  grid.setSelection({ kind: "cell", addr: { sheet: SHEET, row: START_ROW, col: COL.customer } });
}

/** Untimed reset after a step that leaves state the next step must not see. */
function resetStep(grid: Grid, action: ForcedLayoutAction): void {
  if (action === "edit-open") dispatchKey(editor(), "Escape");
  // Enter commits and moves down; every commit edits the same cell.
  if (action === "edit-commit" || action === "edit-commit-refresh") selectStartCell(grid);
  // The render benchmark's untimed preparation reveals the cell and paints.
  if (action === "edit-commit-refresh") {
    grid.scrollToCell({ sheet: SHEET, row: START_ROW, col: COL.customer });
    grid.refresh();
  }
}

/** Each step waits for the frames that paint it. */
async function runFramedSteps(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): Promise<void> {
  for (let step = -warmups; step < steps; step++) {
    const measured = step >= 0;
    if (measured) performance.mark(stepMarkName(step, "start"));
    performStep(grid, action, step);
    await settle();
    if (measured) performance.mark(stepMarkName(step, "end"));
    resetStep(grid, action);
    await settle();
  }
}

/** Steps back to back in one task, as the render benchmark's timed loop runs them. */
function runSynchronousSteps(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): void {
  for (let step = -warmups; step < steps; step++) {
    const measured = step >= 0;
    if (measured) performance.mark(stepMarkName(step, "start"));
    performStep(grid, action, step);
    if (measured) performance.mark(stepMarkName(step, "end"));
    resetStep(grid, action);
  }
}

async function runAction(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): Promise<void> {
  selectStartCell(grid);
  grid.scrollToCell({ sheet: SHEET, row: START_ROW, col: COL.customer });
  host.focus();
  await settle();
  if (action === "edit-type") {
    openEditor();
    await settle();
  }
  if (action === "bar-type") {
    formulaBar().focus();
    await settle();
  }
  if (action === "editor-scroll") {
    openEditor();
    await settle();
  }
  if (SYNCHRONOUS_ACTIONS[action]) runSynchronousSteps(grid, action, warmups, steps);
  else await runFramedSteps(grid, action, warmups, steps);
  await settle();
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const action = params.get("action") ?? "";
  if (!isForcedLayoutAction(action)) throw new Error(`Unknown action: ${action}`);
  const warmups = positiveIntegerParameter(params, "warmups");
  const steps = positiveIntegerParameter(params, "steps");

  await initSheetwrite();
  const grid = createGrid(host, {
    workbook: workbook(),
    data: toSheetwriteColumnar(makeColumnar(FORCED_LAYOUT_ROWS)),
  });
  // The typing rows type with a formula bar beside the grid, as the shell shows one.
  if (TYPING_ACTIONS[action]) createFormulaBar(formulaHost, grid);
  await settle();
  runButton.addEventListener(
    "click",
    () => {
      runButton.disabled = true;
      status.dataset.status = "running";
      runAction(grid, action, warmups, steps).then(
        () => {
          status.dataset.status = "done";
        },
        (error: unknown) => {
          console.error("The forced layout action failed.", error);
          status.dataset.status = "error";
        },
      );
    },
    { once: true },
  );
  runButton.disabled = false;
  status.dataset.status = "idle";
}

start().catch((error: unknown) => {
  console.error("The forced layout benchmark page could not start.", error);
  status.dataset.status = "error";
});
