import type { Range } from "./types/coordinates.js";

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

function validCoordinate(value: unknown): value is number {
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
    !validCoordinate(start.row) ||
    !validCoordinate(start.col) ||
    !validCoordinate(end.row) ||
    !validCoordinate(end.col)
  ) {
    return null;
  }
  return {
    sheet: range.sheet,
    start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
    end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
  };
}
