import { type FullEngineResult, validateFullEngineResult } from "../bench/src/full-engine-bench.js";
import {
  type MatchedEngineResult,
  validateMatchedEngineResult,
} from "../bench/src/matched-engine-bench.js";
import { benchScaleFigure } from "./bench-figures.js";
import {
  allMeasurements,
  formatBytes,
  formatCaptureTime,
  provenanceList,
  shortHash,
} from "./evidence-format.js";

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
    ...benchScaleFigure(
      "analysis workload",
      full.analysis.map((row) => ({
        label: row.id,
        entries: [{ sizeLabel: "1,000 formulas", median: row.stat.median, p95: row.stat.p95 }],
      })),
    ),
    "",
    "Brotli size uses quality 11 on the WASM file only. It is not the full package transfer size. The raw artifacts retain cold-initialization samples; those samples do not establish that one engine initializes faster.",
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

/** Shared functions use the same code. Publish coverage and size, not a speed race. */
export function renderFullEngineEvidence(
  full: FullEngineResult,
  matched?: MatchedEngineResult,
): string {
  validateFullEngineResult(full);
  if (matched !== undefined) {
    validateMatchedEngineResult(matched);
    for (const engine of full.engines) {
      const path = `packages/${engine.engine === "full" ? "formulas" : "wasm"}/pkg/sheetwrite_wasm_bg.wasm`;
      if (engine.wasm.sha256 !== matched.sourceFiles[path]) {
        throw new Error("Matched and analysis captures use different engine binaries");
      }
    }
  }
  const choices = full.engines.map((engine) => {
    const isFull = engine.engine === "full";
    return `<div class="sw-engine-choice"><span>${isFull ? "Full engine" : "Default engine"}</span><h4><code>@sheetwrite/${isFull ? "formulas" : "wasm"}</code></h4><p>${isFull ? "Default functions, plus statistics, finance, LAMBDA, grouping, and other analysis functions." : "Core spreadsheet functions, with the smaller download."}</p><strong>${formatBytes(engine.wasm.brotliBytes)}</strong><small>Brotli WASM · ${formatBytes(engine.wasm.rawBytes)} uncompressed</small></div>`;
  });
  return [
    "### Choose a formula engine",
    "",
    "Shared functions use the same implementation in both builds. Choose by function coverage and download size, not small timing differences.",
    "",
    '<div class="sw-engine-choices">',
    ...choices,
    "</div>",
    "",
    "[Browse functions by engine](/docs/reference/formula-functions/) · [Use the full engine](/docs/guides/analysis-formulas/)",
    "",
    ...allMeasurements([
      ...analysisDetail(full),
      "",
      ...provenanceList([
        ["Analysis capture", `${formatCaptureTime(full.meta.timestamp)} UTC`],
        ["Analysis commit", `${shortHash(full.meta.commit)} clean worktree`],
      ]),
      "Shared-workload captures are validation data, not evidence that one package is faster.",
    ]),
    ...REPRODUCE,
  ].join("\n");
}
