import { initSheetwrite } from "@sheetwrite/core";

/**
 * Load `@sheetwrite/xlsx` on first use and install its add-on. The import is
 * dynamic because the page shows that XLSX code stays out of the first chunk.
 */
export async function installXlsx(): Promise<void> {
  const { xlsxAddon: xlsx_addon } = await import("@sheetwrite/xlsx");

  await initSheetwrite({ addons: [xlsx_addon()] });
}

/**
 * Load `@sheetwrite/charts` on first use and install its add-on. The import is
 * dynamic because the page shows that chart code stays out of the first chunk.
 */
export async function installCharts(): Promise<void> {
  const { chartsAddon: charts_addon } = await import("@sheetwrite/charts");

  await initSheetwrite({ addons: [charts_addon()] });
}
