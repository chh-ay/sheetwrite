import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

/**
 * Runs Clippy over every Rust crate and target that ships, and compares the
 * warnings with scripts/rust-lint-baseline.json, one count per crate and lint.
 *
 * The crates share one lint set (docs/contributing/rust.md). Lints that still
 * have violations stay at "warn" while they are fixed; this check keeps their
 * counts from rising and makes each fix lower the baseline in the same change.
 *
 *   bun scripts/rust-lint.ts            check against the baseline
 *   bun scripts/rust-lint.ts --update   write the current counts as the baseline
 *   bun scripts/rust-lint.ts --report   print the counts as a Markdown table
 */
const root = resolve(import.meta.dir, "..");
const baselinePath = resolve(root, "scripts/rust-lint-baseline.json");

const CRATES = {
  wasm: "packages/wasm",
  history: "packages/wasm/history",
  queries: "packages/queries/engine",
} as const;
type CrateName = keyof typeof CRATES;

const WASM_TARGET = ["--target", "wasm32-unknown-unknown", "--lib"];

/** The builds `bun run lint:rust` covers: native with tests, and the shipped WASM library. */
const CLIPPY_RUNS: readonly { crate: CrateName; args: readonly string[] }[] = [
  { crate: "wasm", args: ["--all-targets"] },
  { crate: "wasm", args: ["--all-targets", "--features", "analysis"] },
  { crate: "wasm", args: WASM_TARGET },
  { crate: "wasm", args: [...WASM_TARGET, "--features", "analysis"] },
  { crate: "history", args: ["--all-targets"] },
  { crate: "history", args: WASM_TARGET },
  { crate: "queries", args: ["--all-targets"] },
  { crate: "queries", args: WASM_TARGET },
];

type Counts = Record<CrateName, Record<string, number>>;

interface Finding {
  crate: CrateName;
  lint: string;
  level: string;
  location: string;
  text: string;
}

interface CompilerMessage {
  reason: string;
  manifest_path?: string;
  message?: {
    level: string;
    rendered: string | null;
    code: { code: string } | null;
    spans: { is_primary: boolean; file_name: string; line_start: number; column_start: number }[];
  };
}

/** The `[lints...]` tables of a manifest, from the first one to the end of the file. */
function lintTables(manifest: string): string {
  const start = manifest.search(/^\[lints[.\]]/m);
  if (start < 0) return "";
  const rest = manifest.slice(start);
  const nextTable = rest.search(/^\[(?!lints[.\]])/m);
  return (nextTable < 0 ? rest : rest.slice(0, nextTable)).trim();
}

/** Fails unless the three crates carry the same, non-empty lint tables. */
async function checkLintTablesMatch(): Promise<void> {
  const tables = await Promise.all(
    Object.entries(CRATES).map(async ([name, dir]) => ({
      name,
      table: lintTables(await readFile(resolve(root, dir, "Cargo.toml"), "utf8")),
    })),
  );
  const [first] = tables;
  if (first === undefined || first.table === "") {
    throw new Error(`${CRATES.wasm}/Cargo.toml has no [lints] tables`);
  }

  const differing = tables.filter(({ table }) => table !== first.table).map(({ name }) => name);
  if (differing.length > 0) {
    throw new Error(
      `The [lints] tables of ${differing.join(", ")} differ from ${first.name}; ` +
        "the three Cargo.toml files must carry the same lint set, kept last in each file.",
    );
  }
}

async function runClippy(crate: CrateName, args: readonly string[]): Promise<Finding[]> {
  const manifest = resolve(root, CRATES[crate], "Cargo.toml");
  const command = [
    "cargo",
    "clippy",
    "--quiet",
    "--message-format=json",
    "--manifest-path",
    manifest,
    ...args,
  ];
  const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  const findings = stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => findingOf(JSON.parse(line) as CompilerMessage, crate, manifest));
  const hasError = findings.some(({ level }) => level === "error");
  if (exitCode !== 0 && !hasError) {
    throw new Error(`${command.join(" ")} failed (exit ${exitCode}):\n${stderr}`);
  }
  return findings;
}

function findingOf(entry: CompilerMessage, crate: CrateName, manifest: string): Finding[] {
  const { message } = entry;
  if (entry.reason !== "compiler-message" || message === undefined) return [];
  if (entry.manifest_path !== manifest) return [];
  if (message.level !== "warning" && message.level !== "error") return [];

  const span = message.spans.find(({ is_primary }) => is_primary);
  // Summaries such as "N warnings emitted" have no code and no span.
  if (span === undefined && message.code === null) return [];
  const location =
    span === undefined
      ? CRATES[crate]
      : `${relative(root, resolve(root, CRATES[crate], span.file_name))}:${span.line_start}:${span.column_start}`;

  return [
    {
      crate,
      lint: message.code?.code ?? "(no lint name)",
      level: message.level,
      location,
      text: message.rendered ?? "",
    },
  ];
}

/** One finding per place: the same line seen by several builds counts once. */
async function collectFindings(): Promise<Finding[]> {
  const unique = new Map<string, Finding>();
  for (const { crate, args } of CLIPPY_RUNS) {
    for (const finding of await runClippy(crate, args)) {
      unique.set(`${finding.crate}|${finding.lint}|${finding.location}`, finding);
    }
  }
  return [...unique.values()];
}

function countFindings(findings: readonly Finding[]): Counts {
  const counts: Counts = { wasm: {}, history: {}, queries: {} };
  for (const { crate, lint } of findings) counts[crate][lint] = (counts[crate][lint] ?? 0) + 1;
  for (const crate of Object.keys(counts) as CrateName[]) {
    counts[crate] = Object.fromEntries(
      Object.entries(counts[crate]).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return counts;
}

/** The (crate, lint) pairs whose count differs from the baseline. */
function baselineChanges(
  current: Counts,
  baseline: Counts,
): { crate: CrateName; lint: string; was: number; now: number }[] {
  const changes = [];
  for (const crate of Object.keys(CRATES) as CrateName[]) {
    const lints = new Set([...Object.keys(current[crate]), ...Object.keys(baseline[crate] ?? {})]);
    for (const lint of lints) {
      const was = baseline[crate]?.[lint] ?? 0;
      const now = current[crate][lint] ?? 0;
      if (was !== now) changes.push({ crate, lint, was, now });
    }
  }
  return changes;
}

function markdownReport(counts: Counts): string {
  const lints = [...new Set(Object.values(counts).flatMap((byLint) => Object.keys(byLint)))].sort();
  const crates = Object.keys(CRATES) as CrateName[];
  const totals = crates.map((crate) =>
    Object.values(counts[crate]).reduce((sum, count) => sum + count, 0),
  );

  const rows = lints.map(
    (lint) => `| \`${lint}\` | ${crates.map((crate) => counts[crate][lint] ?? 0).join(" | ")} |`,
  );
  return [
    `| Lint | ${crates.join(" | ")} |`,
    `|---|${crates.map(() => "--:").join("|")}|`,
    ...rows,
    `| **Total** | ${totals.map((total) => `**${total}**`).join(" | ")} |`,
  ].join("\n");
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  await checkLintTablesMatch();
  const findings = await collectFindings();

  const errors = findings.filter(({ level }) => level === "error");
  if (errors.length > 0) {
    process.stderr.write(errors.map(({ text }) => text).join("\n"));
    throw new Error(`Clippy reported ${errors.length} errors`);
  }

  const counts = countFindings(findings);
  if (mode === "--report") {
    process.stdout.write(`${markdownReport(counts)}\n`);
    return;
  }
  if (mode === "--update") {
    await writeFile(baselinePath, `${JSON.stringify(counts, null, 2)}\n`);
    process.stdout.write(`Wrote ${relative(root, baselinePath)}\n`);
    return;
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Counts;
  const changes = baselineChanges(counts, baseline);
  const raised = changes.filter(({ was, now }) => now > was);
  for (const { crate, lint } of raised) {
    const places = findings.filter((finding) => finding.crate === crate && finding.lint === lint);
    process.stderr.write(places.map(({ text }) => text).join("\n"));
  }
  if (changes.length > 0) {
    const lines = changes.map(
      ({ crate, lint, was, now }) => `  ${crate} ${lint}: ${was} -> ${now}`,
    );
    throw new Error(
      `Rust lint counts differ from ${relative(root, baselinePath)}:\n${lines.join("\n")}\n` +
        (raised.length > 0
          ? "Fix the new warnings shown above."
          : "Run `bun scripts/rust-lint.ts --update` to record the lower counts."),
    );
  }
}

if (import.meta.main) await main();
