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
function date_serial(days: number): number {
  return days + SERIAL_OF_EPOCH_BEFORE_LEAP_BUG + (days >= FIRST_DAY_AFTER_LEAP_BUG ? 1 : 0);
}

function date_time_serial(micros: bigint): number {
  const value = Number(micros);
  const days = Math.floor(value / MICROS_PER_DAY);

  return date_serial(days) + (value - days * MICROS_PER_DAY) / MICROS_PER_DAY;
}

/**
 * Writes the cell at `row` of a mixed column into `values` and `style_ids` at
 * `offset`, and returns the error code of an error cell.
 */
function write_mixed_cell(
  column: Extract<QueryColumn, { type: "mixed" }>,
  row: number,
  values: CellScalar[],
  style_ids: number[],
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
      values[offset] = date_serial(column.dates[index] ?? 0);
      style_ids[offset] = STYLE_DATE;
      return undefined;
    case TAG_DATE_TIME:
      values[offset] = date_time_serial(column.dateTimes[index] ?? 0n);
      style_ids[offset] = STYLE_DATE_TIME;
      return undefined;
    case TAG_ERROR:
      return column.errorPool[index] ?? "";
    default:
      return undefined;
  }
}

/** Writes the valid cell at `row` of a typed column into `values` and `style_ids` at `offset`. */
function write_typed_cell(
  column: Exclude<QueryColumn, { type: "mixed" }>,
  row: number,
  values: CellScalar[],
  style_ids: number[],
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
      values[offset] = date_serial(column.values[row] ?? 0);
      style_ids[offset] = STYLE_DATE;
      return;
    case "dateTime":
      values[offset] = date_time_serial(column.values[row] ?? 0n);
      style_ids[offset] = STYLE_DATE_TIME;
  }
}

/**
 * Lays out a header row and the data rows of `batch` as one packed block. Cell
 * errors become worksheet error formulas; dates use worksheet serials with a
 * date format. A result with no rows keeps one empty data row, so the output
 * table keeps its identity.
 */
export function packOutput(batch: QueryBatch): PackedCellBlock {
  const col_count = batch.columns.length;
  const data_rows = Math.max(batch.rowCount, 1);
  const row_count = data_rows + 1;
  const values: CellScalar[] = new Array(row_count * col_count).fill(null);
  const style_ids: number[] = new Array(row_count * col_count).fill(STYLE_PLAIN);
  const formulas: Array<[number, string]> = [];

  batch.columns.forEach((column, col) => {
    values[col] = column.name;

    // Error rows are sorted, so one cursor walks them beside the row loop.
    let next_error = 0;

    for (let row = 0; row < batch.rowCount; row += 1) {
      const offset = (row + 1) * col_count + col;
      let error: string | undefined;

      if (column.type === "mixed") {
        error = write_mixed_cell(column, row, values, style_ids, offset);
      } else if (column.errorRows[next_error] === row) {
        error = column.errorPool[column.errorCodes[next_error] ?? 0] ?? "";
        next_error += 1;
      } else if (bit(column.validity, row)) {
        write_typed_cell(column, row, values, style_ids, offset);
      }

      if (error !== undefined) {
        formulas.push([offset, WORKSHEET_ERRORS[error] ?? DEFAULT_WORKSHEET_ERROR]);
      }
    }
  });

  return {
    rowCount: row_count,
    colCount: col_count,
    values,
    ...(formulas.length > 0 ? { formulas } : {}),
    styleTable: STYLE_TABLE,
    styleIds: style_ids,
  };
}
