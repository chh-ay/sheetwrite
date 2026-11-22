import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

import { captureProcess } from "./script-io.js";

const repository_root = resolve(import.meta.dir, "..");

async function run(command: readonly string[]): Promise<string> {
  const stdout = await captureProcess(command, {
    cwd: repository_root,
    failure: ({ stdout, stderr, exitCode: exit_code }) =>
      `${command.join(" ")} failed (${exit_code}): ${stderr || stdout}`,
  });
  return stdout.trim();
}

/** A workflow run as the GitHub Actions runs API reports it. */
export interface CiRun {
  readonly id: number;
  readonly head_sha: string;
  readonly head_branch: string | null;
  readonly event: string;
  readonly status: string | null;
  readonly conclusion: string | null;
  readonly head_repository: { readonly full_name: string } | null;
}

/**
 * Selects the newest successful develop push CI run of the release commit.
 * A manual release has no triggering CI run, so the canonical artifacts must
 * come from a run that already passed for exactly this commit.
 */
export function selectCiRun(runs: readonly CiRun[], sha: string, repository: string): number {
  const passed = runs.filter(
    (run) =>
      run.head_sha === sha &&
      run.head_branch === "develop" &&
      run.event === "push" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      run.head_repository?.full_name === repository,
  );

  if (passed.length === 0) {
    throw new Error(`No successful develop push CI run for ${sha}; wait for CI, then run again`);
  }

  return Math.max(...passed.map((run) => run.id));
}

async function main(): Promise<void> {
  const expected_sha = process.env.EXPECTED_SHA;
  if (!expected_sha || !/^[0-9a-f]{40}$/.test(expected_sha)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }

  const actual_sha = await run(["git", "rev-parse", "HEAD"]);
  if (actual_sha !== expected_sha) {
    throw new Error(`Checked out ${actual_sha}, expected ${expected_sha}`);
  }
  await run(["git", "merge-base", "--is-ancestor", expected_sha, "origin/develop"]);
  if ((await run(["git", "status", "--porcelain", "--untracked-files=all"])) !== "") {
    throw new Error("Release checkout is not clean");
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== "chh-ay/sheetwrite") {
    throw new Error(
      `Release workflow must run from chh-ay/sheetwrite, received ${repository ?? "unset"}`,
    );
  }
  const visibility = await run(["gh", "api", `repos/${repository}`, "--jq", ".visibility"]);
  if (visibility !== "public") {
    throw new Error(`Repository visibility is ${visibility}, expected public`);
  }

  const runs = JSON.parse(
    await run([
      "gh",
      "api",
      `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${expected_sha}&event=push&branch=develop&per_page=100`,
      "--jq",
      ".workflow_runs",
    ]),
  ) as CiRun[];
  const ci_run_id = selectCiRun(runs, expected_sha, repository);

  await run(["npm", "ping", "--registry", "https://registry.npmjs.org"]);

  const output_path = process.env.GITHUB_OUTPUT;
  if (!output_path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(output_path, `commit=${expected_sha}\nci_run_id=${ci_run_id}\n`, "utf8");

  console.log(`Release preflight passed for ${expected_sha} using CI run ${ci_run_id}`);
}

if (import.meta.main) await main();
