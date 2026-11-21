import { chromium } from "playwright";
const [base] = process.argv.slice(2);
const b = await chromium.launch();
for (const path of ["/showcases/sort/", "/showcases/spreadsheet/", "/docs/start/first-grid/"]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + path, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const grid = p.locator("[role=grid]").first();
  if (!(await grid.count())) { console.log(path, "no grid"); continue; }
  const where = () => p.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()}.${String(a.className).slice(0, 30)} ${a.getAttribute("aria-label") ?? ""} adesc=${a.getAttribute("aria-activedescendant") ?? ""}`; });
  for (const keys of [["Tab"], ["Shift+Tab"], ["Escape", "Tab"], ["Escape", "Shift+Tab"], ["F6"], ["Control+Tab"]]) {
    await grid.focus();
    let seq = [];
    for (const k of keys) { await p.keyboard.press(k); seq.push(await where()); }
    console.log(path, keys.join(" then "), "->", seq.at(-1));
  }
  const tabsNeeded = await (async () => { await grid.focus(); for (let i = 1; i <= 60; i++) { await p.keyboard.press("Tab"); const inGrid = await p.evaluate(() => !!document.activeElement.closest("[role=grid]")); if (!inGrid) return i; } return ">60"; })();
  console.log(path, "Tab presses to leave the grid:", tabsNeeded);
  await p.close();
}
await b.close();
