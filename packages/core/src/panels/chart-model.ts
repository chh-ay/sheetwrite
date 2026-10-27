// Chart definitions that Insert › Chart and the Chart panel build, as plain
// data, so the rules are tested without a DOM.

import type { CellScalar } from "../types/cell.js";
import type { ChartAnchor, ChartDefinition, ChartKind, ChartSeries } from "../types/chart.js";
import type { Range, Selection, SheetId } from "../types/coordinates.js";

/** Size of a new chart in CSS pixels; Excel's default chart is 5 by 3 inches. */
export const DEFAULT_CHART_WIDTH = 480;
export const DEFAULT_CHART_HEIGHT = 288;

/** The chart kinds in the order the kind picker shows them, with their labels. */
export const CHART_KIND_LABELS: readonly (readonly [ChartKind, string])[] = [
  ["column", "Column"],
  ["bar", "Bar"],
  ["line", "Line"],
  ["area", "Area"],
  ["pie", "Pie"],
  ["doughnut", "Doughnut"],
  ["scatter", "Scatter"],
];

/** The sheet facts a selection resolves against. */
interface SheetSize {
  readonly id: SheetId;
  readonly rowCount: number;
  readonly columns: { readonly length: number };
}

/**
 * The rectangle a command acts on: a cell, a range, a whole row or column
 * clipped to the sheet, or the first rectangle of a multi-range selection.
 */
export function selectionRange(
  selection: Selection | null,
  sheets: readonly SheetSize[],
): Range | null {
  if (selection === null) return null;
  switch (selection.kind) {
    case "cell":
      return {
        sheet: selection.addr.sheet,
        start: { row: selection.addr.row, col: selection.addr.col },
        end: { row: selection.addr.row, col: selection.addr.col },
      };
    case "range":
      return {
        sheet: selection.range.sheet,
        start: {
          row: Math.min(selection.range.start.row, selection.range.end.row),
          col: Math.min(selection.range.start.col, selection.range.end.col),
        },
        end: {
          row: Math.max(selection.range.start.row, selection.range.end.row),
          col: Math.max(selection.range.start.col, selection.range.end.col),
        },
      };
    case "multi": {
      const first = selection.ranges[0];
      return first === undefined ? null : selectionRange({ kind: "range", range: first }, sheets);
    }
    case "row":
    case "column": {
      const sheet = sheets.find((candidate) => candidate.id === selection.sheet);
      if (sheet === undefined || sheet.rowCount === 0 || sheet.columns.length === 0) return null;
      return selection.kind === "row"
        ? {
            sheet: sheet.id,
            start: { row: selection.row, col: 0 },
            end: { row: selection.row, col: sheet.columns.length - 1 },
          }
        : {
            sheet: sheet.id,
            start: { row: 0, col: selection.col },
            end: { row: sheet.rowCount - 1, col: selection.col },
          };
    }
  }
}

/** The first `chart-N` ID that no chart on the sheet uses. */
export function nextChartId(charts: readonly ChartDefinition[]): string {
  const used = new Set(charts.map((chart) => chart.id));
  let number = charts.length + 1;
  while (used.has(`chart-${number}`)) number += 1;
  return `chart-${number}`;
}

/**
 * A column chart of `range`, one series per column, as Excel builds it from a
 * selection:
 * - the first column holds categories when its cells below the first row are
 *   text (empty cells allowed) and the range has more than one column;
 * - the first row holds series names when its cells are all text and the range
 *   has more than one row. The corner cell above the categories is ignored.
 * The chart sits to the right of the range, at the default size.
 */
export function chartFromRange(
  range: Range,
  read: (row: number, col: number) => CellScalar,
  id: string,
  columnCount: number,
): ChartDefinition {
  const { start, end } = range;

  let categoryText = false;
  let categoryOther = false;
  for (let row = start.row + 1; row <= end.row; row++) {
    const value = read(row, start.col);
    if (typeof value === "string") categoryText = true;
    else if (value !== null) categoryOther = true;
  }
  const hasCategories = end.col > start.col && categoryText && !categoryOther;

  const firstSeriesCol = hasCategories ? start.col + 1 : start.col;
  let headerText = end.row > start.row;
  for (let col = firstSeriesCol; col <= end.col && headerText; col++) {
    headerText = typeof read(start.row, col) === "string";
  }
  const firstValueRow = headerText ? start.row + 1 : start.row;

  const column = (col: number, fromRow: number, toRow: number): Range => ({
    sheet: range.sheet,
    start: { row: fromRow, col },
    end: { row: toRow, col },
  });
  const series: ChartSeries[] = [];
  for (let col = firstSeriesCol; col <= end.col; col++) {
    const entry: ChartSeries = { values: column(col, firstValueRow, end.row) };
    if (headerText) entry.nameRange = column(col, start.row, start.row);
    if (hasCategories) entry.categories = column(start.col, firstValueRow, end.row);
    series.push(entry);
  }

  const anchor: ChartAnchor = {
    row: start.row,
    col: Math.min(end.col + 1, columnCount - 1),
    offsetX: 0,
    offsetY: 0,
    width: DEFAULT_CHART_WIDTH,
    height: DEFAULT_CHART_HEIGHT,
  };
  return { id, kind: "column", anchor, series };
}
