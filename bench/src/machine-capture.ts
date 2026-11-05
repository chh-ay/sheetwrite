/**
 * Captures a published release on one more machine, so the Performance pages
 * can show that machine's results in their own section.
 *
 *   bun src/machine-capture.ts --machine mac --release 0.6.0 \
 *     --checkout <clean checkout of v0.6.0, packages built> \
 *     --xlsx-baseline-root <checkout of the XLSX baseline, packages built>
 *
 * The run uses the release's own harness: it runs `bench:release` inside the
 * checkout, so the timings measure exactly what that release shipped. It then
 * copies the published artifacts into `results/machines/<machine>/` of this
 * tree and writes `capture.json` beside them: the release, its commit, the
 * command, and the machine (OS, CPU, cores, memory, Bun). The committed Linux
 * evidence in `results/` is the release machine's; machine captures never
 * replace it, and the pages never compare one machine with another.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release as kernelRelease, totalmem } from "node:os";
import { resolve } from "node:path";

import { optionValue, requiredOption } from "./cli-options.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");

/** Machines with a section on the Performance pages, besides the Linux release machine. */
export const CAPTURE_MACHINES = {
  mac: { label: "Mac", platform: "darwin", arch: "arm64" },
} as const;

export type CaptureMachine = keyof typeof CAPTURE_MACHINES;

/** The artifacts the Performance pages read, as `bench:release` writes them. */
export const MACHINE_CAPTURE_ARTIFACTS = [
  "render-scale.json",
  "interaction-results.json",
  "paged-results.json",
  "data-results.json",
  "core-paths-results.json",
  "chart-tracking-results.json",
  "pivot-results.json",
  "formula-results.json",
  "formula-default-results.json",
  "formula-full-results.json",
  "full-engine-results.json",
  "full-engine-matched-results.json",
  "xlsx-results.json",
] as const;

export const MACHINE_CAPTURE_PROTOCOL = "sheetwrite-machine-capture-v1";

function run(command: readonly string[], cwd: string): string {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function osVersion(): string {
  if (platform() === "darwin") {
    return `macOS ${run(["sw_vers", "-productVersion"], BENCH_ROOT)} (${run(["sw_vers", "-buildVersion"], BENCH_ROOT)})`;
  }
  return `${platform()} ${kernelRelease()}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const machine = requiredOption(args, "--machine");
  if (!(machine in CAPTURE_MACHINES)) {
    throw new Error(`--machine must be one of: ${Object.keys(CAPTURE_MACHINES).join(", ")}`);
  }
  const expected = CAPTURE_MACHINES[machine as CaptureMachine];
  if (platform() !== expected.platform || arch() !== expected.arch) {
    throw new Error(
      `--machine ${machine} captures run on ${expected.platform}/${expected.arch}, not ${platform()}/${arch()}`,
    );
  }
  const version = requiredOption(args, "--release");
  const checkout = resolve(requiredOption(args, "--checkout"));
  const xlsxBaselineRoot = resolve(requiredOption(args, "--xlsx-baseline-root"));
  const commit = run(["git", "rev-parse", "HEAD"], checkout);
  const tagCommit = run(["git", "rev-parse", `v${version}^{commit}`], checkout);
  if (commit !== tagCommit) {
    throw new Error(`${checkout} is at ${commit}, not the v${version} release commit ${tagCommit}`);
  }
  const outputDir = resolve(
    BENCH_ROOT,
    optionValue(args, "--output-dir") ?? `results/machines/${machine}`,
  );
  const releaseCommand = [
    "bun",
    "run",
    "src/release-capture.ts",
    "--xlsx-baseline-root",
    xlsxBaselineRoot,
  ];
  const startedAt = new Date().toISOString();
  process.stderr.write(`capturing ${version} (${commit.slice(0, 12)}) on ${machine}\n`);
  const child = Bun.spawnSync(releaseCommand, {
    cwd: resolve(checkout, "bench"),
    stdout: "inherit",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(`bench:release in ${checkout} failed with exit code ${child.exitCode}`);
  }
  const finishedAt = new Date().toISOString();

  await mkdir(outputDir, { recursive: true });
  for (const artifact of MACHINE_CAPTURE_ARTIFACTS) {
    await copyFile(resolve(checkout, "bench/results", artifact), resolve(outputDir, artifact));
  }
  const processors = cpus();
  const manifest = {
    protocol: MACHINE_CAPTURE_PROTOCOL,
    machine: {
      id: machine,
      label: expected.label,
      os: osVersion(),
      arch: arch(),
      cpu: processors[0]?.model ?? "unknown",
      logicalCores: processors.length,
      memoryBytes: totalmem(),
      bun: Bun.version,
    },
    release: version,
    commit,
    startedAt,
    finishedAt,
    command: `cd bench && bun src/machine-capture.ts --machine ${machine} --release ${version} --checkout <clean checkout of v${version}, packages built> --xlsx-baseline-root <checkout of the XLSX baseline, packages built>`,
    releaseCommand: `cd bench && ${releaseCommand.slice(0, -1).join(" ")} <xlsx baseline root>`,
    artifacts: MACHINE_CAPTURE_ARTIFACTS,
  };
  await writeFile(resolve(outputDir, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(
    `wrote ${MACHINE_CAPTURE_ARTIFACTS.length} artifacts and capture.json to ${outputDir}\n` +
      "Next: commit them, then `bun run docs:generate` shows this machine's section.\n",
  );
}

if (import.meta.main) await main();
