import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import {
  AGGREGATED_SAMPLE_MAX_ITERATIONS,
  type AggregatedWorkloadSample,
  expectedFormulaOutput,
  SAMPLE_AGGREGATE_MS,
  SAMPLE_WARMUP_FIXTURES,
} from "./formula-bench.js";
import { validateExactMatrix, validateRawStat } from "./gate-protocol.js";
import { type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { resultsDirectory } from "./results-dir.js";
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
const DEFAULT_ROUNDS = 25;
const MINIMUM_ROUNDS = 2;
const ENGINES = ["default", "full"] as const;
type EngineId = (typeof ENGINES)[number];
export const MATCHED_MINIMUM_SAMPLE_MS = SAMPLE_AGGREGATE_MS;
export const MATCHED_WARMUP_FIXTURES = SAMPLE_WARMUP_FIXTURES;
/** Protocol description of one capture; the round count is part of the protocol. */
export function matchedMethod(rounds: number): string {
  return `${rounds} ABAB paired rounds per workload; each timed sample uses a fresh Bun process, runs ${MATCHED_WARMUP_FIXTURES} untimed warm-up fixtures, then repeats the fixture until at least ${MATCHED_MINIMUM_SAMPLE_MS} ms of measured time and records the per-iteration mean`;
}
const SOURCE_PATHS = [
  "bench/src/matched-engine-bench.ts",
  "bench/src/formula-bench.ts",
  "bench/src/formula-dataset.ts",
  "bench/src/stats.ts",
  "packages/wasm/pkg/sheetwrite_wasm_bg.wasm",
  "packages/formulas/pkg/sheetwrite_wasm_bg.wasm",
];
interface MatchedSample extends AggregatedWorkloadSample {
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
  schemaVersion: 2;
  meta: ProtocolCaptureMeta;
  runner: { cpu: string; kernel: string; bun: string; arch: string; concurrency: 1 };
  method: string;
  /** Paired ABAB rounds; a rehearsal may declare fewer than the release default. */
  rounds: number;
  minimumSampleDurationMs: typeof MATCHED_MINIMUM_SAMPLE_MS;
  warmupFixtures: typeof MATCHED_WARMUP_FIXTURES;
  sourceFiles: Record<string, string>;
  sourceDigest: string;
  rows: MatchedEngineRow[];
}
/** Floating-point slack when a sample's mean is recomputed from its total and iteration count. */
const SAMPLE_MEAN_TOLERANCE_MS = 1e-6;
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
/**
 * One matched sample must be a fresh-process aggregate: the declared number of
 * untimed warm-up fixtures, at least the declared floor of measured time, and a
 * per-iteration mean that matches its own total and iteration count.
 */
function validateAggregatedSample(sample: MatchedSample, label: string): void {
  if (
    sample.warmupFixtures !== MATCHED_WARMUP_FIXTURES ||
    !Number.isInteger(sample.iterations) ||
    sample.iterations < 1 ||
    sample.iterations > AGGREGATED_SAMPLE_MAX_ITERATIONS ||
    !Number.isFinite(sample.totalMs) ||
    sample.totalMs < MATCHED_MINIMUM_SAMPLE_MS
  ) {
    throw new Error(`${label}: sample is not an aggregate of the declared matched protocol`);
  }
  const observedMean = sample.samplesMs[0];
  if (
    observedMean === undefined ||
    Math.abs(observedMean - sample.totalMs / sample.iterations) > SAMPLE_MEAN_TOLERANCE_MS
  ) {
    throw new Error(`${label}: sample mean does not match its total and iteration count`);
  }
}

export function validateMatchedEngineResult(result: MatchedEngineResult): void {
  if (
    result.schemaVersion !== 2 ||
    !Number.isInteger(result.rounds) ||
    result.rounds < MINIMUM_ROUNDS ||
    result.method !== matchedMethod(result.rounds) ||
    result.minimumSampleDurationMs !== MATCHED_MINIMUM_SAMPLE_MS ||
    result.warmupFixtures !== MATCHED_WARMUP_FIXTURES ||
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
    if (row.samples.length !== result.rounds * ENGINES.length)
      throw new Error("Missing matched samples");
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
      validateAggregatedSample(sample, `matched sample ${workloadKey(row)} round ${sample.round}`);
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
/**
 * Run one matched sample in its own Bun process. A fresh process keeps the two
 * engines from sharing JIT tiers, heap state, or a warmed module cache, while
 * the child's warm-up fixtures and aggregation remove the per-process cold-run
 * bias that made single short runs unusable.
 */
function runMatchedSample(workload: { id: string; size: number }, engine: EngineId): MatchedSample {
  const child = Bun.spawnSync(
    [
      "bun",
      "run",
      "src/formula-bench.ts",
      "--sample",
      workload.id,
      String(workload.size),
      "--aggregate-ms",
      String(MATCHED_MINIMUM_SAMPLE_MS),
      "--warmup-fixtures",
      String(MATCHED_WARMUP_FIXTURES),
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, SHEETWRITE_BENCH_ENGINE: engine },
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  if (child.exitCode !== 0) throw new Error(`${engine} ${workload.id} sample failed`);
  return JSON.parse(child.stdout.toString()) as MatchedSample;
}

async function captureMatchedEngines(rounds: number, resultsDir: string): Promise<void> {
  const meta = protocolCaptureMeta();
  const rows: MatchedEngineRow[] = [];
  for (const workload of MATCHED_ENGINE_WORKLOADS) {
    const samples: MatchedSample[] = [];
    for (let round = 0; round < rounds; round++) {
      for (const engine of ENGINES) {
        samples.push({ ...runMatchedSample(workload, engine), engine, round });
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
    schemaVersion: 2,
    meta,
    runner: {
      cpu: cpus()[0]?.model ?? "unknown",
      kernel: release(),
      bun: Bun.version,
      arch: process.arch,
      concurrency: 1,
    },
    method: matchedMethod(rounds),
    rounds,
    minimumSampleDurationMs: MATCHED_MINIMUM_SAMPLE_MS,
    warmupFixtures: MATCHED_WARMUP_FIXTURES,
    sourceFiles,
    sourceDigest: sourceDigest({ meta, sourceFiles }),
    rows,
  };
  validateMatchedEngineResult(result);
  await Bun.write(
    resolve(resultsDir, "full-engine-matched-results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const roundsIndex = args.indexOf("--rounds");
  const requestedRounds = roundsIndex < 0 ? undefined : Number(args[roundsIndex + 1]);
  const rounds = requestedRounds ?? DEFAULT_ROUNDS;
  if (!Number.isInteger(rounds) || rounds < MINIMUM_ROUNDS) {
    throw new TypeError(`--rounds must be an integer >= ${MINIMUM_ROUNDS}`);
  }
  await captureMatchedEngines(rounds, resultsDirectory(args));
}
