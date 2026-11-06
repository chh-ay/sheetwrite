import type {
  CellStyle,
  MergeRange,
  Sheet,
  Store,
  Workbook,
  WorkbookSnapshot,
} from "@sheetwrite/core";

import { assertResource, checkAbort, type XlsxCodecContext } from "./resources.js";
import {
  streamWorkbook,
  writeWorkbook,
  type AbsoluteCell,
  type WorkbookWriteHook,
} from "./writer.js";

const WINDOW_CELLS = 64 * 1024;
const WINDOW_ROWS = 4096;

/**
 * The active sheet as a table: its visible columns, with a header row above
 * the cells. Output row 0 is the header and output columns count only
 * visible ones.
 */
export interface TableProjection {
  readonly sheet: Sheet;
  /** Source index of each output column. */
  readonly columns: readonly number[];
  /** Merges in output coordinates, clipped to visible columns and sheet rows, by first row. */
  readonly merges: readonly MergeRange[];
}

/** Project the active sheet, or undefined for a workbook without sheets. */
export function projectTable(
  workbook: Workbook,
  context: XlsxCodecContext,
): TableProjection | undefined {
  const sheet =
    workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
    workbook.sheets[0];
  if (!sheet) return undefined;

  const columns = sheet.columns.flatMap((column, index) =>
    column.visible === false ? [] : [index],
  );
  assertResource(context, "maxRowsPerSheet", sheet.rowCount + 1);
  assertResource(context, "maxColumnsPerSheet", columns.length);
  assertResource(context, "maxCells", (sheet.rowCount + 1) * columns.length);

  const output_columns = new Int32Array(sheet.columns.length).fill(-1);
  columns.forEach((column, index) => {
    output_columns[column] = index;
  });
  const merges: MergeRange[] = [];
  for (const merge of sheet.merges ?? []) {
    const anchor = output_columns[merge.c0] ?? -1;
    if (anchor < 0 || merge.r0 < 0 || merge.r0 >= sheet.rowCount) continue;
    let end = anchor;
    while (end + 1 < columns.length && (columns[end + 1] ?? Infinity) <= merge.c1) end++;
    merges.push({
      r0: merge.r0 + 1,
      r1: Math.min(merge.r1, sheet.rowCount - 1) + 1,
      c0: anchor,
      c1: end,
    });
  }
  assertResource(context, "maxMerges", merges.length);
  merges.sort((left, right) => left.r0 - right.r0);

  return { sheet, columns, merges };
}

/**
 * Every output row of a projected table: the header, then each sheet row with
 * the cells that hold a value or a style, read in bounded windows. Cells that
 * a merge covers are left out; the merge anchor stays.
 */
export function* projectedRows(
  projection: TableProjection,
  store: Store,
  context: XlsxCodecContext,
): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
  const { sheet, columns, merges } = projection;
  const header = columns.map((source, col): AbsoluteCell => {
    const column = sheet.columns[source];
    return {
      row: 0,
      col,
      source: {
        rowOffset: 0,
        colOffset: col,
        value: { kind: "literal", value: column?.header ?? "" },
        ...(column?.headerStyle ? { style: column.headerStyle } : {}),
      },
    };
  });
  yield { row: 0, cells: header };

  const window_rows = Math.min(
    WINDOW_ROWS,
    Math.max(1, Math.floor(WINDOW_CELLS / Math.max(1, columns.length))),
  );
  const covered = new Uint8Array(columns.length);
  let next_merge = 0;
  let active_merges: MergeRange[] = [];
  const expected_rows = sheet.rowCount;
  const expected_columns = sheet.columns.length;
  for (let start = 0; start < expected_rows; start += window_rows) {
    checkAbort(context);
    const end = Math.min(expected_rows, start + window_rows);
    const live = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet.id);
    if (live?.rowCount !== expected_rows || live.columns.length !== expected_columns) {
      throw new TypeError("Sheetwrite: table changed during streaming XLSX export");
    }

    const window = store.getVisibleWindow(sheet.id, { start, end }, columns);
    for (let row = start; row < end; row++) {
      const output_row = row + 1;
      covered.fill(0);
      active_merges = active_merges.filter((merge) => merge.r1 >= output_row);
      while (next_merge < merges.length) {
        const merge = merges[next_merge];
        if (!merge || merge.r0 > output_row) break;
        active_merges.push(merge);
        next_merge++;
      }
      for (const merge of active_merges)
        covered.fill(1, merge.c0 + (merge.r0 === output_row ? 1 : 0), merge.c1 + 1);

      const cells: AbsoluteCell[] = [];
      columns.forEach((source, col) => {
        if (covered[col]) return;
        const flat = (row - start) * columns.length + col;
        const style: CellStyle = {
          ...sheet.columns[source]?.cellStyle,
          ...window.styles[window.styleIds[flat] ?? 0],
        };
        const value = window.values[flat] ?? null;
        if (value === null && Object.keys(style).length === 0) return;
        cells.push({
          row: output_row,
          col,
          source: {
            rowOffset: output_row,
            colOffset: col,
            value: { kind: "literal", value },
            ...(Object.keys(style).length > 0 ? { style } : {}),
          },
        });
      });
      yield { row: output_row, cells };
    }
  }
}

/** The one-sheet workbook the writer streams for a projected table. */
function table_source(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): { snapshot: WorkbookSnapshot; hook: WorkbookWriteHook } | undefined {
  const projection = projectTable(workbook, context);
  return projection ? projection_source(projection, store, context) : undefined;
}

function projection_source(
  projection: TableProjection,
  store: Store,
  context: XlsxCodecContext,
): { snapshot: WorkbookSnapshot; hook: WorkbookWriteHook } {
  const { sheet, columns, merges } = projection;
  const row_meta: NonNullable<WorkbookSnapshot["sheets"][number]["rowMeta"]> = [];
  for (const [row, height] of sheet.rowHeights ?? []) {
    if (row >= 0 && row < sheet.rowCount) row_meta.push([row + 1, { height }]);
  }
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    workbook: { activeSheet: "table" },
    sheets: [
      {
        id: "table",
        name: sheet.name,
        order: 0,
        rowCount: sheet.rowCount + 1,
        columns: columns.map((source, index) => {
          const column = sheet.columns[source];
          return {
            key: `column${index + 1}`,
            header: `Column ${index + 1}`,
            width: column?.width ?? 0,
            type: "text" as const,
            ...(column?.numberFormat ? { numberFormat: column.numberFormat } : {}),
          };
        }),
        cells: [],
        merges: [...merges],
        rowMeta: row_meta,
      },
    ],
  };

  function* rows(): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
    for (const output of projectedRows(projection, store, context)) {
      const source_row = output.row - 1;
      if (output.row === 0 || output.cells.length > 0 || sheet.rowHeights?.has(source_row)) {
        yield output;
      }
    }
  }
  return { snapshot, hook: { cellRows: rows } };
}

export async function writeTable(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): Promise<Uint8Array> {
  const source = table_source(workbook, store, context);
  return source ? writeWorkbook(source.snapshot, context, () => source.hook) : new Uint8Array(0);
}

export async function* streamTable(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): AsyncGenerator<Uint8Array> {
  const source = table_source(workbook, store, context);
  if (source) yield* streamWorkbook(source.snapshot, context, () => source.hook);
}
