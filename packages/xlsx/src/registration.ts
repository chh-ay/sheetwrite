import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "@sheetwrite/core";

import { sheetwriteTableExportBackend } from "./table-export.js";
import { sheetwriteTableImportBackend } from "./table-import.js";
import { sheetwriteWorkbookBackend } from "./workbook.js";

/**
 * Register all concrete XLSX backends with the backend-neutral core contracts.
 *
 * @example
 * ```ts
 * import { registerXlsxBackends } from "@sheetwrite/xlsx";
 * import { fromXlsxWorkbook } from "@sheetwrite/core";
 *
 * registerXlsxBackends();
 * async function open(file: File) {
 *   return fromXlsxWorkbook(await file.arrayBuffer());
 * }
 * ```
 * @see /docs/import-export/xlsx-export/
 */
export function registerXlsxBackends(): void {
  setXlsxTableExportBackend(sheetwriteTableExportBackend);
  setXlsxTableImportBackend(sheetwriteTableImportBackend);
  setXlsxWorkbookBackend(sheetwriteWorkbookBackend);
}
