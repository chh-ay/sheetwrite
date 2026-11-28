import { SheetwriteError } from "./errors.js";
import type { XlsxResourceLimits } from "./types/xlsx.js";

/**
 * Codec defaults combine SpreadsheetML worksheet dimensions with independent
 * ZIP/XML and aggregate-work ceilings for untrusted in-memory conversion.
 */
export const DEFAULT_XLSX_RESOURCE_LIMITS: Readonly<XlsxResourceLimits> = Object.freeze({
  // Bound caller input and the single returned byte array.
  maxInputBytes: 32 * 1024 * 1024,
  maxOutputBytes: 128 * 1024 * 1024,
  // Bound archive fan-out and decompression, including zip-bomb ratios.
  maxArchiveEntries: 1_024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxPreservedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 100,
  // SpreadsheetML worksheet compatibility dimensions.
  maxSheets: 256,
  maxRowsPerSheet: 1_048_576,
  maxColumnsPerSheet: 16_384,
  // Bound aggregate conversion collections.
  maxCells: 1_000_000,
  maxMerges: 100_000,
  maxSharedStrings: 1_000_000,
  maxStyles: 65_536,
  // Bound each hand-parsed XML part independently.
  maxXmlElements: 2_000_000,
  maxXmlDepth: 64,
  maxXmlAttributesPerElement: 128,
  maxXmlTextBytes: 16 * 1024 * 1024,
});

/** Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data. */
export class XlsxResourceError extends SheetwriteError {
  /** Always `"XlsxResourceError"`. */
  override readonly name = "XlsxResourceError";
  /** Always `"xlsx-resource-limit"`. */
  declare readonly code: "xlsx-resource-limit";

  /** Creates the error for an `import` or `export` that found `actual` above `limit` for `resource`. */
  constructor(
    /** Which limit the file went over, such as `maxCells`. */
    readonly resource: keyof XlsxResourceLimits,
    /** The limit in force, in that resource's unit (cells, bytes, entries). */
    readonly limit: number,
    /** The size found in the file, in the same unit; above `limit`. */
    readonly actual: number,
    operation: "import" | "export",
  ) {
    super(
      "xlsx-resource-limit",
      `xlsx-${operation}`,
      `Sheetwrite: XLSX ${operation} ${resource} limit is ${limit}; observed ${actual}`,
      { context: { format: "xlsx", resource, limit, actual } },
    );
  }
}
