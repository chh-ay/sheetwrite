import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { type CompleteFormulaWorkloadResult, expectedFormulaOutput } from "./formula-bench.js";
import { validateExactMatrix, validateRawStat } from "./gate-protocol.js";
import { type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { type Stat, summarize } from "./stats.js";

export const MATCHED_ENGINE_WORKLOADS = [
  { id: "independent-parse-load", size: 1_000 },
  { id: "independent-first-recompute", size: 1_000 },
  { id: "independent-parse-load", size: 10_000 },
  { id: "independent-first-recompute", size: 10_000 },
  { id: "linear-chain", size: 8 },
  { id: "wide-fan-out-edit", size: 1_000 },
  { id: "scalar-edit-affects-0", size: 1_000 },
  { id: "vlookup-many", size: 1_000 },
] as const;
const ROUNDS = 9;
const ENGINES = ["default", "full"] as const;
type EngineId = (typeof ENGINES)[number];
const METHOD =
  "nine ABAB paired rounds per workload; one fresh Bun process and one untimed warmup fixture per timed sample";
const SOURCE_PATHS = [
  "bench/src/matched-engine-bench.ts",
  "bench/src/formula-bench.ts",
  "bench/src/formula-dataset.ts",
  "bench/src/stats.ts",
  "packages/wasm/pkg/sheetwrite_wasm_bg.wasm",
  "packages/formulas/pkg/sheetwrite_wasm_bg.wasm",
];
interface MatchedSample extends CompleteFormulaWorkloadResult {
  round: number;
  engine: EngineId;
}
export interface MatchedEngineRow {
  id: string;
  size: number;
  samples: MatchedSample[];
  defaultStat: Stat;
  fullStat: Stat;
  ratioStat: Stat;
  ratioP10: number;
  ratioP90: number;
}
export interface MatchedEngineResult {
  schemaVersion: 1;
  meta: ProtocolCaptureMeta;
  runner: { cpu: string; kernel: string; bun: string; arch: string; concurrency: 1 };
  method: string;
  rounds: 9;
  sourceFiles: Record<string, string>;
  sourceDigest: string;
  rows: MatchedEngineRow[];
}
function percentile(samples: readonly number[], fraction: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  const position = (ordered.length - 1) * fraction;
  const lower = ordered[Math.floor(position)];
  const upper = ordered[Math.ceil(position)];
  if (lower === undefined || upper === undefined) throw new Error("Missing percentile samples");
  return lower + (upper - lower) * (position - Math.floor(position));
}
function hash(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function sourceDigest(result: Pick<MatchedEngineResult, "meta" | "sourceFiles">): string {
  return hash(JSON.stringify({ commit: result.meta.commit, files: result.sourceFiles }));
}
function workloadKey(workload: { id: string; size: number }): string {
  return `${workload.id}:${workload.size}`;
}
function rowSamples(samples: readonly MatchedSample[], engine: EngineId): number[] {
  return samples
    .filter((sample) => sample.engine === engine)
    .map((sample) => {
      const duration = sample.samplesMs[0];
      if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
        throw new Error("Invalid matched duration");
      return duration;
    });
}
export function validateMatchedEngineResult(result: MatchedEngineResult): void {
  if (
    result.schemaVersion !== 1 ||
    result.method !== METHOD ||
    result.rounds !== ROUNDS ||
    result.runner.concurrency !== 1
  )
    throw new Error("Matched engine protocol mismatch");
  if (
    !/^[0-9a-f]{40}$/u.test(result.meta.commit) ||
    typeof result.meta.dirty !== "boolean" ||
    !Number.isFinite(Date.parse(result.meta.timestamp))
  )
    throw new Error("Invalid matched metadata");
  validateExactMatrix("matched source files", SOURCE_PATHS, Object.keys(result.sourceFiles));
  if (
    Object.values(result.sourceFiles).some((digest) => !/^[0-9a-f]{64}$/u.test(digest)) ||
    result.sourceDigest !== sourceDigest(result)
  )
    throw new Error("Matched source digest mismatch");
  validateExactMatrix(
    "matched workloads",
    MATCHED_ENGINE_WORKLOADS.map(workloadKey),
    result.rows.map(workloadKey),
  );
  for (const row of result.rows) {
    if (row.samples.length !== ROUNDS * ENGINES.length) throw new Error("Missing matched samples");
    for (const [index, sample] of row.samples.entries()) {
      if (
        sample.round !== Math.floor(index / ENGINES.length) ||
        sample.engine !== ENGINES[index % ENGINES.length] ||
        sample.id !== row.id ||
        sample.size !== row.size ||
        sample.samplesMs.length !== 1 ||
        sample.allocationSamples.length !== 1
      )
        throw new Error("Matched sample order or identity mismatch");
      validateRawStat(sample.samplesMs, sample.stat, "matched timing");
      const expected = expectedFormulaOutput(row.id, row.size);
      if (sample.output !== expected) throw new Error("Matched checksum mismatch");
      for (const field of [
        "retainedBytes",
        "peakTransientBytes",
        "transientAllocations",
      ] as const) {
        const allocations = sample.allocationSamples.map((allocation) => allocation[field]);
        if (allocations.some((value) => !Number.isSafeInteger(value) || value < 0))
          throw new Error("Invalid matched allocation");
        validateRawStat(allocations, sample.allocationStat[field], "matched allocation");
      }
    }
    const defaultSamples = rowSamples(row.samples, "default");
    const fullSamples = rowSamples(row.samples, "full");
    const ratios = defaultSamples.map((duration, index) => {
      const fullDuration = fullSamples[index];
      if (fullDuration === undefined) throw new Error("Missing paired full sample");
      return fullDuration / duration;
    });
    validateRawStat(defaultSamples, row.defaultStat, "matched default summary");
    validateRawStat(fullSamples, row.fullStat, "matched full summary");
    validateRawStat(ratios, row.ratioStat, "matched ratio summary");
    if (row.ratioP10 !== percentile(ratios, 0.1) || row.ratioP90 !== percentile(ratios, 0.9))
      throw new Error("Matched spread does not match samples");
  }
}
async function captureMatchedEngines(): Promise<void> {
  const meta = protocolCaptureMeta();
  const rows: MatchedEngineRow[] = [];
  for (const workload of MATCHED_ENGINE_WORKLOADS) {
    const samples: MatchedSample[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      for (const engine of ENGINES) {
        const child = Bun.spawnSync(
          ["bun", "run", "src/formula-bench.ts", "--sample", workload.id, String(workload.size)],
          {
            cwd: new URL("..", import.meta.url).pathname,
            env: { ...process.env, SHEETWRITE_BENCH_ENGINE: engine },
            stdout: "pipe",
            stderr: "inherit",
          },
        );
        if (child.exitCode !== 0) throw new Error(`${engine} ${workload.id} sample failed`);
        samples.push({
          ...(JSON.parse(child.stdout.toString()) as CompleteFormulaWorkloadResult),
          engine,
          round,
        });
      }
    }
    const defaultSamples = rowSamples(samples, "default");
    const fullSamples = rowSamples(samples, "full");
    const ratios = defaultSamples.map((duration, index) => {
      const fullDuration = fullSamples[index];
      if (fullDuration === undefined) throw new Error("Missing paired full sample");
      return fullDuration / duration;
    });
    rows.push({
      ...workload,
      samples,
      defaultStat: summarize(defaultSamples),
      fullStat: summarize(fullSamples),
      ratioStat: summarize(ratios),
      ratioP10: percentile(ratios, 0.1),
      ratioP90: percentile(ratios, 0.9),
    });
  }
  const sourceFiles = Object.fromEntries(
    SOURCE_PATHS.map((path) => [
      path,
      hash(readFileSync(new URL(`../../${path}`, import.meta.url))),
    ]),
  );
  const result: MatchedEngineResult = {
    schemaVersion: 1,
    meta,
    runner: {
      cpu: cpus()[0]?.model ?? "unknown",
      kernel: release(),
      bun: Bun.version,
      arch: process.arch,
      concurrency: 1,
    },
    method: METHOD,
    rounds: ROUNDS,
    sourceFiles,
    sourceDigest: sourceDigest({ meta, sourceFiles }),
    rows,
  };
  validateMatchedEngineResult(result);
  await Bun.write(
    new URL("../results/full-engine-matched-results.json", import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}
if (import.meta.main) await captureMatchedEngines();
