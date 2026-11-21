import { webkit } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const base = "http://127.0.0.1:4870";
const b = await webkit.launch();
const pages = ["/", "/docs/", "/docs/start/installation/", "/docs/features/grid/editing-and-clipboard/", "/docs/api/core/create-grid/", "/docs/api/core/grid/", "/docs/reference/formula-functions/lookup-reference/", "/docs/performance/formula-engine/", "/docs/releases/0.7.0/", "/showcases/", "/showcases/sort/", "/showcases/spreadsheet/", "/react/", "/docs/reference/compatibility-results/"];
for (const w of [390, 834, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const path of pages) {
    await p.goto(base + path, { waitUntil: "load" });
    await p.waitForTimeout(400);
    const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 1) { console.log("OVERFLOW", w, path, o); await p.screenshot({ path: `shots/webkit-overflow-${w}-${path.replace(/\W+/g, "_")}.png` }); }
  }
  console.log("webkit", w, "checked", pages.length, "pages");
  await p.close();
}
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(base + "/docs/start/installation/", { waitUntil: "load" });
await m.waitForTimeout(500);
await m.tap(".sw-nav-toggle");
await m.waitForTimeout(400);
console.log("webkit docs menu", JSON.stringify(await m.evaluate(() => { const d = document.querySelector("dialog[open]"); return { open: !!d, current: d?.querySelector("[aria-current=page]")?.textContent.trim(), currentVisible: (() => { const r = d?.querySelector("[aria-current=page]")?.getBoundingClientRect(); return r ? r.top >= 0 && r.bottom <= innerHeight : null; })() }; })));
await m.screenshot({ path: "shots/webkit-docs-menu-390.png" });
await m.keyboard.press("Escape"); await m.waitForTimeout(200);
console.log("after Escape open=", await m.evaluate(() => !!document.querySelector("dialog[open]")));
await m.tap(".sw-search-button");
await m.waitForSelector(".sw-search-dialog[open]");
await m.keyboard.type("autofilter");
await m.waitForSelector(".sw-search-results [role=option]", { timeout: 10000 });
await m.waitForTimeout(400);
console.log("webkit search first", await m.$eval(".sw-search-results [role=option]", (a) => a.getAttribute("href")));
await m.screenshot({ path: "shots/webkit-search-390.png" });
await b.close();
