/**
 * Measures the formula engine of the next release against the last release on
 * one machine, so the Formula engine page can show what the coming engine
 * changes, before its release capture exists.
 *
 *   bun src/engine-comparison.ts --base 0.6.0 \
 *     --base-checkout <clean checkout of v0.6.0, packages built> \
 *     --candidate-checkout <clean checkout of develop, packages built>
 *
 * Run it on an otherwise idle machine, holding every benchmark and build slot,
 * with every CPU available: as in the release capture, the JavaScript engine
 * compiles the WASM engine on other cores, and a capture pinned to one core
 * measures that compilation as well. The script refuses a restricted CPU set.
 *
 * The base and candidate captures run the candidate's own formula benchmark,
 * one after the other in one process tree, so both sides share the harness and
 * the CPUs. A third, control capture runs the release's own benchmark on its
 * own engine in the same window: set beside the release's committed capture,
 * it shows how much of a difference in absolute time is the machine on the
 * day rather than the harness. The base side loads the release's engine through
 * `SHEETWRITE_BENCH_ENGINE_ROOT`, which records the engine's provenance in the
 * capture. The captures, and `capture.json` with both commits, the order, the
 * command and the machine, go to `results/engine-comparison/<platform>/`.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release as kernelRelease, totalmem } from "node:os";
import { resolve } from "node:path";

import { optionValue, requiredOption } from "./cli-options.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");

export const ENGINE_COMPARISON_PROTOCOL = "sheetwrite-engine-comparison-v3";

/** Artifact names, inside the candidate checkout's results and the output directory. */
export const ENGINE_COMPARISON_ARTIFACTS = {
  base: "formula-base.json",
  candidate: "formula-candidate.json",
  control: "formula-control.json",
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
  checkout: string,
  environment: Record<string, string>,
): void {
  const output = `results/${ENGINE_COMPARISON_ARTIFACTS[side]}`;
  process.stderr.write(`\n=== ${side}: bun run src/formula-bench.ts --output ${output}\n`);
  const child = Bun.spawnSync(["bun", "run", "src/formula-bench.ts", "--output", output], {
    cwd: resolve(checkout, "bench"),
    env: { ...process.env, ...environment },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(`the ${side} formula capture failed with exit code ${child.exitCode}`);
  }
}

/**
 * The CPUs this process may run on, as Linux lists them ("0-19"); other
 * systems schedule on every CPU.
 */
async function cpuAffinity(): Promise<string> {
  if (platform() !== "linux") return `0-${cpus().length - 1}`;
  const status = await readFile("/proc/self/status", "utf8");
  const allowed = /^Cpus_allowed_list:\s*(\S+)$/mu.exec(status)?.[1];
  if (allowed === undefined) throw new Error("cannot read this process's CPU affinity");
  return allowed;
}

/** The platform power profile and CPU energy preference, where Linux reports them. */
async function powerProfile(): Promise<string> {
  if (platform() !== "linux") return "not reported";
  const read = async (path: string): Promise<string | undefined> => {
    const file = Bun.file(path);
    return (await file.exists()) ? (await file.text()).trim() : undefined;
  };
  const profile = await read("/sys/firmware/acpi/platform_profile");
  const preference = await read(
    "/sys/devices/system/cpu/cpu0/cpufreq/energy_performance_preference",
  );
  return [profile, preference].filter((value) => value !== undefined).join(" · ") || "not reported";
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

  const affinity = await cpuAffinity();
  const everyCpu = `0-${cpus().length - 1}`;
  if (affinity !== everyCpu) {
    throw new Error(
      `this process may run only on CPUs ${affinity}; a formula capture needs every CPU (${everyCpu}), so background compilation does not share the measured core`,
    );
  }

  const startedAt = new Date().toISOString();
  capture("base", candidateCheckout, {
    SHEETWRITE_BENCH_ENGINE_ROOT: baseCheckout,
    SHEETWRITE_BENCH_BASELINE_VERSION: baseVersion,
  });
  capture("candidate", candidateCheckout, {});
  capture("control", baseCheckout, {});
  const finishedAt = new Date().toISOString();

  await mkdir(outputDir, { recursive: true });
  for (const [side, artifact] of Object.entries(ENGINE_COMPARISON_ARTIFACTS)) {
    const checkout = side === "control" ? baseCheckout : candidateCheckout;
    await copyFile(resolve(checkout, "bench/results", artifact), resolve(outputDir, artifact));
  }
  const processors = cpus();
  const manifest = {
    protocol: ENGINE_COMPARISON_PROTOCOL,
    base: { version: baseVersion, commit: baseCommit },
    candidate: { commit: candidateCommit },
    order: ["base", "candidate", "control"],
    machine: {
      os: `${platform()} ${kernelRelease()}`,
      arch: arch(),
      cpu: processors[0]?.model ?? "unknown",
      logicalCores: processors.length,
      cpuAffinity: affinity,
      powerProfile: await powerProfile(),
      memoryBytes: totalmem(),
      bun: Bun.version,
    },
    startedAt,
    finishedAt,
    command: `bun src/engine-comparison.ts --base ${baseVersion} --base-checkout <clean checkout of v${baseVersion}, packages built> --candidate-checkout <clean checkout of the candidate, packages built>`,
    artifacts: ENGINE_COMPARISON_ARTIFACTS,
  };
  await writeFile(resolve(outputDir, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(`\nwrote both captures and capture.json to ${outputDir}\n`);
}

if (import.meta.main) await main();
