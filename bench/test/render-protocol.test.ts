import { expect, test } from "bun:test";

import {
  createWindowTransferMetrics,
  parseRenderArtifact,
  parseRenderArtifactJson,
  type RenderBenchmarkArtifact,
  summarizeWindowTransferComparisons,
  WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
  WINDOW_TRANSFER_ORDER_SEED,
  WINDOW_TRANSFER_SCENARIO_IDS,
  WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
} from "../src/render-protocol.js";
import { counterbalancedOrder } from "../src/stats.js";
import {
  type DeepMutable,
  expectRejections,
  makeRenderArtifact,
  must,
  mutableCopy,
  withFailedFirstCell,
} from "./gate-fixtures.js";

const TIMESTAMP = "2026-07-14T12:00:00.000Z";

function artifact(): RenderBenchmarkArtifact {
  return makeRenderArtifact({ rows: [200], measuredSamples: 2, timestamp: TIMESTAMP });
}

/** Window-read counters for `frames` logical frames; the upper bound reads nothing. */
function transferCounters(isBaseline: boolean, frames: number) {
  return createWindowTransferMetrics({
    logicalFrames: frames,
    windowReadRequests: frames,
    logicalWindowReads: isBaseline ? frames : 0,
    copiedBytes: isBaseline ? frames * 1_024 : 0,
    outputAllocationEvents: isBaseline ? frames * 7 : 0,
  });
}

function windowTransferArtifact(): DeepMutable<RenderBenchmarkArtifact> {
  const value = mutableCopy(
    makeRenderArtifact({
      engines: ["sheetwrite"],
      rows: [200],
      scenarios: WINDOW_TRANSFER_SCENARIO_IDS,
      measuredSamples: 2,
      samples: (round, _engine, scenarioId) => {
        const isBaseline = scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID;
        const perOperationMs = isBaseline ? 5 + (round - 1) * 0.2 : 3 + (round - 1) * 0.1;
        return [perOperationMs, perOperationMs];
      },
    }),
  );
  for (const result of value.results) {
    if (result.status !== "success") throw new Error("fixture must be successful");
    const isBaseline = result.scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID;
    result.dataValidity = isBaseline ? "product-valid" : "pixel-data-invalid";
    result.windowTransfer = transferCounters(isBaseline, result.operationCount);
    for (const sample of result.rawSamples) {
      sample.windowTransfer = transferCounters(isBaseline, sample.operationCount);
    }
  }
  value.metadata.windowTransferScenarioOrder = counterbalancedOrder(
    WINDOW_TRANSFER_SCENARIO_IDS,
    2,
    WINDOW_TRANSFER_ORDER_SEED,
  );
  return value;
}

test("keeps a structured failure in its cell", () => {
  const parsed = parseRenderArtifact(
    withFailedFirstCell(artifact(), { stage: "validate", crash: false }),
  );
  expect(parsed.completeness).toMatchObject({ complete: true, successful: false });
  expect(parsed.completeness.failedKeys).toHaveLength(1);
  expect(parsed.results[0]).toMatchObject({ status: "failed", stage: "validate" });
});

test("rejects stale run IDs and timestamps", () => {
  expect(() => parseRenderArtifact(artifact(), { expectedRunId: "new-run" })).toThrow(
    "stale render result",
  );
  const nowMs = Date.parse(TIMESTAMP) + 2_000;
  expect(() => parseRenderArtifact(artifact(), { nowMs, maxAgeMs: 1_000 })).toThrow(
    "stale render result timestamp",
  );
});

test("requires a semantic version for each render engine", () => {
  for (const engine of ["sheetwrite", "handsontable"] as const) {
    expectRejections(
      () => mutableCopy(artifact()),
      parseRenderArtifact,
      [undefined, "", "18", "^18.1.2", "01.2.3"].map((version) => [
        `${engine} ${version}`,
        (value) => Reflect.set(value.metadata.engineVersions, engine, version),
        `engineVersions.${engine}`,
      ]),
    );
  }
});

test("rejects non-finite summaries, also after a JSON round trip", () => {
  const invalid = mutableCopy(artifact());
  const first = must(invalid.results[0], "first cell");
  if (first.status !== "success") throw new Error("fixture must be successful");
  first.medianMs = Number.POSITIVE_INFINITY;
  expect(() => parseRenderArtifact(invalid)).toThrow("finite number");
  expect(() => parseRenderArtifactJson(JSON.stringify(invalid))).toThrow("finite number");
});

test("summarizes window transfer and fails closed on counters, labels and order", () => {
  const [comparison] = summarizeWindowTransferComparisons(
    parseRenderArtifact(windowTransferArtifact()),
  );
  expect(comparison).toMatchObject({ rows: 200, resolved: true });
  expect(comparison?.estimatedWindowTransferCostMs).toBeCloseTo(2.05);
  expect(comparison?.maximumWithinVariantSpreadMs).toBeCloseTo(0.2);

  const resultFor = (value: DeepMutable<RenderBenchmarkArtifact>, scenarioId: string) =>
    must(
      value.results.find((result) => result.scenarioId === scenarioId),
      scenarioId,
    );
  expectRejections(windowTransferArtifact, parseRenderArtifact, [
    [
      "counters",
      (value) => {
        const baseline = resultFor(value, WINDOW_TRANSFER_BASELINE_SCENARIO_ID);
        if (baseline.status !== "success") throw new Error("fixture must be successful");
        Reflect.deleteProperty(must(baseline.rawSamples[0], "sample"), "windowTransfer");
      },
      "rawSamples[0].windowTransfer is required",
    ],
    [
      "label",
      (value) =>
        Reflect.set(
          resultFor(value, WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID),
          "dataValidity",
          "product-valid",
        ),
      "must be pixel-data-invalid",
    ],
    [
      "order",
      (value) => {
        const order = must(value.metadata.windowTransferScenarioOrder?.[0], "order").toReversed();
        value.metadata.windowTransferScenarioOrder = [order, order];
      },
      "required counterbalance",
    ],
  ]);
});
