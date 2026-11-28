// Status line in the spirit of Excel's: the cell mode, how many records an
// AutoFilter keeps right after it filters, then the selection's shape plus
// Average, Count and Sum, and after an undo or redo the step it applied.
// Geometry is constant-time per selection event; the totals come from
// Grid.summarizeSelection, which reads in bounded chunks between frames, so
// this piece stays safe next to any selection size.

import { colToA1 } from "../a1.js";
import { formatNumber } from "../number-format.js";
import { isAbortError, Scope, ScopeSlot } from "../scope.js";
import { autoFilterBody } from "../store/autofilter.js";
import { storeEngine } from "../store/engine-registry.js";
import type { Range, Selection } from "../types/coordinates.js";
import type { DocumentOp } from "../types/document.js";
import type { CellMode, Grid, GridEvents, SelectionSummary } from "../types/grid.js";
import type { ChangeEvent } from "../types/transaction.js";
import type { ShellPiece } from "./formula-controls.js";

/** The words Excel's status bar shows for each cell mode. */
const MODE_LABELS: Readonly<Record<CellMode, string>> = {
  ready: "Ready",
  enter: "Enter",
  edit: "Edit",
  point: "Point",
};

/**
 * Human phrase for a selection's geometry; blank for null/single-cell.
 *
 * @param selection - The grid's selection, or `null` when nothing is selected.
 * @param sheetRowOf - The sheet row a view row shows, as `Grid.sheetRowOf`
 *   gives it, so `Row N` names the row A1 references use under a filter.
 *   Defaults to the view row.
 * @returns Text such as `3 × 2 cells` or `Row 4`, or an empty string.
 */
export function describeSelection(
  selection: Selection | null,
  sheetRowOf: (viewRow: number) => number | null = (row) => row,
): string {
  if (!selection || selection.kind === "cell") return "";

  if (selection.kind === "range") {
    const rows = Math.abs(selection.range.end.row - selection.range.start.row) + 1;
    const cols = Math.abs(selection.range.end.col - selection.range.start.col) + 1;
    if (rows === 1 && cols === 1) return "";
    return `${rows} × ${cols} cells`;
  }

  if (selection.kind === "row") return `Row ${(sheetRowOf(selection.row) ?? selection.row) + 1}`;
  if (selection.kind === "column") return `Column ${selection.col + 1}`;
  return `${selection.ranges.length} ranges`;
}

/** The status line's totals; each is empty when Excel would not show it. */
interface Totals {
  readonly average: string;
  readonly count: string;
  readonly sum: string;
}

const NO_TOTALS: Totals = { average: "", count: "", sum: "" };

/**
 * Excel's rule: totals appear once two or more cells hold values, and
 * Average and Sum only when at least one of them is a number. Average and
 * Sum show in the active cell's number format, as Excel's status bar does
 * (General when it has none); Count is a plain count.
 */
function describe_summary(summary: SelectionSummary | null, number_format?: string): Totals {
  if (summary === null || summary.count < 2) return NO_TOTALS;
  return {
    average:
      summary.average === null ? "" : `Average: ${formatNumber(summary.average, number_format)}`,
    count: `Count: ${summary.count}`,
    sum: summary.numericCount > 0 ? `Sum: ${formatNumber(summary.sum, number_format)}` : "",
  };
}

/**
 * Joins the parts of the screen-reader text. Runs of spaces collapse in HTML,
 * so the parts need a visible separator. shell.css draws the same separator
 * between the drawn parts that show.
 */
const STATUS_SEPARATOR = " · ";

/** `B2:D9`, or `C5` for one cell, with the sheet's row numbers. */
function range_a1({ start, end }: Range): string {
  const first = `${colToA1(start.col)}${start.row + 1}`;
  const last = `${colToA1(end.col)}${end.row + 1}`;
  return first === last ? first : `${first}:${last}`;
}

/** "Undo: Paste in B2:D9", or "Redo: Insert Rows" for a step that changed no cells. */
function describe_history_step({ direction, step, range }: GridEvents["history-step"]): string {
  const place = range ? ` in ${range_a1(range)}` : "";
  return `${direction === "undo" ? "Undo" : "Redo"}: ${step}${place}`;
}

/** Whether `patch` turns the AutoFilter of `sheet` on or off, or changes its filters. */
function changes_filter(patch: DocumentOp, sheet: string): boolean {
  return (
    patch.op === "setSheetMeta" &&
    patch.sheet === sheet &&
    (patch.patch.filters !== undefined || patch.patch.autoFilter !== undefined)
  );
}

/**
 * Excel's "12 of 48 records found": how many rows below the header of the
 * active sheet's AutoFilter its filters keep. Empty without an AutoFilter or
 * a filter.
 */
function describe_records(grid: Grid): string {
  const auto_filter = grid.getAutoFilter();
  const filters = grid.getColumnFilters();
  const engine = storeEngine(grid.store);
  if (!auto_filter || filters.size === 0 || !engine) return "";
  const body = autoFilterBody(auto_filter);
  let found = 0;
  for (const row of engine.filteredRows(grid.getActiveSheet(), filters)) {
    if (row >= body.start && row <= body.end) found++;
  }
  return `${found} of ${body.end - body.start + 1} records found`;
}

/**
 * `<output role="status">` that names Excel's cell mode (Ready, Enter, Edit
 * or Point) and follows the grid's selection and its values. After a change
 * to the AutoFilter's filters it shows "12 of 48 records found", as Excel's
 * status bar does, until the next other change or sheet switch. Text only; a
 * polite live region, so screen readers announce changes without
 * interrupting.
 *
 * When the line is narrower than its text, it drops whole parts as Excel's
 * status bar does: the selection size first, then the records found and the
 * undo step, then Count, then Average, and Sum, the total people read most,
 * last. The cell mode always stays. Screen readers still hear every part.
 *
 * @param host - Element the status is appended to.
 * @param grid - The grid whose selection and mode the status follows.
 */
export function createSelectionStatus(host: HTMLElement, grid: Grid): ShellPiece {
  const output = document.createElement("output");
  output.className = "sheetwrite-shell-status";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  // Excel names the cell mode first, so the user knows what an arrow key does.
  const mode = document.createElement("span");
  mode.className = "sheetwrite-shell-mode";
  // The parts as drawn, which drop out when the line is too narrow. Screen
  // readers read the whole line from `text` instead.
  const parts = document.createElement("span");
  parts.className = "sheetwrite-shell-status-parts";
  parts.setAttribute("aria-hidden", "true");
  const part = (): HTMLSpanElement => {
    const element = document.createElement("span");
    element.className = "sheetwrite-shell-status-part";
    parts.append(element);
    return element;
  };
  const history_part = part();
  const records_part = part();
  const average_part = part();
  const count_part = part();
  const sum_part = part();
  const geometry_part = part();
  const drop_order = [
    geometry_part,
    records_part,
    history_part,
    count_part,
    average_part,
    sum_part,
  ];
  const text = document.createElement("span");
  text.className = "sheetwrite-shell-status-text";
  output.append(mode, parts, text);

  let records = "";
  let geometry = "";
  let totals = NO_TOTALS;
  // The last undo or redo, shown until the selection changes again.
  let history_step = "";
  const lifetime = new Scope();
  const summaries = new ScopeSlot(lifetime);

  // Show every part, then drop parts until the rest fit. It reads layout, so it
  // runs once a frame at most, after a change of text or of the host's size.
  let fit_frame = 0;
  const fit = (): void => {
    fit_frame = 0;
    // The line may narrow to its cell mode and no further, so the tab strip
    // beside it narrows and scrolls before the mode is cut.
    const mode_right = mode.getBoundingClientRect().right;
    output.style.minWidth = `${Math.ceil(mode_right - output.getBoundingClientRect().left)}px`;
    for (const element of drop_order) element.classList.remove("sheetwrite-shell-status-dropped");
    for (const element of drop_order) {
      if (parts.scrollWidth <= parts.clientWidth) break;
      if (!element.hidden) element.classList.add("sheetwrite-shell-status-dropped");
    }
  };
  const schedule_fit = (): void => {
    if (fit_frame === 0) fit_frame = requestAnimationFrame(fit);
  };
  lifetime.add(() => {
    if (fit_frame !== 0) cancelAnimationFrame(fit_frame);
  });
  if (typeof ResizeObserver !== "undefined") {
    const resized = new ResizeObserver(schedule_fit);
    resized.observe(host);
    // The line's own width changes too when the parts beside it change, such
    // as the sheet tabs when a sheet is added.
    resized.observe(output);
    lifetime.add(() => resized.disconnect());
  }

  const show_mode = (cell_mode: CellMode): void => {
    mode.textContent = MODE_LABELS[cell_mode];
    schedule_fit();
  };
  const set_part = (element: HTMLSpanElement, value: string): void => {
    element.textContent = value;
    element.hidden = value === "";
  };
  const show = (): void => {
    const values = [history_step, records, totals.average, totals.count, totals.sum, geometry];
    set_part(history_part, history_step);
    set_part(records_part, records);
    set_part(average_part, totals.average);
    set_part(count_part, totals.count);
    set_part(sum_part, totals.sum);
    set_part(geometry_part, geometry);
    const line = values.filter(Boolean).join(STATUS_SEPARATOR);
    text.textContent = line;
    parts.hidden = line === "";
    text.hidden = line === "";
    if (line !== "") schedule_fit();
  };

  // A newer selection or edit makes an unfinished summary stale: the next
  // summary closes its scope, so a huge selection never queues work behind
  // the user, and an aborted summary shows nothing.
  const summarize = (): void => {
    const run = summaries.next();
    grid.summarizeSelection(run.signal).then(
      (summary) => {
        if (run.closed) return;
        run.close();
        totals = describe_summary(summary, grid.getFocusCellStyle().numberFormat);
        show();
      },
      (error: unknown) => {
        if (run.closed) return;
        run.close();
        // A grid destroyed before this piece aborts the summary: not a failure.
        if (!isAbortError(error)) throw error;
      },
    );
  };

  const on_selection = (selection: Selection | null): void => {
    history_step = "";
    geometry = describeSelection(selection, (row) => grid.sheetRowOf(row));
    show();
    summarize();
  };

  // Like Excel, the count shows after the filter changes and goes with the
  // next edit, as edits do not filter again.
  const on_change = (event: ChangeEvent): void => {
    const sheet = grid.getActiveSheet();
    records = event.transaction.patches.some((patch) => changes_filter(patch, sheet))
      ? describe_records(grid)
      : "";
    show();
    summarize();
  };
  host.appendChild(output);
  lifetime.add(() => output.remove());
  lifetime.add(grid.on("selection", (event) => on_selection(event.selection)));
  lifetime.add(grid.on("change", on_change));
  lifetime.add(
    grid.on("active-sheet", () => {
      records = "";
      show();
    }),
  );
  // Undo and redo select what they changed first, so the step outlives that selection event.
  lifetime.add(
    grid.on("history-step", (event) => {
      history_step = describe_history_step(event);
      show();
    }),
  );
  lifetime.add(grid.on("cell-mode", (event) => show_mode(event.mode)));
  show_mode(grid.getCellMode());
  on_selection(grid.getSelection());

  return {
    element: output,
    destroy: () => lifetime.close(),
  };
}
