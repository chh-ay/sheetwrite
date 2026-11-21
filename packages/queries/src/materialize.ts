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

/**
 * Writes the cell at `row` of a mixed column into `values` and `styleIds` at
 * `offset`, and returns the error code of an error cell.
 */
function writeMixedCell(
  column: Extract<QueryColumn, { type: "mixed" }>,
  row: number,
  values: CellScalar[],
  styleIds: number[],
  offset: number,
): string | undefined {
  const index = column.indexes[row] ?? 0;

  switch (column.tags[row]) {
    case TAG_NUMBER:
      values[offset] = column.numbers[index] ?? null;
      return undefined;
    case TAG_LOGICAL:
      values[offset] = bit(column.logical, index);
      return undefined;
    case TAG_TEXT:
      values[offset] = text(column.text, column.offsets, index);
      return undefined;
    case TAG_DATE:
      values[offset] = dateSerial(column.dates[index] ?? 0);
      styleIds[offset] = STYLE_DATE;
      return undefined;
    case TAG_DATE_TIME:
      values[offset] = dateTimeSerial(column.dateTimes[index] ?? 0n);
      styleIds[offset] = STYLE_DATE_TIME;
      return undefined;
    case TAG_ERROR:
      return column.errorPool[index] ?? "";
    default:
      return undefined;
  }
}

/** Writes the valid cell at `row` of a typed column into `values` and `styleIds` at `offset`. */
function writeTypedCell(
  column: Exclude<QueryColumn, { type: "mixed" }>,
  row: number,
  values: CellScalar[],
  styleIds: number[],
  offset: number,
): void {
  switch (column.type) {
    case "number":
      values[offset] = column.values[row] ?? null;
      return;
    case "logical":
      values[offset] = bit(column.values, row);
      return;
    case "text":
      values[offset] = text(column.bytes, column.offsets, row);
      return;
    case "date":
      values[offset] = dateSerial(column.values[row] ?? 0);
      styleIds[offset] = STYLE_DATE;
      return;
    case "dateTime":
      values[offset] = dateTimeSerial(column.values[row] ?? 0n);
      styleIds[offset] = STYLE_DATE_TIME;
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
      let error: string | undefined;

      if (column.type === "mixed") {
        error = writeMixedCell(column, row, values, styleIds, offset);
      } else if (column.errorRows[nextError] === row) {
        error = column.errorPool[column.errorCodes[nextError] ?? 0] ?? "";
        nextError += 1;
      } else if (bit(column.validity, row)) {
        writeTypedCell(column, row, values, styleIds, offset);
      }

      if (error !== undefined) {
        formulas.push([offset, WORKSHEET_ERRORS[error] ?? DEFAULT_WORKSHEET_ERROR]);
      }
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
