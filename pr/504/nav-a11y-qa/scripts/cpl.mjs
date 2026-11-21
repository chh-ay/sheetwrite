import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const path of ["/docs/features/grid/editing-and-clipboard/", "/docs/concepts/calculation-engine/", "/docs/start/installation/"]) {
  await p.goto("http://127.0.0.1:4870" + path);
  await p.waitForTimeout(500);
  console.log(path, JSON.stringify(await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("article.sw-prose > p")) {
      const lh = parseFloat(getComputedStyle(el).lineHeight); const lines = Math.round(el.getBoundingClientRect().height / lh);
      if (lines >= 3) out.push(Math.round(el.textContent.length / lines));
    }
    return { paragraphs: out.length, charsPerFullLine: out.slice(0, 8), median: out.sort((a, b) => a - b)[out.length >> 1] };
  })));
}
await b.close();
