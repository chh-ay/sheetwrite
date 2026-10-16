import { describe, expect, test } from "bun:test";

import { createCombinationFailures, renderCaptureExitCode } from "../src/render-driver.js";
import { RENDER_SCENARIOS } from "../src/render-protocol.js";

const configuration = {
  runId: "launch-fixture",
  round: 1,
  engine: "sheetwrite" as const,
  rows: 200,
  measuredSamples: 1,
  warmupSamples: 1,
  minimumSampleDurationMs: 100,
  timeoutMs: 1_000,
  datasetHash: "fnv1a32:fixture",
};

describe("isolated browser failure envelopes", () => {
  test("invalid launch fills every expected scenario without success statistics", () => {
    const results = createCombinationFailures(
      configuration,
      "launch",
      new Error("browser executable does not exist"),
    );
    expect(results).toHaveLength(RENDER_SCENARIOS.length);
    expect(results.every((result) => result.status === "failed")).toBe(true);
    expect(results.every((result) => result.stage === "launch")).toBe(true);
    expect(results.every((result) => !("medianMs" in result))).toBe(true);
    expect(new Set(results.map((result) => result.scenarioId)).size).toBe(RENDER_SCENARIOS.length);
  });
});

describe("render capture failure exit policy", () => {
  const failures = createCombinationFailures(
    { ...configuration, engine: "handsontable", rows: 1_000_000 },
    "measure",
    new RangeError("Maximum call stack size exceeded"),
  ).filter(
    (result) =>
      result.scenarioId === "altering.insert-5-rows-top" ||
      result.scenarioId === "altering.remove-5-rows-top",
  );

  test("retains both known comparison failures while allowing capture completion", () => {
    expect(failures).toHaveLength(2);
    expect(renderCaptureExitCode(failures)).toBe(0);
    expect(failures.every((result) => result.status === "failed")).toBe(true);
  });

  test("rejects every deviation from the known comparison overflow", () => {
    const [failure] = failures;
    if (!failure) throw new Error("missing overflow fixture");

    for (const changed of [
      { engine: "sheetwrite" as const },
      { rows: 100_000 },
      { scenarioId: "arrow-down.top-left" as const },
      { errorClass: "Error" },
      { message: "another error" },
      { timeout: true },
      { crash: true },
      { consoleErrors: ["unexpected console failure"] },
      { pageErrors: ["unexpected page failure"] },
    ]) {
      expect(renderCaptureExitCode([...failures, { ...failure, ...changed }])).toBe(1);
    }
  });
});
