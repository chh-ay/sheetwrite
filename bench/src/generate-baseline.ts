import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { CONTROLLED_SAMPLING_FINGERPRINT } from "./check.js";
import { optionValue } from "./cli-options.js";
import {
  buildControlledBaseline,
  CONTROLLED_BASELINE_MINIMUM_ROUNDS,
  stableBaselineJson,
} from "./controlled-baseline.js";
import {
  type ControlledRunnerFingerprint,
  computeHarnessFingerprint,
  MATRIX_IDS,
} from "./gate-protocol.js";
import { sourceTreeDirty } from "./protocol-meta.js";
import type { RenderBenchmarkArtifact } from "./render-protocol.js";
import { parseRenderArtifact } from "./render-protocol.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const DEFAULT_CANDIDATE_PATH = resolve(
  BENCH_ROOT,
  "results/candidates/render-baseline-candidate.json",
);
const DEFAULT_RAW_PATH = resolve(BENCH_ROOT, "results/candidates/render-baseline-raw.json");
const DEFAULT_APPROVED_PATH = resolve(BENCH_ROOT, "results/render-baseline.json");

function git_output(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function run_command(command: readonly string[]): void {
  const result = Bun.spawnSync([...command], {
    cwd: BENCH_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited ${result.exitCode}`);
  }
}

function runner_from_artifact(
  artifact: RenderBenchmarkArtifact,
  power_mode: string,
  concurrency: number,
): ControlledRunnerFingerprint {
  if (power_mode.length === 0) throw new Error("--power-mode is required");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }
  return {
    os: artifact.metadata.os,
    arch: artifact.metadata.arch,
    cpu: artifact.metadata.cpu,
    bun: artifact.metadata.bunVersion,
    node: artifact.metadata.nodeVersion,
    browser: artifact.metadata.browserVersion,
    powerMode: power_mode,
    concurrency,
  };
}

export async function generateBaseline(args: readonly string[]): Promise<string> {
  const diagnostic = args.includes("--diagnostic");
  const write_baseline = args.includes("--write-baseline");
  if (diagnostic && write_baseline) {
    throw new Error("--diagnostic can produce review candidates only, not an approved baseline");
  }
  const dirty = sourceTreeDirty(true);
  if (dirty && !diagnostic) {
    throw new Error(
      "baseline generation refuses a dirty tree; use --diagnostic for a non-approved candidate",
    );
  }
  if (dirty && write_baseline) {
    throw new Error("an approved baseline cannot be written from a dirty tree");
  }

  const approved_path = resolve(optionValue(args, "--approved") ?? DEFAULT_APPROVED_PATH);
  const candidate_path = resolve(optionValue(args, "--output") ?? DEFAULT_CANDIDATE_PATH);
  const target_path = write_baseline ? approved_path : candidate_path;
  if (!write_baseline && target_path === approved_path) {
    throw new Error("refusing to overwrite the approved baseline without --write-baseline");
  }
  const power_mode = optionValue(args, "--power-mode") ?? "";
  const concurrency = Number(optionValue(args, "--concurrency") ?? Number.NaN);
  const input_argument = optionValue(args, "--input");
  let raw_path: string;

  if (input_argument) {
    raw_path = resolve(input_argument);
  } else {
    raw_path = resolve(optionValue(args, "--raw-output") ?? DEFAULT_RAW_PATH);
    const markdown_path = raw_path.replace(/\.json$/u, ".md");
    run_command(["bun", "run", "bench:render:prepare"]);
    run_command([
      "bun",
      "run",
      "src/render-driver.ts",
      "--rounds",
      String(CONTROLLED_BASELINE_MINIMUM_ROUNDS),
      "--output",
      raw_path,
      "--markdown-output",
      markdown_path,
    ]);
  }

  if (!existsSync(raw_path)) throw new Error(`raw controlled artifact does not exist: ${raw_path}`);
  const raw_bytes = readFileSync(raw_path);
  const raw_artifact = relative(REPOSITORY_ROOT, raw_path);
  if (raw_artifact === ".." || raw_artifact.startsWith("../")) {
    throw new Error("raw controlled artifact must be stored inside the repository");
  }
  const raw_sha256 = createHash("sha256").update(raw_bytes).digest("hex");
  const artifact = parseRenderArtifact(JSON.parse(raw_bytes.toString("utf8")) as unknown);
  if (artifact.metadata.dirty && !diagnostic) {
    throw new Error("raw controlled artifact was recorded from a dirty tree");
  }
  if (artifact.metadata.dirty && write_baseline) {
    throw new Error("an approved baseline cannot use a dirty raw artifact");
  }
  if (!diagnostic) {
    const head = git_output(["rev-parse", "HEAD"]);
    if (artifact.metadata.commit !== head) {
      throw new Error(
        `stale controlled raw artifact commit: expected ${head}, observed ${artifact.metadata.commit}`,
      );
    }
  }
  const harness = computeHarnessFingerprint(
    MATRIX_IDS.render.full,
    CONTROLLED_SAMPLING_FINGERPRINT,
  );
  const baseline = buildControlledBaseline(
    artifact,
    harness,
    runner_from_artifact(artifact, power_mode, concurrency),
    raw_artifact,
    raw_sha256,
  );
  await Bun.write(target_path, stableBaselineJson(baseline));
  if (!write_baseline && existsSync(approved_path)) {
    process.stderr.write(`approved baseline left unchanged: ${approved_path}\n`);
  }
  process.stderr.write(
    `${write_baseline ? "wrote approved baseline" : "wrote review candidate"}: ${target_path}\n` +
      `raw rounds retained: ${raw_path}\n`,
  );
  return target_path;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  await generateBaseline(args);
}
