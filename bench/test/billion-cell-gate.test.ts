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
const firstScale = (artifact: Artifact) => must(artifact.scales[0], "scale");
const firstScenario = (artifact: Artifact) => must(firstScale(artifact).scenarios[0], "scenario");

/** A platform and architecture that differ from the running process. */
const OTHER_MACHINE = {
  platform: process.platform === "linux" ? "darwin" : "linux",
  architecture: process.arch === "x64" ? "arm64" : "x64",
};

it("stores every derived ceiling result and rejects tampering with any gate", () => {
  const derived = deriveBillionCellGateChecks(RECORDED.scales);
  expect(RECORDED.gate.checks).toEqual(derived);
  expect(new Set(derived.map(({ id }) => id)).size).toBe(derived.length);
  expect(derived.every(({ passed }) => passed)).toBe(true);
  expectRejections(
    copy,
    validateBillionCellBenchmark,
    derived.map((check, index) => [
      check.id,
      (artifact) => (must(artifact.gate.checks[index], check.id).actual += 1),
    ]),
  );
});

it("derives an exact failed artifact when a stated bound is exceeded", () => {
  const artifact = copy();
  firstScale(artifact).startupRuntimeMetadataBytes = STARTUP_METADATA_LIMIT_BYTES + 1;
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
    ["missing scale", (artifact) => artifact.scales.pop()],
    ["non-finite", (artifact) => (firstScenario(artifact).timing.samplesMs[0] = Number.NaN)],
    [
      "fabricated band",
      (artifact) => {
        const exchange = must(firstScale(artifact).protocol.exchanges[0], "exchange");
        must(exchange.request.columns[0], "column").keys[0] = "not-a-column";
      },
    ],
    [
      "omitted cell",
      (artifact) =>
        (must(
          firstScale(artifact).protocol.exchanges[0],
          "exchange",
        ).page.everyRowHasEveryDeclaredKey = false),
    ],
    [
      "amplified traffic",
      (artifact) => {
        const scenarios = firstScale(artifact).scenarios;
        must(
          scenarios.find(({ id }) => id === "first-visible-tile"),
          "first tile",
        ).trafficPerRun.returnedCells += 1;
      },
    ],
    [
      "full matrix",
      (artifact) => {
        const { resources } = firstScenario(artifact);
        resources.loadedCleanCells = firstScale(artifact).logicalCells;
        resources.residentCells = firstScale(artifact).logicalCells;
      },
    ],
    [
      "double-counted owner",
      (artifact) => {
        const { owners } = firstScenario(artifact).resources;
        owners.push(structuredClone(must(owners[0], "owner")));
      },
    ],
    ["owner sum", (artifact) => (firstScenario(artifact).resources.ownerSums.allocatedBytes += 1)],
    ...(["bunVersion", "typescriptVersion", "platform", "architecture"] as const).map(
      (field) => [field, (artifact: Artifact) => (artifact.toolchain[field] = "")] as const,
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
