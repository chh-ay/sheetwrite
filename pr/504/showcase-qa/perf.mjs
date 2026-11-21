// perf.mjs <browser> <path> <gridSelector>: wheel-scroll a showcase grid, record rAF frame times (+ Chromium trace).
import { chromium, firefox } from "/home/vvin/checkouts/dsq-showcase/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [bName, path, gridSel = ".sheetwrite-viewport"] = process.argv.slice(2);
const OUT = "/home/vvin/learn/scratch/dsq";
const slug = path.replace(/\//g, "_").replace(/^_|_$/g, "");
const browser = await (bName === "firefox" ? firefox : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("404") && errs.push(m.text().slice(0, 300))); page.on("pageerror", (e) => errs.push("pageerror " + e.message));
await page.goto((process.env.BASE ?? "http://127.0.0.1:4871") + path);
const vp = page.locator(gridSel).first();
await vp.scrollIntoViewIfNeeded();
await page.waitForTimeout(4000);
await vp.scrollIntoViewIfNeeded();
const box = await vp.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
async function measure(label, action) {
  await page.evaluate(() => { const gen = (window.__gen = (window.__gen ?? 0) + 1); window.__frames = []; let last = performance.now(); const loop = (t) => { if (window.__gen !== gen) return; window.__frames.push(t - last); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const t0 = Date.now(); await action(); await page.waitForTimeout(500);
  const f = await page.evaluate(() => { window.__gen++; return window.__frames.slice(1); });
  const s = [...f].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = { label, ms: Date.now() - t0, frames: f.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length };
  console.log(JSON.stringify(r)); return r;
}
if (bName === "chromium") await browser.startTracing(page, { path: `${OUT}/traces/${slug}-chromium.json`, screenshots: false, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing", "v8.execute"] });
const results = [];
results.push(await measure("idle 1 s", () => page.waitForTimeout(1000)));
results.push(await measure("wheel down 60 x 300 px, 16 ms apart", async () => { for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(16); } }));
results.push(await measure("wheel fast down 60 x 3000 px", async () => { for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(16); } }));
results.push(await measure("wheel right 40 x 400 px", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(400, 0); await page.waitForTimeout(16); } }));
results.push(await measure("keyboard Ctrl+End then PageUp x20", async () => { await page.mouse.click(box.x + 200, box.y + 80); await page.keyboard.press("Control+End"); for (let i = 0; i < 20; i++) { await page.keyboard.press("PageUp"); await page.waitForTimeout(30); } }));
if (bName === "chromium") await browser.stopTracing();
await page.screenshot({ path: `${OUT}/shots/perf-${slug}-${bName}.png` });
fs.writeFileSync(`${OUT}/logs/perf-${slug}-${bName}.json`, JSON.stringify({ results, errs }, null, 1));
console.log("console:", errs.join(" || ") || "none");
await browser.close();
