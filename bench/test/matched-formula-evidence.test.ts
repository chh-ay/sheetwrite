import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  buildMatchedEvidence,
  type MatchedFormulaEvidence,
  type MatchedRawArtifact,
  validateMatchedEvidence,
} from "../src/matched-formula-evidence.js";

function sha256(path: URL): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const rawPath = new URL("../results/formula-regression-raw.json", import.meta.url);
const harnessPath = new URL("../src/matched-formula-harness.ts", import.meta.url);
const artifactPath = new URL("../results/formula-regression-results.json", import.meta.url);
const expectedRawArtifactSha256 = sha256(rawPath);
const expectedHarnessSha256 = sha256(harnessPath);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as MatchedFormulaEvidence;
const raw = JSON.parse(readFileSync(rawPath, "utf8")) as MatchedRawArtifact;

function rebuild(value: MatchedRawArtifact): MatchedFormulaEvidence {
  return buildMatchedEvidence(value, {
    baselineWasmSha256: artifact.wasmSha256.baseline,
    candidateWasmSha256: artifact.wasmSha256.candidate,
    harnessSha256: expectedHarnessSha256,
    rawArtifactSha256: expectedRawArtifactSha256,
  });
}

function copy(): MatchedFormulaEvidence {
  return structuredClone(artifact);
}

function validate(value: MatchedFormulaEvidence): void {
  validateMatchedEvidence(value, {
    rawArtifactSha256: expectedRawArtifactSha256,
    harnessSha256: expectedHarnessSha256,
  });
}

describe("matched formula evidence contract", () => {
  // The success path validates the complete bootstrap artifact. Tamper cases
  // below fail early, but this one deliberately traverses every sample.
  test("accepts the freshly generated canonical artifact", () => {
    expect(() => validate(copy())).not.toThrow();
  }, 60_000);

  // The tracked raw artifact must not depend on the work directory of the
  // machine that captured it, and it must still produce the tracked evidence.
  test("rebuilds the tracked evidence from the portable raw artifact", () => {
    expect(rebuild(raw)).toEqual(artifact);
  }, 60_000);

  test("rejects a raw artifact with an absolute package path", () => {
    const value = structuredClone(raw);
    value.sides.baseline.pkg = "/tmp/checkout/packages/wasm/pkg";
    expect(() => rebuild(value)).toThrow("raw package paths must be relative");
  });

  for (const [label, mutate] of [
    [
      "raw artifact hash",
      (value: MatchedFormulaEvidence) => (value.rawArtifactSha256 = "0".repeat(64)),
    ],
    ["harness hash", (value: MatchedFormulaEvidence) => (value.harnessSha256 = "0".repeat(64))],
    ["governor", (value: MatchedFormulaEvidence) => (value.controls.governor = "performance")],
    [
      "workload boundaries",
      (value: MatchedFormulaEvidence) => delete value.workloadBoundaries["wide-fan-out-edit/1000"],
    ],
    [
      "median samples",
      (value: MatchedFormulaEvidence) =>
        (value.workloads["independent-parse-load/1000"]!.raw.baselineMs[0]! += 1),
    ],
  ] as const) {
    test(`rejects tampered ${label}`, () => {
      const value = copy();
      mutate(value);
      expect(() => validate(value)).toThrow();
    });
  }
});
