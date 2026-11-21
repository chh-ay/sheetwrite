// Old 0.6.1 URLs (the live sitemap) and moved-page heading links on a docs build.
// Usage: bun redirects.mjs <base> <live-paths.txt> <repo> <outdir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [base, livePaths, repo, out] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
const { MOVED_PAGES } = await import(`${repo}/docs/src/lib/moved-pages.ts`);
const paths = readFileSync(livePaths, "utf8").split("\n").filter(Boolean);
const bad = [];
let redirected = 0;
for (const p of paths) {
  const first = await fetch(base + p, { redirect: "manual" });
  const final = await fetch(base + p);
  if (first.status === 308) redirected++;
  if (final.status !== 200) bad.push(`${p} -> ${first.status} ${first.headers.get("location") ?? ""} final ${final.status}`);
}
// Without a trailing slash too.
for (const p of paths.slice(0, 50)) {
  const r = await fetch(base + p.replace(/\/$/, ""));
  if (r.status !== 200) bad.push(`${p} (no slash) final ${r.status}`);
}
console.log(`0.6.1 URLs: ${paths.length}, redirected ${redirected}, not ending at 200: ${bad.length}`);
for (const b of bad) console.log("  BAD", b);
// Every old heading link lands on its new page and heading.
const browser = await chromium.launch();
const page = await browser.newPage();
let anchors = 0;
const wrong = [];
for (const [from, moved] of Object.entries(MOVED_PAGES)) {
  for (const [hash, to] of Object.entries(moved.anchors)) {
    anchors++;
    await page.goto(`${base}${from}#${hash}`, { waitUntil: "load" });
    await page.waitForFunction((want) => location.pathname + location.hash === want, to, { timeout: 4000 }).catch(() => {});
    const at = await page.evaluate(() => location.pathname + location.hash);
    const target = await page.evaluate(() => { const id = decodeURIComponent(location.hash.slice(1)); const el = id && document.getElementById(id); return el ? el.getBoundingClientRect().top : null; });
    if (at !== to || target === null || target < -5 || target > 400) wrong.push(`${from}#${hash} -> ${at} (want ${to}, heading top ${target})`);
  }
}
console.log(`old heading links: ${anchors}, wrong: ${wrong.length}`);
for (const w of wrong.slice(0, 30)) console.log("  WRONG", w);
// The 404 page.
for (const [w, theme] of [[390, "light"], [1440, "dark"], [1440, "light"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("sheetwrite-theme", t), theme);
  const pg = await ctx.newPage();
  const r = await pg.goto(`${base}/docs/no-such-page/`);
  const info = await pg.evaluate(() => ({ title: document.title, h1: document.querySelector("h1")?.textContent, links: [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")), search: !!document.querySelector("[data-search-open]"), overflow: document.documentElement.scrollWidth - innerWidth }));
  console.log(`404 at ${w} ${theme}: status ${r.status()}`, JSON.stringify(info));
  await pg.screenshot({ path: `${out}/shots/404-${w}-${theme}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/redirects.txt`, [...bad, ...wrong].join("\n"));
