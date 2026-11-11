import { expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { READER_CASE_NAMES, type ReaderRunResult } from "../src/reader-bench.js";
import {
  engineSha256,
  judgeReaderRows,
  noiseFloorFromAaResults,
  parseReaderNoiseFloor,
  type ReaderGatePair,
  summarizeReaderPairs,
} from "../src/reader-gate.js";

const GATE_PAIRS = 8;
const READER = "aggregate SUM A";
const FLOOR_PATH = "reader-noise-floor.json";
const AA_PATH = "aa-report.json";
const AA_SHA = "48b137c8aca8724d99622a1edaad6f5bfcf2490a";
const AA_ENGINE = "a".repeat(64);
const AA_CPUS = "8";
const BASE_DIGEST = 42;
/** The highest single-pair A/A ratio in the 0.5.x floor (range SUM(D)). */
const AA_OUTLIER = 2.124;

/** 24 same-engine pair ratios: the ±5 % spread of the 0.5.x A/A run plus its worst pair. */
const AA_SPREAD = [
  0.95, 0.96, 0.97, 0.97, 0.98, 0.98, 0.99, 0.99, 0.99, 1.0, 1.0, 1.0, 1.0, 1.01, 1.01, 1.01, 1.02,
  1.02, 1.03, 1.03, 1.04, 1.05, 1.05,
];

function run(medianSampleMs: number, digest = BASE_DIGEST): ReaderRunResult[] {
  return READER_CASE_NAMES.map((name) => ({
    name,
    group: "query",
    fixture: "fixture",
    iterations: 1,
    sampleMs: [medianSampleMs],
    medianSampleMs: name === READER ? medianSampleMs : 1,
    digest: name === READER ? digest : BASE_DIGEST,
  }));
}

/** Each pair runs at its own machine speed; only READER's paired ratio is set. */
function pairs(ratios: readonly number[], candidateDigest = BASE_DIGEST): ReaderGatePair[] {
  return ratios.map((ratio, index) => ({
    order: index % 2 === 0 ? ["base", "candidate"] : ["candidate", "base"],
    base: run(index + 1),
    candidate: run((index + 1) * ratio, candidateDigest),
  }));
}

/** An A/A report as the gate's `--output` writes it. */
function aaReport(meta: Record<string, unknown> = {}, verdict: unknown = null): unknown {
  return {
    meta: {
      measuredAt: "2026-10-27T00:00:00.000Z",
      baseSha: AA_SHA,
      candidateSha: AA_SHA,
      engineSha256: { base: AA_ENGINE, candidate: AA_ENGINE },
      cpus: AA_CPUS,
      readerFilter: null,
      ...meta,
    },
    summary: summarizeReaderPairs(READER_CASE_NAMES, pairs([...AA_SPREAD, AA_OUTLIER])),
    verdict,
  };
}

/** Resampling 20,000 medians per reader takes about a second; the fixed seed makes one floor enough. */
const FLOOR = noiseFloorFromAaResults(aaReport(), AA_PATH);

function verdict(ratios: readonly number[], candidateDigest = BASE_DIGEST): boolean | undefined {
  const summary = summarizeReaderPairs(READER_CASE_NAMES, pairs(ratios, candidateDigest));
  return judgeReaderRows(summary, FLOOR).rows.find((row) => row.name === READER)?.passed;
}

const repeat = (ratio: number, count = GATE_PAIRS) => Array.from({ length: count }, () => ratio);

it("fails a 1.15x slowdown although one pair was faster and passes A/A-like noise", () => {
  expect(verdict([...repeat(1.15, GATE_PAIRS - 1), 0.95])).toBe(false);
  expect(verdict([0.96, 1.04, 0.98, 1.03, 1.0, 0.97, 1.05, 1.02])).toBe(true);
});

it("writes a floor only from an A/A report of one engine", () => {
  for (const report of [
    aaReport({ candidateSha: "f61edeaa23167fc79616bdb85cf19092de318523" }),
    aaReport({ engineSha256: { base: AA_ENGINE, candidate: "b".repeat(64) } }),
    aaReport({}, { passed: true, rows: [] }),
    aaReport({ readerFilter: "^aggregate" }),
  ]) {
    expect(() => noiseFloorFromAaResults(report, AA_PATH)).toThrow();
  }
  expect(FLOOR.source).toEqual({ sha: AA_SHA, engineSha256: AA_ENGINE, cpus: AA_CPUS });
  expect(parseReaderNoiseFloor(FLOOR, FLOOR_PATH)).toEqual(FLOOR);
});

it("hashes the engine's JavaScript glue as well as its module", () => {
  const checkout = mkdtempSync(join(tmpdir(), "reader-gate-engine-"));
  const pkg = join(checkout, "packages/wasm/pkg");
  try {
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "sheetwrite_wasm_bg.wasm"), "module");
    writeFileSync(join(pkg, "sheetwrite_wasm_factory.js"), "glue one");
    const before = engineSha256(checkout);
    writeFileSync(join(pkg, "sheetwrite_wasm_factory.js"), "glue two");
    expect(engineSha256(checkout)).not.toBe(before);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
});
