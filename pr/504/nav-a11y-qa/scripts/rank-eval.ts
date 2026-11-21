// Scores a search-ranking module on dumped Pagefind data. bun rank-eval.ts <module> <dump.json> <queries.json>
import { readFileSync } from "node:fs";
const [modulePath, dumpFile, queriesFile] = process.argv.slice(2);
const { rankEntries, searchTerms } = await import(modulePath);
const dump = JSON.parse(readFileSync(dumpFile, "utf8"));
const queries = JSON.parse(readFileSync(queriesFile, "utf8")) as [string, string[], string?][];
let top3 = 0, firstOk = 0, firstNeeded = 0;
for (const [q, want, mode] of queries) {
  const pages = [...new Set(rankEntries(dump[searchTerms(q)] ?? [], q).map((e: { url: string }) => e.url.split("#")[0]))];
  const rank = pages.findIndex((u) => want.includes(u)) + 1;
  const ok = rank >= 1 && rank <= 3;
  if (ok) top3++;
  if (mode === "first") { firstNeeded++; if (rank === 1) firstOk++; }
  console.log(`${ok ? "PASS" : "FAIL"} ${rank}${mode === "first" ? (rank === 1 ? " first" : " NOT-FIRST") : ""} ${JSON.stringify(q)} ${pages.slice(0, 3).join(" | ")}`);
}
console.log(`top 3: ${top3}/${queries.length}; first where a guide is named: ${firstOk}/${firstNeeded}`);
