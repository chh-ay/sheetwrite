/**
 * Measures the formula engine of the next release against the last release on
 * one machine, so the Formula engine page can show what the coming engine
 * changes, before its release capture exists.
 *
 *   bench-run --slot <cpu> bun src/engine-comparison.ts --base 0.6.0 \
 *     --base-checkout <clean checkout of v0.6.0, packages built> \
 *     --candidate-checkout <clean checkout of develop, packages built>
 *
 * Both captures run the candidate's own formula benchmark, one after the
 * other in one process tree, so both sides share the harness, the core and
 * the CPU. The base side loads the release's engine through
 * `SHEETWRITE_BENCH_ENGINE_ROOT`, which records the engine's provenance in the
 * capture. The captures, and `capture.json` with both commits, the order, the
 * command and the machine, go to `results/engine-comparison/<platform>/`.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release as kernelRelease, totalmem } from "node:os";
import { resolve } from "node:path";

import { optionValue, requiredOption } from "./cli-options.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");

export const ENGINE_COMPARISON_PROTOCOL = "sheetwrite-engine-comparison-v1";

/** Artifact names, inside the candidate checkout's results and the output directory. */
export const ENGINE_COMPARISON_ARTIFACTS = {
  base: "formula-base.json",
  candidate: "formula-candidate.json",
} as const;

function run(command: readonly string[], cwd: string): string {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

/** A clean checkout, at the commit its stamp names; results are outputs and may differ. */
function cleanCommit(checkout: string): string {
  const dirty = run(
    ["git", "status", "--porcelain", "--untracked-files=no", "--", ":!bench/results"],
    checkout,
  );
  if (dirty) throw new Error(`${checkout} has uncommitted changes`);
  return run(["git", "rev-parse", "HEAD"], checkout);
}

function capture(
  side: keyof typeof ENGINE_COMPARISON_ARTIFACTS,
  candidateCheckout: string,
  environment: Record<string, string>,
): void {
  const output = `results/${ENGINE_COMPARISON_ARTIFACTS[side]}`;
  process.stderr.write(`\n=== ${side}: bun run src/formula-bench.ts --output ${output}\n`);
  const child = Bun.spawnSync(["bun", "run", "src/formula-bench.ts", "--output", output], {
    cwd: resolve(candidateCheckout, "bench"),
    env: { ...process.env, ...environment },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(`the ${side} formula capture failed with exit code ${child.exitCode}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const baseVersion = requiredOption(args, "--base");
  const baseCheckout = resolve(requiredOption(args, "--base-checkout"));
  const candidateCheckout = resolve(requiredOption(args, "--candidate-checkout"));
  const baseCommit = cleanCommit(baseCheckout);
  const tagCommit = run(["git", "rev-parse", `v${baseVersion}^{commit}`], baseCheckout);
  if (baseCommit !== tagCommit) {
    throw new Error(
      `${baseCheckout} is at ${baseCommit}, not the v${baseVersion} commit ${tagCommit}`,
    );
  }
  const candidateCommit = cleanCommit(candidateCheckout);
  const outputDir = resolve(
    BENCH_ROOT,
    optionValue(args, "--output-dir") ?? `results/engine-comparison/${platform()}`,
  );

  const startedAt = new Date().toISOString();
  capture("base", candidateCheckout, {
    SHEETWRITE_BENCH_ENGINE_ROOT: baseCheckout,
    SHEETWRITE_BENCH_BASELINE_VERSION: baseVersion,
  });
  capture("candidate", candidateCheckout, {});
  const finishedAt = new Date().toISOString();

  await mkdir(outputDir, { recursive: true });
  for (const artifact of Object.values(ENGINE_COMPARISON_ARTIFACTS)) {
    await copyFile(
      resolve(candidateCheckout, "bench/results", artifact),
      resolve(outputDir, artifact),
    );
  }
  const processors = cpus();
  const manifest = {
    protocol: ENGINE_COMPARISON_PROTOCOL,
    base: { version: baseVersion, commit: baseCommit },
    candidate: { commit: candidateCommit },
    order: ["base", "candidate"],
    machine: {
      os: `${platform()} ${kernelRelease()}`,
      arch: arch(),
      cpu: processors[0]?.model ?? "unknown",
      logicalCores: processors.length,
      memoryBytes: totalmem(),
      bun: Bun.version,
    },
    startedAt,
    finishedAt,
    command: `bench-run --slot <cpu> bun src/engine-comparison.ts --base ${baseVersion} --base-checkout <clean checkout of v${baseVersion}, packages built> --candidate-checkout <clean checkout of the candidate, packages built>`,
    artifacts: ENGINE_COMPARISON_ARTIFACTS,
  };
  await writeFile(resolve(outputDir, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(`\nwrote both captures and capture.json to ${outputDir}\n`);
}

if (import.meta.main) await main();
