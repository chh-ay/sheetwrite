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
