// Dumps Pagefind's first 40 pages (with data) for each query, after question words are dropped.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [base, queriesFile, out] = process.argv.slice(2);
const queries = JSON.parse(readFileSync(queriesFile, "utf8"));
const QUESTION = new Set("a an and are can do does for from how i in into is it my of on or the to what when where which why with".split(" "));
const terms = (q) => { const w = q.trim().split(/\s+/).filter(Boolean); const k = w.filter((x) => !QUESTION.has(x.toLowerCase())); return (k.length ? k : w).join(" "); };
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(base + "/docs/");
const data = await p.evaluate(async (qs) => {
  const pf = await import("/pagefind/pagefind.js");
  await pf.options({ noWorker: true });
  const res = {};
  for (const q of qs) { const r = await pf.search(q); res[q] = await Promise.all(r.results.slice(0, 40).map((x) => x.data())); }
  return res;
}, [...new Set(queries.map(([q]) => terms(q)))]);
writeFileSync(out, JSON.stringify(data));
await b.close();
