/**
 * Counts the repository's tests and lists the cases that match a pruning
 * category of issue #326, as Markdown on stdout.
 *
 *   bun scripts/test-inventory.ts [--open-prs]
 *
 * The categories come from static patterns, so every listed case is a
 * candidate for review, not a verdict. `--open-prs` asks `gh` which open pull
 * requests touch each candidate file; a case in such a file stays until that
 * pull request lands.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { captureProcess } from "./script-io.js";

const ROOT = resolve(import.meta.dir, "..");
const OPEN_PULL_REQUEST_LIMIT = "200";

/** Test areas in the order issue #326 reports them. */
const AREAS = [
  "packages/core/test",
  "packages/xlsx/test",
  "packages/charts/test",
  "packages/queries/test",
  "packages/react/test",
  "packages/vue/test",
  "packages/svelte/test",
  "scripts",
  "test/browser",
  "bench/test",
  "docs/test",
] as const;

const TYPESCRIPT_TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mjs|js)$/u;

/** A case declaration: `it(`, `test(`, or one of their modifiers and `.each` tables. */
const CASE_DECLARATION =
  /^[ \t]*(?:it|test)(?:\.each\([^\n]*\))?(?:\.(?:skip|only|todo|if\([^)]*\)))?\s*\(/gmu;

/** A whole case: its declaration line through the `});` at the same indentation. */
const CASE_BODY = /^([ \t]*)(?:it|test)\s*\(\s*(["'`])((?:(?!\2).)+)\2[\s\S]*?^\1\}\);?$/gmu;

type Category = "no-throw-only" | "rendered-text-only" | "repository-source-text";

const CATEGORY_RULES: Readonly<Record<Category, (body: string) => boolean>> = {
  /** Its only assertion is that a call returns without throwing. */
  "no-throw-only": (body) =>
    expectations(body).length === 1 && /\.not\.toThrow\(\)|\.toBeDefined\(\)/u.test(body),
  /** Every assertion compares rendered output with literal prose. */
  "rendered-text-only": (body) => {
    const assertions = expectations(body);
    const literalTextAssertions = assertions.filter((assertion) =>
      /\.(?:not\.)?toContain\(\s*["'`]/u.test(assertion),
    );
    return assertions.length > 0 && literalTextAssertions.length === assertions.length;
  },
  /** It reads a workflow, manifest or source file of this repository and asserts on its text. */
  "repository-source-text": (body) =>
    /readFile(?:Sync)?\([^)]*(?:\.github\/|\.ya?ml|\.toml|src\/)/u.test(body) &&
    /\.(?:not\.)?(?:toContain|toMatch)\(/u.test(body),
};

interface Candidate {
  readonly file: string;
  readonly name: string;
  readonly lines: number;
  readonly category: Category;
}

interface AreaCount {
  files: number;
  lines: number;
  cases: number;
}

function expectations(body: string): string[] {
  return body.split(/(?=expect\()/u).slice(1);
}

function areaOf(path: string): (typeof AREAS)[number] | undefined {
  return AREAS.find((area) => path.startsWith(`${area}/`));
}

async function git(...args: string[]): Promise<string> {
  return captureProcess(["git", ...args], {
    cwd: ROOT,
    failure: ({ stderr }) => `git ${args.join(" ")} failed: ${stderr.trim()}`,
  });
}

function lineCount(text: string): number {
  return text.split("\n").length - 1;
}

function candidatesIn(file: string, text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(CASE_BODY)) {
    const [body, , , name = ""] = match;
    for (const [category, matches] of Object.entries(CATEGORY_RULES) as [
      Category,
      (body: string) => boolean,
    ][]) {
      if (matches(body)) found.push({ file, name, lines: lineCount(body) + 1, category });
    }
  }

  return found;
}

/** Open pull request numbers keyed by every file they change. */
async function openPullRequestsByFile(): Promise<Map<string, number[]>> {
  const listing = await captureProcess(
    [
      "gh",
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      OPEN_PULL_REQUEST_LIMIT,
      "--json",
      "number,files",
    ],
    { cwd: ROOT, failure: ({ stderr }) => `gh pr list failed: ${stderr.trim()}` },
  );
  const pullRequests = JSON.parse(listing) as {
    readonly number: number;
    readonly files: readonly { readonly path: string }[];
  }[];

  const byFile = new Map<string, number[]>();
  for (const pullRequest of pullRequests) {
    for (const { path } of pullRequest.files) {
      byFile.set(path, [...(byFile.get(path) ?? []), pullRequest.number]);
    }
  }
  return byFile;
}

async function main(): Promise<void> {
  const commit = (await git("rev-parse", "HEAD")).trim();
  const tracked = (await git("ls-files")).split("\n").filter((path) => path.length > 0);
  const lockedBy = process.argv.includes("--open-prs") ? await openPullRequestsByFile() : undefined;

  const counts = new Map<string, AreaCount>(
    AREAS.map((area) => [area, { files: 0, lines: 0, cases: 0 }]),
  );
  const candidates: Candidate[] = [];
  let rustTests = 0;
  for (const path of tracked) {
    const area = areaOf(path);
    if (area !== undefined && TYPESCRIPT_TEST_FILE.test(path)) {
      const text = await readFile(resolve(ROOT, path), "utf8");
      const count = counts.get(area);
      if (count === undefined) throw new Error(`No count for test area ${area}`);
      count.files += 1;
      count.lines += lineCount(text);
      count.cases += text.match(CASE_DECLARATION)?.length ?? 0;
      candidates.push(...candidatesIn(path, text));
    } else if (path.startsWith("packages/") && path.endsWith(".rs")) {
      const text = await readFile(resolve(ROOT, path), "utf8");
      rustTests += text.match(/#\[test\]/gu)?.length ?? 0;
    }
  }

  const report = [
    `# Test inventory at ${commit}`,
    "",
    "| Area | Test files | Test lines | Case declarations |",
    "|---|---:|---:|---:|",
    ...[...counts].map(
      ([area, count]) => `| \`${area}\` | ${count.files} | ${count.lines} | ${count.cases} |`,
    ),
    "",
    `Rust \`#[test]\` functions: ${rustTests}`,
    "",
    "## Candidates",
    "",
    "| Category | File | Case | Lines | Open PRs |",
    "|---|---|---|---:|---|",
    ...candidates.map((candidate) => {
      const pullRequests = lockedBy?.get(candidate.file)?.map((number) => `#${number}`);
      const openPullRequests = lockedBy === undefined ? "not checked" : pullRequests?.join(" ");
      return `| ${candidate.category} | \`${candidate.file}\` | ${candidate.name} | ${candidate.lines} | ${openPullRequests || "none"} |`;
    }),
  ];
  process.stdout.write(`${report.join("\n")}\n`);
}

if (import.meta.main) await main();
