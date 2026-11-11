import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { runVerification } from "../src/verify.js";

const ARTIFACT_ROOT = resolve(import.meta.dir, "../../test-results/performance-gates");
const directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-verify-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Runs the CI verifier on one recorded family result; returns its exit code and diagnostics. */
async function verifyFixture(family: string, artifact: unknown) {
  const path = resolve(directory, `${family}.json`);
  writeFileSync(path, JSON.stringify(artifact));
  const stderr: string[] = [];
  const write = spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  try {
    const exitCode = await runVerification(["--fixture", `${family}:${path}`]);
    return { exitCode, stderr: stderr.join("") };
  } finally {
    write.mockRestore();
  }
}

test("fails an invalid result and keeps the raw and structured error artifacts", async () => {
  const result = await verifyFixture("formula", {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.formula.smoke,
    workloads: [],
  });
  expect(result.exitCode).toBe(1);
  expect(existsSync(resolve(ARTIFACT_ROOT, "formula.json"))).toBe(true);
  const notExact = "formula workload matrix is not exact: missing workload=";
  const error = readFileSync(resolve(ARTIFACT_ROOT, "formula-error.json"), "utf8");
  expect(JSON.parse(error)).toMatchObject({ family: "formula", status: "failed" });
  expect(error).toContain(notExact);
  expect(result.stderr).toContain(`benchmark formula failed: ${notExact}`);
});

test("prints the failing view-index gate and measured values", async () => {
  const result = await verifyFixture("view-index", {
    rows: 1_000_000,
    repeats: 5,
    runs: { map: Array(5).fill({}), packed: Array(5).fill({}) },
    heapReduction: 0.6,
    lookupP95Regression: 0.25,
    baseline: { lookupP95Ns: 100 },
    packed: { lookupP95Ns: 125 },
    gates: { heapReduction: true, lookupP95: false },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("view-index runtime gates failed: lookupP95");
  const measurements = result.stderr.split("Failing view-index measurements: ")[1] ?? "";
  expect(JSON.parse(measurements)).toMatchObject({
    lookupP95Regression: 0.25,
    baseline: { lookupP95Ns: 100 },
    packed: { lookupP95Ns: 125 },
  });
});
