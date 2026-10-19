import { type FullEngineResult, validateFullEngineResult } from "../bench/src/full-engine-bench.js";
import {
  type MatchedEngineResult,
  type MatchedEngineRow,
  validateMatchedEngineResult,
} from "../bench/src/matched-engine-bench.js";
import { type BenchFigureGroup, benchScaleFigure } from "./bench-figures.js";
import {
  allMeasurements,
  capitalized,
  evidenceHeadline,
  formatBytes,
  formatCaptureTime,
  formatCount,
  formatMs,
  formatRatio,
  html,
  provenanceList,
  readableId,
  shortHash,
} from "./evidence-format.js";

/**
 * Largest paired-ratio p10–p90 span (p90/p10) that still supports a ratio
 * claim. Identical shared work is the control: when the protocol is quiet, the
 * paired ratio stays near 1 and its spread stays narrow.
 */
const MATCHED_SPREAD_CEILING = 1.5;

/** Within this band of 1× a paired ratio reads as "about the same". */
const EVEN_RATIO_BAND = 0.05;

/** Paired ratio (full ÷ default) as the chip beside each workload. */
function engineRatioChip(ratio: number): BenchFigureGroup["chip"] {
  if (Math.abs(ratio - 1) <= EVEN_RATIO_BAND) return { text: "About the same", outcome: "even" };
  return ratio < 1
    ? { text: `Full ${(1 / ratio).toFixed(2)}× faster`, outcome: "faster" }
    : { text: `Full ${ratio.toFixed(2)}× slower`, outcome: "slower" };
}

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

/** The full-only workloads, engine sizes and cold start; detail for the section. */
function analysisDetail(full: FullEngineResult): string[] {
  return [
    "#### Analysis workloads",
    "",
    "Each workload has 1,000 formulas. It has one untimed warmup and five measured samples. Each sample uses a fresh store. The timer measures first recompute. Setup and output reads are outside the timer. Every result is read and summed as a checked checksum. The default engine does not run these analysis functions.",
    "",
    "LINEST, SORTBY, and MAP/REDUCE use 100 input rows. DSUM uses 100 database rows, a header, and the criterion `key > 0`. XIRR uses two cash flows one year apart. The text workload uses three fields. MODE.MULT uses five scalar inputs. MMULT uses two 2-by-2 matrices. Array outputs are reduced to scalar results.",
    "",
    "| Full-only workload | Median | p95 |",
    "| --- | ---: | ---: |",
    ...full.analysis.map(
      (row) =>
        `| ${readableId(row.id)} | ${formatMs(row.stat.median)} | ${formatMs(row.stat.p95)} |`,
    ),
    "",
    "#### WASM size and Node initialization",
    "",
    "| Engine | Node | WASM size | Brotli q11 size | Cold init median | Cold init p95 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...full.engines.map(
      (engine) =>
        `| ${capitalized(engine.engine)} | ${engine.initialization.node} | ${formatBytes(engine.wasm.rawBytes)} | ${formatBytes(engine.wasm.brotliBytes)} | ${formatMs(engine.initialization.stat.median)} | ${formatMs(engine.initialization.stat.p95)} |`,
    ),
    "",
    "Raw size is the WASM file size. Brotli size uses quality 11 on that file only. It is not the full package transfer size. Cold initialization uses five fresh Node processes. The timer surrounds `initSheetwrite` only. Imports and process startup are outside the timer. The operating system file cache is not cleared. No network download is measured. These samples do not establish that the full engine initializes faster.",
    "",
    "Raw evidence: `bench/results/full-engine-matched-results.json` and `bench/results/full-engine-results.json`. They retain time samples, output checks, allocation samples, source hashes, and WASM hashes. The full workload captures are `bench/results/formula-default-results.json` and `bench/results/formula-full-results.json`. Their baseline gates stay blocked in output mode. A valid capture is not a passed timing regression gate.",
  ];
}

const REPRODUCE = [
  "Reproduce after `bun run build:packages`:",
  "",
  '```sh verify title="Default and full engine evidence"',
  "cd bench",
  "bun run bench:formula:engines",
  "bun run bench:formula:matched",
  "```",
  "",
];

/**
 * The analysis capture (the shared matrix on both engines, WASM sizes, Node
 * cold init) stands on its own. The matched paired-ratio table is added when
 * that second capture is present and valid; without it the page still
 * publishes the measured analysis evidence and names the capture that is
 * missing.
 */
export function renderFullEngineEvidence(
  full: FullEngineResult,
  matched?: MatchedEngineResult,
): string {
  validateFullEngineResult(full);
  const lines = ["### Default and full formula engines", ""];
  if (matched === undefined) {
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> Both engines ran the shared workload matrix. The paired-ratio capture is not published on this page yet, so no engine-to-engine ratio is claimed here.</div>`,
      "",
      "The default engine is `@sheetwrite/wasm`. The full engine is `@sheetwrite/formulas`. Select it with `initSheetwrite(undefined, formulas)`. Each app uses one engine.",
      "",
      ...allMeasurements([
        ...provenanceList([
          ["Analysis capture", `${formatCaptureTime(full.meta.timestamp)} UTC`],
          ["Analysis commit", `${shortHash(full.meta.commit)} clean worktree`],
        ]),
        ...analysisDetail(full),
      ]),
      ...REPRODUCE,
    );
    return lines.join("\n");
  }

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
  const brotliBytes = (name: string): string => {
    const engine = full.engines.find((candidate) => candidate.engine === name);
    return engine === undefined ? "not captured" : formatBytes(engine.wasm.brotliBytes);
  };
  lines.push(
    `<div class="evidence-available"><strong>Validated evidence.</strong> ${matched.rows.length} shared workloads have ${matched.rounds} paired rounds per engine. The full engine also has ${full.analysis.length} checked analysis workloads.</div>`,
    "",
    ...evidenceHeadline([
      {
        value: `${slowerCount} of ${matched.rows.length}`,
        label: "Shared workloads more than 5% slower on the full engine",
      },
      {
        value: formatRatio(widestSpread),
        label: `Widest paired-ratio spread (limit ${formatRatio(MATCHED_SPREAD_CEILING)})`,
      },
      { value: brotliBytes("default"), label: "Default engine WASM, Brotli" },
      { value: brotliBytes("full"), label: "Full engine WASM, Brotli" },
    ]),
    "The default engine is `@sheetwrite/wasm`. The full engine is `@sheetwrite/formulas`. Select it with `initSheetwrite(undefined, formulas)`. Each app uses one engine.",
    "",
    slowerCount === 0
      ? "No shared workload tested in the matched rounds had a median paired ratio more than 5% slower with the full engine. This check covers the eight flagged rows, not a new matched run of all 53 rows."
      : `${slowerCount} shared workloads tested in the matched rounds had a median paired ratio more than 5% slower with the full engine.`,
    "",
    ...benchScaleFigure(
      "shared workload",
      matched.rows.map((row) => ({
        label: row.id,
        detail: `Size ${formatCount(row.size)} · paired ratio ${formatRatio(row.ratioP10)}–${formatRatio(row.ratioP90)}${row.ratioP90 / row.ratioP10 > MATCHED_SPREAD_CEILING ? " · spread above the limit" : ""}`,
        chip: engineRatioChip(row.ratioStat.median),
        entries: [
          { sizeLabel: "Default", median: row.defaultStat.median, p95: row.defaultStat.p95 },
          {
            sizeLabel: "Full",
            median: row.fullStat.median,
            p95: row.fullStat.p95,
            series: "compare" as const,
          },
        ],
      })),
    ),
    "",
    ...allMeasurements([
      "| Shared workload | Size | Default median | Full median | Paired ratio | Ratio p10–p90 |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...matched.rows.map((row) => {
        const spread = row.ratioP90 / row.ratioP10;
        const marker = spread > MATCHED_SPREAD_CEILING ? " ⚠︎" : "";
        return `| ${readableId(row.id)}${marker} | ${formatCount(row.size)} | ${formatMs(row.defaultStat.median)} | ${formatMs(row.fullStat.median)} | ${formatRatio(row.ratioStat.median)} | ${formatRatio(row.ratioP10)}–${formatRatio(row.ratioP90)} |`;
      }),
      "",
      ...provenanceList([
        ["Matched capture", `${formatCaptureTime(matched.meta.timestamp)} UTC`],
        ["Matched commit", `${shortHash(matched.meta.commit)} clean worktree`],
        ["Analysis capture", `${formatCaptureTime(full.meta.timestamp)} UTC`],
        ["Analysis commit", `${shortHash(full.meta.commit)} clean worktree`],
        [
          "Machine",
          `${html(matched.runner.cpu)} · Linux ${html(matched.runner.kernel)} · ${html(matched.runner.arch)} · Bun ${html(matched.runner.bun)}`,
        ],
      ]),
      "#### Method",
      "",
      `The first capture ran all 53 shared workloads on each engine in sequence. Eight rows were more than 5% slower with the full engine. Those eight rows were checked with matched rounds. Each pair runs default, then full, in separate Bun processes. A timed sample starts with ${matched.warmupFixtures} untimed warm-up fixtures and then repeats the workload until at least ${matched.minimumSampleDurationMs} ms of measured time; the sample is the per-iteration mean, so a short operation is measured over many repetitions instead of one cold run. The runner used CPU 4 and one concurrent capture.`,
      "",
      `The ratio is full time divided by default time within each pair. The table shows the median of ${matched.rounds} paired ratios. The spread is the interpolated 10th to 90th percentile of those ratios. It is not a confidence interval. The time columns are the median times for each engine. A ratio below 1 means the full engine took less time.`,
      "",
      widestSpread <= MATCHED_SPREAD_CEILING
        ? `Identical shared work is the control for this protocol: the widest paired-ratio p10–p90 span across the ${matched.rows.length} rows is ${formatRatio(widestSpread)} (limit ${formatRatio(MATCHED_SPREAD_CEILING)}), so each median ratio is supported by its paired samples.`
        : `At least one row's paired-ratio p10–p90 span is ${formatRatio(widestSpread)} (limit ${formatRatio(MATCHED_SPREAD_CEILING)}). Rows above the limit are marked and their median ratio should not be read as a measured difference.`,
      "",
      "| Shared workload | Iterations per sample |",
      "| --- | ---: |",
      ...matched.rows.map((row) => {
        const iterations = sampleIterations(row);
        return `| ${row.id} | ${formatCount(iterations.min)}–${formatCount(iterations.max)} |`;
      }),
      "",
      ...analysisDetail(full),
      "",
      "The landing-page data comes from a separate browser benchmark. The Delivery size section below records published package sizes. Neither data set has an engine comparison field. They are unchanged by this local engine capture.",
    ]),
    ...REPRODUCE,
  );
  return lines.join("\n");
}
