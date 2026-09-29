import { describe, expect, it } from "bun:test";
import {
  type BillionCellBenchmarkArtifact,
  deriveBillionCellGateChecks,
  STARTUP_METADATA_LIMIT_BYTES,
  validateBillionCellBenchmark,
} from "../src/billion-cell-bench.js";

const RESULT_URL = new URL("../results/billion-cell-results.json", import.meta.url);

async function checkedArtifact(): Promise<BillionCellBenchmarkArtifact> {
  const value: unknown = JSON.parse(await Bun.file(RESULT_URL).text());
  validateBillionCellBenchmark(value);
  return value;
}

type DeepMutable<T> = T extends boolean
  ? boolean
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

function clone(artifact: BillionCellBenchmarkArtifact): DeepMutable<BillionCellBenchmarkArtifact> {
  return structuredClone(artifact) as unknown as DeepMutable<BillionCellBenchmarkArtifact>;
}

describe("two-dimensional billion-cell resource gate", () => {
  it("stores every derived ceiling result and rejects tampering with any gate", async () => {
    const artifact = await checkedArtifact();
    const derived = deriveBillionCellGateChecks(artifact.scales);
    expect(artifact.gate.checks).toEqual(derived);
    expect(new Set(derived.map(({ id }) => id)).size).toBe(derived.length);
    expect(derived.every(({ passed }) => passed)).toBe(true);
    for (let index = 0; index < derived.length; index += 1) {
      const tampered = clone(artifact);
      tampered.gate.checks[index]!.actual += 1;
      expect(() => validateBillionCellBenchmark(tampered), derived[index]!.id).toThrow();
    }
  });

  it("derives an exact failed artifact when a stated bound is exceeded", async () => {
    const artifact = clone(await checkedArtifact());
    artifact.scales[0]!.startupRuntimeMetadataBytes = STARTUP_METADATA_LIMIT_BYTES + 1;
    const measuredScales = artifact.scales as unknown as BillionCellBenchmarkArtifact["scales"];
    artifact.gate.checks = [...deriveBillionCellGateChecks(measuredScales)];
    artifact.gate.failures = artifact.gate.checks.filter(
      (candidate: { passed: boolean }) => !candidate.passed,
    );
    artifact.status = "failed";
    artifact.gate.status = "failed";
    expect(() => validateBillionCellBenchmark(artifact)).not.toThrow();
    expect(artifact.gate.failures).toHaveLength(1);
    expect(artifact.gate.failures[0]!).toMatchObject({
      id: "10m:startup-metadata",
      actual: STARTUP_METADATA_LIMIT_BYTES + 1,
      limit: STARTUP_METADATA_LIMIT_BYTES,
      comparator: "<=",
      passed: false,
    });
    expect(artifact.gate.failures[0]!.reason).toContain(
      `actual ${STARTUP_METADATA_LIMIT_BYTES + 1}`,
    );
  });

  it("rejects schema, geometry, traffic, residency, and owner-sum corruption", async () => {
    const artifact = await checkedArtifact();
    const cases: unknown[] = [];
    const missingScale = clone(artifact);
    missingScale.scales.pop();
    cases.push(missingScale);

    const nonfinite = clone(artifact);
    nonfinite.scales[0]!.scenarios[0]!.timing.samplesMs[0] = Number.NaN;
    cases.push(nonfinite);

    const fabricatedBand = clone(artifact);
    fabricatedBand.scales[0]!.protocol.exchanges[0]!.request.columns[0]!.keys[0] = "not-a-column";
    cases.push(fabricatedBand);

    const omittedCell = clone(artifact);
    omittedCell.scales[0]!.protocol.exchanges[0]!.page.everyRowHasEveryDeclaredKey = false;
    cases.push(omittedCell);

    const amplified = clone(artifact);
    amplified.scales[0]!.scenarios.find(
      (scenario) => scenario.id === "first-visible-tile",
    )!.trafficPerRun.returnedCells += 1;
    cases.push(amplified);

    const fullMatrix = clone(artifact);
    fullMatrix.scales[0]!.scenarios[0]!.resources.loadedCleanCells =
      fullMatrix.scales[0]!.logicalCells;
    fullMatrix.scales[0]!.scenarios[0]!.resources.residentCells =
      fullMatrix.scales[0]!.logicalCells;
    cases.push(fullMatrix);

    const doubleCounted = clone(artifact);
    doubleCounted.scales[0]!.scenarios[0]!.resources.owners.push(
      structuredClone(doubleCounted.scales[0]!.scenarios[0]!.resources.owners[0]!),
    );
    cases.push(doubleCounted);

    const wrongSum = clone(artifact);
    wrongSum.scales[0]!.scenarios[0]!.resources.ownerSums.allocatedBytes += 1;
    cases.push(wrongSum);

    for (const candidate of cases) expect(() => validateBillionCellBenchmark(candidate)).toThrow();
  });
});
