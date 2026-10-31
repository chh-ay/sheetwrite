import type { CellStyle, SheetSnapshot, Store, Workbook, WorkbookSnapshot } from "@sheetwrite/core";

import { assertResource, checkAbort, type XlsxCodecContext } from "./resources.js";
import {
  streamWorkbook,
  writeWorkbook,
  type AbsoluteCell,
  type WorkbookWriteHook,
} from "./writer.js";

const WINDOW_CELLS = 64 * 1024;
const WINDOW_ROWS = 4096;

function tableSource(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): { snapshot: WorkbookSnapshot; hook: WorkbookWriteHook } | undefined {
  const activeSheet =
    workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
    workbook.sheets[0];
  if (!activeSheet) return undefined;
  const sheet = activeSheet;
  const visible = sheet.columns.flatMap((column, index) =>
    column.visible === false ? [] : [{ index, column }],
  );
  const columns = visible.map(({ index }) => index);
  assertResource(context, "maxRowsPerSheet", sheet.rowCount + 1);
  assertResource(context, "maxColumnsPerSheet", columns.length);
  assertResource(context, "maxCells", (sheet.rowCount + 1) * columns.length);
  const outputColumns = new Int32Array(sheet.columns.length).fill(-1);
  columns.forEach((column, index) => {
    outputColumns[column] = index;
  });
  const merges: NonNullable<SheetSnapshot["merges"]> = [];
  for (const merge of sheet.merges ?? []) {
    const anchor = outputColumns[merge.c0] ?? -1;
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
  const rowMeta: NonNullable<SheetSnapshot["rowMeta"]> = [];
  for (const [row, height] of sheet.rowHeights ?? []) {
    if (row >= 0 && row < sheet.rowCount) rowMeta.push([row + 1, { height }]);
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
        columns: visible.map(({ column }, index) => ({
          key: `column${index + 1}`,
          header: `Column ${index + 1}`,
          width: column.width,
          type: "text" as const,
          ...(column.numberFormat ? { numberFormat: column.numberFormat } : {}),
        })),
        cells: [],
        merges,
        rowMeta,
      },
    ],
  };
  function* rows(): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
    const header = visible.map(({ column }, col): AbsoluteCell => ({
      row: 0,
      col,
      source: {
        rowOffset: 0,
        colOffset: col,
        value: { kind: "literal", value: column.header },
        ...(column.headerStyle ? { style: column.headerStyle } : {}),
      },
    }));
    yield { row: 0, cells: header };
    const windowRows = Math.min(
      WINDOW_ROWS,
      Math.max(1, Math.floor(WINDOW_CELLS / Math.max(1, columns.length))),
    );
    const covered = new Uint8Array(columns.length);
    let nextMerge = 0;
    let activeMerges: typeof merges = [];
    const expectedRows = sheet.rowCount;
    const expectedColumns = sheet.columns.length;
    for (let start = 0; start < expectedRows; start += windowRows) {
      checkAbort(context);
      const end = Math.min(expectedRows, start + windowRows);
      const live = store.getWorkbook().sheets.find((candidate) => candidate.id === sheet.id);
      if (live?.rowCount !== expectedRows || live.columns.length !== expectedColumns) {
        throw new TypeError("Sheetwrite: table changed during streaming XLSX export");
      }
      const window = store.getVisibleWindow(sheet.id, { start, end }, columns);
      for (let row = start; row < end; row++) {
        const outputRow = row + 1;
        covered.fill(0);
        activeMerges = activeMerges.filter((merge) => merge.r1 >= outputRow);
        while (nextMerge < merges.length) {
          const merge = merges[nextMerge];
          if (!merge || merge.r0 > outputRow) break;
          activeMerges.push(merge);
          nextMerge++;
        }
        for (const merge of activeMerges)
          covered.fill(1, merge.c0 + (merge.r0 === outputRow ? 1 : 0), merge.c1 + 1);
        const cells: AbsoluteCell[] = [];
        for (const [col, { column }] of visible.entries()) {
          if (covered[col]) continue;
          const flat = (row - start) * columns.length + col;
          const style: CellStyle = {
            ...column.cellStyle,
            ...window.styles[window.styleIds[flat] ?? 0],
          };
          const value = window.values[flat] ?? null;
          if (value === null && Object.keys(style).length === 0) continue;
          cells.push({
            row: outputRow,
            col,
            source: {
              rowOffset: outputRow,
              colOffset: col,
              value: { kind: "literal", value },
              ...(Object.keys(style).length > 0 ? { style } : {}),
            },
          });
        }
        if (cells.length > 0 || sheet.rowHeights?.has(row)) yield { row: outputRow, cells };
      }
    }
  }
  return { snapshot, hook: { cellRows: rows } };
}

export function writeTable(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): Uint8Array {
  const source = tableSource(workbook, store, context);
  return source ? writeWorkbook(source.snapshot, context, () => source.hook) : new Uint8Array(0);
}

export function* streamTable(
  workbook: Workbook,
  store: Store,
  context: XlsxCodecContext,
): Generator<Uint8Array> {
  const source = tableSource(workbook, store, context);
  if (source) yield* streamWorkbook(source.snapshot, context, () => source.hook);
}
