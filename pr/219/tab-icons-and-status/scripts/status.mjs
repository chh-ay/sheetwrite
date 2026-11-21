// node status.mjs <base> <outdir>: the spreadsheet shell's bottom row with a
// large selection, at 1440, 834, 720 and 390 px; and the overlap of the tab
// strip and the status at every width from 1440 down to 320 in 10 px steps.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__sheetwriteSpreadsheetGrid;
  for (const name of ["Dashboard", "Orders", "Report", "Pivot", "Formulas", "History"]) g.addSheet({ id: name.toLowerCase(), name, rowCount: 5, columns: [{ key: "a", header: "A", width: 80, type: "general" }] });
  g.setActiveSheet("sales");
});
const nameBox = page.getByRole("textbox", { name: "Cell reference" });
await nameBox.fill("A1:G50");
await nameBox.press("Enter");
await page.waitForTimeout(800);
const rows = [];
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const WIDTHS = [...Array.from({ length: 113 }, (_, i) => 1440 - i * 10), 834].sort((a, b) => b - a);
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await frames();
  const row = page.locator(".sheetwrite-shell-bottom-row").first();
  if ([1440, 834, 720, 390].includes(width)) { await row.scrollIntoViewIfNeeded(); await frames(); await row.screenshot({ path: `${out}/status-${width}.png` }); }
  rows.push(await page.evaluate((w) => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const tabs = r(".sheetwrite-shell-tabs"), status = r(".sheetwrite-shell-status");
    const parts = document.querySelector(".sheetwrite-shell-status-parts");
    const shown = parts ? [...parts.children].filter((p) => p.offsetParent !== null).map((p) => p.textContent.split(":")[0]) : null;
    return { width: w, overlap: Math.round((tabs.right - status.left) * 10) / 10, statusText: document.querySelector(".sheetwrite-shell-status")?.innerText.replace(/\s+/g, " ").trim(), shown };
  }, width));
}
writeFileSync(`${out}/status.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
await browser.close();
