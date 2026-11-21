import { chromium } from "playwright";
const [base] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(base + "/docs/features/formulas/formula-help/", { waitUntil: "load" });
await p.waitForTimeout(600);
const r = await p.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll(".sw-sidebar__nav a, .sw-sidebar__nav summary")) {
    const rect = a.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    const points = [rect.top + 1, rect.top + rect.height / 2, rect.bottom - 1].map((y) => document.elementFromPoint(rect.left + 20, y));
    const covered = points.map((el) => (el && !a.contains(el) ? `${el.tagName}.${String(el.className).slice(0, 40)}` : "")).filter(Boolean);
    out.push({ t: a.textContent.trim().slice(0, 25), h: Math.round(rect.height * 10) / 10, top: Math.round(rect.top), covered });
  }
  const sb = document.querySelector(".sw-sidebar");
  return { links: out.filter((o) => o.covered.length || o.h < 24), total: out.length, sidebar: { scrollTop: sb.scrollTop, h: sb.clientHeight, sh: sb.scrollHeight } };
});
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: "out/interact/shots/sidebar-formula-help-1440.png" });
await b.close();
