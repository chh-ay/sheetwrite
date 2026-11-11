import { expect, test } from "bun:test";

import { validateRenderGateArtifact } from "../src/render-gate.js";
import {
  parseRenderArtifact,
  type RenderBenchmarkArtifact,
  summarizeCompleteness,
} from "../src/render-protocol.js";
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

function firstCellMemory(
  beforeBytes: number | null,
  afterBytes: number | null,
  deltaBytes: number | null,
) {
  return (artifact: Artifact) => {
    const first = must(artifact.results[0], "first cell");
    first.memory = { beforeBytes, afterBytes, deltaBytes };
  };
}

test("accepts the exact full and smoke matrices and keeps them distinct", () => {
  expect(() => validateRenderGateArtifact(makeRenderArtifact(), "full")).not.toThrow();
  expect(() => validateRenderGateArtifact(makeSmokeRenderArtifact(), "smoke")).not.toThrow();
  expect(() => validateRenderGateArtifact(makeSmokeRenderArtifact(), "full")).toThrow(
    "render-full-v1 configuration",
  );
});

test("keeps typed crash evidence but fails the gate closed", () => {
  const failed = withFailedFirstCell(makeSmokeRenderArtifact(), { stage: "launch" });
  expect(parseRenderArtifact(failed).completeness.failedKeys).toHaveLength(1);
  expect(() => validateRenderGateArtifact(failed, "smoke")).toThrow("contains failed cells");
});

test("rejects corrupt run metadata, missing cells and unbounded renderer memory", () => {
  const policy = "metadata does not match the controlled dataset/run policy";
  expectRejections<Artifact>(
    () => mutableCopy(makeSmokeRenderArtifact()),
    (artifact) => validateRenderGateArtifact(artifact, "smoke"),
    [
      ["dataset", (artifact) => (artifact.metadata.datasetHashes = { "200": "corrupt" }), policy],
      ["order seed", (artifact) => (artifact.metadata.orderSeed = 1), policy],
      [
        "launch",
        (artifact) => {
          const attempts = artifact.metadata.launchAttempts;
          attempts.push({ ...must(attempts[0], "launch attempt"), rows: 201 });
        },
        "unexpected browser launch attempt",
      ],
      [
        "missing cell",
        (artifact) => {
          artifact.results.pop();
          const { config, metadata, results } = artifact;
          artifact.completeness = mutableCopy(
            summarizeCompleteness(config, metadata.rounds, results),
          );
        },
        "matrix is incomplete",
      ],
      ["missing memory", firstCellMemory(null, null, null), ".memory is missing"],
      ["negative memory", firstCellMemory(-1, 0, 1), "finite non-negative integer heap samples"],
      [
        "memory ceiling",
        firstCellMemory(0, 4 * GIB, 4 * GIB),
        "broad renderer heap safety ceiling",
      ],
    ],
  );
});
