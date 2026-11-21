// Runs realistic queries through the docs search dialog with the keyboard only.
// Usage: node search-check.mjs <base> <outdir>
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
// [query, accepted page prefixes (any match in the top 3 passes)]
const Q = [
  ["createGrid", ["/docs/api/core/create-grid/"]],
  ["initSheetwrite", ["/docs/api/core/init-sheetwrite/"]],
  ["XLOOKUP", ["/docs/reference/formula-functions/lookup-reference/"]],
  ["VLOOKUP", ["/docs/reference/formula-functions/lookup-reference/"]],
  ["SUMIFS", ["/docs/reference/formula-functions/math/"]],
  ["LAMBDA", ["/docs/reference/formula-functions/logical-control/", "/docs/features/formulas/analysis-formulas/"]],
  ["INDIRECT", ["/docs/reference/formula-functions/lookup-reference/", "/docs/features/formulas/offset-and-indirect/"]],
  ["SheetwriteGrid", ["/docs/api/react/sheetwrite-grid/"]],
  ["conditional formatting", ["/docs/features/formatting/conditional-formats/"]],
  ["pivot table", ["/docs/features/analysis/pivot-tables/"]],
  ["import xlsx", ["/docs/import-export/xlsx-import/"]],
  ["export to excel", ["/docs/import-export/xlsx-export/"]],
  ["csv", ["/docs/import-export/csv-and-tsv/"]],
  ["undo redo", ["/docs/features/grid/editing-and-clipboard/"]],
  ["keyboard shortcuts", ["/docs/features/grid/keyboard-shortcuts/"]],
  ["#SPILL!", ["/docs/features/formulas/dynamic-arrays-and-spills/", "/docs/concepts/error-handling/"]],
  ["#REF!", ["/docs/concepts/error-handling/", "/docs/reference/formula-functions/information-error/", "/docs/features/formulas/authoring-and-references/"]],
  ["custom function", ["/docs/features/formulas/custom-functions/"]],
  ["how do I freeze rows", ["/docs/features/data/data-operations/"]],
  ["how do I add a dropdown list to a cell", ["/docs/features/data/validation-protection-and-notes/"]],
  ["how do I use sheetwrite with react", ["/docs/frameworks/react/", "/docs/tutorials/excel-in-react/"]],
  ["dark theme", ["/docs/api/core/theme/", "/docs/features/grid/options-and-presentation/"]],
  ["charts", ["/docs/features/analysis/charts/"]],
  ["real-time collaboration", ["/docs/features/collaboration/"]],
  ["number format", ["/docs/features/formatting/number-formats/"]],
  ["large xlsx file streaming", ["/docs/import-export/large-files-and-streaming/"]],
  ["web worker", ["/docs/features/worker-rendering/"]],
  ["upgrade to 0.7.0", ["/docs/start/upgrade-to-0-7-0/"]],
  ["merge cells", ["/docs/features/grid/resize-merge-and-fill/"]],
  ["autofilter", ["/docs/features/data/autofilter/"]],
  ["copy and paste", ["/docs/features/grid/editing-and-clipboard/"]],
  ["WebAssembly failed to load", ["/docs/start/installation/", "/docs/concepts/error-handling/"]],
  ["screen reader", ["/docs/features/accessibility/"]],
  ["libreoffice", ["/docs/import-export/libreoffice-compatibility/"]],
  ["datasource", ["/docs/features/data/datasources/"]],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const rows = [];
for (const [q, want] of Q) {
  await page.goto(`${base}/docs/`, { waitUntil: "load" });
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".sw-search-dialog[open]", { timeout: 5000 });
  await page.keyboard.type(q, { delay: 10 });
  let hrefs = [];
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    hrefs = await page.$$eval(".sw-search-results [role=option]", (els) => els.map((e) => new URL(e.href).pathname + new URL(e.href).hash));
    const status = await page.$eval(".sw-search-status", (e) => (e.hidden ? "" : e.textContent));
    if (hrefs.length || /No results/.test(status)) break;
  }
  await page.waitForTimeout(300);
  hrefs = await page.$$eval(".sw-search-results [role=option]", (els) => els.map((e) => new URL(e.href).pathname + new URL(e.href).hash));
  // Top 3 distinct pages, as a reader sees them.
  const pages = [...new Set(hrefs.map((h) => h.split("#")[0]))];
  const rank = pages.findIndex((p) => want.includes(p)) + 1;
  rows.push({ q, rank, top3: pages.slice(0, 3), firstEntries: hrefs.slice(0, 4) });
  console.log(rank >= 1 && rank <= 3 ? "PASS" : "FAIL", rank, JSON.stringify(q), pages.slice(0, 3).join(" | "));
  if (!(rank >= 1 && rank <= 3)) await page.screenshot({ path: `${out}/shots/search-${q.replace(/\W+/g, "_")}.png` });
}
writeFileSync(`${out}/search.json`, JSON.stringify(rows, null, 2));
// Keyboard: arrow down twice, Enter opens the highlighted result.
await page.goto(`${base}/docs/`, { waitUntil: "load" });
await page.keyboard.press("/");
await page.keyboard.type("pivot table", { delay: 10 });
await page.waitForSelector(".sw-search-results [role=option]");
await page.waitForTimeout(400);
await page.keyboard.press("ArrowDown");
const sel = await page.$eval("[role=combobox]", (e) => [e.getAttribute("aria-activedescendant"), document.getElementById(e.getAttribute("aria-activedescendant"))?.getAttribute("href")]);
await page.screenshot({ path: `${out}/shots/search-keyboard-1440.png` });
await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
console.log("keyboard: activedescendant", sel, "-> navigated to", new URL(page.url()).pathname + new URL(page.url()).hash);
// Escape closes and focus returns to the opener.
await page.goto(`${base}/docs/`, { waitUntil: "load" });
await page.click(".sw-search-button");
await page.waitForSelector(".sw-search-dialog[open]");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
console.log("escape: open=", await page.$eval(".sw-search-dialog", (d) => d.open), "focus=", await page.evaluate(() => document.activeElement?.className));
// Mobile 390 px.
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(`${base}/docs/start/installation/`, { waitUntil: "load" });
const opener = await m.$$eval("[data-search-open]", (els) => els.map((e) => ({ cls: e.className, visible: e.getClientRects().length > 0, label: e.getAttribute("aria-label") ?? e.textContent.trim() })));
console.log("mobile openers", JSON.stringify(opener));
await m.locator("[data-search-open]:visible").first().tap();
await m.waitForSelector(".sw-search-dialog[open]");
await m.keyboard.type("merge cells", { delay: 10 });
await m.waitForSelector(".sw-search-results [role=option]");
await m.waitForTimeout(400);
const box = await m.$eval(".sw-search-dialog", (d) => { const r = d.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, docOverflow: document.documentElement.scrollWidth - innerWidth }; });
console.log("mobile dialog box", JSON.stringify(box));
await m.screenshot({ path: `${out}/shots/search-mobile-390.png` });
await browser.close();
