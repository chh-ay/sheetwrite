import { expect, test } from "bun:test";

import {
  type PagedBenchmarkResult,
  type PagedScenario,
  validatePagedBenchmark,
} from "../src/paged-bench.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

/** The committed full capture, which the docs scale showcase publishes. */
const RECORDED: PagedBenchmarkResult = await Bun.file(
  new URL("../results/paged-results.json", import.meta.url),
).json();
const validate = (result: DeepMutable<PagedBenchmarkResult>) =>
  validatePagedBenchmark(result, "full");

const probeOf = (result: DeepMutable<PagedBenchmarkResult>, scenario: PagedScenario) =>
  must(
    result.probes.find((entry) => entry.scenario === scenario),
    scenario,
  );

test("accepts the recorded full matrix and rejects drifted traversal, provenance and counters", () => {
  expect(() => validatePagedBenchmark(RECORDED, "full")).not.toThrow();
  expectRejections(() => mutableCopy(RECORDED), validate, [
    [
      (result) => (probeOf(result, "scroll-100").loadedCells -= 1),
      "rows=1000000;probe=scroll-100 does not match the cache-bounded full traversal",
    ],
    [
      (result) => Reflect.set(result.meta.engineVersions, "sheetwrite", "^0.4.0"),
      "engineVersions.sheetwrite",
    ],
    [
      (result) => Object.assign(result.meta, { commit: "", timestamp: "not a timestamp" }),
      "paged capture provenance is incomplete",
    ],
    [
      (result) => (probeOf(result, "viewport").allocatedBytes = result.cacheBudgetBytes + 1),
      "probe=viewport resource counters violate",
    ],
    [(result) => (probeOf(result, "viewport").fullyLoaded = true), "probe=viewport.fullyLoaded"],
  ]);
});
