import type { QueryColumnType } from "./types.js";

const MAX_U32 = 0xffff_ffff;
const COLUMN_TYPE_CODES: Readonly<Record<QueryColumnType, number>> = {
  number: 1,
  logical: 2,
  text: 3,
  date: 4,
  dateTime: 5,
  mixed: 7,
};

/**
 * Returns `value` when it is an integer from 0 to 2^32 - 1, and throws a
 * `RangeError` otherwise. Typed-array writes and u32 WASM arguments truncate
 * larger values silently, so counts and offsets are checked before transfer.
 */
export function checkedU32(value: number): number {
  if (Number.isSafeInteger(value) === false || value < 0 || value > MAX_U32) {
    throw new RangeError("Query transfer value must be a u32");
  }

  return value;
}

/** Host strings cross the seam as one UTF-8 buffer and one u32 offset buffer. */
export function packStrings(values: readonly string[]): {
  bytes: Uint8Array;
  offsets: Uint32Array;
} {
  const encoder = new TextEncoder();
  const chunks = values.map((value) => encoder.encode(value));
  const offsets = new Uint32Array(chunks.length + 1);
  let total = 0;

  for (const [index, chunk] of chunks.entries()) {
    total = checkedU32(total + chunk.length);
    offsets[index + 1] = total;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return { bytes, offsets };
}

/**
 * Splits a packed UTF-8 buffer at its u32 offsets. The decoder is fatal, so
 * invalid UTF-8 from the engine throws instead of becoming replacement
 * characters. Row text does not pass through here; it stays packed in its
 * column.
 */
export function unpackStrings(bytes: Uint8Array, offsets: Uint32Array): string[] {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const strings: string[] = [];

  for (let index = 0; index + 1 < offsets.length; index += 1) {
    const start = offsets[index];
    const end = offsets[index + 1];
    if (start === undefined || end === undefined || start > end || end > bytes.length) {
      throw new Error("Query engine returned invalid string offsets");
    }

    strings.push(decoder.decode(bytes.subarray(start, end)));
  }

  return strings;
}

/** The wire code of a column type. Codes 1 to 5 equal the mixed-column row tags; 7 marks a mixed column. */
export function encodeType(type: QueryColumnType): number {
  return COLUMN_TYPE_CODES[type];
}

/** The column type of a wire code; throws on a code the engine does not define. */
export function decodeType(code: number): QueryColumnType {
  switch (code) {
    case COLUMN_TYPE_CODES.number:
      return "number";
    case COLUMN_TYPE_CODES.logical:
      return "logical";
    case COLUMN_TYPE_CODES.text:
      return "text";
    case COLUMN_TYPE_CODES.date:
      return "date";
    case COLUMN_TYPE_CODES.dateTime:
      return "dateTime";
    case COLUMN_TYPE_CODES.mixed:
      return "mixed";
    default:
      throw new Error("Query engine returned an invalid column type");
  }
}
