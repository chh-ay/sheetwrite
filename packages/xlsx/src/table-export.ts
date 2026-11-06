import type {
  CellScalar,
  CellStyle,
  Store,
  Workbook,
  XlsxTableExportBackend,
  XlsxWorkbookOptions,
} from "@sheetwrite/core";

import { createCodecContext, xlsxFailure } from "./resources.js";
import { projectedRows, projectTable, streamTable, writeTable } from "./table-stream.js";

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

/** Materialize the active-sheet table model from the projection the bounded writer streams. */
export function buildXlsxModel(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): XlsxModel | null {
  const context = createCodecContext("export", options);
  const projection = projectTable(workbook, context);
  if (!projection) return null;

  const { sheet, columns, merges } = projection;
  const rows: (XlsxModelCell | null)[][] = [];
  for (const { row, cells } of projectedRows(projection, store, context)) {
    const output = new Array<XlsxModelCell | null>(columns.length).fill(null);
    for (const cell of cells) {
      const value = cell.source.value.kind === "literal" ? cell.source.value.value : null;
      const style = cell.source.style;
      if (row === 0) {
        output[cell.col] = { value, ...(style ? { style: structuredClone(style) } : {}) };
        continue;
      }

      const numberFormat =
        style?.numberFormat ?? sheet.columns[columns[cell.col] ?? -1]?.numberFormat;
      output[cell.col] = {
        value,
        ...(style ? { style } : {}),
        ...(numberFormat ? { numberFormat } : {}),
      };
    }
    rows.push(output);
  }

  // A merge anchor is a model cell even when it is empty.
  for (const merge of merges) {
    const row = rows[merge.r0];
    if (!row) continue;
    const numberFormat = sheet.columns[columns[merge.c0] ?? -1]?.numberFormat;
    row[merge.c0] = {
      ...(row[merge.c0] ?? { value: null, ...(numberFormat ? { numberFormat } : {}) }),
      columnSpan: merge.c1 - merge.c0 + 1,
      rowSpan: merge.r1 - merge.r0 + 1,
    };
  }

  return {
    sheetName: sheet.name,
    columnWidths: columns.map((col) => sheet.columns[col]?.width ?? 0),
    rowHeights: [
      undefined,
      ...Array.from({ length: sheet.rowCount }, (_unused, row) => sheet.rowHeights?.get(row)),
    ],
    rows,
  };
}

/** Default bounded first-sheet table export backend. */
export const sheetwriteTableExportBackend: XlsxTableExportBackend &
  Required<Pick<XlsxTableExportBackend, "toXlsxTableStream">> = {
  name: "sheetwrite-ooxml-table",
  async toXlsxTable(workbook, store, options) {
    try {
      return await writeTable(workbook, store, createCodecContext("export", options));
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml-table", options?.signal);
    }
  },
  async *toXlsxTableStream(workbook, store, options) {
    try {
      yield* streamTable(workbook, store, createCodecContext("export", options));
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml-table", options?.signal);
    }
  },
};
