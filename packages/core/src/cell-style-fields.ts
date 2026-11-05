import { dataProperties } from "./plain-data.js";
import type { CellBorder, CellStyle, CellVerticalAlign } from "./types/cell.js";

/** Style of a cell without one: shared and never mutated, so hot paths allocate no `{}` per cell. */
export const EMPTY_STYLE: CellStyle = {};

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

/** CSS pixels in one typographic point. */
const PIXELS_PER_POINT = 96 / 72;
/**
 * Smallest and largest cell font size, in CSS pixels: Excel accepts 1 to 409
 * points (https://support.microsoft.com/en-us/office/change-the-font-size-931e064e-f99f-4ba4-a1bf-8047a35552be).
 */
export const MIN_CELL_FONT_SIZE = PIXELS_PER_POINT;
export const MAX_CELL_FONT_SIZE = 409 * PIXELS_PER_POINT;
/** Widest border a cell style may draw, in CSS pixels. */
const MAX_BORDER_WIDTH = 64;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const BOOLEAN_STYLE_KEYS = ["bold", "italic", "underline", "strikethrough", "wrap"] as const;
const BORDER_SIDE_KEYS = ["all", "top", "right", "bottom", "left"] as const;
const STYLE_KEYS = new Set<string>([
  ...BOOLEAN_STYLE_KEYS,
  "fontSize",
  "fontFamily",
  "numberFormat",
  "color",
  "backgroundColor",
  "align",
  "verticalAlign",
  "border",
]);
const BORDER_SIDES = new Set<string>(BORDER_SIDE_KEYS);
const BORDER_KEYS = new Set(["color", "width", "style"]);

/** Absent, a valid `#rrggbb` color, or null for anything else. */
function sanitizeColor(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;

  return typeof value === "string" && HEX_COLOR.test(value) ? value : null;
}

function sanitizeBorder(value: unknown): CellBorder | null {
  const border = dataProperties(value, BORDER_KEYS);
  if (!border) return null;

  const color = sanitizeColor(border.color);
  if (color === null) return null;

  const { width, style } = border;
  if (
    width !== undefined &&
    (typeof width !== "number" || !Number.isFinite(width) || width < 0 || width > MAX_BORDER_WIDTH)
  ) {
    return null;
  }

  if (style !== undefined && style !== "solid" && style !== "dashed" && style !== "dotted") {
    return null;
  }

  return {
    ...(color !== undefined ? { color } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(style !== undefined ? { style } : {}),
  };
}

function sanitizeBorders(value: unknown): CellStyle["border"] | null {
  const borders = dataProperties(value, BORDER_SIDES);
  if (!borders) return null;

  const result: NonNullable<CellStyle["border"]> = {};
  for (const side of BORDER_SIDE_KEYS) {
    if (borders[side] === undefined) continue;

    const border = sanitizeBorder(borders[side]);
    if (!border) return null;
    result[side] = border;
  }
  return result;
}

function isCellFontSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_CELL_FONT_SIZE &&
    value <= MAX_CELL_FONT_SIZE
  );
}

/**
 * A plain, bounded copy of an untrusted cell style, or null when `value` is
 * not a plain object of known style fields or any field breaks its rule. The
 * same rule guards hyperlinks, table styles and pasted cells.
 */
export function sanitizeCellStyle(value: unknown): CellStyle | null {
  const style = dataProperties(value, STYLE_KEYS);
  if (!style) return null;

  const result: CellStyle = {};
  for (const key of BOOLEAN_STYLE_KEYS) {
    const flag = style[key];
    if (flag === undefined) continue;
    if (typeof flag !== "boolean") return null;
    result[key] = flag;
  }

  const { fontSize, fontFamily, numberFormat, align, verticalAlign, border } = style;
  if (fontSize !== undefined) {
    if (!isCellFontSize(fontSize)) return null;
    result.fontSize = fontSize;
  }

  if (fontFamily !== undefined) {
    if (typeof fontFamily !== "string" || !isCellFontFamily(fontFamily)) return null;
    result.fontFamily = fontFamily;
  }

  if (numberFormat !== undefined) {
    if (typeof numberFormat !== "string" || !isCellNumberFormat(numberFormat)) return null;
    result.numberFormat = numberFormat;
  }

  const color = sanitizeColor(style.color);
  const backgroundColor = sanitizeColor(style.backgroundColor);
  if (color === null || backgroundColor === null) return null;
  if (color !== undefined) result.color = color;
  if (backgroundColor !== undefined) result.backgroundColor = backgroundColor;

  if (align !== undefined) {
    if (align !== "left" && align !== "center" && align !== "right") return null;
    result.align = align;
  }

  if (verticalAlign !== undefined) {
    if (!isCellVerticalAlign(verticalAlign)) return null;
    result.verticalAlign = verticalAlign;
  }

  if (border !== undefined) {
    const borders = sanitizeBorders(border);
    if (!borders) return null;
    result.border = borders;
  }
  return result;
}
