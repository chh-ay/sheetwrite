import { SheetwriteError } from "./errors.js";
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
  override readonly name = "DelimitedTextResourceError";

  constructor(
    readonly resource: keyof DelimitedTextResourceLimits,
    readonly limit: number,
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
  override readonly name = "DelimitedTextOptionsError";

  constructor(
    readonly resource: keyof DelimitedTextResourceLimits,
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
          value: typeof value === "number" && Number.isFinite(value) ? value : String(value),
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

function utf8WidthAt(text: string, index: number): { bytes: number; advance: number } {
  const first = text.charCodeAt(index);
  if (first <= ASCII_MAX_CODE_UNIT) return { bytes: 1, advance: 1 };
  if (first <= 0x7ff) return { bytes: 2, advance: 1 };
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = text.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return { bytes: 4, advance: 2 };
  }
  return { bytes: 3, advance: 1 };
}

function boundedUtf8InputBytes(text: string, limit: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; ) {
    const code = text.charCodeAt(index);
    if (code <= ASCII_MAX_CODE_UNIT) {
      // A run of ASCII code units is one byte each, so it can cross the ceiling
      // by at most one; report the same first-exceeded value as a per-unit loop.
      let end = index + 1;
      while (end < text.length && text.charCodeAt(end) <= ASCII_MAX_CODE_UNIT) end += 1;
      bytes += end - index;
      if (bytes > limit) return limit + 1;
      index = end;
      continue;
    }
    const width = utf8WidthAt(text, index);
    bytes += width.bytes;
    if (bytes > limit) return bytes;
    index += width.advance;
  }
  return bytes;
}

function failResource(
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
  if (rows > limits.maxRows) failResource("maxRows", limits.maxRows, rows, operation);
  if (columns > limits.maxColumns) {
    failResource("maxColumns", limits.maxColumns, columns, operation);
  }
  if (rows !== 0 && columns > Math.floor(limits.maxCells / rows)) {
    const actual = rows * columns;
    failResource(
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
  /** Called once per completed record with its field count. */
  row(row: number, fieldCount: number): void;
}

/**
 * Scan a fixed comma or tab dialect into a sink. The input is already an
 * in-memory string; scanning is incremental and checks UTF-8 byte, field, row,
 * column, and cell ceilings before materializing the next oversized value.
 * Fields at or past `sink.fieldLimit` are counted but not built into strings.
 */
export function scanDelimitedText(
  text: string,
  delimiter: "," | "\t",
  limits: Readonly<DelimitedTextResourceLimits>,
  sink: DelimitedTextScanSink,
): void {
  const inputBytes = boundedUtf8InputBytes(text, limits.maxInputBytes);
  if (inputBytes > limits.maxInputBytes) {
    failResource("maxInputBytes", limits.maxInputBytes, inputBytes, "parse");
  }

  const delimiterCode = delimiter.charCodeAt(0);
  const fieldLimit = sink.fieldLimit;
  let rowCount = 0;
  let rowFields = 0;
  let fieldParts: string[] = [];
  let fieldBytes = 0;
  let cells = 0;
  let fieldPresent = false;
  let quoted = false;
  let index = text.charCodeAt(0) === BOM_CODE_UNIT ? 1 : 0;
  let segmentStart = index;

  const appendSegment = (end: number): void => {
    if (end > segmentStart) fieldParts.push(text.slice(segmentStart, end));
  };

  const materializeField = (end: number): void => {
    const nextColumn = rowFields + 1;
    if (nextColumn > limits.maxColumns) {
      failResource("maxColumns", limits.maxColumns, nextColumn, "parse");
    }
    const nextCells = cells + 1;
    if (nextCells > limits.maxCells) {
      failResource("maxCells", limits.maxCells, nextCells, "parse");
    }
    appendSegment(end);
    if (rowFields < fieldLimit) {
      let value = "";
      if (fieldParts.length === 1) value = fieldParts[0] ?? "";
      else if (fieldParts.length > 1) value = fieldParts.join("");
      sink.field(rowCount, rowFields, value);
    }
    fieldParts = [];
    fieldBytes = 0;
    fieldPresent = false;
    cells = nextCells;
    rowFields = nextColumn;
  };

  const materializeRow = (end: number): void => {
    materializeField(end);
    const nextRows = rowCount + 1;
    if (nextRows > limits.maxRows) {
      failResource("maxRows", limits.maxRows, nextRows, "parse");
    }
    sink.row(rowCount, rowFields);
    rowCount = nextRows;
    rowFields = 0;
  };

  const countFieldCodePoint = (): void => {
    const width = utf8WidthAt(text, index);
    fieldBytes += width.bytes;
    if (fieldBytes > limits.maxFieldBytes) {
      failResource("maxFieldBytes", limits.maxFieldBytes, fieldBytes, "parse");
    }
    fieldPresent = true;
    index += width.advance;
  };

  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (quoted) {
      if (code !== QUOTE_CODE_UNIT) {
        countFieldCodePoint();
        continue;
      }
      if (text.charCodeAt(index + 1) === QUOTE_CODE_UNIT) {
        appendSegment(index);
        fieldBytes++;
        if (fieldBytes > limits.maxFieldBytes) {
          failResource("maxFieldBytes", limits.maxFieldBytes, fieldBytes, "parse");
        }
        fieldParts.push('"');
        index += 2;
        segmentStart = index;
        continue;
      }
      appendSegment(index);
      quoted = false;
      index++;
      segmentStart = index;
      continue;
    }

    if (code === QUOTE_CODE_UNIT && !fieldPresent && fieldParts.length === 0) {
      quoted = true;
      fieldPresent = true;
      index++;
      segmentStart = index;
      continue;
    }
    if (code === delimiterCode) {
      materializeField(index);
      if (rowFields >= limits.maxColumns) {
        failResource("maxColumns", limits.maxColumns, limits.maxColumns + 1, "parse");
      }
      if (cells >= limits.maxCells) {
        failResource("maxCells", limits.maxCells, limits.maxCells + 1, "parse");
      }
      index++;
      segmentStart = index;
      continue;
    }
    if (code === CARRIAGE_RETURN_CODE_UNIT || code === LINE_FEED_CODE_UNIT) {
      materializeRow(index);
      if (
        code === CARRIAGE_RETURN_CODE_UNIT &&
        text.charCodeAt(index + 1) === LINE_FEED_CODE_UNIT
      ) {
        index++;
      }
      index++;
      segmentStart = index;
      if (index < text.length && rowCount >= limits.maxRows) {
        failResource("maxRows", limits.maxRows, limits.maxRows + 1, "parse");
      }
      continue;
    }
    if (code > ASCII_MAX_CODE_UNIT) {
      countFieldCodePoint();
      continue;
    }
    // Unquoted ASCII text: take a whole run, stopping at anything the branches
    // above must inspect (quote, delimiter, record break, or non-ASCII).
    let runEnd = index + 1;
    while (runEnd < text.length) {
      const next = text.charCodeAt(runEnd);
      if (
        next > ASCII_MAX_CODE_UNIT ||
        next === QUOTE_CODE_UNIT ||
        next === delimiterCode ||
        next === CARRIAGE_RETURN_CODE_UNIT ||
        next === LINE_FEED_CODE_UNIT
      ) {
        break;
      }
      runEnd += 1;
    }
    fieldBytes += runEnd - index;
    if (fieldBytes > limits.maxFieldBytes) {
      failResource("maxFieldBytes", limits.maxFieldBytes, fieldBytes, "parse");
    }
    fieldPresent = true;
    index = runEnd;
  }

  if (fieldPresent || rowFields > 0 || fieldParts.length > 0) materializeRow(index);
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
  scanDelimitedText(text, delimiter, limits, {
    fieldLimit: Number.POSITIVE_INFINITY,
    field: (_row, _column, value) => {
      row.push(value);
    },
    row: () => {
      rows.push(row);
      row = [];
    },
  });
  return rows;
}

interface EncodedFieldPlan {
  readonly text: string;
  readonly quote: boolean;
  readonly quoteCount: number;
  readonly bytes: number;
}

function planEncodedField(
  text: string,
  delimiter: "," | "\t",
  forceQuote: boolean,
  limits: Readonly<DelimitedTextResourceLimits>,
  operation: DelimitedTextOperation,
): EncodedFieldPlan {
  let bytes = 0;
  let quoteCount = 0;
  let quote = forceQuote;
  for (let index = 0; index < text.length; ) {
    const ch = text[index]!;
    const width = utf8WidthAt(text, index);
    bytes += width.bytes;
    if (bytes > limits.maxFieldBytes) {
      failResource("maxFieldBytes", limits.maxFieldBytes, bytes, operation);
    }
    if (ch === '"') {
      quote = true;
      quoteCount++;
    } else if (ch === delimiter || ch === "\r" || ch === "\n") {
      quote = true;
    }
    index += width.advance;
  }
  return { text, quote, quoteCount, bytes };
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
  const limits = resolveDelimitedTextResourceLimits(options);
  const operation = config.operation ?? "encode";
  const lines: string[] = [];
  let outputBytes = config.bom ? 3 : 0;
  let rowCount = 0;
  let cells = 0;
  if (outputBytes > limits.maxOutputBytes) {
    failResource("maxOutputBytes", limits.maxOutputBytes, outputBytes, operation);
  }

  for (const row of rows) {
    const nextRows = rowCount + 1;
    if (nextRows > limits.maxRows) {
      failResource("maxRows", limits.maxRows, nextRows, operation);
    }
    if (row.length > limits.maxColumns) {
      failResource("maxColumns", limits.maxColumns, row.length, operation);
    }
    const nextCells = cells + row.length;
    if (nextCells > limits.maxCells) {
      failResource("maxCells", limits.maxCells, nextCells, operation);
    }

    const plans: EncodedFieldPlan[] = new Array(row.length);
    let rowBytes = row.length > 0 ? row.length - 1 : 0;
    for (let column = 0; column < row.length; column++) {
      const plan = planEncodedField(
        row[column]!,
        delimiter,
        row.length === 1 && row[column] === "",
        limits,
        operation,
      );
      plans[column] = plan;
      rowBytes += plan.bytes + plan.quoteCount + (plan.quote ? 2 : 0);
    }
    const required = rowBytes + (rowCount > 0 ? 2 : 0);
    if (required > limits.maxOutputBytes - outputBytes) {
      const actual = outputBytes + required;
      failResource(
        "maxOutputBytes",
        limits.maxOutputBytes,
        Number.isSafeInteger(actual) ? actual : limits.maxOutputBytes + 1,
        operation,
      );
    }

    const encodedFields: string[] = new Array(plans.length);
    for (let column = 0; column < plans.length; column++) {
      const plan = plans[column]!;
      encodedFields[column] = plan.quote ? `"${plan.text.replaceAll('"', '""')}"` : plan.text;
    }
    lines.push(encodedFields.join(delimiter));
    outputBytes += required;
    rowCount = nextRows;
    cells = nextCells;
  }

  const body = lines.join("\r\n");
  return config.bom ? `\ufeff${body}` : body;
}
