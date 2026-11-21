import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
for (const w of [1440, 1920]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("http://127.0.0.1:4870/docs/start/installation/");
  await p.waitForTimeout(800);
  const info = await p.evaluate(() => {
    const t = document.querySelector(".sw-toc"); if (!t) return null;
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    return { display: cs.display, w: r.width, sw: t.scrollWidth, cw: t.clientWidth, links: [...t.querySelectorAll("a")].map(a => ({ t: a.textContent, sw: a.scrollWidth, cw: a.clientWidth, right: a.getBoundingClientRect().right })).slice(0, 30), right: r.right };
  });
  console.log(w, JSON.stringify(info));
  const t = await p.$(".sw-toc"); if (t) await t.screenshot({ path: `shots/toc-installation-${w}.png` });
  await p.screenshot({ path: `shots/installation-${w}.png` });
}
await b.close();
