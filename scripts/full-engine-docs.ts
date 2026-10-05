import { type FullEngineResult, validateFullEngineResult } from "../bench/src/full-engine-bench.js";
import {
  type MatchedEngineResult,
  type MatchedEngineRow,
  validateMatchedEngineResult,
} from "../bench/src/matched-engine-bench.js";

/**
 * Largest paired-ratio p10–p90 span (p90/p10) that still supports a ratio
 * claim. Identical shared work is the control: when the protocol is quiet, the
 * paired ratio stays near 1 and its spread stays narrow.
 */
const MATCHED_SPREAD_CEILING = 1.5;

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
  const sampleIterations = (row: MatchedEngineRow): { min: number; max: number } =>
    row.samples.reduce(
      (range, sample) => ({
        min: Math.min(range.min, sample.iterations),
        max: Math.max(range.max, sample.iterations),
      }),
      { min: Number.POSITIVE_INFINITY, max: 0 },
    );
  const widestSpread = matched.rows.reduce(
    (worst, row) => Math.max(worst, row.ratioP90 / row.ratioP10),
    0,
  );
  const lines = [
    "### Default and full formula engines",
    "",
    `<div class="evidence-available"><strong>Validated evidence.</strong> Eight shared workloads have ${matched.rounds} paired rounds per engine. The full engine also has eight checked analysis workloads.</div>`,
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
    `The first capture ran all 53 shared workloads on each engine in sequence. Eight rows were more than 5% slower with the full engine. Those eight rows were checked with matched rounds. Each pair runs default, then full, in separate Bun processes. A timed sample starts with ${matched.warmupFixtures} untimed warm-up fixtures and then repeats the workload until at least ${matched.minimumSampleDurationMs} ms of measured time; the sample is the per-iteration mean, so a short operation is measured over many repetitions instead of one cold run. The runner used CPU 4 and one concurrent capture.`,
    "",
    slowerCount === 0
      ? "No shared workload tested in the matched rounds had a median paired ratio more than 5% slower with the full engine. This check covers the eight flagged rows, not a new matched run of all 53 rows."
      : `${slowerCount} shared workloads tested in the matched rounds had a median paired ratio more than 5% slower with the full engine.`,
    "",
    `The ratio is full time divided by default time within each pair. The table shows the median of ${matched.rounds} paired ratios. The spread is the interpolated 10th to 90th percentile of those ratios. It is not a confidence interval. The time columns are the median times for each engine. A ratio below 1 means the full engine took less time.`,
    "",
    widestSpread <= MATCHED_SPREAD_CEILING
      ? `Identical shared work is the control for this protocol: the widest paired-ratio p10–p90 span across the eight rows is ${widestSpread.toFixed(2)}× (ceiling ${MATCHED_SPREAD_CEILING.toFixed(2)}×), so each median ratio is supported by its paired samples.`
      : `At least one row's paired-ratio p10–p90 span is ${widestSpread.toFixed(2)}× (ceiling ${MATCHED_SPREAD_CEILING.toFixed(2)}×). Rows above the ceiling are marked and their median ratio should not be read as a measured difference.`,
    "",
    "| Shared workload | Size | Default median ms | Full median ms | Paired median ratio | Ratio p10–p90 | Iterations per sample |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...matched.rows.map((row) => {
      const iterations = sampleIterations(row);
      const spread = row.ratioP90 / row.ratioP10;
      const marker = spread > MATCHED_SPREAD_CEILING ? " ⚠︎" : "";
      return `| ${row.id}${marker} | ${row.size.toLocaleString("en-US")} | ${row.defaultStat.median.toFixed(4)} | ${row.fullStat.median.toFixed(4)} | ${row.ratioStat.median.toFixed(4)} | ${row.ratioP10.toFixed(4)}–${row.ratioP90.toFixed(4)} | ${iterations.min}–${iterations.max} |`;
    }),
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
    "| Engine | Node | WASM raw bytes | Brotli q11 bytes | Node cold init median ms | Node cold init p95 ms |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...full.engines.map(
      (engine) =>
        `| ${engine.engine} | ${engine.initialization.node} | ${engine.wasm.rawBytes.toLocaleString("en-US")} | ${engine.wasm.brotliBytes.toLocaleString("en-US")} | ${engine.initialization.stat.median.toFixed(4)} | ${engine.initialization.stat.p95.toFixed(4)} |`,
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
