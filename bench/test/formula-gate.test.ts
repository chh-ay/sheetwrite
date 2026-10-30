import { expect, it } from "bun:test";

import { expectedFormulaWorkloadKeys, type FormulaGateCapture } from "../src/formula-bench.js";
import {
  compareFormulaPairs,
  FORMULA_RATIO_LIMITS,
  type FormulaByteAcceptance,
  type FormulaGatePair,
} from "../src/formula-gate.js";

const MATRIX = expectedFormulaWorkloadKeys("full");
const WORKLOAD = "workload=xlookup-many;size=1000";
const BYTE_ROW = `${WORKLOAD}.allocation.retainedBytes`;
const ENGINE_DIGEST = "a".repeat(64);
const BASE_BYTES = 1024;
const PAIRS = 7;
const UNCHANGED = Array.from({ length: PAIRS }, () => 1);

function capture(durationMs: number, workloadMs = durationMs): FormulaGateCapture {
  const timings: Record<string, number> = {};
  const bytes: Record<string, number> = {};
  for (const key of MATRIX) {
    timings[key] = key === WORKLOAD ? workloadMs : durationMs;
    bytes[`${key}.allocation.retainedBytes`] = BASE_BYTES;
  }
  return { engineDigest: ENGINE_DIGEST, timings, bytes, skipped: {} };
}

/** Each pair runs at a different machine speed; only the paired ratio for WORKLOAD differs. */
function pairs(ratios = UNCHANGED): FormulaGatePair[] {
  return ratios.map((ratio, index) => {
    const speed = index + 1;
    return { base: capture(speed), candidate: capture(speed, speed * ratio) };
  });
}

function verdictFor(captures: FormulaGatePair[], acceptance?: FormulaByteAcceptance) {
  return compareFormulaPairs(captures, FORMULA_RATIO_LIMITS, acceptance);
}

it("passes unchanged work despite machine drift and one noisy pair", () => {
  expect(verdictFor(pairs([1, 4, 1, 1, 1, 1, 1])).passed).toBe(true);
});

it("fails a sustained slowdown just above the row's ratio limit, even on microsecond rows", () => {
  const limit = FORMULA_RATIO_LIMITS.get(WORKLOAD);
  if (limit === undefined) throw new Error(`${WORKLOAD} has no limit`);
  const ratio = limit + 0.05;
  const microsecondPairs = UNCHANGED.map(() => ({
    base: capture(0.001),
    candidate: capture(0.001, 0.001 * ratio),
  }));

  expect(verdictFor(pairs(UNCHANGED.map(() => limit))).passed).toBe(true);
  const verdict = verdictFor(microsecondPairs);
  expect(verdict.passed).toBe(false);
  expect(verdict.timings.filter((row) => !row.passed).map((row) => row.key)).toEqual([WORKLOAD]);
});

it("rejects one byte of growth in most captures and ignores one odd capture", () => {
  const odd = pairs();
  const first = odd[0];
  if (first === undefined) throw new Error("Missing test pair");
  first.candidate.bytes[BYTE_ROW] = BASE_BYTES + 1;
  expect(verdictFor(odd).passed).toBe(true);

  const grown = pairs().map((pair, index) => {
    if (index > 0) pair.candidate.bytes[BYTE_ROW] = BASE_BYTES + 1;
    return pair;
  });
  expect(verdictFor(grown).bytes.filter((row) => !row.passed)).toEqual([
    expect.objectContaining({ key: BYTE_ROW, maximum: BASE_BYTES, candidate: BASE_BYTES + 1 }),
  ]);
});

it("accepts only named byte growth for the exact candidate engine and reports the reason", () => {
  const grown = (extra: number) =>
    pairs().map((pair) => {
      pair.candidate.bytes[BYTE_ROW] = BASE_BYTES + extra;
      return pair;
    });
  const acceptance: FormulaByteAcceptance = {
    candidateEngineDigest: ENGINE_DIGEST,
    rows: [{ key: BYTE_ROW, maximum: BASE_BYTES + 8, reason: "8-byte cache; lookup median -20%" }],
  };

  expect(verdictFor(grown(8), acceptance).bytes.find((row) => row.key === BYTE_ROW)).toEqual(
    expect.objectContaining({ passed: true, acceptedReason: acceptance.rows[0]?.reason }),
  );
  expect(verdictFor(grown(9), acceptance).passed).toBe(false);
  expect(() => verdictFor(pairs(), acceptance)).toThrow("obsolete");
  expect(() =>
    verdictFor(grown(8), { ...acceptance, candidateEngineDigest: "b".repeat(64) }),
  ).toThrow("exact candidate engine");
  for (const row of [
    { key: "missing", maximum: BASE_BYTES + 8, reason: "measured growth" },
    { key: BYTE_ROW, maximum: BASE_BYTES + 8, reason: " " },
    { key: BYTE_ROW, maximum: BASE_BYTES + 8.5, reason: "measured growth" },
  ]) {
    expect(() => verdictFor(grown(8), { ...acceptance, rows: [row] })).toThrow(
      "Invalid byte acceptance",
    );
  }
});

it("reports rows an older base cannot run and fails rows the candidate cannot run", () => {
  const skip = (side: keyof FormulaGatePair) =>
    pairs().map((pair) => {
      delete pair[side].timings[WORKLOAD];
      delete pair[side].bytes[BYTE_ROW];
      pair[side].skipped[WORKLOAD] = "store.newExport is not a function";
      return pair;
    });

  const baseSkip = verdictFor(skip("base"));
  expect(baseSkip.passed).toBe(true);
  expect(baseSkip.skipped).toEqual([
    { key: WORKLOAD, side: "base", reason: "store.newExport is not a function" },
  ]);
  expect(baseSkip.timings.some((row) => row.key === WORKLOAD)).toBe(false);
  expect(verdictFor(skip("candidate")).passed).toBe(false);
});

it("fails closed for too few pairs, an incomplete matrix and an engine change", () => {
  expect(() => verdictFor(pairs(UNCHANGED.slice(1)))).toThrow("at least 7 pairs");

  const missing = pairs();
  const first = missing[0];
  if (first === undefined) throw new Error("Missing test pair");
  delete first.candidate.timings[WORKLOAD];
  expect(() => verdictFor(missing)).toThrow(WORKLOAD);

  const changed = pairs();
  const last = changed.at(-1);
  if (last === undefined) throw new Error("Missing test pair");
  last.candidate.engineDigest = "b".repeat(64);
  expect(() => verdictFor(changed)).toThrow("candidate engine changed");
  expect(() => compareFormulaPairs(pairs(), new Map())).toThrow("No reviewed formula ratio limit");
});
