/**
 * Plumbing for Sheetwrite's own codecs, such as `@sheetwrite/xlsx`. An
 * `internal` entry point: no compatibility promise, not for applications.
 *
 * It re-exports the values a codec needs from the modules that define them, so
 * loading a codec does not load the grid and the rest of the main entry point.
 *
 * @packageDocumentation
 */

export { cellA1, colToA1, labelToCol, rangeA1 } from "./a1.js";
export { isCellFontFamily } from "./cell-style-fields.js";
export {
  MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH,
  MAX_CONDITIONAL_FORMAT_RULES,
} from "./conditional-format.js";
export { dateToSerial } from "./date-serial.js";
export {
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  MAX_ITERATIONS,
  MAX_VALIDATION_FORMULA_LENGTH,
  validateBuiltWorkbookSnapshot,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
export { isSheetwriteError, SheetwriteError } from "./errors.js";
export { MAX_EXTERNAL_SHEET_AREA } from "./external-link.js";
export {
  isSafeExternalHyperlink,
  MAX_HYPERLINK_DISPLAY_LENGTH,
  MAX_HYPERLINKS_PER_SHEET,
} from "./hyperlink.js";
export { sheetNameKey } from "./name-key.js";
export { formatNumber } from "./number-format.js";
export { validateSheetName } from "./sheet-name.js";
export { isDynamicDateFilter } from "./store/autofilter.js";
export { MAX_VALIDATION_RULES } from "./store/ranges.js";
export {
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  validateWorkbookTableName,
  validWorkbookTableXmlElement,
  workbookTableNameKey,
} from "./workbook-table.js";
export { withXlsxFormulaEngine } from "./xlsx-formulas.js";
export { DEFAULT_XLSX_RESOURCE_LIMITS, XlsxResourceError } from "./xlsx-resource-limits.js";
