import { expect, test } from "bun:test";

import { validateRenderGateArtifact } from "../src/render-gate.js";
import { type RenderBenchmarkArtifact, summarizeCompleteness } from "../src/render-protocol.js";
import {
  type DeepMutable,
  expectRejections,
  makeRenderArtifact,
  makeSmokeRenderArtifact,
  must,
  mutableCopy,
  withFailedFirstCell,
} from "./gate-fixtures.js";

type Artifact = DeepMutable<RenderBenchmarkArtifact>;

const GIB = 1024 * 1024 * 1024;

function first_cell_memory(
  before_bytes: number | null,
  after_bytes: number | null,
  delta_bytes: number | null,
) {
  return (artifact: Artifact) => {
    const first = must(artifact.results[0], "first cell");
    first.memory = { beforeBytes: before_bytes, afterBytes: after_bytes, deltaBytes: delta_bytes };
  };
}

test("accepts the exact full and smoke matrices and keeps them distinct", () => {
  expect(() => validateRenderGateArtifact(makeRenderArtifact(), "full")).not.toThrow();
  expect(() => validateRenderGateArtifact(makeSmokeRenderArtifact(), "smoke")).not.toThrow();
  expect(() => validateRenderGateArtifact(makeSmokeRenderArtifact(), "full")).toThrow(
    "render-full-v1 configuration",
  );
});

test("fails the gate closed on typed crash evidence", () => {
  const failed = withFailedFirstCell(makeSmokeRenderArtifact(), { stage: "launch" });
  expect(() => validateRenderGateArtifact(failed, "smoke")).toThrow("contains failed cells");
});

test("rejects corrupt run metadata, missing cells and unbounded renderer memory", () => {
  const policy = "metadata does not match the controlled dataset/run policy";
  expectRejections<Artifact>(
    () => mutableCopy(makeSmokeRenderArtifact()),
    (artifact) => validateRenderGateArtifact(artifact, "smoke"),
    [
      [(artifact) => (artifact.metadata.datasetHashes = { "200": "corrupt" }), policy],
      [(artifact) => (artifact.metadata.orderSeed = 1), policy],
      [
        (artifact) => {
          const attempts = artifact.metadata.launchAttempts;
          attempts.push({ ...must(attempts[0], "launch attempt"), rows: 201 });
        },
        "unexpected browser launch attempt",
      ],
      [
        (artifact) => {
          artifact.results.pop();
          const { config, metadata, results } = artifact;
          artifact.completeness = mutableCopy(
            summarizeCompleteness(config, metadata.rounds, results),
          );
        },
        "matrix is incomplete",
      ],
      [first_cell_memory(null, null, null), ".memory is missing"],
      [first_cell_memory(-1, 0, 1), "finite non-negative integer heap samples"],
      [first_cell_memory(0, 4 * GIB, 4 * GIB), "broad renderer heap safety ceiling"],
    ],
  );
});
