import { expect, it } from "bun:test";

import * as engine from "@sheetwrite/wasm";

import { collectAggregatedSample } from "../src/formula-bench.js";
import { createFormulaFixture } from "../src/formula-fixtures.js";
import { writeNumberColumn, writeStringColumn } from "../src/packed-fixture.js";

const FORMULAS = 10;
const MINIMUM_SAMPLE_MS = 5;
const MINIMUM_WARMUP_MS = 40;
const WARMUP_FIXTURES = 2;

it("builds one fixture per sample, restores it between edits and warms up for the minimum time", async () => {
  await engine.load();
  let builds = 0;
  let runs = 0;
  let restores = 0;
  // Every timed edit must start from the unedited state, or a later run times a no-op.
  const statesBeforeRun = new Set<string>();
  const started = performance.now();
  const sample = collectAggregatedSample(
    "formula-constant-edit",
    FORMULAS,
    () => {
      builds += 1;
      const fixture = createFormulaFixture("formula-constant-edit", FORMULAS);
      const unedited = fixture.check();
      const { run, restore } = fixture;
      fixture.run = () => {
        runs += 1;
        statesBeforeRun.add(fixture.check() === unedited ? "unedited" : "edited");
        run();
      };
      if (restore !== undefined) {
        fixture.restore = () => {
          restores += 1;
          restore();
        };
      }
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
  expect([...statesBeforeRun]).toEqual(["unedited"]);
  expect(restores).toBe(runs - 1);
});

it("packed fixture columns preserve offsets, styles and Unicode text", async () => {
  await engine.load();
  const store = new engine.CellStore();
  try {
    const sheet = store.addSheet(2, 5);
    writeNumberColumn(store, sheet, 0, 1, Float64Array.of(-2.5, 42), 7);
    writeStringColumn(store, sheet, 1, 2, ["", "é🙂", "尾"], 9);
    const values = [
      [1, 0, 1, -2.5, undefined, 7],
      [2, 0, 1, 42, undefined, 7],
      [2, 1, 2, 0, "", 9],
      [3, 1, 2, 0, "é🙂", 9],
      [4, 1, 2, 0, "尾", 9],
    ] as const;
    for (const [row, col, kind, number, text, style] of values) {
      const cell = store.getCell(sheet, row, col);
      try {
        expect([cell.kind, cell.num, cell.string, cell.style]).toEqual([kind, number, text, style]);
      } finally {
        cell.free();
      }
    }
  } finally {
    store.free();
  }
});
