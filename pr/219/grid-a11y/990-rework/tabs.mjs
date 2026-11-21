// node tabs.mjs <base> <outdir>: the shell's bottom row at 390 and 320 px, touch.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const geo = {};
for (const width of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const row = page.locator(".sheetwrite-shell-bottom-row").first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await row.screenshot({ path: `${out}/990-row-${width}.png` });
  geo[width] = await page.evaluate(() => {
    const r = (e) => { const b = e?.getBoundingClientRect(); return b ? [Math.round(b.left), Math.round(b.right)] : null; };
    const add = document.querySelector(".sheetwrite-tab-add"); const tabs = document.querySelector(".sheetwrite-shell-tabs");
    const active = document.querySelector(".sheetwrite-shell-tabs .sheetwrite-tab-active");
    const b = add.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { add: r(add), tabs: r(tabs), tabsScroll: [tabs.scrollWidth, tabs.clientWidth], active: r(active), status: r(document.querySelector(".sheetwrite-shell-status")), statusText: document.querySelector(".sheetwrite-shell-mode")?.textContent, centreOfAddIsAdd: add.contains(hit) };
  });
  await ctx.close();
}
writeFileSync(`${out}/990-geometry.json`, JSON.stringify(geo, null, 2));
await browser.close();
