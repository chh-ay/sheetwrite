import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type MatchedEngineResult,
  validateMatchedEngineResult,
} from "../src/matched-engine-bench.js";

function recordedCapture(): MatchedEngineResult {
  return JSON.parse(
    readFileSync(new URL("../results/full-engine-matched-results.json", import.meta.url), "utf8"),
  ) as MatchedEngineResult;
}
it("accepts the complete matched engine capture", () => {
  expect(() => validateMatchedEngineResult(recordedCapture())).not.toThrow();
});
it.each(["missing", "order", "checksum", "summary", "allocation", "ratio", "spread", "source"])(
  "rejects invalid matched %s evidence",
  (fault) => {
    const result = recordedCapture();
    const row = result.rows[0];
    const sample = row?.samples[0];
    if (!row || !sample) throw new Error("Missing recorded matched sample");
    if (fault === "missing") row.samples.pop();
    if (fault === "order") sample.engine = "full";
    if (fault === "checksum") sample.output = "wrong";
    if (fault === "summary")
      row.defaultStat = { ...row.defaultStat, mean: row.defaultStat.mean + 1 };
    if (fault === "allocation") sample.allocationSamples.pop();
    if (fault === "ratio") row.ratioStat = { ...row.ratioStat, median: row.ratioStat.median + 1 };
    if (fault === "spread") row.ratioP10 += 1;
    if (fault === "source") result.sourceDigest = "0".repeat(64);
    expect(() => validateMatchedEngineResult(result)).toThrow();
  },
);
it.each(["default", "full"])("runs one checked fresh %s sample", (engine) => {
  const root = new URL("../../", import.meta.url).pathname;
  const child = Bun.spawnSync(
    ["bun", "run", "src/formula-bench.ts", "--sample", "independent-first-recompute", "3"],
    {
      cwd: `${root}/bench`,
      env: { ...process.env, SHEETWRITE_BENCH_ENGINE: engine },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(child.exitCode).toBe(0);
  const sample = JSON.parse(child.stdout.toString()) as { samplesMs: number[]; output: number };
  expect(sample.samplesMs).toHaveLength(1);
  expect(sample.output).toBe(3);
});
