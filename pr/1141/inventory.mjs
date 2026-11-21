// node inventory.mjs <base> <out.json>: on the spreadsheet showcase, every
// ribbon tab at widths 1440..320 in 20 px steps, with and without the Sort
// panel: the visible buttons that show an icon without visible label text.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
await page.waitForTimeout(2500);
const found = new Map();
const scan = () => page.evaluate(() => {
  const ribbon = document.querySelector(".sheetwrite-ribbon");
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden"; };
  const clipped = (el, stop) => { for (let n = el; n && n !== stop.parentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.clipPath === "inset(50%)" || s.display === "none") return true; } return false; };
  const hasText = (button) => {
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      const r = range.getBoundingClientRect();
      if (r.width > 2 && !clipped(t.parentElement, button)) return true;
    }
    return false;
  };
  return [...ribbon.querySelectorAll("button, [role=button]")].filter((b) => shown(b)).filter((b) => {
    const icon = b.querySelector("svg, .sheetwrite-icon");
    return icon && shown(icon) && !hasText(b);
  }).map((b) => ({ name: b.getAttribute("aria-label") ?? b.title ?? "", where: b.closest(".sheetwrite-ribbon-row") ? "dense row" : b.closest(".sheetwrite-ribbon-group") ? `group ${b.closest(".sheetwrite-ribbon-group").getAttribute("aria-label")} size=${b.closest(".sheetwrite-ribbon-group").dataset.size}` : "tab row" }));
});
for (const panel of [false, true]) {
  if (panel) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("tab", { name: "Data" }).click();
    await page.getByRole("button", { name: "Custom Sort", exact: false }).first().click();
    await page.waitForTimeout(500);
  }
  for (let width = 1440; width >= 320; width -= 20) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const tabs = await page.locator(".sheetwrite-ribbon-tabs [role=tab]").allTextContents();
    for (const [index, tab] of tabs.entries()) {
      const handle = page.locator(".sheetwrite-ribbon-tabs [role=tab]").nth(index);
      if (!(await handle.isVisible())) continue;
      await handle.click();
      await page.waitForTimeout(80);
      for (const hit of await scan()) {
        const key = `${panel ? "panel" : "no panel"}|${tab}|${hit.where}|${hit.name}`;
        const prev = found.get(key) ?? [];
        prev.push(width); found.set(key, prev);
      }
    }
  }
}
const rows = [...found.entries()].map(([k, w]) => ({ key: k, widths: `${Math.max(...w)}..${Math.min(...w)} (${w.length})` }));
writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(rows.length);
await browser.close();
