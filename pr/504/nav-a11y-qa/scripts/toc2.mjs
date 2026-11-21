import { chromium, firefox, webkit } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
for (const [n, bt] of [["firefox", firefox], ["webkit", webkit]]) {
  let b; try { b = await bt.launch(); } catch (e) { console.log(n, "launch fail", e.message.slice(0, 200)); continue; }
  for (const w of [1408, 1440, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto("http://127.0.0.1:4870/docs/start/installation/");
    await p.waitForTimeout(800);
    const info = await p.evaluate(() => {
      const t = document.querySelector(".sw-toc"); if (!t) return null;
      const r = t.getBoundingClientRect();
      return { w: r.width, sw: t.scrollWidth, cw: t.clientWidth, links: [...t.querySelectorAll("a")].map(a => [a.textContent, a.scrollWidth, a.clientWidth, Math.round(a.getBoundingClientRect().right)]) };
    });
    console.log(n, w, JSON.stringify(info));
    const t = await p.$(".sw-toc"); if (t) await t.screenshot({ path: `shots/toc-installation-${n}-${w}.png` });
  }
  await b.close();
}
