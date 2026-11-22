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

const status = required_element("#bench-status", HTMLOutputElement);
const run_button = required_element("#bench-run", HTMLButtonElement);
const host = required_element("#grid-host", HTMLDivElement);
const formula_host = required_element("#formula-host", HTMLDivElement);

function required_element<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`The benchmark page has no ${selector}.`);

  return element;
}

function positive_integer_parameter(params: URLSearchParams, name: string): number {
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

function dispatch_key(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Resolves after the next frame has painted, before any later frame. */
function after_frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** Two frames: input that schedules its paint from a frame callback still lands inside. */
async function settle(): Promise<void> {
  await after_frame();
  await after_frame();
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

function open_editor(): void {
  host.focus();
  dispatch_key(host, "F2");
  editor();
}

function formula_bar(): HTMLTextAreaElement {
  const element = formula_host.querySelector<HTMLTextAreaElement>("textarea");
  if (!element) throw new Error("The formula bar is not mounted.");

  return element;
}

/** One typed character at the end of `field`, as a keystroke delivers it. */
function type_character(field: HTMLTextAreaElement): void {
  const end = field.value.length;
  field.setRangeText("x", end, end, "end");
  field.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }),
  );
}

function commit_edit(step: number): void {
  open_editor();
  const field = editor();
  field.value = `Edited ${step}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  dispatch_key(field, "Enter");
}

/** The measured input of one step. */
function perform_step(grid: Grid, action: ForcedLayoutAction, step: number): void {
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
      dispatch_key(host, "ArrowDown");
      break;
    case "arrow-down-refresh":
      dispatch_key(host, "ArrowDown");
      grid.refresh();
      break;
    case "edit-type":
      type_character(editor());
      break;
    case "bar-type":
      type_character(formula_bar());
      break;
    case "edit-open":
      open_editor();
      break;
    case "edit-commit":
    case "edit-commit-refresh":
      commit_edit(step);
      break;
  }
}

function select_start_cell(grid: Grid): void {
  grid.setSelection({ kind: "cell", addr: { sheet: SHEET, row: START_ROW, col: COL.customer } });
}

/** Untimed reset after a step that leaves state the next step must not see. */
function reset_step(grid: Grid, action: ForcedLayoutAction): void {
  if (action === "edit-open") dispatch_key(editor(), "Escape");
  // Enter commits and moves down; every commit edits the same cell.
  if (action === "edit-commit" || action === "edit-commit-refresh") select_start_cell(grid);
  // The render benchmark's untimed preparation reveals the cell and paints.
  if (action === "edit-commit-refresh") {
    grid.scrollToCell({ sheet: SHEET, row: START_ROW, col: COL.customer });
    grid.refresh();
  }
}

/** Each step waits for the frames that paint it. */
async function run_framed_steps(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): Promise<void> {
  for (let step = -warmups; step < steps; step++) {
    const measured = step >= 0;
    if (measured) performance.mark(stepMarkName(step, "start"));
    perform_step(grid, action, step);
    await settle();
    if (measured) performance.mark(stepMarkName(step, "end"));
    reset_step(grid, action);
    await settle();
  }
}

/** Steps back to back in one task, as the render benchmark's timed loop runs them. */
function run_synchronous_steps(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): void {
  for (let step = -warmups; step < steps; step++) {
    const measured = step >= 0;
    if (measured) performance.mark(stepMarkName(step, "start"));
    perform_step(grid, action, step);
    if (measured) performance.mark(stepMarkName(step, "end"));
    reset_step(grid, action);
  }
}

async function run_action(
  grid: Grid,
  action: ForcedLayoutAction,
  warmups: number,
  steps: number,
): Promise<void> {
  select_start_cell(grid);
  grid.scrollToCell({ sheet: SHEET, row: START_ROW, col: COL.customer });
  host.focus();
  await settle();
  if (action === "edit-type") {
    open_editor();
    await settle();
  }
  if (action === "bar-type") {
    formula_bar().focus();
    await settle();
  }
  if (action === "editor-scroll") {
    open_editor();
    await settle();
  }
  if (SYNCHRONOUS_ACTIONS[action]) run_synchronous_steps(grid, action, warmups, steps);
  else await run_framed_steps(grid, action, warmups, steps);
  await settle();
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const action = params.get("action") ?? "";
  if (!isForcedLayoutAction(action)) throw new Error(`Unknown action: ${action}`);
  const warmups = positive_integer_parameter(params, "warmups");
  const steps = positive_integer_parameter(params, "steps");

  await initSheetwrite();
  const grid = createGrid(host, {
    workbook: workbook(),
    data: toSheetwriteColumnar(makeColumnar(FORCED_LAYOUT_ROWS)),
  });
  // The typing rows type with a formula bar beside the grid, as the shell shows one.
  if (TYPING_ACTIONS[action]) createFormulaBar(formula_host, grid);
  await settle();
  run_button.addEventListener(
    "click",
    () => {
      run_button.disabled = true;
      status.dataset.status = "running";
      run_action(grid, action, warmups, steps).then(
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
  run_button.disabled = false;
  status.dataset.status = "idle";
}

start().catch((error: unknown) => {
  console.error("The forced layout benchmark page could not start.", error);
  status.dataset.status = "error";
});
