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

/** Charts of `chartWorkbook`: `SALES` reads amounts in A1:A3, `NOTES` reads only B1:B3. */
export const SALES: ChartRef = { sheet: "s", id: "sales" };
export const NOTES: ChartRef = { sheet: "s", id: "notes" };

function chart({ id }: ChartRef, kind: ChartKind, col: number): ChartDefinition {
  return {
    id,
    kind,
    anchor: { row: 0, col: 1 - col, offsetX: 0, offsetY: 0, width: 320, height: 200 },
    series: [{ values: { sheet: "s", start: { row: 0, col }, end: { row: 2, col } } }],
  };
}

/** One sheet `s` with an amount column, a text column, and the `SALES` and `NOTES` charts. */
export function chartWorkbook(): Workbook {
  const columns = [
    { key: "amount", header: "Amount", width: 80, type: "number" as const },
    { key: "note", header: "Note", width: 80, type: "text" as const },
  ];
  const charts = [chart(SALES, "column", 0), chart(NOTES, "line", 1)];
  return { activeSheet: "s", sheets: [{ id: "s", name: "Sales", rowCount: 3, columns, charts }] };
}

/** Write one literal on sheet `s`; the edit must apply. */
export function setCell(store: SheetwriteStore, row: number, col: number, value: number): void {
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
    categoryLevels: [],
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
  fields: Partial<ChartDefinition> = {},
): ChartView {
  return { chart: { ...chart({ sheet: "s", id: "view" }, kind, 0), ...fields }, series };
}
