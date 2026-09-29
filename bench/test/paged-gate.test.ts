import { describe, expect, test } from "bun:test";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import {
  PAGED_FULL_ROWS,
  PAGED_SMOKE_ROWS,
  type PagedBenchmarkResult,
  type PagedScenario,
  type PagedTimingResult,
  validatePagedBenchmark,
} from "../src/paged-bench.js";
import { summarize } from "../src/stats.js";

function smokeFixture(): PagedBenchmarkResult {
  const timing = (): PagedTimingResult => ({ samplesMs: [1, 2], stat: summarize([1, 2]) });
  const timingsByKey: Record<string, PagedTimingResult> = {
    startup: timing(),
    "first-page": timing(),
    "distant-page": timing(),
    "wide-page": timing(),
    "cache-churn": timing(),
  };
  const timings = timingsByKey as PagedBenchmarkResult["timings"];
  const probes: Array<{
    scenario: string;
    wasmDeltaBytes: number;
    chunks: number;
    loadedCells: number;
    dirtyCells: number;
    allocatedBytes: number;
    dirtyAllocatedBytes: number;
    retainedBytes: number;
    fullyLoaded: boolean;
  }> = [
    {
      scenario: "empty",
      wasmDeltaBytes: 1024,
      chunks: 0,
      loadedCells: 0,
      dirtyCells: 0,
      allocatedBytes: 0,
      dirtyAllocatedBytes: 0,
      retainedBytes: 0,
      fullyLoaded: false,
    },
    {
      scenario: "viewport",
      wasmDeltaBytes: 1024,
      chunks: 5,
      loadedCells: 150,
      dirtyCells: 0,
      allocatedBytes: 268_800,
      dirtyAllocatedBytes: 0,
      retainedBytes: 268_800,
      fullyLoaded: false,
    },
    {
      scenario: "dirty-100",
      wasmDeltaBytes: 1024,
      chunks: 0,
      loadedCells: 100,
      dirtyCells: 100,
      allocatedBytes: 0,
      dirtyAllocatedBytes: 4_000,
      retainedBytes: 4_000,
      fullyLoaded: false,
    },
  ];
  const typedProbes = probes as Array<(typeof probes)[number] & { scenario: PagedScenario }>;
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.paged.smoke,
    rows: PAGED_SMOKE_ROWS,
    columns: 5,
    runs: 2,
    pageRows: 120,
    cacheBudgetBytes: 32 * 1024 * 1024,
    chunkRows: 4096,
    denseLogicalBytes: PAGED_SMOKE_ROWS * 5 * (1 + 8 + 4),
    widePageColumns: 256,
    cacheChurnPages: 2048,
    cacheChurnBudgetBytes: 30_720,
    cacheChurnRetainedChunks: 512,
    timings,
    peakAllocatedBytes: 537_600,
    peakChunks: 10,
    probes: typedProbes,
  };
}

function fullFixture(): PagedBenchmarkResult {
  const samplesMs = Array.from({ length: 12 }, () => 1);
  const timing = (): PagedTimingResult => ({
    samplesMs: [...samplesMs],
    stat: summarize(samplesMs),
  });
  const probe = (
    scenario: PagedScenario,
    chunks: number,
    loadedCells: number,
    dirtyCells = 0,
    dirtyAllocatedBytes = 0,
  ) => ({
    scenario,
    wasmDeltaBytes: 65_536,
    chunks,
    loadedCells,
    dirtyCells,
    allocatedBytes: chunks * 53_760,
    dirtyAllocatedBytes,
    retainedBytes: chunks * 53_760 + dirtyAllocatedBytes,
    fullyLoaded: false,
  });
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "full",
    matrixId: MATRIX_IDS.paged.full,
    rows: PAGED_FULL_ROWS,
    columns: 5,
    runs: 12,
    pageRows: 120,
    cacheBudgetBytes: 32 * 1024 * 1024,
    chunkRows: 4096,
    denseLogicalBytes: PAGED_FULL_ROWS * 5 * (1 + 8 + 4),
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
    peakAllocatedBytes: 537_600,
    peakChunks: 10,
    probes: [
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
}

describe("paged benchmark exact matrix", () => {
  test("requires the exact cache-bounded full traversal evidence", () => {
    const source = fullFixture();
    expect(() => validatePagedBenchmark(source, "full")).not.toThrow();
    const corrupted = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "scroll-100" ? { ...probe, loadedCells: 2_538_303 } : probe,
      ),
    };
    expect(() => validatePagedBenchmark(corrupted, "full")).toThrow(
      "rows=1000000;probe=scroll-100 does not match the cache-bounded full traversal",
    );
  });

  test("rejects resource counters outside cache and logical bounds", () => {
    const source = smokeFixture();
    const overBudget = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "viewport"
          ? { ...probe, allocatedBytes: source.cacheBudgetBytes + 1 }
          : probe,
      ),
    };
    expect(() => validatePagedBenchmark(overBudget, "smoke")).toThrow(
      "rows=10000;probe=viewport resource counters violate",
    );

    const staleLoadFlag = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "viewport" ? { ...probe, fullyLoaded: true } : probe,
      ),
    };
    expect(() => validatePagedBenchmark(staleLoadFlag, "smoke")).toThrow(
      "rows=10000;probe=viewport.fullyLoaded",
    );
  });
});
