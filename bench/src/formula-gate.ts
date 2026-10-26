import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expectedFormulaWorkloadKeys, type FormulaGateCapture } from "./formula-bench.js";
import { validateExactMatrix } from "./gate-protocol.js";
import { summarize } from "./stats.js";

const DEFAULT_PAIRS = 7;
const MINIMUM_PAIRS = 3;
const HARNESS_ROOT = new URL("../../", import.meta.url).pathname;
const HARNESS = new URL("./formula-bench.ts", import.meta.url).pathname;
const ALLOCATION_ROW = ".allocation.";
const ENGINE_DIGEST = /^[0-9a-f]{64}$/u;

export interface FormulaGatePair {
  base: FormulaGateCapture;
  candidate: FormulaGateCapture;
}

/**
 * The highest median paired candidate/base ratio each row may reach, measured
 * at seven pairs. Fourteen same-engine AB/BA pairs on a shared machine gave
 * each row's worst seven-pair median deviation from 1, `d`. Each limit is
 * `1 + max(0.15, 2.5 * d)`, rounded up to 0.05; bench/README.md lists `d` and
 * the smallest regression each row reliably fails.
 */
const MEASURED_RATIO_LIMITS: Readonly<Record<string, number>> = {
  "workload=independent-parse-load;size=1000": 1.15,
  "workload=independent-first-recompute;size=1000": 1.45,
  "workload=independent-parse-load;size=10000": 1.2,
  "workload=independent-first-recompute;size=10000": 1.15,
  "workload=independent-parse-load;size=100000": 1.15,
  "workload=independent-first-recompute;size=100000": 1.15,
  "workload=linear-chain;size=8": 1.3,
  "workload=linear-chain;size=16": 1.15,
  "workload=linear-chain;size=32": 1.15,
  "workload=linear-chain;size=64": 1.25,
  "workload=wide-fan-out-edit;size=1000": 1.25,
  "workload=wide-fan-out-edit;size=100000": 1.15,
  "workload=diamond-edit;size=32": 1.15,
  "workload=shared-range-edit;size=1000": 1.15,
  "workload=distinct-range-edit;size=1000": 1.15,
  "workload=cross-sheet-range-edit;size=1000": 1.15,
  "workload=scalar-edit-affects-0;size=1000": 1.35,
  "workload=scalar-edit-affects-1;size=1": 1.15,
  "workload=scalar-edit-affects-1000;size=1000": 1.15,
  "workload=scalar-edit-affects-100000;size=100000": 1.15,
  "workload=formula-constant-edit;size=100000": 1.15,
  "workload=topology-remove-add;size=10000": 1.15,
  "workload=cycles;size=1000": 1.15,
  "workload=removed-sheet-ref;size=1000": 1.25,
  "workload=error-propagation;size=1000": 1.15,
  "workload=criteria-range-edit;size=100000": 1.15,
  "workload=lookup-range-edit;size=100000": 1.15,
  "workload=vlookup-many;size=1000": 1.15,
  "workload=vlookup-many-edit;size=1000": 1.15,
  "workload=vlookup-many-sorted;size=1000": 1.15,
  "workload=vlookup-many-sorted-edit;size=1000": 1.15,
  "workload=xlookup-many;size=1000": 1.15,
  "workload=xlookup-many-edit;size=1000": 1.15,
  "workload=xlookup-many-sorted;size=1000": 1.15,
  "workload=xlookup-many-sorted-edit;size=1000": 1.15,
  "workload=text-lookup-many;size=1000": 1.15,
  "workload=text-lookup-many-edit;size=1000": 1.15,
  "workload=text-lookup-many-sorted;size=1000": 1.15,
  "workload=text-lookup-many-sorted-edit;size=1000": 1.15,
  "workload=spill-filter-resize;size=100000": 1.15,
  "workload=sumproduct-vector-edit;size=100000": 1.15,
  "workload=sumproduct-matrix-edit;size=100000": 1.15,
  "workload=criteria-multi-range-edit;size=100000": 1.15,
  "workload=sum-multi-range;size=100000": 1.15,
  "workload=sumifs-3-criteria;size=100000": 1.15,
  "workload=countif-100k;size=100000": 1.15,
  "workload=unicode-text-date-edit;size=1000": 1.15,
  "workload=percentile-covariance;size=100000": 1.15,
  "workload=let-reuse-edit;size=100000": 1.15,
  "workload=let-repeat;size=100000": 1.15,
  "workload=iterative-finance;size=1000": 1.15,
  "workload=incremental-dependency-closure-edit;size=100000": 1.15,
  "workload=spill-sequence-admission;size=100000": 1.2,
};

export const FORMULA_RATIO_LIMITS: ReadonlyMap<string, number> = new Map(
  Object.entries(MEASURED_RATIO_LIMITS),
);
validateExactMatrix("formula gate ratio limits", expectedFormulaWorkloadKeys("full"), [
  ...FORMULA_RATIO_LIMITS.keys(),
]);

export interface FormulaTimingVerdict {
  key: string;
  baseMs: number;
  candidateMs: number;
  pairedRatio: number;
  ratioLimit: number;
  passed: boolean;
}

export interface FormulaByteVerdict {
  key: string;
  base: number;
  candidate: number;
  maximum: number;
  passed: boolean;
  acceptedReason?: string;
}

/** A row one side could not run, and the missing engine API that stopped it. */
export interface FormulaSkippedRow {
  key: string;
  side: keyof FormulaGatePair;
  reason: string;
}

export interface FormulaGateVerdict {
  passed: boolean;
  timings: FormulaTimingVerdict[];
  bytes: FormulaByteVerdict[];
  skipped: FormulaSkippedRow[];
}

export interface FormulaByteAcceptance {
  candidateEngineDigest: string;
  rows: { key: string; maximum: number; reason: string }[];
}

function median(samples: number[]): number {
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("Formula gate received a non-finite measurement");
  }
  return summarize(samples).median;
}

/**
 * Check that every capture covers the whole matrix and that neither engine
 * changed between captures. Returns the rows each side skipped.
 */
function validatePairs(pairs: readonly FormulaGatePair[]): FormulaSkippedRow[] {
  if (pairs.length < MINIMUM_PAIRS) {
    throw new Error(`Formula gate needs at least ${MINIMUM_PAIRS} pairs`);
  }
  const first = pairs[0];
  if (first === undefined) throw new Error("Formula gate has no pairs");

  const matrix = expectedFormulaWorkloadKeys("full");
  for (const [index, pair] of pairs.entries()) {
    for (const side of ["base", "candidate"] as const) {
      const capture = pair[side];
      if (!ENGINE_DIGEST.test(capture.engineDigest)) {
        throw new Error(`Formula gate ${side} capture has no engine digest`);
      }
      if (capture.engineDigest !== first[side].engineDigest) {
        throw new Error(`Formula gate ${side} engine changed during the comparison`);
      }
      validateExactMatrix(`formula gate pair ${index} ${side}`, matrix, [
        ...Object.keys(capture.timings),
        ...Object.keys(capture.skipped),
      ]);
    }
  }

  // A missing API is a property of the engine build, so the first capture of
  // each side names every row that side skips.
  return (["base", "candidate"] as const).flatMap((side) =>
    Object.entries(first[side].skipped).map(([key, reason]) => ({ key, side, reason })),
  );
}

function acceptedByteRows(
  pairs: readonly FormulaGatePair[],
  byteKeys: ReadonlySet<string>,
  acceptance: FormulaByteAcceptance | undefined,
): Map<string, { maximum: number; reason: string }> {
  const accepted = new Map<string, { maximum: number; reason: string }>();
  if (acceptance === undefined) return accepted;

  if (
    !ENGINE_DIGEST.test(acceptance.candidateEngineDigest) ||
    pairs.some((pair) => pair.candidate.engineDigest !== acceptance.candidateEngineDigest) ||
    !Array.isArray(acceptance.rows) ||
    acceptance.rows.length === 0
  ) {
    throw new Error("Byte acceptance must name the exact candidate engine digest and list rows");
  }
  for (const row of acceptance.rows) {
    if (
      !byteKeys.has(row.key) ||
      accepted.has(row.key) ||
      !Number.isSafeInteger(row.maximum) ||
      row.maximum < 0 ||
      typeof row.reason !== "string" ||
      row.reason.trim().length === 0
    ) {
      throw new Error(`Invalid byte acceptance for ${row.key}`);
    }
    accepted.set(row.key, row);
  }
  return accepted;
}

/**
 * Compare paired medians: each pair is one base and one candidate capture run
 * back to back, so machine drift between pairs cancels in the ratio. Byte
 * counters are deterministic and may not grow at all.
 */
export function compareFormulaPairs(
  pairs: readonly FormulaGatePair[],
  limits: ReadonlyMap<string, number> = FORMULA_RATIO_LIMITS,
  acceptance?: FormulaByteAcceptance,
): FormulaGateVerdict {
  const skipped = validatePairs(pairs);
  const skippedKeys = new Set(skipped.map((row) => row.key));
  const first = pairs[0];
  if (first === undefined) throw new Error("Formula gate has no pairs");

  const keys = Object.keys(first.base.timings)
    .filter((key) => !skippedKeys.has(key))
    .sort();
  const byteKeys = Object.keys(first.base.bytes)
    .filter((key) => !skippedKeys.has(key.split(ALLOCATION_ROW)[0] ?? key))
    .sort();
  const accepted = acceptedByteRows(pairs, new Set(byteKeys), acceptance);

  const timings = keys.map((key): FormulaTimingVerdict => {
    const ratioLimit = limits.get(key);
    if (ratioLimit === undefined) throw new Error(`No reviewed formula ratio limit for ${key}`);
    const base = pairs.map((pair) => pair.base.timings[key] ?? NaN);
    const candidate = pairs.map((pair) => pair.candidate.timings[key] ?? NaN);
    if (base.some((duration) => duration <= 0) || candidate.some((duration) => duration < 0)) {
      throw new Error(`${key} has invalid durations`);
    }

    const pairedRatio = median(base.map((duration, index) => (candidate[index] ?? NaN) / duration));
    return {
      key,
      baseMs: median(base),
      candidateMs: median(candidate),
      pairedRatio,
      ratioLimit,
      passed: pairedRatio <= ratioLimit,
    };
  });

  const bytes = byteKeys.map((key): FormulaByteVerdict => {
    // Check every capture, not a statistic: growth that appears in one
    // capture is still growth.
    const base = Math.min(...pairs.map((pair) => pair.base.bytes[key] ?? NaN));
    const candidate = Math.max(...pairs.map((pair) => pair.candidate.bytes[key] ?? NaN));
    if (
      !Number.isSafeInteger(base) ||
      base < 0 ||
      !Number.isSafeInteger(candidate) ||
      candidate < 0
    ) {
      throw new Error(`${key} has invalid byte counters`);
    }
    const acceptance = accepted.get(key);
    if (acceptance !== undefined && candidate <= base) {
      throw new Error(`${key}: byte acceptance is obsolete; candidate no longer grows`);
    }
    const maximum = acceptance?.maximum ?? base;
    return {
      key,
      base,
      candidate,
      maximum,
      passed: candidate <= maximum,
      ...(acceptance === undefined ? {} : { acceptedReason: acceptance.reason }),
    };
  });

  return {
    // The candidate is the code under review; it must run the whole matrix.
    passed:
      skipped.every((row) => row.side === "base") &&
      timings.every((row) => row.passed) &&
      bytes.every((row) => row.passed),
    timings,
    bytes,
    skipped,
  };
}

/** Run this checkout's harness against the engine artifacts built in `checkout`. */
function captureSide(checkout: string): FormulaGateCapture {
  const child = Bun.spawnSync([process.execPath, "run", HARNESS, "--gate-capture"], {
    cwd: resolve(HARNESS_ROOT, "bench"),
    env: { ...process.env, SHEETWRITE_BENCH_ENGINE_ROOT: checkout },
    stdout: "pipe",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(`Formula gate capture failed for ${checkout}: exit ${child.exitCode}`);
  }
  return JSON.parse(child.stdout.toString()) as FormulaGateCapture;
}

function report(verdict: FormulaGateVerdict): string {
  const lines = [
    "| Workload | Base ms | Candidate ms | Paired ratio | Ratio limit | Verdict |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...verdict.timings.map(
      (row) =>
        `| ${row.key} | ${row.baseMs.toFixed(4)} | ${row.candidateMs.toFixed(4)} | ${row.pairedRatio.toFixed(3)} | ${row.ratioLimit} | ${row.passed ? "pass" : "FAIL"} |`,
    ),
    "",
  ];
  for (const row of verdict.skipped) {
    lines.push(
      `${row.key}: ${row.side === "base" ? "SKIPPED" : "FAIL"} on ${row.side}: ${row.reason}`,
    );
  }
  for (const row of verdict.bytes) {
    if (!row.passed) {
      lines.push(
        `${row.key}: base ${row.base}, candidate ${row.candidate}, maximum ${row.maximum}: FAIL`,
      );
    } else if (row.acceptedReason !== undefined) {
      lines.push(
        `${row.key}: ACCEPTED base ${row.base}, candidate ${row.candidate}, maximum ${row.maximum}: ${row.acceptedReason}`,
      );
    }
  }
  lines.push(`Formula gate: ${verdict.passed ? "passed" : "FAILED"}`, "");
  return lines.join("\n");
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const basePath = optionValue(args, "--base");
  if (basePath === undefined) throw new Error("--base requires a checkout with built engines");
  const base = resolve(basePath);
  const candidate = resolve(optionValue(args, "--candidate") ?? HARNESS_ROOT);
  const pairCount = Number(optionValue(args, "--pairs") ?? DEFAULT_PAIRS);
  if (!Number.isInteger(pairCount) || pairCount < MINIMUM_PAIRS) {
    throw new Error(`--pairs must be at least ${MINIMUM_PAIRS}`);
  }
  const outputPath = optionValue(args, "--output");
  const acceptancePath = optionValue(args, "--accept-bytes");
  const acceptance =
    acceptancePath === undefined
      ? undefined
      : (JSON.parse(readFileSync(acceptancePath, "utf8")) as FormulaByteAcceptance);

  const pairs: FormulaGatePair[] = [];
  for (let index = 0; index < pairCount; index++) {
    // Alternate AB and BA so neither side always runs first after the other.
    if (index % 2 === 0) {
      const baseCapture = captureSide(base);
      pairs.push({ base: baseCapture, candidate: captureSide(candidate) });
    } else {
      const candidateCapture = captureSide(candidate);
      pairs.push({ base: captureSide(base), candidate: candidateCapture });
    }
  }

  const verdict = compareFormulaPairs(pairs, FORMULA_RATIO_LIMITS, acceptance);
  if (outputPath !== undefined) {
    await Bun.write(outputPath, `${JSON.stringify({ pairs, verdict }, null, 2)}\n`);
  }
  process.stdout.write(report(verdict));
  process.exitCode = verdict.passed ? 0 : 1;
}
