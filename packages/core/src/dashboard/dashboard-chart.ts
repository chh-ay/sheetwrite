// Chart views over dashboard pivots (#231). As an Excel PivotChart does, the
// row items are the categories and each value field, for each column item, is
// one series. The view reads the item's hidden pivot, which has no subtotals
// or totals and one label column per row field, so the chart never shows a
// total as a point.

import { MAX_CHART_SERIES } from "../chart-definition.js";
import { MAX_CHART_POINTS } from "../charts-live.js";
import type { CellScalar } from "../types/cell.js";
import type { ChartDefinition, ChartSeriesView, ChartView } from "../types/chart.js";

/** One pivot output from the engine, decoded: cells in row-major order and the layout counts. */
export interface PivotOutputRead {
  readonly cells: readonly CellScalar[];
  readonly rows: number;
  readonly cols: number;
  readonly headerRows: number;
  readonly labelCols: number;
}

/** Text of a label or header cell; blanks are empty. */
function labelText(value: CellScalar | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * The category of each data row. Tabular layout leaves a repeated outer label
 * blank, so each label column carries its last label down.
 */
function categoriesOf(
  output: PivotOutputRead,
  rowCount: number,
): Array<string | number | boolean | null> {
  const carried: CellScalar[] = Array.from({ length: output.labelCols }, () => null);
  const categories: Array<string | number | boolean | null> = [];
  for (let row = output.headerRows; row < output.headerRows + rowCount; row += 1) {
    for (let col = 0; col < output.labelCols; col += 1) {
      const value = output.cells[row * output.cols + col] ?? null;
      if (value !== null) carried[col] = value;
    }
    const category =
      output.labelCols === 1
        ? (carried[0] ?? null)
        : carried
            .map(labelText)
            .filter((text) => text !== "")
            .join(" / ");
    categories.push(category);
  }
  return categories;
}

/** The series name of data column `col`: its header cells, joined from the top. */
function seriesNameOf(output: PivotOutputRead, col: number): string {
  const parts: string[] = [];
  for (let row = 0; row < output.headerRows; row += 1) {
    const text = labelText(output.cells[row * output.cols + col]);
    if (text !== "") parts.push(text);
  }
  return parts.join(" / ");
}

/**
 * The view of `chart` over a pivot output. `formats` holds the number format
 * of each value field in order; data columns cycle through the value fields.
 * A missing output gives a chart with no series.
 */
export function pivotChartView(
  chart: ChartDefinition,
  output: PivotOutputRead | null,
  formats: readonly (string | undefined)[],
): ChartView {
  if (output === null || output.rows <= output.headerRows) return { chart, series: [] };

  const dataRows = output.rows - output.headerRows;
  const rowCount = Math.min(dataRows, MAX_CHART_POINTS);
  const categories = categoriesOf(output, rowCount);
  const seriesCount = Math.min(output.cols - output.labelCols, MAX_CHART_SERIES);
  const series: ChartSeriesView[] = [];
  for (let index = 0; index < seriesCount; index += 1) {
    const col = output.labelCols + index;
    const values: Array<number | null> = [];
    for (let row = output.headerRows; row < output.headerRows + rowCount; row += 1) {
      const value = output.cells[row * output.cols + col];
      values.push(typeof value === "number" ? value : null);
    }
    const format = formats.length === 0 ? undefined : formats[index % formats.length];
    series.push({
      name: seriesNameOf(output, col),
      values,
      categories,
      numberFormats: values.map(() => format ?? null),
      categoryFormats: categories.map(() => null),
      numberLocale: null,
      truncated: dataRows > rowCount,
      referenceError: false,
    });
  }
  return { chart, series };
}
