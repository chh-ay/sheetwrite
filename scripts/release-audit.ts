import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { optionValue } from "../bench/src/cli-options.js";
import { verifyReleaseArtifacts } from "./release-artifacts.js";
import { installCanonicalTarballs } from "./release-lock-integrity.mjs";

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

/**
 * Copies a fixture's manifest and lock, and binds its Sheetwrite placeholders to
 * the canonical tarballs, so npm audits the graph the release installs.
 */
async function bound_fixture(
  path: string,
  tarballs: ReadonlyMap<string, string>,
  temporary_root: string,
): Promise<string> {
  const root = join(temporary_root, path);
  await mkdir(root, { recursive: true });
  for (const file of ["package.json", "package-lock.json"]) {
    await copyFile(join(repository_root, path, file), join(root, file));
  }
  await installCanonicalTarballs(join(root, "package-lock.json"), tarballs);
  return root;
}

async function cli(): Promise<void> {
  const artifact_directory = optionValue(process.argv, "--artifacts");
  if (artifact_directory === undefined) throw new Error("Release audit requires --artifacts");
  const artifact_root = resolve(artifact_directory);
  const release = await verifyReleaseArtifacts(artifact_root);
  const tarballs = new Map(
    release.packages.map((artifact) => [artifact.name, join(artifact_root, artifact.path)]),
  );
  await mkdir(evidence_root, { recursive: true });
  const temporary_root = await mkdtemp(join(tmpdir(), "sheetwrite-release-audit-"));
  try {
    await audit_fixtures(tarballs, temporary_root);
  } finally {
    await rm(temporary_root, { recursive: true, force: true });
  }
}

async function audit_fixtures(
  tarballs: ReadonlyMap<string, string>,
  temporary_root: string,
): Promise<void> {
  const production = await audit(
    "npm-runtime",
    await bound_fixture("test/release-locks/core-xlsx", tarballs, temporary_root),
    ["--omit=dev"],
    true,
  );
  const fixture_directories = [
    ["npm-fixture-consumer", "test/consumer"],
    ["npm-fixture-vite", "test/bundler-fixtures/vite"],
    ["npm-fixture-webpack", "test/bundler-fixtures/webpack"],
    ["npm-fixture-next", "test/bundler-fixtures/next"],
  ] as const;
  // Bound one at a time: the bundler fixtures share one tarball directory.
  const roots: string[] = [];
  for (const [, path] of fixture_directories) {
    roots.push(await bound_fixture(path, tarballs, temporary_root));
  }
  const fixtures = await Promise.all(
    fixture_directories.map(([name], index) =>
      audit(name, roots[index]!, ["--include=dev"], false),
    ),
  );
  console.log(
    `Locked npm runtime audit passed: ${finding_count(production)} low/moderate finding(s); fixture/dev audits recorded ${fixtures.reduce((total, report) => total + finding_count(report), 0)} finding(s)`,
  );
}

if (import.meta.main) await cli();
