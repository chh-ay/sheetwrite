import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { optionValue } from "../bench/src/cli-options.js";
import { verifyReleaseArtifacts } from "./release-artifacts.js";

const repository_root = resolve(import.meta.dir, "..");
const evidence_root = join(repository_root, "test-results/dependency-audit");

interface NpmAuditMetadata {
  readonly vulnerabilities?: Readonly<Record<string, number>>;
}

interface NpmAuditReport {
  readonly metadata?: NpmAuditMetadata;
}

async function audit(
  name: string,
  cwd: string,
  options: readonly string[],
  blocking: boolean,
): Promise<NpmAuditReport> {
  const child = Bun.spawn(
    ["npm", "audit", "--package-lock-only", "--json", "--audit-level=high", ...options],
    { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await Promise.all([
    writeFile(join(evidence_root, `${name}.json`), stdout),
    writeFile(join(evidence_root, `${name}.stderr.txt`), stderr),
  ]);
  let report: NpmAuditReport;
  try {
    report = JSON.parse(stdout) as NpmAuditReport;
  } catch (error) {
    throw new Error(
      `${name} npm audit returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (exit_code !== 0 && (blocking || exit_code !== 1)) {
    throw new Error(`${name} npm audit failed with exit code ${exit_code}: ${stderr.trim()}`);
  }
  return report;
}

function finding_count(report: NpmAuditReport): number {
  return Object.entries(report.metadata?.vulnerabilities ?? {})
    .filter(([severity]) => severity !== "total")
    .reduce((total, [, count]) => total + count, 0);
}

async function cli(): Promise<void> {
  const artifact_directory = optionValue(process.argv, "--artifacts");
  if (artifact_directory === undefined) throw new Error("Release audit requires --artifacts");
  await verifyReleaseArtifacts(resolve(artifact_directory));
  await mkdir(evidence_root, { recursive: true });

  const production = await audit(
    "npm-runtime",
    join(repository_root, "test/release-locks/core-xlsx"),
    ["--omit=dev"],
    true,
  );
  const fixture_directories = [
    ["npm-fixture-consumer", "test/consumer"],
    ["npm-fixture-vite", "test/bundler-fixtures/vite"],
    ["npm-fixture-webpack", "test/bundler-fixtures/webpack"],
    ["npm-fixture-next", "test/bundler-fixtures/next"],
  ] as const;
  const fixtures = await Promise.all(
    fixture_directories.map(([name, path]) =>
      audit(name, join(repository_root, path), ["--include=dev"], false),
    ),
  );
  console.log(
    `Locked npm runtime audit passed: ${finding_count(production)} low/moderate finding(s); fixture/dev audits recorded ${fixtures.reduce((total, report) => total + finding_count(report), 0)} finding(s)`,
  );
}

if (import.meta.main) await cli();
