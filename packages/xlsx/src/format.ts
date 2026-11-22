/**
 * Format contracts that the XLSX reader and writer share: OOXML namespaces,
 * the hidden metadata sheet, Excel's column width units and ISO dates.
 */

import { dateToSerial } from "@sheetwrite/core";

/** SpreadsheetML, as written; `MAIN_NAMESPACES` also accepts Strict OOXML. */
export const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export const MAIN_NAMESPACES = [MAIN_NS, "http://purl.oclc.org/ooxml/spreadsheetml/main"] as const;

/** DrawingML, as written; `DRAWINGML_NAMESPACES` also accepts Strict OOXML. */
export const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const DRAWINGML_NAMESPACES = [
  DRAWINGML_NS,
  "http://purl.oclc.org/ooxml/drawingml/main",
] as const;

/** Office document relationship types (`r:` attributes), as written and in Strict OOXML. */
export const RELATIONSHIPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const STRICT_RELATIONSHIPS_NS = "http://purl.oclc.org/ooxml/officeDocument/relationships";

/** OPC package parts: `.rels` parts and `[Content_Types].xml`. */
export const PACKAGE_RELATIONSHIPS_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
export const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

/** Name prefix of the hidden sheet that holds Sheetwrite's workbook metadata. */
export const META_STEM = "__sheetwrite_meta__";
/** First cell of that sheet, which marks it as Sheetwrite's metadata. */
export const META_MARKER = "sheetwrite-workbook-metadata-v1";

/** Excel's maximum digit width for Calibri 11, in pixels. */
const MAXIMUM_DIGIT_WIDTH_PX = 7;
/** `CT_Col` widths are stored in 1/256ths of a character. */
const COLUMN_WIDTH_FRACTIONS = 256;

/**
 * Pixels of a `CT_Col` width in characters. The width already includes the
 * five pixels of padding. ECMA-376's half-digit rounding is truncated before
 * characters convert to pixels.
 */
export function columnWidthPixels(width: number): number {
  return Math.max(
    1,
    Math.floor(
      ((COLUMN_WIDTH_FRACTIONS * width +
        Math.floor(COLUMN_WIDTH_FRACTIONS / 2 / MAXIMUM_DIGIT_WIDTH_PX)) /
        COLUMN_WIDTH_FRACTIONS) *
        MAXIMUM_DIGIT_WIDTH_PX,
    ),
  );
}

/** The `CT_Col` width in characters, to 1/256th, of a column `pixels` wide. */
export function columnWidthCharacters(pixels: number): number {
  return (
    Math.floor((pixels / MAXIMUM_DIGIT_WIDTH_PX) * COLUMN_WIDTH_FRACTIONS) / COLUMN_WIDTH_FRACTIONS
  );
}

const TIME_ZONE_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/i;
const DATE_TIME_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * The 1900-system serial of an ISO 8601 date (`t="d"` cells, pivot `d`
 * items), or undefined when it is not one. A date-time without a zone is UTC,
 * like a date without a time.
 */
export function isoDateSerial(text: string): number | undefined {
  const unzoned_date_time = DATE_TIME_PREFIX.test(text) && !TIME_ZONE_SUFFIX.test(text);
  const date = new Date(unzoned_date_time ? `${text}Z` : text);
  return Number.isFinite(date.getTime()) ? dateToSerial(date) : undefined;
}
