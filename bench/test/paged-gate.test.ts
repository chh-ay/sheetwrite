import { expect, test } from "bun:test";

import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import {
  PAGED_FULL_ROWS,
  PAGED_SMOKE_ROWS,
  type PagedBenchmarkResult,
  type PagedScenario,
  validatePagedBenchmark,
} from "../src/paged-bench.js";
import { summarize } from "../src/stats.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

const CHUNK_BYTES = 53_760;
const COLUMNS = 5;
/** Bytes per logical cell: one kind byte, one number and one string index. */
const DENSE_CELL_BYTES = 1 + 8 + 4;

function probe(
  scenario: PagedScenario,
  chunks: number,
  loadedCells: number,
  dirtyCells = 0,
  dirtyAllocatedBytes = 0,
) {
  const allocatedBytes = chunks * CHUNK_BYTES;
  return {
    scenario,
    wasmDeltaBytes: 65_536,
    chunks,
    loadedCells,
    dirtyCells,
    allocatedBytes,
    dirtyAllocatedBytes,
    retainedBytes: allocatedBytes + dirtyAllocatedBytes,
    fullyLoaded: false,
  };
}

function fixture(mode: "smoke" | "full"): DeepMutable<PagedBenchmarkResult> {
  const rows = mode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const runs = mode === "smoke" ? 2 : 12;
  const timing = () => {
    const samplesMs = Array.from({ length: runs }, (_, index) => index + 1);
    return { samplesMs, stat: summarize(samplesMs) };
  };
  const result: PagedBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.paged[mode],
    meta: {
      commit: "fixture",
      dirty: false,
      timestamp: "2026-10-07T00:00:00Z",
      engineVersions: { sheetwrite: "0.4.0" },
    },
    rows,
    columns: COLUMNS,
    runs,
    pageRows: 120,
    cacheBudgetBytes: 32 * 1024 * 1024,
    chunkRows: 4096,
    denseLogicalBytes: rows * COLUMNS * DENSE_CELL_BYTES,
    widePageColumns: 256,
    cacheChurnPages: 2048,
    cacheChurnBudgetBytes: 30_720,
    cacheChurnRetainedChunks: 512,
    timings: {
      startup: timing(),
      "first-page": timing(),
      "distant-page": timing(),
      "wide-page": timing(),
      "cache-churn": timing(),
    },
    peakAllocatedBytes: 10 * CHUNK_BYTES,
    peakChunks: 10,
    probes:
      mode === "smoke"
        ? [probe("empty", 0, 0), probe("viewport", 5, 150), probe("dirty-100", 0, 100, 100, 4_000)]
        : [
            probe("empty", 0, 0),
            probe("padding", 0, 0),
            probe("viewport", 5, 150),
            probe("scroll-1", 15, 50_000),
            probe("scroll-10", 125, 500_000),
            probe("scroll-100", 624, 2_538_304),
            probe("dirty-100", 0, 100, 100, 4_000),
            probe("dirty-10000", 0, 10_000, 10_000, 450_000),
          ],
  };
  return mutableCopy(result);
}

const probeOf = (result: DeepMutable<PagedBenchmarkResult>, scenario: PagedScenario) =>
  must(
    result.probes.find((entry) => entry.scenario === scenario),
    scenario,
  );

test("accepts the exact smoke and full matrices", () => {
  expect(() => validatePagedBenchmark(fixture("smoke"), "smoke")).not.toThrow();
  expect(() => validatePagedBenchmark(fixture("full"), "full")).not.toThrow();
});

test("rejects a drifted full traversal", () => {
  const corrupted = fixture("full");
  probeOf(corrupted, "scroll-100").loadedCells -= 1;
  expect(() => validatePagedBenchmark(corrupted, "full")).toThrow(
    "rows=1000000;probe=scroll-100 does not match the cache-bounded full traversal",
  );
});

test("rejects missing versions and provenance and out-of-bounds resource counters", () => {
  for (const engine of ["sheetwrite"]) {
    for (const version of [undefined, "", "0.4", "^0.4.0"]) {
      const artifact = fixture("smoke");
      Reflect.set(artifact.meta.engineVersions, engine, version);
      expect(() => validatePagedBenchmark(artifact, "smoke")).toThrow(`engineVersions.${engine}`);
    }
  }
  expectRejections(
    () => fixture("smoke"),
    (result) => validatePagedBenchmark(result, "smoke"),
    [
      [
        (result) => Reflect.deleteProperty(result.meta.engineVersions, "sheetwrite"),
        "engineVersions.sheetwrite",
      ],
      [
        (result) => Object.assign(result.meta, { commit: "", timestamp: "not a timestamp" }),
        "paged capture provenance is incomplete",
      ],
      [
        (result) => (probeOf(result, "viewport").allocatedBytes = result.cacheBudgetBytes + 1),
        "rows=10000;probe=viewport resource counters violate",
      ],
      [
        (result) => (probeOf(result, "viewport").fullyLoaded = true),
        "rows=10000;probe=viewport.fullyLoaded",
      ],
    ],
  );
});
