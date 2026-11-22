import { expect, it } from "bun:test";

import {
  assertCapturedOnRunningMachine,
  type BillionCellBenchmarkArtifact,
  deriveBillionCellGateChecks,
  STARTUP_METADATA_LIMIT_BYTES,
  validateBillionCellBenchmark,
} from "../src/billion-cell-bench.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

type Artifact = DeepMutable<BillionCellBenchmarkArtifact>;

const recorded: unknown = await Bun.file(
  new URL("../results/billion-cell-results.json", import.meta.url),
).json();
validateBillionCellBenchmark(recorded);
const RECORDED: BillionCellBenchmarkArtifact = recorded;
const copy = () => mutableCopy(RECORDED);
const first_scale = (artifact: Artifact) => must(artifact.scales[0], "scale");
const first_scenario = (artifact: Artifact) => must(first_scale(artifact).scenarios[0], "scenario");

/** A platform and architecture that differ from the running process. */
const OTHER_MACHINE = {
  platform: process.platform === "linux" ? "darwin" : "linux",
  architecture: process.arch === "x64" ? "arm64" : "x64",
};

it("stores every derived ceiling result and rejects a tampered gate", () => {
  expect(RECORDED.gate.checks).toEqual(deriveBillionCellGateChecks(RECORDED.scales));
  expect(RECORDED.gate.checks.every(({ passed }) => passed)).toBe(true);
  const tampered = copy();
  must(tampered.gate.checks.at(-1), "gate check").actual += 1;
  expect(() => validateBillionCellBenchmark(tampered)).toThrow(
    "gate checks do not match measured evidence",
  );
});

it("derives an exact failed artifact when a stated bound is exceeded", () => {
  const artifact = copy();
  first_scale(artifact).startupRuntimeMetadataBytes = STARTUP_METADATA_LIMIT_BYTES + 1;
  // The scales are measured values; only their readonly modifiers differ from the recorded type.
  const scales = artifact.scales as unknown as BillionCellBenchmarkArtifact["scales"];
  artifact.gate.checks = mutableCopy(deriveBillionCellGateChecks(scales));
  artifact.gate.failures = artifact.gate.checks.filter((check) => !check.passed);
  artifact.status = "failed";
  artifact.gate.status = "failed";
  expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
  expect(artifact.gate.failures).toEqual([
    expect.objectContaining({
      id: "10m:startup-metadata",
      actual: STARTUP_METADATA_LIMIT_BYTES + 1,
      limit: STARTUP_METADATA_LIMIT_BYTES,
      comparator: "<=",
      passed: false,
      reason: expect.stringContaining(`actual ${STARTUP_METADATA_LIMIT_BYTES + 1}`),
    }),
  ]);
});

it("rejects schema, geometry, traffic, residency, owner-sum and toolchain corruption", () => {
  expectRejections(copy, validateBillionCellBenchmark, [
    [(artifact) => artifact.scales.pop()],
    [(artifact) => (first_scenario(artifact).timing.samplesMs[0] = Number.NaN)],
    [
      (artifact) => {
        const exchange = must(first_scale(artifact).protocol.exchanges[0], "exchange");
        must(exchange.request.columns[0], "column").keys[0] = "not-a-column";
      },
    ],
    [
      (artifact) =>
        (must(
          first_scale(artifact).protocol.exchanges[0],
          "exchange",
        ).page.everyRowHasEveryDeclaredKey = false),
    ],
    [
      (artifact) => {
        const scenarios = first_scale(artifact).scenarios;
        must(
          scenarios.find(({ id }) => id === "first-visible-tile"),
          "first tile",
        ).trafficPerRun.returnedCells += 1;
      },
    ],
    [
      (artifact) => {
        const { resources } = first_scenario(artifact);
        resources.loadedCleanCells = first_scale(artifact).logicalCells;
        resources.residentCells = first_scale(artifact).logicalCells;
      },
    ],
    [
      (artifact) => {
        const { owners } = first_scenario(artifact).resources;
        owners.push(structuredClone(must(owners[0], "owner")));
      },
    ],
    [(artifact) => (first_scenario(artifact).resources.ownerSums.allocatedBytes += 1)],
    ...(["bunVersion", "typescriptVersion", "platform", "architecture"] as const).map(
      (field) => [(artifact: Artifact) => (artifact.toolchain[field] = "")] as const,
    ),
  ]);
});

it("accepts committed evidence captured on a different machine", () => {
  const artifact = copy();
  Object.assign(artifact.toolchain, OTHER_MACHINE, { bunVersion: "0.0.0-other" });
  expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
});

it("rejects a new capture that does not record the running machine", () => {
  const running = {
    ...RECORDED.toolchain,
    bunVersion: Bun.version,
    platform: process.platform,
    architecture: process.arch,
  };
  expect(() => assertCapturedOnRunningMachine(running)).not.toThrow();
  for (const toolchain of [
    { ...running, platform: OTHER_MACHINE.platform },
    { ...running, architecture: OTHER_MACHINE.architecture },
    { ...running, bunVersion: "0.0.0-other" },
  ]) {
    expect(() => assertCapturedOnRunningMachine(toolchain)).toThrow();
  }
});
