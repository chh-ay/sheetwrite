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

/** Flat positions stay representable before a typed-array assignment can truncate them. */
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

/** Fatal decoding protects the metadata seam without parsing row values in JavaScript. */
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

/** Primitive codes share mixed tags; mixed has its own schema-only code. */
export function encodeType(type: QueryColumnType): number {
  return COLUMN_TYPE_CODES[type];
}

/** The switch narrows the exact public type without an unchecked assertion. */
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
