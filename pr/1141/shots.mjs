// node shots.mjs <base> <outdir>: the ribbon on the Data tab with the Sort
// panel open at 1440, 1240, 834 and 600 px (compact), then Show/Hide opened,
// or More when Show/Hide has folded into it; light and dark, DPR 2.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const more = (page) => page.locator(".sheetwrite-ribbon-panel:not([hidden]) > .sheetwrite-ribbon-more-groups");
for (const theme of ["light", "dark"]) for (const width of [1440, 1240, 834, 600]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.getByRole("tab", { name: "Data" }).click();
  // At narrow widths Sort & Filter is collapsed, or folded into More.
  const customSort = page.getByRole("button", { name: "Custom Sort" }).first();
  if (!(await customSort.isVisible())) {
    const sortGroup = page.locator('.sheetwrite-ribbon-group[aria-label="Sort & Filter"] .sheetwrite-ribbon-group-button');
    if (await sortGroup.isVisible()) await sortGroup.click(); else await more(page).click();
  }
  await page.getByRole("button", { name: "Custom Sort" }).first().click();
  await page.waitForTimeout(600);
  const ribbon = page.locator(".sheetwrite-ribbon").first();
  await ribbon.screenshot({ path: `${out}/${theme}-${width}-data-sort.png` });
  const group = page.locator('.sheetwrite-ribbon-group[aria-label="Show/Hide"] .sheetwrite-ribbon-group-button');
  let name = "show-hide-open";
  if (await group.isVisible()) await group.click();
  else if (await more(page).isVisible()) { await page.keyboard.press("Escape"); await ribbon.evaluate((e) => e.scrollIntoView({ block: "start" })); await page.waitForTimeout(300); await more(page).click(); name = "more-open"; }
  else name = undefined;
  if (name !== undefined) {
    await page.waitForTimeout(300);
    const r = await ribbon.boundingBox();
    await page.screenshot({ path: `${out}/${theme}-${width}-${name}.png`, clip: { x: 0, y: r.y, width, height: Math.min(900 - r.y, r.height + 420) } });
  }
  await ctx.close();
}
await browser.close();
