// node measure.mjs <base> <outdir> <axe.min.js>
// axe-core on the grid pages (light and dark), the label contrast and the
// 390 px tab bar screenshots, and the grid's focus exits.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [base, out, axePath] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const axeSource = readFileSync(axePath, "utf8");
const PATHS = ["/react/", "/vue/", "/svelte/", "/vanilla/", "/showcases/spreadsheet/", "/showcases/collaboration/",
  "/showcases/formatting/", "/showcases/host-rows/", "/showcases/interoperability/", "/showcases/formula-assist/",
  "/showcases/queries/", "/showcases/recalculation/", "/showcases/version-history/", "/showcases/sort/",
  "/showcases/functions/", "/showcases/dashboards/", "/showcases/data-model/", "/showcases/database/"];
const RULES = ["aria-required-children", "aria-valid-attr-value", "color-contrast", "aria-prohibited-attr",
  "label-content-name-mismatch", "scrollable-region-focusable", "aria-allowed-attr", "aria-required-parent"];
const browser = await chromium.launch();
const lines = [];
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  for (const p of PATHS) {
    const rec = { path: p, theme };
    try {
      await page.goto(base + p, { waitUntil: "load", timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.addScriptTag({ content: axeSource });
      rec.violations = await page.evaluate(async (rules) => {
        const res = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return res.violations.filter((v) => rules.includes(v.id)).map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}`) }));
      }, RULES);
    } catch (e) { rec.error = String(e.message).slice(0, 200); }
    lines.push(JSON.stringify(rec));
  }
  await ctx.close();
}
writeFileSync(`${out}/axe.jsonl`, lines.join("\n") + "\n");

// #988: the fx label and the status, light theme.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("sheetwrite-theme", "light"); } catch {} });
  const page = await ctx.newPage();
  const report = [];
  for (const [p, sel] of [["/vanilla/", ".sheetwrite-shell-formula-row"], ["/showcases/recalculation/", ".sheetwrite-shell-formula-row"], ["/svelte/", ".sheetwrite-shell-status"], ["/showcases/spreadsheet/", ".sheetwrite-shell-bottom-row"]]) {
    await page.goto(base + p, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const el = page.locator(sel).first();
    if (await el.count()) await el.screenshot({ path: `${out}/988${p.replaceAll("/", "_")}${sel.replace(".sheetwrite-shell-", "")}.png` });
    report.push(p, JSON.stringify(await page.evaluate(() => [".sheetwrite-shell-fx", ".sheetwrite-shell-mode"].map((s) => {
      const e = document.querySelector(s); if (!e) return [s, null];
      const cs = getComputedStyle(e); let o = 1; for (let n = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return [s, cs.color, "opacity", o];
    }))));
  }
  writeFileSync(`${out}/988-colors.txt`, report.join("\n") + "\n");
  await ctx.close();
}

// #990: 390 px phone, touch.
for (const name of ["chromium"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(base + "/showcases/spreadsheet/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const row = page.locator(".sheetwrite-shell-bottom-row").first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await row.screenshot({ path: `${out}/990-row-390.png` });
  await page.screenshot({ path: `${out}/990-full-390.png` });
  const geo = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
    const add = document.querySelector(".sheetwrite-tab-add"); const tabs = document.querySelector(".sheetwrite-shell-tabs");
    const b = add?.getBoundingClientRect();
    const hit = b ? document.elementFromPoint(b.right - 3, b.top + b.height / 2) : null;
    return { add: r(".sheetwrite-tab-add"), tabs: r(".sheetwrite-shell-tabs"), tabsScroll: tabs ? [tabs.scrollWidth, tabs.clientWidth] : null, status: r(".sheetwrite-shell-status"), statusText: document.querySelector(".sheetwrite-shell-status")?.textContent, rightOfAdd: hit ? `${hit.tagName}.${hit.className}` : null };
  });
  writeFileSync(`${out}/990-geometry.json`, JSON.stringify(geo, null, 2));
  await ctx.close();
}

// #986: the focus after each key, from the focused grid.
{
  const res = [];
  for (const path of ["/showcases/spreadsheet/", "/vanilla/", "/showcases/sort/"]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(base + path, { waitUntil: "load" });
    await p.waitForTimeout(2000);
    const host = p.locator(".sheetwrite").first();
    const where = () => p.evaluate(() => { const a = document.activeElement; const h = document.querySelector(".sheetwrite"); return `${h && h.contains(a) ? "IN GRID" : "outside"}: ${a.tagName.toLowerCase()}.${String(a.className).slice(0, 40)} ${a.getAttribute("aria-label") ?? ""}`; });
    for (const keys of [["Tab"], ["Shift+Tab"], ["Escape", "Tab"], ["Escape", "Shift+Tab"], ["F6"], ["Shift+F6"], ["F6", "F6"], ["F6", "F6", "F6"]]) {
      await host.focus();
      for (const k of keys) await p.keyboard.press(k);
      res.push(`${path} ${keys.join(" then ")} -> ${await where()}`);
    }
    await p.close();
  }
  writeFileSync(`${out}/986-focus.log`, res.join("\n") + "\n");
}
await browser.close();
console.log("done");
