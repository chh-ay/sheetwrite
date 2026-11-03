import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PAIRS = 7;
const AGGREGATE_MS = 50;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const CAPTURE_TIMEOUT_MS = 180_000;
const rootPrefix = process.argv[2];
const outputPath = process.argv[3];
if (!rootPrefix || !outputPath) throw new Error("Pass worktree prefix and output JSONL path");
const baseline = `${rootPrefix}-base`;
const harness = resolve(baseline, "bench/src/profile325.ts");
const nodeHarness = resolve(baseline, "bench/src/profile325.mjs");
interface WorkloadSample {
  id: string;
  size: number;
  samplesMs: number[];
  totalMs: number;
  iterations: number;
  allocationSamples: { retainedBytes: number; peakTransientBytes: number; transientAllocations: number }[];
  output: number | string;
}
function capture(runtime: string, engine: string, root: string): WorkloadSample[] {
  const result = spawnSync(runtime, ["--expose-gc", runtime === "bun" ? harness : nodeHarness], {
    cwd: baseline,
    env: { ...process.env, PROFILE_MS: String(AGGREGATE_MS), PROFILE_ENGINE_ROOT: root, SHEETWRITE_BENCH_ENGINE: engine },
    encoding: "utf8",
    maxBuffer: MAX_CAPTURE_BYTES,
    timeout: CAPTURE_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) throw new Error(`${runtime} ${engine} capture failed: ${result.error ?? result.stderr}`);
  return result.stdout.trim().split("\n").map((line) => JSON.parse(line) as WorkloadSample);
}
function identity(root: string, engine: string) {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0) throw new Error("Cannot identify engine commit");
  const pkg = engine === "full" ? "formulas" : "wasm";
  return { commit: commit.stdout.trim(), wasmSha256: createHash("sha256").update(readFileSync(resolve(root, `packages/${pkg}/pkg/sheetwrite_wasm_bg.wasm`))).digest("hex") };
}
writeFileSync(outputPath, "");
for (const engine of ["default", "full"]) {
  for (const runtime of ["bun", "node"]) {
    for (const option of ["AA", "1", "2", "3"]) {
      const candidate = option === "AA" ? baseline : `${rootPrefix}-${option}`;
      for (let pair = 0; pair < PAIRS; pair++) {
        const order = pair % 2 === 0 ? ["base", "candidate"] : ["candidate", "base"];
        const captures: Partial<Record<string, WorkloadSample[]>> = {};
        for (const side of order) captures[side] = capture(runtime, engine, side === "base" ? baseline : candidate);
        const base = captures.base;
        const changed = captures.candidate;
        if (!base || !changed || base.length !== changed.length) throw new Error("Incomplete pair");
        for (const [index, row] of base.entries()) {
          const other = changed[index];
          if (!other || row.id !== other.id || row.size !== other.size || row.output !== other.output) throw new Error("Paired matrix/output mismatch");
        }
        appendFileSync(outputPath, `${JSON.stringify({ runtime, engine, option, pair, order, baseIdentity: identity(baseline, engine), candidateIdentity: identity(candidate, engine), base, candidate: changed })}\n`);
      }
      process.stderr.write(`Captured ${runtime}/${engine}/${option}: ${PAIRS} pairs\n`);
    }
  }
}
