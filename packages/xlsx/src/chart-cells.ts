// Where a chart over a pivot finds its points in the written workbook (#501).
// A PivotChart in Excel reads ranges of its PivotTable's cells, so the export
// points the chart's references at the cells that hold the pivot's values:
// the output of a worksheet pivot at its anchor, or a dashboard pivot item's
// values in its box. The points are found by their values, so a reference
// never names cells that hold other data.

import type { CellScalar, ChartSeriesView, ChartView } from "@sheetwrite/core";

/** Cells of the written workbook that can hold a chart's points. */
export interface PivotCells {
  /** Rows of values from `origin`. */
  readonly cells: readonly (readonly CellScalar[])[];
  /** The worksheet cell of `cells[0][0]`. */
  readonly origin: { readonly row: number; readonly col: number };
  /**
   * The name of the native Excel PivotTable whose output `cells` are. The
   * chart is then an Excel PivotChart of that table.
   */
  readonly pivotTable?: string;
}

/** The cells of a chart's points, in worksheet coordinates. */
export interface PointCells {
  /** The worksheet row of each point. */
  readonly rows: readonly number[];
  /** The first and last worksheet column of the category labels; the last holds the inner labels. */
  readonly labelCols: readonly [number, number];
  /** The worksheet column of each series' values. */
  readonly valueCols: readonly number[];
  /**
   * Whether the points fill the rows from the first to the last, with each
   * outer label in the column left of its inner level, as a tabular pivot
   * without subtotals writes them. Excel then reads the same points from the
   * cells; otherwise only a PivotChart reads them, from its PivotTable.
   */
  readonly contiguous: boolean;
}

function cellAt(cells: PivotCells["cells"], row: number, col: number): CellScalar {
  return cells[row]?.[col] ?? null;
}

/** The rows, from `start`, whose cells in `col` hold each category in order; null when one is missing. */
function categoryRows(
  cells: PivotCells["cells"],
  start: number,
  col: number,
  categories: ChartSeriesView["categories"],
): number[] | null {
  const rows: number[] = [];
  let row = start;
  for (const category of categories) {
    while (row < cells.length && cellAt(cells, row, col) !== category) row += 1;
    if (row === cells.length) return null;
    rows.push(row);
    row += 1;
  }
  return rows;
}

/**
 * The column from `from` whose cells in `rows` hold the values of `series`;
 * a gap is a cell without a number. Of several such columns, the one headed
 * by the series name wins, as a pivot writes it above its data.
 */
function valueCol(
  cells: PivotCells["cells"],
  rows: readonly number[],
  series: ChartSeriesView,
  from: number,
  width: number,
): number | null {
  let found: number | null = null;
  for (let col = from; col < width; col += 1) {
    const matches = rows.every((row, index) => {
      const cell = cellAt(cells, row, col);
      return (series.values[index] ?? null) === (typeof cell === "number" ? cell : null);
    });
    if (!matches) continue;
    if (String(cellAt(cells, (rows[0] ?? 0) - 1, col)) === series.name) return col;
    found ??= col;
  }
  return found;
}

/** Whether each outer level sits in its own column left of `innerCol`, blank where its group continues. */
function levelsBeside(
  cells: PivotCells["cells"],
  rows: readonly number[],
  innerCol: number,
  series: ChartSeriesView,
): boolean {
  const levels = series.categoryLevels;
  return levels.every((level, depth) => {
    const col = innerCol - levels.length + depth;
    return col >= 0 && rows.every((row, index) => cellAt(cells, row, col) === level.labels[index]);
  });
}

/**
 * The cells of the points of `view` in `source`, or null when the cells do
 * not hold them all. Each series' values must be in one column, at the rows
 * of the categories.
 */
export function locatePoints(view: ChartView, source: PivotCells): PointCells | null {
  const first = view.series[0];
  if (first === undefined || first.categories.length === 0) return null;

  const { cells, origin } = source;
  const width = Math.max(0, ...cells.map((row) => row.length));
  const outer = first.categoryLevels.length;
  for (let start = 0; start < cells.length; start += 1) {
    for (let col = 0; col < width; col += 1) {
      if (cellAt(cells, start, col) !== first.categories[0]) continue;
      const rows = categoryRows(cells, start, col, first.categories);
      if (rows === null) continue;

      // Series follow the pivot's data columns from left to right.
      const valueCols: number[] = [];
      let from = col + 1;
      for (const series of view.series) {
        const found = valueCol(cells, rows, series, from, width);
        if (found === null) break;
        valueCols.push(found);
        from = found + 1;
      }
      if (valueCols.length < view.series.length) continue;

      const filled = (rows.at(-1) ?? 0) - (rows[0] ?? 0) === rows.length - 1;
      const contiguous = filled && levelsBeside(cells, rows, col, first);
      // A tabular pivot writes outer labels left of the inner ones; compact writes them in one column.
      const firstLabel = col >= outer ? col - outer : col;
      return {
        rows: rows.map((row) => origin.row + row),
        labelCols: [origin.col + firstLabel, origin.col + col],
        valueCols: valueCols.map((value) => origin.col + value),
        contiguous,
      };
    }
  }
  return null;
}
