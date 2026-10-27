/**
 * Paired engine reader gate: times `reader-bench.ts` against two built engines
 * in alternating fresh processes and fails a reader only when the candidate is
 * slower in every pair and its median paired ratio exceeds that reader's
 * measured A/A noise limit.
 *
 *   bun bench/src/reader-gate.ts --base <checkout> [--candidate <checkout>]
 *     [--pairs <n>] [--output <report.json>]
 *   bun bench/src/reader-gate.ts --write-floor <aa-results.json>
 *
 * When `--base` and `--candidate` name the same checkout the run is an A/A
 * noise measurement: it needs no noise floor and reports no verdict.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { optionValue, validateExactMatrix } from "./gate-protocol.js";
import {
  READER_CASE_NAMES,
  READER_GROUPS,
  type ReaderGroup,
  type ReaderRunResult,
  selectedReaderCaseNames,
} from "./reader-bench.js";
import { summarize } from "./stats.js";

/** Fewer pairs than the noise floor was measured at would make its limits too tight. */
const MINIMUM_PAIRS = 8;
/** Parity is the lower bound; there is no unmeasured percentage allowance. */
const PARITY_RATIO = 1;
const HARNESS_ROOT = new URL("../../", import.meta.url).pathname;
const HARNESS = new URL("./reader-bench.ts", import.meta.url).pathname;
const NOISE_FLOOR_PATH = new URL("../results/reader-noise-floor.json", import.meta.url).pathname;
/** Stored baseline identity and prior ratios. Timing gates use fresh paired runs
 * of this exact baseline, not machine-dependent historical wall-clock times. */
const REFERENCE_PATH = new URL("../results/reader-baseline-0.5.x.json", import.meta.url).pathname;
const ENGINE_WASM = "packages/wasm/pkg/sheetwrite_wasm_bg.wasm";
const RATIO_DIGITS = 3;
const MS_DIGITS = 2;
const LIMIT_DIGITS = 2;

type Side = "base" | "candidate";

export interface ReaderNoiseFloorRow {
  aaMinRatio: number;
  aaMaxRatio: number;
  limit: number;
}

/** bench/results/reader-noise-floor.json: per-reader limits from an A/A run. */
export interface ReaderNoiseFloor {
  measuredAt: string;
  pairs: number;
  rows: Record<string, ReaderNoiseFloorRow>;
}

export interface ReaderPairRatio {
  baseMs: number;
  candidateMs: number;
  ratio: number;
  baseSampleMs: number[];
  candidateSampleMs: number[];
  digestsMatch: boolean;
}

/** One reader across all pairs. Field names match the A/A results `--write-floor` reads. */
export interface ReaderSummaryRow {
  name: string;
  group: ReaderGroup;
  fixture: string;
  iterationsPerSample: number;
  baseMedianMs: number;
  candidateMedianMs: number;
  medianRatio: number;
  minRatio: number;
  maxRatio: number;
  candidateSlowerPairs: number;
  pairs: number;
  digestsMatch: boolean;
  perPair: ReaderPairRatio[];
}

export interface ReaderRowVerdict {
  name: string;
  medianRatio: number;
  limit: number;
  candidateSlowerPairs: number;
  pairs: number;
  digestsMatch: boolean;
  /** The documented 0.5.x-vs-tip median ratio, when the reference file has this reader. */
  referenceRatio?: number;
  passed: boolean;
}

export interface ReaderGateVerdict {
  passed: boolean;
  rows: ReaderRowVerdict[];
}

/** One pair: each side's `run` output, in the order the two processes ran. */
export interface ReaderGatePair {
  order: readonly [Side, Side];
  base: ReaderRunResult[];
  candidate: ReaderRunResult[];
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a finite positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = positiveNumber(value, path);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${path} must be an integer`);
  return parsed;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}

function arrayOf(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function median(values: readonly number[]): number {
  return summarize(values).median;
}

/** The measured A/A maximum, bounded below by parity. */
export function noiseFloorLimit(aaMaxRatio: number): number {
  return Math.max(PARITY_RATIO, aaMaxRatio);
}

/** Parse and validate the noise floor: one row per harness reader, no others. */
export function parseReaderNoiseFloor(value: unknown, path: string): ReaderNoiseFloor {
  const floor = asRecord(value, path);
  const measuredAt = text(floor.measuredAt, `${path}.measuredAt`);
  if (Number.isNaN(Date.parse(measuredAt))) throw new Error(`${path}.measuredAt is not a date`);
  const pairs = positiveInteger(floor.pairs, `${path}.pairs`);
  if (pairs < MINIMUM_PAIRS) throw new Error(`${path}.pairs must be at least ${MINIMUM_PAIRS}`);
  const rawRows = asRecord(floor.rows, `${path}.rows`);
  validateExactMatrix(`${path} rows`, READER_CASE_NAMES, Object.keys(rawRows));
  const rows: Record<string, ReaderNoiseFloorRow> = {};
  for (const [name, rawRow] of Object.entries(rawRows)) {
    const rowPath = `${path}.rows[${JSON.stringify(name)}]`;
    const row = asRecord(rawRow, rowPath);
    const aaMinRatio = positiveNumber(row.aaMinRatio, `${rowPath}.aaMinRatio`);
    const aaMaxRatio = positiveNumber(row.aaMaxRatio, `${rowPath}.aaMaxRatio`);
    const limit = positiveNumber(row.limit, `${rowPath}.limit`);
    if (aaMinRatio > aaMaxRatio) throw new Error(`${rowPath}: aaMinRatio exceeds aaMaxRatio`);
    if (limit !== noiseFloorLimit(aaMaxRatio)) {
      throw new Error(
        `${rowPath}.limit must equal the measured floor ${noiseFloorLimit(aaMaxRatio)}`,
      );
    }
    rows[name] = { aaMinRatio, aaMaxRatio, limit };
  }
  return { measuredAt, pairs, rows };
}

/**
 * Convert an A/A results file (`{meta, summary: [{name, minRatio, maxRatio,
 * medianRatio, pairs}]}`, as this gate's `--output` writes for an A/A run)
 * into a noise floor. `meta.measuredAt` dates it; without one, the file's
 * modification time does.
 */
export function noiseFloorFromAaResults(
  value: unknown,
  path: string,
  fileModifiedAt: Date,
): ReaderNoiseFloor {
  const results = asRecord(value, path);
  const meta = results.meta === undefined ? {} : asRecord(results.meta, `${path}.meta`);
  const measuredAt =
    meta.measuredAt === undefined
      ? fileModifiedAt.toISOString()
      : text(meta.measuredAt, `${path}.meta.measuredAt`);
  const entries = arrayOf(results.summary, `${path}.summary`).map((rawEntry, index) => {
    const entryPath = `${path}.summary[${index}]`;
    const entry = asRecord(rawEntry, entryPath);
    positiveNumber(entry.medianRatio, `${entryPath}.medianRatio`);
    return {
      name: text(entry.name, `${entryPath}.name`),
      aaMinRatio: positiveNumber(entry.minRatio, `${entryPath}.minRatio`),
      aaMaxRatio: positiveNumber(entry.maxRatio, `${entryPath}.maxRatio`),
      pairs: positiveInteger(entry.pairs, `${entryPath}.pairs`),
    };
  });
  const pairs = entries[0]?.pairs;
  if (pairs === undefined) throw new Error(`${path}.summary is empty`);
  if (entries.some((entry) => entry.pairs !== pairs)) {
    throw new Error(`${path}: every reader must have the same pair count`);
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  validateExactMatrix(
    `${path} summary`,
    READER_CASE_NAMES,
    entries.map((entry) => entry.name),
  );
  const rows: Record<string, ReaderNoiseFloorRow> = {};
  for (const name of READER_CASE_NAMES) {
    const entry = byName.get(name);
    if (entry === undefined) throw new Error(`${path} has no ${name}`);
    rows[name] = {
      aaMinRatio: entry.aaMinRatio,
      aaMaxRatio: entry.aaMaxRatio,
      limit: noiseFloorLimit(entry.aaMaxRatio),
    };
  }
  // Round-trip through the loader so a written floor is always loadable.
  return parseReaderNoiseFloor({ measuredAt, pairs, rows }, path);
}

/** Median 0.5.x-vs-tip ratio per reader from the documentation-only reference summary. */
function referenceRatios(path: string): Map<string, number> {
  if (!existsSync(path)) return new Map();
  const reference = asRecord(JSON.parse(readFileSync(path, "utf8")), path);
  return new Map(
    arrayOf(reference.summary, `${path}.summary`).map((rawEntry, index) => {
      const entry = asRecord(rawEntry, `${path}.summary[${index}]`);
      return [
        text(entry.name, `${path}.summary[${index}].name`),
        positiveNumber(entry.medianRatio, `${path}.summary[${index}].medianRatio`),
      ] as const;
    }),
  );
}

function parseCalibration(
  line: string,
  side: Side,
  names: readonly string[],
): Record<string, number> {
  const calibration = asRecord(JSON.parse(line), `${side} calibration`);
  validateExactMatrix(`reader gate ${side} calibration`, names, Object.keys(calibration));
  const iterations: Record<string, number> = {};
  for (const [name, count] of Object.entries(calibration)) {
    iterations[name] = positiveInteger(count, `${side} calibration ${name}`);
  }
  return iterations;
}

function parseRun(line: string, side: Side, names: readonly string[]): ReaderRunResult[] {
  const run = asRecord(JSON.parse(line), `${side} run`);
  const results = arrayOf(run.results, `${side} run.results`).map((rawResult, index) => {
    const path = `${side} run.results[${index}]`;
    const result = asRecord(rawResult, path);
    const group = READER_GROUPS.find((readerGroup) => readerGroup === result.group);
    if (group === undefined) throw new Error(`${path}.group is not a reader group`);
    const digest = result.digest;
    if (typeof digest !== "number" || !Number.isFinite(digest)) {
      throw new Error(`${path}.digest must be finite`);
    }
    return {
      name: text(result.name, `${path}.name`),
      group,
      fixture: text(result.fixture, `${path}.fixture`),
      iterations: positiveInteger(result.iterations, `${path}.iterations`),
      sampleMs: arrayOf(result.sampleMs, `${path}.sampleMs`).map((sample, sampleIndex) =>
        positiveNumber(sample, `${path}.sampleMs[${sampleIndex}]`),
      ),
      medianSampleMs: positiveNumber(result.medianSampleMs, `${path}.medianSampleMs`),
      digest,
    };
  });
  validateExactMatrix(
    `reader gate ${side} run`,
    names,
    results.map((result) => result.name),
  );
  return results;
}

/** Per-reader paired ratios: drift between pairs cancels inside each base/candidate ratio. */
export function summarizeReaderPairs(
  names: readonly string[],
  pairs: readonly ReaderGatePair[],
): ReaderSummaryRow[] {
  if (pairs.length === 0) throw new Error("Reader gate has no pairs");
  return names.map((name) => {
    const perPair = pairs.map((pair, index): ReaderPairRatio => {
      const base = pair.base.find((result) => result.name === name);
      const candidate = pair.candidate.find((result) => result.name === name);
      if (base === undefined || candidate === undefined) {
        throw new Error(`Reader gate pair ${index} has no ${name}`);
      }
      if (base.iterations !== candidate.iterations) {
        throw new Error(`Reader gate pair ${index}: ${name} ran different iteration counts`);
      }
      return {
        baseMs: base.medianSampleMs,
        candidateMs: candidate.medianSampleMs,
        ratio: candidate.medianSampleMs / base.medianSampleMs,
        baseSampleMs: base.sampleMs,
        candidateSampleMs: candidate.sampleMs,
        digestsMatch: base.digest === candidate.digest,
      };
    });
    const first = pairs[0]?.base.find((result) => result.name === name);
    if (first === undefined) throw new Error(`Reader gate has no ${name}`);
    const ratios = perPair.map((entry) => entry.ratio);
    return {
      name,
      group: first.group,
      fixture: first.fixture,
      iterationsPerSample: first.iterations,
      baseMedianMs: median(perPair.map((entry) => entry.baseMs)),
      candidateMedianMs: median(perPair.map((entry) => entry.candidateMs)),
      medianRatio: median(ratios),
      minRatio: Math.min(...ratios),
      maxRatio: Math.max(...ratios),
      candidateSlowerPairs: ratios.filter((ratio) => ratio > 1).length,
      pairs: perPair.length,
      digestsMatch: perPair.every((entry) => entry.digestsMatch),
      perPair,
    };
  });
}

/**
 * A reader fails when its digests disagree in any pair, or when its median
 * ratio exceeds the floor limit and the candidate was slower in every pair: a
 * single fast pair shows the excess is noise, not a regression.
 */
export function judgeReaderRows(
  summary: readonly ReaderSummaryRow[],
  floor: ReaderNoiseFloor,
  reference: ReadonlyMap<string, number> = new Map(),
): ReaderGateVerdict {
  const rows = summary.map((row): ReaderRowVerdict => {
    const limit = floor.rows[row.name]?.limit;
    if (limit === undefined) throw new Error(`Noise floor has no limit for ${row.name}`);
    if (row.pairs < floor.pairs) {
      throw new Error(
        `${row.name} ran ${row.pairs} pairs; the floor was measured at ${floor.pairs}`,
      );
    }
    const regressed = row.medianRatio > limit && row.candidateSlowerPairs === row.pairs;
    const referenceRatio = reference.get(row.name);
    return {
      name: row.name,
      medianRatio: row.medianRatio,
      limit,
      candidateSlowerPairs: row.candidateSlowerPairs,
      pairs: row.pairs,
      digestsMatch: row.digestsMatch,
      ...(referenceRatio === undefined ? {} : { referenceRatio }),
      passed: row.digestsMatch && !regressed,
    };
  });
  return { passed: rows.every((row) => row.passed), rows };
}

/** Run this checkout's harness against the engine built in `checkout`; returns its JSON line. */
function runHarness(checkout: string, args: readonly string[]): string {
  const command = [process.execPath, HARNESS, checkout, ...args];
  const child = Bun.spawnSync(command, { stdout: "pipe", stderr: "inherit" });
  if (child.exitCode !== 0) {
    throw new Error(
      `Reader gate harness failed for ${checkout} (${args[0]}): exit ${child.exitCode}`,
    );
  }
  const line = child.stdout.toString().trim().split("\n").at(-1);
  if (line === undefined || line === "")
    throw new Error(`Reader harness printed nothing for ${checkout}`);
  return line;
}

function gitHead(checkout: string): string {
  const child = Bun.spawnSync(["git", "-C", checkout, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) {
    throw new Error(`${checkout} is not a git checkout: ${child.stderr.toString().trim()}`);
  }
  return child.stdout.toString().trim();
}

function engineSha256(checkout: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(checkout, ENGINE_WASM)))
    .digest("hex");
}

function formatRatio(ratio: number | undefined): string {
  return ratio === undefined ? "-" : ratio.toFixed(RATIO_DIGITS);
}

function report(
  summary: readonly ReaderSummaryRow[],
  verdict: ReaderGateVerdict | undefined,
): string {
  const verdicts = new Map(verdict?.rows.map((row) => [row.name, row]));
  const lines = [
    "| Reader | Base ms | Candidate ms | Median ratio | Min-max ratio | Candidate-slower pairs | Limit | 0.5.x reference ratio | Verdict |",
    "| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |",
    ...summary.map((row) => {
      const rowVerdict = verdicts.get(row.name);
      let outcome = "A/A";
      if (rowVerdict !== undefined && !rowVerdict.digestsMatch) outcome = "FAIL (readers disagree)";
      else if (rowVerdict !== undefined) outcome = rowVerdict.passed ? "pass" : "FAIL";
      return `| ${row.name} | ${row.baseMedianMs.toFixed(MS_DIGITS)} | ${row.candidateMedianMs.toFixed(MS_DIGITS)} | ${formatRatio(row.medianRatio)} | ${formatRatio(row.minRatio)}-${formatRatio(row.maxRatio)} | ${row.candidateSlowerPairs}/${row.pairs} | ${rowVerdict?.limit.toFixed(LIMIT_DIGITS) ?? "-"} | ${formatRatio(rowVerdict?.referenceRatio)} | ${outcome} |`;
    }),
    "",
    verdict === undefined
      ? "Reader gate: A/A run, no verdict. Refresh the floor with --write-floor <this report>."
      : `Reader gate: ${verdict.passed ? "passed" : "FAILED"}`,
    "",
  ];
  return lines.join("\n");
}

function writeFloor(aaResultsPath: string): void {
  const floor = noiseFloorFromAaResults(
    JSON.parse(readFileSync(aaResultsPath, "utf8")),
    aaResultsPath,
    statSync(aaResultsPath).mtime,
  );
  writeFileSync(NOISE_FLOOR_PATH, `${JSON.stringify(floor, null, 2)}\n`);
  process.stdout.write(
    `Wrote ${Object.keys(floor.rows).length} reader limits at ${floor.pairs} pairs.\n`,
  );
}

/** Run `pairCount` ABBA pairs, one fresh harness process per side per pair. */
function capturePairs(
  checkouts: Readonly<Record<Side, string>>,
  names: readonly string[],
  iterations: Readonly<Record<string, number>>,
  pairCount: number,
): ReaderGatePair[] {
  const workDir = mkdtempSync(join(tmpdir(), "reader-gate-"));
  try {
    const iterationsPath = join(workDir, "iterations.json");
    writeFileSync(iterationsPath, `${JSON.stringify(iterations)}\n`);
    return Array.from({ length: pairCount }, (_, index): ReaderGatePair => {
      // ABBA: even pairs run base first, odd pairs candidate first.
      const order: readonly [Side, Side] =
        index % 2 === 0 ? ["base", "candidate"] : ["candidate", "base"];
      const outputs: Partial<Record<Side, ReaderRunResult[]>> = {};
      for (const side of order) {
        outputs[side] = parseRun(runHarness(checkouts[side], ["run", iterationsPath]), side, names);
        process.stderr.write(`reader gate: pair ${index + 1}/${pairCount} ${side} done\n`);
      }
      if (outputs.base === undefined || outputs.candidate === undefined) {
        throw new Error(`Reader gate pair ${index} is missing a side`);
      }
      return { order, base: outputs.base, candidate: outputs.candidate };
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function runGate(args: readonly string[]): number {
  const basePath = optionValue(args, "--base");
  if (basePath === undefined) throw new Error("--base requires a checkout with a built engine");
  const checkouts: Record<Side, string> = {
    base: resolve(basePath),
    candidate: resolve(optionValue(args, "--candidate") ?? HARNESS_ROOT),
  };
  const isNoiseRun = checkouts.base === checkouts.candidate;
  if (!isNoiseRun) {
    const stored = asRecord(JSON.parse(readFileSync(REFERENCE_PATH, "utf8")), REFERENCE_PATH);
    const meta = asRecord(stored.meta, `${REFERENCE_PATH}.meta`);
    const expected = text(meta.baseSha, `${REFERENCE_PATH}.meta.baseSha`);
    const actual = gitHead(checkouts.base);
    if (actual !== expected) {
      throw new Error(
        `Reader gate needs the stored 0.5.x baseline ${expected}; --base is ${actual}`,
      );
    }
  }
  const floor = isNoiseRun
    ? undefined
    : parseReaderNoiseFloor(JSON.parse(readFileSync(NOISE_FLOOR_PATH, "utf8")), NOISE_FLOOR_PATH);
  const minimumPairs = Math.max(MINIMUM_PAIRS, floor?.pairs ?? MINIMUM_PAIRS);
  const pairCount = Number(optionValue(args, "--pairs") ?? minimumPairs);
  if (!Number.isInteger(pairCount) || pairCount < minimumPairs) {
    throw new Error(`--pairs must be an integer of at least ${minimumPairs}`);
  }
  const outputPath = optionValue(args, "--output");
  const names = selectedReaderCaseNames();
  const measuredAt = new Date().toISOString();
  const engines = {
    base: engineSha256(checkouts.base),
    candidate: engineSha256(checkouts.candidate),
  };

  // Both sides run the max calibrated count, so every sample on either side
  // does identical work and reaches the harness's sample-time target.
  const calibration = {
    base: parseCalibration(runHarness(checkouts.base, ["calibrate"]), "base", names),
    candidate: parseCalibration(runHarness(checkouts.candidate, ["calibrate"]), "candidate", names),
  };
  const iterations = Object.fromEntries(
    names.map((name) => [
      name,
      Math.max(calibration.base[name] ?? 0, calibration.candidate[name] ?? 0),
    ]),
  );
  const pairs = capturePairs(checkouts, names, iterations, pairCount);
  for (const side of ["base", "candidate"] as const) {
    if (engineSha256(checkouts[side]) !== engines[side]) {
      throw new Error(`Reader gate ${side} engine changed during the comparison`);
    }
  }

  const summary = summarizeReaderPairs(names, pairs);
  const verdict =
    floor === undefined
      ? undefined
      : judgeReaderRows(summary, floor, referenceRatios(REFERENCE_PATH));
  if (outputPath !== undefined) {
    const meta = {
      measuredAt,
      baseSha: gitHead(checkouts.base),
      candidateSha: gitHead(checkouts.candidate),
      engineSha256: engines,
      bun: Bun.version,
      pairs: pairCount,
      order:
        "ABBA (even pairs base first, odd pairs candidate first); one process per side per pair",
      readerFilter: process.env.READER_CASES ?? null,
      calibration,
      iterations,
    };
    writeFileSync(
      outputPath,
      `${JSON.stringify({ meta, summary, verdict: verdict ?? null }, null, 2)}\n`,
    );
  }
  process.stdout.write(report(summary, verdict));
  return verdict === undefined || verdict.passed ? 0 : 1;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const aaResultsPath = optionValue(args, "--write-floor");
  if (aaResultsPath === undefined) {
    process.exitCode = runGate(args);
  } else {
    writeFloor(aaResultsPath);
  }
}
