import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  buildMatchedEvidence,
  type MatchedFormulaEvidence,
  type MatchedRawArtifact,
  validateMatchedEvidence,
} from "../src/matched-formula-evidence.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const sha256 = (path: string) => createHash("sha256").update(read(path)).digest("hex");

const RAW_PATH = "../results/formula-regression-raw.json";
const rawArtifactSha256 = sha256(RAW_PATH);
const harnessSha256 = sha256("../src/matched-formula-harness.ts");
const ARTIFACT = JSON.parse(
  read("../results/formula-regression-results.json").toString(),
) as MatchedFormulaEvidence;
const RAW = JSON.parse(read(RAW_PATH).toString()) as MatchedRawArtifact;

function rebuild(value: MatchedRawArtifact): MatchedFormulaEvidence {
  return buildMatchedEvidence(value, {
    baselineWasmSha256: ARTIFACT.wasmSha256.baseline,
    candidateWasmSha256: ARTIFACT.wasmSha256.candidate,
    harnessSha256,
    rawArtifactSha256,
  });
}

const validate = (value: MatchedFormulaEvidence) =>
  validateMatchedEvidence(value, { rawArtifactSha256, harnessSha256 });

// The success path traverses every sample of the tracked bootstrap artifact;
// the tamper cases below fail early.
test("accepts the recorded canonical artifact", () => {
  expect(() => validate(structuredClone(ARTIFACT))).not.toThrow();
}, 60_000);

// The tracked raw artifact must not depend on the capturing machine's work
// directory, and it must still produce the tracked evidence.
test("rebuilds the tracked evidence from the portable raw artifact", () => {
  expect(rebuild(RAW)).toEqual(ARTIFACT);
  const absolute = structuredClone(RAW);
  absolute.sides.baseline.pkg = "/tmp/checkout/packages/wasm/pkg";
  expect(() => rebuild(absolute)).toThrow("raw package paths must be relative");
}, 60_000);
