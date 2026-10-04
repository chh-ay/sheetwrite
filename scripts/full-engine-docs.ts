import { type FullEngineResult, validateFullEngineResult } from "../bench/src/full-engine-bench.js";
import {
  type MatchedEngineResult,
  validateMatchedEngineResult,
} from "../bench/src/matched-engine-bench.js";

export function validateFullEngineArtifact(
  value: Record<string, unknown>,
): FullEngineResult | string {
  const result = value as unknown as FullEngineResult;
  try {
    validateFullEngineResult(result);
    return result;
  } catch (error) {
    return `Full engine evidence is invalid: ${error instanceof Error ? error.message : String(error)}`;
  }
}
export function validateMatchedEngineArtifact(
  value: Record<string, unknown>,
): MatchedEngineResult | string {
  const result = value as unknown as MatchedEngineResult;
  try {
    validateMatchedEngineResult(result);
    return result;
  } catch (error) {
    return `Matched engine evidence is invalid: ${error instanceof Error ? error.message : String(error)}`;
  }
}
export function renderFullEngineEvidence(
  full: FullEngineResult,
  matched: MatchedEngineResult,
): string {
  validateFullEngineResult(full);
  validateMatchedEngineResult(matched);
  for (const engine of full.engines) {
    const path = `packages/${engine.engine === "full" ? "formulas" : "wasm"}/pkg/sheetwrite_wasm_bg.wasm`;
    if (engine.wasm.sha256 !== matched.sourceFiles[path])
      throw new Error("Matched and analysis captures use different engine binaries");
  }
  const slowerCount = matched.rows.filter((row) => row.ratioStat.median > 1.05).length;
  const lines = [
    "### Default and full formula engines",
    "",
    '<div class="evidence-available"><strong>Validated evidence.</strong> Eight shared workloads have nine paired rounds per engine. The full engine also has eight checked analysis workloads.</div>',
    "",
    '<dl class="bench-meta" data-pagefind-ignore>',
    `<div><dt>Matched capture</dt><dd>${matched.meta.timestamp.slice(0, 16).replace("T", " ")} UTC</dd></div>`,
    `<div><dt>Matched commit</dt><dd><code>${matched.meta.commit.slice(0, 12)}</code> clean worktree</dd></div>`,
    `<div><dt>Analysis capture</dt><dd>${full.meta.timestamp.slice(0, 16).replace("T", " ")} UTC</dd></div>`,
    `<div><dt>Analysis commit</dt><dd><code>${full.meta.commit.slice(0, 12)}</code> clean worktree</dd></div>`,
    `<div><dt>Machine</dt><dd>${matched.runner.cpu} · Linux ${matched.runner.kernel} · ${matched.runner.arch} · Bun ${matched.runner.bun}</dd></div>`,
    "</dl>",
    "",
    "The default engine is `@sheetwrite/wasm`. The full engine is `@sheetwrite/formulas`. Select it with `initSheetwrite(undefined, formulas)`. Each app uses one engine.",
    "",
    "The first capture ran all 53 shared workloads on each engine in sequence. Eight rows were more than 5% slower with the full engine. We checked those eight rows with matched rounds. Each pair runs default, then full. Each timed sample uses a fresh Bun process and one untimed warmup fixture. The runner used CPU 4 and one concurrent capture.",
    "",
    slowerCount === 0
      ? "No shared workload tested in the matched rounds had a median paired ratio more than 5% slower with the full engine. This check covers the eight flagged rows, not a new matched run of all 53 rows."
      : `${slowerCount} shared workloads tested in the matched rounds had a median paired ratio more than 5% slower with the full engine.`,
    "",
    "The ratio is full time divided by default time within each pair. The table shows the median of nine paired ratios. The spread is the interpolated 10th to 90th percentile of those ratios. It is not a confidence interval. The time columns are the median times for each engine. A ratio below 1 means the full engine took less time. Wide spreads and very short operations limit what this small sample can show.",
    "",
    "| Shared workload | Size | Default median ms | Full median ms | Paired median ratio | Ratio p10–p90 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...matched.rows.map(
      (row) =>
        `| ${row.id} | ${row.size.toLocaleString("en-US")} | ${row.defaultStat.median.toFixed(4)} | ${row.fullStat.median.toFixed(4)} | ${row.ratioStat.median.toFixed(4)} | ${row.ratioP10.toFixed(4)}–${row.ratioP90.toFixed(4)} |`,
    ),
    "",
    "#### Analysis workloads",
    "",
    "Each workload has 1,000 formulas. It has one untimed warmup and five measured samples. Each sample uses a fresh store. The timer measures first recompute. Setup and output reads are outside the timer. Every result is read and summed as a checked checksum. The default engine does not run these analysis functions.",
    "",
    "LINEST, SORTBY, and MAP/REDUCE use 100 input rows. DSUM uses 100 database rows, a header, and the criterion `key > 0`. XIRR uses two cash flows one year apart. The text workload uses three fields. MODE.MULT uses five scalar inputs. MMULT uses two 2-by-2 matrices. Array outputs are reduced to scalar results.",
    "",
    "| Full-only workload | Median ms | p95 ms |",
    "| --- | ---: | ---: |",
    ...full.analysis.map(
      (row) => `| ${row.id} | ${row.stat.median.toFixed(4)} | ${row.stat.p95.toFixed(4)} |`,
    ),
    "",
    "#### WASM size and Node initialization",
    "",
    "| Engine | WASM raw bytes | Brotli q11 bytes | Node cold init median ms | Node cold init p95 ms |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...full.engines.map(
      (engine) =>
        `| ${engine.engine} | ${engine.wasm.rawBytes.toLocaleString("en-US")} | ${engine.wasm.brotliBytes.toLocaleString("en-US")} | ${engine.initialization.stat.median.toFixed(4)} | ${engine.initialization.stat.p95.toFixed(4)} |`,
    ),
    "",
    "Raw size is the WASM file size. Brotli size uses quality 11 on that file only. It is not the full package transfer size. Cold initialization uses five fresh Node processes. The timer surrounds `initSheetwrite` only. Imports and process startup are outside the timer. The operating system file cache is not cleared. No network download is measured. These samples do not establish that the full engine initializes faster.",
    "",
    "Raw evidence: `bench/results/full-engine-matched-results.json` and `bench/results/full-engine-results.json`. They retain time samples, output checks, allocation samples, source hashes, and WASM hashes. The full workload captures are `bench/results/formula-default-results.json` and `bench/results/formula-full-results.json`. Their baseline gates stay blocked in output mode. A valid capture is not a passed timing regression gate.",
    "",
    "Reproduce after `bun run build:packages`:",
    "",
    '```sh verify title="Default and full engine evidence"',
    "cd bench",
    "bun run bench:formula:engines",
    "bun run bench:formula:matched",
    "```",
    "",
    "The landing-page data comes from a separate browser benchmark. The Delivery size section below records published package sizes. Neither data set has an engine comparison field. They are unchanged by this local engine capture.",
    "",
  ];
  return lines.join("\n");
}
