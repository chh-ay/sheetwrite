import { it } from "bun:test";

import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import {
  RANGE_AUTO_FIT_CHUNK_CELLS,
  RANGE_WORKLOADS,
  type RangeGateArtifact,
  type RangeStructuralResult,
  validateRangeArtifact,
} from "../src/range-gate.js";
import { summarize } from "../src/stats.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

type Workload = RangeStructuralResult["workload"];

/** Per-workload counters that differ from the zero baseline row. */
const COUNTERS: Partial<Record<Workload, Partial<RangeStructuralResult>>> = {
  "style merge and clear": {
    documentOperationCount: 2,
    jsPatchObjectCount: 2,
    maxTransferredArrayLength: 2,
  },
  "sparse setRange": { addressedCells: 3, jsPatchObjectCount: 4 },
  "dense setBlock": { addressedCells: 100, maxTransferredArrayLength: 100 },
  "clipboard bulk read": {
    documentOperationCount: 0,
    jsPatchObjectCount: 10_000,
    ffiCalls: 4,
    maxTransferredArrayLength: 30_001,
    outputSentinel: '["first",null]',
  },
  "datasource revision retention": {
    documentOperationCount: 3,
    jsPatchObjectCount: 5,
    retainedRevisionPointsBefore: 2,
    retainedRevisionRectanglesBefore: 2,
  },
  "large exact auto-fit": {
    maxTransferredArrayLength: RANGE_AUTO_FIT_CHUNK_CELLS,
    maxVisibleWindowCells: RANGE_AUTO_FIT_CHUNK_CELLS,
    autoFitChunkCellLimit: RANGE_AUTO_FIT_CHUNK_CELLS,
    visibleWindowRequests: 2,
    scheduledChunks: 2,
  },
};

function artifact(): DeepMutable<RangeGateArtifact> {
  const results = RANGE_WORKLOADS.map((workload) => ({
    rows: 10_000,
    workload,
    addressedCells: 10_000,
    timingSamplesMs: [1],
    timing: summarize([1]),
    heapDeltaBytes: 0,
    wasmDeltaBytes: 0,
    documentOperationCount: 1,
    jsPatchObjectCount: 1,
    ffiCalls: 2,
    maxTransferredArrayLength: 0,
    retainedRevisionPointsBefore: 0,
    retainedRevisionRectanglesBefore: 0,
    retainedRevisionPointsAfter: 0,
    retainedRevisionRectanglesAfter: 0,
    maxVisibleWindowCells: 0,
    autoFitChunkCellLimit: 0,
    visibleWindowRequests: 0,
    scheduledChunks: 0,
    historyBytes: 0,
    outputSentinel: "",
    ...COUNTERS[workload],
  }));
  return mutableCopy({
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.range.smoke,
    results,
  } satisfies RangeGateArtifact);
}

const resultOf = (value: DeepMutable<RangeGateArtifact>, workload: Workload) =>
  must(
    value.results.find((entry) => entry.workload === workload),
    workload,
  );

it("fails closed on incomplete matrices, retained revisions and oversized auto-fit windows", () => {
  expectRejections(artifact, (value) => validateRangeArtifact(value, "smoke"), [
    [(value) => value.results.shift(), /missing 10000:style merge and clear/],
    [
      (value) =>
        (resultOf(value, "datasource revision retention").retainedRevisionRectanglesAfter = 1),
      /retained revision rectangles/,
    ],
    [
      (value) =>
        (resultOf(value, "large exact auto-fit").autoFitChunkCellLimit =
          RANGE_AUTO_FIT_CHUNK_CELLS + 1),
      /reported a stale auto-fit chunk-cell limit/,
    ],
    [
      (value) =>
        (resultOf(value, "large exact auto-fit").maxVisibleWindowCells =
          RANGE_AUTO_FIT_CHUNK_CELLS + 1),
      /exceeded the auto-fit chunk-cell limit/,
    ],
  ]);
});
