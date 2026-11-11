import { expect, it } from "bun:test";

import {
  createRuntimeResourceSnapshot,
  decodeStoreMemoryStats,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  STORE_MEMORY_HASH_ESTIMATE_VERSION,
  STORE_MEMORY_PROTOCOL_VERSION,
  WASM_MEMORY_OWNERS,
} from "@sheetwrite/core";

import {
  RESOURCE_BENCHMARK_SCHEMA_VERSION,
  RESOURCE_FULL_SCENARIOS,
  type ResourceBenchmarkArtifact,
  type ResourceScenarioId,
  validateResourceBenchmark,
} from "../src/resource-protocol.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

const OPERATION_BY_SCENARIO: Record<ResourceScenarioId, RuntimeResourceOperation> = {
  "dense-ingest": "ingest",
  "paged-startup": "startup",
  "first-page": "ingest",
  "deep-jump": "scroll",
  "dirty-edit-clear": "dirty-clear",
  "formula-recompute": "formula-recompute",
  "exact-auto-fit": "auto-fit",
  export: "export",
  snapshot: "snapshot",
  "sort-filter-refusal": "scroll",
  teardown: "teardown",
};
const WASM_PAGE_BYTES = 64 * 1024;

/** A snapshot in which every WASM owner reports zero bytes. */
function snapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase) {
  const header = [
    STORE_MEMORY_PROTOCOL_VERSION,
    WASM_MEMORY_OWNERS.length,
    STORE_MEMORY_HASH_ESTIMATE_VERSION,
  ];
  const encoded = [...header, ...WASM_MEMORY_OWNERS.flatMap(() => [0, 0, 0]), 0, 0];
  return createRuntimeResourceSnapshot({
    operation,
    phase,
    wasm: decodeStoreMemoryStats(encoded, WASM_PAGE_BYTES),
    runtime: {
      usedJSHeapSize: 1,
      arrayBufferBytes: 2,
      externalBytes: 3,
      browserBackingStoreBytes: null,
    },
  });
}

function fullArtifact(): DeepMutable<ResourceBenchmarkArtifact> {
  const scenarios = RESOURCE_FULL_SCENARIOS.map((id) => {
    const operation = OPERATION_BY_SCENARIO[id];
    const phases: RuntimeResourcePhase[] = ["before", "peak", "settled"];
    if (id === "teardown") phases.push("after-destroy");
    const transientPeaks =
      id === "formula-recompute"
        ? [
            {
              owner: "wasm.formula.transient-matrices",
              peakBytes: 4096,
              allocations: 2,
              measurement: "instrumented-operation-peak" as const,
            },
          ]
        : [];
    return {
      id,
      operation,
      durationMs: 1,
      phases: Object.fromEntries(phases.map((phase) => [phase, snapshot(operation, phase)])),
      deltas: [],
      transientPeaks,
      sentinel: `${id}:ok`,
    };
  });
  return mutableCopy({
    schemaVersion: RESOURCE_BENCHMARK_SCHEMA_VERSION,
    resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    mode: "full",
    provenance: {
      commit: "fixture",
      runtime: "bun-test",
      forcedGcCheckpoints: ["before", "settled", "after-destroy"],
    },
    scenarios,
    optimizations: [
      {
        owner: "wasm.string-index",
        scenario: "dense-ingest",
        admissionRule: "capacity-slack",
        observed: 0.3,
        threshold: 0.25,
        unit: "ratio",
        before: 100,
        after: 70,
        timingBeforeMs: 10,
        timingAfterMs: 8,
        budgetBefore: 120,
        budgetAfter: 80,
        profileArtifact: null,
      },
    ],
  } satisfies ResourceBenchmarkArtifact);
}

type Artifact = DeepMutable<ResourceBenchmarkArtifact>;
const scenarioOf = (artifact: Artifact, id: ResourceScenarioId) =>
  must(
    artifact.scenarios.find((entry) => entry.id === id),
    id,
  );
const formulaPeak = (artifact: Artifact) =>
  must(scenarioOf(artifact, "formula-recompute").transientPeaks[0], "transient peak");
const optimization = (artifact: Artifact) => must(artifact.optimizations[0], "optimization");

it("keeps transient peaks out of the retained totals", () => {
  const artifact = fullArtifact();
  formulaPeak(artifact).peakBytes = Number.MAX_SAFE_INTEGER;
  expect(() => validateResourceBenchmark(artifact, "full")).not.toThrow();
  const peak = must(scenarioOf(artifact, "formula-recompute").phases.peak, "peak phase");
  expect(peak.totals.allocatedCapacityBytes).toBe(0);
});

it("fails closed on drifted scenarios, owner accounting and optimization evidence", () => {
  expectRejections(fullArtifact, (artifact) => validateResourceBenchmark(artifact, "full"), [
    ["missing scenario", (artifact) => artifact.scenarios.shift(), "missing resource scenario"],
    [
      "duplicate scenario",
      (artifact) =>
        artifact.scenarios.push(structuredClone(must(artifact.scenarios[0], "scenario"))),
      "duplicate resource scenario",
    ],
    [
      "owner overlap",
      (artifact) => {
        const before = must(scenarioOf(artifact, "dense-ingest").phases.before, "before phase");
        before.jsOwners = [
          {
            owner: "wasm.dense.kinds",
            logicalBytes: 1,
            allocatedBytes: 1,
            entries: 1,
            measurement: "typed-array-byte-length",
          },
        ];
        before.totals = { logicalLiveBytes: 1, allocatedCapacityBytes: 1 };
      },
      "counted twice",
    ],
    [
      "duplicate transient owner",
      (artifact) =>
        scenarioOf(artifact, "formula-recompute").transientPeaks.push(
          structuredClone(formulaPeak(artifact)),
        ),
      "invalid transient resource accounting",
    ],
    [
      "unadmitted",
      (artifact) => (optimization(artifact).observed = optimization(artifact).threshold),
      "did not cross",
    ],
    [
      "not lower",
      (artifact) => (optimization(artifact).after = optimization(artifact).before),
      "lacks a lower",
    ],
    [
      "unbudgeted",
      (artifact) => (optimization(artifact).budgetAfter = optimization(artifact).budgetBefore),
      "budget was not lowered",
    ],
    ["timing", (artifact) => (optimization(artifact).timingAfterMs = Number.NaN), "lacks finite"],
  ]);
});
