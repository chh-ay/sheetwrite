import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateBaseline } from "../src/generate-baseline.js";
import { makeRenderArtifact, TEST_RUNNER } from "./gate-fixtures.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");

describe("reviewed controlled baseline generation", () => {
  let directory = "";
  let rawPath = "";
  let approvedPath = "";

  beforeAll(() => {
    const candidateRoot = resolve(REPOSITORY_ROOT, "bench/results/candidates");
    mkdirSync(candidateRoot, { recursive: true });
    directory = mkdtempSync(resolve(candidateRoot, "baseline-generation-"));
    rawPath = resolve(directory, "raw.json");
    approvedPath = resolve(directory, "approved.json");
    writeFileSync(rawPath, `${JSON.stringify(makeRenderArtifact({ rounds: 10 }), null, 2)}\n`);
    writeFileSync(approvedPath, "approved sentinel\n");
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  test("never overwrites the approved baseline without explicit write intent", async () => {
    const candidatePath = resolve(directory, "candidate.json");
    await generateBaseline([
      "--input",
      rawPath,
      "--output",
      candidatePath,
      "--approved",
      approvedPath,
      "--power-mode",
      TEST_RUNNER.powerMode,
      "--concurrency",
      String(TEST_RUNNER.concurrency),
      "--diagnostic",
    ]);
    expect(readFileSync(approvedPath, "utf8")).toBe("approved sentinel\n");
    await expect(
      generateBaseline([
        "--input",
        rawPath,
        "--output",
        approvedPath,
        "--approved",
        approvedPath,
        "--power-mode",
        TEST_RUNNER.powerMode,
        "--concurrency",
        "1",
        "--diagnostic",
      ]),
    ).rejects.toThrow("without --write-baseline");
    await expect(generateBaseline(["--diagnostic", "--write-baseline"])).rejects.toThrow(
      "review candidates only",
    );
  });
});
