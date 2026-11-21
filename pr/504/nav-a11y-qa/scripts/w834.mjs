import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
for (const [w, h] of [[834, 1112], [1440, 900], [1920, 1080]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:4870/docs/features/grid/editing-and-clipboard/");
  await p.waitForTimeout(600);
  const m = await p.evaluate(() => { const ps = [...document.querySelectorAll("article p")].filter(p => p.getBoundingClientRect().height > 40); const p0 = ps[0]; const cs = getComputedStyle(p0); const ctx = document.createElement("canvas").getContext("2d"); ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const avg = ctx.measureText("the quick brown fox jumps over a lazy dog and then sleeps").width / 57; return { w: p0.getBoundingClientRect().width, fs: cs.fontSize, chars: Math.round(p0.getBoundingClientRect().width / avg), maxw: cs.maxWidth }; });
  console.log(w, JSON.stringify(m));
  await p.screenshot({ path: `shots/editing-${w}.png` });
}
await b.close();
