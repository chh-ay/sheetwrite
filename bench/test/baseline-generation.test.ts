import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateBaseline } from "../src/generate-baseline.js";
import { makeRenderArtifact, TEST_RUNNER } from "./gate-fixtures.js";

const candidate_root = resolve(import.meta.dir, "../results/candidates");
mkdirSync(candidate_root, { recursive: true });
const directory = mkdtempSync(resolve(candidate_root, "baseline-generation-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("never overwrites the approved baseline without explicit write intent", async () => {
  const raw_path = resolve(directory, "raw.json");
  const approved_path = resolve(directory, "approved.json");
  writeFileSync(raw_path, `${JSON.stringify(makeRenderArtifact({ rounds: 10 }), null, 2)}\n`);
  writeFileSync(approved_path, "approved sentinel\n");
  const generate = (output: string) =>
    generateBaseline([
      ...["--input", raw_path, "--output", output, "--approved", approved_path],
      ...["--power-mode", TEST_RUNNER.powerMode, "--concurrency", "1", "--diagnostic"],
    ]);

  await generate(resolve(directory, "candidate.json"));
  expect(readFileSync(approved_path, "utf8")).toBe("approved sentinel\n");
  await expect(generate(approved_path)).rejects.toThrow("without --write-baseline");
  await expect(generateBaseline(["--diagnostic", "--write-baseline"])).rejects.toThrow(
    "review candidates only",
  );
});
