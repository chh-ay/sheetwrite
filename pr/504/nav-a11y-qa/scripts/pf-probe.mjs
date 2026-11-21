import { chromium } from "playwright";
const [base, rankingJson] = process.argv.slice(2);
const queries = process.argv[4] ? JSON.parse(process.argv[4]) : ["charts"];
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(base + "/docs/");
const out = await p.evaluate(async ({ queries, ranking }) => {
  const pf = await import("/pagefind/pagefind.js");
  await pf.options({ noWorker: true, ...(ranking ? { ranking } : {}) });
  const res = {};
  for (const q of queries) {
    const r = await pf.search(q);
    const d = await Promise.all(r.results.slice(0, 40).map((x) => x.data()));
    res[q] = { total: r.results.length, top: d.map((x) => x.url) };
  }
  return res;
}, { queries, ranking: rankingJson ? JSON.parse(rankingJson) : null });
for (const [q, v] of Object.entries(out)) console.log(JSON.stringify(q), v.total, "\n   ", v.top.slice(0, 40).map((u, i) => `${i + 1}:${u}`).join(" "));
await b.close();
