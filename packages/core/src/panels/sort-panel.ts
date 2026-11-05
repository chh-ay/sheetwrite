// Data › Custom Sort: the range, a header row, sort levels and the choice
// between sorting the cells (Excel's Sort) and sorting the view only. One Sort
// press runs one grid operation, so history and sync see one change.

import { colToA1 } from "../a1.js";
import { currentRegion, looksLikeHeader } from "../sort-target.js";
import type { Range } from "../types/coordinates.js";
import type { SortKey } from "../types/document.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { selectionRange } from "./chart-model.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";
import { formatRangeText, parseRangeText } from "./range-text.js";

/** Excel allows 64 sort levels. */
const MAX_LEVELS = 64;
const ASCENDING = "ascending";
const DESCENDING = "descending";
const NO_KEYS = "Add a sort level.";
const KEY_OUTSIDE = "Pick sort columns inside the range.";

/** One sort level: a column of the range and an order. */
interface SortLevel {
  col: number;
  ascending: boolean;
}

function button(label: string, run: () => void): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  control.addEventListener("click", run);
  return control;
}

function checkbox(
  label: string,
  checked: boolean,
  focusKey: string,
): { element: HTMLLabelElement; box: HTMLInputElement } {
  const element = document.createElement("label");
  element.className = "sheetwrite-panel-check";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.dataset.focusKey = focusKey;
  element.append(box, label);
  return { element, box };
}

/**
 * The range a sort starts with: the selected rectangle when it has more than
 * one cell, else the current region around the selected cell.
 */
function initialRange(grid: Grid): Range | null {
  const range = selectionRange(grid.getSelection(), grid.store.getWorkbook().sheets);
  if (range === null) return null;

  const single = range.start.row === range.end.row && range.start.col === range.end.col;
  return single
    ? (currentRegion(grid.store, { sheet: range.sheet, ...range.start }) ?? range)
    : range;
}

/** Column choices of a range: the header text when it has one, else the column letter. */
function columnOptions(grid: Grid, range: Range, hasHeader: boolean): [string, string][] {
  const options: [string, string][] = [];
  for (let col = range.start.col; col <= range.end.col; col++) {
    const letter = `Column ${colToA1(col)}`;
    const header = hasHeader
      ? grid.store.getCell({ sheet: range.sheet, row: range.start.row, col }).resolved
      : null;
    options.push([String(col), header === null ? letter : `${String(header)} (${letter})`]);
  }
  return options;
}

export function sortPanel(grid: Grid): GridPanel {
  return {
    title: "Sort",
    render(body) {
      const sheets = grid.store.getWorkbook().sheets;
      const start = initialRange(grid);
      const sheet = start?.sheet ?? sheets[0]?.id ?? "";

      const form = document.createElement("form");
      const rangeInput = document.createElement("input");
      rangeInput.type = "text";
      rangeInput.autocomplete = "off";
      rangeInput.spellcheck = false;
      rangeInput.value = start === null ? "" : formatRangeText(start, sheets, sheet);
      const rangeField = panelField("Range", rangeInput, "sort-range");
      const header = checkbox(
        "My data has headers",
        start !== null && looksLikeHeader(grid.store, start),
        "sort-header",
      );
      const viewOnly = checkbox("Sort view only (cells keep their rows)", false, "sort-view-only");
      const headerBox = header.box;
      const viewOnlyBox = viewOnly.box;

      const levels: SortLevel[] = [{ col: start?.start.col ?? 0, ascending: true }];
      const levelList = panelSection("Sort by");
      const rows = document.createElement("div");
      levelList.append(rows);

      const parsedRange = (): Range | null => {
        const result = parseRangeText(rangeInput.value, sheets, sheet);
        return "range" in result ? result.range : null;
      };

      const drawLevels = (): void => {
        const range = parsedRange();
        const options = range === null ? [] : columnOptions(grid, range, headerBox.checked);
        rows.replaceChildren();
        levels.forEach((level, index) => {
          const row = document.createElement("div");
          row.className = "sheetwrite-panel-row";
          const column = panelField(
            index === 0 ? "Sort by" : "Then by",
            selectOf(options, String(level.col)),
            `sort-column-${index}`,
          );
          column.control.addEventListener("change", () => {
            level.col = Number(column.control.value);
          });
          const order = panelField(
            "Order",
            selectOf(
              [
                [ASCENDING, "A to Z"],
                [DESCENDING, "Z to A"],
              ],
              level.ascending ? ASCENDING : DESCENDING,
            ),
            `sort-order-${index}`,
          );
          order.control.addEventListener("change", () => {
            level.ascending = order.control.value === ASCENDING;
          });
          const remove = button("Delete level", () => {
            levels.splice(index, 1);
            drawLevels();
          });
          remove.setAttribute("aria-label", `Delete sort level ${index + 1}`);
          remove.disabled = levels.length === 1;
          row.append(column.element, order.element, remove);
          rows.append(row);
        });
      };

      const add = button("Add level", () => {
        if (levels.length >= MAX_LEVELS) return;
        const last = levels.at(-1);
        levels.push({ col: last?.col ?? 0, ascending: true });
        drawLevels();
      });

      const sort = document.createElement("button");
      sort.type = "submit";
      sort.className = "sheetwrite-panel-control";
      sort.textContent = "Sort";
      sort.dataset.focusKey = "sort-apply";

      const syncViewOnly = (): void => {
        rangeInput.disabled = viewOnlyBox.checked;
        headerBox.disabled = viewOnlyBox.checked;
      };
      viewOnlyBox.addEventListener("change", syncViewOnly);
      headerBox.addEventListener("change", drawLevels);
      rangeInput.addEventListener("change", () => {
        rangeField.setError(null);
        drawLevels();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const keys: SortKey[] = levels.map(({ col, ascending }) => ({ col, ascending }));
        if (keys.length === 0) {
          rangeField.setError(NO_KEYS);
          return;
        }

        if (viewOnlyBox.checked) {
          rangeField.setError(rejectionMessage(grid.setViewSort(keys)));
          return;
        }

        const result = parseRangeText(rangeInput.value, sheets, sheet);
        if ("error" in result) {
          rangeField.setError(result.error);
          return;
        }
        const outside = keys.some(
          ({ col }) => col < result.range.start.col || col > result.range.end.col,
        );
        if (outside) {
          rangeField.setError(KEY_OUTSIDE);
          return;
        }
        const outcome = grid.sortRange(result.range, keys, { hasHeader: headerBox.checked });
        rangeField.setError(outcome.status === "noop" ? null : rejectionMessage(outcome));
      });

      form.append(rangeField.element, header.element, levelList, add, viewOnly.element, sort);
      body.append(form);
      drawLevels();
      syncViewOnly();
      return () => form.remove();
    },
  };
}
