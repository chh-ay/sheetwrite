// Types each query into the real search dialog and records the first three pages.
// Usage: node search-live.mjs <base> <queries.json> <out.json>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [base, queriesFile, out] = process.argv.slice(2);
const queries = JSON.parse(readFileSync(queriesFile, "utf8"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const rows = [];
let top3 = 0, firstOk = 0, firstNeeded = 0;
for (const [q, want, mode] of queries) {
  await p.goto(`${base}/docs/start/installation/`, { waitUntil: "load" });
  await p.keyboard.press("Control+k");
  await p.waitForSelector(".sw-search-dialog[open]");
  await p.keyboard.type(q, { delay: 5 });
  await p.waitForFunction(() => document.querySelectorAll(".sw-search-results [role=option]").length > 0 || /No results/.test(document.querySelector(".sw-search-status")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
  const hrefs = await p.$$eval(".sw-search-results [role=option]", (els) => els.map((e) => e.getAttribute("href")));
  const pages = [...new Set(hrefs.map((h) => h.split("#")[0]))];
  const rank = pages.findIndex((u) => want.includes(u)) + 1;
  if (rank >= 1 && rank <= 3) top3++;
  if (mode === "first") { firstNeeded++; if (rank === 1) firstOk++; }
  rows.push({ q, rank, first3: pages.slice(0, 3) });
  console.log(`${rank >= 1 && rank <= 3 ? "PASS" : "FAIL"} ${rank}${mode === "first" ? (rank === 1 ? " first" : " NOT-FIRST") : ""} ${JSON.stringify(q)} ${pages.slice(0, 3).join(" | ")}`);
}
const summary = `top 3: ${top3}/${queries.length} (first 35: ${rows.slice(0, 35).filter((r) => r.rank >= 1 && r.rank <= 3).length}/35); guide named by the query listed first: ${firstOk}/${firstNeeded}`;
console.log(summary);
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
await b.close();
