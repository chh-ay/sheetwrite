import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import {
  type CoverageLanguage,
  type CoverageRecord,
  type CoverageTotals,
  evaluateCoveragePolicy,
  filterRuntimeRecords,
  type LcovRecord,
  mergeLcovRecords,
  normalizeRustCoverage,
  parseCoveragePolicy,
  parseLcov,
  scoredRuntimePaths,
  serialiseNormalizedLcov,
} from "./coverage-check.js";
import { captureProcess } from "./script-io.js";
import { COVERED_PACKAGE_TEST_ROOTS } from "./workspace-tooling.js";

const CARGO_LLVM_COV_VERSION = "0.8.7";
const RUST_VERSION = "1.99.0";
const TYPESCRIPT_ROOTS = [
  "packages/core/src",
  "packages/react/src",
  "packages/vue/src",
  "packages/svelte/src",
  "packages/xlsx/src",
  "packages/charts/src",
  "packages/formula-assist/src",
  "packages/queries/src",
] as const;
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".svelte"]);
const RUST_CRATES = [
  {
    name: "wasm",
    directory: "packages/wasm",
    testArguments: ["--features", "analysis"],
  },
  {
    name: "history",
    directory: "packages/wasm/history",
    testArguments: [],
  },
  {
    name: "queries",
    directory: "packages/queries/engine",
    testArguments: [],
  },
] as const;

async function files_recursively(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) output.push(...(await files_recursively(path)));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

export async function discoverRuntimePaths(
  root: string,
  language: CoverageLanguage,
): Promise<readonly string[]> {
  if (language === "rust") {
    // `tests.rs`, `*_tests.rs` and files under a `tests/` directory hold only
    // #[cfg(test)] modules, so they are not runtime sources.
    const paths: string[] = [];
    for (const crate of RUST_CRATES) {
      paths.push(...(await files_recursively(resolve(root, crate.directory, "src"))));
    }

    return paths
      .filter((path) => extname(path) === ".rs" && !/(?:\/|_)tests(?:\.rs$|\/)/u.test(path))
      .map((path) => path.slice(resolve(root).length + 1).replaceAll("\\", "/"))
      .sort();
  }

  const paths: string[] = [];
  for (const source_root of TYPESCRIPT_ROOTS) {
    paths.push(
      ...(await files_recursively(resolve(root, source_root)))
        .filter((path) => TYPESCRIPT_EXTENSIONS.has(extname(path)) && !path.endsWith(".d.ts"))
        .map((path) => path.slice(resolve(root).length + 1).replaceAll("\\", "/")),
    );
  }
  for (const entry of await readdir(resolve(root, "packages/wasm"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith("loader") && entry.name.endsWith(".mjs")) {
      paths.push(`packages/wasm/${entry.name}`);
    }
  }
  return paths.sort();
}

async function run(command: readonly string[], root: string): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd: root,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exit_code = await child.exited;
  if (exit_code !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exit_code}`);
}

async function output_of(command: readonly string[], root: string): Promise<string> {
  const stdout = await captureProcess(command, {
    cwd: root,
    stdin: "ignore",
    failure: ({ stderr, exitCode: exit_code }) =>
      `${command.join(" ")} failed with exit code ${exit_code}: ${stderr.trim()}`,
  });
  return stdout.trim();
}

function ratio(counts: { covered: number; total: number }): string {
  const percent = counts.total === 0 ? 100 : (counts.covered * 100) / counts.total;
  return `${percent.toFixed(2)}% (${counts.covered}/${counts.total})`;
}

function print_table(records: readonly CoverageRecord[], totals: CoverageTotals): void {
  console.log(
    "Source                                                   Lines              Functions          Regions",
  );
  for (const record of [...records].sort((left, right) => left.path.localeCompare(right.path))) {
    console.log(
      `${record.path.padEnd(56)} ${ratio(record.lines).padEnd(18)} ${ratio(record.functions).padEnd(18)} ${record.regions ? ratio(record.regions) : "-"}`,
    );
  }
  const regions = totals.regions ? ratio(totals.regions) : "-";
  console.log(
    `${"TOTAL".padEnd(56)} ${(totals.lines ? ratio(totals.lines) : "-").padEnd(18)} ${(totals.functions ? ratio(totals.functions) : "-").padEnd(18)} ${regions}`,
  );
}

function line_ranges(lines: readonly number[]): string {
  const ranges: Array<[number, number]> = [];
  for (const line of [...new Set(lines)].sort((left, right) => left - right)) {
    const last = ranges.at(-1);
    if (!last || line > last[1] + 1) ranges.push([line, line]);
    else last[1] = line;
  }
  return ranges
    .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`))
    .join(", ");
}

function uncovered_diagnostics(records: readonly CoverageRecord[]): string {
  const sections = [...records]
    .filter((record) => record.uncoveredLines.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((record) => `${record.path}: ${line_ranges(record.uncoveredLines)}`);
  return `${sections.join("\n")}\n`;
}

function normalized_json(language: CoverageLanguage, records: readonly CoverageRecord[]): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      language,
      records: records.map((record) => ({
        path: record.path,
        lines: record.lines,
        functions: record.functions,
        ...(record.regions ? { regions: record.regions } : {}),
        uncoveredLines: record.uncoveredLines,
      })),
    },
    null,
    2,
  )}\n`;
}

async function load_policy(root: string) {
  const text = await readFile(resolve(root, "scripts/coverage-thresholds.json"), "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Coverage policy is malformed JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  return parseCoveragePolicy(raw);
}

async function write_artifacts(options: {
  root: string;
  language: CoverageLanguage;
  artifactRoot: string;
  records: readonly CoverageRecord[];
}): Promise<void> {
  const { root, language, artifactRoot: artifact_root, records } = options;
  await writeFile(
    resolve(root, artifact_root, "normalized.json"),
    normalized_json(language, records),
  );
  await writeFile(resolve(root, artifact_root, "lcov.info"), serialiseNormalizedLcov(records));
  await writeFile(resolve(root, artifact_root, "uncovered.txt"), uncovered_diagnostics(records));
}

export async function runTypeScriptCoverage(root = resolve(import.meta.dir, "..")): Promise<void> {
  const artifact_root = "test-results/coverage/typescript";
  const raw_root = `${artifact_root}/raw`;
  await rm(resolve(root, artifact_root), { recursive: true, force: true });
  await mkdir(resolve(root, raw_root), { recursive: true });

  const coverage_runs = [
    { directory: `${raw_root}/unified`, tests: [...COVERED_PACKAGE_TEST_ROOTS] },
    {
      directory: `${raw_root}/loader-default`,
      tests: [
        "packages/core/test/wasm-loader.test.mjs",
        "--test-name-pattern",
        "packaged default binary",
      ],
    },
  ];
  const reports: Array<readonly LcovRecord[]> = [];
  for (const coverage_run of coverage_runs) {
    await mkdir(resolve(root, coverage_run.directory), { recursive: true });
    await run(
      [
        "bun",
        "test",
        ...coverage_run.tests,
        "--coverage",
        "--coverage-reporter=lcov",
        `--coverage-dir=${coverage_run.directory}`,
      ],
      root,
    );
    reports.push(
      parseLcov(await readFile(resolve(root, coverage_run.directory, "lcov.info"), "utf8"), root),
    );
  }
  const raw_records = mergeLcovRecords(reports);
  await writeFile(resolve(root, raw_root, "lcov.info"), serialiseNormalizedLcov(raw_records));
  const policy = await load_policy(root);
  const scored_paths = scoredRuntimePaths(
    policy,
    "typescript",
    await discoverRuntimePaths(root, "typescript"),
  );
  const records = filterRuntimeRecords(raw_records, scored_paths);
  await write_artifacts({ root, language: "typescript", artifactRoot: artifact_root, records });
  const totals = evaluateCoveragePolicy({
    policy,
    language: "typescript",
    records,
    scoredPaths: scored_paths,
  });
  print_table(records, totals);
  console.log(`TypeScript source coverage passed for ${records.length} scored runtime files`);
}

export async function runRustCoverage(root = resolve(import.meta.dir, "..")): Promise<void> {
  const artifact_root = "test-results/coverage/rust";
  const raw_root = `${artifact_root}/raw`;
  await rm(resolve(root, artifact_root), { recursive: true, force: true });
  await mkdir(resolve(root, raw_root), { recursive: true });

  const cargo_version = await output_of(["cargo", "llvm-cov", "--version"], root);
  if (cargo_version !== `cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}`) {
    throw new Error(
      `Expected cargo-llvm-cov ${CARGO_LLVM_COV_VERSION}, received ${cargo_version || "no version"}`,
    );
  }
  const rust_version = await output_of(["rustc", "--version"], root);
  if (!rust_version.startsWith(`rustc ${RUST_VERSION} `)) {
    throw new Error(`Expected rustc ${RUST_VERSION}, received ${rust_version || "no version"}`);
  }

  const repository_sources = ["--ignore-filename-regex", String.raw`\.cargo|\.rustup`] as const;
  const normalized: CoverageRecord[] = [];

  for (const crate of RUST_CRATES) {
    const common = ["--manifest-path", `${crate.directory}/Cargo.toml`] as const;
    const crate_raw_root = `${raw_root}/${crate.name}`;
    await mkdir(resolve(root, crate_raw_root), { recursive: true });

    // Each independent crate owns its instrumented target and raw reports. CI
    // restores the target from a cache, and `--no-report` keeps old profiles
    // and test binaries, which the report would merge: remove them first.
    await run(["cargo", "llvm-cov", "clean", "--workspace", ...common], root);
    await run(["cargo", "llvm-cov", ...common, ...crate.testArguments, "--no-report"], root);
    await run(
      [
        "cargo",
        "llvm-cov",
        "report",
        ...common,
        ...repository_sources,
        "--lcov",
        "--output-path",
        `${crate_raw_root}/lcov.info`,
      ],
      root,
    );
    await run(
      [
        "cargo",
        "llvm-cov",
        "report",
        ...common,
        ...repository_sources,
        "--json",
        "--output-path",
        `${crate_raw_root}/raw.json`,
      ],
      root,
    );

    const lcov_text = await readFile(resolve(root, crate_raw_root, "lcov.info"), "utf8");
    const lcov_records = parseLcov(lcov_text, root, "recompute");
    const llvm_json: unknown = JSON.parse(
      await readFile(resolve(root, crate_raw_root, "raw.json"), "utf8"),
    );
    normalized.push(...normalizeRustCoverage(llvm_json, lcov_records, root));
  }

  const policy = await load_policy(root);
  const scored_paths = scoredRuntimePaths(policy, "rust", await discoverRuntimePaths(root, "rust"));
  const records = filterRuntimeRecords(normalized, scored_paths);
  await write_artifacts({ root, language: "rust", artifactRoot: artifact_root, records });
  const totals = evaluateCoveragePolicy({
    policy,
    language: "rust",
    records,
    scoredPaths: scored_paths,
  });
  print_table(records, totals);
  console.log(`Rust source coverage passed for ${records.length} scored runtime files`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const root = resolve(import.meta.dir, "..");
  try {
    if (command === "ts") await runTypeScriptCoverage(root);
    else if (command === "rust") await runRustCoverage(root);
    else throw new Error("Usage: bun scripts/coverage.ts <ts|rust>");
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const language = command === "rust" ? "rust" : "typescript";
    const artifact_root = resolve(root, "test-results/coverage", language);
    await mkdir(artifact_root, { recursive: true });
    await writeFile(resolve(artifact_root, "failure.txt"), `${message}\n`);
    throw error;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
