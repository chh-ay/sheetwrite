import type { CellScalar } from "./types/cell.js";
import type { Range } from "./types/coordinates.js";
import type { ColumnFilter } from "./types/document.js";

/** NUL is forbidden in display text without excluding other text control characters. */
export const NUL_CHARACTER = String.fromCharCode(0);

const RANGE_KEYS = new Set(["sheet", "start", "end"]);
const COORDINATE_KEYS = new Set(["row", "col"]);

/** Whether a string contains a C0 control character or DEL. */
export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Order strings by UTF-16 code unit. Persisted and canonical orders use this
 * instead of `localeCompare`, whose result depends on the runtime locale.
 */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** An untrusted plain object whose fields are read one by one. */
export type PlainRecord = Record<string, unknown>;

/** Whether `value` is a plain object: not null, not an array, and with the `Object` prototype. */
export function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * The own enumerable data value of `record[key]`, or undefined. Getters and
 * inherited fields are not read, so validation never runs caller code.
 */
export function ownValue(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

/** Own enumerable data properties of a plain object restricted to `allowed`; null otherwise. */
export function dataProperties(
  value: unknown,
  allowed: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const properties: Record<string, unknown> = Object.create(null);
  let count = 0;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    for (const key in value) {
      if (!Object.hasOwn(value, key) || !allowed.has(key) || ++count > allowed.size) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      properties[key] = descriptor.value;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    return properties;
  } catch {
    return null;
  }
}

function valid_coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A fresh, normalized range from an untrusted plain-data value, or null. */
export function sanitizeRange(value: unknown): Range | null {
  const range = dataProperties(value, RANGE_KEYS);
  const start = dataProperties(range?.start, COORDINATE_KEYS);
  const end = dataProperties(range?.end, COORDINATE_KEYS);
  if (
    typeof range?.sheet !== "string" ||
    range.sheet.length === 0 ||
    !start ||
    !end ||
    !valid_coordinate(start.row) ||
    !valid_coordinate(start.col) ||
    !valid_coordinate(end.row) ||
    !valid_coordinate(end.col)
  ) {
    return null;
  }
  return {
    sheet: range.sheet,
    start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
    end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
  };
}

/**
 * Deep copy of JSON data through a JSON round trip, so the copy holds only
 * what the document stores: undefined fields drop out and -0 becomes 0.
 */
export function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * A copy of `filter`, the same as `cloneJsonValue(filter)` gives. A value
 * list can hold hundreds of thousands of picks, so a plain one is copied
 * pick by pick instead of through JSON text; anything else goes through JSON.
 */
export function cloneColumnFilter(filter: ColumnFilter): ColumnFilter {
  return (filter.kind === "values" && copy_plain_value_filter(filter)) || cloneJsonValue(filter);
}

/**
 * The JSON copy of a plain `{ kind, values }` filter whose picks are strings,
 * booleans, nulls and finite numbers; null when JSON could write it
 * differently (other fields, holes, objects, `toJSON`).
 */
function copy_plain_value_filter(filter: {
  readonly kind: "values";
  readonly values: readonly CellScalar[];
}): ColumnFilter | null {
  if (Object.getPrototypeOf(filter) !== Object.prototype || "toJSON" in filter) return null;
  const keys = Object.keys(filter);
  if (keys.length !== 2 || keys[0] !== "kind" || keys[1] !== "values") return null;

  const { values } = filter;
  if (
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype ||
    "toJSON" in values
  ) {
    return null;
  }

  const copy = new Array<CellScalar>(values.length);
  for (let index = 0; index < values.length; index++) {
    const value: unknown = values[index];
    if (typeof value === "string" || typeof value === "boolean" || value === null) {
      copy[index] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      // JSON writes -0 as 0.
      copy[index] = value === 0 ? 0 : value;
    } else {
      return null;
    }
  }
  return { kind: "values", values: copy };
}
