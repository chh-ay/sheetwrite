import { expect, it } from "bun:test";

import {
  type ResourceBenchmarkArtifact,
  type ResourceScenarioId,
  validateResourceBenchmark,
} from "../src/resource-protocol.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

type Artifact = DeepMutable<ResourceBenchmarkArtifact>;

const RECORDED: ResourceBenchmarkArtifact = await Bun.file(
  new URL("../results/resource-results.json", import.meta.url),
).json();
const fullArtifact = () => mutableCopy(RECORDED);
const validate = (artifact: Artifact) => validateResourceBenchmark(artifact, "full");

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
  expect(() => validate(artifact)).not.toThrow();
});

it("fails closed on drifted scenarios, owner accounting and optimization evidence", () => {
  expectRejections(fullArtifact, validate, [
    [(artifact) => artifact.scenarios.shift(), "missing resource scenario"],
    [
      (artifact) =>
        artifact.scenarios.push(structuredClone(must(artifact.scenarios[0], "scenario"))),
      "duplicate resource scenario",
    ],
    [
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
      },
      "counted twice",
    ],
    [
      (artifact) =>
        scenarioOf(artifact, "formula-recompute").transientPeaks.push(
          structuredClone(formulaPeak(artifact)),
        ),
      "invalid transient resource accounting",
    ],
    [
      (artifact) => (optimization(artifact).observed = optimization(artifact).threshold),
      "did not cross",
    ],
    [(artifact) => (optimization(artifact).after = optimization(artifact).before), "lacks a lower"],
    [
      (artifact) => (optimization(artifact).budgetAfter = optimization(artifact).budgetBefore),
      "budget was not lowered",
    ],
    [(artifact) => (optimization(artifact).timingAfterMs = Number.NaN), "lacks finite"],
  ]);
});
