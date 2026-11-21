// Layout sweep: every page at the given widths. Usage:
//   node layout-sweep.mjs <base> <paths.txt> <outdir> <browser> <widths,comma> [concurrency]
import { chromium, firefox } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
const [base, pathsFile, out, browserName, widthsArg, conc = "4"] = process.argv.slice(2);
const paths = readFileSync(pathsFile, "utf8").split("\n").filter(Boolean);
const widths = widthsArg.split(",").map(Number);
mkdirSync(`${out}/shots`, { recursive: true });
const results = `${out}/layout-${browserName}.jsonl`;
writeFileSync(results, "");
const browser = await (browserName === "firefox" ? firefox : chromium).launch();
const jobs = [];
for (const w of widths) for (const p of paths) jobs.push([w, p]);
let next = 0, done = 0;
const probe = () => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += "." + cls.join(".");
    const parent = el.parentElement;
    return parent && parent !== document.body ? `${parent.tagName.toLowerCase()}${parent.className && typeof parent.className === "string" ? "." + parent.className.trim().split(/\s+/)[0] : ""} > ${s}` : s;
  };
  const clippedByAncestor = (el) => {
    for (let a = el.parentElement; a && a !== doc; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (["auto", "scroll", "hidden", "clip"].includes(cs.overflowX)) {
        const r = a.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
      if (cs.position === "fixed" && a.matches("dialog:not([open]), [hidden]")) return true;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (offenders.length >= 6) break;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.position === "fixed") continue;
    if (el.closest("dialog:not([open]), [hidden], [aria-hidden=true] svg")) continue;
    if (clippedByAncestor(el)) continue;
    offenders.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right) });
  }
  // Readable line length: widest paragraph in the main column, in characters.
  let maxChars = 0, maxCharsSel = "";
  for (const p of document.querySelectorAll("main p, article p")) {
    const r = p.getBoundingClientRect();
    if (r.height < 40) continue; // single line paragraphs do not set the measure
    const fs = parseFloat(getComputedStyle(p).fontSize);
    const ctx = (window.__navqaCanvas ??= document.createElement("canvas").getContext("2d"));
    ctx.font = `${getComputedStyle(p).fontWeight} ${fs}px ${getComputedStyle(p).fontFamily}`;
    const avg = ctx.measureText("the quick brown fox jumps over a lazy dog and then sleeps").width / 57;
    const chars = Math.round(r.width / avg);
    if (chars > maxChars) { maxChars = chars; maxCharsSel = sel(p); }
  }
  // Wide tables and code panels must scroll inside themselves, never clip or push the page.
  const wide = [];
  for (const el of document.querySelectorAll("main table, main pre, article table, article pre")) {
    if (el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= vw + 1) continue;
    let scroller = null;
    for (let a = el; a && a !== doc; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === "auto" || ox === "scroll") { scroller = a; break; }
      if (ox === "hidden" || ox === "clip") { scroller = "CLIPPED"; break; }
    }
    if (scroller === "CLIPPED" || scroller === null) wide.push({ sel: sel(el), sw: el.scrollWidth, cw: el.clientWidth, problem: scroller === null ? "no-scroller" : "clipped" });
  }
  // Text clipped inside navigation, outline and headings (the cut-off outline case).
  const clipped = [];
  for (const el of document.querySelectorAll("nav a, .sw-toc a, .sw-toc-inline a, h1, h2, h3, header a, header button, .sw-breadcrumbs, .sw-page-nav a")) {
    const cs = getComputedStyle(el);
    if (el.getClientRects().length === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && ["hidden", "clip", "auto"].includes(cs.overflowX)) clipped.push({ sel: sel(el), text: el.textContent.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth });
    else if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1 && !el.title && !el.getAttribute("aria-label")) clipped.push({ sel: sel(el), text: el.textContent.trim().slice(0, 60), ellipsis: true });
    if (clipped.length >= 6) break;
  }
  return { overflowX: doc.scrollWidth - vw, offenders, maxChars, maxCharsSel, wide: wide.slice(0, 6), clipped };
};
async function worker() {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  let page = await ctx.newPage();
  while (next < jobs.length) {
    const [w, p] = jobs[next++];
    let rec = { path: p, width: w, browser: browserName };
    try {
      await page.setViewportSize({ width: w, height: w < 600 ? 844 : w < 1000 ? 1112 : 900 });
      const resp = await page.goto(base + p, { waitUntil: "load", timeout: 45000 });
      rec.status = resp?.status();
      await page.waitForTimeout(250);
      Object.assign(rec, await page.evaluate(probe));
      const bad = rec.overflowX > 1 || rec.offenders.length || rec.wide.length || rec.clipped.length;
      if (bad) {
        const name = `${browserName}-${w}-${p.replace(/\W+/g, "_")}.png`;
        const target = rec.offenders[0] ? null : null;
        await page.screenshot({ path: `${out}/shots/${name}` });
        rec.shot = name;
      }
    } catch (e) {
      rec.error = String(e.message).slice(0, 200);
      await page.close().catch(() => {});
      page = await ctx.newPage();
    }
    appendFileSync(results, JSON.stringify(rec) + "\n");
    if (++done % 100 === 0) console.log(`${done}/${jobs.length}`);
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
await browser.close();
console.log("done", done);
