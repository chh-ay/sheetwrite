import { SheetwriteError } from "./errors.js";
import { utf8ByteLength, utf8CodePointBytes, utf8CodePointUnits } from "./utf8.js";
/** Resource ceilings shared by synchronous CSV and TSV parsing and encoding. */
export interface DelimitedTextResourceLimits {
  /** Input string size in UTF-8 bytes; defaults to 32 MiB. */
  maxInputBytes: number;
  /** Output string size in UTF-8 bytes, including a BOM; defaults to 64 MiB. */
  maxOutputBytes: number;
  /** Syntactically present records; defaults to 1,000,000. */
  maxRows: number;
  /** Fields in any one record; defaults to 16,384. */
  maxColumns: number;
  /** Aggregate fields across all records; defaults to 1,000,000. */
  maxCells: number;
  /** Decoded UTF-8 bytes in one field; defaults to 1 MiB. */
  maxFieldBytes: number;
  /** Rows fetched by an export writer in one packed store read; defaults to 4,096. */
  maxWriterWindowRows: number;
}

/** Optional resource ceilings for an in-memory delimited-text operation. */
export interface DelimitedTextOptions {
  /** Positive safe-integer overrides merged over `DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS`. */
  resourceLimits?: Partial<DelimitedTextResourceLimits>;
  /**
   * Checked once per chunk of records, store window and long field. After it
   * fires, the operation rejects or throws with `signal.reason`.
   */
  signal?: AbortSignal;
}

/**
 * Synchronous operations return one in-memory string, so byte/cell ceilings
 * bound allocation while sheet-compatible dimensions remain independently valid.
 */
export const DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS: Readonly<DelimitedTextResourceLimits> =
  Object.freeze({
    // Bound the caller-owned string before parser field/row allocations begin.
    maxInputBytes: 32 * 1024 * 1024,
    // Bound the single returned string; exports cannot stream partial output.
    maxOutputBytes: 64 * 1024 * 1024,
    // Preserve the million-row Sheetwrite data contract.
    maxRows: 1_000_000,
    // Preserve the XLSX-compatible worksheet width.
    maxColumns: 16_384,
    // Bound aggregate parser arrays and encoder field work.
    maxCells: 1_000_000,
    // Prevent one quoted field from dominating synchronous memory.
    maxFieldBytes: 1 * 1024 * 1024,
    // Bound each store read even though the final export remains in memory.
    maxWriterWindowRows: 4_096,
  });

/** Phase reported by a typed delimited-text resource failure. */
export type DelimitedTextOperation = "parse" | "import" | "encode" | "export";

/** Stable resource-limit failure raised before the next oversized parse or encode allocation. */
export class DelimitedTextResourceError extends SheetwriteError {
  /** Always `"DelimitedTextResourceError"`. */
  override readonly name = "DelimitedTextResourceError";
  /** Always `"delimited-text-resource-limit"`. */
  declare readonly code: "delimited-text-resource-limit";

  /** Creates the error for one limit reached while reading or writing CSV or TSV. */
  constructor(
    /** The limit that was reached. */
    readonly resource: keyof DelimitedTextResourceLimits,
    /** The limit's value. */
    readonly limit: number,
    /** The amount the text needed, in the limit's unit. */
    readonly actual: number,
    operation: DelimitedTextOperation,
  ) {
    super(
      "delimited-text-resource-limit",
      `delimited-${operation}`,
      `Sheetwrite: delimited-text ${operation} ${resource} limit is ${limit}; observed ${actual}`,
      { context: { format: "delimited-text", resource, limit, actual } },
    );
  }
}

/** Stable invalid-option failure for a delimited-text resource ceiling. */
export class DelimitedTextOptionsError extends SheetwriteError {
  /** Always `"DelimitedTextOptionsError"`. */
  override readonly name = "DelimitedTextOptionsError";
  /** Always `"delimited-text-invalid-limit"`. */
  declare readonly code: "delimited-text-invalid-limit";

  /** Creates the error for one limit option that is not a positive safe integer. */
  constructor(
    /** The limit option that is wrong. */
    readonly resource: keyof DelimitedTextResourceLimits,
    /** The value given for it. */
    readonly value: unknown,
  ) {
    super(
      "delimited-text-invalid-limit",
      "delimited-options",
      `Sheetwrite: delimited-text ${resource} must be a positive safe integer`,
      {
        context: {
          format: "delimited-text",
          resource,
          // Only a number is copied: any other option value can be large host data.
          ...(typeof value === "number" && Number.isFinite(value)
            ? { value }
            : { valueType: typeof value }),
        },
      },
    );
  }
}

const RESOURCE_KEYS = Object.freeze([
  "maxInputBytes",
  "maxOutputBytes",
  "maxRows",
  "maxColumns",
  "maxCells",
  "maxFieldBytes",
  "maxWriterWindowRows",
] as const);

export function resolveDelimitedTextResourceLimits(
  options: DelimitedTextOptions = {},
): Readonly<DelimitedTextResourceLimits> {
  const limits: DelimitedTextResourceLimits = { ...DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS };
  const overrides = options.resourceLimits;
  if (overrides === undefined) return limits;

  for (const resource of RESOURCE_KEYS) {
    const value = overrides[resource];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new DelimitedTextOptionsError(resource, value);
    }
    limits[resource] = value;
  }
  return limits;
}

/** Highest code unit that UTF-8 encodes as a single byte. */
const ASCII_MAX_CODE_UNIT = 0x7f;
/** UTF-16 code unit of a double quote. */
const QUOTE_CODE_UNIT = 0x22;
/** UTF-16 code unit of a carriage return. */
const CARRIAGE_RETURN_CODE_UNIT = 0x0d;
/** UTF-16 code unit of a line feed. */
const LINE_FEED_CODE_UNIT = 0x0a;
/** UTF-16 code unit of a leading byte-order mark. */
const BOM_CODE_UNIT = 0xfeff;
/** Records scanned or encoded between two abort checks; never one check per field. */
const ABORT_CHECK_RECORDS = 1024;

function fail_resource(
  resource: keyof DelimitedTextResourceLimits,
  limit: number,
  actual: number,
  operation: DelimitedTextOperation,
): never {
  throw new DelimitedTextResourceError(resource, limit, actual, operation);
}

/** Validate rectangular dimensions without multiplying beyond the configured cell ceiling. */
export function assertDelimitedTextDimensions(
  rows: number,
  columns: number,
  limits: Readonly<DelimitedTextResourceLimits>,
  operation: DelimitedTextOperation,
): void {
  if (rows > limits.maxRows) fail_resource("maxRows", limits.maxRows, rows, operation);
  if (columns > limits.maxColumns) {
    fail_resource("maxColumns", limits.maxColumns, columns, operation);
  }
  if (rows !== 0 && columns > Math.floor(limits.maxCells / rows)) {
    const actual = rows * columns;
    fail_resource(
      "maxCells",
      limits.maxCells,
      Number.isSafeInteger(actual) ? actual : limits.maxCells + 1,
      operation,
    );
  }
}

/**
 * Receives materialized fields from the delimited-text scanner. A sink that only
 * needs the leading columns of each record caps `fieldLimit`; the scanner still
 * counts every field, row, and byte toward the resource ceilings.
 */
export interface DelimitedTextScanSink {
  /** Exclusive upper bound on the column index that receives a value. */
  readonly fieldLimit: number;
  /** Called once per materialized field, in column order within its record. */
  field(row: number, column: number, value: string): void;
  /**
   * Optional: offered a field whose value is one span of the input,
   * `text.slice(start, end)`, before that string is built. Returns true when
   * it consumed the field; false has the scanner build it and call `field`.
   */
  span?(row: number, column: number, text: string, start: number, end: number): boolean;
  /** Called once per completed record with its field count. */
  row(row: number, fieldCount: number): void;
}

/**
 * Scan a fixed comma or tab dialect into a sink. The input is already an
 * in-memory string; scanning is incremental and checks UTF-8 byte, field, row,
 * column, and cell ceilings before materializing the next oversized value.
 * Fields at or past `sink.fieldLimit` are counted but not built into strings.
 * `signal` is checked before the scan and once per `ABORT_CHECK_RECORDS` records.
 */
export function scanDelimitedText(
  text: string,
  delimiter: "," | "\t",
  limits: Readonly<DelimitedTextResourceLimits>,
  sink: DelimitedTextScanSink,
  signal: AbortSignal | undefined,
): void {
  signal?.throwIfAborted();
  const input_bytes = utf8ByteLength(text, limits.maxInputBytes);
  if (input_bytes > limits.maxInputBytes) {
    fail_resource("maxInputBytes", limits.maxInputBytes, input_bytes, "parse");
  }

  const delimiter_code = delimiter.charCodeAt(0);
  const field_limit = sink.fieldLimit;
  let row_count = 0;
  let row_fields = 0;
  // Pieces of the current field; only quoted fields with doubled quotes need
  // more than one. Reused across fields to avoid an array per field.
  const field_parts: string[] = [];
  let field_bytes = 0;
  let cells = 0;
  let field_present = false;
  let quoted = false;
  let index = text.charCodeAt(0) === BOM_CODE_UNIT ? 1 : 0;
  let segment_start = index;

  const append_segment = (end: number): void => {
    if (end > segment_start) field_parts.push(text.slice(segment_start, end));
  };

  const materialize_field = (end: number): void => {
    const next_column = row_fields + 1;
    if (next_column > limits.maxColumns) {
      fail_resource("maxColumns", limits.maxColumns, next_column, "parse");
    }
    const next_cells = cells + 1;
    if (next_cells > limits.maxCells) {
      fail_resource("maxCells", limits.maxCells, next_cells, "parse");
    }
    if (row_fields < field_limit) {
      if (field_parts.length === 0) {
        // Plain field: one span of the input, no intermediate pieces.
        if (sink.span?.(row_count, row_fields, text, segment_start, end) !== true) {
          sink.field(
            row_count,
            row_fields,
            end > segment_start ? text.slice(segment_start, end) : "",
          );
        }
      } else {
        append_segment(end);
        sink.field(
          row_count,
          row_fields,
          field_parts.length === 1 ? (field_parts[0] ?? "") : field_parts.join(""),
        );
      }
    }
    // Most fields have no pieces, and writing an empty array's length is not free.
    if (field_parts.length !== 0) field_parts.length = 0;
    field_bytes = 0;
    field_present = false;
    cells = next_cells;
    row_fields = next_column;
  };

  const materialize_row = (end: number): void => {
    materialize_field(end);
    const next_rows = row_count + 1;
    if (next_rows > limits.maxRows) {
      fail_resource("maxRows", limits.maxRows, next_rows, "parse");
    }
    sink.row(row_count, row_fields);
    row_count = next_rows;
    row_fields = 0;
    if (row_count % ABORT_CHECK_RECORDS === 0) signal?.throwIfAborted();
  };

  const count_field_code_point = (): void => {
    const width = utf8CodePointBytes(text, index);
    field_bytes += width;
    if (field_bytes > limits.maxFieldBytes) {
      fail_resource("maxFieldBytes", limits.maxFieldBytes, field_bytes, "parse");
    }
    field_present = true;
    index += utf8CodePointUnits(width);
  };

  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (quoted) {
      if (code !== QUOTE_CODE_UNIT) {
        count_field_code_point();
        continue;
      }
      if (text.charCodeAt(index + 1) === QUOTE_CODE_UNIT) {
        append_segment(index);
        field_bytes++;
        if (field_bytes > limits.maxFieldBytes) {
          fail_resource("maxFieldBytes", limits.maxFieldBytes, field_bytes, "parse");
        }
        field_parts.push('"');
        index += 2;
        segment_start = index;
        continue;
      }
      append_segment(index);
      quoted = false;
      index++;
      segment_start = index;
      continue;
    }

    if (code === QUOTE_CODE_UNIT && !field_present && field_parts.length === 0) {
      quoted = true;
      field_present = true;
      index++;
      segment_start = index;
      continue;
    }
    if (code === delimiter_code) {
      materialize_field(index);
      if (row_fields >= limits.maxColumns) {
        fail_resource("maxColumns", limits.maxColumns, limits.maxColumns + 1, "parse");
      }
      if (cells >= limits.maxCells) {
        fail_resource("maxCells", limits.maxCells, limits.maxCells + 1, "parse");
      }
      index++;
      segment_start = index;
      continue;
    }
    if (code === CARRIAGE_RETURN_CODE_UNIT || code === LINE_FEED_CODE_UNIT) {
      materialize_row(index);
      if (
        code === CARRIAGE_RETURN_CODE_UNIT &&
        text.charCodeAt(index + 1) === LINE_FEED_CODE_UNIT
      ) {
        index++;
      }
      index++;
      segment_start = index;
      if (index < text.length && row_count >= limits.maxRows) {
        fail_resource("maxRows", limits.maxRows, limits.maxRows + 1, "parse");
      }
      continue;
    }
    if (code > ASCII_MAX_CODE_UNIT) {
      count_field_code_point();
      continue;
    }
    // Unquoted ASCII text: take a whole run, stopping at anything the branches
    // above must inspect (quote, delimiter, record break, or non-ASCII).
    let run_end = index + 1;
    while (run_end < text.length) {
      const next = text.charCodeAt(run_end);
      if (
        next > ASCII_MAX_CODE_UNIT ||
        next === QUOTE_CODE_UNIT ||
        next === delimiter_code ||
        next === CARRIAGE_RETURN_CODE_UNIT ||
        next === LINE_FEED_CODE_UNIT
      ) {
        break;
      }
      run_end += 1;
    }
    field_bytes += run_end - index;
    if (field_bytes > limits.maxFieldBytes) {
      // The field was within the ceiling before this run of one-byte units, so a
      // unit-by-unit count first exceeds it at exactly one byte over.
      fail_resource("maxFieldBytes", limits.maxFieldBytes, limits.maxFieldBytes + 1, "parse");
    }
    field_present = true;
    index = run_end;
  }

  if (field_present || row_fields > 0 || field_parts.length > 0) materialize_row(index);
}

/** Parse a fixed comma or tab dialect into raw string rows. */
export function parseDelimitedText(
  text: string,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
): string[][] {
  const limits = resolveDelimitedTextResourceLimits(options);
  const rows: string[][] = [];
  let row: string[] = [];
  scanDelimitedText(
    text,
    delimiter,
    limits,
    {
      fieldLimit: Number.POSITIVE_INFINITY,
      field: (_row, _column, value) => {
        row.push(value);
      },
      row: () => {
        rows.push(row);
        row = [];
      },
    },
    options.signal,
  );
  return rows;
}

interface EncodedFieldPlan {
  readonly text: string;
  readonly quote: boolean;
  readonly quoteCount: number;
  readonly bytes: number;
}

function plan_encoded_field(
  text: string,
  delimiter: "," | "\t",
  force_quote: boolean,
  limits: Readonly<DelimitedTextResourceLimits>,
  operation: DelimitedTextOperation,
): EncodedFieldPlan {
  let bytes = 0;
  let quote_count = 0;
  let quote = force_quote;
  for (let index = 0; index < text.length;) {
    const ch = text[index]!;
    const width = utf8CodePointBytes(text, index);
    bytes += width;
    if (bytes > limits.maxFieldBytes) {
      fail_resource("maxFieldBytes", limits.maxFieldBytes, bytes, operation);
    }
    if (ch === '"') {
      quote = true;
      quote_count++;
    } else if (ch === delimiter || ch === "\r" || ch === "\n") {
      quote = true;
    }
    index += utf8CodePointUnits(width);
  }
  return { text, quote, quoteCount: quote_count, bytes };
}

/** Enforce every row ceiling before any encoded byte of that row is emitted. */
function* planned_rows(
  rows: Iterable<readonly string[]>,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
  config: { bom?: boolean; operation?: DelimitedTextOperation } = {},
): Generator<readonly EncodedFieldPlan[]> {
  const limits = resolveDelimitedTextResourceLimits(options);
  const operation = config.operation ?? "encode";
  let output_bytes = config.bom ? 3 : 0;
  let row_count = 0;
  let cells = 0;
  if (output_bytes > limits.maxOutputBytes) {
    fail_resource("maxOutputBytes", limits.maxOutputBytes, output_bytes, operation);
  }

  for (const row of rows) {
    if (row_count % ABORT_CHECK_RECORDS === 0) options.signal?.throwIfAborted();
    const next_rows = row_count + 1;
    if (next_rows > limits.maxRows) {
      fail_resource("maxRows", limits.maxRows, next_rows, operation);
    }
    if (row.length > limits.maxColumns) {
      fail_resource("maxColumns", limits.maxColumns, row.length, operation);
    }
    const next_cells = cells + row.length;
    if (next_cells > limits.maxCells) {
      fail_resource("maxCells", limits.maxCells, next_cells, operation);
    }

    const plans: EncodedFieldPlan[] = new Array(row.length);
    let row_bytes = row.length > 0 ? row.length - 1 : 0;
    for (let column = 0; column < row.length; column++) {
      const plan = plan_encoded_field(
        row[column]!,
        delimiter,
        row.length === 1 && row[column] === "",
        limits,
        operation,
      );
      plans[column] = plan;
      row_bytes += plan.bytes + plan.quoteCount + (plan.quote ? 2 : 0);
    }
    const required = row_bytes + (row_count > 0 ? 2 : 0);
    if (required > limits.maxOutputBytes - output_bytes) {
      const actual = output_bytes + required;
      fail_resource(
        "maxOutputBytes",
        limits.maxOutputBytes,
        Number.isSafeInteger(actual) ? actual : limits.maxOutputBytes + 1,
        operation,
      );
    }

    yield plans;
    output_bytes += required;
    row_count = next_rows;
    cells = next_cells;
  }
}

const FIELD_CHUNK_CHARACTERS = 16 * 1024;

/** Pull-driven encoder output: one string per row; only oversized fields are sliced. */
export function* encodeDelimitedTextChunks(
  rows: Iterable<readonly string[]>,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
  config: { bom?: boolean; operation?: DelimitedTextOperation } = {},
): Generator<string> {
  let first = true;
  for (const plans of planned_rows(rows, delimiter, options, config)) {
    const separator = first ? (config.bom ? "\ufeff" : "") : "\r\n";
    first = false;
    if (plans.every((plan) => plan.text.length <= FIELD_CHUNK_CHARACTERS)) {
      yield (
        separator +
          plans
            .map((plan) => (plan.quote ? `"${plan.text.replaceAll('"', '""')}"` : plan.text))
            .join(delimiter)
      );
      continue;
    }
    yield separator;
    for (const [column, plan] of plans.entries()) {
      if (column > 0) yield delimiter;
      if (plan.quote) yield '"';
      for (let offset = 0; offset < plan.text.length;) {
        // A long field is checked between its slices; a short one never adds a check.
        if (offset > 0) options.signal?.throwIfAborted();
        let end = Math.min(plan.text.length, offset + FIELD_CHUNK_CHARACTERS);
        const last = plan.text.charCodeAt(end - 1);
        if (end < plan.text.length && last >= 0xd800 && last <= 0xdbff) end--;
        const fragment = plan.text.slice(offset, end);
        yield plan.quote ? fragment.replaceAll('"', '""') : fragment;
        offset = end;
      }
      if (plan.quote) yield '"';
    }
  }
  if (first && config.bom) yield "\ufeff";
}

/**
 * Encode raw string rows with CRLF record separators. The returned value is a
 * single in-memory string; iterable rows let callers fetch backing store windows
 * incrementally rather than materializing the entire logical grid first.
 */
export function encodeDelimitedText(
  rows: Iterable<readonly string[]>,
  delimiter: "," | "\t",
  options: DelimitedTextOptions = {},
  config: { bom?: boolean; operation?: DelimitedTextOperation } = {},
): string {
  const lines: string[] = [];
  for (const plans of planned_rows(rows, delimiter, options, config)) {
    lines.push(
      plans
        .map((plan) => (plan.quote ? `"${plan.text.replaceAll('"', '""')}"` : plan.text))
        .join(delimiter),
    );
  }
  const body = lines.join("\r\n");
  return config.bom ? `\ufeff${body}` : body;
}
