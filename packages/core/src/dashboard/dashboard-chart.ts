// Chart views over dashboard pivots (#231). As an Excel PivotChart does, the
// row items are the categories and each value field, for each column item, is
// one series. The view reads the item's hidden pivot, which has no subtotals
// or totals and one label column per row field, so the chart never shows a
// total as a point.

import { MAX_CHART_POINTS, MAX_CHART_SERIES } from "../chart-definition.js";
import type { CellScalar } from "../types/cell.js";
import type {
  ChartCategoryLevel,
  ChartDefinition,
  ChartSeriesView,
  ChartView,
} from "../types/chart.js";

/** One pivot output from the engine, decoded: cells in row-major order and the layout counts. */
export interface PivotOutputRead {
  readonly cells: CellScalar[];
  readonly rows: number;
  readonly cols: number;
  readonly headerRows: number;
  readonly labelCols: number;
}

/** Text of a header cell; blanks are empty. */
function labelText(value: CellScalar | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * The categories of the data rows: the last row field labels each point, and
 * each outer row field is one outer level, outermost first, as a PivotChart
 * draws multi-level category labels. An outer item labels the first row of
 * its group, and the other rows of the group are `null`. Tabular layout
 * leaves a repeated outer label blank, so each label column carries its last
 * label down; a group also starts where an outer group starts.
 */
function categoriesOf(
  output: PivotOutputRead,
  rowCount: number,
): { categories: CellScalar[]; categoryLevels: ChartCategoryLevel[] } {
  const outerCount = Math.max(0, output.labelCols - 1);
  const carried: CellScalar[] = Array.from({ length: output.labelCols }, () => null);
  const categories: CellScalar[] = [];
  const categoryLevels: ChartCategoryLevel[] = Array.from({ length: outerCount }, () => ({
    labels: [],
    formats: [],
  }));

  for (let index = 0; index < rowCount; index += 1) {
    const row = output.headerRows + index;
    let starts = index === 0;
    for (let col = 0; col < output.labelCols; col += 1) {
      const value = output.cells[row * output.cols + col] ?? null;
      if (value !== null && value !== carried[col]) {
        carried[col] = value;
        starts = true;
      }

      const level = categoryLevels[col];
      if (level === undefined) continue;
      level.labels.push(starts ? (carried[col] ?? null) : null);
      level.formats.push(null);
    }
    categories.push(carried[outerCount] ?? null);
  }
  return { categories, categoryLevels };
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
 * With `chart.pivotValues`, only the data columns of those value fields are
 * series. A missing output gives a chart with no series.
 */
export function pivotChartView(
  chart: ChartDefinition,
  output: PivotOutputRead | null,
  formats: readonly (string | undefined)[],
): ChartView {
  if (output === null || output.rows <= output.headerRows) return { chart, series: [] };

  const dataRows = output.rows - output.headerRows;
  const rowCount = Math.min(dataRows, MAX_CHART_POINTS);
  const { categories, categoryLevels } = categoriesOf(output, rowCount);
  const plotted = chart.pivotValues;
  const series: ChartSeriesView[] = [];
  for (let index = 0; index < output.cols - output.labelCols; index += 1) {
    if (series.length === MAX_CHART_SERIES) break;
    const slot = formats.length === 0 ? index : index % formats.length;
    if (plotted !== undefined && !plotted.includes(slot)) continue;
    const col = output.labelCols + index;
    const values: Array<number | null> = [];
    for (let row = output.headerRows; row < output.headerRows + rowCount; row += 1) {
      const value = output.cells[row * output.cols + col];
      values.push(typeof value === "number" ? value : null);
    }
    const format = formats[slot];
    series.push({
      name: seriesNameOf(output, col),
      values,
      categories,
      categoryLevels,
      numberFormats: values.map(() => format ?? null),
      categoryFormats: categories.map(() => null),
      numberLocale: null,
      truncated: dataRows > rowCount,
      referenceError: false,
    });
  }
  return { chart, series };
}
