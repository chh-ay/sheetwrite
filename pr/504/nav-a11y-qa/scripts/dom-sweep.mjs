// Structural checks on every page: headings, landmarks, images, SVGs, skip link, pager, sidebar, outline, links.
// Usage: node dom-sweep.mjs <base> <paths.txt> <outdir> [concurrency]
import { chromium } from "playwright";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
const [base, pathsFile, out, conc = "3"] = process.argv.slice(2);
const paths = readFileSync(pathsFile, "utf8").split("\n").filter(Boolean);
mkdirSync(out, { recursive: true });
const results = `${out}/dom.jsonl`;
writeFileSync(results, "");
const browser = await chromium.launch();
let next = 0, done = 0;
const probe = () => {
  const hidden = (el) => !!el.closest("[aria-hidden=true], [hidden], template");
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => !hidden(h) && h.getClientRects().length);
  const skips = [];
  let prev = 0;
  for (const h of headings) { const l = +h.tagName[1]; if (prev && l > prev + 1) skips.push(`${"h" + prev}->${h.tagName.toLowerCase()} "${h.textContent.trim().slice(0, 40)}"`); prev = l; }
  const navs = [...document.querySelectorAll("nav, [role=navigation]")].map((n) => n.getAttribute("aria-label") ?? n.getAttribute("aria-labelledby") ?? "(unlabelled)");
  const imgsNoAlt = [...document.querySelectorAll("img:not([alt])")].map((i) => i.getAttribute("src")?.slice(0, 80));
  const exposedSvgs = [...document.querySelectorAll("svg")].filter((s) => !s.closest("[aria-hidden=true]") && !s.closest("svg:not(:scope)") && s.getClientRects().length && !(s.getAttribute("role") === "img" && (s.getAttribute("aria-label") || s.getAttribute("aria-labelledby") || s.querySelector(":scope > title"))) && s.getAttribute("role") !== "presentation" && s.getAttribute("role") !== "none");
  const svgNames = exposedSvgs.slice(0, 3).map((s) => (s.getAttribute("class") || s.parentElement?.className || "").toString().slice(0, 60));
  const skip = document.querySelector("a[href='#main-content'], .sw-skip-link");
  const skipTarget = skip ? document.getElementById((skip.getAttribute("href") || "").slice(1)) : null;
  const pager = [...document.querySelectorAll(".sw-doc-pager a")].map((a) => a.getAttribute("href"));
  const current = [...document.querySelectorAll(".sw-sidebar [aria-current=page]")].map((a) => a.getAttribute("href"));
  const toc = [...document.querySelectorAll(".sw-toc a")];
  const tocMissing = toc.filter((a) => !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map((a) => a.hash);
  const links = [...new Set([...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href").split("#")[0]))];
  const frag = [...document.querySelectorAll("a[href^='#']")].map((a) => a.getAttribute("href")).filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))));
  return {
    title: document.title, lang: document.documentElement.lang,
    h1: headings.filter((h) => h.tagName === "H1").length, skips: skips.slice(0, 5),
    main: document.querySelectorAll("main, [role=main]").length, banner: document.querySelectorAll("header:not(main header, article header, section header), [role=banner]").length,
    footer: document.querySelectorAll("footer:not(main footer, article footer), [role=contentinfo]").length, navs,
    imgsNoAlt, exposedSvgs: exposedSvgs.length, svgNames, skip: !!skip, skipTarget: !!skipTarget,
    pager, current, toc: toc.length, tocMissing, links, brokenFragments: [...new Set(frag)].slice(0, 5),
  };
};
async function worker() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  while (next < paths.length) {
    const p = paths[next++];
    const rec = { path: p };
    try {
      const r = await page.goto(base + p, { waitUntil: "load", timeout: 45000 });
      rec.status = r?.status();
      await page.waitForTimeout(150);
      Object.assign(rec, await page.evaluate(probe));
    } catch (e) { rec.error = String(e.message).slice(0, 200); await page.close().catch(() => {}); page = await ctx.newPage(); }
    appendFileSync(results, JSON.stringify(rec) + "\n");
    if (++done % 200 === 0) console.log(done);
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
await browser.close();
console.log("done", done);
