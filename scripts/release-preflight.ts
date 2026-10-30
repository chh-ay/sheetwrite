import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");

async function run(command: readonly string[]): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd: repositoryRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
  }
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
  const expectedSha = process.env.EXPECTED_SHA;
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full lowercase commit SHA");
  }

  const actualSha = await run(["git", "rev-parse", "HEAD"]);
  if (actualSha !== expectedSha) {
    throw new Error(`Checked out ${actualSha}, expected ${expectedSha}`);
  }
  await run(["git", "merge-base", "--is-ancestor", expectedSha, "origin/develop"]);
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
      `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${expectedSha}&event=push&branch=develop&per_page=100`,
      "--jq",
      ".workflow_runs",
    ]),
  ) as CiRun[];
  const ciRunId = selectCiRun(runs, expectedSha, repository);

  await run(["npm", "ping", "--registry", "https://registry.npmjs.org"]);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(outputPath, `commit=${expectedSha}\nci_run_id=${ciRunId}\n`, "utf8");

  console.log(`Release preflight passed for ${expectedSha} using CI run ${ciRunId}`);
}

if (import.meta.main) await main();
