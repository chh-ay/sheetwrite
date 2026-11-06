import type { SheetwriteAddon } from "@sheetwrite/core";

import { sheetwriteTableExportBackend } from "./table-export.js";
import { sheetwriteTableImportBackend } from "./table-import.js";
import { sheetwriteWorkbookBackend } from "./workbook.js";

/**
 * The XLSX add-on. It installs the workbook and table XLSX backends that
 * core's `fromXlsx*` and `toXlsx*` functions and `grid.exportXlsx` use.
 *
 * @example
 * ```ts
 * import { fromXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 *
 * await initSheetwrite({ addons: [xlsxAddon()] });
 * async function open(file: File) {
 *   return fromXlsxWorkbook(await file.arrayBuffer());
 * }
 * ```
 * @see /docs/import-export/xlsx-export/
 */
export function xlsxAddon(): SheetwriteAddon {
  return {
    name: "xlsx",
    setup(context) {
      context.xlsx({
        workbook: sheetwriteWorkbookBackend,
        tableImport: sheetwriteTableImportBackend,
        tableExport: sheetwriteTableExportBackend,
      });
    },
  };
}
