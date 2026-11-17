// Status line in the spirit of Excel's: how many records an AutoFilter keeps
// right after it filters, then the selection's shape plus Average, Count and
// Sum, and after an undo or redo the step it applied. Geometry is
// constant-time per selection event; the totals come from
// Grid.summarizeSelection, which reads in bounded chunks between frames, so
// this piece stays safe next to any selection size.

import { colToA1 } from "../a1.js";
import { formatNumber } from "../number-format.js";
import { isAbortError, Scope, ScopeSlot } from "../scope.js";
import { autoFilterBody } from "../store/autofilter.js";
import { storeEngine } from "../store/engine-registry.js";
import type { Range, Selection } from "../types/coordinates.js";
import type { DocumentOp } from "../types/document.js";
import type { Grid, GridEvents, SelectionSummary } from "../types/grid.js";
import type { ChangeEvent } from "../types/transaction.js";
import type { ShellPiece } from "./formula-controls.js";

/**
 * Human phrase for a selection's geometry; blank for null/single-cell.
 *
 * @param selection - The grid's selection, or `null` when nothing is selected.
 * @returns Text such as `3 × 2 cells` or `Row 4`, or an empty string.
 */
export function describeSelection(selection: Selection | null): string {
  if (!selection || selection.kind === "cell") return "";

  if (selection.kind === "range") {
    const rows = Math.abs(selection.range.end.row - selection.range.start.row) + 1;
    const cols = Math.abs(selection.range.end.col - selection.range.start.col) + 1;
    if (rows === 1 && cols === 1) return "";
    return `${rows} × ${cols} cells`;
  }

  if (selection.kind === "row") return `Row ${selection.row + 1}`;
  if (selection.kind === "column") return `Column ${selection.col + 1}`;
  return `${selection.ranges.length} ranges`;
}

/**
 * Excel's rule: totals appear once two or more cells hold values, and
 * Average and Sum only when at least one of them is a number.
 */
function describeSummary(summary: SelectionSummary | null): string {
  if (summary === null || summary.count < 2) return "";
  const parts: string[] = [];
  if (summary.average !== null) parts.push(`Average: ${formatNumber(summary.average)}`);
  parts.push(`Count: ${summary.count}`);
  if (summary.numericCount > 0) parts.push(`Sum: ${formatNumber(summary.sum)}`);
  return parts.join(STATUS_SEPARATOR);
}

/** Runs of spaces collapse in HTML, so parts need a visible separator. */
const STATUS_SEPARATOR = " · ";

/** `B2:D9`, or `C5` for one cell, with the sheet's row numbers. */
function rangeA1({ start, end }: Range): string {
  const first = `${colToA1(start.col)}${start.row + 1}`;
  const last = `${colToA1(end.col)}${end.row + 1}`;
  return first === last ? first : `${first}:${last}`;
}

/** "Undo: Paste in B2:D9", or "Redo: Insert Rows" for a step that changed no cells. */
function describeHistoryStep({ direction, step, range }: GridEvents["history-step"]): string {
  const place = range ? ` in ${rangeA1(range)}` : "";
  return `${direction === "undo" ? "Undo" : "Redo"}: ${step}${place}`;
}

/** Whether `patch` turns the AutoFilter of `sheet` on or off, or changes its filters. */
function changesFilter(patch: DocumentOp, sheet: string): boolean {
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
function describeRecords(grid: Grid): string {
  const autoFilter = grid.getAutoFilter();
  const filters = grid.getColumnFilters();
  const engine = storeEngine(grid.store);
  if (!autoFilter || filters.size === 0 || !engine) return "";
  const body = autoFilterBody(autoFilter);
  let found = 0;
  for (const row of engine.filteredRows(grid.getActiveSheet(), filters)) {
    if (row >= body.start && row <= body.end) found++;
  }
  return `${found} of ${body.end - body.start + 1} records found`;
}

/**
 * `<output role="status">` that follows the grid's selection and its values.
 * After a change to the AutoFilter's filters it starts with "12 of 48
 * records found", as Excel's status bar does, until the next other change or
 * sheet switch. Text nodes only; polite live region so screen readers
 * announce changes without interrupting.
 *
 * @param host - Element the status is appended to.
 */
export function createSelectionStatus(host: HTMLElement, grid: Grid): ShellPiece {
  const output = document.createElement("output");
  output.className = "sheetwrite-shell-status";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");

  let records = "";
  let geometry = "";
  let totals = "";
  // The last undo or redo, shown until the selection changes again.
  let historyStep = "";
  const lifetime = new Scope();
  const summaries = new ScopeSlot(lifetime);

  const show = (): void => {
    const text = [historyStep, records, totals, geometry].filter(Boolean).join(STATUS_SEPARATOR);
    output.textContent = text;
    output.hidden = text === "";
    host.hidden = output.hidden && host.childElementCount === 1;
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
        totals = describeSummary(summary);
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

  const onSelection = (selection: Selection | null): void => {
    historyStep = "";
    geometry = describeSelection(selection);
    show();
    summarize();
  };

  // Like Excel, the count shows after the filter changes and goes with the
  // next edit, as edits do not filter again.
  const onChange = (event: ChangeEvent): void => {
    const sheet = grid.getActiveSheet();
    records = event.transaction.patches.some((patch) => changesFilter(patch, sheet))
      ? describeRecords(grid)
      : "";
    show();
    summarize();
  };
  host.appendChild(output);
  lifetime.add(() => output.remove());
  lifetime.add(grid.on("selection", (event) => onSelection(event.selection)));
  lifetime.add(grid.on("change", onChange));
  lifetime.add(
    grid.on("active-sheet", () => {
      records = "";
      show();
    }),
  );
  // Undo and redo select what they changed first, so the step outlives that selection event.
  lifetime.add(
    grid.on("history-step", (event) => {
      historyStep = describeHistoryStep(event);
      show();
    }),
  );
  onSelection(grid.getSelection());

  return {
    element: output,
    destroy: () => lifetime.close(),
  };
}
