import { expect, test } from "bun:test";

import {
  createCombinationFailures,
  parseConfiguration,
  renderCaptureExitCode,
} from "../src/render-driver.js";
import { RENDER_SCENARIOS, WINDOW_TRANSFER_SCENARIO_IDS } from "../src/render-protocol.js";
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

test("a diagnostic subset without the window-transfer pair runs without its counterbalance", () => {
  const subset = parseConfiguration([
    "--scenario-set",
    "diagnostic",
    "--scenarios",
    "wrap-unicode.paint.200,wrap-unicode.paint.20000",
  ]);
  expect(subset.windowTransfer).toBe(false);

  const pair = parseConfiguration([
    "--scenario-set",
    "diagnostic",
    "--scenarios",
    `wrap-unicode.paint.200,${WINDOW_TRANSFER_SCENARIO_IDS.join(",")}`,
  ]);
  expect(pair.windowTransfer).toBe(true);
  expect(parseConfiguration(["--scenario-set", "diagnostic"]).windowTransfer).toBe(true);

  for (const half of WINDOW_TRANSFER_SCENARIO_IDS) {
    expect(() => parseConfiguration(["--scenario-set", "diagnostic", "--scenarios", half])).toThrow(
      "run together or not at all",
    );
  }
});

test("the Markdown view never overwrites the JSON output", () => {
  expect(parseConfiguration(["--output", "/tmp/render.json"]).markdownPath).toBe("/tmp/render.md");
  const temporary = parseConfiguration(["--output", "/tmp/aa1-1.json.tmp"]);
  expect(temporary.markdownPath).toBe("/tmp/aa1-1.json.tmp.md");
  expect(
    parseConfiguration(["--output", "/tmp/out", "--markdown-output", "/tmp/view.md"]).markdownPath,
  ).toBe("/tmp/view.md");
});
