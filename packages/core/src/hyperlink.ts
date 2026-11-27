import { sanitizeCellStyle } from "./cell-style-fields.js";
import { SheetwriteError } from "./errors.js";
import {
  dataProperties,
  hasControlCharacters,
  NUL_CHARACTER,
  sanitizeRange,
} from "./plain-data.js";
import type { CellHyperlink, HyperlinkTarget } from "./types/cell.js";
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

const HYPERLINK_KEYS = new Set(["id", "range", "target", "display", "style"]);
const TARGET_KEYS = new Set(["kind", "url", "range"]);

/**
 * Validate, but never activate or fetch, an external hyperlink target.
 *
 * @param url - The link target, such as `https://example.com`.
 * @returns `true` only for a bounded `https:` URL without user name or password, or a `mailto:` address.
 */
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

/**
 * Whether a hyperlink ID may be stored.
 *
 * @param id - An ID from outside your code, such as a pasted hyperlink's.
 * @returns `true` when the ID is 1 to the maximum length, has no space at either end, and no control characters.
 */
export function isValidHyperlinkId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= MAX_HYPERLINK_ID_LENGTH &&
    id === id.trim() &&
    !hasControlCharacters(id)
  );
}

function sanitize_target(value: unknown): HyperlinkTarget | null {
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

/**
 * Sanitize one untrusted clipboard/snapshot value without cloning its object graph.
 *
 * @param value - A hyperlink from outside your code, such as parsed JSON.
 * @returns A new hyperlink with only the known fields, or `null` when any part is invalid or unsafe.
 */
export function sanitizeCellHyperlink(value: unknown): CellHyperlink | null {
  const link = dataProperties(value, HYPERLINK_KEYS);
  if (!link || typeof link.id !== "string" || !isValidHyperlinkId(link.id)) return null;
  const range = sanitizeRange(link.range);
  const target = sanitize_target(link.target);
  if (!range || !target) return null;
  if (
    link.display !== undefined &&
    (typeof link.display !== "string" ||
      link.display.length > MAX_HYPERLINK_DISPLAY_LENGTH ||
      link.display.includes(NUL_CHARACTER))
  ) {
    return null;
  }
  const style = link.style === undefined ? undefined : sanitizeCellStyle(link.style);
  if (style === null) return null;
  return {
    id: link.id,
    range,
    target,
    ...(link.display !== undefined ? { display: link.display } : {}),
    ...(style !== undefined ? { style } : {}),
  };
}

/**
 * Shape/security validation shared by mutation, snapshot, clipboard, and activation barriers.
 *
 * @param value - A hyperlink from outside your code.
 * @returns `true` when {@link sanitizeCellHyperlink} accepts `value`; nothing is copied.
 */
export function isValidCellHyperlink(value: unknown): value is CellHyperlink {
  return sanitizeCellHyperlink(value) !== null;
}

/** Clone one validated hyperlink into an independent plain-data value. */
export function cloneCellHyperlink(link: CellHyperlink): CellHyperlink {
  const cloned = sanitizeCellHyperlink(link);
  if (!cloned) throw new TypeError("Invalid CellHyperlink");
  return cloned;
}

/**
 * Return the first validated hyperlink covering an address, or null when none does.
 *
 * @returns A copy of the hyperlink, or `null`.
 */
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
  const sanitized = sanitize_target(target);
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

let fallback_id = 0;

/** Produce a new stable identity for copied hyperlinks without trusting clipboard IDs. */
export function createHyperlinkId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `link-${crypto.randomUUID()}`;
  }
  fallback_id += 1;
  return `link-${Date.now().toString(36)}-${fallback_id.toString(36)}`;
}
