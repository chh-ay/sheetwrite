import { expect, it } from "bun:test";

import * as engine from "@sheetwrite/wasm";

import { collectAggregatedSample, constantEditFixture } from "../src/formula-bench.js";

const FORMULAS = 10;
const MINIMUM_SAMPLE_MS = 5;

it("builds an edit fixture once per aggregated sample and restores it between edits", async () => {
  await engine.load();
  let builds = 0;

  const sample = collectAggregatedSample(
    "formula-constant-edit",
    FORMULAS,
    () => {
      builds += 1;
      return constantEditFixture(FORMULAS);
    },
    { warmupFixtures: 2, minimumSampleDurationMs: MINIMUM_SAMPLE_MS },
  );

  expect(builds).toBe(1);
  expect(sample.iterations).toBeGreaterThan(1);
  expect(sample.totalMs).toBeGreaterThanOrEqual(MINIMUM_SAMPLE_MS);
});

it("keeps warming up until the minimum warm-up time has passed", async () => {
  await engine.load();
  const minimumWarmupMs = 40;
  let runs = 0;

  const started = performance.now();
  const sample = collectAggregatedSample(
    "formula-constant-edit",
    FORMULAS,
    () => {
      const fixture = constantEditFixture(FORMULAS);
      const run = fixture.run;
      fixture.run = () => {
        runs += 1;
        run();
      };
      return fixture;
    },
    { warmupFixtures: 2, minimumWarmupMs, minimumSampleDurationMs: MINIMUM_SAMPLE_MS },
  );
  const elapsedMs = performance.now() - started;

  expect(elapsedMs).toBeGreaterThanOrEqual(minimumWarmupMs + MINIMUM_SAMPLE_MS);
  expect(runs).toBeGreaterThan(sample.iterations + 2);
});
