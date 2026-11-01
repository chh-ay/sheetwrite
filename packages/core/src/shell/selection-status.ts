// Status line in the spirit of Excel's: the selection's shape plus Average,
// Count and Sum. Geometry is constant-time per selection event; the totals
// come from Grid.summarizeSelection, which reads in bounded chunks between
// frames, so this piece stays safe next to any selection size.

import { formatNumber } from "../number-format.js";
import { isAbortError, Scope, ScopeSlot } from "../scope.js";
import type { Selection } from "../types/coordinates.js";
import type { Grid, SelectionSummary } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

/** Human phrase for a selection's geometry; blank for null/single-cell. */
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

/**
 * `<output role="status">` that follows the grid's selection and its values.
 * Text nodes only; polite live region so screen readers announce changes
 * without interrupting.
 */
export function createSelectionStatus(host: HTMLElement, grid: Grid): ShellPiece {
  const output = document.createElement("output");
  output.className = "sheetwrite-shell-status";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");

  let geometry = "";
  let totals = "";
  const lifetime = new Scope();
  const summaries = new ScopeSlot(lifetime);

  const show = (): void => {
    const text = [totals, geometry].filter(Boolean).join(STATUS_SEPARATOR);
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
    geometry = describeSelection(selection);
    show();
    summarize();
  };
  host.appendChild(output);
  lifetime.add(() => output.remove());
  lifetime.add(grid.on("selection", (event) => onSelection(event.selection)));
  lifetime.add(grid.on("change", summarize));
  onSelection(grid.getSelection());

  return {
    element: output,
    destroy: () => lifetime.close(),
  };
}
