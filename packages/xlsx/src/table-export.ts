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
  /** The cell's value; `null` for a cell that only carries a style or anchors a merge. */
  value: CellScalar;
  /** Header cells carry the column's header style; other cells their column's cell style under their own. */
  style?: CellStyle;
  /** Excel number-format code, from the cell's style or else its column; never set on header cells. */
  numberFormat?: string;
  /** Columns a merge anchored at this cell spans, this one included; absent outside merges. */
  columnSpan?: number;
  /** Rows a merge anchored at this cell spans, this one included; absent outside merges. */
  rowSpan?: number;
}

/** Implementation-neutral first-sheet table export model. */
export interface XlsxModel {
  /** Name of the exported sheet: the active one, or else the first. */
  sheetName: string;
  /** Width of each visible column in unzoomed CSS pixels, left to right; `0` when the column has none. */
  columnWidths: number[];
  /** Height of each output row in unzoomed CSS pixels, header row first; `undefined` keeps the default height. */
  rowHeights: (number | undefined)[];
  /**
   * Cells by output row, then by visible column: the header row first, then one
   * row per sheet row. `null` marks an empty cell or one a merge covers.
   */
  rows: (XlsxModelCell | null)[][];
}

/**
 * Materialize the active-sheet table model from the projection the bounded writer streams.
 *
 * @throws {@link XlsxResourceError} when the table exceeds a row, column, cell or merge limit.
 * @returns The table, or `null` for a workbook with no sheets.
 */
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

      const number_format =
        style?.numberFormat ?? sheet.columns[columns[cell.col] ?? -1]?.numberFormat;
      output[cell.col] = {
        value,
        ...(style ? { style } : {}),
        ...(number_format ? { numberFormat: number_format } : {}),
      };
    }
    rows.push(output);
  }

  // A merge anchor is a model cell even when it is empty.
  for (const merge of merges) {
    const row = rows[merge.r0];
    if (!row) continue;
    const number_format = sheet.columns[columns[merge.c0] ?? -1]?.numberFormat;
    row[merge.c0] = {
      ...(row[merge.c0] ?? {
        value: null,
        ...(number_format ? { numberFormat: number_format } : {}),
      }),
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
