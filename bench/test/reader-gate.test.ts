import { expect, it } from "bun:test";

import { READER_CASE_NAMES, type ReaderRunResult } from "../src/reader-bench.js";
import {
  judgeReaderRows,
  noiseFloorFromAaResults,
  parseReaderNoiseFloor,
  type ReaderGatePair,
  type ReaderNoiseFloor,
  summarizeReaderPairs,
} from "../src/reader-gate.js";

const PAIRS = 8;
const READER = "aggregate SUM A";
const AA_MAX = 1.1;
const FLOOR_PATH = "reader-noise-floor.json";
const MEASURED_AT = "2026-10-27T00:00:00.000Z";
const BASE_DIGEST = 42;

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

function floorRows(aaMaxRatio = AA_MAX): Record<string, Record<string, number>> {
  return Object.fromEntries(
    READER_CASE_NAMES.map((name) => [
      name,
      { aaMinRatio: 1, aaMaxRatio, limit: Math.max(1, aaMaxRatio) },
    ]),
  );
}

function floor(): ReaderNoiseFloor {
  return parseReaderNoiseFloor(
    { measuredAt: MEASURED_AT, pairs: PAIRS, rows: floorRows() },
    FLOOR_PATH,
  );
}

function verdict(ratios: readonly number[], candidateDigest = BASE_DIGEST): boolean | undefined {
  const summary = summarizeReaderPairs(READER_CASE_NAMES, pairs(ratios, candidateDigest));
  return judgeReaderRows(summary, floor()).rows.find((row) => row.name === READER)?.passed;
}

it("fails a reader only above its A/A limit with every pair slower", () => {
  const cases: ReadonlyArray<[string, number[], boolean]> = [
    ["consistently above the floor", Array.from({ length: PAIRS }, () => 1.2), false],
    ["one fast pair shows noise", [...Array.from({ length: PAIRS - 1 }, () => 1.2), 0.95], true],
    ["slower every pair but inside the floor", Array.from({ length: PAIRS }, () => 1.05), true],
    ["faster", Array.from({ length: PAIRS }, () => 0.9), true],
  ];
  for (const [label, ratios, passed] of cases) {
    expect({ label, passed: verdict(ratios) }).toEqual({ label, passed });
  }
});

it("fails a reader whose result differs from the base", () => {
  expect(
    verdict(
      Array.from({ length: PAIRS }, () => 0.9),
      BASE_DIGEST + 1,
    ),
  ).toBe(false);
});

it("rejects floors with missing, unknown or loosened rows", () => {
  const rows = floorRows();
  const { [READER]: _dropped, ...missing } = rows;
  const loosened = {
    ...rows,
    [READER]: { aaMinRatio: 1, aaMaxRatio: AA_MAX, limit: AA_MAX + 0.05 },
  };
  for (const bad of [missing, { ...rows, "unknown reader": rows[READER] }, loosened]) {
    expect(() =>
      parseReaderNoiseFloor({ measuredAt: MEASURED_AT, pairs: PAIRS, rows: bad }, FLOOR_PATH),
    ).toThrow();
  }
});

it("turns an A/A run into a floor of its measured maxima", () => {
  const summary = READER_CASE_NAMES.map((name) => ({
    name,
    minRatio: 0.9,
    maxRatio: name === READER ? 1.23 : 0.97,
    medianRatio: 1,
    pairs: PAIRS,
  }));
  const written = noiseFloorFromAaResults(
    { meta: { measuredAt: MEASURED_AT }, summary },
    "aa.json",
    new Date(0),
  );
  expect(written.rows[READER]?.limit).toBe(1.23);
  expect(written.rows[READER_CASE_NAMES.find((name) => name !== READER) ?? READER]?.limit).toBe(1);
  expect(parseReaderNoiseFloor(written, FLOOR_PATH)).toEqual(written);
});
