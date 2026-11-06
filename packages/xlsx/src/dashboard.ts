// Dashboards in XLSX (#231). Excel has no dashboard sheet, so the export
// writes each dashboard as a worksheet of its current values: one worksheet
// column per grid column and one row per grid row. Each item writes its
// caption and values at the top-left of its box, and a chart item writes a
// native chart over its box that reads the values written for its pivot, or
// holds literal data when no written cells hold them. The dashboard itself
// stays in the Sheetwrite metadata sheet, so Sheetwrite opens it as a
// dashboard again.

import type {
  CellScalar,
  ChartDefinition,
  ChartView,
  DashboardExport,
  DashboardItemExport,
  SheetSnapshot,
  SnapshotCell,
} from "@sheetwrite/core";

import type { PivotCells } from "./chart-cells.js";
import type { PivotChartData } from "./chart-write.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";

/** Columns of the dashboard grid; Sheetwrite's layout has 12. */
const GRID_COLUMNS = 12;
/** Width of one worksheet column that stands for a grid column, in pixels. */
const COLUMN_WIDTH = 100;
/** Excel's default row height, in pixels; the chart height follows it. */
const ROW_HEIGHT = 20;

/** A dashboard as a static worksheet, and the data of its charts by chart ID. */
export interface StaticDashboard {
  readonly sheet: SheetSnapshot;
  readonly charts: ReadonlyMap<string, PivotChartData>;
}

/** The cell of one item value, with its number format or, in the caption row, bold text. */
export function staticCell(
  row: number,
  col: number,
  value: CellScalar,
  format: string | null,
  caption: boolean,
): SnapshotCell {
  const style = format !== null ? { numberFormat: format } : caption ? { bold: true } : undefined;
  return {
    rowOffset: row,
    colOffset: col,
    value: { kind: "literal", value },
    ...(style ? { style } : {}),
  };
}

/**
 * Whether the values of `content` fit in a box of `w` × `h` grid cells.
 * Larger output is written in full, with a warning.
 */
function fitsBox(content: DashboardItemExport, w: number, h: number): boolean {
  return content.cells.length <= h && content.cells.every((row) => row.length <= w);
}

/**
 * The static worksheet of dashboard `sheet` from the content that core
 * computed. Without content, as for a plain snapshot, the worksheet is empty.
 * A cell that two items write keeps the first item's value.
 */
export function staticDashboard(
  sheet: SheetSnapshot,
  content: DashboardExport | undefined,
  context: XlsxCodecContext,
): StaticDashboard {
  const cells = new Map<number, SnapshotCell>();
  // The values of each pivot item and its box, so a chart over that pivot can read them.
  const pivotCells = new Map<string, PivotCells>();
  const views: ChartView[] = [];
  const chartDefinitions: ChartDefinition[] = [];
  let rowCount = 1;
  let colCount = GRID_COLUMNS;
  for (const item of sheet.dashboard?.items ?? []) {
    rowCount = Math.max(rowCount, item.box.y + item.box.h);
    const exported = content?.items.find((candidate) => candidate.id === item.id);
    if (exported === undefined) continue;
    if (!fitsBox(exported, item.box.w, item.box.h)) {
      emitWarning(context, {
        code: "format-loss",
        message: `Dashboard item ${item.id} has more values than its box; all of them were written from the top-left of the box`,
        sheet: sheet.name,
      });
    }

    for (const [row, values] of exported.cells.entries()) {
      for (const [col, value] of values.entries()) {
        const format = exported.numberFormats[row]?.[col] ?? null;
        if (value === null && format === null) continue;
        const target = { row: item.box.y + row, col: item.box.x + col };
        rowCount = Math.max(rowCount, target.row + 1);
        colCount = Math.max(colCount, target.col + 1);
        const offset = target.row * 0x4000 + target.col;
        if (cells.has(offset)) continue;
        cells.set(offset, staticCell(target.row, target.col, value, format, row === 0));
      }
    }

    if (item.kind === "pivot" && !pivotCells.has(item.pivot)) {
      pivotCells.set(item.pivot, {
        cells: exported.cells,
        origin: { row: item.box.y, col: item.box.x },
      });
    }

    if (exported.chart !== undefined) {
      const { pivot: _pivot, ...chart } = exported.chart.chart;
      chartDefinitions.push({
        ...chart,
        anchor: {
          row: item.box.y,
          col: item.box.x,
          offsetX: 0,
          offsetY: 0,
          width: item.box.w * COLUMN_WIDTH,
          height: item.box.h * ROW_HEIGHT,
        },
        series: [],
      });
      views.push(exported.chart);
    }
  }

  const charts = new Map<string, PivotChartData>();
  for (const view of views) {
    const written = view.chart.pivot === undefined ? undefined : pivotCells.get(view.chart.pivot);
    charts.set(view.chart.id, written === undefined ? { view } : { view, cells: written });
  }
  return {
    sheet: {
      id: sheet.id,
      name: sheet.name,
      order: sheet.order,
      ...(sheet.visibility ? { visibility: sheet.visibility } : {}),
      rowCount,
      columns: Array.from({ length: colCount }, (_, col) => ({
        key: `column${col + 1}`,
        header: "",
        width: COLUMN_WIDTH,
        type: "text" as const,
      })),
      ...(chartDefinitions.length > 0 ? { charts: chartDefinitions } : {}),
      cells:
        cells.size > 0
          ? [
              {
                startRow: 0,
                startCol: 0,
                rowCount,
                colCount,
                cells: [...cells.entries()]
                  .sort(([left], [right]) => left - right)
                  .map(([, cell]) => cell),
              },
            ]
          : [],
    },
    charts,
  };
}

/** Warn once per export that dashboards are static in Excel. */
export function warnStaticDashboards(context: XlsxCodecContext): void {
  emitWarning(context, {
    code: "unsupported-feature",
    message:
      "Dashboard sheets were written as worksheets of their current values and charts; they are interactive only in Sheetwrite",
  });
}
