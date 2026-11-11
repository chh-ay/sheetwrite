import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateBaseline } from "../src/generate-baseline.js";
import { makeRenderArtifact, TEST_RUNNER } from "./gate-fixtures.js";

const candidateRoot = resolve(import.meta.dir, "../results/candidates");
mkdirSync(candidateRoot, { recursive: true });
const directory = mkdtempSync(resolve(candidateRoot, "baseline-generation-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("never overwrites the approved baseline without explicit write intent", async () => {
  const rawPath = resolve(directory, "raw.json");
  const approvedPath = resolve(directory, "approved.json");
  writeFileSync(rawPath, `${JSON.stringify(makeRenderArtifact({ rounds: 10 }), null, 2)}\n`);
  writeFileSync(approvedPath, "approved sentinel\n");
  const generate = (output: string) =>
    generateBaseline([
      ...["--input", rawPath, "--output", output, "--approved", approvedPath],
      ...["--power-mode", TEST_RUNNER.powerMode, "--concurrency", "1", "--diagnostic"],
    ]);

  await generate(resolve(directory, "candidate.json"));
  expect(readFileSync(approvedPath, "utf8")).toBe("approved sentinel\n");
  await expect(generate(approvedPath)).rejects.toThrow("without --write-baseline");
  await expect(generateBaseline(["--diagnostic", "--write-baseline"])).rejects.toThrow(
    "review candidates only",
  );
});
