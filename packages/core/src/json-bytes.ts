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
  /**
   * The caller built `value` in this call from plain data no other code has
   * reached: no getters, holes, named array fields or symbol keys. Fields
   * are then read directly instead of being proven data properties; every
   * other check stays.
   */
  builtByCaller?: boolean;
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
export const CANONICAL_ARRAY_INDEX = /^(0|[1-9]\d*)$/;

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
    if (options.builtByCaller) visit_built_json(walk, value);
    else visit_json(walk, value);
    return { bytes: walk.bytes };
  } catch (stop) {
    if (!(stop instanceof JsonWalkStop)) throw stop;

    return { bytes: walk.bytes, issue: stop.issue };
  }
}

function stop_invalid(walk: JsonWalk, message: string): never {
  throw new JsonWalkStop({ kind: "invalid", message, segments: [...walk.segments] });
}

function add_bytes(walk: JsonWalk, amount: number): void {
  walk.bytes += amount;
  if (walk.bytes <= walk.limit) return;

  throw new JsonWalkStop({
    kind: "limit",
    message: `Encoded JSON exceeds the ${walk.limit} byte limit`,
    segments: [...walk.segments],
  });
}

function is_plain_ascii(code: number): boolean {
  return (
    code >= FIRST_PRINTABLE && code <= ONE_BYTE_MAX && code !== DOUBLE_QUOTE && code !== BACKSLASH
  );
}

function is_short_escape(code: number): boolean {
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
function encoded_code_point_bytes(text: string, index: number): number {
  const code = text.charCodeAt(index);
  if (is_short_escape(code)) return SHORT_ESCAPE_BYTES;
  if (code < FIRST_PRINTABLE) return UNICODE_ESCAPE_BYTES;

  const bytes = utf8CodePointBytes(text, index);
  const is_lone_surrogate =
    code >= SURROGATE_MIN && code <= SURROGATE_MAX && utf8CodePointUnits(bytes) === 1;
  // JSON.stringify writes a lone surrogate as a \uXXXX escape.
  return is_lone_surrogate ? UNICODE_ESCAPE_BYTES : bytes;
}

function add_json_string(walk: JsonWalk, text: string): void {
  add_bytes(walk, DELIMITER_PAIR_BYTES);

  let index = 0;
  while (index < text.length) {
    if (is_plain_ascii(text.charCodeAt(index))) {
      // Batch plain ASCII, but stop scanning at the first overflowing byte.
      const run_limit = Math.min(text.length, index + Math.floor(walk.limit - walk.bytes) + 1);
      let run_end = index + 1;
      while (run_end < run_limit && is_plain_ascii(text.charCodeAt(run_end))) run_end += 1;
      add_bytes(walk, run_end - index);
      index = run_end;
      continue;
    }

    const bytes = encoded_code_point_bytes(text, index);
    add_bytes(walk, bytes);
    index += utf8CodePointUnits(bytes);
  }
}

/**
 * Encoded bytes of `text` as a JSON string, or a total above `budget` as soon
 * as the count passes it, so an oversized string is never scanned to its end.
 */
function json_string_bytes(text: string, budget: number): number {
  let bytes = DELIMITER_PAIR_BYTES;
  let index = 0;
  while (index < text.length && bytes <= budget) {
    if (is_plain_ascii(text.charCodeAt(index))) {
      bytes += 1;
      index += 1;
      continue;
    }

    const code_point_bytes = encoded_code_point_bytes(text, index);
    bytes += code_point_bytes;
    index += utf8CodePointUnits(code_point_bytes);
  }
  return bytes;
}

/**
 * Length of a finite number's JSON text. Integers, the common cell value, are
 * measured against exact powers of ten instead of allocating their text.
 */
export function jsonNumberLength(value: number): number {
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

/** Count `value` when it is a JSON scalar and return true; return false for an object or array. */
function add_json_scalar(walk: JsonWalk, value: unknown): boolean {
  if (value === null) {
    add_bytes(walk, FOUR_LETTER_LITERAL_BYTES);
    return true;
  }

  switch (typeof value) {
    case "string":
      add_json_string(walk, value);
      return true;
    case "boolean":
      add_bytes(walk, value ? FOUR_LETTER_LITERAL_BYTES : FALSE_BYTES);
      return true;
    case "number":
      if (!Number.isFinite(value)) stop_invalid(walk, "JSON numbers must be finite");
      add_bytes(walk, jsonNumberLength(value));
      return true;
    case "object":
      return false;
    default:
      stop_invalid(walk, `${typeof value} values are not JSON-safe`);
  }
}

function visit_json(walk: JsonWalk, value: unknown): void {
  if (add_json_scalar(walk, value)) return;
  const record = value as object;
  if (walk.ancestors.has(record)) stop_invalid(walk, "JSON values cannot contain cycles");
  if (Object.getOwnPropertySymbols(record).length > 0) {
    stop_invalid(walk, "Symbol-keyed properties are not JSON-safe");
  }

  walk.ancestors.add(record);
  if (Array.isArray(record)) visit_json_array(walk, record);
  else visit_json_object(walk, record);
  walk.ancestors.delete(record);
}

function visit_json_array(walk: JsonWalk, array: unknown[]): void {
  if (Object.getPrototypeOf(array) !== Array.prototype) {
    stop_invalid(walk, "Arrays with custom prototypes are not JSON-safe");
  }
  if (owned_arrays.get(array) === owned_generation && add_owned_scalar_array(walk, array)) return;

  for (const key in array) {
    if (!Object.hasOwn(array, key)) continue;
    if (!CANONICAL_ARRAY_INDEX.test(key) || Number(key) >= array.length) {
      walk.segments.push(key);
      stop_invalid(walk, "Arrays may contain only indexed data properties");
    }
  }

  add_bytes(walk, DELIMITER_PAIR_BYTES);
  for (let index = 0; index < array.length; index++) {
    if (index > 0) add_bytes(walk, 1);
    walk.segments.push(index);
    const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      stop_invalid(walk, "Array entries must be enumerable data properties");
    }

    visit_json(walk, descriptor.value);
    walk.segments.pop();
  }
}

/**
 * `visit_json` for a value the caller built (`builtByCaller`): fields and
 * entries are read directly, and symbol keys are not looked for. It does not
 * share functions with the exact walk, so neither makes the other's property
 * reads polymorphic.
 */
function visit_built_json(walk: JsonWalk, value: unknown): void {
  if (add_json_scalar(walk, value)) return;
  const record = value as object;
  if (walk.ancestors.has(record)) stop_invalid(walk, "JSON values cannot contain cycles");
  walk.ancestors.add(record);
  if (Array.isArray(record)) {
    if (Object.getPrototypeOf(record) !== Array.prototype) {
      stop_invalid(walk, "Arrays with custom prototypes are not JSON-safe");
    }
    add_bytes(walk, DELIMITER_PAIR_BYTES);
    for (let index = 0; index < record.length; index++) {
      if (index > 0) add_bytes(walk, 1);
      walk.segments.push(index);
      // A hole reads as undefined, which the walk refuses.
      visit_built_json(walk, record[index]);
      walk.segments.pop();
    }
  } else {
    if (Object.getPrototypeOf(record) !== Object.prototype) {
      stop_invalid(walk, "Only plain objects are JSON-safe");
    }
    add_bytes(walk, DELIMITER_PAIR_BYTES);
    let is_first_field = true;
    for (const key in record) {
      if (!Object.hasOwn(record, key)) continue;
      const field: unknown = record[key as keyof object];
      if (field === undefined && walk.options.omitUndefinedProperties) continue;
      walk.segments.push(key);
      if (!is_first_field) add_bytes(walk, 1);
      is_first_field = false;
      add_json_string(walk, key);
      add_bytes(walk, 1);
      visit_built_json(walk, field);
      walk.segments.pop();
    }
  }
  walk.ancestors.delete(record);
}

/** Arrays Sheetwrite built itself from values it read once, by the generation they were built in. */
const owned_arrays = new WeakMap<unknown[], number>();
/** Only arrays marked in this generation are trusted; `releaseOwnedArrays` starts the next one. */
let owned_generation = 0;

/**
 * Record that `array` is a dense array of plain data properties that only
 * Sheetwrite can reach, so a measurement may read its entries directly until
 * the next `releaseOwnedArrays`.
 */
export function markOwnedArray(array: unknown[]): void {
  owned_arrays.set(array, owned_generation);
}

/** Whether `value` was recorded by `markOwnedArray` since the last `releaseOwnedArrays`. */
export function isOwnedArray(value: unknown): boolean {
  return Array.isArray(value) && owned_arrays.get(value) === owned_generation;
}

/**
 * Stop trusting every array recorded so far. Call it before code outside
 * Sheetwrite can reach them: a callback, a listener or a returned result.
 * That code could put a getter on an entry, and an array sent back would
 * then measure one value and store another. Freezing the arrays instead
 * costs more than copying them again.
 */
export function releaseOwnedArrays(): void {
  owned_generation++;
}

/**
 * Measure an owned array whose entries are all JSON scalars in one pass.
 * Returns false without counting anything at the first entry that is not a
 * finite number, string, boolean or null, or when the array would pass the
 * byte limit; the general walk then measures it and reports the exact issue.
 */
function add_owned_scalar_array(walk: JsonWalk, array: readonly unknown[]): boolean {
  const budget = walk.limit - walk.bytes;
  let bytes = DELIMITER_PAIR_BYTES + Math.max(0, array.length - 1);
  // Repeated text is common in a block, so one measurement covers each run.
  let previous_text: string | undefined;
  let previous_text_bytes = 0;
  for (let index = 0; index < array.length && bytes <= budget; index++) {
    const value = array[index];
    switch (typeof value) {
      case "number":
        if (!Number.isFinite(value)) return false;
        bytes += jsonNumberLength(value);
        break;
      case "string":
        if (value !== previous_text) {
          previous_text = value;
          previous_text_bytes = json_string_bytes(value, budget - bytes);
        }
        bytes += previous_text_bytes;
        break;
      case "boolean":
        bytes += value ? FOUR_LETTER_LITERAL_BYTES : FALSE_BYTES;
        break;
      default:
        if (value !== null) return false;
        bytes += FOUR_LETTER_LITERAL_BYTES;
    }
  }
  if (bytes > budget) return false;

  walk.bytes += bytes;
  return true;
}

function visit_json_object(walk: JsonWalk, record: object): void {
  if (Object.getPrototypeOf(record) !== Object.prototype) {
    stop_invalid(walk, "Only plain objects are JSON-safe");
  }

  add_bytes(walk, DELIMITER_PAIR_BYTES);
  let is_first_field = true;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    walk.segments.push(key);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      stop_invalid(walk, "Object properties must be enumerable data properties");
    }

    if (descriptor.value === undefined && walk.options.omitUndefinedProperties) {
      walk.segments.pop();
      continue;
    }

    if (!is_first_field) add_bytes(walk, 1);
    is_first_field = false;
    add_json_string(walk, key);
    add_bytes(walk, 1);
    visit_json(walk, descriptor.value);
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
