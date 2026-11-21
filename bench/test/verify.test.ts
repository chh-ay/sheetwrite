import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { commandArtifact } from "../src/verify.js";

const repositoryRoot = resolve(import.meta.dir, "../..");

test("fails a gate, prints its measured values and preserves a structured error artifact", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-verify-"));
  try {
    const path = resolve(directory, "view-index.json");
    writeFileSync(
      path,
      JSON.stringify({
        rows: 1_000_000,
        repeats: 5,
        runs: { map: Array(5).fill({}), packed: Array(5).fill({}) },
        heapReduction: 0.6,
        lookupP95Regression: 0.25,
        baseline: { lookupP95Ns: 100 },
        packed: { lookupP95Ns: 125 },
        gates: { heapReduction: true, lookupP95: false },
      }),
    );
    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        resolve(repositoryRoot, "bench/src/verify.ts"),
        "--fixture",
        `view-index:${path}`,
      ],
      { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
    );

    const failure = "view-index runtime gates failed: lookupP95";
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(failure);
    const measurements = result.stderr.toString().split("Failing view-index measurements: ")[1];
    expect(JSON.parse(measurements ?? "")).toMatchObject({
      lookupP95Regression: 0.25,
      baseline: { lookupP95Ns: 100 },
      packed: { lookupP95Ns: 125 },
    });
    const errorArtifact = resolve(
      repositoryRoot,
      "test-results/performance-gates/view-index-error.json",
    );
    expect(readFileSync(errorArtifact, "utf8")).toContain(failure);

    // Each fixture family runs its own gate validator, so an empty formula artifact fails.
    const formulaPath = resolve(directory, "formula.json");
    writeFileSync(formulaPath, "{}");
    const formula = Bun.spawnSync(
      [
        "bun",
        "run",
        resolve(repositoryRoot, "bench/src/verify.ts"),
        "--fixture",
        `formula:${formulaPath}`,
      ],
      { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
    );
    expect(formula.exitCode).toBe(1);
    expect(formula.stderr.toString()).toContain("benchmark formula failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);

test("names how a smoke without a JSON artifact ended", () => {
  const stderr = "sample 1/3: lookup 20.1 ns\nerror: the showcase grid did not become usable\n";
  expect(() =>
    commandArtifact({ stdout: "", stderr, exitCode: 1, signalCode: null }, "interaction"),
  ).toThrow(
    "interaction smoke exited 1 without a JSON artifact; its stderr ends:\nsample 1/3: lookup 20.1 ns\nerror: the showcase grid did not become usable",
  );
  expect(() =>
    commandArtifact(
      { stdout: "", stderr: "", exitCode: null, signalCode: "SIGKILL" },
      "interaction",
    ),
  ).toThrow("interaction smoke was killed by SIGKILL without a JSON artifact; its stderr is empty");
});
