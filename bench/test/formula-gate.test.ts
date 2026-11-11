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
  return ratios.map((ratio, index) => ({
    base: capture(index + 1),
    candidate: capture(index + 1, (index + 1) * ratio),
  }));
}

/** `pairs()` with the candidate's WORKLOAD bytes grown by `extra` in every pair. */
function grown(extra: number): FormulaGatePair[] {
  return pairs().map((pair) => {
    pair.candidate.bytes[BYTE_ROW] = BASE_BYTES + extra;
    return pair;
  });
}

const verdictFor = (captures: FormulaGatePair[], acceptance?: FormulaByteAcceptance) =>
  compareFormulaPairs(captures, FORMULA_RATIO_LIMITS, acceptance);

it("accepts only named byte growth for the exact candidate engine and reports the reason", () => {
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
