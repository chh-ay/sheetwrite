import type { CellScalar, CellStyle, PackedCellBlock } from "@sheetwrite/core";

import type { QueryBatch, QueryColumn } from "./types.js";

/** A validity byte holds eight rows: index >>> 3 selects the byte, index & 7 the bit. */
const BYTE_SHIFT = 3;
const LOW_BITS = 7;
const MICROS_PER_DAY = 86_400_000_000;

// Excel's 1900 system counts 1899-12-31 as serial 0 and has a synthetic
// 1900-02-29, so dates from 1900-03-01 (day -25508 from the Unix epoch) gain
// one serial day. This matches `dateToSerial` in core.
const SERIAL_OF_EPOCH_BEFORE_LEAP_BUG = 25_568;
const FIRST_DAY_AFTER_LEAP_BUG = -25_508;

// Mixed tags, as documented on `QueryMixedLanes`.
const TAG_NUMBER = 1;
const TAG_LOGICAL = 2;
const TAG_TEXT = 3;
const TAG_DATE = 4;
const TAG_DATE_TIME = 5;
const TAG_ERROR = 6;

// Style table entries for each output cell kind.
const STYLE_PLAIN = 0;
const STYLE_DATE = 1;
const STYLE_DATE_TIME = 2;
const STYLE_TABLE: CellStyle[] = [
  {},
  { numberFormat: "yyyy-mm-dd" },
  { numberFormat: "yyyy-mm-dd hh:mm:ss" },
];

/** Query cell error codes become the worksheet error that Excel shows for the same failure. */
const WORKSHEET_ERRORS: Readonly<Record<string, string>> = {
  conversion: "=#VALUE!",
  "non-finite": "=#NUM!",
};
const DEFAULT_WORKSHEET_ERROR = "=#VALUE!";

const decoder = new TextDecoder("utf-8", { fatal: true });

function bit(bytes: Uint8Array, index: number): boolean {
  return ((bytes[index >>> BYTE_SHIFT] ?? 0) >>> (index & LOW_BITS)) % 2 === 1;
}

function text(bytes: Uint8Array, offsets: Uint32Array, index: number): string {
  return decoder.decode(bytes.subarray(offsets[index] ?? 0, offsets[index + 1] ?? 0));
}

/** Unix-epoch days to a 1900-system worksheet serial. */
function dateSerial(days: number): number {
  return days + SERIAL_OF_EPOCH_BEFORE_LEAP_BUG + (days >= FIRST_DAY_AFTER_LEAP_BUG ? 1 : 0);
}

function dateTimeSerial(micros: bigint): number {
  const value = Number(micros);
  const days = Math.floor(value / MICROS_PER_DAY);

  return dateSerial(days) + (value - days * MICROS_PER_DAY) / MICROS_PER_DAY;
}

interface Cell {
  value: CellScalar;
  style: number;
  error?: string;
}

function mixedCell(column: Extract<QueryColumn, { type: "mixed" }>, row: number): Cell {
  const index = column.indexes[row] ?? 0;

  switch (column.tags[row]) {
    case TAG_NUMBER:
      return { value: column.numbers[index] ?? null, style: STYLE_PLAIN };
    case TAG_LOGICAL:
      return { value: bit(column.logical, index), style: STYLE_PLAIN };
    case TAG_TEXT:
      return { value: text(column.text, column.offsets, index), style: STYLE_PLAIN };
    case TAG_DATE:
      return { value: dateSerial(column.dates[index] ?? 0), style: STYLE_DATE };
    case TAG_DATE_TIME:
      return { value: dateTimeSerial(column.dateTimes[index] ?? 0n), style: STYLE_DATE_TIME };
    case TAG_ERROR:
      return { value: null, style: STYLE_PLAIN, error: column.errorPool[index] ?? "" };
    default:
      return { value: null, style: STYLE_PLAIN };
  }
}

function typedCell(column: QueryColumn, row: number): Cell {
  switch (column.type) {
    case "number":
      return { value: column.values[row] ?? null, style: STYLE_PLAIN };
    case "logical":
      return { value: bit(column.values, row), style: STYLE_PLAIN };
    case "text":
      return { value: text(column.bytes, column.offsets, row), style: STYLE_PLAIN };
    case "date":
      return { value: dateSerial(column.values[row] ?? 0), style: STYLE_DATE };
    case "dateTime":
      return { value: dateTimeSerial(column.values[row] ?? 0n), style: STYLE_DATE_TIME };
    case "mixed":
      return mixedCell(column, row);
  }
}

/**
 * Lays out a header row and the data rows of `batch` as one packed block. Cell
 * errors become worksheet error formulas; dates use worksheet serials with a
 * date format. A result with no rows keeps one empty data row, so the output
 * table keeps its identity.
 */
export function packOutput(batch: QueryBatch): PackedCellBlock {
  const colCount = batch.columns.length;
  const dataRows = Math.max(batch.rowCount, 1);
  const rowCount = dataRows + 1;
  const values: CellScalar[] = new Array(rowCount * colCount).fill(null);
  const styleIds: number[] = new Array(rowCount * colCount).fill(STYLE_PLAIN);
  const formulas: Array<[number, string]> = [];

  batch.columns.forEach((column, col) => {
    values[col] = column.name;

    // Error rows are sorted, so one cursor walks them beside the row loop.
    let nextError = 0;

    for (let row = 0; row < batch.rowCount; row += 1) {
      const offset = (row + 1) * colCount + col;
      let cell: Cell | undefined;

      if (column.type === "mixed") {
        cell = mixedCell(column, row);
      } else if (column.errorRows[nextError] === row) {
        const code = column.errorPool[column.errorCodes[nextError] ?? 0] ?? "";
        nextError += 1;
        cell = { value: null, style: STYLE_PLAIN, error: code };
      } else if (bit(column.validity, row)) {
        cell = typedCell(column, row);
      }

      if (cell === undefined) continue;

      if (cell.error !== undefined) {
        formulas.push([offset, WORKSHEET_ERRORS[cell.error] ?? DEFAULT_WORKSHEET_ERROR]);
        continue;
      }

      values[offset] = cell.value;
      styleIds[offset] = cell.style;
    }
  });

  return {
    rowCount,
    colCount,
    values,
    ...(formulas.length > 0 ? { formulas } : {}),
    styleTable: STYLE_TABLE,
    styleIds,
  };
}
