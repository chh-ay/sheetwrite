import { isCellFontFamily, isCellVerticalAlign } from "./cell-style-fields.js";
import { SheetwriteError } from "./errors.js";
import {
  dataProperties,
  hasControlCharacters,
  NUL_CHARACTER,
  sanitizeRange,
} from "./plain-data.js";
import type { CellBorder, CellHyperlink, CellStyle, HyperlinkTarget } from "./types/cell.js";
import type { CellAddress } from "./types/coordinates.js";
import type { Workbook } from "./types/document.js";

/** Renderer/codec ceiling for one sheet's hyperlink metadata. */
export const MAX_HYPERLINKS_PER_SHEET = 4_096;
/** Serialized identifier ceiling; IDs remain stable across history and snapshots. */
export const MAX_HYPERLINK_ID_LENGTH = 128;
/** External target ceiling, aligned with the bounded private clipboard payload. */
export const MAX_HYPERLINK_TARGET_LENGTH = 2_048;
/** Optional display text ceiling used by SpreadsheetML shared-string implementations. */
export const MAX_HYPERLINK_DISPLAY_LENGTH = 32_767;

const ENCODED_CONTROL_CHARACTERS = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;

const STYLE_KEYS = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "fontSize",
  "fontFamily",
  "color",
  "backgroundColor",
  "align",
  "verticalAlign",
  "wrap",
  "border",
]);
const BORDER_SIDES = new Set(["all", "top", "right", "bottom", "left"]);
const BORDER_KEYS = new Set(["color", "width", "style"]);
const HYPERLINK_KEYS = new Set(["id", "range", "target", "display", "style"]);
const TARGET_KEYS = new Set(["kind", "url", "range"]);

/** Validate, but never activate or fetch, an external hyperlink target. */
export function isSafeExternalHyperlink(url: string): boolean {
  if (
    url.length === 0 ||
    url.length > MAX_HYPERLINK_TARGET_LENGTH ||
    url !== url.trim() ||
    hasControlCharacters(url) ||
    ENCODED_CONTROL_CHARACTERS.test(url)
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return (
        /^https:\/\//iu.test(url) &&
        parsed.hostname.length > 0 &&
        !parsed.username &&
        !parsed.password
      );
    }
    if (parsed.protocol === "mailto:") {
      return /^mailto:[^?#\s]+(?:\?[^#\s]*)?$/iu.test(url) && parsed.pathname.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

/** Whether an identifier is bounded, non-empty, trimmed, and free of control characters. */
export function isValidHyperlinkId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= MAX_HYPERLINK_ID_LENGTH &&
    id === id.trim() &&
    !hasControlCharacters(id)
  );
}

function sanitizeColor(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) ? value : null;
}

function sanitizeBorder(value: unknown): CellBorder | null {
  const border = dataProperties(value, BORDER_KEYS);
  if (!border) return null;
  const color = sanitizeColor(border.color);
  if (color === null) return null;
  if (
    border.width !== undefined &&
    (typeof border.width !== "number" ||
      !Number.isFinite(border.width) ||
      border.width < 0 ||
      border.width > 64)
  ) {
    return null;
  }
  if (
    border.style !== undefined &&
    border.style !== "solid" &&
    border.style !== "dashed" &&
    border.style !== "dotted"
  ) {
    return null;
  }
  return {
    ...(color !== undefined ? { color } : {}),
    ...(border.width !== undefined ? { width: border.width } : {}),
    ...(border.style !== undefined ? { style: border.style } : {}),
  };
}

/** Convert an untrusted style into one bounded, plain renderer-safe value. */
export function sanitizeHyperlinkStyle(value: unknown): CellStyle | null {
  const style = dataProperties(value, STYLE_KEYS);
  if (!style) return null;
  const result: CellStyle = {};
  for (const key of ["bold", "italic", "underline", "strikethrough", "wrap"] as const) {
    const candidate = style[key];
    if (candidate !== undefined && typeof candidate !== "boolean") return null;
    if (candidate !== undefined) result[key] = candidate;
  }
  if (
    style.fontSize !== undefined &&
    (typeof style.fontSize !== "number" ||
      !Number.isFinite(style.fontSize) ||
      style.fontSize < 0 ||
      style.fontSize > 1_024)
  ) {
    return null;
  }
  if (style.fontSize !== undefined) result.fontSize = style.fontSize;
  const color = sanitizeColor(style.color);
  const backgroundColor = sanitizeColor(style.backgroundColor);
  if (color === null || backgroundColor === null) return null;
  if (color !== undefined) result.color = color;
  if (backgroundColor !== undefined) result.backgroundColor = backgroundColor;
  if (
    style.align !== undefined &&
    style.align !== "left" &&
    style.align !== "center" &&
    style.align !== "right"
  ) {
    return null;
  }
  if (style.align !== undefined) result.align = style.align;
  if (style.fontFamily !== undefined) {
    if (typeof style.fontFamily !== "string" || !isCellFontFamily(style.fontFamily)) return null;
    result.fontFamily = style.fontFamily;
  }
  if (style.verticalAlign !== undefined) {
    if (!isCellVerticalAlign(style.verticalAlign)) return null;
    result.verticalAlign = style.verticalAlign;
  }
  if (style.border !== undefined) {
    const borders = dataProperties(style.border, BORDER_SIDES);
    if (!borders) return null;
    const resultBorders: NonNullable<CellStyle["border"]> = {};
    for (const side of ["all", "top", "right", "bottom", "left"] as const) {
      if (borders[side] === undefined) continue;
      const border = sanitizeBorder(borders[side]);
      if (!border) return null;
      resultBorders[side] = border;
    }
    result.border = resultBorders;
  }
  return result;
}

function sanitizeTarget(value: unknown): HyperlinkTarget | null {
  const target = dataProperties(value, TARGET_KEYS);
  if (!target) return null;
  if (target.kind === "external") {
    return typeof target.url === "string" && isSafeExternalHyperlink(target.url)
      ? { kind: "external", url: target.url }
      : null;
  }
  if (target.kind !== "internal") return null;
  const range = sanitizeRange(target.range);
  return range ? { kind: "internal", range } : null;
}

/** Sanitize one untrusted clipboard/snapshot value without cloning its object graph. */
export function sanitizeCellHyperlink(value: unknown): CellHyperlink | null {
  const link = dataProperties(value, HYPERLINK_KEYS);
  if (!link || typeof link.id !== "string" || !isValidHyperlinkId(link.id)) return null;
  const range = sanitizeRange(link.range);
  const target = sanitizeTarget(link.target);
  if (!range || !target) return null;
  if (
    link.display !== undefined &&
    (typeof link.display !== "string" ||
      link.display.length > MAX_HYPERLINK_DISPLAY_LENGTH ||
      link.display.includes(NUL_CHARACTER))
  ) {
    return null;
  }
  const style = link.style === undefined ? undefined : sanitizeHyperlinkStyle(link.style);
  if (style === null) return null;
  return {
    id: link.id,
    range,
    target,
    ...(link.display !== undefined ? { display: link.display } : {}),
    ...(style !== undefined ? { style } : {}),
  };
}

/** Shape/security validation shared by mutation, snapshot, clipboard, and activation barriers. */
export function isValidCellHyperlink(value: unknown): value is CellHyperlink {
  return sanitizeCellHyperlink(value) !== null;
}

/** Clone one validated hyperlink into an independent plain-data value. */
export function cloneCellHyperlink(link: CellHyperlink): CellHyperlink {
  const cloned = sanitizeCellHyperlink(link);
  if (!cloned) throw new TypeError("Invalid CellHyperlink");
  return cloned;
}

/** Return the first validated hyperlink covering an address, or null when none does. */
export function hyperlinkAt(workbook: Workbook, address: CellAddress): CellHyperlink | null {
  const sheet = workbook.sheets.find((candidate) => candidate.id === address.sheet);
  if (!sheet) return null;
  for (const candidate of sheet.hyperlinks ?? []) {
    const hyperlink = sanitizeCellHyperlink(candidate);
    if (!hyperlink) continue;
    const range = hyperlink.range;
    if (
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.col >= range.start.col &&
      address.col <= range.end.col
    ) {
      return hyperlink;
    }
  }
  return null;
}

/** Host-safe target resolved immediately before hyperlink activation. */
export type ResolvedHyperlinkTarget =
  | { readonly kind: "external"; readonly href: string }
  | { readonly kind: "internal"; readonly address: CellAddress };

/** Revalidate at the final activation boundary; hosts never receive an unsafe URL. */
export function resolveHyperlinkTarget(
  workbook: Workbook,
  target: HyperlinkTarget,
): ResolvedHyperlinkTarget {
  const sanitized = sanitizeTarget(target);
  if (!sanitized) {
    throw new SheetwriteError(
      "unsafe-hyperlink",
      "hyperlink-activate",
      "Sheetwrite: hyperlink target is malformed or unsafe",
    );
  }
  if (sanitized.kind === "external") {
    return { kind: "external", href: sanitized.url };
  }
  const range = sanitized.range;
  const sheet = workbook.sheets.find((candidate) => candidate.id === range.sheet);
  if (!sheet || range.end.row >= sheet.rowCount || range.end.col >= sheet.columns.length) {
    throw new SheetwriteError(
      "unsafe-hyperlink",
      "hyperlink-activate",
      "Sheetwrite: internal hyperlink target is unavailable",
      { context: { targetSheet: range.sheet } },
    );
  }
  return {
    kind: "internal",
    address: { sheet: range.sheet, row: range.start.row, col: range.start.col },
  };
}

let fallbackId = 0;

/** Produce a new stable identity for copied hyperlinks without trusting clipboard IDs. */
export function createHyperlinkId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `link-${crypto.randomUUID()}`;
  }
  fallbackId += 1;
  return `link-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}
