/**
 * The one walker that measures the exact UTF-8 size of `JSON.stringify(value)`
 * and checks that the value round-trips through JSON unchanged, without
 * building the encoded text.
 */

import { SheetwriteError } from "./errors.js";
import { utf8CodePointBytes, utf8CodePointUnits } from "./utf8.js";

/** Keys from the root to a value: numbers index arrays, strings name object fields. */
type JsonPathSegments = Array<string | number>;

/** Why a value has no faithful JSON encoding inside the byte limit. */
interface JsonIssue {
  /** `limit` when the encoding passes the byte limit; `invalid` when the value is not plain JSON data. */
  readonly kind: "limit" | "invalid";
  readonly message: string;
  /** Path of the value that failed. */
  readonly segments: readonly (string | number)[];
}

/** Bytes counted so far, and the issue that stopped the walk. */
interface JsonMeasure {
  /** Exact encoded bytes; on a limit issue, the first total past the limit. */
  readonly bytes: number;
  readonly issue?: JsonIssue;
}

export interface JsonMeasureOptions {
  /** Match JSON object encoding by omitting own properties whose value is undefined. */
  omitUndefinedProperties?: boolean;
}

/** Bytes of `null` and `true`. */
const FOUR_LETTER_LITERAL_BYTES = 4;
/** Bytes of `false`. */
const FALSE_BYTES = 5;
/** Bytes of a pair of quotes, brackets or braces. */
const DELIMITER_PAIR_BYTES = 2;
/** Bytes of a short escape such as `\n` or `\"`. */
const SHORT_ESCAPE_BYTES = 2;
/** Bytes of a `\uXXXX` escape, used for control characters and lone surrogates. */
const UNICODE_ESCAPE_BYTES = 6;
/** Lowest code unit JSON writes without escaping. */
const FIRST_PRINTABLE = 0x20;
const DOUBLE_QUOTE = 0x22;
const BACKSLASH = 0x5c;
const BACKSPACE = 0x08;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const FORM_FEED = 0x0c;
const CARRIAGE_RETURN = 0x0d;
/** Highest code unit that UTF-8 encodes as a single byte. */
const ONE_BYTE_MAX = 0x7f;
/** First and last UTF-16 surrogate code unit. */
const SURROGATE_MIN = 0xd800;
const SURROGATE_MAX = 0xdfff;
/** `String(n)` spells an integer below 10^21 as plain digits, and exponent notation from there. */
const PLAIN_INTEGER_DIGITS = 21;
const DECIMAL_BASE = 10;
/** Exact doubles 10^0 … 10^21, so each digit costs one compare. */
const POWERS_OF_TEN = Float64Array.from(
  { length: PLAIN_INTEGER_DIGITS + 1 },
  (_unused, exponent) => DECIMAL_BASE ** exponent,
);
const CANONICAL_ARRAY_INDEX = /^(0|[1-9]\d*)$/;

/** Thrown inside the walk to unwind to `measureJson`; never escapes it. */
class JsonWalkStop {
  constructor(readonly issue: JsonIssue) {}
}

interface JsonWalk {
  readonly limit: number;
  readonly options: JsonMeasureOptions;
  readonly segments: JsonPathSegments;
  readonly ancestors: Set<object>;
  bytes: number;
}

/**
 * Measure `JSON.stringify(value)` in UTF-8 bytes, stopping at the first byte
 * past `limit` or at the first value JSON cannot carry faithfully: undefined,
 * functions, symbols, bigints, non-finite numbers, cycles, class instances,
 * sparse arrays, named array properties, symbol keys, getters and
 * non-enumerable fields. A `toJSON` function is rejected as a function; any
 * other `toJSON` field is ordinary data, as it is for `JSON.stringify`.
 */
export function measureJson(
  value: unknown,
  limit: number,
  options: JsonMeasureOptions = {},
): JsonMeasure {
  const walk: JsonWalk = { limit, options, segments: [], ancestors: new Set(), bytes: 0 };
  try {
    visitJson(walk, value);
    return { bytes: walk.bytes };
  } catch (stop) {
    if (!(stop instanceof JsonWalkStop)) throw stop;

    return { bytes: walk.bytes, issue: stop.issue };
  }
}

function stopInvalid(walk: JsonWalk, message: string): never {
  throw new JsonWalkStop({ kind: "invalid", message, segments: [...walk.segments] });
}

function addBytes(walk: JsonWalk, amount: number): void {
  walk.bytes += amount;
  if (walk.bytes <= walk.limit) return;

  throw new JsonWalkStop({
    kind: "limit",
    message: `Encoded JSON exceeds the ${walk.limit} byte limit`,
    segments: [...walk.segments],
  });
}

function isPlainAscii(code: number): boolean {
  return (
    code >= FIRST_PRINTABLE && code <= ONE_BYTE_MAX && code !== DOUBLE_QUOTE && code !== BACKSLASH
  );
}

function isShortEscape(code: number): boolean {
  return (
    code === DOUBLE_QUOTE ||
    code === BACKSLASH ||
    code === BACKSPACE ||
    code === TAB ||
    code === LINE_FEED ||
    code === FORM_FEED ||
    code === CARRIAGE_RETURN
  );
}

/** Encoded bytes of the code point at `index`, sized like `utf8CodePointBytes`. */
function encodedCodePointBytes(text: string, index: number): number {
  const code = text.charCodeAt(index);
  if (isShortEscape(code)) return SHORT_ESCAPE_BYTES;
  if (code < FIRST_PRINTABLE) return UNICODE_ESCAPE_BYTES;

  const bytes = utf8CodePointBytes(text, index);
  const isLoneSurrogate =
    code >= SURROGATE_MIN && code <= SURROGATE_MAX && utf8CodePointUnits(bytes) === 1;
  // JSON.stringify writes a lone surrogate as a \uXXXX escape.
  return isLoneSurrogate ? UNICODE_ESCAPE_BYTES : bytes;
}

function addJsonString(walk: JsonWalk, text: string): void {
  addBytes(walk, DELIMITER_PAIR_BYTES);

  let index = 0;
  while (index < text.length) {
    if (isPlainAscii(text.charCodeAt(index))) {
      // Batch plain ASCII, but stop scanning at the first overflowing byte.
      const runLimit = Math.min(text.length, index + Math.floor(walk.limit - walk.bytes) + 1);
      let runEnd = index + 1;
      while (runEnd < runLimit && isPlainAscii(text.charCodeAt(runEnd))) runEnd += 1;
      addBytes(walk, runEnd - index);
      index = runEnd;
      continue;
    }

    const bytes = encodedCodePointBytes(text, index);
    addBytes(walk, bytes);
    index += utf8CodePointUnits(bytes);
  }
}

/**
 * Length of a finite number's JSON text. Integers, the common cell value, are
 * measured against exact powers of ten instead of allocating their text.
 */
function jsonNumberLength(value: number): number {
  const magnitude = Math.abs(value);
  if (!Number.isInteger(value) || magnitude >= (POWERS_OF_TEN[PLAIN_INTEGER_DIGITS] ?? 0)) {
    return String(value).length;
  }

  // -0 is written "0", and `value < 0` is false for it.
  let length = value < 0 ? 2 : 1;
  for (let digits = 1; digits < PLAIN_INTEGER_DIGITS; digits++) {
    if (magnitude < (POWERS_OF_TEN[digits] ?? 0)) break;
    length += 1;
  }
  return length;
}

function visitJson(walk: JsonWalk, value: unknown): void {
  if (value === null) {
    addBytes(walk, FOUR_LETTER_LITERAL_BYTES);
    return;
  }

  switch (typeof value) {
    case "string":
      addJsonString(walk, value);
      return;
    case "boolean":
      addBytes(walk, value ? FOUR_LETTER_LITERAL_BYTES : FALSE_BYTES);
      return;
    case "number":
      if (!Number.isFinite(value)) stopInvalid(walk, "JSON numbers must be finite");
      addBytes(walk, jsonNumberLength(value));
      return;
    case "object":
      break;
    default:
      stopInvalid(walk, `${typeof value} values are not JSON-safe`);
  }

  if (walk.ancestors.has(value)) stopInvalid(walk, "JSON values cannot contain cycles");
  if (Object.getOwnPropertySymbols(value).length > 0) {
    stopInvalid(walk, "Symbol-keyed properties are not JSON-safe");
  }

  walk.ancestors.add(value);
  if (Array.isArray(value)) visitJsonArray(walk, value);
  else visitJsonObject(walk, value);
  walk.ancestors.delete(value);
}

function visitJsonArray(walk: JsonWalk, array: unknown[]): void {
  if (Object.getPrototypeOf(array) !== Array.prototype) {
    stopInvalid(walk, "Arrays with custom prototypes are not JSON-safe");
  }

  for (const key in array) {
    if (!Object.hasOwn(array, key)) continue;
    if (!CANONICAL_ARRAY_INDEX.test(key) || Number(key) >= array.length) {
      walk.segments.push(key);
      stopInvalid(walk, "Arrays may contain only indexed data properties");
    }
  }

  addBytes(walk, DELIMITER_PAIR_BYTES);
  for (let index = 0; index < array.length; index++) {
    if (index > 0) addBytes(walk, 1);
    walk.segments.push(index);
    const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      stopInvalid(walk, "Array entries must be enumerable data properties");
    }

    visitJson(walk, descriptor.value);
    walk.segments.pop();
  }
}

function visitJsonObject(walk: JsonWalk, record: object): void {
  if (Object.getPrototypeOf(record) !== Object.prototype) {
    stopInvalid(walk, "Only plain objects are JSON-safe");
  }

  addBytes(walk, DELIMITER_PAIR_BYTES);
  let isFirstField = true;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    walk.segments.push(key);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      stopInvalid(walk, "Object properties must be enumerable data properties");
    }

    if (descriptor.value === undefined && walk.options.omitUndefinedProperties) {
      walk.segments.pop();
      continue;
    }

    if (!isFirstField) addBytes(walk, 1);
    isFirstField = false;
    addJsonString(walk, key);
    addBytes(walk, 1);
    visitJson(walk, descriptor.value);
    walk.segments.pop();
  }
}

/**
 * Internal failure of `boundedJsonByteLength`. Callers that own a public code
 * catch it and throw their own failure; any other path lets it reach the host
 * as a transaction failure.
 */
export class JsonByteLengthError extends SheetwriteError {
  override readonly name = "JsonByteLengthError";
  declare readonly code: "payload-limit" | "invalid-operations";

  constructor(
    code: "payload-limit" | "invalid-operations",
    message: string,
    readonly actual?: number,
    readonly limit?: number,
  ) {
    super(
      code,
      "transaction",
      message,
      actual === undefined || limit === undefined ? {} : { context: { actual, limit } },
    );
  }
}

/** Exact JSON UTF-8 bytes of `value`, computed without building the encoded payload. */
export function boundedJsonByteLength(
  value: unknown,
  limit: number,
  options: JsonMeasureOptions = {},
): number {
  const { bytes, issue } = measureJson(value, limit, options);
  if (issue === undefined) return bytes;

  if (issue.kind === "limit") {
    throw new JsonByteLengthError("payload-limit", issue.message, bytes, limit);
  }
  throw new JsonByteLengthError("invalid-operations", issue.message);
}
