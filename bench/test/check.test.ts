import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  CONTROLLED_SAMPLING_FINGERPRINT,
  compareControlledRender,
  runCheck,
} from "../src/check.js";
import {
  buildControlledBaseline,
  CONTROLLED_COMPARISON_POLICY,
  type ControlledRenderBaseline,
  parseControlledBaseline,
  stableBaselineJson,
} from "../src/controlled-baseline.js";
import { computeHarnessFingerprint, MATRIX_IDS } from "../src/gate-protocol.js";
import {
  type DeepMutable,
  expectRejections,
  makeRenderArtifact,
  must,
  mutableCopy,
  TEST_HARNESS,
  TEST_RUNNER,
} from "./gate-fixtures.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const ROUNDS = 10;

function baselineFixture(): ControlledRenderBaseline {
  return buildControlledBaseline(
    makeRenderArtifact({ rounds: ROUNDS }),
    TEST_HARNESS,
    TEST_RUNNER,
    "bench/results/render-results.json",
    "0".repeat(64),
  );
}

function compare(samples: (round: number) => number, overrides: { rounds?: number } = {}) {
  return compareControlledRender({
    baseline: baselineFixture(),
    fresh: makeRenderArtifact({
      rounds: overrides.rounds ?? ROUNDS,
      samples: (round) => [samples(round), samples(round), samples(round)],
    }),
    harness: TEST_HARNESS,
    runner: TEST_RUNNER,
  });
}

describe("controlled zero-regression comparison", () => {
  test("uses every repeated sample, so one lucky round cannot mask a slowdown", () => {
    const rows = compare((round) => (round === 1 ? 1 : 20));
    expect(rows.every((row) => row.freshMedian === 20 && row.regression)).toBe(true);
  });

  test("passes equality and improvement and fails any reproducible slowdown", () => {
    const cases: [sampleMs: number, isRegression: boolean, lowerBound?: number][] = [
      [10, false, 0],
      [9, false, -1],
      [10.01, true],
    ];
    for (const [sampleMs, isRegression, lowerBound] of cases) {
      for (const row of compare(() => sampleMs)) {
        expect(row.regression).toBe(isRegression);
        if (lowerBound === undefined) expect(row.lowerConfidenceBoundMs).toBeGreaterThan(0);
        else expect(row.lowerConfidenceBoundMs).toBe(lowerBound);
      }
    }
  });

  test("fails closed on an unmatched runner or a different number of rounds", () => {
    expect(() =>
      compareControlledRender({
        baseline: baselineFixture(),
        fresh: makeRenderArtifact({ rounds: ROUNDS }),
        harness: TEST_HARNESS,
        runner: { ...TEST_RUNNER, cpu: "different cpu" },
      }),
    ).toThrow("uncontrolled/unmatched runner");
    expect(() => compare(() => 10, { rounds: ROUNDS - 1 })).toThrow(
      "fresh rounds must match baseline",
    );
  });

  test("rejects a baseline without runner or raw samples, or with a raised threshold", () => {
    expectRejections<DeepMutable<ControlledRenderBaseline>>(
      () => mutableCopy(baselineFixture()),
      parseControlledBaseline,
      [
        ["runner cpu", (baseline) => Reflect.deleteProperty(baseline.runner, "cpu"), "missing cpu"],
        [
          "raw samples",
          (baseline) => Reflect.deleteProperty(must(baseline.cells[0], "cell"), "samplesMs"),
          "samplesMs",
        ],
        [
          "threshold",
          (baseline) => Reflect.set(baseline.comparison, "maximumRegressionMs", 1),
          `maximumRegressionMs must be ${CONTROLLED_COMPARISON_POLICY.maximumRegressionMs}`,
        ],
        [
          "legacy floor",
          (baseline) => Reflect.set(must(baseline.cells[0], "cell"), "absoluteFloorMs", 100),
          "unexpected absoluteFloorMs",
        ],
      ],
    );
  });
});

describe("strict benchmark check command", () => {
  let directory = "";
  let baselinePath = "";
  let rawPath = "";
  let head = "";

  beforeAll(() => {
    const candidateRoot = resolve(REPOSITORY_ROOT, "bench/results/candidates");
    mkdirSync(candidateRoot, { recursive: true });
    directory = mkdtempSync(resolve(candidateRoot, "check-"));
    head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT })
      .stdout.toString()
      .trim();
    const rawBytes = `${JSON.stringify(makeRenderArtifact({ rounds: ROUNDS, commit: head }), null, 2)}\n`;
    rawPath = resolve(directory, "raw.json");
    writeFileSync(rawPath, rawBytes);
    const baseline = buildControlledBaseline(
      makeRenderArtifact({ rounds: ROUNDS, commit: head }),
      computeHarnessFingerprint(MATRIX_IDS.render.full, CONTROLLED_SAMPLING_FINGERPRINT),
      TEST_RUNNER,
      relative(REPOSITORY_ROOT, rawPath),
      createHash("sha256").update(rawBytes).digest("hex"),
    );
    baselinePath = resolve(directory, "baseline.json");
    writeFileSync(baselinePath, stableBaselineJson(baseline));
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  function freshJson(sampleMs = 10, timestamp = new Date().toISOString()): string {
    const fresh = makeRenderArtifact({
      rounds: ROUNDS,
      commit: head,
      timestamp,
      samples: () => [sampleMs, sampleMs, sampleMs],
    });
    return JSON.stringify(fresh);
  }

  async function check(fresh: string, extraArgs: readonly string[] = []) {
    const freshPath = resolve(directory, `fresh-${crypto.randomUUID()}.json`);
    writeFileSync(freshPath, fresh);
    const stderr: string[] = [];
    const write = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    // The comparison table goes to standard output; the verdict goes to standard error.
    const table = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exitCode = await runCheck([
        "--baseline",
        baselinePath,
        "--fresh",
        freshPath,
        "--power-mode",
        TEST_RUNNER.powerMode,
        "--concurrency",
        String(TEST_RUNNER.concurrency),
        ...extraArgs,
      ]);
      return { exitCode, stderr: stderr.join("") };
    } finally {
      write.mockRestore();
      table.mockRestore();
    }
  }

  test("passes a complete matched result and fails malformed, stale or slower results", async () => {
    const passing = await check(freshJson());
    expect(passing.exitCode, passing.stderr).toBe(0);
    expect(passing.stderr).toContain("no statistically detected regression");
    for (const [fresh, verdict] of [
      ["{broken", "performance gate invalid"],
      [freshJson(10, "2020-01-01T00:00:00.000Z"), "stale render result timestamp"],
      [freshJson(10.01), "statistically significant slowdown"],
    ] as const) {
      const failing = await check(fresh);
      expect(failing.exitCode).toBe(1);
      expect(failing.stderr).toContain(verdict);
    }
  });

  test("keeps report-only explicitly non-gating", async () => {
    const diagnostic = await check("{broken", ["--report-only"]);
    expect(diagnostic.exitCode).toBe(0);
    expect(diagnostic.stderr).toContain("REPORT ONLY — NON-GATING");
  });

  test("fails when checked-in raw provenance is missing or checksum-mismatched", async () => {
    const original = readFileSync(rawPath, "utf8");
    try {
      rmSync(rawPath);
      expect((await check(freshJson())).exitCode).toBe(1);
      writeFileSync(rawPath, `${original} `);
      const mismatch = await check(freshJson());
      expect(mismatch.exitCode).toBe(1);
      expect(mismatch.stderr).toContain("checksum mismatch");
    } finally {
      writeFileSync(rawPath, original);
    }
  });
});
