import { chromium } from "playwright";
const [base] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(base + "/showcases/sort/", { waitUntil: "load" });
await p.waitForTimeout(1500);
for (let i = 0; i < 16; i++) {
  await p.keyboard.press("Tab");
  const d = await p.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return `${a.tagName}.${String(a.className).slice(0,40)} tabindex=${a.getAttribute("tabindex")} role=${a.getAttribute("role")} label=${a.getAttribute("aria-label")} parent=${a.parentElement?.className?.toString().slice(0,40)} rect=${[r.x,r.y,r.width,r.height].map(Math.round)} landmark=${a.closest("main,header,aside,nav,footer")?.tagName}`; });
  console.log(i + 1, d);
  if (i === 12) await p.screenshot({ path: "out/interact/shots/sort-tab13.png" });
}
await b.close();
