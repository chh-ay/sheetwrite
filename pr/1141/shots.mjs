// node shots.mjs <base> <outdir>: the ribbon on the Data tab with the Sort
// panel open at 1440 and 834 px, and the compact ribbon at 600 px; light and
// dark, DPR 2.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) for (const width of [1440, 1240, 834, 600]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.getByRole("tab", { name: "Data" }).click();
  // At narrow widths Sort & Filter is collapsed: open it, then Custom Sort.
  const customSort = page.getByRole("button", { name: "Custom Sort" }).first();
  if (!(await customSort.isVisible())) {
    await page.locator('.sheetwrite-ribbon-group[aria-label="Sort & Filter"] .sheetwrite-ribbon-group-button').click();
  }
  await page.getByRole("button", { name: "Custom Sort" }).first().click();
  await page.waitForTimeout(600);
  const ribbon = page.locator(".sheetwrite-ribbon").first();
  await ribbon.screenshot({ path: `${out}/${theme}-${width}-data-sort.png` });
  const group = page.locator('.sheetwrite-ribbon-group[aria-label="Show/Hide"] .sheetwrite-ribbon-group-button');
  if (await group.isVisible().catch(() => false)) {
    await group.click();
    await page.waitForTimeout(300);
    const r = await ribbon.boundingBox();
    await page.screenshot({ path: `${out}/${theme}-${width}-show-hide-open.png`, clip: { x: 0, y: r.y, width, height: Math.min(900 - r.y, r.height + 220) } });
  }
  await ctx.close();
}
await browser.close();
