import { initSheetwrite } from "@sheetwrite/core";

/**
 * Load `@sheetwrite/xlsx` on first use and install its add-on. The import is
 * dynamic because the page shows that XLSX code stays out of the first chunk.
 */
export async function installXlsx(): Promise<void> {
  const { xlsxAddon } = await import("@sheetwrite/xlsx");

  await initSheetwrite({ addons: [xlsxAddon()] });
}

/**
 * Load `@sheetwrite/charts` on first use and install its add-on. The import is
 * dynamic because the page shows that chart code stays out of the first chunk.
 */
export async function installCharts(): Promise<void> {
  const { chartsAddon } = await import("@sheetwrite/charts");

  await initSheetwrite({ addons: [chartsAddon()] });
}
