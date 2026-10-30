import type {
  CellScalar,
  CellStyle,
  Store,
  Workbook,
  XlsxTableExportBackend,
  XlsxWorkbookOptions,
} from "@sheetwrite/core";

import { assertResource, createCodecContext, xlsxFailure } from "./resources.js";
import { streamTable, writeTable } from "./table-stream.js";

/** Implementation-neutral cell in the first-sheet table export model. */
export interface XlsxModelCell {
  value: CellScalar;
  style?: CellStyle;
  numberFormat?: string;
  columnSpan?: number;
  rowSpan?: number;
}

/** Implementation-neutral first-sheet table export model. */
export interface XlsxModel {
  sheetName: string;
  columnWidths: number[];
  rowHeights: (number | undefined)[];
  rows: (XlsxModelCell | null)[][];
}

/** Build the active-sheet table model used by the bounded OOXML writer. */
export function buildXlsxModel(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): XlsxModel | null {
  const sheet =
    workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
    workbook.sheets[0];
  if (!sheet) return null;
  const context = createCodecContext("export", options);
  const visibleColumns: number[] = [];
  for (let col = 0; col < sheet.columns.length; col++) {
    if (sheet.columns[col]!.visible !== false) visibleColumns.push(col);
  }
  assertResource(context, "maxRowsPerSheet", sheet.rowCount + 1);
  assertResource(context, "maxColumnsPerSheet", visibleColumns.length);
  assertResource(context, "maxCells", (sheet.rowCount + 1) * visibleColumns.length);
  const columnCount = visibleColumns.length;
  const view = store.getVisibleWindow(sheet.id, { start: 0, end: sheet.rowCount }, visibleColumns);
  const outputColumn = new Map(visibleColumns.map((col, index) => [col, index]));
  const mergeByAnchor = new Map<number, { columnSpan: number; rowSpan: number }>();
  const covered = new Set<number>();
  for (const merge of sheet.merges ?? []) {
    const anchorCol = outputColumn.get(merge.c0);
    if (anchorCol === undefined || merge.r0 < 0 || merge.r0 >= sheet.rowCount) continue;
    const spanColumns = visibleColumns.filter((col) => col >= merge.c0 && col <= merge.c1);
    if (spanColumns.length === 0) continue;
    const rowSpan = Math.min(merge.r1, sheet.rowCount - 1) - merge.r0 + 1;
    mergeByAnchor.set(merge.r0 * columnCount + anchorCol, {
      columnSpan: spanColumns.length,
      rowSpan,
    });
    for (let row = merge.r0; row < merge.r0 + rowSpan; row++) {
      for (const col of spanColumns) {
        const visible = outputColumn.get(col)!;
        if (row !== merge.r0 || visible !== anchorCol) covered.add(row * columnCount + visible);
      }
    }
  }
  const rows: (XlsxModelCell | null)[][] = [
    visibleColumns.map((col) => {
      const column = sheet.columns[col]!;
      return {
        value: column.header,
        ...(column.headerStyle ? { style: structuredClone(column.headerStyle) } : {}),
      };
    }),
  ];
  for (let row = 0; row < sheet.rowCount; row++) {
    const output: (XlsxModelCell | null)[] = new Array(columnCount);
    for (let visibleCol = 0; visibleCol < columnCount; visibleCol++) {
      const flat = row * columnCount + visibleCol;
      if (covered.has(flat)) {
        output[visibleCol] = null;
        continue;
      }
      const column = sheet.columns[visibleColumns[visibleCol]!]!;
      const mergedStyle = { ...column.cellStyle, ...view.styles[view.styleIds[flat] ?? 0] };
      const numberFormat = mergedStyle.numberFormat ?? column.numberFormat;
      const value = view.values[flat] ?? null;
      const merge = mergeByAnchor.get(flat);
      output[visibleCol] =
        value === null && Object.keys(mergedStyle).length === 0 && !merge
          ? null
          : {
              value,
              ...(Object.keys(mergedStyle).length > 0 ? { style: mergedStyle } : {}),
              ...(numberFormat ? { numberFormat } : {}),
              ...(merge ?? {}),
            };
    }
    rows.push(output);
  }
  return {
    sheetName: sheet.name,
    columnWidths: visibleColumns.map((col) => sheet.columns[col]!.width),
    rowHeights: [
      undefined,
      ...Array.from({ length: sheet.rowCount }, (_unused, row) => sheet.rowHeights?.get(row)),
    ],
    rows,
  };
}

/** Default bounded first-sheet table export backend. */
export const sheetwriteTableExportBackend: XlsxTableExportBackend = {
  name: "sheetwrite-ooxml-table",
  async toXlsxTable(workbook, store, options) {
    try {
      return writeTable(workbook, store, createCodecContext("export", options));
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml-table");
    }
  },
  async *toXlsxTableStream(workbook, store, options) {
    try {
      yield* streamTable(workbook, store, createCodecContext("export", options));
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml-table");
    }
  },
};
