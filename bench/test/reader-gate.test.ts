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
  type ReaderNoiseFloor,
  summarizeReaderPairs,
} from "../src/reader-gate.js";

const GATE_PAIRS = 8;
const READER = "aggregate SUM A";
const FLOOR_PATH = "reader-noise-floor.json";
const AA_PATH = "aa-report.json";
const MEASURED_AT = "2026-10-27T00:00:00.000Z";
const AA_SHA = "48b137c8aca8724d99622a1edaad6f5bfcf2490a";
const OTHER_SHA = "f61edeaa23167fc79616bdb85cf19092de318523";
const AA_ENGINE = "a".repeat(64);
const OTHER_ENGINE = "b".repeat(64);
const AA_CPUS = "8";
const BASE_DIGEST = 42;
/** The highest single-pair A/A ratio in the 0.5.x floor (range SUM(D)). */
const AA_OUTLIER = 2.124;

/**
 * 24 same-engine pair ratios: a ±5 % spread like the measured 0.5.x A/A run,
 * plus one slow pair at the worst ratio that run saw.
 */
const AA_RATIOS = [
  0.95,
  0.96,
  0.97,
  0.97,
  0.98,
  0.98,
  0.99,
  0.99,
  0.99,
  1.0,
  1.0,
  1.0,
  1.0,
  1.01,
  1.01,
  1.01,
  1.02,
  1.02,
  1.03,
  1.03,
  1.04,
  1.05,
  1.05,
  AA_OUTLIER,
];

/** Eight pairs drawn from the same spread as AA_RATIOS, without its outlier. */
const AA_LIKE_RUN = [0.96, 1.04, 0.98, 1.03, 1.0, 0.97, 1.05, 1.02];

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
  return ratios.map((ratio, index) => {
    const speed = index + 1;
    return {
      order: index % 2 === 0 ? ["base", "candidate"] : ["candidate", "base"],
      base: run(speed),
      candidate: run(speed * ratio, candidateDigest),
    };
  });
}

/** An A/A report as the gate's `--output` writes it. */
function aaReport(meta: Record<string, unknown> = {}, verdict: unknown = null): unknown {
  return {
    meta: {
      measuredAt: MEASURED_AT,
      baseSha: AA_SHA,
      candidateSha: AA_SHA,
      engineSha256: { base: AA_ENGINE, candidate: AA_ENGINE },
      cpus: AA_CPUS,
      readerFilter: null,
      ...meta,
    },
    summary: summarizeReaderPairs(READER_CASE_NAMES, pairs(AA_RATIOS)),
    verdict,
  };
}

function floor(): ReaderNoiseFloor {
  return noiseFloorFromAaResults(aaReport(), AA_PATH);
}

function verdict(ratios: readonly number[], candidateDigest = BASE_DIGEST): boolean | undefined {
  const summary = summarizeReaderPairs(READER_CASE_NAMES, pairs(ratios, candidateDigest));
  return judgeReaderRows(summary, floor()).rows.find((row) => row.name === READER)?.passed;
}

function repeat(ratio: number, count: number): number[] {
  return Array.from({ length: count }, () => ratio);
}

it("fails a 1.15x slowdown although one pair of eight was faster", () => {
  expect(verdict([...repeat(1.15, GATE_PAIRS - 1), 0.95])).toBe(false);
});

it("fails a uniform 2.1x slowdown that one slow A/A pair would have excused", () => {
  expect(verdict(repeat(2.1, GATE_PAIRS))).toBe(false);
});

it("passes runs that look like A/A noise and runs that are faster", () => {
  expect(verdict(AA_LIKE_RUN)).toBe(true);
  expect(verdict(repeat(0.9, GATE_PAIRS))).toBe(true);
});

it("does not let extra pairs pass a slowdown that eight pairs fail", () => {
  const eight = [...repeat(1.15, GATE_PAIRS - 1), 0.95];
  expect(verdict([...eight, ...eight])).toBe(false);
  expect(verdict([...eight, ...eight, ...eight])).toBe(false);
});

it("rejects a run with fewer pairs than the limits were resampled at", () => {
  expect(() => verdict(repeat(1, GATE_PAIRS - 1))).toThrow();
});

it("fails a reader whose result differs from the base", () => {
  expect(verdict(repeat(0.9, GATE_PAIRS), BASE_DIGEST + 1)).toBe(false);
});

it("builds limits from resampled medians, not from the slowest A/A pair", () => {
  const limit = floor().rows[READER]?.limit ?? Number.NaN;
  expect(limit).toBeGreaterThan(1);
  expect(limit).toBeLessThan(1.15);
  const quiet = READER_CASE_NAMES.find((name) => name !== READER) ?? READER;
  expect(floor().rows[quiet]?.limit).toBe(1);
});

it("writes a floor only from an A/A report of one engine", () => {
  const notAa = [
    aaReport({ candidateSha: OTHER_SHA }),
    aaReport({ engineSha256: { base: AA_ENGINE, candidate: OTHER_ENGINE } }),
    aaReport({}, { passed: true, rows: [] }),
    aaReport({ readerFilter: "^aggregate" }),
  ];
  for (const report of notAa) {
    expect(() => noiseFloorFromAaResults(report, AA_PATH)).toThrow();
  }
  const written = floor();
  expect(written.source).toEqual({ sha: AA_SHA, engineSha256: AA_ENGINE, cpus: AA_CPUS });
  expect(parseReaderNoiseFloor(written, FLOOR_PATH)).toEqual(written);
});

it("rejects floors with missing, unknown or loosened rows", () => {
  const { rows } = floor();
  const row = rows[READER];
  if (row === undefined) throw new Error(`floor has no ${READER}`);
  const { [READER]: _dropped, ...missing } = rows;
  const loosened = { ...rows, [READER]: { ...row, limit: row.limit + 0.05 } };
  for (const bad of [missing, { ...rows, "unknown reader": row }, loosened]) {
    expect(() => parseReaderNoiseFloor({ ...floor(), rows: bad }, FLOOR_PATH)).toThrow();
  }
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
