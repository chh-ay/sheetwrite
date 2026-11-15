import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../src/version-comparison.ts");
let directory: string;

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-version-comparison-"));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const engine = {
  recalcGeomeanMs: 0.1,
  retainedMiB: 50,
  peakMiB: 100,
  importMs: 1000,
  exportMs: 500,
};
const sizes = { totalBrotliBytes: 300_000, wasm: {}, js: {} };

test("report writes a one-round run, which has no A/A spread", () => {
  const input = resolve(directory, "one-round.json");
  const output = resolve(directory, "one-round.md");
  writeFileSync(
    input,
    JSON.stringify({
      machine: "Linux",
      measuredAt: "2026-11-15T00:00:00.000Z",
      host: { cpuModel: "test CPU", logicalCpus: 1, bun: "test", platform: "linux" },
      rounds: 1,
      commits: {},
      // JSON has no NaN: a spread with no CBA round to divide by is written as null.
      aaSpreadPercent: { recalcGeomean: null, retained: null },
      versions: { "0.7.0": { sizes: { default: sizes, full: sizes } } },
      summary: { "0.7.0": { default: engine, full: engine } },
    }),
  );

  const result = Bun.spawnSync(["bun", SCRIPT, "report", "--input", input, "--output", output], {
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(readFileSync(output, "utf8")).toContain(
    'A/A spread (%) {"recalcGeomean":"n/a","retained":"n/a"}',
  );
});
