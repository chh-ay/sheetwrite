// node overflow.mjs <base> <outdir>: the shell's bottom row with nine sheets
// at 1440, 834 and 390 px, light and dark, DPR 2; and, where the arrows show,
// the list of all sheets opened from the trailing arrow.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];
for (const theme of ["light", "dark"]) for (const width of [1440, 834, 390]) {
  const touch = width <= 834;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: touch, isMobile: width <= 390 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const g = window.__sheetwriteSpreadsheetGrid;
    for (const name of ["Dashboard", "Orders", "Report", "Pivot", "Formulas", "History"]) g.addSheet({ id: name.toLowerCase(), name, rowCount: 5, columns: [{ key: "a", header: "A", width: 80, type: "general" }] });
    g.setActiveSheet("sales");
  });
  await page.waitForTimeout(500);
  const row = page.locator(".sheetwrite-shell-bottom-row").first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await row.screenshot({ path: `${out}/${theme}-${width}-row.png` });
  const info = await page.evaluate(() => {
    const arrows = [...document.querySelectorAll(".sheetwrite-shell-tabs .sheetwrite-tab-scroll")].map((a) => ({ name: a.getAttribute("aria-label"), shown: a.offsetWidth > 0, disabled: a.getAttribute("aria-disabled"), w: a.offsetWidth, h: a.offsetHeight }));
    const strip = document.querySelector(".sheetwrite-shell-tabs");
    return { arrows, scroll: [strip.scrollWidth, strip.clientWidth], tabs: [...strip.querySelectorAll(".sheetwrite-tab")].length };
  });
  rows.push({ theme, width, ...info });
  const next = page.locator(".sheetwrite-shell-tabs .sheetwrite-tab-scroll-next");
  if (await next.isVisible().catch(() => false)) {
    await next.click({ button: "right" });
    await page.waitForTimeout(300);
    const box = await row.boundingBox();
    const list = await page.locator(".sheetwrite-tab-list").boundingBox();
    if (box && list) {
      const top = Math.min(box.y, list.y) - 8, bottom = Math.max(box.y + box.height, list.y + list.height) + 8;
      await page.screenshot({ path: `${out}/${theme}-${width}-list.png`, clip: { x: Math.max(0, box.x), y: Math.max(0, top), width: box.width, height: bottom - top } });
    }
  }
  await ctx.close();
}
writeFileSync(`${out}/overflow.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
await browser.close();
