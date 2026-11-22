// Data › Custom Sort: the range, a header row, sort levels and the choice
// between sorting the cells (Excel's Sort) and sorting the view only. One Sort
// press runs one grid operation, so history and sync see one change.

import { colToA1 } from "../a1.js";
import { readRowValues } from "../data-window-reads.js";
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
  focus_key: string,
): { element: HTMLLabelElement; box: HTMLInputElement } {
  const element = document.createElement("label");
  element.className = "sheetwrite-panel-check";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.dataset.focusKey = focus_key;
  element.append(box, label);
  return { element, box };
}

/**
 * The range a sort starts with: the selected rectangle when it has more than
 * one cell, else the current region around the selected cell.
 */
function initial_range(grid: Grid): Range | null {
  const range = selectionRange(grid.getSelection(), grid.store.getWorkbook().sheets);
  if (range === null) return null;

  const single = range.start.row === range.end.row && range.start.col === range.end.col;
  return single
    ? (currentRegion(grid.store, { sheet: range.sheet, ...range.start }) ?? range)
    : range;
}

/** Column choices of a range: the header text when it has one, else the column letter. */
function column_options(grid: Grid, range: Range, has_header: boolean): [string, string][] {
  const options: [string, string][] = [];
  const headers = has_header
    ? readRowValues(grid.store, {
        sheet: range.sheet,
        row: range.start.row,
        startCol: range.start.col,
        endCol: range.end.col,
      })
    : [];
  for (let col = range.start.col; col <= range.end.col; col++) {
    const letter = `Column ${colToA1(col)}`;
    const header = headers[col - range.start.col] ?? null;
    options.push([String(col), header === null ? letter : `${String(header)} (${letter})`]);
  }
  return options;
}

export function sortPanel(grid: Grid): GridPanel {
  return {
    title: "Sort",
    render(body) {
      const sheets = grid.store.getWorkbook().sheets;
      const start = initial_range(grid);
      const sheet = start?.sheet ?? sheets[0]?.id ?? "";

      const form = document.createElement("form");
      const range_input = document.createElement("input");
      range_input.type = "text";
      range_input.autocomplete = "off";
      range_input.spellcheck = false;
      range_input.value = start === null ? "" : formatRangeText(start, sheets, sheet);
      const range_field = panelField("Range", range_input, "sort-range");
      const header = checkbox(
        "My data has headers",
        start !== null && looksLikeHeader(grid.store, start),
        "sort-header",
      );
      const view_only = checkbox("Sort view only (cells keep their rows)", false, "sort-view-only");
      const header_box = header.box;
      const view_only_box = view_only.box;

      const levels: SortLevel[] = [{ col: start?.start.col ?? 0, ascending: true }];
      const level_list = panelSection("Sort by");
      const rows = document.createElement("div");
      level_list.append(rows);

      const parsed_range = (): Range | null => {
        const result = parseRangeText(range_input.value, sheets, sheet);
        return "range" in result ? result.range : null;
      };

      const draw_levels = (): void => {
        const range = parsed_range();
        const options = range === null ? [] : column_options(grid, range, header_box.checked);
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
            draw_levels();
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
        draw_levels();
      });

      const sort = document.createElement("button");
      sort.type = "submit";
      sort.className = "sheetwrite-panel-control";
      sort.textContent = "Sort";
      sort.dataset.focusKey = "sort-apply";

      const sync_view_only = (): void => {
        range_input.disabled = view_only_box.checked;
        header_box.disabled = view_only_box.checked;
      };
      view_only_box.addEventListener("change", sync_view_only);
      header_box.addEventListener("change", draw_levels);
      range_input.addEventListener("change", () => {
        range_field.setError(null);
        draw_levels();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const keys: SortKey[] = levels.map(({ col, ascending }) => ({ col, ascending }));
        if (keys.length === 0) {
          range_field.setError(NO_KEYS);
          return;
        }

        if (view_only_box.checked) {
          range_field.setError(rejectionMessage(grid.setViewSort(keys)));
          return;
        }

        const result = parseRangeText(range_input.value, sheets, sheet);
        if ("error" in result) {
          range_field.setError(result.error);
          return;
        }
        const outside = keys.some(
          ({ col }) => col < result.range.start.col || col > result.range.end.col,
        );
        if (outside) {
          range_field.setError(KEY_OUTSIDE);
          return;
        }
        const outcome = grid.sortRange(result.range, keys, { hasHeader: header_box.checked });
        range_field.setError(outcome.status === "noop" ? null : rejectionMessage(outcome));
      });

      form.append(range_field.element, header.element, level_list, add, view_only.element, sort);
      body.append(form);
      draw_levels();
      sync_view_only();
      return () => form.remove();
    },
  };
}
