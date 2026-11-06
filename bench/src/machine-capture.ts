/**
 * Captures a published release on one more machine, so the Performance pages
 * can show that machine's results in their own section.
 *
 *   bun src/machine-capture.ts --machine mac --release 0.6.0 \
 *     --checkout <clean checkout of v0.6.0, packages built> \
 *     --xlsx-baseline-root <checkout of the XLSX baseline, packages built> \
 *     [--suites render-scale,data,...]
 *
 * Each suite runs the release's own benchmark script inside the checkout, so
 * the timings measure exactly what that release shipped. The published
 * artifacts that stamp the release commit are copied into
 * `results/machines/<machine>/`, with `capture.json` beside them: the release,
 * its commit, the command, the machine (OS, CPU, cores, memory, Bun), each
 * artifact's capture time, and every suite that did not complete with its
 * error. `--suites` reruns only the named suites and keeps the artifacts that
 * earlier runs already wrote for this release. The Linux release machine's
 * evidence in `results/` is never replaced, and the pages never compare one
 * machine with another.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release as kernelRelease, totalmem } from "node:os";
import { resolve } from "node:path";

import { optionValue, requiredOption } from "./cli-options.js";

const BENCH_ROOT = resolve(import.meta.dir, "..");

/** Machines with a section on the Performance pages, besides the Linux release machine. */
export const CAPTURE_MACHINES = {
  mac: { label: "Mac", platform: "darwin", arch: "arm64" },
} as const;

export type CaptureMachine = keyof typeof CAPTURE_MACHINES;

/** Replaced with `--xlsx-baseline-root` at run time. */
const XLSX_BASELINE_ROOT = "{xlsx-baseline-root}";

/**
 * The release capture's suites, in its order, with the `bun run` arguments each
 * uses and the artifacts the Performance pages read. The render regression
 * baseline is left out: it pins the release machine for local gates and is not
 * published.
 */
export const MACHINE_CAPTURE_SUITES = [
  { name: "render-scale", script: ["bench:render:scale"], artifacts: ["render-scale.json"] },
  { name: "interaction", script: ["bench:interaction"], artifacts: ["interaction-results.json"] },
  { name: "paged", script: ["bench:paged"], artifacts: ["paged-results.json"] },
  { name: "data", script: ["bench:data"], artifacts: ["data-results.json"] },
  { name: "core-paths", script: ["bench:core-paths"], artifacts: ["core-paths-results.json"] },
  {
    name: "chart-tracking",
    script: ["bench:charts"],
    artifacts: ["chart-tracking-results.json"],
  },
  { name: "pivot", script: ["bench:pivot"], artifacts: ["pivot-results.json"] },
  {
    name: "formula",
    // Output mode: `bench:formula` gates against the release machine's committed
    // capture, which another machine's timings cannot be held to.
    script: ["src/formula-bench.ts", "--output", "results/formula-results.json"],
    artifacts: ["formula-results.json"],
  },
  {
    name: "formula-engines",
    script: ["bench:formula:engines"],
    artifacts: [
      "formula-default-results.json",
      "formula-full-results.json",
      "full-engine-results.json",
    ],
  },
  {
    name: "formula-matched",
    script: ["bench:formula:matched"],
    artifacts: ["full-engine-matched-results.json"],
  },
  {
    name: "xlsx",
    script: ["bench:xlsx", "--baseline-root", XLSX_BASELINE_ROOT],
    artifacts: ["xlsx-results.json"],
  },
] as const;

export const MACHINE_CAPTURE_PROTOCOL = "sheetwrite-machine-capture-v1";

/** How much of a failed suite's output the manifest keeps. */
const ERROR_TAIL_CHARACTERS = 600;

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

/** The capture stamp an artifact states as `meta` or `metadata`, when it has one. */
async function captureStamp(
  path: string,
): Promise<{ commit: string; timestamp: string } | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  const value = JSON.parse(await readFile(path, "utf8")) as {
    meta?: { commit?: unknown; timestamp?: unknown };
    metadata?: { commit?: unknown; timestamp?: unknown };
  };
  const stamp = value.meta ?? value.metadata;
  return typeof stamp?.commit === "string" && typeof stamp.timestamp === "string"
    ? { commit: stamp.commit, timestamp: stamp.timestamp }
    : undefined;
}

/** The last lines a failed suite printed, so the manifest names the error. */
function errorTail(output: string): string {
  const lines = output.trim().split("\n");
  const errorLine = lines.findLast((line) => /error:/iu.test(line));
  return (errorLine ?? lines.at(-1) ?? "").trim().slice(-ERROR_TAIL_CHARACTERS);
}

interface ManifestFailure {
  readonly suite: string;
  readonly error: string;
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
  // Results are outputs, not sources: a written artifact never dirties the measured tree.
  if (
    run(["git", "status", "--porcelain", "--untracked-files=no", "--", ":!bench/results"], checkout)
  ) {
    throw new Error(
      `${checkout} has uncommitted changes; every artifact must stamp a clean release`,
    );
  }
  const selected = optionValue(args, "--suites")?.split(",");
  const unknown =
    selected?.filter((name) => !MACHINE_CAPTURE_SUITES.some((suite) => suite.name === name)) ?? [];
  if (unknown.length > 0) throw new Error(`unknown suites: ${unknown.join(", ")}`);
  const outputDir = resolve(
    BENCH_ROOT,
    optionValue(args, "--output-dir") ?? `results/machines/${machine}`,
  );
  const previous = (await Bun.file(resolve(outputDir, "capture.json")).exists())
    ? (JSON.parse(await readFile(resolve(outputDir, "capture.json"), "utf8")) as {
        failed?: ManifestFailure[];
      })
    : undefined;

  const failed = new Map(
    (previous?.failed ?? []).map((failure) => [failure.suite, failure.error] as const),
  );
  for (const suite of MACHINE_CAPTURE_SUITES) {
    if (selected !== undefined && !selected.includes(suite.name)) continue;
    const command = suite.script.map((part) =>
      part === XLSX_BASELINE_ROOT ? xlsxBaselineRoot : part,
    );
    process.stderr.write(`\n=== ${suite.name}: bun run ${command.join(" ")}\n`);
    const child = Bun.spawnSync(["bun", "run", ...command], {
      cwd: resolve(checkout, "bench"),
      stdout: "inherit",
      stderr: "pipe",
    });
    const stderr = child.stderr.toString();
    process.stderr.write(stderr);
    if (child.exitCode === 0) failed.delete(suite.name);
    else failed.set(suite.name, errorTail(stderr));
  }

  await mkdir(outputDir, { recursive: true });
  const collected: Array<{ artifact: string; timestamp: string }> = [];
  for (const suite of MACHINE_CAPTURE_SUITES) {
    for (const artifact of suite.artifacts) {
      const source = resolve(checkout, "bench/results", artifact);
      const stamp = await captureStamp(source);
      // A checkout carries the release machine's committed artifacts; only this release's runs count.
      if (stamp?.commit !== commit) continue;
      await copyFile(source, resolve(outputDir, artifact));
      collected.push({ artifact, timestamp: stamp.timestamp });
    }
  }
  const timestamps = collected.map((entry) => entry.timestamp).sort();
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
    startedAt: timestamps[0] ?? new Date().toISOString(),
    finishedAt: timestamps.at(-1) ?? new Date().toISOString(),
    command: `cd bench && bun run bench:release:machine -- --machine ${machine} --release ${version} --checkout <clean checkout of v${version}, packages built> --xlsx-baseline-root <checkout of the XLSX baseline, packages built>`,
    artifacts: collected,
    failed: [...failed].map(([suite, error]) => ({ suite, error })),
  };
  await writeFile(resolve(outputDir, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(
    `\nwrote ${collected.length} artifacts and capture.json to ${outputDir}\n` +
      (failed.size > 0 ? `suites that did not complete: ${[...failed.keys()].join(", ")}\n` : "") +
      "Next: commit them, then `bun run docs:generate` shows this machine's section.\n",
  );
}

if (import.meta.main) await main();
