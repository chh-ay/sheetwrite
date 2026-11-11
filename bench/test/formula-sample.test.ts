import { expect, it } from "bun:test";

import * as engine from "@sheetwrite/wasm";

import { collectAggregatedSample, constantEditFixture } from "../src/formula-bench.js";

const FORMULAS = 10;
const MINIMUM_SAMPLE_MS = 5;
const MINIMUM_WARMUP_MS = 40;
const WARMUP_FIXTURES = 2;

it("builds one fixture per sample, restores it between edits and warms up for the minimum time", async () => {
  await engine.load();
  let builds = 0;
  let runs = 0;
  const started = performance.now();
  const sample = collectAggregatedSample(
    "formula-constant-edit",
    FORMULAS,
    () => {
      builds += 1;
      const fixture = constantEditFixture(FORMULAS);
      const run = fixture.run;
      fixture.run = () => {
        runs += 1;
        run();
      };
      return fixture;
    },
    {
      warmupFixtures: WARMUP_FIXTURES,
      minimumWarmupMs: MINIMUM_WARMUP_MS,
      minimumSampleDurationMs: MINIMUM_SAMPLE_MS,
    },
  );
  // Only a lower bound: a slow machine cannot break it.
  const elapsedMs = performance.now() - started;

  expect(builds).toBe(1);
  expect(sample.iterations).toBeGreaterThan(1);
  expect(sample.totalMs).toBeGreaterThanOrEqual(MINIMUM_SAMPLE_MS);
  expect(elapsedMs).toBeGreaterThanOrEqual(MINIMUM_WARMUP_MS + MINIMUM_SAMPLE_MS);
  expect(runs).toBeGreaterThan(sample.iterations + WARMUP_FIXTURES);
});
