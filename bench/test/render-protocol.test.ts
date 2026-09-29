import { describe, expect, test } from "bun:test";
import {
  createWindowTransferMetrics,
  type FailedScenario,
  parseRenderArtifact,
  parseRenderArtifactJson,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  type ScenarioResult,
  scenarioGroup,
  summarizeCompleteness,
  summarizeWindowTransferComparisons,
  WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
  WINDOW_TRANSFER_ORDER_SEED,
  WINDOW_TRANSFER_SCENARIO_IDS,
  WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
} from "../src/render-protocol.js";
import { counterbalancedOrder } from "../src/stats.js";

const RUN_ID = "00000000-0000-4000-8000-000000000051";
const TIMESTAMP = "2026-07-14T12:00:00.000Z";

function successResult(
  round: number,
  engine: "sheetwrite" | "handsontable",
  scenarioId: (typeof RENDER_SCENARIOS)[number]["id"],
): ScenarioResult {
  return {
    runId: RUN_ID,
    round,
    engine,
    rows: 200,
    scenarioId,
    group: scenarioGroup(scenarioId),
    status: "success",
    operationCount: 20,
    rawSamples: [
      { index: 0, durationMs: 100, operationCount: 10, perOperationMs: 10 },
      { index: 1, durationMs: 100, operationCount: 10, perOperationMs: 10 },
    ],
    medianMs: 10,
    p95Ms: 10,
    madMs: 0,
    validation: [
      { checkpoint: "canonical row count", expected: "200", observed: "200", passed: true },
    ],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

function failedResult(source: ScenarioResult): FailedScenario {
  return {
    runId: source.runId,
    round: source.round,
    engine: source.engine,
    rows: source.rows,
    scenarioId: source.scenarioId,
    group: source.group,
    status: "failed",
    stage: "validate",
    errorClass: "ScenarioValidationError",
    message: "wrong row count",
    timeout: false,
    crash: false,
    consoleErrors: [],
    pageErrors: [],
    partialSamples: source.status === "success" ? source.rawSamples : source.partialSamples,
    validation: [
      { checkpoint: "canonical row count", expected: "200", observed: "199", passed: false },
    ],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

function artifactWithResults(results: readonly ScenarioResult[]): RenderBenchmarkArtifact {
  const config: RenderRunConfig = {
    engines: ["sheetwrite", "handsontable"],
    rows: [200],
    scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
  };
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: RUN_ID,
    metadata: {
      commit: "4ba3902",
      dirty: false,
      timestamp: TIMESTAMP,
      bunVersion: "1.3.14",
      nodeVersion: "24.3.0",
      browserVersion: "Chromium 140",
      os: "linux 6.0",
      arch: "x64",
      cpu: "test cpu",
      engineVersions: { sheetwrite: "0.1.0", handsontable: "18.0.0" },
      datasetSeed: 0x5eedc0de,
      datasetHashes: { "200": "fnv1a32:12345678" },
      viewport: { width: 640, height: 480 },
      measuredSamples: 2,
      warmupSamples: 1,
      minimumSampleDurationMs: 100,
      rounds: 2,
      orderSeed: 0x51c0ffee,
      engineOrder: [
        ["sheetwrite", "handsontable"],
        ["handsontable", "sheetwrite"],
      ],
      launchAttempts: [
        {
          round: 1,
          engine: "sheetwrite",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 1,
          engine: "handsontable",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 2,
          engine: "sheetwrite",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 2,
          engine: "handsontable",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
      ],
    },
    config,
    results,
    completeness: summarizeCompleteness(config, 2, results),
    reproductionCommands: ["bun run --filter '@sheetwrite/bench' bench:render"],
  };
}

function completeArtifact(): RenderBenchmarkArtifact {
  const results: ScenarioResult[] = [];
  for (let round = 1; round <= 2; round++) {
    for (const engine of ["sheetwrite", "handsontable"] as const) {
      for (const scenario of RENDER_SCENARIOS) {
        results.push(successResult(round, engine, scenario.id));
      }
    }
  }
  return artifactWithResults(results);
}

function windowTransferArtifact(): RenderBenchmarkArtifact {
  const config: RenderRunConfig = {
    engines: ["sheetwrite"],
    rows: [200],
    scenarios: [...WINDOW_TRANSFER_SCENARIO_IDS],
  };
  const results: ScenarioResult[] = [];
  for (let round = 1; round <= 2; round++) {
    for (const scenarioId of WINDOW_TRANSFER_SCENARIO_IDS) {
      const baseline = scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID;
      const perOperationMs = baseline ? (round === 1 ? 5 : 5.2) : round === 1 ? 3 : 3.1;
      const sampleCounters = {
        logicalFrames: 100,
        windowReadRequests: 100,
        logicalWindowReads: baseline ? 100 : 0,
        copiedBytes: baseline ? 102_400 : 0,
        outputAllocationEvents: baseline ? 700 : 0,
      };
      const rawSamples = [0, 1].map((index) => ({
        index,
        durationMs: perOperationMs * 100,
        operationCount: 100,
        perOperationMs,
        windowTransfer: createWindowTransferMetrics(sampleCounters),
      }));
      results.push({
        runId: RUN_ID,
        round,
        engine: "sheetwrite",
        rows: 200,
        scenarioId,
        group: scenarioGroup(scenarioId),
        dataValidity: baseline ? "product-valid" : "pixel-data-invalid",
        status: "success",
        operationCount: 200,
        rawSamples,
        medianMs: perOperationMs,
        p95Ms: perOperationMs,
        madMs: 0,
        validation: [
          {
            checkpoint: "controlled window transfer",
            expected: "accounted",
            observed: "accounted",
            passed: true,
          },
        ],
        memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
        windowTransfer: createWindowTransferMetrics({
          logicalFrames: 200,
          windowReadRequests: 200,
          logicalWindowReads: baseline ? 200 : 0,
          copiedBytes: baseline ? 204_800 : 0,
          outputAllocationEvents: baseline ? 1_400 : 0,
        }),
      });
    }
  }
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: RUN_ID,
    metadata: {
      commit: "4ba3902",
      dirty: false,
      timestamp: TIMESTAMP,
      bunVersion: "1.3.14",
      nodeVersion: "24.3.0",
      browserVersion: "Chromium 140",
      os: "linux 6.0",
      arch: "x64",
      cpu: "test cpu",
      engineVersions: { sheetwrite: "0.1.0", handsontable: "18.0.0" },
      datasetSeed: 0x5eedc0de,
      datasetHashes: { "200": "fnv1a32:12345678" },
      viewport: { width: 640, height: 480 },
      measuredSamples: 2,
      warmupSamples: 1,
      minimumSampleDurationMs: 100,
      rounds: 2,
      orderSeed: 0x51c0ffee,
      engineOrder: [["sheetwrite"], ["sheetwrite"]],
      launchAttempts: [1, 2].map((round) => ({
        round,
        engine: "sheetwrite" as const,
        rows: 200,
        attempt: 1,
        success: true,
        errorClass: null,
        message: null,
      })),
      windowTransferScenarioOrder: counterbalancedOrder(
        WINDOW_TRANSFER_SCENARIO_IDS,
        2,
        WINDOW_TRANSFER_ORDER_SEED,
      ),
    },
    config,
    results,
    completeness: summarizeCompleteness(config, 2, results),
    reproductionCommands: ["bun run --filter '@sheetwrite/bench' bench:render:diagnostic"],
  };
}

describe("render artifact validation", () => {
  test("preserves structured failures without omitting their cell", () => {
    const complete = completeArtifact();
    const failed = failedResult(complete.results[0]!);
    const parsed = parseRenderArtifact(artifactWithResults([failed, ...complete.results.slice(1)]));
    expect(parsed.completeness.complete).toBe(true);
    expect(parsed.completeness.successful).toBe(false);
    expect(parsed.completeness.failedKeys).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({ status: "failed", stage: "validate" });
  });

  test("rejects stale run IDs and timestamps", () => {
    const complete = completeArtifact();
    expect(() => parseRenderArtifact(complete, { expectedRunId: "new-run" })).toThrow(
      "stale render result",
    );
    expect(() =>
      parseRenderArtifact(complete, {
        nowMs: Date.parse(TIMESTAMP) + 2_000,
        maxAgeMs: 1_000,
      }),
    ).toThrow("stale render result timestamp");
  });

  test("rejects non-finite summaries and JSON null coercion", () => {
    const complete = completeArtifact();
    const source = complete.results[0]!;
    if (source.status !== "success") throw new Error("fixture must be successful");
    const invalidResult: ScenarioResult = { ...source, medianMs: Number.POSITIVE_INFINITY };
    const invalid = artifactWithResults([invalidResult, ...complete.results.slice(1)]);
    expect(() => parseRenderArtifact(invalid)).toThrow("finite number");
    expect(() => parseRenderArtifactJson(JSON.stringify(invalid))).toThrow("finite number");
  });
  test("fails closed on transfer counters, invalid labels, and order drift", () => {
    const parsed = parseRenderArtifact(windowTransferArtifact());
    const [comparison] = summarizeWindowTransferComparisons(parsed);
    expect(comparison).toMatchObject({ rows: 200, resolved: true });
    expect(comparison?.estimatedWindowTransferCostMs).toBeCloseTo(2.05);
    expect(comparison?.maximumWithinVariantSpreadMs).toBeCloseTo(0.2);

    const missingCounters = structuredClone(windowTransferArtifact());
    const baseline = missingCounters.results.find(
      (result) => result.scenarioId === WINDOW_TRANSFER_BASELINE_SCENARIO_ID,
    );
    if (baseline?.status !== "success") throw new Error("missing baseline fixture");
    Reflect.deleteProperty(baseline.rawSamples[0]!, "windowTransfer");
    expect(() => parseRenderArtifact(missingCounters)).toThrow(
      "rawSamples[0].windowTransfer is required",
    );

    const falselyValid = structuredClone(windowTransferArtifact());
    const upperBound = falselyValid.results.find(
      (result) => result.scenarioId === WINDOW_TRANSFER_UPPER_BOUND_SCENARIO_ID,
    );
    if (!upperBound) throw new Error("missing upper-bound fixture");
    Reflect.set(upperBound, "dataValidity", "product-valid");
    expect(() => parseRenderArtifact(falselyValid)).toThrow("must be pixel-data-invalid");

    const wrongOrder = structuredClone(windowTransferArtifact());
    const firstOrder = wrongOrder.metadata.windowTransferScenarioOrder?.[0];
    if (!firstOrder) throw new Error("missing counterbalance fixture");
    Reflect.set(wrongOrder.metadata, "windowTransferScenarioOrder", [
      [...firstOrder].reverse(),
      [...firstOrder].reverse(),
    ]);
    expect(() => parseRenderArtifact(wrongOrder)).toThrow("required counterbalance");
  });
});
