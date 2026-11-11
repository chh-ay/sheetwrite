import { expect, test } from "bun:test";

import { createCombinationFailures, renderCaptureExitCode } from "../src/render-driver.js";
import { RENDER_SCENARIOS } from "../src/render-protocol.js";
import { must } from "./gate-fixtures.js";

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
const OVERFLOW = "Maximum call stack size exceeded";

test("an invalid launch fills every expected scenario without success statistics", () => {
  const results = createCombinationFailures(configuration, "launch", new Error("no browser"));
  expect(new Set(results.map((result) => result.scenarioId)).size).toBe(RENDER_SCENARIOS.length);
  expect(results).toHaveLength(RENDER_SCENARIOS.length);
  for (const result of results) {
    expect(result).toMatchObject({ status: "failed", stage: "launch" });
    expect(result).not.toHaveProperty("medianMs");
  }
});

test("completes a capture with only the known comparison overflow and fails any deviation", () => {
  // Handsontable overflows the stack while inserting, then again in the untimed cleanup.
  const known = createCombinationFailures(
    { ...configuration, engine: "handsontable", rows: 1_000_000 },
    "measure",
    new RangeError(`action step failed: ${OVERFLOW}`),
  )
    .filter((result) => result.scenarioId.startsWith("altering."))
    .map((result) =>
      result.scenarioId === "altering.remove-5-rows-top"
        ? { ...result, message: `cleanup step failed: ${OVERFLOW}` }
        : result,
    );
  expect(known).toHaveLength(2);
  expect(renderCaptureExitCode(known)).toBe(0);

  const failure = must(known[0], "overflow failure");
  for (const changed of [
    { engine: "sheetwrite" as const },
    { rows: 100_000 },
    { scenarioId: "arrow-down.top-left" as const },
    { errorClass: "Error" },
    { message: "another error" },
    { message: "action step failed: another error" },
    { message: `action step failed: ${OVERFLOW} unexpectedly` },
    { timeout: true },
    { crash: true },
    { consoleErrors: ["unexpected console failure"] },
    { pageErrors: ["unexpected page failure"] },
  ]) {
    expect(renderCaptureExitCode([...known, { ...failure, ...changed }])).toBe(1);
  }
});
