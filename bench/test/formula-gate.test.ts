import { expect, it } from "bun:test";

import { expectedFormulaWorkloadKeys, type FormulaGateCapture } from "../src/formula-bench.js";
import {
  compareFormulaPairs,
  FORMULA_RATIO_LIMITS,
  type FormulaByteAcceptance,
  type FormulaGatePair,
} from "../src/formula-gate.js";
import { must } from "./gate-fixtures.js";

const MATRIX = expectedFormulaWorkloadKeys("full");
const WORKLOAD = "workload=xlookup-many;size=1000";
const BYTE_ROW = `${WORKLOAD}.allocation.retainedBytes`;
const ENGINE_DIGEST = "a".repeat(64);
const BASE_BYTES = 1024;
const PAIRS = 7;
const UNCHANGED = Array.from({ length: PAIRS }, () => 1);
const LIMIT = must(FORMULA_RATIO_LIMITS.get(WORKLOAD), `${WORKLOAD} limit`);

function capture(duration_ms: number, workload_ms = duration_ms): FormulaGateCapture {
  const timings: Record<string, number> = {};
  const bytes: Record<string, number> = {};
  for (const key of MATRIX) {
    timings[key] = key === WORKLOAD ? workload_ms : duration_ms;
    bytes[`${key}.allocation.retainedBytes`] = BASE_BYTES;
  }
  return { engineDigest: ENGINE_DIGEST, timings, bytes, skipped: {} };
}

/** Each pair runs at a different machine speed; only the paired ratio for WORKLOAD differs. */
function pairs(ratios = UNCHANGED, speed = (index: number) => index + 1): FormulaGatePair[] {
  return ratios.map((ratio, index) => ({
    base: capture(speed(index)),
    candidate: capture(speed(index), speed(index) * ratio),
  }));
}

/** `pairs()` with the candidate's WORKLOAD bytes grown by `extra` in the selected pairs. */
function grown(extra: number, in_pair = (_index: number) => true): FormulaGatePair[] {
  return pairs().map((pair, index) => {
    if (in_pair(index)) pair.candidate.bytes[BYTE_ROW] = BASE_BYTES + extra;
    return pair;
  });
}

const verdict_for = (captures: FormulaGatePair[], acceptance?: FormulaByteAcceptance) =>
  compareFormulaPairs(captures, FORMULA_RATIO_LIMITS, acceptance);

it("passes drift, noise and the limit itself, and fails a sustained slowdown just above it", () => {
  expect(verdict_for(pairs([1, 4, 1, 1, 1, 1, 1])).passed).toBe(true);
  expect(verdict_for(pairs(UNCHANGED.map(() => LIMIT))).passed).toBe(true);
  // Microsecond rows get no absolute floor.
  const slow = verdict_for(
    pairs(
      UNCHANGED.map(() => LIMIT + 0.05),
      () => 0.001,
    ),
  );
  expect(slow.passed).toBe(false);
  expect(slow.timings.filter((row) => !row.passed).map((row) => row.key)).toEqual([WORKLOAD]);
});

it("rejects one byte of growth in most captures and ignores one odd capture", () => {
  expect(verdict_for(grown(1, (index) => index === 0)).passed).toBe(true);
  expect(verdict_for(grown(1, (index) => index > 0)).bytes.filter((row) => !row.passed)).toEqual([
    expect.objectContaining({ key: BYTE_ROW, maximum: BASE_BYTES, candidate: BASE_BYTES + 1 }),
  ]);
});

it("accepts only named byte growth for the exact candidate engine and reports the reason", () => {
  const acceptance: FormulaByteAcceptance = {
    candidateEngineDigest: ENGINE_DIGEST,
    rows: [{ key: BYTE_ROW, maximum: BASE_BYTES + 8, reason: "8-byte cache; lookup median -20%" }],
  };
  expect(verdict_for(grown(8), acceptance).bytes.find((row) => row.key === BYTE_ROW)).toEqual(
    expect.objectContaining({ passed: true, acceptedReason: acceptance.rows[0]?.reason }),
  );
  expect(verdict_for(grown(9), acceptance).passed).toBe(false);
  expect(() => verdict_for(pairs(), acceptance)).toThrow("obsolete");
  expect(() =>
    verdict_for(grown(8), { ...acceptance, candidateEngineDigest: "b".repeat(64) }),
  ).toThrow("exact candidate engine");
  for (const row of [
    { key: "missing", maximum: BASE_BYTES + 8, reason: "measured growth" },
    { key: BYTE_ROW, maximum: BASE_BYTES + 8, reason: " " },
    { key: BYTE_ROW, maximum: BASE_BYTES + 8.5, reason: "measured growth" },
  ]) {
    expect(() => verdict_for(grown(8), { ...acceptance, rows: [row] })).toThrow(
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
  const base_skip = verdict_for(skip("base"));
  expect(base_skip.passed).toBe(true);
  expect(base_skip.skipped).toEqual([
    { key: WORKLOAD, side: "base", reason: "store.newExport is not a function" },
  ]);
  expect(base_skip.timings.some((row) => row.key === WORKLOAD)).toBe(false);
  expect(verdict_for(skip("candidate")).passed).toBe(false);
});

it("fails closed for too few pairs, an incomplete matrix, an engine change and a missing limit", () => {
  expect(() => verdict_for(pairs(UNCHANGED.slice(1)))).toThrow("at least 7 pairs");
  const missing = pairs();
  delete must(missing[0], "pair").candidate.timings[WORKLOAD];
  expect(() => verdict_for(missing)).toThrow(WORKLOAD);
  const changed = pairs();
  must(changed.at(-1), "pair").candidate.engineDigest = "b".repeat(64);
  expect(() => verdict_for(changed)).toThrow("candidate engine changed");
  expect(() => compareFormulaPairs(pairs(), new Map())).toThrow("No reviewed formula ratio limit");
});
