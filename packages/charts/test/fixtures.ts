import { expect } from "bun:test";

import type {
  ChartDefinition,
  ChartKind,
  ChartRef,
  ChartSeriesView,
  ChartView,
  SheetwriteStore,
  Workbook,
} from "@sheetwrite/core";

/** The chart that `chartWorkbook` defines: amounts in A1:A3 of sheet `s`. */
export const SALES: ChartRef = { sheet: "s", id: "sales" };

/** One sheet `s` with an amount column, a text column, and the `SALES` chart. */
export function chartWorkbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Sales",
        rowCount: 3,
        columns: [
          { key: "amount", header: "Amount", width: 80, type: "number" },
          { key: "note", header: "Note", width: 80, type: "text" },
        ],
        charts: [
          {
            id: SALES.id,
            kind: "column",
            anchor: { row: 0, col: 1, offsetX: 0, offsetY: 0, width: 320, height: 200 },
            series: [
              {
                name: "Amount",
                values: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Write one literal on sheet `s`; the edit must apply. */
export function setCell(
  store: SheetwriteStore,
  row: number,
  col: number,
  value: number | string,
): void {
  const result = store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: "s", row, col }, value: { kind: "literal", value } }],
  });
  expect(result.status).toBe("applied");
}

/** A resolved series for renderer tests; formats default to `null` (General). */
export function seriesView(
  name: string,
  values: Array<number | null>,
  fields: Partial<ChartSeriesView> = {},
): ChartSeriesView {
  return {
    name,
    values,
    categories: [],
    numberFormats: values.map(() => null),
    categoryFormats: [],
    numberLocale: null,
    truncated: false,
    referenceError: false,
    ...fields,
  };
}

/** A chart view of `kind` over `series`, without titles; `chart` overrides definition fields. */
export function chartView(
  kind: ChartKind,
  series: ChartSeriesView[],
  chart: Partial<ChartDefinition> = {},
): ChartView {
  return {
    chart: {
      id: "view",
      kind,
      anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 400, height: 300 },
      series: [],
      ...chart,
    },
    series,
  };
}
