import { expect, it } from "bun:test";

import { summarizeFinite } from "../src/stats.js";
import {
  validateXlsxBenchmarkArtifact,
  type XlsxBenchmarkArtifact,
  type XlsxRawSample,
  type XlsxScenarioSummary,
} from "../src/xlsx-bench.js";
import { type DeepMutable, expectRejections, must, mutableCopy } from "./gate-fixtures.js";

type Artifact = DeepMutable<XlsxBenchmarkArtifact>;

const SCENARIOS = [
  ["import", "combined"],
  ["export", "scalar"],
  ["export", "rich"],
  ["export", "shared-style"],
  ["export", "sparse"],
  ["reject", "compression-ratio"],
  ["reject", "deep-xml"],
] as const;
const LIMIT_BY_REJECTION: Record<string, string> = {
  "compression-ratio": "maxCompressionRatio",
  "deep-xml": "maxXmlDepth",
};

function sample(operation: XlsxRawSample["operation"], scenario: string): XlsxRawSample {
  const limit = LIMIT_BY_REJECTION[scenario];
  return {
    round: 0,
    engine: "current",
    operation,
    scenario,
    durationMs: 1,
    processWallMs: 2,
    maxRssBytes: 100,
    rssBeforeBytes: 50,
    rssAfterBytes: 90,
    heapBeforeBytes: 10,
    heapAfterBytes: 20,
    arrayBuffersBeforeBytes: 5,
    arrayBuffersAfterBytes: 8,
    heapRetainedBytes: 12,
    arrayBuffersRetainedBytes: 6,
    inputBytes: 10,
    outputBytes: 20,
    checksum: "a".repeat(64),
    ...(limit
      ? { rejection: `XlsxResourceError:Sheetwrite: XLSX import ${limit} limit exceeded` }
      : {}),
  };
}

/** The per-scenario summaries the artifact must carry for `samples`. */
function summaries(samples: readonly XlsxRawSample[]): XlsxScenarioSummary[] {
  const groups = Map.groupBy(
    samples,
    (value) => `${value.engine}:${value.operation}:${value.scenario}`,
  );
  const withMax = (values: number[]) => ({ ...summarizeFinite(values), max: Math.max(...values) });
  const growth = (before: number, after: number) => Math.max(0, after - before);
  return [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([, values]) => {
      const { engine, operation, scenario } = must(values[0], "sample");
      return {
        engine,
        operation,
        scenario,
        durationMs: summarizeFinite(values.map((value) => value.durationMs)),
        processWallMs: summarizeFinite(values.map((value) => value.processWallMs)),
        maxRssBytes: withMax(values.map((value) => value.maxRssBytes)),
        returnAllocationDeltaBytes: withMax(
          values.map(
            (value) =>
              growth(value.heapBeforeBytes, value.heapAfterBytes) +
              growth(value.arrayBuffersBeforeBytes, value.arrayBuffersAfterBytes),
          ),
        ),
        retainedAfterGcDeltaBytes: withMax(
          values.map(
            (value) =>
              growth(value.heapBeforeBytes, value.heapRetainedBytes) +
              growth(value.arrayBuffersBeforeBytes, value.arrayBuffersRetainedBytes),
          ),
        ),
      };
    });
}

/** A full artifact comparing the current codec with the old backend; only import's ratio varies. */
function comparedArtifact(importRatio = 1): XlsxBenchmarkArtifact {
  const current = SCENARIOS.map(([operation, scenario]) => ({
    ...sample(operation, scenario),
    durationMs: operation === "import" ? importRatio : 1,
  }));
  const baseline = current
    .filter((value) => value.operation !== "reject")
    .map((value) => ({ ...value, engine: "baseline" as const, durationMs: 1 }));
  const samples = [...current, ...baseline];
  return {
    protocol: "sheetwrite-xlsx-codec-v2",
    mode: "full",
    metadata: {
      commit: "test",
      dirty: true,
      timestamp: "2026-07-18T00:00:00.000Z",
      engineVersions: { sheetwrite: "0.4.0", exceljs: "4.4.0" },
    },
    rounds: 1,
    maxBaselineRatio: 1.25,
    fixture: {
      path: "bench/fixtures/xlsx-codec-corpus.xlsx",
      bytes: 1_038_346,
      sha256: "2633e51a4a3caa8d34b2e2147b997c6ebdd0cf514be6e6c60663a0f7659e6e00",
      generatorPath: "bench/fixtures/generate-xlsx-corpus.py",
      generatorSha256: "a00a25851cbb8479a13472ef07ad3a133f8901505ea89da8f967041d4b9f4fb2",
      producer: "LibreOffice 26.2.4.2 Calc MS Excel 2007 XML",
    },
    toolchain: {
      bun: "1.3.14",
      node: "v24.3.0",
      platform: "linux",
      arch: "x64",
      cpu: "test",
      baselineCommit: "87fadb72397947ea8c6ba576682925c7879579b8",
    },
    methodology: { timing: "isolated", memory: "VmHWM", allocation: "return and post-GC" },
    scenarios: SCENARIOS.map(([operation, scenario]) => `${operation}:${scenario}`),
    samples,
    summaries: summaries(samples),
    comparisons: SCENARIOS.flatMap(([operation, scenario]) =>
      operation === "reject"
        ? []
        : [
            {
              operation,
              scenario,
              medianWallRatio: operation === "import" ? importRatio : 1,
              peakRssRatio: 1,
            },
          ],
    ),
  };
}

it("accepts a complete comparison and rejects drifted versions, summaries and outputs", () => {
  expect(() => validateXlsxBenchmarkArtifact(comparedArtifact())).not.toThrow();
  for (const engine of ["sheetwrite", "exceljs"]) {
    for (const version of [undefined, "", "4", "^4.4.0", "01.2.3"]) {
      const artifact = mutableCopy(comparedArtifact());
      Reflect.set(artifact.metadata.engineVersions, engine, version);
      expect(() => validateXlsxBenchmarkArtifact(artifact)).toThrow(`engineVersions.${engine}`);
    }
  }
  expectRejections(() => mutableCopy(comparedArtifact()), validateXlsxBenchmarkArtifact, [
    ...(["durationMs", "returnAllocationDeltaBytes", "retainedAfterGcDeltaBytes"] as const).map(
      (metric) =>
        [
          (artifact: Artifact) => {
            const [first, ...rest] = artifact.summaries;
            if (!first) throw new Error("fixture has no summary");
            artifact.summaries = [
              { ...first, [metric]: { ...first[metric], median: 0.5 } },
              ...rest,
            ];
          },
          "summaries do not match raw samples",
        ] as const,
    ),
    [
      (artifact) => {
        const secondRound = artifact.samples.map((value) => ({
          ...value,
          round: 1,
          checksum: value.scenario === "scalar" ? "b".repeat(64) : value.checksum,
        }));
        artifact.rounds = 2;
        artifact.samples = [...artifact.samples, ...secondRound];
        artifact.summaries = mutableCopy(summaries(artifact.samples));
      },
      "is not deterministic",
    ],
  ]);
});

it("rejects wall-time regressions above the old-backend ratio", () => {
  expect(() => validateXlsxBenchmarkArtifact(comparedArtifact(2))).toThrow(
    "import:combined regressed",
  );
});
