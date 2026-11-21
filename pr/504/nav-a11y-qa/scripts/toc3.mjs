import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:4870/docs/releases/0.7.0/");
await p.waitForTimeout(800);
const info = await p.evaluate(() => {
  const t = document.querySelector(".sw-toc"); const cs = getComputedStyle(t); const r = t.getBoundingClientRect();
  const links = [...t.querySelectorAll("a")];
  return { n: links.length, depths: [...new Set([...t.querySelectorAll("li")].map(l => l.dataset.depth))], top: r.top, bottom: r.bottom, h: r.height, sh: t.scrollHeight, ch: t.clientHeight, overflowY: cs.overflowY, maxH: cs.maxHeight, position: cs.position, last: links.at(-1)?.textContent, lastBottom: links.at(-1)?.getBoundingClientRect().bottom, parent: t.parentElement.className, parentOverflow: getComputedStyle(t.parentElement).overflow };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: "shots/release-070-1440-top.png" });
await p.evaluate(() => scrollTo(0, 3000)); await p.waitForTimeout(300);
await p.screenshot({ path: "shots/release-070-1440-scrolled.png" });
console.log(await p.evaluate(() => { const t = document.querySelector(".sw-toc"); const r = t.getBoundingClientRect(); return JSON.stringify({ top: r.top, bottom: r.bottom, sh: t.scrollHeight, ch: t.clientHeight }); }));
await b.close();
