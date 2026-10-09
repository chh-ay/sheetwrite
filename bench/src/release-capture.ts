import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONTROLLED_BASELINE_MINIMUM_ROUNDS } from "./controlled-baseline.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const SCRATCH_DIRECTORY = "results/smoke";
/** The codec checkout the XLSX capture compares against; see `bench:xlsx`. */
const XLSX_BASELINE_COMMIT = "87fadb72397947ea8c6ba576682925c7879579b8";
/** Replaced with `--xlsx-baseline-root` at run time. */
const XLSX_BASELINE_ROOT_TOKEN = "{xlsx-baseline-root}";

interface ReleaseOptions {
  /** Prepared checkout of the XLSX baseline commit with its packages built. */
  readonly xlsxBaselineRoot: string;
}

/** One capture the evidence page publishes numbers from. */
interface CaptureStep {
  readonly name: string;
  /** Artifact file names under the results directory. */
  readonly artifacts: readonly string[];
  /** Commands of the full capture, in order. */
  readonly full: readonly (readonly string[])[];
  /** Rehearsal commands; absent when the suite has no smoke matrix. */
  readonly smoke?: readonly (readonly string[])[];
}

/**
 * The order matters: the browser capture is the longest run, so it starts
 * first, and the regression baseline is recorded last, on the frozen harness,
 * after every evidence artifact of this commit exists.
 */
const STEPS: readonly CaptureStep[] = [
  {
    name: "render-scale",
    artifacts: ["render-scale.json"],
    full: [["bench:render:scale"]],
    smoke: [
      [
        "src/render-driver.ts",
        "--smoke",
        "--output",
        `${SCRATCH_DIRECTORY}/render-scale.json`,
        "--markdown-output",
        `${SCRATCH_DIRECTORY}/render-scale.md`,
      ],
    ],
  },
  {
    name: "data",
    artifacts: ["data-results.json"],
    full: [["bench:data"]],
    smoke: [["src/data-bench.ts", "--smoke", "--output", `${SCRATCH_DIRECTORY}/data-results.json`]],
  },
  {
    name: "core-paths",
    artifacts: ["core-paths-results.json"],
    full: [["bench:core-paths"]],
    smoke: [
      [
        "src/core-paths-bench.ts",
        "--smoke",
        "--output",
        `${SCRATCH_DIRECTORY}/core-paths-results.json`,
      ],
    ],
  },
  {
    name: "formula",
    artifacts: ["formula-results.json"],
    full: [["bench:formula"]],
    smoke: [
      ["src/formula-bench.ts", "--smoke", "--output", `${SCRATCH_DIRECTORY}/formula-results.json`],
    ],
  },
  {
    name: "formula-engines",
    artifacts: [
      "formula-default-results.json",
      "formula-full-results.json",
      "full-engine-results.json",
    ],
    full: [["bench:formula:engines"]],
  },
  {
    name: "formula-matched",
    artifacts: ["full-engine-matched-results.json"],
    full: [["bench:formula:matched"]],
  },
  {
    name: "xlsx",
    artifacts: ["xlsx-results.json"],
    full: [["bench:xlsx", "--baseline-root", XLSX_BASELINE_ROOT_TOKEN]],
    smoke: [["src/xlsx-bench.ts", "--smoke", "--output", `${SCRATCH_DIRECTORY}/xlsx-results.json`]],
  },
  {
    // A harness, protocol, or runner change invalidates the committed
    // fingerprint, so the release capture re-records the baseline from the
    // frozen harness: ten controlled rounds, then the promotion of that raw
    // artifact as a standalone, reviewable baseline diff.
    name: "regression-baseline",
    artifacts: ["render-baseline-raw.json", "render-baseline.json"],
    full: [
      [
        "src/render-driver.ts",
        "--rounds",
        String(CONTROLLED_BASELINE_MINIMUM_ROUNDS),
        "--output",
        "results/render-baseline-raw.json",
        "--markdown-output",
        "results/render-baseline-raw.md",
      ],
      [
        "src/generate-baseline.ts",
        "--input",
        "results/render-baseline-raw.json",
        "--power-mode",
        "balanced",
        "--concurrency",
        "1",
        "--write-baseline",
      ],
    ],
  },
];

/** Every artifact the evidence page publishes, in capture order. */
export const RELEASE_ARTIFACTS: readonly string[] = STEPS.flatMap((step) => step.artifacts);

/** Rehearsal commands that write artifacts, for the scratch-directory contract. */
export const RELEASE_SMOKE_COMMANDS: readonly (readonly string[])[] = STEPS.flatMap(
  (step) => step.smoke ?? [],
);

interface ArtifactStamp {
  readonly file: string;
  readonly commit: string;
  readonly dirty: boolean | undefined;
  readonly timestamp: string | undefined;
}

function gitOutput(args: readonly string[]): string {
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

function runStep(name: string, command: readonly string[]): void {
  process.stderr.write(`\n=== ${name}: bun run ${command.join(" ")}\n`);
  const child = Bun.spawnSync(["bun", "run", ...command], {
    cwd: BENCH_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(`${name} capture failed with exit code ${child.exitCode}`);
  }
}

/**
 * Read an artifact's capture stamp. Every protocol states it as `meta` or
 * `metadata`; the promoted regression baseline states the commit under
 * `source` and carries no dirty flag of its own.
 */
async function artifactStamp(path: string): Promise<ArtifactStamp | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  const value = (await file.json()) as {
    meta?: { commit?: unknown; dirty?: unknown; timestamp?: unknown };
    metadata?: { commit?: unknown; dirty?: unknown; timestamp?: unknown };
    source?: { commit?: unknown };
  };
  const stamp = value.meta ?? value.metadata ?? value.source;
  if (stamp === undefined) return undefined;
  const { commit } = stamp;
  if (typeof commit !== "string") return undefined;
  const dirty = "dirty" in stamp ? stamp.dirty : undefined;
  const timestamp = "timestamp" in stamp ? stamp.timestamp : undefined;
  return {
    file: path,
    commit,
    dirty: typeof dirty === "boolean" ? dirty : undefined,
    timestamp: typeof timestamp === "string" ? timestamp : undefined,
  };
}

/** Substitute run-time values into a step's arguments. */
function resolveCommands(
  commands: readonly (readonly string[])[],
  options: ReleaseOptions,
): readonly (readonly string[])[] {
  return commands.map((command) =>
    command.map((argument) =>
      argument === XLSX_BASELINE_ROOT_TOKEN ? options.xlsxBaselineRoot : argument,
    ),
  );
}

/**
 * The XLSX capture compares the current tree against the pre-0.5.0 codec, so it
 * needs a prepared checkout of that commit before the run starts: failing here
 * costs seconds, failing after the browser capture costs the whole run.
 */
function requireXlsxBaselineRoot(argument: string | undefined): string {
  if (argument === undefined || argument.startsWith("--")) {
    throw new Error(
      `the release capture needs --xlsx-baseline-root: a checkout of ${XLSX_BASELINE_COMMIT} with its packages built, for example\n` +
        `  git worktree add ../sheetwrite-xlsx-baseline ${XLSX_BASELINE_COMMIT}\n` +
        `  (cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages)`,
    );
  }
  if (!existsSync(resolve(argument))) {
    throw new Error(`--xlsx-baseline-root does not exist: ${argument}`);
  }
  return resolve(argument);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const smoke = args.includes("--smoke");
  const optionIndex = args.indexOf("--xlsx-baseline-root");
  const options: ReleaseOptions = {
    xlsxBaselineRoot: smoke
      ? ""
      : requireXlsxBaselineRoot(optionIndex < 0 ? undefined : args[optionIndex + 1]),
  };
  const commit = gitOutput(["rev-parse", "HEAD"]);
  const dirtyTree = gitOutput(["status", "--porcelain", "--untracked-files=no"]).length > 0;
  if (dirtyTree) {
    throw new Error(
      "the working tree has uncommitted changes; every published artifact must stamp a clean commit",
    );
  }
  const resultsDir = resolve(BENCH_ROOT, smoke ? SCRATCH_DIRECTORY : "results");
  process.stderr.write(
    [
      `release capture at ${commit.slice(0, 12)}${smoke ? " (smoke rehearsal)" : ""}`,
      smoke
        ? `writing rehearsals to ${resultsDir}; tracked evidence is not touched`
        : `writing evidence to ${resultsDir}`,
      smoke
        ? "the engine captures and the regression baseline have no smoke matrix and are skipped; run without --smoke for the release set"
        : "run on an otherwise idle machine, pinned to one CPU (e.g. `taskset -c 4 bun run bench:release` on Linux); no concurrent builds or timing captures, because competing work adds scheduler and CPU noise",
      "",
    ].join("\n"),
  );

  const captured: ArtifactStamp[] = [];
  for (const step of STEPS) {
    const commands = smoke ? step.smoke : step.full;
    if (commands === undefined) {
      process.stderr.write(`\n=== ${step.name}: skipped (no smoke matrix)\n`);
      continue;
    }
    for (const command of resolveCommands(commands, options)) runStep(step.name, command);
    for (const artifact of step.artifacts) {
      const stamp = await artifactStamp(resolve(resultsDir, artifact));
      if (stamp === undefined) {
        throw new Error(`${step.name} did not write ${artifact} with a capture stamp`);
      }
      if (!smoke && (stamp.commit !== commit || stamp.dirty === true)) {
        throw new Error(`${artifact} does not stamp this clean commit ${commit}`);
      }
      captured.push(stamp);
    }
  }

  process.stderr.write(
    [
      "",
      smoke ? "smoke rehearsal complete:" : "release capture complete:",
      ...captured.map(
        (stamp) =>
          `  ${stamp.file}  ${stamp.commit.slice(0, 12)}${stamp.dirty === true ? " (dirty)" : ""}  ${stamp.timestamp ?? "no timestamp"}`,
      ),
      "",
      smoke
        ? "Nothing was published. Run without --smoke for the release evidence."
        : "Next: commit these artifacts, then `bun run docs:generate` regenerates docs/src/content/docs/guides/performance-resources.md from them.",
      "",
    ].join("\n"),
  );
}

if (import.meta.main) await main();
