// axe-core on every page, light and dark. Usage:
//   node axe-sweep.mjs <base> <paths.txt> <outdir> <axe.min.js> [concurrency]
import { chromium } from "playwright";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
const [base, pathsFile, out, axePath, conc = "4"] = process.argv.slice(2);
const paths = readFileSync(pathsFile, "utf8").split("\n").filter(Boolean);
const axeSource = readFileSync(axePath, "utf8");
mkdirSync(out, { recursive: true });
const results = `${out}/axe.jsonl`;
writeFileSync(results, "");
const browser = await chromium.launch();
const jobs = [];
for (const theme of ["light", "dark"]) for (const p of paths) jobs.push([theme, p]);
let next = 0, done = 0;
async function worker() {
  const contexts = {};
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
    contexts[theme] = { ctx, page: await ctx.newPage() };
  }
  while (next < jobs.length) {
    const [theme, p] = jobs[next++];
    const c = contexts[theme];
    const rec = { path: p, theme };
    try {
      await c.page.goto(base + p, { waitUntil: "load", timeout: 45000 });
      await c.page.waitForTimeout(300);
      rec.actualTheme = await c.page.evaluate(() => document.documentElement.dataset.theme);
      await c.page.addScriptTag({ content: axeSource });
      const r = await c.page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 200), summary: n.failureSummary?.slice(0, 300) })) }));
      });
      rec.violations = r;
    } catch (e) {
      rec.error = String(e.message).slice(0, 200);
      await c.page.close().catch(() => {});
      c.page = await c.ctx.newPage();
    }
    appendFileSync(results, JSON.stringify(rec) + "\n");
    if (++done % 100 === 0) console.log(`${done}/${jobs.length}`);
  }
  for (const c of Object.values(contexts)) await c.ctx.close();
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
await browser.close();
console.log("done", done);
