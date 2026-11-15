import "@sheetwrite/core/styles.css";
import { createGrid, initSheetwrite } from "@sheetwrite/core";

import { observeSiteTheme } from "../lib/site-theme.js";
import { siteGridTheme } from "../showcases/site-grid-theme.js";
import { LIVE_WORKBOOKS } from "./live-workbooks.js";

/**
 * Mount the live grid `name` in `host` on the default engine, in the site's
 * theme, and follow theme changes. Resolves the teardown.
 */
export async function mountLiveGrid(host: HTMLElement, name: string): Promise<() => void> {
  const load = LIVE_WORKBOOKS[name];
  if (load === undefined) throw new Error(`No live workbook named "${name}"`);
  const { workbook, data } = load();
  await initSheetwrite();
  const grid = createGrid(host, { workbook, data, theme: siteGridTheme(host) });
  const stopTheme = observeSiteTheme(() => grid.replaceTheme(siteGridTheme(host)));
  return () => {
    stopTheme();
    grid.destroy();
  };
}
