import type { CellVerticalAlign } from "./types/cell.js";

/** Longest font family name a cell style may carry. */
export const MAX_FONT_FAMILY_LENGTH = 128;

/** Excel's limit for one number-format code. */
export const MAX_NUMBER_FORMAT_LENGTH = 255;

// A family name is spliced into a canvas/CSS font string, so it may only hold
// characters that cannot close the family token or start another one: no
// quotes, commas, semicolons, slashes or control characters.
const FONT_FAMILY_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._-]*[\p{L}\p{N}._-])?$/u;

/**
 * Whether `value` is a valid cell `fontFamily`: 1-128 letters, digits,
 * spaces, `.`, `_` or `-`, starting with a letter or digit and not ending in a
 * space. The same rule guards snapshots, hyperlinks, clipboard and XLSX import.
 */
export function isCellFontFamily(value: string): boolean {
  return value.length <= MAX_FONT_FAMILY_LENGTH && FONT_FAMILY_RE.test(value);
}

export function isCellVerticalAlign(value: unknown): value is CellVerticalAlign {
  return value === "top" || value === "middle" || value === "bottom";
}

export function isCellNumberFormat(value: string): boolean {
  if (value.length === 0 || value.length > MAX_NUMBER_FORMAT_LENGTH) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}
