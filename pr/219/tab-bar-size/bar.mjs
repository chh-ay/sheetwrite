// node bar.mjs <base> <outdir>: the sheet-tab bar on each page, width and theme:
// a screenshot of the bar, and its sizes, the grid area above it and layout shifts.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PAGES = ["/showcases/spreadsheet/", "/react/", "/vue/", "/svelte/", "/vanilla/"];
const WIDTHS = [1440, 834, 390, 320];
const browser = await chromium.launch();
const report = [];
for (const theme of ["light", "dark"]) {
  for (const width of WIDTHS) {
    const mobile = width <= 834;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: mobile, isMobile: mobile && width <= 390 });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem("sheetwrite-theme", t); } catch {}
      window.__shifts = [];
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, nodes: e.sources?.map((s) => s.node?.className?.toString?.().slice(0, 60)) }); }).observe({ type: "layout-shift", buffered: true });
    }, theme);
    const page = await ctx.newPage();
    for (const p of PAGES) {
      const rec = { theme, width, page: p };
      try {
        await page.goto(base + p, { waitUntil: "load", timeout: 45000 });
        await page.waitForTimeout(2500);
        const bar = page.locator(".sheetwrite-shell-bottom-row, .sheetwrite-tabbar").first();
        if (await bar.count()) {
          await bar.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await bar.screenshot({ path: `${out}/${theme}-${width}${p.replaceAll("/", "_")}bar.png` });
        }
        Object.assign(rec, await page.evaluate(() => {
          const q = (s) => document.querySelector(s);
          const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height * 10) / 10 }; };
          const fs = (e) => e ? getComputedStyle(e).fontSize : null;
          const bar = q(".sheetwrite-shell-bottom-row") ?? q(".sheetwrite-tabbar");
          const add = q(".sheetwrite-tab-add");
          const vp = (q(".sheetwrite-shell-grid") ?? bar?.closest(".sheetwrite"))?.querySelector(".sheetwrite-viewport");
          const hit = add ? (() => { const b = add.getBoundingClientRect(); return add.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); })() : null;
          return {
            kind: q(".sheetwrite-shell-bottom-row") ? "shell" : "grid bar",
            bar: box(bar), tab: box(q(".sheetwrite-tab")), tabFont: fs(q(".sheetwrite-tab")), activeFont: fs(q(".sheetwrite-tab-active")),
            add: box(add), addIcon: box(add?.querySelector("svg")), more: box(q(".sheetwrite-tab-options-button")), moreIcon: box(q(".sheetwrite-tab-options-button svg")),
            status: q(".sheetwrite-shell-mode")?.textContent ?? null, statusFont: fs(q(".sheetwrite-shell-status")), viewport: box(vp),
            addTapReachesAdd: hit, shifts: window.__shifts,
          };
        }));
      } catch (e) { rec.error = String(e.message).slice(0, 160); }
      report.push(rec);
    }
    await ctx.close();
  }
}
writeFileSync(`${out}/bar.jsonl`, report.map((r) => JSON.stringify(r)).join("\n") + "\n");
await browser.close();
console.log("done", report.length);
